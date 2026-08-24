import { accessibleNameOf, ancestorLandmarksOf } from '@lodariq/schema/dom';
import {
  TARGET_CONTEXT_GROUP_ROLES,
  TARGET_IDENTITY_SCORE_BY_FAMILY,
  TARGET_LOCALIZED_TEXT_MAX_LENGTH,
  TARGET_MIN_RESOLUTION_RUNNER_UP_RATIO,
  TARGET_STABLE_SIGNAL_MULTIPLIER,
  TARGET_UNCONFIRMED_SIGNAL_MULTIPLIER,
  ancestorContextSimilarity,
  hasTargetIdentityV2Envelope,
} from '@lodariq/schema/target-runtime';
import type {
  ElementFingerprint,
  Target,
  TargetIdentityV2,
  TargetLocalizedEvidence,
  TargetRelationship,
  TargetSelectionPolicy,
  TargetSignalFamily,
} from '@lodariq/schema/target';
import { selectionSettlesAmbiguity } from '@lodariq/schema/target';
import { currentPageKey, pageKeyMatches } from '@lodariq/schema/page-key';
import {
  MAX_RUNNER_UP_MARGIN,
  MIN_CAPTURE_RUNNER_UP_MARGIN,
  MIN_IDENTITY_CONFIDENCE,
  MIN_INDEPENDENT_IDENTITY_FAMILIES,
  MIN_INDEPENDENT_VISUAL_FAMILIES,
  MIN_LEGACY_CONFIDENCE,
  MIN_LEGACY_RUNNER_UP_MARGIN,
  MIN_RUNNER_UP_MARGIN,
  MIN_VISUAL_ANCHOR_CONFIDENCE,
  RESOLUTION_METHOD_BY_FAMILY,
  type EvidenceMatch,
  type LegacyResolutionResult,
  type ResolutionResult,
  type ScoredCandidate,
  type TargetResolutionContext,
} from './types';
import { visualEvidenceFor } from './capture';
import { applySelectionPolicy } from './selection';
import {
  ancestorRolesOf,
  belongsToRoot,
  collectElements,
  collectLegacyElements,
  createResolutionPass,
  controlGroupMatches,
  currentLocale,
  exactAttributesMatch,
  inputTypeOf,
  isEnabled,
  isLodariqOwnedElement,
  isVisible,
  localeForElement,
  localizedEvidenceFor,
  localizedLabelOf,
  localizedTextContradicts,
  localizedTextMatches,
  localizedNameAgreement,
  matchesElementKind,
  matchesRequiredAction,
  parentElementAcrossOpenShadow,
  semanticRoleOf,
  stableKeyMatches,
  type ResolutionPass,
} from './element-evidence';
import { viewportClassOf, visualTopologyMatches } from './visual-topology';

export * from './types';
export {
  localizedEvidenceFor,
  localizedLabelOf,
  localizedNameAgreement,
  localizedTextMatches,
  matchesRequiredAction,
} from './element-evidence';

/** Legacy names retained for consumers of immutable Phase 1 artifacts. */
export const MIN_CONFIDENCE = MIN_LEGACY_CONFIDENCE;
export const AMBIGUITY_MARGIN = MIN_LEGACY_RUNNER_UP_MARGIN;

const CONTEXT_GROUP_ROLES = new Set<string>(TARGET_CONTEXT_GROUP_ROLES);
const MAX_VISUAL_RANKING_CANDIDATES = 24;
const MAX_VISUAL_FINGERPRINT_CANDIDATES = 64;
const MAX_VISUAL_SCORE_SWING = 14;

const NON_DURABLE_IDENTITY_FAMILIES = new Set<TargetSignalFamily>([
  'localized-text',
  'visual-topology',
  'visual-structure',
  'visual-appearance',
  'visual-neighborhood',
  'layout-slot',
]);

/**
 * Durable enough to settle a tie, not independent enough to be an identity.
 *
 * `sibling-position` survives a re-render the way `ancestor-context` does — it is
 * not a hash of how the page happened to look — so it belongs in the durable
 * score, where separating two identical controls is the whole of its job. It is
 * kept out of the independent-family count so that "a button in the second of
 * three slots" can never become an identity on its own, and out of the drift
 * check so that a row gaining a fourth button cannot break a target the rest of
 * the evidence still identifies without it.
 */
const SUPPORTING_DURABLE_FAMILIES = new Set<TargetSignalFamily>(['sibling-position']);

const VISUAL_ANCHOR_FAMILIES = new Set<TargetSignalFamily>([
  'visual-topology',
  'visual-structure',
  'visual-appearance',
  'visual-neighborhood',
  'layout-slot',
]);

/**
 * One resolution's cost and shape (T10).
 *
 * Nothing in the resolver was measured before this, so every threshold in the
 * system was a guess. Reported through an observer rather than the result so the
 * artifact schema stays untouched and a host that does not care pays nothing.
 */
export interface ResolutionTelemetry {
  /** Which pool the winner came out of. `full-scan` means the index was empty. */
  readonly path: 'indexed' | 'full-scan';
  readonly registryOffered: boolean;
  readonly corpusSize: number;
  readonly poolSize: number;
  readonly corpusMs: number;
  readonly poolMs: number;
  readonly gateMs: number;
  readonly totalMs: number;
  readonly state: ResolutionResult['state'];
}

let telemetryObserver: ((sample: ResolutionTelemetry) => void) | null = null;

/** Subscribe to per-resolution timings. Pass `null` to stop. */
export function setResolutionTelemetryObserver(
  observer: ((sample: ResolutionTelemetry) => void) | null,
): void {
  telemetryObserver = observer;
}

/** Zero when the host has no observer, so an unmeasured page pays no clock reads. */
function nowMs(): number {
  return telemetryObserver ? (globalThis.performance?.now?.() ?? 0) : 0;
}

/** One candidate as the ranking saw it, reduced to what the sort turns on. */
export interface ResolutionRankedCandidate {
  /** Live node, valid only for the duration of the call. Must not be retained. */
  readonly element: Element;
  readonly durableScore: number;
  readonly durableFamilyCount: number;
  readonly families: readonly TargetSignalFamily[];
}

/**
 * The candidate ranking behind one resolution, in the resolver's own sort order.
 *
 * Deliberately not part of `ResolutionTelemetry`, and deliberately never
 * serialised. Telemetry is numbers and enum strings — safe to send anywhere.
 * This names *which* elements lost, and a candidate inside a customer's table row
 * can be a person. Handing live nodes keeps that where it belongs: a node cannot
 * leave the page, a description of one can. So the sample is synchronous, valid
 * for the call only, and must not be retained, stored, or transmitted.
 *
 * Why publish it at all: a resolution that abstains returns `element: null`, so
 * from outside there is no way to tell "nothing matched" from "the wrong element
 * won and one veto stopped it". The second predicts future wrong clicks, and it
 * is also what drift repair has to show an author — which control now outscores
 * the one they picked.
 */
export interface ResolutionRankingSample {
  readonly candidates: readonly ResolutionRankedCandidate[];
}

let rankingObserver: ((sample: ResolutionRankingSample) => void) | null = null;

/**
 * Subscribe to per-resolution candidate rankings. Pass `null` to stop.
 *
 * Off until someone asks. Unsubscribed, the optional call short-circuits before
 * its argument exists, so a page nobody is measuring pays one null check.
 */
