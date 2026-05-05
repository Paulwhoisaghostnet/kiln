import type { Hex } from 'viem';

/**
 * Server-side Solidity compiler. Wraps `solc` — the official Solidity
 * compiler distributed as a Node package (wasm binary under the hood). We
 * load it lazily so the frontend bundle never touches it, and so startup
 * time stays fast.
 *
 * Supported compiler version: whatever `solc` in package.json pins. As of
 * the initial Etherlink support pass, that's 0.8.x latest — change the
 * package.json pin if you need a different minor.
 */

export interface SolidityFinding {
  severity: 'info' | 'warning' | 'error';
  /** Source path and line when available (solc's `formattedMessage`). */
  location?: string;
  message: string;
}

export interface CompiledContract {
  name: string;
  /** Deployable creation bytecode, hex-prefixed. */
  bytecode: Hex;
  /** Runtime bytecode returned by the constructor. Useful for size sanity-checks. */
  deployedBytecode: Hex;
  /** Parsed ABI — what the client will use to encode constructor args + call methods. */
  abi: unknown[];
  /** Optional metadata hash from solc for contract verification. */
  metadata?: string;
}

export interface SolidityCompileResult {
  /** True when a deployable `CompiledContract` was produced. False when every entry is abstract or compile failed outright. */
  success: boolean;
  /** All compiled contracts in topological order solc returned them. */
  contracts: CompiledContract[];
  /** The deploy target — chosen by `entryContractName` or last-defined. */
  entry?: CompiledContract;
  /** Parsed diagnostics from solc. Errors block deploy; warnings pass through. */
  findings: SolidityFinding[];
  /** Exact solc version string used for this compile. */
  solcVersion: string;
}

export interface SolidityCompileInput {
  source: string;
  /** Pick a specific contract by name. If omitted we take the last one defined. */
  entryContractName?: string;
  evmVersion?:
    | 'paris'
    | 'shanghai'
    | 'cancun'
    | 'london'
    | 'berlin'
    | 'istanbul';
  optimizer?: boolean;
  optimizerRuns?: number;
}

let cachedSolc: SolcInstance | null = null;

interface SolcInstance {
  compile(input: string): string;
  version?: () => string;
}

async function loadSolc(): Promise<SolcInstance> {
  if (cachedSolc) {
    return cachedSolc;
  }
  // solc's CJS entry throws warnings under native ESM, so we always go through
  // `createRequire`. We purposefully avoid `import.meta.url` here because the
  // server bundle is emitted as CJS (where `import.meta.url` is empty) and that
  // would blow up `createRequire` at runtime. Instead we anchor the resolver to
  // the current working directory, which resolves `solc` from `node_modules/`
  // in every supported deployment topology.
  const { createRequire } = await import('node:module');
  const anchor = `${process.cwd().replace(/\/?$/, '/')}package.json`;
  const require = createRequire(anchor);
  const solc = require('solc') as SolcInstance;
  cachedSolc = solc;
  return solc;
}

interface SolcStandardOutput {
  errors?: Array<{
    severity: 'info' | 'warning' | 'error';
    formattedMessage?: string;
    message: string;
    sourceLocation?: { file?: string; start?: number; end?: number };
  }>;
  contracts?: Record<
    string,
    Record<
      string,
      {
        evm?: {
          bytecode?: { object?: string };
          deployedBytecode?: { object?: string };
        };
        abi?: unknown[];
        metadata?: string;
      }
    >
  >;
}

export async function compileSolidity(
  input: SolidityCompileInput,
): Promise<SolidityCompileResult> {
  const solc = await loadSolc();

  const standardInput = {
    language: 'Solidity',
    sources: {
      'Contract.sol': { content: input.source },
    },
    settings: {
      optimizer: {
        enabled: input.optimizer ?? true,
        runs: input.optimizerRuns ?? 200,
      },
      evmVersion: input.evmVersion ?? 'shanghai',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'],
        },
      },
    },
  };

  const rawOutput = solc.compile(JSON.stringify(standardInput));
  const parsed: SolcStandardOutput = JSON.parse(rawOutput);

  const findings: SolidityFinding[] = (parsed.errors ?? []).map((entry) => ({
    severity: entry.severity,
    location: entry.sourceLocation?.file,
    message: entry.formattedMessage?.trim() ?? entry.message,
  }));

  const hasError = findings.some((finding) => finding.severity === 'error');

  const contracts: CompiledContract[] = [];
  for (const [file, byName] of Object.entries(parsed.contracts ?? {})) {
    for (const [name, artifact] of Object.entries(byName)) {
      const bytecodeRaw = artifact.evm?.bytecode?.object;
      const deployedRaw = artifact.evm?.deployedBytecode?.object;
      if (!bytecodeRaw) {
        continue;
      }
      if (!/^[0-9a-fA-F]*$/.test(bytecodeRaw)) {
        continue;
      }

      contracts.push({
        name: `${name} (${file})`,
        bytecode: `0x${bytecodeRaw}` as Hex,
        deployedBytecode: deployedRaw ? (`0x${deployedRaw}` as Hex) : ('0x' as Hex),
        abi: artifact.abi ?? [],
        metadata: artifact.metadata,
      });
    }
  }

  // Filter to contracts with actual bytecode (abstract/libraries compile empty).
  const deployable = contracts.filter((c) => c.bytecode.length > 2);

  let entry: CompiledContract | undefined;
  if (input.entryContractName) {
    const needleRaw = input.entryContractName ?? '';
    const needle = needleRaw.trim().toLowerCase();
    entry = deployable.find((c) => (c.name ?? '').toLowerCase().startsWith(`${needle} `))
      ?? deployable.find((c) => (c.name ?? '').toLowerCase().includes(needle));
  }
  if (!entry && deployable.length > 0) {
    entry = deployable[deployable.length - 1];
  }

  return {
    success: !hasError && Boolean(entry),
    contracts,
    entry,
    findings,
    solcVersion: solc.version?.() ?? 'unknown',
  };
}

