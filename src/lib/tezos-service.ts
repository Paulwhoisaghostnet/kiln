import { TezosToolkit } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import { getEnv, getWalletSecret, type AppEnv } from './env.js';
import type { ContractCallResult, WalletType } from './types.js';

const SAFE_ORIGINATION_GAS_LIMIT = 600_000;
const SAFE_ORIGINATION_STORAGE_LIMIT = 60_000;
const MIN_ORIGINATION_FEE_MUTEZ = 20_000;
const DEFAULT_ORIGINATION_FEE_MUTEZ = 220_000;
const MAX_ORIGINATION_ATTEMPTS = 4;

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

type OriginationParams = {
  code: string;
  init: string;
  fee: number;
  gasLimit: number;
  storageLimit: number;
};

export interface OriginationValidationResult {
  gasLimit: number;
  storageLimit: number;
  suggestedFeeMutez: number;
  minimalFeeMutez: number;
}

export interface TezosServiceLike {
  getAddress(): Promise<string>;
  getBalance(): Promise<number>;
  validateOrigination(
    code: string,
    initialStorage: string,
  ): Promise<OriginationValidationResult>;
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

  async validateOrigination(
    code: string,
    initialStorage: string,
  ): Promise<OriginationValidationResult> {
    await this.ensureExpectedChainId();

    const estimateClient = (
      this.tezos as unknown as {
        estimate?: {
          originate?: (params: { code: string; init: string }) => Promise<{
            gasLimit?: number;
            storageLimit?: number;
            minimalFeeMutez?: number;
            suggestedFeeMutez?: number;
          }>;
        };
      }
    ).estimate;

    if (!estimateClient?.originate) {
      throw new Error('Taquito origination estimator is unavailable.');
    }

    const [estimate, constants] = await Promise.all([
      estimateClient.originate({ code, init: initialStorage }),
      this.tezos.rpc.getConstants(),
    ]);

    const hardGasLimit = Number(
      (constants as unknown as Record<string, string>)
        .hard_gas_limit_per_operation ?? SAFE_ORIGINATION_GAS_LIMIT,
    );
    const hardStorageLimit = Number(
      (constants as unknown as Record<string, string>)
        .hard_storage_limit_per_operation ?? SAFE_ORIGINATION_STORAGE_LIMIT,
    );

    const gasLimit = Math.max(
      1_000,
      Math.min(
        Math.ceil((estimate.gasLimit ?? SAFE_ORIGINATION_GAS_LIMIT) * 1.15),
        Math.min(hardGasLimit, SAFE_ORIGINATION_GAS_LIMIT),
      ),
    );

    const storageLimit = Math.max(
      0,
      Math.min(
        Math.ceil((estimate.storageLimit ?? SAFE_ORIGINATION_STORAGE_LIMIT) * 1.15),
        Math.min(hardStorageLimit, SAFE_ORIGINATION_STORAGE_LIMIT),
      ),
    );

    return {
      gasLimit,
      storageLimit,
      suggestedFeeMutez: Number(estimate.suggestedFeeMutez ?? 0),
      minimalFeeMutez: Number(estimate.minimalFeeMutez ?? 0),
    };
  }

