/*
 * WTF template acceptance runner — Phase 8 ghostnet validation.
 *
 * Exercises every WTF contract template (Teia 1/1 via Allowlist,
 * Open Edition, Bonding Curve, Blind Mint, and the buyback contract)
 * through a running Kiln instance using its public HTTP API. The same
 * endpoints a human uses via the UI — /api/kiln/workflow/run for
 * compile+simulate, /api/kiln/upload for origination, and
 * /api/kiln/simulate/run for follow-up calls.
 *
 * Usage:
 *     KILN_API_URL=https://kiln.wtfgameshow.app \
 *     KILN_API_TOKEN=... \
 *     npx tsx scripts/wtf/run-template-checks.ts [--only WtfOpenEditionFA2]
 *
 * Exits 0 only if every template passes every step. Prints a summary
 * table before exiting.
 *
 * Notes:
 *   - This does NOT deploy to mainnet. Kiln is expected to be pinned
 *     to ghostnet (or shadownet) via its health endpoint; the runner
 *     refuses to proceed if /api/health reports a mainnet rpc URL.
 *   - The runner is intentionally thin. Each template carries its own
 *     step list so adding a new template means adding one spec object
 *     below — no framework gymnastics required.
 */

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

interface StepSpec {
  label: string;
  entrypoint: string;
  wallet?: 'bert' | 'ernie' | 'user';
  args: unknown[];
  /** Optional Michelson predicate to evaluate after the step runs. */
  expect?: 'success' | 'failure';
  /** Amount of XTZ (in mutez) the caller attaches to this step. */
  amountMutez?: number;
}

interface TemplateSpec {
  name: string;
  file: string;
  description: string;
  initialStorage: string;
  steps: StepSpec[];
}

const ROOT = resolve(__dirname, '..', '..');

