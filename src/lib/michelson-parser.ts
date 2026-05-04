import type { AbiEntrypoint } from './types.js';

type MichelsonNode = string | MichelsonNode[];

const annotationPattern = /^%([a-zA-Z][a-zA-Z0-9_]*)$/;

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

function collectEntrypointsFromParameterNode(node: MichelsonNode): string[] {
  if (nodeHead(node) === 'or' && Array.isArray(node)) {
    return node
      .slice(1)
      .filter((child) => Array.isArray(child))
      .flatMap((child) => collectEntrypointsFromParameterNode(child));
  }

  return directEntrypointAnnotations(node);
}

export function parseEntrypointsFromMichelson(code: string): AbiEntrypoint[] {
  const names = new Set<string>();
  const parameterSection = extractParameterSection(code);
  const nodes = parseMichelsonNodes(tokenizeMichelsonExpression(parameterSection));
  const root: MichelsonNode =
    nodes.length === 1 && nodes[0] !== undefined ? nodes[0] : nodes;

  for (const entrypoint of collectEntrypointsFromParameterNode(root)) {
    names.add(entrypoint);
  }

  return [...names].sort().map((name) => ({ name, args: [] }));
}
