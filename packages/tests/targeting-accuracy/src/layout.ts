/**
 * Synthetic layout engine.
 *
 * jsdom reports every rect as 0x0, which would silently disable every visual
 * signal family (`layout-slot`, `visual-topology`, `sibling-position`) and make
 * the accuracy numbers meaningless — the resolver would look better than it is
 * because the hardest evidence never participates.
 *
 * This assigns deterministic rects derived from the *rendered structure*, so a
 * sibling reorder genuinely moves boxes, a wrapper insert barely moves them,
 * and a collection keeps its rows aligned. It is a flow model, not a browser:
 * it only has to be stable and structure-dependent, not correct.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const VIEWPORT_WIDTH = 1_440;
export const VIEWPORT_HEIGHT = 900;

const LEAF_HEIGHT = 32;
const GAP = 8;
const PAD = 12;

/** Containers marked this way lay their children out horizontally. */
const ROW_ATTRIBUTE = 'data-harness-row';

function childElements(element: Element): Element[] {
  return Array.prototype.slice.call(element.children) as Element[];
}

function isRow(element: Element): boolean {
  return element.hasAttribute(ROW_ATTRIBUTE);
}

function measureHeight(element: Element): number {
  const children = childElements(element);
  if (children.length === 0) return LEAF_HEIGHT;
  if (isRow(element)) {
    let tallest = 0;
    for (const child of children) tallest = Math.max(tallest, measureHeight(child));
    return tallest + PAD * 2;
  }
  let total = PAD * 2;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) continue;
    total += measureHeight(child);
    if (index < children.length - 1) total += GAP;
  }
  return total;
}

function defineRect(element: Element, rect: Rect): void {
  const domRect: DOMRect = {
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  } as DOMRect;
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value: () => domRect,
  });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    writable: true,
    value: () => [domRect] as unknown as DOMRectList,
  });
  // Visibility heuristics commonly consult offset boxes as well.
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: rect.width });
  Object.defineProperty(element, 'offsetHeight', { configurable: true, value: rect.height });
  Object.defineProperty(element, 'offsetLeft', { configurable: true, value: rect.left });
  Object.defineProperty(element, 'offsetTop', { configurable: true, value: rect.top });
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    get: () => element.parentElement,
  });
}

/**
 * Reading direction, inherited down the tree the way `dir` actually inherits.
 *
 * An RTL locale does not merely translate copy: it mirrors geometry, so the
 * first control in a row moves to the right edge. Without this the RTL mutation
 * would change nothing a visual signal can see, and would silently test the
 * same thing `i18n-text-swap` already tests.
 */
function directionOf(element: Element, inherited: boolean): boolean {
  const declared = element.getAttribute('dir');
  if (declared === 'rtl') return true;
  if (declared === 'ltr') return false;
  return inherited;
}

function place(
  element: Element,
  left: number,
  top: number,
  width: number,
  inheritedRtl = false,
): void {
  const height = measureHeight(element);
  defineRect(element, { left, top, width, height });

  const children = childElements(element);
  if (children.length === 0) return;

  const rtl = directionOf(element, inheritedRtl);

  if (isRow(element)) {
    const innerWidth = Math.max(width - PAD * 2, children.length);
    const slot = Math.floor(innerWidth / children.length);
    const ordered = rtl ? [...children].reverse() : children;
    let cursor = left + PAD;
    for (const child of ordered) {
      place(child, cursor, top + PAD, Math.max(slot - GAP, 1), rtl);
      cursor += slot;
    }
    return;
  }

  let cursor = top + PAD;
  for (const child of children) {
    place(child, left + PAD, cursor, Math.max(width - PAD * 2, 1), rtl);
    cursor += measureHeight(child) + GAP;
  }
}

/**
 * Recomputes rects for the whole tree. Call once after building the page and
 * again after every mutation — a mutation that changes structure must change
 * layout, or the harness would credit the resolver with visual evidence that a
 * real browser would have invalidated.
 */
export function applySyntheticLayout(root: HTMLElement): void {
  place(root, 0, 0, VIEWPORT_WIDTH);
}
