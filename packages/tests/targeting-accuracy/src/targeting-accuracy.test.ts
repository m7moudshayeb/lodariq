// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runCorpus } from './corpus';
import { runBoundaryProbes } from './boundary-probe';
import { formatReport } from './report';
import { isHardWrong, summarize } from './scorer';
import { HOST_PAGES } from './host-pages';
import { ratchetFailures, snapshotOf, wrongByClass, type Baseline } from './ratchet';

/**
 * Measurement first, gate second.
 *
 * The only assertions here are the two hard invariants — `wrong === 0` in both
 * arms, and the pristine gate. Thresholds on the contract rate wait for the
 * ratchet in Step 7; asserting them now would freeze a guess.
 *
 * Near-miss and tie-fragility are printed and ratcheted, not asserted against a
 * threshold. Both are orthogonal to the contracts: a trial can meet its contract
 * perfectly while the wrong element led the ranking, and picking a ceiling for
 * either today would freeze a guess. The ratchet catches movement instead.
 */

const corpus = runCorpus();
// Run after the corpus: the probes rebuild document.body, and a probe leaking
// into a scored trial would be far harder to notice than an ordering rule.
const boundaryProbes = runBoundaryProbes();

describe('targeting accuracy corpus', () => {
  it('produces the expected outcome on every unmodified page', () => {
    // If this fails the harness is measuring nothing: either capture never
    // described the element, or the contract itself is miscoded.
    const pristine = corpus.unanswered.filter((trial) => trial.mutationId === 'pristine');
    expect(pristine).toHaveLength(HOST_PAGES.length);
    const failures = pristine
      .filter((trial) => !trial.met)
      .map(
        (trial) =>
          `${trial.pageId}: got ${trial.outcome}, expected ${trial.expectedOutcome} ` +
          `(${trial.state}/${trial.reasonCode})`,
      );
    expect(failures).toEqual([]);
  });

  it('honours a declared selection policy on every unmodified page', () => {
    const pristine = corpus.answered.filter((trial) => trial.mutationId === 'pristine');
    const failures = pristine
      .filter((trial) => trial.intentOutcome === 'wrong')
      .map((trial) => `${trial.pageId} [${trial.policyId}]: ${trial.resolvedDescription ?? '?'}`);
    expect(failures).toEqual([]);
  });

  it('never resolves confidently onto a different element', () => {
    console.log(formatReport(corpus, boundaryProbes));
    const summary = summarize(corpus.all);
    const wrong = corpus.all
      .filter(isHardWrong)
      .map(
        (trial) =>
          `${trial.arm}/${trial.pageId}/${trial.mutationId}: expected ` +
          `${trial.expectedDescription ?? '?'} but hit ${trial.resolvedDescription ?? '?'}`,
      );
    expect(wrong).toEqual([]);
    expect(summary.wrong).toBe(0);
  });

  it('matches the committed baseline, class by class', () => {
    const snapshot = snapshotOf(corpus);
    // Regenerating is a human decision, so it is an explicit opt-in and the run
    // still fails afterwards — somebody has to read the diff before it lands.
    if (process.env.UPDATE_TARGETING_BASELINE) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
      throw new Error(
        `Rewrote ${BASELINE_PATH}. Read the diff, keep the classes you meant to move, ` +
          'and re-run without UPDATE_TARGETING_BASELINE.',
      );
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    const failures = ratchetFailures(snapshot, baseline);
    // Improvements fail as loudly as regressions. A number that moved is a diff
    // somebody should accept on purpose; silent drift is how a corpus stops
    // measuring the thing it was built to measure.
    expect(failures, ratchetMessage(failures)).toEqual([]);
  });

  it('carries no wrong in any single class of either arm', () => {
    // The same absolute as above, stated per class so a failure names the class
    // rather than a corpus-wide total.
    expect(wrongByClass(snapshotOf(corpus))).toEqual([]);
  });

  it('never violates a policy it was given', () => {
    // Distinct from `wrong` above: this catches a resolver that honoured *a*
    // rule, just not the one the author declared.
    const violations = corpus.answered
      .filter((trial) => trial.intentOutcome === 'wrong')
      .map(
        (trial) =>
          `${trial.pageId}/${trial.mutationId} [${trial.policyId}]: ` +
          `hit ${trial.resolvedDescription ?? '?'}`,
      );
    expect(violations).toEqual([]);
  });
});

/**
 * `import.meta.url` is not a file URL under the jsdom transform, so the snapshot
 * is found by walking up from wherever the runner was started.
 */
function baselinePath(): string {
  let dir = process.cwd();
  for (let hops = 0; hops < 6; hops += 1) {
    for (const suffix of ['targeting-accuracy', 'packages/tests/targeting-accuracy']) {
      const candidate = join(dir, suffix, 'baseline.json');
      if (existsSync(dirname(candidate))) return candidate;
    }
    dir = dirname(dir);
  }
  throw new Error('cannot locate the targeting-accuracy baseline directory');
}

const BASELINE_PATH = baselinePath();

function ratchetMessage(failures: readonly string[]): string {
  if (failures.length === 0) return '';
  return [
    `${failures.length} class-level difference(s) against the committed baseline:`,
    ...failures.map((line) => `  ${line}`),
    'Regenerate deliberately with UPDATE_TARGETING_BASELINE=1 and commit the diff.',
  ].join('\n');
}
