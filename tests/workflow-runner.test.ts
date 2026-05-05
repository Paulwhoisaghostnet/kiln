import { describe, expect, it } from 'vitest';
import { DeploymentClearanceStore } from '../src/lib/contract-simulation.js';
import { runContractWorkflow } from '../src/lib/workflow-runner.js';

describe('runContractWorkflow', () => {
  it('runs michelson workflow end-to-end and grants clearance', async () => {
    const result = await runContractWorkflow(
      {
        sourceType: 'michelson',
        source: `
          parameter (or (pair %mint address nat) (pair %transfer address nat));
          storage unit;
          code { CAR ; NIL operation ; PAIR };
        `,
        initialStorage: 'Unit',
        simulationSteps: [
          {
            wallet: 'bert',
            entrypoint: 'mint',
            args: ['10'],
          },
          {
            wallet: 'ernie',
            entrypoint: 'transfer',
            args: ['1'],
          },
        ],
      },
      {
        compileSmartPy: async () => ({
          scenario: 'unused',
          michelson: '',
          initialStorage: 'Unit',
        }),
        injectKilnTokens: (code) => code,
        estimateOrigination: async () => ({
          gasLimit: 200_000,
          storageLimit: 10_000,
          suggestedFeeMutez: 40_000,
          minimalFeeMutez: 30_000,
        }),
        clearanceStore: new DeploymentClearanceStore(),
      },
    );

    expect(result.sourceType).toBe('michelson');
    expect(result.validate.passed).toBe(true);
    expect(result.simulation.success).toBe(true);
    expect(result.clearance.approved).toBe(true);
    expect(result.clearance.record?.id).toMatch(/^clr_/);
  });

  it('denies clearance when simulation steps do not cover every entrypoint', async () => {
    const result = await runContractWorkflow(
      {
        sourceType: 'michelson',
        source: `
          parameter (or (pair %mint address nat) (pair %transfer address nat));
          storage unit;
          code { CAR ; NIL operation ; PAIR };
        `,
        initialStorage: 'Unit',
        simulationSteps: [
          {
            wallet: 'bert',
            entrypoint: 'mint',
            args: ['10'],
          },
        ],
      },
      {
        compileSmartPy: async () => ({
          scenario: 'unused',
          michelson: '',
          initialStorage: 'Unit',
        }),
        injectKilnTokens: (code) => code,
        estimateOrigination: async () => ({
          gasLimit: 200_000,
          storageLimit: 10_000,
          suggestedFeeMutez: 40_000,
          minimalFeeMutez: 30_000,
        }),
        clearanceStore: new DeploymentClearanceStore(),
      },
    );

    expect(result.simulation.success).toBe(false);
    expect(result.simulation.coverage.missedEntrypoints).toEqual([
      'contract.transfer',
    ]);
    expect(result.clearance.approved).toBe(false);
  });

  it('compiles smartpy sources when requested', async () => {
    const result = await runContractWorkflow(
      {
        sourceType: 'smartpy',
        source: 'import smartpy as sp',
        simulationSteps: [],
      },
      {
        compileSmartPy: async () => ({
          scenario: 'default',
          michelson: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR };',
          initialStorage: 'Unit',
        }),
        injectKilnTokens: (code) => code,
        estimateOrigination: async () => ({
          gasLimit: 200_000,
          storageLimit: 10_000,
          suggestedFeeMutez: 40_000,
          minimalFeeMutez: 30_000,
        }),
        clearanceStore: new DeploymentClearanceStore(),
      },
    );

    expect(result.compile.performed).toBe(true);
    expect(result.sourceType).toBe('smartpy');
    expect(result.artifacts.michelson).toContain('parameter unit');
    expect(result.artifacts.initialStorage).toBe('Unit');
  });

  it('uses compiled smartpy storage when caller sends the default Unit placeholder', async () => {
    const compiledStorage =
      '(Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" (Pair "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" 0))';
    const seen = {
      estimateStorage: '',
      shadowboxStorage: '',
    };

    const result = await runContractWorkflow(
      {
        sourceType: 'smartpy',
        source: 'import smartpy as sp',
        initialStorage: 'Unit',
        simulationSteps: [],
      },
      {
        compileSmartPy: async () => ({
          scenario: 'default',
          michelson:
            'parameter unit; storage (pair address (pair address nat)); code { CDR ; NIL operation ; PAIR };',
          initialStorage: compiledStorage,
        }),
        injectKilnTokens: (code) => code,
        estimateOrigination: async (_code, initialStorage) => {
          seen.estimateStorage = initialStorage;
          return {
            gasLimit: 200_000,
            storageLimit: 10_000,
            suggestedFeeMutez: 40_000,
            minimalFeeMutez: 30_000,
          };
        },
        runShadowbox: async (input) => {
          seen.shadowboxStorage = input.initialStorage;
          return {
            enabled: true,
            requiredForClearance: false,
            provider: 'command',
            executed: true,
            passed: true,
            jobId: 'sbox_storage',
            contractAddress: undefined,
            startedAt: '2026-05-04T00:00:00.000Z',
            endedAt: '2026-05-04T00:00:01.000Z',
            durationMs: 1000,
            summary: { total: 0, passed: 0, failed: 0 },
            steps: [],
            warnings: [],
          };
        },
        clearanceStore: new DeploymentClearanceStore(),
      },
    );

    expect(result.artifacts.initialStorage).toBe(compiledStorage);
    expect(seen.estimateStorage).toBe(compiledStorage);
    expect(seen.shadowboxStorage).toBe(compiledStorage);
    expect(result.compile.warnings).toEqual(
      expect.arrayContaining([
        'Initial storage auto-filled from SmartPy compilation output.',
      ]),
    );
  });

  it('denies clearance when validation fails', async () => {
    const result = await runContractWorkflow(
      {
        sourceType: 'michelson',
        source: 'parameter unit;',
        initialStorage: 'Unit',
        simulationSteps: [],
      },
      {
        compileSmartPy: async () => ({
          scenario: 'unused',
          michelson: '',
          initialStorage: 'Unit',
        }),
        injectKilnTokens: (code) => code,
        estimateOrigination: async () => ({
          gasLimit: 200_000,
          storageLimit: 10_000,
          suggestedFeeMutez: 40_000,
          minimalFeeMutez: 30_000,
        }),
        clearanceStore: new DeploymentClearanceStore(),
      },
    );

    expect(result.validate.passed).toBe(false);
    expect(result.clearance.approved).toBe(false);
    expect(result.clearance.record).toBeUndefined();
  });

  it('denies clearance when shadowbox is required but runtime is not configured', async () => {
    const result = await runContractWorkflow(
      {
        sourceType: 'michelson',
        source: `
          parameter (or (pair %mint address nat) (pair %transfer address nat));
          storage unit;
          code { CAR ; NIL operation ; PAIR };
        `,
        initialStorage: 'Unit',
        simulationSteps: [
          {
            wallet: 'bert',
            entrypoint: 'mint',
            args: ['10'],
          },
        ],
      },
      {
        compileSmartPy: async () => ({
          scenario: 'unused',
          michelson: '',
          initialStorage: 'Unit',
        }),
        injectKilnTokens: (code) => code,
        estimateOrigination: async () => ({
          gasLimit: 200_000,
          storageLimit: 10_000,
          suggestedFeeMutez: 40_000,
          minimalFeeMutez: 30_000,
        }),
        shadowboxRequiredForClearance: true,
        clearanceStore: new DeploymentClearanceStore(),
      },
    );

    expect(result.shadowbox.executed).toBe(false);
    expect(result.shadowbox.passed).toBe(false);
    expect(result.clearance.approved).toBe(false);
    expect(result.validate.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Shadowbox runtime gate failed'),
      ]),
    );
  });

  it('passes generated default workflow steps into shadowbox runtime', async () => {
    let shadowboxStepCount = -1;
    let shadowboxSteps: Array<{ entrypoint: string; args: unknown[] }> = [];

    const result = await runContractWorkflow(
      {
        sourceType: 'michelson',
        source: `
          parameter (or (pair %mint address nat) (or (pair %transfer address nat) (or (pair %balance_of (list (pair address nat)) (contract (list (pair (pair address nat) nat)))) (or (bool %pause) (or (address %set_admin) (unit %confirm_admin))))));
          storage unit;
          code { CAR ; NIL operation ; PAIR };
        `,
        initialStorage: 'Unit',
        simulationSteps: [],
      },
      {
        compileSmartPy: async () => ({
          scenario: 'unused',
          michelson: '',
          initialStorage: 'Unit',
        }),
        injectKilnTokens: (code) => code,
        estimateOrigination: async () => ({
          gasLimit: 200_000,
          storageLimit: 10_000,
          suggestedFeeMutez: 40_000,
          minimalFeeMutez: 30_000,
        }),
        runShadowbox: async (input) => {
          shadowboxStepCount = input.steps.length;
          shadowboxSteps = input.steps.map((step) => ({
            entrypoint: step.entrypoint,
            args: step.args,
          }));
          return {
            enabled: true,
            requiredForClearance: true,
            provider: 'command',
            executed: true,
            passed: true,
            jobId: 'sbox_generated_steps',
            startedAt: '2026-05-04T00:00:00.000Z',
            endedAt: '2026-05-04T00:00:01.000Z',
            durationMs: 1000,
            summary: {
              total: input.steps.length,
              passed: input.steps.length,
              failed: 0,
            },
            steps: input.steps.map((step, index) => ({
              label: step.label ?? `Step ${index + 1}`,
              wallet: step.wallet,
              entrypoint: step.entrypoint,
              status: 'passed',
              note: 'Executed generated workflow step.',
            })),
            warnings: [],
          };
        },
        shadowboxRequiredForClearance: true,
        clearanceStore: new DeploymentClearanceStore(),
      },
    );

    expect(shadowboxStepCount).toBeGreaterThan(0);
    expect(result.shadowbox.summary.total).toBe(shadowboxStepCount);
    expect(shadowboxSteps).toEqual(
      expect.arrayContaining([
        { entrypoint: 'mint', args: [1] },
        { entrypoint: 'transfer', args: [1] },
        { entrypoint: 'pause', args: [true] },
        {
          entrypoint: 'set_admin',
          args: ['tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6'],
        },
        { entrypoint: 'confirm_admin', args: [] },
      ]),
    );
    expect(shadowboxSteps.some((step) => step.entrypoint === 'balance_of')).toBe(false);
    expect(result.shadowbox.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Shadowbox skipped balance_of')]),
    );
    expect(result.clearance.approved).toBe(true);
  });
});
