import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function inspectRunnerExpressions() {
  const runnerPath = resolve('scripts/shadowbox/flextesa_runner.py');
  const script = `
import importlib.util
import json
import pathlib
import sys

path = pathlib.Path(${JSON.stringify(runnerPath)})
spec = importlib.util.spec_from_file_location("flextesa_runner", path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)

print(json.dumps({
  "updateOperators": module.build_arg("update_operators", "bert", [0]),
  "updateOperatorCandidates": module.build_arg_candidates("update_operators", "bert", [0]),
  "purchaseCandidates": module.build_arg_candidates("purchase", "bert", [1]),
  "ignoredTypeCandidates": module.build_arg_candidates("some_entrypoint", "bert", [1], "pair nat nat string"),
  "providedPairCandidates": module.build_arg_candidates("some_entrypoint", "bert", [1], None, ['(Pair 1 1 "from-ts")']),
  "externalKt1s": module.extract_external_kt1_addresses('(Pair "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" (Pair "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" "KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE"))'),
  "rewrittenStorage": module.replace_external_kt1_addresses('(Pair "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" "KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE")', {'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton': 'KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg'}),
  "needsFa2Fixture": module.source_needs_fa2_fixture('code { CONTRACT %transfer (list (pair address unit)) ; DROP }', '(Pair "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" 0)'),
  "createTokenArg": module.build_fa2_fixture_create_token_arg(1),
  "mintArg": module.build_fa2_fixture_mint_arg("ernie", [0, 1]),
  "operatorArg": module.build_fa2_fixture_operator_arg("ernie", "KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg", [0, 1]),
  "allowlist": module.build_arg("set_allowlist", "bert", [{"address": "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6", "allowed": True}]),
  "permit": module.build_arg("permit", "bert", ["0x00"]),
  "emptyList": module.to_michelson_literal([]),
}))
`;
  return JSON.parse(
    execFileSync('python3', ['-c', script], {
      cwd: resolve('.'),
      encoding: 'utf8',
    }),
  ) as {
    updateOperators: string;
    updateOperatorCandidates: string[];
    purchaseCandidates: string[];
    ignoredTypeCandidates: string[];
    providedPairCandidates: string[];
    externalKt1s: string[];
    rewrittenStorage: [string, number];
    needsFa2Fixture: boolean;
    createTokenArg: string;
    mintArg: string;
    operatorArg: string;
    allowlist: string;
    permit: string;
    emptyList: string;
  };
}

describe('Flextesa shadowbox runner argument compatibility', () => {
  it('builds Michelson expressions for generated workflow entrypoint shapes', () => {
    const expressions = inspectRunnerExpressions();

    expect(expressions.updateOperators).toBe(
      '{ Left (Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" (Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" 0)) }',
    );
    expect(expressions.updateOperatorCandidates).toEqual(
      expect.arrayContaining([
        '{ Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" (Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" 0) }',
      ]),
    );
    expect(expressions.purchaseCandidates).toEqual([
      '1',
      '(Pair 1 1 "shadowbox")',
      '(Pair 1 (Pair 1 "shadowbox"))',
      '(Pair 0 1 "shadowbox")',
      '(Pair 0 (Pair 1 "shadowbox"))',
      'Unit',
    ]);
    expect(expressions.ignoredTypeCandidates).toEqual([
      '1',
      'Unit',
    ]);
    expect(expressions.providedPairCandidates).toEqual([
      '(Pair 1 1 "from-ts")',
    ]);
    expect(expressions.externalKt1s).toEqual([
      'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      'KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE',
    ]);
    expect(expressions.rewrittenStorage).toEqual([
      '(Pair "KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg" "KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE")',
      1,
    ]);
    expect(expressions.needsFa2Fixture).toBe(true);
    expect(expressions.createTokenArg).toBe(
      '{ Pair 1 (Pair "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" (Pair 1000000 {})) }',
    );
    expect(expressions.mintArg).toBe(
      '{ Pair 0 (Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" 1000000); Pair 1 (Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" 1000000) }',
    );
    expect(expressions.operatorArg).toBe(
      '{ Left (Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" (Pair "KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg" 0)); Left (Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" (Pair "KT1VsSxSXUkgw6zkBGgUuDXXuJs9ToPqkrCg" 1)) }',
    );
    expect(expressions.allowlist).toBe(
      '(Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" True)',
    );
    expect(expressions.permit).toBe('0x00');
    expect(expressions.emptyList).toBe('{}');
  });
});
