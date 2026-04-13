import { describe, expect, it } from 'vitest';
import { parseEntrypointsFromMichelson } from '../src/lib/michelson-parser.js';

describe('parseEntrypointsFromMichelson', () => {
  it('extracts unique parameter annotations into entrypoints', () => {
    const michelson = `
      parameter
        (or
          (pair %transfer address nat)
          (or (unit %mint) (unit %mint)));
      storage unit;
      code { CAR ; NIL operation ; PAIR };
    `;

    const result = parseEntrypointsFromMichelson(michelson);

    expect(result).toEqual([
      { name: 'mint', args: [] },
      { name: 'transfer', args: [] },
    ]);
  });

  it('returns empty array when no annotations are present', () => {
    const result = parseEntrypointsFromMichelson(
      'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
    );

    expect(result).toEqual([]);
  });
});
