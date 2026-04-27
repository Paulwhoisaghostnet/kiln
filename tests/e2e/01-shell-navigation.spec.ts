import { test, expect } from '@playwright/test';
import { attachRuntimeCapture } from './helpers/kiln-page';
import { runRootDir } from './helpers/report-artifacts';
import { baseUrl } from './helpers/kiln-env';

const tabs = ['Setup', 'Build', 'Validate', 'Deploy', 'Test', 'Handoff'];

test.describe('UI shell smoke', () => {
  test('tab strip is visible and routing defaults to setup', async ({ page }) => {
    const capture = attachRuntimeCapture(page, `${runRootDir()}/console`);
    await page.goto(`${baseUrl}/#setup`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Tezos Kiln/i })).toBeVisible();

    for (const tab of tabs) {
      const label = page.locator('button', { hasText: new RegExp(`${tab}$`) });
      await expect(label.first()).toBeVisible();
    }

    await page.locator('button', { hasText: /^Setup$/ }).first().click();
    await expect(page).toHaveURL(/#setup$/);

    await page.locator('button', { hasText: /Build$/ }).first().click();
    await expect(page).toHaveURL(/#build$/);

    const validate = page.locator('button', { hasText: /Validate$/ });
    await expect(validate.first()).toBeVisible();
    await validate.first().click();
    await expect(page).toHaveURL(/#build$/);

    await capture.snapshot('shell-nav');
    await capture.flush();
  });
});
