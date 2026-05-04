import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  runContractSimulation,
  type SimulationStepInput,
} from './contract-simulation.js';

const execFile = promisify(execFileCallback);

export type ShadowboxProvider = 'disabled' | 'mock' | 'command';
export type ShadowboxWallet = 'bert' | 'ernie' | 'user';

export interface ShadowboxRuntimeSettings {
  enabled: boolean;
  requiredForClearance: boolean;
  provider: 'mock' | 'command';
  command?: string;
  timeoutMs: number;
  maxActiveJobs: number;
  maxActiveJobsPerIp: number;
  maxSourceBytes: number;
  maxSteps: number;
  workDir?: string;
}

export interface ShadowboxRunInput {
  sourceType: 'michelson' | 'smartpy';
  michelson: string;
  initialStorage: string;
  contracts?: Array<{
    id: string;
    michelson: string;
    initialStorage: string;
  }>;
  entrypoints: string[];
  steps: SimulationStepInput[];
  codeHash: string;
  requestId?: string;
  remoteIp?: string;
}

export interface ShadowboxStepResult {
  label: string;
  wallet: ShadowboxWallet;
  entrypoint: string;
  status: 'passed' | 'failed';
  note: string;
  operationHash?: string;
  level?: number;
}

export interface ShadowboxRunResult {
  enabled: boolean;
  requiredForClearance: boolean;
  provider: ShadowboxProvider;
  executed: boolean;
  passed: boolean;
  jobId: string | null;
  reason?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  contractAddress?: string;
  contracts?: Array<{
    id: string;
    address: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  steps: ShadowboxStepResult[];
  warnings: string[];
}

interface ShadowboxProviderResult {
  passed: boolean;
  contractAddress?: string;
  contracts?: Array<{
    id: string;
    address: string;
  }>;
  steps: ShadowboxStepResult[];
  warnings: string[];
}

class ShadowboxCapacityError extends Error {}

class InMemoryShadowboxLimiter {
  private readonly activeJobs = new Set<string>();
  private readonly activeByIp = new Map<string, Set<string>>();

