import { BeaconEvent, NetworkType, SigningType } from '@airgap/beacon-dapp';
import { BeaconWallet } from '@taquito/beacon-wallet';
import { TezosToolkit } from '@taquito/taquito';
import { stringToBytes } from '@taquito/utils';
import {
  getDefaultNetworkId,
  getNetworkProfile,
  type KilnNetworkId,
} from './networks.js';

export type WalletConnectTarget = 'beacon' | 'temple' | 'kukai';

export interface ConnectedWalletState {
  address: string;
  networkName: string | null;
  networkId: KilnNetworkId;
  rpcUrl: string | null;
}

export interface ConnectedOriginationResult {
  hash: string;
  contractAddress: string;
  level: number | null;
}

export interface SignedKilnAuthChallenge {
  signature: string;
  publicKey: string;
  messageBytes: string;
}

/** Fixed address used in compiled storage as admin placeholder until deploy. */
export const BURN_PLACEHOLDER_ADDRESS = 'tz1burnburnburnburnburnburnburjAYjjX';
const ORIGINATION_CONFIRMATION_TIMEOUT_MS = 180_000;
const ORIGINATION_RPC_POLL_MS = 4_000;
const ORIGINATION_RECENT_BLOCK_DEPTH = 12;

type TezosWalletHandle = {
  toolkit: TezosToolkit;
  wallet: BeaconWallet;
  networkId: KilnNetworkId;
};

type BeaconAccountNetwork = {
  type?: string;
  name?: string;
  rpcUrl?: string;
};

type BeaconAccountLike = {
  address?: string;
  network?: BeaconAccountNetwork | null;
};

type WalletSessionListener = (session: ConnectedWalletState | null) => void;

let activeHandle: TezosWalletHandle | null = null;
let initializingFor: KilnNetworkId | null = null;
let initializing: Promise<TezosWalletHandle> | null = null;
const walletSessionListeners = new Set<WalletSessionListener>();

export function subscribeToShadownetWalletSession(
  listener: WalletSessionListener,
): () => void {
  walletSessionListeners.add(listener);
  return () => {
    walletSessionListeners.delete(listener);
  };
}

function emitWalletSession(session: ConnectedWalletState | null): void {
  for (const listener of walletSessionListeners) {
    listener(session);
  }
}

function connectedWalletStateFromAccount(
  account: BeaconAccountLike,
  networkId: KilnNetworkId,
): ConnectedWalletState | null {
  if (!account.address) {
    return null;
  }

  return {
    address: account.address,
    networkName: account.network?.name ?? null,
    networkId,
    rpcUrl: account.network?.rpcUrl ?? null,
  };
}

function resolveBeaconNetworkType(networkId: KilnNetworkId): NetworkType {
  const typedNetworkType = NetworkType as unknown as {
    MAINNET?: NetworkType;
    GHOSTNET?: NetworkType;
    SHADOWNET?: NetworkType;
    CUSTOM?: NetworkType;
  };

  switch (networkId) {
    case 'tezos-mainnet':
      return typedNetworkType.MAINNET ?? ('mainnet' as NetworkType);
    case 'tezos-ghostnet':
      return typedNetworkType.GHOSTNET ?? typedNetworkType.CUSTOM ?? ('custom' as NetworkType);
    case 'tezos-shadownet':
      return typedNetworkType.SHADOWNET ?? typedNetworkType.CUSTOM ?? ('custom' as NetworkType);
    default:
      return typedNetworkType.CUSTOM ?? ('custom' as NetworkType);
  }
}

function clearStaleBeaconStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('beacon:') || key.startsWith('beacon-sdk:'))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore restricted storage */
  }
}

function normalizedBeaconNetworkName(networkId: KilnNetworkId): string {
  const profile = getNetworkProfile(networkId);
  return profile.beaconNetworkName ?? profile.id.replace('tezos-', '');
}

function normalizedNetworkValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function normalizedRpcUrl(value: string | null): string | null {
  return value ? value.replace(/\/+$/, '').toLowerCase() : null;
}

function describeBeaconAccountNetwork(network: BeaconAccountNetwork | null): string {
  if (!network) {
    return 'an unknown network';
  }

  const parts = [
    normalizedNetworkValue(network.type),
    normalizedNetworkValue(network.name),
    normalizedRpcUrl(network.rpcUrl ?? null),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' / ') : 'an unknown network';
}

