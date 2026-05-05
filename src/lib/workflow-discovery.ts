import type { E2ERunPayload } from './api-schemas.js';
import type { SimulationStepInput } from './contract-simulation.js';
import { buildEntrypointCoverage } from './workflow-coverage.js';

export type WorkflowKind =
  | 'token_lifecycle'
  | 'standard_listing'
  | 'standard_offer'
  | 'swap'
  | 'auction'
  | 'barter'
  | 'admin_controls'
  | 'endpoint_reachability';

export interface WorkflowPlanStep {
  label: string;
  wallet: 'bert' | 'ernie';
  entrypoint: string;
  args: unknown[];
  expectFailure?: boolean;
}

export interface DiscoveredWorkflow {
  id: string;
  kind: WorkflowKind;
  confidence: 'high' | 'medium' | 'fallback';
  entrypoints: string[];
  missingEntrypoints: string[];
  steps: WorkflowPlanStep[];
}

export interface WorkflowDiscoveryResult {
  contractId: string;
  entrypoints: string[];
  workflows: DiscoveredWorkflow[];
  coverage: ReturnType<typeof buildEntrypointCoverage>;
}

const TOKEN_GROUPS = {
  mint: ['mint', 'mint_tokens', 'create_token'],
  transfer: ['transfer'],
  burn: ['burn', 'burn_tokens'],
  balance: ['balance_of', 'get_balance', 'token_metadata'],
  operators: ['update_operators', 'add_operator', 'remove_operator'],
  admin: ['admin', 'set_admin', 'confirm_admin', 'pause', 'set_fee_bps'],
} as const;

const LISTING_GROUPS = {
  list: ['list_item', 'list', 'create_listing', 'open_listing'],
  buy: ['buy_item', 'buy', 'purchase'],
  cancel: ['cancel_item', 'cancel_listing'],
} as const;

const OFFER_GROUPS = {
  list: LISTING_GROUPS.list,
  makeOffer: ['make_offer', 'offer', 'place_offer'],
  acceptOffer: ['accept_offer'],
  cancelOffer: ['cancel_offer'],
} as const;

const SWAP_GROUPS = {
  open: ['open_swap', 'create_swap'],
  accept: ['accept_swap'],
  cancel: ['cancel_swap'],
} as const;

const AUCTION_GROUPS = {
  start: ['start_auction', 'open_auction', 'create_auction'],
  bid: ['bid_with_token', 'place_bid', 'bid'],
  settle: ['settle_auction', 'claim_auction', 'claim'],
  cancel: ['cancel_auction'],
} as const;

const BARTER_GROUPS = {
  open: ['open_barter', 'create_barter'],
  counter: ['counter_barter', 'counter_offer'],
  accept: ['accept_barter'],
  cancel: ['cancel_barter'],
} as const;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function firstPresent(
  available: Set<string>,
  candidates: readonly string[],
): string | undefined {
  return candidates.find((candidate) => available.has(candidate));
}

function presentEntries(
  available: Set<string>,
  groups: Record<string, readonly string[]>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(groups).map(([key, candidates]) => [
      key,
      firstPresent(available, candidates),
    ]),
  );
}

function presentAll(
  available: Set<string>,
  candidates: readonly string[],
  excluded = new Set<string>(),
): string[] {
  return candidates.filter(
    (candidate) => available.has(candidate) && !excluded.has(candidate),
  );
}

function compactEntries(entries: Array<string | undefined>): string[] {
  return unique(entries.filter((entry): entry is string => Boolean(entry)));
}

const SAMPLE_TEZOS_ADDRESS = 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6';
const SAMPLE_TEZOS_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';

const SHADOWBOX_SKIPPED_ENTRYPOINT_REASONS: Record<string, string> = {
  balance_of:
    'balance_of requires a callback contract payload, so Shadowbox skips it and covers it through static entrypoint detection.',
  get_balance:
    'get_balance requires a callback/view-style payload, so Shadowbox skips it and covers it through static entrypoint detection.',
  permit:
    'permit requires a signed off-chain payload, so Shadowbox skips it instead of blocking validation with an invalid sample signature.',
};

