import { describe, expect, it } from 'vitest';
import { viewText, viewTip, type CopyKey } from '../src/lib/kiln-view-copy.js';

describe('kiln-view-copy', () => {
  it('uses builder strings in builder mode', () => {
    expect(viewText('builder', 'headerTagline')).toContain('Pre-deploy');
    expect(viewText('builder', 'runFullWorkflow')).toBe('Run Full Workflow');
  });

  it('uses ELI5 strings in eli5 mode', () => {
    expect(viewText('eli5', 'headerTagline')).toContain('Shadownet testnet');
    expect(viewText('eli5', 'bertErnieNearWallets')).toContain('pretend people');
  });

  it('exposes hover tips only for eli5 mode', () => {
    expect(viewTip('builder', 'workflowGateTitle')).toBeUndefined();
    expect(viewTip('eli5', 'workflowGateTitle')).toContain('factory');
  });

  it('defines copy for every key round-trip', () => {
    const keys: CopyKey[] = [
      'headerTagline',
      'viewModeBuilder',
      'viewModeEli5',
      'runWorkflowTests',
      'dynamicRigExecute',
    ];
    for (const key of keys) {
      expect(viewText('builder', key).length).toBeGreaterThan(0);
      expect(viewText('eli5', key).length).toBeGreaterThan(0);
    }
  });
});