function beaconNetworkLooksLikeExpected(
  network: BeaconAccountNetwork,
  networkId: KilnNetworkId,
): boolean {
  const profile = getNetworkProfile(networkId);
  const expectedType = normalizedNetworkValue(resolveBeaconNetworkType(networkId));
  const expectedName = normalizedBeaconNetworkName(networkId).toLowerCase();
  const expectedRpcUrl = normalizedRpcUrl(profile.defaultRpcUrl);
  const actualType = normalizedNetworkValue(network.type);
  const actualName = normalizedNetworkValue(network.name);
  const actualRpcUrl = normalizedRpcUrl(network.rpcUrl ?? null);

  if (!actualType && !actualName && !actualRpcUrl) {
    return false;
  }

  if (actualType) {
    if (actualType === expectedType) {
      return true;
    }

    return (
      actualType === 'custom' &&
      profile.tier !== 'mainnet' &&
      (actualName?.includes(expectedName) || actualRpcUrl === expectedRpcUrl)
    );
  }

  if (actualName) {
    return profile.tier === 'mainnet'
      ? actualName === expectedName
      : actualName.includes(expectedName);
  }

  return actualRpcUrl === expectedRpcUrl;
}

async function assertNetworkRpcChainId(
  network: BeaconAccountNetwork,
  networkId: KilnNetworkId,
): Promise<void> {
  const profile = getNetworkProfile(networkId);
  const rpcUrl = network.rpcUrl;
  if (!profile.chainId || !rpcUrl) {
    return;
  }

  const verifier = new TezosToolkit(rpcUrl);
  const chainId = await verifier.rpc.getChainId();
  if (chainId !== profile.chainId) {
    throw new Error(
      `Wallet RPC chain mismatch: expected ${profile.chainId} (${profile.label}), got ${chainId}.`,
    );
  }
}

async function handleBeaconActiveAccountChange(
  handle: TezosWalletHandle,
  account: unknown,
): Promise<void> {
  if (activeHandle && activeHandle !== handle) {
    return;
  }

  if (!account || typeof account !== 'object') {
    emitWalletSession(null);
    return;
  }

  const accountLike = account as BeaconAccountLike;
  if (!accountLike.address) {
    emitWalletSession(null);
    return;
  }

  try {
    await assertExpectedNetwork(handle, handle.networkId);
  } catch {
    emitWalletSession(null);
    return;
  }

  emitWalletSession(connectedWalletStateFromAccount(accountLike, handle.networkId));
}

/**
 * Ensures a Beacon-backed TezosToolkit exists for the given network. If the
 * user changed networks since last call, the previous wallet is cleared and a
 * fresh one is built — Beacon's SDK keeps active-account state per-instance.
 */
async function ensureToolkit(networkId: KilnNetworkId): Promise<TezosWalletHandle> {
  if (activeHandle && activeHandle.networkId === networkId) {
    return activeHandle;
  }

  if (initializing && initializingFor === networkId) {
    return initializing;
  }

  initializingFor = networkId;
  initializing = (async () => {
    clearStaleBeaconStorage();

    if (activeHandle) {
      try {
        await activeHandle.wallet.clearActiveAccount();
      } catch {
        /* ignore */
      }
    }

    const profile = getNetworkProfile(networkId);
    if (profile.ecosystem !== 'tezos') {
      throw new Error(
        `Beacon wallet requires a Tezos network; got ${profile.ecosystem} network ${profile.id}.`,
      );
    }

    const wallet = new BeaconWallet({
      name: 'Tezos Kiln',
      iconUrl: '/favicon.ico',
      network: {
        type: resolveBeaconNetworkType(networkId) as never,
        name: normalizedBeaconNetworkName(networkId),
        rpcUrl: profile.defaultRpcUrl,
      },
    });

    const toolkit = new TezosToolkit(profile.defaultRpcUrl);
    toolkit.setWalletProvider(wallet);
    const handle = { toolkit, wallet, networkId };

    void wallet.client.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, (account) =>
      handleBeaconActiveAccountChange(handle, account),
    );

    activeHandle = handle;
    return activeHandle;
  })().finally(() => {
    initializing = null;
    initializingFor = null;
  });

  return initializing;
}

