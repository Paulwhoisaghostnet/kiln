import { useState } from 'react';
import { FlaskConical, Gauge, Hammer, Rocket } from 'lucide-react';
import type { Abi, Hex } from 'viem';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { useKilnNetwork } from '../context/NetworkProvider';
import {
  connectEvmWallet,
  deployEvmContract,
  getConnectedEvmWallet,
  hasInjectedEvmProvider,
  type ConnectedEvmWallet,
} from '../lib/evm-wallet';

export interface SolidityCompileResult {
  success: boolean;
  networkId: string;
  entry: {
    name: string;
    abi: Abi;
    bytecode: Hex;
    deployedBytecode: Hex;
  } | null;
  contracts: Array<{ name: string }>;
  findings: Array<{
    severity: 'error' | 'warning' | 'info';
    formattedMessage?: string;
    message: string;
    sourceLocation?: { start: number; end: number } | null;
  }>;
  audit: {
    findings: Array<{
      id: string;
      severity: 'error' | 'warning' | 'info';
      title: string;
      description: string;
    }>;
    score: number;
  };
  solcVersion: string;
}

export interface SolidityEstimate {
  gasLimit: string;
  baseFeePerGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  maxWeiCost: string;
  maxXtzCost: string;
}

interface SolidityPanelProps {
  source: string;
  onSourceChange: (next: string) => void;
  buildHeaders: (includeJson?: boolean) => HeadersInit;
  onLog: (message: string, type?: 'info' | 'error' | 'success') => void;
  onDeployed?: (info: {
    contractAddress: Hex;
    transactionHash: Hex;
    networkId: string;
  }) => void;
}

function encodeConstructor(abi: Abi, args: unknown[]): Hex {
  const ctor = abi.find(
    (entry): entry is Abi[number] & { type: 'constructor' } =>
      'type' in entry && entry.type === 'constructor',
  );
  if (!ctor || !('inputs' in ctor) || !ctor.inputs || ctor.inputs.length === 0) {
    return '0x';
  }

  const types = ctor.inputs.map((input) => input.type).join(',');
  const params = parseAbiParameters(types);
  const encoded = encodeAbiParameters(params, args as never);
  return encoded;
}

