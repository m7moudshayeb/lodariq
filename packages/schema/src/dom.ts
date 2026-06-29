import type { ElementFingerprint } from './target';

const STABLE_ATTRIBUTE_NAMES = [
  'data-lodariq-id',
  'data-testid',
  'data-test',
  'data-cy',
  'id',
  'name',
];

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
  return undefined;
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

export function cspNonceOf(doc: Document): string | undefined {
  const meta = doc.querySelector<HTMLMetaElement>(
    'meta[property="csp-nonce"], meta[name="csp-nonce"]',
  );
  const raw =
    meta?.nonce ||
    meta?.getAttribute('nonce') ||
    meta?.content ||
    meta?.getAttribute('content') ||
    doc.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ||
    doc.querySelector<HTMLScriptElement>('script[nonce]')?.getAttribute('nonce');
  const nonce = raw?.trim();
  return nonce || undefined;
}

export function createNonceStyleElement(doc: Document, cssText: string): HTMLStyleElement {
  const style = doc.createElement('style');
  const nonce = cspNonceOf(doc);
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = cssText;
  return style;
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
