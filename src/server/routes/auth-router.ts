import { Router, type Request } from 'express';
import { z } from 'zod';
import { networkIdSchema } from '../../lib/api-schemas.js';
import type { KilnUser } from '../../lib/kiln-users.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage, validationErrorMessage } from '../http.js';

const walletKindSchema = z.enum(['tezos', 'evm']);

const challengePayloadSchema = z.object({
  walletKind: walletKindSchema,
  walletAddress: z.string().trim().min(1).max(128),
  networkId: networkIdSchema,
});

const verifyPayloadSchema = z.object({
  challengeId: z.string().trim().uuid(),
  signature: z.string().trim().min(1).max(512),
  publicKey: z.string().trim().min(1).max(128).optional(),
});

const profilePayloadSchema = z.object({
  handle: z.string().trim().max(64).optional(),
});

const linkWalletPayloadSchema = verifyPayloadSchema.extend({
  label: z.string().trim().max(80).optional(),
});

const projectStorePayloadSchema = z.object({
  projectStore: z.unknown(),
});

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  const headerToken = req.header('x-kiln-session');
  return headerToken?.trim() || null;
}

async function requireUserSession(
  req: Request,
  services: ApiAppServices,
): Promise<KilnUser | null> {
  const token = bearerToken(req);
  if (!token) {
    return null;
  }
  return services.userStore.getUserForSession(token);
}

function publicUser(user: KilnUser) {
  return {
    id: user.id,
    handle: user.handle ?? '',
    walletKind: user.walletKind,
    walletAddress: user.walletAddress,
    lastLoginNetworkId: user.lastLoginNetworkId,
    lastLoginWalletKind: user.lastLoginWalletKind ?? user.walletKind,
    lastLoginWalletAddress: user.lastLoginWalletAddress ?? user.walletAddress,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    linkedWallets: (user.linkedWallets ?? []).map((wallet) => ({
      id: wallet.id,
      walletKind: wallet.walletKind,
      walletAddress: wallet.walletAddress,
      networkId: wallet.networkId,
      label: wallet.label,
      addedAt: wallet.addedAt,
      verifiedAt: wallet.verifiedAt,
      lastLoginAt: wallet.lastLoginAt,
    })),
    access: user.access,
    currentMcpToken: user.currentMcpToken
      ? {
          id: user.currentMcpToken.id,
          createdAt: user.currentMcpToken.createdAt,
          expiresAt: user.currentMcpToken.expiresAt,
          revokedAt: user.currentMcpToken.revokedAt,
        }
      : null,
    currentApiToken: user.currentApiToken
      ? {
          id: user.currentApiToken.id,
          createdAt: user.currentApiToken.createdAt,
          expiresAt: user.currentApiToken.expiresAt,
          revokedAt: user.currentApiToken.revokedAt,
        }
      : null,
    projectStoreUpdatedAt: user.projectStore?.updatedAt ?? null,
  };
}