async function assertExpectedNetwork(
  handle: TezosWalletHandle,
  networkId: KilnNetworkId,
): Promise<void> {
  const profile = getNetworkProfile(networkId);

  const account = await handle.wallet.client.getActiveAccount();
  const accountNetwork = (account?.network ?? null) as BeaconAccountNetwork | null;

  if (!accountNetwork || !beaconNetworkLooksLikeExpected(accountNetwork, networkId)) {
    throw new Error(
      `Wallet connected to ${describeBeaconAccountNetwork(
        accountNetwork,
      )}. Please switch to ${profile.label} and reconnect.`,
    );
  }

  await assertNetworkRpcChainId(accountNetwork, networkId);

  if (!profile.chainId) {
    return;
  }

  const chainId = await handle.toolkit.rpc.getChainId();
  if (chainId !== profile.chainId) {
    throw new Error(
      `Kiln RPC chain mismatch: expected ${profile.chainId} (${profile.label}), got ${chainId}.`,
    );
  }
}

function findContractAddress(node: unknown): string | null {
  if (typeof node === 'string' && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(node)) {
    return node;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findContractAddress(item);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = findContractAddress(value);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findOriginatedContractAddress(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findOriginatedContractAddress(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!node || typeof node !== 'object') {
    return null;
  }

  const record = node as Record<string, unknown>;
  const originatedContracts = record.originated_contracts;
  if (Array.isArray(originatedContracts)) {
    const originatedAddress = findContractAddress(originatedContracts);
    if (originatedAddress) {
      return originatedAddress;
    }
  }

  return (
    findOriginatedContractAddress(record.operation_result) ??
    findOriginatedContractAddress(record.metadata) ??
    findOriginatedContractAddress(record.contents) ??
    null
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(label)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

async function readOperationResultsNode(operation: unknown): Promise<unknown> {
  const record = operation as Record<string, unknown>;
  const operationResults = record.operationResults;

  if (typeof operationResults === 'function') {
    try {
      return await (operationResults as () => Promise<unknown>).call(operation);
    } catch {
      return undefined;
    }
  }

  return operationResults;
}

async function findContractAddressFromWalletOperation(
  operation: unknown,
): Promise<string | null> {
  const record = operation as {
    contract?: () => Promise<{ address?: string } | null | undefined>;
  } & Record<string, unknown>;

  try {
    const contract = await record.contract?.();
    if (contract?.address) {
      return contract.address;
    }
  } catch {
    /* Fall through to confirmed operation metadata. */
  }

  const operationResults = await readOperationResultsNode(operation);
  return (
    findOriginatedContractAddress(operationResults) ??
    findOriginatedContractAddress(record.opResponse) ??
    findContractAddress(operationResults) ??
    findContractAddress(record.opResponse) ??
    null
  );
}

function findOperationInBlock(block: unknown, opHash: string): unknown | null {
  const record =
    block && typeof block === 'object'
      ? (block as Record<string, unknown>)
      : {};
  const groups = Array.isArray(record.operations) ? record.operations : [];

  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const operation of group) {
      if (
        operation &&
        typeof operation === 'object' &&
        (operation as Record<string, unknown>).hash === opHash
      ) {
        return operation;
      }
    }
  }

  return null;
}

function getBlockLevel(block: unknown): number | null {
  const record =
    block && typeof block === 'object'
      ? (block as Record<string, unknown>)
      : {};
  const header =
    record.header && typeof record.header === 'object'
      ? (record.header as Record<string, unknown>)
      : {};
  return typeof header.level === 'number' && Number.isFinite(header.level)
    ? header.level
    : null;
}

async function findOriginationInRecentBlocks(
  handle: TezosWalletHandle,
  opHash: string,
): Promise<{ contractAddress: string; level: number | null } | null> {
  for (let offset = 0; offset <= ORIGINATION_RECENT_BLOCK_DEPTH; offset += 1) {
    const blockId = offset === 0 ? 'head' : `head~${offset}`;
    let block: unknown;
    try {
      block = await handle.toolkit.rpc.getBlock({ block: blockId });
    } catch {
      continue;
    }

    const operation = findOperationInBlock(block, opHash);
    if (!operation) {
      continue;
    }

    const contractAddress =
      findOriginatedContractAddress(operation) ?? findContractAddress(operation);
    if (contractAddress) {
      return {
        contractAddress,
        level: getBlockLevel(block),
      };
    }
  }

  return null;
}

async function waitForRpcOrigination(
  handle: TezosWalletHandle,
  opHash: string,
  shouldStop = () => false,
): Promise<{ contractAddress: string; level: number | null }> {
  const deadline = Date.now() + ORIGINATION_CONFIRMATION_TIMEOUT_MS;

  while (!shouldStop() && Date.now() <= deadline) {
    const found = await findOriginationInRecentBlocks(handle, opHash);
    if (found) {
      return found;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(ORIGINATION_RPC_POLL_MS, remainingMs));
  }

  if (shouldStop()) {
    throw new Error(`RPC confirmation scan cancelled for origination ${opHash}.`);
  }

  throw new Error(
    `Origination ${opHash} was not found in recent RPC blocks before confirmation timeout.`,
  );
}

async function waitForTaquitoOrigination(operation: {
  opHash: string;
  confirmation(confirmations: number): Promise<
    | {
        block?: {
          header?: {
            level?: number;
          };
        };
      }
    | undefined
  >;
}): Promise<{ contractAddress: string; level: number | null }> {
  const confirmation = await operation.confirmation(1);
  const contractAddress = await findContractAddressFromWalletOperation(operation);

  if (!contractAddress) {
    throw new Error(
      `Origination ${operation.opHash} confirmed but KT1 address was not found.`,
    );
  }

  return {
    contractAddress,
    level: confirmation?.block?.header?.level ?? null,
  };
}

function formatOriginationFailure(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors
      .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
      .join(' / ');
  }
  return error instanceof Error ? error.message : String(error);
}

export async function connectShadownetWallet(
  _target: WalletConnectTarget = 'beacon',
  networkId: KilnNetworkId = getDefaultNetworkId(),
): Promise<ConnectedWalletState> {
  const handle = await ensureToolkit(networkId);

  await handle.wallet.clearActiveAccount();
  await handle.wallet.requestPermissions();

  await assertExpectedNetwork(handle, networkId);

  const activeAccount = await handle.wallet.client.getActiveAccount();
  if (!activeAccount?.address) {
    throw new Error('Wallet connected but no active account address was returned.');
  }

  return connectedWalletStateFromAccount(activeAccount, networkId) as ConnectedWalletState;
}

export async function getConnectedShadownetWallet(
  networkId: KilnNetworkId = getDefaultNetworkId(),
): Promise<ConnectedWalletState | null> {
  const handle = await ensureToolkit(networkId);
  const activeAccount = await handle.wallet.client.getActiveAccount();
  if (!activeAccount?.address) {
    return null;
  }
  await assertExpectedNetwork(handle, networkId);

  return connectedWalletStateFromAccount(activeAccount, networkId);
}

export async function signKilnAuthChallenge(
  message: string,
  networkId: KilnNetworkId = getDefaultNetworkId(),
): Promise<SignedKilnAuthChallenge> {
  const handle = await ensureToolkit(networkId);
  await assertExpectedNetwork(handle, networkId);

  const publicKey = await handle.wallet.getPK();
  const messageBytes = stringToBytes(message);
  const client = handle.wallet.client as unknown as {
    requestSignPayload(input: {
      signingType: SigningType;
      payload: string;
    }): Promise<{ signature: string }>;
  };
  const { signature } = await client.requestSignPayload({
    signingType: SigningType.RAW,
    payload: messageBytes,
  });

  return { signature, publicKey, messageBytes };
}

export async function disconnectShadownetWallet(): Promise<void> {
  if (!activeHandle) {
    return;
  }
  await activeHandle.wallet.clearActiveAccount();
  emitWalletSession(null);
}

export async function originateWithConnectedWallet(
  code: string,
  initialStorage: string,
  networkId: KilnNetworkId = getDefaultNetworkId(),
): Promise<ConnectedOriginationResult> {
  const handle = await ensureToolkit(networkId);
  await assertExpectedNetwork(handle, networkId);

  const operation = await handle.toolkit.wallet
    .originate({ code, init: initialStorage })
    .send();

  let observed: { contractAddress: string; level: number | null };
  let stopRpcScan = false;
  try {
    observed = await Promise.any([
      withTimeout(
        waitForTaquitoOrigination(operation),
        ORIGINATION_CONFIRMATION_TIMEOUT_MS,
        `Taquito confirmation timed out for origination ${operation.opHash}.`,
      ),
      waitForRpcOrigination(handle, operation.opHash, () => stopRpcScan),
    ]);
  } catch (error) {
    throw new Error(
      `Origination ${operation.opHash} was sent but Kiln could not confirm the KT1 address: ${formatOriginationFailure(error)}`,
    );
  } finally {
    stopRpcScan = true;
  }

  return {
    hash: operation.opHash,
    contractAddress: observed.contractAddress,
    level: observed.level,
  };
}

export function assignConnectedWalletAsAdmin(
  initialStorage: string,
  connectedAddress: string,
): string {
  return initialStorage.replaceAll(BURN_PLACEHOLDER_ADDRESS, connectedAddress);
}
