import { z } from 'zod';
import { getDefaultNetworkId, type KilnNetworkId } from './networks.js';
import type { WalletType } from './types.js';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);
const networkSchema = z.enum([
  'tezos-shadownet',
  'tezos-ghostnet',
  'tezos-mainnet',
  'etherlink-shadownet',
  'etherlink-testnet',
  'etherlink-mainnet',
  'jstz-local',
]);
const shadowboxProviderSchema = z.enum(['mock', 'command']);
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
const optionalEnvBoolean = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  KILN_NETWORK: networkSchema.default(getDefaultNetworkId()),
  TEZOS_RPC_URL: z.string().url().default('https://rpc.shadownet.teztnets.com'),
  TEZOS_CHAIN_ID: optionalNonEmptyString,
  /** Per-network RPC overrides. Set these when the defaults are rate-limited or you run your own node. */
  TEZOS_MAINNET_RPC_URL: optionalNonEmptyString,
  TEZOS_GHOSTNET_RPC_URL: optionalNonEmptyString,
  ETHERLINK_SHADOWNET_RPC_URL: optionalNonEmptyString,
  ETHERLINK_TESTNET_RPC_URL: optionalNonEmptyString,
  ETHERLINK_MAINNET_RPC_URL: optionalNonEmptyString,
  WALLET_A_SECRET_KEY: optionalNonEmptyString,
  WALLET_B_SECRET_KEY: optionalNonEmptyString,
  KILN_DUMMY_TOKENS: optionalNonEmptyString,
  KILN_TOKEN_BRONZE: optionalNonEmptyString,
  KILN_TOKEN_SILVER: optionalNonEmptyString,
  KILN_TOKEN_GOLD: optionalNonEmptyString,
  KILN_TOKEN_PLATINUM: optionalNonEmptyString,
  KILN_TOKEN_DIAMOND: optionalNonEmptyString,
  API_AUTH_TOKEN: optionalNonEmptyString,
  KILN_API_AUTH_REQUIRED: optionalEnvBoolean,
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  API_JSON_LIMIT: z.string().trim().min(1).default('10mb'),
  CORS_ORIGINS: optionalNonEmptyString,
  KILN_REQUIRE_SIM_CLEARANCE: envBoolean.default(true),
  KILN_SHADOWBOX_ENABLED: envBoolean.default(false),
  KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE: envBoolean.default(false),
  KILN_SHADOWBOX_PROVIDER: shadowboxProviderSchema.default('mock'),
  KILN_SHADOWBOX_COMMAND: optionalNonEmptyString,
  KILN_SHADOWBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  KILN_SHADOWBOX_MAX_ACTIVE: z.coerce.number().int().positive().default(2),
  KILN_SHADOWBOX_MAX_ACTIVE_PER_IP: z.coerce.number().int().positive().default(1),
  KILN_SHADOWBOX_MAX_SOURCE_BYTES: z.coerce.number().int().positive().default(250_000),
  KILN_SHADOWBOX_MAX_STEPS: z.coerce.number().int().positive().default(24),
  KILN_SHADOWBOX_WORKDIR: optionalNonEmptyString,
  KILN_ACTIVITY_LOG_PATH: optionalNonEmptyString,
  // Native hosting paths (Phase 1 of Hetzner migration). All optional so dev
  // retains repo-relative defaults; production systemd unit pins absolute paths.
  KILN_PYTHON: optionalNonEmptyString,
  KILN_EXPORT_ROOT: optionalNonEmptyString,
  KILN_REFERENCE_ROOT: optionalNonEmptyString,
  // Reference corpus bootstrap caps. Defaults chosen to match
  // `scripts/fetch-reference-mainnet-contracts.py`'s built-in bundle (5
  // contracts * ~3 artifacts each). Raise carefully: each contract can pull
  // 1–5 MB of JSON.
  KILN_REFERENCE_MAX_FILES: z.coerce.number().int().positive().default(200),
  KILN_REFERENCE_MAX_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
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