function shadowboxSkipReasonForEntrypoint(entrypoint: string): string | undefined {
  return SHADOWBOX_SKIPPED_ENTRYPOINT_REASONS[entrypoint];
}

export function buildShadowboxSkippedEntrypointWarnings(entrypoints: string[]): string[] {
  const seen = new Set<string>();
  return entrypoints.flatMap((entrypoint) => {
    if (seen.has(entrypoint)) {
      return [];
    }
    seen.add(entrypoint);
    const reason = shadowboxSkipReasonForEntrypoint(entrypoint);
    return reason ? [`Shadowbox skipped ${entrypoint}: ${reason}`] : [];
  });
}

function sampleArgsForEntrypoint(entrypoint: string): unknown[] {
  switch (entrypoint) {
    case 'mint':
    case 'mint_tokens':
    case 'create_token':
    case 'burn':
    case 'burn_tokens':
    case 'transfer':
    case 'token_metadata':
    case 'cancel_item':
    case 'buy_item':
    case 'cancel_listing':
    case 'set_fee_bps':
    case 'set_royalty_bps':
      return [entrypoint.includes('bps') ? 250 : 1];
    case 'update_operators':
      return [0];
    case 'pause':
      return [true];
    case 'set_admin':
      return [SAMPLE_TEZOS_ADDRESS];
    case 'set_allowlist':
      return [{ address: SAMPLE_TEZOS_ADDRESS, allowed: true }];
    case 'permit':
      return ['0x00'];
    case 'list_item':
    case 'list':
    case 'create_listing':
    case 'open_listing':
      return [1, SAMPLE_TEZOS_CONTRACT, 0, 1_000_000];
    default:
      return [];
  }
}

function step(
  contractId: string,
  label: string,
  wallet: 'bert' | 'ernie',
  entrypoint: string | undefined,
  expectFailure = false,
): WorkflowPlanStep[] {
  if (!entrypoint) {
    return [];
  }
  return [
    {
      label: `${contractId}: ${label}`,
      wallet,
      entrypoint,
      args: sampleArgsForEntrypoint(entrypoint),
      expectFailure,
    },
  ];
}

function detectTokenLifecycle(
  contractId: string,
  available: Set<string>,
): DiscoveredWorkflow | undefined {
  const entries = presentEntries(available, TOKEN_GROUPS);
  const adminEntries = presentAll(available, TOKEN_GROUPS.admin);
  const mintEntries = presentAll(available, TOKEN_GROUPS.mint);
  const balanceEntries = presentAll(available, TOKEN_GROUPS.balance);
  const tokenSpecificEntries = compactEntries([
    ...mintEntries,
    entries.transfer,
    entries.burn,
    ...balanceEntries,
    entries.operators,
  ]);
  if (tokenSpecificEntries.length === 0) {
    return undefined;
  }
  const entrypoints = compactEntries([
    ...mintEntries,
    entries.transfer,
    entries.burn,
    ...balanceEntries,
    entries.operators,
    ...adminEntries,
  ]);
  if (entrypoints.length < 2) {
    return undefined;
  }

  const adminStepEntries = {
    admin: firstPresent(available, ['admin']),
    setAdmin: firstPresent(available, ['set_admin']),
    confirmAdmin: firstPresent(available, ['confirm_admin']),
    pause: firstPresent(available, ['pause']),
  };

  return {
    id: `${contractId}:token-lifecycle`,
    kind: 'token_lifecycle',
    confidence: entries.transfer ? 'high' : 'medium',
    entrypoints,
    missingEntrypoints: [],
    steps: [
      ...step(contractId, 'Bert verifies token admin', 'bert', adminStepEntries.admin),
      ...step(contractId, 'Bert creates token id', 'bert', firstPresent(available, ['create_token'])),
      ...step(contractId, 'Bert mints token supply', 'bert', firstPresent(available, ['mint_tokens', 'mint'])),
      ...balanceEntries.flatMap((entrypoint, index) =>
        step(
          contractId,
          index === 0
            ? 'Ernie checks balance or token metadata'
            : `Ernie checks ${entrypoint}`,
          'ernie',
          entrypoint,
        ),
      ),
      ...step(contractId, 'Bert transfers token inventory to Ernie', 'bert', entries.transfer),
      ...step(contractId, 'Ernie burns or retires token inventory', 'ernie', entries.burn),
      ...step(contractId, 'Bert updates token operators', 'bert', entries.operators),
      ...step(contractId, 'Bert starts admin handoff', 'bert', adminStepEntries.setAdmin),
      ...step(contractId, 'Ernie confirms admin handoff', 'ernie', adminStepEntries.confirmAdmin),
      ...step(
        contractId,
        'Current admin toggles pause',
        adminStepEntries.confirmAdmin ? 'ernie' : 'bert',
        adminStepEntries.pause,
      ),
    ],
  };
}

