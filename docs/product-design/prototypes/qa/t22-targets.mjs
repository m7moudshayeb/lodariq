/**
 * Does every step's target actually resolve on the page?
 *
 * The fixture's four newer fingerprints were written by reading the host's
 * markup, never by watching them resolve. The ring is the ground truth: the
 * runtime draws it on whatever the resolver found, so hit-testing its centre
 * says which element a step is really pointing at.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('t22');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5177/');
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);

/** Runs `body` against the panel's shadow root. */
const shadow = async (body) =>
  page.evaluate((source) => {
    const host = [...document.querySelectorAll('*')].find((n) =>
      n.shadowRoot?.querySelector('[data-overlay-root]'),
    );
    if (!host) return { missing: 'shadow host' };
    return new Function('root', source)(host.shadowRoot);
  }, body);

const stepIds = await shadow(`return [...root.querySelectorAll('[data-step-id]')]
  .map((el) => el.getAttribute('data-step-id'));`);
console.log('STEPS', JSON.stringify(stepIds));

const rows = [];
for (const [index, stepId] of stepIds.entries()) {
  await page.evaluate(
    ([id]) => {
      const host = [...document.querySelectorAll('*')].find((n) =>
        n.shadowRoot?.querySelector('[data-overlay-root]'),
      );
      host?.shadowRoot
        ?.querySelector(`[data-step-id="${id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    },
    [stepId],
  );
  await page.waitForTimeout(1600);

  const row = await page.evaluate(() => {
    // The runtime paints the ring inside its own shadow root.
    const host = [...document.querySelectorAll('*')].find((n) =>
      n.shadowRoot?.querySelector('.tour-target-outline'),
    );
    const outline = host?.shadowRoot?.querySelector('.tour-target-outline');
    if (!outline) return { ring: null };
    const r = outline.getBoundingClientRect();
    if (!r.width && !r.height) return { ring: 'zero-size' };
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const named = hit?.closest('[aria-label], button, a, nav, table, [role]') ?? hit;
    return {
      ring: `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)}`,
      state: host?.getAttribute('data-lodariq-authoring-target-state') ?? null,
      hitTag: named?.tagName ?? null,
      hitRole: named?.getAttribute?.('role') ?? null,
      hitName:
        named?.getAttribute?.('aria-label') ??
        (named?.textContent || '').trim().replace(/\s+/gu, ' ').slice(0, 40),
    };
  });
  rows.push({ step: index + 1, stepId, ...row });
}

console.log('\nRESOLUTION');
for (const r of rows) {
  const verdict = r.ring && r.ring !== 'zero-size' ? (r.state ?? 'drawn') : 'NO RING';
  console.log(
    `  step ${r.step}  ${String(verdict).padEnd(12)} ring=${String(r.ring).padEnd(24)} hit=<${r.hitTag}${
      r.hitRole ? ` role=${r.hitRole}` : ''
    }> "${r.hitName}"`,
  );
}

const health = await page.evaluate(() => {
  const frame = [...document.querySelectorAll('iframe')].find((f) =>
    f.src.includes('authoring.html'),
  );
  return frame ? 'frame present' : 'no frame';
});
console.log('\n' + health);
await page.screenshot({ path: `${OUT}/targets.png` });
console.log('errors:', JSON.stringify(errors));
await browser.close();
