import { createHash, randomUUID } from 'node:crypto';
import {
  buildEntrypointCoverage,
  type EntrypointCoverageReport,
} from './workflow-coverage.js';
import { buildWorkflowDrivenSimulationSteps } from './workflow-discovery.js';

export type SimulationWallet = 'bert' | 'ernie' | 'user';

export interface SimulationStepInput {
  label?: string;
  wallet: SimulationWallet;
  targetContractId?: string;
  entrypoint: string;
  args: unknown[];
  amountMutez?: number;
  expectFailure?: boolean;
  assertions?: unknown[];
}

export interface SimulationStepResult {
  label: string;
  wallet: SimulationWallet;
  entrypoint: string;
  status: 'passed' | 'failed';
  note: string;
}

export interface ContractSimulationResult {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  generatedDefaultSteps: boolean;
  steps: SimulationStepResult[];
  state: {
    paused: boolean;
    totalSupply: number;
    listings: number;
    offers: number;
    swaps: number;
    auctions: number;
    barters: number;
    balances: Record<string, number>;
  };
  coverage: EntrypointCoverageReport;
  warnings: string[];
}

export interface DeploymentClearanceRecord {
  id: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  auditPassed: boolean;
  simulationPassed: boolean;
  shadowboxPassed?: boolean;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function findNumericArg(args: unknown[], fallback = 1): number {
  for (const arg of args) {
    if (typeof arg === 'number' || typeof arg === 'string') {
      const parsed = asNumber(arg);
      if (parsed !== null) {
        return parsed;
      }
    }
    if (arg && typeof arg === 'object') {
      for (const value of Object.values(arg as Record<string, unknown>)) {
        const parsed = asNumber(value);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }
  return fallback;
}

function findBooleanArg(args: unknown[], fallback = false): boolean {
  for (const arg of args) {
    if (typeof arg === 'boolean') {
      return arg;
    }
    if (typeof arg === 'string') {
      const normalized = arg.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
  }
  return fallback;
}

export function hashContractCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function generateDefaultSteps(entrypoints: string[]): SimulationStepInput[] {
  return buildWorkflowDrivenSimulationSteps({
    contractId: 'contract',
    entrypoints,
    includeExpectedFailures: false,
  });
}

export function runContractSimulation(input: {
  entrypoints: string[];
  steps: SimulationStepInput[];
}): ContractSimulationResult {
  const warnings: string[] = [];
  const knownEntrypoints = new Set(input.entrypoints.map((entry) => entry.trim()));
  const generatedDefaultSteps = input.steps.length === 0;
  const stepsToRun = generatedDefaultSteps
    ? generateDefaultSteps(input.entrypoints)
    : input.steps;

  const state = {
    paused: false,
    totalSupply: 0,
    listings: 0,
    offers: 0,
    swaps: 0,
    auctions: 0,
    barters: 0,
    balances: {
      bert: 1_000_000,
      ernie: 1_000_000,
      user: 1_000_000,
    } as Record<string, number>,
  };

  const results: SimulationStepResult[] = [];

  for (const [index, step] of stepsToRun.entries()) {
    const label = step.label?.trim() || `Step ${index + 1}`;
    const entrypoint = step.entrypoint.trim();

    if ((step.amountMutez ?? 0) > 0) {
      results.push({
        label,
        wallet: step.wallet,
        entrypoint,
        status: step.expectFailure ? 'passed' : 'failed',
        note:
          'Payable mutez calls require the real Shadowbox/live runtime; the structural simulator cannot prove tez movement.',
      });
      continue;
    }

    if ((step.assertions?.length ?? 0) > 0) {
      results.push({
        label,
        wallet: step.wallet,
        entrypoint,
        status: step.expectFailure ? 'passed' : 'failed',
        note:
          'Storage/balance/big-map assertions require the real Shadowbox/live runtime; no-stub policy blocks structural pass.',
      });
      continue;
    }

    if (!knownEntrypoints.has(entrypoint)) {
      results.push({
        label,
        wallet: step.wallet,
        entrypoint,
        status: 'failed',
        note: `Entrypoint ${entrypoint} not found in contract ABI.`,
      });
      continue;
    }

    if (
      state.paused &&
      !['pause', 'set_admin', 'confirm_admin', 'admin', 'assets', 'tokens'].includes(entrypoint)
    ) {
      results.push({
        label,
        wallet: step.wallet,
        entrypoint,
        status: 'failed',
        note: 'Simulation state is paused; this entrypoint is blocked.',
      });
      continue;
    }

    const amount = Math.max(0, Math.floor(findNumericArg(step.args, 1)));
    const walletKey = step.wallet;

    switch (entrypoint) {
      case 'mint':
      case 'mint_tokens':
      case 'create_token': {
        state.totalSupply += amount;
        state.balances[walletKey] = (state.balances[walletKey] ?? 0) + amount;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: `Mint simulation added ${amount} units to ${walletKey}.`,
        });
        break;
      }
      case 'burn':
      case 'burn_tokens': {
        if ((state.balances[walletKey] ?? 0) < amount) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: `${walletKey} balance is insufficient for burn amount ${amount}.`,
          });
          break;
        }
        state.totalSupply = Math.max(0, state.totalSupply - amount);
        state.balances[walletKey] = (state.balances[walletKey] ?? 0) - amount;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: `Burn simulation removed ${amount} units from ${walletKey}.`,
        });
        break;
      }
      case 'transfer': {
        if ((state.balances[walletKey] ?? 0) < amount) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: `${walletKey} has insufficient simulated balance for transfer.`,
          });
          break;
        }
        const receiver = walletKey === 'bert' ? 'ernie' : 'bert';
        state.balances[walletKey] = (state.balances[walletKey] ?? 0) - amount;
        state.balances[receiver] = (state.balances[receiver] ?? 0) + amount;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: `Transfer simulation moved ${amount} units from ${walletKey} to ${receiver}.`,
        });
        break;
      }
      case 'pause': {
        state.paused = findBooleanArg(step.args, true);
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: `Pause simulation set paused=${state.paused}.`,
        });
        break;
      }
      case 'list_item':
      case 'list':
      case 'create_listing':
      case 'open_listing': {
        state.listings += 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Marketplace simulation created one listing.',
        });
        break;
      }
      case 'cancel_item':
      case 'cancel_listing':
      case 'cancel': {
        if (state.listings === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active listings to cancel in simulation state.',
          });
          break;
        }
        state.listings -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Marketplace simulation canceled one listing.',
        });
        break;
      }
      case 'buy_item':
      case 'buy':
      case 'purchase': {
        if (state.listings === 0) {
          if (generatedDefaultSteps) {
            warnings.push(
              `${entrypoint} has no generated listing setup step; treating it as structural reachability only.`,
            );
            results.push({
              label,
              wallet: step.wallet,
              entrypoint,
              status: 'passed',
              note: 'Marketplace purchase simulated structurally because no listing setup entrypoint is available.',
            });
            break;
          }
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No listings available to buy in simulation state.',
          });
          break;
        }
        state.listings -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Marketplace simulation purchased one listing.',
        });
        break;
      }
      case 'make_offer':
      case 'offer':
      case 'place_offer': {
        state.offers += 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Marketplace simulation created one offer.',
        });
        break;
      }
      case 'accept_offer': {
        if (state.offers === 0) {
          if (generatedDefaultSteps) {
            warnings.push(
              `${entrypoint} has no generated offer setup step; treating it as structural reachability only.`,
            );
            results.push({
              label,
              wallet: step.wallet,
              entrypoint,
              status: 'passed',
              note: 'Offer acceptance simulated structurally because no offer setup entrypoint is available.',
            });
            break;
          }
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active offers available to accept in simulation state.',
          });
          break;
        }
        state.offers -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Marketplace simulation accepted one offer.',
        });
        break;
      }
      case 'cancel_offer': {
        if (state.offers === 0) {
          if (generatedDefaultSteps) {
            warnings.push(
              `${entrypoint} has no generated offer setup step; treating it as structural reachability only.`,
            );
            results.push({
              label,
              wallet: step.wallet,
              entrypoint,
              status: 'passed',
              note: 'Offer cancellation simulated structurally because no offer setup entrypoint is available.',
            });
            break;
          }
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active offers available to cancel in simulation state.',
          });
          break;
        }
        state.offers -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Marketplace simulation canceled one offer.',
        });
        break;
      }
      case 'open_swap':
      case 'create_swap': {
        state.swaps += 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Swap simulation opened one swap workflow.',
        });
        break;
      }
      case 'accept_swap': {
        if (state.swaps === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active swaps available to accept in simulation state.',
          });
          break;
        }
        state.swaps -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Swap simulation accepted one active swap.',
        });
        break;
      }
      case 'cancel_swap': {
        if (state.swaps === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active swaps available to cancel in simulation state.',
          });
          break;
        }
        state.swaps -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Swap simulation canceled one active swap.',
        });
        break;
      }
      case 'start_auction':
      case 'open_auction':
      case 'create_auction': {
        state.auctions += 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Auction simulation opened one auction workflow.',
        });
        break;
      }
      case 'bid_with_token':
      case 'place_bid':
      case 'bid': {
        if (state.auctions === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active auctions available to bid on in simulation state.',
          });
          break;
        }
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Auction simulation placed a custom-token bid.',
        });
        break;
      }
      case 'settle_auction':
      case 'claim_auction':
      case 'claim': {
        if (state.auctions === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active auctions available to settle in simulation state.',
          });
          break;
        }
        state.auctions -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Auction simulation settled one auction.',
        });
        break;
      }
      case 'cancel_auction': {
        if (state.auctions === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active auctions available to cancel in simulation state.',
          });
          break;
        }
        state.auctions -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Auction simulation canceled one auction.',
        });
        break;
      }
      case 'open_barter':
      case 'create_barter': {
        state.barters += 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Barter simulation opened one barter workflow.',
        });
        break;
      }
      case 'counter_barter':
      case 'counter_offer': {
        if (state.barters === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active barters available to counter in simulation state.',
          });
          break;
        }
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Barter simulation recorded a counter-offer.',
        });
        break;
      }
      case 'accept_barter': {
        if (state.barters === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active barters available to accept in simulation state.',
          });
          break;
        }
        state.barters -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Barter simulation accepted one barter.',
        });
        break;
      }
      case 'cancel_barter': {
        if (state.barters === 0) {
          results.push({
            label,
            wallet: step.wallet,
            entrypoint,
            status: 'failed',
            note: 'No active barters available to cancel in simulation state.',
          });
          break;
        }
        state.barters -= 1;
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Barter simulation canceled one barter.',
        });
        break;
      }
      default: {
        warnings.push(
          `Opaque simulation for ${entrypoint}: no domain-specific model registered.`,
        );
        results.push({
          label,
          wallet: step.wallet,
          entrypoint,
          status: 'passed',
          note: 'Entrypoint simulated structurally (ABI + flow), not semantically.',
        });
      }
    }
  }

  const passed = results.filter((result) => result.status === 'passed').length;
  const failed = results.length - passed;
  const coverage = buildEntrypointCoverage({
    contracts: [
      {
        id: 'contract',
        entrypoints: input.entrypoints,
      },
    ],
    steps: stepsToRun,
  });

  if (!coverage.passed) {
    warnings.push(
      `Entrypoint coverage incomplete: ${coverage.missedEntrypoints.join(', ')}`,
    );
  }

  return {
    success: failed === 0 && coverage.passed,
    summary: {
      total: results.length,
      passed,
      failed,
    },
    generatedDefaultSteps,
    steps: results,
    state,
    coverage,
    warnings,
  };
}

