import { Router } from 'express';
import {
  e2eRunPayloadSchema,
  executePayloadSchema,
  uploadPayloadSchema,
} from '../../lib/api-schemas.js';
import {
  assertCapability,
  NetworkCapabilityError,
  selectNetworkForRequest,
} from '../../lib/ecosystem-resolver.js';
import { getDefaultNetworkId } from '../../lib/networks.js';
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
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        // Puppet-wallet deploys only run where puppet keys are actually present,
        // which by design excludes every mainnet. This is our last-mile guard.
        if (network.ecosystem !== 'tezos') {
          res.status(412).json({
            error: `Network ${network.label} is EVM — use /api/kiln/evm/deploy for Solidity deploys.`,
          });
          return;
        }
        assertCapability(network.id, 'puppetWallets');

        const result = await deployContract(payload.data, {
          env: services.env,
          clearanceStore: services.clearanceStore,
          createTezosService: (wallet) => services.createTezosService(wallet, network.id),
        });
        res.json({ ...result, networkId: network.id });
      } catch (error) {
        if (error instanceof DeploymentBlockedError) {
          res.status(412).json({ error: error.message });
          return;
        }
        if (error instanceof NetworkCapabilityError) {
          res.status(412).json({ error: error.message, capability: error.capability });
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
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        if (network.ecosystem !== 'tezos') {
          res.status(412).json({
            error: `Network ${network.label} is EVM — contract execution uses the browser wallet directly on Etherlink.`,
          });
          return;
        }
        assertCapability(network.id, 'puppetWallets');

        const result = await executeContractCall(payload.data, (wallet) =>
          services.createTezosService(wallet, network.id),
        );
        res.json({ ...result, networkId: network.id });
      } catch (error) {
        if (error instanceof NetworkCapabilityError) {
          res.status(412).json({ error: error.message, capability: error.capability });
          return;
        }
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

      try {
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        if (network.ecosystem !== 'tezos') {
          res.status(412).json({
            error: `Network ${network.label} is EVM — post-deploy E2E uses the browser wallet, not server puppets.`,
          });
          return;
        }
        assertCapability(network.id, 'postdeployE2E');
        assertCapability(network.id, 'puppetWallets');

        const result = await runContractE2E(payload.data, (wallet) =>
          services.createTezosService(wallet, network.id),
        );
        res.json({ ...result, networkId: network.id });
      } catch (error) {
        if (error instanceof NetworkCapabilityError) {
          res.status(412).json({ error: error.message, capability: error.capability });
          return;
        }
        console.error('E2E Error:', error);
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.get('/api/kiln/balances', services.requireApiToken, async (req, res) => {
    try {
      const requested = req.query.networkId ?? getDefaultNetworkId();
      const network = selectNetworkForRequest(services.env, requested);
      if (network.ecosystem !== 'tezos') {
        // EVM networks have no server-held puppet keys, so there's nothing to
        // report. Return an empty response the UI can render as "n/a" without
        // throwing an error.
        res.json({
          networkId: network.id,
          ecosystem: network.ecosystem,
          puppetsAvailable: false,
          walletA: null,
          walletB: null,
        });
        return;
      }
      if (!network.capabilities.puppetWallets) {
        res.json({
          networkId: network.id,
          ecosystem: network.ecosystem,
          puppetsAvailable: false,
          walletA: null,
          walletB: null,
        });
        return;
      }

      const balances = await readWalletBalances((wallet) =>
        services.createTezosService(wallet, network.id),
      );
      res.json({
        networkId: network.id,
        ecosystem: network.ecosystem,
        puppetsAvailable: true,
        ...balances,
      });
    } catch (error) {
      console.error('Balances Error:', error);
      res.status(500).json({ error: asMessage(error) });
    }
  });

  return router;
}
