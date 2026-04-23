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

/** EIP-1193 provider available on window.ethereum when MetaMask / Rabbit / etc is installed. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

function readProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
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

export function hasInjectedEvmProvider(): boolean {
  return readProvider() !== null;
}

/**
 * Request connection to the user's browser EVM wallet. If the wallet isn't
 * currently on the target chain, we try `wallet_switchEthereumChain` first;
 * if the chain is unknown to the wallet, we fall back to
 * `wallet_addEthereumChain` so first-time Etherlink users don't have to
 * configure the chain manually.
 */
export async function connectEvmWallet(networkId: KilnNetworkId): Promise<ConnectedEvmWallet> {
  const provider = readProvider();
  if (!provider) {
    throw new Error(
      'No EVM wallet detected. Install MetaMask (or any EIP-1193 wallet) and reload the page.',
    );
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
      // 4902 = chain not added. Ask the wallet to add it; the user confirms in a MetaMask dialog.
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

  return {
    address: accounts[0] as Hex,
    networkId,
    chainId: profile.evmChainId,
    rpcUrl: profile.defaultRpcUrl,
  };
}

export async function getConnectedEvmWallet(
  networkId: KilnNetworkId,
): Promise<ConnectedEvmWallet | null> {
  const provider = readProvider();
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
}): Promise<EvmDeployResult> {
  const provider = readProvider();
  if (!provider) {
    throw new Error('No EVM wallet provider available.');
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
  // EIP-1193 has no standard disconnect; MetaMask asks the user to revoke
  // site permissions in its own UI. We just no-op here and let the caller
  // drop the stored state.
}
