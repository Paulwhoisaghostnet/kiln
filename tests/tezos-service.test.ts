import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../src/lib/env.js';

const mocks = vi.hoisted(() => {
  const setProviderMock = vi.fn();
  const getBalanceMock = vi.fn();
  const getChainIdMock = vi.fn();
  const getConstantsMock = vi.fn();
  const getScriptMock = vi.fn();
  const estimateOriginateMock = vi.fn();
  const originateMock = vi.fn();
  const atMock = vi.fn();
  const publicKeyHashMock = vi.fn();
  const sendMock = vi.fn();

  class MockTezosToolkit {
    tz = { getBalance: getBalanceMock };
    rpc = {
      getChainId: getChainIdMock,
      getConstants: getConstantsMock,
      getScript: getScriptMock,
    };
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
    getScriptMock,
    estimateOriginateMock,
    originateMock,
    atMock,
    publicKeyHashMock,
    sendMock,
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
  KILN_MCP_TOKEN_TTL_HOURS: overrides.KILN_MCP_TOKEN_TTL_HOURS ?? 24,
  KILN_SESSION_TTL_MINUTES: overrides.KILN_SESSION_TTL_MINUTES ?? 240,
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
    mocks.getScriptMock.mockResolvedValue({
      code: [
        {
          prim: 'parameter',
          args: [
            {
              prim: 'or',
              args: [
                { prim: 'unit', annots: ['%default'] },
                {
                  prim: 'pair',
                  annots: ['%purchase'],
                  args: [
                    { prim: 'nat', annots: ['%listing_id'] },
                    { prim: 'nat', annots: ['%amount_wtf_units'] },
                    { prim: 'string', annots: ['%purchase_ref'] },
                  ],
                },
              ],
            },
          ],
        },
      ],
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
    mocks.sendMock.mockResolvedValue({
      hash: 'opTestHash',
      status: 'applied',
      confirmation: async () => ({
        block: {
          header: {
            level: 101,
          },
        },
      }),
    });
    mocks.atMock.mockResolvedValue({
      methods: {
        mint: (..._args: unknown[]) => ({
          send: mocks.sendMock,
        }),
      },
      storage: vi.fn().mockResolvedValue({
        wtf_token_address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
        wtf_token_id: 0,
      }),
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
    expect(mocks.sendMock).toHaveBeenCalledWith(undefined);
  });

  it('passes mutez amount through Taquito send options for payable entrypoints', async () => {
    const service = new TezosService('B', baseEnv());

    await service.callContract(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'mint',
      ['42'],
      { amountMutez: 1_250_000 },
    );

    expect(mocks.sendMock).toHaveBeenCalledWith({ amount: 1_250_000, mutez: true });
  });

  it('executes default-only contracts through methodsObject fallback', async () => {
    mocks.atMock.mockResolvedValue({
      methodsObject: {
        default: (..._args: unknown[]) => ({
          send: mocks.sendMock,
        }),
      },
    });
    const service = new TezosService('B', baseEnv());

    const result = await service.callContract(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'default',
      [],
    );

    expect(result.hash).toBe('opTestHash');
    expect(mocks.sendMock).toHaveBeenCalledWith(undefined);
  });

  it('prefers methodsObject for generated object arguments', async () => {
    const methodsPurchase = vi.fn((..._args: unknown[]) => ({
      send: mocks.sendMock,
    }));
    const methodsObjectPurchase = vi.fn((..._args: unknown[]) => ({
      send: mocks.sendMock,
    }));
    mocks.atMock.mockResolvedValue({
      methods: {
        purchase: methodsPurchase,
      },
      methodsObject: {
        purchase: methodsObjectPurchase,
      },
    });
    const service = new TezosService('B', baseEnv());

    await service.callContract(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'purchase',
      [{ listing_id: 0, amount_wtf_units: 1, purchase_ref: 'kiln-e2e' }],
    );

    expect(methodsPurchase).not.toHaveBeenCalled();
    expect(methodsObjectPurchase).toHaveBeenCalledWith({
      listing_id: 0,
      amount_wtf_units: 1,
      purchase_ref: 'kiln-e2e',
    });
  });

  it('honors explicit methodsObject calls for list parameters', async () => {
    const updateOperators = vi.fn((..._args: unknown[]) => ({
      send: mocks.sendMock,
    }));
    mocks.atMock.mockResolvedValue({
      methodsObject: {
        update_operators: updateOperators,
      },
    });
    const service = new TezosService('B', baseEnv());

    const args = [
      [
        {
          add_operator: {
            owner: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
            operator: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
            token_id: 0,
          },
        },
      ],
    ];
    await service.callContract(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'update_operators',
      args,
      { useMethodsObject: true },
    );

    expect(updateOperators).toHaveBeenCalledWith(args[0]);
  });

  it('reads live contract entrypoint metadata through the RPC script', async () => {
    const service = new TezosService('B', baseEnv());

    const entrypoints = await service.getContractEntrypoints(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
    );

    expect(entrypoints).toEqual([
      expect.objectContaining({
        name: 'purchase',
        sampleJsArgs: [
          {
            listing_id: 0,
            amount_wtf_units: 1,
            purchase_ref: 'kiln-e2e',
          },
        ],
      }),
    ]);
  });

  it('reads contract storage through the contract abstraction', async () => {
    const service = new TezosService('B', baseEnv());

    await expect(
      service.getContractStorage('KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton'),
    ).resolves.toEqual({
      wtf_token_address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      wtf_token_id: 0,
    });
  });

  it('keeps call results usable when Taquito omits confirmation block metadata', async () => {
    mocks.sendMock.mockResolvedValueOnce({
      hash: 'opNoLevelHash',
      status: 'applied',
      confirmation: async () => ({}),
    });
    const service = new TezosService('B', baseEnv());

    const result = await service.callContract(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'mint',
      ['42'],
    );

    expect(result).toEqual({
      hash: 'opNoLevelHash',
      level: null,
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
