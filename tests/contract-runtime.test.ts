import { describe, expect, it } from 'vitest';
import { runContractE2E } from '../src/server/pipelines/contract-runtime.js';
import type { AbiEntrypoint, ContractCallResult, WalletType } from '../src/lib/types.js';
import type { TezosCallOptions, TezosServiceLike } from '../src/lib/tezos-service.js';

class FakeTezosService implements TezosServiceLike {
  constructor(
    private readonly wallet: WalletType,
    private readonly calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
      options?: TezosCallOptions;
    }>,
    private readonly entrypoints: AbiEntrypoint[] = [],
    private readonly storage: unknown = {},
  ) {}

  async getAddress(): Promise<string> {
    return this.wallet === 'A'
      ? 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb'
      : 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6';
  }

  async getBalance(): Promise<number> {
    return 1;
  }

  async validateOrigination(): Promise<{
    gasLimit: number;
    storageLimit: number;
    suggestedFeeMutez: number;
    minimalFeeMutez: number;
  }> {
    return {
      gasLimit: 1,
      storageLimit: 1,
      suggestedFeeMutez: 1,
      minimalFeeMutez: 1,
    };
  }

  async originateContract(): Promise<string> {
    return 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
  }

  async callContract(
    contractAddress: string,
    entrypoint: string,
    args: unknown[] = [],
    options?: TezosCallOptions,
  ): Promise<ContractCallResult> {
    this.calls.push({
      wallet: this.wallet,
      contractAddress,
      entrypoint,
      args,
      options,
    });
    return {
      hash: `op-${this.wallet}-${entrypoint}`,
      level: 42,
      status: 'applied',
    };
  }

  async getContractEntrypoints(): Promise<AbiEntrypoint[]> {
    return this.entrypoints;
  }

  async getContractStorage(): Promise<unknown> {
    return this.storage;
  }

  async getContractBalanceMutez(): Promise<string> {
    return '0';
  }
}

