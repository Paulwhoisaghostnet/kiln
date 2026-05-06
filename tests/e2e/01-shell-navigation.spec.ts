import { test, expect } from '@playwright/test';
import { attachRuntimeCapture } from './helpers/kiln-page';
import { runRootDir } from './helpers/report-artifacts';
import { baseUrl } from './helpers/kiln-env';

const guidedSteps = ['Setup', 'Build', 'Validate', 'Deploy', 'Test', 'Handoff'];

test.describe('UI shell smoke', () => {
  test('primary surfaces are visible and routing separates guided from workbench', async ({ page }) => {
    const capture = attachRuntimeCapture(page, `${runRootDir()}/console`);
    await page.goto(`${baseUrl}/#setup`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Tezos Kiln/i })).toBeVisible();

    await page.getByRole('button', { name: /Dashboard/i }).first().click();
    await expect(page).toHaveURL(/#dashboard$/);
    await expect(page.getByRole('heading', { name: /Projects and contract families/i })).toBeVisible();
    await expect(page.getByText(/Contract family tree/i)).toBeVisible();
    await page.getByRole('button', { name: /Add contract item/i }).click();
    await expect(page.getByRole('button', { name: /Contract 2/i })).toBeVisible();
    await page.getByRole('button', { name: /Guided/i }).first().click();

    await expect(page.getByRole('heading', { name: /Guided Shadownet launch/i })).toBeVisible();
    const guidedRail = page.getByRole('complementary');

    for (const step of guidedSteps) {
      const label = guidedRail.getByRole('button', { name: new RegExp(step, 'i') });
      await expect(label.first()).toBeVisible();
    }

    await guidedRail.getByRole('button', { name: /Setup/i }).first().click();
    await expect(page).toHaveURL(/#guided$/);

    await guidedRail.getByRole('button', { name: /Build/i }).first().click();
    await expect(page).toHaveURL(/#guided-build$/);

    const validate = guidedRail.getByRole('button', { name: /Validate/i });
    await expect(validate.first()).toBeVisible();
    await validate.first().click();
    await expect(page).toHaveURL(/#guided-build$/);

    await page.getByRole('button', { name: /Workbench/i }).first().click();
    await expect(page).toHaveURL(/#tool-build$/);
    await expect(page.getByRole('heading', { name: /Contract tools, no required login/i })).toBeVisible();

    await page.getByRole('button', { name: /Account/i }).first().click();
    await expect(page).toHaveURL(/#account$/);
    await expect(page.getByRole('heading', { name: /Account and access/i })).toBeVisible();

    await capture.snapshot('shell-nav');
    await capture.flush();
  });
});
