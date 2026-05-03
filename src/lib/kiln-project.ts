import { z } from 'zod';
import type { KilnNetworkId } from './networks.js';

export const kilnProjectActorSchema = z.object({
  id: z.string().trim().min(1).max(80),
  kind: z.enum(['tezos', 'evm', 'jstz', 'service']),
  label: z.string().trim().min(1).max(120),
});

export const kilnProjectContractSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  language: z.enum(['smartpy', 'michelson', 'solidity', 'jstz']),
  sourcePath: z.string().trim().min(1).max(260),
  initialStoragePath: z.string().trim().min(1).max(260).optional(),
  deployedAddress: z.string().trim().min(1).max(120).optional(),
  entrypoints: z.array(z.string().trim().min(1).max(128)).default([]),
});

export const kilnProjectScenarioStepSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  actor: z.string().trim().min(1).max(80),
  targetContractId: z.string().trim().min(1).max(120),
  entrypoint: z.string().trim().min(1).max(128),
  args: z.array(z.unknown()).default([]),
  amountMutez: z.number().int().min(0).optional(),
  expectFailure: z.boolean().default(false),
});

export const kilnProjectScenarioSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  steps: z.array(kilnProjectScenarioStepSchema).default([]),
});

export const kilnProjectManifestSchema = z.object({
  schemaVersion: z.literal(1),
  projectName: z.string().trim().min(2).max(120),
  networks: z.array(z.string().trim().min(1).max(80)).default([]),
  actors: z.array(kilnProjectActorSchema).default([]),
  contracts: z.array(kilnProjectContractSchema).default([]),
  scenarios: z.array(kilnProjectScenarioSchema).default([]),
  artifacts: z
    .object({
      clearanceId: z.string().trim().min(1).max(160).optional(),
      generatedAt: z.string().trim().min(1).max(80),
    })
    .default({ generatedAt: new Date(0).toISOString() }),
});

export type KilnProjectManifest = z.infer<typeof kilnProjectManifestSchema>;

export interface KilnProjectFile {
  path: string;
  kind: 'manifest' | 'source' | 'storage' | 'scenario' | 'artifact';
  sizeBytes: number;
  preview: string;
}

export interface KilnProjectGraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface BrowserWorkspaceProject {
  manifest: KilnProjectManifest;
  files: KilnProjectFile[];
  graph: {
    nodes: Array<{ id: string; label: string; kind: 'actor' | 'contract' | 'service' }>;
    edges: KilnProjectGraphEdge[];
  };
  blockers: string[];
}

export function validateKilnProjectManifest(input: unknown): KilnProjectManifest {
  return kilnProjectManifestSchema.parse(input);
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function preview(value: string): string {
  return value.slice(0, 700);
}

export function createBrowserWorkspaceProject(input: {
  projectName?: string;
  networkId: KilnNetworkId;
  sourceType: 'michelson' | 'smartpy' | 'solidity';
  source: string;
  initialStorage?: string;
  entrypoints?: string[];
  contractAddress?: string;
  clearanceId?: string | null;
}): BrowserWorkspaceProject {
  const language = input.sourceType;
  const sourceExt =
    language === 'smartpy' ? 'py' : language === 'solidity' ? 'sol' : 'tz';
  const contractId = 'primary-contract';
  const actorKind = language === 'solidity' ? 'evm' : 'tezos';
  const sourcePath = `contracts/primary.${sourceExt}`;
  const initialStoragePath =
    language === 'solidity' ? undefined : 'contracts/primary.storage.tz';
  const scenarioPath = 'scenarios/default.e2e.json';
  const generatedAt = new Date().toISOString();

  const manifest: KilnProjectManifest = {
    schemaVersion: 1,
    projectName: input.projectName?.trim() || 'Kiln Browser Workspace',
    networks: [input.networkId],
    actors: [
      { id: 'bert', kind: actorKind, label: language === 'solidity' ? 'EVM connected actor' : 'Bert puppet wallet' },
      { id: 'ernie', kind: actorKind, label: language === 'solidity' ? 'Second EVM test actor' : 'Ernie puppet wallet' },
    ],
    contracts: [
      {
        id: contractId,
        label: 'Primary contract',
        language,
        sourcePath,
        initialStoragePath,
        deployedAddress: input.contractAddress || undefined,
        entrypoints: input.entrypoints ?? [],
      },
    ],
    scenarios: [
      {
        id: 'default-e2e',
        label: 'Default entrypoint smoke scenario',
        steps:
          input.entrypoints && input.entrypoints.length > 0
            ? [
                {
                  id: 'bert-step',
                  label: 'Bert calls first entrypoint',
                  actor: 'bert',
                  targetContractId: contractId,
                  entrypoint: input.entrypoints[0] ?? 'default',
                  args: [],
                  expectFailure: false,
                },
              ]
            : [],
      },
    ],
    artifacts: {
      clearanceId: input.clearanceId ?? undefined,
      generatedAt,
    },
  };

  const scenario = JSON.stringify(manifest.scenarios[0], null, 2);
  const files: KilnProjectFile[] = [
    {
      path: 'kiln.project.json',
      kind: 'manifest',
      sizeBytes: bytes(JSON.stringify(manifest)),
      preview: JSON.stringify(manifest, null, 2),
    },
    {
      path: sourcePath,
      kind: 'source',
      sizeBytes: bytes(input.source),
      preview: preview(input.source),
    },
    {
      path: scenarioPath,
      kind: 'scenario',
      sizeBytes: bytes(scenario),
      preview: scenario,
    },
  ];

  if (initialStoragePath) {
    const storage = input.initialStorage?.trim() || 'Unit';
    files.push({
      path: initialStoragePath,
      kind: 'storage',
      sizeBytes: bytes(storage),
      preview: storage,
    });
  }

  const actorNodes = manifest.actors.map((actor) => ({
    id: actor.id,
    label: actor.label,
    kind: actor.kind === 'service' ? ('service' as const) : ('actor' as const),
  }));
  const contractNodes = manifest.contracts.map((contract) => ({
    id: contract.id,
    label: contract.label,
    kind: 'contract' as const,
  }));
  const edges = manifest.scenarios.flatMap((scenarioItem) =>
    scenarioItem.steps.map((step) => ({
      from: step.actor,
      to: step.targetContractId,
      label: step.entrypoint,
    })),
  );

  const blockers: string[] = [];
  if (language === 'solidity') {
    blockers.push('Etherlink scenarios are compile/deploy-capable, but server-side EVM puppet E2E is unavailable by design.');
  }
  if (!input.source.trim()) {
    blockers.push('No source is loaded into the browser workspace.');
  }

  return {
    manifest: validateKilnProjectManifest(manifest),
    files,
    graph: {
      nodes: [...actorNodes, ...contractNodes],
      edges,
    },
    blockers,
  };
}
