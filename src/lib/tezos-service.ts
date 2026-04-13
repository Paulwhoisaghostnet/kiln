import { TezosToolkit } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import { getEnv, getWalletSecret, type AppEnv } from './env.js';
import type { ContractCallResult, WalletType } from './types.js';

interface SendableMethod {
  send(): Promise<{
    hash: string;
    status?: string;
    confirmation(confirmations: number): Promise<{
      block: {
        header: {
          level: number;
        };
      };
    }>;
  }>;
}

interface ContractWithMethods {
  methods: Record<string, (...args: unknown[]) => SendableMethod>;
}

export interface TezosServiceLike {
  getAddress(): Promise<string>;
  getBalance(): Promise<number>;
  originateContract(code: string, initialStorage: string): Promise<string>;
  callContract(
    contractAddress: string,
    entrypoint: string,
    args?: unknown[],
  ): Promise<ContractCallResult>;
}

export class TezosService implements TezosServiceLike {
  private tezos: TezosToolkit;
  private signer: InMemorySigner;
  private expectedChainId?: string;
  private activeChainId?: string;

  constructor(walletType: WalletType, env: AppEnv = getEnv()) {
    const rpcUrl = env.TEZOS_RPC_URL;
    this.tezos = new TezosToolkit(rpcUrl);
    this.expectedChainId = env.TEZOS_CHAIN_ID;

    const secretKey = getWalletSecret(env, walletType);

    this.signer = new InMemorySigner(secretKey);
    this.tezos.setProvider({ signer: this.signer });
  }

  private async ensureExpectedChainId(): Promise<void> {
    if (!this.expectedChainId) {
      return;
    }

    const chainId = this.activeChainId ?? (await this.tezos.rpc.getChainId());
    this.activeChainId = chainId;

    if (chainId !== this.expectedChainId) {
      throw new Error(
        `Chain mismatch detected. Expected ${this.expectedChainId}, got ${chainId}.`,
      );
    }
  }

  async getAddress(): Promise<string> {
    return await this.signer.publicKeyHash();
  }

  async getBalance(): Promise<number> {
    await this.ensureExpectedChainId();
    const address = await this.getAddress();
    const balance = await this.tezos.tz.getBalance(address);
    return balance.toNumber() / 1000000; // Convert mutez to tez
  }

  async originateContract(code: string, initialStorage: string): Promise<string> {
    try {
      await this.ensureExpectedChainId();
      console.log(`Originating contract...`);
      const originationOp = await this.tezos.contract.originate({
        code: code,
        init: initialStorage,
      });

      console.log(`Waiting for confirmation of origination...`);
      const contract = await originationOp.contract();
      console.log(`Contract originated at: ${contract.address}`);
      
      return contract.address;
    } catch (error) {
      console.error('Error originating contract:', error);
      throw error;
    }
  }

  async callContract(
    contractAddress: string,
    entrypoint: string,
    args: unknown[] = [],
  ): Promise<ContractCallResult> {
    try {
      await this.ensureExpectedChainId();
      console.log(`Calling contract ${contractAddress} at entrypoint ${entrypoint}...`);
      const contract = (await this.tezos.contract.at(
        contractAddress,
      )) as unknown as ContractWithMethods;
      
      const method = contract.methods[entrypoint];
      if (!method) {
        throw new Error(`Entrypoint ${entrypoint} not found on contract ${contractAddress}`);
      }

      const op = await method(...args).send();
      console.log(`Waiting for confirmation of call... Hash: ${op.hash}`);
      
      const result = await op.confirmation(1);
      console.log(`Call confirmed in block ${result.block.header.level}`);
      
      return {
        hash: op.hash,
        level: result.block.header.level,
        status: op.status
      };
    } catch (error) {
      console.error('Error calling contract:', error);
      throw error;
    }
  }
}
