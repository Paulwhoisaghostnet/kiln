import {
  Parser,
  contractSection,
  emitMicheline,
} from '@taquito/michel-codec';
import type { Expr } from '@taquito/michel-codec';
import { ParameterSchema } from '@taquito/michelson-encoder';
import type { MichelsonV1Expression, ScriptResponse } from '@taquito/rpc';
import type { AbiArg, AbiEntrypoint } from './types.js';

type MichelineLikeNode = {
  prim?: string;
  args?: unknown[];
  annots?: string[];
  [key: string]: unknown;
};

interface ParsedEntrypointShape {
  name: string;
  parameterType: string;
  sampleArgs: string[];
  parameterSchema?: unknown;
  sampleJsArgs?: unknown[];
}

const annotationPattern = /^%([a-zA-Z][a-zA-Z0-9_]*)$/;
const michelsonParser = new Parser();
const sampleAddress = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const sampleContractAddress = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';

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

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function michelsonString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function pairChain(values: string[]): string {
  if (values.length === 1) {
    return values[0] ?? '';
  }

  let expr = values[values.length - 1] ?? '';
  for (let index = values.length - 2; index >= 0; index -= 1) {
    expr = `(Pair ${values[index]} ${expr})`;
  }
  return expr;
}

function combPair(values: string[]): string {
  return `(Pair ${values.join(' ')})`;
}

function nodePrim(node: unknown): string | undefined {
  return isMichelineObject(node) ? node.prim?.toLowerCase() : undefined;
}

function nodeArgs(node: unknown): unknown[] {
  return isMichelineObject(node) && Array.isArray(node.args) ? node.args : [];
}

function sampleMichelsonArgsForType(node: unknown): string[] {
  const prim = nodePrim(node);
  if (!prim) {
    return [];
  }

  switch (prim) {
    case 'unit':
      return ['Unit'];
    case 'nat':
    case 'int':
    case 'mutez':
      return ['1'];
    case 'bool':
      return ['True', 'False'];
    case 'string':
      return [michelsonString('shadowbox')];
    case 'bytes':
      return ['0x00'];
    case 'address':
    case 'key_hash':
      return [michelsonString(sampleAddress)];
    case 'timestamp':
      return [michelsonString('1970-01-01T00:00:00Z')];
    case 'chain_id':
      return [michelsonString('NetXsqzbfFenSTS')];
    case 'contract':
      return [michelsonString(sampleContractAddress)];
    case 'pair': {
      const childCandidates = nodeArgs(node).map((arg) => sampleMichelsonArgsForType(arg));
      if (
        childCandidates.length < 2 ||
        childCandidates.some((candidates) => candidates.length === 0)
      ) {
        return [];
      }
      const values = childCandidates.map((candidates) => candidates[0] as string);
      return unique([combPair(values), pairChain(values)]);
    }
    case 'or': {
      const [leftNode, rightNode] = nodeArgs(node);
      const left = sampleMichelsonArgsForType(leftNode);
      const right = sampleMichelsonArgsForType(rightNode);
      return unique([
        ...(left.length > 0 ? [`(Left ${left[0]})`] : []),
        ...(right.length > 0 ? [`(Right ${right[0]})`] : []),
      ]);
    }
    case 'option': {
      const [innerNode] = nodeArgs(node);
      const inner = sampleMichelsonArgsForType(innerNode);
      return unique([...(inner.length > 0 ? [`(Some ${inner[0]})`] : []), 'None']);
    }
    case 'list':
    case 'set': {
      const [innerNode] = nodeArgs(node);
      const inner = sampleMichelsonArgsForType(innerNode);
      return unique([...(inner.length > 0 ? [`{ ${inner[0]} }`] : []), '{}']);
    }
    case 'map':
    case 'big_map': {
      const [keyNode, valueNode] = nodeArgs(node);
      const key = sampleMichelsonArgsForType(keyNode);
      const value = sampleMichelsonArgsForType(valueNode);
      return unique([
        ...(key.length > 0 && value.length > 0 ? [`{ Elt ${key[0]} ${value[0]} }`] : []),
        '{}',
      ]);
    }
    case 'lambda':
      return ['{}'];
    default:
      return [];
  }
}

function isSchemaObject(
  schema: unknown,
): schema is { __michelsonType?: string; schema?: unknown } {
  return Boolean(schema) && typeof schema === 'object' && !Array.isArray(schema);
}

function fieldAwareSample(fieldName: string | undefined, michelsonType: string): unknown {
  const field = fieldName?.toLowerCase() ?? '';
  if (michelsonType === 'address' || michelsonType === 'key_hash') {
    return sampleAddress;
  }
  if (michelsonType === 'contract') {
    return sampleContractAddress;
  }
  if (michelsonType === 'string') {
    if (field.includes('ref')) {
      return 'kiln-e2e';
    }
    return 'shadowbox';
  }
  if (michelsonType === 'bytes') {
    return '0x00';
  }
  if (michelsonType === 'bool') {
    return true;
  }
  if (michelsonType === 'timestamp') {
    return '1970-01-01T00:00:00Z';
  }
  if (michelsonType === 'chain_id') {
    return 'NetXsqzbfFenSTS';
  }
  if (michelsonType === 'mutez') {
    return 1;
  }
  if (michelsonType === 'nat' || michelsonType === 'int') {
    if (field.endsWith('listing_id') || field.endsWith('offer_id')) {
      return 0;
    }
    return 1;
  }
  return undefined;
}

