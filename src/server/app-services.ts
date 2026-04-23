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
import { EtherlinkService } from '../lib/etherlink-service.js';
import { injectKilnTokens } from '../lib/kiln-injector.js';
import {
  resolveNetworkConfig,
  type KilnNetworkId,
  type RuntimeNetworkConfig,
} from '../lib/networks.js';
import {
  compileSmartPySource,
  type SmartPyCompilationResult,
} from '../lib/smartpy-compiler.js';
import {
  TezosService,
  type TezosServiceLike,
  resolveRpcUrlForNetwork,
} from '../lib/tezos-service.js';
import {
  runContractWorkflow,
  type WorkflowRunResult,
} from '../lib/workflow-runner.js';
import type { WalletType } from '../lib/types.js';

export interface ApiAppOptions {
  env?: AppEnv;
  createTezosService?: (wallet: WalletType, networkId?: KilnNetworkId) => TezosServiceLike;
  createEtherlinkService?: (networkId?: KilnNetworkId) => EtherlinkService;
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
  /** The server-default network (from `KILN_NETWORK` env). Used when a request doesn't specify one. */
  runtimeNetwork: RuntimeNetworkConfig;
  activityLogger: ActivityLogger;
  requireApiToken: RequestHandler;
  mutationLimiter: RequestHandler;
  /** Per-request factory — pass `networkId` to target a specific network. Defaults to `runtimeNetwork` when omitted. */
  createTezosService: (wallet: WalletType, networkId?: KilnNetworkId) => TezosServiceLike;
  /** Per-request EVM service factory for Etherlink networks. */
  createEtherlinkService: (networkId?: KilnNetworkId) => EtherlinkService;
  /** Resolve the runtime network config for a given (optional) networkId. */
  resolveNetwork: (networkId?: KilnNetworkId) => RuntimeNetworkConfig;
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

  const resolveNetwork = (networkId?: KilnNetworkId): RuntimeNetworkConfig =>
    resolveNetworkConfig({
      networkId: networkId ?? env.KILN_NETWORK,
      rpcUrl: resolveRpcUrlForNetwork(networkId ?? env.KILN_NETWORK, env),
      chainId: env.TEZOS_CHAIN_ID,
    });

  const createTezosService =
    options.createTezosService ??
    ((wallet: WalletType, networkId?: KilnNetworkId) =>
      new TezosService(wallet, env, networkId));

  const createEtherlinkService =
    options.createEtherlinkService ??
    ((networkId?: KilnNetworkId) => new EtherlinkService(env, networkId));

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
          // Tezos-only path — network is picked per-workflow by the router.
          const tezosService = createTezosService('A', env.KILN_NETWORK);
          return tezosService.validateOrigination(code, initialStorage);
        },
        clearanceStore,
      }));
  const exportBundle = options.exportBundle ?? createMainnetReadyBundle;
  const runtimeNetwork = resolveNetwork();
  const activityLogger = createActivityLogger(env.KILN_ACTIVITY_LOG_PATH);

  const requireApiToken: RequestHandler = (req, res, next) => {
    if (!env.API_AUTH_TOKEN) {
      next();
      return;
    }

    // Custom header name — nothing to do with X/Twitter. Legacy `x-api-token`
    // is still accepted as an alias so existing clients/curl scripts don't
    // break mid-rollout; remove the alias once all callers are migrated.
    const token = req.header('x-kiln-token') ?? req.header('x-api-token');
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
    createEtherlinkService,
    resolveNetwork,
    compileSmartPy,
    clearanceStore,
    runWorkflow,
    exportBundle,
  };
}
