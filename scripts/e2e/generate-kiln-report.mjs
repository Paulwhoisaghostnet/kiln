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

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath, fallback = '') {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return fs.readFileSync(filePath, 'utf8');
}

const runId = process.env.KILN_E2E_RUN_ID || runIdValue();
const root = runRootDir(runId);
const reportDir = path.join(root, 'report');
fs.mkdirSync(reportDir, { recursive: true });

const lighthousePath = path.join(root, 'lighthouse', 'lighthouse.json');
const playwrightPath = path.join(root, 'report', 'kiln-playwright-results.json');
const apiCapturePath = path.join(root, 'api-captures', 'baseline.json');

const lighthouseRaw = readJson(lighthousePath, null);
const playwrightRaw = readJson(playwrightPath, null);
const apiCaptureRaw = readJson(apiCapturePath, null);

function summarizePlaywright(payload) {
  if (!payload || !Array.isArray(payload.suites)) {
    return { suites: null, tests: null, passes: null, fails: null };
  }

  let suiteCount = 0;
  let testCount = 0;
  let passCount = 0;
  let failCount = 0;

  const walkSuite = (suite) => {
    suiteCount += 1;
    const specs = Array.isArray(suite.specs) ? suite.specs : [];
    for (const spec of specs) {
      testCount += 1;
      if (spec.ok) {
        passCount += 1;
      } else {
        failCount += 1;
      }
    }

    const childSuites = Array.isArray(suite.suites) ? suite.suites : [];
    for (const child of childSuites) {
      walkSuite(child);
    }
  };

  for (const suite of payload.suites) {
    walkSuite(suite);
  }

  return {
    suites: suiteCount,
    tests: testCount,
    passes: passCount,
    fails: failCount,
  };
}

const playwrightSummary = summarizePlaywright(playwrightRaw);

const lighthouse = lighthouseRaw
  ? {
      performance: lighthouseRaw?.categories?.performance?.score,
      accessibility: lighthouseRaw?.categories?.accessibility?.score,
      bestPractices: lighthouseRaw?.categories?.['best-practices']?.score,
      seo: lighthouseRaw?.categories?.seo?.score,
      lcp: lighthouseRaw?.audits?.['largest-contentful-paint']?.numericValue,
      tbt: lighthouseRaw?.audits?.['total-blocking-time']?.numericValue,
      cls: lighthouseRaw?.audits?.['cumulative-layout-shift']?.numericValue,
    }
  : null;

const summary = {
  runId,
  generatedAt: new Date().toISOString(),
  mode: process.env.KILN_E2E_MODE ?? 'passive-live',
  baseUrl: process.env.KILN_E2E_BASE_URL ?? 'https://kiln.wtfgameshow.app',
  lighthouse,
  playwright: {
    status: Boolean(playwrightRaw),
    rawPath: playwrightPath,
    suites: playwrightSummary.suites,
    tests: playwrightSummary.tests,
    passes: playwrightSummary.passes,
    fails: playwrightSummary.fails,
  },
  api: apiCaptureRaw,
  findings: [],
  files: {
    lighthouseJson: fs.existsSync(lighthousePath) ? 'lighthouse/lighthouse.json' : null,
    lighthouseHtml: fs.existsSync(path.join(root, 'lighthouse', 'lighthouse.html'))
      ? 'lighthouse/lighthouse.html'
      : null,
    playwrightJson: fs.existsSync(playwrightPath)
      ? 'report/kiln-playwright-results.json'
      : null,
    apiCapture: fs.existsSync(apiCapturePath) ? 'api-captures/baseline.json' : null,
  },
};

const markdown = [
  '# Kiln E2E execution report',
  '',
  `Run ID: ${summary.runId}`,
  `Mode: ${summary.mode}`,
  `URL: ${summary.baseUrl}`,
  `Generated: ${summary.generatedAt}`,
  '',
  '## Results',
  `- Playwright: ${summary.playwright.status ? 'collected' : 'missing'}`,
  `- Lighthouse: ${summary.lighthouse ? 'collected' : 'missing'}`,
  '',
  '## Lighthouse snapshot',
  summary.lighthouse
    ? `- performance: ${summary.lighthouse.performance}`
    : '- performance: n/a',
  summary.lighthouse
    ? `- accessibility: ${summary.lighthouse.accessibility}`
    : '- accessibility: n/a',
  summary.lighthouse
    ? `- best-practices: ${summary.lighthouse.bestPractices}`
    : '- best-practices: n/a',
  summary.lighthouse ? `- seo: ${summary.lighthouse.seo}` : '- seo: n/a',
  summary.lighthouse
    ? `- largest-contentful-paint: ${summary.lighthouse.lcp}`
    : '- lcp: n/a',
  summary.playwright.status
    ? `- tests: ${summary.playwright.tests}`
    : '- tests: n/a',
  '',
  '## Files',
  ...Object.entries(summary.files).map(([key, value]) => `- ${key}: ${value}`),
].join('\n');

const findingsPath = path.join(reportDir, 'kiln-e2e-findings.json');
const coveragePath = path.join(reportDir, 'kiln-e2e-coverage.json');
const auditPath = path.join(reportDir, 'kiln-e2e-report-audit.json');

fs.writeFileSync(path.join(reportDir, 'kiln-e2e-report.md'), markdown);
fs.writeFileSync(path.join(reportDir, 'kiln-e2e-report.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  findingsPath,
  JSON.stringify(
    {
      runId,
      findings:
        (lighthouseRaw?.runtimeError && [lighthouseRaw.runtimeError]) || [],
    },
    null,
    2,
  ),
);
fs.writeFileSync(coveragePath, JSON.stringify({ files: Object.keys(summary.files || {}) }, null, 2));
fs.writeFileSync(
  auditPath,
  JSON.stringify(
    {
      runId,
      mode: summary.mode,
      status: 'pending',
    },
    null,
    2,
  ),
);

if (process.env.KILN_E2E_STDOUT === '1') {
  console.log(readText(path.join(reportDir, 'kiln-e2e-report.md')));
}

console.log(`Wrote report into ${reportDir}`);