export function setResolutionRankingObserver(
  observer: ((sample: ResolutionRankingSample) => void) | null,
): void {
  rankingObserver = observer;
}

interface CandidateGateCounters {
  notVisible: number;
  notActionable: number;
  semanticMismatch: number;
}

interface IdentityScoringContext {
  allElements: readonly Element[];
  headingElements: readonly Element[];
  root: ParentNode;
  resolutionContext: TargetResolutionContext;
  registryTarget: Element | null;
}

type RelationshipMatcher = (
  candidate: Element,
  expected: TargetRelationship,
  scoringContext: IdentityScoringContext,
) => boolean;

const RELATIONSHIP_MATCHERS: Readonly<Record<TargetRelationship['kind'], RelationshipMatcher>> = {
  inside: (candidate, expected, context) => {
    let current = parentElementAcrossOpenShadow(candidate);
    while (current) {
      if (relationshipReferenceMatches(current, expected, context)) return true;
      current = parentElementAcrossOpenShadow(current);
    }
    return false;
  },
  'labelled-by': (candidate, expected, context) =>
    labelledElementsOf(candidate).some((element) =>
      relationshipReferenceMatches(element, expected, context),
    ),
  'near-heading': (candidate, expected, context) => {
    const container = nearestContextContainer(candidate);
    return context.headingElements.some((element) => {
      if (container && !container.contains(element)) return false;
      return relationshipReferenceMatches(element, expected, context);
    });
  },
  'same-group': (candidate, expected, context) => {
    let current = parentElementAcrossOpenShadow(candidate);
    while (current) {
      const role = semanticRoleOf(current);
      const isGroup = CONTEXT_GROUP_ROLES.has(role ?? '');
      if (isGroup && relationshipReferenceMatches(current, expected, context)) return true;
      current = parentElementAcrossOpenShadow(current);
    }
    return false;
  },
};

/**
 * Score one immutable Phase 1 fingerprint without double-counting correlated
 * text. CSS remains a small legacy ranking hint and can never clear the floor.
 */
export function scoreCandidate(
  fingerprint: ElementFingerprint,
  element: Element,
): { score: number; method: string } {
  const evidence = legacyEvidenceOf(fingerprint, element);
  const selectorBonus =
    fingerprint.scopedCss && safeMatches(element, fingerprint.scopedCss) ? 5 : 0;
  const topEvidence = strongestEvidence(evidence);
  return {
    score: evidence.reduce((total, match) => total + match.score, selectorBonus),
    method: legacyResolutionMethod(fingerprint, element, topEvidence, evidence),
  };
}

/**
 * Compatibility resolver for immutable Phase 1 fingerprints. New artifacts
 * should call resolveTargetIdentity or resolveTarget.
 */
export function resolve(
  fingerprint: ElementFingerprint,
  root: ParentNode = document,
): LegacyResolutionResult {
  const locale = currentLocale(root);
  const candidates: ScoredCandidate[] = [];

  for (const element of collectLegacyElements(root)) {
    if (!legacyHardGatesPass(fingerprint, element)) continue;
    const evidence = legacyEvidenceOf(fingerprint, element);
    const selectorBonus =
      fingerprint.scopedCss && safeMatches(element, fingerprint.scopedCss) ? 5 : 0;
    const score = evidence.reduce((total, match) => total + match.score, selectorBonus);
    if (score <= 0) continue;
    const strongest = strongestEvidence(evidence);
    candidates.push({
      element,
      score,
      method: legacyResolutionMethod(fingerprint, element, strongest, evidence),
      evidence,
      locale,
    });
  }

  sortCandidates(candidates);
  const [top, second] = candidates;
  const common = resultDiagnostics(top, second, candidates.length, locale);

  if (!top || top.score < MIN_LEGACY_CONFIDENCE || !legacyHasEnoughEvidence(top)) {
    return {
      state: 'missing',
      element: null,
      anchor: null,
      ...common,
      reasonCode: top ? 'low_confidence' : 'no_candidates',
    };
  }

  if (second && top.score - second.score < requiredRunnerUpMargin(top.score, AMBIGUITY_MARGIN)) {
    return {
      state: 'ambiguous',
      element: null,
      anchor: null,
      ...common,
      reasonCode: top.score === second.score ? 'multiple_candidates' : 'insufficient_margin',
    };
  }

  return {
    state: 'found',
    element: top.element,
    anchor: elementAnchor(top.element),
    ...common,
    reasonCode: 'resolved',
  };
}

