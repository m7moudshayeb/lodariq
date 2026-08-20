import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test('authoring panel has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);

  const results = await new AxeBuilder({ page })
    .include('lodariq-authoring-panel')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(violations).toEqual([]);
});

async function openAuthoringPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open Lodariq actions' }).click();
  await page.getByRole('button', { name: 'Experiences on this page' }).click();
  await page.getByRole('button', { name: 'Open Welcome tour' }).click();
  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add step', exact: true })).toBeVisible();
  await expect(page.getByLabel('Experience title')).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Lodariq authoring"]').getByRole('main'),
  ).toBeVisible();
}
