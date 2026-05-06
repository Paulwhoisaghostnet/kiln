import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  FileSearch,
  FlaskConical,
  FolderPlus,
  Globe,
  Hammer,
  KeyRound,
  Lock,
  Package,
  PlugZap,
  RefreshCw,
  Rocket,
  Save,
  Settings,
  ShieldCheck,
  Terminal,
  TerminalSquare,
  Upload,
  UserCircle,
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
import type { KilnNetworkId } from './lib/networks';
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

type TabKey = 'setup' | 'build' | 'validate' | 'deploy' | 'test' | 'handoff';
type SurfaceKey = 'dashboard' | 'guided' | 'workbench' | 'account';
type WorkbenchToolKey = 'build' | 'validate' | 'deploy' | 'test' | 'handoff';
type FlowMode = 'guided' | 'workbench';

const guidedStepOrder: TabKey[] = ['setup', 'build', 'validate', 'deploy', 'test', 'handoff'];
const workbenchToolOrder: WorkbenchToolKey[] = ['build', 'validate', 'deploy', 'test', 'handoff'];

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
  hash?: string;
  level?: number | null;
  error?: string;
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
  networkId: KilnNetworkId;
  networkName: string | null;
  rpcUrl: string | null;
  target: WalletConnectTarget;
}

type KilnWalletKind = 'tezos' | 'evm';

interface KilnAuthUser {
  id: string;
  handle?: string;
  walletKind: KilnWalletKind;
  walletAddress: string;
  lastLoginNetworkId?: string;
  lastLoginWalletKind?: KilnWalletKind;
  lastLoginWalletAddress?: string;
  linkedWallets?: KilnAuthLinkedWallet[];
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
  currentApiToken?: {
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
  } | null;
  projectStoreUpdatedAt?: string | null;
}

interface KilnAuthLinkedWallet {
  id: string;
  walletKind: KilnWalletKind;
  walletAddress: string;
  networkId?: string;
  label?: string;
  addedAt: string;
  verifiedAt: string;
  lastLoginAt?: string;
}

interface KilnAuthSession {
  token: string;
  expiresAt: string;
  user: KilnAuthUser;
}

interface LinkedKilnWallet {
  id: string;
  kind: KilnWalletKind;
  address: string;
  networkId: string;
  label: string;
  addedAt: string;
  verifiedAt?: string;
  source: 'connected' | 'signed';
}

interface DiscoveredTezosContract {
  address: string;
  kind: string;
  originatedAt: string | null;
  level: number | null;
  operationHash: string | null;
  creator: string | null;
  source: 'creator' | 'sender' | 'initiator';
  typeHash?: number;
  codeHash?: number;
}

interface DiscoveredTezosContractWithProject extends DiscoveredTezosContract {
  projectName: string | null;
  projectId: string | null;
}

interface WorkflowRunResponse extends WorkflowSummary {
  success: boolean;
  sourceType: ContractSourceType;
  compile: { performed: boolean; scenario?: string; warnings: string[] };
  artifacts: {
    michelson: string;
    initialStorage: string;
    entrypoints: string[];
    entrypointMetadata?: AbiEntrypoint[];
    codeHash: string;
  };
}

interface PredeployValidationResponse {
  success: boolean;
  valid: boolean;
  issues: string[];
  warnings: string[];
  injectedCode: string;
  injectedInitialStorage?: string;
  error?: string;
}

interface BundleExportResponse {
  success: boolean;
  bundleId: string;
  exportDir: string;
  zipFileName: string;
  zipPath: string;
  downloadUrl: string;
}

interface ContractIntrospectionResponse {
  success: boolean;
  contractAddress: string;
  entrypoints: AbiEntrypoint[];
}

interface KilnContractDeployment {
  id: string;
  networkId: KilnNetworkId;
  address: string;
  deployedAt: string;
  versionId: string;
  sourceHash: string;
  origin: 'deployed' | 'imported';
}

interface KilnProjectContractItem {
  id: string;
  title: string;
  domain: string;
  role: string;
  purpose: string;
  relation: string;
  createdAt: string;
  updatedAt: string;
  sourceType: ContractSourceType;
  michelsonCode: string;
  solidityCode: string;
  initialStorage: string;
  clearanceId: string | null;
  abi: AbiEntrypoint[];
  e2eEntrypoint: string;
  e2eArgs: string;
  lastWorkflow: WorkflowRunResponse | null;
  lastSolidityCompile: SolidityCompileResult | null;
  currentVersionId: string;
  deployments: KilnContractDeployment[];
}

interface SavedKilnProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  networkId: KilnNetworkId;
  contractSourceType: ContractSourceType;
  michelsonCode: string;
  solidityCode: string;
  initialStorage: string;
  contractAddress: string;
  clearanceId: string | null;
  abi: AbiEntrypoint[];
  e2eEntrypoint: string;
  e2eArgs: string;
  deployMode: DeployMode;
  lastWorkflow: WorkflowRunResponse | null;
  lastSolidityCompile: SolidityCompileResult | null;
  contracts: KilnProjectContractItem[];
  activeContractId: string;
  lastSurface: 'guided' | 'workbench';
  lastGuidedStep: TabKey;
  lastWorkbenchTool: WorkbenchToolKey;
}

interface KilnProjectStore {
  projects: SavedKilnProject[];
  activeProjectId: string;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBrowserNetworkError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    error instanceof TypeError ||
    /failed to fetch|load failed|networkerror|network changed|name_not_resolved|err_network_changed|err_name_not_resolved/i.test(
      message,
    )
  );
}

function describeBrowserNetworkError(action: string, error: unknown): string {
  if (!isBrowserNetworkError(error)) {
    return errorMessage(error);
  }
  return `${action} could not reach the network from this browser session. Chrome reported a DNS/network change; check Wi-Fi/VPN/DNS and retry once the connection settles.`;
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

const PROJECT_STORE_KEY = 'kiln.projects.v1';
const AUTH_SESSION_KEY = 'kiln.authSession.v1';
const USER_HANDLE_KEY = 'kiln.userHandle.v1';
const LINKED_WALLETS_KEY = 'kiln.linkedWallets.v1';

function newProjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function fingerprintString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function contractVersionId(input: {
  sourceType: ContractSourceType;
  michelsonCode: string;
  solidityCode: string;
  initialStorage: string;
}): string {
  const source =
    input.sourceType === 'solidity' ? input.solidityCode : input.michelsonCode;
  return fingerprintString(
    JSON.stringify({
      sourceType: input.sourceType,
      source,
      initialStorage: input.initialStorage,
    }),
  );
}

function deploymentId(networkId: KilnNetworkId, address: string): string {
  return `${networkId}:${address}`;
}

function createProjectContract(input?: {
  title?: string;
  domain?: string;
  role?: string;
  purpose?: string;
  relation?: string;
  sourceType?: ContractSourceType;
  michelsonCode?: string;
  solidityCode?: string;
  initialStorage?: string;
  clearanceId?: string | null;
  abi?: AbiEntrypoint[];
  e2eEntrypoint?: string;
  e2eArgs?: string;
  lastWorkflow?: WorkflowRunResponse | null;
  lastSolidityCompile?: SolidityCompileResult | null;
  deployments?: KilnContractDeployment[];
}): KilnProjectContractItem {
  const now = new Date().toISOString();
  const sourceType = input?.sourceType ?? 'michelson';
  const michelsonCode = input?.michelsonCode ?? '';
  const solidityCode = input?.solidityCode ?? '';
  const initialStorage = input?.initialStorage ?? 'Unit';
  return {
    id: newProjectId(),
    title: input?.title ?? 'Primary contract',
    domain: input?.domain ?? 'Core',
    role: input?.role ?? 'platform',
    purpose: input?.purpose ?? 'Primary contract for this Kiln project.',
    relation: input?.relation ?? 'Root contract',
    createdAt: now,
    updatedAt: now,
    sourceType,
    michelsonCode,
    solidityCode,
    initialStorage,
    clearanceId: input?.clearanceId ?? null,
    abi: input?.abi ?? [],
    e2eEntrypoint: input?.e2eEntrypoint ?? '',
    e2eArgs: input?.e2eArgs ?? '[]',
    lastWorkflow: input?.lastWorkflow ?? null,
    lastSolidityCompile: input?.lastSolidityCompile ?? null,
    currentVersionId: contractVersionId({
      sourceType,
      michelsonCode,
      solidityCode,
      initialStorage,
    }),
    deployments: input?.deployments ?? [],
  };
}

function normalizeSavedProject(project: SavedKilnProject): SavedKilnProject {
  const deployments =
    project.contractAddress && /^KT1|^0x/i.test(project.contractAddress)
      ? [
          {
            id: deploymentId(project.networkId, project.contractAddress),
            networkId: project.networkId,
            address: project.contractAddress,
            deployedAt: project.updatedAt,
            versionId: contractVersionId({
              sourceType: project.contractSourceType,
              michelsonCode: project.michelsonCode,
              solidityCode: project.solidityCode,
              initialStorage: project.initialStorage,
            }),
            sourceHash: contractVersionId({
              sourceType: project.contractSourceType,
              michelsonCode: project.michelsonCode,
              solidityCode: project.solidityCode,
              initialStorage: project.initialStorage,
            }),
            origin: 'deployed' as const,
          },
        ]
      : [];
  const contracts =
    Array.isArray(project.contracts) && project.contracts.length > 0
      ? project.contracts.map((contract) => ({
          ...createProjectContract(contract),
          ...contract,
          currentVersionId:
            contract.currentVersionId ??
            contractVersionId({
              sourceType: contract.sourceType,
              michelsonCode: contract.michelsonCode,
              solidityCode: contract.solidityCode,
              initialStorage: contract.initialStorage,
            }),
          deployments: Array.isArray(contract.deployments) ? contract.deployments : [],
        }))
      : [
          createProjectContract({
            title: 'Primary contract',
            domain: 'Core',
            role: project.contractAddress ? 'deployed contract' : 'platform',
            purpose: project.contractAddress
              ? 'Migrated from the original single-contract project state.'
              : 'Primary contract for this Kiln project.',
            relation: 'Root contract',
            sourceType: project.contractSourceType,
            michelsonCode: project.michelsonCode,
            solidityCode: project.solidityCode,
            initialStorage: project.initialStorage,
            clearanceId: project.clearanceId,
            abi: project.abi,
            e2eEntrypoint: project.e2eEntrypoint,
            e2eArgs: project.e2eArgs,
            lastWorkflow: project.lastWorkflow,
            lastSolidityCompile: project.lastSolidityCompile,
            deployments,
          }),
        ];
  const activeContractId =
    project.activeContractId && contracts.some((contract) => contract.id === project.activeContractId)
      ? project.activeContractId
      : contracts[0]?.id ?? '';
  const activeContract =
    contracts.find((contract) => contract.id === activeContractId) ?? contracts[0];
  return {
    ...project,
    contracts,
    activeContractId,
    contractSourceType: activeContract?.sourceType ?? project.contractSourceType,
    michelsonCode: activeContract?.michelsonCode ?? project.michelsonCode,
    solidityCode: activeContract?.solidityCode ?? project.solidityCode,
    initialStorage: activeContract?.initialStorage ?? project.initialStorage,
    clearanceId: activeContract?.clearanceId ?? project.clearanceId,
    abi: activeContract?.abi ?? project.abi,
    e2eEntrypoint: activeContract?.e2eEntrypoint ?? project.e2eEntrypoint,
    e2eArgs: activeContract?.e2eArgs ?? project.e2eArgs,
    contractAddress:
      activeContract?.deployments.find((deployment) => deployment.networkId === project.networkId)
        ?.address ??
      project.contractAddress,
    lastWorkflow: activeContract?.lastWorkflow ?? project.lastWorkflow,
    lastSolidityCompile: activeContract?.lastSolidityCompile ?? project.lastSolidityCompile,
    lastSurface: project.lastSurface ?? 'guided',
    lastGuidedStep: project.lastGuidedStep ?? 'setup',
    lastWorkbenchTool: project.lastWorkbenchTool ?? 'build',
  };
}

function createSavedProject(input: {
  name: string;
  networkId: KilnNetworkId;
}): SavedKilnProject {
  const now = new Date().toISOString();
  const primaryContract = createProjectContract();
  return {
    id: newProjectId(),
    name: input.name,
    createdAt: now,
    updatedAt: now,
    networkId: input.networkId,
    contractSourceType: 'michelson',
    michelsonCode: '',
    solidityCode: '',
    initialStorage: 'Unit',
    contractAddress: '',
    clearanceId: null,
    abi: [],
    e2eEntrypoint: '',
    e2eArgs: '[]',
    deployMode: 'connected',
    lastWorkflow: null,
    lastSolidityCompile: null,
    contracts: [primaryContract],
    activeContractId: primaryContract.id,
    lastSurface: 'guided',
    lastGuidedStep: 'setup',
    lastWorkbenchTool: 'build',
  };
}

function loadProjectStore(): KilnProjectStore {
  const fallback = createSavedProject({
    name: 'My Kiln Project',
    networkId: 'tezos-shadownet',
  });
  if (typeof window === 'undefined') {
    return { projects: [fallback], activeProjectId: fallback.id };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROJECT_STORE_KEY) ?? '{}') as Partial<KilnProjectStore>;
    const projects = Array.isArray(parsed.projects)
      ? (parsed.projects as SavedKilnProject[]).map(normalizeSavedProject)
      : [];
    if (projects.length === 0) {
      return { projects: [fallback], activeProjectId: fallback.id };
    }
    const activeProjectId =
      typeof parsed.activeProjectId === 'string' &&
      projects.some((project) => project.id === parsed.activeProjectId)
        ? parsed.activeProjectId
        : projects[0]?.id ?? fallback.id;
    return { projects: projects as SavedKilnProject[], activeProjectId };
  } catch {
    return { projects: [fallback], activeProjectId: fallback.id };
  }
}