export function SolidityPanel({
  source,
  onSourceChange,
  buildHeaders,
  onLog,
  onDeployed,
}: SolidityPanelProps) {
  const { networkId, network } = useKilnNetwork();
  const [entryContractName, setEntryContractName] = useState('');
  const [constructorArgsJson, setConstructorArgsJson] = useState('[]');
  const [compileResult, setCompileResult] = useState<SolidityCompileResult | null>(null);
  const [estimate, setEstimate] = useState<SolidityEstimate | null>(null);
  const [evmWallet, setEvmWallet] = useState<ConnectedEvmWallet | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  const evmDetected = hasInjectedEvmProvider();

  const runCompile = async () => {
    if (!source.trim()) {
      onLog('Paste Solidity source before compiling.', 'error');
      return;
    }
    setIsCompiling(true);
    setEstimate(null);
    try {
      const res = await fetch('/api/kiln/evm/compile', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          networkId,
          source,
          entryContractName: entryContractName.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as SolidityCompileResult & { error?: string };
      if (!res.ok || payload.error) {
        throw new Error(payload.error ?? `solc compile failed (HTTP ${res.status})`);
      }
      setCompileResult(payload);
      // Bubble to the parent shell so the tab state tracks latest compile output.
      window.dispatchEvent(
        new CustomEvent('kiln:solidity:compiled', { detail: payload }),
      );
      if (payload.success && payload.entry) {
        onLog(
          `solc ${payload.solcVersion} compiled ${payload.entry.name}. Bytecode ${(payload.entry.bytecode.length - 2) / 2} bytes.`,
          'success',
        );
      } else {
        onLog(`Compile finished with errors: ${payload.findings.filter((f) => f.severity === 'error').length} error(s).`, 'error');
      }
      for (const finding of payload.findings) {
        onLog(`[${finding.severity}] ${finding.message}`, finding.severity === 'error' ? 'error' : 'info');
      }
      for (const audit of payload.audit.findings) {
        onLog(`[audit/${audit.severity}] ${audit.title}: ${audit.description}`, audit.severity === 'error' ? 'error' : 'info');
      }
    } catch (error) {
      onLog(
        `Solidity compile error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsCompiling(false);
    }
  };

  const getEncodedArgs = (): Hex | null => {
    if (!compileResult?.entry) {
      onLog('Compile a contract before estimating or deploying.', 'error');
      return null;
    }
    try {
      const parsed = JSON.parse(constructorArgsJson.trim() || '[]');
      if (!Array.isArray(parsed)) {
        throw new Error('Constructor args must be a JSON array.');
      }
      return encodeConstructor(compileResult.entry.abi, parsed);
    } catch (error) {
      onLog(
        `Constructor encoding error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
      return null;
    }
  };

  const runEstimate = async () => {
    if (!compileResult?.entry) {
      return;
    }
    const encoded = getEncodedArgs();
    if (encoded === null) {
      return;
    }
    setIsEstimating(true);
    try {
      const wallet = evmWallet ?? (await getConnectedEvmWallet(networkId));
      const from = wallet?.address;
      const res = await fetch('/api/kiln/evm/estimate', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          networkId,
          bytecode: compileResult.entry.bytecode,
          constructorArgs: encoded === '0x' ? undefined : encoded.slice(2),
          from,
        }),
      });
      const payload = (await res.json()) as {
        success: boolean;
        estimate?: SolidityEstimate;
        error?: string;
      };
      if (!res.ok || !payload.estimate) {
        throw new Error(payload.error ?? `Estimate failed (HTTP ${res.status})`);
      }
      setEstimate(payload.estimate);
      onLog(
        `Estimated gas ${payload.estimate.gasLimit} · max cost ${payload.estimate.maxXtzCost} ${network.nativeSymbol}.`,
        'info',
      );
    } catch (error) {
      onLog(
        `Estimate error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsEstimating(false);
    }
  };

  const runDryRun = async () => {
    if (!compileResult?.entry) {
      return;
    }
    const encoded = getEncodedArgs();
    if (encoded === null) {
      return;
    }
    setIsDryRunning(true);
    try {
      const res = await fetch('/api/kiln/evm/dry-run', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          networkId,
          bytecode: compileResult.entry.bytecode,
          constructorArgs: encoded === '0x' ? undefined : encoded.slice(2),
        }),
      });
      const payload = (await res.json()) as {
        success: boolean;
        dryRun?: { ok: boolean; reason?: string; runtimeBytecodeLength?: number };
        error?: string;
      };
      if (!res.ok || !payload.dryRun) {
        throw new Error(payload.error ?? `Dry-run failed (HTTP ${res.status})`);
      }
      if (payload.dryRun.ok) {
        onLog(
          `Dry-run OK · runtime bytecode ${payload.dryRun.runtimeBytecodeLength ?? '?'} bytes.`,
          'success',
        );
      } else {
        onLog(`Dry-run reverted: ${payload.dryRun.reason ?? 'unknown revert'}`, 'error');
      }
    } catch (error) {
      onLog(
        `Dry-run error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsDryRunning(false);
    }
  };

  const connectWallet = async () => {
    try {
      const wallet = await connectEvmWallet(networkId);
      setEvmWallet(wallet);
      onLog(`EVM wallet connected: ${wallet.address} (chainId ${wallet.chainId}).`, 'success');
    } catch (error) {
      onLog(
        `EVM connect error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    }
  };

  const runDeploy = async () => {
    if (!compileResult?.entry) {
      return;
    }
    const wallet = evmWallet ?? (await getConnectedEvmWallet(networkId));
    if (!wallet) {
      onLog('Connect an EVM wallet before deploying.', 'error');
      return;
    }
    let args: unknown[];
    try {
      const parsed = JSON.parse(constructorArgsJson.trim() || '[]');
      if (!Array.isArray(parsed)) {
        throw new Error('Constructor args must be a JSON array.');
      }
      args = parsed;
    } catch (error) {
      onLog(
        `Constructor args error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
      return;
    }

    setIsDeploying(true);
    onLog(`Submitting deploy to ${network.label} via wallet ${wallet.address}...`, 'info');
    try {
      const result = await deployEvmContract({
        networkId,
        bytecode: compileResult.entry.bytecode,
        abi: compileResult.entry.abi,
        constructorArgs: args,
      });
      onLog(
        `Deploy confirmed · ${result.contractAddress} (block ${result.blockNumber.toString()}).`,
        'success',
      );
      onLog(`Tx hash: ${result.transactionHash}`, 'info');
      onDeployed?.({
        contractAddress: result.contractAddress,
        transactionHash: result.transactionHash,
        networkId,
      });
    } catch (error) {
      onLog(
        `Deploy error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="label py-0">
            <span className="label-text text-xs uppercase tracking-wider">
              Entry contract name
            </span>
          </label>
          <input
            className="input input-sm input-bordered w-full font-mono"
            value={entryContractName}
            onChange={(event) => setEntryContractName(event.target.value)}
            placeholder="MyContract (optional)"
          />
        </div>
        <div className="space-y-1">
          <label className="label py-0">
            <span className="label-text text-xs uppercase tracking-wider">
              Constructor args (JSON)
            </span>
          </label>
          <input
            className="input input-sm input-bordered w-full font-mono"
            value={constructorArgsJson}
            onChange={(event) => setConstructorArgsJson(event.target.value)}
            placeholder='[] or ["0x...", 1000]'
          />
        </div>
      </div>

      <div>
        <label className="label py-0">
          <span className="label-text text-xs uppercase tracking-wider">Solidity source</span>
        </label>
        <textarea
          className="textarea textarea-bordered w-full font-mono text-xs h-56 bg-base-300/50"
          value={source}
          onChange={(event) => onSourceChange(event.target.value)}
          placeholder={`// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\ncontract MyContract {\n  uint256 public value;\n  constructor(uint256 initial) {\n    value = initial;\n  }\n}`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline gap-1"
          onClick={() => {
            void runCompile();
          }}
          disabled={isCompiling || !source.trim()}
          title="Runs solc-js server-side with the configured evmVersion + optimizer settings."
        >
          <Hammer className="w-4 h-4" />
          {isCompiling ? 'Compiling…' : 'Compile'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline gap-1"
          onClick={() => {
            void runEstimate();
          }}
          disabled={isEstimating || !compileResult?.entry}
          title="Asks the Etherlink node for a gas + fee estimate using the compiled bytecode."
        >
          <Gauge className="w-4 h-4" />
          {isEstimating ? 'Estimating…' : 'Estimate'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline gap-1"
          onClick={() => {
            void runDryRun();
          }}
          disabled={isDryRunning || !compileResult?.entry}
          title="Simulates the deploy (eth_call) to surface constructor reverts without spending gas."
        >
          <FlaskConical className="w-4 h-4" />
          {isDryRunning ? 'Dry-running…' : 'Dry-run'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary gap-1"
          onClick={() => {
            void runDeploy();
          }}
          disabled={isDeploying || !compileResult?.entry || !evmDetected}
          title={
            evmDetected
              ? 'Encodes deploy calldata and asks MetaMask to sign + send the transaction.'
              : 'Install MetaMask or a compatible EIP-1193 wallet to enable deploy.'
          }
        >
          <Rocket className="w-4 h-4" />
          {isDeploying ? 'Deploying…' : `Deploy to ${network.label}`}
        </button>
      </div>

      {evmDetected ? (
        <div className="text-xs flex items-center gap-2 flex-wrap">
          {evmWallet ? (
            <>
              <span className="badge badge-success badge-sm">Wallet connected</span>
              <span className="font-mono">{evmWallet.address}</span>
              <span className="opacity-60">· chain {evmWallet.chainId}</span>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => {
                void connectWallet();
              }}
            >
              Connect MetaMask
            </button>
          )}
        </div>
      ) : (
        <div className="alert alert-warning text-xs">
          <span>
            No EIP-1193 wallet detected. Install MetaMask or a compatible wallet to deploy.
          </span>
        </div>
      )}

      {compileResult ? (
        <div className="rounded-xl border border-base-300 bg-base-200/40 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              {compileResult.entry?.name ?? 'No entry contract'}
            </span>
            <span className="opacity-60">solc {compileResult.solcVersion}</span>
          </div>
          {compileResult.entry ? (
            <div className="font-mono break-all opacity-80">
              bytecode: {compileResult.entry.bytecode.slice(0, 66)}…
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="opacity-60">Audit score:</span>
            <span
              className={`badge badge-sm ${
                compileResult.audit.score >= 80
                  ? 'badge-success'
                  : compileResult.audit.score >= 60
                    ? 'badge-warning'
                    : 'badge-error'
              }`}
            >
              {compileResult.audit.score}/100
            </span>
            <span className="opacity-60">
              ({compileResult.audit.findings.length} findings)
            </span>
          </div>
        </div>
      ) : null}

      {estimate ? (
        <div className="rounded-xl border border-info/40 bg-info/5 p-3 text-xs font-mono space-y-0.5">
          <div>
            <span className="opacity-60">Gas limit:</span> {estimate.gasLimit}
          </div>
          <div>
            <span className="opacity-60">Max fee/gas (wei):</span> {estimate.maxFeePerGas}
          </div>
          <div>
            <span className="opacity-60">Priority fee/gas:</span>{' '}
            {estimate.maxPriorityFeePerGas}
          </div>
          <div>
            <span className="opacity-60">Max total cost:</span> {estimate.maxXtzCost}{' '}
            {network.nativeSymbol}
          </div>
        </div>
      ) : null}
    </div>
  );
}
