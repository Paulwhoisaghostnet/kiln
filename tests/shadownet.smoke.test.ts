import { describe, expect, it } from 'vitest';
import { getEnv } from '../src/lib/env.js';
import { TezosService } from '../src/lib/tezos-service.js';

const runSmoke =
  process.env.RUN_SHADOWNET_TESTS === 'true' ? it : it.skip;

describe('shadownet smoke', () => {
  runSmoke('reads both wallet balances from configured shadownet RPC', async () => {
    const env = getEnv();
    const walletA = new TezosService('A', env);
    const walletB = new TezosService('B', env);

    const [balanceA, balanceB] = await Promise.all([
      walletA.getBalance(),
      walletB.getBalance(),
    ]);

    expect(balanceA).toBeGreaterThanOrEqual(0);
    expect(balanceB).toBeGreaterThanOrEqual(0);
  });
});
