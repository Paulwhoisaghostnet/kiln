export type KilnNetworkId =
  | 'tezos-shadownet'
  | 'tezos-ghostnet'
  | 'tezos-mainnet'
  | 'etherlink-testnet'
  | 'etherlink-mainnet';

export type KilnEcosystem = 'tezos' | 'etherlink';
export type KilnNetworkStatus = 'active' | 'planned';

export interface KilnNetworkCapabilities {
  walletConnect: boolean;
  puppetWallets: boolean;
  predeploy: boolean;
  postdeployE2E: boolean;
}

export interface KilnNetworkProfile {
  id: KilnNetworkId;
  label: string;
  ecosystem: KilnEcosystem;
  status: KilnNetworkStatus;
  defaultRpcUrl: string;
  chainId?: string;
  beaconNetworkName?: string;
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
    defaultRpcUrl: 'https://rpc.shadownet.teztnets.com',
    chainId: 'NetXsqzbfFenSTS',
    beaconNetworkName: 'shadownet',
    capabilities: {
      walletConnect: true,
      puppetWallets: true,
      predeploy: true,
      postdeployE2E: true,
    },
  },
  'tezos-ghostnet': {
    id: 'tezos-ghostnet',
    label: 'Tezos Ghostnet',
    ecosystem: 'tezos',
    status: 'planned',
    defaultRpcUrl: 'https://rpc.ghostnet.teztnets.com',
    chainId: 'NetXnHfVqm9iesp',
    beaconNetworkName: 'ghostnet',
    capabilities: {
      walletConnect: true,
      puppetWallets: false,
      predeploy: false,
      postdeployE2E: false,
    },
  },
  'tezos-mainnet': {
    id: 'tezos-mainnet',
    label: 'Tezos Mainnet',
    ecosystem: 'tezos',
    status: 'planned',
    defaultRpcUrl: 'https://rpc.tzkt.io/mainnet',
    chainId: 'NetXdQprcVkpaWU',
    beaconNetworkName: 'mainnet',
    capabilities: {
      walletConnect: true,
      puppetWallets: false,
      predeploy: false,
      postdeployE2E: false,
    },
  },
  'etherlink-testnet': {
    id: 'etherlink-testnet',
    label: 'Etherlink Testnet',
    ecosystem: 'etherlink',
    status: 'planned',
    defaultRpcUrl: 'https://node.ghostnet.etherlink.com',
    capabilities: {
      walletConnect: false,
      puppetWallets: false,
      predeploy: false,
      postdeployE2E: false,
    },
  },
  'etherlink-mainnet': {
    id: 'etherlink-mainnet',
    label: 'Etherlink Mainnet',
    ecosystem: 'etherlink',
    status: 'planned',
    defaultRpcUrl: 'https://node.mainnet.etherlink.com',
    capabilities: {
      walletConnect: false,
      puppetWallets: false,
      predeploy: false,
      postdeployE2E: false,
    },
  },
};

const DEFAULT_NETWORK_ID: KilnNetworkId = 'tezos-shadownet';

export function listNetworkProfiles(): KilnNetworkProfile[] {
  return Object.values(NETWORK_PROFILES);
}

/** Rows for `/api/networks` and UI: active shadownet, planned Tezos mainnet, planned Tezos EVM (Etherlink test+main grouped). Ghostnet and per-env Etherlink rows are omitted. */
export interface NetworkCatalogRow {
  id: string;
  label: string;
  ecosystem: KilnEcosystem;
  status: KilnNetworkStatus;
  defaultRpcUrl: string;
  chainId?: string;
  beaconNetworkName?: string;
  capabilities: KilnNetworkCapabilities;
}

export function listNetworkCatalog(): NetworkCatalogRow[] {
  const shadownet = NETWORK_PROFILES['tezos-shadownet'];
  const mainnet = NETWORK_PROFILES['tezos-mainnet'];
  const etherlinkMain = NETWORK_PROFILES['etherlink-mainnet'];
  return [
    { ...shadownet },
    { ...mainnet },
    {
      id: 'tezos-evm-support',
      label: 'Tezos EVM support',
      ecosystem: 'etherlink',
      status: 'planned',
      defaultRpcUrl: etherlinkMain.defaultRpcUrl,
      capabilities: { ...etherlinkMain.capabilities },
    },
  ];
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

export function getDefaultNetworkId(): KilnNetworkId {
  return DEFAULT_NETWORK_ID;
}
