/**
 * Two arms, never one percentage.
 *
 * Arm A passes only `id`/`fingerprint`/`identity`. That models an author who was
 * asked "which of these three?" and never answered — so on a look-alike page
 * abstaining is the *right* answer, not a miss, and merging its totals with a
 * corpus where the author did answer would report a capability we never tested.
 *
 * Arm B supplies a `selection` policy and asks a different question entirely:
 * not "did it find the element" but "did the author's declared intent survive
 * the redesign".
 */

import type { TargetSelectionPolicy } from '@lodariq/schema/target';
import type { HostPage } from './host-pages';
import type { Mutation } from './mutations';

export type Arm = 'unanswered' | 'answered';

/** What a correct resolver may do on this trial. */
export type ExpectedOutcome = 'correct' | 'abstained' | 'either';

/**
 * Arm A's scoring contract.
 *
 * The look-alike case inverts: resolving is the failure, because there is no
 * answer to act on and any resolution is a guess dressed as confidence.
 */
export function expectedOutcomeFor(page: HostPage, mutation: Mutation): ExpectedOutcome {
  // Checked first, and it outranks everything: if the mutation deleted the
  // control the author picked, there is no right element left to find, and that
  // is true whether or not the page was ambiguous to begin with.
  if (mutation.expectation === 'abstain') return 'abstained';
  if (page.ambiguousWithoutSelection) return 'abstained';
  return mutation.expectation === 'resolve' ? 'correct' : 'either';
}

export function meetsExpectation(outcome: string, expected: ExpectedOutcome): boolean {
  // `wrong` fails every contract in both arms, without exception.
  if (outcome === 'wrong') return false;
  if (expected === 'either') return true;
  return outcome === expected;
}

/**
 * One Arm B policy under test, bound to the page it answers for.
 *
 * `satisfies` is the intent check: given where the resolver landed, did it obey
 * the rule the author declared? That is what separates `intent-violated` (the
 * resolver did as it was told and the page moved underneath) from `wrong` (the
 * resolver broke its own rule), and only the second is a defect.
 */
export interface PolicyCase {
  id: string;
  pageId: string;
  description: string;
  policy: TargetSelectionPolicy;
  /** Why this policy is worth offering, or worth refusing to offer. */
  rationale: string;
  /**
   * `capturedName` is what the control read on the pristine page, before the
   * mutation. Peer-hood has to be judged against that: the author answered the
   * disambiguation question looking at the *old* copy, so a later copy edit to
   * their own button must not retroactively make every legitimate peer a
   * violation.
   */
  satisfies: (
    resolved: Element,
    groundTruth: Element,
    container: HTMLElement,
    capturedName: string,
  ) => boolean;
}
