import { captureTargetEvidence } from '@lodariq/sdk-authoring/bridge';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { HOST_PAGES, POLICY_PROBE_PAGES, type HostPage } from './host-pages';
import { MUTATIONS, type Mutation } from './mutations';
import { COMPOUND_MUTATIONS } from './compound-mutations';
import { applySyntheticLayout, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './layout';
import { POLICY_CASES } from './selection-policies';
import { expectedOutcomeFor, meetsExpectation, type Arm, type PolicyCase } from './arms';
import {
  classify,
  describeElement,
  tieGapOf,
  TIE_EPSILON,
  type IntentOutcome,
  type Trial,
} from './scorer';
import {
  detectNearMiss,
  startRankingProbe,
  stopRankingProbe,
  takeLastRanking,
} from './near-miss';

/**
 * Runs the HOST_PAGES x MUTATIONS matrix, twice over.
 *
 * The order inside a trial is the whole point: capture happens on the *pristine*
 * page, exactly as an author would, and only then does the customer's redesign
 * land. Capturing after the mutation would measure nothing.
 *
 * Arm A passes no selection policy and Arm B passes one. They answer different
 * questions and their totals are never added together.
 */

/**
 * Every mutation class the corpus runs: the atomic classes first, then the
 * named compound sample. One list so the report, the tallies and the ratchet
 * cannot disagree about what was measured.
 */
export const ALL_MUTATIONS: readonly Mutation[] = [...MUTATIONS, ...COMPOUND_MUTATIONS];

function resetDocument(): void {
  document.body.innerHTML = '';
  // The i18n mutation leaves lang='de' behind, and the resolver reads it.
  document.documentElement.lang = 'en';
  // The RTL mutation mirrors the whole document, and it would otherwise leak
  // into every trial that ran after it.
  document.documentElement.removeAttribute('dir');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEWPORT_WIDTH });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
}

/**
 * Arm B's verdict.
 *
 * `intent-violated` is not a softer `wrong`: it says the resolver obeyed the
 * rule it was given and the page moved underneath it. Only a landing its own
 * rule forbids counts as `wrong`.
 */
function classifyIntent(
  resolved: Element | null,
  groundTruth: Element,
  container: HTMLElement,
  policyCase: PolicyCase,
  capturedName: string,
): IntentOutcome {
  if (!resolved) return 'abstained';
  if (resolved === groundTruth) return 'honoured';
  return policyCase.satisfies(resolved, groundTruth, container, capturedName)
    ? 'intent-violated'
    : 'wrong';
}

/** What the control read when the author answered — read before the mutation. */
function accessibleNameNow(element: Element): string {
  return (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
}

function runTrial(
  arm: Arm,
  page: HostPage,
  mutation: Mutation,
  policyCase: PolicyCase | null,
): Trial | null {
  resetDocument();
  const container = document.createElement('div');
  document.body.appendChild(container);

  const groundTruth = page.build(container);
  applySyntheticLayout(document.body);
  const capturedName = accessibleNameNow(groundTruth);

  const capture = captureTargetEvidence(
    groundTruth,
    undefined,
    page.captureAction ? { requiredAction: page.captureAction } : {},
  );

  const nextTruth = mutation.apply(container, groundTruth);
  // `null` means the mutation is meaningless on this page; skipping beats
  // scoring a trial whose ground truth we cannot name.
  if (!nextTruth) return null;
  // Re-measure: a structural change a real browser would reflow must reflow
  // here too, or the resolver keeps visual evidence it no longer deserves.
  applySyntheticLayout(document.body);

  const result = resolveTarget(
    {
      id: capture.identity.targetId,
      fingerprint: capture.fingerprint,
      identity: capture.identity,
      ...(policyCase ? { selection: policyCase.policy } : {}),
    },
    document,
  );

  // Read before anything else touches the probe; one ranking per resolution.
  const ranking = takeLastRanking();

  const outcome = classify(result, nextTruth);
  const expectedOutcome = expectedOutcomeFor(page, mutation);
  const tieGap = tieGapOf(result);
  const intentOutcome = policyCase
    ? classifyIntent(result.element, nextTruth, container, policyCase, capturedName)
    : null;

  return {
    arm,
    pageId: page.id,
    mutationId: mutation.id,
    policyId: policyCase ? policyCase.id : null,
    expectation: mutation.expectation,
    outcome,
    expectedOutcome,
    // Arm B is judged on intent, not on landing where Arm A would have.
    met: policyCase ? intentOutcome !== 'wrong' : meetsExpectation(outcome, expectedOutcome),
    intentOutcome,
    state: result.state,
    reasonCode: result.reasonCode,
    confidence: result.confidence,
    candidateCount: result.candidateCount,
    evidenceFamilies: result.evidenceFamilies,
    expectedDescription: describeElement(nextTruth),
    resolvedDescription: describeElement(result.element),
    tieGap,
    tieFragile: tieGap !== null && tieGap < TIE_EPSILON,
    nearMiss: ranking
      ? detectNearMiss(result, ranking, nextTruth, describeElement)
      : 'unmeasured',
  };
}

/** Arm A — the author never answered the disambiguation question. */
function runUnansweredArm(): Trial[] {
  const trials: Trial[] = [];
  for (const page of HOST_PAGES) {
    for (const mutation of ALL_MUTATIONS) {
      const trial = runTrial('unanswered', page, mutation, null);
      if (trial) trials.push(trial);
    }
  }
  return trials;
}

/** Arm B — the author declared a selection policy, so intent is what is scored. */
function runAnsweredArm(): Trial[] {
  const pages = [...HOST_PAGES, ...POLICY_PROBE_PAGES];
  const trials: Trial[] = [];
  for (const policyCase of POLICY_CASES) {
    const page = pages.find((entry) => entry.id === policyCase.pageId);
    if (!page) throw new Error(`policy case ${policyCase.id} names unknown page ${policyCase.pageId}`);
    for (const mutation of ALL_MUTATIONS) {
      const trial = runTrial('answered', page, mutation, policyCase);
      if (trial) trials.push(trial);
    }
  }
  return trials;
}

export interface Corpus {
  unanswered: Trial[];
  answered: Trial[];
  all: Trial[];
}

export function runCorpus(): Corpus {
  startRankingProbe();
  try {
    const unanswered = runUnansweredArm();
    const answered = runAnsweredArm();
    return { unanswered, answered, all: [...unanswered, ...answered] };
  } finally {
    stopRankingProbe();
  }
}
