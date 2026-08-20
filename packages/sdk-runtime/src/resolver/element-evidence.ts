import { accessibleNameOf, isLodariqOwnSurface, roleOf } from '@lodariq/schema/dom';
import { TARGET_CONTEXT_GROUP_ROLES } from '@lodariq/schema/target-runtime';
import type {
  TargetElementKind,
  TargetLocalizedEvidence,
  TargetRequiredAction,
} from '@lodariq/schema/target';
import { localizedTextSimilarity } from './text';

const FIELD_ROLES = new Set([
  'checkbox',
  'combobox',
  'listbox',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'textbox',
]);
const CONTROL_ROLES = new Set([
  ...FIELD_ROLES,
  'button',
  'link',
  'menuitem',
  'option',
  'switch',
  'tab',
  'treeitem',
]);
const CONTAINER_ROLES = new Set([
  'article',
  'dialog',
  'feed',
  'form',
  'group',
  'list',
  'main',
  'nav',
  'navigation',
  'region',
  'table',
]);
const CONTEXT_GROUP_ROLES = new Set<string>(TARGET_CONTEXT_GROUP_ROLES);
const FIELD_TAGS = new Set(['input', 'select', 'textarea']);
const CONTROL_TAGS = new Set(['a', 'button', 'details', 'input', 'select', 'summary', 'textarea']);
const CONTAINER_TAGS = new Set([
  'article',
  'aside',
  'dialog',
  'div',
  'fieldset',
  'footer',
  'form',
  'header',
  'main',
  'nav',
  'ol',
  'section',
  'table',
  'ul',
]);
const CONTENT_TAGS = new Set([
  'blockquote',
  'dd',
  'dt',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'li',
  'p',
  'pre',
  'span',
]);
const CLICK_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'option',
  'radio',
  'switch',
  'tab',
  'treeitem',
]);
const ADDITIONAL_IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  article: 'article',
  aside: 'complementary',
  dialog: 'dialog',
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
const STABLE_KEY_ATTRIBUTE_NAMES = [
  'id',
  'name',
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
  'data-key',
] as const;
const STABLE_KEY_ATTRIBUTE_NAME_PATTERN =
  /^(?:id|name|data-[a-z][a-z0-9_.:-]{0,62}|aria-[a-z][a-z0-9_.:-]{0,62})$/;

type KindMatcher = (element: Element) => boolean;
type ActionMatcher = (element: Element, pass?: ResolutionPass) => boolean;

const KIND_MATCHERS: Readonly<Record<TargetElementKind, KindMatcher>> = {
  control: (element) => {
    const role = semanticRoleOf(element);
    const tag = element.tagName.toLowerCase();
    if (role && CONTROL_ROLES.has(role)) return true;
    // A surprising number of SPA sidebars use an anchor as a delegated click
    // surface without supplying href. Lodariq only observes the user's click;
    // it never invokes the target, so retaining that control intent is safe.
    if (tag === 'a') return true;
    return CONTROL_TAGS.has(tag) || hasNonNegativeTabIndex(element);
  },
  field: (element) => {
    const role = semanticRoleOf(element);
    if (role && FIELD_ROLES.has(role)) return true;
    return FIELD_TAGS.has(element.tagName.toLowerCase()) || isContentEditable(element);
  },
  content: (element) => {
    const tag = element.tagName.toLowerCase();
    if (isInteractive(element)) return false;
    if (CONTENT_TAGS.has(tag)) return true;
    return !FIELD_TAGS.has(tag) && !CONTAINER_TAGS.has(tag);
  },
  container: (element) => {
    const role = semanticRoleOf(element);
    if (role && CONTAINER_ROLES.has(role)) return true;
    if (role && CONTROL_ROLES.has(role)) return false;
    return CONTAINER_TAGS.has(element.tagName.toLowerCase());
  },
};

const ACTION_MATCHERS: Readonly<Record<TargetRequiredAction, ActionMatcher>> = {
  anchor: () => true,
  'observe-click': (element, pass) =>
    isEnabled(element) && receivesPointerEvents(element, pass) && isClickable(element),
  focus: (element) => isEnabled(element) && isFocusable(element),
  input: (element) => isEnabled(element) && isEditable(element),
};

