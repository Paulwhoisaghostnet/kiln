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
import { injectKilnTokenArtifacts } from '../../lib/kiln-injector.js';
import { readMichelsonEntrypoints } from '../../lib/taquito-michelson.js';
import type { WalletType } from '../../lib/types.js';
import type { TezosCallOptions, TezosServiceLike } from '../../lib/tezos-service.js';
import {
  buildEntrypointCoverage,
  type EntrypointCoverageReport,
} from '../../lib/workflow-coverage.js';
import { asMessage } from '../http.js';

export class DeploymentBlockedError extends Error {}
export class ContractExecutionError extends Error {}

export interface ContractRuntimeDependencies {
  env: AppEnv;
  clearanceStore: DeploymentClearanceStore;
  createTezosService: (wallet: WalletType) => TezosServiceLike;
  allowDirectDeploy?: boolean;
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
  const injectedArtifacts = injectKilnTokenArtifacts(
    { code: payload.code, initialStorage: payload.initialStorage },
    dependencies.env,
  );
  const injectedCode = injectedArtifacts.code;
  const injectedInitialStorage = injectedArtifacts.initialStorage;
  const codeHash = hashContractCode(injectedCode);

  if (dependencies.env.KILN_REQUIRE_SIM_CLEARANCE && !dependencies.allowDirectDeploy) {
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
    injectedInitialStorage,
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
  let result: Awaited<ReturnType<TezosServiceLike['callContract']>>;
  try {
    result = await tezosService.callContract(
      payload.contractAddress,
      payload.entrypoint,
      payload.args,
      { amountMutez: payload.amountMutez },
    );
  } catch (error) {
    throw new ContractExecutionError(
      await describeContractCallFailure({
        entrypoint: payload.entrypoint,
        args: payload.args,
        contractAddress: payload.contractAddress,
        tezosService,
        error,
      }),
    );
  }

  return {
    success: true,
    ...result,
  };
}

const kt1Pattern = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface Kt1Candidate {
  address: string;
  path: string[];
}

function collectKt1Candidates(
  value: unknown,
  path: string[] = [],
  candidates: Kt1Candidate[] = [],
): Kt1Candidate[] {
  if (typeof value === 'string') {
    if (kt1Pattern.test(value)) {
      candidates.push({ address: value, path });
    }
    return candidates;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectKt1Candidates(item, [...path, String(index)], candidates);
    });
    return candidates;
  }
  if (isRecord(value)) {
    for (const [field, item] of Object.entries(value)) {
      collectKt1Candidates(item, [...path, field], candidates);
    }
  }
  return candidates;
}

function scoreKt1Candidate(candidate: Kt1Candidate): number {
  const path = candidate.path.join('_').toLowerCase();
  let score = 0;
  if (/currency|payment|wtf|price/.test(path)) {
    score += 8;
  }
  if (/token|fa2/.test(path)) {
    score += 4;
  }
  if (/address|contract/.test(path)) {
    score += 2;
  }
  if (/asset|nft|collection/.test(path)) {
    score -= 4;
  }
  return score;
}

function findBestKt1(value: unknown): string | undefined {
  const candidates = collectKt1Candidates(value);
  return candidates
    .sort((left, right) => scoreKt1Candidate(right) - scoreKt1Candidate(left))[0]
    ?.address;
}

function coerceNumeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : undefined;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function findNumericField(value: unknown, fieldNames: string[]): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumericField(item, fieldNames);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  for (const fieldName of fieldNames) {
    const fieldValue = value[fieldName];
    const numeric = coerceNumeric(fieldValue);
    if (numeric !== undefined) {
      return numeric;
    }
  }
  for (const nested of Object.values(value)) {
    const found = findNumericField(nested, fieldNames);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findFieldByName(value: unknown, fieldNames: string[]): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFieldByName(item, fieldNames);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const normalized = new Set(fieldNames.map((fieldName) => fieldName.toLowerCase()));
  for (const [field, fieldValue] of Object.entries(value)) {
    if (normalized.has(field.toLowerCase())) {
      return fieldValue;
    }
  }
  for (const nested of Object.values(value)) {
    const found = findFieldByName(nested, fieldNames);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function stepLooksGenerated(step: E2ERunPayload['steps'][number]): boolean {
  if (step.generatedArgs) {
    return true;
  }
  if (step.args.length === 0) {
    return true;
  }
  return (
    step.args.length === 1 &&
    typeof step.args[0] === 'number' &&
    step.args[0] === 1
  );
}

async function resolveStepCall(
  step: E2ERunPayload['steps'][number],
  targetAddress: string,
  tezosService: TezosServiceLike,
): Promise<{
  args: unknown[];
  options: TezosCallOptions;
}> {
  const options: TezosCallOptions = { amountMutez: step.amountMutez };
  if (!stepLooksGenerated(step) || !tezosService.getContractEntrypoints) {
    return { args: step.args, options };
  }

  const entrypoints = await tezosService.getContractEntrypoints(targetAddress);
  const entrypoint = entrypoints.find((candidate) => candidate.name === step.entrypoint);
  if (!entrypoint?.sampleJsArgs || entrypoint.sampleJsArgs.length === 0) {
    return { args: step.args, options };
  }
  return {
    args: entrypoint.sampleJsArgs,
    options: {
      ...options,
      useMethodsObject: true,
    },
  };
}

function explicitPurchaseAmountUnits(args: unknown[]): number | undefined {
  const [firstArg] = args;
  return findNumericField(firstArg, [
    'amount_wtf_units',
    'amount_wtf',
    'amount',
    'price_wtf',
  ]);
}

function looksLikeTokenPurchase(entrypoint: string, args: unknown[]): boolean {
  const normalized = entrypoint.toLowerCase();
  return (
    (normalized === 'purchase' || normalized === 'buy') &&
    (explicitPurchaseAmountUnits(args) !== undefined ||
      findNumericField(args, ['listing_id', 'quantity']) !== undefined)
  );
}

function entrypointNames(entrypoints: Awaited<ReturnType<NonNullable<TezosServiceLike['getContractEntrypoints']>>>): Set<string> {
  return new Set(entrypoints.map((entrypoint) => entrypoint.name));
}

async function assertPaymentTokenIsUsable(input: {
  tokenAddress: string;
  targetAddress: string;
  tezosService: TezosServiceLike;
}): Promise<void> {
  if (!input.tezosService.getContractEntrypoints) {
    return;
  }
  let tokenEntrypoints: Awaited<ReturnType<NonNullable<TezosServiceLike['getContractEntrypoints']>>>;
  try {
    tokenEntrypoints = await input.tezosService.getContractEntrypoints(input.tokenAddress);
  } catch (error) {
    throw new Error(
      `Purchase setup failed: payment token ${input.tokenAddress} from ${input.targetAddress} storage is not available on this network (${asMessage(error)}). Deploy through Kiln validation or direct-deploy prep so external token addresses are replaced with Shadownet dummy FA2 tokens.`,
    );
  }

  const names = entrypointNames(tokenEntrypoints);
  if (!names.has('transfer')) {
    throw new Error(
      `Purchase setup failed: payment token ${input.tokenAddress} does not expose FA2 transfer. This is an external dependency mismatch, not a Bert/Ernie parser failure.`,
    );
  }
  if (!names.has('update_operators')) {
    throw new Error(
      `Purchase setup failed: payment token ${input.tokenAddress} does not expose FA2 update_operators, so Bert/Ernie cannot authorize ${input.targetAddress} to spend test tokens.`,
    );
  }
}

async function describePurchaseDependencyFailure(input: {
  contractAddress: string;
  tezosService: TezosServiceLike;
  error: unknown;
}): Promise<string | null> {
  if (!input.tezosService.getContractStorage) {
    return null;
  }
  let storage: unknown;
  try {
    storage = await input.tezosService.getContractStorage(input.contractAddress);
  } catch {
    return null;
  }
  const tokenAddress = findBestKt1(storage);
  if (!tokenAddress) {
    return null;
  }
  if (!input.tezosService.getContractEntrypoints) {
    return `Purchase failed after reading payment token ${tokenAddress} from contract storage: ${asMessage(input.error)}`;
  }
  try {
    const names = entrypointNames(await input.tezosService.getContractEntrypoints(tokenAddress));
    if (!names.has('transfer')) {
      return `Purchase failed because payment token ${tokenAddress} from contract storage does not expose FA2 transfer. This is a Shadownet dependency/storage mismatch, not a Kiln argument parser failure.`;
    }
  } catch (dependencyError) {
    return `Purchase failed because payment token ${tokenAddress} from contract storage is not available on this network (${asMessage(dependencyError)}). Deploy through Kiln validation or direct-deploy prep so token references point at Shadownet dummy FA2 contracts.`;
  }
  return null;
}

async function describeContractCallFailure(input: {
  entrypoint: string;
  args: unknown[];
  contractAddress: string;
  tezosService: TezosServiceLike;
  error: unknown;
}): Promise<string> {
  const message = asMessage(input.error);
  if (
    (input.entrypoint.toLowerCase() === 'purchase' ||
      input.entrypoint.toLowerCase() === 'buy') &&
    /FA2_TRANSFER_ENTRYPOINT_MISSING|Http error response:\s*\(404\)|404/i.test(message)
  ) {
    const dependencyMessage = await describePurchaseDependencyFailure({
      contractAddress: input.contractAddress,
      tezosService: input.tezosService,
      error: input.error,
    });
    if (dependencyMessage) {
      return dependencyMessage;
    }
  }
  return message;
}

async function readMapValue(mapLike: unknown, key: number): Promise<unknown> {
  if (!mapLike) {
    return undefined;
  }
  if (mapLike instanceof Map) {
    return mapLike.get(key) ?? mapLike.get(String(key));
  }
  if (isRecord(mapLike)) {
    const getter = mapLike.get;
    if (typeof getter === 'function') {
      return await (getter as (input: number | string) => Promise<unknown> | unknown)(key);
    }
    return mapLike[String(key)] ?? mapLike[key];
  }
  return undefined;
}

async function resolvePurchaseAmountUnits(input: {
  args: unknown[];
  storage: unknown;
}): Promise<number | undefined> {
  const explicit = explicitPurchaseAmountUnits(input.args);
  if (explicit !== undefined) {
    return explicit;
  }

  const listingId = findNumericField(input.args, ['listing_id']);
  if (listingId === undefined) {
    return undefined;
  }
  const quantity = Math.max(findNumericField(input.args, ['quantity']) ?? 1, 1);
  const listings = findFieldByName(input.storage, ['listings', 'listing']);
  const listing = await readMapValue(listings, listingId);
  const price = findNumericField(listing, [
    'price_wtf_units',
    'amount_wtf_units',
    'price',
  ]);
  return price === undefined ? undefined : price * quantity;
}

async function prepareTokenPurchaseResources(input: {
  step: E2ERunPayload['steps'][number];
  args: unknown[];
  targetAddress: string;
  tezosService: TezosServiceLike;
  createTezosService: (wallet: WalletType) => TezosServiceLike;
}): Promise<void> {
  if (
    input.step.expectFailure ||
    !looksLikeTokenPurchase(input.step.entrypoint, input.args) ||
    !input.tezosService.getContractStorage
  ) {
    return;
  }

  const storage = await input.tezosService.getContractStorage(input.targetAddress);
  const tokenAddress = findBestKt1(storage);
  if (!tokenAddress) {
    return;
  }
  await assertPaymentTokenIsUsable({
    tokenAddress,
    targetAddress: input.targetAddress,
    tezosService: input.tezosService,
  });
  const tokenId = findNumericField(storage, ['wtf_token_id', 'currency_token_id', 'token_id']) ?? 0;
  const amount = Math.max(
    (await resolvePurchaseAmountUnits({ args: input.args, storage })) ?? 1,
    1,
  );
  const buyerAddress = await input.tezosService.getAddress();

  try {
    await input.createTezosService('A').callContract(
      tokenAddress,
      'mint_tokens',
      [[{ token_id: tokenId, to_: buyerAddress, amount }]],
      { useMethodsObject: true },
    );
  } catch {
    // Some real tokens are not mintable by Bert. The purchase call below will
    // still prove whether the buyer already has enough balance.
  }

  await input.tezosService.callContract(
    tokenAddress,
    'update_operators',
    [
      [
        {
          add_operator: {
            owner: buyerAddress,
            operator: input.targetAddress,
            token_id: tokenId,
          },
        },
      ],
    ],
    { useMethodsObject: true },
  );
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
      const call = await resolveStepCall(step, targetAddress, tezosService);
      await prepareTokenPurchaseResources({
        step,
        args: call.args,
        targetAddress,
        tezosService,
        createTezosService,
      });
      const result = await tezosService.callContract(
        targetAddress,
        step.entrypoint,
        call.args,
        call.options,
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
