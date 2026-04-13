import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type TokenExpectation = {
  token: string;
  name: string;
  decimals: string;
  supply: number;
};

const EXPECTATIONS: TokenExpectation[] = [
  { token: 'bronze', name: 'Test Bronze', decimals: '8', supply: 100_000_000 },
  { token: 'silver', name: 'Test Silver', decimals: '7', supply: 10_000_000 },
  { token: 'gold', name: 'Test Gold', decimals: '6', supply: 1_000_000 },
  { token: 'platinum', name: 'Test Platinum', decimals: '5', supply: 100_000 },
  { token: 'diamond', name: 'Test Diamond', decimals: '4', supply: 10_000 },
];

const REQUIRED_ENTRYPOINT_ANNOTS = [
  '%admin',
  '%assets',
  '%balance_of',
  '%burn_tokens',
  '%confirm_admin',
  '%create_token',
  '%mint_tokens',
  '%pause',
  '%set_admin',
  '%tokens',
  '%transfer',
  '%update_operators',
] as const;

function decodeBytes(hex: string): string {
  return Buffer.from(hex.replace(/^0x/, ''), 'hex').toString('utf8');
}

function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const item of node) {
      yield* walk(item);
    }
    return;
  }

  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    yield record;
    for (const value of Object.values(record)) {
      yield* walk(value);
    }
  }
}

describe('compiled FA2 token artifacts', () => {
  for (const expected of EXPECTATIONS) {
    it(`exposes FA2 entrypoints for ${expected.token}`, () => {
      const codePath = resolve(`contracts/tokens/test-${expected.token}.tz`);
      const code = readFileSync(codePath, 'utf8');

      for (const entrypoint of REQUIRED_ENTRYPOINT_ANNOTS) {
        expect(code).toContain(entrypoint);
      }
      expect(code).toContain('%token_metadata');
    });

    it(`encodes supply and decimals for ${expected.token}`, () => {
      const storagePath = resolve(`contracts/tokens/test-${expected.token}.storage.json`);
      const storage = JSON.parse(readFileSync(storagePath, 'utf8')) as unknown;

      const ints = Array.from(walk(storage))
        .map((node) => node.int)
        .filter((value): value is string => typeof value === 'string')
        .map((value) => Number.parseInt(value, 10));

      expect(ints).toContain(expected.supply);

      const metadataPairs = new Map<string, string>();
      for (const node of walk(storage)) {
        if (node.prim !== 'Elt' || !Array.isArray(node.args) || node.args.length !== 2) {
          continue;
        }

        const [keyNode, valueNode] = node.args as Array<Record<string, unknown>>;
        if (
          typeof keyNode?.string !== 'string' ||
          typeof valueNode?.bytes !== 'string'
        ) {
          continue;
        }

        metadataPairs.set(keyNode.string, decodeBytes(valueNode.bytes));
      }

      expect(metadataPairs.get('name')).toBe(expected.name);
      expect(metadataPairs.get('decimals')).toBe(expected.decimals);
    });
  }
});