export interface ElementCollection {
  elements: Element[];
  truncated: boolean;
}

/**
 * Scratch memory for one resolution pass (T1).
 *
 * `isVisible` climbs the ancestor chain calling `getComputedStyle` at every step,
 * and it is called once per candidate — so a page of n elements pays O(n · depth)
 * style reads, nearly all of them repeats of the same ancestors.
 *
 * The pass is deliberately not a module-level cache. Style changes between passes,
 * and a cache that outlives its pass answers questions about a page that no longer
 * exists. Callers create one, use it for a single resolution, and drop it.
 */
export interface ResolutionPass {
  readonly styles: Map<Element, CSSStyleDeclaration | null>;
  /** Whether the element and every ancestor above it are themselves visible. */
  readonly chain: Map<Element, boolean>;
}

export function createResolutionPass(): ResolutionPass {
  return { styles: new Map(), chain: new Map() };
}

/** Enumerate V2 candidates without turning a CSS query into a hidden locator. */
export function collectElements(root: ParentNode, limit = 50_000): ElementCollection {
  const elements: Element[] = [];
  const seen = new Set<Element>();
  const roots: ParentNode[] = [root];

  while (roots.length > 0) {
    const currentRoot = roots.shift();
    if (!currentRoot) continue;
    if (currentRoot instanceof Element) addElement(currentRoot, elements, seen, roots);
    if (elements.length >= limit) return { elements, truncated: true };
    const document = ownerDocumentOf(currentRoot);
    const showElement = document?.defaultView?.NodeFilter.SHOW_ELEMENT ?? 1;
    const walker = document?.createTreeWalker(currentRoot, showElement);
    let node = walker?.nextNode() ?? null;
    while (node) {
      if (node instanceof Element) addElement(node, elements, seen, roots);
      if (elements.length >= limit) return { elements, truncated: true };
      node = walker?.nextNode() ?? null;
    }
  }

  return { elements, truncated: false };
}

/** Immutable Phase 1 artifacts retain their broad legacy candidate scan. */
export function collectLegacyElements(root: ParentNode): Element[] {
  const elements: Element[] = [];
  if (root instanceof Element) elements.push(root);
  elements.push(...root.querySelectorAll('*'));
  return elements;
}

export function belongsToRoot(element: Element, root: ParentNode): boolean {
  if (root === element) return true;
  if (root instanceof Document) {
    return element.ownerDocument === root && element.isConnected;
  }
  if (root instanceof ShadowRoot) return element.getRootNode() === root;
  return root.contains(element);
}

export function isVisible(element: Element, pass?: ResolutionPass): boolean {
  // Only the element itself can be a hidden input; the check does not inherit,
  // so it stays outside the memoized chain.
  if (
    element.tagName.toLowerCase() === 'input' &&
    normalizedAttribute(element, 'type') === 'hidden'
  ) {
    return false;
  }
  return chainIsVisible(element, pass);
}

/** Self-visibility of one element, ignoring its ancestors. */
function selfIsVisible(element: Element, pass?: ResolutionPass): boolean {
  if (element.hasAttribute('hidden') || element.hasAttribute('inert')) return false;
  if (normalizedAttribute(element, 'aria-hidden') === 'true') return false;
  const style = computedStyleOf(element, pass);
  return !(
    style &&
    (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')
  );
}

/**
 * Climb to the first ancestor whose answer is already known, then write the answer
 * back down the chain. Two candidates under the same hidden panel cost one climb.
 */
function chainIsVisible(element: Element, pass?: ResolutionPass): boolean {
  if (!pass) {
    let current: Element | null = element;
    while (current) {
      if (!selfIsVisible(current)) return false;
      current = parentElementAcrossOpenShadow(current);
    }
    return true;
  }

  const climbed: Element[] = [];
  let current: Element | null = element;
  let result = true;
  while (current) {
    const known = pass.chain.get(current);
    if (known !== undefined) {
      result = known;
      break;
    }
    if (!selfIsVisible(current, pass)) {
      pass.chain.set(current, false);
      result = false;
      break;
    }
    climbed.push(current);
    current = parentElementAcrossOpenShadow(current);
  }
  for (const seen of climbed) pass.chain.set(seen, result);
  return result;
}

/** Runtime and creator chrome must never become host-page target evidence. */
export function isLodariqOwnedElement(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.tagName.toLowerCase().startsWith('lodariq-')) return true;
    current = parentElementAcrossOpenShadow(current);
  }
  return false;
}

