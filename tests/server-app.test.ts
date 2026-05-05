import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApiApp } from '../src/server-app.js';
import type { AppEnv } from '../src/lib/env.js';
import type { WalletType } from '../src/lib/types.js';
import { buildWorkflowDrivenSimulationSteps } from '../src/lib/workflow-discovery.js';

const walletAAddress = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const walletBAddress = 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6';
const contractAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
const tokenAddresses = {
  bronze: 'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',
  silver: 'KT1SxqT3TUF44syQ5QauuF9L8upWjr4ayVoq',
  gold: 'KT1SVy1QrAnXB9oyGPWEbRnotrggPkHt2TLH',
  platinum: 'KT1KiGwrgfsg7sJTyJHkGstLY4YKfrHAf3TN',
  diamond: 'KT1JAaj2EUjGBfWmJGy3Z5UsoGus7iGVkvEG',
};

const sampleMichelson = `
  parameter (or (pair %mint address nat) (or (pair %transfer address nat) (bool %pause)));
  storage unit;
  code {
    CAR;
    NIL operation;
    PAIR
  };
`;

function sampleSimulationSteps() {
  return buildWorkflowDrivenSimulationSteps({
    contractId: 'sample',
    entrypoints: ['mint', 'transfer', 'pause'],
  });
}

function baseEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    KILN_NETWORK: 'tezos-shadownet',
    TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
    TEZOS_CHAIN_ID: undefined,
    WALLET_A_SECRET_KEY: 'edskA',
    WALLET_B_SECRET_KEY: 'edskB',
    KILN_DUMMY_TOKENS:
      `${tokenAddresses.bronze},${tokenAddresses.silver},${tokenAddresses.gold},${tokenAddresses.platinum},${tokenAddresses.diamond}`,
    KILN_TOKEN_BRONZE: tokenAddresses.bronze,
    KILN_TOKEN_SILVER: tokenAddresses.silver,
    KILN_TOKEN_GOLD: tokenAddresses.gold,
    KILN_TOKEN_PLATINUM: tokenAddresses.platinum,
    KILN_TOKEN_DIAMOND: tokenAddresses.diamond,
    API_AUTH_TOKEN: undefined,
    API_RATE_LIMIT_WINDOW_MS: 60_000,
    API_RATE_LIMIT_MAX: 100,
    API_JSON_LIMIT: '10mb',
    CORS_ORIGINS: undefined,
    KILN_SHADOWBOX_ENABLED: false,
    KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE: false,
    KILN_SHADOWBOX_PROVIDER: 'mock',
    KILN_SHADOWBOX_COMMAND: undefined,
    KILN_SHADOWBOX_TIMEOUT_MS: 90_000,
    KILN_SHADOWBOX_MAX_ACTIVE: 2,
    KILN_SHADOWBOX_MAX_ACTIVE_PER_IP: 1,
    KILN_SHADOWBOX_MAX_SOURCE_BYTES: 250_000,
    KILN_SHADOWBOX_MAX_STEPS: 24,
    KILN_SHADOWBOX_WORKDIR: undefined,
    KILN_USER_DB_PATH: undefined,
    KILN_MCP_ACCESSLIST: undefined,
    KILN_MCP_BLOCKLIST: undefined,
    KILN_MCP_TOKEN_TTL_HOURS: 24,
    KILN_SESSION_TTL_MINUTES: 240,
    KILN_REFERENCE_MAX_FILES: 200,
    KILN_REFERENCE_MAX_BYTES: 200 * 1024 * 1024,
    ...overrides,
    KILN_REQUIRE_SIM_CLEARANCE:
      overrides.KILN_REQUIRE_SIM_CLEARANCE ?? false,
    KILN_ACTIVITY_LOG_PATH: overrides.KILN_ACTIVITY_LOG_PATH,
    KILN_PYTHON: overrides.KILN_PYTHON,
    KILN_EXPORT_ROOT: overrides.KILN_EXPORT_ROOT,
    KILN_REFERENCE_ROOT: overrides.KILN_REFERENCE_ROOT,
  };
}

