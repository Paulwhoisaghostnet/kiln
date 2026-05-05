import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  FlaskConical,
  Globe,
  Hammer,
  KeyRound,
  Lock,
  Package,
  PlugZap,
  RefreshCw,
  Rocket,
  Settings,
  ShieldCheck,
  Terminal,
  TerminalSquare,
  Upload,
  Wallet,
} from 'lucide-react';
import DynamicRig from './components/DynamicRig';
import GuidedContractBuilder from './components/GuidedContractBuilder';
import { ProjectWorkspacePanel } from './components/ProjectWorkspacePanel';
import {
  MainnetConsentModal,
  NetworkStatusPill,
  NetworkSwitcher,
} from './components/NetworkSwitcher';
import type { SolidityCompileResult } from './components/SolidityPanel';
import {
  WorkflowResultsPanel,
  type WorkflowSummary,
} from './components/WorkflowResultsPanel';
import { KilnCopy, useKilnView } from './context/KilnViewProvider';
import { useKilnNetwork } from './context/NetworkProvider';
import type { EvmWalletTarget } from './lib/evm-wallet';
import type { WalletConnectTarget } from './lib/shadownet-wallet';
import type { AbiEntrypoint, WalletType } from './lib/types';
import { buildWorkflowDrivenE2ESteps } from './lib/workflow-discovery';

const SolidityPanel = React.lazy(() =>
  import('./components/SolidityPanel').then((module) => ({
    default: module.SolidityPanel,
  })),
);

const BURN_PLACEHOLDER_ADDRESS = 'tz1burnburnburnburnburnburnburjAYjjX';

type LogType = 'info' | 'error' | 'success';
type DeployMode = 'connected' | 'puppet';
type ContractSourceType = 'michelson' | 'smartpy' | 'solidity';

type TabKey = 'settings' | 'setup' | 'build' | 'validate' | 'deploy' | 'test' | 'handoff';

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
  walletA?: WalletBalance | null;
  walletB?: WalletBalance | null;
  error?: string;
  puppetsAvailable?: boolean;
  ecosystem?: 'tezos' | 'etherlink' | 'jstz';
  networkId?: string;
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
  level: number | null;
}

interface E2ERunResponse {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  coverage?: {
    passed: boolean;
    totalEntrypoints: number;
    coveredEntrypoints: number;
    missedEntrypoints: string[];
  };
  results: Array<{
    label: string;
    wallet: WalletType;
    entrypoint: string;
    status: 'passed' | 'failed';
    hash?: string;
    level?: number | null;
    error?: string;
  }>;
}

interface ConnectedWalletState {
  address: string;
  networkName: string | null;
  rpcUrl: string | null;
  target: WalletConnectTarget;
}

type KilnWalletKind = 'tezos' | 'evm';

interface KilnAuthUser {
  id: string;
  walletKind: KilnWalletKind;
  walletAddress: string;
  lastLoginNetworkId?: string;
  access: {
    status: 'none' | 'pending' | 'approved' | 'blocked';
    requestedAt?: string;
    checkedAt?: string;
    checkedBy?: string;
    reason?: string;
  };
  currentMcpToken?: {
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
  } | null;
}

interface KilnAuthSession {
  token: string;
  expiresAt: string;
  user: KilnAuthUser;
}

interface WorkflowRunResponse extends WorkflowSummary {
  success: boolean;
  sourceType: ContractSourceType;
  compile: { performed: boolean; scenario?: string; warnings: string[] };
  artifacts: {
    michelson: string;
    initialStorage: string;
    entrypoints: string[];
    codeHash: string;
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

const puppetWalletLabels: Record<WalletType, string> = { A: 'Bert', B: 'Ernie' };

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
    throw new Error('Args must be a JSON array, e.g. [] or ["42"].');
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

function looksLikeSolidity(source: string): boolean {
  const normalized = source.toLowerCase();
  return (
    normalized.includes('pragma solidity') ||
    normalized.includes('contract ') ||
    normalized.includes('// spdx-license-identifier')
  );
}

function detectContractSourceType(
  source: string,
  ecosystem: 'tezos' | 'etherlink' | 'jstz',
  fileName?: string,
): ContractSourceType {
  const lowerName = fileName?.toLowerCase() ?? '';
  if (ecosystem === 'etherlink' || lowerName.endsWith('.sol')) {
    return 'solidity';
  }
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
  if (looksLikeSolidity(source)) {
    return 'solidity';
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
  const { networkId, network, isTezos, isEvm, can, requestNetworkChange } = useKilnNetwork();

  const [michelsonCode, setMichelsonCode] = useState('');
  const [solidityCode, setSolidityCode] = useState('');
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
  const [balancesStatus, setBalancesStatus] = useState<
    'loading' | 'ready' | 'error' | 'unsupported'
  >('loading');
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [networkHealth, setNetworkHealth] = useState<
    'checking' | 'online' | 'offline'
  >('checking');
  const [abi, setAbi] = useState<AbiEntrypoint[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWalletState | null>(null);
  const [useConnectedWalletAsContractAdmin, setUseConnectedWalletAsContractAdmin] =
    useState(true);
  const [e2eEntrypoint, setE2EEntrypoint] = useState('');
  const [e2eArgs, setE2EArgs] = useState('[]');
  const [clearanceId, setClearanceId] = useState<string | null>(null);
  const [lastWorkflow, setLastWorkflow] = useState<WorkflowRunResponse | null>(null);
  const [lastSolidityCompile, setLastSolidityCompile] =
    useState<SolidityCompileResult | null>(null);
  const [authSession, setAuthSession] = useState<KilnAuthSession | null>(null);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [isMcpLoggingIn, setIsMcpLoggingIn] = useState(false);
  const [isRequestingMcpAccess, setIsRequestingMcpAccess] = useState(false);
  const [isGeneratingMcpToken, setIsGeneratingMcpToken] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') {
      return 'settings';
    }
    const hash = window.location.hash.replace('#', '');
    return isTabKey(hash) ? hash : 'settings';
  });
  const [terminalOpen, setTerminalOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.matchMedia('(min-width: 768px)').matches;
  });

  const logsEndRef = useRef<HTMLDivElement>(null);
  const contractUploadInputRef = useRef<HTMLInputElement>(null);
  const keepWorkflowAfterStorageSyncRef = useRef(false);
  const connectedWalletRef = useRef<ConnectedWalletState | null>(null);
  const suppressWalletSessionEndedLogRef = useRef(false);
  const apiToken = getApiToken();

  const buildHeaders = (includeJson = false): HeadersInit => {
    const headers: Record<string, string> = {};
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (apiToken) {
      headers['x-kiln-token'] = apiToken;
    }
    return headers;
  };

  const addLog = (msg: string, type: LogType = 'info') => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  const clearWalletSessionState = (message?: string) => {
    const hadWallet = Boolean(connectedWalletRef.current);
    connectedWalletRef.current = null;
    setConnectedWallet(null);
    setAuthSession(null);
    setMcpToken(null);
    if (message && hadWallet) {
      addLog(message, 'info');
    }
  };

  useEffect(() => {
    connectedWalletRef.current = connectedWallet;
  }, [connectedWallet]);