export class DeploymentClearanceStore {
  private readonly records = new Map<string, DeploymentClearanceRecord>();
  private readonly ttlMs: number;

  constructor(ttlMs = 1000 * 60 * 60 * 6) {
    this.ttlMs = ttlMs;
  }

  create(input: {
    codeHash: string;
    auditPassed: boolean;
    simulationPassed: boolean;
    shadowboxPassed?: boolean;
  }): DeploymentClearanceRecord {
    const id = `clr_${randomUUID()}`;
    const createdAtDate = new Date();
    const expiresAtDate = new Date(createdAtDate.getTime() + this.ttlMs);
    const record: DeploymentClearanceRecord = {
      id,
      codeHash: input.codeHash,
      createdAt: createdAtDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      auditPassed: input.auditPassed,
      simulationPassed: input.simulationPassed,
      shadowboxPassed: input.shadowboxPassed,
    };
    this.records.set(id, record);
    this.gc();
    return record;
  }

  validate(clearanceId: string, codeHash: string): {
    ok: boolean;
    reason?: string;
    record?: DeploymentClearanceRecord;
  } {
    const record = this.records.get(clearanceId);
    if (!record) {
      return { ok: false, reason: 'Clearance record not found.' };
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      this.records.delete(clearanceId);
      return { ok: false, reason: 'Clearance record expired.' };
    }
    if (record.codeHash !== codeHash) {
      return { ok: false, reason: 'Clearance does not match current contract code hash.' };
    }
    if (
      !record.auditPassed ||
      !record.simulationPassed ||
      record.shadowboxPassed === false
    ) {
      return { ok: false, reason: 'Clearance record is not fully approved.' };
    }
    return { ok: true, record };
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, record] of this.records.entries()) {
      if (new Date(record.expiresAt).getTime() < now) {
        this.records.delete(id);
      }
    }
  }
}
