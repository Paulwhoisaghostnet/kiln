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

async function readMapValue(mapLike: unknown, key: unknown): Promise<unknown> {
  if (!mapLike) {
    return undefined;
  }
  const stringKey = typeof key === 'string' ? key : String(key);
  const candidateKeys =
    typeof key === 'string' && /^(tz1|tz2|tz3|KT1)/.test(key)
      ? [
          key,
          { 0: key, 1: 0 },
          { 0: key, 1: '0' },
          [key, 0],
          { owner: key, token_id: 0 },
          { address: key, token_id: 0 },
        ]
      : [key];
  if (mapLike instanceof Map) {
    for (const candidate of candidateKeys) {
      const value = mapLike.get(candidate) ?? mapLike.get(JSON.stringify(candidate));
      if (value !== undefined) {
        return value;
      }
    }
    return mapLike.get(stringKey);
  }
  if (isRecord(mapLike)) {
    const getter = mapLike.get;
    if (typeof getter === 'function') {
      let lastError: unknown;
      for (const candidate of candidateKeys) {
        try {
          const value = await (getter as (input: unknown) => Promise<unknown> | unknown).call(
            mapLike,
            candidate,
          );
          if (value !== undefined) {
            return value;
          }
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) {
        throw lastError;
      }
      return undefined;
    }
    return mapLike[stringKey];
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

type E2EStep = E2ERunPayload['steps'][number];
type E2EAssertion = E2EStep['assertions'][number];

type AssertionEvidence = {
  id?: string;
  kind: E2EAssertion['kind'];
  status: 'passed' | 'failed';
  passed: boolean;
  contractAddress: string;
  target?: string;
  path?: Array<string | number> | string;
  bigMap?: Array<string | number> | string;
  key?: unknown;
  expected?: unknown;
  actual?: unknown;
  error?: string;
};

function normalizePath(path: E2EAssertion['path'] | E2EAssertion['bigMap']): Array<string | number> {
  if (Array.isArray(path)) {
    return path;
  }
  if (typeof path === 'string') {
    return path.split('.').map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function valueAtPath(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const segment of path) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (current instanceof Map) {
      current = current.get(segment) ?? current.get(String(segment));
      continue;
    }
    if (isRecord(current)) {
      current = current[String(segment)];
      continue;
    }
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function normalizeComparable(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value.toString();
  }
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (Array.isArray(value)) {
    return value.map(normalizeComparable);
  }
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = normalizeComparable(item);
    }
    return output;
  }
  return value;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  const normalizedActual = normalizeComparable(actual);
  const normalizedExpected = normalizeComparable(expected);
  return JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected);
}

function expectedForAssertion(assertion: E2EAssertion): unknown {
  if (assertion.kind === 'balance' && assertion.expectedMutez !== undefined) {
    return String(assertion.expectedMutez);
  }
  if (assertion.expected !== undefined) {
    return assertion.expected;
  }
  return assertion.equals;
}

function resolveAssertionTarget(input: {
  assertion: E2EAssertion;
  defaultTargetAddress: string;
  manifest: Map<string, { address: string }>;
}): { address: string; target?: string } {
  const target =
    input.assertion.targetContractAddress ??
    input.assertion.target ??
    input.assertion.contractId ??
    input.assertion.targetContractId;

  if (!target) {
    return { address: input.defaultTargetAddress };
  }
  if (kt1Pattern.test(target)) {
    return { address: target, target };
  }
  const manifestAddress = input.manifest.get(target)?.address;
  if (!manifestAddress) {
    throw new Error(`Assertion target '${target}' is not a known contract id or KT1 address.`);
  }
  return { address: manifestAddress, target };
}

async function evaluateAssertion(input: {
  assertion: E2EAssertion;
  defaultTargetAddress: string;
  manifest: Map<string, { address: string }>;
  tezosService: TezosServiceLike;
}): Promise<AssertionEvidence> {
  const { address, target } = resolveAssertionTarget({
    assertion: input.assertion,
    defaultTargetAddress: input.defaultTargetAddress,
    manifest: input.manifest,
  });
  const expected = expectedForAssertion(input.assertion);
  try {
    let actual: unknown;
    if (input.assertion.kind === 'balance') {
      if (!input.tezosService.getContractBalanceMutez) {
        throw new Error('Contract balance reader is unavailable.');
      }
      actual = await input.tezosService.getContractBalanceMutez(address);
    } else if (input.assertion.kind === 'storage') {
      if (!input.tezosService.getContractStorage) {
        throw new Error('Contract storage reader is unavailable.');
      }
      const storage = await input.tezosService.getContractStorage(address);
      const path = normalizePath(input.assertion.path);
      actual = path.length > 0 ? valueAtPath(storage, path) : storage;
    } else {
      if (!input.tezosService.getContractStorage) {
        throw new Error('Contract big-map reader is unavailable.');
      }
      const storage = await input.tezosService.getContractStorage(address);
      const bigMapPath = normalizePath(input.assertion.bigMap ?? input.assertion.path);
      const bigMap = valueAtPath(storage, bigMapPath);
      actual = await readMapValue(bigMap, input.assertion.key);
    }

    const passed = valuesEqual(actual, expected);
    return {
      id: input.assertion.id,
      kind: input.assertion.kind,
      status: passed ? 'passed' : 'failed',
      passed,
      contractAddress: address,
      target,
      path: input.assertion.path,
      bigMap: input.assertion.bigMap,
      key: input.assertion.key,
      expected: normalizeComparable(expected),
      actual: normalizeComparable(actual),
      error: passed ? undefined : 'Assertion value did not match expected value.',
    };
  } catch (error) {
    return {
      id: input.assertion.id,
      kind: input.assertion.kind,
      status: 'failed',
      passed: false,
      contractAddress: address,
      target,
      path: input.assertion.path,
      bigMap: input.assertion.bigMap,
      key: input.assertion.key,
      expected: normalizeComparable(expected),
      error: asMessage(error),
    };
  }
}

async function evaluateAssertions(input: {
  assertions: E2EAssertion[];
  defaultTargetAddress: string;
  manifest: Map<string, { address: string }>;
  tezosService: TezosServiceLike;
}): Promise<AssertionEvidence[]> {
  const evidence: AssertionEvidence[] = [];
  for (const assertion of input.assertions) {
    evidence.push(await evaluateAssertion({ ...input, assertion }));
  }
  return evidence;
}

function buildAssertionSummary(results: Array<{ assertions?: AssertionEvidence[] }>): {
  ok: boolean;
  storage: boolean;
  balance: boolean;
  big_map: boolean;
  passedKinds: Array<'storage' | 'balance' | 'big_map'>;
  missingKinds: Array<'storage' | 'balance' | 'big_map'>;
  assertionCount: number;
} {
  const required: Array<'storage' | 'balance' | 'big_map'> = ['storage', 'balance', 'big_map'];
  const assertions = results.flatMap((result) => result.assertions ?? []);
  const passedKinds = new Set(
    assertions
      .filter((assertion) => assertion.passed)
      .map((assertion) => assertion.kind),
  );
  const missingKinds = required.filter((kind) => !passedKinds.has(kind));
  return {
    ok: missingKinds.length === 0,
    storage: passedKinds.has('storage'),
    balance: passedKinds.has('balance'),
    big_map: passedKinds.has('big_map'),
    passedKinds: required.filter((kind) => passedKinds.has(kind)),
    missingKinds,
    assertionCount: assertions.length,
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
    assertions?: AssertionEvidence[];
  }>;
  assertionSummary: ReturnType<typeof buildAssertionSummary>;
}> {
  const contracts = payload.contracts ?? [];
  const results: Array<{
    label: string;
    wallet: WalletType;
    contractAddress: string;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number | null;
    error?: string;
    assertions?: AssertionEvidence[];
  }> = [];
  const contractManifestById = new Map(
    contracts.map((contract) => [contract.id, contract]),
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
      const assertions = await evaluateAssertions({
        assertions: step.assertions,
        defaultTargetAddress: targetAddress,
        manifest: contractManifestById,
        tezosService,
      });
      const failedAssertion = assertions.find((assertion) => !assertion.passed);
      results.push({
        label,
        wallet: step.wallet,
        contractAddress: targetAddress,
        entrypoint: step.entrypoint,
        status: failedAssertion ? 'failed' : 'passed',
        hash: result.hash,
        level: result.level,
        assertions: assertions.length > 0 ? assertions : undefined,
        error: failedAssertion
          ? `Assertion ${failedAssertion.id ?? failedAssertion.kind} failed: ${
              failedAssertion.error ?? 'value mismatch'
            }`
          : undefined,
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
    contracts.length > 0
      ? buildEntrypointCoverage({
          contracts: contracts.map((contract) => ({
            id: contract.id,
            address: contract.address,
            entrypoints: contract.entrypoints,
          })),
          steps: payload.steps,
        })
      : undefined;
  const assertionSummary = buildAssertionSummary(results);

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
    assertionSummary,
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
