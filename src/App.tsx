import React, { useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, Terminal, Upload, Wallet } from 'lucide-react';
import DynamicRig from './components/DynamicRig';
import {
  assignConnectedWalletAsAdmin,
  connectShadownetWallet,
  disconnectShadownetWallet,
  getConnectedShadownetWallet,
  originateWithConnectedWallet,
  type WalletConnectTarget,
} from './lib/shadownet-wallet';
import type { AbiEntrypoint, WalletType } from './lib/types';

type LogType = 'info' | 'error' | 'success';
type DeployMode = 'connected' | 'puppet';

interface LogEntry {
  time: string;
  msg: string;
  type: LogType;
}

interface WalletBalance {
  address: string;
  balance: number;
}

interface BalancesResponse {
  walletA: WalletBalance;
  walletB: WalletBalance;
}

interface UploadResponse {
  success: boolean;
  contractAddress: string;
  injectedCode: string;
  entrypoints: AbiEntrypoint[];
}

interface ExecuteResponse {
  success: boolean;
  hash: string;
  level: number;
}

interface PredeployValidationResponse {
  success: boolean;
  valid: boolean;
  issues: string[];
  warnings: string[];
  entrypoints: AbiEntrypoint[];
  injectedCode: string;
  estimate: {
    gasLimit: number;
    storageLimit: number;
    suggestedFeeMutez: number;
    minimalFeeMutez: number;
  } | null;
  checks: {
    hasParameterSection: boolean;
    hasStorageSection: boolean;
    hasCodeSection: boolean;
  };
}

interface E2ERunResponse {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  results: Array<{
    label: string;
    wallet: WalletType;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number;
    error?: string;
  }>;
}

interface ConnectedWalletState {
  address: string;
  networkName: string | null;
  rpcUrl: string | null;
  target: WalletConnectTarget;
}

const puppetWalletLabels: Record<WalletType, string> = {
  A: 'Bert',
  B: 'Ernie',
};

function getApiToken(): string | undefined {
  const raw = import.meta.env.VITE_API_TOKEN;
  if (!raw) {
    return undefined;
  }
  const value = String(raw).trim();
  return value.length > 0 ? value : undefined;
}

function safeParseJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('E2E args must be a JSON array, for example: [] or ["42"].');
  }

  return parsed;
}

