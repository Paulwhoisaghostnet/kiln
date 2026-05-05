import {
  Parser,
  contractSection,
  emitMicheline,
} from '@taquito/michel-codec';
import type { Expr } from '@taquito/michel-codec';
import type { AbiEntrypoint } from './types.js';

type MichelsonNode = string | MichelsonNode[];
type MichelineLikeNode = {
  prim?: string;
  args?: unknown[];
  annots?: string[];
  [key: string]: unknown;
};

const annotationPattern = /^%([a-zA-Z][a-zA-Z0-9_]*)$/;
const michelsonParser = new Parser();

function extractParameterSection(code: string): string {
  const parameterMatch = /\bparameter\b/i.exec(code);
  if (!parameterMatch) {
    return '';
  }

  const afterParameter = code.slice(parameterMatch.index + parameterMatch[0].length);
  const semicolonIndex = afterParameter.indexOf(';');
  if (semicolonIndex >= 0) {
    return afterParameter.slice(0, semicolonIndex);
  }

  const storageMatch = /\bstorage\b/i.exec(afterParameter);
  return storageMatch ? afterParameter.slice(0, storageMatch.index) : afterParameter;
}

function tokenizeMichelsonExpression(source: string): string[] {
  return source.match(/\(|\)|[^\s()]+/g) ?? [];
}

function parseMichelsonNodes(tokens: string[]): MichelsonNode[] {
  let index = 0;

  const parseNode = (): MichelsonNode | null => {
    const token = tokens[index];
    if (!token) {
      return null;
    }
    index += 1;

    if (token === '(') {
      const children: MichelsonNode[] = [];
      while (index < tokens.length && tokens[index] !== ')') {
        const child = parseNode();
        if (child !== null) {
          children.push(child);
        }
      }
      if (tokens[index] === ')') {
        index += 1;
      }
      return children;
    }

    if (token === ')') {
      return null;
    }

    return token;
  };

  const nodes: MichelsonNode[] = [];
  while (index < tokens.length) {
    const node = parseNode();
    if (node !== null) {
      nodes.push(node);
    }
  }
  return nodes;
}

function nodeHead(node: MichelsonNode): string | undefined {
  return Array.isArray(node) && typeof node[0] === 'string'
    ? node[0].toLowerCase()
    : undefined;
}

function directEntrypointAnnotations(node: MichelsonNode): string[] {
  if (!Array.isArray(node)) {
    return [];
  }

  return node
    .filter((child): child is string => typeof child === 'string')
    .map((child) => annotationPattern.exec(child)?.[1])
    .filter((name): name is string => Boolean(name) && name !== 'default');
}

function serializeTypeNode(node: MichelsonNode, topLevel = true): string {
  if (typeof node === 'string') {
    return node.toLowerCase();
  }

  const parts = node
    .filter((child) => {
      if (typeof child !== 'string') {
        return true;
      }
      return !annotationPattern.test(child) && !child.startsWith('@') && !child.startsWith(':');
    })
    .map((child) => serializeTypeNode(child, false))
    .filter(Boolean);

  const serialized = parts.join(' ');
  return topLevel ? serialized : `(${serialized})`;
}

function collectEntrypointsFromParameterNode(
  node: MichelsonNode,
): Array<{ name: string; parameterType: string }> {
  if (nodeHead(node) === 'or' && Array.isArray(node)) {
    return node
      .slice(1)
      .filter((child) => Array.isArray(child))
      .flatMap((child) => collectEntrypointsFromParameterNode(child));
  }

  return directEntrypointAnnotations(node).map((name) => ({
    name,
    parameterType: serializeTypeNode(node),
  }));
}

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

function collectTaquitoEntrypointsFromType(
  node: unknown,
): Array<{ name: string; parameterType: string }> {
  if (!isMichelineObject(node)) {
    return [];
  }

  if (node.prim?.toLowerCase() === 'or' && Array.isArray(node.args)) {
    return node.args.flatMap((child) => collectTaquitoEntrypointsFromType(child));
  }

  return (node.annots ?? [])
    .map((annot) => annotationPattern.exec(annot)?.[1])
    .filter((name): name is string => Boolean(name) && name !== 'default')
    .map((name) => ({
      name,
      parameterType: normalizeMichelsonType(node),
    }));
}

function parseEntrypointsWithTaquito(code: string): AbiEntrypoint[] {
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

  const entrypoints = new Map<string, string>();
  for (const entrypoint of collectTaquitoEntrypointsFromType(root)) {
    if (!entrypoints.has(entrypoint.name)) {
      entrypoints.set(entrypoint.name, entrypoint.parameterType);
    }
  }

  return [...entrypoints.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, parameterType]) => ({
      name,
      args: [],
      parameterType,
    }));
}

function parseEntrypointsWithFallback(code: string): AbiEntrypoint[] {
  const entrypoints = new Map<string, string>();
  const parameterSection = extractParameterSection(code);
  const nodes = parseMichelsonNodes(tokenizeMichelsonExpression(parameterSection));
  const root: MichelsonNode =
    nodes.length === 1 && nodes[0] !== undefined ? nodes[0] : nodes;

  for (const entrypoint of collectEntrypointsFromParameterNode(root)) {
    if (!entrypoints.has(entrypoint.name)) {
      entrypoints.set(entrypoint.name, entrypoint.parameterType);
    }
  }

  return [...entrypoints.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, parameterType]) => ({
      name,
      args: [],
      parameterType,
    }));
}

export function parseEntrypointsFromMichelson(code: string): AbiEntrypoint[] {
  try {
    return parseEntrypointsWithTaquito(code);
  } catch {
    return parseEntrypointsWithFallback(code);
  }
}
