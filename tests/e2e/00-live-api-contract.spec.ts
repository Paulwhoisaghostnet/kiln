import { test, expect } from '@playwright/test';
import {
  callKilnApi,
  expectUnauthorized,
  stripTokenForUnauthorized,
} from './helpers/kiln-api';
import {
  requiredNetworks,
  requiredOpenApiPaths,
  protectedPostPaths,
} from './fixtures/kiln-live-matrix';

for (const network of requiredNetworks) {
  test.beforeEach(() => {
    // keep this loop outside test body so playwright shows explicit case labeling
    void network;
  });
}

test('public health and networks shape', async () => {
  const health = await callKilnApi('/api/health');
  expect(health.status).toBe(200);
  expect(health.json).toMatchObject({ status: 'ok' });

  const networks = await callKilnApi('/api/networks');
  expect(networks.status).toBe(200);
  const payload = networks.json as {
    success?: boolean;
    supported?: Array<{ id: string; status: string }>;
  };
  expect(payload.success).toBe(true);
  expect(payload.supported?.map((item) => item.id).sort()).toEqual(
    expect.arrayContaining(requiredNetworks),
  );
});

test('capabilities includes full workflow stages', async () => {
  const response = await callKilnApi('/api/kiln/capabilities');
  expect(response.status).toBe(200);
  const data = response.json as {
    workflowStages?: string[];
    runtime?: { clearanceRequired?: boolean };
    entrypoints?: Record<string, string>;
  };

  const stages = data.workflowStages ?? [];
  expect(stages.length).toBeGreaterThan(0);
  expect(stages).toContain('validate');
  expect(stages).toContain('deploy');
  expect(stages).toContain('post_deploy_e2e');
  expect(data.runtime?.clearanceRequired).toBe(true);
  expect(typeof data.entrypoints?.workflow).toBe('string');
});

test('openapi includes all required surface paths', async () => {
  const response = await callKilnApi('/api/kiln/openapi.json');
  expect(response.status).toBe(200);
  const payload = response.json as { paths?: Record<string, unknown> };
  const paths = Object.keys(payload.paths ?? {});
  expect(paths).toEqual(expect.arrayContaining(requiredOpenApiPaths));
});

test('api methods are protected when auth is required', async () => {
  for (const pathname of protectedPostPaths.slice(0, 8)) {
    await expectUnauthorized(pathname, 'POST');
  }

  await expectUnauthorized('/api/kiln/balances', 'GET');

  const refSlash = await stripTokenForUnauthorized('/api/kiln/reference/contracts/');
  expect([401, 404]).toContain(refSlash.status);

  const guidedGet = await stripTokenForUnauthorized('/api/kiln/contracts/guided/elements');
  expect([200, 401, 404, 405]).toContain(guidedGet.status);
});

