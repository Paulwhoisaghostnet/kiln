import { describe, expect, it } from 'vitest';
import { normalizeNetlifyApiPath } from '../src/lib/netlify-api-path.js';

describe('normalizeNetlifyApiPath', () => {
  it('keeps api-prefixed paths as-is', () => {
    expect(normalizeNetlifyApiPath('/api/health')).toBe('/api/health');
    expect(normalizeNetlifyApiPath('/api/kiln/upload')).toBe('/api/kiln/upload');
  });

  it('normalizes Netlify function-prefixed paths', () => {
    expect(normalizeNetlifyApiPath('/.netlify/functions/api/health')).toBe(
      '/api/health',
    );
    expect(normalizeNetlifyApiPath('/.netlify/functions/api/kiln/balances')).toBe(
      '/api/kiln/balances',
    );
  });

  it('prefixes non-api paths', () => {
    expect(normalizeNetlifyApiPath('/health')).toBe('/api/health');
    expect(normalizeNetlifyApiPath('kiln/execute')).toBe('/api/kiln/execute');
  });

  it('defaults root paths to health endpoint', () => {
    expect(normalizeNetlifyApiPath('/')).toBe('/api/health');
    expect(normalizeNetlifyApiPath('')).toBe('/api/health');
    expect(normalizeNetlifyApiPath(undefined)).toBe('/api/health');
  });
});
