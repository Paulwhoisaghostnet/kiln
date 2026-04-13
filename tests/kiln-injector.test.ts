import { describe, expect, it } from 'vitest';
import {
  injectKilnTokens,
  parseDummyTokens,
  resolveDummyTokens,
} from '../src/lib/kiln-injector.js';

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

describe('resolveDummyTokens', () => {
  it('prefers named token variables when all are configured', () => {
    const resolved = resolveDummyTokens({
      KILN_TOKEN_BRONZE: 'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',
      KILN_TOKEN_SILVER: 'KT1SxqT3TUF44syQ5QauuF9L8upWjr4ayVoq',
      KILN_TOKEN_GOLD: 'KT1SVy1QrAnXB9oyGPWEbRnotrggPkHt2TLH',
      KILN_TOKEN_PLATINUM: 'KT1KiGwrgfsg7sJTyJHkGstLY4YKfrHAf3TN',
      KILN_TOKEN_DIAMOND: 'KT1JAaj2EUjGBfWmJGy3Z5UsoGus7iGVkvEG',
      KILN_DUMMY_TOKENS:
        'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton,KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg',
    });

    expect(resolved.source).toBe('named');
    expect(resolved.byTier).toEqual({
      bronze: 'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',
      silver: 'KT1SxqT3TUF44syQ5QauuF9L8upWjr4ayVoq',
      gold: 'KT1SVy1QrAnXB9oyGPWEbRnotrggPkHt2TLH',
      platinum: 'KT1KiGwrgfsg7sJTyJHkGstLY4YKfrHAf3TN',
      diamond: 'KT1JAaj2EUjGBfWmJGy3Z5UsoGus7iGVkvEG',
    });
  });

  it('falls back to KILN_DUMMY_TOKENS when named vars are absent', () => {
    const resolved = resolveDummyTokens({
      KILN_DUMMY_TOKENS:
        'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton,KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg',
    });

    expect(resolved.source).toBe('list');
    expect(resolved.ordered).toEqual([
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg',
    ]);
    expect(resolved.byTier.bronze).toBe('KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton');
    expect(resolved.byTier.silver).toBe('KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg');
    expect(resolved.byTier.gold).toBeNull();
  });

  it('throws when named vars are partially configured', () => {
    expect(() =>
      resolveDummyTokens({
        KILN_TOKEN_BRONZE: 'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',
      }),
    ).toThrow(/Named dummy token configuration is incomplete/);
  });
});