export function isEnabled(element: Element): boolean {
  if (normalizedAttribute(element, 'aria-disabled') === 'true') return false;
  try {
    if (element.matches(':disabled')) return false;
  } catch {
    // Some host DOM implementations do not support the :disabled pseudo-class.
  }
  const value = (element as Element & { disabled?: boolean }).disabled;
  return value !== true;
}

export function semanticRoleOf(element: Element): string | undefined {
  const role = roleOf(element)?.trim().toLowerCase().split(/\s+/)[0];
  if (role) return role;
  return ADDITIONAL_IMPLICIT_ROLES[element.tagName.toLowerCase()];
}

export function inputTypeOf(element: Element): string | undefined {
  const tag = element.tagName.toLowerCase();
  const explicit = normalizedAttribute(element, 'type');
  if (tag === 'input') return explicit || 'text';
  if (tag === 'button') return explicit || 'submit';
  return explicit ?? undefined;
}

export function matchesElementKind(element: Element, kind: TargetElementKind): boolean {
  return KIND_MATCHERS[kind](element);
}

export function matchesRequiredAction(
  element: Element,
  requiredAction: TargetRequiredAction | undefined,
  pass?: ResolutionPass,
): boolean {
  if (!requiredAction) return true;
  return ACTION_MATCHERS[requiredAction](element, pass);
}

export function exactAttributesMatch(
  element: Element,
  attributes: Readonly<Record<string, string>> | undefined,
): boolean {
  const entries = Object.entries(attributes ?? {});
  return (
    entries.length > 0 &&
    entries.every(([name, value]) => element.getAttribute(name)?.trim() === value)
  );
}

export function stableKeyMatches(element: Element, stableKey: string): boolean {
  const separatorIndex = stableKey.indexOf(':');
  if (separatorIndex > 0) {
    const attributeName = stableKey.slice(0, separatorIndex).toLowerCase();
    const attributeValue = stableKey.slice(separatorIndex + 1);
    if (
      attributeValue &&
      STABLE_KEY_ATTRIBUTE_NAME_PATTERN.test(attributeName) &&
      element.getAttribute(attributeName) === attributeValue
    ) {
      return true;
    }
  }
  return STABLE_KEY_ATTRIBUTE_NAMES.some((name) => element.getAttribute(name) === stableKey);
}

export function controlGroupMatches(element: Element, controlGroup: string): boolean {
  if (element.getAttribute('name') === controlGroup) return true;
  let current = parentElementAcrossOpenShadow(element);
  while (current) {
    const role = semanticRoleOf(current);
    if (
      (CONTEXT_GROUP_ROLES.has(role ?? '') || current.tagName.toLowerCase() === 'fieldset') &&
      stableKeyMatches(current, controlGroup)
    ) {
      return true;
    }
    current = parentElementAcrossOpenShadow(current);
  }
  return false;
}

export function ancestorRolesOf(element: Element, limit = 12): string[] {
  const roles: string[] = [];
  let current = parentElementAcrossOpenShadow(element);
  while (current && roles.length < limit) {
    const role = semanticRoleOf(current);
    if (role) roles.push(role);
    current = parentElementAcrossOpenShadow(current);
  }
  return roles;
}

