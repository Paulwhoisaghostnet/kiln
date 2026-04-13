import { NetworkType } from '@airgap/beacon-dapp';
import { BeaconWallet } from '@taquito/beacon-wallet';
import { TezosToolkit } from '@taquito/taquito';

export type WalletConnectTarget = 'temple' | 'kukai';

export interface ConnectedWalletState {
  address: string;
  networkName: string | null;
  rpcUrl: string | null;
}

export interface ConnectedOriginationResult {
  hash: string;
  contractAddress: string;
  level: number | null;
}

const SHADOWNET_RPC_URL = 'https://rpc.shadownet.teztnets.com';
const SHADOWNET_CHAIN_ID = 'NetXsqzbfFenSTS';
const SHADOWNET_NETWORK_NAME = 'shadownet';
const KUKAI_SHADOWNET_URL = 'https://shadownet.kukai.app';
const TEMPLE_WALLET_URL = 'https://templewallet.com';
/** Fixed address used in compiled storage as admin placeholder until deploy (Tezos ecosystem convention). */
export const BURN_PLACEHOLDER_ADDRESS = 'tz1burnburnburnburnburnburnburjAYjjX';

let tezosToolkit: TezosToolkit | null = null;
let beaconWallet: BeaconWallet | null = null;
let initializingWallet: Promise<BeaconWallet> | null = null;

function resolveNetworkType(): string {
  const typedNetworkType = NetworkType as unknown as {
    SHADOWNET?: string;
    CUSTOM?: string;
  };

  return (
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
    // Ignore storage access errors in restricted browser contexts.
  }
}

async function ensureWallet(): Promise<BeaconWallet> {
  if (beaconWallet) {
    return beaconWallet;
  }

  if (!initializingWallet) {
    initializingWallet = (async () => {
      clearStaleBeaconStorage();
      const networkType = resolveNetworkType();
      const wallet = new BeaconWallet({
        name: 'Tezos Kiln',
        iconUrl: '/favicon.ico',
        network: {
          type: networkType as never,
          name: SHADOWNET_NETWORK_NAME,
          rpcUrl: SHADOWNET_RPC_URL,
        },
      });

      if (!tezosToolkit) {
        tezosToolkit = new TezosToolkit(SHADOWNET_RPC_URL);
      }
      tezosToolkit.setWalletProvider(wallet);
      beaconWallet = wallet;
      return wallet;
    })().finally(() => {
      initializingWallet = null;
    });
  }

  return initializingWallet;
}

function openWalletTarget(target: WalletConnectTarget): void {
  const url = target === 'kukai' ? KUKAI_SHADOWNET_URL : TEMPLE_WALLET_URL;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function assertShadownetNetwork(wallet: BeaconWallet): Promise<void> {
  if (!tezosToolkit) {
    throw new Error('Tezos toolkit is not initialized.');
  }

  const account = await wallet.client.getActiveAccount();
  const networkName = account?.network?.name?.toLowerCase() ?? null;
  const networkRpc = account?.network?.rpcUrl?.toLowerCase() ?? null;

  if (networkName && !networkName.includes(SHADOWNET_NETWORK_NAME)) {
    throw new Error(
      `Wallet connected to ${networkName}. Please switch to Shadownet and reconnect.`,
    );
  }

  if (networkRpc && !networkRpc.includes(SHADOWNET_NETWORK_NAME)) {
    throw new Error(
      `Wallet RPC is ${networkRpc}. Kukai users must use ${KUKAI_SHADOWNET_URL}.`,
    );
  }

  const chainId = await tezosToolkit.rpc.getChainId();
  if (chainId !== SHADOWNET_CHAIN_ID) {
    throw new Error(
      `Chain mismatch detected. Expected ${SHADOWNET_CHAIN_ID}, got ${chainId}.`,
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
  target: WalletConnectTarget,
): Promise<ConnectedWalletState> {
  openWalletTarget(target);
  const wallet = await ensureWallet();
  const networkType = resolveNetworkType();

  await wallet.clearActiveAccount();
  await wallet.requestPermissions();

  await assertShadownetNetwork(wallet);

  const activeAccount = await wallet.client.getActiveAccount();
  if (!activeAccount?.address) {
    throw new Error('Wallet connected but no active account address was returned.');
  }

  return {
    address: activeAccount.address,
    networkName: activeAccount.network?.name ?? null,
    rpcUrl: activeAccount.network?.rpcUrl ?? null,
  };
}

export async function getConnectedShadownetWallet(): Promise<ConnectedWalletState | null> {
  const wallet = await ensureWallet();
  const activeAccount = await wallet.client.getActiveAccount();
  if (!activeAccount?.address) {
    return null;
  }

  return {
    address: activeAccount.address,
    networkName: activeAccount.network?.name ?? null,
    rpcUrl: activeAccount.network?.rpcUrl ?? null,
  };
}

export async function disconnectShadownetWallet(): Promise<void> {
  const wallet = await ensureWallet();
  await wallet.clearActiveAccount();
}

export async function originateWithConnectedWallet(
  code: string,
  initialStorage: string,
): Promise<ConnectedOriginationResult> {
  const wallet = await ensureWallet();
  if (!tezosToolkit) {
    throw new Error('Tezos toolkit is not initialized.');
  }

  await assertShadownetNetwork(wallet);

  const operation = await tezosToolkit.wallet
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
      `Origination operation ${operation.opHash} confirmed but KT1 address was not found.`,
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
