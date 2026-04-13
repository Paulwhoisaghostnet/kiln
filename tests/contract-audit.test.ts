import { describe, expect, it } from 'vitest';
import { auditMichelsonContract } from '../src/lib/contract-audit.js';

describe('auditMichelsonContract', () => {
  it('fails empty contracts with hard errors', () => {
    const report = auditMichelsonContract('');

    expect(report.passed).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'source_empty', severity: 'error' }),
      ]),
    );
  });

  it('warns when privileged mint paths have no explicit admin transfer controls', () => {
    const report = auditMichelsonContract(`
      parameter (or (pair %mint address nat) (pair %transfer address nat));
      storage unit;
      code { CAR ; NIL operation ; PAIR };
    `);

    expect(report.passed).toBe(true);
    expect(report.entrypoints).toEqual(
      expect.arrayContaining(['mint', 'transfer']),
    );
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'admin_controls_missing', severity: 'warning' }),
      ]),
    );
  });

  it('captures informational findings for missing failwith and pause', () => {
    const report = auditMichelsonContract(`
      parameter (pair %transfer address nat);
      storage unit;
      code { CAR ; NIL operation ; PAIR };
    `);

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pause_missing', severity: 'info' }),
        expect.objectContaining({ id: 'failwith_missing', severity: 'info' }),
      ]),
    );
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.score).toBeGreaterThan(0);
  });
});
