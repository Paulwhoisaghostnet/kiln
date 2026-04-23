import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createShadowboxRuntimeRunner } from '../src/lib/shadowbox-runtime.js';

const sampleInput = {
  sourceType: 'michelson' as const,
  michelson:
    'parameter (or (pair %mint address nat) (pair %transfer address nat)); storage unit; code { CAR ; NIL operation ; PAIR };',
  initialStorage: 'Unit',
  entrypoints: ['mint', 'transfer'],
  steps: [
    {
      wallet: 'bert' as const,
      entrypoint: 'mint',
      args: ['10'],
    },
  ],
  codeHash: 'abc123',
  remoteIp: '127.0.0.1',
};

describe('ShadowboxRuntimeRunner', () => {
  it('returns disabled status when shadowbox runtime is off', async () => {
    const runner = createShadowboxRuntimeRunner({
      enabled: false,
      requiredForClearance: false,
      provider: 'mock',
      timeoutMs: 5_000,
      maxActiveJobs: 2,
      maxActiveJobsPerIp: 1,
      maxSourceBytes: 1024,
      maxSteps: 10,
    });

    const result = await runner.run(sampleInput);
    expect(result.enabled).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.provider).toBe('disabled');
  });

  it('enforces payload size limits', async () => {
    const runner = createShadowboxRuntimeRunner({
      enabled: true,
      requiredForClearance: false,
      provider: 'mock',
      timeoutMs: 5_000,
      maxActiveJobs: 2,
      maxActiveJobsPerIp: 1,
      maxSourceBytes: 10,
      maxSteps: 10,
    });

    const result = await runner.run(sampleInput);
    expect(result.executed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('too large');
  });

  it('runs mock provider and returns simulated steps', async () => {
    const runner = createShadowboxRuntimeRunner({
      enabled: true,
      requiredForClearance: false,
      provider: 'mock',
      timeoutMs: 5_000,
      maxActiveJobs: 2,
      maxActiveJobsPerIp: 1,
      maxSourceBytes: 10_000,
      maxSteps: 10,
    });

    const result = await runner.run(sampleInput);
    expect(result.enabled).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.provider).toBe('mock');
    expect(result.summary.total).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mock mode'),
      ]),
    );
  });

  it('fails mock provider when runtime gate is required for clearance', async () => {
    const runner = createShadowboxRuntimeRunner({
      enabled: true,
      requiredForClearance: true,
      provider: 'mock',
      timeoutMs: 5_000,
      maxActiveJobs: 2,
      maxActiveJobsPerIp: 1,
      maxSourceBytes: 10_000,
      maxSteps: 10,
    });

    const result = await runner.run(sampleInput);
    expect(result.executed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('real runtime clearance'),
      ]),
    );
  });

  it('runs command provider and consumes output contract report', async () => {
    const workspace = join(tmpdir(), `shadowbox-test-${randomUUID()}`);
    await fs.mkdir(workspace, { recursive: true });
    const scriptPath = join(workspace, 'shadowbox-runner.cjs');
    const script = `
const fs = require('node:fs');
const inputPath = process.argv[2];
const outputPath = process.argv[3];
const request = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const step = request.steps[0] || { label: 'step', wallet: 'bert', entrypoint: 'mint' };
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    passed: true,
    contractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
    warnings: [],
    steps: [
      {
        label: step.label || 'step',
        wallet: step.wallet || 'bert',
        entrypoint: step.entrypoint || 'mint',
        status: 'passed',
        note: 'Executed in ephemeral runtime.',
        operationHash: 'opShadow',
      },
    ],
  }),
);
`;
    await fs.writeFile(scriptPath, script, 'utf8');

    const runner = createShadowboxRuntimeRunner({
      enabled: true,
      requiredForClearance: true,
      provider: 'command',
      command: `node "${scriptPath}"`,
      timeoutMs: 10_000,
      maxActiveJobs: 2,
      maxActiveJobsPerIp: 1,
      maxSourceBytes: 10_000,
      maxSteps: 10,
      workDir: workspace,
    });

    const result = await runner.run(sampleInput);

    expect(result.executed).toBe(true);
    expect(result.provider).toBe('command');
    expect(result.passed).toBe(true);
    expect(result.contractAddress).toBe('KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton');
    expect(result.steps[0]?.operationHash).toBe('opShadow');
  });
});
