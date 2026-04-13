import type { GuidedElementId } from './reference-guided-elements.js';

export type GuidedContractType = 'fa2_fungible' | 'nft_collection' | 'marketplace';
export type GuidedOutputFormat = 'smartpy' | 'michelson_stub';

export interface GuidedContractDraftInput {
  contractType: GuidedContractType;
  projectName: string;
  symbol?: string;
  adminAddress?: string;
  decimals?: number;
  initialSupply?: number;
  maxCollectionSize?: number;
  marketplaceFeeBps?: number;
  royaltiesBps?: number;
  includeMint: boolean;
  includeBurn: boolean;
  includePause: boolean;
  includeAdminTransfer: boolean;
  selectedElements?: GuidedElementId[];
  outputFormat: GuidedOutputFormat;
}

export interface GuidedContractDraft {
  contractType: GuidedContractType;
  outputFormat: GuidedOutputFormat;
  entrypoints: string[];
  code: string;
  initialStorage: string;
  guidance: string[];
  warnings: string[];
  selectedElements: GuidedElementId[];
}

function toClassName(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) {
    return 'KilnContract';
  }

  return cleaned
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function safeSymbol(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toUpperCase() ?? '';
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, 10);
}

function sanitizeAddress(value: string | undefined): string {
  const fallback = 'tz1burnburnburnburnburnburnburjAYjjX';
  if (!value) {
    return fallback;
  }
  const normalized = value.trim();
  return normalized || fallback;
}

function buildMichelsonOrTree(nodes: [string, ...string[]]): string {
  if (nodes.length === 1) {
    return nodes[0] as string;
  }

  const [head, ...tail] = nodes;
  return `(or ${head} ${buildMichelsonOrTree(tail as [string, ...string[]])})`;
}

function buildGuidedEntrypoints(input: GuidedContractDraftInput): string[] {
  const include = (name: string, enabled: boolean): string[] => (enabled ? [name] : []);
  const selected = new Set(input.selectedElements ?? []);
  const includeOperatorSupport = selected.has('operator_support');
  const includePermitHook = selected.has('permit_hook');
  const includeAllowlistGate = selected.has('allowlist_gate');
  const includeRoyalties = selected.has('royalties');

  if (input.contractType === 'fa2_fungible') {
    return [
      ...include('mint', input.includeMint),
      ...include('burn', input.includeBurn),
      'transfer',
      'balance_of',
      ...include('update_operators', includeOperatorSupport),
      ...include('permit', includePermitHook),
      ...include('set_allowlist', includeAllowlistGate),
      ...include('pause', input.includePause),
      ...include('set_admin', input.includeAdminTransfer),
      ...include('confirm_admin', input.includeAdminTransfer),
    ];
  }

  if (input.contractType === 'nft_collection') {
    return [
      ...include('mint', input.includeMint),
      ...include('burn', input.includeBurn),
      'transfer',
      'token_metadata',
      ...include('update_operators', includeOperatorSupport),
      ...include('permit', includePermitHook),
      ...include('set_allowlist', includeAllowlistGate),
      ...include('pause', input.includePause),
      ...include('set_admin', input.includeAdminTransfer),
      ...include('confirm_admin', input.includeAdminTransfer),
      'set_royalty_bps',
      'freeze_metadata',
    ];
  }

  return [
    'list_item',
    'cancel_item',
    'buy_item',
    ...include('set_allowlist', includeAllowlistGate),
    ...include('set_royalty_bps', includeRoyalties),
    ...include('pause', input.includePause),
    ...include('set_admin', input.includeAdminTransfer),
    ...include('confirm_admin', input.includeAdminTransfer),
    'set_fee_bps',
  ];
}

