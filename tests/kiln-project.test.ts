import { describe, expect, it } from 'vitest';
import {
  createBrowserWorkspaceProject,
  validateKilnProjectManifest,
} from '../src/lib/kiln-project.js';

describe('kiln project workspace model', () => {
  it('builds a browser-scoped project manifest, files, and contract graph', () => {
    const project = createBrowserWorkspaceProject({
      networkId: 'tezos-shadownet',
      sourceType: 'smartpy',
      source: 'import smartpy as sp\n',
      initialStorage: 'Unit',
      entrypoints: ['mint'],
      contractAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      clearanceId: 'clr_123',
    });

    expect(project.manifest.schemaVersion).toBe(1);
    expect(project.manifest.contracts[0]).toMatchObject({
      id: 'primary-contract',
      language: 'smartpy',
      deployedAddress: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      entrypoints: ['mint'],
    });
    expect(project.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'kiln.project.json',
        'contracts/primary.py',
        'contracts/primary.storage.tz',
        'scenarios/default.e2e.json',
      ]),
    );
    expect(project.graph.edges).toEqual([
      { from: 'bert', to: 'primary-contract', label: 'mint' },
    ]);
    expect(project.blockers).toEqual([]);
    expect(() => validateKilnProjectManifest(project.manifest)).not.toThrow();
  });

  it('marks unavailable EVM puppet scenario behavior as a blocker instead of support', () => {
    const project = createBrowserWorkspaceProject({
      networkId: 'etherlink-shadownet',
      sourceType: 'solidity',
      source: 'contract Counter {}',
      entrypoints: [],
    });

    expect(project.manifest.contracts[0]?.language).toBe('solidity');
    expect(project.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('server-side EVM puppet E2E is unavailable'),
      ]),
    );
  });
});