/** Resolve a V2 identity afresh against the current live page. */
export function resolveTargetIdentity(
  identity: TargetIdentityV2,
  root: ParentNode = document,
  context: TargetResolutionContext = {},
  /** Author's answer to the disambiguation question; applied only on a tie. */
  selection?: TargetSelectionPolicy,
): ResolutionResult {
  const fallbackLocale = currentLocale(root, context.locale);
  if (!identityIsUsable(identity)) {
    return emptyResult('needs_review', 'identity_invalid', fallbackLocale);
  }
  if (!resolutionModeIsValid(identity, context)) {
    return emptyResult('needs_review', 'identity_invalid', fallbackLocale);
  }

  const contextFailure = validateResolutionContext(identity, context, fallbackLocale);
  if (contextFailure) return contextFailure;

  const startedAt = nowMs();
  const collection = collectElements(root);
  if (collection.truncated) {
    return emptyResult('needs_review', 'scan_limit_exceeded', fallbackLocale);
  }
  const allElements = collection.elements.filter((element) => !isLodariqOwnedElement(element));
  const corpusMs = nowMs() - startedAt;
  const resolvedRegistryTarget = resolveRegistryTarget(identity, root, context);
  const registryTarget =
    resolvedRegistryTarget && !isLodariqOwnedElement(resolvedRegistryTarget)
      ? resolvedRegistryTarget
      : null;
  if (registryTarget && !allElements.includes(registryTarget)) allElements.push(registryTarget);

  const scoringContext: IdentityScoringContext = {
    allElements,
    headingElements: allElements.filter((element) => semanticRoleOf(element) === 'heading'),
    root,
    resolutionContext: context,
    registryTarget,
  };
  const counters: CandidateGateCounters = {
    notVisible: 0,
    notActionable: 0,
    semanticMismatch: 0,
  };
  const candidates: ScoredCandidate[] = [];

  const poolStartedAt = nowMs();
  const pool = candidatePool(identity, allElements, registryTarget);
  const poolMs = nowMs() - poolStartedAt;
  const pass = createResolutionPass();

  const gateStartedAt = nowMs();
  for (const element of pool.elements) {
    const relevant = isPotentialIdentityCandidate(identity, element, registryTarget);
    if (!isVisible(element, pass)) {
      if (relevant) counters.notVisible += 1;
      continue;
    }
    if (!identitySemanticGatesPass(identity, element)) {
      if (relevant) counters.semanticMismatch += 1;
      continue;
    }
    if (!requiredActionsPass(element, identity, context, pass)) {
      if (relevant) counters.notActionable += 1;
      continue;
    }

    const candidate = scoreIdentityCandidate(identity, element, scoringContext, false);
    if (
      candidate.score > 0 ||
      identity.visualTopologies?.length ||
      identity.visualFingerprints?.length
    ) {
      candidates.push(candidate);
    }
  }
  const gateMs = nowMs() - gateStartedAt;

  const finish = (result: ResolutionResult): ResolutionResult => {
    // A misbehaving observer must not fail the resolution it is measuring.
    try {
      telemetryObserver?.({
        path: pool.indexed ? 'indexed' : 'full-scan',
        registryOffered: Boolean(registryTarget),
        corpusSize: allElements.length,
        poolSize: pool.elements.length,
        corpusMs,
        poolMs,
        gateMs,
        totalMs: nowMs() - startedAt,
        state: result.state,
      });
    } catch {
      /* telemetry is never load-bearing */
    }
    // Unconditional, `found` included: a resolution that landed on the wrong
    // element is exactly the one worth catching, and gating on failure would
    // hide it.
    try {
      rankingObserver?.({
        candidates: candidates.map((candidate) => ({
          element: candidate.element,
          durableScore: durableScore(candidate),
          durableFamilyCount: durableFamilyCount(candidate),
          families: candidate.evidence.map((entry) => entry.family),
        })),
      });
    } catch {
      /* measurement is never load-bearing */
    }
    return result;
  };

  if (isVisualResolution(identity)) {
    const visualCandidates = hydrateVisualAnchorCandidates(identity, candidates, scoringContext);
    if (!visualCandidates) {
      return emptyResult('needs_review', 'scan_limit_exceeded', fallbackLocale);
    }
    candidates.splice(0, candidates.length, ...visualCandidates);
  } else {
    addVisualRankingEvidence(identity, candidates, scoringContext);
  }
  sortIdentityCandidates(candidates, isVisualResolution(identity));
  const [top, second] = candidates;
  const winningLocale = top?.locale ?? fallbackLocale;
  const common = resultDiagnostics(
    top,
    second,
    candidates.length,
    winningLocale,
    !isVisualResolution(identity),
  );

  if (!top) {
    return finish({
      state: 'missing',
      element: null,
      anchor: null,
      ...common,
      reasonCode: missingReasonCode(counters),
    });
  }

  if (isVisualResolution(identity)) {
    return finish(resolveVisualAnchorResult(identity, top, second, common));
  }

  const topDurableFamilyCount = durableFamilyCount(top);
  const localeWasRequiredButUnavailable =
    identity.localizedEvidence.length > 0 &&
    localizedEvidenceFor(identity.localizedEvidence, top.locale) === null;

  const topDurableScore = durableScore(top);
  if (
    topDurableScore < MIN_IDENTITY_CONFIDENCE ||
    topDurableFamilyCount < MIN_INDEPENDENT_IDENTITY_FAMILIES
  ) {
    return finish({
      state: 'needs_review',
      element: null,
      anchor: null,
      ...common,
      reasonCode: localeWasRequiredButUnavailable ? 'locale_unverified' : 'low_confidence',
    });
  }

  /*
   * The control we recorded cannot take this step's action any more, and what is
   * left is standing unopposed.
   *
   * A removed target and a disabled one are the same page to the resolver: a
   * candidate that plausibly matched has been taken out of the running, and
   * whoever is still standing wins by walkover rather than by evidence. Where a
   * rival survives there is something to check the winner against; where none
   * does, "the only one left" is not a reason to click it.
   *
   * Unless the winner carries evidence a neighbour could not have carried. A
   * testid or a registry key is issued to one element, so matching it is a claim
   * about identity rather than about kind — that is the wizard case, where the
   * filter correctly drops a disabled look-alike and the instrumented target is
   * still the target. Every other family a sibling can also satisfy.
   */
  if (
    counters.notActionable > 0 &&
    !carriesUnsharableEvidence(top) &&
    durableRivals(top, candidates).length === 0
  ) {
    return finish({
      state: 'needs_review',
      element: null,
      anchor: null,
      ...common,
      reasonCode: 'not_actionable',
    });
  }

  // An author who already answered "which one" keeps their answer: a name that
  // happens to separate the tie must not quietly overrule a declared position.
  const nameSettlesTie =
    !selectionSettlesAmbiguity(selection) &&
    localizedTextSafelyBreaksDurableTie(identity, top, candidates);
  if (
    second &&
    topDurableScore - durableScore(second) < requiredRunnerUpMargin(topDurableScore) &&
    !nameSettlesTie
  ) {
    // Evidence cannot separate these. An author who already answered the
    // disambiguation question gets their answer applied; everyone else keeps
    // the honest ambiguous result.
    const margin = requiredRunnerUpMargin(topDurableScore);
    const tied = candidates.filter(
      (candidate) => topDurableScore - durableScore(candidate) < margin,
    );
    const selected = applySelectionPolicy(selection, tied, identity.captureEvidence);
    if (selected) {
      return finish({
        ...common,
        state: 'found',
        element: selected.element,
        anchor: elementAnchor(selected.element),
        resolutionMethod: selected.method,
        candidateCount: tied.length,
        reasonCode: 'resolved',
      });
    }
    return finish({
      state: 'ambiguous',
      element: null,
      anchor: null,
      ...common,
      // `any-matching` checks words, so an uncaptured locale fails it closed.
      // Say which it was: "they look alike" and "this page is in a language the
      // target has never seen" have different fixes.
      reasonCode: localeWasRequiredButUnavailable
        ? 'locale_unverified'
        : topDurableScore === durableScore(second)
          ? 'multiple_candidates'
          : 'insufficient_margin',
    });
  }

  const captureIssue = captureEvidenceIssue(identity, selection, nameSettlesTie);
  if (captureIssue) {
    return finish({
      state: captureIssue.state,
      element: null,
      anchor: null,
      ...common,
      reasonCode: captureIssue.reasonCode,
    });
  }

  const contradiction = evidenceContradiction(identity, top, candidates);
  if (stableEvidenceHasDrift(identity, top) || contradiction === 'wrong-element') {
    return finish({
      state: 'needs_review',
      element: null,
      anchor: null,
      ...common,
      reasonCode: 'evidence_drift',
    });
  }
  const drifted =
    contradiction === 'changed-copy' || visualEvidenceHasDrift(identity, top, root, context);
  const learned = drifted ? undefined : unrecordedLocalizedEvidence(identity, top);
  return finish({
    state: 'found',
    element: top.element,
    anchor: elementAnchor(top.element),
    ...common,
    ...(learned ? { learnedLocalizedEvidence: learned } : {}),
    reasonCode: drifted ? 'resolved_with_drift' : 'resolved',
  });
}

/**
 * The winner's copy, when the target has none for this language. Offered only
 * on a spotless win: a shaky one would teach the wrong word permanently.
 */
function unrecordedLocalizedEvidence(
  identity: TargetIdentityV2,
  top: ScoredCandidate,
): TargetLocalizedEvidence | undefined {
  if (!top.locale) return undefined;
  if (localizedEvidenceFor(identity.localizedEvidence, top.locale)) return undefined;
  const accessibleName = localizedLabelOf(top.element)?.slice(0, TARGET_LOCALIZED_TEXT_MAX_LENGTH);
  return accessibleName ? { locale: top.locale, accessibleName } : undefined;
}

