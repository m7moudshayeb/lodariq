/** Measure the prototype's #sheet next to the build's Operations mode. */
import { chromium, outDir } from './env.mjs';

const OUT = outDir();
const PROTO = new URL('../authoring-spec.html', import.meta.url).href;
const browser = await chromium.launch();

/* ─── prototype ─────────────────────────────────────────────────────── */
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(PROTO);
await p.waitForTimeout(1500);
await p.evaluate(() => window.openOps?.('map'));
await p.waitForTimeout(600);

const proto = await p.evaluate(() => {
  const sheet = document.querySelector('#sheet');
  if (!sheet) return { missing: true };
  const nav = sheet.querySelector('.snav');
  const r = (el) => (el ? (({ width, height, x, y }) => ({
    w: Math.round(width), h: Math.round(height), x: Math.round(x), y: Math.round(y),
  }))(el.getBoundingClientRect()) : null);
  return {
    sheet: r(sheet),
    nav: r(nav),
    navBg: getComputedStyle(nav).backgroundColor,
    title: nav.querySelector('.stitle')?.textContent?.trim(),
    groups: [...nav.querySelectorAll('.grp')].map((g) => g.textContent.trim()),
    rows: [...nav.querySelectorAll('button[data-ops]')].map((b) => ({
      id: b.dataset.ops,
      label: b.querySelector('span')?.textContent?.trim(),
      icon: Boolean(b.querySelector('svg')),
      badge: b.querySelector('.bdg')?.textContent?.trim() ?? null,
      badgeClass: b.querySelector('.bdg')?.className ?? null,
      font: getComputedStyle(b).fontSize,
      pad: getComputedStyle(b).padding,
      radius: getComputedStyle(b).borderRadius,
    })),
    footer: nav.lastElementChild?.textContent?.replace(/\s+/g, ' ').trim(),
    close: sheet.querySelector('.sclose')?.textContent?.replace(/\s+/g, ' ').trim(),
  };
});
console.log('══ PROTOTYPE #sheet ══');
console.log(JSON.stringify(proto, null, 1));

/* every section's headline + box titles */
const ids = proto.rows.map((x) => x.id);
const sections = {};
for (const id of ids) {
  await p.evaluate((s) => window.openOps?.(s), id);
  await p.waitForTimeout(350);
  sections[id] = await p.evaluate(() => {
    const body = document.querySelector('#opsbody');
    return {
      h2: body.querySelector('.shead h2')?.textContent?.trim(),
      lede: body.querySelector('.shead p')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
      boxes: [...body.querySelectorAll('.box > h3')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
      tables: body.querySelectorAll('table').length,
      actions: [...body.querySelectorAll('[data-opsact]')].map((b) => b.dataset.opsact),
      height: Math.round(body.scrollHeight),
    };
  });
  await p.screenshot({ path: `${OUT}/proto-ops-${id}.png`, fullPage: false });
}
console.log('\n══ PROTOTYPE sections ══');
for (const [id, s] of Object.entries(sections)) {
  console.log(`\n[${id}] ${s.h2}  (${s.height}px, ${s.tables} tables)`);
  console.log(`   lede: ${s.lede}`);
  console.log(`   boxes(${s.boxes.length}): ${JSON.stringify(s.boxes)}`);
  console.log(`   acts(${s.actions.length}): ${JSON.stringify(s.actions)}`);
}
await p.close();

/* ─── build ─────────────────────────────────────────────────────────── */
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
/* The palette is the route a creator has: ⌘K, then the flow-map row. */
await page.keyboard.press('Meta+k');
await page.waitForTimeout(600);
await page.keyboard.type('flow');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(1600);

const build = await frame().evaluate(() => {
  const hub = document.querySelector('.operations-hub');
  if (!hub) return { missing: true, saw: document.body.innerText.slice(0, 300) };
  const nav = hub.querySelector('.operations-hub-nav');
  const r = (el) => (el ? (({ width, height, x, y }) => ({
    w: Math.round(width), h: Math.round(height), x: Math.round(x), y: Math.round(y),
  }))(el.getBoundingClientRect()) : null);
  return {
    hub: r(hub),
    nav: r(nav),
    navBg: nav ? getComputedStyle(nav).backgroundColor : null,
    groups: [...(nav?.querySelectorAll('.operations-hub-group-label') ?? [])].map((g) => g.textContent.trim()),
    rows: [...(nav?.querySelectorAll('button[data-operations-tab]') ?? [])].map((b) => ({
      id: b.dataset.operationsTab,
      label: b.textContent.trim(),
      icon: Boolean(b.querySelector('svg')),
      badge: b.querySelector('[class*="badge"]')?.textContent?.trim() ?? null,
      font: getComputedStyle(b).fontSize,
      pad: getComputedStyle(b).padding,
      radius: getComputedStyle(b).borderRadius,
    })),
    footer: null,
    close: [...hub.querySelectorAll('button')]
      .map((b) => b.getAttribute('aria-label') ?? b.textContent.trim())
      .filter((t) => /close|esc/i.test(t)),
  };
});
console.log('\n\n══ BUILD .operations-hub ══');
console.log(JSON.stringify(build, null, 1));
await page.screenshot({ path: `${OUT}/build-ops-nav.png` });

const buildIds = (build.rows ?? []).map((x) => x.id);
console.log('\n══ BUILD sections ══');
for (const id of buildIds) {
  if (['appearance', 'release', 'recovery'].includes(id)) { console.log(`\n[${id}] → leaves Operations (own mode)`); continue; }
  await frame().evaluate((t) => document.querySelector(`[data-operations-tab="${t}"]`)?.click(), id);
  await page.waitForTimeout(700);
  const s = await frame().evaluate(() => {
    const body = document.querySelector('.operations-hub-body');
    if (!body) return null;
    return {
      h2: document.querySelector('.operations-hub .panel-mode-title, .operations-hub h2')?.textContent?.trim(),
      lede: body.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
      headings: [...body.querySelectorAll('h2,h3,h4')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()).slice(0, 14),
      tables: body.querySelectorAll('table').length,
      buttons: body.querySelectorAll('button').length,
      height: Math.round(body.scrollHeight),
    };
  });
  console.log(`\n[${id}] ${s?.h2}  (${s?.height}px, ${s?.tables} tables, ${s?.buttons} buttons)`);
  console.log(`   lede: ${s?.lede}`);
  console.log(`   headings(${s?.headings.length}): ${JSON.stringify(s?.headings)}`);
  await page.screenshot({ path: `${OUT}/build-ops-${id}.png` });
}

console.log('\nerrors:', errors.slice(0, 8));
await browser.close();