export function parentElementAcrossOpenShadow(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

export function currentLocale(root: ParentNode, explicitLocale?: string): string | null {
  const explicit = canonicalLocale(explicitLocale);
  if (explicit) return explicit;
  const document = ownerDocumentOf(root);
  const documentLocale = canonicalLocale(document?.documentElement.lang);
  if (documentLocale) return documentLocale;
  return canonicalLocale(document?.defaultView?.navigator.language);
}

export function localeForElement(element: Element, explicitLocale?: string): string | null {
  const explicit = canonicalLocale(explicitLocale);
  if (explicit) return explicit;
  let current: Element | null = element;
  while (current) {
    const inherited = canonicalLocale(current.getAttribute('lang'));
    if (inherited) return inherited;
    current = parentElementAcrossOpenShadow(current);
  }
  return currentLocale(element.ownerDocument);
}

export function localizedEvidenceFor(
  evidence: readonly TargetLocalizedEvidence[],
  locale: string | null,
): TargetLocalizedEvidence | null {
  if (!locale) return null;
  const canonical = canonicalLocale(locale);
  if (!canonical) return null;

  const exact = evidence.find((entry) => canonicalLocale(entry.locale) === canonical);
  if (exact) return exact;

  const language = languageSubtag(canonical);
  const languageOnly = evidence.find((entry) => canonicalLocale(entry.locale) === language);
  if (languageOnly) return languageOnly;

  const sameLanguage = evidence.filter(
    (entry) => languageSubtag(canonicalLocale(entry.locale)) === language,
  );
  return sameLanguage.length === 1 ? (sameLanguage[0] ?? null) : null;
}

export function localizedTextMatches(element: Element, expected: TargetLocalizedEvidence): boolean {
  const locale = canonicalLocale(expected.locale) ?? expected.locale;
  const actualByField = {
    accessibleName: localizedLabelOf(element),
    label: associatedLabelOf(element),
    placeholder: element.getAttribute('placeholder') ?? undefined,
    title: element.getAttribute('title') ?? undefined,
  } as const;

  const exactFieldMatch = (Object.keys(actualByField) as Array<keyof typeof actualByField>).some(
    (field) => textEquals(actualByField[field], expected[field], locale),
  );
  if (exactFieldMatch) return true;

  const fuzzyFieldMatch = (Object.keys(actualByField) as Array<keyof typeof actualByField>).some(
    (field) => localizedTextSimilarity(actualByField[field], expected[field], locale) >= 0.72,
  );
  if (fuzzyFieldMatch) return true;

  // Nearby copy is useful for anonymous regions, but it must not make every
  // item in a repeated control group match a specifically named control.
  if (hasPrimaryLocalizedEvidence(expected)) return false;

  const nearbyText = expected.nearbyText ?? [];
  if (nearbyText.length === 0) return false;
  const actualNearby = parentElementAcrossOpenShadow(element)?.textContent;
  return nearbyText.some((text) => textIncludes(actualNearby, text, locale));
}

/**
 * Label used only as locale-bound supporting evidence. Unlike roleOf(), this
 * deliberately recognizes a delegated <a> without href while leaving its
 * standards-based role unchanged.
 */
export function localizedLabelOf(element: Element): string | undefined {
  const accessibleName = accessibleNameOf(element)?.replace(/\s+/g, ' ').trim();
  if (accessibleName) return accessibleName;
  if (element.tagName.toLowerCase() !== 'a') return undefined;
  const text = element.textContent?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

export function ownerDocumentOf(root: ParentNode): Document | null {
  if (root instanceof Document) return root;
  return root.ownerDocument;
}

export function canonicalLocale(locale: string | null | undefined): string | null {
  const candidate = locale?.trim().replace(/_/g, '-');
  if (!candidate) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

function addElement(
  element: Element,
  elements: Element[],
  seen: Set<Element>,
  roots: ParentNode[],
): void {
  if (seen.has(element)) return;
  seen.add(element);
  // Lodariq's own chrome is not the customer's product. Its shadow root is not
  // descended into either: an authoring preview renders the step's copy, and a
  // control named after the element being authored would compete with it.
  if (isLodariqOwnSurface(element)) return;
  elements.push(element);
  if (element.shadowRoot) roots.push(element.shadowRoot);
}

function hasNonNegativeTabIndex(element: Element): boolean {
  const raw = element.getAttribute('tabindex');
  if (raw === null) return false;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0;
}

function isInteractive(element: Element): boolean {
  const role = semanticRoleOf(element);
  return Boolean(
    (role && CONTROL_ROLES.has(role)) || CONTROL_TAGS.has(element.tagName.toLowerCase()),
  );
}

function isClickable(element: Element): boolean {
  const role = semanticRoleOf(element);
  if (role && CLICK_ROLES.has(role)) return true;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button' || tag === 'summary') return true;
  // Observing a real user click does not require Lodariq to infer or execute a
  // navigation contract. This covers delegated SPA anchors without href.
  if (tag === 'a') return true;
  if (tag === 'input') {
    return ['button', 'checkbox', 'image', 'radio', 'reset', 'submit'].includes(
      normalizedAttribute(element, 'type') ?? 'text',
    );
  }
  return hasNonNegativeTabIndex(element) && Boolean(role);
}

function hasPrimaryLocalizedEvidence(expected: TargetLocalizedEvidence): boolean {
  return Boolean(
    expected.accessibleName || expected.label || expected.placeholder || expected.title,
  );
}

function isFocusable(element: Element): boolean {
  if (hasNonNegativeTabIndex(element)) return true;
  const tag = element.tagName.toLowerCase();
  if (FIELD_TAGS.has(tag) || tag === 'button' || tag === 'summary') return true;
  return tag === 'a' && element.hasAttribute('href');
}

function isEditable(element: Element): boolean {
  if (isContentEditable(element)) return true;
  const tag = element.tagName.toLowerCase();
  if (tag === 'select') return true;
  if (tag !== 'input' && tag !== 'textarea') return false;
  if (
    tag === 'input' &&
    ['button', 'checkbox', 'hidden', 'image', 'radio', 'reset', 'submit'].includes(
      inputTypeOf(element) ?? 'text',
    )
  ) {
    return false;
  }
  const readOnly = (element as Element & { readOnly?: boolean }).readOnly;
  return readOnly !== true && normalizedAttribute(element, 'aria-readonly') !== 'true';
}

function isContentEditable(element: Element): boolean {
  const value = normalizedAttribute(element, 'contenteditable');
  return value === '' || value === 'true' || value === 'plaintext-only';
}

function receivesPointerEvents(element: Element, pass?: ResolutionPass): boolean {
  const style = computedStyleOf(element, pass);
  return !style || style.pointerEvents !== 'none';
}

function computedStyleOf(element: Element, pass?: ResolutionPass): CSSStyleDeclaration | null {
  const cached = pass?.styles.get(element);
  if (cached !== undefined) return cached;
  let style: CSSStyleDeclaration | null;
  try {
    style = element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  } catch {
    style = null;
  }
  pass?.styles.set(element, style);
  return style;
}

function normalizedAttribute(element: Element, name: string): string | null {
  return element.getAttribute(name)?.trim().toLowerCase() ?? null;
}

function associatedLabelOf(element: Element): string | undefined {
  const labels = (element as Element & { labels?: NodeListOf<HTMLLabelElement> | null }).labels;
  const labelText = labels?.[0]?.textContent?.trim();
  if (labelText) return labelText;
  const wrappingLabel = element.closest('label')?.textContent?.trim();
  return wrappingLabel || undefined;
}

function textEquals(
  actual: string | null | undefined,
  expected: string | null | undefined,
  locale: string,
): boolean {
  const normalizedActual = normalizedText(actual, locale);
  const normalizedExpected = normalizedText(expected, locale);
  return Boolean(normalizedActual && normalizedExpected && normalizedActual === normalizedExpected);
}

function textIncludes(
  actual: string | null | undefined,
  expected: string | null | undefined,
  locale: string,
): boolean {
  const normalizedActual = normalizedText(actual, locale);
  const normalizedExpected = normalizedText(expected, locale);
  return Boolean(
    normalizedActual && normalizedExpected && normalizedActual.includes(normalizedExpected),
  );
}

function normalizedText(value: string | null | undefined, locale: string): string {
  const collapsed = value?.replace(/\s+/g, ' ').trim() ?? '';
  try {
    return collapsed.toLocaleLowerCase(locale);
  } catch {
    return collapsed.toLowerCase();
  }
}

function languageSubtag(locale: string | null): string | null {
  return locale?.split('-')[0]?.toLowerCase() ?? null;
}