/**
 * Lightweight static audit of Solidity source. NOT a substitute for Slither /
 * professional audit — this is a "did you leave obvious landmines?" pass.
 * Used in the pre-deploy workflow so users get early feedback before they
 * ever hit the user's browser wallet.
 */
export interface SolidityAuditFinding {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  recommendation?: string;
}

export function auditSoliditySource(source: string): SolidityAuditFinding[] {
  const findings: SolidityAuditFinding[] = [];
  const lines = source.split('\n');

  const hasTxOrigin = /\btx\.origin\b/.test(source);
  if (hasTxOrigin) {
    findings.push({
      id: 'tx-origin',
      severity: 'warning',
      title: 'Use of tx.origin',
      description:
        'tx.origin is vulnerable to phishing via malicious intermediary contracts. Use msg.sender for authorization checks.',
      recommendation: 'Replace tx.origin with msg.sender unless you specifically need the original EOA.',
    });
  }

  const hasSelfdestruct = /\bselfdestruct\s*\(/.test(source);
  if (hasSelfdestruct) {
    findings.push({
      id: 'selfdestruct',
      severity: 'warning',
      title: 'selfdestruct used',
      description:
        'EIP-6780 changes selfdestruct semantics post-Cancun. Any value transfer is permanent; the contract code may not actually be cleared.',
      recommendation: 'Confirm selfdestruct behaviour is what you want on the target EVM version.',
    });
  }

  const hasDelegatecall = /\.delegatecall\s*\(/.test(source);
  if (hasDelegatecall) {
    findings.push({
      id: 'delegatecall',
      severity: 'warning',
      title: 'delegatecall usage detected',
      description:
        'delegatecall runs foreign code in the calling contract\'s storage context. A bug in the target can destroy this contract\'s state.',
      recommendation: 'Ensure the target address is immutable and points only to audited library code.',
    });
  }

  // Unchecked call returns are a classic drainer.
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/\.call\s*\(/.test(line) && !/success\s*=|require\s*\(\s*success/.test(line) && !/\/\//.test(line)) {
      findings.push({
        id: `unchecked-call-${i + 1}`,
        severity: 'warning',
        title: `Possible unchecked low-level call (line ${i + 1})`,
        description:
          'Low-level `.call(...)` returns (bool success, bytes memory data). If you don\'t check success, a silent failure can brick your logic.',
        recommendation: 'Capture the tuple and `require(success, "...")` or revert with a specific reason.',
      });
      break; // one is enough to nudge
    }
  }

  // No pragma is a maintainability smell, not an exploit, but worth flagging.
  const hasPragma = /^\s*pragma\s+solidity\b/m.test(source);
  if (!hasPragma) {
    findings.push({
      id: 'missing-pragma',
      severity: 'info',
      title: 'No pragma statement',
      description:
        'Every Solidity file should declare a compiler version pragma so bytecode reproduces across toolchains.',
      recommendation: 'Add `pragma solidity ^0.8.20;` (or your target version) at the top of each file.',
    });
  }

  const hasFloating = /^\s*pragma\s+solidity\s+\^/m.test(source);
  if (hasFloating) {
    findings.push({
      id: 'floating-pragma',
      severity: 'info',
      title: 'Floating pragma',
      description:
        'Using `^0.8.x` lets downstream builds pick any compatible compiler. For audited releases, pin to an exact version.',
      recommendation: 'For production, change `^0.8.20` to `0.8.20` (or your chosen release).',
    });
  }

  return findings;
}