function detectAdminControls(
  contractId: string,
  available: Set<string>,
  excluded: Set<string>,
): DiscoveredWorkflow | undefined {
  const entrypoints = presentAll(
    available,
    ['set_admin', 'confirm_admin', 'set_fee_bps', 'pause', 'admin'],
    excluded,
  );
  if (entrypoints.length === 0) {
    return undefined;
  }

  const setAdmin = entrypoints.includes('set_admin') ? 'set_admin' : undefined;
  const confirmAdmin = entrypoints.includes('confirm_admin')
    ? 'confirm_admin'
    : undefined;
  const currentAdmin = confirmAdmin ? 'ernie' : 'bert';

  return {
    id: `${contractId}:admin-controls`,
    kind: 'admin_controls',
    confidence: 'medium',
    entrypoints,
    missingEntrypoints: [],
    steps: [
      ...step(contractId, 'Bert starts admin handoff', 'bert', setAdmin),
      ...step(contractId, 'Ernie confirms admin handoff', 'ernie', confirmAdmin),
      ...step(
        contractId,
        'Current admin sets marketplace fee',
        currentAdmin,
        entrypoints.includes('set_fee_bps') ? 'set_fee_bps' : undefined,
      ),
      ...step(
        contractId,
        'Current admin toggles pause',
        currentAdmin,
        entrypoints.includes('pause') ? 'pause' : undefined,
      ),
      ...step(
        contractId,
        'Current admin verifies admin endpoint',
        currentAdmin,
        entrypoints.includes('admin') ? 'admin' : undefined,
      ),
    ],
  };
}

function detectStandardListing(
  contractId: string,
  available: Set<string>,
): DiscoveredWorkflow | undefined {
  const entries = presentEntries(available, LISTING_GROUPS);
  if (!entries.list && !entries.buy && !entries.cancel) {
    return undefined;
  }

  return {
    id: `${contractId}:standard-listing`,
    kind: 'standard_listing',
    confidence: entries.list && entries.buy ? 'high' : 'medium',
    entrypoints: compactEntries([entries.list, entries.buy, entries.cancel]),
    missingEntrypoints: [
      ...(!entries.list ? ['list'] : []),
      ...(!entries.buy ? ['buy'] : []),
      ...(!entries.cancel ? ['cancel'] : []),
    ],
    steps: [
      ...step(contractId, 'Ernie cannot buy before Bert lists', 'ernie', entries.buy, true),
      ...step(contractId, 'Bert cannot cancel before listing exists', 'bert', entries.cancel, true),
      ...step(contractId, 'Bert lists NFT for custom currency', 'bert', entries.list),
      ...step(contractId, 'Ernie buys listing with custom currency', 'ernie', entries.buy),
      ...step(contractId, 'Ernie cannot buy consumed listing', 'ernie', entries.buy, true),
      ...step(contractId, 'Bert lists NFT for cancel path', 'bert', entries.list),
      ...step(contractId, 'Bert cancels listing', 'bert', entries.cancel),
      ...step(contractId, 'Ernie cannot buy canceled listing', 'ernie', entries.buy, true),
    ],
  };
}

