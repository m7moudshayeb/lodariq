/** Task 8 — drive every new control and screenshot it. */
import { chromium } from './env.mjs';
import { OUT, SDK_URL } from './probe.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const sdk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
sdk.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
sdk.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 240)));

await sdk.goto(SDK_URL);
await sdk.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await sdk.reload();
await sdk.waitForTimeout(2200);
await sdk.evaluate(() => window.__meridian.openAuthoring());
await sdk.waitForTimeout(4500);

const ev = (fn) => sdk.evaluate((body) => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  return new Function('root', body)(host.shadowRoot);
}, fn);
const ring = () => sdk.evaluate(() => {
  const host = [...document.querySelectorAll('lodariq-tour')].find((n) => n.shadowRoot);
  const o = host?.shadowRoot.querySelector('.tour-target-outline');
  const b = host?.shadowRoot.querySelector('.tour-backdrop');
  if (!o) return { missing: true };
  const cs = getComputedStyle(o);
  const bcs = b ? getComputedStyle(b) : null;
  return {
    state: host.getAttribute('data-lodariq-authoring-target-state') ?? 'ok',
    border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
    shadow: cs.boxShadow.slice(0, 110),
    radius: cs.borderRadius,
    backdropHidden: b?.hidden,
    backdropShadow: bcs?.boxShadow.slice(0, 90),
  };
});
const step = async (label, fn) => {
  const v = await fn();
  console.log(`\n## ${label}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);
  return v;
};
const frame = () => sdk.frames().find((f) => f.url().includes('authoring.html'));

await step('1 · ring as drawn (ok)', ring);
await step('1b · compass ring + dots', () => ev(`
  const c = root.querySelector('.overlay-compass');
  const cs = getComputedStyle(c);
  const dot = c.querySelector('[data-align="center"]:not([hidden])');
  const mid = c.querySelector('[data-align="start"]:not([hidden])');
  const cd = dot && getComputedStyle(dot, '::before');
  const cm = mid && getComputedStyle(mid, '::before');
  return { cmpringBorder: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
    cmpringRadius: cs.borderRadius,
    centreDot: cd && { w: cd.width, bg: cd.backgroundColor, border: cd.borderTopWidth },
    midDot: cm && { w: cm.width, opacity: cm.opacity } };
`));

// Open the target inspector by clicking the ring's band.
const at = await ev(`
  const r = root.querySelector('.overlay-target-ring');
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width * 0.30, y: b.top };
`);
await sdk.mouse.click(at.x, at.y);
await sdk.waitForTimeout(2200);
await sdk.screenshot({ path: `${OUT}/t8-target-inspector.png` });

await step('2 · target inspector', () => frame().evaluate(() => {
  const panel = document.querySelector('.overlay-step-inspector-panel');
  return {
    title: panel?.querySelector('strong')?.textContent,
    tag: panel?.querySelector('.overlay-step-inspector-status')?.textContent,
    sections: [...document.querySelectorAll('.inspector-section')].map((s) => s.dataset.section),
    toolbar: [...document.querySelectorAll('[data-toolbar-target]')].map((b) => b.textContent.trim()),
  };
}));

// Ring style: dashed + glow + weight 5, then read the drawn ring.
await step('3 · ring style edits reach the drawn ring', async () => {
  await frame().evaluate(() => {
    document.querySelector('.inspector-section[data-section="ringStyle"]').open = true;
  });
  await sdk.waitForTimeout(400);
  const clicked = await frame().evaluate(() => {
    const scope = document.querySelector('[data-target-section="ringStyle"]');
    const hit = (label, option) => {
      const group = scope.querySelector(`[aria-label="${label}"]`);
      const button = [...(group?.querySelectorAll('.ui-segmented-option') ?? [])]
        .find((b) => b.textContent?.trim().toLowerCase() === option);
      button?.click();
      return Boolean(button);
    };
    const weight = scope.querySelectorAll('input[type=range]')[0];
    if (weight) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(weight, '5');
      weight.dispatchEvent(new Event('input', { bubbles: true }));
      weight.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { line: hit('Line', 'dashed'), glow: hit('Glow', 'on'), pulse: hit('Pulse', 'on'), weight: Boolean(weight) };
  });
  await sdk.waitForTimeout(2200);
  const doc = await sdk.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lodariq:doc:'));
    if (!key) return null;
    const d = JSON.parse(localStorage.getItem(key));
    return d.blocks?.find((b) => b.type === 'tourStep')?.props?.emphasis ?? null;
  });
  return { clicked, document: doc, ring: await ring() };
});
await sdk.screenshot({ path: `${OUT}/t8-ring-styled.png` });

// Spotlight on.
await step('4 · spotlight backdrop', async () => {
  await frame().evaluate(() => {
    document.querySelector('.inspector-section[data-section="ringStyle"]').open = false;
    document.querySelector('.inspector-section[data-section="spotlight"]').open = true;
  });
  await sdk.waitForTimeout(400);
  const on = await frame().evaluate(() => {
    const scope = document.querySelector('[data-target-section="spotlight"]');
    const group = scope.querySelector('[aria-label="Dim everything else"]');
    const button = [...(group?.querySelectorAll('.ui-segmented-option') ?? [])]
      .find((b) => b.textContent?.trim().toLowerCase() === 'on');
    button?.click();
    return Boolean(button);
  });
  await sdk.waitForTimeout(1800);
  return { clicked: on, ring: await ring() };
});
await sdk.screenshot({ path: `${OUT}/t8-spotlight.png` });

// Evidence / Approach / Repair bodies.
await step('5 · evidence, approach, repair', async () => {
  await frame().evaluate(() => {
    for (const id of ['evidence', 'approach', 'repair']) {
      const d = document.querySelector(`.inspector-section[data-section="${id}"]`);
      if (d) d.open = true;
    }
    document.querySelector('.inspector-section[data-section="spotlight"]').open = false;
  });
  await sdk.waitForTimeout(500);
  return frame().evaluate(() => ({
    evidence: [...document.querySelectorAll('.target-evidence-row')].map((r) => r.textContent),
    approach: document.querySelector('[data-target-section="approach"]')?.textContent?.slice(0, 160),
    repair: document.querySelector('[data-target-section="repair"]')?.textContent?.slice(0, 160),
    disabled: [...document.querySelectorAll('[data-target-action][disabled]')].map((b) => b.textContent.trim()),
  }));
});
await sdk.screenshot({ path: `${OUT}/t8-evidence-approach-repair.png` });

// The picker's hover card.
await step('6 · picker hover card', async () => {
  await frame().evaluate(() => {
    document.querySelector('[data-toolbar-target="change"]')?.click();
  });
  await sdk.waitForTimeout(1600);
  const box = await sdk.evaluate(() => {
    const n = [...document.querySelectorAll('button, a')].find((b) => b.textContent?.includes('Import'));
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await sdk.mouse.move(box.x, box.y);
  await sdk.waitForTimeout(900);
  return sdk.evaluate(() => {
    const card = document.querySelector('[data-lodariq-bridge="target-label"]');
    const outline = document.querySelector('[data-lodariq-bridge="target-outline"]');
    const cs = card && getComputedStyle(card);
    const os = outline && getComputedStyle(outline);
    return {
      text: card?.innerText,
      card: cs && { w: cs.minWidth, pad: cs.padding, radius: cs.borderRadius, bg: cs.backgroundColor },
      outline: os && { border: os.borderTopWidth + ' ' + os.borderTopStyle, radius: os.borderRadius, bg: os.backgroundColor },
    };
  });
});
await sdk.screenshot({ path: `${OUT}/t8-hovercard.png` });
await sdk.keyboard.press('Escape');
await sdk.waitForTimeout(900);

console.log('\n## console errors\n' + (errors.length ? errors.join('\n') : 'none'));
await browser.close();
