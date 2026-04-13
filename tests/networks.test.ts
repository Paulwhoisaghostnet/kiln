import { describe, expect, it } from 'vitest';
import {
  getDefaultNetworkId,
  getNetworkProfile,
  listNetworkCatalog,
  listNetworkProfiles,
  resolveNetworkConfig,
} from '../src/lib/networks.js';

describe('networks', () => {
  it('keeps full internal profiles for resolution (includes ghostnet and etherlink variants)', () => {
    const profiles = listNetworkProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(5);
    expect(profiles.some((profile) => profile.id === 'tezos-ghostnet')).toBe(true);
    expect(profiles.some((profile) => profile.id === 'etherlink-mainnet')).toBe(true);
    expect(getNetworkProfile('tezos-shadownet').status).toBe('active');
  });

  it('lists UI catalog without ghostnet and with grouped Tezos EVM support', () => {
    const catalog = listNetworkCatalog();
    expect(catalog).toHaveLength(3);
    expect(catalog.map((row) => row.id)).toEqual([
      'tezos-shadownet',
      'tezos-mainnet',
      'tezos-evm-support',
    ]);
    expect(catalog.some((row) => row.id === 'tezos-ghostnet')).toBe(false);
    expect(catalog.find((row) => row.id === 'tezos-evm-support')?.label).toBe('Tezos EVM support');
    expect(catalog.find((row) => row.id === 'tezos-evm-support')?.status).toBe('planned');
  });

  it('resolves runtime network with env overrides', () => {
    const runtime = resolveNetworkConfig({
      networkId: 'tezos-mainnet',
      rpcUrl: 'https://example-rpc.net',
      chainId: 'NetCustom',
    });

    expect(runtime.id).toBe('tezos-mainnet');
    expect(runtime.rpcUrl).toBe('https://example-rpc.net');
    expect(runtime.chainId).toBe('NetCustom');
  });

  it('falls back to default network profile', () => {
    const runtime = resolveNetworkConfig({});
    expect(runtime.id).toBe(getDefaultNetworkId());
    expect(runtime.rpcUrl).toBe('https://rpc.shadownet.teztnets.com');
  });
});
