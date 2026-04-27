import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { baseUrl } from './helpers/kiln-env';

test('setup route passes critical accessibility gate', async ({ page }) => {
  await page.goto(`${baseUrl}/#setup`, { waitUntil: 'domcontentloaded' });

  const analysis = await new AxeBuilder({ page }).analyze();
  const critical = analysis.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(critical.length).toBe(0);
});
