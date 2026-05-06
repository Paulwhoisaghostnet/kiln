import type { KilnNetworkId, KilnNetworkProfile } from './networks.js';
import type { EvmProviderSnapshot } from './evm-wallet.js';

export type WalletAdvisorStatus = 'ready' | 'action' | 'blocked' | 'idle';
export type WalletAdvisorKind = 'tezos' | 'evm';

export interface AdvisorTezosWallet {
  address: string;
  networkId: KilnNetworkId;
  networkName: string | null;
  rpcUrl: string | null;
}

export interface AdvisorAccountSession {
  walletKind: WalletAdvisorKind;
  walletAddress: string;
  lastLoginWalletKind?: WalletAdvisorKind;
  lastLoginWalletAddress?: string;
  lastLoginNetworkId?: string;
}

export interface WalletAdvisorRow {
  networkId: KilnNetworkId;
  label: string;
  kind: WalletAdvisorKind;
  expected: string;
  current: string;
  action: string;
  status: WalletAdvisorStatus;
  active: boolean;
}

export interface WalletAdvisorView {
  status: WalletAdvisorStatus;
  title: string;
  expected: string;
  current: string;
  action: string;
  accountNote: string | null;
  rows: WalletAdvisorRow[];
  checkedAt: string | null;
}

export interface BuildWalletAdvisorInput {
  networks: KilnNetworkProfile[];
  activeNetworkId: KilnNetworkId;
  tezosWallet: AdvisorTezosWallet | null;
  evmSnapshot: EvmProviderSnapshot;
  accountSession: AdvisorAccountSession | null;
  signerRequired: boolean;
}

