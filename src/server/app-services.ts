import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createActivityLogger,
  type ActivityLogger,
} from '../lib/activity-logger.js';
import {
  DeploymentClearanceStore,
} from '../lib/contract-simulation.js';
import {
  createMainnetReadyBundle,
  type BundleExportInput,
  type BundleExportResult,
} from '../lib/bundle-export.js';
import { getEnv, type AppEnv } from '../lib/env.js';
import { injectKilnTokens } from '../lib/kiln-injector.js';
import {
  resolveNetworkConfig,
  type RuntimeNetworkConfig,
} from '../lib/networks.js';
import {
  compileSmartPySource,
  type SmartPyCompilationResult,
} from '../lib/smartpy-compiler.js';
import {
  TezosService,
  type TezosServiceLike,
} from '../lib/tezos-service.js';
import {
  runContractWorkflow,
  type WorkflowRunResult,
} from '../lib/workflow-runner.js';
import type { WalletType } from '../lib/types.js';

export interface ApiAppOptions {
  env?: AppEnv;
  createTezosService?: (wallet: WalletType) => TezosServiceLike;
  compileSmartPy?: (
    source: string,
    scenario?: string,
  ) => Promise<SmartPyCompilationResult>;
  clearanceStore?: DeploymentClearanceStore;
  runWorkflow?: (
    payload: Parameters<typeof runContractWorkflow>[0],
  ) => Promise<WorkflowRunResult>;
  exportBundle?: (
    payload: BundleExportInput,
  ) => Promise<BundleExportResult>;
}

export interface ApiAppServices {
  env: AppEnv;
  runtimeNetwork: RuntimeNetworkConfig;
  activityLogger: ActivityLogger;
  requireApiToken: RequestHandler;
  mutationLimiter: RequestHandler;
  createTezosService: (wallet: WalletType) => TezosServiceLike;
  compileSmartPy: (
    source: string,
    scenario?: string,
  ) => Promise<SmartPyCompilationResult>;
  clearanceStore: DeploymentClearanceStore;
  runWorkflow: (
    payload: Parameters<typeof runContractWorkflow>[0],
  ) => Promise<WorkflowRunResult>;
  exportBundle: (payload: BundleExportInput) => Promise<BundleExportResult>;
}

export function createApiAppServices(
  options: ApiAppOptions = {},
): ApiAppServices {
  const env = options.env ?? getEnv();
  const createTezosService =
    options.createTezosService ??
    ((wallet: WalletType) => new TezosService(wallet, env));
  const compileSmartPy = options.compileSmartPy ?? compileSmartPySource;
  const clearanceStore =
    options.clearanceStore ?? new DeploymentClearanceStore();
  const runWorkflow =
    options.runWorkflow ??
    ((payload) =>
      runContractWorkflow(payload, {
        compileSmartPy,
        injectKilnTokens: (code: string) => injectKilnTokens(code, env),
        estimateOrigination: async (code, initialStorage) => {
          const tezosService = createTezosService('A');
          return tezosService.validateOrigination(code, initialStorage);
        },
        clearanceStore,
      }));
  const exportBundle = options.exportBundle ?? createMainnetReadyBundle;
  const runtimeNetwork = resolveNetworkConfig({
    networkId: env.KILN_NETWORK,
    rpcUrl: env.TEZOS_RPC_URL,
    chainId: env.TEZOS_CHAIN_ID,
  });
  const activityLogger = createActivityLogger(env.KILN_ACTIVITY_LOG_PATH);

  const requireApiToken: RequestHandler = (req, res, next) => {
    if (!env.API_AUTH_TOKEN) {
      next();
      return;
    }

    const token = req.header('x-api-token');
    if (token !== env.API_AUTH_TOKEN) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };

  const mutationLimiter = rateLimit({
    windowMs: env.API_RATE_LIMIT_WINDOW_MS,
    max: env.API_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded' },
  });

  return {
    env,
    runtimeNetwork,
    activityLogger,
    requireApiToken,
    mutationLimiter,
    createTezosService,
    compileSmartPy,
    clearanceStore,
    runWorkflow,
    exportBundle,
  };
}
