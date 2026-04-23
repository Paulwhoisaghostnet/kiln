import { Router } from 'express';
import {
  predeployValidationPayloadSchema,
  smartpyCompilePayloadSchema,
  workflowRunPayloadSchema,
} from '../../lib/api-schemas.js';
import { auditMichelsonContract } from '../../lib/contract-audit.js';
import {
  hashContractCode,
  runContractSimulation,
} from '../../lib/contract-simulation.js';
import { selectNetworkForRequest } from '../../lib/ecosystem-resolver.js';
import { injectKilnTokens } from '../../lib/kiln-injector.js';
import { parseEntrypointsFromMichelson } from '../../lib/michelson-parser.js';
import { runContractWorkflow } from '../../lib/workflow-runner.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage, validationErrorMessage } from '../http.js';
import { materializeContractSource } from '../pipelines/contract-source.js';
import { runPredeployValidation } from '../pipelines/predeploy-validation.js';

function mapSimulationSteps(
  steps: Array<{
    label?: string;
    wallet: 'bert' | 'ernie' | 'user';
    entrypoint: string;
    args: unknown[];
  }>,
) {
  return steps.map((step) => ({
    label: step.label,
    wallet: step.wallet,
    entrypoint: step.entrypoint,
    args: step.args,
  }));
}

export function createWorkflowRouter(services: ApiAppServices): Router {
  const router = Router();

  router.post(
    '/api/kiln/smartpy/compile',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = smartpyCompilePayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const compiled = await services.compileSmartPy(
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
        const status =
          message.includes('SmartPy compiler unavailable') ||
          message.includes('SmartPy CLI not found')
            ? 501
            : 500;
        res.status(status).json({ error: message });
      }
    },
  );

  router.post(
    '/api/kiln/workflow/run',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = workflowRunPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        if (network.ecosystem !== 'tezos') {
          res.status(412).json({
            error: `Network ${network.label} is EVM. Use /api/kiln/evm/compile + /api/kiln/evm/estimate for Solidity workflows.`,
          });
          return;
        }

        const result = await runContractWorkflow(
          {
            sourceType: payload.data.sourceType,
            source: payload.data.source,
            initialStorage: payload.data.initialStorage,
            scenario: payload.data.scenario,
            simulationSteps: mapSimulationSteps(payload.data.simulationSteps),
          },
          {
            compileSmartPy: services.compileSmartPy,
            injectKilnTokens: (code: string) => injectKilnTokens(code, services.env),
            estimateOrigination: async (code, initialStorage) => {
              const tezos = services.createTezosService('A', network.id);
              return tezos.validateOrigination(code, initialStorage);
            },
            clearanceStore: services.clearanceStore,
          },
        );

        services.activityLogger.log({
          timestamp: new Date().toISOString(),
          requestId: res.locals.requestId as string | undefined,
          event: 'workflow_run',
          networkId: network.id,
          approved: result.clearance.approved,
          validatePassed: result.validate.passed,
          auditPassed: result.audit.passed,
          simulationPassed: result.simulation.success,
          score: result.audit.score,
        });

        res.json({
          success: true,
          networkId: network.id,
          ecosystem: network.ecosystem,
          ...result,
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.post(
    '/api/kiln/audit/run',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = workflowRunPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const source = await materializeContractSource({
          sourceType: payload.data.sourceType,
          source: payload.data.source,
          scenario: payload.data.scenario,
          compileSmartPy: services.compileSmartPy,
        });
        const report = auditMichelsonContract(source.michelson);
        services.activityLogger.log({
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

  router.post(
    '/api/kiln/simulate/run',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = workflowRunPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const source = await materializeContractSource({
          sourceType: payload.data.sourceType,
          source: payload.data.source,
          scenario: payload.data.scenario,
          compileSmartPy: services.compileSmartPy,
        });
        const entrypoints = parseEntrypointsFromMichelson(source.michelson).map(
          (entry) => entry.name,
        );
        const simulation = runContractSimulation({
          entrypoints,
          steps: mapSimulationSteps(payload.data.simulationSteps),
        });
        const codeHash = hashContractCode(source.michelson);
        const clearance = simulation.success
          ? services.clearanceStore.create({
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

  router.post(
    '/api/kiln/predeploy/validate',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = predeployValidationPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        if (network.ecosystem !== 'tezos') {
          res.status(412).json({
            error: `Network ${network.label} is EVM. Use /api/kiln/evm/compile + /api/kiln/evm/estimate for Solidity predeploy checks.`,
          });
          return;
        }

        const result = await runPredeployValidation(
          {
            code: payload.data.code,
            initialStorage: payload.data.initialStorage,
          },
          {
            env: services.env,
            createTezosService: (wallet) => services.createTezosService(wallet, network.id),
          },
        );

        res.json({ ...result, networkId: network.id, ecosystem: network.ecosystem });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  return router;
}
