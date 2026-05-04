import type { E2ERunPayload } from './api-schemas.js';
import type { SimulationStepInput } from './contract-simulation.js';
import {
  buildWorkflowDrivenE2ESteps,
  buildWorkflowDrivenSimulationSteps,
} from './workflow-discovery.js';

export type Fa2MarketplaceContractId =
  | 'currency_token'
  | 'asset_token'
  | 'standard_market'
  | 'swap_market'
  | 'auction_market'
  | 'barter_market';

export interface Fa2MarketplaceSuiteContract {
  id: Fa2MarketplaceContractId;
  name: string;
  michelson: string;
  initialStorage: string;
  entrypoints: string[];
  sourceType: 'smartpy';
  smartpySource: string;
  scenario: string;
  address?: string;
}

export interface Fa2MarketplaceSuite {
  name: string;
  description: string;
  placeholders: {
    adminAddress: string;
    currencyTokenAddress: string;
  };
  contracts: Fa2MarketplaceSuiteContract[];
}

const PLACEHOLDER_ADMIN = 'tz1burnburnburnburnburnburnburjAYjjX';
const PLACEHOLDER_CURRENCY = 'tz1burnburnburnburnburnburnburjAYjjX';
const PLACEHOLDER_BERT = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const PLACEHOLDER_ERNIE = 'tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6';
const PLACEHOLDER_CURRENCY_KT1 = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';

function buildMichelsonOrTree(nodes: [string, ...string[]]): string {
  if (nodes.length === 1) {
    return nodes[0];
  }
  const [head, ...tail] = nodes;
  return `(or ${head} ${buildMichelsonOrTree(tail as [string, ...string[]])})`;
}

function unitEntrypoint(name: string): string {
  return `(unit %${name})`;
}

function buildContract(input: {
  id: Fa2MarketplaceContractId;
  name: string;
  entrypoints: string[];
  storage: string;
  initialStorage: string;
}): Fa2MarketplaceSuiteContract {
  const parameter = buildMichelsonOrTree(
    input.entrypoints.map(unitEntrypoint) as [string, ...string[]],
  );

  return {
    id: input.id,
    name: input.name,
    entrypoints: [...input.entrypoints].sort(),
    initialStorage: input.initialStorage,
    sourceType: 'smartpy',
    smartpySource: buildStatefulSmartPySource(
      input.id,
      input.name,
      input.entrypoints,
    ),
    scenario: `kiln_${input.id}`,
    michelson: `parameter ${parameter};
storage ${input.storage};
code { CDR; NIL operation; PAIR };`,
  };
}