function detectStandardOffer(
  contractId: string,
  available: Set<string>,
): DiscoveredWorkflow | undefined {
  const entries = presentEntries(available, OFFER_GROUPS);
  if (!entries.makeOffer && !entries.acceptOffer && !entries.cancelOffer) {
    return undefined;
  }

  return {
    id: `${contractId}:standard-offer`,
    kind: 'standard_offer',
    confidence: entries.makeOffer && entries.acceptOffer ? 'high' : 'medium',
    entrypoints: compactEntries([
      entries.list,
      entries.makeOffer,
      entries.acceptOffer,
      entries.cancelOffer,
    ]),
    missingEntrypoints: [
      ...(!entries.makeOffer ? ['make_offer'] : []),
      ...(!entries.acceptOffer ? ['accept_offer'] : []),
    ],
    steps: [
      ...step(
        contractId,
        'Bert cannot accept before Ernie offers',
        'bert',
        entries.acceptOffer,
        true,
      ),
      ...step(
        contractId,
        'Ernie cannot cancel before creating an offer',
        'ernie',
        entries.cancelOffer,
        true,
      ),
      ...step(contractId, 'Bert lists NFT for offer path', 'bert', entries.list),
      ...step(contractId, 'Ernie offers custom currency', 'ernie', entries.makeOffer),
      ...step(contractId, 'Bert accepts Ernie offer', 'bert', entries.acceptOffer),
      ...step(
        contractId,
        'Bert cannot accept consumed offer',
        'bert',
        entries.acceptOffer,
        true,
      ),
      ...step(contractId, 'Bert lists NFT for canceled offer path', 'bert', entries.list),
      ...step(contractId, 'Ernie offers custom currency then cancels', 'ernie', entries.makeOffer),
      ...step(contractId, 'Ernie cancels offer', 'ernie', entries.cancelOffer),
      ...step(
        contractId,
        'Bert cannot accept canceled offer',
        'bert',
        entries.acceptOffer,
        true,
      ),
    ],
  };
}

function detectSwap(
  contractId: string,
  available: Set<string>,
): DiscoveredWorkflow | undefined {
  const entries = presentEntries(available, SWAP_GROUPS);
  if (!entries.open && !entries.accept && !entries.cancel) {
    return undefined;
  }

  return {
    id: `${contractId}:swap`,
    kind: 'swap',
    confidence: entries.open && entries.accept ? 'high' : 'medium',
    entrypoints: compactEntries([entries.open, entries.accept, entries.cancel]),
    missingEntrypoints: [
      ...(!entries.open ? ['open_swap'] : []),
      ...(!entries.accept ? ['accept_swap'] : []),
      ...(!entries.cancel ? ['cancel_swap'] : []),
    ],
    steps: [
      ...step(contractId, 'Ernie cannot accept before Bert opens swap', 'ernie', entries.accept, true),
      ...step(contractId, 'Bert cannot cancel before opening swap', 'bert', entries.cancel, true),
      ...step(contractId, 'Bert opens token-for-currency swap', 'bert', entries.open),
      ...step(contractId, 'Ernie accepts swap with currency', 'ernie', entries.accept),
      ...step(contractId, 'Ernie cannot accept closed swap', 'ernie', entries.accept, true),
      ...step(contractId, 'Bert opens swap for cancel path', 'bert', entries.open),
      ...step(contractId, 'Bert cancels swap', 'bert', entries.cancel),
      ...step(contractId, 'Ernie cannot accept canceled swap', 'ernie', entries.accept, true),
    ],
  };
}