  // Scroll terminal to bottom on new logs.
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Sync the current tab with the URL hash so deep-links land on the right step.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.hash = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const handler = () => {
      const next = window.location.hash.replace('#', '');
      if (isTabKey(next)) {
        setActiveTab(next);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Initial probes — only health is network-independent. Balances are fetched per-network.
  useEffect(() => {
    void checkHealth();
    void hydrateConnectedWallet();
  }, []);

  // Every time the network changes, re-fetch balances and clear deploy state that
  // is network-specific. The clearance id is also invalidated because the workflow
  // runner generates network-bound ids.
  useEffect(() => {
    setClearanceId(null);
    setContractAddress('');
    setAbi([]);
    setLastWorkflow(null);
    setLastSolidityCompile(null);
    clearWalletSessionState();
    setBalances(null);
    void fetchBalances();
    void hydrateConnectedWallet();
    addLog(`Switched to ${network.label} (${network.ecosystem}).`, 'info');
  }, [networkId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isTezos) {
      return;
    }

    let disposed = false;
    let unsubscribe = () => {};
    void import('./lib/shadownet-wallet').then(({ subscribeToShadownetWalletSession }) => {
      if (disposed) {
        return;
      }
      unsubscribe = subscribeToShadownetWalletSession((session) => {
        if (!session || session.networkId !== networkId) {
          clearWalletSessionState(
            suppressWalletSessionEndedLogRef.current
              ? undefined
              : 'Wallet session ended or moved networks. Reconnect before signing.',
          );
          return;
        }
        const next = {
          address: session.address,
          networkName: session.networkName,
          rpcUrl: session.rpcUrl,
          target: 'beacon' as const,
        };
        connectedWalletRef.current = next;
        setConnectedWallet(next);
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [isTezos, networkId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the source type aligned with the ecosystem. Moving to EVM should switch
  // the Build tab into Solidity mode unless the user explicitly typed Solidity.
  useEffect(() => {
    if (isEvm && contractSourceType !== 'solidity') {
      setContractSourceType('solidity');
    } else if (isTezos && contractSourceType === 'solidity') {
      setContractSourceType('michelson');
    }
  }, [isEvm, isTezos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!e2eEntrypoint && abi.length > 0) {
      setE2EEntrypoint(abi[0]?.name ?? '');
    }
  }, [abi, e2eEntrypoint]);

  useEffect(() => {
    if (keepWorkflowAfterStorageSyncRef.current) {
      keepWorkflowAfterStorageSyncRef.current = false;
      return;
    }
    setClearanceId(null);
    setLastWorkflow(null);
  }, [michelsonCode, initialStorage, contractSourceType]);

  const hydrateConnectedWallet = async () => {
    if (!isTezos) {
      clearWalletSessionState();
      return;
    }
    try {
      const { getConnectedShadownetWallet } = await import('./lib/shadownet-wallet');
      const wallet = await getConnectedShadownetWallet(networkId);
      if (!wallet) {
        clearWalletSessionState();
        return;
      }
      const next = {
        address: wallet.address,
        networkName: wallet.networkName,
        rpcUrl: wallet.rpcUrl,
        target: 'beacon' as const,
      };
      connectedWalletRef.current = next;
      setConnectedWallet(next);
    } catch {
      clearWalletSessionState();
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
    if (!can('puppetWallets')) {
      setBalancesStatus('unsupported');
      setBalances(null);
      setBalancesError(null);
      return;
    }

    setBalancesStatus('loading');
    setBalancesError(null);
    try {
      const res = await fetch(`/api/kiln/balances?networkId=${networkId}`, {
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
            ? 'Bert/Ernie balances: unauthorized (401). Rebuild with VITE_API_TOKEN matching the server.'
            : (body.error ?? `Bert/Ernie balances: request failed (HTTP ${res.status}).`);
        setBalances(null);
        setBalancesStatus('error');
        setBalancesError(message);
        addLog(message, 'error');
        return;
      }

      const data = parsed as BalancesResponse;
      if (data.puppetsAvailable === false) {
        setBalances(null);
        setBalancesStatus('unsupported');
        setBalancesError(null);
        return;
      }
      setBalances(data);
      setBalancesStatus('ready');
      setBalancesError(null);
    } catch (error) {
      const message = `Bert/Ernie balances: ${
        error instanceof Error ? error.message : 'network or parse error'
      }`;
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
      const detectedType = detectContractSourceType(loadedSource, network.ecosystem, file.name);
      setContractSourceType(detectedType);
      if (detectedType === 'solidity') {
        setSolidityCode(loadedSource);
      } else {
        setMichelsonCode(loadedSource);
      }
      addLog(`Loaded file: ${file.name} (${detectedType}).`, 'info');
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

  const connectWallet = async () => {
    setIsConnectingWallet(true);
    addLog(`Requesting Beacon wallet permissions on ${network.label}...`, 'info');
    try {
      const { connectShadownetWallet } = await import('./lib/shadownet-wallet');
      const wallet = await connectShadownetWallet('beacon', networkId);
      const next = {
        address: wallet.address,
        networkName: wallet.networkName,
        rpcUrl: wallet.rpcUrl,
        target: 'beacon' as const,
      };
      connectedWalletRef.current = next;
      setConnectedWallet(next);
      addLog(`Connected wallet ${wallet.address} on ${network.label}.`, 'success');
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
    suppressWalletSessionEndedLogRef.current = true;
    try {
      const { disconnectShadownetWallet } = await import('./lib/shadownet-wallet');
      await disconnectShadownetWallet();
      clearWalletSessionState();
      addLog('Disconnected wallet session.', 'info');
    } catch (error) {
      addLog(
        `Wallet disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      suppressWalletSessionEndedLogRef.current = false;
    }
  };

  const sessionHeaders = (includeJson = false): HeadersInit => {
    const headers = buildHeaders(includeJson) as Record<string, string>;
    if (authSession?.token) {
      headers.authorization = `Bearer ${authSession.token}`;
    }
    return headers;
  };

  const startMcpWalletLogin = async (evmTarget: EvmWalletTarget = 'auto') => {
    setIsMcpLoggingIn(true);
    setMcpToken(null);
    try {
      let walletKind: KilnWalletKind;
      let walletAddress: string;
      let signature: string;
      let publicKey: string | undefined;

      if (isTezos) {
        if (!connectedWallet) {
          throw new Error('Connect a Tezos wallet on the Setup tab before requesting MCP access.');
        }
        walletKind = 'tezos';
        walletAddress = connectedWallet.address;
      } else {
        const { connectEvmWallet, getConnectedEvmWallet } = await import('./lib/evm-wallet');
        const wallet =
          (await getConnectedEvmWallet(networkId, evmTarget)) ??
          (await connectEvmWallet(networkId, evmTarget));
        walletKind = 'evm';
        walletAddress = wallet.address;
      }

      const challengeResponse = await fetch('/api/kiln/auth/challenge', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ walletKind, walletAddress, networkId }),
      });
      const challenge = (await challengeResponse.json()) as
        | {
            challengeId: string;
            message: string;
            messageBytes: string;
            error?: string;
          }
        | { error?: string };
      if (!challengeResponse.ok || !('challengeId' in challenge)) {
        throw new Error(challenge.error ?? 'Unable to create wallet login challenge.');
      }

      if (walletKind === 'tezos') {
        const { signKilnAuthChallenge } = await import('./lib/shadownet-wallet');
        const signed = await signKilnAuthChallenge(challenge.message, networkId);
        signature = signed.signature;
        publicKey = signed.publicKey;
      } else {
        const { signEvmAuthChallenge } = await import('./lib/evm-wallet');
        const signed = await signEvmAuthChallenge(challenge.message, networkId, evmTarget);
        signature = signed.signature;
      }

      const verifyResponse = await fetch('/api/kiln/auth/verify', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          signature,
          publicKey,
        }),
      });
      const verified = (await verifyResponse.json()) as
        | {
            sessionToken: string;
            expiresAt: string;
            user: KilnAuthUser;
            error?: string;
          }
        | { error?: string };
      if (!verifyResponse.ok || !('sessionToken' in verified)) {
        throw new Error(verified.error ?? 'Wallet login verification failed.');
      }

      setAuthSession({
        token: verified.sessionToken,
        expiresAt: verified.expiresAt,
        user: verified.user,
      });
      addLog(`Wallet ownership verified for Kiln account: ${verified.user.walletAddress}.`, 'success');
    } catch (error) {
      addLog(
        `Wallet verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsMcpLoggingIn(false);
    }
  };

  const requestMcpAccess = async () => {
    if (!authSession) {
      addLog('Wallet login is required before requesting MCP access.', 'error');
      return;
    }
    setIsRequestingMcpAccess(true);
    setMcpToken(null);
    try {
      const response = await fetch('/api/kiln/mcp/access/request', {
        method: 'POST',
        headers: sessionHeaders(true),
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as
        | { access: KilnAuthUser['access']; error?: string }
        | { error?: string };
      if ('access' in payload) {
        setAuthSession((prev) =>
          prev
            ? {
                ...prev,
                user: { ...prev.user, access: payload.access },
              }
            : prev,
        );
      }
      if (!response.ok || !('access' in payload) || payload.access.status !== 'approved') {
        throw new Error(payload.error ?? 'MCP access was not approved.');
      }
      addLog('MCP access approved by Kiln access worker.', 'success');
    } catch (error) {
      addLog(
        `MCP access request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsRequestingMcpAccess(false);
    }
  };

  const generateMcpToken = async () => {
    if (!authSession) {
      addLog('Wallet login is required before generating an MCP token.', 'error');
      return;
    }
    setIsGeneratingMcpToken(true);
    try {
      const response = await fetch('/api/kiln/mcp/token', {
        method: 'POST',
        headers: sessionHeaders(true),
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as
        | {
            token: string;
            expiresAt: string;
            user: KilnAuthUser;
            error?: string;
          }
        | { error?: string };
      if (!response.ok || !('token' in payload)) {
        throw new Error(payload.error ?? 'Unable to generate MCP token.');
      }
      setMcpToken(payload.token);
      setAuthSession((prev) =>
        prev
          ? {
              ...prev,
              user: payload.user,
            }
          : prev,
      );
      addLog(`MCP token generated; expires ${new Date(payload.expiresAt).toLocaleString()}.`, 'success');
    } catch (error) {
      addLog(
        `MCP token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsGeneratingMcpToken(false);
    }
  };

  const copyMcpToken = async () => {
    if (!mcpToken) {
      return;
    }
    try {
      await navigator.clipboard.writeText(mcpToken);
      addLog('MCP token copied to clipboard.', 'success');
    } catch {
      addLog('Clipboard copy failed. Select the token text manually.', 'error');
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

  const activeSourceForTezos = (): string => michelsonCode;

  const exportCurrentSource = () => {
    const source = isEvm ? solidityCode : activeSourceForTezos();
    if (!source.trim()) {
      addLog('No contract source to export.', 'error');
      return;
    }
    const extension = isEvm
      ? 'sol'
      : contractSourceType === 'smartpy'
        ? 'py'
        : 'tz';
    downloadTextFile(`kiln-source.${extension}`, source);
    addLog(`Exported source as kiln-source.${extension}.`, 'success');
  };

  const exportLatestMichelson = () => {
    if (!lastWorkflow?.artifacts.michelson) {
      addLog('No compiled Michelson available. Run the workflow first.', 'error');
      return;
    }
    downloadTextFile('kiln-compiled.tz', lastWorkflow.artifacts.michelson);
    addLog('Exported compiled Michelson as kiln-compiled.tz.', 'success');
  };

  const exportSolidityBytecode = () => {
    if (!lastSolidityCompile?.entry) {
      addLog('Compile Solidity first.', 'error');
      return;
    }
    const payload = {
      networkId,
      name: lastSolidityCompile.entry.name,
      abi: lastSolidityCompile.entry.abi,
      bytecode: lastSolidityCompile.entry.bytecode,
      deployedBytecode: lastSolidityCompile.entry.deployedBytecode,
      solcVersion: lastSolidityCompile.solcVersion,
    };
    downloadTextFile('kiln-solidity.json', JSON.stringify(payload, null, 2));
    addLog('Exported Solidity artifacts as kiln-solidity.json.', 'success');
  };

  const exportMainnetBundle = async () => {
    const workflow = lastWorkflow;
    if (!workflow) {
      addLog('Run the workflow before exporting a bundle.', 'error');
      return;
    }
    setIsExportingBundle(true);
    addLog('Building mainnet-ready bundle from latest workflow artifacts...', 'info');
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
            networkId: network.id,
            rpcUrl: network.defaultRpcUrl,
            contractAddress: contractAddress || undefined,
            originatedAt: contractAddress ? new Date().toISOString() : undefined,
          },
        }),
      });
      const payload = (await response.json()) as BundleExportResponse | { error?: string };
      if (!response.ok || !('downloadUrl' in payload)) {
        throw new Error(
          'error' in payload && payload.error ? payload.error : 'Bundle export failed',
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
    } catch (error) {
      addLog(
        `Bundle export error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsExportingBundle(false);
    }
  };

  const runTezosWorkflow = async (): Promise<WorkflowRunResponse | null> => {
    if (!michelsonCode.trim()) {
      addLog('Please paste or upload contract source before validating.', 'error');
      return null;
    }
    setIsValidating(true);
    setIsRunningWorkflow(true);
    addLog(`Running validation workflow on ${network.label}...`, 'info');
    try {
      let simulationArgs: unknown[] = [];
      try {
        simulationArgs = safeParseJsonArray(e2eArgs);
      } catch {
        simulationArgs = [];
      }
      const simulationEntrypoint = e2eEntrypoint.trim();
      const simulationSteps = simulationEntrypoint && abi.length === 0
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
          networkId,
          sourceType: contractSourceType === 'solidity' ? 'auto' : contractSourceType,
          source: michelsonCode,
          initialStorage: initialStorage.trim() || undefined,
          simulationSteps,
        }),
      });
      const payload = (await res.json()) as WorkflowRunResponse | { error?: string };
      if (!res.ok || !('artifacts' in payload)) {
        throw new Error(
          'error' in payload && payload.error ? payload.error : 'Workflow validation failed',
        );
      }
      setLastWorkflow(payload);
      const parsedEntrypoints: AbiEntrypoint[] = payload.artifacts.entrypoints.map((name) => ({
        name,
        args: [],
      }));
      setAbi(parsedEntrypoints);
      addLog(
        `Audit score ${payload.audit.score}/100 · Validation ${
          payload.validate.passed ? 'passed' : 'failed'
        }`,
        payload.audit.passed && payload.validate.passed ? 'success' : 'error',
      );
      if (payload.clearance.approved && payload.clearance.record?.id) {
        setClearanceId(payload.clearance.record.id);
        addLog(`Clearance granted: ${payload.clearance.record.id}`, 'success');
      } else {
        setClearanceId(null);
        addLog('Deployment clearance withheld — address findings above.', 'error');
      }
      const preparedInitialStorage = payload.artifacts.initialStorage;
      if (preparedInitialStorage && preparedInitialStorage !== initialStorage) {
        keepWorkflowAfterStorageSyncRef.current = true;
        setInitialStorage(preparedInitialStorage);
      }
      return payload;
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

  const deployTezosWithPuppet = async (workflow: WorkflowRunResponse) => {
    if (!can('puppetWallets')) {
      throw new Error(
        `Puppet wallets are disabled on ${network.label}. Use the connected wallet instead.`,
      );
    }
    const res = await fetch('/api/kiln/upload', {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({
        networkId,
        code: workflow.artifacts.michelson,
        wallet: 'A',
        initialStorage: workflow.artifacts.initialStorage,
        clearanceId: workflow.clearance.record?.id ?? clearanceId ?? undefined,
      }),
    });
    const payload = (await res.json()) as UploadResponse | { error?: string };
    if (!res.ok || !('contractAddress' in payload)) {
      throw new Error(
        'error' in payload && payload.error ? payload.error : 'Deployment failed',
      );
    }
    setContractAddress(payload.contractAddress);
    setAbi(payload.entrypoints);
    addLog(`Deployed via Bert: ${payload.contractAddress}`, 'success');
  };

  const deployTezosWithConnectedWallet = async (workflow: WorkflowRunResponse) => {
    if (!connectedWallet) {
      throw new Error('Connect a Tezos wallet before deploying.');
    }
    const verifiedWallet =
      authSession?.user.walletKind === 'tezos' &&
      authSession.user.lastLoginNetworkId === networkId
        ? authSession.user.walletAddress
        : null;
    if (!verifiedWallet) {
      throw new Error(
        `Verify the ${network.label} Tezos deployment wallet in Settings before deploying.`,
      );
    }
    if (verifiedWallet !== connectedWallet.address) {
      await disconnectWallet();
      throw new Error(
        `Connected wallet ${connectedWallet.address} does not match verified ${network.label} deployment wallet ${verifiedWallet}. Reconnect the correct wallet.`,
      );
    }
    const {
      assignConnectedWalletAsAdmin,
      originateWithConnectedWallet,
    } = await import('./lib/shadownet-wallet');
    const storageForDeployment = useConnectedWalletAsContractAdmin
      ? assignConnectedWalletAsAdmin(
          workflow.artifacts.initialStorage,
          connectedWallet.address,
        )
      : workflow.artifacts.initialStorage;
    const result = await originateWithConnectedWallet(
      workflow.artifacts.michelson,
      storageForDeployment,
      networkId,
    );
    setContractAddress(result.contractAddress);
    setAbi(
      workflow.artifacts.entrypoints.map((name) => ({ name, args: [] })),
    );
    addLog(
      `Deployed from ${connectedWallet.address}: ${result.contractAddress} (hash ${result.hash})`,
      'success',
    );
  };

  const handleTezosDeploy = async () => {
    let workflow = lastWorkflow;
    if (!workflow || !clearanceId) {
      workflow = await runTezosWorkflow();
    }
    if (!workflow || !workflow.clearance.approved || !workflow.clearance.record?.id) {
      addLog('Deployment blocked: workflow clearance missing.', 'error');
      return;
    }
    setIsDeploying(true);
    try {
      if (deployMode === 'connected') {
        await deployTezosWithConnectedWallet(workflow);
      } else {
        await deployTezosWithPuppet(workflow);
      }
      void fetchBalances();
      setActiveTab('test');
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
    if (!can('puppetWallets')) {
      addLog(
        `Puppet execution is disabled on ${network.label}. Use a connected wallet flow.`,
        'error',
      );
      return;
    }
    addLog(`Executing ${entrypoint} as ${puppetWalletLabels[wallet]}...`, 'info');
    try {
      const res = await fetch('/api/kiln/execute', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ networkId, contractAddress, entrypoint, args, wallet }),
      });
      const payload = (await res.json()) as ExecuteResponse | { error?: string };
      if (!res.ok || !('hash' in payload) || !('level' in payload)) {
        throw new Error(
          'error' in payload && payload.error ? payload.error : 'Execution failed',
        );
      }
      addLog(
        payload.level === null
          ? `Execution ok: ${payload.hash} (block level unavailable).`
          : `Execution ok: ${payload.hash} (block ${payload.level}).`,
        'success',
      );
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
    if (!can('postdeployE2E') || !can('puppetWallets')) {
      addLog(
        `Post-deploy puppet E2E is not available on ${network.label}.`,
        'error',
      );
      return;
    }
    const discoveredEntrypoints = abi.map((entrypoint) => entrypoint.name);
    const selectedEntrypoint = e2eEntrypoint.trim() || abi[0]?.name;
    if (discoveredEntrypoints.length === 0 && !selectedEntrypoint) {
      addLog('Pick an entrypoint before running E2E.', 'error');
      return;
    }
    let parsedArgs: unknown[] = [];
    if (discoveredEntrypoints.length === 0) {
      try {
        parsedArgs = safeParseJsonArray(e2eArgs);
      } catch (error) {
        addLog(
          `Invalid E2E args JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
        return;
      }
    }
    const steps =
      discoveredEntrypoints.length > 0
        ? buildWorkflowDrivenE2ESteps({
            contractId: 'deployed_contract',
            contractAddress,
            entrypoints: discoveredEntrypoints,
          })
        : [
            { label: 'Bert step', wallet: 'A' as const, entrypoint: selectedEntrypoint, args: parsedArgs },
            { label: 'Ernie step', wallet: 'B' as const, entrypoint: selectedEntrypoint, args: parsedArgs },
          ];
    setIsRunningE2E(true);
    addLog(
      discoveredEntrypoints.length > 0
        ? `Running discovered Bert + Ernie workflow E2E (${steps.length} steps across ${discoveredEntrypoints.length} entrypoints)...`
        : `Running post-deploy E2E (Bert + Ernie) on ${selectedEntrypoint}...`,
      'info',
    );
    try {
      const res = await fetch('/api/kiln/e2e/run', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          networkId,
          contractAddress,
          contracts:
            discoveredEntrypoints.length > 0
              ? [
                  {
                    id: 'deployed_contract',
                    address: contractAddress,
                    entrypoints: discoveredEntrypoints,
                  },
                ]
              : [],
          steps,
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
          const detail = result.hash
            ? `hash ${result.hash}`
            : result.error
              ? `expected rejection: ${result.error}`
              : 'no operation hash';
          addLog(`${result.label} passed (${result.wallet}) ${detail}`, 'success');
        } else {
          addLog(
            `${result.label} failed (${result.wallet}): ${result.error ?? 'unknown error'}`,
            'error',
          );
        }
      }
      addLog(
        `E2E summary: ${payload.summary.passed}/${payload.summary.total} passed.`,
        payload.success ? 'success' : 'error',
      );
      if (payload.coverage) {
        addLog(
          `Workflow coverage: ${payload.coverage.coveredEntrypoints}/${payload.coverage.totalEntrypoints} entrypoints covered.`,
          payload.coverage.passed ? 'success' : 'error',
        );
      }
    } catch (error) {
      addLog(
        `E2E run error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsRunningE2E(false);
    }
  };

  // Tab guard logic
  const verifiedEvmWalletAddress =
    isEvm && authSession?.user.walletKind === 'evm' ? authSession.user.walletAddress : null;
  const verifiedTezosWalletAddress =
    isTezos &&
    authSession?.user.walletKind === 'tezos' &&
    authSession.user.lastLoginNetworkId === networkId
      ? authSession.user.walletAddress
      : null;

  const tabs = useMemo<
    Array<{
      key: TabKey;
      label: string;
      icon: React.ReactNode;
      tipKey: Parameters<typeof tip>[0];
      ready: boolean;
      done: boolean;
    }>
  >(() => {
    const hasSource = isEvm ? solidityCode.trim().length > 0 : michelsonCode.trim().length > 0;
    const hasClearance = isEvm ? Boolean(lastSolidityCompile?.entry) : Boolean(clearanceId);
    const hasContract = Boolean(contractAddress);
    const hasMcpAccess = authSession?.user.access.status === 'approved';
    return [
      {
        key: 'settings',
        label: 'Settings',
        icon: <Settings className="w-4 h-4" />,
        tipKey: 'tabSetupLabel',
        ready: true,
        done: Boolean(verifiedTezosWalletAddress || verifiedEvmWalletAddress || hasMcpAccess),
      },
      {
        key: 'setup',
        label: t('tabSetupLabel'),
        icon: <Globe className="w-4 h-4" />,
        tipKey: 'tabSetupLabel',
        ready: true,
        done: true,
      },
      {
        key: 'build',
        label: t('tabBuildLabel'),
        icon: <Hammer className="w-4 h-4" />,
        tipKey: 'tabBuildLabel',
        ready: true,
        done: hasSource,
      },
      {
        key: 'validate',
        label: t('tabValidateLabel'),
        icon: <ShieldCheck className="w-4 h-4" />,
        tipKey: 'tabValidateLabel',
        ready: hasSource,
        done: hasClearance,
      },
      {
        key: 'deploy',
        label: t('tabDeployLabel'),
        icon: <Rocket className="w-4 h-4" />,
        tipKey: 'tabDeployLabel',
        ready: hasClearance,
        done: hasContract,
      },
      {
        key: 'test',
        label: t('tabTestLabel'),
        icon: <FlaskConical className="w-4 h-4" />,
        tipKey: 'tabTestLabel',
        ready: hasContract,
        done: false,
      },
      {
        key: 'handoff',
        label: t('tabHandoffLabel'),
        icon: <Package className="w-4 h-4" />,
        tipKey: 'tabHandoffLabel',
        ready: hasSource,
        done: Boolean(lastWorkflow || lastSolidityCompile),
      },
    ];
  }, [
    isEvm,
    solidityCode,
    michelsonCode,
    lastSolidityCompile,
    clearanceId,
    contractAddress,
    lastWorkflow,
    authSession,
    verifiedTezosWalletAddress,
    verifiedEvmWalletAddress,
    t,
  ]);

  const activeIndex = tabs.findIndex((tab) => tab.key === activeTab);
  const prev = activeIndex > 0 ? tabs[activeIndex - 1] : null;
  const next = activeIndex >= 0 && activeIndex < tabs.length - 1 ? tabs[activeIndex + 1] : null;

  const sessionSummary = useMemo(
    () => ({
      source: isEvm
        ? solidityCode.trim().length > 0
          ? `${solidityCode.trim().split('\n').length} lines of Solidity`
          : null
        : michelsonCode.trim().length > 0
          ? `${michelsonCode.trim().split('\n').length} lines of ${contractSourceType}`
          : null,
      clearance: isEvm
        ? lastSolidityCompile?.entry
          ? `solc ${lastSolidityCompile.solcVersion}`
          : null
        : clearanceId,
      contract: contractAddress,
    }),
    [isEvm, solidityCode, michelsonCode, contractSourceType, lastSolidityCompile, clearanceId, contractAddress],
  );

  return (
    <div
      className="min-h-screen bg-base-300 text-base-content font-sans flex flex-col"
      data-theme="dark"
    >
      <Header
        networkHealth={networkHealth}
        mode={mode}
        setMode={setMode}
        fetchBalances={fetchBalances}
      />

      {network.tier === 'mainnet' ? (
        <div className="bg-error/10 border-y border-error/30 text-error px-4 py-2 text-xs text-center">
          <KilnCopy k="mainnetBanner" as="span" />
        </div>
      ) : null}

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 space-y-6">
        <SessionSummary summary={sessionSummary} />

        <div className="bg-base-100 rounded-2xl shadow-lg border border-base-200 overflow-hidden">
          <div className="flex items-stretch overflow-x-auto border-b border-base-300">
            {tabs.map((tab, idx) => {
              const isActive = tab.key === activeTab;
              const isLocked = !tab.ready;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (!isLocked) {
                      setActiveTab(tab.key);
                    }
                  }}
                  title={
                    isLocked
                      ? 'Locked — complete earlier steps.'
                      : (tip(tab.tipKey) ?? undefined)
                  }
                  className={`relative flex-1 min-w-[120px] px-3 md:px-4 py-4 text-left border-r border-base-300 last:border-r-0 transition-colors ${
                    isActive
                      ? 'bg-base-200/60'
                      : isLocked
                        ? 'cursor-not-allowed bg-base-300/20'
                        : 'hover:bg-base-200/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex items-center justify-center w-6 h-6 rounded-full text-[0.65rem] font-bold ${
                          tab.done
                            ? 'bg-success text-success-content'
                            : isActive
                              ? 'bg-primary text-primary-content'
                              : 'bg-base-300 text-base-content/60'
                        }`}
                      >
                        {tab.done ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
                      </div>
                      <span className={`font-semibold text-sm ${isActive ? '' : 'text-base-content/90'}`}>
                        {tab.label}
                      </span>
                    </div>
                    {isLocked ? <Lock className="w-3 h-3 text-base-content/40" /> : tab.icon}
                  </div>
                  {isActive ? (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {activeTab === 'setup' ? (
              <SetupTab
                balances={balances}
                balancesStatus={balancesStatus}
                balancesError={balancesError}
                fetchBalances={fetchBalances}
                connectedWallet={connectedWallet}
                onConnect={connectWallet}
                onDisconnect={disconnectWallet}
                isConnectingWallet={isConnectingWallet}
              />
            ) : null}
            {activeTab === 'settings' ? (
              <SettingsTab
                isTezos={isTezos}
                isEvm={isEvm}
                connectedWallet={connectedWallet}
                onConnect={connectWallet}
                onDisconnect={disconnectWallet}
                authSession={authSession}
                mcpToken={mcpToken}
                isMcpLoggingIn={isMcpLoggingIn}
                isConnectingWallet={isConnectingWallet}
                isRequestingMcpAccess={isRequestingMcpAccess}
                isGeneratingMcpToken={isGeneratingMcpToken}
                onLogin={startMcpWalletLogin}
                onRequestAccess={requestMcpAccess}
                onGenerateToken={generateMcpToken}
                onCopyToken={copyMcpToken}
              />
            ) : null}
            {activeTab === 'build' ? (
              <BuildTab
                isTezos={isTezos}
                contractSourceType={contractSourceType}
                setContractSourceType={setContractSourceType}
                michelsonCode={michelsonCode}
                setMichelsonCode={setMichelsonCode}
                solidityCode={solidityCode}
                setSolidityCode={setSolidityCode}
                initialStorage={initialStorage}
                setInitialStorage={setInitialStorage}
                contractUploadInputRef={contractUploadInputRef}
                openContractFilePicker={openContractFilePicker}
                handleFileUpload={handleFileUpload}
                onApplyGuidedDraft={applyGuidedMichelsonDraft}
                buildHeaders={buildHeaders}
                addLog={addLog}
                onCompiled={setLastSolidityCompile}
                entrypoints={abi.map((entrypoint) => entrypoint.name)}
                contractAddress={contractAddress}
                clearanceId={clearanceId}
                verifiedEvmWalletAddress={verifiedEvmWalletAddress}
                isAssociatingEvmWallet={isMcpLoggingIn}
                onAssociateEvmWallet={startMcpWalletLogin}
                onDeployedEvm={(info) => {
                  setContractAddress(info.contractAddress);
                  addLog(`EVM contract live at ${info.contractAddress}.`, 'success');
                  setActiveTab('test');
                }}
              />
            ) : null}
            {activeTab === 'validate' ? (
              <ValidateTab
                isTezos={isTezos}
                isRunningWorkflow={isRunningWorkflow}
                hasSource={isTezos ? michelsonCode.trim().length > 0 : solidityCode.trim().length > 0}
                runWorkflow={runTezosWorkflow}
                workflow={lastWorkflow}
                solidityResult={lastSolidityCompile}
              />
            ) : null}
            {activeTab === 'deploy' ? (
              <DeployTab
                isTezos={isTezos}
                deployMode={deployMode}
                setDeployMode={setDeployMode}
                useConnectedWalletAsContractAdmin={useConnectedWalletAsContractAdmin}
                setUseConnectedWalletAsContractAdmin={setUseConnectedWalletAsContractAdmin}
                connectedWallet={connectedWallet}
                verifiedTezosWalletAddress={verifiedTezosWalletAddress}
                clearanceId={clearanceId}
                lastWorkflow={lastWorkflow}
                solidityResult={lastSolidityCompile}
                contractAddress={contractAddress}
                isDeploying={isDeploying}
                isValidating={isValidating}
                onTezosDeploy={handleTezosDeploy}
                canPuppet={can('puppetWallets')}
                onReconnect={() => setActiveTab('settings')}
              />
            ) : null}
            {activeTab === 'test' ? (
              <TestTab
                isTezos={isTezos}
                contractAddress={contractAddress}
                abi={abi}
                onExecute={handleExecute}
                e2eEntrypoint={e2eEntrypoint}
                setE2EEntrypoint={setE2EEntrypoint}
                e2eArgs={e2eArgs}
                setE2EArgs={setE2EArgs}
                runE2E={runPostDeployE2E}
                isRunningE2E={isRunningE2E}
                canPuppet={can('puppetWallets') && can('postdeployE2E')}
              />
            ) : null}
            {activeTab === 'handoff' ? (
              <HandoffTab
                isTezos={isTezos}
                hasTezosSource={michelsonCode.trim().length > 0}
                hasSoliditySource={solidityCode.trim().length > 0}
                hasCompiledMichelson={Boolean(lastWorkflow?.artifacts.michelson)}
                hasSolidityCompile={Boolean(lastSolidityCompile?.entry)}
                isExportingBundle={isExportingBundle}
                exportCurrentSource={exportCurrentSource}
                exportLatestMichelson={exportLatestMichelson}
                exportSolidityBytecode={exportSolidityBytecode}
                exportMainnetBundle={exportMainnetBundle}
                contractAddress={contractAddress}
                networkLabel={network.label}
              />
            ) : null}
          </div>

          <div className="border-t border-base-300 p-3 flex items-center justify-between flex-wrap gap-2 bg-base-200/30">
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1"
              onClick={() => prev?.ready && setActiveTab(prev.key)}
              disabled={!prev?.ready}
            >
              <ChevronLeft className="w-4 h-4" />
              {prev ? prev.label : 'Back'}
            </button>
            <div className="text-xs text-base-content/60">
              Step {activeIndex + 1} of {tabs.length}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary gap-1"
              onClick={() => next?.ready && setActiveTab(next.key)}
              disabled={!next?.ready}
            >
              {next ? next.label : 'Done'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <TerminalDock
        open={terminalOpen}
        setOpen={setTerminalOpen}
        logs={logs}
        logsEndRef={logsEndRef}
        onClear={() => setLogs([])}
      />

      <MainnetConsentModal />

      {/* Hidden file input for global uploads */}
      <input
        ref={contractUploadInputRef}
        type="file"
        accept=".tz,.json,.smartpy,.sp,.py,.txt,.md,.sol"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Persistent header pill/switcher row is embedded in <Header />. */}
      <Spacer
        terminalOpen={terminalOpen}
        requestNetworkChange={requestNetworkChange}
      />
    </div>
  );
}

function isTabKey(value: string): value is TabKey {
  return ['setup', 'settings', 'build', 'validate', 'deploy', 'test', 'handoff'].includes(value);
}

/** Bottom spacer so the terminal dock never covers the tab nav. */
function Spacer({
  terminalOpen,
  requestNetworkChange,
}: {
  terminalOpen: boolean;
  requestNetworkChange: (id: never) => void;
}) {
  void requestNetworkChange;
  return (
    <div
      className={terminalOpen ? 'h-72 md:h-64' : 'h-16'}
      aria-hidden
    />
  );
}

function Header({
  networkHealth,
  mode,
  setMode,
  fetchBalances,
}: {
  networkHealth: 'checking' | 'online' | 'offline';
  mode: 'builder' | 'eli5';
  setMode: (next: 'builder' | 'eli5') => void;
  fetchBalances: () => Promise<void>;
}) {
  const { t, tip } = useKilnView();
  return (
    <header className="sticky top-0 z-40 bg-base-100/95 backdrop-blur border-b border-base-300">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Tezos Kiln
            </h1>
            <KilnCopy k="headerTagline" as="p" className="text-xs text-base-content/60 max-w-md leading-tight" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <NetworkStatusPill health={networkHealth} />
          <NetworkSwitcher />
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
          <button
            type="button"
            onClick={() => {
              void fetchBalances();
            }}
            className="btn btn-ghost btn-sm btn-circle"
            title="Refresh puppet balances"
            aria-label="Refresh balances"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function SessionSummary({
  summary,
}: {
  summary: { source: string | null; clearance: string | null; contract: string };
}) {
  const { network } = useKilnNetwork();
  return (
    <div className="bg-base-100 rounded-2xl border border-base-200 px-4 py-3 flex items-center gap-4 flex-wrap text-xs">
      <div className="flex items-center gap-2">
        <Boxes className="w-4 h-4 text-base-content/60" />
        <span className="opacity-60">Network:</span>
        <span className="font-semibold">{network.label}</span>
        <span className="opacity-60">({network.ecosystem})</span>
      </div>
      <div className="w-px h-4 bg-base-300" aria-hidden />
      <div className="flex items-center gap-2">
        <Hammer className="w-4 h-4 text-base-content/60" />
        <span className="opacity-60">Source:</span>
        <span className={summary.source ? 'font-mono' : 'italic opacity-60'}>
          {summary.source ?? 'not started'}
        </span>
      </div>
      <div className="w-px h-4 bg-base-300" aria-hidden />
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-base-content/60" />
        <span className="opacity-60">Clearance:</span>
        <span className={summary.clearance ? 'font-mono text-success' : 'italic opacity-60'}>
          {summary.clearance ?? 'none yet'}
        </span>
      </div>
      <div className="w-px h-4 bg-base-300" aria-hidden />
      <div className="flex items-center gap-2">
        <Rocket className="w-4 h-4 text-base-content/60" />
        <span className="opacity-60">Contract:</span>
        <span className={summary.contract ? 'font-mono' : 'italic opacity-60'}>
          {summary.contract || 'not deployed'}
        </span>
      </div>
    </div>
  );
}

function SetupTab({
  balances,
  balancesStatus,
  balancesError,
  fetchBalances,
  connectedWallet,
  onConnect,
  onDisconnect,
  isConnectingWallet,
}: {
  balances: BalancesResponse | null;
  balancesStatus: 'loading' | 'ready' | 'error' | 'unsupported';
  balancesError: string | null;
  fetchBalances: () => Promise<void>;
  connectedWallet: ConnectedWalletState | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  isConnectingWallet: boolean;
}) {
  const { network, isTezos, isEvm, requestNetworkChange, pickable } = useKilnNetwork();
  const { t } = useKilnView();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <KilnCopy k="networkPickerTitle" />
        </h2>
        <KilnCopy k="networkPickerBody" as="p" className="text-sm text-base-content/60 mt-1" />
        <KilnCopy k="tabSetupIntro" as="p" className="text-xs text-base-content/50 mt-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {pickable.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => requestNetworkChange(profile.id)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              profile.id === network.id
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-base-300 hover:border-primary/40 hover:bg-base-200/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{profile.label}</div>
              <span className={`badge badge-xs badge-${profile.accent}`}>
                {profile.tier}
              </span>
            </div>
            <p className="text-xs text-base-content/70 mt-1">{profile.blurb}</p>
            <div className="text-[0.65rem] text-base-content/50 mt-2 font-mono truncate">
              {profile.defaultRpcUrl}
            </div>
          </button>
        ))}
      </div>

      {isTezos ? (
        <section className="space-y-3 border-t border-base-300 pt-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70">
            Connect Tezos wallet
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                void onConnect();
              }}
              disabled={isConnectingWallet}
            >
              Connect wallet
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                void onDisconnect();
              }}
              disabled={!connectedWallet}
            >
              Disconnect
            </button>
          </div>
          {connectedWallet ? (
            <div className="rounded-xl border border-success/40 bg-success/5 p-3 text-xs font-mono space-y-0.5">
              <div>Address: {connectedWallet.address}</div>
              <div>Network: {connectedWallet.networkName ?? 'unknown'}</div>
              <div>RPC: {connectedWallet.rpcUrl ?? 'unknown'}</div>
            </div>
          ) : (
            <KilnCopy k="noWalletConnected" as="p" className="text-xs text-base-content/60" />
          )}
        </section>
      ) : (
        <section className="space-y-3 border-t border-base-300 pt-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70">
            Connect EVM wallet
          </h3>
          <p className="text-xs text-base-content/60">
            On Etherlink, your verified EVM wallet is the signer. Associate it with a
            signature before deploy so Kiln can show the exact address it will use.
          </p>
        </section>
      )}

      <section className="space-y-3 border-t border-base-300 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70">
            Puppet wallets
          </h3>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            aria-label="Refresh puppet balances"
            title="Refresh puppet balances"
            onClick={() => {
              void fetchBalances();
            }}
            disabled={balancesStatus === 'loading'}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {balancesStatus === 'unsupported' ? (
          <div className="alert alert-warning text-xs">
            <span>
              Puppets (Bert/Ernie) are not available on {network.label}. Mainnet deploys must come
              from a connected wallet.
            </span>
          </div>
        ) : balancesStatus === 'error' && balancesError ? (
          <div className="alert alert-error text-xs">
            <span>{balancesError}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['A', 'B'] as const).map((wallet) => {
              const data = wallet === 'A' ? balances?.walletA : balances?.walletB;
              const label = puppetWalletLabels[wallet];
              const addressLabel =
                balancesStatus === 'ready' && data?.address
                  ? data.address
                  : balancesStatus === 'loading'
                    ? 'Loading…'
                    : 'Unavailable';
              const balanceReady =
                balancesStatus === 'ready' && typeof data?.balance === 'number';
              return (
                <div
                  key={wallet}
                  className="bg-base-100 p-4 rounded-xl border border-base-200 flex items-center gap-4"
                >
                  <div
                    className={`p-3 rounded-lg ${
                      wallet === 'A'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary/10 text-secondary'
                    }`}
                  >
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="text-sm font-bold">{label}</h4>
                    <p className="text-xs text-base-content/50 font-mono truncate">
                      {addressLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold font-mono">
                      {balanceReady ? data?.balance.toFixed(2) : '—'}
                    </div>
                    <div className="text-[0.6rem] text-base-content/50 uppercase tracking-wider">
                      {network.nativeSymbol}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isEvm ? (
        <div className="alert alert-info text-xs">
          <span>
            Etherlink uses Solidity. When you switch to the Build tab, Kiln will show a Solidity
            editor and compile path. Deploys go through a verified EIP-1193 wallet.
          </span>
        </div>
      ) : null}

      {/* Swallow the unused t var in case we export it later. */}
      <span className="hidden">{t('tabSetupLabel')}</span>
    </div>
  );
}

function SettingsTab({
  isTezos,
  isEvm,
  connectedWallet,
  onConnect,
  onDisconnect,
  authSession,
  mcpToken,
  isMcpLoggingIn,
  isConnectingWallet,
  isRequestingMcpAccess,
  isGeneratingMcpToken,
  onLogin,
  onRequestAccess,
  onGenerateToken,
  onCopyToken,
}: {
  isTezos: boolean;
  isEvm: boolean;
  connectedWallet: ConnectedWalletState | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  authSession: KilnAuthSession | null;
  mcpToken: string | null;
  isMcpLoggingIn: boolean;
  isConnectingWallet: boolean;
  isRequestingMcpAccess: boolean;
  isGeneratingMcpToken: boolean;
  onLogin: (target?: EvmWalletTarget) => Promise<void>;
  onRequestAccess: () => Promise<void>;
  onGenerateToken: () => Promise<void>;
  onCopyToken: () => Promise<void>;
}) {
  const access = authSession?.user.access;
  const accessStatus = access?.status ?? 'none';
  const tokenMeta = authSession?.user.currentMcpToken;
  const walletLabel = authSession?.user.walletAddress ?? connectedWallet?.address ?? 'No wallet login';
  const walletKindLabel = authSession?.user.walletKind ?? (isEvm ? 'evm' : 'tezos');
  const { network } = useKilnNetwork();
  const walletVerifiedForNetwork =
    authSession?.user.lastLoginNetworkId === network.id &&
    (!connectedWallet || authSession.user.walletAddress === connectedWallet.address);
  const canRequestAccess = Boolean(authSession) && !isRequestingMcpAccess;
  const canGenerateToken =
    Boolean(authSession) && accessStatus === 'approved' && !isGeneratingMcpToken;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          Settings
        </h2>
            <p className="text-sm text-base-content/60 mt-1">
          Connect and verify the wallet Kiln is allowed to use for this network, then generate agent access when needed.
        </p>
      </div>

      <section className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Verified wallet
            </h3>
            <p className="text-xs text-base-content/60 mt-1">
              {isTezos
                ? `Stores the exact Beacon wallet allowed to deploy on ${network.label}.`
                : 'Uses Temple, MetaMask, or another EIP-1193 wallet for Etherlink.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isTezos ? (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={isConnectingWallet}
                  onClick={() => {
                    void onConnect();
                  }}
                >
                  {isConnectingWallet ? 'Connecting…' : connectedWallet ? 'Reconnect' : 'Connect'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={!connectedWallet}
                  onClick={() => {
                    void onDisconnect();
                  }}
                >
                  Disconnect
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="btn btn-sm btn-primary gap-2"
              disabled={isMcpLoggingIn || (isTezos && !connectedWallet)}
              onClick={() => {
                void onLogin();
              }}
            >
              <KeyRound className="w-4 h-4" />
              {isMcpLoggingIn ? 'Signing…' : authSession ? 'Re-verify' : 'Sign wallet'}
            </button>
          </div>
        </div>
        <div className="rounded-lg bg-base-200/50 border border-base-300 p-3 text-xs font-mono break-all">
          {isTezos ? <div>Connected: {connectedWallet?.address ?? 'none'}</div> : null}
          <div>Wallet: {walletLabel}</div>
          <div>Kind: {walletKindLabel}</div>
          <div>Network: {authSession?.user.lastLoginNetworkId ?? 'not verified'}</div>
          {authSession ? <div>Session expires: {new Date(authSession.expiresAt).toLocaleString()}</div> : null}
        </div>
        {authSession ? (
          <div
            className={`alert text-xs ${
              walletVerifiedForNetwork ? 'alert-success' : 'alert-warning'
            }`}
          >
            <span>
              {walletVerifiedForNetwork
                ? `Deployment wallet verified for ${network.label}.`
                : `Wallet login is not verified for the active ${network.label} signer.`}
            </span>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
              <PlugZap className="w-4 h-4" />
              MCP access
            </h3>
            <p className="text-xs text-base-content/60 mt-1">
              Kiln allows verified wallets unless they are on the blocklist; rate limits still apply.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary gap-2"
            disabled={!canRequestAccess}
            onClick={() => {
              void onRequestAccess();
            }}
          >
            <ShieldCheck className="w-4 h-4" />
            {isRequestingMcpAccess ? 'Checking…' : 'Request access'}
          </button>
        </div>
        <div
          className={`alert text-xs ${
            accessStatus === 'approved'
              ? 'alert-success'
              : accessStatus === 'blocked'
                ? 'alert-error'
                : 'alert-info'
          }`}
        >
          <span>
            Status: {accessStatus}
            {access?.reason ? ` · ${access.reason}` : ''}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Agent token
            </h3>
            <p className="text-xs text-base-content/60 mt-1">
              The full token is shown only when generated. It expires after 24 hours.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary gap-2"
            disabled={!canGenerateToken}
            onClick={() => {
              void onGenerateToken();
            }}
          >
            <KeyRound className="w-4 h-4" />
            {isGeneratingMcpToken ? 'Generating…' : 'Generate token'}
          </button>
        </div>

        {tokenMeta ? (
          <div className="rounded-lg border border-base-300 bg-base-200/40 p-3 text-xs space-y-1">
            <div className="font-mono">Token id: {tokenMeta.id}</div>
            <div>Expires: {new Date(tokenMeta.expiresAt).toLocaleString()}</div>
          </div>
        ) : null}

        {mcpToken ? (
          <div className="space-y-2">
            <textarea
              className="textarea textarea-bordered w-full font-mono text-xs min-h-24"
              readOnly
              value={mcpToken}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline gap-2"
              onClick={() => {
                void onCopyToken();
              }}
            >
              <ClipboardCopy className="w-4 h-4" />
              Copy token
            </button>
          </div>
        ) : (
          <div className="text-xs text-base-content/60 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-base-content/40" />
            Generate a token after access is approved.
          </div>
        )}
      </section>
    </div>
  );
}

function BuildTab({
  isTezos,
  contractSourceType,
  setContractSourceType,
  michelsonCode,
  setMichelsonCode,
  solidityCode,
  setSolidityCode,
  initialStorage,
  setInitialStorage,
  contractUploadInputRef,
  openContractFilePicker,
  handleFileUpload,
  onApplyGuidedDraft,
  buildHeaders,
  addLog,
  onCompiled,
  entrypoints,
  contractAddress,
  clearanceId,
  verifiedEvmWalletAddress,
  isAssociatingEvmWallet,
  onAssociateEvmWallet,
  onDeployedEvm,
}: {
  isTezos: boolean;
  contractSourceType: ContractSourceType;
  setContractSourceType: (next: ContractSourceType) => void;
  michelsonCode: string;
  setMichelsonCode: (next: string) => void;
  solidityCode: string;
  setSolidityCode: (next: string) => void;
  initialStorage: string;
  setInitialStorage: (next: string) => void;
  contractUploadInputRef: React.RefObject<HTMLInputElement | null>;
  openContractFilePicker: () => void;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onApplyGuidedDraft: (code: string, storage: string) => void;
  buildHeaders: (includeJson?: boolean) => HeadersInit;
  addLog: (msg: string, type?: LogType) => void;
  onCompiled: (result: SolidityCompileResult | null) => void;
  entrypoints: string[];
  contractAddress: string;
  clearanceId: string | null;
  verifiedEvmWalletAddress: string | null;
  isAssociatingEvmWallet: boolean;
  onAssociateEvmWallet: (target?: EvmWalletTarget) => Promise<void>;
  onDeployedEvm: (info: { contractAddress: `0x${string}`; transactionHash: `0x${string}`; networkId: string }) => void;
}) {
  const { t, tip, mode } = useKilnView();
  const { network } = useKilnNetwork();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Hammer className="w-5 h-5 text-primary" />
          <KilnCopy k="tabBuildLabel" />
        </h2>
        <KilnCopy k="tabBuildIntro" as="p" className="text-sm text-base-content/60 mt-1" />
      </div>

      {isTezos ? (
        <>
          <GuidedContractBuilder
            buildHeaders={buildHeaders}
            onApplyMichelsonDraft={onApplyGuidedDraft}
            onLog={addLog}
          />
          <div className="bg-base-100 rounded-2xl border border-base-200 overflow-hidden">
            <div className="p-4 border-b border-base-300 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-bold flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                <KilnCopy k="contractInjectorTitle" />
              </h3>
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
                <button
                  type="button"
                  className="btn btn-sm btn-outline btn-primary"
                  onClick={openContractFilePicker}
                  title={tip('uploadSource')}
                >
                  {t('uploadSource')}
                </button>
                <input
                  ref={contractUploadInputRef}
                  type="file"
                  accept=".tz,.json,.smartpy,.sp,.py,.txt,.md"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
            <div className="p-4 border-b border-base-300 space-y-2">
              <label className="label py-0">
                <span
                  className={`label-text text-xs uppercase tracking-wider ${
                    mode === 'eli5' && tip('initialStorageLabel')
                      ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2'
                      : ''
                  }`}
                  title={mode === 'eli5' ? tip('initialStorageLabel') : undefined}
                >
                  {t('initialStorageLabel')}
                </span>
              </label>
              <input
                className="input input-sm input-bordered w-full font-mono"
                value={initialStorage}
                onChange={(event) => setInitialStorage(event.target.value)}
                placeholder='Ex: Unit or Pair "tz1..." 100'
              />
            </div>
            <div className="p-4">
              <textarea
                className="textarea textarea-bordered w-full font-mono text-sm h-72 bg-base-300/50"
                placeholder={
                  contractSourceType === 'smartpy'
                    ? t('placeholderSmartpy')
                    : t('placeholderMichelson')
                }
                value={michelsonCode}
                onChange={(event) => setMichelsonCode(event.target.value)}
                onDoubleClick={openContractFilePicker}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <KilnCopy k="evmCompileHint" as="p" className="text-xs text-base-content/70" />
          <React.Suspense
            fallback={
              <div className="rounded-lg border border-base-300 bg-base-200/30 p-4 text-sm">
                Loading Solidity tools...
              </div>
            }
          >
            <SolidityPanel
              source={solidityCode}
              onSourceChange={setSolidityCode}
              buildHeaders={buildHeaders}
              onLog={addLog}
              verifiedWalletAddress={verifiedEvmWalletAddress}
              isAssociatingWallet={isAssociatingEvmWallet}
              onAssociateWallet={onAssociateEvmWallet}
              onDeployed={onDeployedEvm}
            />
          </React.Suspense>
          <div className="alert text-xs">
            <span>
              Solidity runs on <span className="font-semibold">{network.label}</span>.
              Kiln compiles with solc-js, but the deploy transaction is signed by your verified
              Etherlink wallet directly.
            </span>
          </div>
        </>
      )}

      <ProjectWorkspacePanel
        networkId={network.id}
        sourceType={isTezos ? contractSourceType : 'solidity'}
        source={isTezos ? michelsonCode : solidityCode}
        initialStorage={initialStorage}
        entrypoints={entrypoints}
        contractAddress={contractAddress}
        clearanceId={clearanceId}
      />

      {/* Bubble compile results up via a tiny effect hook */}
      <CompileSync onCompiled={onCompiled} />
    </div>
  );
}

/**
 * Solidity compile results are created inside SolidityPanel. Rather than
 * drill props up + down, we listen for a lightweight custom event and forward
 * the latest payload to the parent (keeps SolidityPanel dependency-free).
 */
function CompileSync({
  onCompiled,
}: {
  onCompiled: (result: SolidityCompileResult | null) => void;
}) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SolidityCompileResult | null>).detail ?? null;
      onCompiled(detail);
    };
    window.addEventListener('kiln:solidity:compiled', handler);
    return () => window.removeEventListener('kiln:solidity:compiled', handler);
  }, [onCompiled]);
  return null;
}

function ValidateTab({
  isTezos,
  isRunningWorkflow,
  hasSource,
  runWorkflow,
  workflow,
  solidityResult,
}: {
  isTezos: boolean;
  isRunningWorkflow: boolean;
  hasSource: boolean;
  runWorkflow: () => Promise<WorkflowRunResponse | null>;
  workflow: WorkflowRunResponse | null;
  solidityResult: SolidityCompileResult | null;
}) {
  if (!isTezos) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <KilnCopy k="tabValidateLabel" />
          </h2>
          <KilnCopy k="tabValidateIntro" as="p" className="text-sm text-base-content/60 mt-1" />
        </div>
        {solidityResult ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-base-300 bg-base-200/40 p-4 space-y-1 text-sm">
              <div className="font-semibold">Compile</div>
              <div className="text-xs text-base-content/70">
                {solidityResult.success ? 'solc reported success.' : 'solc reported errors.'}
              </div>
              <div className="text-[0.65rem] text-base-content/60 font-mono">
                {solidityResult.solcVersion}
              </div>
            </div>
            <div className="rounded-xl border border-base-300 bg-base-200/40 p-4 space-y-1 text-sm">
              <div className="font-semibold">Audit</div>
              <div className="text-xs text-base-content/70">
                {solidityResult.audit.findings.length} finding(s), score {solidityResult.audit.score}/100.
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-base-300 bg-base-200/30 p-8 text-center text-sm text-base-content/60">
            Compile Solidity in the Build tab to populate validation results.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <KilnCopy k="tabValidateLabel" />
          </h2>
          <KilnCopy k="tabValidateIntro" as="p" className="text-sm text-base-content/60 mt-1" />
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            void runWorkflow();
          }}
          disabled={isRunningWorkflow || !hasSource}
        >
          {isRunningWorkflow ? 'Running…' : 'Run full workflow'}
        </button>
      </div>
      <WorkflowResultsPanel summary={workflow} />
    </div>
  );
}

function DeployTab({
  isTezos,
  deployMode,
  setDeployMode,
  useConnectedWalletAsContractAdmin,
  setUseConnectedWalletAsContractAdmin,
  connectedWallet,
  verifiedTezosWalletAddress,
  clearanceId,
  lastWorkflow,
  solidityResult,
  contractAddress,
  isDeploying,
  isValidating,
  onTezosDeploy,
  canPuppet,
  onReconnect,
}: {
  isTezos: boolean;
  deployMode: DeployMode;
  setDeployMode: (next: DeployMode) => void;
  useConnectedWalletAsContractAdmin: boolean;
  setUseConnectedWalletAsContractAdmin: (next: boolean) => void;
  connectedWallet: ConnectedWalletState | null;
  verifiedTezosWalletAddress: string | null;
  clearanceId: string | null;
  lastWorkflow: WorkflowRunResponse | null;
  solidityResult: SolidityCompileResult | null;
  contractAddress: string;
  isDeploying: boolean;
  isValidating: boolean;
  onTezosDeploy: () => Promise<void>;
  canPuppet: boolean;
  onReconnect: () => void;
}) {
  const { network } = useKilnNetwork();
  const { t, tip } = useKilnView();
  const selectDeployModeFromKeyboard = (
    event: React.KeyboardEvent<HTMLDivElement>,
    mode: DeployMode,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    if (mode === 'puppet' && !canPuppet) {
      return;
    }
    setDeployMode(mode);
  };

  if (!isTezos) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            <KilnCopy k="tabDeployLabel" />
          </h2>
          <KilnCopy k="tabDeployIntro" as="p" className="text-sm text-base-content/60 mt-1" />
        </div>
        {solidityResult?.entry ? (
          <div className="rounded-xl border border-success/40 bg-success/5 p-4 space-y-2 text-sm">
            <div className="font-semibold">{solidityResult.entry.name}</div>
            <p className="text-xs text-base-content/70">
              Compile is ready. Use the Deploy button on the Build tab — it signs with the verified
              Etherlink wallet directly.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/60">
            Compile Solidity in the Build tab to enable EVM deploy.
          </div>
        )}
        {contractAddress ? (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm font-mono">
            Deployed: {contractAddress}
          </div>
        ) : null}
      </div>
    );
  }

  const deployReady =
    Boolean(lastWorkflow) &&
    Boolean(clearanceId) &&
    (deployMode === 'puppet'
      ? canPuppet
      : Boolean(
          connectedWallet &&
            verifiedTezosWalletAddress &&
            connectedWallet.address === verifiedTezosWalletAddress,
        ));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary" />
          <KilnCopy k="tabDeployLabel" />
        </h2>
        <KilnCopy k="tabDeployIntro" as="p" className="text-sm text-base-content/60 mt-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="radiogroup">
        <div
          role="radio"
          tabIndex={0}
          aria-checked={deployMode === 'connected'}
          onClick={() => setDeployMode('connected')}
          onKeyDown={(event) => selectDeployModeFromKeyboard(event, 'connected')}
          className={`p-4 rounded-xl border text-left transition-colors ${
            deployMode === 'connected'
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-base-300 hover:border-primary/40'
          }`}
          title={tip('deployModeConnected')}
        >
          <div className="font-semibold text-sm">{t('deployModeConnected')}</div>
          <p className="text-xs text-base-content/60 mt-1">
            Beacon origination from your Temple/Kukai wallet. Required on mainnet.
          </p>
          {connectedWallet ? (
            <div className="text-[0.65rem] font-mono mt-2 text-base-content/60 space-y-1">
              <div>Connected: {connectedWallet.address}</div>
              <div>
                Verified:{' '}
                {verifiedTezosWalletAddress ? verifiedTezosWalletAddress : 'not signed'}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-outline mt-2"
              onClick={(e) => {
                e.stopPropagation();
                onReconnect();
              }}
            >
              Connect wallet →
            </button>
          )}
        </div>
        <div
          role="radio"
          tabIndex={canPuppet ? 0 : -1}
          aria-checked={deployMode === 'puppet'}
          aria-disabled={!canPuppet}
          onClick={() => {
            if (canPuppet) {
              setDeployMode('puppet');
            }
          }}
          onKeyDown={(event) => selectDeployModeFromKeyboard(event, 'puppet')}
          className={`p-4 rounded-xl border text-left transition-colors ${
            deployMode === 'puppet'
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-base-300 hover:border-primary/40'
          } ${!canPuppet ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={tip('deployModePuppet')}
        >
          <div className="font-semibold text-sm">{t('deployModePuppet')}</div>
          <p className="text-xs text-base-content/60 mt-1">
            Fast path for Shadownet testnet deploys. Server-held key; never use with real funds.
          </p>
          {!canPuppet ? (
            <p className="text-[0.65rem] text-error mt-2">
              Disabled on {network.label}.
            </p>
          ) : null}
        </div>
      </div>

      {deployMode === 'connected' ? (
        <label className="label cursor-pointer items-start gap-3 py-1">
          <input
            type="checkbox"
            className="checkbox checkbox-sm mt-0.5"
            checked={useConnectedWalletAsContractAdmin}
            onChange={(event) => setUseConnectedWalletAsContractAdmin(event.target.checked)}
          />
          <span className="label-text text-xs block space-y-1">
            <KilnCopy k="adminCheckboxTitle" as="span" className="font-semibold block" />
            <span className="text-base-content/60 block">
              Replaces <code className="bg-base-200 px-1 rounded">{BURN_PLACEHOLDER_ADDRESS}</code>{' '}
              in initial storage with your connected wallet before origination.
            </span>
          </span>
        </label>
      ) : null}

      <div className="rounded-xl border border-base-300 bg-base-200/40 p-3 text-xs space-y-1">
        <div>
          <span className="opacity-60">Clearance: </span>
          <span className={clearanceId ? 'text-success font-mono' : 'text-warning'}>
            {clearanceId ?? 'not granted'}
          </span>
        </div>
        <div>
          <span className="opacity-60">Network: </span>
          {network.label}
        </div>
        <div>
          <span className="opacity-60">Deployment signer: </span>
          <span
            className={
              deployMode === 'connected' && verifiedTezosWalletAddress
                ? 'font-mono text-success'
                : 'text-warning'
            }
          >
            {deployMode === 'connected'
              ? verifiedTezosWalletAddress ?? 'verify in Settings'
              : 'Bert puppet wallet'}
          </span>
        </div>
        {network.tier === 'mainnet' ? (
          <div className="text-error">
            Mainnet deploy — double-check admin address and storage before signing.
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => {
          void onTezosDeploy();
        }}
        disabled={!deployReady || isDeploying || isValidating}
      >
        {isDeploying ? (
          <span className="loading loading-spinner" />
        ) : deployMode === 'connected' ? (
          t('deployWithConnected')
        ) : (
          t('deployWithBert')
        )}
      </button>

      {contractAddress ? (
        <div className="rounded-xl border border-success/40 bg-success/5 p-3 text-sm font-mono">
          Deployed: {contractAddress}
        </div>
      ) : null}
    </div>
  );
}

function TestTab({
  isTezos,
  contractAddress,
  abi,
  onExecute,
  e2eEntrypoint,
  setE2EEntrypoint,
  e2eArgs,
  setE2EArgs,
  runE2E,
  isRunningE2E,
  canPuppet,
}: {
  isTezos: boolean;
  contractAddress: string;
  abi: AbiEntrypoint[];
  onExecute: (entrypoint: string, args: unknown[], wallet: WalletType) => Promise<void>;
  e2eEntrypoint: string;
  setE2EEntrypoint: (next: string) => void;
  e2eArgs: string;
  setE2EArgs: (next: string) => void;
  runE2E: () => Promise<void>;
  isRunningE2E: boolean;
  canPuppet: boolean;
}) {
  const { t, tip } = useKilnView();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <KilnCopy k="tabTestLabel" />
        </h2>
        <KilnCopy k="tabTestIntro" as="p" className="text-sm text-base-content/60 mt-1" />
      </div>
      {!contractAddress ? (
        <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/60">
          Deploy a contract first — the dynamic rig wakes up once there's an address to talk to.
        </div>
      ) : (
        <>
          {isTezos && canPuppet ? (
            <div className="rounded-xl border border-base-300 bg-base-200/30 p-4 space-y-3">
              <h3 className="text-sm font-semibold">Bert / Ernie E2E</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label py-0">
                    <span
                      className="label-text text-xs uppercase tracking-wider"
                      title={tip('e2eEntrypointLabel')}
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
                </div>
                <div>
                  <label className="label py-0">
                    <span
                      className="label-text text-xs uppercase tracking-wider"
                      title={tip('e2eArgsLabel')}
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
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary w-full"
                onClick={() => {
                  void runE2E();
                }}
                disabled={isRunningE2E || !contractAddress}
              >
                {isRunningE2E ? <span className="loading loading-spinner" /> : t('runBertErnieE2e')}
              </button>
            </div>
          ) : null}
          <DynamicRig contractAddress={contractAddress} abi={abi} onExecute={onExecute} />
        </>
      )}
    </div>
  );
}

function HandoffTab({
  isTezos,
  hasTezosSource,
  hasSoliditySource,
  hasCompiledMichelson,
  hasSolidityCompile,
  isExportingBundle,
  exportCurrentSource,
  exportLatestMichelson,
  exportSolidityBytecode,
  exportMainnetBundle,
  contractAddress,
  networkLabel,
}: {
  isTezos: boolean;
  hasTezosSource: boolean;
  hasSoliditySource: boolean;
  hasCompiledMichelson: boolean;
  hasSolidityCompile: boolean;
  isExportingBundle: boolean;
  exportCurrentSource: () => void;
  exportLatestMichelson: () => void;
  exportSolidityBytecode: () => void;
  exportMainnetBundle: () => Promise<void>;
  contractAddress: string;
  networkLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <KilnCopy k="tabHandoffLabel" />
        </h2>
        <KilnCopy k="tabHandoffIntro" as="p" className="text-sm text-base-content/60 mt-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <HandoffCard
          title="Export source"
          description="Download the current source buffer as-is."
          disabled={isTezos ? !hasTezosSource : !hasSoliditySource}
          onClick={exportCurrentSource}
        />
        {isTezos ? (
          <HandoffCard
            title="Export compiled Michelson"
            description="Latest workflow artifact (.tz). Requires a workflow run."
            disabled={!hasCompiledMichelson}
            onClick={exportLatestMichelson}
          />
        ) : (
          <HandoffCard
            title="Export Solidity artifacts"
            description="ABI + bytecode JSON, hardhat-compatible."
            disabled={!hasSolidityCompile}
            onClick={exportSolidityBytecode}
          />
        )}
        {isTezos ? (
          <HandoffCard
            title={isExportingBundle ? 'Bundling…' : 'Mainnet-ready bundle'}
            description="Zip including source, compiled output, validation, audit, and deploy metadata."
            disabled={!hasCompiledMichelson || isExportingBundle}
            onClick={() => {
              void exportMainnetBundle();
            }}
            highlight
          />
        ) : null}
      </div>

      {contractAddress ? (
        <div className="rounded-xl border border-base-300 bg-base-200/30 p-3 text-xs">
          <div className="font-semibold mb-1">Deployment record</div>
          <div className="font-mono">
            {networkLabel} · {contractAddress}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HandoffCard({
  title,
  description,
  disabled,
  onClick,
  highlight,
}: {
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-4 rounded-xl border transition-colors flex items-start gap-3 ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-base-300'
          : highlight
            ? 'border-primary bg-primary/5 hover:bg-primary/10'
            : 'border-base-300 hover:border-primary/40 hover:bg-base-200/30'
      }`}
    >
      <div className={`p-2 rounded-lg ${highlight ? 'bg-primary/20 text-primary' : 'bg-base-200 text-base-content/60'}`}>
        <Download className="w-4 h-4" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-base-content/60 mt-1">{description}</p>
      </div>
    </button>
  );
}

function TerminalDock({
  open,
  setOpen,
  logs,
  logsEndRef,
  onClear,
}: {
  open: boolean;
  setOpen: (next: boolean) => void;
  logs: LogEntry[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  onClear: () => void;
}) {
  const { t } = useKilnView();
  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-30 bg-neutral text-neutral-content border-t border-black/30 transition-all ${
        open ? 'max-h-64' : 'max-h-10'
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-wider text-neutral-content/85 hover:bg-neutral-focus">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-controls="kiln-terminal-log"
        >
          {open ? <TerminalSquare className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
          <span>{t('kilnTerminalLabel')}</span>
          <span className="ml-auto text-neutral-content/75">{logs.length} lines</span>
        </button>
        {open ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onClear}
          >
            clear
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id="kiln-terminal-log"
          className="max-w-7xl mx-auto px-4 pb-3 overflow-y-auto max-h-52 font-mono text-xs space-y-1"
        >
          {logs.length === 0 ? (
            <div className="italic text-neutral-content/40">Waiting for operations...</div>
          ) : null}
          {logs.map((log, index) => (
            <div key={`${log.time}-${index}`} className="flex gap-3">
              <span className="text-neutral-content/40 shrink-0">[{log.time}]</span>
              <span
                className={
                  log.type === 'error'
                    ? 'text-error'
                    : log.type === 'success'
                      ? 'text-success'
                      : 'text-info'
                }
              >
                {log.msg}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      ) : null}
    </div>
  );
}
