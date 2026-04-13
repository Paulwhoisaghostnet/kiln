import { z } from 'zod';

const walletSchema = z.enum(['A', 'B']);
const kt1AddressSchema = z
  .string()
  .trim()
  .regex(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/, 'Invalid KT1 contract address');

const michelsonArgumentSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);

export const uploadPayloadSchema = z.object({
  code: z.string().trim().min(1, 'Michelson code is required'),
  wallet: walletSchema.default('A'),
  initialStorage: z.string().trim().min(1, 'initialStorage is required'),
});

export const executePayloadSchema = z.object({
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
  contractAddress: kt1AddressSchema,
  steps: z.array(e2eStepSchema).min(1, 'At least one E2E step is required'),
});

export type UploadPayload = z.infer<typeof uploadPayloadSchema>;
export type ExecutePayload = z.infer<typeof executePayloadSchema>;
export type PredeployValidationPayload = z.infer<
  typeof predeployValidationPayloadSchema
>;
export type E2ERunPayload = z.infer<typeof e2eRunPayloadSchema>;
