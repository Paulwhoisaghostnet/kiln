import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockAccount {
  address: string;
  network?: {
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
    originate: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
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
    originate: vi.fn(() => ({
      send: async () => state.operation,
    })),
    open: vi.fn(),
  };

  class MockBeaconWallet {
    client = {
      getActiveAccount: state.getActiveAccount,
    };

    constructor(_options: unknown) {}

    requestPermissions = state.requestPermissions;
    clearActiveAccount = state.clearActiveAccount;
  }

  class MockTezosToolkit {
    rpc = {
      getChainId: vi.fn(async () => state.chainId),
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
  NetworkType: {
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
  mocks.state.originate.mockClear();
  mocks.state.open.mockClear();

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
      /Chain mismatch: expected NetXsqzbfFenSTS \(Tezos Shadownet\), got NetWrongChain\./,
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
