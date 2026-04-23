import { z } from 'zod';

const walletSchema = z.enum(['A', 'B']);
const kt1AddressSchema = z
  .string()
  .trim()
  .regex(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/, 'Invalid KT1 contract address');
const evmAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM contract address (0x + 40 hex chars expected)');
const evmBytecodeSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]*$/, 'Invalid EVM bytecode (hex string with 0x prefix expected)')
  .min(4, 'Bytecode is too short');

/**
 * Network selector carried on every mutating request. Missing means "server
 * default" which is whatever `KILN_NETWORK` env says (usually shadownet in dev,
 * whatever the host picks in prod).
 */
export const networkIdSchema = z
  .enum([
    'tezos-shadownet',
    'tezos-ghostnet',
    'tezos-mainnet',
    'etherlink-testnet',
    'etherlink-mainnet',
  ])
  .optional();

const michelsonArgumentSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);

export const uploadPayloadSchema = z.object({
  networkId: networkIdSchema,
  code: z.string().trim().min(1, 'Michelson code is required'),
  wallet: walletSchema.default('A'),
  initialStorage: z.string().trim().min(1, 'initialStorage is required'),
  clearanceId: z.string().trim().min(6).max(128).optional(),
});

export const executePayloadSchema = z.object({
  networkId: networkIdSchema,
  contractAddress: kt1AddressSchema,
  entrypoint: z
    .string()
    .trim()
    .min(1, 'entrypoint is required')
    .max(128, 'entrypoint is too long'),
  args: z.array(michelsonArgumentSchema).default([]),
  wallet: walletSchema.default('A'),
});

export const predeployValidationPayloadSchema = z.object({
  networkId: networkIdSchema,
  code: z.string().trim().min(1, 'Michelson code is required'),
  initialStorage: z.string().trim().min(1, 'initialStorage is required'),
});

export const e2eStepSchema = z.object({
  label: z.string().trim().max(80, 'label is too long').optional(),
  wallet: walletSchema,
  entrypoint: z
    .string()
    .trim()
    .min(1, 'entrypoint is required')
    .max(128, 'entrypoint is too long'),
  args: z.array(michelsonArgumentSchema).default([]),
});

export const e2eRunPayloadSchema = z.object({
  networkId: networkIdSchema,
  contractAddress: kt1AddressSchema,
  steps: z.array(e2eStepSchema).min(1, 'At least one E2E step is required'),
});

const guidedContractTypeSchema = z.enum([
  'fa2_fungible',
  'nft_collection',
  'marketplace',
]);

const guidedOutputFormatSchema = z.enum(['smartpy', 'michelson_stub']);
const guidedElementIdSchema = z.enum([
  'admin_controls',
  'pause_guard',
  'operator_support',
  'permit_hook',
  'allowlist_gate',
  'metadata_freeze',
  'royalties',
  'market_fees',
]);

export const guidedContractPayloadSchema = z.object({
  contractType: guidedContractTypeSchema,
  projectName: z
    .string()
    .trim()
    .min(2, 'projectName must be at least 2 characters')
    .max(64, 'projectName is too long'),
  symbol: z.string().trim().max(10, 'symbol is too long').optional(),
  adminAddress: z
    .string()
    .trim()
    .regex(/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/, 'Invalid tz address')
    .optional(),
  decimals: z.coerce.number().int().min(0).max(18).optional(),
  initialSupply: z.coerce.number().int().min(0).optional(),
  maxCollectionSize: z.coerce.number().int().min(1).optional(),
  marketplaceFeeBps: z.coerce.number().int().min(0).max(10_000).optional(),
  royaltiesBps: z.coerce.number().int().min(0).max(10_000).optional(),
  includeMint: z.boolean().default(true),
  includeBurn: z.boolean().default(true),
  includePause: z.boolean().default(true),
  includeAdminTransfer: z.boolean().default(true),
  selectedElements: z.array(guidedElementIdSchema).max(20).default([]),
  outputFormat: guidedOutputFormatSchema.default('smartpy'),
});

export const guidedElementsQuerySchema = z.object({
  contractType: guidedContractTypeSchema.default('fa2_fungible'),
});

export const smartpyCompilePayloadSchema = z.object({
  source: z.string().trim().min(1, 'SmartPy source is required'),
  scenario: z.string().trim().min(1).max(120).optional(),
});

const workflowSourceTypeSchema = z.enum(['auto', 'michelson', 'smartpy']);
const workflowWalletSchema = z.enum(['bert', 'ernie', 'user']);

