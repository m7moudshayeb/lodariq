import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const dashboardBaseUrl = `http://127.0.0.1:${process.env.LODARIQ_E2E_DASHBOARD_PORT ?? '3002'}`;

test.describe('owned authentication accessibility', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Auth audit runs once in Chromium.');

  for (const path of [
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/verify-email',
    '/reset-password',
    '/authoring/activate',
  ]) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(`${dashboardBaseUrl}${path}`);
      await expect(page.locator('main')).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }

  test('uses app-owned validation, keyboard-safe password controls, and live errors', async ({
    page,
  }) => {
    await page.goto(`${dashboardBaseUrl}/sign-in?returnTo=%2Fauthoring%2Factivate`);
    const identifier = page.getByLabel('Email or username');
    const password = page.getByLabel('Password', { exact: true });
    const form = page.locator('form');
    await expect(form).toHaveAttribute('novalidate', '');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(identifier).toBeFocused();
    await expect(identifier).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Check the highlighted fields and try again.', { exact: true }),
    ).toBeVisible();

    await identifier.fill('creator@example.test');
    await password.fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Show password' }).focus();
    await page.keyboard.press('Enter');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('correct horse battery staple');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await expectNoSeriousViolations(page);
  });

  test('supports RTL and long localized recovery copy without horizontal overflow', async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: 'lq_locale', value: 'ar', url: dashboardBaseUrl, sameSite: 'Lax' },
    ]);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`${dashboardBaseUrl}/forgot-password`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expectNoSeriousViolations(page);
  });
});

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
}
