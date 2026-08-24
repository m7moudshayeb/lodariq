/**
 * Near-miss detection.
 *
 * `wrong = 0` does not mean "safe". A trial where the wrong element won the
 * ranking and was stopped by one downstream veto is a bullet dodged; a trial
 * that abstained because nothing matched is ordinary caution. The public
 * `ResolutionResult` cannot tell them apart, because every abstention nulls
 * `element` — so the first baseline reported safety it had not measured.
 *
 * Read through `setResolutionRankingObserver`, which the resolver publishes for
 * exactly this (see `NEAR-MISS-PROBE.md` for why nothing else could derive it).
 * Still bound off the module namespace rather than imported by name: against a
 * build without the export the harness reports `unmeasured` rather than absent,
 * because a silent zero is the false confidence this file exists to remove.
 *
 * Only Arm A's number is a safety number. Arm B's author declared a policy so
 * that the ranking would *not* decide, so its leader landing elsewhere is the
 * policy working, not a near-wrong.
 */

import {
  MAX_RUNNER_UP_MARGIN,
  MIN_IDENTITY_CONFIDENCE,
  MIN_INDEPENDENT_IDENTITY_FAMILIES,
  MIN_RUNNER_UP_MARGIN,
  type ResolutionResult,
} from '@lodariq/sdk-runtime/resolver';
import * as resolverModule from '@lodariq/sdk-runtime/resolver';

/** Kept in step with `requiredRunnerUpMargin` in resolve.ts. */
const RUNNER_UP_RATIO = 0.15;

/** One candidate as the resolver ranked it, reduced to what scoring turns on. */
export interface RankedCandidate {
  element: Element;
  durableScore: number;
  durableFamilyCount: number;
  families: readonly string[];
}

/** One resolution's ranking, in the resolver's own sort order. */
export interface ResolutionRanking {
  candidates: readonly RankedCandidate[];
}

/**
 * The check that actually stopped the resolution.
 *
 * `reasonCode` is not enough: `low_confidence` is emitted by two different
 * conditions sharing one return, and `evidence_drift` by two more. Naming the
 * veto is the difference between "raise the floor" and "the quorum rule bit".
 */
export type VetoName =
  | 'score-floor'
  | 'family-quorum'
  | 'score-floor+family-quorum'
  | 'tie-margin'
  | 'evidence-drift'
  | 'locale-unverified'
  | 'not-actionable'
  | 'no-candidates'
  | 'other'
  | 'none';

export interface NearMiss {
  /** The element that won the ranking despite not being the author's pick. */
  leaderDescription: string | null;
  leaderDurableScore: number;
  leaderFamilies: readonly string[];
  /** 1-based rank of the ground truth, or null if it never became a candidate. */
  trueTargetRank: number | null;
  trueTargetDurableScore: number | null;
  /** Leader minus true target. */
  scoreGap: number;
  /**
   * True when the leader genuinely out-scored the author's pick. A gap of zero
   * means they tied and sort order alone put the wrong one first — that is the
   * unanswered disambiguation question, not evidence pointing the wrong way.
   */
  outscored: boolean;
  /** Leader minus runner-up, against the margin the tie gate demanded. */
  margin: number;
  requiredMargin: number;
  /** True when the tie gate would not have stopped it — only a later veto did. */
  marginCleared: boolean;
  veto: VetoName;
}

/** Mirrors `requiredRunnerUpMargin` (resolve.ts) from exported constants. */
export function requiredMarginFor(topScore: number): number {
  return Math.min(MAX_RUNNER_UP_MARGIN, Math.max(MIN_RUNNER_UP_MARGIN, topScore * RUNNER_UP_RATIO));
}

/**
 * Which check stopped it, derived from the ranking plus the published
 * thresholds. Deriving beats instrumenting every return site: the thresholds
 * are exported, so this stays correct without a second source change.
 */
