import { auditMichelsonContract } from './contract-audit.js';
import {
  hashContractCode,
  runContractSimulation,
  type DeploymentClearanceRecord,
  type DeploymentClearanceStore,
  type SimulationStepInput,
} from './contract-simulation.js';
import { parseEntrypointsFromMichelson } from './michelson-parser.js';
import type { SmartPyCompilationResult } from './smartpy-compiler.js';

export type WorkflowSourceType = 'auto' | 'michelson' | 'smartpy';

export interface WorkflowRunInput {
  sourceType: WorkflowSourceType;
  source: string;
  initialStorage?: string;
  scenario?: string;
  simulationSteps: SimulationStepInput[];
}

export interface WorkflowRunResult {
  sourceType: 'michelson' | 'smartpy';
  compile: {
    performed: boolean;
    scenario?: string;
    warnings: string[];
  };
  artifacts: {
    michelson: string;
    initialStorage: string;
    entrypoints: string[];
    codeHash: string;
  };
  validate: {
    passed: boolean;
    issues: string[];
    warnings: string[];
    estimate: {
      gasLimit: number;
      storageLimit: number;
      suggestedFeeMutez: number;
      minimalFeeMutez: number;
    } | null;
  };
  audit: ReturnType<typeof auditMichelsonContract>;
  simulation: ReturnType<typeof runContractSimulation>;
  clearance: {
    approved: boolean;
    record?: DeploymentClearanceRecord;
  };
}

function hasMichelsonSection(
  code: string,
  section: 'parameter' | 'storage' | 'code',
): boolean {
  const pattern = new RegExp(`\\b${section}\\b`, 'i');
  return pattern.test(code);
}

function detectSourceType(sourceType: WorkflowSourceType, source: string): 'michelson' | 'smartpy' {
  if (sourceType === 'smartpy' || sourceType === 'michelson') {
    return sourceType;
  }
  const normalized = source.toLowerCase();
  if (
    normalized.includes('import smartpy as sp') ||
    normalized.includes('@sp.module') ||
    normalized.includes('@sp.entrypoint')
  ) {
    return 'smartpy';
  }
  return 'michelson';
}

export async function runContractWorkflow(
  input: WorkflowRunInput,
  deps: {
    compileSmartPy: (
      source: string,
      scenario?: string,
    ) => Promise<SmartPyCompilationResult>;
    injectKilnTokens: (code: string) => string;
    estimateOrigination: (
      code: string,
      initialStorage: string,
    ) => Promise<{
      gasLimit: number;
      storageLimit: number;
      suggestedFeeMutez: number;
      minimalFeeMutez: number;
    }>;
    clearanceStore: DeploymentClearanceStore;
  },
): Promise<WorkflowRunResult> {
  const effectiveSourceType = detectSourceType(input.sourceType, input.source);
  const compileWarnings: string[] = [];

  let michelson = input.source;
  let initialStorage = input.initialStorage?.trim() || 'Unit';
  let scenario: string | undefined;

  if (effectiveSourceType === 'smartpy') {
    const compiled = await deps.compileSmartPy(input.source, input.scenario);
    michelson = compiled.michelson;
    scenario = compiled.scenario;
    if (!input.initialStorage?.trim()) {
      initialStorage = compiled.initialStorage;
      compileWarnings.push('Initial storage auto-filled from SmartPy compilation output.');
    }
  }

  const entrypoints = parseEntrypointsFromMichelson(michelson).map((entry) => entry.name);
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!hasMichelsonSection(michelson, 'parameter')) {
    issues.push('Missing Michelson parameter section.');
  }
  if (!hasMichelsonSection(michelson, 'storage')) {
    issues.push('Missing Michelson storage section.');
  }
  if (!hasMichelsonSection(michelson, 'code')) {
    issues.push('Missing Michelson code section.');
  }
  if (entrypoints.length === 0) {
    warnings.push('No annotated entrypoints were detected.');
  }

  let injectedCode = michelson;
  try {
    injectedCode = deps.injectKilnTokens(michelson);
  } catch (error) {
    warnings.push(
      `Token injection skipped: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  let estimate: WorkflowRunResult['validate']['estimate'] = null;
  try {
    estimate = await deps.estimateOrigination(injectedCode, initialStorage);
  } catch (error) {
    warnings.push(
      `Origination estimate skipped: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  const audit = auditMichelsonContract(injectedCode);
  const simulation = runContractSimulation({
    entrypoints,
    steps: input.simulationSteps,
  });
  const codeHash = hashContractCode(injectedCode);

  const validatePassed = issues.length === 0;
  const approved = validatePassed && audit.passed && simulation.success;
  const clearanceRecord = approved
    ? deps.clearanceStore.create({
        codeHash,
        auditPassed: audit.passed,
        simulationPassed: simulation.success,
      })
    : undefined;

  return {
    sourceType: effectiveSourceType,
    compile: {
      performed: effectiveSourceType === 'smartpy',
      scenario,
      warnings: compileWarnings,
    },
    artifacts: {
      michelson: injectedCode,
      initialStorage,
      entrypoints,
      codeHash,
    },
    validate: {
      passed: validatePassed,
      issues,
      warnings,
      estimate,
    },
    audit,
    simulation,
    clearance: {
      approved,
      record: clearanceRecord,
    },
  };
}
