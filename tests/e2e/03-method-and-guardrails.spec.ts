import { test, expect } from '@playwright/test';
import { callKilnApi } from './helpers/kiln-api';
import { baseUrl } from './helpers/kiln-env';

const contentType = (response: { headers: Record<string, string> }) =>
  (response.headers['content-type'] || '').toLowerCase();

test('method shape on guided endpoints is explicit and not SPA fallback for signed routes', async () => {
  const guidedGet = await callKilnApi('/api/kiln/contracts/guided/elements', {
    method: 'GET',
    expectJson: false,
  });

  // A robust API should reject unsupported methods with API JSON or explicit method errors.
  expect([401, 404, 405]).toContain(guidedGet.status);

  const referenceGet = await callKilnApi('/api/kiln/reference/contracts', {
    method: 'GET',
    expectJson: true,
  });
  expect(referenceGet.status).toBe(200);

  const referenceGetWithSlash = await callKilnApi('/api/kiln/reference/contracts/', {
    method: 'GET',
    expectJson: true,
  });
  expect([200, 401, 404, 405]).toContain(referenceGetWithSlash.status);
  if (referenceGetWithSlash.status === 200) {
    expect(contentType(referenceGetWithSlash)).toContain('application/json');
  }

  const referenceApi = await callKilnApi('/api/kiln/reference/contracts', {
    method: 'GET',
    expectJson: false,
  });
  expect(referenceApi.status).toBe(200);
  expect(contentType(referenceApi)).toContain('application/json');
});

test('security headers are present on top-level document response', async ({ page }) => {
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);

  const headers = response ? response.headers() : {};
  const csp = (headers['content-security-policy'] || '').toLowerCase();
  const hsts = (headers['strict-transport-security'] || '').toLowerCase();
  expect(csp.length).toBeGreaterThan(10);
  expect(hsts.includes('max-age')).toBe(true);
});
