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
      {
        name: 'mint',
        args: [],
        parameterType: 'unit',
        parameterSchema: { __michelsonType: 'unit', schema: 'unit' },
        sampleArgs: ['Unit'],
        sampleJsArgs: [],
      },
      {
        name: 'transfer',
        args: [
          { name: 'arg0', type: 'address' },
          { name: 'arg1', type: 'nat' },
        ],
        parameterType: 'pair address nat',
        parameterSchema: {
          __michelsonType: 'pair',
          schema: {
            0: { __michelsonType: 'address', schema: 'address' },
            1: { __michelsonType: 'nat', schema: 'nat' },
          },
        },
        sampleArgs: ['(Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" 1)'],
        sampleJsArgs: [
          {
            0: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
            1: 1,
          },
        ],
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
      {
        name: 'mint',
        args: [],
        parameterType: 'unit',
        parameterSchema: { __michelsonType: 'unit', schema: 'unit' },
        sampleArgs: ['Unit'],
        sampleJsArgs: [],
      },
      {
        name: 'transfer',
        args: [],
        parameterType: 'unit',
        parameterSchema: { __michelsonType: 'unit', schema: 'unit' },
        sampleArgs: ['Unit'],
        sampleJsArgs: [],
      },
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
        args: [
          { name: 'arg0', type: 'nat' },
          { name: 'arg1', type: 'nat' },
          { name: 'arg2', type: 'string' },
        ],
        parameterType: 'pair nat nat string',
        parameterSchema: {
          __michelsonType: 'pair',
          schema: {
            0: { __michelsonType: 'nat', schema: 'nat' },
            1: { __michelsonType: 'nat', schema: 'nat' },
            2: { __michelsonType: 'string', schema: 'string' },
          },
        },
        sampleArgs: ['(Pair 1 1 "shadowbox")', '(Pair 1 (Pair 1 "shadowbox"))'],
        sampleJsArgs: [{ 0: 1, 1: 1, 2: 'shadowbox' }],
      },
      {
        name: 'settle',
        args: [
          { name: 'arg0', type: 'nat' },
          { name: 'arg1', type: 'nat' },
          { name: 'arg2', type: 'string' },
        ],
        parameterType: 'pair nat (pair nat string)',
        parameterSchema: {
          __michelsonType: 'pair',
          schema: {
            0: { __michelsonType: 'nat', schema: 'nat' },
            1: { __michelsonType: 'nat', schema: 'nat' },
            2: { __michelsonType: 'string', schema: 'string' },
          },
        },
        sampleArgs: ['(Pair 1 (Pair 1 "shadowbox"))'],
        sampleJsArgs: [{ 0: 1, 1: 1, 2: 'shadowbox' }],
      },
    ]);
  });

  it('keeps SmartPy field names for Taquito methodsObject sample args', () => {
    const michelson = `
      parameter
        (or
          (unit %default)
          (pair %purchase
            (nat %listing_id)
            (nat %amount_wtf_units)
            (string %purchase_ref)));
      storage unit;
      code { CAR ; NIL operation ; PAIR };
    `;

    expect(readMichelsonEntrypoints(michelson)).toEqual([
      {
        name: 'purchase',
        args: [
          { name: 'listing_id', type: 'nat' },
          { name: 'amount_wtf_units', type: 'nat' },
          { name: 'purchase_ref', type: 'string' },
        ],
        parameterType: 'pair nat nat string',
        parameterSchema: {
          __michelsonType: 'pair',
          schema: {
            listing_id: { __michelsonType: 'nat', schema: 'nat' },
            amount_wtf_units: { __michelsonType: 'nat', schema: 'nat' },
            purchase_ref: { __michelsonType: 'string', schema: 'string' },
          },
        },
        sampleArgs: ['(Pair 1 1 "shadowbox")', '(Pair 1 (Pair 1 "shadowbox"))'],
        sampleJsArgs: [
          {
            listing_id: 0,
            amount_wtf_units: 1,
            purchase_ref: 'kiln-e2e',
          },
        ],
      },
    ]);
  });
});
