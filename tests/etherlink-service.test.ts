import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../src/lib/env.js';

const getBalance = vi.fn();
const getChainId = vi.fn();
const estimateGas = vi.fn();
const getBlock = vi.fn();
const getFeeHistory = vi.fn();
const call = vi.fn();

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    getBalance,
    getChainId,
    estimateGas,
    getBlock,
    getFeeHistory,
    call,
  })),
  defineChain: vi.fn((chain) => chain),
  http: vi.fn((url) => ({ kind: 'http-transport', url })),
}));

const env: AppEnv = {
  NODE_ENV: 'test',
  PORT: 3001,
  KILN_NETWORK: 'etherlink-shadownet',
  TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
  TEZOS_CHAIN_ID: undefined,
  TEZOS_MAINNET_RPC_URL: undefined,
  TEZOS_GHOSTNET_RPC_URL: undefined,
  ETHERLINK_SHADOWNET_RPC_URL: 'https://etherlink.example.test',
  ETHERLINK_MAINNET_RPC_URL: 'https://etherlink.example.mainnet',
  WALLET_A_SECRET_KEY: 'edskA',
  WALLET_B_SECRET_KEY: 'edskB',
  KILN_DUMMY_TOKENS: undefined,
  KILN_TOKEN_BRONZE: undefined,
  KILN_TOKEN_SILVER: undefined,
  KILN_TOKEN_GOLD: undefined,
  KILN_TOKEN_PLATINUM: undefined,
  KILN_TOKEN_DIAMOND: undefined,
  API_AUTH_TOKEN: undefined,
  API_RATE_LIMIT_WINDOW_MS: 60_000,
  API_RATE_LIMIT_MAX: 100,
  API_JSON_LIMIT: '10mb',
  CORS_ORIGINS: undefined,
  KILN_REQUIRE_SIM_CLEARANCE: false,
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
  KILN_ACTIVITY_LOG_PATH: undefined,
  KILN_USER_DB_PATH: undefined,
  KILN_MCP_ACCESSLIST: undefined,
  KILN_MCP_BLOCKLIST: undefined,
  KILN_MCP_TOKEN_TTL_HOURS: 24,
  KILN_SESSION_TTL_MINUTES: 240,
  KILN_PYTHON: undefined,
  KILN_EXPORT_ROOT: undefined,
  KILN_REFERENCE_ROOT: undefined,
  KILN_REFERENCE_MAX_FILES: 200,
  KILN_REFERENCE_MAX_BYTES: 200 * 1024 * 1024,
};

describe('EtherlinkService', () => {
  it('rejects Tezos networks so EVM calls stay on Etherlink rails', async () => {
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');

    expect(() => new EtherlinkService(env, 'tezos-shadownet')).toThrow(
      /requires an 'etherlink' ecosystem network/,
    );
  });

  it('formats native balances with 18 decimals', async () => {
    getBalance.mockResolvedValueOnce(1234500000000000000n);
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');
    const service = new EtherlinkService(env, 'etherlink-shadownet');

    await expect(service.getBalance('0x1111111111111111111111111111111111111111')).resolves.toBe(
      '1.2345',
    );
  });

  it('formats whole and negative unit values without trailing dust', async () => {
    getBalance.mockResolvedValueOnce(1000000000000000000n).mockResolvedValueOnce(-1200000000000000000n);
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');
    const service = new EtherlinkService(env, 'etherlink-shadownet');

    await expect(service.getBalance('0x1111111111111111111111111111111111111111')).resolves.toBe('1');
    await expect(service.getBalance('0x1111111111111111111111111111111111111111')).resolves.toBe('-1.2');
  });

  it('estimates deploy cost with fee history tips and constructor calldata', async () => {
    estimateGas.mockResolvedValueOnce(21_000n);
    getBlock.mockResolvedValueOnce({ baseFeePerGas: 10n });
    getFeeHistory.mockResolvedValueOnce({ reward: [[1n], [5n], [3n]] });
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');
    const service = new EtherlinkService(env, 'etherlink-shadownet');

    await expect(
      service.estimateDeploy({
        from: '0x1111111111111111111111111111111111111111',
        bytecode: '0x6000',
        constructorCalldata: '0x1234',
      }),
    ).resolves.toMatchObject({
      gasLimit: 21_000n,
      baseFeePerGas: 10n,
      maxPriorityFeePerGas: 5n,
      maxFeePerGas: 25n,
      maxWeiCost: 525_000n,
      maxXtzCost: '0.000000000000525',
    });
    expect(estimateGas).toHaveBeenCalledWith({
      account: '0x1111111111111111111111111111111111111111',
      data: '0x60001234',
    });
  });

  it('falls back to default gas and tip when the RPC refuses optional estimate data', async () => {
    estimateGas.mockRejectedValueOnce(new Error('estimate refused'));
    getBlock.mockResolvedValueOnce({});
    getFeeHistory.mockRejectedValueOnce(new Error('fee history refused'));
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');
    const service = new EtherlinkService(env, 'etherlink-shadownet');

    await expect(service.estimateDeploy({ bytecode: '0x6000' })).resolves.toMatchObject({
      gasLimit: 3_000_000n,
      baseFeePerGas: 0n,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 1_000_000_000n,
      maxWeiCost: 3_000_000_000_000_000n,
      maxXtzCost: '0.003',
    });
  });

  it('normalizes zero fee-history tips to the default priority fee', async () => {
    estimateGas.mockResolvedValueOnce(30_000n);
    getBlock.mockResolvedValueOnce({ baseFeePerGas: 7n });
    getFeeHistory.mockResolvedValueOnce({ reward: [[0n]] });
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');
    const service = new EtherlinkService(env, 'etherlink-shadownet');

    await expect(service.estimateDeploy({ bytecode: '0x6000' })).resolves.toMatchObject({
      gasLimit: 30_000n,
      baseFeePerGas: 7n,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 1_000_000_014n,
    });
  });

  it('reports dry-run runtime bytecode length or revert reason', async () => {
    call.mockResolvedValueOnce({ data: '0x60016002' });
    call.mockRejectedValueOnce(new Error('execution reverted: nope\nstack'));
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');
    const service = new EtherlinkService(env, 'etherlink-shadownet');

    await expect(service.dryRunDeploy({ bytecode: '0x6000' })).resolves.toEqual({
      ok: true,
      runtimeBytecodeLength: 4,
    });
    await expect(service.dryRunDeploy({ bytecode: '0x6000' })).resolves.toEqual({
      ok: false,
      reason: 'execution reverted: nope',
    });
  });

  it('handles empty dry-run data and non-Error rejections', async () => {
    call.mockResolvedValueOnce({});
    call.mockRejectedValueOnce('reverted');
    const { EtherlinkService } = await import('../src/lib/etherlink-service.js');
    const service = new EtherlinkService(env, 'etherlink-shadownet');

    await expect(service.dryRunDeploy({ bytecode: '0x6000' })).resolves.toEqual({
      ok: true,
      runtimeBytecodeLength: 0,
    });
    await expect(service.dryRunDeploy({ bytecode: '0x6000' })).resolves.toEqual({
      ok: false,
      reason: 'Constructor reverted or RPC refused call',
    });
  });

  it('classifies Etherlink network ids', async () => {
    const { isEtherlinkNetwork } = await import('../src/lib/etherlink-service.js');

    expect(isEtherlinkNetwork('etherlink-mainnet')).toBe(true);
    expect(isEtherlinkNetwork('tezos-mainnet')).toBe(false);
  });
});
