/**
 * Mutation generators.
 *
 * Each entry stands for a change a real customer ships between authoring a step
 * and a visitor seeing it. `apply` mutates the page in place and returns the
 * element that is *still the same control* afterwards — the ground truth the
 * resolver is expected to land on. Returning `null` means the mutation does not
 * apply to that page and the trial is skipped rather than scored.
 *
 * `expectation` records what a correct resolver may do:
 *   - 'resolve'  — the control is still identifiable; abstaining is a miss.
 *   - 'either'   — resolving correctly or abstaining are both defensible.
 *   - 'abstain'  — the control the author picked is gone. Resolving onto
 *     anything at all is a failure, however good the look-alike is.
 * Nothing here permits resolving to the *wrong* element; that is always a
 * failure, in every class.
 */

export type MutationExpectation = 'resolve' | 'either' | 'abstain';

export interface Mutation {
  id: string;
  description: string;
  expectation: MutationExpectation;
  /**
   * Written with the explicit goal of forcing a `wrong`, not of being survived.
   *
   * Reported as its own group. An adversarial class that abstains is the
   * resolver behaving well under attack; folding it into the same table as
   * `class-rename` would read as ordinary breakage and understate both.
   */
  adversarial?: boolean;
  apply: (container: HTMLElement, target: Element) => Element | null;
}

function elementChildren(element: Element): Element[] {
  return Array.prototype.slice.call(element.children) as Element[];
}

function indexPath(container: Element, target: Element): number[] {
  const path: number[] = [];
  let node: Element | null = target;
  while (node && node !== container) {
    const parent: Element | null = node.parentElement;
    if (!parent) return [];
    path.unshift(elementChildren(parent).indexOf(node));
    node = parent;
  }
  return path;
}

