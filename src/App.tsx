import React, { useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, Terminal, Upload, Wallet } from 'lucide-react';
import DynamicRig from './components/DynamicRig';
import type { AbiEntrypoint, WalletType } from './lib/types';

type LogType = 'info' | 'error' | 'success';

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

function getApiToken(): string | undefined {
  const raw = import.meta.env.VITE_API_TOKEN;
  if (!raw) {
    return undefined;
  }
  const value = String(raw).trim();
  return value.length > 0 ? value : undefined;
}

export default function App() {
  const [michelsonCode, setMichelsonCode] = useState('');
  const [initialStorage, setInitialStorage] = useState('Unit');
  const [isDeploying, setIsDeploying] = useState(false);
  const [contractAddress, setContractAddress] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [balances, setBalances] = useState<BalancesResponse | null>(null);
  const [networkHealth, setNetworkHealth] = useState<
    'checking' | 'online' | 'offline'
  >('checking');
  const [abi, setAbi] = useState<AbiEntrypoint[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
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
  }, []);

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

  const handleDeploy = async () => {
    if (!michelsonCode.trim()) {
      addLog('Please upload or paste Michelson code first.', 'error');
      return;
    }

    if (!initialStorage.trim()) {
      addLog('Please provide explicit initial storage.', 'error');
      return;
    }

    setIsDeploying(true);
    addLog('Starting deployment process...', 'info');
    addLog('Running Kiln Injector token replacement...', 'info');

    try {
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

      const data = payload;
      setContractAddress(data.contractAddress);
      setAbi(data.entrypoints);
      addLog(`Contract deployed successfully at ${data.contractAddress}`, 'success');

      if (data.entrypoints.length === 0) {
        addLog('No entrypoints detected; check your contract parameter annotations.', 'info');
      }

      void fetchBalances();
    } catch (error) {
      addLog(`Deployment error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleExecute = async (
    entrypoint: string,
    args: unknown[],
    wallet: WalletType,
  ) => {
    addLog(`Executing ${entrypoint} with Wallet ${wallet}...`, 'info');
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

      const data = payload;
      addLog(`Execution successful! Hash: ${data.hash} (Block: ${data.level})`, 'success');
      void fetchBalances();
    } catch (error) {
      addLog(`Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
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
            <p className="text-base-content/60 mt-1">Automated E2E Testing Sandbox for Tezos</p>
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
            <button onClick={fetchBalances} className="btn btn-ghost btn-sm btn-circle" aria-label="Refresh balances">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['A', 'B'] as const).map((wallet) => {
            const wData = balances?.[`wallet${wallet}`];
            return (
              <div key={wallet} className="bg-base-100 p-6 rounded-2xl shadow-lg border border-base-200 flex items-center gap-4">
                <div className={`p-4 rounded-xl ${wallet === 'A' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                  <Wallet className="w-8 h-8" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="text-lg font-bold">Wallet {wallet}</h3>
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
            <div className="bg-base-100 rounded-2xl shadow-lg border border-base-200 overflow-hidden flex flex-col h-[560px]">
              <div className="p-4 border-b border-base-200 flex justify-between items-center bg-base-200/50">
                <h2 className="font-bold flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Contract Injector
                </h2>
                <label className="btn btn-sm btn-outline btn-primary">
                  Upload .tz
                  <input type="file" accept=".tz,.json" className="hidden" onChange={handleFileUpload} />
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
                  placeholder="Paste Michelson code here or upload a file..."
                  value={michelsonCode}
                  onChange={(event) => setMichelsonCode(event.target.value)}
                />
              </div>
              <div className="p-4 border-t border-base-200 bg-base-200/50">
                <button
                  className="btn btn-primary w-full"
                  onClick={handleDeploy}
                  disabled={isDeploying || !michelsonCode.trim()}
                >
                  {isDeploying ? <span className="loading loading-spinner" /> : 'Inject & Deploy to Shadownet'}
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

          <div className="bg-base-100 rounded-2xl shadow-lg border border-base-200 flex flex-col h-[884px]">
            <div className="p-4 border-b border-base-200 bg-base-200/50">
              <h2 className="font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-secondary" />
                Dynamic Test Rig
              </h2>
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
