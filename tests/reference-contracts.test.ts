import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { listReferenceContracts } from '../src/lib/reference-contracts.js';

describe('listReferenceContracts', () => {
  it('indexes known reference contracts with relative artifact paths', async () => {
    const contracts = await listReferenceContracts({
      referenceRoot: resolve(process.cwd(), 'reference'),
    });

    expect(contracts.length).toBeGreaterThanOrEqual(1);
    expect(contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'wtf-is-a-token',
          address: 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD',
        }),
      ]),
    );

    const sample = contracts.find((contract) => contract.slug === 'wtf-is-a-token');
    expect(sample?.codePath).toMatch(/^reference\//);
    expect(sample?.entrypoints.length).toBeGreaterThan(0);
  });

  it('returns an empty list when index metadata is unavailable', async () => {
    const emptyRoot = await mkdtemp(resolve(tmpdir(), 'kiln-ref-empty-'));
    const contracts = await listReferenceContracts({ referenceRoot: emptyRoot });
    expect(contracts).toEqual([]);
    await rm(emptyRoot, { recursive: true, force: true });
  });

  it('discovers SmartPy decorated entrypoints in custom reference corpus', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'kiln-ref-smartpy-'));
    const slugDir = resolve(root, 'demo');
    await mkdir(slugDir, { recursive: true });
    await writeFile(
      resolve(root, 'INDEX.json'),
      JSON.stringify([
        {
          slug: 'demo',
          name: 'Demo',
          address: 'KT1DemoAddressNotReal',
        },
      ]),
      'utf8',
    );
    await writeFile(
      resolve(slugDir, 'contract.py'),
      `
import smartpy as sp

@sp.module
def main():
    class Demo(sp.Contract):
        @sp.entrypoint
        def mint(self, amount):
            pass
      `,
      'utf8',
    );

    const contracts = await listReferenceContracts({ referenceRoot: root });
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.sourceType).toBe('smartpy');
    expect(contracts[0]?.entrypoints).toEqual(['mint']);

    await rm(root, { recursive: true, force: true });
  });
});
