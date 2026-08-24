import type { ElementFingerprint } from './target';

export { cspNonceOf, createNonceStyleElement } from './csp';

/** Neutral renderer metadata shared by runtime output and creator-only tooling. */
/** Present when the tour card is placed against a resolved target. */
export const LODARIQ_TOUR_ANCHORED_ATTRIBUTE = 'data-lodariq-anchored';
export const LODARIQ_RENDERED_NODE_ID_ATTRIBUTE = 'data-lodariq-node-id';
export const LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE = 'data-lodariq-node-type';
/**
 * Creator-only ownership marker for a TourPlayer authoring preview.
 *
 * The value is an opaque, in-memory owner id. Authoring tools use it to bind
 * direct-editing affordances to their own preview without ever touching a
 * concurrently delivered customer tour.
 */
export const LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE = 'data-lodariq-authoring-preview-owner';

/**
 * The resolver's verdict on the step being authored, so §4.4's ring can say it.
 *
 * Creator-only: nothing sets this outside an authoring session, so a delivered
 * tour never draws an amber "needs context" ring at a real user. One of `ok`,
 * `ctx` or `bad` — see `authoring/overlay/target-ring.ts` for what each means.
 */
export const LODARIQ_AUTHORING_TARGET_STATE_ATTRIBUTE = 'data-lodariq-authoring-target-state';

/**
 * Lodariq's own surfaces. Nothing here is part of the customer's product, so a
 * target must never resolve to one: during an authoring preview the overlay
 * shows the step's own copy, and a chrome control named after the element being
 * authored would otherwise out-compete the real one.
 */
export const LODARIQ_OWN_SURFACE_SELECTOR = [
  'lodariq-authoring-panel',
  'lodariq-tour',
  '[data-lodariq-authoring-trigger="true"]',
  '[data-lodariq-creator-launcher="true"]',
  '[data-lodariq-creator-toolbar="true"]',
  '[data-lodariq-bridge]',
].join(', ');

export function isLodariqOwnSurface(element: Element): boolean {
  return Boolean(element.closest(LODARIQ_OWN_SURFACE_SELECTOR));
}

const STABLE_ATTRIBUTE_NAMES = [
  'data-lodariq-id',
  'data-testid',
  'data-test',
  'data-cy',
  'id',
  'name',
];

const IMPLICIT_ROLE_BY_TAG: Readonly<Record<string, string>> = {
  article: 'article',
  aside: 'complementary',
  dialog: 'dialog',
  fieldset: 'group',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'img',
  li: 'listitem',
  ol: 'list',
  table: 'table',
  ul: 'list',
};

export function stableAttributesOf(element: Element): Record<string, string> {
  return Object.fromEntries(
    STABLE_ATTRIBUTE_NAMES.map((name) => [name, element.getAttribute(name)] as const).filter(
      (entry): entry is readonly [string, string] => Boolean(entry[1]?.trim()),
    ),
  );
}

export function roleOf(element: Element): string | undefined {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'summary') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') {
    const select = element as HTMLSelectElement;
    return select.multiple || select.size > 1 ? 'listbox' : 'combobox';
  }
  if (tag === 'main' || tag === 'nav' || tag === 'form') return tag;
  if (tag === 'input') return inputRole(element.getAttribute('type') ?? 'text');
  return IMPLICIT_ROLE_BY_TAG[tag];
}

/**
 * Containers whose children are data rather than layout.
 *
 * Position inside one of these is a fact about the rows, not about the page: the
 * third row is a different project every time the list is sorted or filtered, and
 * unlike a changed sibling *count* that substitution is invisible. Positional
 * evidence is therefore refused inside a collection, and the author-declared
 * collection policies (`first-in-collection`, `newest-in-collection`) are the
 * tools for it instead.
 */
const COLLECTION_ROLES = new Set([
  'list',
  'listbox',
  'table',
  'grid',
  'treegrid',
  'feed',
  'rowgroup',
  'row',
]);

/**
 * `menu`, `menubar` and `tablist` are containers of commands, which is what ARIA
 * defines them as. Their children are the product's own chrome, not its records:
 * the second tab is the same tab tomorrow. Counting them as collections asked the
 * creator which of three tabs they meant, about a row of tabs they had just
 * clicked — the question is only worth asking where position means a record.
 */
const CONTROL_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'label']);
const CONTROL_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
]);

const COLLECTION_TAGS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'dl']);

/** How many alike siblings make a container a list rather than a layout. */
const REPEATED_CHILD_THRESHOLD = 3;
/** Enough to recognise repetition without walking a thousand-row table. */
const REPEATED_CHILD_SAMPLE = 12;

/**
 * Whether the element's own position is a fact about data rather than layout.
 *
 * The question is whether the element *is* one of the repeated things — not
 * whether repetition exists somewhere above it. Asking the wider question made
 * one card grid anywhere on the page refuse positional evidence to every control
 * on it, including a toolbar button eleven levels away from the grid.
 */