export function vetoFor(result: ResolutionResult, ranking: ResolutionRanking): VetoName {
  const [top, second] = ranking.candidates;
  if (result.state === 'found') return 'none';
  if (!top) return 'no-candidates';
  if (result.reasonCode === 'locale_unverified') return 'locale-unverified';
  if (result.reasonCode === 'evidence_drift') return 'evidence-drift';
  if (result.reasonCode === 'not_actionable') return 'not-actionable';
  if (result.reasonCode === 'low_confidence') {
    const belowFloor = top.durableScore < MIN_IDENTITY_CONFIDENCE;
    const belowQuorum = top.durableFamilyCount < MIN_INDEPENDENT_IDENTITY_FAMILIES;
    if (belowFloor && belowQuorum) return 'score-floor+family-quorum';
    if (belowFloor) return 'score-floor';
    if (belowQuorum) return 'family-quorum';
  }
  if (result.state === 'ambiguous') return 'tie-margin';
  if (second) return 'tie-margin';
  return 'other';
}

/**
 * A near-miss is decided by the *ranking*, not the outcome: the question is
 * whether the wrong element won, not whether it was allowed through.
 */
export function detectNearMiss(
  result: ResolutionResult,
  ranking: ResolutionRanking,
  groundTruth: Element,
  describe: (element: Element | null) => string | null,
): NearMiss | null {
  const [top, second] = ranking.candidates;
  if (!top || top.element === groundTruth) return null;

  const trueIndex = ranking.candidates.findIndex((entry) => entry.element === groundTruth);
  const trueTarget = trueIndex >= 0 ? ranking.candidates[trueIndex] : undefined;
  const gap = trueTarget ? top.durableScore - trueTarget.durableScore : top.durableScore;
  const requiredMargin = requiredMarginFor(top.durableScore);
  const margin = second ? top.durableScore - second.durableScore : top.durableScore;

  return {
    leaderDescription: describe(top.element),
    leaderDurableScore: top.durableScore,
    leaderFamilies: top.families,
    trueTargetRank: trueIndex >= 0 ? trueIndex + 1 : null,
    trueTargetDurableScore: trueTarget ? trueTarget.durableScore : null,
    scoreGap: gap,
    outscored: gap > 0,
    margin,
    requiredMargin,
    marginCleared: margin >= requiredMargin,
    veto: vetoFor(result, ranking),
  };
}

/**
 * How close this came to shipping the wrong element, worst first. Clearing the
 * tie gate is the sharp line; below it, evidence actively favouring the wrong
 * element outranks a coin-flip between equals.
 */
export function nearMissSeverity(nearMiss: NearMiss): number {
  const cleared = nearMiss.marginCleared ? 1_000_000 : 0;
  const outscored = nearMiss.outscored ? 1_000 : 0;
  return cleared + outscored + nearMiss.scoreGap;
}

type RankingObserver = (ranking: ResolutionRanking) => void;

/**
 * Binds to the observer if this build of sdk-runtime has one. Read off the
 * namespace rather than imported by name so the harness compiles and runs
 * against the unpatched package — the absence is the thing we report.
 */
const installObserver = (
  resolverModule as unknown as Record<string, ((observer: RankingObserver | null) => void) | undefined>
)['setResolutionRankingObserver'];

export const RANKING_PROBE_AVAILABLE = typeof installObserver === 'function';

let lastRanking: ResolutionRanking | null = null;

/** Arms the probe for a run. No-op when this build cannot report rankings. */
export function startRankingProbe(): void {
  if (!installObserver) return;
  installObserver((ranking) => {
    lastRanking = ranking;
  });
}

export function stopRankingProbe(): void {
  if (!installObserver) return;
  installObserver(null);
  lastRanking = null;
}

/** The ranking from the most recent `resolveTarget` call, if one was published. */
export function takeLastRanking(): ResolutionRanking | null {
  const ranking = lastRanking;
  lastRanking = null;
  return ranking;
}