/**
 * The words settle what the durable evidence cannot, once the winner has
 * already cleared the durable quorum on its own: this never rescues a weak
 * identity, it only separates equals.
 *
 * Strict about the winner, generous about doubt. The winner must carry the
 * recorded name whole; a rival that merely resembles it is enough to abstain.
 * Copy that changed therefore fails closed, back to the honest tie.
 */
function localizedTextSafelyBreaksDurableTie(
  identity: TargetIdentityV2,
  top: ScoredCandidate,
  candidates: readonly ScoredCandidate[],
): boolean {
  const expected = localizedEvidenceFor(identity.localizedEvidence, top.locale);
  if (!expected || !hasPrimaryLocalizedEvidence(expected)) return false;
  if (localizedNameAgreement(top.element, expected) !== 'exact') return false;

  const topDurableScore = durableScore(top);
  const requiredMargin = requiredRunnerUpMargin(topDurableScore);
  const durableNearTies = candidates.filter(
    (candidate) => candidate !== top && topDurableScore - durableScore(candidate) < requiredMargin,
  );
  if (durableNearTies.length === 0) return false;
  return !durableNearTies.some(
    (candidate) =>
      localizedNameAgreement(candidate.element, expected) !== null ||
      localizedTextMatches(candidate.element, expected),
  );
}

function candidateHasEvidence(candidate: ScoredCandidate, family: TargetSignalFamily): boolean {
  return candidate.evidence.some((entry) => entry.family === family);
}

function hasPrimaryLocalizedEvidence(
  evidence: TargetIdentityV2['localizedEvidence'][number],
): boolean {
  return Boolean(
    evidence.accessibleName || evidence.label || evidence.placeholder || evidence.title,
  );
}

/** Prefer V2 identity when present; malformed V2 data never falls back silently. */
export function resolveTarget(
  target: Pick<Target, 'id' | 'fingerprint' | 'identity' | 'selection'>,
  root: ParentNode = document,
  context: TargetResolutionContext = {},
): ResolutionResult {
  if (!target.identity) {
    const legacy = resolve(target.fingerprint, root);
    if (
      legacy.element &&
      context.requiredAction &&
      !matchesRequiredAction(legacy.element, context.requiredAction)
    ) {
      return {
        ...legacy,
        state: 'missing',
        element: null,
        anchor: null,
        reasonCode: 'not_actionable',
      };
    }
    return legacy;
  }
  if (target.identity.targetId !== target.id) {
    return emptyResult('needs_review', 'identity_invalid', currentLocale(root, context.locale));
  }
  return resolveTargetIdentity(target.identity, root, context, target.selection);
}

function scoreIdentityCandidate(
  identity: TargetIdentityV2,
  element: Element,
  context: IdentityScoringContext,
  includeVisualEvidence: boolean,
): ScoredCandidate {
  const evidence: EvidenceMatch[] = [];
  const stableFamilies = new Set(identity.captureEvidence.stableSignalFamilies);
  const addEvidence = (family: TargetSignalFamily, similarity = 1): void => {
    const base = TARGET_IDENTITY_SCORE_BY_FAMILY[family];
    const multiplier = stableFamilies.has(family)
      ? TARGET_STABLE_SIGNAL_MULTIPLIER
      : TARGET_UNCONFIRMED_SIGNAL_MULTIPLIER;
    const score = base * multiplier * similarity;
    evidence.push({ family, score, method: RESOLUTION_METHOD_BY_FAMILY[family] });
  };

  if (context.registryTarget === element) addEvidence('registry-contract');
  if (exactAttributesMatch(element, identity.invariants.configuredAttributes)) {
    addEvidence('configured-attribute');
  }
  if (exactAttributesMatch(element, identity.invariants.semanticAttributes)) {
    addEvidence('semantic-attribute');
  }
  if (identitySemanticsMatch(identity, element)) addEvidence('element-semantics');
  const ancestorAgreement = ancestorContextAgreement(identity, element);
  if (ancestorAgreement > 0) addEvidence('ancestor-context', ancestorAgreement);
  if (relationshipContextMatches(identity, element, context)) {
    addEvidence('relationship-context');
  }
  if (
    includeVisualEvidence &&
    visualTopologyMatches(
      identity.visualTopologies,
      element,
      context.allElements,
      context.root,
      context.resolutionContext,
    )
  ) {
    addEvidence('visual-topology');
  }
  if (includeVisualEvidence && identity.visualFingerprints?.length) {
    for (const match of visualEvidenceFor(identity, element, context.resolutionContext.stateId)) {
      addEvidence(match.family, match.similarity);
    }
  }

  const locale = localeForElement(element, context.resolutionContext.locale);
  const localizedEvidence = localizedEvidenceFor(identity.localizedEvidence, locale);
  if (localizedEvidence && localizedTextMatches(element, localizedEvidence)) {
    addEvidence('localized-text');
  }

  const strongest = strongestEvidence(evidence);
  return {
    element,
    score: Math.round(evidence.reduce((total, match) => total + match.score, 0)),
    method: strongest?.method ?? 'none',
    evidence,
    locale,
  };
}

/**
 * Second-pass evidence for a semantic near-tie, and only for a near-tie.
 *
 * Computed style and descendant layout are expensive, so this runs over the
 * handful of candidates the durable evidence already failed to separate. That
 * bound is also what makes `sibling-position` affordable: it is asked for at
 * exactly the moment a tie needs breaking, never across the page.
 */
function addVisualRankingEvidence(
  identity: TargetIdentityV2,
  candidates: ScoredCandidate[],
  context: IdentityScoringContext,
): void {
  if (candidates.length === 0) return;
  const hasRankingEvidence =
    Boolean(identity.visualTopologies?.length) ||
    (Boolean(identity.visualFingerprints?.length) &&
      identity.captureEvidence.stableSignalFamilies.includes('sibling-position'));
  if (!hasRankingEvidence) return;
  sortIdentityCandidates(candidates);
  const topScore = durableScore(candidates[0]!);
  const eligibleIndexes = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => topScore - durableScore(candidate) <= MAX_VISUAL_SCORE_SWING)
    .map(({ index }) => index);

  // If layout would need to break a broad semantic tie, abstain instead of
  // performing layout work for a large candidate set or guessing by geometry.
  if (eligibleIndexes.length > MAX_VISUAL_RANKING_CANDIDATES) return;
  for (const index of eligibleIndexes) {
    const candidate = candidates[index];
    if (!candidate) continue;
    candidates[index] = scoreIdentityCandidate(identity, candidate.element, context, true);
  }
}

/**
 * Run computed-style and descendant-layout hashing only for a bounded set.
 * Normalized topology is the cheap spatial funnel when available; if topology
 * drifted, a small semantic near-tie set may still reach the visual quorum.
 * A broad anonymous pool makes the resolver abstain instead of hashing the
 * entire page or selecting the first DOM node.
 */