export function createAuthRouter(services: ApiAppServices): Router {
  const router = Router();

  router.post('/api/kiln/auth/challenge', async (req, res) => {
    const payload = challengePayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: validationErrorMessage(payload.error) });
      return;
    }

    try {
      const challenge = await services.userStore.createChallenge(payload.data);
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'wallet_auth_challenge',
        walletKind: challenge.walletKind,
        walletAddress: challenge.walletAddress,
        networkId: challenge.networkId,
      });
      res.json({
        success: true,
        challengeId: challenge.id,
        walletKind: challenge.walletKind,
        walletAddress: challenge.walletAddress,
        networkId: challenge.networkId,
        message: challenge.message,
        messageBytes: challenge.messageBytes,
        expiresAt: challenge.expiresAt,
      });
    } catch (error) {
      res.status(500).json({ error: asMessage(error) });
    }
  });

  router.post('/api/kiln/auth/verify', async (req, res) => {
    const payload = verifyPayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: validationErrorMessage(payload.error) });
      return;
    }

    try {
      const result = await services.userStore.verifyChallenge(payload.data);
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'wallet_auth_verified',
        userId: result.user.id,
        walletKind: result.user.walletKind,
        walletAddress: result.user.walletAddress,
      });
      res.json({
        success: true,
        sessionToken: result.sessionToken,
        expiresAt: result.session.expiresAt,
        user: publicUser(result.user),
      });
    } catch (error) {
      res.status(401).json({ error: asMessage(error) });
    }
  });

  router.get('/api/kiln/me', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }
    res.json({ success: true, user: publicUser(user) });
  });

  router.put('/api/kiln/me', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }
    const payload = profilePayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: validationErrorMessage(payload.error) });
      return;
    }

    try {
      const updated = await services.userStore.updateUserProfile(user.id, payload.data);
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'account_profile_saved',
        userId: user.id,
        walletKind: user.walletKind,
        walletAddress: user.walletAddress,
      });
      res.json({ success: true, user: publicUser(updated) });
    } catch (error) {
      res.status(500).json({ error: asMessage(error) });
    }
  });

  router.post('/api/kiln/wallets/link', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }
    const payload = linkWalletPayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: validationErrorMessage(payload.error) });
      return;
    }

    try {
      const updated = await services.userStore.linkWalletToUser(user.id, payload.data);
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'wallet_linked_to_account',
        userId: user.id,
        walletKind: updated.lastLoginWalletKind ?? user.walletKind,
        walletAddress: updated.lastLoginWalletAddress ?? user.walletAddress,
      });
      res.json({ success: true, user: publicUser(updated) });
    } catch (error) {
      res.status(409).json({ error: asMessage(error) });
    }
  });

  router.get('/api/kiln/projects', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }
    const projectStore = await services.userStore.getProjectStore(user.id);
    res.json({
      success: true,
      projectStore: projectStore?.data ?? null,
      updatedAt: projectStore?.updatedAt ?? null,
    });
  });

  router.put('/api/kiln/projects', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }
    const payload = projectStorePayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({ error: validationErrorMessage(payload.error) });
      return;
    }

    try {
      const projectStore = await services.userStore.saveProjectStore(
        user.id,
        payload.data.projectStore,
      );
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'project_store_saved',
        userId: user.id,
        walletKind: user.walletKind,
        walletAddress: user.walletAddress,
      });
      res.json({
        success: true,
        updatedAt: projectStore?.updatedAt ?? null,
      });
    } catch (error) {
      res.status(500).json({ error: asMessage(error) });
    }
  });

  router.get('/api/kiln/mcp/status', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }
    res.json({ success: true, access: user.access, user: publicUser(user) });
  });

  router.post('/api/kiln/mcp/access/request', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }

    try {
      const access = await services.userStore.requestMcpAccess(user.id);
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'mcp_access_checked',
        userId: user.id,
        walletKind: user.walletKind,
        walletAddress: user.walletAddress,
        status: access.status,
        checkedBy: access.checkedBy,
      });
      const statusCode = access.status === 'blocked' ? 403 : 200;
      res.status(statusCode).json({
        success: access.status === 'approved',
        access,
        error: access.status === 'blocked' ? access.reason : undefined,
      });
    } catch (error) {
      res.status(500).json({ error: asMessage(error) });
    }
  });

  router.post('/api/kiln/mcp/token', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }

    try {
      const result = await services.userStore.generateMcpToken(user.id);
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'mcp_token_generated',
        userId: result.user.id,
        walletKind: result.user.walletKind,
        walletAddress: result.user.walletAddress,
        tokenId: result.tokenRecord.id,
        expiresAt: result.tokenRecord.expiresAt,
      });
      res.json({
        success: true,
        token: result.token,
        tokenId: result.tokenRecord.id,
        expiresAt: result.tokenRecord.expiresAt,
        user: publicUser(result.user),
      });
    } catch (error) {
      res.status(403).json({ error: asMessage(error) });
    }
  });

  router.post('/api/kiln/api-key', async (req, res) => {
    const user = await requireUserSession(req, services);
    if (!user) {
      res.status(401).json({ error: 'Wallet login required.' });
      return;
    }

    try {
      const result = await services.userStore.generateApiToken(user.id);
      services.activityLogger.log({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId as string | undefined,
        event: 'api_key_generated',
        userId: result.user.id,
        walletKind: result.user.walletKind,
        walletAddress: result.user.walletAddress,
        tokenId: result.tokenRecord.id,
        expiresAt: result.tokenRecord.expiresAt,
      });
      res.json({
        success: true,
        token: result.token,
        tokenId: result.tokenRecord.id,
        expiresAt: result.tokenRecord.expiresAt,
        user: publicUser(result.user),
      });
    } catch (error) {
      res.status(403).json({ error: asMessage(error) });
    }
  });

  return router;
}
