import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import type { LodariqDocument } from '@lodariq/schema';

const apiBaseUrl = 'http://127.0.0.1:3001';
const dashboardBaseUrl = 'http://127.0.0.1:3002';
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

  test('renders API-backed data and creates a staging SDK token from the Next page', async ({
    page,
    request,
  }) => {
    const tourDocument = withWorkspace(baseDocument, workspaceId);
    const seedResponse = await request.post(`${apiBaseUrl}/v1/documents`, {
      headers: dashboardHeaders(),
      data: tourDocument,
    });
    expect(seedResponse.status()).toBe(201);
    const publishResponse = await request.post(
      `${apiBaseUrl}/v1/documents/${tourDocument.id}/publish`,
      {
        headers: dashboardHeaders(),
        data: { environmentId: 'env_staging' },
      },
    );
    expect(publishResponse.status()).toBe(201);

    await page.addInitScript(() => {
      localStorage.setItem('lodariq-dashboard-color-scheme-v5', 'light');
    });
    await page.goto(dashboardBaseUrl);

    await expect(page.locator('html')).toHaveClass(/dark/);
    const themeColors = await page.evaluate(() => {
      const header = globalThis.document.querySelector('header');
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
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('heading', { name: 'Control plane' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    const documentsTable = page.getByRole('table');
    await expect(documentsTable.getByText(tourDocument.title)).toBeVisible();
    await expect(documentsTable.getByText(tourDocument.id)).toBeVisible();
    await expect(documentsTable.getByText(/sha256-[0-9a-f]{64}/)).toBeVisible();
    await page.getByLabel('Search documents').fill('no matching document');
    await expect(documentsTable.getByText('No matching documents.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear document search' }).click();
    await expect(documentsTable.getByText(tourDocument.title)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Environment', exact: true })).toContainText(
      'Staging (staging)',
    );

    await page.getByLabel('Token name').fill('Browser dashboard e2e');
    await page.getByRole('button', { name: 'Create token' }).click();

    const snippet = page.locator('pre').filter({ hasText: 'data-lodariq-loader' });
    await expect(snippet).toContainText('<script type="module" async crossorigin="anonymous"');
    await expect(snippet).toContainText('data-lodariq-token="lod_staging_');
    await expect(snippet).toContainText('data-lodariq-environment="staging"');
    await expect(snippet).toContainText('data-lodariq-api="https://api.lodariq.com"');
    await expect(snippet).not.toContainText('lodariq-creator.js');
    const installSnippet = await snippet.textContent();
    expect(installSnippet).toContain('data-lodariq-loader');
    const installPage = await page.context().newPage();
    try {
      await installSnippetOnStagingHost(installPage, installSnippet ?? '');
    } finally {
      await installPage.close();
    }
    const tokenRow = page
      .locator('[aria-label="Environment tokens"]')
      .getByText('Browser dashboard e2e');
    await expect(tokenRow).toBeVisible();
    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.locator('[aria-label="Environment tokens"]')).toContainText('Revoked');

    await expect(page.getByRole('heading', { name: 'Authoring launch' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Document', exact: true })).toContainText(
      tourDocument.title,
    );
    await expect(
      page.getByRole('combobox', { name: 'Authoring environment', exact: true }),
    ).toContainText('Staging (staging)');
    await page.getByLabel('Launch name').fill('Browser authoring launch');
    await page.getByRole('button', { name: 'Create launch snippet' }).click();

    const authoringSnippet = page
      .locator('pre')
      .filter({ hasText: 'data-lodariq-authoring-session' });
    await expect(authoringSnippet).toContainText('data-lodariq-token="lod_staging_');
    await expect(authoringSnippet).toContainText('data-lodariq-authoring-session="lod_authoring_');
    await expect(authoringSnippet).toContainText('lodariq-creator.js');
    await expect(page.getByText('x-lodariq-authoring-session')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open staging' })).toHaveAttribute(
      'href',
      /^https:\/\/staging\.lodariq\.com\/?$/,
    );
    const authoringInstallSnippet = await authoringSnippet.textContent();
    const authoringInstallPage = await page.context().newPage();
    try {
      await installAuthoringSnippetOnStagingHost(
        authoringInstallPage,
        authoringInstallSnippet ?? '',
      );
    } finally {
      await authoringInstallPage.close();
    }
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
  await page.route('https://staging.lodariq.com/snippet-install', async (route) => {
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

  await page.goto('https://staging.lodariq.com/snippet-install');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));
  await expect(page.locator('[data-lodariq-creator-toolbar="true"]')).toHaveCount(0);
  await expect(
    page.evaluate(
      () =>
        (window as { Lodariq?: { authoring: { enabled: boolean } } }).Lodariq?.authoring.enabled,
    ),
  ).resolves.toBe(false);
  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Create your first project',
  );
}

async function installAuthoringSnippetOnStagingHost(page: Page, snippet: string): Promise<void> {
  await routeLocalApi(page);
  await routeLocalSdkCdn(page, { preferAuthoring: true });
  await page.route(
    /^https:\/\/editor\.lodariq\.com\/authoring\.html(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="en"><body><h1>Lodariq editor</h1></body></html>`,
      });
    },
  );
  await page.route('https://staging.lodariq.com/authoring-snippet-install', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Lodariq creator snippet install</title>
          </head>
          <body>
            <main>
              <h1>Staging creator host</h1>
              <button data-lodariq-id="new-project" aria-label="New project">New project</button>
            </main>
            ${snippet}
          </body>
        </html>`,
    });
  });

  await page.goto('https://staging.lodariq.com/authoring-snippet-install');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));
  await expect(
    page.evaluate(
      () =>
        (window as { Lodariq?: { authoring: { enabled: boolean } } }).Lodariq?.authoring.enabled,
    ),
  ).resolves.toBe(true);
  const toolbar = page.locator('[data-lodariq-creator-toolbar="true"]');
  await expect(toolbar).toHaveText('Edit');
  await toolbar.click();
  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();
  await expect(page.locator('iframe[title="Lodariq authoring"]')).toHaveAttribute(
    'src',
    /^https:\/\/editor\.lodariq\.com\/authoring\.html\?parentOrigin=https%3A%2F%2Fstaging\.lodariq\.com$/,
  );
}

async function routeLocalApi(page: Page): Promise<void> {
  await page.route(/^https:\/\/api\.lodariq\.com\/.*/, async (route) => {
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

async function routeLocalSdkCdn(
  page: Page,
  options: { preferAuthoring?: boolean } = {},
): Promise<void> {
  await page.route(/^https:\/\/(?:staging-)?cdn\.lodariq\.com\/sdk\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const relativePath = url.pathname.replace(/^\/sdk\//, '');
    if (!/^(?:[\w.-]+\/)*[\w.-]+\.js$/.test(relativePath)) {
      await route.abort();
      return;
    }

    const packageDirs = options.preferAuthoring
      ? ['sdk-authoring', 'sdk-runtime']
      : ['sdk-runtime', 'sdk-authoring'];
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
