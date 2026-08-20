/**
 * Check now carries the schema's publish gate. The fixture's one step is
 * readiness-clean, so add a bare step and confirm the group appears — and that
 * Release stops listing the same issues and points here instead.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('build');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5177/');
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(5000);

const frame = () => page.frames().find((f) => f.url().includes('authoring'));

/* Add a step from the filmstrip. A step with no target and no copy is exactly
   what the publish gate exists to catch. */
const added = await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  const root = host?.shadowRoot;
  if (!root) return 'no shadow root';
  const add = root.querySelector('[data-step-command="add"], [data-action="add-step"], [aria-label*="Add step" i]');
  if (!add) {
    return [...root.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent?.trim()).filter(Boolean).slice(0, 20).join(' | ');
  }
  add.click();
  return 'clicked';
});
console.log('add step ->', added);
await page.waitForTimeout(2500);

await page.keyboard.press('Meta+k');
await page.waitForTimeout(600);
await page.keyboard.type('check');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

const check = await frame().evaluate(() => ({
  section: document.querySelector('.operations-hub-head h2')?.textContent?.trim(),
  groups: [...document.querySelectorAll('.operations-hub-body .ops-box[data-kind]')].map((b) => ({
    kind: b.dataset.kind,
    title: b.querySelector('h3')?.textContent?.trim(),
    rows: b.querySelectorAll('.ops-list li').length,
  })),
  blocking: document.querySelector('.operations-check-tally-cell[data-tone="blocker"] strong')?.textContent,
}));
console.log('CHECK', JSON.stringify(check, null, 1));
await page.screenshot({ path: `${OUT}/check-readiness.png` });

/* Release must now show a count and a way to Check, not the list. */
await frame().evaluate(() => document.querySelector('[data-operations-tab="release"]')?.click());
await page.waitForTimeout(1600);
const release = await frame().evaluate(() => ({
  blockerCard: Boolean(document.querySelector('.release-blocker-card')),
  heading: document.querySelector('#blocker-title')?.textContent?.trim() ?? null,
  listedIssues: document.querySelectorAll('.release-blocker-card .publish-issue-row').length,
  linkToCheck: [...document.querySelectorAll('.release-blocker-card button')]
    .map((b) => b.textContent.trim()),
}));
console.log('RELEASE', JSON.stringify(release));
await page.screenshot({ path: `${OUT}/release-pointer.png` });
console.log('errors:', errors.slice(0, 5));
await browser.close();