function detectAuction(
  contractId: string,
  available: Set<string>,
): DiscoveredWorkflow | undefined {
  const entries = presentEntries(available, AUCTION_GROUPS);
  if (!entries.start && !entries.bid && !entries.settle && !entries.cancel) {
    return undefined;
  }

  return {
    id: `${contractId}:auction`,
    kind: 'auction',
    confidence: entries.start && entries.bid && entries.settle ? 'high' : 'medium',
    entrypoints: compactEntries([
      entries.start,
      entries.bid,
      entries.settle,
      entries.cancel,
    ]),
    missingEntrypoints: [
      ...(!entries.start ? ['start_auction'] : []),
      ...(!entries.bid ? ['bid_with_token'] : []),
      ...(!entries.settle ? ['settle_auction'] : []),
    ],
    steps: [
      ...step(contractId, 'Ernie cannot bid before auction starts', 'ernie', entries.bid, true),
      ...step(contractId, 'Bert cannot settle before auction starts', 'bert', entries.settle, true),
      ...step(contractId, 'Bert starts auction', 'bert', entries.start),
      ...step(contractId, 'Bert cannot settle before any bid', 'bert', entries.settle, true),
      ...step(contractId, 'Ernie bids custom currency', 'ernie', entries.bid),
      ...step(contractId, 'Bert settles winning bid', 'bert', entries.settle),
      ...step(contractId, 'Bert cannot settle closed auction', 'bert', entries.settle, true),
      ...step(contractId, 'Bert starts auction for cancel path', 'bert', entries.start),
      ...step(contractId, 'Bert cancels auction', 'bert', entries.cancel),
      ...step(contractId, 'Ernie cannot bid on canceled auction', 'ernie', entries.bid, true),
    ],
  };
}

function detectBarter(
  contractId: string,
  available: Set<string>,
): DiscoveredWorkflow | undefined {
  const entries = presentEntries(available, BARTER_GROUPS);
  if (!entries.open && !entries.counter && !entries.accept && !entries.cancel) {
    return undefined;
  }

  return {
    id: `${contractId}:barter`,
    kind: 'barter',
    confidence: entries.open && entries.counter && entries.accept ? 'high' : 'medium',
    entrypoints: compactEntries([
      entries.open,
      entries.counter,
      entries.accept,
      entries.cancel,
    ]),
    missingEntrypoints: [
      ...(!entries.open ? ['open_barter'] : []),
      ...(!entries.counter ? ['counter_barter'] : []),
      ...(!entries.accept ? ['accept_barter'] : []),
    ],
    steps: [
      ...step(contractId, 'Ernie cannot counter before barter opens', 'ernie', entries.counter, true),
      ...step(contractId, 'Bert cannot accept before Ernie counters', 'bert', entries.accept, true),
      ...step(contractId, 'Bert opens barter with token basket', 'bert', entries.open),
      ...step(contractId, 'Ernie counters with token basket', 'ernie', entries.counter),
      ...step(contractId, 'Bert accepts barter', 'bert', entries.accept),
      ...step(contractId, 'Bert cannot accept closed barter', 'bert', entries.accept, true),
      ...step(contractId, 'Bert opens barter for cancel path', 'bert', entries.open),
      ...step(contractId, 'Bert cancels barter', 'bert', entries.cancel),
      ...step(contractId, 'Ernie cannot counter canceled barter', 'ernie', entries.counter, true),
    ],
  };
}

function reachabilityWorkflow(
  contractId: string,
  entrypoints: string[],
): DiscoveredWorkflow {
  return {
    id: `${contractId}:endpoint-reachability`,
    kind: 'endpoint_reachability',
    confidence: 'fallback',
    entrypoints,
    missingEntrypoints: [],
    steps: entrypoints.map((entrypoint, index) => ({
      label: `${contractId}: reach ${entrypoint}`,
      wallet: index % 2 === 0 ? 'bert' : 'ernie',
      entrypoint,
      args: sampleArgsForEntrypoint(entrypoint),
    })),
  };
}