function persistProjectStore(store: KilnProjectStore): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(PROJECT_STORE_KEY, JSON.stringify(store));
}

function normalizeProjectStoreCandidate(value: unknown): KilnProjectStore | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<KilnProjectStore>;
  if (!Array.isArray(candidate.projects)) {
    return null;
  }
  const projects = candidate.projects.flatMap((project) => {
    if (
      !project ||
      typeof project !== 'object' ||
      typeof (project as Partial<SavedKilnProject>).id !== 'string' ||
      typeof (project as Partial<SavedKilnProject>).name !== 'string'
    ) {
      return [];
    }
    try {
      return [normalizeSavedProject(project as SavedKilnProject)];
    } catch {
      return [];
    }
  });
  if (projects.length === 0) {
    return null;
  }
  const activeProjectId =
    typeof candidate.activeProjectId === 'string' &&
    projects.some((project) => project.id === candidate.activeProjectId)
      ? candidate.activeProjectId
      : projects[0]?.id ?? '';
  return { projects, activeProjectId };
}

function normalizeProjectStore(store: KilnProjectStore): KilnProjectStore {
  const normalized = normalizeProjectStoreCandidate(store);
  if (normalized) {
    return normalized;
  }
  const fallback = createSavedProject({
    name: 'My Kiln Project',
    networkId: 'tezos-shadownet',
  });
  return { projects: [fallback], activeProjectId: fallback.id };
}

function isKilnAuthSession(value: unknown): value is KilnAuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<KilnAuthSession>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.expiresAt === 'string' &&
    Boolean(candidate.user) &&
    typeof candidate.user?.walletAddress === 'string' &&
    (candidate.user?.walletKind === 'tezos' || candidate.user?.walletKind === 'evm')
  );
}

function loadAuthSession(): KilnAuthSession | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY) ?? 'null') as unknown;
    if (!isKilnAuthSession(parsed)) {
      return null;
    }
    const expiresAt = Date.parse(parsed.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
}

function persistAuthSession(session: KilnAuthSession): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function clearAuthSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

function loadUserHandle(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(USER_HANDLE_KEY) ?? '';
}

function persistUserHandle(handle: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(USER_HANDLE_KEY, handle);
}

function loadLinkedWallets(): LinkedKilnWallet[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LINKED_WALLETS_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as LinkedKilnWallet[]) : [];
  } catch {
    return [];
  }
}

