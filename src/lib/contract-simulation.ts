import { createHash, randomUUID } from 'node:crypto';

export type SimulationWallet = 'bert' | 'ernie' | 'user';

export interface SimulationStepInput {
  label?: string;
  wallet: SimulationWallet;
  entrypoint: string;
  args: unknown[];
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
    balances: Record<string, number>;
  };
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
  const selected = entrypoints.slice(0, 2);
  if (selected.length === 0) {
    return [];
  }

  const steps: SimulationStepInput[] = [];
  if (selected[0]) {
    steps.push({
      label: `Default ${selected[0]} (Bert)`,
      wallet: 'bert',
      entrypoint: selected[0],
      args: [],
    });
  }
  if (selected[1]) {
    steps.push({
      label: `Default ${selected[1]} (Ernie)`,
      wallet: 'ernie',
      entrypoint: selected[1],
      args: [],
    });
  }
  return steps;
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
      case 'list_item': {
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
      case 'cancel_item': {
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
      case 'buy_item': {
        if (state.listings === 0) {
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

  return {
    success: failed === 0,
    summary: {
      total: results.length,
      passed,
      failed,
    },
    generatedDefaultSteps,
    steps: results,
    state,
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
