import { describe, expect, it } from 'vitest';
import {
  buildEntrypointCoverage,
  generateEntrypointCoverageSteps,
} from '../src/lib/workflow-coverage.js';

describe('entrypoint workflow coverage', () => {
  it('generates at least one Bert or Ernie step for every entrypoint', () => {
    const steps = generateEntrypointCoverageSteps([
      {
        id: 'market',
        entrypoints: ['list_item', 'buy_item', 'cancel_item', 'set_fee_bps'],
      },
    ]);

    expect(steps.map((step) => step.entrypoint)).toEqual([
      'list_item',
      'buy_item',
      'cancel_item',
      'set_fee_bps',
    ]);
    expect(new Set(steps.map((step) => step.wallet))).toEqual(
      new Set(['bert', 'ernie']),
    );
    expect(steps.every((step) => step.targetContractId === 'market')).toBe(true);
  });

  it('reports uncovered entrypoints across multi-contract systems', () => {
    const coverage = buildEntrypointCoverage({
      contracts: [
        { id: 'currency', entrypoints: ['mint_tokens', 'transfer'] },
        { id: 'auction', entrypoints: ['start_auction', 'bid_with_token'] },
      ],
      steps: [
        {
          wallet: 'bert',
          targetContractId: 'currency',
          entrypoint: 'mint_tokens',
          args: [],
        },
        {
          wallet: 'ernie',
          targetContractId: 'auction',
          entrypoint: 'start_auction',
          args: [],
        },
      ],
    });

    expect(coverage.passed).toBe(false);
    expect(coverage.totalEntrypoints).toBe(4);
    expect(coverage.coveredEntrypoints).toBe(2);
    expect(coverage.missedEntrypoints).toEqual([
      'currency.transfer',
      'auction.bid_with_token',
    ]);
    expect(coverage.wallets).toEqual(['bert', 'ernie']);
  });

  it('passes only when every contract entrypoint has a matching step', () => {
    const contracts = [
      { id: 'swap', entrypoints: ['open_swap', 'accept_swap', 'cancel_swap'] },
    ];
    const steps = generateEntrypointCoverageSteps(contracts);
    const coverage = buildEntrypointCoverage({ contracts, steps });

    expect(coverage.passed).toBe(true);
    expect(coverage.coveredEntrypoints).toBe(3);
    expect(coverage.missedEntrypoints).toEqual([]);
  });
});
