import { describe, expect, it } from 'vitest';
import { readMichelsonEntrypoints } from '../src/lib/taquito-michelson.js';

describe('readMichelsonEntrypoints', () => {
  it('extracts unique parameter annotations into entrypoints', () => {
    const michelson = `
      parameter
        (or
          (pair %transfer address nat)
          (or (unit %mint) (unit %mint)));
      storage unit;
      code { CAR ; NIL operation ; PAIR };
    `;

    const result = readMichelsonEntrypoints(michelson);

    expect(result).toEqual([
      { name: 'mint', args: [], parameterType: 'unit', sampleArgs: ['Unit'] },
      {
        name: 'transfer',
        args: [],
        parameterType: 'pair address nat',
        sampleArgs: ['(Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" 1)'],
      },
    ]);
  });

  it('returns empty array when no annotations are present', () => {
    const result = readMichelsonEntrypoints(
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

    expect(readMichelsonEntrypoints(michelson)).toEqual([
      { name: 'mint', args: [], parameterType: 'unit', sampleArgs: ['Unit'] },
      { name: 'transfer', args: [], parameterType: 'unit', sampleArgs: ['Unit'] },
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

    expect(readMichelsonEntrypoints(michelson)).toEqual([
      {
        name: 'purchase',
        args: [],
        parameterType: 'pair nat nat string',
        sampleArgs: ['(Pair 1 1 "shadowbox")', '(Pair 1 (Pair 1 "shadowbox"))'],
      },
      {
        name: 'settle',
        args: [],
        parameterType: 'pair nat (pair nat string)',
        sampleArgs: ['(Pair 1 (Pair 1 "shadowbox"))'],
      },
    ]);
  });
});
