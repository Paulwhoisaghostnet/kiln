import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockAccount {
  address: string;
  network?: {
    type?: string;
    name?: string;
    rpcUrl?: string;
  };
}

interface MockOperation {
  opHash: string;
  confirmation: (confirmations: number) => Promise<
    | {
        block: {
          header: {
            level: number;
          };
        };
      }
    | undefined
  >;
  contract: () => Promise<{ address: string }>;
  operationResults?: unknown;
  opResponse?: unknown;
}

class LocalStorageMock {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const mocks = vi.hoisted(() => {
  const state: {
    activeAccount: MockAccount | null;
    grantedAccount: MockAccount | null;
    chainId: string;
    operation: MockOperation;
    setWalletProvider: ReturnType<typeof vi.fn>;
    requestPermissions: ReturnType<typeof vi.fn>;
    clearActiveAccount: ReturnType<typeof vi.fn>;
    getActiveAccount: ReturnType<typeof vi.fn>;
    subscribeToEvent: ReturnType<typeof vi.fn>;
    originate: ReturnType<typeof vi.fn>;
    getBlock: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    beaconWalletOptions: unknown[];
    beaconEventHandlers: Map<
      string,
      (account: MockAccount | undefined) => Promise<void> | void
    >;
  } = {
    activeAccount: null,
    grantedAccount: null,
    chainId: 'NetXsqzbfFenSTS',
    operation: {
      opHash: 'opDefault',
      confirmation: async () => ({ block: { header: { level: 1 } } }),
      contract: async () => ({ address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' }),
      operationResults: [],
      opResponse: {},
    },
    setWalletProvider: vi.fn(),
    requestPermissions: vi.fn(async () => {
      state.activeAccount = state.grantedAccount;
    }),
    clearActiveAccount: vi.fn(async () => {
      state.activeAccount = null;
    }),
    getActiveAccount: vi.fn(async () => state.activeAccount),
    subscribeToEvent: vi.fn(
      async (
        event: string,
        handler: (account: MockAccount | undefined) => Promise<void> | void,
      ) => {
        state.beaconEventHandlers.set(event, handler);
      },
    ),
    originate: vi.fn(() => ({
      send: async () => state.operation,
    })),
    getBlock: vi.fn(async () => ({
      hash: 'BLockHash',
      header: { level: 1 },
      operations: [[], [], [], []],
    })),
    open: vi.fn(),
    beaconWalletOptions: [],
    beaconEventHandlers: new Map(),
  };

  class MockBeaconWallet {
    client = {
      getActiveAccount: state.getActiveAccount,
      subscribeToEvent: state.subscribeToEvent,
    };

    constructor(options: unknown) {
      state.beaconWalletOptions.push(options);
    }

    requestPermissions = state.requestPermissions;
    clearActiveAccount = state.clearActiveAccount;
  }

  class MockTezosToolkit {
    rpc = {
      getChainId: vi.fn(async () => state.chainId),
      getBlock: state.getBlock,
    };

    wallet = {
      originate: state.originate,
    };

    constructor(_rpcUrl: string) {}

    setWalletProvider = state.setWalletProvider;
  }

  return {
    state,
    MockBeaconWallet,
    MockTezosToolkit,
  };
});

vi.mock('@taquito/beacon-wallet', () => ({
  BeaconWallet: mocks.MockBeaconWallet,
}));

vi.mock('@taquito/taquito', () => ({
  TezosToolkit: mocks.MockTezosToolkit,
}));

vi.mock('@airgap/beacon-dapp', () => ({
  BeaconEvent: {
    ACTIVE_ACCOUNT_SET: 'ACTIVE_ACCOUNT_SET',
  },
  NetworkType: {
    MAINNET: 'mainnet',
    GHOSTNET: 'ghostnet',
    SHADOWNET: 'shadownet',
    CUSTOM: 'custom',
  },
}));

function setupBrowserStubs() {
  const localStorage = new LocalStorageMock();
  localStorage.setItem('beacon:stale', '1');
  localStorage.setItem('beacon-sdk:stale', '1');
  localStorage.setItem('app:keep', '1');

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: localStorage,
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      open: mocks.state.open,
    },
  });

  return localStorage;
}

