import cors from 'cors';
import fs from 'node:fs';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { ZodError } from 'zod';
import {
  e2eRunPayloadSchema,
  exportBundlePayloadSchema,
  executePayloadSchema,
  guidedElementsQuerySchema,
  guidedContractPayloadSchema,
  predeployValidationPayloadSchema,
  smartpyCompilePayloadSchema,
  uploadPayloadSchema,
  workflowRunPayloadSchema,
} from './lib/api-schemas.js';
import {
  createActivityLogger,
  createRequestIdMiddleware,
  createRequestLoggingMiddleware,
  readRecentActivityLog,
} from './lib/activity-logger.js';
import { auditMichelsonContract } from './lib/contract-audit.js';
import {
  DeploymentClearanceStore,
  hashContractCode,
  runContractSimulation,
} from './lib/contract-simulation.js';
import {
  createMainnetReadyBundle,
  resolveExportZipPath,
  type BundleExportInput,
  type BundleExportResult,
} from './lib/bundle-export.js';
import { getEnv, parseCorsOrigins, type AppEnv } from './lib/env.js';
import { buildGuidedContractDraft } from './lib/guided-contracts.js';
import { injectKilnTokens, resolveDummyTokens } from './lib/kiln-injector.js';
import { parseEntrypointsFromMichelson } from './lib/michelson-parser.js';
import { listNetworkProfiles, resolveNetworkConfig } from './lib/networks.js';
import { buildOpenApiSpec } from './lib/openapi.js';
import { listGuidedElementsFromReferences } from './lib/reference-guided-elements.js';
import { listReferenceContracts } from './lib/reference-contracts.js';
import {
  compileSmartPySource,
  type SmartPyCompilationResult,
} from './lib/smartpy-compiler.js';
import { TezosService, type TezosServiceLike } from './lib/tezos-service.js';
import { runContractWorkflow, type WorkflowRunResult } from './lib/workflow-runner.js';
import type { WalletType } from './lib/types.js';

interface ApiAppOptions {
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
  const compileSmartPy = options.compileSmartPy ?? compileSmartPySource;
  const clearanceStore =
    options.clearanceStore ?? new DeploymentClearanceStore();
  const runWorkflow =
    options.runWorkflow ??
    ((payload) =>
      runContractWorkflow(payload, {
        compileSmartPy,
        injectKilnTokens: (code: string) => injectKilnTokens(code, runtimeEnv),
        estimateOrigination: async (code, initialStorage) => {
          const tezosService = createTezosService('A');
          return tezosService.validateOrigination(code, initialStorage);
        },
        clearanceStore,
      }));
  const exportBundle = options.exportBundle ?? createMainnetReadyBundle;
  const runtimeNetwork = resolveNetworkConfig({
    networkId: runtimeEnv.KILN_NETWORK,
    rpcUrl: runtimeEnv.TEZOS_RPC_URL,
    chainId: runtimeEnv.TEZOS_CHAIN_ID,
  });
  const activityLogger = createActivityLogger(runtimeEnv.KILN_ACTIVITY_LOG_PATH);

  const app = express();
  const corsOrigins = parseCorsOrigins(runtimeEnv.CORS_ORIGINS);