function mockTezosServiceFactory() {
  const calls = {
    validate: [] as Array<{ wallet: WalletType; code: string; initialStorage: string }>,
    originate: [] as Array<{ wallet: WalletType; code: string; initialStorage: string }>,
    execute: [] as Array<{
      wallet: WalletType;
      address: string;
      entrypoint: string;
      args: unknown[];
      options?: { amountMutez?: number };
    }>,
  };

  const factory = (wallet: WalletType) => ({
    async getAddress() {
      return wallet === 'A' ? walletAAddress : walletBAddress;
    },
    async getBalance() {
      return wallet === 'A' ? 10.5 : 4.25;
    },
    async validateOrigination(code: string, initialStorage: string) {
      calls.validate.push({ wallet, code, initialStorage });
      return {
        gasLimit: 350_000,
        storageLimit: 40_000,
        suggestedFeeMutez: 65_000,
        minimalFeeMutez: 45_000,
      };
    },
    async originateContract(code: string, initialStorage: string) {
      calls.originate.push({ wallet, code, initialStorage });
      return contractAddress;
    },
    async callContract(
      address: string,
      entrypoint: string,
      args: unknown[] = [],
      options?: { amountMutez?: number },
    ) {
      calls.execute.push({ wallet, address, entrypoint, args, options });
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
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        network: 'https://rpc.shadownet.teztnets.com',
        chainId: 'NetXxyz',
        networkId: 'tezos-shadownet',
        networkLabel: 'Tezos Shadownet',
        ecosystem: 'tezos',
        auth: {
          required: false,
          tokenConfigured: false,
          mode: 'open',
        },
        activityLogPath: expect.any(String),
        requestId: expect.any(String),
        tokens: {
          source: 'named',
          bronze: tokenAddresses.bronze,
          silver: tokenAddresses.silver,
          gold: tokenAddresses.gold,
          platinum: tokenAddresses.platinum,
          diamond: tokenAddresses.diamond,
        },
      }),
    );
  });

  it('returns health details in production mode', async () => {
    const app = createApiApp({
      env: baseEnv({ NODE_ENV: 'production', TEZOS_CHAIN_ID: 'NetProd' }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.chainId).toBe('NetProd');
  });

  it('allows WalletConnect verify iframe in production CSP', async () => {
    const app = createApiApp({
      env: baseEnv({ NODE_ENV: 'production' }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain(
      'frame-src',
    );
    expect(response.headers['content-security-policy']).toContain(
      'https://verify.walletconnect.org',
    );
  });

  it('does not emit permissive CORS headers in production by default', async () => {
    const app = createApiApp({
      env: baseEnv({ NODE_ENV: 'production', CORS_ORIGINS: undefined }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://app.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports wildcard preview domains in CORS allowlist', async () => {
    const app = createApiApp({
      env: baseEnv({
        CORS_ORIGINS: 'https://*.preview.kiln.example.com,https://kiln.example.com',
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const allowedPreview = await request(app)
      .get('/api/health')
      .set('Origin', 'https://deploy-42.preview.kiln.example.com');
    expect(allowedPreview.status).toBe(200);
    expect(allowedPreview.headers['access-control-allow-origin']).toBe(
      'https://deploy-42.preview.kiln.example.com',
    );

    const blockedOrigin = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(blockedOrigin.status).toBe(500);
  });

  it('allows same-origin browser asset and API requests when CORS allowlist is configured', async () => {
    const app = createApiApp({
      env: baseEnv({
        CORS_ORIGINS: 'https://kiln.example.com',
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app)
      .get('/api/health')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3001');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3001',
    );
  });

  it('returns network catalog and active runtime network', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/networks');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.active.id).toBe('tezos-shadownet');
    expect(response.body.supported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tezos-mainnet', ecosystem: 'tezos' }),
        expect.objectContaining({ id: 'etherlink-shadownet', ecosystem: 'etherlink' }),
        expect.objectContaining({ id: 'etherlink-mainnet', ecosystem: 'etherlink' }),
      ]),
    );
    // `tezos-ghostnet` is defined but deliberately hidden from the UI picker
    // until its capability matrix is finalised.
    expect(response.body.supported.some((row: { id: string }) => row.id === 'tezos-ghostnet')).toBe(
      false,
    );
  });

  it('returns machine-readable API capabilities', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/kiln/capabilities');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.runtime.network.id).toBe('tezos-shadownet');
    expect(response.body.runtime.deployClearanceRequired).toBe(false);
    expect(response.body.runtime.shadowboxRequiredForClearance).toBe(false);
    expect(response.body.workflowStages).toEqual(
      expect.arrayContaining([
        'compile_if_needed',
        'simulate',
        'shadowbox_runtime',
        'deploy',
      ]),
    );
    expect(response.body.entrypoints.shadowbox).toBe('/api/kiln/shadowbox/run');
    expect(response.body.noStubPolicy.shadowboxMockClearance).toBe('blocked');
    expect(response.body.systemScenarios.payableTezosCalls).toBe('supported');
  });

  it('returns capabilities for the requested network instead of only the runtime default', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get(
      '/api/kiln/capabilities?networkId=etherlink-shadownet',
    );

    expect(response.status).toBe(200);
    expect(response.body.runtime.network.id).toBe('etherlink-shadownet');
    expect(response.body.runtime.network.evmChainId).toBe(127823);
    expect(response.body.sources.supported).toEqual(['solidity']);
  });

  it('serves OpenAPI metadata for agent/tool integrations', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/kiln/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.paths['/api/kiln/workflow/run']).toBeDefined();
    expect(response.body.paths['/api/kiln/upload']).toBeDefined();
    expect(response.body.paths['/api/kiln/shadowbox/run']).toBeDefined();
  });

  it('lists reference contracts with discovered entrypoints', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/kiln/reference/contracts');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBeGreaterThanOrEqual(1);
    expect(response.body.contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'wtf-is-a-token',
          address: 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD',
        }),
      ]),
    );
  });

  it('creates guided contract draft for layman wizard flow', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/contracts/guided/create').send({
      contractType: 'nft_collection',
      projectName: 'Gallery Mint',
      adminAddress: walletAAddress,
      includeMint: true,
      includeBurn: true,
      includePause: true,
      includeAdminTransfer: true,
      outputFormat: 'smartpy',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.contractType).toBe('nft_collection');
    expect(response.body.entrypoints).toEqual(
      expect.arrayContaining(['mint', 'transfer', 'set_royalty_bps']),
    );
    expect(response.body.code).toContain('class GalleryMintCollection');
    expect(response.body.initialStorage).toContain(walletAAddress);
  });

  it('lists reference-informed guided contract elements', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app)
      .post('/api/kiln/contracts/guided/elements')
      .send({
        contractType: 'fa2_fungible',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.contractType).toBe('fa2_fungible');
    expect(response.body.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'admin_controls' }),
        expect.objectContaining({ id: 'pause_guard' }),
      ]),
    );
  });

  it('injects selected reference elements into guided draft entrypoints', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/contracts/guided/create').send({
      contractType: 'fa2_fungible',
      projectName: 'Reference Guided',
      includeMint: true,
      includeBurn: true,
      includePause: true,
      includeAdminTransfer: true,
      selectedElements: ['operator_support', 'allowlist_gate'],
      outputFormat: 'smartpy',
    });

    expect(response.status).toBe(200);
    expect(response.body.entrypoints).toEqual(
      expect.arrayContaining(['update_operators', 'set_allowlist']),
    );
    expect(response.body.referenceInsights.selectedElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'operator_support' }),
      ]),
    );
  });

  it('validates smartpy compile payloads', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/smartpy/compile').send({
      source: '',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('SmartPy source is required');
  });

  it('compiles SmartPy source through injected compiler', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
      compileSmartPy: async () => ({
        scenario: 'default',
        michelson: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR };',
        initialStorage: 'Unit',
      }),
    });

    const response = await request(app).post('/api/kiln/smartpy/compile').send({
      source: 'import smartpy as sp',
      scenario: 'default',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.scenario).toBe('default');
    expect(response.body.michelson).toContain('parameter unit');
    expect(response.body.initialStorage).toBe('Unit');
  });

  it('returns 501 when SmartPy CLI is unavailable', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
      compileSmartPy: async () => {
        throw new Error('SmartPy compiler unavailable: no runtime.');
      },
    });

    const response = await request(app).post('/api/kiln/smartpy/compile').send({
      source: 'import smartpy as sp',
    });

    expect(response.status).toBe(501);
    expect(response.body.error).toContain('SmartPy compiler unavailable');
  });

  it('runs full workflow and issues deployment clearance', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/workflow/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      initialStorage: 'Unit',
      simulationSteps: sampleSimulationSteps(),
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.sourceType).toBe('michelson');
    expect(response.body.validate.passed).toBe(true);
    expect(response.body.audit.passed).toBe(true);
    expect(response.body.simulation.success).toBe(true);
    expect(response.body.clearance.approved).toBe(true);
    expect(response.body.clearance.record.id).toMatch(/^clr_/);
  });

  it('withholds workflow clearance when required shadowbox gate fails', async () => {
    const app = createApiApp({
      env: baseEnv({
        KILN_SHADOWBOX_ENABLED: true,
        KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE: true,
      }),
      createTezosService: mockTezosServiceFactory().factory,
      runShadowbox: async () => ({
        enabled: true,
        requiredForClearance: true,
        provider: 'command',
        executed: true,
        passed: false,
        jobId: 'sbox_forced_fail',
        reason: 'Entrypoint mint reverted in ephemeral runtime.',
        summary: { total: 1, passed: 0, failed: 1 },
        steps: [
          {
            label: 'Mint should fail',
            wallet: 'bert',
            entrypoint: 'mint',
            status: 'failed',
            note: 'FAILWITH: paused',
          },
        ],
        warnings: [],
      }),
    });

    const response = await request(app).post('/api/kiln/workflow/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      initialStorage: 'Unit',
      simulationSteps: sampleSimulationSteps(),
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.shadowbox.passed).toBe(false);
    expect(response.body.clearance.approved).toBe(false);
    expect(response.body.validate.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Shadowbox runtime gate failed'),
      ]),
    );
  });

  it('compiles SmartPy source during workflow execution', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
      compileSmartPy: async () => ({
        scenario: 'default',
        michelson: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR };',
        initialStorage: 'Unit',
      }),
    });

    const response = await request(app).post('/api/kiln/workflow/run').send({
      sourceType: 'auto',
      source: 'import smartpy as sp\n\n@sp.module\ndef main():\n  pass',
      simulationSteps: [],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.sourceType).toBe('smartpy');
    expect(response.body.compile.performed).toBe(true);
    expect(response.body.artifacts.michelson).toContain('parameter unit');
    expect(response.body.artifacts.initialStorage).toBe('Unit');
  });

  it('runs standalone contract audit endpoint', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/audit/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.report.passed).toBe(true);
    expect(response.body.report.entrypoints).toEqual(
      expect.arrayContaining(['mint', 'pause', 'transfer']),
    );
    expect(typeof response.body.report.score).toBe('number');
  });

  it('runs standalone simulation endpoint and returns clearance', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/simulate/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      simulationSteps: sampleSimulationSteps(),
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.simulation.success).toBe(true);
    expect(response.body.clearance.approved).toBe(true);
    expect(response.body.clearance.record.id).toMatch(/^clr_/);
  });

  it('withholds standalone simulation clearance when shadowbox is required', async () => {
    const app = createApiApp({
      env: baseEnv({
        KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE: true,
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/simulate/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      simulationSteps: sampleSimulationSteps(),
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.simulation.success).toBe(true);
    expect(response.body.clearance.approved).toBe(false);
    expect(response.body.clearance.reason).toContain('Shadowbox runtime is required');
  });

  it('runs standalone shadowbox runtime endpoint', async () => {
    const app = createApiApp({
      env: baseEnv({
        KILN_SHADOWBOX_ENABLED: true,
      }),
      createTezosService: mockTezosServiceFactory().factory,
      runShadowbox: async () => ({
        enabled: true,
        requiredForClearance: false,
        provider: 'command',
        executed: true,
        passed: true,
        jobId: 'sbox_123',
        contractAddress: contractAddress,
        startedAt: '2026-04-22T00:00:00.000Z',
        endedAt: '2026-04-22T00:00:01.000Z',
        durationMs: 1000,
        summary: { total: 2, passed: 2, failed: 0 },
        steps: [
          {
            label: 'Originate',
            wallet: 'bert',
            entrypoint: 'originate',
            status: 'passed',
            note: 'Contract originated.',
            operationHash: 'opOriginate',
          },
          {
            label: 'Mint',
            wallet: 'bert',
            entrypoint: 'mint',
            status: 'passed',
            note: 'Minted in runtime.',
            operationHash: 'opMint',
          },
        ],
        warnings: [],
      }),
    });

    const response = await request(app).post('/api/kiln/shadowbox/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      initialStorage: 'Unit',
      simulationSteps: sampleSimulationSteps(),
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.codeHash).toMatch(/[a-f0-9]{64}/);
    expect(response.body.shadowbox.jobId).toBe('sbox_123');
    expect(response.body.shadowbox.passed).toBe(true);
  });

  it('uses compiled SmartPy storage for standalone shadowbox when caller sends Unit placeholder', async () => {
    const compiledStorage =
      '(Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" (Pair "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" 0))';
    const seen = { initialStorage: '' };
    const app = createApiApp({
      env: baseEnv({
        KILN_SHADOWBOX_ENABLED: true,
      }),
      createTezosService: mockTezosServiceFactory().factory,
      compileSmartPy: async () => ({
        scenario: 'default',
        michelson:
          'parameter unit; storage (pair address (pair address nat)); code { CDR ; NIL operation ; PAIR };',
        initialStorage: compiledStorage,
      }),
      runShadowbox: async (input) => {
        seen.initialStorage = input.initialStorage;
        return {
          enabled: true,
          requiredForClearance: false,
          provider: 'command',
          executed: true,
          passed: true,
          jobId: 'sbox_storage',
          contractAddress: undefined,
          startedAt: '2026-05-04T00:00:00.000Z',
          endedAt: '2026-05-04T00:00:01.000Z',
          durationMs: 1000,
          summary: { total: 0, passed: 0, failed: 0 },
          steps: [],
          warnings: [],
        };
      },
    });

    const response = await request(app).post('/api/kiln/shadowbox/run').send({
      sourceType: 'smartpy',
      source: 'import smartpy as sp',
      initialStorage: 'Unit',
      simulationSteps: [],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(seen.initialStorage).toBe(compiledStorage);
  });

  it('reports shadowbox runtime endpoint as unsuccessful when runtime is disabled', async () => {
    const app = createApiApp({
      env: baseEnv({
        KILN_SHADOWBOX_ENABLED: false,
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/shadowbox/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      initialStorage: 'Unit',
      simulationSteps: sampleSimulationSteps(),
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.shadowbox.executed).toBe(false);
    expect(response.body.shadowbox.provider).toBe('disabled');
  });

  it('blocks deployment when workflow clearance is required and missing', async () => {
    const app = createApiApp({
      env: baseEnv({ KILN_REQUIRE_SIM_CLEARANCE: true }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/upload').send({
      code: sampleMichelson,
      initialStorage: 'Unit',
      wallet: 'A',
    });

    expect(response.status).toBe(412);
    expect(response.body.error).toContain('Deployment blocked');
  });

  it('deploys when workflow clearance id matches code hash', async () => {
    const { factory, calls } = mockTezosServiceFactory();
    const app = createApiApp({
      env: baseEnv({ KILN_REQUIRE_SIM_CLEARANCE: true }),
      createTezosService: factory,
    });

    const workflow = await request(app).post('/api/kiln/workflow/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      initialStorage: 'Unit',
      simulationSteps: sampleSimulationSteps(),
    });

    expect(workflow.status).toBe(200);
    const clearanceId = workflow.body.clearance.record?.id as string | undefined;
    expect(clearanceId).toBeDefined();

    const response = await request(app).post('/api/kiln/upload').send({
      code: sampleMichelson,
      initialStorage: 'Unit',
      wallet: 'A',
      clearanceId,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(calls.originate).toHaveLength(1);
  });

  it('rejects deployment when clearance does not match contract source hash', async () => {
    const app = createApiApp({
      env: baseEnv({ KILN_REQUIRE_SIM_CLEARANCE: true }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const workflow = await request(app).post('/api/kiln/workflow/run').send({
      sourceType: 'michelson',
      source: sampleMichelson,
      initialStorage: 'Unit',
      simulationSteps: sampleSimulationSteps(),
    });

    expect(workflow.status).toBe(200);
    const clearanceId = workflow.body.clearance.record?.id as string | undefined;
    expect(clearanceId).toBeDefined();

    const response = await request(app).post('/api/kiln/upload').send({
      code: `${sampleMichelson}\n# changed`,
      initialStorage: 'Unit',
      wallet: 'A',
      clearanceId,
    });

    expect(response.status).toBe(412);
    expect(response.body.error).toContain('does not match current contract code hash');
  });

  it('returns recent activity log lines for troubleshooting', async () => {
    const logPath = join(tmpdir(), `kiln-activity-${randomUUID()}.log`);
    await fs.writeFile(
      logPath,
      `${JSON.stringify({ event: 'workflow_run', approved: true })}\n${JSON.stringify({ event: 'audit_run', score: 92 })}\n`,
      'utf8',
    );

    const app = createApiApp({
      env: baseEnv({
        API_AUTH_TOKEN: 'log-token',
        KILN_ACTIVITY_LOG_PATH: logPath,
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    // Intentionally exercises the legacy `x-api-token` alias so renames don't
    // silently drop backward-compat for existing curl/CLI users.
    const response = await request(app)
      .get('/api/kiln/activity/recent?limit=1')
      .set('x-api-token', 'log-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(1);
    expect(response.body.lines[0]).toContain('"event":"audit_run"');
  });

  it('runs predeploy validation with estimate checks', async () => {
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

    const response = await request(app).post('/api/kiln/predeploy/validate').send({
      code: michelson,
      initialStorage: 'Unit',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.valid).toBe(true);
    expect(response.body.issues).toEqual([]);
    expect(response.body.checks).toEqual({
      hasParameterSection: true,
      hasStorageSection: true,
      hasCodeSection: true,
    });
    expect(response.body.estimate).toEqual({
      gasLimit: 350_000,
      storageLimit: 40_000,
      suggestedFeeMutez: 65_000,
      minimalFeeMutez: 45_000,
    });
    expect(response.body.entrypoints).toEqual([
      { name: 'mint', args: [], parameterType: 'unit', sampleArgs: ['Unit'] },
      {
        name: 'transfer',
        args: [],
        parameterType: 'pair address nat',
        sampleArgs: ['(Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" 1)'],
      },
    ]);
    expect(response.body.injectedCode).toContain(tokenAddresses.bronze);
    expect(calls.validate).toEqual([
      {
        wallet: 'A',
        code: expect.stringContaining(tokenAddresses.bronze),
        initialStorage: 'Unit',
      },
    ]);
  });

  it('returns warning when predeploy estimate is skipped due missing wallet secret', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: (_wallet: WalletType) => ({
        async getAddress() {
          return walletAAddress;
        },
        async getBalance() {
          return 0;
        },
        async validateOrigination() {
          throw new Error('Secret key for Wallet A is not configured');
        },
        async originateContract() {
          return contractAddress;
        },
        async callContract() {
          return {
            hash: 'opHash',
            level: 1,
            status: 'applied',
          };
        },
      }),
    });

    const response = await request(app).post('/api/kiln/predeploy/validate').send({
      code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      initialStorage: 'Unit',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('RPC origination estimate skipped'),
      ]),
    );
  });

  it('creates bundle export metadata through injectable exporter', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
      exportBundle: async (payload) => ({
        bundleId: 'bundle-test',
        exportDir: '/tmp/kiln-bundle-test',
        zipFileName: 'bundle-test.zip',
        zipPath: '/tmp/kiln-bundle-test.zip',
        downloadUrl: '/api/kiln/export/download/bundle-test.zip',
      }),
    });

    const response = await request(app).post('/api/kiln/export/bundle').send({
      projectName: 'Bundle Test',
      sourceType: 'michelson',
      source: sampleMichelson,
      compiledMichelson: sampleMichelson,
      initialStorage: 'Unit',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.zipFileName).toBe('bundle-test.zip');
  });

  it('downloads exported bundle archives from disk', async () => {
    const exportDir = join(process.cwd(), 'exports');
    await fs.mkdir(exportDir, { recursive: true });
    const fileName = `bundle-download-${randomUUID()}.zip`;
    const filePath = join(exportDir, fileName);
    await fs.writeFile(filePath, 'zip-content', 'utf8');

    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get(
      `/api/kiln/export/download/${fileName}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain(fileName);

    await fs.rm(filePath, { force: true });
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
      { name: 'mint', args: [], parameterType: 'unit', sampleArgs: ['Unit'] },
      {
        name: 'transfer',
        args: [],
        parameterType: 'pair address nat',
        sampleArgs: ['(Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" 1)'],
      },
    ]);
    expect(calls.originate).toHaveLength(1);
    const [origination] = calls.originate;
    expect(origination).toBeDefined();
    expect(origination!.initialStorage).toBe('Unit');
    expect(origination!.code).toContain(tokenAddresses.bronze);
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
        options: { amountMutez: undefined },
      },
    ]);
  });

  it('passes mutez amount through execute payloads for payable calls', async () => {
    const { factory, calls } = mockTezosServiceFactory();
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: factory,
    });

    const response = await request(app).post('/api/kiln/execute').send({
      contractAddress,
      entrypoint: 'create_listing',
      args: ['100', '1'],
      amountMutez: 2_000_000,
      wallet: 'A',
    });

    expect(response.status).toBe(200);
    expect(calls.execute.at(-1)).toMatchObject({
      wallet: 'A',
      address: contractAddress,
      entrypoint: 'create_listing',
      args: ['100', '1'],
      options: { amountMutez: 2_000_000 },
    });
  });

  it('runs post-deploy E2E sequence for Bert and Ernie', async () => {
    const { factory, calls } = mockTezosServiceFactory();
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: factory,
    });

    const response = await request(app).post('/api/kiln/e2e/run').send({
      contractAddress,
      steps: [
        {
          label: 'Bert step',
          wallet: 'A',
          entrypoint: 'mint',
          args: ['1'],
        },
        {
          label: 'Ernie step',
          wallet: 'B',
          entrypoint: 'mint',
          args: ['1'],
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.summary).toEqual({
      total: 2,
      passed: 2,
      failed: 0,
    });
    expect(response.body.results).toEqual([
      expect.objectContaining({
        label: 'Bert step',
        wallet: 'A',
        status: 'passed',
      }),
      expect.objectContaining({
        label: 'Ernie step',
        wallet: 'B',
        status: 'passed',
      }),
    ]);
    expect(calls.execute).toEqual([
      {
        wallet: 'A',
        address: contractAddress,
        entrypoint: 'mint',
        args: ['1'],
        options: { amountMutez: undefined },
      },
      {
        wallet: 'B',
        address: contractAddress,
        entrypoint: 'mint',
        args: ['1'],
        options: { amountMutez: undefined },
      },
    ]);
  });

  it('runs multi-target E2E steps with per-step payable amounts', async () => {
    const { factory, calls } = mockTezosServiceFactory();
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: factory,
    });

    const otherContract = 'KT1SxqT3TUF44syQ5QauuF9L8upWjr4ayVoq';
    const response = await request(app).post('/api/kiln/e2e/run').send({
      steps: [
        {
          label: 'Pay listing',
          wallet: 'A',
          targetContractAddress: otherContract,
          entrypoint: 'create_listing',
          args: ['100', '1'],
          amountMutez: 3_000_000,
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.results[0]).toEqual(
      expect.objectContaining({
        contractAddress: otherContract,
        status: 'passed',
      }),
    );
    expect(calls.execute.at(-1)).toMatchObject({
      wallet: 'A',
      address: otherContract,
      entrypoint: 'create_listing',
      args: ['100', '1'],
      options: { amountMutez: 3_000_000 },
    });
  });

  it('fails live E2E assertions closed until runtime readers exist', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).post('/api/kiln/e2e/run').send({
      contractAddress,
      steps: [
        {
          label: 'Assert storage',
          wallet: 'A',
          entrypoint: 'mint',
          args: [],
          assertions: [{ kind: 'storage', path: ['counter'], equals: 1 }],
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.results[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('no-stub policy'),
      }),
    );
  });

  it('continues E2E run when one step fails', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: (wallet: WalletType) => ({
        async getAddress() {
          return wallet === 'A' ? walletAAddress : walletBAddress;
        },
        async getBalance() {
          return wallet === 'A' ? 10.5 : 4.25;
        },
        async validateOrigination() {
          return {
            gasLimit: 350_000,
            storageLimit: 40_000,
            suggestedFeeMutez: 65_000,
            minimalFeeMutez: 45_000,
          };
        },
        async originateContract() {
          return contractAddress;
        },
        async callContract() {
          if (wallet === 'B') {
            throw new Error('Simulated puppet wallet failure');
          }
          return {
            hash: 'opSuccess',
            level: 777,
            status: 'applied',
          };
        },
      }),
    });

    const response = await request(app).post('/api/kiln/e2e/run').send({
      contractAddress,
      steps: [
        {
          label: 'Bert step',
          wallet: 'A',
          entrypoint: 'mint',
          args: [],
        },
        {
          label: 'Ernie step',
          wallet: 'B',
          entrypoint: 'mint',
          args: [],
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
    });
    expect(response.body.results).toEqual([
      expect.objectContaining({
        label: 'Bert step',
        wallet: 'A',
        status: 'passed',
      }),
      expect.objectContaining({
        label: 'Ernie step',
        wallet: 'B',
        status: 'failed',
        error: 'Simulated puppet wallet failure',
      }),
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
      networkId: 'tezos-shadownet',
      ecosystem: 'tezos',
      puppetsAvailable: true,
      walletA: { address: walletAAddress, balance: 10.5 },
      walletB: { address: walletBAddress, balance: 4.25 },
    });
  });

  it('returns 500 when balance lookup fails', async () => {
    const app = createApiApp({
      env: baseEnv(),
      createTezosService: (_wallet: WalletType) => ({
        async getAddress() {
          return walletAAddress;
        },
        async getBalance() {
          throw new Error('Balance RPC failure');
        },
        async validateOrigination() {
          return {
            gasLimit: 350_000,
            storageLimit: 40_000,
            suggestedFeeMutez: 65_000,
            minimalFeeMutez: 45_000,
          };
        },
        async originateContract() {
          return contractAddress;
        },
        async callContract() {
          return {
            hash: 'opHash',
            level: 1,
            status: 'applied',
          };
        },
      }),
    });

    const response = await request(app).get('/api/kiln/balances');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Balance RPC failure');
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
      .set('x-kiln-token', 'super-secret')
      .send({
        code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
        initialStorage: 'Unit',
        wallet: 'A',
      });

    expect(authorized.status).toBe(200);
    const authorizedBalances = await request(app)
      .get('/api/kiln/balances')
      .set('x-kiln-token', 'super-secret');
    expect(authorizedBalances.status).toBe(200);
  });

  it('keeps protected routes authenticated when API_AUTH_TOKEN is configured', async () => {
    const app = createApiApp({
      env: baseEnv({
        API_AUTH_TOKEN: 'super-secret',
        KILN_API_AUTH_REQUIRED: false,
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const unauthorized = await request(app).post('/api/kiln/upload').send({
      code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      initialStorage: 'Unit',
      wallet: 'A',
    });

    expect(unauthorized.status).toBe(401);

    const upload = await request(app)
      .post('/api/kiln/upload')
      .set('x-kiln-token', 'super-secret')
      .send({
        code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
        initialStorage: 'Unit',
        wallet: 'A',
      });

    expect(upload.status).toBe(200);

    const capabilities = await request(app).get('/api/kiln/capabilities');
    expect(capabilities.body.runtime.auth).toEqual({
      required: true,
      tokenConfigured: true,
      mode: 'token',
    });
  });

  it('fails closed when token auth is forced without a configured API_AUTH_TOKEN', async () => {
    const app = createApiApp({
      env: baseEnv({
        API_AUTH_TOKEN: undefined,
        KILN_API_AUTH_REQUIRED: true,
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const response = await request(app).get('/api/kiln/balances');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe(
      'API auth is required but API_AUTH_TOKEN is not configured.',
    );
  });

  it('logs in with a connected wallet, approves MCP access, and serves MCP tools with a 24h token', async () => {
    const fixedNow = new Date('2026-05-04T12:00:00.000Z');
    let now = fixedNow;
    const userDbPath = join(tmpdir(), `kiln-users-${randomUUID()}.json`);

    try {
      const app = createApiApp({
        env: {
          ...baseEnv(),
          KILN_USER_DB_PATH: userDbPath,
        } as AppEnv,
        createTezosService: mockTezosServiceFactory().factory,
        createEtherlinkService: () =>
          ({
            async estimateDeploy() {
              return {
                gasLimit: 21_000n,
                baseFeePerGas: 1n,
                maxFeePerGas: 2n,
                maxPriorityFeePerGas: 1n,
                maxWeiCost: 42_000n,
                maxXtzCost: '0.000000000000042',
              };
            },
            async dryRunDeploy() {
              return { ok: true, reverted: false, error: null };
            },
            async getBalance() {
              return '1.5';
            },
            async getChainId() {
              return 127823;
            },
          }) as never,
        compileSmartPy: async () => ({
          scenario: 'default',
          michelson: sampleMichelson,
          initialStorage: 'Unit',
        }),
        exportBundle: async () => ({
          bundleId: 'bundle-mcp-test',
          exportDir: '/tmp/kiln-bundle',
          zipFileName: 'bundle-mcp-test.zip',
          zipPath: '/tmp/kiln-bundle/bundle-mcp-test.zip',
          downloadUrl: '/api/kiln/export/download/bundle-mcp-test.zip',
        }),
        walletSignatureVerifier: async () => true,
        now: () => now,
      } as Parameters<typeof createApiApp>[0] & {
        walletSignatureVerifier: () => Promise<boolean>;
        now: () => Date;
      });

      const challenge = await request(app).post('/api/kiln/auth/challenge').send({
        walletKind: 'tezos',
        walletAddress: walletAAddress,
        networkId: 'tezos-shadownet',
      });

      expect(challenge.status).toBe(200);
      expect(challenge.body.message).toContain(walletAAddress);
      expect(challenge.body.messageBytes).toMatch(/^[0-9a-f]+$/);

      const verified = await request(app).post('/api/kiln/auth/verify').send({
        challengeId: challenge.body.challengeId,
        signature: 'sig-valid-for-test',
        publicKey: 'edpk-test',
      });

      expect(verified.status).toBe(200);
      expect(verified.body.user.walletAddress).toBe(walletAAddress);
      expect(verified.body.sessionToken).toMatch(/^kiln_session_/);

      const access = await request(app)
        .post('/api/kiln/mcp/access/request')
        .set('authorization', `Bearer ${verified.body.sessionToken}`)
        .send();

      expect(access.status).toBe(200);
      expect(access.body.access.status).toBe('approved');
      expect(access.body.access.checkedBy).toBe('kiln-mcp-access-worker');

      const tokenResponse = await request(app)
        .post('/api/kiln/mcp/token')
        .set('authorization', `Bearer ${verified.body.sessionToken}`)
        .send();

      expect(tokenResponse.status).toBe(200);
      expect(tokenResponse.body.token).toMatch(/^kiln_mcp_/);
      expect(tokenResponse.body.expiresAt).toBe('2026-05-05T12:00:00.000Z');

      const initialize = await request(app)
        .post('/mcp')
        .set('authorization', `Bearer ${tokenResponse.body.token}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            clientInfo: { name: 'vitest-agent', version: '1.0.0' },
            capabilities: {},
          },
        });

      expect(initialize.status).toBe(200);
      expect(initialize.body.result.protocolVersion).toBe('2025-06-18');
      expect(initialize.body.result.capabilities.tools).toEqual(
        expect.objectContaining({ listChanged: false }),
      );

      const tools = await request(app)
        .post('/mcp')
        .set('authorization', `Bearer ${tokenResponse.body.token}`)
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

      expect(tools.status).toBe(200);
      expect(tools.body.result.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'kiln_get_capabilities' }),
          expect.objectContaining({ name: 'kiln_run_workflow' }),
          expect.objectContaining({ name: 'kiln_compile_solidity' }),
        ]),
      );

      const toolCall = await request(app)
        .post('/mcp')
        .set('authorization', `Bearer ${tokenResponse.body.token}`)
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'kiln_get_capabilities',
            arguments: { networkId: 'etherlink-shadownet' },
          },
        });

      expect(toolCall.status).toBe(200);
      expect(toolCall.body.result.content[0].type).toBe('text');
      const parsedToolResult = JSON.parse(toolCall.body.result.content[0].text);
      expect(parsedToolResult.success).toBe(true);
      expect(parsedToolResult.runtime.network.id).toBe('etherlink-shadownet');

      const callTool = async (name: string, args: unknown = {}) => {
        const response = await request(app)
          .post('/mcp')
          .set('authorization', `Bearer ${tokenResponse.body.token}`)
          .send({
            jsonrpc: '2.0',
            id: `tool-${name}`,
            method: 'tools/call',
            params: { name, arguments: args },
          });
        expect(response.status).toBe(200);
        expect(response.body.result.isError).toBeUndefined();
        return JSON.parse(response.body.result.content[0].text);
      };

      await callTool('kiln_get_health');
      await callTool('kiln_list_networks');
      await callTool('kiln_get_openapi');
      await callTool('kiln_list_reference_contracts');
      await callTool('kiln_get_guided_elements', { contractType: 'nft_collection' });
      await callTool('kiln_create_guided_contract', {
        contractType: 'nft_collection',
        projectName: 'MCP Mint',
        adminAddress: walletAAddress,
        outputFormat: 'smartpy',
      });
      await callTool('kiln_compile_smartpy', {
        source: 'import smartpy as sp',
      });
      await callTool('kiln_run_workflow', {
        sourceType: 'michelson',
        source: sampleMichelson,
        initialStorage: 'Unit',
        simulationSteps: sampleSimulationSteps(),
      });
      await callTool('kiln_run_audit', {
        sourceType: 'michelson',
        source: sampleMichelson,
      });
      await callTool('kiln_run_simulation', {
        sourceType: 'michelson',
        source: sampleMichelson,
        simulationSteps: sampleSimulationSteps(),
      });
      await callTool('kiln_run_shadowbox', {
        sourceType: 'michelson',
        source: sampleMichelson,
        initialStorage: 'Unit',
        simulationSteps: sampleSimulationSteps(),
      });
      await callTool('kiln_validate_predeploy', {
        code: sampleMichelson,
        initialStorage: 'Unit',
      });
      await callTool('kiln_deploy_tezos_puppet', {
        code: sampleMichelson,
        wallet: 'A',
        initialStorage: 'Unit',
      });
      await callTool('kiln_execute_tezos_puppet', {
        contractAddress,
        entrypoint: 'mint',
        args: [walletAAddress, 1],
        wallet: 'A',
      });
      await callTool('kiln_run_tezos_e2e', {
        contractAddress,
        steps: [
          {
            wallet: 'A',
            entrypoint: 'mint',
            args: [walletAAddress, 1],
          },
        ],
      });
      await callTool('kiln_get_balances');
      await callTool('kiln_compile_solidity', {
        networkId: 'etherlink-shadownet',
        source:
          'pragma solidity ^0.8.20; contract Demo { uint256 public x; constructor(uint256 value) { x = value; } }',
      });
      await callTool('kiln_estimate_evm_deploy', {
        networkId: 'etherlink-shadownet',
        bytecode: '0x6000',
      });
      await callTool('kiln_dry_run_evm_deploy', {
        networkId: 'etherlink-shadownet',
        bytecode: '0x6000',
      });
      await callTool('kiln_get_evm_balance', {
        networkId: 'etherlink-shadownet',
        address: '0x1111111111111111111111111111111111111111',
      });
      await callTool('kiln_export_bundle', {
        projectName: 'MCP Bundle',
        sourceType: 'michelson',
        source: sampleMichelson,
        compiledMichelson: sampleMichelson,
        initialStorage: 'Unit',
      });

      now = new Date('2026-05-05T12:00:01.000Z');
      const expired = await request(app)
        .post('/mcp')
        .set('authorization', `Bearer ${tokenResponse.body.token}`)
        .send({ jsonrpc: '2.0', id: 4, method: 'tools/list' });

      expect(expired.status).toBe(401);
    } finally {
      await fs.rm(userDbPath, { force: true });
    }
  });

  it('blocks MCP access when the wallet is on the blocklist', async () => {
    const userDbPath = join(tmpdir(), `kiln-users-${randomUUID()}.json`);
    const app = createApiApp({
      env: {
        ...baseEnv(),
        KILN_USER_DB_PATH: userDbPath,
        KILN_MCP_BLOCKLIST: walletAAddress,
      } as AppEnv,
      createTezosService: mockTezosServiceFactory().factory,
      walletSignatureVerifier: async () => true,
    } as Parameters<typeof createApiApp>[0] & {
      walletSignatureVerifier: () => Promise<boolean>;
    });

    const challenge = await request(app).post('/api/kiln/auth/challenge').send({
      walletKind: 'tezos',
      walletAddress: walletAAddress,
      networkId: 'tezos-shadownet',
    });
    const verified = await request(app).post('/api/kiln/auth/verify').send({
      challengeId: challenge.body.challengeId,
      signature: 'sig-valid-for-test',
      publicKey: 'edpk-test',
    });

    const access = await request(app)
      .post('/api/kiln/mcp/access/request')
      .set('authorization', `Bearer ${verified.body.sessionToken}`)
      .send();

    expect(access.status).toBe(403);
    expect(access.body.access.status).toBe('blocked');
    expect(access.body.error).toMatch(/blocklist/i);

    const token = await request(app)
      .post('/api/kiln/mcp/token')
      .set('authorization', `Bearer ${verified.body.sessionToken}`)
      .send();

    expect(token.status).toBe(403);
    await fs.rm(userDbPath, { force: true });
  });
});
