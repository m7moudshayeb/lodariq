/**
 * Arm B: the policies an author could pick for a control inside a collection.
 *
 * The question is not "does an ordinal policy break under reorder" — ADR-0016
 * already says it does, and Step 1b showed it doing damage outside a collection
 * too. The question is **which policy we should offer**, so each case here is
 * chosen to make one property fail or hold, and `ordinal` is present only as the
 * control that shows what we are trying to avoid.
 */

import type { PolicyCase } from './arms';

/** Does any ancestor carry this accessible label? Mirrors `hasLabelledAncestor`. */
function insideLabelled(element: Element, label: string, container: Element): boolean {
  let node: Element | null = element;
  while (node && node !== container.parentElement) {
    if (node.getAttribute('aria-label')?.trim() === label) return true;
    const heading = node.querySelector(':scope > h1, :scope > h2, :scope > h3');
    if (heading?.textContent?.trim() === label) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Is this one of the look-alikes the author was choosing between?
 *
 * An ordinal policy declares a *position*, so landing on a peer after the page
 * reorders is the policy working as specified — `intent-violated`, not `wrong`.
 * Landing on something that is not a peer at all would be the resolver breaking
 * its own rule. Peer-hood is judged the way the tie arose: same tag, same class.
 *
 * Indexing the container's buttons directly would be wrong — the resolver ranks
 * only the *tied* candidates, so an inserted control with different copy shifts
 * a naive index without ever entering the set the policy applied to.
 *
 * Compared against `capturedName`, not against the ground truth's copy *now*:
 * rename the author's own button and it stops matching its own peers, which
 * would score every position policy as a violation on every copy edit.
 */
function looksLikePeer(resolved: Element, groundTruth: Element, capturedName: string): boolean {
  if (resolved === groundTruth) return true;
  const roleOf = (element: Element): string =>
    element.getAttribute('role') ?? element.tagName.toLowerCase();
  const textOf = (element: Element): string =>
    (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
  return roleOf(resolved) === roleOf(groundTruth) && textOf(resolved) === capturedName;
}

export const POLICY_CASES: readonly PolicyCase[] = [
  /*
   * Content-anchored. The only policy whose rule refers to what the row *says*
   * rather than where it sits, so it is the only one that can survive a re-sort.
   * On the plain table it should fail closed: a row's identity lives in a
   * sibling cell, and `containerLabelOf` reads aria-label / aria-labelledby /
   * caption / a direct-child heading — never cell text.
   */
  {
    id: 'content-anchored',
    pageId: 'table-row-action',
    description: 'The Manage button in the row for Globex',
    policy: { kind: 'within-container', containerLabel: 'Globex' },
    rationale: 'Refers to content, so a re-sort moves the anchor with the row.',
    satisfies: (resolved, _groundTruth, container) =>
      insideLabelled(resolved, 'Globex', container),
  },
  {
    id: 'content-anchored',
    pageId: 'table-row-action-labelled',
    description: 'The Manage button in the row for Globex, where the row names itself',
    policy: { kind: 'within-container', containerLabel: 'Globex' },
    rationale: 'Isolates whether the failure is the policy or the missing row label.',
    satisfies: (resolved, _groundTruth, container) =>
      insideLabelled(resolved, 'Globex', container),
  },
  {
    id: 'content-anchored',
    pageId: 'pricing-card-cta',
    description: 'The CTA in the Growth card',
    policy: { kind: 'within-container', containerLabel: 'Growth' },
    rationale: 'A card owns a direct-child heading, so the container can name itself.',
    satisfies: (resolved, _groundTruth, container) =>
      insideLabelled(resolved, 'Growth', container),
  },

  /*
   * Any-matching. A legitimate answer for "click any Manage button", and the
   * policy that once aliased to `first` and resolved onto the wrong control.
   * Landing on a sibling is honoured intent here, not a defect — but landing on
   * something whose text never matched is the old bug returning.
   */
  {
    id: 'any-matching',
    pageId: 'table-row-action',
    description: 'Any button reading Manage',
    policy: { kind: 'any-matching' },
    rationale: 'Confirms the aliasing fix holds: text must match, not position.',
    satisfies: (resolved) => (resolved.textContent ?? '').trim().startsWith('Manage'),
  },
  {
    id: 'any-matching',
    pageId: 'pricing-card-cta',
    description: 'Any button reading Choose plan',
    policy: { kind: 'any-matching' },
    rationale: 'Same check on a page whose look-alikes are not in a real collection.',
    satisfies: (resolved) => (resolved.textContent ?? '').trim().startsWith('Choose plan'),
  },

  /*
   * First — and it is not a curiosity. `lookAlikeQuestion` offers "Always the
   * first one" on *every* look-alike question, unconditionally, so it is the
   * most widely reachable position policy there is. Measured on both look-alike
   * pages because 5a-0 changes what it counts.
   */
  {
    id: 'first',
    pageId: 'table-row-action',
    description: 'Always the first Manage button',
    policy: { kind: 'first' },
    rationale: 'The card offers this to every author; position policies must be measured.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },
  {
    id: 'first',
    pageId: 'pricing-card-cta',
    description: 'Always the first Choose plan button',
    policy: { kind: 'first' },
    rationale: 'Same policy where the look-alikes are not in a real collection.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },

  /*
   * Last — in the schema and honoured by the resolver, but no authoring surface
   * emits it today. Carried so 5a-0 changes nothing here unmeasured.
   */
  {
    id: 'last',
    pageId: 'table-row-action',
    description: 'Always the last Manage button',
    policy: { kind: 'last' },
    rationale: 'Schema-reachable, card-unreachable. Measured so the fix is not assumed.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },
  {
    id: 'last',
    pageId: 'pricing-card-cta',
    description: 'Always the last Choose plan button',
    policy: { kind: 'last' },
    rationale: 'Schema-reachable, card-unreachable. Measured so the fix is not assumed.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },

  /*
   * The two collection-scoped position policies. `lookAlikeQuestion` offers both
   * ahead of everything else whenever the target sits in a collection, so they
   * are the *first* thing an author in a table is asked — and they indexed the
   * unfiltered tie for exactly as long as `first` and `ordinal` did.
   */
  {
    id: 'first-in-collection',
    pageId: 'table-row-action-sorted',
    description: 'The Manage button in the first row of the table',
    policy: { kind: 'first-in-collection' },
    rationale: 'The card offers this first inside a collection; it must be measured.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },
  {
    id: 'first-in-collection',
    pageId: 'pricing-card-cta',
    description: 'The CTA in the first pricing card',
    // Records the boundary rather than a defect: a card grid declares no
    // collection role, so `sharedCollection` finds nothing and the policy fails
    // closed on every trial. Carried so that stops being an assumption.
    policy: { kind: 'first-in-collection' },
    rationale: 'A div grid is not a declared collection, so this should abstain throughout.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },
  {
    id: 'newest-in-collection',
    pageId: 'table-row-action-sorted',
    description: 'The Manage button in the newest row, per the table own sort',
    policy: { kind: 'newest-in-collection' },
    rationale: 'The one data-relative policy; only measurable where aria-sort exists.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },

  /*
   * Ordinal — the control. Expected to survive nothing that moves rows. Present
   * to quantify how often it lands somewhere the author did not mean, which is
   * the evidence for whether we should offer it inside a collection at all.
   */
  {
    id: 'ordinal',
    pageId: 'table-row-action',
    description: 'The second Manage button in reading order',
    policy: { kind: 'ordinal', position: 2, order: 'reading-order' },
    rationale: 'The control. Position is exactly what a redesign is free to change.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },
  {
    id: 'ordinal',
    pageId: 'pricing-card-cta',
    description: 'The second Choose plan button in reading order',
    policy: { kind: 'ordinal', position: 2, order: 'reading-order' },
    rationale: 'The control, on the non-collection look-alike page.',
    satisfies: (resolved, groundTruth, _container, capturedName) =>
      looksLikePeer(resolved, groundTruth, capturedName),
  },
];
