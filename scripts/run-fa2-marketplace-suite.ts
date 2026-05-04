import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildFa2MarketplaceSuite,
  buildSuiteE2ESteps,
  buildSuiteWorkflowSteps,
  renderSuiteAddressPlaceholders,
  renderSuiteInitialStorage,
  type Fa2MarketplaceContractId,
} from '../src/lib/fa2-marketplace-suite.js';

interface Flags {
  baseUrl: string;
  token?: string;
  networkId: string;
}

interface HealthResponse {
  network?: string;
  networkId?: string;
  chainId?: string | null;
}

interface WorkflowResponse {
  success?: boolean;
  artifacts?: {
    michelson?: string;
    initialStorage?: string;
    entrypoints?: string[];
    codeHash?: string;
  };
  simulation?: {
    success?: boolean;
    coverage?: {
      passed?: boolean;
      missedEntrypoints?: string[];
      totalEntrypoints?: number;
      coveredEntrypoints?: number;
    };
  };
  shadowbox?: {
    executed?: boolean;
    passed?: boolean;
    summary?: { total: number; passed: number; failed: number };
    warnings?: string[];
    reason?: string;
  };
  clearance?: {
    approved?: boolean;
    record?: { id: string; codeHash: string; createdAt: string; expiresAt: string };
  };
}

interface UploadResponse {
  success?: boolean;
  contractAddress?: string;
  networkId?: string;
}

interface E2EResponse {
  success?: boolean;
  summary?: { total: number; passed: number; failed: number };
  coverage?: {
    passed?: boolean;
    totalEntrypoints?: number;
    coveredEntrypoints?: number;
    missedEntrypoints?: string[];
  };
  results?: Array<{
    label: string;
    wallet: 'A' | 'B';
    contractAddress: string;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number | null;
    error?: string;
  }>;
}

interface AggregatedE2E {
  success: boolean;
  summary: { total: number; passed: number; failed: number };
  coverage: {
    passed: boolean;
    totalEntrypoints: number;
    coveredEntrypoints: number;
    missedEntrypoints: string[];
  };
  byContract: Record<string, E2EResponse>;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    baseUrl: (process.env.KILN_API_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    token: process.env.KILN_API_TOKEN?.trim() || process.env.API_AUTH_TOKEN?.trim() || undefined,
    networkId: process.env.KILN_NETWORK_ID?.trim() || 'tezos-shadownet',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--base-url' && next) {
      flags.baseUrl = next.replace(/\/$/, '');
      index += 1;
    } else if (token === '--token' && next) {
      flags.token = next;
      index += 1;
    } else if (token === '--network-id' && next) {
      flags.networkId = next;
      index += 1;
    }
  }

  return flags;
}

async function apiFetch<T>(
  flags: Flags,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (flags.token) {
    headers['x-kiln-token'] = flags.token;
  }

  const response = await fetch(`${flags.baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 800)}`);
  }

  return payload as T;
}

function assertNonMainnet(health: HealthResponse): void {
  const label = `${health.networkId ?? ''} ${health.network ?? ''}`.toLowerCase();
  if (label.includes('mainnet')) {
    throw new Error(`Refusing to run deployment suite against mainnet: ${JSON.stringify(health)}`);
  }
}

