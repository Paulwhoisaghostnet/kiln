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
  createKilnUserStore,
  type KilnUserStore,
  type WalletSignatureVerifier,
} from '../lib/kiln-users.js';
import {
  resolveNetworkConfig,
  type KilnNetworkId,
  type RuntimeNetworkConfig,
} from '../lib/networks.js';
import {
  createShadowboxRuntimeRunner,
  type ShadowboxRunInput,
  type ShadowboxRunResult,
} from '../lib/shadowbox-runtime.js';
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
  runShadowbox?: (payload: ShadowboxRunInput) => Promise<ShadowboxRunResult>;
  exportBundle?: (
    payload: BundleExportInput,
  ) => Promise<BundleExportResult>;
  userStore?: KilnUserStore;
  walletSignatureVerifier?: WalletSignatureVerifier;
  now?: () => Date;
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
  auth: {
    required: boolean;
    tokenConfigured: boolean;
    mode: 'open' | 'token';
  };
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
  runShadowbox: (payload: ShadowboxRunInput) => Promise<ShadowboxRunResult>;
  shadowbox: {
    enabled: boolean;
    requiredForClearance: boolean;
    provider: 'disabled' | 'mock' | 'command';
    limits: {
      timeoutMs: number;
      maxActiveJobs: number;
      maxActiveJobsPerIp: number;
      maxSourceBytes: number;
      maxSteps: number;
    };
  };
  exportBundle: (payload: BundleExportInput) => Promise<BundleExportResult>;
  userStore: KilnUserStore;
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
  const shadowboxRunner = createShadowboxRuntimeRunner({
    enabled: env.KILN_SHADOWBOX_ENABLED,
    requiredForClearance: env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE,
    provider: env.KILN_SHADOWBOX_PROVIDER,
    command: env.KILN_SHADOWBOX_COMMAND,
    timeoutMs: env.KILN_SHADOWBOX_TIMEOUT_MS,
    maxActiveJobs: env.KILN_SHADOWBOX_MAX_ACTIVE,
    maxActiveJobsPerIp: env.KILN_SHADOWBOX_MAX_ACTIVE_PER_IP,
    maxSourceBytes: env.KILN_SHADOWBOX_MAX_SOURCE_BYTES,
    maxSteps: env.KILN_SHADOWBOX_MAX_STEPS,
    workDir: env.KILN_SHADOWBOX_WORKDIR,
  });
  const runShadowbox =
    options.runShadowbox ?? ((payload: ShadowboxRunInput) => shadowboxRunner.run(payload));
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
        runShadowbox,
        shadowboxRequiredForClearance: env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE,
        clearanceStore,
      }));
  const exportBundle = options.exportBundle ?? createMainnetReadyBundle;
  const runtimeNetwork = resolveNetwork();
  const activityLogger = createActivityLogger(env.KILN_ACTIVITY_LOG_PATH);
  const userStore =
    options.userStore ??
    createKilnUserStore({
      env,
      now: options.now,
      walletSignatureVerifier: options.walletSignatureVerifier,
    });
  const tokenConfigured = Boolean(env.API_AUTH_TOKEN);
  const authRequired = tokenConfigured || env.KILN_API_AUTH_REQUIRED === true;

  const requireApiToken: RequestHandler = (req, res, next) => {
    if (!authRequired) {
      next();
      return;
    }

    if (!env.API_AUTH_TOKEN) {
      res.status(503).json({
        error: 'API auth is required but API_AUTH_TOKEN is not configured.',
      });
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
    auth: {
      required: authRequired,
      tokenConfigured,
      mode: authRequired ? 'token' : 'open',
    },
    createEtherlinkService,
    resolveNetwork,
    compileSmartPy,
    clearanceStore,
    runWorkflow,
    runShadowbox,
    shadowbox: shadowboxRunner.describe(),
    exportBundle,
    userStore,
  };
}
