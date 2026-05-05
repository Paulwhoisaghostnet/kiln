import type { Abi, Hex } from 'viem';
import {
  createWalletClient,
  createPublicClient,
  custom,
  defineChain,
  encodeDeployData,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { getNetworkProfile, type KilnNetworkId, type KilnNetworkProfile } from './networks.js';

export interface ConnectedEvmWallet {
  address: Hex;
  networkId: KilnNetworkId;
  chainId: number;
  rpcUrl: string;
}

export interface EvmDeployResult {
  transactionHash: Hex;
  contractAddress: Hex;
  blockNumber: bigint;
}

export interface SignedEvmAuthChallenge {
  wallet: ConnectedEvmWallet;
  signature: Hex;
}

export type EvmWalletTarget = 'auto' | 'temple';

/** EIP-1193 provider exposed by Temple, MetaMask, and other browser EVM wallets. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  providers?: unknown[];
  isTemple?: boolean;
  isTempleWallet?: boolean;
  info?: {
    name?: string;
    rdns?: string;
  };
}

interface Eip6963ProviderInfo {
  name?: string;
  rdns?: string;
  uuid?: string;
}

interface BrowserEvmWindow {
  ethereum?: unknown;
  templeEthereum?: unknown;
  temple?: {
    ethereum?: unknown;
    evm?: unknown;
  };
  templeWallet?: {
    ethereum?: unknown;
    evm?: unknown;
  };
  addEventListener?: Window['addEventListener'];
  dispatchEvent?: Window['dispatchEvent'];
}

const announcedProviders: Eip1193Provider[] = [];
const providerInfo = new WeakMap<Eip1193Provider, Eip6963ProviderInfo>();

let selectedProvider: Eip1193Provider | null = null;
let eip6963Bootstrapped = false;

function isProvider(value: unknown): value is Eip1193Provider {
  return Boolean(
    value && typeof value === 'object' && typeof (value as { request?: unknown }).request === 'function',
  );
}

function rememberProvider(
  providers: Eip1193Provider[],
  provider: unknown,
  info?: Eip6963ProviderInfo,
): void {
  if (!isProvider(provider)) {
    return;
  }
  if (info) {
    providerInfo.set(provider, info);
  }
  if (providers.includes(provider)) {
    return;
  }
  providers.push(provider);
}

function getProviderInfo(provider: Eip1193Provider): Eip6963ProviderInfo | undefined {
  return provider.info ?? providerInfo.get(provider);
}

function isTempleProvider(provider: Eip1193Provider): boolean {
  if (provider.isTemple || provider.isTempleWallet) {
    return true;
  }
  const info = getProviderInfo(provider);
  const label = [info?.name, info?.rdns].filter(Boolean).join(' ').toLowerCase();
  return label.includes('temple');
}

function getBrowserWindow(): BrowserEvmWindow | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window as unknown as BrowserEvmWindow;
}

function bootstrapEip6963(win: BrowserEvmWindow): void {
  if (eip6963Bootstrapped || !win.addEventListener || !win.dispatchEvent) {
    return;
  }
  eip6963Bootstrapped = true;
  win.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
    const detail = event.detail as
      | {
          provider?: unknown;
          info?: Eip6963ProviderInfo;
        }
      | undefined;
    if (!isProvider(detail?.provider) || announcedProviders.includes(detail.provider)) {
      return;
    }
    announcedProviders.push(detail.provider);
    if (detail.info) {
      providerInfo.set(detail.provider, detail.info);
    }
  }) as EventListener);
  win.dispatchEvent(new Event('eip6963:requestProvider'));
}

function collectProviders(): Eip1193Provider[] {
  const win = getBrowserWindow();
  if (!win) {
    return [];
  }
  bootstrapEip6963(win);

  const providers: Eip1193Provider[] = [];
  const ethereum = win.ethereum as (Eip1193Provider & { providers?: unknown[] }) | undefined;

  rememberProvider(providers, ethereum);
  for (const provider of Array.isArray(ethereum?.providers) ? ethereum.providers : []) {
    rememberProvider(providers, provider);
  }
  for (const provider of announcedProviders) {
    rememberProvider(providers, provider, providerInfo.get(provider));
  }
  rememberProvider(providers, win.templeEthereum, { name: 'Temple Wallet' });
  rememberProvider(providers, win.temple?.ethereum, { name: 'Temple Wallet' });
  rememberProvider(providers, win.temple?.evm, { name: 'Temple Wallet' });
  rememberProvider(providers, win.templeWallet?.ethereum, { name: 'Temple Wallet' });
  rememberProvider(providers, win.templeWallet?.evm, { name: 'Temple Wallet' });

  return providers;
}

function readProvider(target: EvmWalletTarget = 'auto'): Eip1193Provider | null {
  const providers = collectProviders();
  if (target === 'temple') {
    return providers.find(isTempleProvider) ?? null;
  }
  if (selectedProvider && providers.includes(selectedProvider)) {
    return selectedProvider;
  }
  return providers[0] ?? null;
}

function missingProviderError(target: EvmWalletTarget): Error {
  if (target === 'temple') {
    return new Error(
      'Temple EVM provider not detected. Enable Temple for Etherlink, update Temple Wallet, and reload Kiln.',
    );
  }
  return new Error(
    'No EVM wallet detected. Install or enable Temple, MetaMask, or another EIP-1193 wallet and reload the page.',
  );
}

function ensureEvmNetwork(profile: KilnNetworkProfile): asserts profile is KilnNetworkProfile & {
  evmChainId: number;
} {
  if (profile.ecosystem !== 'etherlink' || !profile.evmChainId) {
    throw new Error(`${profile.label} is not an EVM network.`);
  }
}

function buildChain(profile: KilnNetworkProfile): Chain {
  ensureEvmNetwork(profile);
  return defineChain({
    id: profile.evmChainId,
    name: profile.label,
    nativeCurrency: { name: 'Tez', symbol: profile.nativeSymbol, decimals: 18 },
    rpcUrls: {
      default: { http: [profile.defaultRpcUrl] },
      public: { http: [profile.defaultRpcUrl] },
    },
    blockExplorers: profile.explorerAddress
      ? {
          default: {
            name: `${profile.label} Explorer`,
            url: (profile.explorerAddress ?? '')
              .replace('/address/{address}', '')
              .replace('{address}', ''),
          },
        }
      : undefined,
    testnet: profile.tier !== 'mainnet',
  });
}

export function hasInjectedEvmProvider(target: EvmWalletTarget = 'auto'): boolean {
  return readProvider(target) !== null;
}

/**
 * Request connection to the user's browser EVM wallet. If the wallet isn't
 * currently on the target chain, we try `wallet_switchEthereumChain` first;
 * if the chain is unknown to the wallet, we fall back to
 * `wallet_addEthereumChain` so first-time Etherlink users don't have to
 * configure the chain manually.
 */
export async function connectEvmWallet(
  networkId: KilnNetworkId,
  target: EvmWalletTarget = 'auto',
): Promise<ConnectedEvmWallet> {
  const provider = readProvider(target);
  if (!provider) {
    throw missingProviderError(target);
  }

  const profile = getNetworkProfile(networkId);
  ensureEvmNetwork(profile);
  const desiredChainHex = `0x${profile.evmChainId.toString(16)}`;

  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
  })) as Hex[];
  if (!accounts || accounts.length === 0) {
    throw new Error('Wallet connection returned no accounts.');
  }

  const currentChainId = (await provider.request({ method: 'eth_chainId' })) as string;
  if (currentChainId.toLowerCase() !== desiredChainHex.toLowerCase()) {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: desiredChainHex }],
      });
    } catch (switchError) {
      // 4902 = chain not added. Ask the wallet to add it; the user confirms in the wallet dialog.
      const code = (switchError as { code?: number }).code;
      if (code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: desiredChainHex,
              chainName: profile.label,
              rpcUrls: [profile.defaultRpcUrl],
              nativeCurrency: {
                name: 'Tez',
                symbol: profile.nativeSymbol,
                decimals: 18,
              },
              blockExplorerUrls: profile.explorerAddress
                ? [
                    (profile.explorerAddress ?? '')
                      .replace('/address/{address}', '')
                      .replace('{address}', ''),
                  ]
                : [],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
  }

  selectedProvider = provider;
  return {
    address: accounts[0] as Hex,
    networkId,
    chainId: profile.evmChainId,
    rpcUrl: profile.defaultRpcUrl,
  };
}

