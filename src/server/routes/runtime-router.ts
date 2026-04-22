import { Router } from 'express';
import {
  e2eRunPayloadSchema,
  executePayloadSchema,
  uploadPayloadSchema,
} from '../../lib/api-schemas.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage, validationErrorMessage } from '../http.js';
import {
  DeploymentBlockedError,
  deployContract,
  executeContractCall,
  readWalletBalances,
  runContractE2E,
} from '../pipelines/contract-runtime.js';

export function createRuntimeRouter(services: ApiAppServices): Router {
  const router = Router();

  router.post(
    '/api/kiln/upload',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = uploadPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const result = await deployContract(payload.data, {
          env: services.env,
          clearanceStore: services.clearanceStore,
          createTezosService: services.createTezosService,
        });
        res.json(result);
      } catch (error) {
        if (error instanceof DeploymentBlockedError) {
          res.status(412).json({ error: error.message });
          return;
        }
        console.error('Upload Error:', error);
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.post(
    '/api/kiln/execute',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = executePayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const result = await executeContractCall(
          payload.data,
          services.createTezosService,
        );
        res.json(result);
      } catch (error) {
        console.error('Execute Error:', error);
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.post(
    '/api/kiln/e2e/run',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = e2eRunPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      const result = await runContractE2E(
        payload.data,
        services.createTezosService,
      );
      res.json(result);
    },
  );

  router.get('/api/kiln/balances', services.requireApiToken, async (_req, res) => {
    try {
      const balances = await readWalletBalances(services.createTezosService);
      res.json(balances);
    } catch (error) {
      console.error('Balances Error:', error);
      res.status(500).json({ error: asMessage(error) });
    }
  });

  return router;
}