async function getPuppetAddresses(flags: Flags): Promise<{
  bertAddress?: string;
  ernieAddress?: string;
}> {
  const balances = await apiFetch<{
    walletA?: { address?: string } | null;
    walletB?: { address?: string } | null;
  }>(flags, `/api/kiln/balances?networkId=${encodeURIComponent(flags.networkId)}`);
  return {
    bertAddress: balances.walletA?.address,
    ernieAddress: balances.walletB?.address,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const suite = buildFa2MarketplaceSuite();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactDir = resolve('artifacts', 'fa2-marketplace-suite', runId);
  await fs.mkdir(artifactDir, { recursive: true });

  const health = await apiFetch<HealthResponse>(flags, '/api/health');
  assertNonMainnet(health);
  const { bertAddress, ernieAddress } = await getPuppetAddresses(flags);
  const adminAddress = bertAddress;

  console.log(`Kiln target: ${flags.baseUrl} (${health.networkId ?? 'unknown'})`);
  console.log(`Suite: ${suite.name}`);

  const addresses: Partial<Record<Fa2MarketplaceContractId, string>> = {};
  const workflows: Record<string, WorkflowResponse> = {};
  const deployments: Record<string, UploadResponse> = {};

  for (const contract of suite.contracts) {
    const currencyTokenAddress =
      contract.id.endsWith('_market') ? addresses.currency_token : undefined;
    const initialStorage = renderSuiteInitialStorage(contract, {
      adminAddress,
      bertAddress,
      ernieAddress,
      currencyTokenAddress,
    });
    const simulationSteps = buildSuiteWorkflowSteps(contract);

    console.log(`→ workflow ${contract.id} (${simulationSteps.length} steps)`);
    const workflow = await apiFetch<WorkflowResponse>(flags, '/api/kiln/workflow/run', {
      networkId: flags.networkId,
      sourceType: contract.sourceType,
      source: contract.smartpySource,
      scenario: contract.scenario,
      simulationSteps,
    });
    workflows[contract.id] = workflow;

    if (!workflow.clearance?.approved || !workflow.clearance.record?.id) {
      throw new Error(
        `${contract.id} did not receive deploy clearance: ${JSON.stringify({
          simulation: workflow.simulation,
          shadowbox: workflow.shadowbox,
          clearance: workflow.clearance,
        })}`,
      );
    }

    console.log(`  clearance ${workflow.clearance.record.id}`);
    const deploymentStorage = renderSuiteAddressPlaceholders(
      workflow.artifacts?.initialStorage ?? initialStorage,
      {
        adminAddress,
        bertAddress,
        ernieAddress,
        currencyTokenAddress,
      },
    );
    const deploy = await apiFetch<UploadResponse>(flags, '/api/kiln/upload', {
      networkId: flags.networkId,
      code: workflow.artifacts?.michelson ?? contract.michelson,
      initialStorage: deploymentStorage,
      wallet: 'A',
      clearanceId: workflow.clearance.record.id,
    });
    deployments[contract.id] = deploy;

    if (!deploy.contractAddress) {
      throw new Error(`${contract.id} deployment returned no contract address.`);
    }

    addresses[contract.id] = deploy.contractAddress;
    console.log(`  deployed ${deploy.contractAddress}`);
  }

  const allE2ESteps = buildSuiteE2ESteps(suite, addresses);
  const e2eByContract: Record<string, E2EResponse> = {};

  for (const contract of suite.contracts) {
    const steps = allE2ESteps.filter(
      (step) => step.targetContractId === contract.id,
    );
    console.log(`→ e2e ${contract.id} (${steps.length} generated steps)`);
    const e2e = await apiFetch<E2EResponse>(flags, '/api/kiln/e2e/run', {
      networkId: flags.networkId,
      contracts: [
        {
          id: contract.id,
          address: addresses[contract.id],
          entrypoints: contract.entrypoints,
        },
      ],
      steps,
    });
    e2eByContract[contract.id] = e2e;

    if (!e2e.success || !e2e.coverage?.passed) {
      throw new Error(
        `${contract.id} post-deploy E2E failed: ${JSON.stringify({
          summary: e2e.summary,
          coverage: e2e.coverage,
          failed: e2e.results?.filter((result) => result.status === 'failed'),
        })}`,
      );
    }

    console.log(
      `  coverage ${e2e.coverage.coveredEntrypoints}/${e2e.coverage.totalEntrypoints}`,
    );
  }

  const e2e: AggregatedE2E = Object.values(e2eByContract).reduce<AggregatedE2E>(
    (aggregate, contractE2E) => {
      aggregate.success &&= Boolean(contractE2E.success && contractE2E.coverage?.passed);
      aggregate.summary.total += contractE2E.summary?.total ?? 0;
      aggregate.summary.passed += contractE2E.summary?.passed ?? 0;
      aggregate.summary.failed += contractE2E.summary?.failed ?? 0;
      aggregate.coverage.totalEntrypoints += contractE2E.coverage?.totalEntrypoints ?? 0;
      aggregate.coverage.coveredEntrypoints += contractE2E.coverage?.coveredEntrypoints ?? 0;
      aggregate.coverage.missedEntrypoints.push(
        ...(contractE2E.coverage?.missedEntrypoints ?? []),
      );
      return aggregate;
    },
    {
      success: true,
      summary: { total: 0, passed: 0, failed: 0 },
      coverage: {
        passed: true,
        totalEntrypoints: 0,
        coveredEntrypoints: 0,
        missedEntrypoints: [],
      },
      byContract: e2eByContract,
    },
  );
  e2e.coverage.passed =
    e2e.coverage.missedEntrypoints.length === 0 &&
    e2e.coverage.coveredEntrypoints === e2e.coverage.totalEntrypoints;
  e2e.success &&= e2e.coverage.passed && e2e.summary.failed === 0;

  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    target: {
      baseUrl: flags.baseUrl,
      networkId: health.networkId,
      chainId: health.chainId,
    },
    suite,
    addresses,
    workflows,
    deployments,
    e2e,
    mainnetReadiness: {
      clearedForMainnetDecision: true,
      note:
        'Shadownet clearance and Bert/Ernie endpoint coverage passed. This does not deploy to mainnet or replace a production security audit.',
    },
  };

  await fs.writeFile(
    resolve(artifactDir, 'shadownet-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  console.log('');
  console.log(
    `E2E coverage: ${e2e.coverage.coveredEntrypoints}/${e2e.coverage.totalEntrypoints} entrypoints`,
  );
  console.log(`E2E summary: ${e2e.summary?.passed}/${e2e.summary?.total} passed`);
  console.log(`Report: ${resolve(artifactDir, 'shadownet-report.json')}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
