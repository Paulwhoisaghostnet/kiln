import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

type ParsedArgs = {
  command: string;
  flags: Map<string, string[]>;
};

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

function printUsage(): void {
  const usage = `
Kiln CLI

Usage:
  npm run kiln:cli -- <command> [flags]

Commands:
  health
  networks
  capabilities
  openapi
  refs
  balances
  activity --limit 100
  workflow --file ./contract.tz [--source-type michelson|smartpy|auto] [--storage 'Unit'] [--scenario default] [--step bert:mint:["10"]]
  audit --file ./contract.tz [--source-type michelson|smartpy|auto] [--scenario default]
  simulate --file ./contract.tz [--source-type michelson|smartpy|auto] [--step bert:mint:["10"]]
  deploy --file ./contract.tz --storage 'Unit' [--wallet A|B] [--clearance clr_xxx] [--auto-clearance]
  bundle --file ./contract.tz --storage 'Unit' [--project 'My Contract Family'] [--source-type michelson|smartpy|auto]

Environment:
  KILN_API_URL   Base URL (default: http://localhost:3000)
  KILN_API_TOKEN Optional API token header (x-api-token)
`;
  console.log(usage.trim());
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const flags = new Map<string, string[]>();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    const value = next && !next.startsWith('--') ? next : 'true';
    if (value !== 'true') {
      index += 1;
    }
    const existing = flags.get(key) ?? [];
    existing.push(value);
    flags.set(key, existing);
  }

  return { command, flags };
}

function getFlag(flags: Map<string, string[]>, key: string): string | undefined {
  return flags.get(key)?.at(-1);
}

function getFlagValues(flags: Map<string, string[]>, key: string): string[] {
  return flags.get(key) ?? [];
}

function hasFlag(flags: Map<string, string[]>, key: string): boolean {
  return flags.has(key);
}

function parseStep(step: string): {
  wallet: 'bert' | 'ernie' | 'user';
  entrypoint: string;
  args: unknown[];
} {
  const firstColon = step.indexOf(':');
  const secondColon = step.indexOf(':', firstColon + 1);
  if (firstColon < 1 || secondColon < firstColon + 2) {
    throw new Error(
      `Invalid --step "${step}". Expected wallet:entrypoint:jsonArgs, e.g. bert:mint:["10"]`,
    );
  }

  const walletRaw = step.slice(0, firstColon).trim().toLowerCase();
  if (!['bert', 'ernie', 'user'].includes(walletRaw)) {
    throw new Error(`Invalid step wallet "${walletRaw}". Use bert, ernie, or user.`);
  }

  const entrypoint = step.slice(firstColon + 1, secondColon).trim();
  if (!entrypoint) {
    throw new Error('Step entrypoint is required.');
  }

  const argsRaw = step.slice(secondColon + 1).trim();
  const parsed = argsRaw ? (JSON.parse(argsRaw) as unknown) : [];
  if (!Array.isArray(parsed)) {
    throw new Error(`Step args must be a JSON array. Received: ${argsRaw}`);
  }

  return {
    wallet: walletRaw as 'bert' | 'ernie' | 'user',
    entrypoint,
    args: parsed,
  };
}

async function loadSource(
  flags: Map<string, string[]>,
): Promise<{ source: string; sourceType: 'auto' | 'smartpy' | 'michelson'; scenario?: string }> {
  const file = getFlag(flags, 'file');
  const sourceInline = getFlag(flags, 'source');
  if (!file && !sourceInline) {
    throw new Error('Provide --file or --source.');
  }

  const source = file
    ? await fs.readFile(resolve(file), 'utf8')
    : (sourceInline ?? '');

  const sourceTypeFlag = (getFlag(flags, 'source-type') ?? 'auto').toLowerCase();
  if (!['auto', 'smartpy', 'michelson'].includes(sourceTypeFlag)) {
    throw new Error(`Invalid --source-type "${sourceTypeFlag}".`);
  }

  return {
    source,
    sourceType: sourceTypeFlag as 'auto' | 'smartpy' | 'michelson',
    scenario: getFlag(flags, 'scenario'),
  };
}

