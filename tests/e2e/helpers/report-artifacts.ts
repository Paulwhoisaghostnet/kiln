import fs from 'node:fs';
import path from 'node:path';

export const ARTIFACT_ROOT = 'artifacts/kiln-e2e';

export function runId() {
  return (
    process.env.KILN_E2E_RUN_ID ??
    new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  );
}

export function runRootDir(currentRunId = runId()) {
  return path.join(ARTIFACT_ROOT, currentRunId);
}

export function ensureReportDirs(base = runRootDir()) {
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

export function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}
