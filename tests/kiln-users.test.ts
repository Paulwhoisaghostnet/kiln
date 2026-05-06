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
    NODE_ENV: overrides.NODE_ENV as 'development' | 'test' | 'production' | undefined,
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

  it('persists account project state for verified wallets', async () => {
    const fixedNow = new Date('2026-05-06T17:00:00.000Z');
    const store = createKilnUserStore({
      env: baseEnv({
        KILN_USER_DB_PATH: await tempDbPath(),
      }),
      walletSignatureVerifier: () => true,
      now: () => fixedNow,
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
    const projectStore = {
      projects: [{ id: 'project-1', name: 'WTF in app market' }],
      activeProjectId: 'project-1',
    };

    const saved = await store.saveProjectStore(user.id, projectStore);
    const loaded = await store.getProjectStore(user.id);

    expect(saved).toEqual({
      updatedAt: fixedNow.toISOString(),
      data: projectStore,
    });
    expect(loaded).toEqual(saved);
  });

  it('saves profile handles and lets linked wallets open the same account', async () => {
    const fixedNow = new Date('2026-05-06T18:00:00.000Z');
    const store = createKilnUserStore({
      env: baseEnv({
        KILN_USER_DB_PATH: await tempDbPath(),
      }),
      walletSignatureVerifier: () => true,
      now: () => fixedNow,
    });

    const primaryChallenge = await store.createChallenge({
      walletKind: 'tezos',
      walletAddress: 'tz1PrimaryWallet111111111111111111111',
      networkId: 'tezos-shadownet',
    });
    const { user: primaryUser } = await store.verifyChallenge({
      challengeId: primaryChallenge.id,
      signature: 'sig-primary',
      publicKey: 'pk-primary',
    });
    const profiledUser = await store.updateUserProfile(primaryUser.id, {
      handle: 'wtf-dev',
    });
    await store.saveProjectStore(primaryUser.id, {
      projects: [{ id: 'project-1', name: 'WTF in app market' }],
      activeProjectId: 'project-1',
    });

    const linkedChallenge = await store.createChallenge({
      walletKind: 'tezos',
      walletAddress: 'tz1LinkedWallet2222222222222222222222',
      networkId: 'tezos-shadownet',
    });
    const linkedUser = await store.linkWalletToUser(primaryUser.id, {
      challengeId: linkedChallenge.id,
      signature: 'sig-linked',
      publicKey: 'pk-linked',
      label: 'Shadownet deployer',
    });

    const linkedLoginChallenge = await store.createChallenge({
      walletKind: 'tezos',
      walletAddress: 'tz1LinkedWallet2222222222222222222222',
      networkId: 'tezos-shadownet',
    });
    const { user: linkedLoginUser } = await store.verifyChallenge({
      challengeId: linkedLoginChallenge.id,
      signature: 'sig-linked-login',
      publicKey: 'pk-linked',
    });
    const loaded = await store.getProjectStore(linkedLoginUser.id);

    expect(profiledUser.handle).toBe('wtf-dev');
    expect(linkedUser.linkedWallets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          walletAddress: 'tz1LinkedWallet2222222222222222222222',
          label: 'Shadownet deployer',
        }),
      ]),
    );
    expect(linkedLoginUser.id).toBe(primaryUser.id);
    expect(linkedLoginUser.walletAddress).toBe('tz1PrimaryWallet111111111111111111111');
    expect(linkedLoginUser.lastLoginWalletAddress).toBe(
      'tz1LinkedWallet2222222222222222222222',
    );
    expect(loaded?.data).toMatchObject({
      activeProjectId: 'project-1',
    });
  });

  it('defaults production user state to /var/lib/kiln', () => {
    const store = createKilnUserStore({
      env: baseEnv({ NODE_ENV: 'production' }),
      walletSignatureVerifier: () => true,
    });

    expect(store.path).toBe('/var/lib/kiln/kiln-users.json');
  });
});
