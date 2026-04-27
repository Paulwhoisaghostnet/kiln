export type E2EInputMode =
  | 'passive-live'
  | 'auth-live'
  | 'tezos-shadownet-mutating'
  | 'etherlink-shadownet-mutating'
  | 'mainnet-guardrail'
  | 'manual-mainnet-live';

const KNOWN_MODES: E2EInputMode[] = [
  'passive-live',
  'auth-live',
  'tezos-shadownet-mutating',
  'etherlink-shadownet-mutating',
  'mainnet-guardrail',
  'manual-mainnet-live',
];

export const baseUrl =
  process.env.KILN_E2E_BASE_URL ??
  process.env.KILN_BASE_URL ??
  process.env.BASE_URL ??
  'https://kiln.wtfgameshow.app';

export const e2eMode =
  (process.env.KILN_E2E_MODE as E2EInputMode) || 'passive-live';

if (!KNOWN_MODES.includes(e2eMode)) {
  throw new Error(`Invalid KILN_E2E_MODE: ${e2eMode}`);
}

export const allowChainMutations =
  process.env.KILN_E2E_ALLOW_CHAIN_MUTATIONS === 'true';

export const apiToken =
  process.env.KILN_E2E_API_TOKEN || process.env.KILN_API_TOKEN || undefined;

export const isAuthMode = e2eMode === 'auth-live';
export const isMutatingMode = e2eMode.includes('mutating');
export const isMainnetMode = e2eMode.includes('mainnet');

if (isMutatingMode && !allowChainMutations) {
  throw new Error(
    'Mutation mode requested without KILN_E2E_ALLOW_CHAIN_MUTATIONS=true',
  );
}

if (isAuthMode && !apiToken) {
  throw new Error('KILN_E2E_MODE=auth-live requires KILN_E2E_API_TOKEN');
}

export const requiredHeaders = apiToken
  ? {
      'x-kiln-token': apiToken,
      'x-api-token': apiToken,
    }
  : {};