function hydrateVisualAnchorCandidates(
  identity: TargetIdentityV2,
  candidates: readonly ScoredCandidate[],
  context: IdentityScoringContext,
): ScoredCandidate[] | null {
  if (candidates.length === 0) return [];
  const topologyCandidates = identity.visualTopologies?.length
    ? candidates.filter((candidate) =>
        visualTopologyMatches(
          identity.visualTopologies,
          candidate.element,
          context.allElements,
          context.root,
          context.resolutionContext,
        ),
      )
    : [];
  if (topologyCandidates.length > MAX_VISUAL_FINGERPRINT_CANDIDATES) return null;

  let shortlisted = topologyCandidates;
  if (shortlisted.length === 0) {
    const ranked = [...candidates].sort((first, second) => second.score - first.score);
    const topScore = ranked[0]?.score ?? 0;
    const semanticNearTie = ranked.filter(
      (candidate) => topScore - candidate.score <= MAX_VISUAL_SCORE_SWING,
    );
    if (semanticNearTie.length > MAX_VISUAL_FINGERPRINT_CANDIDATES) return null;
    shortlisted = semanticNearTie;
  }

  return shortlisted.map((candidate) =>
    scoreIdentityCandidate(identity, candidate.element, context, true),
  );
}

function requiredActionsPass(
  element: Element,
  identity: TargetIdentityV2,
  context: TargetResolutionContext,
  pass?: ResolutionPass,
): boolean {
  const requiredActions = new Set(
    [identity.intent.requiredAction, context.requiredAction].filter(
      (action): action is NonNullable<typeof action> => Boolean(action),
    ),
  );
  return [...requiredActions].every((action) => matchesRequiredAction(element, action, pass));
}

function resolutionModeIsValid(
  identity: TargetIdentityV2,
  context: TargetResolutionContext,
): boolean {
  if (!isVisualResolution(identity)) return true;
  const requiredActions = [identity.intent.requiredAction, context.requiredAction].filter(Boolean);
  return requiredActions.every((action) => action === 'anchor');
}

function isVisualResolution(identity: TargetIdentityV2): boolean {
  return (
    identity.intent.resolutionMode === 'visual-anchor' ||
    identity.intent.resolutionMode === 'layout-slot'
  );
}

function legacyEvidenceOf(fingerprint: ElementFingerprint, element: Element): EvidenceMatch[] {
  const evidence: EvidenceMatch[] = [];
  const stableEntries = Object.entries(fingerprint.stableAttributes ?? {});
  const matchingStableAttributes = stableEntries.filter(
    ([name, value]) => element.getAttribute(name) === value,
  );
  if (matchingStableAttributes.length > 0) {
    const hasLodariqId = matchingStableAttributes.some(([name]) => name === 'data-lodariq-id');
    evidence.push({
      family: 'configured-attribute',
      score: hasLodariqId ? 100 : 90,
      method: hasLodariqId ? 'lodariq_id' : 'stable_attribute',
    });
  }

  const roleMatches =
    !fingerprint.role || semanticRoleOf(element) === fingerprint.role.toLowerCase();
  const tagMatches = element.tagName.toLowerCase() === fingerprint.tagName.toLowerCase();
  const inputTypeMatches =
    !fingerprint.inputType || inputTypeOf(element) === fingerprint.inputType.toLowerCase();
  if (roleMatches && tagMatches && inputTypeMatches) {
    evidence.push({ family: 'element-semantics', score: 45, method: 'element_semantics' });
  }

  const accessibleName = accessibleNameOf(element);
  const roleAndNameMatch = Boolean(
    fingerprint.role &&
    fingerprint.accessibleName &&
    semanticRoleOf(element) === fingerprint.role.toLowerCase() &&
    accessibleName === fingerprint.accessibleName,
  );
  const labelLike =
    fingerprint.label ?? fingerprint.placeholder ?? fingerprint.title ?? fingerprint.alt;
  const labelMatch = Boolean(
    labelLike &&
    (element.getAttribute('placeholder') === labelLike ||
      element.getAttribute('title') === labelLike ||
      element.getAttribute('alt') === labelLike ||
      accessibleName === labelLike),
  );
  const nearbyMatch = Boolean(
    fingerprint.nearbyText?.some((text) =>
      (parentElementAcrossOpenShadow(element)?.textContent ?? '').includes(text),
    ),
  );
  if (roleAndNameMatch || labelMatch || nearbyMatch) {
    const method = roleAndNameMatch ? 'role_and_name' : 'label';
    const score = roleAndNameMatch || labelMatch ? 40 : 20;
    evidence.push({ family: 'localized-text', score, method });
  }

  const ancestorMatch = legacyAncestorMatches(fingerprint, element);
  const relativeMatch = relativePositionMatches(fingerprint, element);
  if (ancestorMatch || relativeMatch) {
    evidence.push({
      family: 'ancestor-context',
      score: ancestorMatch ? 35 : 20,
      method: ancestorMatch ? 'ancestor_landmark' : 'relative_position',
    });
  }

  return evidence;
}

function identitySemanticGatesPass(identity: TargetIdentityV2, element: Element): boolean {
  if (!matchesElementKind(element, identity.intent.elementKind)) return false;
  if (identity.semantics.role && semanticRoleOf(element) !== identity.semantics.role) return false;
  if (identity.semantics.inputType && inputTypeOf(element) !== identity.semantics.inputType) {
    return false;
  }
  return true;
}

function identitySemanticsMatch(identity: TargetIdentityV2, element: Element): boolean {
  const expected = identity.semantics;
  const checks: boolean[] = [];
  if (expected.tagName) {
    /*
     * A retag is a change of construction, not of identity.
     *
     * Reimplementing a `<button>` as an `<a role="button">` is one of the most
     * ordinary things a design-system migration does, and the product says so
     * in the markup: the role it declares is a better statement of what the
     * element *is* than the tag it happens to be built from. Requiring the tag
     * demoted the real target by one whole family below every look-alike that
     * kept its tag — the exact 33.00 gap Step 2 measured five times over.
     *
     * Only the tag check yields, and only to an explicitly declared role. Every
     * other check in the family still has to pass, so this substitutes one
     * statement of kind for another rather than paying partial credit for a
     * partial match.
     */
    const declaredRole = element.getAttribute('role')?.trim().toLowerCase().split(/\s+/)[0];
    checks.push(
      element.tagName.toLowerCase() === expected.tagName ||
        (Boolean(expected.role) && declaredRole === expected.role),
    );
  }
  if (expected.role) checks.push(semanticRoleOf(element) === expected.role);
  if (expected.inputType) {
    checks.push(inputTypeOf(element) === expected.inputType);
  }
  if (expected.controlGroup) checks.push(controlGroupMatches(element, expected.controlGroup));
  return checks.length > 0 && checks.every(Boolean);
}

function ancestorContextAgreement(identity: TargetIdentityV2, element: Element): number {
  const expected = identity.context.ancestorRoles;
  if (!expected?.length) return 0;
  return ancestorContextSimilarity(expected, ancestorRolesOf(element));
}

function relationshipContextMatches(
  identity: TargetIdentityV2,
  element: Element,
  context: IdentityScoringContext,
): boolean {
  const relationships = identity.context.relationships;
  if (!relationships?.length) return false;
  return relationships.every((relationship) =>
    RELATIONSHIP_MATCHERS[relationship.kind](element, relationship, context),
  );
}

function relationshipReferenceMatches(
  element: Element,
  expected: TargetRelationship,
  context: IdentityScoringContext,
): boolean {
  if (expected.semanticRole && semanticRoleOf(element) !== expected.semanticRole) return false;
  if (expected.stableKey) {
    const resolved = resolveStableReference(expected.stableKey, context);
    if (resolved) return resolved === element;
    if (!stableKeyMatches(element, expected.stableKey)) return false;
  }
  return Boolean(expected.semanticRole || expected.stableKey);
}

