import { describe, expect, it } from 'vitest';
import {
  DeploymentClearanceStore,
  hashContractCode,
  runContractSimulation,
} from '../src/lib/contract-simulation.js';

describe('runContractSimulation', () => {
  it('runs deterministic mint and transfer flows', () => {
    const result = runContractSimulation({
      entrypoints: ['mint', 'transfer'],
      steps: [
        {
          wallet: 'bert',
          entrypoint: 'mint',
          args: ['20'],
        },
        {
          wallet: 'bert',
          entrypoint: 'transfer',
          args: ['5'],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({
      total: 2,
      passed: 2,
      failed: 0,
    });
    expect(result.state.totalSupply).toBe(20);
    expect(result.state.balances.bert).toBeGreaterThan(0);
    expect(result.state.balances.ernie).toBeGreaterThan(0);
  });

  it('fails when requested entrypoint does not exist in ABI', () => {
    const result = runContractSimulation({
      entrypoints: ['mint'],
      steps: [
        {
          wallet: 'bert',
          entrypoint: 'transfer',
          args: [],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.summary.failed).toBe(1);
    expect(result.steps[0]?.note).toContain('not found in contract ABI');
  });

  it('generates default steps covering every entrypoint when none are provided', () => {
    const result = runContractSimulation({
      entrypoints: ['mint', 'transfer', 'burn', 'pause'],
      steps: [],
    });

    expect(result.generatedDefaultSteps).toBe(true);
    expect(result.summary.total).toBe(4);
    expect(result.coverage.passed).toBe(true);
    expect(result.coverage.missedEntrypoints).toEqual([]);
    expect(new Set(result.steps.map((step) => step.wallet))).toEqual(
      new Set(['bert', 'ernie']),
    );
  });

  it('fails simulation clearance when custom steps miss detected entrypoints', () => {
    const result = runContractSimulation({
      entrypoints: ['mint', 'transfer'],
      steps: [
        {
          wallet: 'bert',
          entrypoint: 'mint',
          args: ['10'],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.summary.failed).toBe(0);
    expect(result.coverage.passed).toBe(false);
    expect(result.coverage.missedEntrypoints).toEqual(['contract.transfer']);
  });

  it('blocks non-admin entrypoints while paused', () => {
    const result = runContractSimulation({
      entrypoints: ['pause', 'transfer'],
      steps: [
        {
          wallet: 'bert',
          entrypoint: 'pause',
          args: [true],
        },
        {
          wallet: 'bert',
          entrypoint: 'transfer',
          args: ['1'],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.summary.failed).toBe(1);
    expect(result.steps[1]?.note).toContain('paused');
  });

  it('fails burn when wallet has insufficient balance', () => {
    const result = runContractSimulation({
      entrypoints: ['burn'],
      steps: [
        {
          wallet: 'bert',
          entrypoint: 'burn',
          args: ['999999999'],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.steps[0]?.note).toContain('insufficient');
  });

  it('simulates marketplace listing lifecycle', () => {
    const result = runContractSimulation({
      entrypoints: ['list_item', 'buy_item', 'cancel_item'],
      steps: [
        {
          wallet: 'bert',
          entrypoint: 'list_item',
          args: [],
        },
        {
          wallet: 'ernie',
          entrypoint: 'buy_item',
          args: [],
        },
        {
          wallet: 'bert',
          entrypoint: 'cancel_item',
          args: [],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.summary.total).toBe(3);
    expect(result.steps[0]?.status).toBe('passed');
    expect(result.steps[1]?.status).toBe('passed');
    expect(result.steps[2]?.status).toBe('failed');
  });

  it('falls back to opaque simulation when no domain model is registered', () => {
    const result = runContractSimulation({
      entrypoints: ['custom_action'],
      steps: [
        {
          wallet: 'user',
          entrypoint: 'custom_action',
          args: [],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.warnings[0]).toContain('Opaque simulation');
  });
});

describe('DeploymentClearanceStore', () => {
  it('validates matching clearance records and rejects mismatched hashes', () => {
    const store = new DeploymentClearanceStore();
    const codeHash = hashContractCode('parameter unit; storage unit; code { CAR ; NIL operation ; PAIR };');
    const record = store.create({
      codeHash,
      auditPassed: true,
      simulationPassed: true,
    });

    expect(store.validate(record.id, codeHash).ok).toBe(true);
    expect(store.validate(record.id, `${codeHash}-other`).ok).toBe(false);
  });

  it('expires records after ttl', async () => {
    const store = new DeploymentClearanceStore(1);
    const record = store.create({
      codeHash: hashContractCode('code'),
      auditPassed: true,
      simulationPassed: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const validation = store.validate(record.id, record.codeHash);

    expect(validation.ok).toBe(false);
    expect(validation.reason).toContain('expired');
  });

  it('rejects unknown and not-fully-approved records', () => {
    const store = new DeploymentClearanceStore();
    const missing = store.validate('clr_missing', 'hash');
    expect(missing.ok).toBe(false);

    const record = store.create({
      codeHash: 'hash',
      auditPassed: true,
      simulationPassed: false,
    });
    const denied = store.validate(record.id, 'hash');
    expect(denied.ok).toBe(false);
    expect(denied.reason).toContain('not fully approved');
  });
});
