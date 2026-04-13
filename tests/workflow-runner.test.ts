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
});
