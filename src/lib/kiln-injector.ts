/**
 * Kiln Injector Utility
 * Parses Michelson code and replaces hardcoded KT1 addresses with Kiln dummy token addresses.
 */

const kt1Regex = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const kt1InCodeRegex = /KT1[1-9A-HJ-NP-Za-km-z]{33}/g;

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

export function injectKilnTokens(
  michelsonCode: string,
  dummyTokensRaw: string | undefined = process.env.KILN_DUMMY_TOKENS,
): string {
  const dummyTokens = parseDummyTokens(dummyTokensRaw);
  if (dummyTokens.length === 0) {
    throw new Error(
      'KILN_DUMMY_TOKENS is required and must contain at least one valid KT1 address.',
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
