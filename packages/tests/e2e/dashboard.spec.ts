import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import type { LodariqDocument } from '@lodariq/schema';

const apiBaseUrl = `http://127.0.0.1:${process.env.LODARIQ_E2E_API_PORT ?? '3001'}`;
const dashboardBaseUrl = `http://127.0.0.1:${process.env.LODARIQ_E2E_DASHBOARD_PORT ?? '3002'}`;
const workspaceId = 'wk_dashboard_e2e';
const userId = 'user_dashboard_e2e';
const baseDocument = JSON.parse(
  readFileSync(new URL('../../schema/fixtures/tour.linear.v1.json', import.meta.url), 'utf8'),
) as LodariqDocument;

test.describe('dashboard control plane', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Dashboard flow runs once in Chromium.',
  );

  test('uses a collapsed desktop rail and a mobile navigation drawer', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(dashboardBaseUrl);

    const desktopNavigation = page.locator('#desktop-workspace-navigation');
    const expandNavigation = page.getByRole('button', {
      name: 'Expand workspace navigation',
    });

    await expect(expandNavigation).toHaveAttribute('aria-expanded', 'false');
    await expect
      .poll(async () => Math.round((await desktopNavigation.boundingBox())?.width ?? 0))
      .toBe(72);

    await expandNavigation.click();
    const collapseNavigation = page.getByRole('button', {
      name: 'Collapse workspace navigation',
    });
    await expect(collapseNavigation).toHaveAttribute('aria-expanded', 'true');
    await expect(desktopNavigation.getByText('Lodariq')).toBeVisible();
    await expect
      .poll(async () => Math.round((await desktopNavigation.boundingBox())?.width ?? 0))
      .toBe(208);

    await collapseNavigation.click();
    await expect(expandNavigation).toHaveAttribute('aria-expanded', 'false');
    await expect
      .poll(async () => Math.round((await desktopNavigation.boundingBox())?.width ?? 0))
      .toBe(72);

    await page.setViewportSize({ width: 390, height: 844 });
    const menuTrigger = page.getByRole('button', { name: 'Open workspace navigation' });
    const navigationDrawer = page.getByRole('dialog', { name: 'Workspace navigation' });

    await expect(menuTrigger).toBeVisible();
    await expect(menuTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(navigationDrawer).toHaveCount(0);

    await menuTrigger.click();
    await expect(navigationDrawer).toBeVisible();
    await expect(page.locator('#mobile-workspace-header')).toHaveAttribute('aria-hidden', 'true');
    await expect(
      navigationDrawer.getByRole('button', { name: 'Close workspace navigation' }),
    ).toHaveCount(1);

    await navigationDrawer.getByRole('button', { name: 'Experiences', exact: true }).click();
    await expect(navigationDrawer).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Experiences', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#experiences$/);

    await menuTrigger.click();
    await expect(navigationDrawer).toBeVisible();
    const closeDrawerButton = navigationDrawer.getByRole('button', {
      name: 'Close workspace navigation',
    });
    const lastDrawerControl = navigationDrawer.getByRole('button', {
      name: /Switch to (?:dark|light) theme/,
    });
    await closeDrawerButton.focus();
    await expect(closeDrawerButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(lastDrawerControl).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(navigationDrawer).toHaveCount(0);
    await expect(menuTrigger).toBeFocused();
  });

  test('renders API-backed data and opens the product from one permanent SDK installation', async ({
    page,
    request,
  }) => {
    const tourDocument = withWorkspace(baseDocument, workspaceId);
    const seedResponse = await request.post(`${apiBaseUrl}/v1/documents`, {
      headers: dashboardHeaders(),
      data: tourDocument,
    });
    expect(seedResponse.status()).toBe(201);
    const seeded = (await seedResponse.json()) as {
      latestArtifact?: { id: string; contentHash: string } | null;
    };
    const reviewedArtifact = seeded.latestArtifact;
    if (!reviewedArtifact) throw new Error('Dashboard E2E artifact missing');
    const publishResponse = await request.post(
      `${apiBaseUrl}/v1/documents/${tourDocument.id}/publications`,
      {
        headers: {
          ...dashboardHeaders(),
          'idempotency-key': 'release:dashboard-e2e:1',
          'x-lodariq-correlation-id': 'corr_dashboard_e2e_release_1',
        },
        data: {
          environmentId: 'env_staging',
          expectedGeneration: 0,
          expectedArtifactId: reviewedArtifact.id,
          expectedContentHash: reviewedArtifact.contentHash,
        },
      },
    );
    expect(publishResponse.status()).toBe(201);

    await page.addInitScript(() => {
      localStorage.setItem('lodariq-dashboard-color-scheme-v7', 'light');
    });
    await page.goto(dashboardBaseUrl);

    await expect(page.locator('html')).toHaveClass(/light/);
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const themeColors = await page.evaluate(() => {
      const header = globalThis.document.querySelector('main header');
      if (!(header instanceof HTMLElement)) {
        throw new Error('Dashboard header was not rendered.');
      }

      return {
        bodyBackground: getComputedStyle(globalThis.document.body).backgroundColor,
        headerBackground: getComputedStyle(header).backgroundColor,
      };
    });
    expect(themeColors.bodyBackground).not.toBe('rgb(255, 255, 255)');
    expect(themeColors.headerBackground).not.toBe('rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    await expect(page.getByRole('heading', { name: 'Launch queue' })).toBeVisible();
    const launchQueue = page.getByRole('region', { name: 'Experiences' });
    await expect(launchQueue.getByText(tourDocument.title)).toBeVisible();
    await expect(launchQueue.getByText('Staging published')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();

    await page.getByRole('button', { name: 'Experiences', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Experiences', exact: true })).toBeVisible();
    const documentsTable = page.getByRole('table');
    await expect(documentsTable.getByText(tourDocument.title)).toBeVisible();
    await expect(documentsTable.getByText('Tour', { exact: true })).toBeVisible();
    await expect(documentsTable.getByText('Draft saved')).toBeVisible();
    await expect(documentsTable.getByText('Workspace teammate')).toBeVisible();
    await expect(documentsTable.getByText('Publication recorded')).toBeVisible();
    await expect(documentsTable.getByText(tourDocument.id)).toHaveCount(0);
    await expect(documentsTable.getByText(/sha256-[0-9a-f]{64}/)).toHaveCount(0);
    await page.getByLabel('Search experiences').fill('no matching experience');
    await expect(documentsTable.getByText('No matching experiences.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear experience search' }).click();
    await expect(documentsTable.getByText(tourDocument.title)).toBeVisible();

    await page.getByRole('button', { name: 'Environments', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Environments', exact: true })).toBeVisible();
    const setupPanel = page.locator('details').filter({ hasText: 'Install Lodariq once' });
    await expect(setupPanel).toHaveAttribute('open', '');
    await setupPanel.getByLabel('Application name').fill('Browser dashboard e2e');
    await setupPanel.getByRole('button', { name: 'Create one-time installation' }).click();

    const snippet = setupPanel.locator('pre').filter({ hasText: 'data-installation' });
    await expect(snippet).toContainText('<script type="module" async crossorigin="anonymous"');
    await expect(snippet).toContainText('lodariq-public-bootstrap.js');
    await expect(snippet).toContainText('data-installation="ins_pub_');
    await expect(snippet).not.toContainText('data-lodariq-token');
    await expect(snippet).not.toContainText('data-lodariq-environment');
    await expect(snippet).not.toContainText('data-lodariq-authoring-session');
    await expect(snippet).not.toContainText('lodariq-creator.js');
    const stagingOrigin = setupPanel.getByText('https://staging.lodariq.io', { exact: true });
    await expect(stagingOrigin).toBeVisible();
    await expect(
      stagingOrigin.locator('..').getByText('Authoring on', { exact: true }),
    ).toBeVisible();
    await expect(setupPanel.getByRole('button', { name: 'Sync trusted origins' })).toBeVisible();

    const installSnippet = await snippet.textContent();
    expect(installSnippet).toContain('data-lodariq-loader');
    const installPage = await page.context().newPage();
    try {
      await installSnippetOnStagingHost(installPage, installSnippet ?? '');
    } finally {
      await installPage.close();
    }

    await page.reload();
    await page.getByRole('button', { name: 'Help & support', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Help & support' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Open your product' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Authoring site' })).toContainText(
      'Staging · https://staging.lodariq.io',
    );
    const openProduct = page.getByRole('link', { name: 'Open Staging' });
    await expect(openProduct).toHaveAttribute(
      'href',
      'https://staging.lodariq.io/?lodariq-launcher=show',
    );
    await expect(openProduct).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('combobox', { name: 'Experience', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start editing' })).toHaveCount(0);
    await expect(
      page.locator('pre').filter({ hasText: 'data-lodariq-authoring-session' }),
    ).toHaveCount(0);

    const supportPackage = page.locator('details').filter({ hasText: 'Help package' });
    await supportPackage.locator('summary').click();
    await expect(
      supportPackage.getByText('Prepare an editable backup and customer version'),
    ).toBeVisible();
    await supportPackage.getByRole('button', { name: 'Prepare help package' }).click();
    await expect(supportPackage.getByText('Editable backup', { exact: true })).toBeVisible();
    await expect(supportPackage.getByText('Customer version', { exact: true })).toBeVisible();
    await expect(
      supportPackage.getByText('Customer version available', { exact: true }),
    ).toBeVisible();
    await expect(supportPackage.getByRole('button', { name: 'Copy details' })).toHaveCount(2);
    await expect(page.getByText('Developer tools')).toHaveCount(0);
    await expect(page.getByText('Delivery payloads')).toHaveCount(0);
    await expect(page.getByText('Document data')).toHaveCount(0);

    await page.getByRole('button', { name: 'Environments', exact: true }).click();
    const persistedSetupPanel = page.locator('details').filter({ hasText: 'Install Lodariq once' });
    await persistedSetupPanel.locator(':scope > summary').click();
    await persistedSetupPanel.getByText('Advanced', { exact: true }).click();
    await persistedSetupPanel.getByRole('button', { name: 'Revoke installation' }).click();
    await expect(persistedSetupPanel.getByText('Not installed', { exact: true })).toBeVisible();
  });
});

function dashboardHeaders(): Record<string, string> {
  return {
    'x-lodariq-workspace-id': workspaceId,
    'x-lodariq-user-id': userId,
  };
}

function withWorkspace(document: LodariqDocument, nextWorkspaceId: string): LodariqDocument {
  return { ...structuredClone(document), workspaceId: nextWorkspaceId };
}

async function installSnippetOnStagingHost(page: Page, snippet: string): Promise<void> {
  await routeLocalApi(page);
  await routeLocalSdkCdn(page);
  await page.route('https://staging.lodariq.io/snippet-install', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Lodariq staging snippet install</title>
          </head>
          <body>
            <main>
              <h1>Staging host</h1>
              <button data-lodariq-id="new-project" aria-label="New project">New project</button>
            </main>
            ${snippet}
          </body>
        </html>`,
    });
  });

  await page.goto('https://staging.lodariq.io/snippet-install');
  await expect(page.locator('[data-lodariq-launcher]')).toHaveCount(1);
  const launcher = page.getByRole('button', { name: 'Open Lodariq actions' });
  await expect(launcher).toBeHidden();
  await page.keyboard.press('Control+Shift+L');
  await expect(launcher).toBeVisible();
  await expect(page.locator('[data-lodariq-creator-toolbar="true"]')).toHaveCount(0);
  await launcher.click();
  await expect(page.getByRole('button', { name: 'New experience' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Experiences on this page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide Lodariq' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview as user' }).click();
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Create your first project',
  );
}

async function routeLocalApi(page: Page): Promise<void> {
  await page.route(/^https:\/\/api\.lodariq\.io\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const headers = route.request().headers();
    delete headers.host;
    const response = await route.fetch({
      url: `${apiBaseUrl}${url.pathname}${url.search}`,
      headers,
    });
    await route.fulfill({ response });
  });
}

async function routeLocalSdkCdn(page: Page): Promise<void> {
  await page.route(/^https:\/\/(?:staging-)?cdn\.lodariq\.io\/sdk\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const relativePath = url.pathname.replace(/^\/sdk\//, '');
    if (!/^(?:[\w.-]+\/)*[\w.-]+\.js$/.test(relativePath)) {
      await route.abort();
      return;
    }

    const packageDirs = ['sdk-runtime', 'sdk-authoring'];
    const artifactUrl = packageDirs
      .map((packageDir) => new URL(`../../${packageDir}/dist/${relativePath}`, import.meta.url))
      .find((url) => existsSync(url));

    if (!artifactUrl) {
      await route.abort();
      return;
    }

    await route.fulfill({
      contentType: 'application/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(artifactUrl, 'utf8'),
    });
  });
}
