import { describe, expect, it } from 'vitest';
import { listPickableNetworks } from '../src/lib/networks.js';
import { buildWalletAdvisor } from '../src/lib/wallet-advisor.js';

const networks = listPickableNetworks();

describe('wallet state advisor', () => {
  it('reports ready when the active Tezos signer matches Shadownet', () => {
    const advisor = buildWalletAdvisor({
      networks,
      activeNetworkId: 'tezos-shadownet',
      tezosWallet: {
        address: 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt',
        networkId: 'tezos-shadownet',
        networkName: 'shadownet',
        rpcUrl: 'https://rpc.shadownet.teztnets.com',
      },
      evmSnapshot: {
        providerDetected: false,
        address: null,
        chainId: null,
        checkedAt: '2026-05-06T20:00:00.000Z',
      },
      accountSession: null,
      signerRequired: true,
    });

    expect(advisor.status).toBe('ready');
    expect(advisor.expected).toContain('Tezos Shadownet');
    expect(advisor.current).toContain('Tezos Shadownet');
  });

  it('blocks the active Tezos path when Beacon is connected to the other Tezos network', () => {
    const advisor = buildWalletAdvisor({
      networks,
      activeNetworkId: 'tezos-mainnet',
      tezosWallet: {
        address: 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt',
        networkId: 'tezos-shadownet',
        networkName: 'shadownet',
        rpcUrl: 'https://rpc.shadownet.teztnets.com',
      },
      evmSnapshot: {
        providerDetected: false,
        address: null,
        chainId: null,
        checkedAt: '2026-05-06T20:00:00.000Z',
      },
      accountSession: null,
      signerRequired: true,
    });

    expect(advisor.status).toBe('blocked');
    expect(advisor.action).toMatch(/Reconnect Beacon on Tezos Mainnet/);
  });

  it('advises EVM chain switching when wallet account is on the wrong Etherlink chain', () => {
    const advisor = buildWalletAdvisor({
      networks,
      activeNetworkId: 'etherlink-mainnet',
      tezosWallet: null,
      evmSnapshot: {
        providerDetected: true,
        address: '0x1111111111111111111111111111111111111111',
        chainId: 127823,
        checkedAt: '2026-05-06T20:00:00.000Z',
      },
      accountSession: null,
      signerRequired: true,
    });

    expect(advisor.status).toBe('blocked');
    expect(advisor.action).toContain('Switch the wallet to Etherlink Mainnet');
  });

  it('announces when the logged-in account differs from the active signer', () => {
    const advisor = buildWalletAdvisor({
      networks,
      activeNetworkId: 'tezos-shadownet',
      tezosWallet: {
        address: 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt',
        networkId: 'tezos-shadownet',
        networkName: 'shadownet',
        rpcUrl: 'https://rpc.shadownet.teztnets.com',
      },
      evmSnapshot: {
        providerDetected: false,
        address: null,
        chainId: null,
        checkedAt: '2026-05-06T20:00:00.000Z',
      },
      accountSession: {
        walletKind: 'tezos',
        walletAddress: 'tz1OtherWallet11111111111111111111111',
        lastLoginWalletKind: 'tezos',
        lastLoginWalletAddress: 'tz1OtherWallet11111111111111111111111',
        lastLoginNetworkId: 'tezos-shadownet',
      },
      signerRequired: true,
    });

    expect(advisor.accountNote).toMatch(/Logged-in account wallet/);
    expect(advisor.accountNote).toMatch(/active signer/);
  });
});
