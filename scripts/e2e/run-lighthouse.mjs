import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ARTIFACT_ROOT = 'artifacts/kiln-e2e';

function runIdValue() {
  return (
    process.env.KILN_E2E_RUN_ID ??
    new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  );
}

function runRootDir(currentRunId = runIdValue()) {
  return path.join(ARTIFACT_ROOT, currentRunId);
}

function ensureReportDirs(base) {
  const dirs = [
    base,
    path.join(base, 'playwright'),
    path.join(base, 'screenshots'),
    path.join(base, 'traces'),
    path.join(base, 'videos'),
    path.join(base, 'api-captures'),
    path.join(base, 'console'),
    path.join(base, 'lighthouse'),
    path.join(base, 'axe'),
    path.join(base, 'report'),
    path.join(base, 'browser-agent'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return { base, dirs };
}

const baseUrl = process.env.KILN_BASE_URL || 'https://kiln.wtfgameshow.app';
const currentRunId = process.env.KILN_E2E_RUN_ID || runIdValue();
const root = runRootDir(currentRunId);
ensureReportDirs(root);

const outputJson = path.join(root, 'lighthouse', 'lighthouse.json');
const outputHtml = path.join(root, 'lighthouse', 'lighthouse.html');

const command = [
  'npx',
  'lighthouse',
  `${baseUrl}`,
  '--only-categories=performance,accessibility,best-practices,seo',
  '--output=json',
  `--output-path=${outputJson}`,
  '--quiet',
  '--chrome-flags="--headless --no-sandbox"',
].join(' ');

console.log(`Running Lighthouse: ${command}`);
execSync(command, { stdio: 'inherit', shell: true });

if (!fs.existsSync(outputHtml)) {
  execSync(
    `npx lighthouse ${baseUrl} --only-categories=performance,accessibility,best-practices,seo --output=html --output-path=${outputHtml} --quiet --chrome-flags="--headless --no-sandbox"`,
    { stdio: 'inherit', shell: true },
  );
}

console.log(`Lighthouse artifacts written to ${root}/lighthouse`);
