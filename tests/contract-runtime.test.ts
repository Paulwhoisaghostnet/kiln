import { describe, expect, it } from 'vitest';
import { runContractE2E } from '../src/server/pipelines/contract-runtime.js';
import type { ContractCallResult, WalletType } from '../src/lib/types.js';
import type { TezosServiceLike } from '../src/lib/tezos-service.js';

class FakeTezosService implements TezosServiceLike {
  constructor(
    private readonly wallet: WalletType,
    private readonly calls: Array<{
      wallet: WalletType;
      contractAddress: string;
      entrypoint: string;
      args: unknown[];
    }>,
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
  ): Promise<ContractCallResult> {
    this.calls.push({
      wallet: this.wallet,
      contractAddress,
      entrypoint,
      args,
    });
    return {
      hash: `op-${this.wallet}-${entrypoint}`,
      level: 42,
      status: 'applied',
    };
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
});