  acquire(input: {
    jobId: string;
    remoteIp: string;
    maxActiveJobs: number;
    maxActiveJobsPerIp: number;
  }): () => void {
    if (this.activeJobs.size >= input.maxActiveJobs) {
      throw new ShadowboxCapacityError(
        `Shadowbox queue full (${input.maxActiveJobs} active jobs). Retry shortly.`,
      );
    }

    const activeForIp = this.activeByIp.get(input.remoteIp);
    const activeForIpCount = activeForIp?.size ?? 0;
    if (activeForIpCount >= input.maxActiveJobsPerIp) {
      throw new ShadowboxCapacityError(
        `Shadowbox limit reached for ${input.remoteIp} (${input.maxActiveJobsPerIp} active jobs per IP).`,
      );
    }

    this.activeJobs.add(input.jobId);
    const set = activeForIp ?? new Set<string>();
    set.add(input.jobId);
    this.activeByIp.set(input.remoteIp, set);

    return () => {
      this.activeJobs.delete(input.jobId);
      const current = this.activeByIp.get(input.remoteIp);
      if (!current) {
        return;
      }
      current.delete(input.jobId);
      if (current.size === 0) {
        this.activeByIp.delete(input.remoteIp);
      }
    };
  }
}

function summarizeSteps(steps: ShadowboxStepResult[]): {
  total: number;
  passed: number;
  failed: number;
} {
  const passed = steps.filter((step) => step.status === 'passed').length;
  return {
    total: steps.length,
    passed,
    failed: steps.length - passed,
  };
}

function normalizeWallet(value: unknown, fallback: ShadowboxWallet): ShadowboxWallet {
  return value === 'bert' || value === 'ernie' || value === 'user'
    ? value
    : fallback;
}

function normalizeStepResults(
  rawSteps: unknown,
  fallbackSteps: SimulationStepInput[],
): ShadowboxStepResult[] {
  if (!Array.isArray(rawSteps)) {
    return [];
  }

  return rawSteps.map((rawStep, index) => {
    const fallback = fallbackSteps[index];
    const record =
      rawStep && typeof rawStep === 'object'
        ? (rawStep as Record<string, unknown>)
        : {};
    const status = record.status === 'failed' ? 'failed' : 'passed';

    return {
      label:
        typeof record.label === 'string' && record.label.trim().length > 0
          ? record.label
          : fallback?.label?.trim() || `Step ${index + 1}`,
      wallet: normalizeWallet(record.wallet, fallback?.wallet ?? 'user'),
      entrypoint:
        typeof record.entrypoint === 'string' && record.entrypoint.trim().length > 0
          ? record.entrypoint
          : fallback?.entrypoint ?? 'unknown',
      status,
      note:
        typeof record.note === 'string' && record.note.trim().length > 0
          ? record.note
          : status === 'passed'
            ? 'Shadowbox step passed.'
            : 'Shadowbox step failed.',
      operationHash:
        typeof record.operationHash === 'string'
          ? record.operationHash
          : undefined,
      level:
        typeof record.level === 'number' && Number.isFinite(record.level)
          ? record.level
          : undefined,
    };
  });
}

function normalizeContractResults(
  rawContracts: unknown,
): Array<{ id: string; address: string }> | undefined {
  if (!Array.isArray(rawContracts)) {
    return undefined;
  }

  const contracts = rawContracts
    .map((rawContract) => {
      const record =
        rawContract && typeof rawContract === 'object'
          ? (rawContract as Record<string, unknown>)
          : {};
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const address =
        typeof record.address === 'string' ? record.address.trim() : '';
      return id && address ? { id, address } : null;
    })
    .filter((contract): contract is { id: string; address: string } =>
      Boolean(contract),
    );

  return contracts.length > 0 ? contracts : undefined;
}

async function runMockProvider(
  input: ShadowboxRunInput,
  requiredForClearance: boolean,
): Promise<ShadowboxProviderResult> {
  const simulation = runContractSimulation({
    entrypoints: input.entrypoints,
    steps: input.steps,
  });

  const steps = simulation.steps.map((step) => ({
    label: step.label,
    wallet: step.wallet,
    entrypoint: step.entrypoint,
    status: step.status,
    note: step.note,
  })) satisfies ShadowboxStepResult[];

  const warnings = [...simulation.warnings];
  const passed = false;
  warnings.push(
    requiredForClearance
      ? 'Shadowbox mock provider is active. Configure command provider for real runtime clearance.'
      : 'Shadowbox mock provider cannot pass under the no-stub policy; configure command provider for real runtime evidence.',
  );

  return {
    passed,
    steps,
    warnings,
  };
}

async function runCommandProvider(
  input: ShadowboxRunInput,
  settings: ShadowboxRuntimeSettings,
  jobId: string,
): Promise<ShadowboxProviderResult> {
  const command = settings.command?.trim();
  if (!command) {
    throw new Error(
      'Shadowbox command provider requires KILN_SHADOWBOX_COMMAND to be configured.',
    );
  }

  const rootDir = settings.workDir?.trim() || join(tmpdir(), 'kiln-shadowbox');
  const jobDir = join(rootDir, jobId);
  const inputPath = join(jobDir, 'input.json');
  const outputPath = join(jobDir, 'output.json');

  await fs.mkdir(jobDir, { recursive: true });
  try {
    await fs.writeFile(inputPath, JSON.stringify(input, null, 2), 'utf8');

    const shellCommand = `${command} "${inputPath}" "${outputPath}"`;
    await execFile('/bin/sh', ['-lc', shellCommand], {
      timeout: settings.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    const outputRaw = await fs.readFile(outputPath, 'utf8');
    const output = JSON.parse(outputRaw) as Record<string, unknown>;

    const steps = normalizeStepResults(output.steps, input.steps);
    const warnings =
      Array.isArray(output.warnings) && output.warnings.every((value) => typeof value === 'string')
        ? (output.warnings as string[])
        : [];
    const passed =
      typeof output.passed === 'boolean'
        ? output.passed
        : summarizeSteps(steps).failed === 0;

    return {
      passed,
      contractAddress:
        typeof output.contractAddress === 'string'
          ? output.contractAddress
          : undefined,
      contracts: normalizeContractResults(output.contracts),
      steps,
      warnings,
    };
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true });
  }
}

function disabledResult(
  requiredForClearance: boolean,
  reason: string,
): ShadowboxRunResult {
  return {
    enabled: false,
    requiredForClearance,
    provider: 'disabled',
    executed: false,
    passed: !requiredForClearance,
    jobId: null,
    reason,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
    },
    steps: [],
    warnings: [],
  };
}

function rejectedResult(input: {
  provider: ShadowboxProvider;
  requiredForClearance: boolean;
  reason: string;
}): ShadowboxRunResult {
  return {
    enabled: true,
    requiredForClearance: input.requiredForClearance,
    provider: input.provider,
    executed: false,
    passed: false,
    jobId: null,
    reason: input.reason,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
    },
    steps: [],
    warnings: [],
  };
}

