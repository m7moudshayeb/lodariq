import { expect, test, type Page } from '@playwright/test';

/**
 * Parity checks against the Meridian fixture host — the behaviours the design
 * prototype promised, verified against the real SDK rather than a mock.
 *
 * Meridian's URL is its entire state (route, open menu, open dialog, locale,
 * reflow, DOM generation), so every check here can be set up by navigation and
 * survives a full reload. That is the point: a resolver that only works on a
 * freshly-rendered page is not a resolver.
 */

const HASH = {
  projects: '#/projects/all',
  reliability: '#/projects/all',
  rowMenu: '#/projects/all?pop=row:0',
  createModal: '#/projects/all?modal=create',
  german: '#/projects/all?locale=de',
  reflowed: '#/projects/all?reflow=1',
};

/** Two cards whose actions differ only by a suffix; the card is what tells them apart. */
function workspaceCard(page: Page) {
  return page.locator('.reliability-stage article').first();
}

function templateCard(page: Page) {
  return page.locator('.reliability-stage article').nth(1);
}

async function openMeridian(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));
}

test.describe('Meridian host state', () => {
  test('a full reload lands on the same screen, with the same menu open', async ({ page }) => {
    await openMeridian(page, HASH.rowMenu);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    await page.reload();
    await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));
    await expect(page.getByRole('menu')).toBeVisible();
    expect(page.url()).toContain('pop=row%3A0');
  });

  test('a dialog is part of the URL, so it survives a reload too', async ({ page }) => {
    await openMeridian(page, HASH.createModal);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('navigation writes the URL first, so Back returns the previous screen', async ({ page }) => {
    await openMeridian(page, HASH.projects);
    await page.locator('[data-route="reports"]').click();
    await expect(page).toHaveURL(/#\/reports/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/projects/);
    await expect(page.getByRole('table', { name: 'Projects' })).toBeVisible();
  });
});

test.describe('resolver under hostile conditions', () => {
  test('the same action is found after the locale changes the label', async ({ page }) => {
    await openMeridian(page, HASH.reliability);
    await expect(workspaceCard(page).getByRole('button')).toHaveText('Create project');

    await openMeridian(page, HASH.german);
    // Same intent, different words: a text-only resolver would lose this.
    await expect(workspaceCard(page).getByRole('button')).not.toHaveText('Create project');
    await expect(page.locator('[data-reliability-status]')).toContainText('German');
  });

  test('the target survives its DOM node being replaced wholesale', async ({ page }) => {
    await openMeridian(page, HASH.reliability);
    const stage = page.locator('[data-render]');
    await expect(stage).toHaveAttribute('data-render', '1');

    await page.getByRole('button', { name: 'Replace target node' }).click();
    await expect(page.locator('[data-render]')).toHaveAttribute('data-render', '2');
    await expect(workspaceCard(page).getByRole('button')).toHaveText('Create project');
  });

  test('a reflow changes the layout without changing the intent', async ({ page }) => {
    await openMeridian(page, HASH.reflowed);
    await expect(page.locator('.reliability')).toHaveClass(/is-reflowed/);
    await expect(workspaceCard(page).getByRole('button')).toHaveText('Create project');
    await expect(templateCard(page).getByRole('button')).toHaveText('Create project template');
  });

  test('two semantically similar actions stay separable', async ({ page }) => {
    await openMeridian(page, HASH.reliability);
    // "Create project" and "Create project template" differ only by a suffix;
    // the ancestor card is what tells them apart.
    await expect(workspaceCard(page).getByRole('button')).toHaveText('Create project');
    await expect(templateCard(page).getByRole('button')).toHaveText('Create project template');
  });
});

test.describe('data-relative targets', () => {
  test('every row carries the same accessible pattern, which is why selection matters', async ({
    page,
  }) => {
    await openMeridian(page, HASH.projects);
    const rowMenus = page.getByRole('button', { name: /^More actions for / });
    // Several identical-by-role controls is exactly the ambiguity a selection
    // policy exists to resolve; one match here would make the test meaningless.
    expect(await rowMenus.count()).toBeGreaterThan(1);
  });

  test('the newest row is marked by the product, not guessed by position', async ({ page }) => {
    await openMeridian(page, HASH.projects);
    const newest = page.locator('tr[data-newest="1"]');
    await expect(newest).toHaveCount(1);
  });

  test('sorting reorders the rows, so "first" and "newest" stop agreeing', async ({ page }) => {
    await openMeridian(page, HASH.projects);
    const before = await page.locator('tbody tr th[scope="row"]').allTextContents();
    await page.locator('[data-sort="name"]').click();
    await expect(page).toHaveURL(/sort=name/);
    await expect(page.locator('[data-sort="name"]')).toHaveAttribute('aria-pressed', 'true');
    const after = await page.locator('tbody tr th[scope="row"]').allTextContents();
    expect(after).not.toEqual(before);
    expect([...after].sort((left, right) => left.localeCompare(right))).toEqual(after);
  });
});

test.describe('runtime emphasis', () => {
  test('a step with no emphasis leaves the ring on the theme default', async ({ page }) => {
    await openMeridian(page, HASH.projects);
    await page.evaluate(() =>
      (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
    );
    await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toBeVisible();

    const overrides = await page.evaluate(() => {
      const host = document.querySelector('lodariq-tour');
      const ring = host?.shadowRoot?.querySelector<HTMLElement>('[data-lodariq-target-outline]');
      const backdrop = host?.shadowRoot?.querySelector<HTMLElement>('[data-lodariq-backdrop]');
      return {
        weight: ring?.style.getPropertyValue('--lq-outline-weight') ?? null,
        line: ring?.getAttribute('data-lodariq-outline-line') ?? null,
        backdropHidden: backdrop ? backdrop.hidden : null,
      };
    });
    expect(overrides.weight).toBe('');
    expect(overrides.line).toBeNull();
    // A step that asked for no backdrop must not dim the product.
    expect(overrides.backdropHidden).not.toBe(false);
  });

  test('the backdrop element exists but never covers the target', async ({ page }) => {
    await openMeridian(page, HASH.projects);
    await page.evaluate(() =>
      (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
    );
    await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toBeVisible();

    const pointerEvents = await page.evaluate(() => {
      const host = document.querySelector('lodariq-tour');
      const backdrop = host?.shadowRoot?.querySelector('[data-lodariq-backdrop]');
      return backdrop ? getComputedStyle(backdrop).pointerEvents : null;
    });
    // The dim is a box-shadow spread; the box itself must stay out of the hit
    // test so a clickTarget step remains clickable.
    expect(pointerEvents).toBe('none');
  });
});
