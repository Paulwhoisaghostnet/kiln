import {
  getNetworkProfile,
  type KilnNetworkId,
} from './networks.js';

export interface DiscoveredTezosContract {
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

type FetchLike = typeof fetch;

const TZKT_API_BASE_BY_NETWORK: Partial<Record<KilnNetworkId, string>> = {
  'tezos-shadownet': 'https://api.shadownet.tzkt.io/v1',
  'tezos-ghostnet': 'https://api.ghostnet.tzkt.io/v1',
  'tezos-mainnet': 'https://api.tzkt.io/v1',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readAddress(value: unknown): string | null {
  const record = asRecord(value);
  return typeof record.address === 'string' && record.address.trim()
    ? record.address
    : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function getTzktApiBaseUrl(networkId: KilnNetworkId): string | null {
  const profile = getNetworkProfile(networkId);
  if (profile.ecosystem !== 'tezos') {
    return null;
  }
  return TZKT_API_BASE_BY_NETWORK[networkId] ?? null;
}

async function fetchTzktJson<T>(url: URL, fetchImpl: FetchLike): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`TzKT discovery failed (${response.status}) for ${url.pathname}.`);
  }
  return (await response.json()) as T;
}

function upsertContract(
  contracts: Map<string, DiscoveredTezosContract>,
  next: DiscoveredTezosContract,
): void {
  const existing = contracts.get(next.address);
  if (!existing) {
    contracts.set(next.address, next);
    return;
  }

  const existingTime = existing.originatedAt ? Date.parse(existing.originatedAt) : 0;
  const nextTime = next.originatedAt ? Date.parse(next.originatedAt) : 0;
  if (nextTime >= existingTime) {
    contracts.set(next.address, {
      ...existing,
      ...next,
      source: existing.source === 'creator' ? existing.source : next.source,
      operationHash: next.operationHash ?? existing.operationHash,
    });
  }
}

function contractFromTzktContract(
  item: unknown,
  walletAddress: string,
): DiscoveredTezosContract | null {
  const record = asRecord(item);
  const address = readNullableString(record.address);
  if (!address?.startsWith('KT1')) {
    return null;
  }

  return {
    address,
    kind: readNullableString(record.kind) ?? readNullableString(record.type) ?? 'contract',
    originatedAt:
      readNullableString(record.firstActivityTime) ??
      readNullableString(record.lastActivityTime),
    level: readNullableNumber(record.firstActivity),
    operationHash: null,
    creator: readAddress(record.creator) ?? walletAddress,
    source: 'creator',
    typeHash: readNumber(record.typeHash),
    codeHash: readNumber(record.codeHash),
  };
}

function contractFromTzktOrigination(
  item: unknown,
  source: 'sender' | 'initiator',
): DiscoveredTezosContract | null {
  const record = asRecord(item);
  const originatedContract = asRecord(record.originatedContract);
  const address = readNullableString(originatedContract.address);
  if (!address?.startsWith('KT1')) {
    return null;
  }

  return {
    address,
    kind:
      readNullableString(originatedContract.kind) ??
      readNullableString(originatedContract.type) ??
      'contract',
    originatedAt: readNullableString(record.timestamp),
    level: readNullableNumber(record.level),
    operationHash: readNullableString(record.hash),
    creator: readAddress(record.initiator) ?? readAddress(record.sender),
    source,
    typeHash: readNumber(originatedContract.typeHash),
    codeHash: readNumber(originatedContract.codeHash),
  };
}

export async function discoverTezosContractsForWallet({
  networkId,
  walletAddress,
  limit = 25,
  fetchImpl = fetch,
}: {
  networkId: KilnNetworkId;
  walletAddress: string;
  limit?: number;
  fetchImpl?: FetchLike;
}): Promise<{
  indexer: string;
  contracts: DiscoveredTezosContract[];
}> {
  const indexer = getTzktApiBaseUrl(networkId);
  if (!indexer) {
    throw new Error(`Contract discovery is not available for network ${networkId}.`);
  }

  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const requests: Array<Promise<unknown[]>> = [];

  const contractsUrl = new URL(`${indexer}/contracts`);
  contractsUrl.searchParams.set('creator', walletAddress);
  contractsUrl.searchParams.set('limit', String(normalizedLimit));
  contractsUrl.searchParams.set('sort.desc', 'id');
  requests.push(fetchTzktJson<unknown[]>(contractsUrl, fetchImpl));

  for (const [field, value] of [
    ['sender', walletAddress],
    ['initiator', walletAddress],
  ] as const) {
    const originationsUrl = new URL(`${indexer}/operations/originations`);
    originationsUrl.searchParams.set(field, value);
    originationsUrl.searchParams.set('status', 'applied');
    originationsUrl.searchParams.set('limit', String(normalizedLimit));
    originationsUrl.searchParams.set('sort.desc', 'id');
    requests.push(fetchTzktJson<unknown[]>(originationsUrl, fetchImpl));
  }

  const [contractsResult = [], senderOriginations = [], initiatorOriginations = []] =
    await Promise.all(requests);
  const byAddress = new Map<string, DiscoveredTezosContract>();

  for (const item of contractsResult) {
    const contract = contractFromTzktContract(item, walletAddress);
    if (contract) {
      upsertContract(byAddress, contract);
    }
  }
  for (const item of senderOriginations) {
    const contract = contractFromTzktOrigination(item, 'sender');
    if (contract) {
      upsertContract(byAddress, contract);
    }
  }
  for (const item of initiatorOriginations) {
    const contract = contractFromTzktOrigination(item, 'initiator');
    if (contract) {
      upsertContract(byAddress, contract);
    }
  }

  const contracts = Array.from(byAddress.values())
    .sort((a, b) => {
      const aTime = a.originatedAt ? Date.parse(a.originatedAt) : 0;
      const bTime = b.originatedAt ? Date.parse(b.originatedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, normalizedLimit);

  return { indexer, contracts };
}
