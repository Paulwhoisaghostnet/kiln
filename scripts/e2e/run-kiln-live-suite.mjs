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
}

const mode = process.env.KILN_E2E_MODE || 'passive-live';
const runId = process.env.KILN_E2E_RUN_ID || runIdValue();
const root = runRootDir(runId);
ensureReportDirs(root);

const runEnv = {
  ...process.env,
  KILN_E2E_MODE: mode,
  KILN_E2E_RUN_ID: runId,
  KILN_E2E_ARTIFACT_ROOT: root,
  KILN_E2E_BASE_URL: process.env.KILN_E2E_BASE_URL ?? 'https://kiln.wtfgameshow.app',
};

console.log(`[Kiln e2e] runId=${runId} mode=${mode}`);

const runCommand = (command) => {
  console.log(`$ ${command}`);
  try {
    execSync(command, {
      stdio: 'inherit',
      env: runEnv,
      cwd: process.cwd(),
      shell: true,
    });
    return 0;
  } catch (error) {
    console.error(`Command failed: ${command}`);
    return error?.status || 1;
  }
};

const apiCapturePath = path.join(root, 'api-captures', 'baseline.json');
fs.writeFileSync(
  apiCapturePath,
  JSON.stringify({ runId, mode, capturedAt: new Date().toISOString() }, null, 2),
);

const statuses = {
  e2eLive: runCommand('npm run e2e:live'),
  lighthouse: runCommand('npm run e2e:lighthouse'),
  report: runCommand('npm run e2e:report'),
};

const summaryPath = path.join(root, 'report', 'run-summary.json');
fs.writeFileSync(
  summaryPath,
  JSON.stringify({ runId, mode, statuses, generatedAt: new Date().toISOString() }, null, 2),
);

if (Object.values(statuses).some((code) => code !== 0)) {
  process.exitCode = 1;
}
