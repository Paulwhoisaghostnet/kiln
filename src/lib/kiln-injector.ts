/**
 * Kiln Injector Utility
 * Parses Michelson code and replaces hardcoded KT1 addresses with Kiln dummy token addresses.
 */

const kt1Regex = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const kt1InCodeRegex = /KT1[1-9A-HJ-NP-Za-km-z]{33}/g;
const namedTokenKeys = [
  'KILN_TOKEN_BRONZE',
  'KILN_TOKEN_SILVER',
  'KILN_TOKEN_GOLD',
  'KILN_TOKEN_PLATINUM',
  'KILN_TOKEN_DIAMOND',
] as const;

type NamedTokenKey = (typeof namedTokenKeys)[number];

export type TokenTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface DummyTokenConfig {
  KILN_DUMMY_TOKENS?: string;
  KILN_TOKEN_BRONZE?: string;
  KILN_TOKEN_SILVER?: string;
  KILN_TOKEN_GOLD?: string;
  KILN_TOKEN_PLATINUM?: string;
  KILN_TOKEN_DIAMOND?: string;
}

export interface ResolvedDummyTokens {
  ordered: string[];
  byTier: Record<TokenTier, string | null>;
  source: 'named' | 'list';
}

function parseKt1Address(address: string, fieldName: string): string {
  if (!kt1Regex.test(address)) {
    throw new Error(
      `Invalid dummy token address "${address}" in ${fieldName}. Expected a KT1 contract address.`,
    );
  }

  return address;
}

export function parseDummyTokens(dummyTokensRaw?: string): string[] {
  if (!dummyTokensRaw) {
    return [];
  }

  const tokens = dummyTokensRaw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const invalidToken = tokens.find((token) => !kt1Regex.test(token));
  if (invalidToken) {
    throw new Error(
      `Invalid dummy token address "${invalidToken}". KILN_DUMMY_TOKENS must only contain KT1 addresses.`,
    );
  }

  return tokens;
}

export function resolveDummyTokens(config: DummyTokenConfig): ResolvedDummyTokens {
  const normalizedNamed = namedTokenKeys.reduce(
    (acc, key) => {
      const value = config[key]?.trim();
      if (value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Partial<Record<NamedTokenKey, string>>,
  );
  const presentNamedKeys = Object.keys(normalizedNamed) as NamedTokenKey[];

  if (presentNamedKeys.length > 0 && presentNamedKeys.length < namedTokenKeys.length) {
    const missingKeys = namedTokenKeys.filter((key) => !normalizedNamed[key]);
    throw new Error(
      `Named dummy token configuration is incomplete. Missing: ${missingKeys.join(', ')}.`,
    );
  }

  if (presentNamedKeys.length === namedTokenKeys.length) {
    const ordered = namedTokenKeys.map((key) =>
      parseKt1Address(
        normalizedNamed[key] as string,
        key,
      ),
    );
    return {
      ordered,
      byTier: {
        bronze: ordered[0] ?? null,
        silver: ordered[1] ?? null,
        gold: ordered[2] ?? null,
        platinum: ordered[3] ?? null,
        diamond: ordered[4] ?? null,
      },
      source: 'named',
    };
  }

  const ordered = parseDummyTokens(config.KILN_DUMMY_TOKENS);
  if (ordered.length === 0) {
    throw new Error(
      'KILN_DUMMY_TOKENS is required and must contain at least one valid KT1 address (or configure all KILN_TOKEN_* variables).',
    );
  }

  return {
    ordered,
    byTier: {
      bronze: ordered[0] ?? null,
      silver: ordered[1] ?? null,
      gold: ordered[2] ?? null,
      platinum: ordered[3] ?? null,
      diamond: ordered[4] ?? null,
    },
    source: 'list',
  };
}

export function injectKilnTokens(
  michelsonCode: string,
  dummyTokenConfig: string | DummyTokenConfig | undefined = process.env.KILN_DUMMY_TOKENS,
): string {
  const dummyTokens =
    typeof dummyTokenConfig === 'string' || typeof dummyTokenConfig === 'undefined'
      ? parseDummyTokens(dummyTokenConfig)
      : resolveDummyTokens(dummyTokenConfig).ordered;
  if (dummyTokens.length === 0) {
    throw new Error(
      'KILN_DUMMY_TOKENS is required and must contain at least one valid KT1 address (or configure all KILN_TOKEN_* variables).',
    );
  }

  let tokenIndex = 0;

  return michelsonCode.replace(kt1InCodeRegex, (match) => {
    const replacement = dummyTokens[tokenIndex % dummyTokens.length];
    if (!replacement) {
      throw new Error('No replacement token available for injection.');
    }
    console.log(`[Kiln Injector] Replacing ${match} with ${replacement}`);
    tokenIndex += 1;
    return replacement;
  });
}