export class ShadowboxRuntimeRunner {
  private readonly limiter = new InMemoryShadowboxLimiter();
  private readonly settings: ShadowboxRuntimeSettings;

  constructor(settings: ShadowboxRuntimeSettings) {
    this.settings = settings;
  }

  describe(): {
    enabled: boolean;
    requiredForClearance: boolean;
    provider: ShadowboxProvider;
    limits: {
      timeoutMs: number;
      maxActiveJobs: number;
      maxActiveJobsPerIp: number;
      maxSourceBytes: number;
      maxSteps: number;
    };
  } {
    return {
      enabled: this.settings.enabled,
      requiredForClearance: this.settings.requiredForClearance,
      provider: this.settings.enabled ? this.settings.provider : 'disabled',
      limits: {
        timeoutMs: this.settings.timeoutMs,
        maxActiveJobs: this.settings.maxActiveJobs,
        maxActiveJobsPerIp: this.settings.maxActiveJobsPerIp,
        maxSourceBytes: this.settings.maxSourceBytes,
        maxSteps: this.settings.maxSteps,
      },
    };
  }

  async run(input: ShadowboxRunInput): Promise<ShadowboxRunResult> {
    if (!this.settings.enabled) {
      return disabledResult(
        this.settings.requiredForClearance,
        'Shadowbox runtime disabled by environment.',
      );
    }

    const sourceBytes =
      Buffer.byteLength(input.michelson, 'utf8') +
      (input.contracts ?? []).reduce(
        (sum, contract) => sum + Buffer.byteLength(contract.michelson, 'utf8'),
        0,
      );
    if (sourceBytes > this.settings.maxSourceBytes) {
      return rejectedResult({
        provider: this.settings.provider,
        requiredForClearance: this.settings.requiredForClearance,
        reason: `Contract source is too large for shadowbox (${sourceBytes} > ${this.settings.maxSourceBytes} bytes).`,
      });
    }

    if (input.steps.length > this.settings.maxSteps) {
      return rejectedResult({
        provider: this.settings.provider,
        requiredForClearance: this.settings.requiredForClearance,
        reason: `Too many shadowbox steps (${input.steps.length} > ${this.settings.maxSteps}).`,
      });
    }

    const remoteIp = input.remoteIp?.trim() || 'unknown';
    const jobId = `sbox_${randomUUID()}`;

    let release: (() => void) | undefined;
    try {
      release = this.limiter.acquire({
        jobId,
        remoteIp,
        maxActiveJobs: this.settings.maxActiveJobs,
        maxActiveJobsPerIp: this.settings.maxActiveJobsPerIp,
      });
    } catch (error) {
      return rejectedResult({
        provider: this.settings.provider,
        requiredForClearance: this.settings.requiredForClearance,
        reason:
          error instanceof ShadowboxCapacityError
            ? error.message
            : 'Shadowbox capacity check failed.',
      });
    }

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    try {
      const providerResult =
        this.settings.provider === 'command'
          ? await runCommandProvider(input, this.settings, jobId)
          : await runMockProvider(input, this.settings.requiredForClearance);

      const endedAtMs = Date.now();
      const endedAt = new Date(endedAtMs).toISOString();
      const summary = summarizeSteps(providerResult.steps);
      const passed = providerResult.passed && summary.failed === 0;

      return {
        enabled: true,
        requiredForClearance: this.settings.requiredForClearance,
        provider: this.settings.provider,
        executed: true,
        passed,
        jobId,
        startedAt,
        endedAt,
        durationMs: endedAtMs - startedAtMs,
        contractAddress: providerResult.contractAddress,
        contracts: providerResult.contracts,
        summary,
        steps: providerResult.steps,
        warnings: providerResult.warnings,
      };
    } catch (error) {
      const endedAtMs = Date.now();
      const endedAt = new Date(endedAtMs).toISOString();
      return {
        enabled: true,
        requiredForClearance: this.settings.requiredForClearance,
        provider: this.settings.provider,
        executed: true,
        passed: false,
        jobId,
        reason:
          error instanceof Error
            ? error.message
            : 'Shadowbox runtime failed unexpectedly.',
        startedAt,
        endedAt,
        durationMs: endedAtMs - startedAtMs,
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
        },
        steps: [],
        warnings: [],
      };
    } finally {
      release?.();
    }
  }
}

export function createShadowboxRuntimeRunner(
  settings: ShadowboxRuntimeSettings,
): ShadowboxRuntimeRunner {
  return new ShadowboxRuntimeRunner(settings);
}
