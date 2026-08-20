/** The Operations sheet after the chrome pass, section by section. */
import { chromium, outDir } from './env.mjs';

const OUT = outDir();
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

await page.keyboard.press('Meta+k');
await page.waitForTimeout(600);
await page.keyboard.type('flow');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);

const frame = () => page.frames().find((f) => f.url().includes('authoring'));

/* the sheet's own geometry, from the host side */
const sheet = await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  const iframe = host?.querySelector('iframe') ?? document.querySelector('iframe[src*="authoring"]');
  const r = iframe.getBoundingClientRect();
  const cs = getComputedStyle(iframe);
  return {
    box: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
    radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 24), z: cs.zIndex,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});
console.log('SHEET GEOMETRY');
console.log('  ', JSON.stringify(sheet));
console.log('   full bleed:', sheet.box.w === sheet.viewport.w && sheet.box.h === sheet.viewport.h ? 'YES' : 'NO');

const nav = await frame().evaluate(() => {
  const n = document.querySelector('.operations-hub-nav');
  const rows = [...n.querySelectorAll('button[data-operations-tab]')].map((b) => ({
    id: b.dataset.operationsTab,
    label: b.querySelector('.operations-hub-nav-label')?.textContent?.trim(),
    icon: Boolean(b.querySelector('.operations-hub-nav-icon svg')),
    badge: b.querySelector('.operations-hub-badge')?.textContent?.trim() ?? null,
    tone: b.querySelector('.operations-hub-badge')?.dataset.tone ?? null,
    aria: b.querySelector('.operations-hub-badge')?.getAttribute('aria-label') ?? null,
    font: getComputedStyle(b).fontSize, pad: getComputedStyle(b).padding, radius: getComputedStyle(b).borderRadius,
  }));
  return {
    width: Math.round(n.getBoundingClientRect().width),
    rows,
    withIcons: rows.filter((r) => r.icon).length,
    badges: rows.filter((r) => r.badge).map((r) => `${r.id}:${r.badge}(${r.tone})`),
    plan: document.querySelector('.operations-hub-plan')?.textContent?.replace(/\s+/g, ' ').trim(),
    lede: document.querySelector('.panel-mode-subtitle')?.textContent?.replace(/\s+/g, ' ').trim(),
  };
});
console.log('\nNAV');
console.log('   width      :', nav.width, '(prototype 214)');
console.log('   icons      :', nav.withIcons, '/', nav.rows.length);
console.log('   row metrics:', nav.rows[0].font, nav.rows[0].pad, nav.rows[0].radius, '(prototype 12.3px / 7px 9px / 7px)');
console.log('   badges     :', JSON.stringify(nav.badges));
console.log('   badge aria :', JSON.stringify(nav.rows.filter((r) => r.aria).map((r) => r.aria)));
console.log('   plan       :', nav.plan);
console.log('   lede       :', nav.lede?.slice(0, 90), '…');

await page.screenshot({ path: `${OUT}/t16-ops-flow.png` });

for (const id of ['storyboard', 'templates', 'check', 'audience', 'share', 'collaboration']) {
  await frame().evaluate((t) => document.querySelector(`[data-operations-tab="${t}"]`)?.click(), id);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/t16-ops-${id}.png` });
  const lede = await frame().evaluate(() =>
    document.querySelector('.panel-mode-subtitle')?.textContent?.replace(/\s+/g, ' ').trim());
  console.log(`\n[${id}] ${lede?.slice(0, 100)}…`);
}

/* Check's new shape */
await frame().evaluate(() => document.querySelector('[data-operations-tab="check"]')?.click());
await page.waitForTimeout(800);
const check = await frame().evaluate(() => ({
  tally: [...document.querySelectorAll('.operations-check-tally-cell')].map((c) =>
    `${c.querySelector('span').textContent}=${c.querySelector('strong').textContent}(${c.dataset.tone})`),
  groups: [...document.querySelectorAll('.operations-check-group h3')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
  publish: (() => {
    const b = document.querySelector('[data-check-action="publish"]');
    return b ? { text: b.textContent.trim(), disabled: b.disabled, title: b.title } : null;
  })(),
}));
console.log('\nCHECK');
console.log('   tally  :', JSON.stringify(check.tally));
console.log('   groups :', JSON.stringify(check.groups));
console.log('   publish:', JSON.stringify(check.publish));

console.log('\nerrors:', errors.slice(0, 8));
await browser.close();
