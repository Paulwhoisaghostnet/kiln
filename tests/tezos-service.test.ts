import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../src/lib/env.js';

const mocks = vi.hoisted(() => {
  const setProviderMock = vi.fn();
  const getBalanceMock = vi.fn();
  const getChainIdMock = vi.fn();
  const getConstantsMock = vi.fn();
  const estimateOriginateMock = vi.fn();
  const originateMock = vi.fn();
  const atMock = vi.fn();
  const publicKeyHashMock = vi.fn();

  class MockTezosToolkit {
    tz = { getBalance: getBalanceMock };
    rpc = { getChainId: getChainIdMock, getConstants: getConstantsMock };
    estimate = { originate: estimateOriginateMock };
    contract = { originate: originateMock, at: atMock };
    setProvider = setProviderMock;

    constructor(_rpcUrl: string) {}
  }

  class MockInMemorySigner {
    constructor(_secretKey: string) {}

    publicKeyHash = publicKeyHashMock;
  }

  return {
    setProviderMock,
    getBalanceMock,
    getChainIdMock,
    getConstantsMock,
    estimateOriginateMock,
    originateMock,
    atMock,
    publicKeyHashMock,
    MockTezosToolkit,
    MockInMemorySigner,
  };
});

vi.mock('@taquito/taquito', () => ({
  TezosToolkit: mocks.MockTezosToolkit,
}));

vi.mock('@taquito/signer', () => ({
  InMemorySigner: mocks.MockInMemorySigner,
}));

import { TezosService } from '../src/lib/tezos-service.js';

const baseEnv = (overrides: Partial<AppEnv> = {}): AppEnv => ({
  NODE_ENV: 'test',
  PORT: 3000,
  KILN_NETWORK: 'tezos-shadownet',
  TEZOS_RPC_URL: 'https://rpc.shadownet.teztnets.com',
  TEZOS_CHAIN_ID: 'NetXTestChain',
  WALLET_A_SECRET_KEY: 'edskA',
  WALLET_B_SECRET_KEY: 'edskB',
  KILN_DUMMY_TOKENS: undefined,
  API_AUTH_TOKEN: undefined,
  API_RATE_LIMIT_WINDOW_MS: 60_000,
  API_RATE_LIMIT_MAX: 30,
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
});

describe('TezosService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicKeyHashMock.mockResolvedValue(
      'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
    );
    mocks.getBalanceMock.mockResolvedValue({ toNumber: () => 1_750_000 });
    mocks.getChainIdMock.mockResolvedValue('NetXTestChain');
    mocks.getConstantsMock.mockResolvedValue({
      hard_gas_limit_per_operation: '1040000',
      hard_storage_limit_per_operation: '60000',
    });
    mocks.estimateOriginateMock.mockResolvedValue({
      gasLimit: 380_000,
      storageLimit: 35_000,
      suggestedFeeMutez: 45_000,
      minimalFeeMutez: 40_000,
    });
    mocks.originateMock.mockResolvedValue({
      contract: vi
        .fn()
        .mockResolvedValue({ address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' }),
    });
    mocks.atMock.mockResolvedValue({
      methods: {
        mint: (..._args: unknown[]) => ({
          send: async () => ({
            hash: 'opTestHash',
            status: 'applied',
            confirmation: async () => ({
              block: {
                header: {
                  level: 101,
                },
              },
            }),
          }),
        }),
      },
    });
  });

  it('throws when a wallet secret key is missing', () => {
    expect(
      () =>
        new TezosService(
          'A',
          baseEnv({
            WALLET_A_SECRET_KEY: undefined,
          }),
        ),
    ).toThrow(/Secret key for Wallet A is not configured/);
  });

  it('returns wallet balance in tez', async () => {
    const service = new TezosService('A', baseEnv());
    await expect(service.getBalance()).resolves.toBe(1.75);
  });

  it('originates a contract and returns KT1 address', async () => {
    const service = new TezosService('A', baseEnv());

    const contract = await service.originateContract(
      'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      'Unit',
    );

    expect(contract).toBe('KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton');
    expect(mocks.originateMock).toHaveBeenCalledTimes(1);
    expect(mocks.originateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
        init: 'Unit',
        fee: expect.any(Number),
        gasLimit: expect.any(Number),
        storageLimit: expect.any(Number),
      }),
    );
  });

  it('executes contract calls and returns operation metadata', async () => {
    const service = new TezosService('B', baseEnv());

    const result = await service.callContract(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'mint',
      ['42'],
    );

    expect(result).toEqual({
      hash: 'opTestHash',
      level: 101,
      status: 'applied',
    });
  });

  it('throws when entrypoint does not exist', async () => {
    mocks.atMock.mockResolvedValue({ methods: {} });
    const service = new TezosService('A', baseEnv());

    await expect(
      service.callContract('KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton', 'burn', []),
    ).rejects.toThrow(/Entrypoint burn not found/);
  });

  it('rejects operations when active chain ID mismatches expectation', async () => {
    mocks.getChainIdMock.mockResolvedValue('NetWrongChain');
    const service = new TezosService('A', baseEnv());

    await expect(service.getBalance()).rejects.toThrow(/Chain mismatch detected/);
  });

  it('retries origination when fee is too low', async () => {
    mocks.originateMock
      .mockRejectedValueOnce({
        body: JSON.stringify([
          { id: 'proto.024-PtTALLiN.prefilter.fees_too_low' },
        ]),
      })
      .mockResolvedValueOnce({
        contract: vi
          .fn()
          .mockResolvedValue({ address: 'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg' }),
      });

    const service = new TezosService('A', baseEnv());
    const address = await service.originateContract(
      'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      'Unit',
    );

    expect(address).toBe('KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg');
    expect(mocks.originateMock).toHaveBeenCalledTimes(2);
  });
});