describe('runContractE2E', () => {
  it('fails the run when a declared contract entrypoint is not exercised', async () => {
    const calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
    }> = [];

    const result = await runContractE2E(
      {
        contracts: [
          {
            id: 'market',
            address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
            entrypoints: ['list_item', 'buy_with_token'],
          },
        ],
        steps: [
          {
            wallet: 'A',
            targetContractId: 'market',
            targetContractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
            entrypoint: 'list_item',
            args: [],
            assertions: [],
            expectFailure: false,
          },
        ],
      },
      (wallet) => new FakeTezosService(wallet, calls),
    );

    expect(result.summary.failed).toBe(0);
    expect(result.coverage?.passed).toBe(false);
    expect(result.coverage?.missedEntrypoints).toEqual(['market.buy_with_token']);
    expect(result.success).toBe(false);
  });

  it('passes multi-contract E2E only when all manifest entrypoints are covered', async () => {
    const calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
    }> = [];

    const result = await runContractE2E(
      {
        contracts: [
          {
            id: 'currency',
            address: 'KT1LjmAdYQCLBjwv4S2oFkEzyHVkomAf5MrW',
            entrypoints: ['mint_tokens', 'transfer'],
          },
          {
            id: 'auction',
            address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
            entrypoints: ['start_auction', 'bid_with_token'],
          },
        ],
        steps: [
          {
            wallet: 'A',
            targetContractId: 'currency',
            targetContractAddress: 'KT1LjmAdYQCLBjwv4S2oFkEzyHVkomAf5MrW',
            entrypoint: 'mint_tokens',
            args: [],
            assertions: [],
            expectFailure: false,
          },
          {
            wallet: 'B',
            targetContractId: 'currency',
            targetContractAddress: 'KT1LjmAdYQCLBjwv4S2oFkEzyHVkomAf5MrW',
            entrypoint: 'transfer',
            args: [],
            assertions: [],
            expectFailure: false,
          },
          {
            wallet: 'A',
            targetContractId: 'auction',
            targetContractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
            entrypoint: 'start_auction',
            args: [],
            assertions: [],
            expectFailure: false,
          },
          {
            wallet: 'B',
            targetContractId: 'auction',
            targetContractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
            entrypoint: 'bid_with_token',
            args: [],
            assertions: [],
            expectFailure: false,
          },
        ],
      },
      (wallet) => new FakeTezosService(wallet, calls),
    );

    expect(result.success).toBe(true);
    expect(result.coverage?.passed).toBe(true);
    expect(result.summary).toEqual({ total: 4, passed: 4, failed: 0 });
    expect(calls.map((call) => `${call.wallet}:${call.entrypoint}`)).toEqual([
      'A:mint_tokens',
      'B:transfer',
      'A:start_auction',
      'B:bid_with_token',
    ]);
  });

  it('evaluates storage, balance, and big-map assertions after live E2E steps', async () => {
    const calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
      options?: TezosCallOptions;
    }> = [];
    const marketAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
    const tokenAddress = 'KT1LjmAdYQCLBjwv4S2oFkEzyHVkomAf5MrW';
    const result = await runContractE2E(
      {
        contracts: [
          {
            id: 'market',
            address: marketAddress,
            entrypoints: ['purchase'],
          },
          {
            id: 'dummy_wtf',
            address: tokenAddress,
            entrypoints: [],
          },
        ],
        steps: [
          {
            label: 'Buyer purchases pet medicine',
            wallet: 'B',
            targetContractId: 'market',
            entrypoint: 'purchase',
            args: ['2500000000', '1', 'kiln-e2e'],
            assertions: [
              {
                id: 'market_token_storage',
                kind: 'storage',
                contractId: 'market',
                path: 'wtf_token_address',
                expected: tokenAddress,
              },
              {
                id: 'market_zero_balance',
                kind: 'balance',
                contractId: 'market',
                expectedMutez: '0',
              },
              {
                id: 'buyer_ledger',
                kind: 'big_map',
                contractId: 'dummy_wtf',
                bigMap: 'ledger',
                key: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
                expected: '97500000000',
              },
            ],
            expectFailure: false,
          },
        ],
      },
      (wallet) =>
        new FakeTezosService(wallet, calls, [], {
          wtf_token_address: tokenAddress,
          ledger: {
            provider: true,
            get(key: unknown) {
              if (!this.provider) {
                throw new Error('getter context lost');
              }
              if (key && typeof key === 'object' && !Array.isArray(key)) {
                const record = key as Record<string, unknown>;
                if (
                  record[0] === 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6' &&
                  String(record[1]) === '0'
                ) {
                  return '97500000000';
                }
              }
              return undefined;
            },
          },
        }),
    );

    expect(result.success).toBe(true);
    expect(result.assertionSummary).toEqual({
      ok: true,
      storage: true,
      balance: true,
      big_map: true,
      passedKinds: ['storage', 'balance', 'big_map'],
      missingKinds: [],
      assertionCount: 3,
    });
    expect(result.results[0]?.assertions?.map((assertion) => assertion.status)).toEqual([
      'passed',
      'passed',
      'passed',
    ]);
  });

  it('fails closed when a declared assertion does not match chain state', async () => {
    const calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
      options?: TezosCallOptions;
    }> = [];

    const result = await runContractE2E(
      {
        contractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
        contracts: [
          {
            id: 'counter',
            address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
            entrypoints: ['mint'],
          },
        ],
        steps: [
          {
            label: 'Assert wrong storage',
            wallet: 'A',
            entrypoint: 'mint',
            args: [],
            assertions: [
              {
                kind: 'storage',
                path: 'counter',
                expected: '2',
              },
            ],
            expectFailure: false,
          },
        ],
      },
      (wallet) => new FakeTezosService(wallet, calls, [], { counter: '1' }),
    );

    expect(result.success).toBe(false);
    expect(result.assertionSummary.ok).toBe(false);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('Assertion storage failed'),
      }),
    );
  });

  it('normalizes generated purchase args and prepares FA2 balance/operator resources', async () => {
    const calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
      options?: TezosCallOptions;
    }> = [];
    const marketAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
    const tokenAddress = 'KT1LjmAdYQCLBjwv4S2oFkEzyHVkomAf5MrW';
    const entrypoints: AbiEntrypoint[] = [
      {
        name: 'purchase',
        args: [],
        sampleJsArgs: [
          {
            listing_id: 0,
            amount_wtf_units: 7,
            purchase_ref: 'kiln-e2e',
          },
        ],
      },
      { name: 'transfer', args: [], sampleJsArgs: [] },
      { name: 'update_operators', args: [], sampleJsArgs: [] },
    ];

    const result = await runContractE2E(
      {
        contractAddress: marketAddress,
        contracts: [
          {
            id: 'market',
            address: marketAddress,
            entrypoints: ['purchase'],
          },
        ],
        steps: [
          {
            label: 'Ernie buys pet food',
            wallet: 'B',
            targetContractId: 'market',
            targetContractAddress: marketAddress,
            entrypoint: 'purchase',
            args: [1],
            generatedArgs: true,
            assertions: [],
            expectFailure: false,
          },
        ],
      },
      (wallet) =>
        new FakeTezosService(wallet, calls, entrypoints, {
          asset_token_address: marketAddress,
          wtf_token_address: tokenAddress,
          wtf_token_id: 0,
          treasury: 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt',
        }),
    );

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      {
        wallet: 'A',
        contractAddress: tokenAddress,
        entrypoint: 'mint_tokens',
        args: [
          [
            {
              token_id: 0,
              to_: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
              amount: 7,
            },
          ],
        ],
        options: { useMethodsObject: true },
      },
      {
        wallet: 'B',
        contractAddress: tokenAddress,
        entrypoint: 'update_operators',
        args: [
          [
            {
              add_operator: {
                owner: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
                operator: marketAddress,
                token_id: 0,
              },
            },
          ],
        ],
        options: { useMethodsObject: true },
      },
      {
        wallet: 'B',
        contractAddress: marketAddress,
        entrypoint: 'purchase',
        args: [
          {
            listing_id: 0,
            amount_wtf_units: 7,
            purchase_ref: 'kiln-e2e',
          },
        ],
        options: { amountMutez: undefined, useMethodsObject: true },
      },
    ]);
  });

  it('reports missing Shadownet payment token dependencies before purchase E2E', async () => {
    const calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
      options?: TezosCallOptions;
    }> = [];
    const marketAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
    const missingTokenAddress = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD';
    const entrypoints: AbiEntrypoint[] = [
      {
        name: 'purchase',
        args: [],
        sampleJsArgs: [
          {
            listing_id: 0,
            amount_wtf_units: 7,
            purchase_ref: 'kiln-e2e',
          },
        ],
      },
      { name: 'transfer', args: [], sampleJsArgs: [] },
      { name: 'update_operators', args: [], sampleJsArgs: [] },
    ];

    const result = await runContractE2E(
      {
        contractAddress: marketAddress,
        contracts: [
          {
            id: 'market',
            address: marketAddress,
            entrypoints: ['purchase'],
          },
        ],
        steps: [
          {
            label: 'Ernie reaches purchase',
            wallet: 'B',
            targetContractId: 'market',
            targetContractAddress: marketAddress,
            entrypoint: 'purchase',
            args: [1],
            generatedArgs: true,
            assertions: [],
            expectFailure: false,
          },
        ],
      },
      (wallet) =>
        ({
          async getAddress() {
            return wallet === 'A'
              ? 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb'
              : 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6';
          },
          async getBalance() {
            return 1;
          },
          async validateOrigination() {
            return {
              gasLimit: 1,
              storageLimit: 1,
              suggestedFeeMutez: 1,
              minimalFeeMutez: 1,
            };
          },
          async originateContract() {
            return marketAddress;
          },
          async callContract(contractAddress, entrypoint, args = [], options) {
            calls.push({ wallet, contractAddress, entrypoint, args, options });
            return {
              hash: `op-${wallet}-${entrypoint}`,
              level: 42,
              status: 'applied',
            };
          },
          async getContractEntrypoints(contractAddress) {
            if (contractAddress === marketAddress) {
              return entrypoints;
            }
            throw new Error('Http error response: (404)');
          },
          async getContractStorage() {
            return {
              wtf_token_address: missingTokenAddress,
              wtf_token_id: 0,
            };
          },
        }) satisfies TezosServiceLike,
    );

    expect(result.success).toBe(false);
    expect(result.results[0]?.error).toContain(
      `payment token ${missingTokenAddress} from ${marketAddress} storage is not available`,
    );
    expect(calls).toEqual([]);
  });

  it('derives WTF in-app market purchase funding from listing price and quantity', async () => {
    const calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
      options?: TezosCallOptions;
    }> = [];
    const marketAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
    const tokenAddress = 'KT1LjmAdYQCLBjwv4S2oFkEzyHVkomAf5MrW';
    const entrypoints: AbiEntrypoint[] = [
      {
        name: 'purchase',
        args: [],
        sampleJsArgs: [
          {
            listing_id: 0,
            purchase_ref: 'kiln-e2e',
            quantity: 2,
          },
        ],
      },
      { name: 'transfer', args: [], sampleJsArgs: [] },
      { name: 'update_operators', args: [], sampleJsArgs: [] },
    ];

    const result = await runContractE2E(
      {
        contractAddress: marketAddress,
        contracts: [
          {
            id: 'market',
            address: marketAddress,
            entrypoints: ['purchase'],
          },
        ],
        steps: [
          {
            label: 'Ernie buys pet medicine',
            wallet: 'B',
            targetContractId: 'market',
            targetContractAddress: marketAddress,
            entrypoint: 'purchase',
            args: [1],
            generatedArgs: true,
            assertions: [],
            expectFailure: false,
          },
        ],
      },
      (wallet) =>
        new FakeTezosService(wallet, calls, entrypoints, {
          wtf_token_address: tokenAddress,
          wtf_token_id: 0,
          listings: new Map([
            [
              0,
              {
                price_wtf_units: 2_500_000_000,
                listing_id: 0,
                active: true,
              },
            ],
          ]),
        }),
    );

    expect(result.success).toBe(true);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        wallet: 'A',
        contractAddress: tokenAddress,
        entrypoint: 'mint_tokens',
        args: [
          [
            {
              token_id: 0,
              to_: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
              amount: 5_000_000_000,
            },
          ],
        ],
      }),
    );
    expect(calls.at(-1)).toEqual(
      expect.objectContaining({
        wallet: 'B',
        contractAddress: marketAddress,
        entrypoint: 'purchase',
        args: [
          {
            listing_id: 0,
            purchase_ref: 'kiln-e2e',
            quantity: 2,
          },
        ],
        options: { amountMutez: undefined, useMethodsObject: true },
      }),
    );
  });
});
