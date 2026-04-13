import React, { useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, Terminal, Upload, Wallet } from 'lucide-react';
import DynamicRig from './components/DynamicRig';
import GuidedContractBuilder from './components/GuidedContractBuilder';
import { KilnCopy, useKilnView } from './context/KilnViewProvider';
import {
  assignConnectedWalletAsAdmin,
  BURN_PLACEHOLDER_ADDRESS,
  connectShadownetWallet,
  disconnectShadownetWallet,
  getConnectedShadownetWallet,
  originateWithConnectedWallet,
  type WalletConnectTarget,
} from './lib/shadownet-wallet';
import type { AbiEntrypoint, WalletType } from './lib/types';

type LogType = 'info' | 'error' | 'success';
type DeployMode = 'connected' | 'puppet';
type ContractSourceType = 'michelson' | 'smartpy';

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

interface PreparedValidationResult extends PredeployValidationResponse {
  preparedCode: string;
  preparedInitialStorage: string;
  sourceType: ContractSourceType;
  clearanceId?: string;
  auditScore?: number;
  simulationPassed?: boolean;
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

interface SmartPyCompileResponse {
  success: boolean;
  scenario: string;
  michelson: string;
  initialStorage: string;
}

interface WorkflowRunResponse {
  success: boolean;
  sourceType: ContractSourceType;
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
    estimate: PredeployValidationResponse['estimate'];
  };
  audit: {
    passed: boolean;
    score: number;
    findings: Array<{
      id: string;
      severity: 'info' | 'warning' | 'error';
      title: string;
      description: string;
      recommendation?: string;
    }>;
  };
  simulation: {
    success: boolean;
    summary: {
      total: number;
      passed: number;
      failed: number;
    };
    warnings: string[];
  };
  clearance: {
    approved: boolean;
    record?: {
      id: string;
      createdAt: string;
      expiresAt: string;
    };
  };
}

interface BundleExportResponse {
  success: boolean;
  bundleId: string;
  exportDir: string;
  zipFileName: string;
  zipPath: string;
  downloadUrl: string;
}

interface SupportedNetwork {
  id: string;
  label: string;
  ecosystem: 'tezos' | 'etherlink';
  status: 'active' | 'planned';
  defaultRpcUrl: string;
}

