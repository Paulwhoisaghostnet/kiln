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
    expect(expressions.allowlist).toBe(
      '(Pair "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" True)',
    );
    expect(expressions.permit).toBe('0x00');
    expect(expressions.emptyList).toBe('{}');
  });
});