function buildMichelsonStub(
  input: GuidedContractDraftInput,
  entrypoints: string[],
): { code: string; initialStorage: string; warnings: string[] } {
  const adminAddress = sanitizeAddress(input.adminAddress);

  const entrypointTypes: Record<string, string> = {
    mint: '(pair %mint address nat)',
    burn: '(pair %burn address nat)',
    transfer: '(pair %transfer address nat)',
    balance_of:
      '(pair %balance_of (list (pair (address %owner) (nat %token_id))) (contract (list (pair (pair (address %owner) (nat %token_id)) (nat %balance)))))',
    pause: '(bool %pause)',
    set_admin: '(address %set_admin)',
    confirm_admin: '(unit %confirm_admin)',
    update_operators: '(list %update_operators (pair address (pair address nat)))',
    permit: '(bytes %permit)',
    set_allowlist: '(pair %set_allowlist address bool)',
    token_metadata: '(nat %token_metadata)',
    set_royalty_bps: '(nat %set_royalty_bps)',
    freeze_metadata: '(unit %freeze_metadata)',
    list_item:
      '(pair %list_item (nat %listing_id) (pair (address %token_contract) (pair (nat %token_id) (mutez %price))))',
    cancel_item: '(nat %cancel_item)',
    buy_item: '(nat %buy_item)',
    set_fee_bps: '(nat %set_fee_bps)',
  };

  const parameterNodes = entrypoints
    .map((entrypoint) => entrypointTypes[entrypoint] ?? `(unit %${entrypoint})`)
    .filter(Boolean);
  const parameter = buildMichelsonOrTree(
    (parameterNodes.length > 0 ? parameterNodes : ['unit']) as [string, ...string[]],
  );

  let storage = '(pair (address %admin) (pair (bool %paused) (option %pending_admin address)))';
  let initialStorage = `(Pair "${adminAddress}" (Pair False None))`;

  if (input.contractType === 'marketplace') {
    storage =
      '(pair (address %admin) (pair (bool %paused) (pair (nat %fee_bps) (big_map %listings nat (pair (address %seller) (pair (address %token_contract) (pair (nat %token_id) (mutez %price))))))))';
    initialStorage = `(Pair "${adminAddress}" (Pair False (Pair ${Math.max(0, input.marketplaceFeeBps ?? 250)} {})))`;
  }

  const code = `parameter ${parameter};
storage ${storage};
code {
  UNPAIR;
  SWAP;
  DROP;
  NIL operation;
  PAIR
};`;

  return {
    code,
    initialStorage,
    warnings: [
      'Michelson stub is for pipeline testing only. It is intentionally minimal and not production-safe.',
    ],
  };
}

function buildFa2FungibleSmartPy(input: GuidedContractDraftInput): string {
  const className = `${toClassName(input.projectName)}FA2`;
  const symbol = safeSymbol(input.symbol, 'KILN');
  const decimals = Math.max(0, Math.min(18, input.decimals ?? 6));
  const initialSupply = Math.max(0, input.initialSupply ?? 1_000_000);
  const includeMint = input.includeMint;
  const includeBurn = input.includeBurn;
  const includePause = input.includePause;
  const includeAdminTransfer = input.includeAdminTransfer;
  const selected = new Set(input.selectedElements ?? []);
  const includeOperatorSupport = selected.has('operator_support');
  const includePermitHook = selected.has('permit_hook');
  const includeAllowlistGate = selected.has('allowlist_gate');

  return `import smartpy as sp

@sp.module
def main():
    class ${className}(sp.Contract):
        def __init__(self, admin: sp.address):
            self.data.admin = admin
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.paused = False
            self.data.total_supply = sp.nat(${initialSupply})
            self.data.metadata = sp.big_map({"name": sp.bytes("0x${Buffer.from(input.projectName).toString('hex')}"), "symbol": sp.bytes("0x${Buffer.from(symbol).toString('hex')}"), "decimals": sp.bytes("0x${Buffer.from(String(decimals)).toString('hex')}")})
            self.data.ledger = sp.big_map({admin: sp.nat(${initialSupply})})
            ${includeOperatorSupport ? 'self.data.operators = sp.big_map()' : ''}
            ${includeAllowlistGate ? 'self.data.allowlist = sp.big_map()' : ''}
            ${includeAllowlistGate ? 'self.data.allowlist_enforced = False' : ''}

        @sp.entrypoint
        def transfer(self, params):
            sp.cast(params, sp.record(to_=sp.address, amount=sp.nat))
            ${includePause ? 'assert not self.data.paused, "PAUSED"' : ''}
            ${includeAllowlistGate ? 'assert not self.data.allowlist_enforced or self.data.allowlist.get(params.to_, default=False), "ALLOWLIST_ONLY"' : ''}
            self.data.ledger[sp.sender] = sp.as_nat(self.data.ledger.get(sp.sender, default=0) - params.amount, error="INSUFFICIENT_BALANCE")
            self.data.ledger[params.to_] = self.data.ledger.get(params.to_, default=0) + params.amount

        @sp.entrypoint
        def balance_of(self, owner):
            sp.cast(owner, sp.address)
            return self.data.ledger.get(owner, default=0)
${includeMint ? `
        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, sp.record(to_=sp.address, amount=sp.nat))
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.ledger[params.to_] = self.data.ledger.get(params.to_, default=0) + params.amount
            self.data.total_supply += params.amount
