import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { ZodError } from 'zod';
import { executePayloadSchema, uploadPayloadSchema } from './lib/api-schemas.js';
import { getEnv, parseCorsOrigins, type AppEnv } from './lib/env.js';
import { injectKilnTokens } from './lib/kiln-injector.js';
import { parseEntrypointsFromMichelson } from './lib/michelson-parser.js';
import { TezosService, type TezosServiceLike } from './lib/tezos-service.js';
import type { WalletType } from './lib/types.js';

interface ApiAppOptions {
  env?: AppEnv;
  createTezosService?: (wallet: WalletType) => TezosServiceLike;
}

function validationErrorMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function createApiApp(options: ApiAppOptions = {}) {
  const runtimeEnv = options.env ?? getEnv();
  const createTezosService =
    options.createTezosService ??
    ((wallet: WalletType) => new TezosService(wallet, runtimeEnv));

  const app = express();
  const corsOrigins = parseCorsOrigins(runtimeEnv.CORS_ORIGINS);

  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginResourcePolicy:
        runtimeEnv.NODE_ENV === 'production' ? { policy: 'same-site' } : false,
    }),
  );
  app.use(
    cors(
      corsOrigins.length === 0
        ? undefined
        : {
            origin(origin, callback) {
              if (!origin || corsOrigins.includes(origin)) {
                callback(null, true);
                return;
              }
              callback(new Error(`Origin ${origin} is not allowed by CORS`));
            },
            credentials: true,
          },
    ),
  );
  app.use(express.json({ limit: runtimeEnv.API_JSON_LIMIT }));

  const requireApiToken: RequestHandler = (req, res, next) => {
    if (!runtimeEnv.API_AUTH_TOKEN) {
      next();
      return;
    }

    const token = req.header('x-api-token');
    if (token !== runtimeEnv.API_AUTH_TOKEN) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };

  const mutationLimiter = rateLimit({
    windowMs: runtimeEnv.API_RATE_LIMIT_WINDOW_MS,
    max: runtimeEnv.API_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded' },
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      network: runtimeEnv.TEZOS_RPC_URL,
      chainId: runtimeEnv.TEZOS_CHAIN_ID ?? null,
    });
  });

  app.post('/api/kiln/upload', requireApiToken, mutationLimiter, async (req, res) => {
    const payload = uploadPayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({
        error: validationErrorMessage(payload.error),
      });
      return;
    }

    try {
      const injectedCode = injectKilnTokens(
        payload.data.code,
        runtimeEnv.KILN_DUMMY_TOKENS,
      );
      const tezosService = createTezosService(payload.data.wallet);
      const contractAddress = await tezosService.originateContract(
        injectedCode,
        payload.data.initialStorage,
      );

      res.json({
        success: true,
        contractAddress,
        injectedCode,
        entrypoints: parseEntrypointsFromMichelson(payload.data.code),
      });
    } catch (error) {
      console.error('Upload Error:', error);
      res.status(500).json({ error: asMessage(error) });
    }
  });

  app.post('/api/kiln/execute', requireApiToken, mutationLimiter, async (req, res) => {
    const payload = executePayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({
        error: validationErrorMessage(payload.error),
      });
      return;
    }

    try {
      const tezosService = createTezosService(payload.data.wallet);
      const result = await tezosService.callContract(
        payload.data.contractAddress,
        payload.data.entrypoint,
        payload.data.args,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Execute Error:', error);
      res.status(500).json({ error: asMessage(error) });
    }
  });

  app.get('/api/kiln/balances', requireApiToken, async (_req, res) => {
    try {
      const tezosServiceA = createTezosService('A');
      const tezosServiceB = createTezosService('B');

      const [addressA, balanceA, addressB, balanceB] = await Promise.all([
        tezosServiceA.getAddress(),
        tezosServiceA.getBalance(),
        tezosServiceB.getAddress(),
        tezosServiceB.getBalance(),
      ]);

      res.json({
        walletA: { address: addressA, balance: balanceA },
        walletB: { address: addressB, balance: balanceB },
      });
    } catch (error) {
      console.error('Balances Error:', error);
      res.status(500).json({ error: asMessage(error) });
    }
  });

  return app;
}
