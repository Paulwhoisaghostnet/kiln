import type { SmartPyCompilationResult } from '../../lib/smartpy-compiler.js';

export interface MaterializeContractSourceInput {
  sourceType: 'auto' | 'michelson' | 'smartpy';
  source: string;
  scenario?: string;
  compileSmartPy: (
    source: string,
    scenario?: string,
  ) => Promise<SmartPyCompilationResult>;
}

export interface MaterializedContractSource {
  sourceType: 'michelson' | 'smartpy';
  michelson: string;
  compiled?: SmartPyCompilationResult;
}

function looksLikeSmartPy(source: string): boolean {
  return source.toLowerCase().includes('import smartpy as sp');
}

export function shouldCompileSmartPy(
  sourceType: 'auto' | 'michelson' | 'smartpy',
  source: string,
): boolean {
  return sourceType === 'smartpy' || (sourceType === 'auto' && looksLikeSmartPy(source));
}

export async function materializeContractSource(
  input: MaterializeContractSourceInput,
): Promise<MaterializedContractSource> {
  if (!shouldCompileSmartPy(input.sourceType, input.source)) {
    return {
      sourceType: 'michelson',
      michelson: input.source,
    };
  }

  const compiled = await input.compileSmartPy(input.source, input.scenario);
  return {
    sourceType: 'smartpy',
    michelson: compiled.michelson,
    compiled,
  };
}
