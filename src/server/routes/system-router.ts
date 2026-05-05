import { Router } from 'express';
import { readRecentActivityLog } from '../../lib/activity-logger.js';
import { resolveDummyTokens } from '../../lib/kiln-injector.js';
import { listNetworkCatalog, listNetworkProfiles } from '../../lib/networks.js';
import { buildOpenApiSpec } from '../../lib/openapi.js';
import { selectNetworkForRequest } from '../../lib/ecosystem-resolver.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage } from '../http.js';

function getTokenHealth(services: ApiAppServices) {
  try {
    const resolved = resolveDummyTokens(services.env);
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

export function buildKilnCapabilities(
  services: ApiAppServices,
  requestedNetworkId?: unknown,
) {
  const network = selectNetworkForRequest(services.env, requestedNetworkId);
  return {
    success: true,
    runtime: {
      network,
      defaultNetwork: services.runtimeNetwork,
      clearanceRequired: services.env.KILN_REQUIRE_SIM_CLEARANCE,
      deployClearanceRequired: services.env.KILN_REQUIRE_SIM_CLEARANCE,
      shadowboxRequiredForClearance:
        services.env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE,
      shadowbox: services.shadowbox,
      auth: services.auth,
      mcp: {
        endpoint: '/mcp',
        auth: 'Bearer token generated from Settings after wallet login',
        tokenTtlHours: services.env.KILN_MCP_TOKEN_TTL_HOURS,
      },
    },
    noStubPolicy: {
      shadowboxMockClearance: 'blocked',
      unsupportedAssertions: 'fail_closed',
      incompleteAdapters: 'planned_or_unavailable',
    },
    projectWorkspace: {
      manifest: 'kiln.project.json',
      status: 'active-browser-workspace',
      hostFilesystemBrowsing: 'blocked',
    },
    systemScenarios: {
      payableTezosCalls: network.ecosystem === 'tezos' ? 'supported' : 'not-applicable',
      multiContractTargets:
        network.ecosystem === 'tezos'
          ? 'supported-in-live-e2e-payloads'
          : 'blocked-until-adapter-e2e-runner',
      storageAssertions: 'blocked-until-runtime-reader',
      shadowboxMultiContract:
        network.ecosystem === 'tezos'
          ? 'supported-in-command-provider'
          : 'blocked-until-adapter-e2e-runner',
    },
    sources: {
      supported:
        network.capabilities.sourceLanguages.length === 0
          ? []
          : network.capabilities.sourceLanguages.includes('solidity')
            ? ['solidity']
            : network.capabilities.sourceLanguages.includes('jstz')
              ? ['jstz']
              : ['auto', 'smartpy', 'michelson'],
      uploadExtensions: ['.tz', '.json', '.smartpy', '.sp', '.py', '.txt', '.md'],
    },
    workflowStages: [
      'source_intake',
      'compile_if_needed',
      'validate',
      'audit',
      'simulate',
      'shadowbox_runtime',
      'clearance',
      'deploy',
      'post_deploy_e2e',
    ],
    exports: {
      source: ['smartpy', 'michelson'],
      compiled: ['michelson (.tz)'],
      deliverables: ['mainnet-ready bundle (.zip)'],
    },
    entrypoints: {
      guidedElements: '/api/kiln/contracts/guided/elements',
      guidedCreate: '/api/kiln/contracts/guided/create',
      audit: '/api/kiln/audit/run',
      simulate: '/api/kiln/simulate/run',
      shadowbox: '/api/kiln/shadowbox/run',
      workflow: '/api/kiln/workflow/run',
      deploy: '/api/kiln/upload',
      execute: '/api/kiln/execute',
      e2e: '/api/kiln/e2e/run',
      balance: '/api/kiln/balances',
      evmCompile: '/api/kiln/evm/compile',
      evmEstimate: '/api/kiln/evm/estimate',
      evmDryRun: '/api/kiln/evm/dry-run',
      evmBalance: '/api/kiln/evm/balance',
      bundle: '/api/kiln/export/bundle',
      mcp: '/mcp',
    },
    clients: {
      ui: true,
      cli: 'npm run kiln:cli',
      agentic: 'Use /mcp after generating a 24-hour agent token from Settings.',
    },
  };
}

export function createSystemRouter(services: ApiAppServices): Router {
  const router = Router();

  router.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      requestId: res.locals.requestId,
      network: services.runtimeNetwork.rpcUrl,
      chainId: services.runtimeNetwork.chainId ?? null,
      networkId: services.runtimeNetwork.id,
      networkLabel: services.runtimeNetwork.label,
      ecosystem: services.runtimeNetwork.ecosystem,
      tokens: getTokenHealth(services),
      activityLogPath: services.activityLogger.filePath,
      auth: services.auth,
    });
  });

  router.get('/api/networks', (_req, res) => {
    const planned = listNetworkProfiles().filter((profile) => profile.status === 'planned');
    res.json({
      success: true,
      active: services.runtimeNetwork,
      supported: listNetworkCatalog(),
      planned,
    });
  });

  router.get('/api/kiln/capabilities', (req, res) => {
    res.json({
      ...buildKilnCapabilities(services, req.query.networkId),
      requestId: res.locals.requestId,
    });
  });

  router.get('/api/kiln/openapi.json', (_req, res) => {
    res.json(
      buildOpenApiSpec(services.runtimeNetwork, {
        deployClearanceRequired: services.env.KILN_REQUIRE_SIM_CLEARANCE,
        shadowboxRequiredForClearance:
          services.env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE,
      }),
    );
  });

  router.get(
    '/api/kiln/activity/recent',
    services.requireApiToken,
    async (req, res) => {
      const rawLimit = req.query.limit;
      const limit =
        typeof rawLimit === 'string'
          ? Number.parseInt(rawLimit, 10)
          : Number.NaN;

      try {
        const lines = await readRecentActivityLog(
          services.activityLogger.filePath,
          Number.isFinite(limit) ? limit : 100,
        );
        res.json({
          success: true,
          filePath: services.activityLogger.filePath,
          count: lines.length,
          lines,
        });
      } catch (error) {
        res.status(500).json({
          error: `Unable to read activity log: ${asMessage(error)}`,
        });
      }
    },
  );

  return router;
}
