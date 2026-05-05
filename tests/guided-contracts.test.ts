import { describe, expect, it } from 'vitest';
import { buildGuidedContractDraft } from '../src/lib/guided-contracts.js';

describe('buildGuidedContractDraft', () => {
  it('builds FA2 SmartPy scaffold with selected options', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'fa2_fungible',
      projectName: 'Silver Forge',
      symbol: 'SLVR',
      adminAddress: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      decimals: 8,
      initialSupply: 1_000_000,
      includeMint: true,
      includeBurn: false,
      includePause: true,
      includeAdminTransfer: true,
      outputFormat: 'smartpy',
    });

    expect(draft.outputFormat).toBe('smartpy');
    expect(draft.entrypoints).toContain('mint');
    expect(draft.entrypoints).not.toContain('burn');
    expect(draft.code).toContain('class SilverForgeFA2');
    expect(draft.code).toContain('def mint');
    expect(draft.code).not.toContain('def burn');
  });

  it('builds deployable Michelson stub for marketplace', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'marketplace',
      projectName: 'Art Bazaar',
      adminAddress: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
      marketplaceFeeBps: 350,
      includeMint: false,
      includeBurn: false,
      includePause: true,
      includeAdminTransfer: true,
      outputFormat: 'michelson_stub',
    });

    expect(draft.outputFormat).toBe('michelson_stub');
    expect(draft.code).toContain('parameter');
    expect(draft.code).toContain('%list_item');
    expect(draft.code).toContain('%buy_item');
    expect(draft.code).toContain('code { CDR; NIL operation; PAIR };');
    expect(draft.code).not.toContain('UNPAIR;');
    expect(draft.initialStorage).toContain('350');
    expect(draft.warnings[0]).toContain('pipeline testing only');
  });

  it('builds NFT smartpy scaffold with optional entrypoints disabled', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'nft_collection',
      projectName: 'Open Editions',
      adminAddress: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
      maxCollectionSize: 999,
      royaltiesBps: 750,
      includeMint: false,
      includeBurn: true,
      includePause: false,
      includeAdminTransfer: false,
      outputFormat: 'smartpy',
    });

    expect(draft.outputFormat).toBe('smartpy');
    expect(draft.entrypoints).toContain('burn');
    expect(draft.entrypoints).not.toContain('mint');
    expect(draft.entrypoints).not.toContain('pause');
    expect(draft.code).toContain('class OpenEditionsCollection');
    expect(draft.code).toContain('def burn');
    expect(draft.code).not.toContain('def mint');
    expect(draft.code).not.toContain('def pause');
    expect(draft.code).not.toContain('def set_admin');
  });

  it('builds FA2 Michelson stub and uses burn placeholder fallback admin', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'fa2_fungible',
      projectName: '  ',
      symbol: '',
      includeMint: false,
      includeBurn: false,
      includePause: false,
      includeAdminTransfer: false,
      outputFormat: 'michelson_stub',
    });

    expect(draft.outputFormat).toBe('michelson_stub');
    expect(draft.entrypoints).toEqual(['transfer', 'balance_of']);
    expect(draft.code).toContain('%transfer');
    expect(draft.code).toContain('%balance_of');
    expect(draft.code).toContain('code { CDR; NIL operation; PAIR };');
    expect(draft.code).not.toContain('UNPAIR;');
    expect(draft.initialStorage).toContain('tz1burnburnburnburnburnburnburjAYjjX');
  });

  it('builds marketplace smartpy scaffold without pause/admin transfer paths', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'marketplace',
      projectName: 'Creator Lane',
      adminAddress: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      marketplaceFeeBps: 100,
      includeMint: false,
      includeBurn: false,
      includePause: false,
      includeAdminTransfer: false,
      outputFormat: 'smartpy',
    });

    expect(draft.code).toContain('class CreatorLaneMarketplace');
    expect(draft.code).toContain('def list_item');
    expect(draft.code).toContain('def set_fee_bps');
    expect(draft.code).not.toContain('def pause');
    expect(draft.code).not.toContain('def set_admin');
  });

  it('falls back to default class and symbol names for blank FA2 smartpy input', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'fa2_fungible',
      projectName: '   ',
      symbol: '   ',
      includeMint: true,
      includeBurn: true,
      includePause: true,
      includeAdminTransfer: true,
      outputFormat: 'smartpy',
    });

    expect(draft.code).toContain('class KilnContractFA2');
    expect(draft.code).toContain('symbol');
    expect(draft.code).toContain('0x4b494c4e');
  });

  it('adds reference-selected elements to FA2 entrypoints', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'fa2_fungible',
      projectName: 'Composable Token',
      includeMint: true,
      includeBurn: true,
      includePause: true,
      includeAdminTransfer: true,
      selectedElements: ['operator_support', 'allowlist_gate', 'permit_hook'],
      outputFormat: 'smartpy',
    });

    expect(draft.entrypoints).toEqual(
      expect.arrayContaining(['update_operators', 'set_allowlist', 'permit']),
    );
    expect(draft.selectedElements).toEqual(
      expect.arrayContaining(['operator_support', 'allowlist_gate', 'permit_hook']),
    );
    expect(draft.code).toContain('def update_operators');
    expect(draft.code).toContain('case add_operator(operator)');
    expect(draft.code).toContain('def set_allowlist');
  });

  it('uses standard FA2 update_operators payload shape in Michelson stubs', () => {
    const draft = buildGuidedContractDraft({
      contractType: 'nft_collection',
      projectName: 'Operator Collection',
      includeMint: true,
      includeBurn: true,
      includePause: true,
      includeAdminTransfer: true,
      selectedElements: ['operator_support'],
      outputFormat: 'michelson_stub',
    });

    expect(draft.code).toContain('%update_operators');
    expect(draft.code).toContain('%add_operator');
    expect(draft.code).toContain('%remove_operator');
  });
});
