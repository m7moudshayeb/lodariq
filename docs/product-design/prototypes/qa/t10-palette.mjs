/** §7.5 palette: open it, search it, drive it. */
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
await page.waitForTimeout(4500);

const ev = async (fn) => page.evaluate((body) => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  return new Function('root', 'host', body)(host.shadowRoot, host);
}, fn);

const state = () => ev(`
  const p = root.querySelector('.overlay-palette');
  if (!p) return { present: false };
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p);
  const rows = [...p.querySelectorAll('[data-palette-row]')].map(n => ({
    label: n.querySelector('.overlay-palette-label')?.textContent.trim(),
    group: n.querySelector('.overlay-palette-group')?.textContent.trim(),
    active: n.dataset.active === 'true',
    disabled: n.getAttribute('aria-disabled') === 'true',
    opacity: getComputedStyle(n).opacity,
  }));
  return { present: true, hidden: p.hidden, x: Math.round(r.x), y: Math.round(r.y),
    w: Math.round(r.width), h: Math.round(r.height), z: cs.zIndex,
    placeholder: p.querySelector('[data-palette-input]')?.placeholder,
    focused: root.activeElement === p.querySelector('[data-palette-input]'),
    empty: p.querySelector('.overlay-palette-empty')?.textContent.trim() ?? null,
    rowCount: rows.length, rows };
`);

console.log('1. before ⌘K:', JSON.stringify(await state()).slice(0, 120));

await page.keyboard.press('Meta+k');
await page.waitForTimeout(350);
let s = await state();
console.log(`2. after ⌘K: hidden=${s.hidden} ${s.w}x${s.h} at (${s.x},${s.y}) z=${s.z} focused=${s.focused}`);
console.log(`   placeholder: ${s.placeholder}`);
console.log(`   ${s.rowCount} rows:`);
for (const r of s.rows) console.log(`     ${r.active ? '>' : ' '} ${r.label}  ·  ${r.group}${r.disabled ? `  [disabled ${r.opacity}]` : ''}`);
await page.screenshot({ path: `${OUT}/t10-palette-open.png`, clip: { x: 380, y: 70, width: 680, height: 420 } });

console.log('\n3. arrow down twice');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);
s = await state();
console.log('   active row:', s.rows.find((r) => r.active)?.label);

console.log('\n4. type "story"');
await page.keyboard.type('story');
await page.waitForTimeout(300);
s = await state();
console.log(`   ${s.rowCount} rows:`, s.rows.map((r) => r.label).join(' | '));

console.log('\n5. type a sentence: "make this friendlier please"');
for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
await page.keyboard.type('make this friendlier please');
await page.waitForTimeout(300);
s = await state();
console.log(`   ${s.rowCount} rows:`);
for (const r of s.rows) console.log(`     ${r.label}  ·  ${r.group}${r.disabled ? '  [disabled]' : ''}`);
await page.screenshot({ path: `${OUT}/t10-palette-nl.png`, clip: { x: 380, y: 70, width: 680, height: 420 } });

console.log('\n6. gibberish → free-text row');
for (let i = 0; i < 27; i++) await page.keyboard.press('Backspace');
await page.keyboard.type('zzqq widget');
await page.waitForTimeout(300);
s = await state();
console.log(`   ${s.rowCount} rows:`, s.rows.map((r) => `${r.label}${r.disabled ? ' [disabled]' : ''}`).join(' | '), '| empty:', s.empty);

console.log('\n7. Escape closes');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
console.log('   hidden:', (await state()).hidden);

console.log('\n8. run a command: ⌘K, "storyboard", Enter');
await page.keyboard.press('Meta+k');
await page.waitForTimeout(300);
await page.keyboard.type('storyboard');
await page.waitForTimeout(250);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
const after = await ev(`
  const p = root.querySelector('.overlay-palette');
  const f = [...document.querySelectorAll('iframe')].find(n => n.src.includes('authoring'));
  return { paletteHidden: p.hidden, presentation: root.querySelector('[data-overlay-root]')?.dataset.presentation ?? null,
    dimmer: !!root.querySelector('.overlay-operations-dimmer:not([hidden])') };
`);
const opsTab = await page.evaluate(() => {
  const f = [...document.querySelectorAll('iframe')].find((n) => n.src.includes('authoring'));
  const d = f?.contentDocument;
  const on = d?.querySelector('.operations-nav [aria-selected="true"], [data-operations-tab][aria-selected="true"], .operations-hub [aria-current="page"]');
  const heading = d?.querySelector('.operations-hub h2, .shead h2, h2');
  return { tab: on?.textContent?.trim() ?? null, heading: heading?.textContent?.trim() ?? null };
});
console.log('   ', JSON.stringify(after), JSON.stringify(opsTab));
await page.screenshot({ path: `${OUT}/t10-palette-ran.png` });

console.log('\n9. the pill menu route');
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
const menuRow = await ev(`
  const btn = root.querySelector('[data-pill-menu]');
  if (!btn) return 'no pill menu button';
  btn.click();
  const row = root.querySelector('[data-pill-command-palette]');
  return row ? row.textContent.trim().replace(/\\s+/g, ' ') : 'row missing';
`);
console.log('   pill row:', menuRow);

console.log('\nerrors:', errors.slice(0, 6));
await browser.close();