function persistLinkedWallets(wallets: LinkedKilnWallet[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(LINKED_WALLETS_KEY, JSON.stringify(wallets));
}

function linkedWalletId(kind: KilnWalletKind, address: string, networkId: string): string {
  return `${kind}:${networkId}:${address.toLowerCase()}`;
}

function surfaceFromHash(hash: string): SurfaceKey {
  if (hash === 'dashboard') {
    return 'dashboard';
  }
  if (hash === 'settings' || hash === 'account') {
    return 'account';
  }
  if (hash === 'workbench' || hash.startsWith('tool-')) {
    return 'workbench';
  }
  return 'guided';
}

function guidedStepFromHash(hash: string): TabKey {
  if (hash.startsWith('guided-')) {
    const step = hash.replace('guided-', '');
    return isTabKey(step) ? step : 'setup';
  }
  return isTabKey(hash) ? hash : 'setup';
}

function workbenchToolFromHash(hash: string): WorkbenchToolKey {
  const raw = hash.startsWith('tool-') ? hash.replace('tool-', '') : hash;
  return isWorkbenchToolKey(raw) ? raw : 'build';
}

function routeHash(surface: SurfaceKey, guidedStep: TabKey, workbenchTool: WorkbenchToolKey): string {
  if (surface === 'dashboard') {
    return 'dashboard';
  }
  if (surface === 'account') {
    return 'account';
  }
  if (surface === 'workbench') {
    return `tool-${workbenchTool}`;
  }
  return guidedStep === 'setup' ? 'guided' : `guided-${guidedStep}`;
}

export default function App() {
  const { mode, setMode, t, tip } = useKilnView();
  const { networkId, network, isTezos, isEvm, can, requestNetworkChange } = useKilnNetwork();

  const [projectStore, setProjectStore] = useState<KilnProjectStore>(() =>
    loadProjectStore(),
  );
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
  const [authSession, setAuthSession] = useState<KilnAuthSession | null>(() =>
    loadAuthSession(),
  );
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isMcpLoggingIn, setIsMcpLoggingIn] = useState(false);
  const [isRequestingMcpAccess, setIsRequestingMcpAccess] = useState(false);
  const [isGeneratingMcpToken, setIsGeneratingMcpToken] = useState(false);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
  const [isLoadingContract, setIsLoadingContract] = useState(false);
  const [discoveredContracts, setDiscoveredContracts] = useState<DiscoveredTezosContract[]>([]);
  const [isDiscoveringContracts, setIsDiscoveringContracts] = useState(false);
  const [contractDiscoveryError, setContractDiscoveryError] = useState<string | null>(null);
  const [userHandle, setUserHandleState] = useState(() => loadUserHandle());
  const [userHandleDraft, setUserHandleDraft] = useState(() => loadUserHandle());
  const [isSavingUserHandle, setIsSavingUserHandle] = useState(false);
  const [linkedWallets, setLinkedWallets] = useState<LinkedKilnWallet[]>(() =>
    loadLinkedWallets(),
  );
  const [activeSurface, setActiveSurface] = useState<SurfaceKey>(() => {
    if (typeof window === 'undefined') {
      return 'guided';
    }
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      return surfaceFromHash(hash);
    }
    const lastProject =
      projectStore.projects.find((project) => project.id === projectStore.activeProjectId) ??
      projectStore.projects[0];
    return lastProject?.lastSurface ?? 'guided';
  });
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') {
      return 'setup';
    }
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      return guidedStepFromHash(hash);
    }
    const lastProject =
      projectStore.projects.find((project) => project.id === projectStore.activeProjectId) ??
      projectStore.projects[0];
    return lastProject?.lastGuidedStep ?? 'setup';
  });
  const [activeTool, setActiveTool] = useState<WorkbenchToolKey>(() => {
    if (typeof window === 'undefined') {
      return 'build';
    }
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      return workbenchToolFromHash(hash);
    }
    const lastProject =
      projectStore.projects.find((project) => project.id === projectStore.activeProjectId) ??
      projectStore.projects[0];
    return lastProject?.lastWorkbenchTool ?? 'build';
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
  const pendingProjectHydrationRef = useRef<SavedKilnProject | null>(null);
  const hydratingProjectRef = useRef(false);
  const projectSyncTimerRef = useRef<number | null>(null);
  const projectSyncReadyRef = useRef(false);
  const loadingRemoteProjectStoreRef = useRef(false);
  const lastRemoteProjectSyncRef = useRef('');
  const apiToken = getApiToken();
  const activeProject =
    projectStore.projects.find((project) => project.id === projectStore.activeProjectId) ??
    projectStore.projects[0];
  const activeContract =
    activeProject?.contracts.find((contract) => contract.id === activeProject.activeContractId) ??
    activeProject?.contracts[0];
  const discoveredContractsWithProjects = useMemo<DiscoveredTezosContractWithProject[]>(
    () =>
      discoveredContracts.map((contract) => {
        const project = projectStore.projects.find(
          (candidate) =>
            candidate.networkId === networkId &&
            candidate.contracts.some((item) =>
              item.deployments.some(
                (deployment) =>
                  deployment.networkId === networkId &&
                  deployment.address === contract.address,
              ),
            ),
        );
        return {
          ...contract,
          projectName: project?.name ?? null,
          projectId: project?.id ?? null,
        };
      }),
    [discoveredContracts, projectStore.projects, networkId],
  );

  const buildHeaders = (includeJson = false): HeadersInit => {
    const headers: Record<string, string> = {};
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    const requestToken = apiKey ?? apiToken;
    if (requestToken) {
      headers['x-kiln-token'] = requestToken;
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
    if (message && hadWallet) {
      addLog(message, 'info');
    }
  };

  const applyProjectState = (project: SavedKilnProject) => {
    const normalized = normalizeSavedProject(project);
    const projectContract =
      normalized.contracts.find((contract) => contract.id === normalized.activeContractId) ??
      normalized.contracts[0];
    hydratingProjectRef.current = true;
    setContractSourceType(projectContract?.sourceType ?? normalized.contractSourceType);
    setMichelsonCode(projectContract?.michelsonCode ?? normalized.michelsonCode);
    setSolidityCode(projectContract?.solidityCode ?? normalized.solidityCode);
    setInitialStorage(projectContract?.initialStorage || normalized.initialStorage || 'Unit');
    setContractAddress(
      projectContract?.deployments.find((deployment) => deployment.networkId === normalized.networkId)
        ?.address ??
        normalized.contractAddress,
    );
    setClearanceId(projectContract?.clearanceId ?? normalized.clearanceId);
    setAbi(projectContract?.abi ?? normalized.abi ?? []);
    setE2EEntrypoint(projectContract?.e2eEntrypoint ?? normalized.e2eEntrypoint);
    setE2EArgs(projectContract?.e2eArgs || normalized.e2eArgs || '[]');
    setDeployMode(normalized.deployMode);
    setLastWorkflow(projectContract?.lastWorkflow ?? normalized.lastWorkflow);
    setLastSolidityCompile(projectContract?.lastSolidityCompile ?? normalized.lastSolidityCompile);
    window.setTimeout(() => {
      hydratingProjectRef.current = false;
    }, 0);
  };

  const snapshotActiveProject = (): SavedKilnProject => {
    const base = activeProject ?? createSavedProject({ name: 'My Kiln Project', networkId: network.id });
    const normalized = normalizeSavedProject(base);
    const activeContractId = normalized.activeContractId || normalized.contracts[0]?.id;
    const versionId = contractVersionId({
      sourceType: contractSourceType,
      michelsonCode,
      solidityCode,
      initialStorage,
    });
    const contracts = normalized.contracts.map((contract) =>
      contract.id === activeContractId
        ? {
            ...contract,
            updatedAt: new Date().toISOString(),
            sourceType: contractSourceType,
            michelsonCode,
            solidityCode,
            initialStorage,
            clearanceId,
            abi,
            e2eEntrypoint,
            e2eArgs,
            lastWorkflow,
            lastSolidityCompile,
            currentVersionId: versionId,
          }
        : contract,
    );
    return {
      ...normalized,
      updatedAt: new Date().toISOString(),
      networkId: network.id,
      contractSourceType,
      michelsonCode,
      solidityCode,
      initialStorage,
      contractAddress,
      clearanceId,
      abi,
      e2eEntrypoint,
      e2eArgs,
      deployMode,
      lastWorkflow,
      lastSolidityCompile,
      contracts,
      activeContractId: activeContractId ?? normalized.activeContractId,
      lastSurface:
        activeSurface === 'workbench' || activeSurface === 'guided'
          ? activeSurface
          : normalized.lastSurface,
      lastGuidedStep: activeTab,
      lastWorkbenchTool: activeTool,
    };
  };

  const updateProjectStore = (updater: (store: KilnProjectStore) => KilnProjectStore) => {
    setProjectStore((prev) => {
      const next = updater(prev);
      persistProjectStore(next);
      return next;
    });
  };

  const rememberLinkedWallet = (wallet: Omit<LinkedKilnWallet, 'id' | 'addedAt'>) => {
    setLinkedWallets((prev) => {
      const id = linkedWalletId(wallet.kind, wallet.address, wallet.networkId);
      const existing = prev.find((candidate) => candidate.id === id);
      const nextWallet: LinkedKilnWallet = {
        ...wallet,
        id,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
        verifiedAt: wallet.verifiedAt ?? existing?.verifiedAt,
        source: wallet.source === 'signed' ? 'signed' : existing?.source ?? wallet.source,
      };
      const next = [
        nextWallet,
        ...prev.filter((candidate) => candidate.id !== id),
      ];
      persistLinkedWallets(next);
      return next;
    });
  };

  const mergeAccountLinkedWallets = (wallets: KilnAuthLinkedWallet[] | undefined) => {
    if (!wallets?.length) {
      return;
    }
    setLinkedWallets((prev) => {
      const incoming = wallets.map((wallet) => {
        const networkLabel =
          wallet.networkId === network.id ? network.label : wallet.networkId ?? 'Kiln account';
        const next: LinkedKilnWallet = {
          id: linkedWalletId(
            wallet.walletKind,
            wallet.walletAddress,
            wallet.networkId ?? 'account',
          ),
          kind: wallet.walletKind,
          address: wallet.walletAddress,
          networkId: wallet.networkId ?? 'account',
          label: wallet.label ?? networkLabel,
          addedAt: wallet.addedAt,
          verifiedAt: wallet.verifiedAt,
          source: 'signed',
        };
        return next;
      });
      const incomingIds = new Set(incoming.map((wallet) => wallet.id));
      const next = [
        ...incoming,
        ...prev.filter((wallet) => !incomingIds.has(wallet.id)),
      ];
      persistLinkedWallets(next);
      return next;
    });
  };

  const syncAccountIdentityFromUser = (user: KilnAuthUser) => {
    if (typeof user.handle === 'string') {
      const handle = user.handle.trim();
      setUserHandleState(handle);
      setUserHandleDraft(handle);
      persistUserHandle(handle);
    }
    mergeAccountLinkedWallets(user.linkedWallets);
  };

  const removeLinkedWallet = (walletId: string) => {
    setLinkedWallets((prev) => {
      const next = prev.filter((wallet) => wallet.id !== walletId);
      persistLinkedWallets(next);
      return next;
    });
  };

  const applyContractState = (contract: KilnProjectContractItem, projectNetworkId = network.id) => {
    hydratingProjectRef.current = true;
    setContractSourceType(contract.sourceType);
    setMichelsonCode(contract.michelsonCode);
    setSolidityCode(contract.solidityCode);
    setInitialStorage(contract.initialStorage || 'Unit');
    setContractAddress(
      contract.deployments.find((deployment) => deployment.networkId === projectNetworkId)?.address ?? '',
    );
    setClearanceId(contract.clearanceId);
    setAbi(contract.abi ?? []);
    setE2EEntrypoint(contract.e2eEntrypoint);
    setE2EArgs(contract.e2eArgs || '[]');
    setLastWorkflow(contract.lastWorkflow);
    setLastSolidityCompile(contract.lastSolidityCompile);
    window.setTimeout(() => {
      hydratingProjectRef.current = false;
    }, 0);
  };

  const createContractForActiveProject = () => {
    const project = activeProject;
    if (!project) {
      return;
    }
    const nextContract = createProjectContract({
      title: `Contract ${project.contracts.length + 1}`,
      domain: 'Core',
      role: 'component',
      purpose: 'Describe what this contract does for the project.',
      relation: 'Related to the project root',
    });
    updateProjectStore((prev) => ({
      ...prev,
      projects: prev.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              updatedAt: new Date().toISOString(),
              activeContractId: nextContract.id,
              contracts: [...candidate.contracts, nextContract],
            }
          : candidate,
      ),
    }));
    applyContractState(nextContract, project.networkId);
    addLog(`Created project contract item: ${nextContract.title}`, 'success');
  };

  const selectProjectContract = (contractId: string) => {
    const project = activeProject;
    const contract = project?.contracts.find((candidate) => candidate.id === contractId);
    if (!project || !contract) {
      return;
    }
    updateProjectStore((prev) => ({
      ...prev,
      projects: prev.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              updatedAt: new Date().toISOString(),
              activeContractId: contract.id,
            }
          : candidate,
      ),
    }));
    applyContractState(contract, project.networkId);
    addLog(`Loaded contract item: ${contract.title}`, 'info');
  };

  const updateActiveContractMetadata = (
    patch: Partial<Pick<KilnProjectContractItem, 'title' | 'domain' | 'role' | 'purpose' | 'relation'>>,
  ) => {
    const project = activeProject;
    if (!project) {
      return;
    }
    updateProjectStore((prev) => ({
      ...prev,
      projects: prev.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              updatedAt: new Date().toISOString(),
              contracts: candidate.contracts.map((contract) =>
                contract.id === candidate.activeContractId
                  ? { ...contract, ...patch, updatedAt: new Date().toISOString() }
                  : contract,
              ),
            }
          : candidate,
      ),
    }));
  };

  const associateDeploymentWithActiveContract = (
    address: string,
    deploymentNetworkId: KilnNetworkId,
    origin: KilnContractDeployment['origin'],
  ) => {
    const trimmed = address.trim();
    if (!trimmed || !activeProject) {
      return;
    }
    const sourceHash = contractVersionId({
      sourceType: contractSourceType,
      michelsonCode,
      solidityCode,
      initialStorage,
    });
    const deployment: KilnContractDeployment = {
      id: deploymentId(deploymentNetworkId, trimmed),
      networkId: deploymentNetworkId,
      address: trimmed,
      deployedAt: new Date().toISOString(),
      versionId: sourceHash,
      sourceHash,
      origin,
    };
    updateProjectStore((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => {
        if (project.id !== activeProject.id) {
          return project;
        }
        const contracts = project.contracts.map((contract) =>
          contract.id === project.activeContractId
            ? {
                ...contract,
                updatedAt: new Date().toISOString(),
                sourceType: contractSourceType,
                michelsonCode,
                solidityCode,
                initialStorage,
                clearanceId,
                abi,
                e2eEntrypoint,
                e2eArgs,
                lastWorkflow,
                lastSolidityCompile,
                currentVersionId: sourceHash,
                deployments: [
                  deployment,
                  ...contract.deployments.filter(
                    (candidate) => candidate.networkId !== deploymentNetworkId,
                  ),
                ],
              }
            : contract,
        );
        return {
          ...project,
          updatedAt: new Date().toISOString(),
          networkId: deploymentNetworkId,
          contractAddress: trimmed,
          contractSourceType,
          michelsonCode,
          solidityCode,
          initialStorage,
          clearanceId,
          abi,
          e2eEntrypoint,
          e2eArgs,
          lastWorkflow,
          lastSolidityCompile,
          contracts,
        };
      }),
    }));
  };

  const createNewProject = () => {
    const project = createSavedProject({
      name: `Kiln Project ${projectStore.projects.length + 1}`,
      networkId: network.id,
    });
    updateProjectStore((prev) => ({
      projects: [...prev.projects, project],
      activeProjectId: project.id,
    }));
    setActiveSurface('guided');
    setActiveTab('setup');
    setActiveTool('build');
    applyProjectState(project);
    addLog(`Created project: ${project.name}`, 'success');
  };

  const renameActiveProject = (name: string) => {
    updateProjectStore((prev) => ({
      ...prev,
      projects: prev.projects.map((project) =>
        project.id === prev.activeProjectId
          ? { ...project, name, updatedAt: new Date().toISOString() }
          : project,
      ),
    }));
  };

  const selectProject = (projectId: string) => {
    const project = projectStore.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      return;
    }
    const normalized = normalizeSavedProject(project);
    updateProjectStore((prev) => ({
      ...prev,
      activeProjectId: normalized.id,
      projects: prev.projects.map((candidate) =>
        candidate.id === normalized.id ? normalized : candidate,
      ),
    }));
    setActiveSurface(normalized.lastSurface);
    setActiveTab(normalized.lastGuidedStep);
    setActiveTool(normalized.lastWorkbenchTool);
    pendingProjectHydrationRef.current = normalized;
    if (normalized.networkId !== networkId) {
      requestNetworkChange(normalized.networkId);
      return;
    }
    pendingProjectHydrationRef.current = null;
    applyProjectState(normalized);
    addLog(`Loaded project: ${normalized.name}`, 'info');
  };

  const buildSessionHeaders = (
    includeJson: boolean,
    session: KilnAuthSession,
  ): HeadersInit => {
    const headers = buildHeaders(includeJson) as Record<string, string>;
    headers.authorization = `Bearer ${session.token}`;
    return headers;
  };

  const handleAccountSessionExpired = (message: string) => {
    setAuthSession(null);
    setMcpToken(null);
    setApiKey(null);
    projectSyncReadyRef.current = false;
    lastRemoteProjectSyncRef.current = '';
    if (projectSyncTimerRef.current) {
      window.clearTimeout(projectSyncTimerRef.current);
      projectSyncTimerRef.current = null;
    }
    addLog(message, 'info');
  };

  const applySyncedProjectStore = (store: KilnProjectStore, message?: string) => {
    const normalized = normalizeProjectStore(store);
    setProjectStore(normalized);
    persistProjectStore(normalized);

    const project =
      normalized.projects.find((candidate) => candidate.id === normalized.activeProjectId) ??
      normalized.projects[0];
    if (project) {
      setActiveSurface(project.lastSurface);
      setActiveTab(project.lastGuidedStep);
      setActiveTool(project.lastWorkbenchTool);
      pendingProjectHydrationRef.current = project;
      if (project.networkId !== networkId) {
        requestNetworkChange(project.networkId);
      } else {
        pendingProjectHydrationRef.current = null;
        applyProjectState(project);
      }
    }
    if (message) {
      addLog(message, 'success');
    }
  };

  const saveAccountProjectStore = async (
    session: KilnAuthSession,
    store: KilnProjectStore,
    force = false,
  ): Promise<boolean> => {
    const normalized = normalizeProjectStore(store);
    const serialized = JSON.stringify(normalized);
    if (!force && serialized === lastRemoteProjectSyncRef.current) {
      return true;
    }

    const response = await fetch('/api/kiln/projects', {
      method: 'PUT',
      headers: buildSessionHeaders(true, session),
      body: JSON.stringify({ projectStore: normalized }),
    });
    const payload = (await response.json().catch(() => ({}))) as
      | { success?: true; updatedAt?: string | null; error?: string }
      | { error?: string };

    if (response.status === 401) {
      handleAccountSessionExpired('Kiln account session expired. Verify the wallet again to resume account sync.');
      return false;
    }
    if (!response.ok) {
      throw new Error(payload.error ?? `Project sync failed (HTTP ${response.status}).`);
    }

    lastRemoteProjectSyncRef.current = serialized;
    if ('updatedAt' in payload && payload.updatedAt) {
      setAuthSession((prev) =>
        prev?.token === session.token
          ? {
              ...prev,
              user: {
                ...prev.user,
                projectStoreUpdatedAt: payload.updatedAt,
              },
            }
          : prev,
      );
    }
    return true;
  };

  const loadAccountProjectStore = async (
    session: KilnAuthSession,
    localStore: KilnProjectStore,
  ) => {
    let readyAfterLoad = true;
    loadingRemoteProjectStoreRef.current = true;
    projectSyncReadyRef.current = false;
    try {
      const accountResponse = await fetch('/api/kiln/me', {
        headers: buildSessionHeaders(false, session),
      });
      const accountPayload = (await accountResponse.json().catch(() => ({}))) as
        | { user?: KilnAuthUser; error?: string }
        | { error?: string };
      if (accountResponse.status === 401) {
        readyAfterLoad = false;
        handleAccountSessionExpired('Kiln account session expired. Verify the wallet again to load saved projects.');
        return;
      }
      if (!accountResponse.ok) {
        throw new Error(accountPayload.error ?? `Account refresh failed (HTTP ${accountResponse.status}).`);
      }
      if ('user' in accountPayload && accountPayload.user) {
        syncAccountIdentityFromUser(accountPayload.user as KilnAuthUser);
        setAuthSession((prev) =>
          prev?.token === session.token ? { ...prev, user: accountPayload.user as KilnAuthUser } : prev,
        );
      }

      const response = await fetch('/api/kiln/projects', {
        headers: buildSessionHeaders(false, session),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | {
            success?: true;
            projectStore?: unknown;
            updatedAt?: string | null;
            error?: string;
          }
        | { error?: string };
      if (response.status === 401) {
        readyAfterLoad = false;
        handleAccountSessionExpired('Kiln account session expired. Verify the wallet again to load saved projects.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? `Project load failed (HTTP ${response.status}).`);
      }

      if ('projectStore' in payload && payload.projectStore) {
        const remoteStore = normalizeProjectStoreCandidate(payload.projectStore);
        if (remoteStore) {
          lastRemoteProjectSyncRef.current = JSON.stringify(remoteStore);
          applySyncedProjectStore(remoteStore, 'Loaded account project state.');
          return;
        }
        addLog('Saved account project state was unreadable, so Kiln kept this browser workspace.', 'error');
      }

      const normalizedLocal = normalizeProjectStore(localStore);
      const saved = await saveAccountProjectStore(session, normalizedLocal, true);
      if (!saved) {
        readyAfterLoad = false;
        return;
      }
      lastRemoteProjectSyncRef.current = JSON.stringify(normalizedLocal);
      addLog('Initialized account project state from this browser workspace.', 'success');
    } catch (error) {
      addLog(
        `Account project sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      loadingRemoteProjectStoreRef.current = false;
      projectSyncReadyRef.current = readyAfterLoad && Boolean(session.token);
    }
  };

  useEffect(() => {
    connectedWalletRef.current = connectedWallet;
  }, [connectedWallet]);

  useEffect(() => {
    if (authSession) {
      persistAuthSession(authSession);
    } else {
      clearAuthSession();
    }
  }, [authSession]);

  useEffect(() => {
    if (!authSession) {
      projectSyncReadyRef.current = false;
      lastRemoteProjectSyncRef.current = '';
      if (projectSyncTimerRef.current) {
        window.clearTimeout(projectSyncTimerRef.current);
        projectSyncTimerRef.current = null;
      }
      return;
    }
    const expiresAt = Date.parse(authSession.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      handleAccountSessionExpired('Kiln account session expired. Verify the wallet again to resume account sync.');
      return;
    }
    void loadAccountProjectStore(authSession, projectStore);
  }, [authSession?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !authSession ||
      !projectSyncReadyRef.current ||
      loadingRemoteProjectStoreRef.current
    ) {
      return;
    }
    const normalized = normalizeProjectStore(projectStore);
    const serialized = JSON.stringify(normalized);
    if (serialized === lastRemoteProjectSyncRef.current) {
      return;
    }
    if (projectSyncTimerRef.current) {
      window.clearTimeout(projectSyncTimerRef.current);
    }
    projectSyncTimerRef.current = window.setTimeout(() => {
      projectSyncTimerRef.current = null;
      void saveAccountProjectStore(authSession, normalized).catch((error) => {
        addLog(
          `Account project sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
      });
    }, 800);

    return () => {
      if (projectSyncTimerRef.current) {
        window.clearTimeout(projectSyncTimerRef.current);
        projectSyncTimerRef.current = null;
      }
    };
  }, [authSession?.token, projectStore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll terminal to bottom on new logs.
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Sync the current product surface with the URL hash so deep-links land on
  // guided steps, standalone tools, or account settings.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.hash = routeHash(activeSurface, activeTab, activeTool);
  }, [activeSurface, activeTab, activeTool]);

  useEffect(() => {
    const handler = () => {
      const next = window.location.hash.replace('#', '');
      const surface = surfaceFromHash(next);
      setActiveSurface(surface);
      if (surface === 'guided') {
        setActiveTab(guidedStepFromHash(next));
      }
      if (surface === 'workbench') {
        setActiveTool(workbenchToolFromHash(next));
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
    const pending = pendingProjectHydrationRef.current;
    if (!pending || pending.networkId !== networkId) {
      return;
    }
    pendingProjectHydrationRef.current = null;
    applyProjectState(pending);
    addLog(`Loaded project: ${pending.name}`, 'info');
  }, [networkId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isTezos || !connectedWallet) {
      setDiscoveredContracts([]);
      setContractDiscoveryError(null);
      return;
    }
    void discoverConnectedWalletContracts(false);
  }, [isTezos, networkId, connectedWallet?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeProject) {
      return;
    }
    pendingProjectHydrationRef.current = activeProject;
    if (activeProject.networkId !== networkId) {
      requestNetworkChange(activeProject.networkId);
      return;
    }
    pendingProjectHydrationRef.current = null;
    applyProjectState(activeProject);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hydratingProjectRef.current || !activeProject) {
      return;
    }
    setProjectStore((prev) => {
      const snapshot = snapshotActiveProject();
      const next = {
        activeProjectId: prev.activeProjectId,
        projects: prev.projects.map((project) =>
          project.id === prev.activeProjectId ? snapshot : project,
        ),
      };
      persistProjectStore(next);
      return next;
    });
  }, [
    network.id,
    contractSourceType,
    michelsonCode,
    solidityCode,
    initialStorage,
    contractAddress,
    clearanceId,
    abi,
    e2eEntrypoint,
    e2eArgs,
    deployMode,
    lastWorkflow,
    lastSolidityCompile,
    activeSurface,
    activeTab,
    activeTool,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeProject || (activeSurface !== 'guided' && activeSurface !== 'workbench')) {
      return;
    }
    setProjectStore((prev) => {
      const next = {
        ...prev,
        projects: prev.projects.map((project) =>
          project.id === prev.activeProjectId
            ? {
                ...project,
                updatedAt: new Date().toISOString(),
                lastSurface: activeSurface,
                lastGuidedStep: activeTab,
                lastWorkbenchTool: activeTool,
              }
            : project,
        ),
      };
      persistProjectStore(next);
      return next;
    });
  }, [activeSurface, activeTab, activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

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
          networkId: session.networkId,
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
        networkId: wallet.networkId,
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

  const discoverConnectedWalletContracts = async (showEmptyLog = false) => {
    if (!isTezos || !connectedWallet) {
      setDiscoveredContracts([]);
      setContractDiscoveryError(null);
      return;
    }

    setIsDiscoveringContracts(true);
    setContractDiscoveryError(null);
    try {
      const params = new URLSearchParams({
        networkId,
        walletAddress: connectedWallet.address,
        limit: '25',
      });
      const response = await fetch(`/api/kiln/contracts/discover?${params.toString()}`, {
        headers: buildHeaders(),
      });
      const payload = (await response.json()) as
        | {
            success: true;
            contracts: DiscoveredTezosContract[];
            error?: string;
          }
        | { error?: string };
      if (!response.ok || !('contracts' in payload)) {
        throw new Error(payload.error ?? 'Contract discovery failed.');
      }

      setDiscoveredContracts(payload.contracts);
      if (payload.contracts.length > 0) {
        addLog(
          `Discovered ${payload.contracts.length} contract(s) originated by ${connectedWallet.address}.`,
          'success',
        );
      } else if (showEmptyLog) {
        addLog(`No previous contracts found for ${connectedWallet.address} on ${network.label}.`, 'info');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown contract discovery error';
      setDiscoveredContracts([]);
      setContractDiscoveryError(message);
      addLog(`Contract discovery failed: ${message}`, 'error');
    } finally {
      setIsDiscoveringContracts(false);
    }
  };

  const loadExistingContract = async (address: string) => {
    const trimmed = address.trim();
    if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
      addLog('Enter a valid KT1 contract address before loading tests.', 'error');
      return;
    }
    setIsLoadingContract(true);
    try {
      const response = await fetch(
        `/api/kiln/contracts/introspect?networkId=${networkId}&contractAddress=${encodeURIComponent(trimmed)}`,
        { headers: buildHeaders() },
      );
      const payload = (await response.json()) as
        | ContractIntrospectionResponse
        | { error?: string };
      if (!response.ok || !('entrypoints' in payload)) {
        throw new Error(
          'error' in payload && payload.error
            ? payload.error
            : 'Contract introspection failed.',
        );
      }
      setContractAddress(payload.contractAddress);
      setAbi(payload.entrypoints);
      setE2EEntrypoint(payload.entrypoints[0]?.name ?? '');
      associateDeploymentWithActiveContract(payload.contractAddress, networkId, 'imported');
      addLog(
        `Loaded ${payload.entrypoints.length} entrypoint(s) from ${payload.contractAddress}.`,
        'success',
      );
    } catch (error) {
      addLog(
        `Contract load failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsLoadingContract(false);
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
        networkId: wallet.networkId,
        networkName: wallet.networkName,
        rpcUrl: wallet.rpcUrl,
        target: 'beacon' as const,
      };
      connectedWalletRef.current = next;
      setConnectedWallet(next);
      rememberLinkedWallet({
        kind: 'tezos',
        address: wallet.address,
        networkId: wallet.networkId,
        label: wallet.networkName ?? network.label,
        source: 'connected',
      });
      addLog(`Connected wallet ${wallet.address} on ${network.label}.`, 'success');
    } catch (error) {
      addLog(
        `Wallet connection failed: ${describeBrowserNetworkError(
          'Beacon wallet connection',
          error,
        )}`,
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

  const sessionHeaders = (
    includeJson = false,
    session: KilnAuthSession | null = authSession,
  ): HeadersInit => {
    const headers = buildHeaders(includeJson) as Record<string, string>;
    if (session?.token) {
      headers.authorization = `Bearer ${session.token}`;
    }
    return headers;
  };

  const accountSessionIsActive = (session: KilnAuthSession | null): boolean => {
    if (!session) {
      return false;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  };

  const saveUserHandle = async () => {
    const handle = userHandleDraft.trim();
    const session = authSession;
    setIsSavingUserHandle(true);
    try {
      setUserHandleState(handle);
      setUserHandleDraft(handle);
      persistUserHandle(handle);

      if (!accountSessionIsActive(session) || !session) {
        addLog(handle ? 'Saved handle locally.' : 'Cleared local handle.', 'success');
        return;
      }

      const response = await fetch('/api/kiln/me', {
        method: 'PUT',
        headers: sessionHeaders(true, session),
        body: JSON.stringify({ handle }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { user?: KilnAuthUser; error?: string }
        | { error?: string };
      if (response.status === 401) {
        handleAccountSessionExpired('Kiln account session expired. Log in again to save account settings.');
        return;
      }
      if (!response.ok || !('user' in payload) || !payload.user) {
        throw new Error(payload.error ?? 'Unable to save account profile.');
      }
      const nextSession = { ...session, user: payload.user };
      setAuthSession(nextSession);
      syncAccountIdentityFromUser(payload.user);
      addLog(handle ? 'Saved handle to Kiln account.' : 'Cleared Kiln account handle.', 'success');
    } catch (error) {
      addLog(
        `Handle save failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsSavingUserHandle(false);
    }
  };

  const logoutAccount = () => {
    setAuthSession(null);
    setMcpToken(null);
    setApiKey(null);
    projectSyncReadyRef.current = false;
    lastRemoteProjectSyncRef.current = '';
    if (projectSyncTimerRef.current) {
      window.clearTimeout(projectSyncTimerRef.current);
      projectSyncTimerRef.current = null;
    }
    addLog('Logged out of Kiln account. Connected wallet stayed available for signing.', 'info');
  };

  const loginWalletForKiln = async (
    evmTarget: EvmWalletTarget = 'auto',
  ): Promise<KilnAuthSession> => {
    let walletKind: KilnWalletKind;
    let walletAddress: string;
    let signature: string;
    let publicKey: string | undefined;

    if (isTezos) {
      if (!connectedWallet) {
        throw new Error('Connect a Tezos wallet before verifying a Kiln account.');
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
      if (signed.address !== walletAddress) {
        throw new Error(
          `Signed wallet ${signed.address} does not match connected Settings wallet ${walletAddress}. Reconnect before signing.`,
        );
      }
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

    const nextSession = {
      token: verified.sessionToken,
      expiresAt: verified.expiresAt,
      user: verified.user,
    };
    setAuthSession(nextSession);
    syncAccountIdentityFromUser(verified.user);
    rememberLinkedWallet({
      kind: verified.user.lastLoginWalletKind ?? verified.user.walletKind,
      address: verified.user.lastLoginWalletAddress ?? verified.user.walletAddress,
      networkId: verified.user.lastLoginNetworkId ?? networkId,
      label: network.label,
      source: 'signed',
      verifiedAt: new Date().toISOString(),
    });
    addLog(
      `Kiln account login active: ${
        verified.user.lastLoginWalletAddress ?? verified.user.walletAddress
      }.`,
      'success',
    );
    return nextSession;
  };

  const startMcpWalletLogin = async (evmTarget: EvmWalletTarget = 'auto') => {
    setIsMcpLoggingIn(true);
    setMcpToken(null);
    try {
      await loginWalletForKiln(evmTarget);
    } catch (error) {
      addLog(
        `Wallet verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsMcpLoggingIn(false);
    }
  };

  const linkConnectedWalletToAccount = async () => {
    if (!connectedWallet) {
      addLog('Connect a Tezos wallet before linking it to an account.', 'error');
      return;
    }

    rememberLinkedWallet({
      kind: 'tezos',
      address: connectedWallet.address,
      networkId: connectedWallet.networkId,
      label: connectedWallet.networkName ?? network.label,
      source: 'connected',
    });

    const session = authSession;
    if (!accountSessionIsActive(session) || !session) {
      addLog(
        'Linked wallet in this browser. Log in to Kiln before associating it with your account.',
        'info',
      );
      return;
    }

    try {
      const challengeResponse = await fetch('/api/kiln/auth/challenge', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          walletKind: 'tezos',
          walletAddress: connectedWallet.address,
          networkId: connectedWallet.networkId,
        }),
      });
      const challenge = (await challengeResponse.json()) as
        | { challengeId: string; message: string; error?: string }
        | { error?: string };
      if (!challengeResponse.ok || !('challengeId' in challenge)) {
        throw new Error(challenge.error ?? 'Unable to create wallet link challenge.');
      }

      const { signKilnAuthChallenge } = await import('./lib/shadownet-wallet');
      const signed = await signKilnAuthChallenge(challenge.message, connectedWallet.networkId);
      if (signed.address !== connectedWallet.address) {
        throw new Error(
          `Signed wallet ${signed.address} does not match connected wallet ${connectedWallet.address}.`,
        );
      }

      const response = await fetch('/api/kiln/wallets/link', {
        method: 'POST',
        headers: sessionHeaders(true, session),
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          signature: signed.signature,
          publicKey: signed.publicKey,
          label: connectedWallet.networkName ?? network.label,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { user?: KilnAuthUser; error?: string }
        | { error?: string };
      if (response.status === 401) {
        handleAccountSessionExpired('Kiln account session expired. Log in again before linking wallets.');
        return;
      }
      if (!response.ok || !('user' in payload) || !payload.user) {
        throw new Error(payload.error ?? 'Unable to link wallet to account.');
      }
      const nextSession = { ...session, user: payload.user };
      setAuthSession(nextSession);
      syncAccountIdentityFromUser(payload.user);
      rememberLinkedWallet({
        kind: 'tezos',
        address: connectedWallet.address,
        networkId: connectedWallet.networkId,
        label: connectedWallet.networkName ?? network.label,
        source: 'signed',
        verifiedAt: new Date().toISOString(),
      });
      addLog(`Associated ${connectedWallet.address} with this Kiln account.`, 'success');
    } catch (error) {
      addLog(
        `Wallet link failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    }
  };

  const ensureWalletLogin = async (
    evmTarget: EvmWalletTarget = 'auto',
  ): Promise<KilnAuthSession | null> => {
    if (accountSessionIsActive(authSession)) {
      return authSession;
    }

    setIsMcpLoggingIn(true);
    setMcpToken(null);
    setApiKey(null);
    try {
      addLog('Requesting a wallet signature for Kiln account access...', 'info');
      return await loginWalletForKiln(evmTarget);
    } catch (error) {
      addLog(
        `Wallet verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
      return null;
    } finally {
      setIsMcpLoggingIn(false);
    }
  };

  const requestMcpAccessForSession = async (
    session: KilnAuthSession,
  ): Promise<KilnAuthSession> => {
    const response = await fetch('/api/kiln/mcp/access/request', {
      method: 'POST',
      headers: sessionHeaders(true, session),
      body: JSON.stringify({}),
    });
    const payload = (await response.json()) as
      | { access: KilnAuthUser['access']; error?: string }
      | { error?: string };
    if (!response.ok || !('access' in payload) || payload.access.status !== 'approved') {
      throw new Error(payload.error ?? 'MCP access was not approved.');
    }

    const nextSession = {
      ...session,
      user: { ...session.user, access: payload.access },
    };
    setAuthSession(nextSession);
    addLog('MCP access approved by Kiln access worker.', 'success');
    return nextSession;
  };

  const requestMcpAccess = async () => {
    setIsRequestingMcpAccess(true);
    setMcpToken(null);
    try {
      const session = await ensureWalletLogin();
      if (!session) {
        return;
      }
      await requestMcpAccessForSession(session);
    } catch (error) {
      addLog(
        `MCP access request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsRequestingMcpAccess(false);
    }
  };

  const ensureApprovedAccess = async (): Promise<KilnAuthSession | null> => {
    const session = await ensureWalletLogin();
    if (!session) {
      return null;
    }
    if (session.user.access.status === 'approved') {
      return session;
    }
    setIsRequestingMcpAccess(true);
    try {
      return await requestMcpAccessForSession(session);
    } finally {
      setIsRequestingMcpAccess(false);
    }
  };

  const generateMcpToken = async () => {
    setIsGeneratingMcpToken(true);
    try {
      const session = await ensureApprovedAccess();
      if (!session) {
        return;
      }
      const response = await fetch('/api/kiln/mcp/token', {
        method: 'POST',
        headers: sessionHeaders(true, session),
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
      setAuthSession({ ...session, user: payload.user });
      syncAccountIdentityFromUser(payload.user);
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

  const generateApiKey = async () => {
    setIsGeneratingApiKey(true);
    try {
      const session = await ensureApprovedAccess();
      if (!session) {
        return;
      }
      const response = await fetch('/api/kiln/api-key', {
        method: 'POST',
        headers: sessionHeaders(true, session),
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
        throw new Error(payload.error ?? 'Unable to generate API key.');
      }
      setApiKey(payload.token);
      setAuthSession({ ...session, user: payload.user });
      syncAccountIdentityFromUser(payload.user);
      addLog(`API key generated; expires ${new Date(payload.expiresAt).toLocaleString()}.`, 'success');
    } catch (error) {
      addLog(
        `API key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsGeneratingApiKey(false);
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

  const copyApiKey = async () => {
    if (!apiKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(apiKey);
      addLog('API key copied to clipboard.', 'success');
    } catch {
      addLog('Clipboard copy failed. Select the API key text manually.', 'error');
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
      const parsedEntrypoints: AbiEntrypoint[] =
        payload.artifacts.entrypointMetadata ??
        payload.artifacts.entrypoints.map((name) => ({
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
        `Workflow error: ${describeBrowserNetworkError('Workflow validation', error)}`,
        'error',
      );
      return null;
    } finally {
      setIsValidating(false);
      setIsRunningWorkflow(false);
    }
  };

  const deployTezosWithPuppet = async (
    workflow: Pick<WorkflowRunResponse, 'artifacts' | 'clearance'>,
  ) => {
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
        allowShadownetDirectDeploy:
          network.id === 'tezos-shadownet' && !workflow.clearance.record?.id,
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
    associateDeploymentWithActiveContract(payload.contractAddress, networkId, 'deployed');
    addLog(`Deployed via Bert: ${payload.contractAddress}`, 'success');
  };

  const prepareTezosDeploymentArtifacts = async (
    code: string,
    storage: string,
  ): Promise<{ code: string; initialStorage: string }> => {
    const response = await fetch('/api/kiln/predeploy/validate', {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({
        networkId,
        code,
        initialStorage: storage,
      }),
    });
    const payload = (await response.json()) as PredeployValidationResponse | { error?: string };
    if (!response.ok || !('injectedCode' in payload)) {
      throw new Error(
        'error' in payload && payload.error
          ? payload.error
          : 'Unable to prepare contract artifacts for wallet deployment.',
      );
    }
    if (!payload.valid) {
      throw new Error(
        payload.issues.length > 0
          ? payload.issues.join('; ')
          : 'Predeploy validation did not pass.',
      );
    }
    if (payload.warnings.length > 0) {
      addLog(`Predeploy prep warning: ${payload.warnings.join('; ')}`, 'info');
    }
    return {
      code: payload.injectedCode,
      initialStorage: payload.injectedInitialStorage ?? storage,
    };
  };

  const deployTezosWithConnectedWallet = async (
    workflow: Pick<WorkflowRunResponse, 'artifacts'>,
  ) => {
    if (!connectedWallet) {
      throw new Error('Connect a Tezos wallet before deploying.');
    }
    const {
      assertConnectedShadownetWallet,
      assignConnectedWalletAsAdmin,
      originateWithConnectedWallet,
    } = await import('./lib/shadownet-wallet');
    await assertConnectedShadownetWallet(connectedWallet.address, networkId);
    const preparedArtifacts = await prepareTezosDeploymentArtifacts(
      workflow.artifacts.michelson,
      workflow.artifacts.initialStorage,
    );
    const storageForDeployment = useConnectedWalletAsContractAdmin
      ? assignConnectedWalletAsAdmin(
          preparedArtifacts.initialStorage,
          connectedWallet.address,
        )
      : preparedArtifacts.initialStorage;
    const result = await originateWithConnectedWallet(
      preparedArtifacts.code,
      storageForDeployment,
      networkId,
    );
    setContractAddress(result.contractAddress);
    associateDeploymentWithActiveContract(result.contractAddress, networkId, 'deployed');
    setAbi(
      workflow.artifacts.entrypointMetadata ??
        workflow.artifacts.entrypoints.map((name) => ({ name, args: [] })),
    );
    addLog(
      `Deployed from ${connectedWallet.address}: ${result.contractAddress} (hash ${result.hash})`,
      'success',
    );
  };

  const handleTezosDeploy = async ({
    allowDirectShadownetDeploy = false,
  }: {
    allowDirectShadownetDeploy?: boolean;
  } = {}) => {
    let workflow = lastWorkflow;
    const canDirectShadownetDeploy =
      allowDirectShadownetDeploy &&
      network.id === 'tezos-shadownet' &&
      contractSourceType === 'michelson' &&
      michelsonCode.trim().length > 0;
    if ((!workflow || !clearanceId) && !canDirectShadownetDeploy) {
      workflow = await runTezosWorkflow();
    }
    const deployable =
      workflow ??
      (canDirectShadownetDeploy
        ? {
            artifacts: {
              michelson: michelsonCode,
              initialStorage: initialStorage.trim() || 'Unit',
              entrypoints: abi.map((entrypoint) => entrypoint.name),
              entrypointMetadata: abi,
              codeHash: '',
            },
            clearance: { approved: false, record: undefined },
          }
        : null);
    if (
      !deployable ||
      (!canDirectShadownetDeploy &&
        (!workflow?.clearance.approved || !workflow.clearance.record?.id))
    ) {
      addLog('Deployment blocked: workflow clearance missing.', 'error');
      return;
    }
    if (canDirectShadownetDeploy && !workflow?.clearance.record?.id) {
      addLog('Direct Shadownet deploy enabled for loaded Michelson source.', 'info');
    }
    setIsDeploying(true);
    try {
      if (deployMode === 'connected') {
        await deployTezosWithConnectedWallet(deployable);
      } else {
        await deployTezosWithPuppet(deployable);
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
      if ('success' in payload && payload.success === false) {
        throw new Error(payload.error ?? 'Execution failed');
      }
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
            entrypoints: abi.length > 0 ? abi : discoveredEntrypoints,
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
    isEvm && (authSession?.user.lastLoginWalletKind ?? authSession?.user.walletKind) === 'evm'
      ? authSession?.user.lastLoginWalletAddress ?? authSession?.user.walletAddress ?? null
      : null;
  const verifiedTezosWalletAddress =
    isTezos && (authSession?.user.lastLoginWalletKind ?? authSession?.user.walletKind) === 'tezos'
      ? authSession?.user.lastLoginWalletAddress ?? authSession?.user.walletAddress ?? null
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
    return [
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
    contractSourceType,
    network.id,
    lastWorkflow,
    authSession,
    verifiedTezosWalletAddress,
    verifiedEvmWalletAddress,
    t,
  ]);

  useEffect(() => {
    if (activeSurface !== 'guided') {
      return;
    }
    const activeStep = tabs.find((tab) => tab.key === activeTab);
    if (!activeStep || activeStep.ready) {
      return;
    }
    const activeIndex = tabs.findIndex((tab) => tab.key === activeTab);
    const fallback =
      [...tabs.slice(0, activeIndex)].reverse().find((tab) => tab.ready) ??
      tabs.find((tab) => tab.ready);
    if (fallback) {
      setActiveTab(fallback.key);
    }
  }, [activeSurface, activeTab, tabs]);

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

  const workbenchTools = useMemo<
    Array<{
      key: WorkbenchToolKey;
      label: string;
      icon: React.ReactNode;
      description: string;
      status: string;
    }>
  >(
    () => [
      {
        key: 'build',
        label: 'Build tools',
        icon: <Hammer className="w-4 h-4" />,
        description: 'Create, paste, upload, compile, or inspect contract source without entering the locked path.',
        status: (isEvm ? solidityCode : michelsonCode).trim() ? 'source loaded' : 'empty buffer',
      },
      {
        key: 'validate',
        label: 'Validate',
        icon: <ShieldCheck className="w-4 h-4" />,
        description: 'Run checks on whatever source is currently loaded.',
        status: isEvm
          ? lastSolidityCompile?.entry
            ? 'compiled'
            : 'not compiled'
          : clearanceId
            ? 'clearance ready'
            : 'no clearance',
      },
      {
        key: 'deploy',
        label: 'Deploy',
        icon: <Rocket className="w-4 h-4" />,
        description: 'Deploy loaded Michelson to Shadownet or use wallet-signed deploys when available.',
        status: contractAddress ? 'contract live' : 'no contract',
      },
      {
        key: 'test',
        label: 'Test',
        icon: <FlaskConical className="w-4 h-4" />,
        description: 'Load any KT1, discover wallet originations, and run Bert/Ernie checks where supported.',
        status: discoveredContracts.length > 0 ? `${discoveredContracts.length} discovered` : 'standalone',
      },
      {
        key: 'handoff',
        label: 'Handoff',
        icon: <Package className="w-4 h-4" />,
        description: 'Export source, compiled artifacts, and release bundles.',
        status: lastWorkflow || lastSolidityCompile ? 'artifacts ready' : 'no artifacts',
      },
    ],
    [
      isEvm,
      solidityCode,
      michelsonCode,
      lastSolidityCompile,
      clearanceId,
      contractAddress,
      discoveredContracts.length,
      lastWorkflow,
    ],
  );

  const renderStep = (step: TabKey, flowMode: FlowMode): React.ReactNode => {
    if (step === 'setup') {
      return (
        <SetupTab
          balances={balances}
          balancesStatus={balancesStatus}
          balancesError={balancesError}
          fetchBalances={fetchBalances}
          connectedWallet={connectedWallet}
          onConnect={connectWallet}
          onDisconnect={disconnectWallet}
          isConnectingWallet={isConnectingWallet}
          onOpenWorkbench={() => {
            setActiveSurface('workbench');
            setActiveTool('build');
          }}
        />
      );
    }
    if (step === 'build') {
      return (
        <BuildTab
          isTezos={isTezos}
          flowMode={flowMode}
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
          projectName={activeProject?.name ?? 'Kiln Browser Workspace'}
          verifiedEvmWalletAddress={verifiedEvmWalletAddress}
          isAssociatingEvmWallet={isMcpLoggingIn}
          onAssociateEvmWallet={startMcpWalletLogin}
          onDeployedEvm={(info) => {
            setContractAddress(info.contractAddress);
            associateDeploymentWithActiveContract(info.contractAddress, network.id, 'deployed');
            addLog(`EVM contract live at ${info.contractAddress}.`, 'success');
            if (flowMode === 'guided') {
              setActiveTab('test');
            } else {
              setActiveTool('test');
            }
          }}
        />
      );
    }
    if (step === 'validate') {
      return (
        <ValidateTab
          isTezos={isTezos}
          isRunningWorkflow={isRunningWorkflow}
          hasSource={isTezos ? michelsonCode.trim().length > 0 : solidityCode.trim().length > 0}
          runWorkflow={runTezosWorkflow}
          workflow={lastWorkflow}
          solidityResult={lastSolidityCompile}
        />
      );
    }
    if (step === 'deploy') {
      return (
        <DeployTab
          isTezos={isTezos}
          flowMode={flowMode}
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
          onTezosDeploy={() =>
            handleTezosDeploy({
              allowDirectShadownetDeploy: flowMode === 'workbench',
            })
          }
          canPuppet={can('puppetWallets')}
          directDeployAvailable={
            flowMode === 'workbench' &&
            network.id === 'tezos-shadownet' &&
            contractSourceType === 'michelson' &&
            michelsonCode.trim().length > 0
          }
          onReconnect={() => setActiveSurface('account')}
        />
      );
    }
    if (step === 'test') {
      return (
        <TestTab
          isTezos={isTezos}
          flowMode={flowMode}
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
          onLoadContract={loadExistingContract}
          isLoadingContract={isLoadingContract}
          connectedWallet={connectedWallet}
          discoveredContracts={discoveredContractsWithProjects}
          isDiscoveringContracts={isDiscoveringContracts}
          contractDiscoveryError={contractDiscoveryError}
          onDiscoverContracts={() => discoverConnectedWalletContracts(true)}
        />
      );
    }
    return (
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
    );
  };

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
        activeSurface={activeSurface}
        onSurfaceChange={setActiveSurface}
      />

      {network.tier === 'mainnet' ? (
        <div className="bg-error/10 border-y border-error/30 text-error px-4 py-2 text-xs text-center">
          <KilnCopy k="mainnetBanner" as="span" />
        </div>
      ) : null}

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6">
        {activeSurface === 'dashboard' ? (
          <DashboardScreen
            projects={projectStore.projects}
            activeProject={activeProject}
            activeContract={activeContract}
            onSelectProject={selectProject}
            onCreateProject={createNewProject}
            onRenameProject={renameActiveProject}
            onCreateContract={createContractForActiveProject}
            onSelectContract={selectProjectContract}
            onUpdateContract={updateActiveContractMetadata}
            onOpenProject={() => {
              const targetSurface = activeProject?.lastSurface ?? 'guided';
              setActiveSurface(targetSurface);
              setActiveTab(activeProject?.lastGuidedStep ?? 'setup');
              setActiveTool(activeProject?.lastWorkbenchTool ?? 'build');
            }}
          />
        ) : null}

        {activeSurface === 'guided' ? (
          <GuidedFlowScreen
            tabs={tabs}
            activeTab={activeTab}
            onStepChange={setActiveTab}
            renderStep={(step) => renderStep(step, 'guided')}
            projects={projectStore.projects}
            activeProject={activeProject}
            onSelectProject={selectProject}
            onCreateProject={createNewProject}
            onRenameProject={renameActiveProject}
            summary={sessionSummary}
            onOpenWorkbench={() => {
              setActiveSurface('workbench');
              setActiveTool('build');
            }}
          />
        ) : null}

        {activeSurface === 'workbench' ? (
          <WorkbenchScreen
            tools={workbenchTools}
            activeTool={activeTool}
            onToolChange={setActiveTool}
            renderTool={(tool) => renderStep(tool, 'workbench')}
            summary={sessionSummary}
            connectedWallet={connectedWallet}
            onOpenAccount={() => setActiveSurface('account')}
          />
        ) : null}

        {activeSurface === 'account' ? (
          <div className="bg-base-100 rounded-2xl border border-base-200 p-4 md:p-6">
            <SettingsTab
              isTezos={isTezos}
              isEvm={isEvm}
              userHandle={userHandle}
              userHandleDraft={userHandleDraft}
              setUserHandleDraft={setUserHandleDraft}
              onSaveUserHandle={saveUserHandle}
              isSavingUserHandle={isSavingUserHandle}
              linkedWallets={linkedWallets}
              onLinkConnectedWallet={linkConnectedWalletToAccount}
              onRemoveLinkedWallet={removeLinkedWallet}
              connectedWallet={connectedWallet}
              onConnect={connectWallet}
              onDisconnect={disconnectWallet}
              authSession={authSession}
              mcpToken={mcpToken}
              apiKey={apiKey}
              isMcpLoggingIn={isMcpLoggingIn}
              isConnectingWallet={isConnectingWallet}
              isRequestingMcpAccess={isRequestingMcpAccess}
              isGeneratingMcpToken={isGeneratingMcpToken}
              isGeneratingApiKey={isGeneratingApiKey}
              onLogin={startMcpWalletLogin}
              onLogout={logoutAccount}
              onRequestAccess={requestMcpAccess}
              onGenerateToken={generateMcpToken}
              onCopyToken={copyMcpToken}
              onGenerateApiKey={generateApiKey}
              onCopyApiKey={copyApiKey}
            />
          </div>
        ) : null}
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
  return guidedStepOrder.includes(value as TabKey);
}

function isWorkbenchToolKey(value: string): value is WorkbenchToolKey {
  return workbenchToolOrder.includes(value as WorkbenchToolKey);
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
  activeSurface,
  onSurfaceChange,
}: {
  networkHealth: 'checking' | 'online' | 'offline';
  mode: 'builder' | 'eli5';
  setMode: (next: 'builder' | 'eli5') => void;
  fetchBalances: () => Promise<void>;
  activeSurface: SurfaceKey;
  onSurfaceChange: (next: SurfaceKey) => void;
}) {
  const { t, tip } = useKilnView();
  const surfaceButtons: Array<{ key: SurfaceKey; label: string; icon: React.ReactNode }> = [
    { key: 'dashboard', label: 'Dashboard', icon: <Boxes className="w-3.5 h-3.5" /> },
    { key: 'guided', label: 'Guided', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { key: 'workbench', label: 'Workbench', icon: <Hammer className="w-3.5 h-3.5" /> },
    { key: 'account', label: 'Account', icon: <UserCircle className="w-3.5 h-3.5" /> },
  ];
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
          <div className="join join-horizontal shrink-0" aria-label="Kiln path selector">
            {surfaceButtons.map((surface) => (
              <button
                key={surface.key}
                type="button"
                className={`btn btn-xs join-item gap-1 ${
                  activeSurface === surface.key ? 'btn-primary' : 'btn-ghost border border-base-300'
                }`}
                onClick={() => onSurfaceChange(surface.key)}
              >
                {surface.icon}
                {surface.label}
              </button>
            ))}
          </div>
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

function DashboardScreen({
  projects,
  activeProject,
  activeContract,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onCreateContract,
  onSelectContract,
  onUpdateContract,
  onOpenProject,
}: {
  projects: SavedKilnProject[];
  activeProject?: SavedKilnProject;
  activeContract?: KilnProjectContractItem;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (name: string) => void;
  onCreateContract: () => void;
  onSelectContract: (contractId: string) => void;
  onUpdateContract: (
    patch: Partial<Pick<KilnProjectContractItem, 'title' | 'domain' | 'role' | 'purpose' | 'relation'>>,
  ) => void;
  onOpenProject: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-base-200 bg-base-100 p-4 md:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 max-w-3xl">
            <div className="badge badge-primary badge-outline">Project dashboard</div>
            <h2 className="text-2xl font-bold leading-tight">Projects and contract families</h2>
            <p className="text-sm text-base-content/70">
              Pick up the last opened project, inspect its contract domains, or start a new project. Each contract exists here before deploy and keeps its Shadownet/Mainnet addresses by version.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm btn-outline gap-2" onClick={onCreateProject}>
              <FolderPlus className="w-4 h-4" />
              New project
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary gap-2"
              disabled={!activeProject}
              onClick={onOpenProject}
            >
              <ChevronRight className="w-4 h-4" />
              Open last state
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] gap-5">
        <aside className="rounded-2xl border border-base-200 bg-base-100 p-3 h-fit">
          <div className="px-2 py-2 text-xs uppercase tracking-wider text-base-content/60">
            Projects
          </div>
          <div className="space-y-2">
            {projects.map((project) => {
              const isActive = activeProject?.id === project.id;
              const deployedCount = project.contracts.reduce(
                (count, contract) => count + contract.deployments.length,
                0,
              );
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10'
                      : 'border-base-300 hover:border-primary/40 hover:bg-base-200/40'
                  }`}
                  onClick={() => onSelectProject(project.id)}
                >
                  <div className="font-semibold text-sm truncate">{project.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[0.68rem] text-base-content/60">
                    <span>{project.contracts.length} contract(s)</span>
                    <span>{deployedCount} deployment(s)</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-2xl border border-base-200 bg-base-100 shadow-lg overflow-hidden">
          {activeProject ? (
            <>
              <div className="border-b border-base-300 bg-base-200/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-base-content/55">
                    Project viewer
                  </div>
                  <input
                    className="input input-sm input-bordered mt-1 w-full max-w-md font-semibold"
                    value={activeProject.name}
                    onChange={(event) => onRenameProject(event.target.value)}
                    aria-label="Project name"
                  />
                </div>
                <button type="button" className="btn btn-sm btn-outline gap-2" onClick={onCreateContract}>
                  <FolderPlus className="w-4 h-4" />
                  Add contract item
                </button>
              </div>
              <div className="p-4 md:p-6 space-y-5">
                <ProjectContractTree
                  project={activeProject}
                  activeContractId={activeContract?.id ?? activeProject.activeContractId}
                  onSelectContract={onSelectContract}
                />
                {activeContract ? (
                  <ProjectContractEditor
                    contract={activeContract}
                    onUpdate={onUpdateContract}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-sm text-base-content/60">
              Create a project to start organizing contract families.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProjectContractTree({
  project,
  activeContractId,
  onSelectContract,
}: {
  project: SavedKilnProject;
  activeContractId: string;
  onSelectContract: (contractId: string) => void;
}) {
  const domains = project.contracts.reduce<Record<string, KilnProjectContractItem[]>>(
    (groups, contract) => {
      const domain = contract.domain.trim() || 'Unsorted';
      groups[domain] = [...(groups[domain] ?? []), contract];
      return groups;
    },
    {},
  );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70">
          Contract family tree
        </h3>
        <p className="text-xs text-base-content/60 mt-1">
          Domains group contracts by the capability they power: marketplace, token factory, auctions, swaps, minters, or any other app area.
        </p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {Object.entries(domains).map(([domain, contracts]) => (
          <div key={domain} className="rounded-xl border border-base-300 bg-base-200/30 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Boxes className="w-4 h-4 text-primary" />
              {domain}
            </div>
            <div className="mt-3 space-y-2">
              {contracts.map((contract) => {
                const isActive = contract.id === activeContractId;
                const shadownet = contract.deployments.find((deployment) =>
                  deployment.networkId.includes('shadownet'),
                );
                const mainnet = contract.deployments.find((deployment) =>
                  deployment.networkId.includes('mainnet'),
                );
                const fullyDeployed =
                  Boolean(shadownet && mainnet) &&
                  shadownet?.versionId === mainnet?.versionId &&
                  shadownet?.versionId === contract.currentVersionId;
                return (
                  <button
                    key={contract.id}
                    type="button"
                    onClick={() => onSelectContract(contract.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-base-300 bg-base-100 hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">{contract.title}</span>
                      <span className={`badge badge-xs ${fullyDeployed ? 'badge-success' : 'badge-outline'}`}>
                        {fullyDeployed ? 'final' : contract.role || 'contract'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-base-content/65 line-clamp-2">
                      {contract.purpose || 'Purpose not set.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <DeploymentBadge label="Shadownet" deployment={shadownet} />
                      <DeploymentBadge label="Mainnet" deployment={mainnet} />
                    </div>
                    <div className="mt-2 text-[0.68rem] text-base-content/55">
                      {contract.relation || 'No relationship note yet.'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeploymentBadge({
  label,
  deployment,
}: {
  label: string;
  deployment?: KilnContractDeployment;
}) {
  return (
    <span className={`badge badge-xs ${deployment ? 'badge-success' : 'badge-outline'}`}>
      {label}: {deployment ? deployment.address.slice(0, 8) : 'none'}
    </span>
  );
}

function ProjectContractEditor({
  contract,
  onUpdate,
}: {
  contract: KilnProjectContractItem;
  onUpdate: (
    patch: Partial<Pick<KilnProjectContractItem, 'title' | 'domain' | 'role' | 'purpose' | 'relation'>>,
  ) => void;
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-200/30 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70">
          Active contract item
        </h3>
        <p className="text-xs text-base-content/60 mt-1">
          This item is the contract currently loaded into Guided or Workbench tools.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Title</span>
          <input
            className="input input-sm input-bordered"
            value={contract.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Domain</span>
          <input
            className="input input-sm input-bordered"
            value={contract.domain}
            onChange={(event) => onUpdate({ domain: event.target.value })}
            placeholder="Marketplace"
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Role</span>
          <input
            className="input input-sm input-bordered"
            value={contract.role}
            onChange={(event) => onUpdate({ role: event.target.value })}
            placeholder="auction, token factory, minter"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Purpose</span>
          <textarea
            className="textarea textarea-bordered text-sm min-h-24"
            value={contract.purpose}
            onChange={(event) => onUpdate({ purpose: event.target.value })}
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Relation</span>
          <textarea
            className="textarea textarea-bordered text-sm min-h-24"
            value={contract.relation}
            onChange={(event) => onUpdate({ relation: event.target.value })}
            placeholder="Consumes the token factory output; feeds marketplace listings."
          />
        </label>
      </div>
      <div className="rounded-lg bg-base-100 border border-base-300 p-3 text-xs font-mono space-y-1">
        <div>Version: {contract.currentVersionId}</div>
        {contract.deployments.length > 0 ? (
          contract.deployments.map((deployment) => (
            <div key={deployment.id}>
              {deployment.networkId}: {deployment.address} ({deployment.origin})
            </div>
          ))
        ) : (
          <div>No deployment addresses associated yet.</div>
        )}
      </div>
    </div>
  );
}

function GuidedFlowScreen({
  tabs,
  activeTab,
  onStepChange,
  renderStep,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  summary,
  onOpenWorkbench,
}: {
  tabs: Array<{
    key: TabKey;
    label: string;
    icon: React.ReactNode;
    tipKey: Parameters<ReturnType<typeof useKilnView>['tip']>[0];
    ready: boolean;
    done: boolean;
  }>;
  activeTab: TabKey;
  onStepChange: (next: TabKey) => void;
  renderStep: (step: TabKey) => React.ReactNode;
  projects: SavedKilnProject[];
  activeProject?: SavedKilnProject;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (name: string) => void;
  summary: { source: string | null; clearance: string | null; contract: string };
  onOpenWorkbench: () => void;
}) {
  const { tip } = useKilnView();
  const activeIndex = tabs.findIndex((tab) => tab.key === activeTab);
  const prev = activeIndex > 0 ? tabs[activeIndex - 1] : null;
  const next = activeIndex >= 0 && activeIndex < tabs.length - 1 ? tabs[activeIndex + 1] : null;
  const readyCount = tabs.filter((tab) => tab.done).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary/30 bg-base-100 p-4 md:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 max-w-3xl">
            <div className="badge badge-primary badge-outline">Locked guided path</div>
            <h2 className="text-2xl font-bold leading-tight">
              Guided Shadownet launch
            </h2>
            <p className="text-sm text-base-content/70">
              Use this path when Kiln creates or injects the contract for a project. Deploy stays locked until validation grants clearance, then testing and handoff continue from the saved project state.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline gap-2"
            onClick={onOpenWorkbench}
          >
            <Hammer className="w-4 h-4" />
            Open standalone tools
          </button>
        </div>
      </div>

      <ProjectAccountBar
        projects={projects}
        activeProject={activeProject}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onRenameProject={onRenameProject}
      />

      <SessionSummary summary={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] gap-5">
        <aside className="rounded-2xl border border-base-200 bg-base-100 p-3 h-fit">
          <div className="px-2 py-2 text-xs uppercase tracking-wider text-base-content/60">
            Project flow · {Math.min(activeIndex + 1, tabs.length)} / {tabs.length}
          </div>
          <div className="space-y-2">
            {tabs.map((tab, idx) => {
              const isActive = tab.key === activeTab;
              const isLocked = !tab.ready;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (!isLocked) {
                      onStepChange(tab.key);
                    }
                  }}
                  title={isLocked ? 'Locked until earlier project work is complete.' : (tip(tab.tipKey) ?? undefined)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10'
                      : isLocked
                        ? 'border-base-300 bg-base-200/30 cursor-not-allowed opacity-70'
                        : 'border-base-300 hover:border-primary/40 hover:bg-base-200/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        tab.done
                          ? 'bg-success text-success-content'
                          : isActive
                            ? 'bg-primary text-primary-content'
                            : 'bg-base-300 text-base-content/70'
                      }`}
                    >
                      {tab.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">{tab.label}</span>
                        {isLocked ? <Lock className="w-3.5 h-3.5 text-base-content/40" /> : tab.icon}
                      </div>
                      <div className="text-[0.68rem] text-base-content/55">
                        {tab.done ? 'complete' : isLocked ? 'locked' : isActive ? 'current screen' : 'available'}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-xl bg-base-200/50 p-3 text-xs text-base-content/65">
            {readyCount} of {tabs.length} checkpoints complete. Deployment requires validation clearance in this path.
          </div>
        </aside>

        <section className="rounded-2xl border border-base-200 bg-base-100 shadow-lg overflow-hidden">
          <div className="border-b border-base-300 bg-base-200/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-base-content/55">
                Guided screen
              </div>
              <h3 className="font-bold">{tabs[activeIndex]?.label ?? 'Setup'}</h3>
            </div>
            <div className="text-xs text-base-content/60">
              State is saved to the selected Kiln project.
            </div>
          </div>
          <div className="p-4 md:p-6">{renderStep(activeTab)}</div>
          <div className="border-t border-base-300 p-3 flex items-center justify-between flex-wrap gap-2 bg-base-200/30">
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1"
              onClick={() => prev?.ready && onStepChange(prev.key)}
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
              onClick={() => next?.ready && onStepChange(next.key)}
              disabled={!next?.ready}
            >
              {next ? next.label : 'Done'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkbenchScreen({
  tools,
  activeTool,
  onToolChange,
  renderTool,
  summary,
  connectedWallet,
  onOpenAccount,
}: {
  tools: Array<{
    key: WorkbenchToolKey;
    label: string;
    icon: React.ReactNode;
    description: string;
    status: string;
  }>;
  activeTool: WorkbenchToolKey;
  onToolChange: (next: WorkbenchToolKey) => void;
  renderTool: (tool: WorkbenchToolKey) => React.ReactNode;
  summary: { source: string | null; clearance: string | null; contract: string };
  connectedWallet: ConnectedWalletState | null;
  onOpenAccount: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-secondary/30 bg-base-100 p-4 md:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 max-w-3xl">
            <div className="badge badge-secondary badge-outline">Standalone workbench</div>
            <h2 className="text-2xl font-bold leading-tight">Contract tools, no required login</h2>
            <p className="text-sm text-base-content/70">
              Use any stage directly: paste source, validate it, deploy loaded Michelson to Shadownet, or test an existing KT1. Connecting a wallet adds contract discovery and wallet-specific context.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline gap-2"
            onClick={onOpenAccount}
          >
            <UserCircle className="w-4 h-4" />
            {connectedWallet ? 'Wallet context' : 'Connect wallet'}
          </button>
        </div>
      </div>

      <SessionSummary summary={summary} />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => onToolChange(tool.key)}
            className={`rounded-xl border p-3 text-left transition-colors min-h-32 ${
              activeTool === tool.key
                ? 'border-secondary bg-secondary/10'
                : 'border-base-300 bg-base-100 hover:border-secondary/40 hover:bg-base-200/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm">{tool.label}</span>
              {tool.icon}
            </div>
            <p className="mt-2 text-xs text-base-content/65 line-clamp-3">{tool.description}</p>
            <div className="mt-3 badge badge-xs badge-outline">{tool.status}</div>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-base-200 bg-base-100 shadow-lg overflow-hidden">
        <div className="border-b border-base-300 bg-base-200/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-base-content/55">
              Standalone tool
            </div>
            <h3 className="font-bold">{tools.find((tool) => tool.key === activeTool)?.label}</h3>
          </div>
          <div className="text-xs text-base-content/60">
            No guided lockout is applied here.
          </div>
        </div>
        <div className="p-4 md:p-6">{renderTool(activeTool)}</div>
      </section>
    </div>
  );
}

function ProjectAccountBar({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onRenameProject,
}: {
  projects: SavedKilnProject[];
  activeProject?: SavedKilnProject;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (name: string) => void;
}) {
  return (
    <div className="bg-base-100 rounded-2xl border border-base-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <Save className="w-4 h-4 text-primary" />
        <select
          className="select select-sm select-bordered max-w-[18rem] font-semibold"
          value={activeProject?.id ?? ''}
          onChange={(event) => onSelectProject(event.target.value)}
          aria-label="Active Kiln project"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <input
          className="input input-sm input-bordered w-52"
          value={activeProject?.name ?? ''}
          onChange={(event) => onRenameProject(event.target.value)}
          aria-label="Project name"
        />
        <button
          type="button"
          className="btn btn-sm btn-outline gap-2"
          onClick={onCreateProject}
        >
          <FolderPlus className="w-4 h-4" />
          New project
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-base-content/60 hidden sm:block">
          {activeProject
            ? `Saved ${new Date(activeProject.updatedAt).toLocaleTimeString()}`
            : 'Autosave ready'}
        </div>
        <span className="badge badge-outline">Project state</span>
      </div>
    </div>
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
  onOpenWorkbench,
}: {
  balances: BalancesResponse | null;
  balancesStatus: 'loading' | 'ready' | 'error' | 'unsupported';
  balancesError: string | null;
  fetchBalances: () => Promise<void>;
  connectedWallet: ConnectedWalletState | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  isConnectingWallet: boolean;
  onOpenWorkbench: () => void;
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
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">
            Guided mode
          </div>
          <h3 className="font-bold mt-1">Project launch with guardrails</h3>
          <p className="text-xs text-base-content/65 mt-2">
            Build or inject a contract, validate it, then unlock deployment only after Kiln issues clearance.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-base-300 bg-base-100 p-4 text-left hover:border-secondary/50 hover:bg-base-200/40 transition-colors"
          onClick={onOpenWorkbench}
        >
          <div className="text-xs uppercase tracking-wider text-secondary font-semibold">
            Standalone mode
          </div>
          <h3 className="font-bold mt-1">Open the tool workbench</h3>
          <p className="text-xs text-base-content/65 mt-2">
            Skip the guided lock path and use build, validate, deploy, test, or export tools one at a time.
          </p>
        </button>
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
  userHandle,
  userHandleDraft,
  setUserHandleDraft,
  onSaveUserHandle,
  isSavingUserHandle,
  linkedWallets,
  onLinkConnectedWallet,
  onRemoveLinkedWallet,
  connectedWallet,
  onConnect,
  onDisconnect,
  authSession,
  mcpToken,
  apiKey,
  isMcpLoggingIn,
  isConnectingWallet,
  isRequestingMcpAccess,
  isGeneratingMcpToken,
  isGeneratingApiKey,
  onLogin,
  onLogout,
  onRequestAccess,
  onGenerateToken,
  onCopyToken,
  onGenerateApiKey,
  onCopyApiKey,
}: {
  isTezos: boolean;
  isEvm: boolean;
  userHandle: string;
  userHandleDraft: string;
  setUserHandleDraft: (next: string) => void;
  onSaveUserHandle: () => Promise<void>;
  isSavingUserHandle: boolean;
  linkedWallets: LinkedKilnWallet[];
  onLinkConnectedWallet: () => Promise<void>;
  onRemoveLinkedWallet: (walletId: string) => void;
  connectedWallet: ConnectedWalletState | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  authSession: KilnAuthSession | null;
  mcpToken: string | null;
  apiKey: string | null;
  isMcpLoggingIn: boolean;
  isConnectingWallet: boolean;
  isRequestingMcpAccess: boolean;
  isGeneratingMcpToken: boolean;
  isGeneratingApiKey: boolean;
  onLogin: (target?: EvmWalletTarget) => Promise<void>;
  onLogout: () => void;
  onRequestAccess: () => Promise<void>;
  onGenerateToken: () => Promise<void>;
  onCopyToken: () => Promise<void>;
  onGenerateApiKey: () => Promise<void>;
  onCopyApiKey: () => Promise<void>;
}) {
  const access = authSession?.user.access;
  const accessStatus = access?.status ?? 'none';
  const tokenMeta = authSession?.user.currentMcpToken;
  const apiTokenMeta = authSession?.user.currentApiToken;
  const { network } = useKilnNetwork();
  const accountWalletLabel =
    authSession?.user.lastLoginWalletAddress ??
    authSession?.user.walletAddress ??
    'not logged in';
  const accountWalletKindLabel =
    authSession?.user.lastLoginWalletKind ??
    authSession?.user.walletKind ??
    (isEvm ? 'evm' : 'tezos');
  const connectedNetworkLabel =
    connectedWallet?.networkId === network.id
      ? network.label
      : connectedWallet?.networkId ?? null;
  const hasAccountSession = Boolean(authSession);
  const connectedWalletMatchesAccount =
    Boolean(authSession && connectedWallet && accountWalletLabel === connectedWallet.address);
  const connectedWalletDiffersFromAccount =
    Boolean(authSession && connectedWallet && accountWalletLabel !== connectedWallet.address);
  const canUseAccountAction =
    hasAccountSession || (isTezos ? Boolean(connectedWallet) : true);
  const canRequestAccess =
    canUseAccountAction && !isRequestingMcpAccess && !isMcpLoggingIn;
  const canGenerateToken =
    canUseAccountAction &&
    accessStatus !== 'blocked' &&
    !isGeneratingMcpToken &&
    !isMcpLoggingIn;
  const canGenerateApiKey =
    canUseAccountAction &&
    accessStatus !== 'blocked' &&
    !isGeneratingApiKey &&
    !isMcpLoggingIn;
  const handleDirty = userHandleDraft.trim() !== userHandle;

  return (
    <div className="space-y-5">
      <div>
        <div className="badge badge-primary badge-outline">Account surface</div>
        <h2 className="text-2xl font-bold flex items-center gap-2 mt-2">
          <Settings className="w-5 h-5 text-primary" />
          Account and access
        </h2>
        <p className="text-sm text-base-content/60 mt-1">
          Wallet connection adds account context and contract discovery. Token issuance asks for wallet verification only when credentials are needed.
        </p>
      </div>

      <details className="collapse collapse-arrow rounded-xl border border-base-300 bg-base-100" open>
        <summary className="collapse-title font-bold">Account session</summary>
        <div className="collapse-content space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
                <UserCircle className="w-4 h-4" />
                Kiln login
              </h3>
              <p className="text-xs text-base-content/60 mt-1">
                Login controls project sync and account access. Wallet connection remains available for signing after logout.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-sm btn-outline gap-2"
                disabled={isMcpLoggingIn || (isTezos && !connectedWallet)}
                title="Sign a one-time message to log in to the Kiln account."
                onClick={() => {
                  void onLogin();
                }}
              >
                <KeyRound className="w-4 h-4" />
                {isMcpLoggingIn ? 'Signing...' : hasAccountSession ? 'Switch login' : 'Log in'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={!hasAccountSession}
                onClick={onLogout}
              >
                Log out
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-base-200/50 border border-base-300 p-3 text-xs font-mono break-all">
            <div>Status: {hasAccountSession ? 'logged in' : 'public workbench'}</div>
            <div>Account wallet: {accountWalletLabel}</div>
            <div>Account kind: {accountWalletKindLabel}</div>
            <div>Login network: {authSession?.user.lastLoginNetworkId ?? 'none'}</div>
            {authSession ? <div>Session expires: {new Date(authSession.expiresAt).toLocaleString()}</div> : null}
          </div>
          {connectedWalletMatchesAccount ? (
            <div className="alert alert-success text-xs">
              <span>Connected signer is the wallet currently logged in to this account.</span>
            </div>
          ) : null}
          {connectedWalletDiffersFromAccount ? (
            <div className="alert alert-info text-xs">
              <span>
                Connected signer differs from the logged-in account wallet; that is allowed. Link it if it should open this account later.
              </span>
            </div>
          ) : null}
        </div>
      </details>

      <details className="collapse collapse-arrow rounded-xl border border-base-300 bg-base-100" open>
        <summary className="collapse-title font-bold">User handle</summary>
        <div className="collapse-content space-y-3">
          <p className="text-xs text-base-content/60">
            Handle is saved locally in public mode and synced to your Kiln account when logged in.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="input input-bordered w-full max-w-md"
              value={userHandleDraft}
              onChange={(event) => setUserHandleDraft(event.target.value)}
              placeholder="Choose a Kiln handle"
              aria-label="Kiln user handle"
              maxLength={64}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary gap-2"
              disabled={!handleDirty || isSavingUserHandle}
              onClick={() => {
                void onSaveUserHandle();
              }}
            >
              <Save className="w-4 h-4" />
              {isSavingUserHandle ? 'Saving...' : 'Save handle'}
            </button>
          </div>
          <div className="text-xs text-base-content/60">
            Saved handle: {userHandle || 'none'}
          </div>
        </div>
      </details>

      <details className="collapse collapse-arrow rounded-xl border border-base-300 bg-base-100" open>
        <summary className="collapse-title font-bold">Wallet connection</summary>
        <div className="collapse-content space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Connected wallet
              </h3>
              <p className="text-xs text-base-content/60 mt-1">
                {isTezos
                  ? `Beacon is scoped to ${network.label}. Kiln records the wallet network it actually receives from Beacon.`
                  : 'Uses an EIP-1193 wallet for Etherlink.'}
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
                    {isConnectingWallet ? 'Connecting...' : connectedWallet ? 'Reconnect' : 'Connect wallet'}
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
                className="btn btn-sm btn-secondary"
                disabled={!connectedWallet}
                onClick={() => {
                  void onLinkConnectedWallet();
                }}
              >
                Link connected wallet
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-base-200/50 border border-base-300 p-3 text-xs font-mono break-all">
            {isTezos ? <div>Connected wallet: {connectedWallet?.address ?? 'none'}</div> : null}
            {isTezos ? (
              <div>
                Connected network:{' '}
                {connectedNetworkLabel
                  ? `${connectedNetworkLabel}${connectedWallet?.networkName ? ` (${connectedWallet.networkName})` : ''}`
                  : 'none'}
              </div>
            ) : null}
            {isTezos ? <div>Connected RPC: {connectedWallet?.rpcUrl ?? 'none'}</div> : null}
            <div>Account session: {hasAccountSession ? 'active' : 'not logged in'}</div>
          </div>
          {connectedWallet ? (
            <div className="alert alert-info text-xs">
              <span>
                Connected wallet is the active signer for deploy and test actions on {network.label}.
              </span>
            </div>
          ) : null}
        </div>
      </details>

      <details className="collapse collapse-arrow rounded-xl border border-base-300 bg-base-100" open>
        <summary className="collapse-title font-bold">
          Linked wallets ({linkedWallets.length})
        </summary>
        <div className="collapse-content space-y-3">
          {linkedWallets.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {linkedWallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="rounded-lg border border-base-300 bg-base-200/30 p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs break-all">{wallet.address}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[0.68rem] text-base-content/60">
                      <span>{wallet.kind}</span>
                      <span>{wallet.label || wallet.networkId}</span>
                      <span>{wallet.source === 'signed' ? 'verified' : 'connected'}</span>
                      {wallet.verifiedAt ? <span>{new Date(wallet.verifiedAt).toLocaleString()}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => onRemoveLinkedWallet(wallet.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-base-300 p-4 text-xs text-base-content/60">
              No linked wallets yet. Connect a wallet and link it to make Kiln user-centric.
            </div>
          )}
        </div>
      </details>

      <details className="collapse collapse-arrow rounded-xl border border-base-300 bg-base-100" open>
        <summary className="collapse-title font-bold">MCP and API access</summary>
        <div className="collapse-content space-y-4">
          <div className="rounded-lg border border-base-300 bg-base-200/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
                  <PlugZap className="w-4 h-4" />
                  MCP access
                </h3>
                <p className="text-xs text-base-content/60 mt-1">
                  Kiln checks the logged-in account and approves access unless an associated wallet is blocked.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary gap-2"
                  disabled={!canRequestAccess}
                  onClick={() => {
                    void onRequestAccess();
                  }}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isRequestingMcpAccess ? 'Checking...' : 'Request access'}
                </button>
              </div>
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
                Status: {accessStatus === 'none' ? 'not requested' : accessStatus}
                {access?.reason ? ` · ${access.reason}` : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <section className="rounded-lg border border-base-300 bg-base-200/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
                    <KeyRound className="w-4 h-4" />
                    Agent token
                  </h3>
                  <p className="text-xs text-base-content/60 mt-1">
                    Full token is shown only once. Kiln requests access first when needed.
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
                  {isGeneratingMcpToken ? 'Generating...' : 'Generate token'}
                </button>
              </div>
              {tokenMeta ? (
                <div className="rounded-lg border border-base-300 bg-base-100 p-3 text-xs space-y-1">
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
                  No active token shown.
                </div>
              )}
            </section>

            <section className="rounded-lg border border-base-300 bg-base-200/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
                    <KeyRound className="w-4 h-4" />
                    API key
                  </h3>
                  <p className="text-xs text-base-content/60 mt-1">
                    Use as <code className="bg-base-300 px-1 rounded">x-kiln-token</code> for protected HTTP routes.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary gap-2"
                  disabled={!canGenerateApiKey}
                  onClick={() => {
                    void onGenerateApiKey();
                  }}
                >
                  <KeyRound className="w-4 h-4" />
                  {isGeneratingApiKey ? 'Generating...' : 'Generate API key'}
                </button>
              </div>
              {apiTokenMeta ? (
                <div className="rounded-lg border border-base-300 bg-base-100 p-3 text-xs space-y-1">
                  <div className="font-mono">Key id: {apiTokenMeta.id}</div>
                  <div>Expires: {new Date(apiTokenMeta.expiresAt).toLocaleString()}</div>
                </div>
              ) : null}
              {apiKey ? (
                <div className="space-y-2">
                  <textarea
                    className="textarea textarea-bordered w-full font-mono text-xs min-h-24"
                    readOnly
                    value={apiKey}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline gap-2"
                    onClick={() => {
                      void onCopyApiKey();
                    }}
                  >
                    <ClipboardCopy className="w-4 h-4" />
                    Copy API key
                  </button>
                </div>
              ) : (
                <div className="text-xs text-base-content/60 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-base-content/40" />
                  No active API key shown.
                </div>
              )}
            </section>
          </div>
        </div>
      </details>
    </div>
  );
}

function BuildTab({
  isTezos,
  flowMode,
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
  projectName,
  verifiedEvmWalletAddress,
  isAssociatingEvmWallet,
  onAssociateEvmWallet,
  onDeployedEvm,
}: {
  isTezos: boolean;
  flowMode: FlowMode;
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
  projectName: string;
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

      <div
        className={`alert text-xs ${
          flowMode === 'guided' ? 'alert-info' : 'alert-warning'
        }`}
      >
        <span>
          {flowMode === 'guided'
            ? 'Guided build is part of the locked project path. Continue to Validate before deployment unlocks.'
            : 'Workbench build is standalone. You can use the output here without joining the guided project path.'}
        </span>
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
        projectName={projectName}
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
  flowMode,
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
  directDeployAvailable,
  onReconnect,
}: {
  isTezos: boolean;
  flowMode: FlowMode;
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
  directDeployAvailable: boolean;
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

  const connectedWalletDiffersFromAccount =
    Boolean(connectedWallet && verifiedTezosWalletAddress) &&
    connectedWallet?.address !== verifiedTezosWalletAddress;
  const deployReady =
    (Boolean(lastWorkflow && clearanceId) || directDeployAvailable) &&
    (deployMode === 'puppet' ? canPuppet : Boolean(connectedWallet));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary" />
          <KilnCopy k="tabDeployLabel" />
        </h2>
        <KilnCopy k="tabDeployIntro" as="p" className="text-sm text-base-content/60 mt-1" />
      </div>

      <div
        className={`alert text-xs ${
          flowMode === 'guided' ? 'alert-info' : 'alert-warning'
        }`}
      >
        <span>
          {flowMode === 'guided'
            ? 'Guided deployment is locked to validation clearance. Loaded-source direct deploy is intentionally unavailable in this path.'
            : 'Standalone deployment can use loaded Michelson on Shadownet without guided clearance. Use Validate separately when you want a clearance record.'}
        </span>
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
                Account login:{' '}
                {verifiedTezosWalletAddress ? verifiedTezosWalletAddress : 'not logged in'}
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
            {clearanceId ?? (directDeployAvailable ? 'direct shadownet deploy' : 'not granted')}
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
              deployMode === 'connected' && connectedWallet
                ? 'font-mono text-success'
                : 'text-warning'
            }
          >
            {deployMode === 'connected'
              ? connectedWallet?.address ?? 'connect wallet'
              : 'Bert puppet wallet'}
          </span>
        </div>
        {deployMode === 'connected' && connectedWallet && !verifiedTezosWalletAddress ? (
          <div className="text-info">
            Settings signature not required for deploy; Kiln will re-check wallet network before
            the origination request.
          </div>
        ) : null}
        {deployMode === 'connected' && connectedWalletDiffersFromAccount ? (
          <div className="text-info">
            Connected signer differs from the logged-in account wallet; deployment will use the
            connected signer.
          </div>
        ) : null}
        {network.tier === 'mainnet' ? (
          <div className="text-error">
            Mainnet deploy — double-check admin address and storage before signing.
          </div>
        ) : null}
        {directDeployAvailable && !clearanceId ? (
          <div className="text-info">
            Loaded Michelson can deploy directly to Shadownet; run Validate when you need a
            clearance-backed release bundle.
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
  flowMode,
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
  onLoadContract,
  isLoadingContract,
  connectedWallet,
  discoveredContracts,
  isDiscoveringContracts,
  contractDiscoveryError,
  onDiscoverContracts,
}: {
  isTezos: boolean;
  flowMode: FlowMode;
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
  onLoadContract: (address: string) => Promise<void>;
  isLoadingContract: boolean;
  connectedWallet: ConnectedWalletState | null;
  discoveredContracts: DiscoveredTezosContractWithProject[];
  isDiscoveringContracts: boolean;
  contractDiscoveryError: string | null;
  onDiscoverContracts: () => Promise<void>;
}) {
  const { t, tip } = useKilnView();
  const [contractAddressDraft, setContractAddressDraft] = useState(contractAddress);

  useEffect(() => {
    setContractAddressDraft(contractAddress);
  }, [contractAddress]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <KilnCopy k="tabTestLabel" />
        </h2>
        <KilnCopy k="tabTestIntro" as="p" className="text-sm text-base-content/60 mt-1" />
      </div>
      <div
        className={`alert text-xs ${
          flowMode === 'guided' ? 'alert-info' : 'alert-warning'
        }`}
      >
        <span>
          {flowMode === 'guided'
            ? 'Guided testing follows the deployed project contract.'
            : 'Standalone testing accepts any KT1 and can discover contracts originated by the connected wallet.'}
        </span>
      </div>
      {isTezos ? (
        <div className="rounded-xl border border-base-300 bg-base-200/30 p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-primary" />
            Load existing contract
          </h3>
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-base-content/70">
            <div className="font-mono break-all">
              Wallet: {connectedWallet?.address ?? 'connect a Tezos wallet to discover contracts'}
            </div>
            <button
              type="button"
              className="btn btn-xs btn-ghost gap-2"
              disabled={!connectedWallet || isDiscoveringContracts}
              onClick={() => {
                void onDiscoverContracts();
              }}
            >
              {isDiscoveringContracts ? (
                <span className="loading loading-spinner" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Discover
            </button>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              className="input input-sm input-bordered flex-1 font-mono"
              value={contractAddressDraft}
              onChange={(event) => {
                setContractAddressDraft(event.target.value);
              }}
              placeholder="KT1..."
            />
            <button
              type="button"
              className="btn btn-sm btn-outline gap-2"
              disabled={isLoadingContract}
              onClick={() => {
                void onLoadContract(contractAddressDraft);
              }}
            >
              {isLoadingContract ? <span className="loading loading-spinner" /> : <FileSearch className="w-4 h-4" />}
              Load tests
            </button>
          </div>
          {contractDiscoveryError ? (
            <div className="alert alert-warning text-xs">
              <span>{contractDiscoveryError}</span>
            </div>
          ) : null}
          {connectedWallet ? (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-base-content/60">
                Recent wallet deployments
              </div>
              {isDiscoveringContracts ? (
                <div className="rounded-lg border border-base-300 bg-base-100 p-3 text-xs text-base-content/60">
                  Checking {connectedWallet.networkId} for originated contracts…
                </div>
              ) : discoveredContracts.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {discoveredContracts.map((contract) => (
                    <button
                      key={contract.address}
                      type="button"
                      className="text-left rounded-lg border border-base-300 bg-base-100 p-3 hover:border-primary/50 hover:bg-base-200/40 transition-colors"
                      onClick={() => {
                        setContractAddressDraft(contract.address);
                        void onLoadContract(contract.address);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono text-xs break-all">{contract.address}</span>
                        <span className="badge badge-xs badge-outline">{contract.kind}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-base-content/60">
                        <span>
                          {contract.originatedAt
                            ? new Date(contract.originatedAt).toLocaleString()
                            : 'time unknown'}
                        </span>
                        <span>source: {contract.source}</span>
                        {contract.projectName ? (
                          <span className="text-success">project: {contract.projectName}</span>
                        ) : (
                          <span>project: none linked</span>
                        )}
                        {contract.operationHash ? (
                          <span className="font-mono">op: {contract.operationHash}</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-base-300 bg-base-100 p-3 text-xs text-base-content/60">
                  No contracts found yet for this wallet on the connected network.
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {!contractAddress ? (
        <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/60">
          Deploy a contract or load an existing address to wake up the dynamic rig.
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
