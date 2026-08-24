/** Show chip (§3.3): prototype vs SDK, measured. */
import { chromium, outDir } from './env.mjs';
import { PROTO_URL, SDK_URL, probeProto, probeShadow, diff, report } from './probe.mjs';

const OUT = outDir();
const browser = await chromium.launch();

// ── prototype ────────────────────────────────────────────────────────────────
const proto = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await proto.goto(PROTO_URL);
await proto.waitForTimeout(1200);
await proto.evaluate(() => { S.hideChrome = true; paint(); solve(); });
await proto.waitForTimeout(400);
const protoChip = await probeProto(proto, '#showchip');
const protoIcon = await proto.evaluate(() => {
  const svg = document.querySelector('#showchip svg');
  return svg ? { w: svg.getAttribute('width'), h: svg.getAttribute('height') } : null;
});
await proto.locator('#showchip').screenshot({ path: `${OUT}/t10-chip-proto.png` });

// ── SDK ──────────────────────────────────────────────────────────────────────
const sdk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
sdk.on('pageerror', (e) => errors.push(String(e)));
await sdk.goto(SDK_URL);
await sdk.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await sdk.reload();
await sdk.waitForTimeout(2200);
await sdk.evaluate(() => window.__meridian.openAuthoring());
await sdk.waitForTimeout(4500);

const ev = async (fn) => sdk.evaluate((body) => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  return new Function('root', 'host', body)(host.shadowRoot, host);
}, fn);

// Hide the panels the way a creator does: the card's own Hide tool.
await ev(`root.querySelector('[data-card-tool="hide"]')?.click(); return 1;`);
await sdk.waitForTimeout(900);

const sdkChip = await probeShadow(sdk, '.overlay-show-chip');
const sdkIcon = await ev(`
  const svg = root.querySelector('.overlay-show-chip svg');
  return svg ? { w: svg.getAttribute('width'), h: svg.getAttribute('height') } : null;
`);
const placement = await ev(`
  const c = root.querySelector('.overlay-show-chip');
  const r = c.getBoundingClientRect();
  return { right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom),
    text: c.textContent.trim() };
`);
const protoPlacement = await proto.evaluate(() => {
  const c = document.querySelector('#showchip');
  const r = c.getBoundingClientRect();
  const stage = document.querySelector('#lqlayer').getBoundingClientRect();
  return { right: Math.round(stage.right - r.right), bottom: Math.round(stage.bottom - r.bottom),
    text: c.textContent.trim() };
});

report([diff('show chip', protoChip, sdkChip)]);
console.log('  icon      proto=', JSON.stringify(protoIcon), ' sdk=', JSON.stringify(sdkIcon));
console.log('  inset     proto=', JSON.stringify(protoPlacement), '\n            sdk  =', JSON.stringify(placement));

// What else survives hiding, on each side?
const protoSurvivors = await proto.evaluate(() =>
  [...document.querySelectorAll('#lqlayer > *')].filter((n) => n.offsetParent !== null || getComputedStyle(n).display !== 'none').map((n) => n.id || n.className));
const sdkSurvivors = await sdk.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  const layer = host.shadowRoot.querySelector('[data-overlay-root]');
  return [...layer.children].filter((n) => {
    const cs = getComputedStyle(n);
    return !n.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && n.getBoundingClientRect().width > 0;
  }).map((n) => (typeof n.className === 'string' ? n.className : n.tagName));
});
console.log('\n  survives hiding — proto:', protoSurvivors.join(', '));
console.log('                     sdk :', sdkSurvivors.join(', '));

await sdk.locator('xpath=//*').first().screenshot({ path: `${OUT}/t10-chip-sdk-page.png` }).catch(() => {});
await sdk.screenshot({ path: `${OUT}/t10-chip-sdk.png`, clip: { x: 1100, y: 780, width: 340, height: 120 } });
console.log('\nerrors:', errors.slice(0, 5));
await browser.close();