interface NetworksResponse {
  success: boolean;
  active: {
    id: string;
    label: string;
    rpcUrl: string;
    ecosystem: 'tezos' | 'etherlink';
    status: 'active' | 'planned';
  };
  supported: SupportedNetwork[];
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

function looksLikeSmartPy(source: string): boolean {
  const normalized = source.toLowerCase();
  return (
    normalized.includes('import smartpy as sp') ||
    normalized.includes('@sp.module') ||
    normalized.includes('sp.contract') ||
    normalized.includes('@sp.entrypoint') ||
    normalized.includes('sp.add_compilation_target')
  );
}

function detectContractSourceType(
  source: string,
  fileName?: string,
): ContractSourceType {
  const lowerName = fileName?.toLowerCase() ?? '';

  if (
    lowerName.endsWith('.tz') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.michelson')
  ) {
    return 'michelson';
  }

  if (
    lowerName.endsWith('.smartpy') ||
    lowerName.endsWith('.sp') ||
    lowerName.endsWith('.py') ||
    lowerName.endsWith('.txt')
  ) {
    return looksLikeSmartPy(source) ? 'smartpy' : 'michelson';
  }

  return looksLikeSmartPy(source) ? 'smartpy' : 'michelson';
}

function hasMichelsonSectionLocal(
  code: string,
  section: 'parameter' | 'storage' | 'code',
): boolean {
  return new RegExp(`\\b${section}\\b`, 'i').test(code);
}

export default function App() {
  const { mode, setMode, t, tip } = useKilnView();
  const [michelsonCode, setMichelsonCode] = useState('');
  const [contractSourceType, setContractSourceType] =
    useState<ContractSourceType>('michelson');
  const [initialStorage, setInitialStorage] = useState('Unit');
  const [isDeploying, setIsDeploying] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const [isRunningE2E, setIsRunningE2E] = useState(false);
  const [isExportingBundle, setIsExportingBundle] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [deployMode, setDeployMode] = useState<DeployMode>('connected');
  const [contractAddress, setContractAddress] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [balances, setBalances] = useState<BalancesResponse | null>(null);
  const [balancesStatus, setBalancesStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [networkHealth, setNetworkHealth] = useState<
    'checking' | 'online' | 'offline'
  >('checking');
  const [activeNetwork, setActiveNetwork] = useState<NetworksResponse['active'] | null>(
    null,
  );
  const [supportedNetworks, setSupportedNetworks] = useState<SupportedNetwork[]>([]);
  const [abi, setAbi] = useState<AbiEntrypoint[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWalletState | null>(
    null,
  );
  /** When deploying with Beacon, substitute template admin address in storage with the connected wallet. */
  const [useConnectedWalletAsContractAdmin, setUseConnectedWalletAsContractAdmin] =
    useState(true);
  const [e2eEntrypoint, setE2EEntrypoint] = useState('');
  const [e2eArgs, setE2EArgs] = useState('[]');
  const [clearanceId, setClearanceId] = useState<string | null>(null);
  const [lastWorkflow, setLastWorkflow] = useState<WorkflowRunResponse | null>(null);

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
    void fetchNetworkCatalog();
    void fetchBalances();
    void hydrateConnectedWallet();
  }, []);

  useEffect(() => {
    if (!e2eEntrypoint && abi.length > 0) {
      setE2EEntrypoint(abi[0]?.name ?? '');
    }
  }, [abi, e2eEntrypoint]);

  useEffect(() => {
    setClearanceId(null);
  }, [michelsonCode, initialStorage, contractSourceType]);

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

  const fetchNetworkCatalog = async () => {
    try {
      const res = await fetch('/api/networks', {
        headers: buildHeaders(),
      });
      if (!res.ok) {
        return;
      }
      const payload = (await res.json()) as NetworksResponse;
      setActiveNetwork(payload.active);
      setSupportedNetworks(payload.supported);
    } catch {
      // Optional metadata for UX only.
    }
  };

  const fetchBalances = async () => {
    setBalancesStatus('loading');
    setBalancesError(null);
    try {
      const res = await fetch('/api/kiln/balances', {
        headers: buildHeaders(),
      });
      const text = await res.text();
      let parsed: unknown = {};
      try {
        parsed = text ? (JSON.parse(text) as unknown) : {};
      } catch {
        parsed = {};
      }

      if (!res.ok) {
        const body = parsed as { error?: string };
        const message =
          res.status === 401
            ? 'Bert/Ernie balances: unauthorized (401). If the API uses API_AUTH_TOKEN, rebuild the site with VITE_API_TOKEN set to the same value in Netlify (Environment variables → same value for Builds and Functions). Vite only inlines VITE_* at build time.'
            : (body.error ??
              `Bert/Ernie balances: request failed (HTTP ${res.status}).`);
        setBalances(null);
        setBalancesStatus('error');
        setBalancesError(message);
        addLog(message, 'error');
        return;
      }

      const data = parsed as BalancesResponse;
      setBalances(data);
      setBalancesStatus('ready');
      setBalancesError(null);
    } catch (error) {
      const message = `Bert/Ernie balances: ${error instanceof Error ? error.message : 'network or parse error'}`;
      console.error('Failed to fetch balances', error);
      setBalances(null);
      setBalancesStatus('error');
      setBalancesError(message);
      addLog(message, 'error');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const loadedSource = String(loadEvent.target?.result ?? '');
      const detectedType = detectContractSourceType(loadedSource, file.name);
      setContractSourceType(detectedType);
      setMichelsonCode(loadedSource);
      addLog(
        `Loaded file: ${file.name} (${detectedType === 'smartpy' ? 'SmartPy source' : 'Michelson source'})`,
        'info',
      );
    };
    reader.readAsText(file);
  };

  const openContractFilePicker = () => {
    contractUploadInputRef.current?.click();
  };

  const applyGuidedMichelsonDraft = (code: string, storage: string) => {
    setContractSourceType('michelson');
    setMichelsonCode(code);
    setInitialStorage(storage);
    setAbi([]);
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

  const downloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportCurrentSource = () => {
    if (!michelsonCode.trim()) {
      addLog('No contract source available to export.', 'error');
      return;
    }
    const extension = contractSourceType === 'smartpy' ? 'py' : 'tz';
    downloadTextFile(`kiln-source.${extension}`, michelsonCode);
    addLog(`Exported current contract source as kiln-source.${extension}.`, 'success');
  };

  const exportLatestMichelson = () => {
    if (!lastWorkflow?.artifacts.michelson) {
      addLog('No compiled Michelson available yet. Run workflow first.', 'error');
      return;
    }
    downloadTextFile('kiln-compiled.tz', lastWorkflow.artifacts.michelson);
    addLog('Exported compiled Michelson as kiln-compiled.tz.', 'success');
  };

  const exportMainnetBundle = async () => {
    const workflow = lastWorkflow;
    if (!workflow) {
      addLog('Run full workflow before exporting a mainnet-ready bundle.', 'error');
      return;
    }

    setIsExportingBundle(true);
    addLog('Building mainnet-ready zip bundle from latest workflow artifacts...', 'info');
    try {
      const response = await fetch('/api/kiln/export/bundle', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          projectName: contractAddress
            ? `Kiln-${contractAddress.slice(0, 8)}`
            : 'Kiln Contract',
          sourceType: workflow.sourceType,
          source: michelsonCode,
          compiledMichelson: workflow.artifacts.michelson,
          initialStorage: workflow.artifacts.initialStorage,
          workflow,
          audit: workflow.audit,
          simulation: workflow.simulation,
          deployment: {
            networkId: activeNetwork?.id,
            rpcUrl: activeNetwork?.rpcUrl,
            contractAddress: contractAddress || undefined,
            originatedAt: contractAddress ? new Date().toISOString() : undefined,
          },
        }),
      });
      const payload = (await response.json()) as BundleExportResponse | { error?: string };
      if (!response.ok || !('downloadUrl' in payload)) {
        throw new Error(
          'error' in payload && payload.error
            ? payload.error
            : 'Bundle export failed',
        );
      }

      const zipResponse = await fetch(payload.downloadUrl, {
        headers: buildHeaders(),
      });
      if (!zipResponse.ok) {
        throw new Error(`Bundle export created but download failed (${zipResponse.status}).`);
      }
      const blob = await zipResponse.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = payload.zipFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      addLog(`Bundle exported: ${payload.zipFileName}`, 'success');
      addLog(`Export directory: ${payload.exportDir}`, 'info');
    } catch (error) {
      addLog(
        `Bundle export error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsExportingBundle(false);
    }
  };

  const runPredeployValidation = async (): Promise<PreparedValidationResult | null> => {
    if (!michelsonCode.trim()) {
      addLog('Please upload or paste contract source first.', 'error');
      return null;
    }

    setIsValidating(true);
    setIsRunningWorkflow(true);
    addLog('Running full workflow: compile -> validate -> audit -> simulate...', 'info');

    try {
      let simulationArgs: unknown[] = [];
      try {
        simulationArgs = safeParseJsonArray(e2eArgs);
      } catch {
        simulationArgs = [];
      }

      const simulationEntrypoint = e2eEntrypoint.trim();
      const simulationSteps = simulationEntrypoint
        ? [
            {
              label: 'Bert simulation',
              wallet: 'bert',
              entrypoint: simulationEntrypoint,
              args: simulationArgs,
            },
            {
              label: 'Ernie simulation',
              wallet: 'ernie',
              entrypoint: simulationEntrypoint,
              args: simulationArgs,
            },
          ]
        : [];

      const res = await fetch('/api/kiln/workflow/run', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          sourceType: contractSourceType,
          source: michelsonCode,
          initialStorage: initialStorage.trim() || undefined,
          simulationSteps,
        }),
      });

      const payload = (await res.json()) as WorkflowRunResponse | { error?: string };
      if (!res.ok || !('artifacts' in payload)) {
        throw new Error(
          'error' in payload && payload.error
            ? payload.error
            : 'Workflow validation failed',
        );
      }

      setLastWorkflow(payload);
      const parsedEntrypoints: AbiEntrypoint[] = payload.artifacts.entrypoints.map((name) => ({
        name,
        args: [],
      }));
      setAbi(parsedEntrypoints);

      if (payload.compile.performed) {
        addLog(
          `SmartPy compiled successfully${payload.compile.scenario ? ` (scenario ${payload.compile.scenario})` : ''}.`,
          'success',
        );
      }

      for (const warning of payload.compile.warnings) {
        addLog(`Compile warning: ${warning}`, 'info');
      }

      if (payload.validate.issues.length > 0) {
        for (const issue of payload.validate.issues) {
          addLog(`Validation issue: ${issue}`, 'error');
        }
      }
      for (const warning of payload.validate.warnings) {
        addLog(`Validation warning: ${warning}`, 'info');
      }
      if (payload.validate.estimate) {
        addLog(
          `Estimate -> gas ${payload.validate.estimate.gasLimit}, storage ${payload.validate.estimate.storageLimit}.`,
          'info',
        );
      }

      addLog(
        `Audit score ${payload.audit.score}/100 (${payload.audit.findings.length} findings).`,
        payload.audit.passed ? 'success' : 'error',
      );
      for (const finding of payload.audit.findings.slice(0, 6)) {
        addLog(`[${finding.severity}] ${finding.title}: ${finding.description}`, finding.severity === 'error' ? 'error' : 'info');
      }
      for (const warning of payload.simulation.warnings) {
        addLog(`Simulation warning: ${warning}`, 'info');
      }
      addLog(
        `Simulation ${payload.simulation.summary.passed}/${payload.simulation.summary.total} passed.`,
        payload.simulation.success ? 'success' : 'error',
      );

      if (payload.clearance.approved && payload.clearance.record?.id) {
        setClearanceId(payload.clearance.record.id);
        addLog(
          `Deployment clearance granted (${payload.clearance.record.id}).`,
          'success',
        );
      } else {
        setClearanceId(null);
        addLog('Deployment clearance not granted. Fix findings before deploy.', 'error');
      }

      const preparedInitialStorage = payload.artifacts.initialStorage;
      if (preparedInitialStorage && preparedInitialStorage !== initialStorage) {
        setInitialStorage(preparedInitialStorage);
      }

      return {
        success: true,
        valid:
          payload.validate.passed &&
          payload.audit.passed &&
          payload.simulation.success,
        issues: payload.validate.issues,
        warnings: [
          ...payload.validate.warnings,
          ...payload.simulation.warnings,
        ],
        entrypoints: parsedEntrypoints,
        injectedCode: payload.artifacts.michelson,
        estimate: payload.validate.estimate,
        checks: {
          hasParameterSection: hasMichelsonSectionLocal(payload.artifacts.michelson, 'parameter'),
          hasStorageSection: hasMichelsonSectionLocal(payload.artifacts.michelson, 'storage'),
          hasCodeSection: hasMichelsonSectionLocal(payload.artifacts.michelson, 'code'),
        },
        preparedCode: payload.artifacts.michelson,
        preparedInitialStorage,
        sourceType: payload.sourceType,
        clearanceId: payload.clearance.record?.id,
        auditScore: payload.audit.score,
        simulationPassed: payload.simulation.success,
      };
    } catch (error) {
      addLog(
        `Workflow error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
      return null;
    } finally {
      setIsValidating(false);
      setIsRunningWorkflow(false);
    }
  };

