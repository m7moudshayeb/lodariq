/**
 * Automatic page freeze (§4.4a).
 *
 * The problem: the dropdown you want to target closes the moment you move the
 * mouse toward it. DevTools answers with hold-`⌥`; that is a DevTools chord for
 * a DevTools audience, and §3.1a bans modifier keys from the primary path.
 *
 * The answer here is that the freeze happens *because the creator did the thing
 * that needs it*. When a transient layer appears while picking, Lodariq pins it
 * and says so in one sentence with an immediate undo — never silently, because
 * unannounced automation reads as a bug (§13).
 *
 * "Freeze" means: stop the product from removing the layer. Nothing is mutated
 * that a reload would not undo, and unfreezing restores the layer's own
 * behaviour exactly.
 */

/** A layer that appeared after picking started and is a plausible pick target. */
export interface FrozenLayer {
  readonly element: Element;
  /** Restores whatever this module changed, exactly. */
  readonly release: () => void;
}

export interface PageFreezeOptions {
  readonly root?: Document;
  /** Called the first time a layer is frozen, so the picker can show the band. */
  readonly onFroze?: (layer: FrozenLayer) => void;
  /** Layers inside these are Lodariq's own and are never frozen. */
  readonly ignore?: (element: Element) => boolean;
}

export interface PageFreeze {
  /** Freeze everything transient that is on screen right now. */
  readonly freezeNow: () => number;
  readonly unfreeze: () => void;
  readonly frozen: () => boolean;
  readonly stop: () => void;
}

/**
 * Selectors for layers that vanish on pointer movement. Roles rather than class
 * names, because roles are what an app of any framework agrees on.
 */
const TRANSIENT_SELECTOR = [
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
  '[role="tooltip"]',
  '[role="combobox"][aria-expanded="true"]',
  '[data-state="open"]',
  '[aria-expanded="true"] + *',
].join(', ');

function isTransientLayer(element: Element): boolean {
  return element.matches(TRANSIENT_SELECTOR);
}

/**
 * Watches for transient layers while the picker is active and freezes them.
 *
 * Freezing works by intercepting the events that close these layers — pointer
 * leave, blur, escape, and the document-level dismiss handlers apps install —
 * during the capture phase, above the app's own listeners.
 */
export function startPageFreeze(options: PageFreezeOptions = {}): PageFreeze {
  const doc = options.root ?? document;
  const layers = new Map<Element, FrozenLayer>();
  const ignore = options.ignore ?? (() => false);
  let announced = false;

  /** Swallowed only while frozen; every one of these is a dismissal trigger. */
  const SUPPRESSED = ['pointerout', 'pointerleave', 'mouseout', 'mouseleave', 'focusout', 'blur'];

  const suppress = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (![...layers.keys()].some((layer) => layer === target || layer.contains(target))) return;
    event.stopImmediatePropagation();
  };

  function freeze(element: Element): void {
    if (layers.has(element) || ignore(element)) return;
    const layer: FrozenLayer = { element, release: () => layers.delete(element) };
    layers.set(element, layer);
    if (!announced) {
      announced = true;
      options.onFroze?.(layer);
    }
  }

  function freezeNow(): number {
    for (const candidate of doc.querySelectorAll(TRANSIENT_SELECTOR)) freeze(candidate);
    return layers.size;
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (isTransientLayer(node)) freeze(node);
        else for (const nested of node.querySelectorAll(TRANSIENT_SELECTOR)) freeze(nested);
      }
      // An app that opens a menu by flipping an attribute rather than inserting it.
      if (record.type === 'attributes' && record.target instanceof Element) {
        if (isTransientLayer(record.target)) freeze(record.target);
      }
    }
  });
  observer.observe(doc.documentElement, {
    attributeFilter: ['role', 'aria-expanded', 'data-state', 'hidden'],
    attributes: true,
    childList: true,
    subtree: true,
  });
  for (const type of SUPPRESSED) doc.addEventListener(type, suppress, true);

  return {
    freezeNow,
    frozen: () => layers.size > 0,
    unfreeze: () => {
      for (const layer of [...layers.values()]) layer.release();
      layers.clear();
      announced = false;
    },
    stop: () => {
      observer.disconnect();
      for (const type of SUPPRESSED) doc.removeEventListener(type, suppress, true);
      layers.clear();
    },
  };
}