export async function getConnectedEvmWallet(
  networkId: KilnNetworkId,
  target: EvmWalletTarget = 'auto',
): Promise<ConnectedEvmWallet | null> {
  const provider = readProvider(target);
  if (!provider) {
    return null;
  }
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as Hex[];
    if (!accounts || accounts.length === 0) {
      return null;
    }
    const profile = getNetworkProfile(networkId);
    ensureEvmNetwork(profile);
    const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
    const chainId = parseInt(chainIdHex, 16);
    selectedProvider = provider;
    return {
      address: accounts[0] as Hex,
      networkId,
      chainId,
      rpcUrl: profile.defaultRpcUrl,
    };
  } catch {
    return null;
  }
}

export async function signEvmAuthChallenge(
  message: string,
  networkId: KilnNetworkId,
  target: EvmWalletTarget = 'auto',
): Promise<SignedEvmAuthChallenge> {
  const wallet =
    (await getConnectedEvmWallet(networkId, target)) ?? (await connectEvmWallet(networkId, target));
  const provider = readProvider(target);
  if (!provider) {
    throw missingProviderError(target);
  }
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [message, wallet.address],
  })) as Hex;

  return { wallet, signature };
}

/**
 * Deploys a contract via the user's connected EVM wallet. `abi` and
 * `constructorArgs` are used to encode the deploy calldata client-side
 * (viem handles the encoding deterministically). The server's compile
 * response includes the ABI so this function accepts it directly.
 */