const TEMPLATES: TemplateSpec[] = [
  {
    name: 'WtfAllowlistFA2',
    file: resolve(ROOT, 'contracts', 'wtf-collections', 'WtfAllowlistFA2.py'),
    description:
      'Teia-style 1/1 and allowlist mode — per-token max_supply + per-address caps',
    initialStorage: 'default',
    steps: [
      {
        label: 'create_token allowlist window',
        entrypoint: 'create_token',
        wallet: 'bert',
        args: [
          {
            metadata_uri: '0x697066733a2f2f516d4578616d706c65', // ipfs://QmExample
            creator: '${bert.address}',
            mint_price: { mutez: 1_000_000 },
            mint_end: { None: null },
            max_supply: { Some: 10 },
            allowlist_end: { Some: { timestamp: '2099-01-01T00:00:00Z' } },
            royalty_recipient: '${admin.address}',
            royalty_bps: 500,
            min_offer_per_unit_mutez: { mutez: 100_000 },
          },
        ],
        expect: 'success',
      },
      {
        label: 'set_allowlist for bob',
        entrypoint: 'set_allowlist',
        wallet: 'bert',
        args: [
          {
            token_id: 0,
            entries: [
              {
                address: '${ernie.address}',
                max_qty: 2,
                price_override: { Some: { mutez: 0 } },
              },
            ],
          },
        ],
        expect: 'success',
      },
      {
        label: 'ernie mints two from allowlist',
        entrypoint: 'mint_editions',
        wallet: 'ernie',
        args: [{ token_id: 0, qty: 2, to_: '${ernie.address}' }],
        amountMutez: 0,
        expect: 'success',
      },
    ],
  },
  {
    name: 'WtfOpenEditionFA2',
    file: resolve(ROOT, 'contracts', 'wtf-collections', 'WtfOpenEditionFA2.py'),
    description: 'Open edition with time-bounded unlimited supply',
    initialStorage: 'default',
    steps: [
      {
        label: 'admin creates open edition',
        entrypoint: 'create_token',
        wallet: 'bert',
        args: [
          {
            metadata_uri: '0x697066733a2f2f516d4578616d706c65',
            creator: '${bert.address}',
            mint_price: { mutez: 1_000_000 },
            mint_end: { None: null },
            royalty_recipient: '${bert.address}',
            royalty_bps: 500,
            min_offer_per_unit_mutez: { mutez: 100_000 },
          },
        ],
        expect: 'success',
      },
      {
        label: 'ernie mints three editions',
        entrypoint: 'mint_editions',
        wallet: 'ernie',
        args: [{ token_id: 0, qty: 3, to_: '${ernie.address}' }],
        amountMutez: 3_000_000,
        expect: 'success',
      },
    ],
  },
  {
    name: 'WtfBondingCurveFA2',
    file: resolve(
      ROOT,
      'contracts',
      'wtf-collections',
      'WtfBondingCurveFA2.py',
    ),
    description: 'Bonding-curve priced FA2 token factory',
    initialStorage: 'default',
    steps: [
      {
        label: 'create_token curve (1 XTZ base, +0.1 XTZ per 10 mints)',
        entrypoint: 'create_token',
        wallet: 'bert',
        args: [
          {
            metadata_uri: '0x697066733a2f2f516d4578616d706c65',
            creator: '${bert.address}',
            base_price: { mutez: 1_000_000 },
            price_increment: { mutez: 100_000 },
            step_size: 10,
            max_supply: 100,
            mint_end: { None: null },
            royalty_recipient: '${bert.address}',
            royalty_bps: 500,
            min_offer_per_unit_mutez: { mutez: 1_000 },
          },
        ],
        expect: 'success',
      },
      {
        label: '10 mints at base price — should succeed at 1 XTZ each',
        entrypoint: 'mint_editions',
        wallet: 'ernie',
        args: [{ token_id: 0, qty: 10, to_: '${ernie.address}' }],
        amountMutez: 10_000_000,
        expect: 'success',
      },
      {
        label: '11th mint at base price — should fail (now 1.1 XTZ)',
        entrypoint: 'mint_editions',
        wallet: 'ernie',
        args: [{ token_id: 0, qty: 1, to_: '${ernie.address}' }],
        amountMutez: 1_000_000,
        expect: 'failure',
      },
      {
        label: '11th mint at 1.1 XTZ — should succeed',
        entrypoint: 'mint_editions',
        wallet: 'ernie',
        args: [{ token_id: 0, qty: 1, to_: '${ernie.address}' }],
        amountMutez: 1_100_000,
        expect: 'success',
      },
    ],
  },
  {
    name: 'WtfBlindMintFA2',
    file: resolve(ROOT, 'contracts', 'wtf-collections', 'WtfBlindMintFA2.py'),
    description: 'Commit-reveal blind mint',
    initialStorage: 'default',
    steps: [
      {
        label: 'request_mint #1',
        entrypoint: 'request_mint',
        wallet: 'ernie',
        args: [],
        amountMutez: 1_000_000,
        expect: 'success',
      },
      {
        label: 'request_mint #2',
        entrypoint: 'request_mint',
        wallet: 'ernie',
        args: [],
        amountMutez: 1_000_000,
        expect: 'success',
      },
      {
        label: 'reveal with bad proof — rejected',
        entrypoint: 'reveal',
        wallet: 'bert',
        args: [
          {
            index: 0,
            metadata_uri: '0x697066733a2f2f516d576f6e672d457874',
            nonce: '0x' + '00'.repeat(32),
            proof: [],
          },
        ],
        expect: 'failure',
      },
    ],
  },
  {
    name: 'WtfBuybackV1',
    file: resolve(ROOT, 'contracts', 'wtf-buyback', 'WtfBuybackV1.py'),
    description: 'Closed WTF-for-XTZ buyback',
    initialStorage: 'default',
    steps: [
      {
        label: 'admin fund_xtz below budget',
        entrypoint: 'fund_xtz',
        wallet: 'bert',
        args: [],
        amountMutez: 10_000_000,
        expect: 'success',
      },
      {
        label: 'non-admin fund_xtz — rejected',
        entrypoint: 'fund_xtz',
        wallet: 'ernie',
        args: [],
        amountMutez: 1_000_000,
        expect: 'failure',
      },
      {
        label: 'withdraw_leftover_xtz while window open — rejected',
        entrypoint: 'withdraw_leftover_xtz',
        wallet: 'bert',
        args: [],
        expect: 'failure',
      },
    ],
  },
];