function toClassName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function buildStatefulSmartPySource(
  contractId: Fa2MarketplaceContractId,
  contractName: string,
  entrypoints: string[],
): string {
  const className = toClassName(contractName);
  const include = new Set(entrypoints);
  const methods: Record<string, string> = {
    admin: `
        @sp.entrypoint
        def admin(self):
            assert sp.sender == self.data.admin, "NOT_ADMIN"
`,
    balance_of: `
        @sp.entrypoint
        def balance_of(self):
            assert self.data.bert_balance + self.data.ernie_balance >= 0, "BALANCE_CHECK"
`,
    token_metadata: `
        @sp.entrypoint
        def token_metadata(self):
            assert self.data.token_created or self.data.bert_balance > 0, "TOKEN_METADATA"
`,
    create_token: `
        @sp.entrypoint
        def create_token(self):
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.token_created = True
`,
    mint_tokens: `
        @sp.entrypoint
        def mint_tokens(self):
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.bert_balance += 1
`,
    burn_tokens: `
        @sp.entrypoint
        def burn_tokens(self):
            assert self.data.ernie_balance > 0, "NO_ERNIE_BALANCE"
            self.data.ernie_balance = sp.as_nat(self.data.ernie_balance - 1)
`,
    transfer: `
        @sp.entrypoint
        def transfer(self):
            assert self.data.bert_balance > 0, "NO_BERT_BALANCE"
            self.data.bert_balance = sp.as_nat(self.data.bert_balance - 1)
            self.data.ernie_balance += 1
`,
    update_operators: `
        @sp.entrypoint
        def update_operators(self):
            self.data.operator_updates += 1
`,
    set_admin: `
        @sp.entrypoint
        def set_admin(self):
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.pending_admin = sp.Some(self.data.ernie)
`,
    confirm_admin: `
        @sp.entrypoint
        def confirm_admin(self):
            assert self.data.pending_admin.is_some(), "NO_PENDING_ADMIN"
            assert sp.sender == self.data.pending_admin.unwrap_some(), "NOT_PENDING_ADMIN"
            self.data.admin = sp.sender
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
`,
    pause: `
        @sp.entrypoint
        def pause(self):
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = not self.data.paused
`,
    set_fee_bps: `
        @sp.entrypoint
        def set_fee_bps(self):
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.fee_bps = 350
`,
    list_item: `
        @sp.entrypoint
        def list_item(self):
            assert not self.data.paused, "PAUSED"
            assert not self.data.listed, "ALREADY_LISTED"
            self.data.listed = True
`,
    buy_item: `
        @sp.entrypoint
        def buy_item(self):
            assert self.data.listed, "NO_LISTING"
            self.data.listed = False
`,
    cancel_item: `
        @sp.entrypoint
        def cancel_item(self):
            assert self.data.listed, "NO_LISTING"
            self.data.listed = False
`,
    make_offer: `
        @sp.entrypoint
        def make_offer(self):
            assert self.data.listed, "NO_LISTING"
            assert not self.data.offer_active, "OFFER_EXISTS"
            self.data.offer_active = True
`,
    accept_offer: `
        @sp.entrypoint
        def accept_offer(self):
            assert self.data.offer_active, "NO_OFFER"
            self.data.offer_active = False
            self.data.listed = False
`,
    cancel_offer: `
        @sp.entrypoint
        def cancel_offer(self):
            assert self.data.offer_active, "NO_OFFER"
            self.data.offer_active = False
`,
    open_swap: `
        @sp.entrypoint
        def open_swap(self):
            assert not self.data.swap_open, "SWAP_EXISTS"
            self.data.swap_open = True
`,
    accept_swap: `
        @sp.entrypoint
        def accept_swap(self):
            assert self.data.swap_open, "NO_SWAP"
            self.data.swap_open = False
`,
    cancel_swap: `
        @sp.entrypoint
        def cancel_swap(self):
            assert self.data.swap_open, "NO_SWAP"
            self.data.swap_open = False
`,
    start_auction: `
        @sp.entrypoint
        def start_auction(self):
            assert not self.data.auction_active, "AUCTION_EXISTS"
            self.data.auction_active = True
            self.data.auction_has_bid = False
`,
    bid_with_token: `
        @sp.entrypoint
        def bid_with_token(self):
            assert self.data.auction_active, "NO_AUCTION"
            self.data.auction_has_bid = True
`,
    settle_auction: `
        @sp.entrypoint
        def settle_auction(self):
            assert self.data.auction_active, "NO_AUCTION"
            assert self.data.auction_has_bid, "NO_BID"
            self.data.auction_active = False
            self.data.auction_has_bid = False
`,
    cancel_auction: `
        @sp.entrypoint
        def cancel_auction(self):
            assert self.data.auction_active, "NO_AUCTION"
            assert not self.data.auction_has_bid, "BID_EXISTS"
            self.data.auction_active = False
`,
    open_barter: `
        @sp.entrypoint
        def open_barter(self):
            assert not self.data.barter_open, "BARTER_EXISTS"
            self.data.barter_open = True
            self.data.barter_countered = False
`,
    counter_barter: `
        @sp.entrypoint
        def counter_barter(self):
            assert self.data.barter_open, "NO_BARTER"
            self.data.barter_countered = True
`,
    accept_barter: `
        @sp.entrypoint
        def accept_barter(self):
            assert self.data.barter_open, "NO_BARTER"
            assert self.data.barter_countered, "NO_COUNTER"
            self.data.barter_open = False
            self.data.barter_countered = False
`,
    cancel_barter: `
        @sp.entrypoint
        def cancel_barter(self):
            assert self.data.barter_open, "NO_BARTER"
            self.data.barter_open = False
            self.data.barter_countered = False
`,
  };
  const selectedMethods = entrypoints
    .map((entrypoint) => methods[entrypoint])
    .filter((method): method is string => Boolean(method))
    .join('');

  return `import smartpy as sp

@sp.module
def main():
    class ${className}(sp.Contract):
        def __init__(self, admin, bert, ernie, currency_token):
            self.data.admin = admin
            self.data.bert = bert
            self.data.ernie = ernie
            self.data.currency_token = currency_token
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.paused = False
            self.data.token_created = False
            self.data.bert_balance = sp.nat(10)
            self.data.ernie_balance = sp.nat(10)
            self.data.operator_updates = sp.nat(0)
            self.data.listed = False
            self.data.offer_active = False
            self.data.swap_open = False
            self.data.auction_active = False
            self.data.auction_has_bid = False
            self.data.barter_open = False
            self.data.barter_countered = False
            self.data.fee_bps = sp.nat(250)

${selectedMethods}

if "main" in __name__:
    @sp.add_test()
    def kiln_${contractId}():
        scenario = sp.test_scenario("kiln_${contractId}")
        scenario += main.${className}(
            sp.address("tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"),
            sp.address("tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"),
            sp.address("tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6"),
            sp.address("KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton"),
        )
`;
}

function tokenStorage(kind: 'currency' | 'asset'): {
  storage: string;
  initialStorage: string;
} {
  return {
    storage:
      '(pair (address %admin) (pair (nat %token_id) (pair (nat %total_supply) (string %token_kind))))',
    initialStorage: `(Pair "${PLACEHOLDER_ADMIN}" (Pair 0 (Pair 1000000000 "${kind}")))`,
  };
}

