/**
 * The one that answers "does an announcement's inspector look like a tour's?"
 *
 *   pnpm --filter @lodariq/sdk-authoring build   # the fixture host reads dist
 *   SDK_PORT=5177 node docs/product-design/prototypes/qa/t51-inspector-parity.mjs
 *
 * `experience-behavior-section.tsx` was the only inspector code not built from
 * the shared property controls: a bare `<select>` in `.storyboard-property-row`
 * and a bare checkbox in `.storyboard-property-toggle`, neither class defined by
 * any stylesheet in the repo. So the four non-tour types opened their inspector
 * on unstyled browser widgets beside a tour's own rows.
 *
 * This opens each type, opens every section, and fails on any control that is
 * not one the tour uses.
 *
 * ASSERT=1 exits non-zero on a regression.
 */
import { chromium } from './env.mjs';

const PORT = process.env.SDK_PORT ?? 5177;
const assert = process.env.ASSERT === '1';
/** The section each type must actually fill, and how many controls it owes. */
const TYPES = [
  { type: 'announcement', section: 'frequency', controls: 2 },
  { type: 'hotspot', section: 'marker', controls: 1 },
  { type: 'survey', section: 'logic', controls: 2 },
  { type: 'checklist', section: 'completion', controls: 1 },
];
/** Classes no stylesheet defines. A row wearing one is unstyled by definition. */
const UNSTYLED = ['storyboard-property-row', 'storyboard-property-toggle'];

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const failures = [];

for (const { type, section: owed, controls: owedCount } of TYPES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  /*
   * Cleared before the first paint, and navigated rather than reloaded: the app
   * replaces its own URL with a hash route on boot, so a reload drops the
   * scenario params and the host opens the tour fixture instead.
   */
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* a sandboxed frame may refuse; the next navigation still applies. */
    }
  });
  await page.goto(`http://localhost:${PORT}/?scenario=experience-type&type=${type}`);
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.__meridian.openAuthoring());
  await page.waitForTimeout(4500);

  const frame = page.frames().find((candidate) => candidate.url().includes('authoring.html'));
  if (!frame) {
    failures.push(`${type}: no authoring frame`);
    await page.close();
    continue;
  }

  // The inspector opens from the toolbar's own settings control.
  await frame
    .evaluate(() => {
      const opener = [...document.querySelectorAll('button')].find(
        (button) => (button.getAttribute('aria-label') ?? '').trim() === 'Step settings',
      );
      opener?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })
    .catch(() => {});
  await page.waitForTimeout(1200);

  const report = await frame.evaluate(([unstyled, owedSection]) => {
    const panel = document.querySelector('.overlay-step-inspector-panel');
    if (!panel) return { open: false };
    // Open every section, so a body that only renders when open is measured too.
    for (const section of panel.querySelectorAll('details.inspector-section')) section.open = true;
    const bodies = [...panel.querySelectorAll('.inspector-section-body')];
    const sections = [...panel.querySelectorAll('details.inspector-section')].map((node) =>
      node.getAttribute('data-section'),
    );
    const offenders = [];
    for (const body of bodies) {
      for (const cls of unstyled) {
        if (body.querySelector(`.${cls}`)) offenders.push(cls);
      }
      for (const control of body.querySelectorAll('select, input[type="checkbox"]')) {
        // A native select is fine inside the design system's own mirror.
        const shared = control.closest('.ui-native-select-mirror, .ui-segmented, .ui-select');
        if (!shared) offenders.push(`${control.tagName.toLowerCase()} outside a shared control`);
      }
    }
    /*
     * Counted inside the type's own section, not across the panel: every type
     * carries the shared Style stack, so a panel-wide count stays healthy even
     * when the behaviour body rendered nothing — which is exactly how an earlier
     * version of this script passed against the code it was written to catch.
     */
    const owned = panel.querySelector(`details.inspector-section[data-section="${owedSection}"]`);
    return {
      open: true,
      sections,
      ownedRows: owned?.querySelectorAll('.rich-step-choice-field').length ?? 0,
      offenders: [...new Set(offenders)],
    };
  }, [UNSTYLED, owed]);

  console.log(`${type}: ${JSON.stringify(report)}`);
  if (!report.open) failures.push(`${type}: the inspector did not open`);
  else if (report.offenders.length) failures.push(`${type}: ${report.offenders.join(', ')}`);
  else if (report.ownedRows < owedCount) {
    failures.push(
      `${type}: the ${owed} section has ${report.ownedRows} shared rows, expected ${owedCount}`,
    );
  }
  await page.close();
}

console.log(
  failures.length
    ? `\nFAIL\n  ${failures.join('\n  ')}`
    : '\nOK — every type builds its rows from the shared controls',
);
await browser.close();
if (assert && failures.length) process.exit(1);
