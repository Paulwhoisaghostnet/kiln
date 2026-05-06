import { describe, expect, it, vi } from 'vitest';
import {
  discoverTezosContractsForWallet,
  getTzktApiBaseUrl,
} from '../src/lib/tezos-contract-discovery.js';

const walletAddress = 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('tezos-contract-discovery', () => {
  it('maps supported Tezos networks to TzKT API bases', () => {
    expect(getTzktApiBaseUrl('tezos-shadownet')).toBe(
      'https://api.shadownet.tzkt.io/v1',
    );
    expect(getTzktApiBaseUrl('tezos-mainnet')).toBe('https://api.tzkt.io/v1');
    expect(getTzktApiBaseUrl('etherlink-shadownet')).toBeNull();
  });

  it('combines creator, sender, and initiator results most recent first', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/contracts')) {
        return jsonResponse([
          {
            address: 'KT1OldCreator111111111111111111111111111',
            kind: 'smart_contract',
            creator: { address: walletAddress },
            firstActivity: 100,
            firstActivityTime: '2026-05-01T10:00:00Z',
            typeHash: 1,
            codeHash: 2,
          },
        ]);
      }
      if (url.searchParams.has('sender')) {
        return jsonResponse([
          {
            level: 200,
            timestamp: '2026-05-02T10:00:00Z',
            hash: 'opSender',
            sender: { address: walletAddress },
            originatedContract: {
              kind: 'smart_contract',
              address: 'KT1NewSender1111111111111111111111111111',
              typeHash: 3,
              codeHash: 4,
            },
          },
        ]);
      }
      return jsonResponse([
        {
          level: 300,
          timestamp: '2026-05-03T10:00:00Z',
          hash: 'opInitiator',
          initiator: { address: walletAddress },
          sender: { address: 'KT1Factory11111111111111111111111111111' },
          originatedContract: {
            kind: 'asset',
            address: 'KT1Newest1111111111111111111111111111111',
            typeHash: 5,
            codeHash: 6,
          },
        },
      ]);
    }) as typeof fetch;

    const discovery = await discoverTezosContractsForWallet({
      networkId: 'tezos-shadownet',
      walletAddress,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(discovery.contracts.map((contract) => contract.address)).toEqual([
      'KT1Newest1111111111111111111111111111111',
      'KT1NewSender1111111111111111111111111111',
      'KT1OldCreator111111111111111111111111111',
    ]);
    expect(discovery.contracts[0]).toMatchObject({
      source: 'initiator',
      operationHash: 'opInitiator',
      kind: 'asset',
    });
  });
});
