import dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { getEnv } from '../src/lib/env.js';
import { TezosService } from '../src/lib/tezos-service.js';
import { resolveDummyTokens } from '../src/lib/kiln-injector.js';

dotenv.config();

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

  runSmoke('verifies configured dummy token contracts exist on shadownet', async () => {
    const env = getEnv();
    const addresses = resolveDummyTokens(env).ordered;
    expect(addresses.length).toBeGreaterThan(0);

    const checks = await Promise.all(
      addresses.map(async (address) => {
        const res = await fetch(
          `${env.TEZOS_RPC_URL}/chains/main/blocks/head/context/contracts/${address}/script`,
        );
        return { address, status: res.status };
      }),
    );

    for (const check of checks) {
      expect(check.status, `Expected ${check.address} to exist`).toBe(200);
    }
  });
});