export async function deployEvmContract(params: {
  networkId: KilnNetworkId;
  bytecode: Hex;
  abi: Abi;
  constructorArgs?: unknown[];
  walletTarget?: EvmWalletTarget;
}): Promise<EvmDeployResult> {
  const provider = readProvider(params.walletTarget);
  if (!provider) {
    throw missingProviderError(params.walletTarget ?? 'auto');
  }
  const profile = getNetworkProfile(params.networkId);
  ensureEvmNetwork(profile);
  const chain = buildChain(profile);

  const walletClient: WalletClient = createWalletClient({
    chain,
    transport: custom(provider as unknown as Parameters<typeof custom>[0]),
  });
  const publicClient: PublicClient = createPublicClient({ chain, transport: http(profile.defaultRpcUrl) });

  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error('No wallet account available. Connect a wallet first.');
  }

  const data = encodeDeployData({
    abi: params.abi,
    bytecode: params.bytecode,
    args: params.constructorArgs ?? [],
  });

  const hash = await walletClient.sendTransaction({
    account,
    chain,
    data,
    to: null,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(
      `Deploy tx ${hash} mined at block ${receipt.blockNumber} but contractAddress missing from receipt.`,
    );
  }

  return {
    transactionHash: hash,
    contractAddress: receipt.contractAddress,
    blockNumber: receipt.blockNumber,
  };
}

export async function disconnectEvmWallet(): Promise<void> {
  // EIP-1193 has no standard disconnect; wallets ask the user to revoke site
  // permissions in their own UI. We only drop Kiln's selected provider.
  selectedProvider = null;
}