function labelledElementsOf(element: Element): Element[] {
  const labelledBy = element.getAttribute('aria-labelledby')?.trim().split(/\s+/) ?? [];
  const references: Element[] = labelledBy
    .map((id) => element.ownerDocument.getElementById(id))
    .filter((entry): entry is HTMLElement => entry !== null);
  const labels = (element as Element & { labels?: NodeListOf<HTMLLabelElement> | null }).labels;
  if (labels) references.push(...labels);
  const wrappingLabel = element.closest('label');
  if (wrappingLabel) references.push(wrappingLabel);
  return [...new Set(references)];
}

function nearestContextContainer(element: Element): Element | null {
  let current = parentElementAcrossOpenShadow(element);
  while (current) {
    const role = semanticRoleOf(current);
    if (role === 'main' || role === 'form' || role === 'region' || role === 'dialog')
      return current;
    current = parentElementAcrossOpenShadow(current);
  }
  return null;
}

function isPotentialIdentityCandidate(
  identity: TargetIdentityV2,
  element: Element,
  registryTarget: Element | null,
): boolean {
  if (element === registryTarget) return true;
  if (exactAttributesMatch(element, identity.invariants.configuredAttributes)) return true;
  if (exactAttributesMatch(element, identity.invariants.semanticAttributes)) return true;
  if (identity.semantics.role && semanticRoleOf(element) === identity.semantics.role) return true;
  if (identity.semantics.tagName && element.tagName.toLowerCase() === identity.semantics.tagName) {
    return true;
  }
  if (matchesElementKind(element, identity.intent.elementKind)) return true;
  return false;
}

/**
 * The candidate pool (T2).
 *
 * The gates and the scorer used to run over every element on the page, and the
 * visibility gate alone is ~95% of a resolution's cost. The predicate above
 * already describes what a viable candidate looks like — it was only being used
 * to count diagnostics. Applying it first turns the expensive pass over 6,000
 * elements into an expensive pass over the few hundred that could possibly win.
 *
 * The pool is filtered from the corpus rather than queried with
 * `querySelectorAll`: the corpus walk crosses open shadow roots and a selector
 * query does not, and the walk has to happen anyway because context evidence
 * (heading proximity, visual topology) is scored against the whole document.
 *
 * An empty pool falls back to the corpus, so an identity that describes nothing
 * queryable resolves exactly as it did before — slowly, but correctly.
 */
function candidatePool(
  identity: TargetIdentityV2,
  corpus: readonly Element[],
  registryTarget: Element | null,
): { elements: readonly Element[]; indexed: boolean } {
  const pool = corpus.filter((element) =>
    isPotentialIdentityCandidate(identity, element, registryTarget),
  );
  return pool.length > 0 ? { elements: pool, indexed: true } : { elements: corpus, indexed: false };
}

function validateResolutionContext(
  identity: TargetIdentityV2,
  context: TargetResolutionContext,
  locale: string | null,
): ResolutionResult | null {
  const expectedPage = identity.context.page;
  if (expectedPage) {
    // Fails open when the key is unreadable — a non-browser host has no page to
    // be wrong about, and blocking there would break every server-side check.
    const page = context.pageKey ?? currentPageKey();
    if (page && !pageKeyMatches(expectedPage.key, expectedPage.match, page)) {
      return emptyResult('missing', 'route_mismatch', locale);
    }
  }
  const expectedRoute = identity.context.routePatternId;
  if (expectedRoute && !context.routePatternId) {
    return emptyResult('needs_review', 'context_unverified', locale);
  }
  if (expectedRoute && context.routePatternId !== expectedRoute) {
    return emptyResult('missing', 'route_mismatch', locale);
  }
  const expectedState = identity.context.stateId;
  if (expectedState && !context.stateId) {
    return emptyResult('needs_review', 'context_unverified', locale);
  }
  if (expectedState && context.stateId !== expectedState) {
    return emptyResult('missing', 'state_mismatch', locale);
  }
  return null;
}

function resolveRegistryTarget(
  identity: TargetIdentityV2,
  root: ParentNode,
  context: TargetResolutionContext,
): Element | null {
  const registryKey = identity.invariants.registryKey;
  if (!registryKey || !context.resolveRegistryTarget) return null;
  try {
    const element = context.resolveRegistryTarget(registryKey);
    return element && belongsToRoot(element, root) ? element : null;
  } catch {
    return null;
  }
}

function resolveStableReference(
  stableKey: string,
  context: IdentityScoringContext,
): Element | null {
  try {
    const element = context.resolutionContext.resolveStableKey?.(stableKey) ?? null;
    return element && belongsToRoot(element, context.root) && isVisible(element) ? element : null;
  } catch {
    return null;
  }
}

function identityIsUsable(value: unknown): value is TargetIdentityV2 {
  return hasTargetIdentityV2Envelope(value);
}

/**
 * What the saved capture says about a target the live page did not tie on.
 *
 * Reaching here means this render separated the candidates. The capture may
 * still remember that several elements looked alike when the creator picked —
 * and if they never answered for that, the honest answer is still `ambiguous`,
 * because the page that ties may just be the next one.
 *
 * An author who did answer is a different case. Their rule is what release was
 * granted on (`selectionSettlesAmbiguity` in the publish gate reads the same two
 * fields), so refusing here would block, at runtime, an experience the product
 * already accepted as publishable. Weakness the answer does not cover keeps
 * blocking: `ambiguityIsSoleWeakness` is only set when the evidence was rich,
 * stable and actionable, and ambiguity was the whole of the problem.
 */
function captureEvidenceIssue(
  identity: TargetIdentityV2,
  selection: TargetSelectionPolicy | undefined,
  /** The page answered the "which one" question itself, by name. */
  nameSettlesTie: boolean,
): Pick<ResolutionResult, 'state' | 'reasonCode'> | null {
  const capture = identity.captureEvidence;
  const answered = selectionSettlesAmbiguity(selection) || nameSettlesTie;
  if (!answered) {
    if (capture.uniqueCandidateCount !== 1) {
      return { state: 'ambiguous', reasonCode: 'multiple_candidates' };
    }
    if (capture.runnerUpMargin < MIN_CAPTURE_RUNNER_UP_MARGIN) {
      return { state: 'ambiguous', reasonCode: 'insufficient_margin' };
    }
  }
  if (capture.quality === 'weak' && !(answered && capture.ambiguityIsSoleWeakness === true)) {
    return { state: 'needs_review', reasonCode: 'low_confidence' };
  }
  return null;
}

/**
 * Every other gate asks whether the recorded cues are present. Swap two alike
 * controls and the wrong one carries them all, so nothing complains. Only
 * disagreement catches that: `wrong-element` when a rival holds what the winner
 * lacks, `changed-copy` when the copy moved and nobody else claims it.
 */
type EvidenceContradiction = 'wrong-element' | 'changed-copy' | null;

