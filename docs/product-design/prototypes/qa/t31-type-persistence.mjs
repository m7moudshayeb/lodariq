/**
 * Does a changed experience type survive a reload? (§3.3)
 *
 * t30 proves the switch reaches storage. It never reloads, which is exactly the
 * half the creator sees: "I have to re-change the type every time." This drives
 * the same switch, then reloads the host and reads the type back — from storage
 * first, then from what authoring actually reopens with, because those are two
 * different answers when something re-seeds the document on boot.
 *
 *   node docs/product-design/prototypes/qa/t31-type-persistence.mjs
 */
import { chromium } from './env.mjs';

const PORT = process.env.SDK_PORT ?? '5177';

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 200));
});

const failures = [];
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

const centreOf = async (selector) =>
  page.evaluate((sel) => {
    const found = [];
    const walk = (root) => {
      for (const node of root.querySelectorAll(sel)) found.push(node);
      for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(document);
    const target = found.find((node) => node.getBoundingClientRect().width > 0);
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);

const hoverReal = async (selector) => {
  const point = await centreOf(selector);
  if (!point) throw new Error(`nothing to hover: ${selector}`);
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.waitForTimeout(500);
  return point;
};

const clickReal = async (selector) => {
  const point = await centreOf(selector);
  if (!point) throw new Error(`nothing to click: ${selector}`);
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(500);
  return point;
};

/** Every stored document, plus the index rows that claim to describe them. */
const stored = () =>
  page.evaluate(() => ({
    documents: Object.keys(localStorage)
      .filter((key) => key.startsWith('lodariq:doc:'))
      .map((key) => {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '{}');
        return { key, id: parsed.id, type: parsed.type, blocks: (parsed.blocks ?? []).length };
      }),
    index: Object.keys(localStorage)
      .filter((key) => key.startsWith('lodariq:creator-index:'))
      .flatMap((key) => JSON.parse(localStorage.getItem(key) ?? '[]'))
      .map((entry) => ({ id: entry.documentId, type: entry.type })),
  }));

/** The type the pill is actually showing, which is what the creator reads. */
const pillType = () =>
  page.evaluate(() => {
    const findPill = () => {
      const direct = document.querySelector('.overlay-mode-pill');
      if (direct) return direct;
      for (const node of document.querySelectorAll('*')) {
        const found = node.shadowRoot?.querySelector('.overlay-mode-pill');
        if (found) return found;
      }
      return null;
    };
    const pill = findPill();
    if (!pill) return null;
    return (pill.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  });

await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForSelector('[data-lodariq-creator-launcher="true"]', { timeout: 15_000 });
await page.waitForTimeout(1200);

// ── 1. Open authoring on the host's own base document ────────────────────────
await page.evaluate(() => window.__meridian?.openAuthoring?.());
await page.waitForTimeout(6500);

const before = await stored();
check(
  'the base document starts as a tour',
  before.documents.every((entry) => entry.type === 'tour'),
  JSON.stringify(before.documents),
);

// ── 2. Switch it to an announcement through the pill ─────────────────────────
await clickReal('[data-pill-menu]');
await hoverReal('[data-pill-change-experience-type]');
await clickReal('[data-lodariq-switch-type="announcement"]');
await clickReal('[data-lodariq-experience-dialog-confirm]');
await page.waitForTimeout(2500);

const afterSwitch = await stored();
check(
  'the switch reaches storage',
  afterSwitch.documents.some((entry) => entry.type === 'announcement'),
  JSON.stringify(afterSwitch.documents),
);
check(
  'and the index row agrees with the document',
  afterSwitch.index.some((entry) => entry.type === 'announcement'),
  JSON.stringify(afterSwitch.index),
);
console.log(`      pill reads: ${await pillType()}`);

// ── 3. Reload the host — the half t30 never exercised ────────────────────────
await page.reload();
await page.waitForSelector('[data-lodariq-creator-launcher="true"]', { timeout: 15_000 });
await page.waitForTimeout(1500);

const afterReload = await stored();
check(
  'the stored document survives a reload',
  afterReload.documents.some((entry) => entry.type === 'announcement'),
  JSON.stringify(afterReload.documents),
);
check(
  'the index row survives a reload',
  afterReload.index.some((entry) => entry.type === 'announcement'),
  JSON.stringify(afterReload.index),
);

// ── 4. Reopen authoring and read what it actually loaded ─────────────────────
await page.evaluate(() => window.__meridian?.openAuthoring?.());
await page.waitForTimeout(6500);

const reopened = await stored();
check(
  'reopening authoring does not re-seed the type',
  reopened.documents.some((entry) => entry.type === 'announcement'),
  JSON.stringify(reopened.documents),
);
console.log(`      pill reads: ${await pillType()}`);

console.log(`\n${errors.length} console error(s)`);
for (const error of errors.slice(0, 6)) console.log(`  ${error}`);
console.log(failures.length ? `\nFAILED: ${failures.join(', ')}` : '\nAll checks passed.');
await browser.close();
process.exit(failures.length ? 1 : 0);
