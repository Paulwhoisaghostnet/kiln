import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { readMichelsonEntrypoints } from './taquito-michelson.js';

interface ReferenceIndexRow {
  slug: string;
  address?: string;
  name?: string;
  codeHash?: number;
  typeHash?: number;
}

export type ReferenceSourceType =
  | 'micheline_json'
  | 'michelson'
  | 'smartpy'
  | 'unknown';

export interface ReferenceContractSummary {
  slug: string;
  name: string;
  address: string | null;
  sourceType: ReferenceSourceType;
  codePath: string | null;
  storagePath: string | null;
  entrypoints: string[];
  codeHash?: number;
  typeHash?: number;
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort();
}

function parseEntrypointsFromSmartPy(source: string): string[] {
  const entrypoints = new Set<string>();
  const lines = source.split(/\r?\n/);
  let pendingEntrypointDecorator = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('@sp.entrypoint')) {
      pendingEntrypointDecorator = true;
      continue;
    }

    const fnMatch = line.match(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (fnMatch && pendingEntrypointDecorator) {
      entrypoints.add(fnMatch[1] ?? 'unknown');
      pendingEntrypointDecorator = false;
      continue;
    }

    if (!line.startsWith('@')) {
      pendingEntrypointDecorator = false;
    }
  }

  return uniqueSorted(Array.from(entrypoints));
}

function parseEntrypointsFromMichelineJson(source: string): string[] {
  const parsed = JSON.parse(source) as unknown;
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  const parameterNode = roots.find(
    (node) =>
      Boolean(node) &&
      typeof node === 'object' &&
      (node as Record<string, unknown>).prim === 'parameter',
  );
  if (!parameterNode) {
    return [];
  }

  const entrypoints = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const record = node as Record<string, unknown>;
    const annots = Array.isArray(record.annots) ? record.annots : [];
    for (const annot of annots) {
      if (typeof annot === 'string' && annot.startsWith('%') && annot.length > 1) {
        entrypoints.add(annot.slice(1));
      }
    }
    const args = Array.isArray(record.args) ? record.args : [];
    for (const arg of args) {
      visit(arg);
    }
  };

  visit(parameterNode);
  return uniqueSorted(Array.from(entrypoints));
}

function detectSourceType(filePath: string): ReferenceSourceType {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.json')) {
    return 'micheline_json';
  }
  if (lower.endsWith('.tz') || lower.endsWith('.micheline')) {
    return 'michelson';
  }
  if (
    lower.endsWith('.smartpy') ||
    lower.endsWith('.sp') ||
    lower.endsWith('.py')
  ) {
    return 'smartpy';
  }
  return 'unknown';
}

async function findPreferredCodePath(slugDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(slugDir);
    const preferredOrder = [
      'contract.code.json',
      'contract.tz',
      'main.tz',
      'fa2.tz',
    ];
    for (const preferred of preferredOrder) {
      const match = entries.find((entry) => entry.toLowerCase() === preferred);
      if (match) {
        return join(slugDir, match);
      }
    }

    const dynamic = entries.find((entry) => {
      const lower = entry.toLowerCase();
      return (
        lower.endsWith('.tz') ||
        lower.endsWith('.json') ||
        lower.endsWith('.smartpy') ||
        lower.endsWith('.sp') ||
        lower.endsWith('.py')
      );
    });
    return dynamic ? join(slugDir, dynamic) : null;
  } catch {
    return null;
  }
}

async function findStoragePath(slugDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(slugDir);
    const storage = entries.find((entry) => {
      const lower = entry.toLowerCase();
      return (
        lower.includes('storage') &&
        (lower.endsWith('.micheline') ||
          lower.endsWith('.tz') ||
          lower.endsWith('.json'))
      );
    });
    return storage ? join(slugDir, storage) : null;
  } catch {
    return null;
  }
}

async function parseEntrypointsFromFile(
  sourceType: ReferenceSourceType,
  filePath: string,
): Promise<string[]> {
  try {
    const source = await fs.readFile(filePath, 'utf8');
    if (sourceType === 'smartpy') {
      return parseEntrypointsFromSmartPy(source);
    }
    if (sourceType === 'micheline_json') {
      return parseEntrypointsFromMichelineJson(source);
    }
    return uniqueSorted(
      readMichelsonEntrypoints(source).map((entrypoint) => entrypoint.name),
    );
  } catch {
    return [];
  }
}

export function resolveReferenceRoot(): string {
  const fromEnv = process.env.KILN_REFERENCE_ROOT?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  return resolve(process.cwd(), 'reference');
}

export async function listReferenceContracts(input?: {
  referenceRoot?: string;
}): Promise<ReferenceContractSummary[]> {
  const referenceRoot =
    input?.referenceRoot?.trim() || resolveReferenceRoot();
  const indexPath = join(referenceRoot, 'INDEX.json');

  let indexRows: ReferenceIndexRow[] = [];
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      indexRows = parsed.filter((row): row is ReferenceIndexRow => {
        return (
          Boolean(row) &&
          typeof row === 'object' &&
          typeof (row as Record<string, unknown>).slug === 'string'
        );
      });
    }
  } catch {
    indexRows = [];
  }

  const summaries = await Promise.all(
    indexRows.map(async (row) => {
      const slugDir = join(referenceRoot, row.slug);
      const codePath = await findPreferredCodePath(slugDir);
      const storagePath = await findStoragePath(slugDir);
      const sourceType = codePath ? detectSourceType(codePath) : 'unknown';
      const entrypoints = codePath
        ? await parseEntrypointsFromFile(sourceType, codePath)
        : [];

      const toPublicPath = (pathValue: string | null): string | null => {
        if (!pathValue) {
          return null;
        }
        const relative = pathValue.slice(referenceRoot.length + 1).replace(/\\/g, '/');
        return `reference/${relative}`;
      };

      return {
        slug: row.slug,
        name: row.name?.trim() || row.slug,
        address: row.address?.trim() || null,
        sourceType,
        codePath: toPublicPath(codePath),
        storagePath: toPublicPath(storagePath),
        entrypoints,
        codeHash: row.codeHash,
        typeHash: row.typeHash,
      } satisfies ReferenceContractSummary;
    }),
  );

  return summaries.sort((a, b) => a.slug.localeCompare(b.slug));
}
