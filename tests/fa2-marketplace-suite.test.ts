import { describe, expect, it } from 'vitest';
import {
  buildFa2MarketplaceSuite,
  buildSuiteE2ESteps,
  buildSuiteWorkflowSteps,
} from '../src/lib/fa2-marketplace-suite.js';
import { parseEntrypointsFromMichelson } from '../src/lib/michelson-parser.js';
import { buildEntrypointCoverage } from '../src/lib/workflow-coverage.js';

describe('FA2 marketplace suite fixture', () => {
  it('contains currency, asset, market, swap, auction, and barter contracts', () => {
    const suite = buildFa2MarketplaceSuite();

    expect(suite.contracts.map((contract) => contract.id)).toEqual([
      'currency_token',
      'asset_token',
      'standard_market',
      'swap_market',
      'auction_market',
      'barter_market',
    ]);
  });

  it('ships SmartPy sources and scenarios for each stateful contract', () => {
    const suite = buildFa2MarketplaceSuite();

    for (const contract of suite.contracts) {
      expect(contract.sourceType).toBe('smartpy');
      expect(contract.smartpySource).toContain('@sp.entrypoint');
      expect(contract.scenario).toMatch(/^kiln_/);
    }
  });

  it('declares parseable entrypoints for every contract', () => {
    const suite = buildFa2MarketplaceSuite();

    for (const contract of suite.contracts) {
      expect(parseEntrypointsFromMichelson(contract.michelson).map((entry) => entry.name)).toEqual(
        contract.entrypoints,
      );
      expect(contract.initialStorage).toContain(suite.placeholders.adminAddress);
    }
  });

  it('uses the custom currency token instead of XTZ in marketplace workflows', () => {
    const suite = buildFa2MarketplaceSuite();

    for (const contract of suite.contracts.filter((item) => item.id.endsWith('_market'))) {
      expect(contract.michelson).toContain('%currency_token');
      expect(contract.initialStorage).toContain(suite.placeholders.currencyTokenAddress);
    }

    const steps = buildSuiteE2ESteps(suite);
    expect(steps.every((step) => (step.amountMutez ?? 0) === 0)).toBe(true);
    expect(new Set(steps.map((step) => step.wallet))).toEqual(new Set(['A', 'B']));
  });

  it('covers every endpoint in the positive clearance plan', () => {
    const suite = buildFa2MarketplaceSuite();
    const steps = suite.contracts.flatMap((contract) =>
      buildSuiteWorkflowSteps(contract).map((step) => ({
        ...step,
        targetContractId: contract.id,
      })),
    );

    const coverage = buildEntrypointCoverage({
      contracts: suite.contracts.map((contract) => ({
        id: contract.id,
        address: contract.address,
        entrypoints: contract.entrypoints,
      })),
      steps: steps.map((step) => ({
        wallet: step.wallet,
        targetContractId: step.targetContractId,
        entrypoint: step.entrypoint,
        args: step.args,
      })),
    });

    expect(coverage.passed).toBe(true);
    expect(coverage.totalEntrypoints).toBeGreaterThan(30);
    expect(coverage.missedEntrypoints).toEqual([]);
  });

  it('includes workflow edge cases and expected failures in post-deploy E2E', () => {
    const suite = buildFa2MarketplaceSuite();
    const steps = buildSuiteE2ESteps(suite);
    const labels = steps.map((step) => step.label ?? '');

    expect(labels).toEqual(
      expect.arrayContaining([
        'standard_market: Ernie cannot buy before Bert lists',
        'standard_market: Ernie offers custom currency',
        'standard_market: Bert accepts Ernie offer',
        'swap_market: Ernie cannot accept before Bert opens swap',
        'swap_market: Bert opens token-for-currency swap',
        'swap_market: Ernie accepts swap with currency',
        'auction_market: Ernie cannot bid before auction starts',
        'auction_market: Ernie bids custom currency',
        'auction_market: Bert settles winning bid',
        'barter_market: Bert cannot accept before Ernie counters',
        'barter_market: Ernie counters with token basket',
        'barter_market: Bert accepts barter',
      ]),
    );
    expect(steps.filter((step) => step.expectFailure).length).toBeGreaterThanOrEqual(15);
    expect(steps.every((step) => (step.amountMutez ?? 0) === 0)).toBe(true);
  });
});
