import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApiApp } from '../src/server-app.js';
import type { AppEnv } from '../src/lib/env.js';
import type { WalletType } from '../src/lib/types.js';

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
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        network: 'https://rpc.shadownet.teztnets.com',
        chainId: 'NetXxyz',
        networkId: 'tezos-shadownet',
        networkLabel: 'Tezos Shadownet',
        ecosystem: 'tezos',
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
        CORS_ORIGINS: 'https://*.netlify.app,https://kiln.example.com',
      }),
      createTezosService: mockTezosServiceFactory().factory,
    });

    const allowedPreview = await request(app)
      .get('/api/health')
      .set('Origin', 'https://deploy-preview-42--kiln.netlify.app');
    expect(allowedPreview.status).toBe(200);
    expect(allowedPreview.headers['access-control-allow-origin']).toBe(
      'https://deploy-preview-42--kiln.netlify.app',
    );

    const blockedOrigin = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(blockedOrigin.status).toBe(500);
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
        expect.objectContaining({ id: 'etherlink-testnet', ecosystem: 'etherlink' }),
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
    expect(response.body.workflowStages).toEqual(
      expect.arrayContaining(['compile_if_needed', 'simulate', 'deploy']),
    );
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
      simulationSteps: [
        {
          wallet: 'bert',
          entrypoint: 'mint',
          args: ['25'],
        },
      ],
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
      simulationSteps: [
        {
          wallet: 'bert',
          entrypoint: 'mint',
          args: ['10'],
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.simulation.success).toBe(true);
    expect(response.body.clearance.approved).toBe(true);
    expect(response.body.clearance.record.id).toMatch(/^clr_/);
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
      simulationSteps: [
        {
          wallet: 'bert',
          entrypoint: 'mint',
          args: ['5'],
        },
      ],
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
      simulationSteps: [
        {
          wallet: 'bert',
          entrypoint: 'mint',
          args: ['5'],
        },
      ],
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
      { name: 'mint', args: [] },
      { name: 'transfer', args: [] },
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
      { name: 'mint', args: [] },
      { name: 'transfer', args: [] },
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
      },
    ]);
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
      },
      {
        wallet: 'B',
        address: contractAddress,
        entrypoint: 'mint',
        args: ['1'],
      },
    ]);
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
});
