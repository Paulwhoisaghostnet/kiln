import { describe, expect, it } from 'vitest';
import { listGuidedElementsFromReferences } from '../src/lib/reference-guided-elements.js';

describe('listGuidedElementsFromReferences', () => {
  it('returns contract-type scoped element catalog', async () => {
    const elements = await listGuidedElementsFromReferences('fa2_fungible');

    expect(elements.length).toBeGreaterThan(0);
    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'admin_controls' }),
        expect.objectContaining({ id: 'pause_guard' }),
      ]),
    );
  });

  it('includes evidence contract metadata when matching patterns exist', async () => {
    const elements = await listGuidedElementsFromReferences('marketplace');
    const adminElement = elements.find((element) => element.id === 'admin_controls');

    expect(adminElement).toBeDefined();
    expect(adminElement?.evidenceContracts).toBeInstanceOf(Array);
  });
});

