export type KilnNetworkId =
  | 'tezos-shadownet'
  | 'tezos-ghostnet'
  | 'tezos-mainnet'
  | 'etherlink-testnet'
  | 'etherlink-mainnet';

export type KilnEcosystem = 'tezos' | 'etherlink';
export type KilnNetworkStatus = 'active' | 'planned';
/** Tier-1 rails get puppet wallet support; mainnets are user-connected-wallet only. */
export type KilnNetworkTier = 'sandbox' | 'testnet' | 'mainnet';

export interface KilnNetworkCapabilities {
  /** Beacon (Tezos) or EIP-1193 (EVM) — user can connect a browser wallet */
  walletConnect: boolean;
  /** Server-side Bert/Ernie keys are available on this network */
  puppetWallets: boolean;
  /** Pre-deploy workflow (compile -> validate -> audit -> simulate) runs */
  predeploy: boolean;
  /** Post-deploy E2E dynamic rig is enabled */
  postdeployE2E: boolean;
  /** Contract source language: 'michelson' + 'smartpy' for Tezos, 'solidity' for EVM */
  sourceLanguages: ReadonlyArray<'michelson' | 'smartpy' | 'solidity'>;
}

export interface KilnNetworkProfile {
  id: KilnNetworkId;
  label: string;
  ecosystem: KilnEcosystem;
  status: KilnNetworkStatus;
  tier: KilnNetworkTier;
  /** UI color token: maps to daisyUI semantic colors */
  accent: 'success' | 'warning' | 'error' | 'secondary' | 'info';
  defaultRpcUrl: string;
  chainId?: string;
  /** Beacon wallet network name (Tezos) or numeric chainId as hex (EVM) */
  beaconNetworkName?: string;
  /** Numeric chain id (EVM: required; Tezos: unused) */
  evmChainId?: number;
  /** Native currency symbol shown in UI */
  nativeSymbol: string;
  /** Block explorer URL template (use {address} or {tx} placeholders) */
  explorerAddress?: string;
  explorerTx?: string;
  /** One-line description shown under the network name in the picker */
  blurb: string;
  capabilities: KilnNetworkCapabilities;
}

export interface RuntimeNetworkConfig extends KilnNetworkProfile {
  rpcUrl: string;
}

const NETWORK_PROFILES: Record<KilnNetworkId, KilnNetworkProfile> = {
  'tezos-shadownet': {
    id: 'tezos-shadownet',
    label: 'Tezos Shadownet',
    ecosystem: 'tezos',
    status: 'active',
    tier: 'sandbox',
    accent: 'success',
    defaultRpcUrl: 'https://rpc.shadownet.teztnets.com',
    chainId: 'NetXsqzbfFenSTS',
    beaconNetworkName: 'shadownet',
    nativeSymbol: 'tez',
    explorerAddress: 'https://shadownet.tzkt.io/{address}',
    explorerTx: 'https://shadownet.tzkt.io/{tx}',
    blurb: 'Fast-iteration sandbox with pre-funded puppets for free-spend testing.',
    capabilities: {
      walletConnect: true,
      puppetWallets: true,
      predeploy: true,
      postdeployE2E: true,
      sourceLanguages: ['michelson', 'smartpy'],
    },
  },
  'tezos-ghostnet': {
    id: 'tezos-ghostnet',
    label: 'Tezos Ghostnet',
    ecosystem: 'tezos',
    status: 'planned',
    tier: 'testnet',
    accent: 'warning',
    defaultRpcUrl: 'https://rpc.ghostnet.teztnets.com',
    chainId: 'NetXnHfVqm9iesp',
    beaconNetworkName: 'ghostnet',
    nativeSymbol: 'tez',
    explorerAddress: 'https://ghostnet.tzkt.io/{address}',
    explorerTx: 'https://ghostnet.tzkt.io/{tx}',
    blurb: 'Public Tezos testnet mirroring mainnet protocol.',
    capabilities: {
      walletConnect: true,
      puppetWallets: false,
      predeploy: true,
      postdeployE2E: false,
      sourceLanguages: ['michelson', 'smartpy'],
    },
  },
  'tezos-mainnet': {
    id: 'tezos-mainnet',
    label: 'Tezos Mainnet',
    ecosystem: 'tezos',
    status: 'active',
    tier: 'mainnet',
    accent: 'error',
    defaultRpcUrl: 'https://mainnet.tezos.ecadinfra.com',
    chainId: 'NetXdQprcVkpaWU',
    beaconNetworkName: 'mainnet',
    nativeSymbol: 'tez',
    explorerAddress: 'https://tzkt.io/{address}',
    explorerTx: 'https://tzkt.io/{tx}',
    blurb: 'Production Tezos — real funds. Connected-wallet deploys only, puppets disabled.',
    capabilities: {
      walletConnect: true,
      puppetWallets: false,
      predeploy: true,
      postdeployE2E: true,
      sourceLanguages: ['michelson', 'smartpy'],
    },
  },
  'etherlink-testnet': {
    id: 'etherlink-testnet',
    label: 'Etherlink Testnet',
    ecosystem: 'etherlink',
    status: 'active',
    tier: 'testnet',
    accent: 'secondary',
    defaultRpcUrl: 'https://node.ghostnet.etherlink.com',
    evmChainId: 128123,
    beaconNetworkName: '0x1f47b',
    nativeSymbol: 'XTZ',
    explorerAddress: 'https://testnet.explorer.etherlink.com/address/{address}',
    explorerTx: 'https://testnet.explorer.etherlink.com/tx/{tx}',
    blurb: 'Tezos EVM rollup — Solidity on testnet faucet funds.',
    capabilities: {
      walletConnect: true,
      puppetWallets: false,
      predeploy: true,
      postdeployE2E: true,
      sourceLanguages: ['solidity'],
    },
  },
  'etherlink-mainnet': {
    id: 'etherlink-mainnet',
    label: 'Etherlink Mainnet',
    ecosystem: 'etherlink',
    status: 'active',
    tier: 'mainnet',
    accent: 'error',
    defaultRpcUrl: 'https://node.mainnet.etherlink.com',
    evmChainId: 42793,
    beaconNetworkName: '0xa729',
    nativeSymbol: 'XTZ',
    explorerAddress: 'https://explorer.etherlink.com/address/{address}',
    explorerTx: 'https://explorer.etherlink.com/tx/{tx}',
    blurb: 'Production Tezos EVM — real funds. Connected MetaMask only.',
    capabilities: {
      walletConnect: true,
      puppetWallets: false,
      predeploy: true,
      postdeployE2E: true,
      sourceLanguages: ['solidity'],
    },
  },
};

