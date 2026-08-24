import type { ResolutionResult } from '@lodariq/sdk-runtime/resolver';
import type { MutationExpectation } from './mutations';
import type { NearMiss } from './near-miss';
import type { Arm, ExpectedOutcome } from './arms';

/**
 * Three outcomes, and only three.
 *
 *  - `correct`   — resolved, and landed on the control the creator picked.
 *  - `abstained` — declined to resolve (missing / ambiguous / needs_review).
 *    A degraded tour, but an honest one: the drift path can catch it.
 *  - `wrong`     — resolved confidently onto a *different* element. This is the
 *    only outcome that ships a broken tour with no signal that anything is
 *    wrong, so it is treated as a hard failure in every mutation class.
 */
export type Outcome = 'correct' | 'abstained' | 'wrong';

/**
 * Arm B's outcome model. The author declared a rule, so the question changes
 * from "did it find the element" to "did it obey what it was told".
 *
 *  - `honoured`        — landed on the control the author picked.
 *  - `abstained`       — the policy could not be satisfied and it failed closed.
 *  - `intent-violated` — landed elsewhere, but *consistent with the declared
 *    rule*: the resolver did as instructed and the page moved underneath. A
 *    finding about the policy, not a resolver defect.
 *  - `wrong`           — landed somewhere its own rule does not permit. This is
 *    the defect, and it is the same `wrong` the whole harness reserves.
 */
export type IntentOutcome = 'honoured' | 'abstained' | 'intent-violated' | 'wrong';

/**
 * Two durable scores closer than this are a coin flip, not a ranking.
 *
 * Scores move in units of ~16.5, so anything under half a point means the
 * candidates are indistinguishable and sort order alone decided first place.
 */
export const TIE_EPSILON = 0.5;

export interface Trial {
  arm: Arm;
  pageId: string;
  mutationId: string;
  /** Arm B: which declared policy this trial exercised. */
  policyId: string | null;
  expectation: MutationExpectation;
  outcome: Outcome;
  /** What this arm's contract says a correct resolver may do here. */
  expectedOutcome: ExpectedOutcome;
  /** Whether `outcome` satisfied that contract. `wrong` never does. */
  met: boolean;
  /** Arm B only: did the author's declared intent survive? */
  intentOutcome: IntentOutcome | null;
  state: ResolutionResult['state'];
  reasonCode: ResolutionResult['reasonCode'];
  confidence: number;
  candidateCount: number;
  evidenceFamilies: readonly string[];
  /** The control the creator picked, so a `wrong` row reads as a bug report. */
  expectedDescription: string | null;
  /** Human-readable description of what it hit, when it hit the wrong thing. */
  resolvedDescription: string | null;
  /**
   * Top-minus-runner-up durable score, from the public result. Unlike near-miss
   * this needs no resolver change — `confidence` and `runnerUpConfidence` are
   * already the two durable scores.
   */
  tieGap: number | null;
  /** Top two within `TIE_EPSILON`: first place was decided by sort order. */
  tieFragile: boolean;
  /**
   * Set when the *wrong* element won the ranking, whatever the final outcome.
   * `'unmeasured'` means this build cannot report rankings at all — distinct
   * from `null`, which means the author's pick genuinely ranked first.
   */
  nearMiss: NearMiss | null | 'unmeasured';
}

export function describeElement(element: Element | null): string | null {
  if (!element) return null;
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute('id');
  const testId = element.getAttribute('data-testid');
  const text = (element.textContent ?? '').trim().slice(0, 40);
  const parts = [tag];
  if (id) parts.push(`#${id}`);
  if (testId) parts.push(`[data-testid=${testId}]`);
  if (text) parts.push(`"${text}"`);
  return parts.join(' ');
}

/** Top-minus-runner-up, or null when there was no runner-up to compare. */
export function tieGapOf(result: ResolutionResult): number | null {
  if (result.runnerUpConfidence === null) return null;
  return result.confidence - result.runnerUpConfidence;
}

/**
 * The hard failure, per arm.
 *
 * Arm A's `outcome` cannot judge Arm B: an `any-matching` policy landing on a
 * sibling is the author's declared intent, and calling that `wrong` would
 * manufacture 20 failures out of the resolver doing exactly as instructed.
 * `wrong` means "resolved against the evidence" in Arm A and "resolved against
 * its own declared rule" in Arm B.
 */
export function isHardWrong(trial: Trial): boolean {
  return trial.arm === 'answered' ? trial.intentOutcome === 'wrong' : trial.outcome === 'wrong';
}

export function classify(result: ResolutionResult, groundTruth: Element): Outcome {
  if (result.state !== 'found') return 'abstained';
  if (!result.element) return 'abstained';
  return result.element === groundTruth ? 'correct' : 'wrong';
}

export interface Summary {
  total: number;
  /** Trials satisfying this arm's expected-outcome contract. */
  met: number;
  correct: number;
  abstained: number;
  wrong: number;
  /** Abstentions on mutations the resolver was expected to survive. */
  missedRecoverable: number;
  /** Trials where the wrong element won the ranking, outcome notwithstanding. */
  nearMisses: number;
  /** Of those, the ones where the leader actually out-scored the author's pick. */
  nearMissesOutscored: number;
  /** Of those, the ones a single late veto stopped after the tie gate passed. */
  nearMissesPastMargin: number;
  /** Trials whose ranking could not be read, so near-miss is unknown. */
  nearMissUnmeasured: number;
  /**
   * Trials whose top two durable scores are within `TIE_EPSILON`.
   *
   * Reported orthogonally to the expected-outcome contract and never netted
   * against it: an abstention that was *expected* can still be one rounding
   * change away from resolving onto an arbitrary element, and Step 5b is
   * exactly such a change.
   */
  tieFragile: number;
  /** Arm B intent tallies; zero across the board in Arm A. */
  honoured: number;
  intentViolated: number;
}

export function summarize(trials: readonly Trial[]): Summary {
  let correct = 0;
  let abstained = 0;
  let wrong = 0;
  let missedRecoverable = 0;
  let met = 0;
  let tieFragile = 0;
  let honoured = 0;
  let intentViolated = 0;
  let nearMisses = 0;
  let nearMissesOutscored = 0;
  let nearMissesPastMargin = 0;
  let nearMissUnmeasured = 0;
  for (const trial of trials) {
    if (trial.met) met += 1;
    if (trial.tieFragile) tieFragile += 1;
    if (trial.intentOutcome === 'honoured') honoured += 1;
    if (trial.intentOutcome === 'intent-violated') intentViolated += 1;
    if (trial.nearMiss === 'unmeasured') nearMissUnmeasured += 1;
    else if (trial.nearMiss) {
      nearMisses += 1;
      if (trial.nearMiss.outscored) nearMissesOutscored += 1;
      if (trial.nearMiss.marginCleared) nearMissesPastMargin += 1;
    }
    if (trial.outcome === 'correct') correct += 1;
    if (isHardWrong(trial)) wrong += 1;
    if (trial.outcome === 'abstained') {
      abstained += 1;
      if (trial.expectation === 'resolve') missedRecoverable += 1;
    }
  }
  return {
    total: trials.length,
    met,
    correct,
    abstained,
    wrong,
    missedRecoverable,
    nearMisses,
    nearMissesOutscored,
    nearMissesPastMargin,
    nearMissUnmeasured,
    tieFragile,
    honoured,
    intentViolated,
  };
}
