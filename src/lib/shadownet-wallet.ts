import { NetworkType, SigningType } from '@airgap/beacon-dapp';
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

type TezosWalletHandle = {
  toolkit: TezosToolkit;
  wallet: BeaconWallet;
  networkId: KilnNetworkId;
};

let activeHandle: TezosWalletHandle | null = null;
let initializingFor: KilnNetworkId | null = null;
let initializing: Promise<TezosWalletHandle> | null = null;

function resolveBeaconNetworkType(): string {
  const typedNetworkType = NetworkType as unknown as {
    MAINNET?: string;
    GHOSTNET?: string;
    SHADOWNET?: string;
    CUSTOM?: string;
  };
  return (
    typedNetworkType.MAINNET ??
    typedNetworkType.GHOSTNET ??
    typedNetworkType.SHADOWNET ??
    typedNetworkType.CUSTOM ??
    'custom'
  );
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
        type: resolveBeaconNetworkType() as never,
        name: normalizedBeaconNetworkName(networkId),
        rpcUrl: profile.defaultRpcUrl,
      },
    });

    const toolkit = new TezosToolkit(profile.defaultRpcUrl);
    toolkit.setWalletProvider(wallet);

    activeHandle = { toolkit, wallet, networkId };
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
  const expectedName = normalizedBeaconNetworkName(networkId);

  const account = await handle.wallet.client.getActiveAccount();
  const accountNetworkName = account?.network?.name?.toLowerCase() ?? null;

  // Shadownet/ghostnet need a substring match to allow custom labels (e.g.
  // `shadownet-test-rc1`). Mainnet must be an exact match to prevent someone
  // accidentally signing on the wrong chain.
  if (profile.tier === 'mainnet') {
    if (accountNetworkName && accountNetworkName !== expectedName) {
      throw new Error(
        `Wallet is on ${accountNetworkName}. Switch to Tezos Mainnet and reconnect.`,
      );
    }
  } else if (accountNetworkName && !accountNetworkName.includes(expectedName)) {
    throw new Error(
      `Wallet connected to ${accountNetworkName}. Please switch to ${profile.label} and reconnect.`,
    );
  }

  if (!profile.chainId) {
    return;
  }

  const chainId = await handle.toolkit.rpc.getChainId();
  if (chainId !== profile.chainId) {
    throw new Error(
      `Chain mismatch: expected ${profile.chainId} (${profile.label}), got ${chainId}.`,
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

  return {
    address: activeAccount.address,
    networkName: activeAccount.network?.name ?? null,
    networkId,
    rpcUrl: activeAccount.network?.rpcUrl ?? null,
  };
}

export async function getConnectedShadownetWallet(
  networkId: KilnNetworkId = getDefaultNetworkId(),
): Promise<ConnectedWalletState | null> {
  const handle = await ensureToolkit(networkId);
  const activeAccount = await handle.wallet.client.getActiveAccount();
  if (!activeAccount?.address) {
    return null;
  }

  return {
    address: activeAccount.address,
    networkName: activeAccount.network?.name ?? null,
    networkId,
    rpcUrl: activeAccount.network?.rpcUrl ?? null,
  };
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

  const confirmation = await operation.confirmation(1);
  let contractAddress: string | null = null;

  try {
    const contract = await operation.contract();
    contractAddress = contract?.address ?? null;
  } catch {
    contractAddress = null;
  }

  if (!contractAddress) {
    contractAddress = findContractAddress(operation.operationResults) ?? null;
  }
  if (!contractAddress) {
    contractAddress = findContractAddress(
      (operation as unknown as Record<string, unknown>).opResponse,
    );
  }

  if (!contractAddress) {
    throw new Error(
      `Origination ${operation.opHash} confirmed but KT1 address was not found.`,
    );
  }

  return {
    hash: operation.opHash,
    contractAddress,
    level: confirmation?.block?.header?.level ?? null,
  };
}

export function assignConnectedWalletAsAdmin(
  initialStorage: string,
  connectedAddress: string,
): string {
  return initialStorage.replaceAll(BURN_PLACEHOLDER_ADDRESS, connectedAddress);
}