function shortAddress(address: string): string {
  if (address.length <= 14) {
    return address;
  }
  return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

function networkLabel(networks: KilnNetworkProfile[], networkId: string): string {
  return networks.find((network) => network.id === networkId)?.label ?? networkId;
}

function statusRank(status: WalletAdvisorStatus): number {
  switch (status) {
    case 'blocked':
      return 3;
    case 'action':
      return 2;
    case 'ready':
      return 1;
    case 'idle':
      return 0;
  }
}

function buildTezosRow(
  input: BuildWalletAdvisorInput,
  profile: KilnNetworkProfile,
): WalletAdvisorRow {
  const active = profile.id === input.activeNetworkId;
  const connectedHere = input.tezosWallet?.networkId === profile.id;
  const walletNetwork = input.tezosWallet
    ? networkLabel(input.networks, input.tezosWallet.networkId)
    : null;

  if (connectedHere && input.tezosWallet) {
    return {
      networkId: profile.id,
      label: profile.label,
      kind: 'tezos',
      expected: `${profile.label} Beacon signer`,
      current: `${shortAddress(input.tezosWallet.address)} on ${profile.label}`,
      action: active
        ? 'Ready for Tezos signing on the selected network.'
        : 'This signer is connected; switch Kiln here when you want to use it.',
      status: 'ready',
      active,
    };
  }

  if (input.tezosWallet) {
    return {
      networkId: profile.id,
      label: profile.label,
      kind: 'tezos',
      expected: `${profile.label} Beacon signer`,
      current: `Beacon signer is on ${walletNetwork}.`,
      action: active
        ? `Reconnect Beacon on ${profile.label}, or switch Kiln back to ${walletNetwork}.`
        : `Select ${profile.label} and reconnect Beacon when this network is the target.`,
      status: active ? 'blocked' : 'idle',
      active,
    };
  }

  return {
    networkId: profile.id,
    label: profile.label,
    kind: 'tezos',
    expected: `${profile.label} Beacon signer`,
    current: 'No Beacon signer connected.',
    action: active
      ? `Connect a Tezos wallet on ${profile.label}${input.signerRequired ? ' before continuing.' : ' when signing is needed.'}`
      : `No action until ${profile.label} is selected.`,
    status: active ? 'action' : 'idle',
    active,
  };
}

function buildEvmRow(
  input: BuildWalletAdvisorInput,
  profile: KilnNetworkProfile,
): WalletAdvisorRow {
  const active = profile.id === input.activeNetworkId;
  const expectedChainId = profile.evmChainId ?? null;
  const chainLabel = expectedChainId ? `chain ${expectedChainId}` : 'configured chain';
  const snapshot = input.evmSnapshot;

  if (!snapshot.providerDetected) {
    return {
      networkId: profile.id,
      label: profile.label,
      kind: 'evm',
      expected: `${profile.label} EVM signer (${chainLabel})`,
      current: 'No EIP-1193 wallet detected.',
      action: active
        ? 'Enable Temple EVM, MetaMask, or another EIP-1193 wallet, then reload Kiln.'
        : `No action until ${profile.label} is selected.`,
      status: active ? 'action' : 'idle',
      active,
    };
  }

  if (snapshot.error) {
    return {
      networkId: profile.id,
      label: profile.label,
      kind: 'evm',
      expected: `${profile.label} EVM signer (${chainLabel})`,
      current: snapshot.providerName
        ? `${snapshot.providerName} is present but unreadable.`
        : 'EVM wallet is present but unreadable.',
      action: active ? snapshot.error : `Resolve provider access before using ${profile.label}.`,
      status: active ? 'blocked' : 'idle',
      active,
    };
  }

  if (!snapshot.address) {
    return {
      networkId: profile.id,
      label: profile.label,
      kind: 'evm',
      expected: `${profile.label} EVM signer (${chainLabel})`,
      current: snapshot.chainId ? `Wallet provider on chain ${snapshot.chainId}, no account shared.` : 'Wallet provider detected, no account shared.',
      action: active
        ? 'Connect the EVM wallet and approve account access.'
        : `Share an account when using ${profile.label}.`,
      status: active ? 'action' : 'idle',
      active,
    };
  }

  if (expectedChainId && snapshot.chainId !== expectedChainId) {
    return {
      networkId: profile.id,
      label: profile.label,
      kind: 'evm',
      expected: `${profile.label} EVM signer (${chainLabel})`,
      current: `${shortAddress(snapshot.address)} on chain ${snapshot.chainId ?? 'unknown'}.`,
      action: active
        ? `Switch the wallet to ${profile.label} (${chainLabel}) before signing.`
        : `Switch the wallet to ${profile.label} only when this network is selected.`,
      status: active ? 'blocked' : 'idle',
      active,
    };
  }

  return {
    networkId: profile.id,
    label: profile.label,
    kind: 'evm',
    expected: `${profile.label} EVM signer (${chainLabel})`,
    current: `${shortAddress(snapshot.address)} on ${profile.label}.`,
    action: active
      ? 'Ready for Etherlink signing on the selected network.'
      : 'This EVM chain is active in the wallet; switch Kiln here when you want to use it.',
    status: 'ready',
    active,
  };
}

function buildAccountNote(
  accountSession: AdvisorAccountSession | null,
  tezosWallet: AdvisorTezosWallet | null,
  evmSnapshot: EvmProviderSnapshot,
): string | null {
  if (!accountSession) {
    return null;
  }
  const accountKind = accountSession.lastLoginWalletKind ?? accountSession.walletKind;
  const accountAddress =
    accountSession.lastLoginWalletAddress ?? accountSession.walletAddress;
  const signerAddress =
    accountKind === 'tezos' ? tezosWallet?.address : evmSnapshot.address ?? null;
  if (!signerAddress || signerAddress === accountAddress) {
    return null;
  }
  return `Logged-in account wallet is ${shortAddress(accountAddress)}; active signer is ${shortAddress(
    signerAddress,
  )}. This is allowed, but link the signer if it should open the same projects later.`;
}

export function buildWalletAdvisor(input: BuildWalletAdvisorInput): WalletAdvisorView {
  const rows = input.networks.map((profile) =>
    profile.ecosystem === 'tezos'
      ? buildTezosRow(input, profile)
      : buildEvmRow(input, profile),
  );
  const activeRow = rows.find((row) => row.active) ?? rows[0];
  const highestStatus = rows.reduce(
    (current, row) =>
      row.active || row.status === 'blocked'
        ? statusRank(row.status) > statusRank(current)
          ? row.status
          : current
        : current,
    activeRow?.status ?? 'idle',
  );

  return {
    status: highestStatus,
    title:
      highestStatus === 'ready'
        ? 'Wallet state matches Kiln'
        : highestStatus === 'blocked'
          ? 'Wallet state needs correction'
          : 'Wallet state advisor',
    expected: activeRow?.expected ?? 'No active wallet expectation.',
    current: activeRow?.current ?? 'No wallet state detected.',
    action: activeRow?.action ?? 'Choose a supported network to continue.',
    accountNote: buildAccountNote(input.accountSession, input.tezosWallet, input.evmSnapshot),
    rows,
    checkedAt: input.evmSnapshot.checkedAt ?? null,
  };
}
