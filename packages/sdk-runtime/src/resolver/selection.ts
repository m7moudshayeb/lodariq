import type { TargetSelectionPolicy } from '@lodariq/schema';
import { parentElementAcrossOpenShadow, semanticRoleOf } from './element-evidence';
import type { ScoredCandidate } from './types';

const COLLECTION_ROLES = new Set([
  'list',
  'table',
  'grid',
  'listbox',
  'menu',
  'tablist',
  'rowgroup',
  'treegrid',
  'feed',
]);

export interface SelectionOutcome {
  element: Element;
  method: string;
}

/**
 * Author intent applied to candidates the evidence cannot separate.
 *
 * Everything here fails closed: when the policy cannot be satisfied against the
 * live page the caller keeps its ambiguous result rather than guessing. That is
 * the whole point — a wrong element is worse than an honest "needs review".
 */
export function applySelectionPolicy(
  policy: TargetSelectionPolicy | undefined,
  tied: readonly ScoredCandidate[],
): SelectionOutcome | null {
  if (!policy || policy.kind === 'only' || tied.length === 0) return null;
  const ordered = inDocumentOrder(tied.map((candidate) => candidate.element));

  switch (policy.kind) {
    /*
     * "Any button that says X" is a claim about the words, and the words are
     * exactly what durable scoring left out — that is why these candidates tied
     * in the first place. Taking the first of the tied set would answer a
     * question nobody asked and land on a differently-worded control that
     * happens to sit earlier in the document: a confident click on the wrong
     * button, which is the one outcome worse than abstaining.
     *
     * So the author's answer is applied as what it says: keep the candidates
     * whose text actually matched the captured evidence, then take the first.
     * None matched — the words moved, or the locale is unavailable — and the
     * policy fails closed like every other one here.
     */
    case 'any-matching': {
      const named = inDocumentOrder(
        tied.filter((candidate) => matchedItsText(candidate)).map((candidate) => candidate.element),
      );
      return named[0] ? { element: named[0], method: 'selection_any_matching' } : null;
    }

    case 'first':
      return ordered[0] ? { element: ordered[0], method: 'selection_first' } : null;

    case 'last': {
      const last = ordered[ordered.length - 1];
      return last ? { element: last, method: 'selection_last' } : null;
    }

    case 'ordinal': {
      const pool = policy.order === 'recency' ? orderedByDeclaredRecency(ordered) : ordered;
      if (!pool) return null;
      const picked = pool[policy.position - 1];
      return picked ? { element: picked, method: 'selection_ordinal' } : null;
    }

    case 'first-in-collection': {
      const scoped = withinCollection(ordered, policy.collectionLabel);
      return scoped?.[0] ? { element: scoped[0], method: 'selection_first_in_collection' } : null;
    }

    case 'newest-in-collection': {
      const scoped = withinCollection(ordered, policy.collectionLabel);
      if (!scoped?.length) return null;
      // Only honour "newest" where the product actually declares its ordering.
      const pool = orderedByDeclaredRecency(scoped);
      return pool?.[0] ? { element: pool[0], method: 'selection_newest_in_collection' } : null;
    }

    case 'within-container': {
      const scoped = ordered.filter((element) =>
        hasLabelledAncestor(element, policy.containerLabel),
      );
      return scoped.length === 1 && scoped[0]
        ? { element: scoped[0], method: 'selection_within_container' }
        : null;
    }

    default:
      return null;
  }
}

/** Whether this candidate matched the identity's own locale-scoped text. */
function matchedItsText(candidate: ScoredCandidate): boolean {
  return candidate.evidence.some((entry) => entry.family === 'localized-text');
}

function inDocumentOrder(elements: readonly Element[]): Element[] {
  return [...elements].sort((a, b) => {
    if (a === b) return 0;
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

/**
 * `aria-sort` is the one place a product states its own ordering. Without it we
 * refuse to claim anything is "newest" — silently picking row one is exactly
 * the failure a data-relative target exists to prevent.
 */
function orderedByDeclaredRecency(elements: readonly Element[]): Element[] | null {
  const collection = sharedCollection(elements);
  if (!collection) return null;
  // The sort is declared on a column header, which sits outside the row group.
  const scope = sortScopeOf(collection);
  const sorted = scope.querySelector('[aria-sort="descending"], [aria-sort="ascending"]');
  if (!sorted) return null;
  const ordered = inDocumentOrder(elements);
  return sorted.getAttribute('aria-sort') === 'ascending' ? [...ordered].reverse() : ordered;
}

function sortScopeOf(collection: Element): Element {
  let node: Element | null = collection;
  let hops = 0;
  while (node && hops < 6) {
    const role = semanticRoleOf(node);
    const tag = node.tagName.toLowerCase();
    if (tag === 'table' || role === 'table' || role === 'grid' || role === 'treegrid') return node;
    node = parentElementAcrossOpenShadow(node);
    hops += 1;
  }
  return collection;
}

function withinCollection(
  elements: readonly Element[],
  collectionLabel: string | undefined,
): Element[] | null {
  if (!collectionLabel) {
    return sharedCollection(elements) ? inDocumentOrder(elements) : null;
  }
  const scoped = elements.filter((element) => hasLabelledAncestor(element, collectionLabel));
  return scoped.length ? inDocumentOrder(scoped) : null;
}

/** The nearest collection every candidate shares, if they share one at all. */
function sharedCollection(elements: readonly Element[]): Element | null {
  const first = elements[0];
  if (!first) return null;
  const chain = collectionAncestors(first);
  for (const container of chain) {
    if (elements.every((element) => container.contains(element))) return container;
  }
  return null;
}

function collectionAncestors(element: Element): Element[] {
  const out: Element[] = [];
  let node: Element | null = parentElementAcrossOpenShadow(element);
  let hops = 0;
  while (node && hops < 12) {
    if (isCollection(node)) out.push(node);
    node = parentElementAcrossOpenShadow(node);
    hops += 1;
  }
  return out;
}

function isCollection(element: Element): boolean {
  const role = semanticRoleOf(element);
  if (role && COLLECTION_ROLES.has(role)) return true;
  const tag = element.tagName.toLowerCase();
  return tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'tbody';
}

function hasLabelledAncestor(element: Element, label: string): boolean {
  const wanted = label.trim().toLowerCase();
  let node: Element | null = element;
  let hops = 0;
  while (node && hops < 12) {
    if (containerLabelOf(node)?.toLowerCase() === wanted) return true;
    node = parentElementAcrossOpenShadow(node);
    hops += 1;
  }
  return false;
}

/** A container's own accessible name: aria-label, or the heading it owns. */
function containerLabelOf(element: Element): string | null {
  const aria = element.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const owner = element.ownerDocument?.getElementById(labelledBy.split(/\s+/)[0] ?? '');
    const text = owner?.textContent?.trim();
    if (text) return text;
  }
  const caption = element.querySelector(':scope > caption, :scope > legend');
  const captionText = caption?.textContent?.trim();
  if (captionText) return captionText;
  const heading = element.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > header > h1, :scope > header > h2, :scope > header > h3');
  const headingText = heading?.textContent?.trim();
  return headingText || null;
}
