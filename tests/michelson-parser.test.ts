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
      { name: 'mint', args: [], parameterType: 'unit' },
      { name: 'transfer', args: [], parameterType: 'pair address nat' },
    ]);
  });

  it('returns empty array when no annotations are present', () => {
    const result = parseEntrypointsFromMichelson(
      'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR }',
    );

    expect(result).toEqual([]);
  });

  it('ignores storage annotations when detecting entrypoints', () => {
    const michelson = `
      parameter (or (unit %mint) (unit %transfer));
      storage (pair (address %admin) (nat %total_supply));
      code { CAR ; NIL operation ; PAIR };
    `;

    expect(parseEntrypointsFromMichelson(michelson)).toEqual([
      { name: 'mint', args: [], parameterType: 'unit' },
      { name: 'transfer', args: [], parameterType: 'unit' },
    ]);
  });

  it('preserves comb and nested parameter types for runtime argument generation', () => {
    const michelson = `
      parameter
        (or
          (pair %purchase nat nat string)
          (pair %settle nat (pair nat string)));
      storage unit;
      code { CAR ; NIL operation ; PAIR };
    `;

    expect(parseEntrypointsFromMichelson(michelson)).toEqual([
      { name: 'purchase', args: [], parameterType: 'pair nat nat string' },
      { name: 'settle', args: [], parameterType: 'pair nat (pair nat string)' },
    ]);
  });
});