function evidenceContradiction(
  identity: TargetIdentityV2,
  top: ScoredCandidate,
  candidates: readonly ScoredCandidate[],
): EvidenceContradiction {
  // Only a candidate that could have been the answer may argue about it. With
  // nobody left to argue, `wrong-element` is unreachable — but the winner's own
  // copy can still disagree, and returning early there hid that from the result.
  const rivals = durableRivals(top, candidates);

  if (rivals.length > 0 && supportingEvidencePointsElsewhere(identity, top, rivals)) {
    return 'wrong-element';
  }

  const expected = localizedEvidenceFor(identity.localizedEvidence, top.locale);
  if (!expected || !localizedTextContradicts(top.element, expected)) return null;
  if (rivals.some((rival) => localizedTextMatches(rival.element, expected))) return 'wrong-element';
  /*
   * Nobody on the page claims the recorded name, and what that means depends on
   * what the step does next.
   *
   * If the step points at the control, a rename is a rename: the author sees a
   * tooltip on a button whose words moved on, which is legible and recoverable.
   * If the step *clicks* it, the same evidence supports a second reading we
   * cannot rule out — that this is a different control standing where ours used
   * to — and we would be taking an action on the user's behalf against an
   * element we can no longer identify. Withhold the ones that act.
   */
  return stepActsOnTarget(identity) ? 'wrong-element' : 'changed-copy';
}

/**
 * Losing a supporting cue is normal; finding it on somebody else is not. The
 * recorded slot is occupied, and not by the winner.
 */
function supportingEvidencePointsElsewhere(
  identity: TargetIdentityV2,
  top: ScoredCandidate,
  rivals: readonly ScoredCandidate[],
): boolean {
  const matched = new Set(top.evidence.map((entry) => entry.family));
  return identity.captureEvidence.stableSignalFamilies.some((family) => {
    if (!SUPPORTING_DURABLE_FAMILIES.has(family) || matched.has(family)) return false;
    return rivals.some((rival) => candidateHasEvidence(rival, family));
  });
}

function stableEvidenceHasDrift(identity: TargetIdentityV2, candidate: ScoredCandidate): boolean {
  const matched = new Set(candidate.evidence.map((entry) => entry.family));
  return identity.captureEvidence.stableSignalFamilies.some((family) => {
    if (NON_DURABLE_IDENTITY_FAMILIES.has(family) || SUPPORTING_DURABLE_FAMILIES.has(family)) {
      // Supporting evidence can explain or diagnose a result, but it cannot
      // turn an otherwise safe durable identity into a production blocker.
      return false;
    }
    return !matched.has(family);
  });
}

function visualEvidenceHasDrift(
  identity: TargetIdentityV2,
  candidate: ScoredCandidate,
  root: ParentNode,
  context: TargetResolutionContext,
): boolean {
  if (!identity.captureEvidence.stableSignalFamilies.includes('visual-topology')) return false;
  const viewportClass = viewportClassOf(root);
  const applicable = identity.visualTopologies?.some((topology) => {
    if (topology.viewportClass !== viewportClass) return false;
    return !topology.stateId || topology.stateId === context.stateId;
  });
  return Boolean(
    applicable && !candidate.evidence.some((entry) => entry.family === 'visual-topology'),
  );
}

/**
 * Evidence issued to one element rather than to a kind of element.
 *
 * `semantic-attribute` is deliberately absent: two dialog triggers side by side
 * both carry `aria-haspopup="dialog"`, so matching it says what the element is,
 * not which one it is.
 */
function carriesUnsharableEvidence(candidate: ScoredCandidate): boolean {
  return candidate.evidence.some(
    (entry) => entry.family === 'configured-attribute' || entry.family === 'registry-contract',
  );
}

/** Candidates that could themselves have been the answer, and so may argue about it. */
function durableRivals(
  top: ScoredCandidate,
  candidates: readonly ScoredCandidate[],
): ScoredCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate !== top && durableFamilyCount(candidate) >= MIN_INDEPENDENT_IDENTITY_FAMILIES,
  );
}

/**
 * Whether the step does something to the element rather than point at it.
 *
 * `anchor` is a highlight: the tour draws a card beside the control and the user
 * decides. Every other required action reaches into the host page on the user's
 * behalf, so a mistake there is not a mistake they can see coming.
 */
function stepActsOnTarget(identity: TargetIdentityV2): boolean {
  return (identity.intent.requiredAction ?? 'anchor') !== 'anchor';
}

function durableFamilyCount(candidate: ScoredCandidate): number {
  return new Set(
    candidate.evidence
      .map((entry) => entry.family)
      .filter(
        (family) =>
          !NON_DURABLE_IDENTITY_FAMILIES.has(family) && !SUPPORTING_DURABLE_FAMILIES.has(family),
      ),
  ).size;
}

function durableScore(candidate: ScoredCandidate): number {
  return candidate.evidence
    .filter((entry) => !NON_DURABLE_IDENTITY_FAMILIES.has(entry.family))
    .reduce((total, entry) => total + entry.score, 0);
}

function visualAnchorFamilyCount(candidate: ScoredCandidate): number {
  return new Set(
    candidate.evidence
      .map((entry) => entry.family)
      .filter((family) => VISUAL_ANCHOR_FAMILIES.has(family)),
  ).size;
}

function visualAnchorScore(candidate: ScoredCandidate): number {
  return candidate.evidence
    .filter((entry) => entry.family !== 'localized-text')
    .reduce((total, entry) => total + entry.score, 0);
}

function resolveVisualAnchorResult(
  identity: TargetIdentityV2,
  top: ScoredCandidate,
  second: ScoredCandidate | undefined,
  common: Omit<ResolutionResult, 'state' | 'element' | 'anchor' | 'reasonCode'>,
): ResolutionResult {
  const topScore = visualAnchorScore(top);
  if (
    topScore < MIN_VISUAL_ANCHOR_CONFIDENCE ||
    visualAnchorFamilyCount(top) < MIN_INDEPENDENT_VISUAL_FAMILIES
  ) {
    return {
      state: 'needs_review',
      element: null,
      anchor: null,
      ...common,
      confidence: topScore,
      reasonCode: 'low_confidence',
    };
  }

  const runnerUpScore = second ? visualAnchorScore(second) : null;
  if (runnerUpScore !== null && topScore - runnerUpScore < requiredRunnerUpMargin(topScore)) {
    return {
      state: 'ambiguous',
      element: null,
      anchor: null,
      ...common,
      confidence: topScore,
      runnerUpConfidence: runnerUpScore,
      reasonCode: topScore === runnerUpScore ? 'multiple_candidates' : 'insufficient_margin',
    };
  }

  const captureIssue = captureEvidenceIssue(identity, undefined, false);
  if (captureIssue) {
    return {
      state: captureIssue.state,
      element: null,
      anchor: null,
      ...common,
      confidence: topScore,
      runnerUpConfidence: runnerUpScore,
      reasonCode: captureIssue.reasonCode,
    };
  }

  return {
    state: 'found',
    element: top.element,
    anchor: visualRegionAnchor(top.element),
    ...common,
    confidence: topScore,
    runnerUpConfidence: runnerUpScore,
    reasonCode: visualStableEvidenceHasDrift(identity, top) ? 'resolved_with_drift' : 'resolved',
  };
}

function visualStableEvidenceHasDrift(
  identity: TargetIdentityV2,
  candidate: ScoredCandidate,
): boolean {
  const matched = new Set(candidate.evidence.map((entry) => entry.family));
  return identity.captureEvidence.stableSignalFamilies
    .filter((family) => VISUAL_ANCHOR_FAMILIES.has(family))
    .some((family) => !matched.has(family));
}

