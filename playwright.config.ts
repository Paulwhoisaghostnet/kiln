import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.KILN_BASE_URL ?? 'https://kiln.wtfgameshow.app';
const runId =
  process.env.KILN_E2E_RUN_ID ??
  new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const runArtifactsRoot = path.join(process.cwd(), 'artifacts', 'kiln-e2e', runId);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: path.join(runArtifactsRoot, 'artifacts'),
  reporter: [
    ['html', { outputFolder: path.join(runArtifactsRoot, 'playwright-report') }],
    [
      'json',
      {
        outputFile: path.join(
          runArtifactsRoot,
          'report',
          'kiln-playwright-results.json',
        ),
      },
    ],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
