import {
  e2eRunPayloadSchema,
  evmDeployPayloadSchema,
  evmEstimatePayloadSchema,
  executePayloadSchema,
  exportBundlePayloadSchema,
  guidedContractPayloadSchema,
  guidedElementsQuerySchema,
  networkIdSchema,
  predeployValidationPayloadSchema,
  smartpyCompilePayloadSchema,
  solidityCompilePayloadSchema,
  uploadPayloadSchema,
  workflowRunPayloadSchema,
} from '../lib/api-schemas.js';
import { auditMichelsonContract } from '../lib/contract-audit.js';
import {
  hashContractCode,
  runContractSimulation,
} from '../lib/contract-simulation.js';
import {
  assertCapability,
  NetworkCapabilityError,
  selectNetworkForRequest,
} from '../lib/ecosystem-resolver.js';
import { injectKilnTokens } from '../lib/kiln-injector.js';
import type { KilnUser } from '../lib/kiln-users.js';
import { readMichelsonEntrypoints } from '../lib/taquito-michelson.js';
import { listNetworkCatalog, listNetworkProfiles } from '../lib/networks.js';
import { buildOpenApiSpec } from '../lib/openapi.js';
import { buildGuidedContractDraft } from '../lib/guided-contracts.js';
import { listReferenceContracts } from '../lib/reference-contracts.js';
import { listGuidedElementsFromReferences } from '../lib/reference-guided-elements.js';
import { auditSoliditySource, compileSolidity } from '../lib/solidity-compiler.js';
import {
  resolveSmartPyInitialStorage,
  runContractWorkflow,
} from '../lib/workflow-runner.js';
import type { ApiAppServices } from './app-services.js';
import { asMessage, validationErrorMessage } from './http.js';
import { buildKilnCapabilities } from './routes/system-router.js';
import { materializeContractSource } from './pipelines/contract-source.js';
import {
  DeploymentBlockedError,
  deployContract,
  executeContractCall,
  readWalletBalances,
  runContractE2E,
} from './pipelines/contract-runtime.js';
import { runPredeployValidation } from './pipelines/predeploy-validation.js';
import { z } from 'zod';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown, context: McpToolContext) => Promise<unknown>;
}

export interface McpToolContext {
  services: ApiAppServices;
  user: KilnUser;
  requestId?: string;
  remoteIp?: string;
}

const networkArgsSchema = z.object({
  networkId: networkIdSchema,
});

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const networkInputSchema = {
  type: 'object',
  properties: {
    networkId: {
      type: 'string',
      description: 'Optional Kiln network id. Defaults to the server runtime network.',
    },
  },
  additionalProperties: false,
};

function validate<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new Error(validationErrorMessage(parsed.error));
  }
  return parsed.data;
}

function mapSimulationSteps(
  steps: Array<{
    label?: string;
    wallet: 'bert' | 'ernie' | 'user';
    targetContractId?: string;
    entrypoint: string;
    args: unknown[];
    amountMutez?: number;
    expectFailure?: boolean;
    assertions?: unknown[];
  }>,
) {
  return steps.map((step) => ({
    label: step.label,
    wallet: step.wallet,
    targetContractId: step.targetContractId,
    entrypoint: step.entrypoint,
    args: step.args,
    amountMutez: step.amountMutez,
    expectFailure: step.expectFailure,
    assertions: step.assertions,
  }));
}

function computeAuditScore(findings: ReturnType<typeof auditSoliditySource>): number {
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

function toolError(error: unknown): Error {
  if (error instanceof NetworkCapabilityError) {
    return new Error(`${error.message} (capability: ${error.capability})`);
  }
  if (error instanceof DeploymentBlockedError) {
    return new Error(error.message);
  }
  return new Error(asMessage(error));
}

function workflowPayloadSchemaDescription() {
  return {
    type: 'object',
    properties: {
      networkId: { type: 'string' },
      sourceType: { type: 'string', enum: ['auto', 'michelson', 'smartpy'] },
      source: { type: 'string' },
      initialStorage: { type: 'string' },
      scenario: { type: 'string' },
      simulationSteps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            wallet: { type: 'string', enum: ['bert', 'ernie', 'user'] },
            targetContractId: { type: 'string' },
            entrypoint: { type: 'string' },
            args: { type: 'array' },
            amountMutez: { type: 'number' },
            expectFailure: { type: 'boolean' },
            assertions: { type: 'array' },
          },
          required: ['entrypoint'],
        },
      },
    },
    required: ['source'],
    additionalProperties: false,
  };
}