function sampleJsValueForSchema(schema: unknown, fieldName?: string): unknown {
  if (typeof schema === 'string') {
    return fieldAwareSample(fieldName, schema.toLowerCase());
  }
  if (!isSchemaObject(schema)) {
    return undefined;
  }

  const michelsonType = schema.__michelsonType?.toLowerCase();
  if (!michelsonType) {
    return undefined;
  }

  switch (michelsonType) {
    case 'unit':
      return null;
    case 'nat':
    case 'int':
    case 'mutez':
    case 'bool':
    case 'string':
    case 'bytes':
    case 'address':
    case 'key_hash':
    case 'timestamp':
    case 'chain_id':
    case 'contract':
      return fieldAwareSample(fieldName, michelsonType);
    case 'pair': {
      if (
        !schema.schema ||
        typeof schema.schema !== 'object' ||
        Array.isArray(schema.schema)
      ) {
        return undefined;
      }
      return Object.fromEntries(
        Object.entries(schema.schema).map(([key, value]) => [
          key,
          sampleJsValueForSchema(value, key),
        ]),
      );
    }
    case 'or': {
      if (
        !schema.schema ||
        typeof schema.schema !== 'object' ||
        Array.isArray(schema.schema)
      ) {
        return undefined;
      }
      const [firstKey, firstValue] = Object.entries(schema.schema)[0] ?? [];
      return firstKey
        ? { [firstKey]: sampleJsValueForSchema(firstValue, firstKey) }
        : undefined;
    }
    case 'option':
      return null;
    case 'list':
    case 'set': {
      const value = sampleJsValueForSchema(schema.schema, fieldName);
      return value === undefined ? [] : [value];
    }
    case 'map':
    case 'big_map':
      return {};
    case 'lambda':
      return [];
    default:
      return undefined;
  }
}

function parameterSchemaForType(node: unknown): unknown | undefined {
  try {
    return new ParameterSchema(node as MichelsonV1Expression).generateSchema();
  } catch {
    return undefined;
  }
}

function sampleJsArgsForType(node: unknown): unknown[] {
  const schema = parameterSchemaForType(node);
  if (!schema) {
    return [];
  }
  if (
    isSchemaObject(schema) &&
    schema.__michelsonType?.toLowerCase() === 'unit'
  ) {
    return [];
  }
  const sample = sampleJsValueForSchema(schema);
  return sample === undefined ? [] : [sample];
}

function abiTypeForSchema(schema: unknown): string {
  if (typeof schema === 'string') {
    return schema;
  }
  if (!isSchemaObject(schema)) {
    return 'unknown';
  }
  return schema.__michelsonType ?? 'unknown';
}

function abiArgsForSchema(schema: unknown): AbiArg[] {
  if (!schema) {
    return [];
  }
  if (
    isSchemaObject(schema) &&
    schema.__michelsonType?.toLowerCase() === 'unit'
  ) {
    return [];
  }
  if (
    isSchemaObject(schema) &&
    schema.__michelsonType?.toLowerCase() === 'pair' &&
    schema.schema &&
    typeof schema.schema === 'object' &&
    !Array.isArray(schema.schema)
  ) {
    return Object.entries(schema.schema).map(([key, value], index) => ({
      name: /^\d+$/.test(key) ? `arg${index}` : key,
      type: abiTypeForSchema(value),
    }));
  }
  return [{ name: 'arg0', type: abiTypeForSchema(schema) }];
}

function collectEntrypointsFromType(node: unknown): ParsedEntrypointShape[] {
  if (!isMichelineObject(node)) {
    return [];
  }

  if (node.prim?.toLowerCase() === 'or' && Array.isArray(node.args)) {
    return node.args.flatMap((child) => collectEntrypointsFromType(child));
  }

  return (node.annots ?? [])
    .map((annot) => annotationPattern.exec(annot)?.[1])
    .filter((name): name is string => Boolean(name) && name !== 'default')
    .map((name) => ({
      name,
      parameterType: normalizeMichelsonType(node),
      sampleArgs: sampleMichelsonArgsForType(node),
      parameterSchema: parameterSchemaForType(node),
      sampleJsArgs: sampleJsArgsForType(node),
    }));
}

function readEntrypointsFromParameterRoot(root: unknown): AbiEntrypoint[] {
  const entrypoints = new Map<string, ParsedEntrypointShape>();
  for (const entrypoint of collectEntrypointsFromType(root)) {
    if (!entrypoints.has(entrypoint.name)) {
      entrypoints.set(entrypoint.name, entrypoint);
    }
  }

  return [...entrypoints.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, parameterType, sampleArgs, parameterSchema, sampleJsArgs }) => ({
      name,
      args: abiArgsForSchema(parameterSchema),
      parameterType,
      sampleArgs,
      parameterSchema,
      sampleJsArgs,
    }));
}

export function readMichelsonEntrypoints(code: string): AbiEntrypoint[] {
  try {
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

    return readEntrypointsFromParameterRoot(root);
  } catch {
    return [];
  }
}

export function readMichelsonEntrypointsFromScript(
  script: Pick<ScriptResponse, 'code'>,
): AbiEntrypoint[] {
  try {
    const code = script.code as unknown[];
    const parameterSection = code.find(
      (section) =>
        isMichelineObject(section) && section.prim?.toLowerCase() === 'parameter',
    ) as MichelineLikeNode | undefined;
    const root = parameterSection?.args?.[0];
    return root ? readEntrypointsFromParameterRoot(root) : [];
  } catch {
    return [];
  }
}