export const workflowSimulationStepSchema = z.object({
  label: z.string().trim().max(120).optional(),
  wallet: workflowWalletSchema.default('bert'),
  entrypoint: z.string().trim().min(1).max(128),
  args: z.array(michelsonArgumentSchema).default([]),
});

export const workflowRunPayloadSchema = z.object({
  networkId: networkIdSchema,
  sourceType: workflowSourceTypeSchema.default('auto'),
  source: z.string().trim().min(1, 'Contract source is required'),
  initialStorage: z.string().trim().min(1).optional(),
  scenario: z.string().trim().min(1).max(120).optional(),
  simulationSteps: z.array(workflowSimulationStepSchema).default([]),
});

/**
 * Solidity compile payload. `source` is the unified flattened .sol file (or a
 * multi-file object keyed by path). `entryContractName` picks which contract
 * from the compiled bundle is the deploy target — leave empty to use the last
 * one defined, matching hardhat/foundry default semantics.
 */
export const solidityCompilePayloadSchema = z.object({
  networkId: networkIdSchema,
  source: z.string().trim().min(1, 'Solidity source is required'),
  entryContractName: z.string().trim().min(1).max(120).optional(),
  evmVersion: z
    .enum(['paris', 'shanghai', 'cancun', 'london', 'berlin', 'istanbul'])
    .default('shanghai'),
  optimizer: z.boolean().default(true),
  optimizerRuns: z.coerce.number().int().min(1).max(1_000_000).default(200),
});

/**
 * EVM deploy payload. Bytecode is hex with 0x prefix. Constructor args are
 * pre-ABI-encoded by the client (simpler than teaching the server every ABI);
 * clients use viem's `encodeDeployData` to produce the full calldata.
 */
export const evmDeployPayloadSchema = z.object({
  networkId: networkIdSchema,
  bytecode: evmBytecodeSchema,
  /** Optional: ABI-encoded constructor arguments (hex, no 0x prefix). */
  constructorArgs: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]*$/, 'constructorArgs must be hex')
    .optional(),
  /** Used only for dry-run / estimate paths. Real deploys require a connected wallet. */
  from: evmAddressSchema.optional(),
  clearanceId: z.string().trim().min(6).max(128).optional(),
});

export const evmEstimatePayloadSchema = z.object({
  networkId: networkIdSchema,
  bytecode: evmBytecodeSchema,
  constructorArgs: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]*$/, 'constructorArgs must be hex')
    .optional(),
  from: evmAddressSchema.optional(),
});

export const exportBundlePayloadSchema = z.object({
  projectName: z.string().trim().min(2).max(80).default('Kiln Contract Bundle'),
  sourceType: z.enum(['smartpy', 'michelson']).default('michelson'),
  source: z.string().trim().min(1, 'Contract source is required'),
  compiledMichelson: z
    .string()
    .trim()
    .min(1, 'compiledMichelson is required'),
  initialStorage: z.string().trim().min(1, 'initialStorage is required'),
  workflow: z.unknown().optional(),
  audit: z.unknown().optional(),
  simulation: z.unknown().optional(),
  deployment: z
    .object({
      networkId: z.string().trim().min(1).optional(),
      rpcUrl: z.string().trim().min(1).optional(),
      chainId: z.string().trim().min(1).optional(),
      contractAddress: z.string().trim().min(1).optional(),
      originatedAt: z.string().trim().min(1).optional(),
    })
    .optional(),
});

export type UploadPayload = z.infer<typeof uploadPayloadSchema>;
export type ExecutePayload = z.infer<typeof executePayloadSchema>;
export type PredeployValidationPayload = z.infer<
  typeof predeployValidationPayloadSchema
>;
export type E2ERunPayload = z.infer<typeof e2eRunPayloadSchema>;
export type GuidedContractPayload = z.infer<typeof guidedContractPayloadSchema>;
export type GuidedElementsQuery = z.infer<typeof guidedElementsQuerySchema>;
export type SmartPyCompilePayload = z.infer<typeof smartpyCompilePayloadSchema>;
export type WorkflowRunPayload = z.infer<typeof workflowRunPayloadSchema>;
export type SolidityCompilePayload = z.infer<typeof solidityCompilePayloadSchema>;
export type EvmDeployPayload = z.infer<typeof evmDeployPayloadSchema>;
export type EvmEstimatePayload = z.infer<typeof evmEstimatePayloadSchema>;
export type ExportBundlePayload = z.infer<typeof exportBundlePayloadSchema>;
