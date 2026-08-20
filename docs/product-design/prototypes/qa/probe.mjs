/**
 * Shared measurement helpers for prototype ⇄ SDK comparison.
 *
 * Screenshots catch what a diff of numbers hides and vice versa, so every check
 * takes both: a computed-style record and an image of the same element.
 */
import { outDir } from './env.mjs';
export const OUT = outDir();

export const PROTO_URL = new URL('../authoring-spec.html', import.meta.url).href;
export const SDK_URL = process.env.SDK_PORT ? `http://localhost:${process.env.SDK_PORT}/` : 'http://localhost:5177/';

/** Serialised in the page: returns a flat record of the properties we compare. */
export const PROBE_FN = `(sel, root) => {
  const scope = root || document;
  const el = scope.querySelector(sel);
  if (!el) return { missing: sel };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const px = (v) => (v === '' ? '' : v);
  return {
    w: Math.round(r.width * 10) / 10,
    h: Math.round(r.height * 10) / 10,
    display: cs.display,
    position: cs.position,
    flexDirection: cs.flexDirection,
    alignItems: cs.alignItems,
    justifyContent: cs.justifyContent,
    gap: px(cs.gap),
    padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
    borderRadius: cs.borderRadius,
    borderWidth: cs.borderTopWidth,
    borderColor: cs.borderTopColor,
    background: cs.backgroundColor,
    color: cs.color,
    boxShadow: cs.boxShadow,
    opacity: cs.opacity,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    textTransform: cs.textTransform,
    fontFamily: cs.fontFamily.split(',')[0].replace(/"/g, ''),
    text: (el.textContent || '').trim().slice(0, 60),
  };
}`;

export async function probeProto(page, selector) {
  return page.evaluate(
    ([fn, sel]) => new Function('return ' + fn)()(sel, null),
    [PROBE_FN, selector],
  );
}

/** Inside the authoring iframe. */
export async function probeFrame(frame, selector) {
  return frame.evaluate(
    ([fn, sel]) => new Function('return ' + fn)()(sel, null),
    [PROBE_FN, selector],
  );
}

/** Inside the SDK's shadow root on the host page. */
export async function probeShadow(page, selector) {
  return page.evaluate(
    ([fn, sel]) => {
      const host = [...document.querySelectorAll('*')].find((n) =>
        n.shadowRoot?.querySelector('[data-overlay-root]'),
      );
      if (!host) return { missing: 'shadow host' };
      return new Function('return ' + fn)()(sel, host.shadowRoot);
    },
    [PROBE_FN, selector],
  );
}

const NUMERIC = /^-?\d+(\.\d+)?px$/;

/** `color-mix()` serialises as color(srgb …); compare it as rgb/rgba. */
function normaliseColour(value) {
  const match = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(String(value));
  if (!match) return String(value);
  const [r, g, b] = [match[1], match[2], match[3]].map((c) => Math.round(Number(c) * 255));
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Numbers compared with a 1px tolerance; everything else exactly. */
function same(a, b) {
  if (a === b) return true;
  if (normaliseColour(a) === normaliseColour(b)) return true;
  if (NUMERIC.test(String(a)) && NUMERIC.test(String(b))) {
    return Math.abs(Number.parseFloat(a) - Number.parseFloat(b)) <= 1;
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1;
  return false;
}

export function diff(name, proto, sdk, only) {
  const rows = [];
  if (proto.missing) return [`${name}: prototype selector not found (${proto.missing})`];
  if (sdk.missing) return [`${name}: SDK selector not found (${sdk.missing})`];
  const keys = only ?? Object.keys(proto);
  for (const key of keys) {
    if (key === 'text') continue;
    if (!same(proto[key], sdk[key])) {
      rows.push(`  ${key.padEnd(15)} proto=${String(proto[key]).padEnd(28)} sdk=${sdk[key]}`);
    }
  }
  return rows.length ? [`${name}:`, ...rows] : [`${name}: match`];
}

export function report(lines) {
  for (const line of lines.flat()) console.log(line);
}
