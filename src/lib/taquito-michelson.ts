import {
  Parser,
  contractSection,
  emitMicheline,
} from '@taquito/michel-codec';
import type { Expr } from '@taquito/michel-codec';
import type { AbiEntrypoint } from './types.js';

type MichelineLikeNode = {
  prim?: string;
  args?: unknown[];
  annots?: string[];
  [key: string]: unknown;
};

interface ParsedEntrypointShape {
  name: string;
  parameterType: string;
  sampleArgs: string[];
}

const annotationPattern = /^%([a-zA-Z][a-zA-Z0-9_]*)$/;
const michelsonParser = new Parser();
const sampleAddress = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const sampleContractAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';

function isMichelineObject(node: unknown): node is MichelineLikeNode {
  return Boolean(node) && typeof node === 'object' && !Array.isArray(node);
}

function stripMichelineAnnotations(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripMichelineAnnotations);
  }
  if (!isMichelineObject(node)) {
    return node;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'annots') {
      clean[key] = stripMichelineAnnotations(value);
    }
  }
  return clean;
}

function normalizeMichelsonType(node: unknown): string {
  const emitted = emitMicheline(stripMichelineAnnotations(node) as Expr, {
    indent: '',
    newline: '',
  }).trim();
  return emitted.startsWith('(') && emitted.endsWith(')')
    ? emitted.slice(1, -1)
    : emitted;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function michelsonString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function pairChain(values: string[]): string {
  if (values.length === 1) {
    return values[0] ?? '';
  }

  let expr = values[values.length - 1] ?? '';
  for (let index = values.length - 2; index >= 0; index -= 1) {
    expr = `(Pair ${values[index]} ${expr})`;
  }
  return expr;
}

function combPair(values: string[]): string {
  return `(Pair ${values.join(' ')})`;
}

function nodePrim(node: unknown): string | undefined {
  return isMichelineObject(node) ? node.prim?.toLowerCase() : undefined;
}

function nodeArgs(node: unknown): unknown[] {
  return isMichelineObject(node) && Array.isArray(node.args) ? node.args : [];
}

function sampleMichelsonArgsForType(node: unknown): string[] {
  const prim = nodePrim(node);
  if (!prim) {
    return [];
  }

  switch (prim) {
    case 'unit':
      return ['Unit'];
    case 'nat':
    case 'int':
    case 'mutez':
      return ['1'];
    case 'bool':
      return ['True', 'False'];
    case 'string':
      return [michelsonString('shadowbox')];
    case 'bytes':
      return ['0x00'];
    case 'address':
    case 'key_hash':
      return [michelsonString(sampleAddress)];
    case 'timestamp':
      return [michelsonString('1970-01-01T00:00:00Z')];
    case 'chain_id':
      return [michelsonString('NetXsqzbfFenSTS')];
    case 'contract':
      return [michelsonString(sampleContractAddress)];
    case 'pair': {
      const childCandidates = nodeArgs(node).map((arg) => sampleMichelsonArgsForType(arg));
      if (
        childCandidates.length < 2 ||
        childCandidates.some((candidates) => candidates.length === 0)
      ) {
        return [];
      }
      const values = childCandidates.map((candidates) => candidates[0] as string);
      return unique([combPair(values), pairChain(values)]);
    }
    case 'or': {
      const [leftNode, rightNode] = nodeArgs(node);
      const left = sampleMichelsonArgsForType(leftNode);
      const right = sampleMichelsonArgsForType(rightNode);
      return unique([
        ...(left.length > 0 ? [`(Left ${left[0]})`] : []),
        ...(right.length > 0 ? [`(Right ${right[0]})`] : []),
      ]);
    }
    case 'option': {
      const [innerNode] = nodeArgs(node);
      const inner = sampleMichelsonArgsForType(innerNode);
      return unique([...(inner.length > 0 ? [`(Some ${inner[0]})`] : []), 'None']);
    }
    case 'list':
    case 'set': {
      const [innerNode] = nodeArgs(node);
      const inner = sampleMichelsonArgsForType(innerNode);
      return unique([...(inner.length > 0 ? [`{ ${inner[0]} }`] : []), '{}']);
    }
    case 'map':
    case 'big_map': {
      const [keyNode, valueNode] = nodeArgs(node);
      const key = sampleMichelsonArgsForType(keyNode);
      const value = sampleMichelsonArgsForType(valueNode);
      return unique([
        ...(key.length > 0 && value.length > 0 ? [`{ Elt ${key[0]} ${value[0]} }`] : []),
        '{}',
      ]);
    }
    case 'lambda':
      return ['{}'];
    default:
      return [];
  }
}

function collectEntrypointsFromType(node: unknown): ParsedEntrypointShape[] {
  if (!isMichelineObject(node)) {
    return [];
  }

  if (node.prim?.toLowerCase() === 'or' && Array.isArray(node.args)) {
    return node.args.flatMap((child) => collectEntrypointsFromType(child));
  }

  return (node.annots ?? [])
    .map((annot) => annotationPattern.exec(annot)?.[1])
    .filter((name): name is string => Boolean(name) && name !== 'default')
    .map((name) => ({
      name,
      parameterType: normalizeMichelsonType(node),
      sampleArgs: sampleMichelsonArgsForType(node),
    }));
}

export function readMichelsonEntrypoints(code: string): AbiEntrypoint[] {
  try {
    const parsed = michelsonParser.parseScript(code);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const parameter = contractSection(
      parsed as unknown as Parameters<typeof contractSection>[0],
      'parameter',
    ) as unknown as MichelineLikeNode | null;
    const root = parameter?.args?.[0];
    if (!root) {
      return [];
    }

    const entrypoints = new Map<string, ParsedEntrypointShape>();
    for (const entrypoint of collectEntrypointsFromType(root)) {
      if (!entrypoints.has(entrypoint.name)) {
        entrypoints.set(entrypoint.name, entrypoint);
      }
    }

    return [...entrypoints.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ name, parameterType, sampleArgs }) => ({
        name,
        args: [],
        parameterType,
        sampleArgs,
      }));
  } catch {
    return [];
  }
}
