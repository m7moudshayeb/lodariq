import { expect, test } from '@playwright/test';

test('fixture host installs the local SDK build and plays a tour', async ({ page }) => {
  const loadedUrls: string[] = [];
  page.on('request', (request) => loadedUrls.push(request.url()));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Talmeh?: unknown }).Talmeh));

  expect(
    loadedUrls.some((url) => url.includes('/packages/sdk-runtime/dist/talmeh-loader.js')),
  ).toBe(true);

  await page.evaluate(() =>
    (window as { Talmeh: { playTour: () => Promise<void> } }).Talmeh.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Create your first project',
  );
});

test('creator opens local authoring, attaches a target, and compiles preview JSON', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');

  await frame.getByRole('button', { name: 'Target' }).first().click();
  await page.getByRole('button', { name: 'New project' }).click();

  await expect(frame.locator('.target-chip')).toContainText('New project');

  await frame.getByRole('button', { name: 'Compile preview' }).click();
  await expect(frame.getByLabel('Compiled preview')).toContainText('doc_tour_welcome');
});
