import type { AppEnv } from './env.js';
import {
  getNetworkProfile,
  isKilnNetworkId,
  type KilnNetworkId,
  type RuntimeNetworkConfig,
} from './networks.js';
import { resolveNetworkConfig } from './networks.js';
import { resolveRpcUrlForNetwork } from './tezos-service.js';

/**
 * Per-request network selection. Returns a fully-resolved network config that
 * includes env-sourced RPC overrides. Callers then branch on
 * `network.ecosystem` to pick Tezos vs EVM service instantiation.
 */
export function selectNetworkForRequest(
  env: AppEnv,
  requestedNetworkId: unknown,
): RuntimeNetworkConfig {
  const networkId: KilnNetworkId =
    isKilnNetworkId(requestedNetworkId) ? requestedNetworkId : env.KILN_NETWORK;

  return resolveNetworkConfig({
    networkId,
    rpcUrl: resolveRpcUrlForNetwork(networkId, env),
  });
}

export function isTezosEcosystem(networkId: KilnNetworkId): boolean {
  return getNetworkProfile(networkId).ecosystem === 'tezos';
}

export function isEvmEcosystem(networkId: KilnNetworkId): boolean {
  return getNetworkProfile(networkId).ecosystem === 'etherlink';
}

export class NetworkCapabilityError extends Error {
  readonly networkId: KilnNetworkId;
  readonly capability: string;
  constructor(networkId: KilnNetworkId, capability: string, message: string) {
    super(message);
    this.name = 'NetworkCapabilityError';
    this.networkId = networkId;
    this.capability = capability;
  }
}

/**
 * Throws `NetworkCapabilityError` if the given network does not support the
 * requested capability. HTTP handlers catch it and return 412 with a clean
 * message so the UI can show the exact reason.
 */
export function assertCapability(
  networkId: KilnNetworkId,
  capability: 'walletConnect' | 'puppetWallets' | 'predeploy' | 'postdeployE2E',
): void {
  const profile = getNetworkProfile(networkId);
  if (!profile.capabilities[capability]) {
    throw new NetworkCapabilityError(
      networkId,
      capability,
      `Network ${profile.label} does not support ${formatCapability(capability)}.`,
    );
  }
}

function formatCapability(capability: string): string {
  switch (capability) {
    case 'walletConnect':
      return 'browser wallet connections';
    case 'puppetWallets':
      return 'Bert/Ernie puppet wallets';
    case 'predeploy':
      return 'the pre-deploy workflow';
    case 'postdeployE2E':
      return 'post-deploy E2E testing';
    default:
      return capability;
  }
}
