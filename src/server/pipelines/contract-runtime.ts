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
import { readMichelsonEntrypoints } from '../../lib/taquito-michelson.js';
import type { WalletType } from '../../lib/types.js';
import type { TezosServiceLike } from '../../lib/tezos-service.js';
import {
  buildEntrypointCoverage,
  type EntrypointCoverageReport,
} from '../../lib/workflow-coverage.js';
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
  entrypoints: ReturnType<typeof readMichelsonEntrypoints>;
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
    entrypoints: readMichelsonEntrypoints(payload.code),
  };
}

export async function executeContractCall(
  payload: ExecutePayload,
  createTezosService: (wallet: WalletType) => TezosServiceLike,
): Promise<{
  success: true;
  hash: string;
  level: number | null;
  status?: string;
}> {
  const tezosService = createTezosService(payload.wallet);
  const result = await tezosService.callContract(
    payload.contractAddress,
    payload.entrypoint,
    payload.args,
    { amountMutez: payload.amountMutez },
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
  coverage?: EntrypointCoverageReport;
  results: Array<{
    label: string;
    wallet: WalletType;
    contractAddress: string;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number | null;
    error?: string;
  }>;
}> {
  const results: Array<{
    label: string;
    wallet: WalletType;
    contractAddress: string;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number | null;
    error?: string;
  }> = [];
  const contractManifestById = new Map(
    payload.contracts.map((contract) => [contract.id, contract]),
  );

  for (const [index, step] of payload.steps.entries()) {
    const label = step.label?.trim() || `Step ${index + 1}`;
    const targetAddress =
      step.targetContractAddress ??
      (step.targetContractId
        ? contractManifestById.get(step.targetContractId)?.address
        : undefined) ??
      payload.contractAddress;
    if (!targetAddress) {
      results.push({
        label,
        wallet: step.wallet,
        contractAddress: '',
        entrypoint: step.entrypoint,
        status: step.expectFailure ? 'passed' : 'failed',
        error: 'No contract target was provided for this E2E step.',
      });
      continue;
    }
    try {
      const tezosService = createTezosService(step.wallet);
      const result = await tezosService.callContract(
        targetAddress,
        step.entrypoint,
        step.args,
        { amountMutez: step.amountMutez },
      );
      if (step.expectFailure) {
        results.push({
          label,
          wallet: step.wallet,
          contractAddress: targetAddress,
          entrypoint: step.entrypoint,
          status: 'failed',
          hash: result.hash,
          level: result.level,
          error: 'Step succeeded but was marked expectFailure=true.',
        });
        continue;
      }
      if (step.assertions.length > 0) {
        results.push({
          label,
          wallet: step.wallet,
          contractAddress: targetAddress,
          entrypoint: step.entrypoint,
          status: 'failed',
          hash: result.hash,
          level: result.level,
          error:
            'Live Tezos E2E assertions are not implemented yet; no-stub policy blocks treating this step as passed.',
        });
        continue;
      }
      results.push({
        label,
        wallet: step.wallet,
        contractAddress: targetAddress,
        entrypoint: step.entrypoint,
        status: 'passed',
        hash: result.hash,
        level: result.level,
      });
    } catch (error) {
      results.push({
        label,
        wallet: step.wallet,
        contractAddress: targetAddress,
        entrypoint: step.entrypoint,
        status: step.expectFailure ? 'passed' : 'failed',
        error: asMessage(error),
      });
    }
  }

  const passed = results.filter((result) => result.status === 'passed').length;
  const failed = results.length - passed;
  const coverage =
    payload.contracts.length > 0
      ? buildEntrypointCoverage({
          contracts: payload.contracts.map((contract) => ({
            id: contract.id,
            address: contract.address,
            entrypoints: contract.entrypoints,
          })),
          steps: payload.steps,
        })
      : undefined;

  return {
    success: failed === 0 && (coverage?.passed ?? true),
    contractAddress: payload.contractAddress ?? '',
    summary: {
      total: results.length,
      passed,
      failed,
    },
    coverage,
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