export function isInsideCollection(element: Element, maxHops = 12): boolean {
  let node: Element = element;
  let hops = 0;
  while (hops < maxHops) {
    const parent = parentAcrossOpenShadow(node);
    if (!parent) return false;
    if (COLLECTION_TAGS.has(parent.tagName.toLowerCase())) return true;
    const role = parent.getAttribute('role')?.trim().toLowerCase();
    if (role && COLLECTION_ROLES.has(role)) return true;
    if (isRepeatedItem(node, parent)) return true;
    node = parent;
    hops += 1;
  }
  return false;
}

/**
 * The card grid nothing declares: `<div class="grid">` over `<div class="card">`
 * reads as layout by role alone, so positional evidence was admitted into the
 * structure the roles exist to keep it out of. Repetition is the signal a product
 * cannot avoid emitting.
 *
 * Repeated *controls* are the exception, and they are the common case: three
 * buttons in a toolbar are three buttons, not three records. Refusing them left
 * the row of controls positional evidence exists for as the one place it could
 * not be used.
 */
function isRepeatedItem(child: Element, parent: Element): boolean {
  if (isControlLeaf(child) || !namesItself(child)) return false;
  const children = parent.children;
  if (children.length < REPEATED_CHILD_THRESHOLD) return false;
  const shape = shapeOf(child);
  const sampled = Math.min(children.length, REPEATED_CHILD_SAMPLE);
  let seen = 0;
  for (let index = 0; index < sampled; index += 1) {
    const sibling = children[index];
    if (!sibling || shapeOf(sibling) !== shape) continue;
    seen += 1;
    if (seen >= REPEATED_CHILD_THRESHOLD) return true;
  }
  return false;
}

/** Role is part of the shape: a `div[role=tablist]` is not one of three plain divs. */
function shapeOf(element: Element): string {
  const className = element.getAttribute('class')?.trim() ?? '';
  return `${element.tagName}.${className}|${element.getAttribute('role')?.trim() ?? ''}`;
}

/**
 * A product names the things it repeats — `div.card`, `li[data-row]`, a role.
 * Three bare `<div>`s are the scaffolding every page is built from, and reading
 * them as a list made the page's own layout a collection, which put every
 * control on it out of reach of positional evidence.
 */
function namesItself(element: Element): boolean {
  if (element.getAttribute('class')?.trim()) return true;
  if (element.getAttribute('role')?.trim()) return true;
  return [...element.attributes].some((attribute) => attribute.name.startsWith('data-'));
}

/** A control, and not a container that happens to hold one. */
function isControlLeaf(element: Element): boolean {
  const role = element.getAttribute('role')?.trim().toLowerCase();
  const interactive = role
    ? CONTROL_ROLES.has(role)
    : CONTROL_TAGS.has(element.tagName.toLowerCase());
  if (!interactive) return false;
  // A card with a button inside it is still a card.
  return element.querySelector('button, a, input, select, textarea') === null;
}

/** A table inside a shadow root is still a table; every other walk crosses. */
function parentAcrossOpenShadow(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.parentNode;
  return root && 'host' in root ? ((root as ShadowRoot).host ?? null) : null;
}

export function accessibleNameOf(element: Element): string | undefined {
  const aria = element.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  const labelledby = element.getAttribute('aria-labelledby');
  if (labelledby) {
    const text = labelledby
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  const tag = element.tagName.toLowerCase();
  const role = roleOf(element);
  if (
    tag === 'button' ||
    tag === 'summary' ||
    (tag === 'a' && element.hasAttribute('href')) ||
    role === 'button' ||
    role === 'link' ||
    role === 'tab' ||
    role === 'menuitem'
  ) {
    const text = element.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

export function attributeEntry(element: Element, name: string): Record<string, string> {
  const value = element.getAttribute(name)?.trim();
  return value ? { [name]: value } : {};
}

export function nearbyTextOf(element: Element): string[] {
  const text = element.parentElement?.textContent?.replace(/\s+/g, ' ').trim();
  return text ? [text.slice(0, 120)] : [];
}

export function ancestorLandmarksOf(element: Element): ElementFingerprint['ancestorLandmarks'] {
  const landmarks: NonNullable<ElementFingerprint['ancestorLandmarks']> = [];
  let current = element.parentElement;
  while (current && landmarks.length < 3) {
    const role = roleOf(current);
    const accessibleName = accessibleNameOf(current);
    if (role === 'main' || role === 'nav' || role === 'form' || accessibleName) {
      landmarks.push({
        ...(role ? { role } : {}),
        ...(accessibleName ? { accessibleName } : {}),
      });
    }
    current = current.parentElement;
  }
  return landmarks;
}

function inputRole(inputType: string): string {
  switch (inputType.toLowerCase()) {
    case 'button':
    case 'image':
    case 'reset':
    case 'submit':
      return 'button';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'range':
      return 'slider';
    case 'search':
      return 'searchbox';
    case 'number':
      return 'spinbutton';
    default:
      return 'textbox';
  }
}
