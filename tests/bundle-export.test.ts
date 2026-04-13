import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  createMainnetReadyBundle,
  resolveExportRoot,
  resolveExportZipPath,
} from '../src/lib/bundle-export.js';

describe('bundle export', () => {
  it('creates a zip bundle with expected metadata', async () => {
    const result = await createMainnetReadyBundle({
      projectName: 'Bundle Smoke',
      sourceType: 'michelson',
      source: 'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR };',
      compiledMichelson:
        'parameter unit; storage unit; code { CAR ; NIL operation ; PAIR };',
      initialStorage: 'Unit',
      workflow: { clearance: { approved: true } },
    });

    expect(result.zipFileName).toMatch(/\.zip$/);
    await expect(fs.access(result.zipPath)).resolves.toBeUndefined();
    await expect(fs.access(join(result.exportDir, 'reports', 'mainnet-readiness.md'))).resolves.toBeUndefined();

    await fs.rm(result.exportDir, { recursive: true, force: true });
    await fs.rm(result.zipPath, { force: true });
  });

  it('resolves safe export zip paths and rejects traversal', () => {
    const safePath = resolveExportZipPath('bundle-test.zip');
    expect(safePath).toContain(resolveExportRoot());
    expect(() => resolveExportZipPath('../evil.zip')).toThrow(
      /Invalid bundle file name/,
    );
  });
});
