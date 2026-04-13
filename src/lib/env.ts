import { z } from 'zod';
import { getDefaultNetworkId, type KilnNetworkId } from './networks.js';
import type { WalletType } from './types.js';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);
const networkSchema = z.enum([
  'tezos-shadownet',
  'tezos-ghostnet',
  'tezos-mainnet',
  'etherlink-testnet',
  'etherlink-mainnet',
]);
const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }
    return value;
  },
  z.string().trim().min(1).optional(),
);

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  KILN_NETWORK: networkSchema.default(getDefaultNetworkId()),
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
  KILN_REQUIRE_SIM_CLEARANCE: envBoolean.default(true),
  KILN_ACTIVITY_LOG_PATH: optionalNonEmptyString,
});

export type AppEnv = z.infer<typeof envSchema>;
export type AppNetwork = KilnNetworkId;

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