  const deployWithPuppetWallet = async (
    validation: PreparedValidationResult,
  ) => {
    const res = await fetch('/api/kiln/upload', {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({
        code: validation.preparedCode,
        wallet: 'A',
        initialStorage: validation.preparedInitialStorage,
        clearanceId: validation.clearanceId ?? clearanceId ?? undefined,
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
    validation: PreparedValidationResult,
  ) => {
    if (!connectedWallet) {
      throw new Error('Connect a shadownet wallet before deploying with user wallet mode.');
    }

    const storageForDeployment = useConnectedWalletAsContractAdmin
      ? assignConnectedWalletAsAdmin(
          validation.preparedInitialStorage,
          connectedWallet.address,
        )
      : validation.preparedInitialStorage;

    if (
      useConnectedWalletAsContractAdmin &&
      storageForDeployment === validation.preparedInitialStorage
    ) {
      addLog(
        `No template admin address (${BURN_PLACEHOLDER_ADDRESS}) in initial storage; deploying with your Micheline unchanged.`,
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
    if (!validation.clearanceId) {
      addLog('Deployment blocked: workflow clearance missing.', 'error');
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
            <KilnCopy k="headerTagline" as="p" className="text-base-content/60 mt-1" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="join join-horizontal shrink-0">
              <button
                type="button"
                title={tip('viewModeBuilder')}
                className={`btn btn-xs join-item ${mode === 'builder' ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                onClick={() => setMode('builder')}
              >
                {t('viewModeBuilder')}
              </button>
              <button
                type="button"
                title={tip('viewModeEli5')}
                className={`btn btn-xs join-item ${mode === 'eli5' ? 'btn-secondary' : 'btn-ghost border border-base-300'}`}
                onClick={() => setMode('eli5')}
              >
                {t('viewModeEli5')}
              </button>
            </div>
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
              <span className="text-sm font-medium">
                {activeNetwork?.label ?? 'Network'} {networkHealth}
              </span>
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

        <section className="bg-base-100 p-4 rounded-2xl shadow-lg border border-base-200 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-base-content/70">
                <KilnCopy k="networkArchTitle" />
              </h2>
              <KilnCopy k="networkArchBody" as="p" className="text-xs text-base-content/60" />
            </div>
            {activeNetwork ? (
              <div className="text-xs font-mono text-base-content/70">
                Active: {activeNetwork.id} ({activeNetwork.rpcUrl})
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {supportedNetworks.map((network) => (
              <span
                key={network.id}
                className={`badge badge-sm ${
                  network.status === 'active' ? 'badge-success' : 'badge-outline'
                }`}
              >
                {network.label} · {network.status}
              </span>
            ))}
          </div>
        </section>

        <section className="bg-base-100 p-6 rounded-2xl shadow-lg border border-base-200 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">
                <KilnCopy k="deploymentTitle" />
              </h2>
              <KilnCopy k="deploymentBody" as="p" className="text-sm text-base-content/60" />
            </div>
            <div className="join">
              <button
                title={tip('deployModeConnected')}
                className={`btn btn-sm join-item ${deployMode === 'connected' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDeployMode('connected')}
              >
                {t('deployModeConnected')}
              </button>
              <button
                title={tip('deployModePuppet')}
                className={`btn btn-sm join-item ${deployMode === 'puppet' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDeployMode('puppet')}
              >
                {t('deployModePuppet')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p
                className={`text-sm font-semibold ${mode === 'eli5' && tip('connectWalletHeading') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
                title={mode === 'eli5' ? tip('connectWalletHeading') : undefined}
              >
                {mode === 'builder'
                  ? `Connect ${activeNetwork?.label ?? 'Shadownet'} Wallet (Beacon)`
                  : `${t('connectWalletHeading')} (${activeNetwork?.label ?? 'Shadownet'})`}
              </p>
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
              <KilnCopy
                k="kukaiNote"
                as="p"
                className="text-xs text-base-content/60"
              >
                {mode === 'builder' ? (
                  <>
                    Kukai users: keep Kukai opened on{' '}
                    <span className="font-mono">shadownet.kukai.app</span> before approving.
                  </>
                ) : (
                  <>
                    {t('kukaiNote')}{' '}
                    <span className="font-mono">shadownet.kukai.app</span>
                  </>
                )}
              </KilnCopy>
            </div>

            <div className="space-y-2">
              <p
                className={`text-sm font-semibold ${mode === 'eli5' && tip('connectedWalletHeading') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
                title={mode === 'eli5' ? tip('connectedWalletHeading') : undefined}
              >
                {t('connectedWalletHeading')}
              </p>
              {connectedWallet ? (
                <div className="text-xs space-y-1 font-mono">
                  <div>Address: {connectedWallet.address}</div>
                  <div>Network: {connectedWallet.networkName ?? 'unknown'}</div>
                  <div>RPC: {connectedWallet.rpcUrl ?? 'unknown'}</div>
                </div>
              ) : (
                <KilnCopy k="noWalletConnected" as="p" className="text-xs text-base-content/60" />
              )}
              <label className="label cursor-pointer items-start gap-3 py-1">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm mt-0.5"
                  checked={useConnectedWalletAsContractAdmin}
                  onChange={(event) => setUseConnectedWalletAsContractAdmin(event.target.checked)}
                />
                <span className="label-text text-xs space-y-1 block">
                  <KilnCopy
                    k="adminCheckboxTitle"
                    as="span"
                    className="font-medium text-base-content block"
                  />
                  <KilnCopy
                    k="adminCheckboxDetail"
                    as="span"
                    className="block text-base-content/60 leading-snug"
                  >
                    {mode === 'builder' ? (
                      <>
                        Only for <strong>Deploy with Connected Wallet</strong>. Compiled Kiln token
                        storage leaves a fixed <span className="font-medium">admin</span> address in
                        the Micheline; with this on, that address is replaced by your Beacon{' '}
                        <span className="font-mono">tz1…</span> before origination so your wallet holds
                        admin. Uncheck if you already set admin yourself. Match is literal:{' '}
                        <code className="text-[0.65rem] bg-base-200 px-1 rounded">
                          {BURN_PLACEHOLDER_ADDRESS}
                        </code>
                      </>
                    ) : (
                      <>
                        {t('adminCheckboxDetail')}{' '}
                        <code className="text-[0.65rem] bg-base-200 px-1 rounded">
                          {BURN_PLACEHOLDER_ADDRESS}
                        </code>
                      </>
                    )}
                  </KilnCopy>
                </span>
              </label>
            </div>
          </div>
        </section>

        <section className="bg-base-100 p-4 rounded-2xl shadow-lg border border-base-200 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-base-content/70">
                <KilnCopy k="workflowGateTitle" />
              </h2>
              <KilnCopy k="workflowGateLine1" as="p" className="text-xs text-base-content/60" />
              <KilnCopy k="workflowGateLine2" as="p" className="text-xs text-base-content/50" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                title={tip('runFullWorkflow')}
                className="btn btn-xs btn-outline"
                onClick={() => {
                  void runPredeployValidation();
                }}
                disabled={isRunningWorkflow || isDeploying || !michelsonCode.trim()}
              >
                {isRunningWorkflow ? 'Running…' : t('runFullWorkflow')}
              </button>
              <button
                title={tip('exportSource')}
                className="btn btn-xs btn-outline"
                onClick={exportCurrentSource}
                disabled={!michelsonCode.trim()}
              >
                {t('exportSource')}
              </button>
              <button
                title={tip('exportMichelson')}
                className="btn btn-xs btn-outline"
                onClick={exportLatestMichelson}
                disabled={!lastWorkflow?.artifacts.michelson}
              >
                {t('exportMichelson')}
              </button>
              <button
                title={tip('exportMainnetBundle')}
                className="btn btn-xs btn-outline"
                onClick={() => {
                  void exportMainnetBundle();
                }}
                disabled={!lastWorkflow || isExportingBundle}
              >
                {isExportingBundle ? 'Bundling…' : t('exportMainnetBundle')}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span
              title={
                clearanceId ? tip('clearedForDeployment') ?? undefined : tip('notCleared') ?? undefined
              }
              className={`badge badge-sm ${
                clearanceId ? 'badge-success' : 'badge-warning'
              }`}
            >
              {clearanceId ? t('clearedForDeployment') : t('notCleared')}
            </span>
            {clearanceId ? <span className="font-mono">{clearanceId}</span> : null}
            {lastWorkflow ? (
              <span className="text-base-content/60">
                Audit: {lastWorkflow.audit.score}/100 · Simulation:{' '}
                {lastWorkflow.simulation.summary.passed}/{lastWorkflow.simulation.summary.total}
              </span>
            ) : null}
          </div>
        </section>

        {balancesStatus === 'error' && balancesError ? (
          <div className="alert alert-error text-sm" role="alert">
            <span>{balancesError}</span>
          </div>
        ) : null}

        <KilnCopy
          k="bertErnieNearWallets"
          as="p"
          className={`text-xs mt-1 ${mode === 'builder' ? 'text-warning' : 'text-base-content/80'}`}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['A', 'B'] as const).map((wallet) => {
            const wData = balances?.[`wallet${wallet}`];
            const label = puppetWalletLabels[wallet];
            const addressLabel =
              balancesStatus === 'ready' && wData?.address
                ? wData.address
                : balancesStatus === 'loading'
                  ? 'Loading…'
                  : 'Unavailable';
            const balanceReady =
              balancesStatus === 'ready' && typeof wData?.balance === 'number';
            return (
              <div key={wallet} className="bg-base-100 p-6 rounded-2xl shadow-lg border border-base-200 flex items-center gap-4">
                <div className={`p-4 rounded-xl ${wallet === 'A' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                  <Wallet className="w-8 h-8" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="text-lg font-bold">{label}</h3>
                  <KilnCopy
                    k={wallet === 'A' ? 'bertWalletSubtitle' : 'ernieWalletSubtitle'}
                    as="p"
                    className="text-xs text-base-content/50"
                  />
                  <p className="text-sm text-base-content/60 font-mono truncate">{addressLabel}</p>
                </div>
                <div className="text-right min-h-[2.5rem] flex flex-col items-end justify-center">
                  {balancesStatus === 'loading' ? (
                    <span className="loading loading-spinner loading-md text-primary" aria-label="Loading balance" />
                  ) : (
                    <div className="text-2xl font-bold font-mono">
                      {balanceReady ? wData.balance.toFixed(2) : '—'}
                    </div>
                  )}
                  <div className="text-xs text-base-content/50 uppercase tracking-wider">XTZ</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <GuidedContractBuilder
              buildHeaders={buildHeaders}
              onApplyMichelsonDraft={applyGuidedMichelsonDraft}
              onLog={addLog}
            />

            <div className="bg-base-100 rounded-2xl shadow-lg border border-base-200 overflow-hidden flex flex-col h-[620px]">
              <div className="p-4 border-b border-base-200 flex justify-between items-center bg-base-200/50">
                <h2 className="font-bold flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  <KilnCopy k="contractInjectorTitle" />
                </h2>
                <div className="flex items-center gap-2">
                  <div className="join">
                    <button
                      title={tip('michelsonModeBtn')}
                      className={`btn btn-xs join-item ${
                        contractSourceType === 'michelson' ? 'btn-primary' : 'btn-outline'
                      }`}
                      onClick={() => setContractSourceType('michelson')}
                    >
                      {t('michelsonModeBtn')}
                    </button>
                    <button
                      title={tip('smartpyModeBtn')}
                      className={`btn btn-xs join-item ${
                        contractSourceType === 'smartpy' ? 'btn-primary' : 'btn-outline'
                      }`}
                      onClick={() => setContractSourceType('smartpy')}
                    >
                      {t('smartpyModeBtn')}
                    </button>
                  </div>
                  <label className="btn btn-sm btn-outline btn-primary" title={tip('uploadSource')}>
                    {t('uploadSource')}
                    <input
                      ref={contractUploadInputRef}
                      type="file"
                      accept=".tz,.json,.smartpy,.sp,.py,.txt,.md"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>
              </div>
              <div className="p-4 border-b border-base-200 bg-base-100">
                <label className="label py-1">
                  <span
                    className={`label-text text-xs uppercase tracking-wider ${mode === 'eli5' && tip('initialStorageLabel') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
                    title={mode === 'eli5' ? tip('initialStorageLabel') : undefined}
                  >
                    {t('initialStorageLabel')}
                  </span>
                </label>
                <input
                  className="input input-bordered w-full font-mono"
                  value={initialStorage}
                  onChange={(event) => setInitialStorage(event.target.value)}
                  placeholder='Ex: Unit or Pair "tz1..." 100'
                />
                <KilnCopy k="smartpyHelpBlurb" as="p" className="text-[0.7rem] text-base-content/60 mt-1">
                  {mode === 'builder' ? (
                    <>
                      SmartPy sources can be loaded from <span className="font-mono">.py</span>,{' '}
                      <span className="font-mono">.smartpy</span>, <span className="font-mono">.sp</span>, or{' '}
                      <span className="font-mono">.txt</span> files. The workflow compiles SmartPy to Michelson
                      server-side when SmartPy mode is active or auto-detected.
                    </>
                  ) : (
                    <>{t('smartpyHelpBlurb')}</>
                  )}
                </KilnCopy>
              </div>
              <div className="flex-1 p-4">
                <textarea
                  className="textarea textarea-bordered w-full h-full font-mono text-sm resize-none bg-base-300/50 focus:bg-base-300 transition-colors"
                  placeholder={
                    contractSourceType === 'smartpy'
                      ? t('placeholderSmartpy')
                      : t('placeholderMichelson')
                  }
                  value={michelsonCode}
                  onChange={(event) => {
                    const source = event.target.value;
                    setMichelsonCode(source);
                    setContractSourceType(detectContractSourceType(source));
                  }}
                  onDoubleClick={openContractFilePicker}
                />
              </div>
              <div className="p-4 border-t border-base-200 bg-base-200/50 flex flex-col md:flex-row gap-3">
                <button
                  title={tip('runWorkflowTests')}
                  className="btn btn-outline md:flex-1"
                  onClick={() => {
                    void runPredeployValidation();
                  }}
                  disabled={isValidating || isRunningWorkflow || isDeploying || !michelsonCode.trim()}
                >
                  {isRunningWorkflow ? <span className="loading loading-spinner" /> : t('runWorkflowTests')}
                </button>
                <button
                  title={
                    deployMode === 'connected'
                      ? tip('deployWithConnected') ?? undefined
                      : tip('deployWithBert') ?? undefined
                  }
                  className="btn btn-primary md:flex-1"
                  onClick={handleDeploy}
                  disabled={
                    isDeploying ||
                    isValidating ||
                    isRunningWorkflow ||
                    !michelsonCode.trim() ||
                    !clearanceId
                  }
                >
                  {isDeploying ? (
                    <span className="loading loading-spinner" />
                  ) : deployMode === 'connected' ? (
                    t('deployWithConnected')
                  ) : (
                    t('deployWithBert')
                  )}
                </button>
              </div>
            </div>

            <div className="bg-neutral rounded-2xl shadow-lg overflow-hidden h-[300px] flex flex-col border border-neutral-focus">
              <div className="bg-neutral-focus p-3 flex items-center gap-2 border-b border-black/20">
                <Terminal className="w-4 h-4 text-neutral-content/50" />
                <span
                  className={`text-xs font-mono text-neutral-content/70 uppercase tracking-wider ${mode === 'eli5' && tip('kilnTerminalLabel') ? 'cursor-help underline decoration-dotted decoration-neutral-content/40 underline-offset-2' : ''}`}
                  title={mode === 'eli5' ? tip('kilnTerminalLabel') : undefined}
                >
                  {t('kilnTerminalLabel')}
                </span>
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
                <KilnCopy k="dynamicRigTitle" />
              </h2>
              <div className="space-y-2">
                <label className="label py-0">
                  <span
                    className={`label-text text-xs uppercase tracking-wider ${mode === 'eli5' && tip('e2eEntrypointLabel') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
                    title={mode === 'eli5' ? tip('e2eEntrypointLabel') : undefined}
                  >
                    {t('e2eEntrypointLabel')}
                  </span>
                </label>
                <input
                  className="input input-sm input-bordered w-full font-mono"
                  value={e2eEntrypoint}
                  onChange={(event) => setE2EEntrypoint(event.target.value)}
                  placeholder="Ex: transfer"
                />
                <label className="label py-0">
                  <span
                    className={`label-text text-xs uppercase tracking-wider ${mode === 'eli5' && tip('e2eArgsLabel') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
                    title={mode === 'eli5' ? tip('e2eArgsLabel') : undefined}
                  >
                    {t('e2eArgsLabel')}
                  </span>
                </label>
                <input
                  className="input input-sm input-bordered w-full font-mono"
                  value={e2eArgs}
                  onChange={(event) => setE2EArgs(event.target.value)}
                  placeholder='Ex: [] or ["tz1...", "1"]'
                />
                <button
                  title={tip('runBertErnieE2e')}
                  className="btn btn-sm btn-secondary w-full"
                  onClick={runPostDeployE2E}
                  disabled={isRunningE2E || !contractAddress}
                >
                  {isRunningE2E ? <span className="loading loading-spinner" /> : t('runBertErnieE2e')}
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