  private extractRpcErrorIds(error: unknown): string[] {
    const ids = new Set<string>();

    const collect = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      const record = node as Record<string, unknown>;
      if (typeof record.id === 'string') {
        ids.add(record.id);
      }

      for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            collect(item);
          }
        } else if (value && typeof value === 'object') {
          collect(value);
        }
      }
    };

    const maybeRecord = error as Record<string, unknown> | undefined;
    collect(maybeRecord);

    const body = maybeRecord?.body;
    if (typeof body === 'string') {
      try {
        collect(JSON.parse(body));
      } catch {
        // Ignore parse issues and rely on other error fields.
      }
    }

    return Array.from(ids);
  }

  private async buildOriginationParams(
    code: string,
    initialStorage: string,
  ): Promise<OriginationParams> {
    const fallback: OriginationParams = {
      code,
      init: initialStorage,
      fee: DEFAULT_ORIGINATION_FEE_MUTEZ,
      gasLimit: SAFE_ORIGINATION_GAS_LIMIT,
      storageLimit: SAFE_ORIGINATION_STORAGE_LIMIT,
    };

    try {
      const estimateClient = (
        this.tezos as unknown as {
          estimate?: {
            originate?: (params: { code: string; init: string }) => Promise<{
              gasLimit?: number;
              storageLimit?: number;
              minimalFeeMutez?: number;
              suggestedFeeMutez?: number;
            }>;
          };
        }
      ).estimate;

      if (!estimateClient?.originate) {
        return fallback;
      }

      const [estimate, constants] = await Promise.all([
        estimateClient.originate({ code, init: initialStorage }),
        this.tezos.rpc.getConstants(),
      ]);

      const hardGasLimit = Number(
        (constants as unknown as Record<string, string>)
          .hard_gas_limit_per_operation ?? SAFE_ORIGINATION_GAS_LIMIT,
      );
      const hardStorageLimit = Number(
        (constants as unknown as Record<string, string>)
          .hard_storage_limit_per_operation ?? SAFE_ORIGINATION_STORAGE_LIMIT,
      );

      const gasLimit = Math.max(
        1_000,
        Math.min(
          Math.ceil((estimate.gasLimit ?? SAFE_ORIGINATION_GAS_LIMIT) * 1.15),
          Math.min(hardGasLimit, SAFE_ORIGINATION_GAS_LIMIT),
        ),
      );

      const storageLimit = Math.max(
        0,
        Math.min(
          Math.ceil((estimate.storageLimit ?? SAFE_ORIGINATION_STORAGE_LIMIT) * 1.15),
          Math.min(hardStorageLimit, SAFE_ORIGINATION_STORAGE_LIMIT),
        ),
      );

      const suggestedFeeMutez = Number(estimate.suggestedFeeMutez ?? 0);
      const minimalFeeMutez = Number(estimate.minimalFeeMutez ?? 0);

      const fee = Math.max(
        MIN_ORIGINATION_FEE_MUTEZ,
        Math.ceil(suggestedFeeMutez * 1.5),
        Math.ceil(minimalFeeMutez * 2),
        Math.ceil(gasLimit * 0.2),
      );

      return {
        code,
        init: initialStorage,
        fee,
        gasLimit,
        storageLimit,
      };
    } catch (error) {
      console.warn(
        'Failed to estimate origination; using safe fallback params.',
        error,
      );
      return fallback;
    }
  }

  async originateContract(code: string, initialStorage: string): Promise<string> {
    await this.ensureExpectedChainId();

    let params = await this.buildOriginationParams(code, initialStorage);

    for (let attempt = 1; attempt <= MAX_ORIGINATION_ATTEMPTS; attempt += 1) {
      try {
        console.log(
          `Originating contract (attempt ${attempt}/${MAX_ORIGINATION_ATTEMPTS}) with fee=${params.fee}, gas=${params.gasLimit}, storage=${params.storageLimit}...`,
        );

        const originationOp = await this.tezos.contract.originate(params);
        console.log(`Waiting for confirmation of origination...`);
        const contract = await originationOp.contract();
        console.log(`Contract originated at: ${contract.address}`);
        return contract.address;
      } catch (error) {
        const ids = this.extractRpcErrorIds(error);
        const lastAttempt = attempt === MAX_ORIGINATION_ATTEMPTS;

        if (!lastAttempt && ids.some((id) => id.includes('fees_too_low'))) {
          params = {
            ...params,
            fee: Math.ceil(params.fee * 1.75) + 5_000,
          };
          continue;
        }

        if (
          !lastAttempt &&
          ids.some(
            (id) =>
              id.includes('gas_limit_too_high') || id.includes('gas_exhausted.block'),
          )
        ) {
          const reducedGasLimit = Math.max(
            1_000,
            Math.min(
              SAFE_ORIGINATION_GAS_LIMIT,
              Math.floor(params.gasLimit * 0.85),
            ),
          );
          params = {
            ...params,
            gasLimit: reducedGasLimit,
            fee: Math.max(
              params.fee,
              Math.ceil(reducedGasLimit * 0.25) + MIN_ORIGINATION_FEE_MUTEZ,
            ),
          };
          continue;
        }

        console.error('Error originating contract:', error);
        throw error;
      }
    }

    throw new Error('Origination failed after all retry attempts.');
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
