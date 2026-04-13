import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { ZodError } from 'zod';
import {
  e2eRunPayloadSchema,
  executePayloadSchema,
  predeployValidationPayloadSchema,
  uploadPayloadSchema,
} from './lib/api-schemas.js';
import { getEnv, parseCorsOrigins, type AppEnv } from './lib/env.js';
import { injectKilnTokens, resolveDummyTokens } from './lib/kiln-injector.js';
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

function hasMichelsonSection(code: string, section: 'parameter' | 'storage' | 'code'): boolean {
  const pattern = new RegExp(`\\b${section}\\b`, 'i');
  return pattern.test(code);
}

function isWildcardOriginPattern(pattern: string): boolean {
  return /^https?:\/\/\*\./i.test(pattern);
}

function matchesWildcardOrigin(origin: string, pattern: string): boolean {
  const match = pattern.match(/^(https?):\/\/\*\.(.+)$/i);
  if (!match) {
    return false;
  }

  const protocol = `${match[1]}:`;
  const hostSuffix = match[2]?.toLowerCase();
  if (!hostSuffix) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.toLowerCase();
    return (
      parsedOrigin.protocol === protocol &&
      hostname.endsWith(`.${hostSuffix}`)
    );
  } catch {
    return false;
  }
}

function isAllowedCorsOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === origin) {
      return true;
    }

    if (isWildcardOriginPattern(allowedOrigin)) {
      return matchesWildcardOrigin(origin, allowedOrigin);
    }

    return false;
  });
}

function getTokenHealth(env: AppEnv) {
  try {
    const resolved = resolveDummyTokens(env);
    return {
      source: resolved.source,
      ...resolved.byTier,
    };
  } catch {
    return {
      source: null,
      bronze: null,
      silver: null,
      gold: null,
      platinum: null,
      diamond: null,
    };
  }
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
      contentSecurityPolicy:
        runtimeEnv.NODE_ENV === 'production' ? undefined : false,
      crossOriginResourcePolicy:
        runtimeEnv.NODE_ENV === 'production' ? { policy: 'same-site' } : false,
    }),
  );
  if (corsOrigins.length === 0) {
    if (runtimeEnv.NODE_ENV !== 'production') {
      app.use(cors());
    }
  } else {
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin || isAllowedCorsOrigin(origin, corsOrigins)) {
            callback(null, true);
            return;
          }
          callback(new Error(`Origin ${origin} is not allowed by CORS`));
        },
        credentials: true,
      }),
    );
  }
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
      tokens: getTokenHealth(runtimeEnv),
    });
  });

  app.post(
    '/api/kiln/predeploy/validate',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = predeployValidationPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      const code = payload.data.code;
      const entrypoints = parseEntrypointsFromMichelson(code);
      const checks = {
        hasParameterSection: hasMichelsonSection(code, 'parameter'),
        hasStorageSection: hasMichelsonSection(code, 'storage'),
        hasCodeSection: hasMichelsonSection(code, 'code'),
      };

      const issues: string[] = [];
      const warnings: string[] = [];

      if (!checks.hasParameterSection) {
        issues.push('Missing Michelson parameter section.');
      }
      if (!checks.hasStorageSection) {
        issues.push('Missing Michelson storage section.');
      }
      if (!checks.hasCodeSection) {
        issues.push('Missing Michelson code section.');
      }
      if (entrypoints.length === 0) {
        warnings.push(
          'No annotated entrypoints were detected. Dynamic rig actions may be limited.',
        );
      }

      let injectedCode = code;
      try {
        injectedCode = injectKilnTokens(code, runtimeEnv);
      } catch (error) {
        warnings.push(
          `Kiln token injection check skipped: ${asMessage(error)}`,
        );
      }

      let estimate:
        | {
            gasLimit: number;
            storageLimit: number;
            suggestedFeeMutez: number;
            minimalFeeMutez: number;
          }
        | null = null;
      try {
        const tezosService = createTezosService('A');
        estimate = await tezosService.validateOrigination(
          injectedCode,
          payload.data.initialStorage,
        );
      } catch (error) {
        const message = asMessage(error);
        if (message.includes('Secret key for Wallet')) {
          warnings.push(
            `RPC origination estimate skipped: ${message}`,
          );
        } else {
          issues.push(`Origination estimate failed: ${message}`);
        }
      }

      res.json({
        success: true,
        valid: issues.length === 0,
        issues,
        warnings,
        entrypoints,
        injectedCode,
        estimate,
        checks,
      });
    },
  );

  app.post('/api/kiln/upload', requireApiToken, mutationLimiter, async (req, res) => {
    const payload = uploadPayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({
        error: validationErrorMessage(payload.error),
      });
      return;
    }

    try {
      const injectedCode = injectKilnTokens(payload.data.code, runtimeEnv);
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

  app.post('/api/kiln/e2e/run', requireApiToken, mutationLimiter, async (req, res) => {
    const payload = e2eRunPayloadSchema.safeParse(req.body);
    if (!payload.success) {
      res.status(400).json({
        error: validationErrorMessage(payload.error),
      });
      return;
    }

    const results: Array<{
      label: string;
      wallet: WalletType;
      entrypoint: string;
      status: 'passed' | 'failed';
      hash?: string;
      level?: number;
      error?: string;
    }> = [];

    for (const [index, step] of payload.data.steps.entries()) {
      const label = step.label?.trim() || `Step ${index + 1}`;
      try {
        const tezosService = createTezosService(step.wallet);
        const result = await tezosService.callContract(
          payload.data.contractAddress,
          step.entrypoint,
          step.args,
        );
        results.push({
          label,
          wallet: step.wallet,
          entrypoint: step.entrypoint,
          status: 'passed',
          hash: result.hash,
          level: result.level,
        });
      } catch (error) {
        results.push({
          label,
          wallet: step.wallet,
          entrypoint: step.entrypoint,
          status: 'failed',
          error: asMessage(error),
        });
      }
    }

    const passed = results.filter((result) => result.status === 'passed').length;
    const failed = results.length - passed;

    res.json({
      success: failed === 0,
      contractAddress: payload.data.contractAddress,
      summary: {
        total: results.length,
        passed,
        failed,
      },
      results,
    });
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
