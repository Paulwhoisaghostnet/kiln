import type { AbiEntrypoint } from './types.js';

const entrypointPattern = /%([a-zA-Z][a-zA-Z0-9_]*)/g;

export function parseEntrypointsFromMichelson(code: string): AbiEntrypoint[] {
  const names = new Set<string>();

  for (const match of code.matchAll(entrypointPattern)) {
    const entrypoint = match[1];
    if (!entrypoint || entrypoint === 'default') {
      continue;
    }
    names.add(entrypoint);
  }

  return [...names].sort().map((name) => ({ name, args: [] }));
}
