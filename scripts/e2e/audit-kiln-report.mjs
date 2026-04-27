import fs from 'node:fs';
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

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing report artifact: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const runId = process.env.KILN_E2E_RUN_ID || runIdValue();
const root = runRootDir(runId);
const reportPath = path.join(root, 'report', 'kiln-e2e-report.json');
const auditPath = path.join(root, 'report', 'kiln-e2e-report-audit.json');

const report = readJson(reportPath);

const requirements = {
  hasMode: typeof report.mode === 'string' && report.mode.length > 0,
  hasRunId: typeof report.runId === 'string' && report.runId.length > 0,
  hasBaseUrl: typeof report.baseUrl === 'string' && report.baseUrl.length > 0,
};

const failures = Object.entries(requirements)
  .filter(([, value]) => !value)
  .map(([name]) => `Missing required field: ${name}`);

const audit = {
  runId: report.runId,
  mode: report.mode,
  status: failures.length > 0 ? 'failed' : 'passed',
  failures,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));

if (failures.length > 0) {
  console.error('E2E report audit failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('E2E report audit passed');