export default function App() {
  const [michelsonCode, setMichelsonCode] = useState('');
  const [initialStorage, setInitialStorage] = useState('Unit');
  const [isDeploying, setIsDeploying] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRunningE2E, setIsRunningE2E] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [deployMode, setDeployMode] = useState<DeployMode>('connected');
  const [contractAddress, setContractAddress] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [balances, setBalances] = useState<BalancesResponse | null>(null);
  const [networkHealth, setNetworkHealth] = useState<
    'checking' | 'online' | 'offline'
  >('checking');
  const [abi, setAbi] = useState<AbiEntrypoint[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWalletState | null>(
    null,
  );
  const [assignAdminToConnectedWallet, setAssignAdminToConnectedWallet] =
    useState(true);
  const [e2eEntrypoint, setE2EEntrypoint] = useState('');
  const [e2eArgs, setE2EArgs] = useState('[]');

  const logsEndRef = useRef<HTMLDivElement>(null);
  const contractUploadInputRef = useRef<HTMLInputElement>(null);
  const apiToken = getApiToken();

  const buildHeaders = (includeJson = false): HeadersInit => {
    const headers: Record<string, string> = {};
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (apiToken) {
      headers['x-api-token'] = apiToken;
    }
    return headers;
  };

  const addLog = (msg: string, type: LogType = 'info') => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    void checkHealth();
    void fetchBalances();
    void hydrateConnectedWallet();
  }, []);

  useEffect(() => {
    if (!e2eEntrypoint && abi.length > 0) {
      setE2EEntrypoint(abi[0]?.name ?? '');
    }
  }, [abi, e2eEntrypoint]);

  const hydrateConnectedWallet = async () => {
    try {
      const wallet = await getConnectedShadownetWallet();
      if (!wallet) {
        setConnectedWallet(null);
        return;
      }
      setConnectedWallet({ ...wallet, target: 'temple' });
    } catch {
      setConnectedWallet(null);
    }
  };

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      setNetworkHealth(res.ok ? 'online' : 'offline');
    } catch {
      setNetworkHealth('offline');
    }
  };

  const fetchBalances = async () => {
    try {
      const res = await fetch('/api/kiln/balances', {
        headers: buildHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as BalancesResponse;
        setBalances(data);
      }
    } catch (error) {
      console.error('Failed to fetch balances', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setMichelsonCode(String(loadEvent.target?.result ?? ''));
      addLog(`Loaded file: ${file.name}`, 'info');
    };
    reader.readAsText(file);
  };

  const openContractFilePicker = () => {
    contractUploadInputRef.current?.click();
  };

  const connectWallet = async (target: WalletConnectTarget) => {
    setIsConnectingWallet(true);
    addLog(
      target === 'kukai'
        ? 'Opening Kukai Shadownet and requesting Beacon permissions...'
        : 'Opening Temple wallet and requesting Beacon permissions...',
      'info',
    );

    try {
      const wallet = await connectShadownetWallet(target);
      setConnectedWallet({ ...wallet, target });
      addLog(`Connected wallet ${wallet.address} on shadownet.`, 'success');
    } catch (error) {
      addLog(
        `Wallet connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnectShadownetWallet();
      setConnectedWallet(null);
      addLog('Disconnected connected wallet session.', 'info');
    } catch (error) {
      addLog(
        `Wallet disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    }
  };

  const runPredeployValidation = async (): Promise<PredeployValidationResponse | null> => {
    if (!michelsonCode.trim()) {
      addLog('Please upload or paste Michelson code first.', 'error');
      return null;
    }

    if (!initialStorage.trim()) {
      addLog('Please provide explicit initial storage.', 'error');
      return null;
    }

    setIsValidating(true);
    addLog('Running pre-deployment validation suite...', 'info');

    try {
      const res = await fetch('/api/kiln/predeploy/validate', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ code: michelsonCode, initialStorage }),
      });

      const payload = (await res.json()) as PredeployValidationResponse | { error?: string };
      if (!res.ok || !('valid' in payload)) {
        throw new Error(
          'error' in payload && payload.error
            ? payload.error
            : 'Pre-deployment validation failed',
        );
      }

      setAbi(payload.entrypoints);

      if (payload.issues.length > 0) {
        for (const issue of payload.issues) {
          addLog(`Pre-deploy issue: ${issue}`, 'error');
        }
      }

      if (payload.warnings.length > 0) {
        for (const warning of payload.warnings) {
          addLog(`Pre-deploy warning: ${warning}`, 'info');
        }
      }

      if (payload.estimate) {
        addLog(
          `Pre-deploy estimate -> gas ${payload.estimate.gasLimit}, storage ${payload.estimate.storageLimit}.`,
          'info',
        );
      }

      if (payload.valid) {
        addLog('Pre-deployment validation passed.', 'success');
      } else {
        addLog('Pre-deployment validation failed; deployment blocked.', 'error');
      }

      return payload;
    } catch (error) {
      addLog(
        `Pre-deploy validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
      return null;
    } finally {
      setIsValidating(false);
    }
  };

  const deployWithPuppetWallet = async (
    validation: PredeployValidationResponse,
  ) => {
    const res = await fetch('/api/kiln/upload', {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({
        code: michelsonCode,
        wallet: 'A',
        initialStorage,
      }),
    });

    const payload = (await res.json()) as UploadResponse | { error?: string };
    if (!res.ok || !('contractAddress' in payload)) {
      throw new Error(
        'error' in payload && payload.error ? payload.error : 'Deployment failed',
      );
    }

    setContractAddress(payload.contractAddress);
    setAbi(validation.entrypoints);
    addLog(`Contract deployed with puppet wallet Bert at ${payload.contractAddress}`, 'success');
  };

  const deployWithConnectedWallet = async (
    validation: PredeployValidationResponse,
  ) => {
    if (!connectedWallet) {
      throw new Error('Connect a shadownet wallet before deploying with user wallet mode.');
    }

    const storageForDeployment = assignAdminToConnectedWallet
      ? assignConnectedWalletAsAdmin(initialStorage, connectedWallet.address)
      : initialStorage;

    if (assignAdminToConnectedWallet && storageForDeployment === initialStorage) {
      addLog(
        'No admin placeholder found in storage. Ensure storage admin is set to your wallet manually if needed.',
        'info',
      );
    }

    const result = await originateWithConnectedWallet(
      validation.injectedCode,
      storageForDeployment,
    );

    setContractAddress(result.contractAddress);
    setAbi(validation.entrypoints);
    addLog(
      `Contract deployed from connected wallet ${connectedWallet.address} at ${result.contractAddress}`,
      'success',
    );
    addLog(`Origination hash: ${result.hash}`, 'info');
  };

  const handleDeploy = async () => {
    const validation = await runPredeployValidation();
    if (!validation || !validation.valid) {
      return;
    }

    setIsDeploying(true);
    try {
      if (deployMode === 'connected') {
        await deployWithConnectedWallet(validation);
      } else {
        await deployWithPuppetWallet(validation);
      }
      void fetchBalances();
    } catch (error) {
      addLog(
        `Deployment error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsDeploying(false);
    }
  };

  const handleExecute = async (
    entrypoint: string,
    args: unknown[],
    wallet: WalletType,
  ) => {
    addLog(
      `Executing ${entrypoint} with puppet wallet ${puppetWalletLabels[wallet]}...`,
      'info',
    );
    try {
      const res = await fetch('/api/kiln/execute', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ contractAddress, entrypoint, args, wallet }),
      });

      const payload = (await res.json()) as ExecuteResponse | { error?: string };
      if (!res.ok || !('hash' in payload) || !('level' in payload)) {
        throw new Error(
          'error' in payload && payload.error ? payload.error : 'Execution failed',
        );
      }

      addLog(`Execution successful! Hash: ${payload.hash} (Block: ${payload.level})`, 'success');
      void fetchBalances();
    } catch (error) {
      addLog(
        `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    }
  };

  const runPostDeployE2E = async () => {
    if (!contractAddress.trim()) {
      addLog('Deploy a contract before running Bert/Ernie E2E tests.', 'error');
      return;
    }

    const selectedEntrypoint = e2eEntrypoint.trim() || abi[0]?.name;
    if (!selectedEntrypoint) {
      addLog('Choose an entrypoint for Bert/Ernie E2E testing.', 'error');
      return;
    }

    let parsedArgs: unknown[] = [];
    try {
      parsedArgs = safeParseJsonArray(e2eArgs);
    } catch (error) {
      addLog(
        `Invalid E2E args JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
      return;
    }

    setIsRunningE2E(true);
    addLog(`Running post-deployment E2E using Bert and Ernie on ${selectedEntrypoint}...`, 'info');

    try {
      const res = await fetch('/api/kiln/e2e/run', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          contractAddress,
          steps: [
            {
              label: 'Bert step',
              wallet: 'A',
              entrypoint: selectedEntrypoint,
              args: parsedArgs,
            },
            {
              label: 'Ernie step',
              wallet: 'B',
              entrypoint: selectedEntrypoint,
              args: parsedArgs,
            },
          ],
        }),
      });

      const payload = (await res.json()) as E2ERunResponse | { error?: string };
      if (!res.ok || !('summary' in payload)) {
        throw new Error(
          'error' in payload && payload.error ? payload.error : 'E2E run failed',
        );
      }

      for (const result of payload.results) {
        if (result.status === 'passed') {
          addLog(
            `${result.label} passed (${result.wallet}) hash ${result.hash}`,
            'success',
          );
        } else {
          addLog(
            `${result.label} failed (${result.wallet}): ${result.error ?? 'Unknown error'}`,
            'error',
          );
        }
      }

      addLog(
        `E2E summary: ${payload.summary.passed}/${payload.summary.total} passed.`,
        payload.success ? 'success' : 'error',
      );
    } catch (error) {
      addLog(
        `E2E test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsRunningE2E(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-300 text-base-content p-4 md:p-8 font-sans" data-theme="dark">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-base-100 p-6 rounded-2xl shadow-lg border border-base-200">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent flex items-center gap-3">
              <Activity className="w-8 h-8 text-primary" />
              Tezos Kiln
            </h1>
            <p className="text-base-content/60 mt-1">
              Pre-deploy validation + live deployment + Bert/Ernie E2E on shadownet.
            </p>
            <p className="text-xs text-warning mt-1">
              Bert and Ernie are puppet wallets controlled by the test suite.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  networkHealth === 'online'
                    ? 'bg-success'
                    : networkHealth === 'checking'
                      ? 'bg-warning animate-pulse'
                      : 'bg-error'
                }`}
              />
              <span className="text-sm font-medium">Shadownet {networkHealth}</span>
            </div>
            <button
              onClick={fetchBalances}
              className="btn btn-ghost btn-sm btn-circle"
              aria-label="Refresh balances"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <section className="bg-base-100 p-6 rounded-2xl shadow-lg border border-base-200 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Deployment Control</h2>
              <p className="text-sm text-base-content/60">
                Deploy from your connected wallet (admin-safe) or with puppet wallet Bert.
              </p>
            </div>
            <div className="join">
              <button
                className={`btn btn-sm join-item ${deployMode === 'connected' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDeployMode('connected')}
              >
                Connected Wallet
              </button>
              <button
                className={`btn btn-sm join-item ${deployMode === 'puppet' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDeployMode('puppet')}
              >
                Puppet Wallet (Bert)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Connect Shadownet Wallet (Beacon)</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => connectWallet('temple')}
                  disabled={isConnectingWallet}
                >
                  Connect Temple
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => connectWallet('kukai')}
                  disabled={isConnectingWallet}
                >
                  Connect Kukai (shadownet.kukai.app)
                </button>
                <button className="btn btn-sm btn-ghost" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </div>
              <p className="text-xs text-base-content/60">
                Kukai users: keep Kukai opened on <span className="font-mono">shadownet.kukai.app</span> before approving.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Connected Wallet Status</p>
              {connectedWallet ? (
                <div className="text-xs space-y-1 font-mono">
                  <div>Address: {connectedWallet.address}</div>
                  <div>Network: {connectedWallet.networkName ?? 'unknown'}</div>
                  <div>RPC: {connectedWallet.rpcUrl ?? 'unknown'}</div>
                </div>
              ) : (
                <p className="text-xs text-base-content/60">No wallet connected yet.</p>
              )}
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={assignAdminToConnectedWallet}
                  onChange={(event) => setAssignAdminToConnectedWallet(event.target.checked)}
                />
                <span className="label-text text-xs">
                  Replace burn placeholder in storage with connected wallet address
                </span>
              </label>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['A', 'B'] as const).map((wallet) => {
            const wData = balances?.[`wallet${wallet}`];
            const label = puppetWalletLabels[wallet];
            return (
              <div key={wallet} className="bg-base-100 p-6 rounded-2xl shadow-lg border border-base-200 flex items-center gap-4">
                <div className={`p-4 rounded-xl ${wallet === 'A' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                  <Wallet className="w-8 h-8" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="text-lg font-bold">{label}</h3>
                  <p className="text-xs text-base-content/50">Puppet wallet</p>
                  <p className="text-sm text-base-content/60 font-mono truncate">{wData?.address ?? 'Loading...'}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono">
                    {typeof wData?.balance === 'number' ? wData.balance.toFixed(2) : '0.00'}
                  </div>
                  <div className="text-xs text-base-content/50 uppercase tracking-wider">XTZ</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-base-100 rounded-2xl shadow-lg border border-base-200 overflow-hidden flex flex-col h-[620px]">
              <div className="p-4 border-b border-base-200 flex justify-between items-center bg-base-200/50">
                <h2 className="font-bold flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Contract Injector
                </h2>
                <label className="btn btn-sm btn-outline btn-primary">
                  Upload .tz
                  <input
                    ref={contractUploadInputRef}
                    type="file"
                    accept=".tz,.json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
              <div className="p-4 border-b border-base-200 bg-base-100">
                <label className="label py-1">
                  <span className="label-text text-xs uppercase tracking-wider">Initial Storage</span>
                </label>
                <input
                  className="input input-bordered w-full font-mono"
                  value={initialStorage}
                  onChange={(event) => setInitialStorage(event.target.value)}
                  placeholder='Ex: Unit or Pair "tz1..." 100'
                />
              </div>
              <div className="flex-1 p-4">
                <textarea
                  className="textarea textarea-bordered w-full h-full font-mono text-sm resize-none bg-base-300/50 focus:bg-base-300 transition-colors"
                  placeholder="Paste Michelson code here, upload a file, or double-click to open file picker..."
                  value={michelsonCode}
                  onChange={(event) => setMichelsonCode(event.target.value)}
                  onDoubleClick={openContractFilePicker}
                />
              </div>
              <div className="p-4 border-t border-base-200 bg-base-200/50 flex flex-col md:flex-row gap-3">
                <button
                  className="btn btn-outline md:flex-1"
                  onClick={() => {
                    void runPredeployValidation();
                  }}
                  disabled={isValidating || isDeploying || !michelsonCode.trim()}
                >
                  {isValidating ? <span className="loading loading-spinner" /> : 'Run Pre-Deploy Tests'}
                </button>
                <button
                  className="btn btn-primary md:flex-1"
                  onClick={handleDeploy}
                  disabled={isDeploying || isValidating || !michelsonCode.trim()}
                >
                  {isDeploying ? (
                    <span className="loading loading-spinner" />
                  ) : deployMode === 'connected' ? (
                    'Deploy with Connected Wallet'
                  ) : (
                    'Inject & Deploy with Bert'
                  )}
                </button>
              </div>
            </div>

            <div className="bg-neutral rounded-2xl shadow-lg overflow-hidden h-[300px] flex flex-col border border-neutral-focus">
              <div className="bg-neutral-focus p-3 flex items-center gap-2 border-b border-black/20">
                <Terminal className="w-4 h-4 text-neutral-content/50" />
                <span className="text-xs font-mono text-neutral-content/70 uppercase tracking-wider">Kiln Terminal</span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2">
                {logs.length === 0 && <div className="text-neutral-content/30 italic">Waiting for operations...</div>}
                {logs.map((log, index) => (
                  <div key={`${log.time}-${index}`} className="flex gap-3">
                    <span className="text-neutral-content/40 shrink-0">[{log.time}]</span>
                    <span
                      className={`
                        ${log.type === 'error' ? 'text-error' : ''}
                        ${log.type === 'success' ? 'text-success' : ''}
                        ${log.type === 'info' ? 'text-info' : ''}
                      `}
                    >
                      {log.msg}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>

          <div className="bg-base-100 rounded-2xl shadow-lg border border-base-200 flex flex-col h-[944px]">
            <div className="p-4 border-b border-base-200 bg-base-200/50 space-y-3">
              <h2 className="font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-secondary" />
                Dynamic Test Rig
              </h2>
              <div className="space-y-2">
                <label className="label py-0">
                  <span className="label-text text-xs uppercase tracking-wider">Post-deploy E2E Entrypoint</span>
                </label>
                <input
                  className="input input-sm input-bordered w-full font-mono"
                  value={e2eEntrypoint}
                  onChange={(event) => setE2EEntrypoint(event.target.value)}
                  placeholder="Ex: transfer"
                />
                <label className="label py-0">
                  <span className="label-text text-xs uppercase tracking-wider">Args (JSON Array)</span>
                </label>
                <input
                  className="input input-sm input-bordered w-full font-mono"
                  value={e2eArgs}
                  onChange={(event) => setE2EArgs(event.target.value)}
                  placeholder='Ex: [] or ["tz1...", "1"]'
                />
                <button
                  className="btn btn-sm btn-secondary w-full"
                  onClick={runPostDeployE2E}
                  disabled={isRunningE2E || !contractAddress}
                >
                  {isRunningE2E ? <span className="loading loading-spinner" /> : 'Run Bert + Ernie E2E'}
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <DynamicRig contractAddress={contractAddress} abi={abi} onExecute={handleExecute} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
