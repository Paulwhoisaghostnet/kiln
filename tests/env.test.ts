import { describe, expect, it } from 'vitest';
import { getEnv, getWalletSecret, parseCorsOrigins } from '../src/lib/env.js';

describe('getEnv', () => {
  it('applies defaults for optional values', () => {
    const env = getEnv({
      TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
    });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(env.API_RATE_LIMIT_MAX).toBe(30);
    expect(env.API_JSON_LIMIT).toBe('10mb');
  });

  it('throws when TEZOS_RPC_URL is invalid', () => {
    expect(() =>
      getEnv({
        TEZOS_RPC_URL: 'not-a-url',
      }),
    ).toThrow(/Environment validation failed/);
  });
});

describe('getWalletSecret', () => {
  it('returns wallet-specific secrets', () => {
    const env = getEnv({
      TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
      WALLET_A_SECRET_KEY: 'edskA',
      WALLET_B_SECRET_KEY: 'edskB',
    });

    expect(getWalletSecret(env, 'A')).toBe('edskA');
    expect(getWalletSecret(env, 'B')).toBe('edskB');
  });

  it('throws when the secret key is missing', () => {
    const env = getEnv({
      TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
      WALLET_A_SECRET_KEY: 'edskA',
    });

    expect(() => getWalletSecret(env, 'B')).toThrow(
      /Secret key for Wallet B is not configured/,
    );
  });
});

describe('parseCorsOrigins', () => {
  it('splits and trims origin lists', () => {
    const origins = parseCorsOrigins(
      'https://app.example.com, https://admin.example.com',
    );

    expect(origins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('returns an empty array for undefined config', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });
});