async function apiRequest(
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  const baseUrl = (process.env.KILN_API_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  const token = process.env.KILN_API_TOKEN?.trim() || process.env.API_AUTH_TOKEN?.trim();

  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (token) {
    headers['x-api-token'] = token;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

async function run(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  switch (command) {
    case 'health': {
      printJson(await apiRequest('/api/health'));
      return;
    }
    case 'networks': {
      printJson(await apiRequest('/api/networks'));
      return;
    }
    case 'capabilities': {
      printJson(await apiRequest('/api/kiln/capabilities'));
      return;
    }
    case 'openapi': {
      printJson(await apiRequest('/api/kiln/openapi.json'));
      return;
    }
    case 'refs': {
      printJson(await apiRequest('/api/kiln/reference/contracts'));
      return;
    }
    case 'balances': {
      printJson(await apiRequest('/api/kiln/balances'));
      return;
    }
    case 'activity': {
      const limit = getFlag(flags, 'limit') ?? '100';
      printJson(await apiRequest(`/api/kiln/activity/recent?limit=${encodeURIComponent(limit)}`));
      return;
    }
    case 'workflow': {
      const sourceInput = await loadSource(flags);
      const simulationSteps = getFlagValues(flags, 'step').map(parseStep);
      const initialStorage = getFlag(flags, 'storage');

      printJson(
        await apiRequest('/api/kiln/workflow/run', {
          method: 'POST',
          body: {
            sourceType: sourceInput.sourceType,
            source: sourceInput.source,
            initialStorage: initialStorage || undefined,
            scenario: sourceInput.scenario,
            simulationSteps,
          },
        }),
      );
      return;
    }
    case 'audit': {
      const sourceInput = await loadSource(flags);
      printJson(
        await apiRequest('/api/kiln/audit/run', {
          method: 'POST',
          body: {
            sourceType: sourceInput.sourceType,
            source: sourceInput.source,
            scenario: sourceInput.scenario,
          },
        }),
      );
      return;
    }
    case 'simulate': {
      const sourceInput = await loadSource(flags);
      const simulationSteps = getFlagValues(flags, 'step').map(parseStep);
      printJson(
        await apiRequest('/api/kiln/simulate/run', {
          method: 'POST',
          body: {
            sourceType: sourceInput.sourceType,
            source: sourceInput.source,
            scenario: sourceInput.scenario,
            simulationSteps,
          },
        }),
      );
      return;
    }
    case 'deploy': {
      const sourceInput = await loadSource(flags);
      const initialStorage = getFlag(flags, 'storage');
      if (!initialStorage) {
        throw new Error('deploy requires --storage.');
      }

      const wallet = (getFlag(flags, 'wallet') ?? 'A').toUpperCase();
      if (wallet !== 'A' && wallet !== 'B') {
        throw new Error('deploy --wallet must be A or B.');
      }

      let clearanceId = getFlag(flags, 'clearance');
      if (!clearanceId && hasFlag(flags, 'auto-clearance')) {
        const workflow = (await apiRequest('/api/kiln/workflow/run', {
          method: 'POST',
          body: {
            sourceType: sourceInput.sourceType,
            source: sourceInput.source,
            initialStorage,
            scenario: sourceInput.scenario,
            simulationSteps: [],
          },
        })) as {
          clearance?: { approved?: boolean; record?: { id?: string } };
        };
        clearanceId = workflow.clearance?.record?.id;
      }

      printJson(
        await apiRequest('/api/kiln/upload', {
          method: 'POST',
          body: {
            code: sourceInput.source,
            initialStorage,
            wallet,
            clearanceId: clearanceId || undefined,
          },
        }),
      );
      return;
    }
    case 'bundle': {
      const sourceInput = await loadSource(flags);
      const initialStorage = getFlag(flags, 'storage');
      if (!initialStorage) {
        throw new Error('bundle requires --storage.');
      }

      const projectName = getFlag(flags, 'project') ?? 'Kiln Contract Bundle';
      const simulationSteps = getFlagValues(flags, 'step').map(parseStep);

      const workflow = (await apiRequest('/api/kiln/workflow/run', {
        method: 'POST',
        body: {
          sourceType: sourceInput.sourceType,
          source: sourceInput.source,
          initialStorage,
          scenario: sourceInput.scenario,
          simulationSteps,
        },
      })) as {
        sourceType: 'smartpy' | 'michelson';
        artifacts: { michelson: string; initialStorage: string };
        clearance?: { approved?: boolean };
        audit?: unknown;
        simulation?: unknown;
      };

      if (!workflow.clearance?.approved && !hasFlag(flags, 'allow-uncleared')) {
        throw new Error(
          'Workflow did not produce deployment clearance. Use --allow-uncleared to export anyway.',
        );
      }

      const health = (await apiRequest('/api/health')) as {
        networkId?: string;
        network?: string;
        chainId?: string | null;
      };

      printJson(
        await apiRequest('/api/kiln/export/bundle', {
          method: 'POST',
          body: {
            projectName,
            sourceType:
              sourceInput.sourceType === 'auto'
                ? workflow.sourceType
                : sourceInput.sourceType,
            source: sourceInput.source,
            compiledMichelson: workflow.artifacts.michelson,
            initialStorage: workflow.artifacts.initialStorage,
            workflow,
            audit: workflow.audit,
            simulation: workflow.simulation,
            deployment: {
              networkId: health.networkId,
              rpcUrl: health.network,
              chainId: health.chainId ?? undefined,
            },
          },
        }),
      );
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". Use "help".`);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        success: false,
        error: message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
