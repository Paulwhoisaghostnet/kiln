import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server-app.js';
import type { AppEnv } from '../src/lib/env.js';
import type { WalletType } from '../src/lib/types.js';

const walletAAddress = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const walletBAddress = 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6';
const contractAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';

function baseEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
    TEZOS_CHAIN_ID: undefined,
    WALLET_A_SECRET_KEY: 'edskA',
    WALLET_B_SECRET_KEY: 'edskB',
    KILN_DUMMY_TOKENS:
      'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg,KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn',
    API_AUTH_TOKEN: undefined,
    API_RATE_LIMIT_WINDOW_MS: 60_000,
    API_RATE_LIMIT_MAX: 100,
    API_JSON_LIMIT: '10mb',
    CORS_ORIGINS: undefined,
    ...overrides,
  };
}

function mockTezosServiceFactory() {
  const calls = {
    originate: [] as Array<{ wallet: WalletType; code: string; initialStorage: string }>,
    execute: [] as Array<{
      wallet: WalletType;
      address: string;
      entrypoint: string;
      args: unknown[];
    }>,
  };

  const factory = (wallet: WalletType) => ({
    async getAddress() {
      return wallet === 'A' ? walletAAddress : walletBAddress;
    },
    async getBalance() {
      return wallet === 'A' ? 10.5 : 4.25;
    },
    async originateContract(code: string, initialStorage: string) {
      calls.originate.push({ wallet, code, initialStorage });
      return contractAddress;
    },
    async callContract(address: string, entrypoint: string, args: unknown[] = []) {
      calls.execute.push({ wallet, address, entrypoint, args });
      return {
        hash: 'opWJ4mXf7J4n4A7x8mR7w',
        level: 12345,
        status: 'applied',
      };
    },
  });

  return { factory, calls };
}

describe('createApiApp', () => {
  it('returns health details', async () => {
    const app = createApiApp({
      env: baseEnv({ TEZOS_CHAIN_ID: 'NetXxyz' }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      network: 'https://rpc.shadownet.teztnets.com',
      chainId: 'NetXxyz',
    });
  });

  it('validates upload payloads', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/upload').send({
      code: '',
      initialStorage: '',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Michelson code is required');
    expect(response.body.error).toContain('initialStorage is required');
  });

  it('uploads and returns parsed entrypoints', async () => {
    const { factory, calls } = mockTezosServiceFactory();
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: factory,
    });

    const michelson = `
      parameter (or (pair %transfer address nat) (unit %mint));
      storage unit;
      code {
        PUSH address "KT1AFA2mwNUMNd4SsujE1YYp29vd8BZejyKW";
        DROP;
        CAR;
        NIL operation;
        PAIR
      };
    `;

    const response = await request(app).post('/api/kiln/upload').send({
      code: michelson,
      initialStorage: 'Unit',
      wallet: 'A',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.contractAddress).toBe(contractAddress);
    expect(response.body.entrypoints).toEqual([
      { name: 'mint', args: [] },
      { name: 'transfer', args: [] },
    ]);
    expect(calls.originate).toHaveLength(1);
    const [origination] = calls.originate;
    expect(origination).toBeDefined();
    expect(origination!.initialStorage).toBe('Unit');
    expect(origination!.code).toContain('KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg');
  });

  it('validates execute payloads', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/execute').send({
      contractAddress: 'KT1-not-valid',
      entrypoint: '',
      args: [],
      wallet: 'A',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid KT1 contract address');
  });

  it('executes valid contract calls', async () => {
    const { factory, calls } = mockTezosServiceFactory();
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: factory,
    });

    const response = await request(app).post('/api/kiln/execute').send({
      contractAddress,
      entrypoint: 'mint',
      args: ['42'],
      wallet: 'B',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.hash).toBe('opWJ4mXf7J4n4A7x8mR7w');
    expect(calls.execute).toEqual([
      {
        wallet: 'B',
        address: contractAddress,
        entrypoint: 'mint',
        args: ['42'],
      },
    ]);
  });

  it('returns wallet balances', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/kiln/balances');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      walletA: { address: walletAAddress, balance: 10.5 },
      walletB: { address: walletBAddress, balance: 4.25 },
    });
  });

  it('enforces token auth when API_AUTH_TOKEN is set', async () => {
    const app = createApiApp({
      env: baseEnv({ API_AUTH_TOKEN: 'super-secret' }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const unauthorized = await request(app).post('/api/kiln/upload').send({
      code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      initialStorage: 'Unit',
      wallet: 'A',
    });

    expect(unauthorized.status).toBe(401);
    const unauthorizedBalances = await request(app).get('/api/kiln/balances');
    expect(unauthorizedBalances.status).toBe(401);

    const authorized = await request(app)
      .post('/api/kiln/upload')
      .set('x-api-token', 'super-secret')
      .send({
        code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
        initialStorage: 'Unit',
        wallet: 'A',
      });

    expect(authorized.status).toBe(200);
    const authorizedBalances = await request(app)
      .get('/api/kiln/balances')
      .set('x-api-token', 'super-secret');
    expect(authorizedBalances.status).toBe(200);
  });
});
