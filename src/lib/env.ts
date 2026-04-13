import { z } from 'zod';
import type { WalletType } from './types.js';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);
const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }
    return value;
  },
  z.string().trim().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TEZOS_RPC_URL: z.string().url().default('https://rpc.shadownet.teztnets.com'),
  TEZOS_CHAIN_ID: optionalNonEmptyString,
  WALLET_A_SECRET_KEY: optionalNonEmptyString,
  WALLET_B_SECRET_KEY: optionalNonEmptyString,
  KILN_DUMMY_TOKENS: optionalNonEmptyString,
  KILN_TOKEN_BRONZE: optionalNonEmptyString,
  KILN_TOKEN_SILVER: optionalNonEmptyString,
  KILN_TOKEN_GOLD: optionalNonEmptyString,
  KILN_TOKEN_PLATINUM: optionalNonEmptyString,
  KILN_TOKEN_DIAMOND: optionalNonEmptyString,
  API_AUTH_TOKEN: optionalNonEmptyString,
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  API_JSON_LIMIT: z.string().trim().min(1).default('10mb'),
  CORS_ORIGINS: optionalNonEmptyString,
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${issues}`);
  }

  return parsed.data;
}

export function getWalletSecret(env: AppEnv, walletType: WalletType): string {
  const secret =
    walletType === 'A' ? env.WALLET_A_SECRET_KEY : env.WALLET_B_SECRET_KEY;

  if (!secret) {
    throw new Error(
      `Secret key for Wallet ${walletType} is not configured in environment variables.`,
    );
  }

  return secret;
}

export function parseCorsOrigins(corsOrigins?: string): string[] {
  if (!corsOrigins) {
    return [];
  }

  return corsOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
