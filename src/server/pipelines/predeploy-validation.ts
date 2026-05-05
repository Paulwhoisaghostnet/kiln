import type { AbiEntrypoint, WalletType } from '../../lib/types.js';
import type { AppEnv } from '../../lib/env.js';
import { injectKilnTokens } from '../../lib/kiln-injector.js';
import { readMichelsonEntrypoints } from '../../lib/taquito-michelson.js';
import type {
  OriginationValidationResult,
  TezosServiceLike,
} from '../../lib/tezos-service.js';
import { asMessage } from '../http.js';

interface MichelsonChecks {
  hasParameterSection: boolean;
  hasStorageSection: boolean;
  hasCodeSection: boolean;
}

export interface PredeployValidationResult {
  success: true;
  valid: boolean;
  issues: string[];
  warnings: string[];
  entrypoints: AbiEntrypoint[];
  injectedCode: string;
  estimate: OriginationValidationResult | null;
  checks: MichelsonChecks;
}

export interface PredeployValidationDependencies {
  env: AppEnv;
  createTezosService: (wallet: WalletType) => TezosServiceLike;
}

function hasMichelsonSection(
  code: string,
  section: 'parameter' | 'storage' | 'code',
): boolean {
  const pattern = new RegExp(`\\b${section}\\b`, 'i');
  return pattern.test(code);
}

export async function runPredeployValidation(
  input: {
    code: string;
    initialStorage: string;
  },
  dependencies: PredeployValidationDependencies,
): Promise<PredeployValidationResult> {
  const entrypoints = readMichelsonEntrypoints(input.code);
  const checks = {
    hasParameterSection: hasMichelsonSection(input.code, 'parameter'),
    hasStorageSection: hasMichelsonSection(input.code, 'storage'),
    hasCodeSection: hasMichelsonSection(input.code, 'code'),
  };

  const issues: string[] = [];
  const warnings: string[] = [];

  if (!checks.hasParameterSection) {
    issues.push('Missing Michelson parameter section.');
  }
  if (!checks.hasStorageSection) {
    issues.push('Missing Michelson storage section.');
  }
  if (!checks.hasCodeSection) {
    issues.push('Missing Michelson code section.');
  }
  if (entrypoints.length === 0) {
    warnings.push(
      'No annotated entrypoints were detected. Dynamic rig actions may be limited.',
    );
  }

  let injectedCode = input.code;
  try {
    injectedCode = injectKilnTokens(input.code, dependencies.env);
  } catch (error) {
    warnings.push(`Kiln token injection check skipped: ${asMessage(error)}`);
  }

  let estimate: OriginationValidationResult | null = null;
  try {
    const tezosService = dependencies.createTezosService('A');
    estimate = await tezosService.validateOrigination(
      injectedCode,
      input.initialStorage,
    );
  } catch (error) {
    const message = asMessage(error);
    if (message.includes('Secret key for Wallet')) {
      warnings.push(`RPC origination estimate skipped: ${message}`);
    } else {
      issues.push(`Origination estimate failed: ${message}`);
    }
  }

  return {
    success: true,
    valid: issues.length === 0,
    issues,
    warnings,
    entrypoints,
    injectedCode,
    estimate,
    checks,
  };
}