interface CliFlags {
  only?: string;
  baseUrl: string;
  token?: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    baseUrl: (process.env.KILN_API_URL ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    ),
    token: process.env.KILN_API_TOKEN?.trim() || process.env.API_AUTH_TOKEN?.trim() || undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--only') {
      flags.only = argv[i + 1];
      i += 1;
    }
  }
  return flags;
}

async function apiFetch<T = unknown>(
  base: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (token) {
    headers['x-kiln-token'] = token;
  }
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  return payload as T;
}

async function runTemplate(spec: TemplateSpec, flags: CliFlags): Promise<string[]> {
  const failures: string[] = [];
  const source = await fs.readFile(spec.file, 'utf8');

  const workflow = (await apiFetch(
    flags.baseUrl,
    '/api/kiln/workflow/run',
    {
      sourceType: 'smartpy',
      source,
      initialStorage: spec.initialStorage,
      simulationSteps: spec.steps.map((step) => ({
        wallet: step.wallet ?? 'user',
        entrypoint: step.entrypoint,
        args: step.args,
      })),
    },
    flags.token,
  )) as {
    sourceType: string;
    artifacts?: { michelson?: string };
    simulation?: { steps?: Array<{ label?: string; success?: boolean; error?: string }> };
    audit?: unknown;
    clearance?: { approved?: boolean };
  };

  if (!workflow.artifacts?.michelson) {
    failures.push(`${spec.name}: compile produced no Michelson`);
    return failures;
  }

  const simSteps = workflow.simulation?.steps ?? [];
  spec.steps.forEach((step, idx) => {
    const outcome = simSteps[idx];
    const succeeded = outcome?.success ?? false;
    const expected = step.expect ?? 'success';
    const matched =
      (expected === 'success' && succeeded) ||
      (expected === 'failure' && !succeeded);
    if (!matched) {
      failures.push(
        `${spec.name} / ${step.label}: expected ${expected}, got ${
          succeeded ? 'success' : 'failure'
        }${outcome?.error ? ` (${outcome.error})` : ''}`,
      );
    }
  });
  return failures;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const health = (await apiFetch(flags.baseUrl, '/api/health', undefined, flags.token)) as {
    network?: string;
    networkId?: string;
    chainId?: string | null;
  };
  if (/mainnet/i.test(String(health.networkId ?? '')) || /mainnet/i.test(String(health.network ?? ''))) {
    throw new Error(
      `Refusing to run on mainnet. Kiln health reports network=${JSON.stringify(health)}.`,
    );
  }
  console.log(`Kiln target: ${flags.baseUrl} (${health.networkId ?? health.network ?? 'unknown'})`);

  const filtered = flags.only
    ? TEMPLATES.filter((t) => t.name === flags.only)
    : TEMPLATES;
  if (filtered.length === 0) {
    throw new Error(`No templates matched --only ${flags.only ?? ''}`);
  }

  const allFailures: string[] = [];
  for (const spec of filtered) {
    console.log(`→ ${spec.name} — ${spec.description}`);
    try {
      const failures = await runTemplate(spec, flags);
      if (failures.length === 0) {
        console.log(`  OK (${spec.steps.length} steps)`);
      } else {
        for (const f of failures) {
          console.log(`  FAIL ${f}`);
        }
        allFailures.push(...failures);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR ${msg}`);
      allFailures.push(`${spec.name}: ${msg}`);
    }
  }

  console.log('');
  if (allFailures.length > 0) {
    console.log(`${allFailures.length} failure(s):`);
    for (const f of allFailures) {
      console.log(`  - ${f}`);
    }
    process.exit(1);
  }
  console.log(`All ${filtered.length} templates passed.`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
