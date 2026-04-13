import { describe, expect, it } from 'vitest';
import {
  getDefaultNetworkId,
  getNetworkProfile,
  listNetworkProfiles,
  resolveNetworkConfig,
} from '../src/lib/networks.js';

describe('networks', () => {
  it('lists supported networks with shadownet active', () => {
    const profiles = listNetworkProfiles();

    expect(profiles.length).toBeGreaterThanOrEqual(5);
    expect(profiles.some((profile) => profile.id === 'tezos-shadownet')).toBe(true);
    expect(profiles.some((profile) => profile.id === 'etherlink-mainnet')).toBe(true);
    expect(getNetworkProfile('tezos-shadownet').status).toBe('active');
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
