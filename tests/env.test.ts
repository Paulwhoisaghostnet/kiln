import { describe, expect, it } from 'vitest';
import { getEnv, getWalletSecret, parseCorsOrigins } from '../src/lib/env.js';

describe('getEnv', () => {
  it('applies defaults for optional values', () => {
    const env = getEnv({
      TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
    });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.KILN_NETWORK).toBe('tezos-shadownet');
    expect(env.API_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(env.API_RATE_LIMIT_MAX).toBe(30);
    expect(env.API_JSON_LIMIT).toBe('10mb');
    expect(env.KILN_API_AUTH_REQUIRED).toBeUndefined();
    expect(env.KILN_REQUIRE_SIM_CLEARANCE).toBe(true);
    expect(env.KILN_SHADOWBOX_ENABLED).toBe(false);
    expect(env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE).toBe(false);
    expect(env.KILN_SHADOWBOX_PROVIDER).toBe('mock');
  });

  it('throws when TEZOS_RPC_URL is invalid', () => {
    expect(() =>
      getEnv({
        TEZOS_RPC_URL: 'not-a-url',
      }),
    ).toThrow(/Environment validation failed/);
  });

  it('parses named token env variables', () => {
    const env = getEnv({
      TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
      KILN_TOKEN_BRONZE: 'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',
      KILN_TOKEN_SILVER: 'KT1SxqT3TUF44syQ5QauuF9L8upWjr4ayVoq',
      KILN_TOKEN_GOLD: 'KT1SVy1QrAnXB9oyGPWEbRnotrggPkHt2TLH',
      KILN_TOKEN_PLATINUM: 'KT1KiGwrgfsg7sJTyJHkGstLY4YKfrHAf3TN',
      KILN_TOKEN_DIAMOND: 'KT1JAaj2EUjGBfWmJGy3Z5UsoGus7iGVkvEG',
    });

    expect(env.KILN_TOKEN_BRONZE).toBe('KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj');
    expect(env.KILN_TOKEN_DIAMOND).toBe('KT1JAaj2EUjGBfWmJGy3Z5UsoGus7iGVkvEG');
  });

  it('parses boolean env toggles safely', () => {
    const env = getEnv({
      TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
      KILN_REQUIRE_SIM_CLEARANCE: 'false',
      KILN_API_AUTH_REQUIRED: 'off',
      KILN_SHADOWBOX_ENABLED: 'true',
      KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE: 'yes',
    });

    expect(env.KILN_REQUIRE_SIM_CLEARANCE).toBe(false);
    expect(env.KILN_API_AUTH_REQUIRED).toBe(false);
    expect(env.KILN_SHADOWBOX_ENABLED).toBe(true);
    expect(env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE).toBe(true);
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