function followPath(container: Element, path: readonly number[]): Element | null {
  let node: Element = container;
  for (const index of path) {
    const next = elementChildren(node)[index];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Deterministic pseudo-translation: same input always yields the same output. */
function pseudoTranslate(text: string): string {
  return text.replace(/[A-Za-z]+/g, (word) => {
    let hash = 0;
    for (let index = 0; index < word.length; index += 1) {
      hash = (hash * 31 + word.charCodeAt(index)) >>> 0;
    }
    const suffixes = ['ung', 'en', 'ieren', 'heit', 'lich'];
    const suffix = suffixes[hash % suffixes.length] ?? 'en';
    return `${word.slice(0, Math.max(3, word.length - 2))}${suffix}`;
  });
}

function walkTextNodes(root: Node, visit: (node: Text) => void): void {
  for (const child of Array.prototype.slice.call(root.childNodes) as Node[]) {
    if (child.nodeType === 3) visit(child as Text);
    else walkTextNodes(child, visit);
  }
}

function hashClass(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }
  return `c-${hash.toString(36).slice(0, 6)}`;
}

/** The nearest sibling built from the same tag — the look-alike that matters. */
function sameTagSibling(target: Element): Element | null {
  const parent = target.parentElement;
  if (!parent) return null;
  return (
    elementChildren(parent).find(
      (child) => child !== target && child.tagName === target.tagName,
    ) ?? null
  );
}

/** Reads whatever currently carries this control's accessible name. */
function accessibleNameOf(element: Element): { kind: 'aria' | 'text'; value: string } | null {
  const label = element.getAttribute('aria-label');
  if (label) return { kind: 'aria', value: label };
  const text = element.textContent;
  return text ? { kind: 'text', value: text } : null;
}

/**
 * Replacement copy that shares no word with what it replaces.
 *
 * The resolver's contradiction check requires zero overlap before it says
 * anything, so an edit that keeps any original word never reaches it.
 */
const REWRITTEN_LABELS: readonly string[] = [
  'Continue',
  'Get started',
  'Apply changes',
  'Open panel',
];

function rewrittenLabel(original: string): string | null {
  const words = new Set((original.toLowerCase().match(/[a-z0-9]+/g) ?? []));
  return (
    REWRITTEN_LABELS.find(
      (candidate) => !candidate.toLowerCase().split(' ').some((word) => words.has(word)),
    ) ?? null
  );
}

/**
 * The generated-id shapes real component libraries emit.
 *
 * These are not hypothetical: Radix emits `radix-:r3:` and Headless UI
 * `headlessui-menu-item-4`, both of which look like hand-written instrumentation
 * and neither of which survives a remount.
 */
const GENERATED_ID_PATTERNS: readonly RegExp[] = [
  /^(radix-:r)([0-9a-z]+)(:)$/,
  /^(headlessui-[a-z-]+-)(\d+)$/,
];

function reissueGeneratedId(value: string, shift: number): string | null {
  for (const pattern of GENERATED_ID_PATTERNS) {
    const match = pattern.exec(value);
    if (!match) continue;
    const [, prefix = '', counter = '', suffix = ''] = match;
    const next = Number.parseInt(counter, 36) + shift;
    const digits = /^\d+$/.test(counter) ? String(next) : next.toString(36);
    return `${prefix}${digits}${suffix}`;
  }
  return null;
}

export const MUTATIONS: readonly Mutation[] = [
  {
    id: 'pristine',
    description: 'Control — no change at all',
    expectation: 'resolve',
    apply: (_container, target) => target,
  },
  {
    id: 'class-rename',
    description: 'CSS-module / utility churn rewrites every class name',
    expectation: 'resolve',
    apply: (container, target) => {
      for (const node of [container, ...container.querySelectorAll('*')]) {
        const existing = node.getAttribute('class');
        if (!existing) continue;
        node.setAttribute(
          'class',
          existing.split(/\s+/).filter(Boolean).map(hashClass).join(' '),
        );
      }
      return target;
    },
  },
  {
    id: 'wrapper-inserted',
    description: 'A layout or tooltip wrapper is introduced around the control',
    expectation: 'resolve',
    apply: (_container, target) => {
      const parent = target.parentElement;
      if (!parent) return null;
      const wrapper = document.createElement('div');
      wrapper.className = 'tooltip-anchor';
      parent.insertBefore(wrapper, target);
      wrapper.appendChild(target);
      return target;
    },
  },
  {
    id: 'siblings-reordered',
    description: 'Sibling controls are reordered without changing their count',
    expectation: 'resolve',
    apply: (_container, target) => {
      const parent = target.parentElement;
      if (!parent) return null;
      const children = elementChildren(parent);
      if (children.length < 2) return null;
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child) parent.appendChild(child);
      }
      return target;
    },
  },
  {
    id: 'accessible-name-changed',
    description: 'Copy edit changes the accessible name but not the control',
    expectation: 'either',
    apply: (_container, target) => {
      const label = target.getAttribute('aria-label');
      if (label) target.setAttribute('aria-label', `${label} now`);
      else if (target.textContent) target.textContent = `${target.textContent} now`;
      else return null;
      return target;
    },
  },
  {
    id: 'accessible-name-rewritten',
    description: 'Copy edit replaces the label outright, sharing no word with the original',
    // Distinct from `accessible-name-changed`, which appends and so keeps every
    // original word. Only a rewrite with zero overlap reaches the contradiction
    // check, and a corpus that only ever appends prices any change to that check
    // at zero — which is how the name-matches-nobody flip looked free.
    //
    // `either`, because the right answer now depends on what the step does. A
    // highlight step resolves and reports the drift; a step that clicks withholds,
    // since "renamed" and "replaced" read the same and only one of them is safe.
    expectation: 'either',
    apply: (_container, target) => {
      const name = accessibleNameOf(target);
      if (!name) return null;
      const replacement = rewrittenLabel(name.value);
      if (!replacement) return null;
      // Renaming onto a neighbour's label would be `labels-exchanged` wearing a
      // different id, and the two classes must not measure the same thing.
      const parent = target.parentElement;
      const collides = parent
        ? elementChildren(parent).some(
            (child) => child !== target && accessibleNameOf(child)?.value.trim() === replacement,
          )
        : false;
      if (collides) return null;
      if (name.kind === 'aria') target.setAttribute('aria-label', replacement);
      else target.textContent = replacement;
      return target;
    },
  },
  {
    id: 'i18n-text-swap',
    description: 'Whole page rendered in another locale',
    expectation: 'resolve',
    apply: (container, target) => {
      walkTextNodes(container, (node) => {
        if (node.nodeValue) node.nodeValue = pseudoTranslate(node.nodeValue);
      });
      for (const node of [container, ...container.querySelectorAll('[aria-label]')]) {
        const label = node.getAttribute('aria-label');
        if (label) node.setAttribute('aria-label', pseudoTranslate(label));
      }
      document.documentElement.lang = 'de';
      return target;
    },
  },
  {
    id: 'moved-into-collection',
    description: 'The control block is moved inside a repeating list',
    expectation: 'either',
    apply: (container, target) => {
      const block = target.parentElement;
      if (!block || block === container) return null;
      const host = block.parentElement;
      if (!host) return null;
      const list = document.createElement('ul');
      const item = document.createElement('li');
      host.insertBefore(list, block);
      list.appendChild(item);
      item.appendChild(block);
      return target;
    },
  },
  {
    id: 'element-retagged',
    description: 'A <button> is reimplemented as an <a role="button">',
    expectation: 'either',
    apply: (_container, target) => {
      if (target.tagName.toLowerCase() !== 'button') return null;
      const parent = target.parentElement;
      if (!parent) return null;
      const replacement = document.createElement('a');
      replacement.setAttribute('role', 'button');
      replacement.setAttribute('href', '#');
      for (const attribute of Array.prototype.slice.call(target.attributes) as Attr[]) {
        if (attribute.name === 'type') continue;
        replacement.setAttribute(attribute.name, attribute.value);
      }
      replacement.innerHTML = target.innerHTML;
      parent.replaceChild(replacement, target);
      return replacement;
    },
  },
  {
    id: 'virtualized-remount',
    description: 'Framework discards and recreates the subtree (new nodes, same shape)',
    expectation: 'resolve',
    apply: (container, target) => {
      const path = indexPath(container, target);
      if (path.length === 0) return null;
      const clone = container.cloneNode(true) as HTMLElement;
      while (container.firstChild) container.removeChild(container.firstChild);
      while (clone.firstChild) container.appendChild(clone.firstChild);
      return followPath(container, path);
    },
  },
  {
    id: 'ab-variant-inserted',
    description: 'An experiment adds one more control beside the target',
    expectation: 'resolve',
    apply: (_container, target) => {
      const parent = target.parentElement;
      if (!parent) return null;
      const extra = document.createElement(target.tagName.toLowerCase());
      extra.setAttribute('class', target.getAttribute('class') ?? '');
      extra.textContent = 'Try the new flow';
      parent.insertBefore(extra, target);
      return target;
    },
  },
  {
    id: 'instrumentation-stripped',
    description: 'id / data-testid / data-route removed in a refactor',
    expectation: 'either',
    apply: (container, target) => {
      let stripped = false;
      for (const node of [container, ...container.querySelectorAll('*')]) {
        for (const name of ['id', 'data-testid', 'data-route', 'name']) {
          if (node.hasAttribute(name)) {
            node.removeAttribute(name);
            stripped = true;
          }
        }
      }
      return stripped ? target : null;
    },
  },
  {
    id: 'layout-reflow',
    description: 'Neighbouring content grows, shifting the control on screen',
    expectation: 'resolve',
    apply: (container, target) => {
      const banner = document.createElement('section');
      banner.className = 'announcement';
      for (let index = 0; index < 4; index += 1) {
        banner.appendChild(
          document.createElement('p'),
        ).textContent = `Scheduled maintenance notice ${index}`;
      }
      container.insertBefore(banner, container.firstChild);
      return target;
    },
  },

  /* ---- Step 4 widening: hazards the first corpus could not express ---- */

  {
    id: 'generated-ids-reissued',
    description: 'Component library reissues every generated id on remount',
    expectation: 'resolve',
    apply: (container, target) => {
      let touched = false;
      for (const node of [container, ...container.querySelectorAll('[id]')]) {
        const current = node.getAttribute('id');
        if (!current) continue;
        const next = reissueGeneratedId(current, 6);
        if (!next) continue;
        node.setAttribute('id', next);
        touched = true;
      }
      return touched ? target : null;
    },
  },
  {
    id: 'generated-ids-swapped',
    adversarial: true,
    description: 'Mount order changes, so the target\u2019s generated id lands on a sibling',
    // Adversarial: the captured id now identifies a *different* control, and
    // nothing on the page says so. Abstaining is the only honest outcome, but
    // resolving correctly through other evidence is better still.
    expectation: 'either',
    apply: (_container, target) => {
      const sibling = sameTagSibling(target);
      if (!sibling) return null;
      const mine = target.getAttribute('id');
      const theirs = sibling.getAttribute('id');
      if (!mine || !theirs) return null;
      if (!reissueGeneratedId(mine, 0) || !reissueGeneratedId(theirs, 0)) return null;
      target.setAttribute('id', theirs);
      sibling.setAttribute('id', mine);
      return target;
    },
  },
  {
    id: 'utility-classes-tweaked',
    description: 'Tailwind design tweak rewrites a few utilities, structure untouched',
    expectation: 'resolve',
    apply: (container, target) => {
      const swaps: Array<[RegExp, string]> = [
        [/\bpx-3\b/g, 'px-4'],
        [/\bpy-2\b/g, 'py-1.5'],
        [/\btext-sm\b/g, 'text-[13px]'],
        [/\bshadow-sm\b/g, 'shadow'],
        [/\brounded-md\b/g, 'rounded-lg'],
      ];
      let touched = false;
      for (const node of [container, ...container.querySelectorAll('[class]')]) {
        const current = node.getAttribute('class');
        if (!current) continue;
        let next = current;
        for (const [pattern, replacement] of swaps) next = next.replace(pattern, replacement);
        if (next === current) continue;
        node.setAttribute('class', next);
        touched = true;
      }
      return touched ? target : null;
    },
  },
  {
    id: 'rtl-locale-flip',
    description: 'RTL locale mirrors the geometry without touching the copy',
    // Deliberately not a text change: `i18n-text-swap` already covers that, and
    // conflating them would hide which of the two families actually broke.
    expectation: 'resolve',
    apply: (container, target) => {
      container.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.lang = 'ar';
      return target;
    },
  },
  {
    id: 'modal-portalled',
    description: 'Dialog is reparented to <body> by a portal-based modal library',
    expectation: 'resolve',
    apply: (container, target) => {
      let dialog: Element | null = target;
      while (dialog && dialog !== container && dialog.getAttribute('role') !== 'dialog') {
        dialog = dialog.parentElement;
      }
      if (!dialog || dialog === container || !dialog.parentElement) return null;
      document.body.appendChild(dialog);
      return target;
    },
  },
  {
    id: 'control-disabled',
    description: 'The control ships disabled until a precondition is met',
    // `anchor` capture should still find it; `observe-click` capture should
    // refuse it. Both are correct, which is what makes this `either`.
    expectation: 'either',
    apply: (_container, target) => {
      if (!(target instanceof HTMLButtonElement) && !(target instanceof HTMLInputElement)) {
        return null;
      }
      target.setAttribute('disabled', '');
      return target;
    },
  },

  /* ---- Adversarial: written to force a `wrong`, not to be survived ---- */

  {
    id: 'lookalikes-swapped',
    adversarial: true,
    description: 'Two look-alike controls exchange slots and nothing else',
    // Sharper than `siblings-reordered`: exactly two elements trade places, so
    // every durable signal is intact and only position moved. A resolver that
    // leans on `sibling-position` lands on the twin.
    expectation: 'resolve',
    apply: (_container, target) => {
      const sibling = sameTagSibling(target);
      const parent = target.parentElement;
      if (!sibling || !parent) return null;
      const marker = document.createComment('swap');
      parent.insertBefore(marker, target);
      parent.insertBefore(target, sibling);
      parent.insertBefore(sibling, marker);
      parent.removeChild(marker);
      return target;
    },
  },
  {
    id: 'target-removed',
    adversarial: true,
    description: 'The control the author picked is deleted; a look-alike survives',
    // The only mutation whose contract is `abstain`. There is no right element
    // left, so any confident resolution is a broken tour shipped silently.
    expectation: 'abstain',
    apply: (_container, target) => {
      const sibling = sameTagSibling(target);
      const parent = target.parentElement;
      if (!sibling || !parent) return null;
      parent.removeChild(target);
      // Returned detached on purpose: the scorer compares by identity, so any
      // element the resolver returns is by definition not this one.
      return target;
    },
  },
  {
    id: 'labels-exchanged',
    adversarial: true,
    description: 'A copy edit swaps the labels of two neighbouring controls',
    // The nastiest of the three: the strongest human-readable signal now points
    // at the wrong control, and the page looks entirely reasonable.
    expectation: 'either',
    apply: (_container, target) => {
      const sibling = sameTagSibling(target);
      if (!sibling) return null;
      const mine = accessibleNameOf(target);
      const theirs = accessibleNameOf(sibling);
      if (!mine || !theirs || mine.kind !== theirs.kind || mine.value === theirs.value) return null;
      if (mine.kind === 'aria') {
        target.setAttribute('aria-label', theirs.value);
        sibling.setAttribute('aria-label', mine.value);
      } else {
        target.textContent = theirs.value;
        sibling.textContent = mine.value;
      }
      return target;
    },
  },
];