function legacyHardGatesPass(fingerprint: ElementFingerprint, element: Element): boolean {
  if (!isVisible(element) || !isEnabled(element)) return false;
  if (fingerprint.role && semanticRoleOf(element) !== fingerprint.role.toLowerCase()) return false;
  if (fingerprint.inputType && inputTypeOf(element) !== fingerprint.inputType.toLowerCase()) {
    return false;
  }
  return true;
}

function legacyHasEnoughEvidence(candidate: ScoredCandidate): boolean {
  if (candidate.evidence.length >= 2) return true;
  return candidate.evidence.some((entry) => entry.family === 'configured-attribute');
}

function legacyAncestorMatches(fingerprint: ElementFingerprint, element: Element): boolean {
  if (!fingerprint.ancestorLandmarks?.length) return false;
  const actualLandmarks = ancestorLandmarksOf(element) ?? [];
  return fingerprint.ancestorLandmarks.some((expected) =>
    actualLandmarks.some((actual) => landmarkMatches(expected, actual)),
  );
}

function landmarkMatches(
  expected: NonNullable<ElementFingerprint['ancestorLandmarks']>[number],
  actual: NonNullable<ElementFingerprint['ancestorLandmarks']>[number],
): boolean {
  if (expected.role && actual.role !== expected.role) return false;
  if (expected.accessibleName && actual.accessibleName !== expected.accessibleName) return false;
  return Boolean(expected.role || expected.accessibleName);
}

function relativePositionMatches(fingerprint: ElementFingerprint, element: Element): boolean {
  const expected = fingerprint.relativePosition;
  if (!expected) return false;
  if (expected.parentRole === undefined && expected.siblingIndex === undefined) return false;
  const parent = parentElementAcrossOpenShadow(element);
  if (
    expected.parentRole !== undefined &&
    (!parent || semanticRoleOf(parent) !== expected.parentRole)
  ) {
    return false;
  }
  if (
    expected.siblingIndex !== undefined &&
    (!parent || [...parent.children].indexOf(element) !== expected.siblingIndex)
  ) {
    return false;
  }
  return true;
}

function strongestEvidence(evidence: readonly EvidenceMatch[]): EvidenceMatch | undefined {
  return [...evidence].sort((first, second) => second.score - first.score)[0];
}

function legacyResolutionMethod(
  fingerprint: ElementFingerprint,
  element: Element,
  strongest: EvidenceMatch | undefined,
  evidence: readonly EvidenceMatch[],
): string {
  const configuredEvidence = evidence.find((entry) => entry.family === 'configured-attribute');
  if (configuredEvidence) return configuredEvidence.method;
  const textEvidence = strongestTextEvidence(fingerprint, element);
  if (textEvidence) return textEvidence;
  const contextEvidence = evidence.find((entry) => entry.family === 'ancestor-context');
  if (contextEvidence) return contextEvidence.method;
  return strongest?.method ?? 'none';
}

function strongestTextEvidence(
  fingerprint: ElementFingerprint,
  element: Element,
): 'role_and_name' | 'label' | null {
  const accessibleName = accessibleNameOf(element);
  if (
    fingerprint.role &&
    fingerprint.accessibleName &&
    semanticRoleOf(element) === fingerprint.role.toLowerCase() &&
    accessibleName === fingerprint.accessibleName
  ) {
    return 'role_and_name';
  }
  const labelLike =
    fingerprint.label ?? fingerprint.placeholder ?? fingerprint.title ?? fingerprint.alt;
  if (
    labelLike &&
    (element.getAttribute('placeholder') === labelLike ||
      element.getAttribute('title') === labelLike ||
      element.getAttribute('alt') === labelLike ||
      accessibleName === labelLike)
  ) {
    return 'label';
  }
  return fingerprint.nearbyText?.some((text) =>
    (parentElementAcrossOpenShadow(element)?.textContent ?? '').includes(text),
  )
    ? 'label'
    : null;
}

function sortCandidates(candidates: ScoredCandidate[]): void {
  candidates.sort((first, second) => second.score - first.score);
}

function sortIdentityCandidates(candidates: ScoredCandidate[], visualResolution = false): void {
  candidates.sort((first, second) => {
    if (visualResolution) return visualAnchorScore(second) - visualAnchorScore(first);
    const durableDifference = durableScore(second) - durableScore(first);
    return durableDifference || second.score - first.score;
  });
}

function resultDiagnostics(
  top: ScoredCandidate | undefined,
  second: ScoredCandidate | undefined,
  candidateCount: number,
  fallbackLocale: string | null,
  durableOnly = false,
): Omit<ResolutionResult, 'state' | 'element' | 'anchor' | 'reasonCode'> {
  const durableEvidence = top?.evidence.filter(
    (entry) => !NON_DURABLE_IDENTITY_FAMILIES.has(entry.family),
  );
  let resolutionMethod = top?.method ?? 'none';
  if (durableOnly) resolutionMethod = strongestEvidence(durableEvidence ?? [])?.method ?? 'none';
  return {
    confidence: diagnosticScore(top, durableOnly),
    candidateCount,
    resolutionMethod,
    evidenceFamilies: top?.evidence.map((entry) => entry.family) ?? [],
    runnerUpConfidence: second ? diagnosticScore(second, durableOnly) : null,
    currentLocale: top?.locale ?? fallbackLocale,
  };
}

function diagnosticScore(candidate: ScoredCandidate | undefined, durableOnly: boolean): number {
  if (!candidate) return 0;
  return durableOnly ? durableScore(candidate) : candidate.score;
}

function emptyResult(
  state: ResolutionResult['state'],
  reasonCode: ResolutionResult['reasonCode'],
  locale: string | null,
): ResolutionResult {
  return {
    state,
    element: null,
    anchor: null,
    confidence: 0,
    candidateCount: 0,
    resolutionMethod: 'none',
    reasonCode,
    evidenceFamilies: [],
    runnerUpConfidence: null,
    currentLocale: locale,
  };
}

function elementAnchor(element: Element): NonNullable<ResolutionResult['anchor']> {
  return {
    kind: 'element',
    element,
    interactionSafe: true,
    getBoundingClientRect: () => element.getBoundingClientRect(),
  };
}

function visualRegionAnchor(element: Element): NonNullable<ResolutionResult['anchor']> {
  return {
    kind: 'visual-region',
    element,
    interactionSafe: false,
    getBoundingClientRect: () => element.getBoundingClientRect(),
  };
}

function missingReasonCode(counters: CandidateGateCounters): ResolutionResult['reasonCode'] {
  if (counters.notVisible > 0) return 'not_visible';
  if (counters.notActionable > 0) return 'not_actionable';
  if (counters.semanticMismatch > 0) return 'evidence_drift';
  return 'no_candidates';
}

function requiredRunnerUpMargin(topScore: number, minimumMargin = MIN_RUNNER_UP_MARGIN): number {
  return Math.min(
    MAX_RUNNER_UP_MARGIN,
    Math.max(minimumMargin, topScore * TARGET_MIN_RESOLUTION_RUNNER_UP_RATIO),
  );
}

function safeMatches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}
