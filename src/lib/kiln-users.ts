import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getPkhfromPk, stringToBytes, verifySignature } from '@taquito/utils';
import { verifyMessage } from 'viem';
import type { AppEnv } from './env.js';
import type { KilnNetworkId } from './networks.js';

export type WalletKind = 'tezos' | 'evm';
export type McpAccessStatus = 'none' | 'pending' | 'approved' | 'blocked';

export interface WalletSignatureVerificationInput {
  walletKind: WalletKind;
  walletAddress: string;
  message: string;
  messageBytes: string;
  networkId?: KilnNetworkId;
  signature: string;
  publicKey?: string;
}

export type WalletSignatureVerifier = (
  input: WalletSignatureVerificationInput,
) => Promise<boolean> | boolean;

export interface KilnUser {
  id: string;
  walletKind: WalletKind;
  walletAddress: string;
  normalizedWalletAddress: string;
  publicKey?: string;
  lastLoginNetworkId?: KilnNetworkId;
  createdAt: string;
  lastLoginAt: string;
  access: {
    status: McpAccessStatus;
    requestedAt?: string;
    checkedAt?: string;
    checkedBy?: string;
    reason?: string;
  };
  currentMcpToken?: {
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
  };
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface AuthChallenge {
  id: string;
  walletKind: WalletKind;
  walletAddress: string;
  normalizedWalletAddress: string;
  networkId?: KilnNetworkId;
  nonce: string;
  message: string;
  messageBytes: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export interface McpTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
}

interface KilnUserDatabase {
  version: 1;
  users: KilnUser[];
  challenges: AuthChallenge[];
  sessions: UserSession[];
  mcpTokens: McpTokenRecord[];
}

export interface KilnUserStoreOptions {
  env: Pick<
    AppEnv,
    | 'KILN_USER_DB_PATH'
    | 'KILN_MCP_ACCESSLIST'
    | 'KILN_MCP_BLOCKLIST'
    | 'KILN_MCP_TOKEN_TTL_HOURS'
    | 'KILN_SESSION_TTL_MINUTES'
  >;
  now?: () => Date;
  walletSignatureVerifier?: WalletSignatureVerifier;
}

export interface VerifiedMcpToken {
  token: McpTokenRecord;
  user: KilnUser;
}

const ACCESS_WORKER_NAME = 'kiln-mcp-access-worker';
const CHALLENGE_TTL_MINUTES = 10;

function emptyDb(): KilnUserDatabase {
  return {
    version: 1,
    users: [],
    challenges: [],
    sessions: [],
    mcpTokens: [],
  };
}

function cloneUser(user: KilnUser): KilnUser {
  return JSON.parse(JSON.stringify(user)) as KilnUser;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function createSecret(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function normalizeWalletAddress(
  walletKind: WalletKind,
  walletAddress: string,
): string {
  const trimmed = walletAddress.trim();
  return walletKind === 'evm' ? trimmed.toLowerCase() : trimmed;
}

function buildChallengeMessage(input: {
  walletKind: WalletKind;
  walletAddress: string;
  networkId?: KilnNetworkId;
  nonce: string;
  expiresAt: string;
}): string {
  return [
    'Kiln MCP login',
    `Wallet kind: ${input.walletKind}`,
    `Wallet: ${input.walletAddress}`,
    `Network: ${input.networkId ?? 'unspecified'}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt}`,
    'Purpose: authenticate this wallet for Kiln settings and MCP token generation.',
  ].join('\n');
}

export function buildTezosMichelineSigningPayload(message: string): string {
  const messageBytes = stringToBytes(message);
  const byteLength = messageBytes.length / 2;
  return `0501${byteLength.toString(16).padStart(8, '0')}${messageBytes}`;
}

function parseAccessList(raw?: string): Array<{ walletKind?: WalletKind; address: string }> {
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const prefixed = entry.match(/^(tezos|evm):(.+)$/i);
      if (prefixed) {
        const rawWalletKind = prefixed[1];
        const rawAddress = prefixed[2];
        if (!rawWalletKind || !rawAddress) {
          return { address: entry };
        }
        const walletKind = rawWalletKind.toLowerCase() as WalletKind;
        return {
          walletKind,
          address: normalizeWalletAddress(walletKind, rawAddress),
        };
      }
      return { address: entry };
    });
}

function accessEntryMatches(
  entry: { walletKind?: WalletKind; address: string },
  walletKind: WalletKind,
  normalizedWalletAddress: string,
): boolean {
  if (entry.walletKind && entry.walletKind !== walletKind) {
    return false;
  }
  const normalizedEntryAddress = entry.walletKind
    ? entry.address
    : normalizeWalletAddress(walletKind, entry.address);
  return normalizedEntryAddress === normalizedWalletAddress;
}

export async function defaultWalletSignatureVerifier(
  input: WalletSignatureVerificationInput,
): Promise<boolean> {
  try {
    if (input.walletKind === 'tezos') {
      if (!input.publicKey) {
        return false;
      }
      const pkh = getPkhfromPk(input.publicKey);
      if (pkh !== input.walletAddress) {
        return false;
      }
      for (const payload of [
        input.messageBytes,
        buildTezosMichelineSigningPayload(input.message),
      ]) {
        try {
          if (verifySignature(payload, input.publicKey, input.signature)) {
            return true;
          }
        } catch {
          /* Try the next supported Beacon payload shape. */
        }
      }
      return false;
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(input.walletAddress)) {
      return false;
    }
    return verifyMessage({
      address: input.walletAddress as `0x${string}`,
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export class KilnUserStore {
  private readonly filePath: string;
  private readonly accessList: Array<{ walletKind?: WalletKind; address: string }>;
  private readonly blockList: Array<{ walletKind?: WalletKind; address: string }>;
  private readonly tokenTtlHours: number;
  private readonly sessionTtlMinutes: number;
  private readonly now: () => Date;
  private readonly walletSignatureVerifier: WalletSignatureVerifier;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(options: KilnUserStoreOptions) {
    this.filePath =
      options.env.KILN_USER_DB_PATH?.trim() ||
      resolve(process.cwd(), 'data', 'kiln-users.json');
    this.accessList = parseAccessList(options.env.KILN_MCP_ACCESSLIST);
    this.blockList = parseAccessList(options.env.KILN_MCP_BLOCKLIST);
    this.tokenTtlHours = options.env.KILN_MCP_TOKEN_TTL_HOURS;
    this.sessionTtlMinutes = options.env.KILN_SESSION_TTL_MINUTES;
    this.now = options.now ?? (() => new Date());
    this.walletSignatureVerifier =
      options.walletSignatureVerifier ?? defaultWalletSignatureVerifier;
  }

  get path(): string {
    return this.filePath;
  }

  async createChallenge(input: {
    walletKind: WalletKind;
    walletAddress: string;
    networkId?: KilnNetworkId;
  }): Promise<AuthChallenge> {
    return this.mutate((db) => {
      const now = this.now();
      const expiresAt = addMinutes(now, CHALLENGE_TTL_MINUTES).toISOString();
      const nonce = randomBytes(16).toString('base64url');
      const normalizedWalletAddress = normalizeWalletAddress(
        input.walletKind,
        input.walletAddress,
      );
      const message = buildChallengeMessage({
        walletKind: input.walletKind,
        walletAddress: input.walletAddress.trim(),
        networkId: input.networkId,
        nonce,
        expiresAt,
      });
      const challenge: AuthChallenge = {
        id: randomUUID(),
        walletKind: input.walletKind,
        walletAddress: input.walletAddress.trim(),
        normalizedWalletAddress,
        networkId: input.networkId,
        nonce,
        message,
        messageBytes: stringToBytes(message),
        createdAt: now.toISOString(),
        expiresAt,
      };
      db.challenges.push(challenge);
      this.pruneExpired(db, now);
      return challenge;
    });
  }

  async verifyChallenge(input: {
    challengeId: string;
    signature: string;
    publicKey?: string;
  }): Promise<{ sessionToken: string; session: UserSession; user: KilnUser }> {
    return this.mutate(async (db) => {
      const now = this.now();
      this.pruneExpired(db, now);
      const challenge = db.challenges.find((row) => row.id === input.challengeId);
      if (!challenge || challenge.usedAt) {
        throw new Error('Login challenge is missing or already used.');
      }
      if (Date.parse(challenge.expiresAt) <= now.getTime()) {
        throw new Error('Login challenge has expired.');
      }

      const verified = await this.walletSignatureVerifier({
        walletKind: challenge.walletKind,
        walletAddress: challenge.walletAddress,
        networkId: challenge.networkId,
        message: challenge.message,
        messageBytes: challenge.messageBytes,
        signature: input.signature,
        publicKey: input.publicKey,
      });
      if (!verified) {
        throw new Error('Wallet signature verification failed.');
      }

      challenge.usedAt = now.toISOString();
      let user = db.users.find(
        (row) =>
          row.walletKind === challenge.walletKind &&
          row.normalizedWalletAddress === challenge.normalizedWalletAddress,
      );
      if (!user) {
        user = {
          id: randomUUID(),
          walletKind: challenge.walletKind,
          walletAddress: challenge.walletAddress,
          normalizedWalletAddress: challenge.normalizedWalletAddress,
          createdAt: now.toISOString(),
          lastLoginAt: now.toISOString(),
          access: { status: 'none' },
        };
        db.users.push(user);
      }
      user.walletAddress = challenge.walletAddress;
      user.lastLoginNetworkId = challenge.networkId;
      user.lastLoginAt = now.toISOString();
      if (input.publicKey) {
        user.publicKey = input.publicKey;
      }

      const sessionToken = createSecret('kiln_session');
      const session: UserSession = {
        id: randomUUID(),
        userId: user.id,
        tokenHash: tokenHash(sessionToken),
        createdAt: now.toISOString(),
        expiresAt: addMinutes(now, this.sessionTtlMinutes).toISOString(),
      };
      db.sessions.push(session);

      return {
        sessionToken,
        session: { ...session },
        user: cloneUser(user),
      };
    });
  }

  async getUserForSession(sessionToken: string): Promise<KilnUser | null> {
    const db = await this.readDb();
    const nowMs = this.now().getTime();
    const hash = tokenHash(sessionToken);
    const session = db.sessions.find(
      (row) => row.tokenHash === hash && !row.revokedAt && Date.parse(row.expiresAt) > nowMs,
    );
    if (!session) {
      return null;
    }
    const user = db.users.find((row) => row.id === session.userId);
    return user ? cloneUser(user) : null;
  }

  async getUserById(userId: string): Promise<KilnUser | null> {
    const db = await this.readDb();
    const user = db.users.find((row) => row.id === userId);
    return user ? cloneUser(user) : null;
  }

  async requestMcpAccess(userId: string): Promise<KilnUser['access']> {
    return this.mutate((db) => {
      const now = this.now();
      const user = this.requireUser(db, userId);
      user.access = {
        status: 'pending',
        requestedAt: now.toISOString(),
        checkedAt: now.toISOString(),
        checkedBy: ACCESS_WORKER_NAME,
      };

      const blocked = this.blockList.some((entry) =>
        accessEntryMatches(entry, user.walletKind, user.normalizedWalletAddress),
      );
      if (blocked) {
        user.access = {
          ...user.access,
          status: 'blocked',
          reason: 'Wallet is present on the MCP blocklist.',
        };
        this.revokeUserTokens(db, user.id, now.toISOString());
        return { ...user.access };
      }

      const matchedAccessList = this.accessList.some((entry) =>
        accessEntryMatches(entry, user.walletKind, user.normalizedWalletAddress),
      );

      user.access = {
        ...user.access,
        status: 'approved',
        reason: matchedAccessList
          ? 'Wallet matched the MCP accesslist.'
          : 'Wallet is verified and not present on the MCP blocklist.',
      };
      return { ...user.access };
    });
  }

  async generateMcpToken(userId: string): Promise<{
    token: string;
    tokenRecord: McpTokenRecord;
    user: KilnUser;
  }> {
    return this.mutate((db) => {
      const now = this.now();
      const user = this.requireUser(db, userId);
      if (user.access.status !== 'approved') {
        throw new Error('MCP access is not approved for this wallet.');
      }

      this.revokeUserTokens(db, user.id, now.toISOString());
      const token = createSecret('kiln_mcp');
      const tokenRecord: McpTokenRecord = {
        id: randomUUID(),
        userId: user.id,
        tokenHash: tokenHash(token),
        createdAt: now.toISOString(),
        expiresAt: addHours(now, this.tokenTtlHours).toISOString(),
      };
      db.mcpTokens.push(tokenRecord);
      user.currentMcpToken = {
        id: tokenRecord.id,
        createdAt: tokenRecord.createdAt,
        expiresAt: tokenRecord.expiresAt,
      };
      return {
        token,
        tokenRecord: { ...tokenRecord },
        user: cloneUser(user),
      };
    });
  }

  async verifyMcpToken(token: string): Promise<VerifiedMcpToken | null> {
    return this.mutate((db) => {
      const now = this.now();
      this.pruneExpired(db, now);
      const hash = tokenHash(token);
      const record = db.mcpTokens.find(
        (row) =>
          row.tokenHash === hash &&
          !row.revokedAt &&
          Date.parse(row.expiresAt) > now.getTime(),
      );
      if (!record) {
        return null;
      }
      const user = db.users.find((row) => row.id === record.userId);
      if (!user || user.access.status !== 'approved') {
        return null;
      }
      record.lastUsedAt = now.toISOString();
      return {
        token: { ...record },
        user: cloneUser(user),
      };
    });
  }

  private requireUser(db: KilnUserDatabase, userId: string): KilnUser {
    const user = db.users.find((row) => row.id === userId);
    if (!user) {
      throw new Error('User session is no longer valid.');
    }
    return user;
  }

  private revokeUserTokens(
    db: KilnUserDatabase,
    userId: string,
    revokedAt: string,
  ): void {
    for (const token of db.mcpTokens) {
      if (token.userId === userId && !token.revokedAt) {
        token.revokedAt = revokedAt;
      }
    }
    const user = db.users.find((row) => row.id === userId);
    if (user?.currentMcpToken && !user.currentMcpToken.revokedAt) {
      user.currentMcpToken.revokedAt = revokedAt;
    }
  }

  private pruneExpired(db: KilnUserDatabase, now: Date): void {
    const cutoff = now.getTime();
    db.challenges = db.challenges.filter(
      (challenge) => !challenge.usedAt && Date.parse(challenge.expiresAt) > cutoff,
    );
    db.sessions = db.sessions.filter(
      (session) => !session.revokedAt && Date.parse(session.expiresAt) > cutoff,
    );
  }

  private async mutate<T>(
    mutator: (db: KilnUserDatabase) => T | Promise<T>,
  ): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const db = await this.readDb();
      const result = await mutator(db);
      await this.writeDb(db);
      return result;
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async readDb(): Promise<KilnUserDatabase> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<KilnUserDatabase>;
      return {
        version: 1,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        mcpTokens: Array.isArray(parsed.mcpTokens) ? parsed.mcpTokens : [],
      };
    } catch (error) {
      const maybeError = error as NodeJS.ErrnoException;
      if (maybeError.code === 'ENOENT') {
        return emptyDb();
      }
      throw error;
    }
  }

  private async writeDb(db: KilnUserDatabase): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  }
}

export function createKilnUserStore(options: KilnUserStoreOptions): KilnUserStore {
  return new KilnUserStore(options);
}