  app.disable('x-powered-by');
  app.use(createRequestIdMiddleware());
  app.use(createRequestLoggingMiddleware(activityLogger));
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
      requestId: res.locals.requestId,
      network: runtimeNetwork.rpcUrl,
      chainId: runtimeNetwork.chainId ?? null,
      networkId: runtimeNetwork.id,
      networkLabel: runtimeNetwork.label,
      ecosystem: runtimeNetwork.ecosystem,
      tokens: getTokenHealth(runtimeEnv),
      activityLogPath: activityLogger.filePath,
    });
  });

  app.get('/api/networks', (_req, res) => {
    res.json({
      success: true,
      active: runtimeNetwork,
      supported: listNetworkProfiles(),
    });
  });

  app.get('/api/kiln/capabilities', (_req, res) => {
    res.json({
      success: true,
      requestId: res.locals.requestId,
      runtime: {
        network: runtimeNetwork,
        clearanceRequired: runtimeEnv.KILN_REQUIRE_SIM_CLEARANCE,
      },
      sources: {
        supported: ['auto', 'smartpy', 'michelson'],
        uploadExtensions: ['.tz', '.json', '.smartpy', '.sp', '.txt', '.md'],
      },
      workflowStages: [
        'source_intake',
        'compile_if_needed',
        'validate',
        'audit',
        'simulate',
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
        audit: '/api/kiln/audit/run',
        simulate: '/api/kiln/simulate/run',
        workflow: '/api/kiln/workflow/run',
        deploy: '/api/kiln/upload',
        execute: '/api/kiln/execute',
        e2e: '/api/kiln/e2e/run',
        bundle: '/api/kiln/export/bundle',
      },
      clients: {
        ui: true,
        cli: 'npm run kiln:cli',
        agentic: 'Use OpenAPI + JSON endpoints for tool-call orchestration.',
      },
    });
  });

  app.get('/api/kiln/openapi.json', (_req, res) => {
    res.json(buildOpenApiSpec(runtimeNetwork));
  });

  app.get('/api/kiln/reference/contracts', requireApiToken, async (_req, res) => {
    try {
      const contracts = await listReferenceContracts();
      res.json({
        success: true,
        count: contracts.length,
        contracts,
      });
    } catch (error) {
      res.status(500).json({ error: `Unable to load reference contracts: ${asMessage(error)}` });
    }
  });

  app.get('/api/kiln/activity/recent', requireApiToken, async (req, res) => {
    const rawLimit = req.query.limit;
    const limit =
      typeof rawLimit === 'string'
        ? Number.parseInt(rawLimit, 10)
        : Number.NaN;

    try {
      const lines = await readRecentActivityLog(
        activityLogger.filePath,
        Number.isFinite(limit) ? limit : 100,
      );
      res.json({
        success: true,
        filePath: activityLogger.filePath,
        count: lines.length,
        lines,
      });
    } catch (error) {
      res.status(500).json({
        error: `Unable to read activity log: ${asMessage(error)}`,
      });
    }
  });

  app.post(
    '/api/kiln/export/bundle',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = exportBundlePayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const result = await exportBundle({
          ...payload.data,
          deployment: {
            networkId: payload.data.deployment?.networkId ?? runtimeNetwork.id,
            rpcUrl: payload.data.deployment?.rpcUrl ?? runtimeNetwork.rpcUrl,
            chainId: payload.data.deployment?.chainId ?? runtimeNetwork.chainId,
            contractAddress: payload.data.deployment?.contractAddress,
            originatedAt: payload.data.deployment?.originatedAt,
          },
        });

        activityLogger.log({
          timestamp: new Date().toISOString(),
          requestId: res.locals.requestId as string | undefined,
          event: 'bundle_export',
          bundleId: result.bundleId,
          zipFileName: result.zipFileName,
        });

        res.json({
          success: true,
          ...result,
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  app.get(
    '/api/kiln/export/download/:fileName',
    requireApiToken,
    async (req, res) => {
      const fileName = req.params.fileName;
      if (!fileName) {
        res.status(400).json({ error: 'fileName is required.' });
        return;
      }

      try {
        const zipPath = resolveExportZipPath(fileName);
        await fs.promises.access(zipPath);
        res.download(zipPath, fileName);
      } catch (error) {
        const message = asMessage(error);
        const status = message.includes('Invalid bundle file name') ? 400 : 404;
        res.status(status).json({ error: message });
      }
    },
  );

  app.post(
    '/api/kiln/contracts/guided/elements',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = guidedElementsQuerySchema.safeParse(req.body ?? {});
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const elements = await listGuidedElementsFromReferences(
          payload.data.contractType,
        );
        res.json({
          success: true,
          contractType: payload.data.contractType,
          count: elements.length,
          elements,
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  app.post(
    '/api/kiln/contracts/guided/create',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = guidedContractPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const referenceElements = await listGuidedElementsFromReferences(
          payload.data.contractType,
        );
        const selectedElementSet = new Set(payload.data.selectedElements);
        const selectedReferenceElements = referenceElements.filter((element) =>
          selectedElementSet.has(element.id),
        );
        const selectedSourceContracts = Array.from(
          new Map(
            selectedReferenceElements
              .flatMap((element) => element.evidenceContracts)
              .map((contract) => [contract.slug, contract]),
          ).values(),
        );
        const draft = buildGuidedContractDraft(payload.data);
        res.json({
          success: true,
          ...draft,
          referenceInsights: {
            availableElements: referenceElements,
            selectedElements: selectedReferenceElements,
            sourceContracts: selectedSourceContracts,
          },
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  app.post(
    '/api/kiln/smartpy/compile',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = smartpyCompilePayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const compiled = await compileSmartPy(
          payload.data.source,
          payload.data.scenario,
        );
        res.json({
          success: true,
          scenario: compiled.scenario,
          michelson: compiled.michelson,
          initialStorage: compiled.initialStorage,
          note: 'SmartPy source compiled to Michelson. Run pre-deploy tests before deployment.',
        });
      } catch (error) {
        const message = asMessage(error);
        const status = message.includes('SmartPy CLI not found') ? 501 : 500;
        res.status(status).json({ error: message });
      }
    },
  );

  app.post(
    '/api/kiln/workflow/run',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = workflowRunPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const result = await runWorkflow({
          sourceType: payload.data.sourceType,
          source: payload.data.source,
          initialStorage: payload.data.initialStorage,
          scenario: payload.data.scenario,
          simulationSteps: payload.data.simulationSteps.map((step) => ({
            label: step.label,
            wallet: step.wallet,
            entrypoint: step.entrypoint,
            args: step.args,
          })),
        });

        activityLogger.log({
          timestamp: new Date().toISOString(),
          requestId: res.locals.requestId as string | undefined,
          event: 'workflow_run',
          approved: result.clearance.approved,
          validatePassed: result.validate.passed,
          auditPassed: result.audit.passed,
          simulationPassed: result.simulation.success,
          score: result.audit.score,
        });

        res.json({
          success: true,
          ...result,
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  app.post(
    '/api/kiln/audit/run',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = workflowRunPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        let michelson = payload.data.source;
        if (
          payload.data.sourceType === 'smartpy' ||
          (payload.data.sourceType === 'auto' &&
            payload.data.source.toLowerCase().includes('import smartpy as sp'))
        ) {
          const compiled = await compileSmartPy(
            payload.data.source,
            payload.data.scenario,
          );
          michelson = compiled.michelson;
        }

        const report = auditMichelsonContract(michelson);
        activityLogger.log({
          timestamp: new Date().toISOString(),
          requestId: res.locals.requestId as string | undefined,
          event: 'audit_run',
          passed: report.passed,
          score: report.score,
          findings: report.findings.length,
        });
        res.json({
          success: true,
          report,
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  app.post(
    '/api/kiln/simulate/run',
    requireApiToken,
    mutationLimiter,
    async (req, res) => {
      const payload = workflowRunPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        let michelson = payload.data.source;
        if (
          payload.data.sourceType === 'smartpy' ||
          (payload.data.sourceType === 'auto' &&
            payload.data.source.toLowerCase().includes('import smartpy as sp'))
        ) {
          const compiled = await compileSmartPy(
            payload.data.source,
            payload.data.scenario,
          );
          michelson = compiled.michelson;
        }

        const entrypoints = parseEntrypointsFromMichelson(michelson).map(
          (entry) => entry.name,
        );
        const simulation = runContractSimulation({
          entrypoints,
          steps: payload.data.simulationSteps.map((step) => ({
            label: step.label,
            wallet: step.wallet,
            entrypoint: step.entrypoint,
            args: step.args,
          })),
        });
        const codeHash = hashContractCode(michelson);
        const clearance = simulation.success
          ? clearanceStore.create({
              codeHash,
              auditPassed: true,
              simulationPassed: true,
            })
          : undefined;

        res.json({
          success: simulation.success,
          simulation,
          codeHash,
          clearance: {
            approved: Boolean(clearance),
            record: clearance,
          },
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

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
      const codeHash = hashContractCode(injectedCode);

      if (runtimeEnv.KILN_REQUIRE_SIM_CLEARANCE) {
        const clearanceId = payload.data.clearanceId?.trim();
        if (!clearanceId) {
          res.status(412).json({
            error:
              'Deployment blocked: run /api/kiln/workflow/run and provide clearanceId.',
          });
          return;
        }

        const clearanceValidation = clearanceStore.validate(clearanceId, codeHash);
        if (!clearanceValidation.ok) {
          res.status(412).json({
            error: `Deployment blocked: ${clearanceValidation.reason ?? 'invalid clearance'}`,
          });
          return;
        }
      }

      const tezosService = createTezosService(payload.data.wallet);
      const contractAddress = await tezosService.originateContract(
        injectedCode,
        payload.data.initialStorage,
      );

      res.json({
        success: true,
        contractAddress,
        injectedCode,
        codeHash,
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
