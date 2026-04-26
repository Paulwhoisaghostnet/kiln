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

  it('lists UI catalog without ghostnet and with concrete Etherlink support', () => {
    const catalog = listNetworkCatalog();
    expect(catalog).toHaveLength(4);
    expect(catalog.map((row) => row.id)).toEqual([
      'tezos-shadownet',
      'etherlink-testnet',
      'tezos-mainnet',
      'etherlink-mainnet',
    ]);
    expect(catalog.some((row) => row.id === 'tezos-ghostnet')).toBe(false);
    expect(catalog.find((row) => row.id === 'etherlink-testnet')?.label).toBe('Etherlink Testnet');
    expect(catalog.find((row) => row.id === 'etherlink-testnet')?.status).toBe('active');
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
