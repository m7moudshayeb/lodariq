import type { ElementFingerprint } from './target';

export { cspNonceOf, createNonceStyleElement } from './csp';

/** Neutral renderer metadata shared by runtime output and creator-only tooling. */
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