export function createMcpTools(services: ApiAppServices): McpToolDefinition[] {
  return [
    {
      name: 'kiln_get_health',
      description: 'Read Kiln runtime health, active network metadata, auth mode, and MCP user attribution.',
      inputSchema: emptyInputSchema,
      async handler(_args, context) {
        return {
          status: 'ok',
          requestId: context.requestId ?? null,
          network: services.runtimeNetwork.rpcUrl,
          chainId: services.runtimeNetwork.chainId ?? null,
          networkId: services.runtimeNetwork.id,
          networkLabel: services.runtimeNetwork.label,
          ecosystem: services.runtimeNetwork.ecosystem,
          activityLogPath: services.activityLogger.filePath,
          auth: services.auth,
          mcpUser: {
            id: context.user.id,
            walletKind: context.user.walletKind,
            walletAddress: context.user.walletAddress,
          },
        };
      },
    },
    {
      name: 'kiln_list_networks',
      description: 'List active, supported, and planned Kiln network profiles.',
      inputSchema: emptyInputSchema,
      async handler() {
        return {
          success: true,
          active: services.runtimeNetwork,
          supported: listNetworkCatalog(),
          planned: listNetworkProfiles().filter((profile) => profile.status === 'planned'),
        };
      },
    },
    {
      name: 'kiln_get_capabilities',
      description: 'Return machine-readable Kiln capabilities for a network, including workflow stages and API/MCP entrypoints.',
      inputSchema: networkInputSchema,
      async handler(args) {
        const payload = validate(networkArgsSchema, args);
        return buildKilnCapabilities(services, payload.networkId);
      },
    },
    {
      name: 'kiln_get_openapi',
      description: 'Return the OpenAPI metadata for the public Kiln HTTP API that backs browser, API, and MCP workflows.',
      inputSchema: emptyInputSchema,
      async handler() {
        return buildOpenApiSpec(services.runtimeNetwork, {
          deployClearanceRequired: services.env.KILN_REQUIRE_SIM_CLEARANCE,
          shadowboxRequiredForClearance:
            services.env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE,
        });
      },
    },
    {
      name: 'kiln_list_reference_contracts',
      description: 'List reference contracts and discovered entrypoints available to guided contract workflows.',
      inputSchema: emptyInputSchema,
      async handler() {
        const contracts = await listReferenceContracts();
        return { success: true, count: contracts.length, contracts };
      },
    },
    {
      name: 'kiln_get_guided_elements',
      description: 'Return reference-informed elements for guided FA2/NFT/marketplace contract composition.',
      inputSchema: {
        type: 'object',
        properties: {
          contractType: {
            type: 'string',
            enum: ['fa2_fungible', 'nft_collection', 'marketplace'],
          },
        },
        additionalProperties: false,
      },
      async handler(args) {
        const payload = validate(guidedElementsQuerySchema, args);
        const elements = await listGuidedElementsFromReferences(payload.contractType);
        return {
          success: true,
          contractType: payload.contractType,
          count: elements.length,
          elements,
        };
      },
    },
    {
      name: 'kiln_create_guided_contract',
      description: 'Create a guided SmartPy or Michelson-stub contract draft from Kiln reference elements and user-provided project parameters.',
      inputSchema: {
        type: 'object',
        properties: {
          contractType: { type: 'string', enum: ['fa2_fungible', 'nft_collection', 'marketplace'] },
          projectName: { type: 'string' },
          symbol: { type: 'string' },
          adminAddress: { type: 'string' },
          decimals: { type: 'number' },
          initialSupply: { type: 'number' },
          maxCollectionSize: { type: 'number' },
          marketplaceFeeBps: { type: 'number' },
          royaltiesBps: { type: 'number' },
          includeMint: { type: 'boolean' },
          includeBurn: { type: 'boolean' },
          includePause: { type: 'boolean' },
          includeAdminTransfer: { type: 'boolean' },
          selectedElements: { type: 'array', items: { type: 'string' } },
          outputFormat: { type: 'string', enum: ['smartpy', 'michelson_stub'] },
        },
        required: ['contractType', 'projectName'],
        additionalProperties: false,
      },
      async handler(args) {
        const payload = validate(guidedContractPayloadSchema, args);
        const referenceElements = await listGuidedElementsFromReferences(payload.contractType);
        const selectedElementSet = new Set(payload.selectedElements);
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
        const draft = buildGuidedContractDraft(payload);
        return {
          success: true,
          ...draft,
          referenceInsights: {
            availableElements: referenceElements,
            selectedElements: selectedReferenceElements,
            sourceContracts: selectedSourceContracts,
          },
        };
      },
    },
    {
      name: 'kiln_compile_smartpy',
      description: 'Compile SmartPy source to Michelson and initial storage using the configured Kiln compiler.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          scenario: { type: 'string' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      async handler(args) {
        const payload = validate(smartpyCompilePayloadSchema, args);
        const compiled = await services.compileSmartPy(payload.source, payload.scenario);
        return {
          success: true,
          scenario: compiled.scenario,
          michelson: compiled.michelson,
          initialStorage: compiled.initialStorage,
          note: 'SmartPy source compiled to Michelson. Run pre-deploy tests before deployment.',
        };
      },
    },
    {
      name: 'kiln_run_workflow',
      description: 'Run Tezos compile/intake, predeploy validation, audit, simulation, shadowbox runtime, and clearance workflow.',
      inputSchema: workflowPayloadSchemaDescription(),
      async handler(args, context) {
        const payload = validate(workflowRunPayloadSchema, args);
        const network = selectNetworkForRequest(services.env, payload.networkId);
        if (network.ecosystem !== 'tezos') {
          throw new Error(
            `Network ${network.label} is EVM. Use kiln_compile_solidity and kiln_estimate_evm_deploy for Solidity workflows.`,
          );
        }
        const result = await runContractWorkflow(
          {
            sourceType: payload.sourceType,
            source: payload.source,
            initialStorage: payload.initialStorage,
            scenario: payload.scenario,
            simulationSteps: mapSimulationSteps(payload.simulationSteps),
          },
          {
            compileSmartPy: services.compileSmartPy,
            injectKilnTokens: (code: string) => injectKilnTokens(code, services.env),
            estimateOrigination: async (code, initialStorage) => {
              const tezos = services.createTezosService('A', network.id);
              return tezos.validateOrigination(code, initialStorage);
            },
            runShadowbox: (shadowboxInput) =>
              services.runShadowbox({
                ...shadowboxInput,
                requestId: context.requestId,
                remoteIp: context.remoteIp,
              }),
            shadowboxRequiredForClearance:
              services.env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE,
            clearanceStore: services.clearanceStore,
          },
        );
        return {
          success: true,
          networkId: network.id,
          ecosystem: network.ecosystem,
          ...result,
        };
      },
    },
    {
      name: 'kiln_run_audit',
      description: 'Run the standalone Michelson audit stage against Tezos contract source.',
      inputSchema: workflowPayloadSchemaDescription(),
      async handler(args) {
        const payload = validate(workflowRunPayloadSchema, args);
        const source = await materializeContractSource({
          sourceType: payload.sourceType,
          source: payload.source,
          scenario: payload.scenario,
          compileSmartPy: services.compileSmartPy,
        });
        return { success: true, report: auditMichelsonContract(source.michelson) };
      },
    },
    {
      name: 'kiln_run_simulation',
      description: 'Run the standalone Tezos entrypoint simulation stage and return clearance when allowed.',
      inputSchema: workflowPayloadSchemaDescription(),
      async handler(args) {
        const payload = validate(workflowRunPayloadSchema, args);
        const source = await materializeContractSource({
          sourceType: payload.sourceType,
          source: payload.source,
          scenario: payload.scenario,
          compileSmartPy: services.compileSmartPy,
        });
        const entrypoints = readMichelsonEntrypoints(source.michelson).map(
          (entry) => entry.name,
        );
        const simulation = runContractSimulation({
          entrypoints,
          steps: mapSimulationSteps(payload.simulationSteps),
        });
        const codeHash = hashContractCode(source.michelson);
        const clearance =
          simulation.success && !services.env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE
            ? services.clearanceStore.create({
                codeHash,
                auditPassed: true,
                simulationPassed: true,
              })
            : undefined;
        return {
          success: simulation.success,
          simulation,
          codeHash,
          clearance: {
            approved: Boolean(clearance),
            record: clearance,
            reason:
              !clearance && services.env.KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE
                ? 'Shadowbox runtime is required for deploy clearance. Use kiln_run_workflow.'
                : undefined,
          },
        };
      },
    },
    {
      name: 'kiln_run_shadowbox',
      description: 'Run the Tezos shadowbox runtime stage for contract source and simulation steps.',
      inputSchema: workflowPayloadSchemaDescription(),
      async handler(args, context) {
        const payload = validate(workflowRunPayloadSchema, args);
        const network = selectNetworkForRequest(services.env, payload.networkId);
        if (network.ecosystem !== 'tezos') {
          throw new Error(
            `Network ${network.label} is EVM. Shadowbox runtime currently supports Tezos contract flows.`,
          );
        }
        const source = await materializeContractSource({
          sourceType: payload.sourceType,
          source: payload.source,
          scenario: payload.scenario,
          compileSmartPy: services.compileSmartPy,
        });
        const initialStorage = resolveSmartPyInitialStorage({
          requestedInitialStorage: payload.initialStorage,
          compiledInitialStorage: source.compiled?.initialStorage,
        }).initialStorage;
        const injectedCode = injectKilnTokens(source.michelson, services.env);
        const parsedEntrypoints = readMichelsonEntrypoints(injectedCode);
        const entrypoints = parsedEntrypoints.map((entry) => entry.name);
        const entrypointTypes = Object.fromEntries(
          parsedEntrypoints
            .filter((entry) => entry.parameterType)
            .map((entry) => [entry.name, entry.parameterType as string]),
        );
        const entrypointArgCandidates = Object.fromEntries(
          parsedEntrypoints
            .filter((entry) => (entry.sampleArgs?.length ?? 0) > 0)
            .map((entry) => [entry.name, entry.sampleArgs as string[]]),
        );
        const codeHash = hashContractCode(injectedCode);
        const shadowbox = await services.runShadowbox({
          sourceType: source.sourceType,
          michelson: injectedCode,
          initialStorage,
          entrypoints,
          entrypointTypes,
          entrypointArgCandidates,
          steps: mapSimulationSteps(payload.simulationSteps),
          codeHash,
          requestId: context.requestId,
          remoteIp: context.remoteIp,
        });
        return {
          success: shadowbox.executed && shadowbox.passed,
          networkId: network.id,
          ecosystem: network.ecosystem,
          sourceType: source.sourceType,
          codeHash,
          shadowbox,
        };
      },
    },
    {
      name: 'kiln_validate_predeploy',
      description: 'Run Tezos structural and RPC estimate validation before deployment.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          code: { type: 'string' },
          initialStorage: { type: 'string' },
        },
        required: ['code', 'initialStorage'],
        additionalProperties: false,
      },
      async handler(args) {
        const payload = validate(predeployValidationPayloadSchema, args);
        const network = selectNetworkForRequest(services.env, payload.networkId);
        if (network.ecosystem !== 'tezos') {
          throw new Error(
            `Network ${network.label} is EVM. Use kiln_compile_solidity and kiln_estimate_evm_deploy for Solidity checks.`,
          );
        }
        return runPredeployValidation(
          { code: payload.code, initialStorage: payload.initialStorage },
          {
            env: services.env,
            createTezosService: (wallet) => services.createTezosService(wallet, network.id),
          },
        );
      },
    },
    {
      name: 'kiln_deploy_tezos_puppet',
      description: 'Originate a Tezos contract from a server-held Bert/Ernie puppet wallet where that network permits puppet deploys.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          code: { type: 'string' },
          wallet: { type: 'string', enum: ['A', 'B'] },
          initialStorage: { type: 'string' },
          clearanceId: { type: 'string' },
        },
        required: ['code', 'initialStorage'],
        additionalProperties: false,
      },
      async handler(args) {
        try {
          const payload = validate(uploadPayloadSchema, args);
          const network = selectNetworkForRequest(services.env, payload.networkId);
          if (network.ecosystem !== 'tezos') {
            throw new Error(
              `Network ${network.label} is EVM. Browser wallets submit EVM deploys directly.`,
            );
          }
          assertCapability(network.id, 'puppetWallets');
          return {
            ...(await deployContract(payload, {
              env: services.env,
              clearanceStore: services.clearanceStore,
              createTezosService: (wallet) => services.createTezosService(wallet, network.id),
            })),
            networkId: network.id,
          };
        } catch (error) {
          throw toolError(error);
        }
      },
    },
    {
      name: 'kiln_execute_tezos_puppet',
      description: 'Execute a Tezos contract entrypoint from Bert/Ernie puppet wallet where supported.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          contractAddress: { type: 'string' },
          entrypoint: { type: 'string' },
          args: { type: 'array' },
          amountMutez: { type: 'number' },
          wallet: { type: 'string', enum: ['A', 'B'] },
        },
        required: ['contractAddress', 'entrypoint'],
        additionalProperties: false,
      },
      async handler(args) {
        try {
          const payload = validate(executePayloadSchema, args);
          const network = selectNetworkForRequest(services.env, payload.networkId);
          if (network.ecosystem !== 'tezos') {
            throw new Error(
              `Network ${network.label} is EVM. Contract execution uses the browser wallet directly on Etherlink.`,
            );
          }
          assertCapability(network.id, 'puppetWallets');
          return {
            ...(await executeContractCall(payload, (wallet) =>
              services.createTezosService(wallet, network.id),
            )),
            networkId: network.id,
          };
        } catch (error) {
          throw toolError(error);
        }
      },
    },
    {
      name: 'kiln_run_tezos_e2e',
      description: 'Run post-deploy Tezos Bert/Ernie entrypoint sequence and coverage checks where puppet E2E is supported.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          contractAddress: { type: 'string' },
          contracts: { type: 'array' },
          steps: { type: 'array' },
        },
        required: ['steps'],
        additionalProperties: true,
      },
      async handler(args) {
        try {
          const payload = validate(e2eRunPayloadSchema, args);
          const network = selectNetworkForRequest(services.env, payload.networkId);
          if (network.ecosystem !== 'tezos') {
            throw new Error(
              `Network ${network.label} is EVM. Post-deploy E2E uses browser wallets on Etherlink.`,
            );
          }
          assertCapability(network.id, 'postdeployE2E');
          assertCapability(network.id, 'puppetWallets');
          return {
            ...(await runContractE2E(payload, (wallet) =>
              services.createTezosService(wallet, network.id),
            )),
            networkId: network.id,
          };
        } catch (error) {
          throw toolError(error);
        }
      },
    },
    {
      name: 'kiln_get_balances',
      description: 'Fetch Bert/Ernie puppet wallet balances on Tezos networks that expose server puppets.',
      inputSchema: networkInputSchema,
      async handler(args) {
        const payload = validate(networkArgsSchema, args);
        const network = selectNetworkForRequest(services.env, payload.networkId);
        if (network.ecosystem !== 'tezos' || !network.capabilities.puppetWallets) {
          return {
            networkId: network.id,
            ecosystem: network.ecosystem,
            puppetsAvailable: false,
            walletA: null,
            walletB: null,
          };
        }
        const balances = await readWalletBalances((wallet) =>
          services.createTezosService(wallet, network.id),
        );
        return {
          networkId: network.id,
          ecosystem: network.ecosystem,
          puppetsAvailable: true,
          ...balances,
        };
      },
    },
    {
      name: 'kiln_compile_solidity',
      description: 'Compile Solidity with solc-js for Etherlink/EVM networks and return bytecode, ABI, findings, and audit score.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          source: { type: 'string' },
          entryContractName: { type: 'string' },
          evmVersion: { type: 'string' },
          optimizer: { type: 'boolean' },
          optimizerRuns: { type: 'number' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      async handler(args) {
        const payload = validate(solidityCompilePayloadSchema, args);
        const network = selectNetworkForRequest(services.env, payload.networkId);
        if (network.ecosystem !== 'etherlink') {
          throw new Error(
            `Network ${network.label} does not accept Solidity. Switch to an Etherlink network.`,
          );
        }
        const compileResult = await compileSolidity({
          source: payload.source,
          entryContractName: payload.entryContractName,
          evmVersion: payload.evmVersion,
          optimizer: payload.optimizer,
          optimizerRuns: payload.optimizerRuns,
        });
        const auditFindings = auditSoliditySource(payload.source);
        return {
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
          contracts: compileResult.contracts.map((contract) => ({ name: contract.name })),
          findings: compileResult.findings,
          audit: {
            findings: auditFindings,
            score: computeAuditScore(auditFindings),
          },
          solcVersion: compileResult.solcVersion,
        };
      },
    },
    {
      name: 'kiln_estimate_evm_deploy',
      description: 'Estimate gas and fee envelope for an Etherlink/EVM deploy.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          bytecode: { type: 'string' },
          constructorArgs: { type: 'string' },
          from: { type: 'string' },
        },
        required: ['bytecode'],
        additionalProperties: false,
      },
      async handler(args) {
        try {
          const payload = validate(evmEstimatePayloadSchema, args);
          const network = selectNetworkForRequest(services.env, payload.networkId);
          if (network.ecosystem !== 'etherlink') {
            throw new Error(`Network ${network.label} is not EVM.`);
          }
          assertCapability(network.id, 'predeploy');
          const service = services.createEtherlinkService(network.id);
          const estimate = await service.estimateDeploy({
            bytecode: payload.bytecode as `0x${string}`,
            constructorCalldata: payload.constructorArgs
              ? (`0x${payload.constructorArgs}` as `0x${string}`)
              : undefined,
            from: payload.from as `0x${string}` | undefined,
          });
          return {
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
          };
        } catch (error) {
          throw toolError(error);
        }
      },
    },
    {
      name: 'kiln_dry_run_evm_deploy',
      description: 'Dry-run an Etherlink/EVM deploy with eth_call to catch constructor reverts before wallet submission.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          bytecode: { type: 'string' },
          constructorArgs: { type: 'string' },
          from: { type: 'string' },
          clearanceId: { type: 'string' },
        },
        required: ['bytecode'],
        additionalProperties: false,
      },
      async handler(args) {
        try {
          const payload = validate(evmDeployPayloadSchema, args);
          const network = selectNetworkForRequest(services.env, payload.networkId);
          if (network.ecosystem !== 'etherlink') {
            throw new Error(`Network ${network.label} is not EVM.`);
          }
          assertCapability(network.id, 'predeploy');
          const service = services.createEtherlinkService(network.id);
          const result = await service.dryRunDeploy({
            bytecode: payload.bytecode as `0x${string}`,
            constructorCalldata: payload.constructorArgs
              ? (`0x${payload.constructorArgs}` as `0x${string}`)
              : undefined,
            from: payload.from as `0x${string}` | undefined,
          });
          return {
            success: result.ok,
            networkId: network.id,
            ecosystem: network.ecosystem,
            dryRun: result,
          };
        } catch (error) {
          throw toolError(error);
        }
      },
    },
    {
      name: 'kiln_get_evm_balance',
      description: 'Fetch native-token balance for an Etherlink/EVM wallet address.',
      inputSchema: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          address: { type: 'string' },
        },
        required: ['address'],
        additionalProperties: false,
      },
      async handler(args) {
        const payload = validate(
          z.object({
            networkId: networkIdSchema,
            address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/),
          }),
          args,
        );
        const network = selectNetworkForRequest(services.env, payload.networkId);
        if (network.ecosystem !== 'etherlink') {
          throw new Error(`Network ${network.label} is not EVM.`);
        }
        const service = services.createEtherlinkService(network.id);
        const balance = await service.getBalance(payload.address as `0x${string}`);
        const chainId = await service.getChainId();
        return {
          success: true,
          networkId: network.id,
          ecosystem: network.ecosystem,
          address: payload.address,
          balance,
          symbol: network.nativeSymbol,
          chainId,
        };
      },
    },
    {
      name: 'kiln_export_bundle',
      description: 'Create mainnet-readiness bundle metadata and zip download URL from contract artifacts and workflow reports.',
      inputSchema: {
        type: 'object',
        properties: {
          projectName: { type: 'string' },
          sourceType: { type: 'string', enum: ['smartpy', 'michelson'] },
          source: { type: 'string' },
          compiledMichelson: { type: 'string' },
          initialStorage: { type: 'string' },
          workflow: {},
          audit: {},
          simulation: {},
          deployment: { type: 'object' },
        },
        required: ['source', 'compiledMichelson', 'initialStorage'],
        additionalProperties: false,
      },
      async handler(args) {
        const payload = validate(exportBundlePayloadSchema, args);
        const result = await services.exportBundle({
          ...payload,
          deployment: {
            networkId: payload.deployment?.networkId ?? services.runtimeNetwork.id,
            rpcUrl: payload.deployment?.rpcUrl ?? services.runtimeNetwork.rpcUrl,
            chainId: payload.deployment?.chainId ?? services.runtimeNetwork.chainId,
            contractAddress: payload.deployment?.contractAddress,
            originatedAt: payload.deployment?.originatedAt,
          },
        });
        return { success: true, ...result };
      },
    },
  ];
}
