import {
  createPublicClient,
  defineChain,
  http,
  type Hex,
  type PublicClient,
} from 'viem';
import { getEnv, type AppEnv } from './env.js';
import {
  getNetworkProfile,
  resolveNetworkConfig,
  type KilnNetworkId,
  type RuntimeNetworkConfig,
} from './networks.js';
import { resolveRpcUrlForNetwork } from './tezos-service.js';

export interface EvmDeployEstimate {
  /** Gas units expected to execute the deploy. */
  gasLimit: bigint;
  /** Current base fee per gas from the network (wei). May be 0 on pre-EIP-1559 chains. */
  baseFeePerGas: bigint;
  /** Max fee per gas Kiln recommends — base + 2x tip headroom. */
  maxFeePerGas: bigint;
  /** Max priority fee per gas Kiln recommends. */
  maxPriorityFeePerGas: bigint;
  /** Wei total if the tx uses exactly gasLimit at maxFeePerGas. */
  maxWeiCost: bigint;
  /** Human-readable XTZ total using 18 decimals. */
  maxXtzCost: string;
}

/**
 * EVM-side counterpart to TezosService. Read-only by design on the server
 * (signing happens in the user's browser via MetaMask); this service handles:
 *
 * - Balance reads
 * - Gas/fee estimates for bytecode deploys
 * - `eth_call` dry-runs for validation
 *
 * Real contract deploys are submitted by the browser wallet directly to the
 * RPC. The server is never asked to hold an EVM private key.
 */
export class EtherlinkService {
  readonly network: RuntimeNetworkConfig;
  private readonly client: PublicClient;

  constructor(env: AppEnv = getEnv(), networkOverride?: KilnNetworkId) {
    const networkId = networkOverride ?? env.KILN_NETWORK;
    const network = resolveNetworkConfig({
      networkId,
      rpcUrl: resolveRpcUrlForNetwork(networkId, env),
    });

    if (network.ecosystem !== 'etherlink') {
      throw new Error(
        `EtherlinkService requires an 'etherlink' ecosystem network. Got '${network.ecosystem}' (${network.id}).`,
      );
    }
    if (!network.evmChainId) {
      throw new Error(
        `Network ${network.id} is missing evmChainId — check the network profile.`,
      );
    }

    this.network = network;

    const chain = defineChain({
      id: network.evmChainId,
      name: network.label,
      nativeCurrency: {
        name: 'Tez',
        symbol: network.nativeSymbol,
        decimals: 18,
      },
      rpcUrls: {
        default: { http: [network.rpcUrl] },
        public: { http: [network.rpcUrl] },
      },
      blockExplorers: network.explorerAddress
        ? {
            default: {
              name: `${network.label} Explorer`,
              url: (network.explorerAddress ?? '')
                .replace('/address/{address}', '')
                .replace('{address}', ''),
            },
          }
        : undefined,
      testnet: network.tier !== 'mainnet',
    });

    this.client = createPublicClient({ chain, transport: http(network.rpcUrl) });
  }

  /** Returns the native-token balance of an address as a decimal string (18-decimals). */
  async getBalance(address: Hex): Promise<string> {
    const wei = await this.client.getBalance({ address });
    return formatUnits(wei, 18);
  }

  async getChainId(): Promise<number> {
    return this.client.getChainId();
  }

  /**
   * Estimates gas for a contract deploy. Constructor args must already be
   * ABI-encoded into the bytecode tail by the caller (viem's
   * `encodeDeployData` helper on the client side does this cleanly).
   */
  async estimateDeploy(params: {
    from?: Hex;
    bytecode: Hex;
    constructorCalldata?: Hex;
  }): Promise<EvmDeployEstimate> {
    const calldata: Hex = params.constructorCalldata
      ? (`${params.bytecode}${params.constructorCalldata.slice(2)}` as Hex)
      : params.bytecode;

    // If no `from` is given, gas estimate still works on most nodes but some
    // RPCs require a sender; fall back to a throwaway zero address so the
    // estimate at least tries. Real sends always supply `from`.
    const sender: Hex = params.from ?? ('0x0000000000000000000000000000000000000000' as Hex);

    const [gas, block, feeHistory] = await Promise.all([
      this.client.estimateGas({
        account: sender,
        data: calldata,
      }).catch(() => 3_000_000n),
      this.client.getBlock({ blockTag: 'latest' }),
      this.client.getFeeHistory({ blockCount: 4, rewardPercentiles: [50] }).catch(() => null),
    ]);

    const baseFeePerGas = block.baseFeePerGas ?? 0n;

    const recentTips: bigint[] =
      feeHistory?.reward
        ?.flat()
        .filter((tip): tip is bigint => typeof tip === 'bigint' && tip > 0n) ?? [];
    const medianTip: bigint =
      recentTips.length > 0
        ? recentTips[Math.floor(recentTips.length / 2)] ?? 1_000_000_000n
        : 1_000_000_000n;
    const maxPriorityFeePerGas: bigint = medianTip > 0n ? medianTip : 1_000_000_000n;
    const maxFeePerGas: bigint = baseFeePerGas * 2n + maxPriorityFeePerGas;

    const maxWeiCost = gas * maxFeePerGas;
    const maxXtzCost = formatUnits(maxWeiCost, 18);

    return {
      gasLimit: gas,
      baseFeePerGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      maxWeiCost,
      maxXtzCost,
    };
  }

  /**
   * Dry-run a deployment via `eth_call` — the server returns `data` that would
   * be the deployed runtime bytecode if the constructor succeeds. A reverted
   * constructor surfaces as a thrown error from viem; callers should catch and
   * surface the revert reason.
   */
  async dryRunDeploy(params: {
    from?: Hex;
    bytecode: Hex;
    constructorCalldata?: Hex;
  }): Promise<{ ok: true; runtimeBytecodeLength: number } | { ok: false; reason: string }> {
    const calldata: Hex = params.constructorCalldata
      ? (`${params.bytecode}${params.constructorCalldata.slice(2)}` as Hex)
      : params.bytecode;
    const sender: Hex = params.from ?? ('0x0000000000000000000000000000000000000000' as Hex);

    try {
      const { data } = await this.client.call({ account: sender, data: calldata });
      const length = typeof data === 'string' ? Math.max(0, data.length - 2) / 2 : 0;
      return { ok: true, runtimeBytecodeLength: length };
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message.split('\n')[0] ?? error.message
          : 'Constructor reverted or RPC refused call';
      return { ok: false, reason };
    }
  }
}

/** Minimal local implementation of viem's `formatUnits` so we don't widen the import surface. */
function formatUnits(value: bigint, decimals: number): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  if (frac === 0n) {
    return `${sign}${whole.toString()}`;
  }
  const fracStr: string = (frac.toString().padStart(decimals, '0').replace(/0+$/, '') ?? '');
  return `${sign}${whole.toString()}${fracStr ? `.${fracStr}` : ''}`;
}

export function isEtherlinkNetwork(networkId: KilnNetworkId): boolean {
  return getNetworkProfile(networkId).ecosystem === 'etherlink';
}