` : ''}
${includeBurn ? `
        @sp.entrypoint
        def burn(self, params):
            sp.cast(params, sp.record(from_=sp.address, amount=sp.nat))
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.ledger[params.from_] = sp.as_nat(self.data.ledger.get(params.from_, default=0) - params.amount, error="INSUFFICIENT_BALANCE")
            self.data.total_supply = sp.as_nat(self.data.total_supply - params.amount, error="INSUFFICIENT_SUPPLY")
` : ''}
${includeOperatorSupport ? `
        @sp.entrypoint
        def update_operators(self, params):
            sp.cast(params, sp.list[sp.record(owner=sp.address, operator=sp.address, token_id=sp.nat, add=sp.bool)])
            for action in params:
                assert action.owner == sp.sender, "NOT_OWNER"
                key = sp.record(owner=action.owner, operator=action.operator, token_id=action.token_id)
                if action.add:
                    self.data.operators[key] = sp.unit
                else:
                    if self.data.operators.contains(key):
                        del self.data.operators[key]
` : ''}
${includePermitHook ? `
        @sp.entrypoint
        def permit(self, _permit_payload):
            assert False, "PERMIT_NOT_IMPLEMENTED"
` : ''}
${includeAllowlistGate ? `
        @sp.entrypoint
        def set_allowlist(self, params):
            sp.cast(params, sp.record(address=sp.address, allowed=sp.bool))
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.allowlist[params.address] = params.allowed

        @sp.entrypoint
        def set_allowlist_enforced(self, enforced):
            sp.cast(enforced, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.allowlist_enforced = enforced
` : ''}
${includePause ? `
        @sp.entrypoint
        def pause(self, paused):
            sp.cast(paused, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = paused
` : ''}
${includeAdminTransfer ? `
        @sp.entrypoint
        def set_admin(self, new_admin):
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.pending_admin = sp.Some(new_admin)

        @sp.entrypoint
        def confirm_admin(self):
            assert self.data.pending_admin.is_some(), "NO_PENDING_ADMIN"
            assert sp.sender == self.data.pending_admin.unwrap_some(), "NOT_PENDING_ADMIN"
            self.data.admin = sp.sender
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
` : ''}`;
}

function buildNftCollectionSmartPy(input: GuidedContractDraftInput): string {
  const className = `${toClassName(input.projectName)}Collection`;
  const maxCollectionSize = Math.max(1, input.maxCollectionSize ?? 10_000);
  const royaltiesBps = Math.max(0, input.royaltiesBps ?? 500);
  const includeMint = input.includeMint;
  const includeBurn = input.includeBurn;
  const includePause = input.includePause;
  const includeAdminTransfer = input.includeAdminTransfer;
  const selected = new Set(input.selectedElements ?? []);
  const includeOperatorSupport = selected.has('operator_support');
  const includePermitHook = selected.has('permit_hook');
  const includeAllowlistGate = selected.has('allowlist_gate');

  return `import smartpy as sp

@sp.module
def main():
    class ${className}(sp.Contract):
        def __init__(self, admin: sp.address):
            self.data.admin = admin
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.paused = False
            self.data.next_token_id = sp.nat(0)
            self.data.max_collection_size = sp.nat(${maxCollectionSize})
            self.data.default_royalties_bps = sp.nat(${royaltiesBps})
            self.data.metadata_frozen = False
            self.data.owner_of = sp.big_map()
            self.data.token_metadata = sp.big_map()
            ${includeOperatorSupport ? 'self.data.operators = sp.big_map()' : ''}
            ${includeAllowlistGate ? 'self.data.allowlist = sp.big_map()' : ''}
            ${includeAllowlistGate ? 'self.data.allowlist_enforced = False' : ''}

        @sp.entrypoint
        def transfer(self, params):
            sp.cast(params, sp.record(to_=sp.address, token_id=sp.nat))
            ${includePause ? 'assert not self.data.paused, "PAUSED"' : ''}
            assert self.data.owner_of.get(params.token_id, default=sp.sender) == sp.sender, "NOT_OWNER"
            self.data.owner_of[params.token_id] = params.to_
${includeMint ? `
        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, sp.record(to_=sp.address, metadata_uri=sp.bytes))
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            ${includePause ? 'assert not self.data.paused, "PAUSED"' : ''}
            ${includeAllowlistGate ? 'assert not self.data.allowlist_enforced or self.data.allowlist.get(params.to_, default=False), "ALLOWLIST_ONLY"' : ''}
            assert self.data.next_token_id < self.data.max_collection_size, "MAX_SUPPLY_REACHED"
            token_id = self.data.next_token_id
            self.data.owner_of[token_id] = params.to_
            self.data.token_metadata[token_id] = params.metadata_uri
            self.data.next_token_id += 1
` : ''}
${includeBurn ? `
        @sp.entrypoint
        def burn(self, token_id):
            sp.cast(token_id, sp.nat)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            del self.data.owner_of[token_id]
            if not self.data.metadata_frozen:
                del self.data.token_metadata[token_id]
` : ''}
${includeOperatorSupport ? `
        @sp.entrypoint
        def update_operators(self, params):
            sp.cast(params, sp.list[sp.record(owner=sp.address, operator=sp.address, token_id=sp.nat, add=sp.bool)])
            for action in params:
                assert action.owner == sp.sender, "NOT_OWNER"
                key = sp.record(owner=action.owner, operator=action.operator, token_id=action.token_id)
                if action.add:
                    self.data.operators[key] = sp.unit
                else:
                    if self.data.operators.contains(key):
                        del self.data.operators[key]
` : ''}
${includePermitHook ? `
        @sp.entrypoint
        def permit(self, _permit_payload):
            assert False, "PERMIT_NOT_IMPLEMENTED"
` : ''}
${includeAllowlistGate ? `
        @sp.entrypoint
        def set_allowlist(self, params):
            sp.cast(params, sp.record(address=sp.address, allowed=sp.bool))
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.allowlist[params.address] = params.allowed

        @sp.entrypoint
        def set_allowlist_enforced(self, enforced):
            sp.cast(enforced, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.allowlist_enforced = enforced
` : ''}
        @sp.entrypoint
        def set_royalty_bps(self, bps):
            sp.cast(bps, sp.nat)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.default_royalties_bps = bps

        @sp.entrypoint
        def freeze_metadata(self):
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.metadata_frozen = True
${includePause ? `
        @sp.entrypoint
        def pause(self, paused):
            sp.cast(paused, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = paused
` : ''}
${includeAdminTransfer ? `
        @sp.entrypoint
        def set_admin(self, new_admin):
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.pending_admin = sp.Some(new_admin)

        @sp.entrypoint
        def confirm_admin(self):
            assert self.data.pending_admin.is_some(), "NO_PENDING_ADMIN"
            assert sp.sender == self.data.pending_admin.unwrap_some(), "NOT_PENDING_ADMIN"
            self.data.admin = sp.sender
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
` : ''}`;
}

function buildMarketplaceSmartPy(input: GuidedContractDraftInput): string {
  const className = `${toClassName(input.projectName)}Marketplace`;
  const feeBps = Math.max(0, input.marketplaceFeeBps ?? 250);
  const includePause = input.includePause;
  const includeAdminTransfer = input.includeAdminTransfer;
  const selected = new Set(input.selectedElements ?? []);
  const includeAllowlistGate = selected.has('allowlist_gate');
  const includeRoyalties = selected.has('royalties');

  return `import smartpy as sp

@sp.module
def main():
    listing_type: type = sp.record(
        seller=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        price=sp.mutez,
    ).layout(("seller", ("token_contract", ("token_id", "price"))))

    class ${className}(sp.Contract):
        def __init__(self, admin: sp.address):
            self.data.admin = admin
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.paused = False
            self.data.fee_bps = sp.nat(${feeBps})
            self.data.listings = sp.big_map()
            ${includeAllowlistGate ? 'self.data.allowlist = sp.big_map()' : ''}
            ${includeAllowlistGate ? 'self.data.allowlist_enforced = False' : ''}
            ${includeRoyalties ? 'self.data.royalties_bps = sp.nat(0)' : ''}

        @sp.entrypoint
        def list_item(self, params):
            sp.cast(
                params,
                sp.record(
                    listing_id=sp.nat,
                    token_contract=sp.address,
                    token_id=sp.nat,
                    price=sp.mutez,
                ).layout(("listing_id", ("token_contract", ("token_id", "price")))),
            )
            ${includePause ? 'assert not self.data.paused, "PAUSED"' : ''}
            ${includeAllowlistGate ? 'assert not self.data.allowlist_enforced or self.data.allowlist.get(sp.sender, default=False), "ALLOWLIST_ONLY"' : ''}
            self.data.listings[params.listing_id] = sp.record(
                seller=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
                price=params.price,
            )

        @sp.entrypoint
        def cancel_item(self, listing_id):
            sp.cast(listing_id, sp.nat)
            listing = self.data.listings[listing_id]
            assert listing.seller == sp.sender or sp.sender == self.data.admin, "NOT_ALLOWED"
            del self.data.listings[listing_id]

        @sp.entrypoint
        def buy_item(self, listing_id):
            sp.cast(listing_id, sp.nat)
            ${includePause ? 'assert not self.data.paused, "PAUSED"' : ''}
            ${includeAllowlistGate ? 'assert not self.data.allowlist_enforced or self.data.allowlist.get(sp.sender, default=False), "ALLOWLIST_ONLY"' : ''}
            listing = self.data.listings[listing_id]
            assert sp.amount == listing.price, "BAD_PRICE"
            fee = sp.split_tokens(listing.price, self.data.fee_bps, 10_000)
            seller_proceeds = sp.as_nat(sp.utils.mutez_to_nat(listing.price) - sp.utils.mutez_to_nat(fee))
            sp.send(self.data.admin, fee)
            sp.send(listing.seller, sp.utils.nat_to_mutez(seller_proceeds).unwrap_some())
            del self.data.listings[listing_id]

        @sp.entrypoint
        def set_fee_bps(self, bps):
            sp.cast(bps, sp.nat)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert bps <= 2_500, "FEE_TOO_HIGH"
            self.data.fee_bps = bps
${includeRoyalties ? `
        @sp.entrypoint
        def set_royalty_bps(self, bps):
            sp.cast(bps, sp.nat)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert bps <= 2_500, "ROYALTIES_TOO_HIGH"
            self.data.royalties_bps = bps
` : ''}
${includeAllowlistGate ? `
        @sp.entrypoint
        def set_allowlist(self, params):
            sp.cast(params, sp.record(address=sp.address, allowed=sp.bool))
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.allowlist[params.address] = params.allowed

        @sp.entrypoint
        def set_allowlist_enforced(self, enforced):
            sp.cast(enforced, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.allowlist_enforced = enforced
` : ''}
${includePause ? `
        @sp.entrypoint
        def pause(self, paused):
            sp.cast(paused, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = paused
` : ''}
${includeAdminTransfer ? `
        @sp.entrypoint
        def set_admin(self, new_admin):
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.pending_admin = sp.Some(new_admin)

        @sp.entrypoint
        def confirm_admin(self):
            assert self.data.pending_admin.is_some(), "NO_PENDING_ADMIN"
            assert sp.sender == self.data.pending_admin.unwrap_some(), "NOT_PENDING_ADMIN"
            self.data.admin = sp.sender
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
` : ''}`;
}

function buildSmartPyScaffold(
  input: GuidedContractDraftInput,
): { code: string; initialStorage: string; warnings: string[] } {
  const adminAddress = sanitizeAddress(input.adminAddress);

  if (input.contractType === 'fa2_fungible') {
    return {
      code: buildFa2FungibleSmartPy(input),
      initialStorage: `admin="${adminAddress}"`,
      warnings: [
        'Compile this SmartPy source to .tz before deploying through Kiln.',
      ],
    };
  }

  if (input.contractType === 'nft_collection') {
    return {
      code: buildNftCollectionSmartPy(input),
      initialStorage: `admin="${adminAddress}"`,
      warnings: [
        'Compile this SmartPy source to .tz before deploying through Kiln.',
      ],
    };
  }

  return {
    code: buildMarketplaceSmartPy(input),
    initialStorage: `admin="${adminAddress}"`,
    warnings: ['Compile this SmartPy source to .tz before deploying through Kiln.'],
  };
}

export function buildGuidedContractDraft(
  input: GuidedContractDraftInput,
): GuidedContractDraft {
  const selectedElements = input.selectedElements ?? [];
  const entrypoints = buildGuidedEntrypoints(input);
  const generated =
    input.outputFormat === 'michelson_stub'
      ? buildMichelsonStub(input, entrypoints)
      : buildSmartPyScaffold(input);

  const guidance = [
    `Contract profile selected: ${input.contractType}.`,
    `Entrypoints enabled: ${entrypoints.join(', ')}.`,
    selectedElements.length > 0
      ? `Reference-derived elements enabled: ${selectedElements.join(', ')}.`
      : 'Reference-derived elements enabled: none (base profile only).',
    input.outputFormat === 'smartpy'
      ? 'Next: compile SmartPy to Michelson (.tz), then run Kiln pre-deployment tests.'
      : 'Next: run Kiln pre-deployment tests, deploy to shadownet, then run Bert/Ernie E2E.',
  ];

  return {
    contractType: input.contractType,
    outputFormat: input.outputFormat,
    entrypoints,
    code: generated.code,
    initialStorage: generated.initialStorage,
    guidance,
    warnings: generated.warnings,
    selectedElements,
  };
}
