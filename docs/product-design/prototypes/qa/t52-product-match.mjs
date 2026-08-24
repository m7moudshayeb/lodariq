/**
 * The one that answers "did Product match actually land?"
 *
 *   pnpm --filter @lodariq/sdk-authoring build   # the fixture host reads dist
 *   SDK_PORT=5177 ASSERT=1 node docs/product-design/prototypes/qa/t52-product-match.mjs
 *
 * Adopting a match used to report "Product match was saved, but the preview
 * could not refresh" — about a preview that had refreshed. The host's
 * `theme.preview.apply` handler returned the replay promise, and a returned
 * promise holds the bridge ack until it settles, against a 2s budget in the
 * frame. A replay is compile + resolve + play. Measured: the error arrived at
 * 2075ms with the repainted dialog already on the page.
 *
 * So this asserts three things at once — the match saves, the card takes the
 * product's own styling, and no failure is reported — and it times the outcome,
 * because a pass at ~2000ms would mean the timeout is back.
 */
import { chromium } from './env.mjs';

const PORT = process.env.SDK_PORT ?? 5177;
const assert = process.env.ASSERT === '1';
const failures = [];

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
await page.addInitScript(() => {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* a sandboxed frame may refuse; the navigation still applies. */
  }
});
await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(2500);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(5000);

const frame = page.frames().find((candidate) => candidate.url().includes('authoring.html'));
if (!frame) throw new Error('no authoring frame');

const readCard = () =>
  frame.evaluate(() => {
    const card = document.querySelector('.overlay-step-card');
    if (!card) return null;
    const style = getComputedStyle(card);
    return { radius: style.borderTopLeftRadius, font: style.fontFamily.slice(0, 48) };
  });

const before = await readCard();

await page.evaluate(async () => {
  const shellHost = [...document.querySelectorAll('*')].find((node) =>
    node.shadowRoot?.querySelector('[data-pill-menu]'),
  );
  const root = shellHost.shadowRoot;
  root
    .querySelector('[data-pill-menu]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  await new Promise((resolve) => setTimeout(resolve, 350));
  root
    .querySelector('[data-pill-operations]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
});
await page.waitForTimeout(3000);
await frame.evaluate(() => {
  document
    .querySelector('[data-operations-tab="appearance"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(2000);

const outcome = await frame.evaluate(async () => {
  const started = performance.now();
  [...document.querySelectorAll('button')]
    .find((button) => (button.textContent ?? '').replace(/\s+/gu, ' ').trim() === 'Match product')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  for (let attempt = 0; attempt < 240; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const text = (document.body.textContent ?? '').replace(/\s+/gu, ' ');
    if (/could not refresh|conflicts with the active preview|could not be saved/u.test(text)) {
      return { state: 'error', ms: Math.round(performance.now() - started), text: text.slice(0, 160) };
    }
    if (/Product match saved as a workspace draft|already matches this product evidence/u.test(text)) {
      return { state: 'saved', ms: Math.round(performance.now() - started) };
    }
  }
  return { state: 'timeout', ms: Math.round(performance.now() - started) };
});
console.log('outcome:', JSON.stringify(outcome));

/*
 * A saved match lands the creator in Appearance, which is the point — the
 * proposal is there to review. Back out to editing to measure the card.
 */
await frame.evaluate(() => {
  const label = (button) =>
    (button.getAttribute('aria-label') ?? button.textContent ?? '').replace(/\s+/gu, ' ').trim();
  [...document.querySelectorAll('button')]
    .find((button) => label(button) === 'Back to authoring')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(3500);
const after = await readCard();
console.log('card before:', JSON.stringify(before));
console.log('card after :', JSON.stringify(after));

if (outcome.state !== 'saved') failures.push(`match did not save: ${JSON.stringify(outcome)}`);
if (outcome.state === 'error' && outcome.ms >= 1900 && outcome.ms <= 2600) {
  failures.push('the failure arrived on the 2s ack budget — the replay is holding the ack again');
}
if (!before || !after) failures.push('the edit-mode card was not measurable');
else if (JSON.stringify(before) === JSON.stringify(after)) {
  failures.push('the card did not take the product styling');
}

console.log(failures.length ? `\nFAIL\n  ${failures.join('\n  ')}` : '\nOK — matched, saved, repainted');
await browser.close();
if (assert && failures.length) process.exit(1);
