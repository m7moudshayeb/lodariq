/**
 * The surfaces that used to see one step and now see five.
 *
 * A one-step fixture cannot show a wrapped filmstrip, a flow with edges, a batch
 * worth confirming, or two peers on different steps — so none of these were ever
 * exercised. Counts here are the point; five is the number every one of them
 * should agree on.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('t25');
const browser = await chromium.launch();

async function openPanel(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:5177/${query}`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`http://localhost:5177/${query}`);
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.__meridian.openAuthoring());
  await page.waitForTimeout(4500);
  return errors;
}

const shadowOf = (page, selector) =>
  page.evaluate((sel) => {
    const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector(sel));
    return Boolean(host);
  }, selector);

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = await openPanel(page);

// 1 — the filmstrip, at a width that forces it to cope.
const filmstripAt = async (width) => {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const host = [...document.querySelectorAll('*')].find((n) =>
      n.shadowRoot?.querySelector('.overlay-filmstrip'),
    );
    const strip = host?.shadowRoot?.querySelector('.overlay-filmstrip');
    const list = strip?.querySelector('[data-filmstrip-steps]');
    if (!strip || !list) return { chips: 0 };
    const r = strip.getBoundingClientRect();
    return {
      chips: list.querySelectorAll('.overlay-filmstrip-step').length,
      width: Math.round(r.width),
      right: Math.round(r.right),
      viewport: window.innerWidth,
      scrolls: list.scrollWidth > list.clientWidth + 1,
      titles: [...list.querySelectorAll('.overlay-filmstrip-step-title')].map((n) =>
        (n.textContent || '').trim().slice(0, 18),
      ),
    };
  });
};

console.log('FILMSTRIP');
for (const width of [1440, 900, 444]) {
  const strip = await filmstripAt(width);
  const overflows = strip.right > strip.viewport + 1;
  console.log(
    `  @${String(width).padEnd(5)} chips=${strip.chips} width=${strip.width} ` +
      `scrolls=${strip.scrolls} ${overflows ? '<< runs off screen' : 'fits'}`,
  );
  if (width === 1440) console.log('    titles:', JSON.stringify(strip.titles));
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(700);

await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) =>
    n.shadowRoot?.querySelector('[data-pill-operations]'),
  );
  host?.shadowRoot?.querySelector('[data-pill-operations]')?.click();
});
await page.waitForTimeout(2500);

const frame = page.frames().find((f) => f.url().includes('authoring.html'));
if (!frame) throw new Error('authoring frame missing');
const openSection = async (tab) => {
  await frame.evaluate((id) => {
    document.querySelector(`[data-operations-tab="${id}"]`)?.click();
  }, tab);
  await page.waitForTimeout(1800);
};

// 2 — the flow map, which needs four edges to be a flow at all.
await openSection('flow');
await page.waitForTimeout(1500);
const flow = await frame.evaluate(() => ({
  nodes: document.querySelectorAll('.tour-flow-node-card').length,
  edges: document.querySelectorAll('.react-flow__edge').length,
  labels: [...document.querySelectorAll('.tour-flow-node-copy')].map((n) =>
    (n.textContent || '').trim().replace(/\s+/gu, ' ').slice(0, 26),
  ),
}));
console.log(`\nFLOW MAP  nodes=${flow.nodes} edges=${flow.edges}`);
for (const label of flow.labels) console.log('   ', label);
await page.screenshot({ path: `${OUT}/flow.png` });

// 3 — batch edits: five rows, and the selector that claims to pick the broken ones.
await openSection('batch');
const batch = await frame.evaluate(() => {
  const rows = document.querySelectorAll('.tour-batch-table tbody tr');
  const buttons = [...document.querySelectorAll('.tour-batch-workspace button, .ops-box button')]
    .map((b) => (b.textContent || '').trim())
    .filter(Boolean);
  return { rows: rows.length, buttons: [...new Set(buttons)].slice(0, 8) };
});
console.log(`\nBATCH  rows=${batch.rows}`);
console.log('  actions:', JSON.stringify(batch.buttons));

const broken = await frame.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('Only the broken ones'),
  );
  if (!button) return 'no button';
  button.click();
  return 'clicked';
});
await page.waitForTimeout(1200);
const afterBroken = await frame.evaluate(() => ({
  checked: document.querySelectorAll('.tour-batch-table tbody input:checked').length,
  tag: (document.querySelector('.ops-box .ops-tag')?.textContent || '').trim(),
}));
console.log(
  `  "Only the broken ones" (${broken}) -> selected=${afterBroken.checked} tag="${afterBroken.tag}"`,
);
await page.screenshot({ path: `${OUT}/batch.png` });
console.log('\nerrors:', JSON.stringify(errors));
await page.close();

// 4 — presence, which the mock now parks on two distinct steps.
const peerPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const peerErrors = await openPanel(peerPage, '?lodariqPresence=demo');
const presence = await peerPage.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) =>
    n.shadowRoot?.querySelector('.overlay-filmstrip'),
  );
  const root = host?.shadowRoot;
  if (!root) return { peers: 0 };
  const avatars = [...root.querySelectorAll('.overlay-filmstrip-peer')];
  /*
   * Avatars hang off the list item, not the step button inside it — and the list
   * interleaves insert-between rows, so position in the list is not the step
   * number. Count only the items that actually carry a step.
   */
  let stepNumber = 0;
  const onSteps = [...root.querySelectorAll('[data-filmstrip-steps] > li')]
    .map((item) => {
      if (!item.querySelector('.overlay-filmstrip-step')) return null;
      stepNumber += 1;
      const peers = [...item.querySelectorAll('.overlay-filmstrip-peer')].map((a) => a.title);
      return peers.length ? { step: stepNumber, peers } : null;
    })
    .filter(Boolean);
  return {
    peers: avatars.length,
    names: avatars.map((a) => a.title).filter(Boolean),
    onSteps,
    lockBand: (root.querySelector('[class*="lock"]')?.textContent || '').trim().slice(0, 60),
    pillFaces: root.querySelectorAll('.overlay-mode-pill [class*="face"]').length,
  };
});
console.log('\nPRESENCE', JSON.stringify(presence));
await peerPage.screenshot({ path: `${OUT}/presence.png` });
console.log('presence errors:', JSON.stringify(peerErrors));
await browser.close();
