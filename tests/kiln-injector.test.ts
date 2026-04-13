import { describe, expect, it } from 'vitest';
import { injectKilnTokens, parseDummyTokens } from '../src/lib/kiln-injector.js';

describe('parseDummyTokens', () => {
  it('parses comma-separated KT1 addresses', () => {
    const tokens = parseDummyTokens(
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton, KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg',
    );

    expect(tokens).toEqual([
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg',
    ]);
  });

  it('throws when a token is not a valid KT1 address', () => {
    expect(() =>
      parseDummyTokens('KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton,not-an-address'),
    ).toThrow(/Invalid dummy token address/);
  });
});

describe('injectKilnTokens', () => {
  it('replaces hardcoded KT1 addresses using configured dummy tokens', () => {
    const source = `
      parameter unit;
      storage unit;
      code { PUSH address "KT1AFA2mwNUMNd4SsujE1YYp29vd8BZejyKW" ;
             PUSH address "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" ;
             DROP ; UNIT ; NIL operation ; PAIR };
    `;

    const injected = injectKilnTokens(
      source,
      'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg,KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn',
    );

    expect(injected).toContain('KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg');
    expect(injected).toContain('KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn');
    expect(injected).not.toContain('KT1AFA2mwNUMNd4SsujE1YYp29vd8BZejyKW');
    expect(injected).not.toContain('KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton');
  });

  it('throws when dummy tokens are missing', () => {
    expect(() => injectKilnTokens('parameter unit;')).toThrow(
      /KILN_DUMMY_TOKENS is required/,
    );
  });
});
