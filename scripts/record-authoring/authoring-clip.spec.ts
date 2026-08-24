import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';

/**
 * Records the authoring clip used behind the marketing hero.
 *
 * Why a script and not a screen capture: this footage goes stale every time the
 * authoring UI changes, and a hand-recorded take cannot be reproduced. Here the
 * cursor path, the dwell times and the beats are all fixed, so re-recording is
 * one command and the result is identical apart from the UI itself.
 *
 * The bootstrap came from `packages/tests/e2e/authoring-accessibility.spec.ts`, but
 * that file is stale: the launcher's second control is now "View experiences",
 * not "Experiences on this page". Fixed here; that spec still needs it.
 */

/** Dwell times. Long enough to read, short enough that the loop stays under ~20s. */
const BEAT = 900;
const SETTLE = 450;

test('records a real authoring session', async ({ page }) => {
  await page.addInitScript(CURSOR_SCRIPT);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.mouse.move(720, 500);
  await page.waitForTimeout(BEAT);

  // ── open the authoring panel on the product itself ──────────────────
  await click(page, page.getByRole('button', { name: 'Open Lodariq actions' }));
  await click(page, page.getByRole('button', { name: 'View experiences' }));
  await click(page, page.getByRole('button', { name: 'Open Welcome tour' }));

  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Lodariq authoring"]').getByRole('main'),
  ).toBeVisible();
  await page.waitForTimeout(BEAT * 2);

  // ── arrange the card, on the page, with no code ─────────────────────
  // Inspector sections are plain buttons in a nav; the choice fields are
  // AuthoringSegmentedControl, which is role="group" wrapping aria-pressed
  // buttons — not radios. Scoping by the group's label keeps "Inline" from
  // matching the same option in the popup composition tray.
  await click(
    page,
    await either(page, (scope) => scope.getByRole('button', { name: 'Actions', exact: true })),
  );
  await page.waitForTimeout(SETTLE);

  await click(page, await either(page, (scope) => choice(scope, 'Layout', 'Inline')));
  await page.waitForTimeout(BEAT);

  await click(page, await either(page, (scope) => choice(scope, 'Step indicator', 'Dots')));
  await page.waitForTimeout(BEAT);

  await click(
    page,
    await either(page, (scope) => choice(scope, 'Indicator position', 'With the buttons')),
  );

  // The editing canvas draws the card's content, not its chrome, so the
  // indicator that was just switched on only appears once Preview hands the
  // step back to the real runtime. Without this beat the clip shows a control
  // being toggled and nothing happening.
  await page.waitForTimeout(BEAT);
  await click(page, page.getByRole('button', { name: 'Preview' }));
  await expect(page.locator('lodariq-tour')).toHaveAttribute(
    'data-lodariq-preview-interactive',
    /.*/,
  );

  // Hold on the finished card. The clip loops from here, so end where the eye
  // should land rather than on the cursor mid-move.
  await page.mouse.move(720, 640, { steps: 24 });
  await page.waitForTimeout(BEAT * 3);
});

/** One option inside a labelled segmented control. */
function choice(scope: Page | FrameLocator, field: string, option: string): Locator {
  return scope.getByRole('group', { name: field }).getByRole('button', { name: option, exact: true });
}

/**
 * Some panel chrome lives on the host page and some inside the authoring
 * iframe. Rather than hard-code a guess per control, look in the page first and
 * fall back to the frame — and fail with the control's name if neither has it.
 */
async function either(
  page: Page,
  build: (scope: Page | FrameLocator) => Locator,
): Promise<Locator> {
  const inPage = build(page);
  if ((await inPage.count()) > 0) return inPage.first();
  const inFrame = build(page.frameLocator('iframe[title="Lodariq authoring"]'));
  await expect(
    inFrame.first(),
    'control not found on the host page or in the authoring frame — see the README',
  ).toBeVisible();
  return inFrame.first();
}

/**
 * Move to the control before clicking it, so the cursor reads as deliberate.
 * The launcher opens its trays on hover, so a control the dwell already opened
 * must not also be clicked — that toggles it straight back shut.
 */
async function click(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 26 });
    await page.waitForTimeout(220);
  }
  if ((await locator.getAttribute('aria-expanded')) !== 'true') await locator.click();
  await page.waitForTimeout(SETTLE);
}

/**
 * Playwright's synthetic mouse fires real events but paints no pointer, so a
 * recording made without this shows controls activating by themselves. The dot
 * follows real mousemove events, which means it can never drift out of sync
 * with where the clicks actually land.
 */
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = \`
      .lq-rec-cursor {
        position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;
        width: 22px; height: 22px; margin: -3px 0 0 -3px;
        transition: transform 90ms linear;
        filter: drop-shadow(0 2px 5px rgba(0,0,0,.45));
      }
      .lq-rec-ping {
        position: fixed; z-index: 2147483646; pointer-events: none;
        width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%;
        border: 2px solid rgba(124,140,255,.9); opacity: 0; transform: scale(.4);
      }
      @keyframes lq-rec-ping { 0% { opacity: .9; transform: scale(.4) } 100% { opacity: 0; transform: scale(1.6) } }
    \`;
    document.head.appendChild(style);

    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cursor.setAttribute('class', 'lq-rec-cursor');
    cursor.setAttribute('viewBox', '0 0 22 26');
    cursor.innerHTML = '<path d="M2 2l16.5 8.6-7.2 1.6-3.1 7.2z" fill="#fff" stroke="#0b0d11" stroke-width="1.4" stroke-linejoin="round"/>';
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (event) => {
      cursor.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
    }, true);

    document.addEventListener('mousedown', (event) => {
      const ping = document.createElement('div');
      ping.className = 'lq-rec-ping';
      ping.style.left = event.clientX + 'px';
      ping.style.top = event.clientY + 'px';
      ping.style.animation = 'lq-rec-ping 420ms ease-out forwards';
      document.body.appendChild(ping);
      setTimeout(() => ping.remove(), 500);
    }, true);
  });
`;
