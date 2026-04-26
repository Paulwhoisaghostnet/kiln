import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAddresses = vi.fn();
const sendTransaction = vi.fn();
const waitForTransactionReceipt = vi.fn();
const encodeDeployData = vi.fn(() => '0xdeploydata');

vi.mock('viem', () => ({
  createWalletClient: vi.fn(() => ({ getAddresses, sendTransaction })),
  createPublicClient: vi.fn(() => ({ waitForTransactionReceipt })),
  custom: vi.fn(() => ({ kind: 'custom-transport' })),
  defineChain: vi.fn((chain) => chain),
  encodeDeployData,
  http: vi.fn((url) => ({ kind: 'http-transport', url })),
}));

const walletAddress = '0x1111111111111111111111111111111111111111' as const;

function installProvider(request: ReturnType<typeof vi.fn>) {
  Object.defineProperty(globalThis, 'window', {
    value: { ethereum: { request } },
    configurable: true,
  });
}

describe('evm-wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('reports no provider when running without browser ethereum', async () => {
    const { connectEvmWallet, getConnectedEvmWallet, hasInjectedEvmProvider } = await import(
      '../src/lib/evm-wallet.js'
    );

    expect(hasInjectedEvmProvider()).toBe(false);
    await expect(getConnectedEvmWallet('etherlink-testnet')).resolves.toBeNull();
    await expect(connectEvmWallet('etherlink-testnet')).rejects.toThrow(/No EVM wallet detected/);
  });

  it('rejects active connection when wallet returns no accounts', async () => {
    const request = vi.fn().mockResolvedValueOnce([]);
    installProvider(request);
    const { connectEvmWallet } = await import('../src/lib/evm-wallet.js');

    await expect(connectEvmWallet('etherlink-testnet')).rejects.toThrow(
      /returned no accounts/,
    );
  });

  it('connects without chain switching when wallet is already on Etherlink', async () => {
    const request = vi.fn().mockResolvedValueOnce([walletAddress]).mockResolvedValueOnce('0x1f47b');
    installProvider(request);
    const { connectEvmWallet } = await import('../src/lib/evm-wallet.js');

    await expect(connectEvmWallet('etherlink-testnet')).resolves.toMatchObject({
      address: walletAddress,
      chainId: 128123,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('rethrows wallet chain switch failures other than unknown-chain', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce([walletAddress])
      .mockResolvedValueOnce('0x1')
      .mockRejectedValueOnce(Object.assign(new Error('user rejected'), { code: 4001 }));
    installProvider(request);
    const { connectEvmWallet } = await import('../src/lib/evm-wallet.js');

    await expect(connectEvmWallet('etherlink-testnet')).rejects.toThrow(/user rejected/);
  });

  it('connects to Etherlink and adds the chain when wallet has not seen it', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce([walletAddress])
      .mockResolvedValueOnce('0x1')
      .mockRejectedValueOnce({ code: 4902 })
      .mockResolvedValueOnce(null);
    installProvider(request);
    const { connectEvmWallet, hasInjectedEvmProvider } = await import('../src/lib/evm-wallet.js');

    await expect(connectEvmWallet('etherlink-testnet')).resolves.toEqual({
      address: walletAddress,
      networkId: 'etherlink-testnet',
      chainId: 128123,
      rpcUrl: 'https://node.ghostnet.etherlink.com',
    });

    expect(hasInjectedEvmProvider()).toBe(true);
    expect(request).toHaveBeenNthCalledWith(3, {
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1f47b' }],
    });
    expect(request).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ method: 'wallet_addEthereumChain' }),
    );
  });

  it('returns null for passive wallet state when connected to non-EVM network', async () => {
    const request = vi.fn().mockResolvedValueOnce([walletAddress]);
    installProvider(request);
    const { getConnectedEvmWallet } = await import('../src/lib/evm-wallet.js');

    await expect(getConnectedEvmWallet('tezos-shadownet')).resolves.toBeNull();
  });

  it('reads passive wallet state when account and chain are already available', async () => {
    const request = vi.fn().mockResolvedValueOnce([walletAddress]).mockResolvedValueOnce('0xa729');
    installProvider(request);
    const { getConnectedEvmWallet } = await import('../src/lib/evm-wallet.js');

    await expect(getConnectedEvmWallet('etherlink-mainnet')).resolves.toEqual({
      address: walletAddress,
      networkId: 'etherlink-mainnet',
      chainId: 42793,
      rpcUrl: 'https://node.mainnet.etherlink.com',
    });
  });

  it('deploys bytecode through the injected wallet and validates receipt contract address', async () => {
    const request = vi.fn();
    installProvider(request);
    getAddresses.mockResolvedValueOnce([walletAddress]);
    sendTransaction.mockResolvedValueOnce('0xabc');
    waitForTransactionReceipt.mockResolvedValueOnce({
      contractAddress: '0x2222222222222222222222222222222222222222',
      blockNumber: 123n,
    });
    const { deployEvmContract } = await import('../src/lib/evm-wallet.js');

    await expect(
      deployEvmContract({
        networkId: 'etherlink-mainnet',
        bytecode: '0x6000',
        abi: [],
        constructorArgs: [1],
      }),
    ).resolves.toEqual({
      transactionHash: '0xabc',
      contractAddress: '0x2222222222222222222222222222222222222222',
      blockNumber: 123n,
    });
    expect(encodeDeployData).toHaveBeenCalledWith({
      abi: [],
      bytecode: '0x6000',
      args: [1],
    });
  });

  it('throws when deployed receipt omits the contract address', async () => {
    const request = vi.fn();
    installProvider(request);
    getAddresses.mockResolvedValueOnce([walletAddress]);
    sendTransaction.mockResolvedValueOnce('0xdead');
    waitForTransactionReceipt.mockResolvedValueOnce({ blockNumber: 99n });
    const { deployEvmContract } = await import('../src/lib/evm-wallet.js');

    await expect(
      deployEvmContract({
        networkId: 'etherlink-testnet',
        bytecode: '0x6000',
        abi: [],
      }),
    ).rejects.toThrow(/contractAddress missing/);
  });

  it('throws when deploy starts without a selected wallet account', async () => {
    const request = vi.fn();
    installProvider(request);
    getAddresses.mockResolvedValueOnce([]);
    const { deployEvmContract, disconnectEvmWallet } = await import('../src/lib/evm-wallet.js');

    await expect(
      deployEvmContract({
        networkId: 'etherlink-testnet',
        bytecode: '0x6000',
        abi: [],
      }),
    ).rejects.toThrow(/No wallet account available/);
    await expect(disconnectEvmWallet()).resolves.toBeUndefined();
  });
});
