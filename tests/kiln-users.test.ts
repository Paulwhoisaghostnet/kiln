import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTezosMichelineSigningPayload,
  createKilnUserStore,
  defaultWalletSignatureVerifier,
} from '../src/lib/kiln-users.js';
import { stringToBytes } from '@taquito/utils';

const tempDirs: string[] = [];

async function tempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), 'kiln-users-test-'));
  tempDirs.push(dir);
  return join(dir, 'users.json');
}

function baseEnv(overrides: Record<string, string | number | undefined> = {}) {
  return {
    KILN_USER_DB_PATH: overrides.KILN_USER_DB_PATH as string | undefined,
    KILN_MCP_ACCESSLIST: overrides.KILN_MCP_ACCESSLIST as string | undefined,
    KILN_MCP_BLOCKLIST: overrides.KILN_MCP_BLOCKLIST as string | undefined,
    KILN_MCP_TOKEN_TTL_HOURS: 24,
    KILN_SESSION_TTL_MINUTES: 240,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('KilnUserStore', () => {
  it('verifies Beacon Micheline signed Tezos login payloads', async () => {
    const message = 'hello';
    expect(buildTezosMichelineSigningPayload(message)).toBe('05010000000568656c6c6f');

    const verified = await defaultWalletSignatureVerifier({
      walletKind: 'tezos',
      walletAddress: 'tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn',
      message,
      messageBytes: stringToBytes(message),
      publicKey: 'edpkvKGguLyTmpUGy1EERyMEv9oxrFfnjpavZakV2ZRmBHmDQCbvMv',
      signature:
        'sigf9LeXMu58ac69eebM7v16JQ56VYsBHaUg96DRuHFWgmX4WYMuTj5XrFmPmv4U5955nVVYqvDt4poq64DSuyv3jXMaahQV',
    });

    expect(verified).toBe(true);
  });

  it('approves verified wallets even when an accesslist is configured', async () => {
    const store = createKilnUserStore({
      env: baseEnv({
        KILN_USER_DB_PATH: await tempDbPath(),
        KILN_MCP_ACCESSLIST: 'tezos:tz1-not-this-wallet',
      }),
      walletSignatureVerifier: () => true,
    });

    const challenge = await store.createChallenge({
      walletKind: 'tezos',
      walletAddress: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      networkId: 'tezos-shadownet',
    });
    const { user } = await store.verifyChallenge({
      challengeId: challenge.id,
      signature: 'sig',
      publicKey: 'pk',
    });
    const access = await store.requestMcpAccess(user.id);

    expect(user.lastLoginNetworkId).toBe('tezos-shadownet');
    expect(access.status).toBe('approved');
    expect(access.reason).toBe('Wallet is verified and not present on the MCP blocklist.');
  });

  it('keeps blocklisted wallets blocked', async () => {
    const store = createKilnUserStore({
      env: baseEnv({
        KILN_USER_DB_PATH: await tempDbPath(),
        KILN_MCP_BLOCKLIST: 'tezos:tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      }),
      walletSignatureVerifier: () => true,
    });

    const challenge = await store.createChallenge({
      walletKind: 'tezos',
      walletAddress: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
      networkId: 'tezos-shadownet',
    });
    const { user } = await store.verifyChallenge({
      challengeId: challenge.id,
      signature: 'sig',
      publicKey: 'pk',
    });
    const access = await store.requestMcpAccess(user.id);

    expect(access.status).toBe('blocked');
    expect(access.reason).toBe('Wallet is present on the MCP blocklist.');
  });
});