beforeEach(() => {
  vi.resetModules();

  mocks.state.chainId = 'NetXsqzbfFenSTS';
  mocks.state.activeAccount = null;
  mocks.state.grantedAccount = {
    address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
    network: {
      name: 'shadownet',
      rpcUrl: 'https://rpc.shadownet.teztnets.com',
    },
  };
  mocks.state.operation = {
    opHash: 'opConnectedOrigination',
    confirmation: async () => ({ block: { header: { level: 4242 } } }),
    contract: async () => ({ address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' }),
    operationResults: [],
    opResponse: {},
  };

  mocks.state.setWalletProvider.mockClear();
  mocks.state.requestPermissions.mockClear();
  mocks.state.clearActiveAccount.mockClear();
  mocks.state.getActiveAccount.mockClear();
  mocks.state.subscribeToEvent.mockClear();
  mocks.state.originate.mockClear();
  mocks.state.getBlock.mockClear();
  mocks.state.open.mockClear();
  mocks.state.beaconWalletOptions = [];
  mocks.state.beaconEventHandlers = new Map();

  setupBrowserStubs();
});

describe('shadownet-wallet', () => {
  it('connects through Beacon without opening the Temple homepage', async () => {
    const localStorage = setupBrowserStubs();
    const walletModule = await import('../src/lib/shadownet-wallet.js');

    const connected = await walletModule.connectShadownetWallet('temple');

    expect(connected).toEqual({
      address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      networkName: 'shadownet',
      networkId: 'tezos-shadownet',
      rpcUrl: 'https://rpc.shadownet.teztnets.com',
    });
    expect(mocks.state.open).not.toHaveBeenCalled();
    expect(mocks.state.requestPermissions).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('beacon:stale')).toBeNull();
    expect(localStorage.getItem('beacon-sdk:stale')).toBeNull();
    expect(localStorage.getItem('app:keep')).toBe('1');
  });

  it('requests the concrete Beacon network type for Shadownet even when mainnet is available', async () => {
    const walletModule = await import('../src/lib/shadownet-wallet.js');

    await walletModule.connectShadownetWallet('temple');

    expect(mocks.state.beaconWalletOptions[0]).toMatchObject({
      network: {
        type: 'shadownet',
        name: 'shadownet',
        rpcUrl: 'https://rpc.shadownet.teztnets.com',
      },
    });
  });

  it('subscribes to Beacon active account changes before reading cached sessions', async () => {
    mocks.state.activeAccount = {
      address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      network: {
        type: 'shadownet',
        name: 'shadownet',
        rpcUrl: 'https://rpc.shadownet.teztnets.com',
      },
    };
    const walletModule = await import('../src/lib/shadownet-wallet.js');

    await walletModule.getConnectedShadownetWallet();

    expect(mocks.state.subscribeToEvent).toHaveBeenCalledWith(
      'ACTIVE_ACCOUNT_SET',
      expect.any(Function),
    );
  });

  it('notifies listeners when Beacon clears the active account', async () => {
    const walletModule = await import('../src/lib/shadownet-wallet.js');
    const sessionUpdates: unknown[] = [];
    const unsubscribe = walletModule.subscribeToShadownetWalletSession((session) => {
      sessionUpdates.push(session);
    });

    await walletModule.connectShadownetWallet('temple');
    const handler = mocks.state.beaconEventHandlers.get('ACTIVE_ACCOUNT_SET');
    expect(handler).toBeTypeOf('function');

    mocks.state.activeAccount = null;
    await handler?.(undefined);

    expect(sessionUpdates).toEqual([null]);
    unsubscribe();
  });

  it('lets Beacon handle Kukai selection and blocks non-shadownet RPC account', async () => {
    mocks.state.grantedAccount = {
      address: 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
      network: {
        name: 'kukai',
        rpcUrl: 'https://kukai.app',
      },
    };

    const walletModule = await import('../src/lib/shadownet-wallet.js');

    await expect(walletModule.connectShadownetWallet('kukai')).rejects.toThrow(
      /Wallet connected to kukai/,
    );
    expect(mocks.state.open).not.toHaveBeenCalled();
  });

  it('rejects connect when chain id does not match shadownet', async () => {
    mocks.state.chainId = 'NetWrongChain';
    const walletModule = await import('../src/lib/shadownet-wallet.js');

    await expect(walletModule.connectShadownetWallet('temple')).rejects.toThrow(
      /Wallet RPC chain mismatch: expected NetXsqzbfFenSTS \(Tezos Shadownet\), got NetWrongChain\./,
    );
  });

  it('returns null when no wallet is currently connected', async () => {
    mocks.state.grantedAccount = null;
    mocks.state.activeAccount = null;

    const walletModule = await import('../src/lib/shadownet-wallet.js');

    const connected = await walletModule.getConnectedShadownetWallet();
    expect(connected).toBeNull();
  });

  it('disconnects active account', async () => {
    const walletModule = await import('../src/lib/shadownet-wallet.js');
    await walletModule.connectShadownetWallet('temple');

    await walletModule.disconnectShadownetWallet();

    expect(mocks.state.clearActiveAccount).toHaveBeenCalledTimes(2);
  });

  it('originates with connected wallet and returns KT1 from operation contract()', async () => {
    const walletModule = await import('../src/lib/shadownet-wallet.js');
    await walletModule.connectShadownetWallet('temple');

    const result = await walletModule.originateWithConnectedWallet(
      'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      'Unit',
    );

    expect(mocks.state.originate).toHaveBeenCalledWith({
      code: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      init: 'Unit',
    });
    expect(result).toEqual({
      hash: 'opConnectedOrigination',
      contractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      level: 4242,
    });
  });

  it('falls back to parsing operation results when contract() lookup fails', async () => {
    mocks.state.operation = {
      opHash: 'opFallbackAddress',
      confirmation: async () => undefined,
      contract: async () => {
        throw new Error('contract lookup unavailable');
      },
      operationResults: [
        {
          metadata: {
            operation_result: {
              originated_contracts: ['KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg'],
            },
          },
        },
      ],
    };

    const walletModule = await import('../src/lib/shadownet-wallet.js');
    await walletModule.connectShadownetWallet('temple');

    const result = await walletModule.originateWithConnectedWallet(
      'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
      'Unit',
    );

    expect(result).toEqual({
      hash: 'opFallbackAddress',
      contractAddress: 'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg',
      level: null,
    });
  });

  it('recovers connected-wallet origination from recent RPC blocks when Taquito confirmation misses inclusion', async () => {
    const originatedAddress = 'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg';
    mocks.state.operation = {
      opHash: 'opRaceIncludedBeforeWatcher',
      confirmation: () => new Promise(() => undefined),
      contract: async () => {
        throw new Error('contract lookup unavailable');
      },
      operationResults: [],
      opResponse: {},
    };
    mocks.state.getBlock.mockResolvedValue({
      hash: 'BLockHashWithOrigination',
      header: { level: 777 },
      operations: [
        [],
        [],
        [],
        [
          {
            hash: 'opRaceIncludedBeforeWatcher',
            contents: [
              {
                kind: 'origination',
                script: {
                  storage: {
                    string: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
                  },
                },
                metadata: {
                  operation_result: {
                    status: 'applied',
                    originated_contracts: [originatedAddress],
                  },
                },
              },
            ],
          },
        ],
      ],
    });

    const walletModule = await import('../src/lib/shadownet-wallet.js');
    await walletModule.connectShadownetWallet('temple');

    const result = await Promise.race([
      walletModule.originateWithConnectedWallet(
        'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
        'Unit',
      ),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('timed out waiting for RPC fallback')), 25);
      }),
    ]);

    expect(result).toEqual({
      hash: 'opRaceIncludedBeforeWatcher',
      contractAddress: originatedAddress,
      level: 777,
    });
  });

  it('blocks connected-wallet origination when Beacon active account is mainnet without a name', async () => {
    mocks.state.activeAccount = {
      address: 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt',
      network: {
        type: 'mainnet',
      },
    };

    const walletModule = await import('../src/lib/shadownet-wallet.js');

    await expect(
      walletModule.originateWithConnectedWallet(
        'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
        'Unit',
        'tezos-shadownet',
      ),
    ).rejects.toThrow(/Wallet connected to mainnet/);
    expect(mocks.state.originate).not.toHaveBeenCalled();
  });

  it('replaces burn placeholder with connected wallet address in initial storage', async () => {
    const walletModule = await import('../src/lib/shadownet-wallet.js');

    const storage = 'Pair "tz1burnburnburnburnburnburnburjAYjjX" 1000';
    const replaced = walletModule.assignConnectedWalletAsAdmin(
      storage,
      'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6',
    );

    expect(replaced).toBe('Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" 1000');
  });
});
