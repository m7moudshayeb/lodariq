/**
 * Making the resolver's strength legible (§4.4).
 *
 * ADR-0016 forbids exposing selectors, fingerprints, DOM depth or hierarchy. So
 * everything here is derived from what a creator can already see: the accessible
 * name, the role, the size, and how many things on the page look the same.
 *
 * Pure functions over a supplied element, so the whole vocabulary is testable
 * without the picker.
 */
import { roleOf } from '@lodariq/schema/dom';
import { localizedLabelOf } from '@lodariq/sdk-runtime/resolver';

/** Roles worth naming in plain language. Anything else falls back to its own word. */
const ROLE_WORDS: Readonly<Record<string, string>> = {
  button: 'Button',
  link: 'Link',
  checkbox: 'Checkbox',
  radio: 'Radio',
  textbox: 'Text field',
  combobox: 'Dropdown',
  listbox: 'List',
  menuitem: 'Menu item',
  tab: 'Tab',
  heading: 'Heading',
  img: 'Image',
  dialog: 'Dialog',
  navigation: 'Navigation',
  list: 'List',
  table: 'Table',
  row: 'Row',
  cell: 'Cell',
  form: 'Form',
  search: 'Search',
  region: 'Area',
  banner: 'Header',
  contentinfo: 'Footer',
  main: 'Main area',
  complementary: 'Sidebar',
};

/** Container tags that read as an "area" rather than a control. */
const CONTAINER_WORDS: Readonly<Record<string, string>> = {
  nav: 'Navigation',
  header: 'Header',
  footer: 'Footer',
  main: 'Main area',
  aside: 'Sidebar',
  section: 'Area',
  article: 'Card',
  form: 'Form',
  table: 'Table',
  ul: 'List',
  ol: 'List',
  li: 'List item',
  dialog: 'Dialog',
};

export interface TargetDescription {
  /** `Button`, `Text field`, `Card` — never a tag name or a selector. */
  readonly kind: string;
  /** The accessible name, trimmed. Absent when the element has none. */
  readonly name?: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export function describeTarget(element: Element): TargetDescription {
  const rect = element.getBoundingClientRect();
  const name = localizedLabelOf(element)?.replace(/\s+/gu, ' ').trim();
  return {
    kind: kindOf(element),
    ...(name ? { name } : {}),
    widthPx: Math.round(rect.width),
    heightPx: Math.round(rect.height),
  };
}

function kindOf(element: Element): string {
  const role = roleOf(element);
  if (role && ROLE_WORDS[role]) return ROLE_WORDS[role];
  const tag = element.tagName.toLowerCase();
  if (CONTAINER_WORDS[tag]) return CONTAINER_WORDS[tag];
  if (role) return humanize(role);
  return 'Element';
}

function humanize(value: string): string {
  const words = value.replace(/[-_]+/gu, ' ').trim();
  return words ? `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}` : 'Element';
}

export interface TargetMatchCount {
  /** 1-based position of this element among the look-alikes, in reading order. */
  readonly index: number;
  /** How many elements on the page read the same way. */
  readonly total: number;
  /** True when the name is what distinguishes it; false when only the role does. */
  readonly byName: boolean;
}

/**
 * How many things on this page look like the given one — the single most useful
 * number during picking, and one no DAP shows on hover.
 *
 * "Look the same" means same role and same accessible name. With no name, role
 * alone, which is deliberately pessimistic: it tells the creator the pick is
 * ambiguous before they commit to it.
 */
export function countLookAlikes(element: Element, root: ParentNode = element.ownerDocument): TargetMatchCount {
  const role = roleOf(element);
  const name = localizedLabelOf(element)?.replace(/\s+/gu, ' ').trim();
  const candidates = [...root.querySelectorAll('*')].filter((candidate) => {
    if (roleOf(candidate) !== role) return false;
    if (!name) return true;
    return localizedLabelOf(candidate)?.replace(/\s+/gu, ' ').trim() === name;
  });
  const index = candidates.indexOf(element);
  return {
    index: index >= 0 ? index + 1 : 1,
    total: Math.max(1, candidates.length),
    byName: Boolean(name),
  };
}

export interface TargetCrumb {
  readonly element: Element;
  /** Plain language, never a DOM node name: `Toolbar`, `"Create project" button`. */
  readonly label: string;
}

/** Inline wrappers that are never worth a crumb, named or not. */
const SKIPPED_CRUMB_TAGS = new Set(['span', 'em', 'strong', 'b', 'i', 'svg', 'path', 'g']);

/**
 * A crumb has to say something. An unnamed element whose kind is only "Element"
 * — a bare `div` — is scaffolding, and naming it would fill the trail with noise.
 */
function isCrumbWorthy(element: Element): boolean {
  if (SKIPPED_CRUMB_TAGS.has(element.tagName.toLowerCase())) return false;
  const description = describeTarget(element);
  return Boolean(description.name) || description.kind !== 'Element';
}

/**
 * The ancestor breadcrumb (§4.4), in plain language.
 *
 * Webflow's always-visible trail beats Navattic's arrow tools because it never
 * requires you to fail first, and beats arrow-key traversal because it is
 * visible and clickable. Rendered outermost-first, ending at the element itself.
 */
export function targetBreadcrumb(element: Element, maxCrumbs = 5): readonly TargetCrumb[] {
  const trail: Element[] = [];
  const boundary = new Set<Element | null>([
    element.ownerDocument.documentElement,
    element.ownerDocument.body,
  ]);
  let current: Element | null = element;
  while (current && !boundary.has(current)) {
    // The target itself is always a crumb; ancestors have to earn theirs.
    if (current === element || isCrumbWorthy(current)) trail.push(current);
    current = current.parentElement;
  }
  const outermostFirst = trail.reverse();
  const kept =
    outermostFirst.length <= maxCrumbs
      ? outermostFirst
      : [outermostFirst[0]!, ...outermostFirst.slice(-(maxCrumbs - 1))];
  return kept.map((crumb) => ({ element: crumb, label: crumbLabel(crumb) }));
}

function crumbLabel(element: Element): string {
  const description = describeTarget(element);
  if (description.name) {
    const short = description.name.length > 28 ? `${description.name.slice(0, 27)}…` : description.name;
    return `“${short}” ${description.kind.toLowerCase()}`;
  }
  return description.kind;
}

/**
 * One step up or down the trail. `Pick bigger` / `Pick smaller` exist because
 * "the crumb names are abstract and I just want the box a bit bigger" is the
 * actual creator mental model.
 */
export function pickBigger(element: Element): Element | null {
  let parent = element.parentElement;
  while (parent && !isCrumbWorthy(parent) && parent !== element.ownerDocument.body) {
    parent = parent.parentElement;
  }
  if (!parent) return null;
  const boundary = parent === element.ownerDocument.documentElement || parent === element.ownerDocument.body;
  return boundary ? null : parent;
}

/** The largest child worth picking, so "smaller" lands somewhere useful. */
export function pickSmaller(element: Element): Element | null {
  const children = [...element.children].filter(
    (child) => !SKIPPED_CRUMB_TAGS.has(child.tagName.toLowerCase()),
  );
  if (children.length === 0) return null;
  return children.reduce((largest, candidate) => (area(candidate) > area(largest) ? candidate : largest));
}

function area(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}
