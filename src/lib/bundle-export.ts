import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface BundleExportInput {
  projectName: string;
  sourceType: 'smartpy' | 'michelson';
  source: string;
  compiledMichelson: string;
  initialStorage: string;
  workflow?: unknown;
  audit?: unknown;
  simulation?: unknown;
  deployment?: {
    networkId?: string;
    rpcUrl?: string;
    chainId?: string;
    contractAddress?: string;
    originatedAt?: string;
  };
}

export interface BundleExportResult {
  bundleId: string;
  exportDir: string;
  zipFileName: string;
  zipPath: string;
  downloadUrl: string;
}

function slugify(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return 'kiln-contract';
  }
  return trimmed
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function timestampTag(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function extractReadinessLine(workflow: unknown): string {
  if (!workflow || typeof workflow !== 'object') {
    return '- Workflow result unavailable.';
  }

  const record = workflow as Record<string, unknown>;
  const audit = record.audit as Record<string, unknown> | undefined;
  const simulation = record.simulation as Record<string, unknown> | undefined;
  const clearance = record.clearance as Record<string, unknown> | undefined;
  const validate = record.validate as Record<string, unknown> | undefined;

  const validatePassed = Boolean(validate?.passed);
  const auditPassed = Boolean(audit?.passed);
  const simulationPassed = Boolean(simulation?.success);
  const clearanceApproved = Boolean(clearance?.approved);

  return `- Workflow gates: validate=${validatePassed}, audit=${auditPassed}, simulate=${simulationPassed}, clearance=${clearanceApproved}`;
}

function buildReadinessMarkdown(input: BundleExportInput): string {
  const deployment = input.deployment ?? {};
  return [
    '# Kiln Mainnet Readiness Bundle',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Project: ${input.projectName}`,
    `Source type: ${input.sourceType}`,
    '',
    '## Deployment Context',
    `- Network: ${deployment.networkId ?? 'tezos-shadownet'}`,
    `- RPC: ${deployment.rpcUrl ?? 'unknown'}`,
    `- Chain ID: ${deployment.chainId ?? 'unknown'}`,
    `- Shadownet Contract: ${deployment.contractAddress ?? 'not originated in this bundle'}`,
    `- Originated At: ${deployment.originatedAt ?? 'n/a'}`,
    '',
    '## Gate Summary',
    extractReadinessLine(input.workflow),
    '',
    '## Files Included',
    '- `artifacts/source.*`',
    '- `artifacts/compiled.tz`',
    '- `artifacts/initial-storage.tz`',
    '- `reports/workflow.json`',
    '- `reports/audit.json`',
    '- `reports/simulation.json`',
    '- `reports/mainnet-readiness.md`',
    '- `metadata/bundle.json`',
    '',
    '## Operator Checklist',
    '- Re-run workflow against final source if any edits are made.',
    '- Validate governance/admin addresses before mainnet deployment.',
    '- Confirm gas/storage estimates on target mainnet RPC.',
    '- Archive this zip with release notes and signer approvals.',
    '',
  ].join('\n');
}

export function resolveExportRoot(): string {
  return resolve(process.cwd(), 'exports');
}

export function resolveExportZipPath(fileName: string): string {
  if (!/^[a-z0-9._-]+\.zip$/i.test(fileName)) {
    throw new Error('Invalid bundle file name.');
  }
  return join(resolveExportRoot(), fileName);
}

export async function createMainnetReadyBundle(
  input: BundleExportInput,
): Promise<BundleExportResult> {
  const exportRoot = resolveExportRoot();
  const bundleId = `${slugify(input.projectName)}-${timestampTag()}`;
  const exportDir = join(exportRoot, bundleId);
  const artifactsDir = join(exportDir, 'artifacts');
  const reportsDir = join(exportDir, 'reports');
  const metadataDir = join(exportDir, 'metadata');

  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.mkdir(metadataDir, { recursive: true });

  const sourceExtension = input.sourceType === 'smartpy' ? 'py' : 'tz';
  await fs.writeFile(
    join(artifactsDir, `source.${sourceExtension}`),
    input.source,
    'utf8',
  );
  await fs.writeFile(join(artifactsDir, 'compiled.tz'), input.compiledMichelson, 'utf8');
  await fs.writeFile(join(artifactsDir, 'initial-storage.tz'), input.initialStorage, 'utf8');

  await fs.writeFile(
    join(reportsDir, 'workflow.json'),
    JSON.stringify(input.workflow ?? {}, null, 2),
    'utf8',
  );
  await fs.writeFile(
    join(reportsDir, 'audit.json'),
    JSON.stringify(input.audit ?? {}, null, 2),
    'utf8',
  );
  await fs.writeFile(
    join(reportsDir, 'simulation.json'),
    JSON.stringify(input.simulation ?? {}, null, 2),
    'utf8',
  );
  await fs.writeFile(
    join(reportsDir, 'mainnet-readiness.md'),
    buildReadinessMarkdown(input),
    'utf8',
  );

  await fs.writeFile(
    join(metadataDir, 'bundle.json'),
    JSON.stringify(
      {
        bundleId,
        createdAt: new Date().toISOString(),
        ...input,
      },
      null,
      2,
    ),
    'utf8',
  );

  const zipFileName = `${bundleId}.zip`;
  const zipPath = join(exportRoot, zipFileName);

  try {
    await execFileAsync('zip', ['-r', '-q', zipPath, '.'], { cwd: exportDir });
  } catch (error) {
    throw new Error(
      `Failed to create zip bundle. Ensure \`zip\` is installed on host: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  return {
    bundleId,
    exportDir,
    zipFileName,
    zipPath,
    downloadUrl: `/api/kiln/export/download/${encodeURIComponent(zipFileName)}`,
  };
}