function marketStorage(kind: string): {
  storage: string;
  initialStorage: string;
} {
  return {
    storage:
      '(pair (address %admin) (pair (address %currency_token) (pair (nat %currency_token_id) (pair (nat %next_id) (string %market_kind)))))',
    initialStorage: `(Pair "${PLACEHOLDER_ADMIN}" (Pair "${PLACEHOLDER_CURRENCY}" (Pair 0 (Pair 0 "${kind}"))))`,
  };
}

export function renderSuiteInitialStorage(
  contract: Fa2MarketplaceSuiteContract,
  addresses: {
    adminAddress?: string;
    bertAddress?: string;
    ernieAddress?: string;
    currencyTokenAddress?: string;
  } = {},
): string {
  return renderSuiteAddressPlaceholders(contract.initialStorage, addresses);
}

export function renderSuiteAddressPlaceholders(
  value: string,
  addresses: {
    adminAddress?: string;
    bertAddress?: string;
    ernieAddress?: string;
    currencyTokenAddress?: string;
  } = {},
): string {
  return value
    .replaceAll(PLACEHOLDER_ADMIN, addresses.adminAddress ?? PLACEHOLDER_ADMIN)
    .replaceAll(PLACEHOLDER_BERT, addresses.bertAddress ?? addresses.adminAddress ?? PLACEHOLDER_BERT)
    .replaceAll(PLACEHOLDER_ERNIE, addresses.ernieAddress ?? PLACEHOLDER_ERNIE)
    .replaceAll(
      PLACEHOLDER_CURRENCY,
      addresses.currencyTokenAddress ?? PLACEHOLDER_CURRENCY,
    )
    .replaceAll(
      PLACEHOLDER_CURRENCY_KT1,
      addresses.currencyTokenAddress ?? PLACEHOLDER_CURRENCY_KT1,
    );
}

export function buildFa2MarketplaceSuite(): Fa2MarketplaceSuite {
  const currency = tokenStorage('currency');
  const asset = tokenStorage('asset');
  const standard = marketStorage('standard_market');
  const swap = marketStorage('swap_market');
  const auction = marketStorage('auction_market');
  const barter = marketStorage('barter_market');

  return {
    name: 'Kiln FA2 Custom-Token Marketplace Suite',
    description:
      'FA2-style custom currency, asset token, standard market, swap, auction, and barter endpoints for full Kiln workflow coverage.',
    placeholders: {
      adminAddress: PLACEHOLDER_ADMIN,
      currencyTokenAddress: PLACEHOLDER_CURRENCY,
    },
    contracts: [
      buildContract({
        id: 'currency_token',
        name: 'Kiln Currency FA2',
        entrypoints: [
          'admin',
          'balance_of',
          'burn_tokens',
          'confirm_admin',
          'create_token',
          'mint_tokens',
          'pause',
          'set_admin',
          'transfer',
          'update_operators',
        ],
        ...currency,
      }),
      buildContract({
        id: 'asset_token',
        name: 'Kiln Asset FA2',
        entrypoints: [
          'balance_of',
          'burn_tokens',
          'confirm_admin',
          'create_token',
          'mint_tokens',
          'pause',
          'set_admin',
          'token_metadata',
          'transfer',
          'update_operators',
        ],
        ...asset,
      }),
      buildContract({
        id: 'standard_market',
        name: 'Kiln Standard FA2 Market',
        entrypoints: [
          'accept_offer',
          'buy_item',
          'cancel_item',
          'cancel_offer',
          'list_item',
          'make_offer',
          'pause',
          'set_admin',
          'set_fee_bps',
        ],
        ...standard,
      }),
      buildContract({
        id: 'swap_market',
        name: 'Kiln FA2 Swap Market',
        entrypoints: ['accept_swap', 'cancel_swap', 'open_swap', 'pause', 'set_admin'],
        ...swap,
      }),
      buildContract({
        id: 'auction_market',
        name: 'Kiln FA2 Auction Market',
        entrypoints: [
          'bid_with_token',
          'cancel_auction',
          'pause',
          'set_admin',
          'settle_auction',
          'start_auction',
        ],
        ...auction,
      }),
      buildContract({
        id: 'barter_market',
        name: 'Kiln FA2 Barter Market',
        entrypoints: [
          'accept_barter',
          'cancel_barter',
          'counter_barter',
          'open_barter',
          'pause',
          'set_admin',
        ],
        ...barter,
      }),
    ],
  };
}

export function buildSuiteWorkflowSteps(
  contract: Fa2MarketplaceSuiteContract,
): SimulationStepInput[] {
  return buildWorkflowDrivenSimulationSteps({
    contractId: contract.id,
    entrypoints: contract.entrypoints,
    includeExpectedFailures: false,
  });
}

export function buildSuiteE2ESteps(
  suite: Fa2MarketplaceSuite,
  addresses: Partial<Record<Fa2MarketplaceContractId, string>> = {},
): E2ERunPayload['steps'] {
  return suite.contracts.flatMap((contract) =>
    buildWorkflowDrivenE2ESteps({
      contractId: contract.id,
      contractAddress: addresses[contract.id] ?? contract.address,
      entrypoints: contract.entrypoints,
    }),
  );
}
