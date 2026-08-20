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
  'menu',
  'menubar',
  'tablist',
  'feed',
  'rowgroup',
  'row',
]);

const COLLECTION_TAGS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'dl']);

/** How many alike siblings make a container a list rather than a layout. */
const REPEATED_CHILD_THRESHOLD = 3;
/** Enough to recognise repetition without walking a thousand-row table. */
const REPEATED_CHILD_SAMPLE = 12;

/** Whether the element sits inside a list, table or other repeated-data container. */
export function isInsideCollection(element: Element, maxHops = 12): boolean {
  let node: Element | null = parentAcrossOpenShadow(element);
  let hops = 0;
  while (node && hops < maxHops) {
    if (COLLECTION_TAGS.has(node.tagName.toLowerCase())) return true;
    const role = node.getAttribute('role')?.trim().toLowerCase();
    if (role && COLLECTION_ROLES.has(role)) return true;
    if (hasRepeatedChildren(node)) return true;
    node = parentAcrossOpenShadow(node);
    hops += 1;
  }
  return false;
}

/**
 * The card grid nothing declares: `<div class="grid">` over `<div class="card">`
 * reads as layout by role alone, so positional evidence was admitted into the
 * structure the roles exist to keep it out of. Repetition is the signal a product
 * cannot avoid emitting.
 */
function hasRepeatedChildren(container: Element): boolean {
  const children = container.children;
  if (children.length < REPEATED_CHILD_THRESHOLD) return false;
  const sampled = Math.min(children.length, REPEATED_CHILD_SAMPLE);
  const shapes = new Map<string, number>();
  for (let index = 0; index < sampled; index += 1) {
    const child = children[index];
    if (!child) continue;
    const shape = `${child.tagName}.${child.getAttribute('class')?.trim() ?? ''}`;
    const seen = (shapes.get(shape) ?? 0) + 1;
    if (seen >= REPEATED_CHILD_THRESHOLD) return true;
    shapes.set(shape, seen);
  }
  return false;
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