export function discoverContractWorkflows(input: {
  contractId?: string;
  entrypoints: string[];
}): WorkflowDiscoveryResult {
  const contractId = input.contractId?.trim() || 'contract';
  const entrypoints = unique(input.entrypoints);
  const available = new Set(entrypoints);
  const domainWorkflows = [
    detectStandardListing(contractId, available),
    detectStandardOffer(contractId, available),
    detectSwap(contractId, available),
    detectAuction(contractId, available),
    detectBarter(contractId, available),
    detectTokenLifecycle(contractId, available),
  ].filter((workflow): workflow is DiscoveredWorkflow => Boolean(workflow));

  const coveredByDomain = new Set(domainWorkflows.flatMap((workflow) => workflow.entrypoints));
  const adminWorkflow = detectAdminControls(contractId, available, coveredByDomain);
  const detected = adminWorkflow
    ? [...domainWorkflows, adminWorkflow]
    : domainWorkflows;
  const covered = new Set(detected.flatMap((workflow) => workflow.entrypoints));
  const uncovered = entrypoints.filter((entrypoint) => !covered.has(entrypoint));
  const workflows = [...detected];
  if (uncovered.length > 0) {
    workflows.push(reachabilityWorkflow(contractId, uncovered));
  }
  if (workflows.length === 0 && entrypoints.length > 0) {
    workflows.push(reachabilityWorkflow(contractId, entrypoints));
  }

  const steps = workflows.flatMap((workflow) => workflow.steps);
  const coverage = buildEntrypointCoverage({
    contracts: [
      {
        id: contractId,
        entrypoints,
      },
    ],
    steps: steps.map((plannedStep) => ({
      wallet: plannedStep.wallet,
      targetContractId: contractId,
      entrypoint: plannedStep.entrypoint,
      args: plannedStep.args,
    })),
  });

  return {
    contractId,
    entrypoints,
    workflows,
    coverage,
  };
}

export function buildWorkflowDrivenSimulationSteps(input: {
  contractId?: string;
  entrypoints: string[];
  includeExpectedFailures?: boolean;
}): SimulationStepInput[] {
  const discovery = discoverContractWorkflows(input);
  return discovery.workflows
    .flatMap((workflow) => workflow.steps)
    .filter((plannedStep) => input.includeExpectedFailures || !plannedStep.expectFailure)
    .map((plannedStep) => ({
      label: plannedStep.label,
      wallet: plannedStep.wallet,
      entrypoint: plannedStep.entrypoint,
      args: plannedStep.args,
      expectFailure: plannedStep.expectFailure ?? false,
    }));
}

export function buildWorkflowDrivenShadowboxSteps(input: {
  contractId?: string;
  entrypoints: string[];
  includeExpectedFailures?: boolean;
}): SimulationStepInput[] {
  return buildWorkflowDrivenSimulationSteps(input).filter(
    (step) => !shadowboxSkipReasonForEntrypoint(step.entrypoint),
  );
}

export function buildWorkflowDrivenE2ESteps(input: {
  contractId?: string;
  contractAddress?: string;
  entrypoints: string[];
  includeExpectedFailures?: boolean;
}): E2ERunPayload['steps'] {
  const contractId = input.contractId?.trim() || 'contract';
  const includeExpectedFailures = input.includeExpectedFailures ?? true;
  const discovery = discoverContractWorkflows({
    contractId,
    entrypoints: input.entrypoints,
  });

  return discovery.workflows
    .flatMap((workflow) => workflow.steps)
    .filter((plannedStep) => includeExpectedFailures || !plannedStep.expectFailure)
    .map((plannedStep) => ({
      label: plannedStep.label,
      wallet: plannedStep.wallet === 'bert' ? 'A' : 'B',
      targetContractId: contractId,
      targetContractAddress: input.contractAddress,
      entrypoint: plannedStep.entrypoint,
      args: plannedStep.args as E2ERunPayload['steps'][number]['args'],
      amountMutez: 0,
      expectFailure: plannedStep.expectFailure ?? false,
      assertions: [],
    }));
}
