/**
 * The ratchet: a committed snapshot, compared class by class.
 *
 * Not a threshold. One global percentage lets a regression in one mutation class
 * hide behind a gain in another, and at this corpus size a single trial is worth
 * more than a percentage point — so the comparison is per arm, per class, by
 * count.
 *
 * Improvements fail too. A number that moved is a diff a person should read and
 * accept on purpose; a ratchet that silently absorbs gains cannot tell a real
 * fix from a fixture that stopped running.
 */

import type { Corpus } from './corpus';
import type { Trial } from './scorer';

/** Written into the snapshot so whoever opens it knows what it is. */
export const BASELINE_HEADER = [
  'Committed baseline for the targeting-accuracy corpus. Counts, not percentages.',
  'Regenerating this file is a human decision, never an automatic one: run',
  'UPDATE_TARGETING_BASELINE=1 pnpm vitest run targeting-accuracy, then read the',
  'diff and say in the commit message which classes moved and why.',
  'wrong must be 0 in every class of both arms. That one is absolute, not ratcheted.',
  'nearMiss is keyed <arm>/<bucket>. Only the Arm A count is a safety number: Arm B',
  'declared a policy precisely so the ranking would not decide.',
];

export interface ClassCounts {
  [outcome: string]: number;
}

export interface Baseline {
  $comment: readonly string[];
  totals: { trials: number; unanswered: number; answered: number };
  /** Arm A, keyed by mutation class: correct / abstained / wrong. */
  unanswered: Record<string, ClassCounts>;
  /** Arm B, keyed by mutation class: honoured / abstained / intent-violated / wrong. */
  answered: Record<string, ClassCounts>;
  /**
   * Near-miss, keyed `<arm>/<bucket>`.
   *
   * Split by arm because the two arms make the ranking mean different things:
   * in Arm A it decides, so a wrong leader is one veto from a wrong click; in
   * Arm B the author's policy decides and the ranking is meant to be overridden.
   * A single corpus-wide count mixes the two and reads as neither.
   *
   * Ratcheted rather than absolute: it should trend down, and any rise fails.
   * `unmeasured` is not zero and must never be read as zero — it means this
   * build published no ranking (see NEAR-MISS-PROBE.md).
   */
  nearMiss: ClassCounts;
}

function tally(trials: readonly Trial[], of: (trial: Trial) => string): Record<string, ClassCounts> {
  const out: Record<string, ClassCounts> = {};
  for (const trial of trials) {
    const bucket = (out[trial.mutationId] ??= {});
    const key = of(trial);
    bucket[key] = (bucket[key] ?? 0) + 1;
  }
  // Sorted so a regenerated file diffs against the old one line by line.
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((id) => [id, sortKeys(out[id] as ClassCounts)]),
  );
}

function sortKeys(counts: ClassCounts): ClassCounts {
  return Object.fromEntries(Object.keys(counts).sort().map((key) => [key, counts[key] as number]));
}

export function snapshotOf(corpus: Corpus): Baseline {
  const nearMiss: ClassCounts = {};
  for (const trial of corpus.all) {
    // `null` is a measured "the right element won"; `'unmeasured'` is the absence
    // of a ranking to read. Collapsing the two would report a probe that never
    // ran as a clean sweep.
    const bucket =
      trial.nearMiss === 'unmeasured' ? 'unmeasured' : trial.nearMiss ? 'near-miss' : 'none';
    const key = `${trial.arm}/${bucket}`;
    nearMiss[key] = (nearMiss[key] ?? 0) + 1;
  }
  return {
    $comment: BASELINE_HEADER,
    totals: {
      trials: corpus.all.length,
      unanswered: corpus.unanswered.length,
      answered: corpus.answered.length,
    },
    unanswered: tally(corpus.unanswered, (trial) => trial.outcome),
    answered: tally(corpus.answered, (trial) => trial.intentOutcome ?? 'unscored'),
    nearMiss: sortKeys(nearMiss),
  };
}

/** Outcomes whose count going *up* is the regression, rather than down. */
const WORSE_WHEN_HIGHER = new Set(['wrong', 'intent-violated', 'near-miss']);

function direction(outcome: string, delta: number): 'regression' | 'improvement' {
  const worse = WORSE_WHEN_HIGHER.has(outcome) ? delta > 0 : delta < 0;
  return worse ? 'regression' : 'improvement';
}

/**
 * Every difference between the run and the snapshot, phrased for a human.
 *
 * A class that disappears reads as its counts dropping to zero, which is the
 * point: a fixture or mutation that quietly stops running must fail the ratchet
 * rather than look like a corpus that got easier.
 */
export function ratchetFailures(current: Baseline, baseline: Baseline): string[] {
  const failures: string[] = [];

  for (const [key, count] of Object.entries(current.totals)) {
    const was = baseline.totals[key as keyof Baseline['totals']];
    if (count !== was) failures.push(`totals.${key}: ${was} -> ${count}`);
  }

  for (const arm of ['unanswered', 'answered'] as const) {
    const classes = new Set([...Object.keys(current[arm]), ...Object.keys(baseline[arm])]);
    for (const mutationId of [...classes].sort()) {
      const now = current[arm][mutationId] ?? {};
      const then = baseline[arm][mutationId] ?? {};
      const outcomes = new Set([...Object.keys(now), ...Object.keys(then)]);
      for (const outcome of [...outcomes].sort()) {
        const a = now[outcome] ?? 0;
        const b = then[outcome] ?? 0;
        if (a === b) continue;
        const delta = a - b;
        failures.push(
          `${arm}/${mutationId}/${outcome}: ${b} -> ${a} (${delta > 0 ? '+' : ''}${delta}, ` +
            `${direction(outcome, delta)})`,
        );
      }
    }
  }

  const nearMissKeys = new Set([
    ...Object.keys(current.nearMiss),
    ...Object.keys(baseline.nearMiss),
  ]);
  for (const key of [...nearMissKeys].sort()) {
    const a = current.nearMiss[key] ?? 0;
    const b = baseline.nearMiss[key] ?? 0;
    if (a === b) continue;
    const delta = a - b;
    // Keys are `<arm>/<bucket>`; only the bucket decides which way is worse.
    const bucket = key.slice(key.indexOf('/') + 1);
    failures.push(
      `nearMiss/${key}: ${b} -> ${a} (${delta > 0 ? '+' : ''}${delta}, ${direction(bucket, delta)})`,
    );
  }

  return failures;
}

/** Classes where `wrong` is non-zero. Absolute — never ratcheted, never waived. */
export function wrongByClass(snapshot: Baseline): string[] {
  const out: string[] = [];
  for (const arm of ['unanswered', 'answered'] as const) {
    for (const [mutationId, counts] of Object.entries(snapshot[arm])) {
      if (counts.wrong) out.push(`${arm}/${mutationId}: ${counts.wrong}`);
    }
  }
  return out;
}
