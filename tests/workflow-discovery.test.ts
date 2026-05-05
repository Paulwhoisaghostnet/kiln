import { describe, expect, it } from 'vitest';
import {
  buildShadowboxSkippedEntrypointWarnings,
  buildWorkflowDrivenE2ESteps,
  buildWorkflowDrivenShadowboxSteps,
  buildWorkflowDrivenSimulationSteps,
  discoverContractWorkflows,
} from '../src/lib/workflow-discovery.js';

describe('workflow discovery', () => {
  it('infers listing and offer workflows from marketplace entrypoints', () => {
    const discovery = discoverContractWorkflows({
      contractId: 'market',
      entrypoints: [
        'list_item',
        'cancel_item',
        'buy_item',
        'make_offer',
        'accept_offer',
        'cancel_offer',
      ],
    });

    expect(discovery.workflows.map((workflow) => workflow.kind)).toEqual([
      'standard_listing',
      'standard_offer',
    ]);
    expect(discovery.coverage.passed).toBe(true);
    expect(discovery.coverage.missedEntrypoints).toEqual([]);
  });

  it('builds ordered Bert and Ernie workflow tests, including expected failures', () => {
    const steps = buildWorkflowDrivenE2ESteps({
      contractId: 'auction_market',
      contractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      entrypoints: [
        'start_auction',
        'bid_with_token',
        'settle_auction',
        'cancel_auction',
      ],
    });

    expect(steps.map((step) => step.label)).toEqual([
      'auction_market: Ernie cannot bid before auction starts',
      'auction_market: Bert cannot settle before auction starts',
      'auction_market: Bert starts auction',
      'auction_market: Bert cannot settle before any bid',
      'auction_market: Ernie bids custom currency',
      'auction_market: Bert settles winning bid',
      'auction_market: Bert cannot settle closed auction',
      'auction_market: Bert starts auction for cancel path',
      'auction_market: Bert cancels auction',
      'auction_market: Ernie cannot bid on canceled auction',
    ]);
    expect(steps[0]?.expectFailure).toBe(true);
    expect(steps.filter((step) => step.expectFailure).length).toBe(5);
    expect(new Set(steps.map((step) => step.wallet))).toEqual(new Set(['A', 'B']));
  });

  it('discovers swap, auction, and barter workflows without suite-specific configuration', () => {
    const discovery = discoverContractWorkflows({
      contractId: 'compound_market',
      entrypoints: [
        'open_swap',
        'accept_swap',
        'cancel_swap',
        'start_auction',
        'bid_with_token',
        'settle_auction',
        'cancel_auction',
        'open_barter',
        'counter_barter',
        'accept_barter',
        'cancel_barter',
      ],
    });

    expect(discovery.workflows.map((workflow) => workflow.kind)).toEqual([
      'swap',
      'auction',
      'barter',
    ]);
    expect(discovery.coverage.coveredEntrypoints).toBe(11);
  });

  it('falls back to endpoint reachability for unknown entrypoints', () => {
    const steps = buildWorkflowDrivenSimulationSteps({
      contractId: 'unknown',
      entrypoints: ['do_thing', 'claim_magic'],
    });

    expect(steps).toEqual([
      expect.objectContaining({
        label: 'unknown: reach do_thing',
        wallet: 'bert',
        entrypoint: 'do_thing',
      }),
      expect.objectContaining({
        label: 'unknown: reach claim_magic',
        wallet: 'ernie',
        entrypoint: 'claim_magic',
      }),
    ]);
  });

  it('uses typed sample args for fallback reachability entrypoints', () => {
    const steps = buildWorkflowDrivenSimulationSteps({
      contractId: 'options',
      entrypoints: ['set_allowlist', 'set_royalty_bps', 'permit', 'purchase'],
    });

    expect(steps).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        entrypoint: 'set_allowlist',
        args: [{ address: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6', allowed: true }],
      }),
      expect.objectContaining({
        entrypoint: 'set_royalty_bps',
        args: [250],
      }),
      expect.objectContaining({
        entrypoint: 'permit',
        args: ['0x00'],
      }),
      expect.objectContaining({
        entrypoint: 'purchase',
        args: [1],
      }),
      ]),
    );
  });

  it('uses typed sample args for marketplace alias workflows', () => {
    const steps = buildWorkflowDrivenSimulationSteps({
      contractId: 'market',
      entrypoints: ['list', 'purchase', 'cancel_listing'],
      includeExpectedFailures: false,
    });

    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrypoint: 'list',
          args: [1, 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton', 0, 1_000_000],
        }),
        expect.objectContaining({ entrypoint: 'purchase', args: [1] }),
        expect.objectContaining({ entrypoint: 'cancel_listing', args: [1] }),
      ]),
    );
  });

  it('omits callback and signature-bound entrypoints from shadowbox steps with warnings', () => {
    const steps = buildWorkflowDrivenShadowboxSteps({
      contractId: 'token',
      entrypoints: ['mint', 'balance_of', 'permit', 'set_allowlist'],
    });

    expect(steps.map((step) => step.entrypoint)).toEqual(['mint', 'set_allowlist']);
    expect(buildShadowboxSkippedEntrypointWarnings(['balance_of', 'permit'])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('balance_of'),
        expect.stringContaining('permit'),
      ]),
    );
  });

  it('orders admin controls so role-sensitive checks can pass', () => {
    const steps = buildWorkflowDrivenSimulationSteps({
      contractId: 'market',
      entrypoints: ['pause', 'set_admin', 'set_fee_bps'],
    });

    expect(steps.map((step) => `${step.wallet}:${step.entrypoint}`)).toEqual([
      'bert:set_admin',
      'bert:set_fee_bps',
      'bert:pause',
    ]);
  });

  it('orders token admin transfer before confirm_admin and later pause', () => {
    const steps = buildWorkflowDrivenSimulationSteps({
      contractId: 'token',
      entrypoints: [
        'admin',
        'balance_of',
        'burn_tokens',
        'confirm_admin',
        'create_token',
        'mint_tokens',
        'pause',
        'set_admin',
        'transfer',
        'update_operators',
      ],
    });

    expect(steps.map((step) => `${step.wallet}:${step.entrypoint}`)).toEqual([
      'bert:admin',
      'bert:create_token',
      'bert:mint_tokens',
      'ernie:balance_of',
      'bert:transfer',
      'ernie:burn_tokens',
      'bert:update_operators',
      'bert:set_admin',
      'ernie:confirm_admin',
      'ernie:pause',
    ]);
  });
});
