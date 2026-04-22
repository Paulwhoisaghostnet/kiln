import type {
  E2ERunPayload,
  ExecutePayload,
  UploadPayload,
} from '../../lib/api-schemas.js';
import {
  DeploymentClearanceStore,
  hashContractCode,
} from '../../lib/contract-simulation.js';
import type { AppEnv } from '../../lib/env.js';
import { injectKilnTokens } from '../../lib/kiln-injector.js';
import { parseEntrypointsFromMichelson } from '../../lib/michelson-parser.js';
import type { WalletType } from '../../lib/types.js';
import type { TezosServiceLike } from '../../lib/tezos-service.js';
import { asMessage } from '../http.js';

export class DeploymentBlockedError extends Error {}

export interface ContractRuntimeDependencies {
  env: AppEnv;
  clearanceStore: DeploymentClearanceStore;
  createTezosService: (wallet: WalletType) => TezosServiceLike;
}

export async function deployContract(
  payload: UploadPayload,
  dependencies: ContractRuntimeDependencies,
): Promise<{
  success: true;
  contractAddress: string;
  injectedCode: string;
  codeHash: string;
  entrypoints: ReturnType<typeof parseEntrypointsFromMichelson>;
}> {
  const injectedCode = injectKilnTokens(payload.code, dependencies.env);
  const codeHash = hashContractCode(injectedCode);

  if (dependencies.env.KILN_REQUIRE_SIM_CLEARANCE) {
    const clearanceId = payload.clearanceId?.trim();
    if (!clearanceId) {
      throw new DeploymentBlockedError(
        'Deployment blocked: run /api/kiln/workflow/run and provide clearanceId.',
      );
    }

    const clearanceValidation = dependencies.clearanceStore.validate(
      clearanceId,
      codeHash,
    );
    if (!clearanceValidation.ok) {
      throw new DeploymentBlockedError(
        `Deployment blocked: ${clearanceValidation.reason ?? 'invalid clearance'}`,
      );
    }
  }

  const tezosService = dependencies.createTezosService(payload.wallet);
  const contractAddress = await tezosService.originateContract(
    injectedCode,
    payload.initialStorage,
  );

  return {
    success: true,
    contractAddress,
    injectedCode,
    codeHash,
    entrypoints: parseEntrypointsFromMichelson(payload.code),
  };
}

export async function executeContractCall(
  payload: ExecutePayload,
  createTezosService: (wallet: WalletType) => TezosServiceLike,
): Promise<{
  success: true;
  hash: string;
  level: number;
  status?: string;
}> {
  const tezosService = createTezosService(payload.wallet);
  const result = await tezosService.callContract(
    payload.contractAddress,
    payload.entrypoint,
    payload.args,
  );

  return {
    success: true,
    ...result,
  };
}

export async function runContractE2E(
  payload: E2ERunPayload,
  createTezosService: (wallet: WalletType) => TezosServiceLike,
): Promise<{
  success: boolean;
  contractAddress: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  results: Array<{
    label: string;
    wallet: WalletType;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number;
    error?: string;
  }>;
}> {
  const results: Array<{
    label: string;
    wallet: WalletType;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number;
    error?: string;
  }> = [];

  for (const [index, step] of payload.steps.entries()) {
    const label = step.label?.trim() || `Step ${index + 1}`;
    try {
      const tezosService = createTezosService(step.wallet);
      const result = await tezosService.callContract(
        payload.contractAddress,
        step.entrypoint,
        step.args,
      );
      results.push({
        label,
        wallet: step.wallet,
        entrypoint: step.entrypoint,
        status: 'passed',
        hash: result.hash,
        level: result.level,
      });
    } catch (error) {
      results.push({
        label,
        wallet: step.wallet,
        entrypoint: step.entrypoint,
        status: 'failed',
        error: asMessage(error),
      });
    }
  }

  const passed = results.filter((result) => result.status === 'passed').length;
  const failed = results.length - passed;

  return {
    success: failed === 0,
    contractAddress: payload.contractAddress,
    summary: {
      total: results.length,
      passed,
      failed,
    },
    results,
  };
}

export async function readWalletBalances(
  createTezosService: (wallet: WalletType) => TezosServiceLike,
): Promise<{
  walletA: { address: string; balance: number };
  walletB: { address: string; balance: number };
}> {
  const tezosServiceA = createTezosService('A');
  const tezosServiceB = createTezosService('B');

  const [addressA, balanceA, addressB, balanceB] = await Promise.all([
    tezosServiceA.getAddress(),
    tezosServiceA.getBalance(),
    tezosServiceB.getAddress(),
    tezosServiceB.getBalance(),
  ]);

  return {
    walletA: { address: addressA, balance: balanceA },
    walletB: { address: addressB, balance: balanceB },
  };
}
