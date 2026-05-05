import { Router } from 'express';
import {
  evmDeployPayloadSchema,
  evmEstimatePayloadSchema,
  solidityCompilePayloadSchema,
} from '../../lib/api-schemas.js';
import {
  assertCapability,
  NetworkCapabilityError,
  selectNetworkForRequest,
} from '../../lib/ecosystem-resolver.js';
import {
  auditSoliditySource,
  compileSolidity,
} from '../../lib/solidity-compiler.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage, validationErrorMessage } from '../http.js';

/**
 * EVM/Etherlink router. Complements the Tezos runtime-router. Real deploys
 * and method calls are submitted by the browser wallet, so the
 * server only handles:
 *
 * - POST /api/kiln/evm/compile  — Solidity -> bytecode + ABI
 * - POST /api/kiln/evm/estimate — gas + fee estimate for a deploy
 * - POST /api/kiln/evm/dry-run  — eth_call the deploy, catch constructor reverts
 * - GET  /api/kiln/evm/balance  — native-token balance read for a given address
 */
export function createEvmRouter(services: ApiAppServices): Router {
  const router = Router();

  router.post(
    '/api/kiln/evm/compile',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = solidityCompilePayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({ error: validationErrorMessage(payload.error) });
        return;
      }

      try {
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        if (network.ecosystem !== 'etherlink') {
          res.status(412).json({
            error: `Network ${network.label} doesn't accept Solidity. Switch to an Etherlink network to compile.`,
          });
          return;
        }

        const compileResult = await compileSolidity({
          source: payload.data.source,
          entryContractName: payload.data.entryContractName,
          evmVersion: payload.data.evmVersion,
          optimizer: payload.data.optimizer,
          optimizerRuns: payload.data.optimizerRuns,
        });
        const auditFindings = auditSoliditySource(payload.data.source);

        res.json({
          success: compileResult.success,
          networkId: network.id,
          ecosystem: network.ecosystem,
          entry: compileResult.entry
            ? {
                name: compileResult.entry.name,
                abi: compileResult.entry.abi,
                bytecode: compileResult.entry.bytecode,
                deployedBytecode: compileResult.entry.deployedBytecode,
              }
            : null,
          contracts: compileResult.contracts.map((c) => ({ name: c.name })),
          findings: compileResult.findings,
          audit: {
            findings: auditFindings,
            score: computeAuditScore(auditFindings),
          },
          solcVersion: compileResult.solcVersion,
        });
      } catch (error) {
        console.error('Solidity compile error:', error);
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.post(
    '/api/kiln/evm/estimate',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = evmEstimatePayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({ error: validationErrorMessage(payload.error) });
        return;
      }

      try {
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        if (network.ecosystem !== 'etherlink') {
          res.status(412).json({
            error: `Network ${network.label} is not EVM. Use the Tezos estimate endpoint instead.`,
          });
          return;
        }
        assertCapability(network.id, 'predeploy');

        const service = services.createEtherlinkService(network.id);
        const estimate = await service.estimateDeploy({
          bytecode: payload.data.bytecode as `0x${string}`,
          constructorCalldata: payload.data.constructorArgs
            ? (`0x${payload.data.constructorArgs}` as `0x${string}`)
            : undefined,
          from: payload.data.from as `0x${string}` | undefined,
        });

        res.json({
          success: true,
          networkId: network.id,
          ecosystem: network.ecosystem,
          estimate: {
            gasLimit: estimate.gasLimit.toString(),
            baseFeePerGas: estimate.baseFeePerGas.toString(),
            maxFeePerGas: estimate.maxFeePerGas.toString(),
            maxPriorityFeePerGas: estimate.maxPriorityFeePerGas.toString(),
            maxWeiCost: estimate.maxWeiCost.toString(),
            maxXtzCost: estimate.maxXtzCost,
          },
        });
      } catch (error) {
        if (error instanceof NetworkCapabilityError) {
          res.status(412).json({ error: error.message, capability: error.capability });
          return;
        }
        console.error('EVM estimate error:', error);
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.post(
    '/api/kiln/evm/dry-run',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = evmDeployPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({ error: validationErrorMessage(payload.error) });
        return;
      }

      try {
        const network = selectNetworkForRequest(services.env, payload.data.networkId);
        if (network.ecosystem !== 'etherlink') {
          res.status(412).json({
            error: `Network ${network.label} is not EVM.`,
          });
          return;
        }
        assertCapability(network.id, 'predeploy');

        const service = services.createEtherlinkService(network.id);
        const result = await service.dryRunDeploy({
          bytecode: payload.data.bytecode as `0x${string}`,
          constructorCalldata: payload.data.constructorArgs
            ? (`0x${payload.data.constructorArgs}` as `0x${string}`)
            : undefined,
          from: payload.data.from as `0x${string}` | undefined,
        });

        res.json({
          success: result.ok,
          networkId: network.id,
          ecosystem: network.ecosystem,
          dryRun: result,
        });
      } catch (error) {
        if (error instanceof NetworkCapabilityError) {
          res.status(412).json({ error: error.message, capability: error.capability });
          return;
        }
        console.error('EVM dry-run error:', error);
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.get('/api/kiln/evm/balance', services.requireApiToken, async (req, res) => {
    try {
      const network = selectNetworkForRequest(services.env, req.query.networkId);
      if (network.ecosystem !== 'etherlink') {
        res.status(412).json({
          error: `Network ${network.label} is not EVM.`,
        });
        return;
      }
      const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        res.status(400).json({ error: 'Query param `address` must be a 0x-prefixed 40-char hex.' });
        return;
      }

      const service = services.createEtherlinkService(network.id);
      const balance = await service.getBalance(address as `0x${string}`);
      const chainId = await service.getChainId();

      res.json({
        success: true,
        networkId: network.id,
        ecosystem: network.ecosystem,
        address,
        balance,
        symbol: network.nativeSymbol,
        chainId,
      });
    } catch (error) {
      console.error('EVM balance error:', error);
      res.status(500).json({ error: asMessage(error) });
    }
  });

  return router;
}

function computeAuditScore(
  findings: ReturnType<typeof auditSoliditySource>,
): number {
  let score = 100;
  for (const finding of findings) {
    if (finding.severity === 'error') {
      score -= 30;
    } else if (finding.severity === 'warning') {
      score -= 10;
    } else {
      score -= 2;
    }
  }
  return Math.max(0, score);
}