const DEFAULT_NETWORK_ID: KilnNetworkId = 'tezos-shadownet';

export function getDefaultNetworkId(): KilnNetworkId {
  return DEFAULT_NETWORK_ID;
}

export function listNetworkProfiles(): KilnNetworkProfile[] {
  return Object.values(NETWORK_PROFILES);
}

/**
 * Networks surfaced in the UI picker. Order is intentional: sandbox first, then
 * testnets, then mainnets (so the user reads left-to-right as risk increases).
 */
export function listPickableNetworks(): KilnNetworkProfile[] {
  const order: KilnNetworkId[] = [
    'tezos-shadownet',
    'etherlink-testnet',
    'tezos-mainnet',
    'etherlink-mainnet',
  ];
  return order
    .map((id) => NETWORK_PROFILES[id])
    .filter((profile): profile is KilnNetworkProfile => Boolean(profile));
}

/** Legacy shape kept for the existing `/api/networks` response consumers. */
export interface NetworkCatalogRow {
  id: string;
  label: string;
  ecosystem: KilnEcosystem;
  status: KilnNetworkStatus;
  tier: KilnNetworkTier;
  defaultRpcUrl: string;
  chainId?: string;
  evmChainId?: number;
  beaconNetworkName?: string;
  nativeSymbol: string;
  blurb: string;
  accent: KilnNetworkProfile['accent'];
  capabilities: KilnNetworkCapabilities;
}

export function listNetworkCatalog(): NetworkCatalogRow[] {
  return listPickableNetworks().map((profile) => ({
    id: profile.id,
    label: profile.label,
    ecosystem: profile.ecosystem,
    status: profile.status,
    tier: profile.tier,
    defaultRpcUrl: profile.defaultRpcUrl,
    chainId: profile.chainId,
    evmChainId: profile.evmChainId,
    beaconNetworkName: profile.beaconNetworkName,
    nativeSymbol: profile.nativeSymbol,
    blurb: profile.blurb,
    accent: profile.accent,
    capabilities: profile.capabilities,
  }));
}

export function getNetworkProfile(id: KilnNetworkId): KilnNetworkProfile {
  return NETWORK_PROFILES[id];
}

export function resolveNetworkConfig(input: {
  networkId?: KilnNetworkId;
  rpcUrl?: string;
  chainId?: string;
}): RuntimeNetworkConfig {
  const networkId = input.networkId ?? DEFAULT_NETWORK_ID;
  const profile = getNetworkProfile(networkId);

  return {
    ...profile,
    rpcUrl: input.rpcUrl?.trim() || profile.defaultRpcUrl,
    chainId: input.chainId?.trim() || profile.chainId,
  };
}

export function isKilnNetworkId(value: unknown): value is KilnNetworkId {
  return (
    typeof value === 'string' &&
    (NETWORK_PROFILES as Record<string, unknown>)[value] !== undefined
  );
}

export function assertTezosNetwork(profile: KilnNetworkProfile): void {
  if (profile.ecosystem !== 'tezos') {
    throw new Error(
      `Tezos-only endpoint called on ${profile.ecosystem} network ${profile.id}. Use the EVM endpoints or switch networks.`,
    );
  }
}

export function assertEvmNetwork(profile: KilnNetworkProfile): void {
  if (profile.ecosystem !== 'etherlink') {
    throw new Error(
      `EVM-only endpoint called on ${profile.ecosystem} network ${profile.id}. Use the Tezos endpoints or switch networks.`,
    );
  }
}

/** Explorer link builder. Returns the raw address/tx if no template is set. */
export function explorerLinkForAddress(
  profile: KilnNetworkProfile,
  address: string,
): string {
  return profile.explorerAddress
    ? profile.explorerAddress.replace('{address}', address)
    : address;
}

export function explorerLinkForTx(
  profile: KilnNetworkProfile,
  tx: string,
): string {
  return profile.explorerTx ? profile.explorerTx.replace('{tx}', tx) : tx;
}
