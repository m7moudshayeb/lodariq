/**
 * Compound mutations.
 *
 * A real redesign is not one change. The single-mutation corpus asks "does the
 * resolver survive a class rename", but nobody ships a class rename alone — they
 * ship a class rename *and* a wrapper *and* a reorder *and* a copy edit in the
 * same release. Each degrades a signal family a little, and the interesting
 * question is whether the sum of small degradations lets a runner-up climb above
 * the target. That cannot be measured one mutation at a time.
 *
 * The power set of the atomic mutations is millions of combinations, so this is
 * a **named, hand-picked, deterministic sample** rather than a generator.
 * `compoundCoverage()` reports which atomic classes the sample reaches and which
 * it does not, because a partial sample that reads as exhaustive is worse than
 * no sample at all.
 */

import { MUTATIONS, type Mutation, type MutationExpectation } from './mutations';

/**
 * The sample, and the single source of what each compound contains.
 *
 * Chosen so each entry names a release a customer could plausibly ship in one
 * sprint, not to maximise damage. Ordering inside a compound is meaningful:
 * `element-retagged` runs before `class-rename` because a retag that ran last
 * would carry the already-renamed classes and test one thing less.
 */
const COMPOUND_SPECS: ReadonlyArray<{
  id: string;
  description: string;
  parts: readonly string[];
}> = [
  {
    id: 'compound:restyle',
    description: 'Design-system bump: classes rewritten, tooltip wrappers added',
    parts: ['class-rename', 'wrapper-inserted'],
  },
  {
    id: 'compound:redesign',
    description: 'The same, plus the action bar is reordered',
    // Reorder runs before the wrapper on purpose: `wrapper-inserted` leaves the
    // target an only child, and `siblings-reordered` needs two siblings, so the
    // other order skips the whole compound on every page and silently measures
    // nothing. Order inside a compound is part of the experiment.
    parts: ['siblings-reordered', 'class-rename', 'wrapper-inserted'],
  },
  {
    id: 'compound:redesign-plus-copy',
    description: 'A full redesign release, copy edit included',
    parts: ['siblings-reordered', 'class-rename', 'wrapper-inserted', 'accessible-name-changed'],
  },
  {
    id: 'compound:refactor',
    description: 'Test-instrumentation cleanup landing beside a layout change',
    parts: ['instrumentation-stripped', 'wrapper-inserted', 'layout-reflow'],
  },
  {
    id: 'compound:rebrand-localized',
    description: 'Rebrand shipped together with a new locale',
    parts: ['class-rename', 'i18n-text-swap', 'layout-reflow'],
  },
  {
    id: 'compound:remount-experiment',
    description: 'Framework remount with an experiment live on the page',
    parts: ['virtualized-remount', 'ab-variant-inserted', 'siblings-reordered'],
  },
  {
    id: 'compound:retag-restyle',
    description: 'Buttons reimplemented as anchors during a restyle',
    parts: ['element-retagged', 'class-rename', 'wrapper-inserted'],
  },
  {
    id: 'compound:rtl-rebrand',
    description: 'Arabic launch: mirrored geometry, new copy, new classes',
    parts: ['rtl-locale-flip', 'class-rename', 'i18n-text-swap'],
  },
  {
    id: 'compound:tailwind-drift',
    description: 'Tailwind token tweak plus a banner and a wrapper',
    parts: ['utility-classes-tweaked', 'layout-reflow', 'wrapper-inserted'],
  },
  {
    id: 'compound:adversarial-drift',
    description: 'Restyle that also swaps the target with its twin',
    parts: ['class-rename', 'lookalikes-swapped', 'layout-reflow'],
  },
];

function atomic(id: string): Mutation {
  const found = MUTATIONS.find((mutation) => mutation.id === id);
  if (!found) throw new Error(`compound mutation names unknown atomic mutation ${id}`);
  return found;
}

/** Weakest expectation wins: a chain is only as recoverable as its worst link. */
function combineExpectations(parts: readonly Mutation[]): MutationExpectation {
  if (parts.some((part) => part.expectation === 'abstain')) return 'abstain';
  if (parts.some((part) => part.expectation === 'either')) return 'either';
  return 'resolve';
}

/**
 * Chains atomic mutations, threading the ground truth through each step.
 *
 * Threading matters: `element-retagged` and `virtualized-remount` both replace
 * the node, so a chain that kept the original reference would score against an
 * element no longer in the document and report a false `wrong`. If any step does
 * not apply, the whole compound is skipped rather than silently shortened — a
 * three-of-four compound is a different experiment than the one named here.
 */
function compose(spec: (typeof COMPOUND_SPECS)[number]): Mutation {
  const parts = spec.parts.map(atomic);
  return {
    id: spec.id,
    description: spec.description,
    expectation: combineExpectations(parts),
    // A compound inherits adversarial status from its parts: chaining a benign
    // restyle onto a twin swap does not make the twin swap benign.
    ...(parts.some((part) => part.adversarial) ? { adversarial: true } : {}),
    apply: (container, target) => {
      let current: Element | null = target;
      for (const part of parts) {
        if (!current) return null;
        current = part.apply(container, current);
      }
      return current;
    },
  };
}

export const COMPOUND_MUTATIONS: readonly Mutation[] = COMPOUND_SPECS.map(compose);

export interface CompoundCoverage {
  /** How many compounds each atomic mutation appears in, busiest first. */
  frequency: Array<{ id: string; count: number }>;
  /** Atomic ids the sample never reaches — the honest gap. */
  uncovered: string[];
  /** Each compound and the chain it runs, so the sample is auditable. */
  chains: Array<{ id: string; parts: readonly string[]; expectation: MutationExpectation }>;
}

/**
 * What the sample actually reaches.
 *
 * Rendered in the report so "we tested compound mutations" can never be read as
 * "we tested every compound mutation". A reader is entitled to know which atomic
 * classes only ever ran alone.
 */
export function compoundCoverage(): CompoundCoverage {
  const counts = new Map<string, number>();
  for (const spec of COMPOUND_SPECS) {
    for (const part of spec.parts) counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  return {
    frequency: [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id)),
    uncovered: MUTATIONS.map((mutation) => mutation.id)
      .filter((id) => id !== 'pristine' && !counts.has(id))
      .sort(),
    chains: COMPOUND_MUTATIONS.map((compound, index) => ({
      id: compound.id,
      parts: COMPOUND_SPECS[index]?.parts ?? [],
      expectation: compound.expectation,
    })),
  };
}
