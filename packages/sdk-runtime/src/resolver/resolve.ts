import { accessibleNameOf, ancestorLandmarksOf } from '@lodariq/schema/dom';
import {
  TARGET_CONTEXT_GROUP_ROLES,
  TARGET_IDENTITY_SCORE_BY_FAMILY,
  TARGET_MIN_RESOLUTION_RUNNER_UP_RATIO,
  TARGET_STABLE_SIGNAL_MULTIPLIER,
  TARGET_UNCONFIRMED_SIGNAL_MULTIPLIER,
  hasTargetIdentityV2Envelope,
} from '@lodariq/schema/target-runtime';
import type {
  ElementFingerprint,
  Target,
  TargetIdentityV2,
  TargetRelationship,
  TargetSignalFamily,
} from '@lodariq/schema/target';
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
import {
  ancestorRolesOf,
  belongsToRoot,
  collectElements,
  collectLegacyElements,
  controlGroupMatches,
  currentLocale,
  exactAttributesMatch,
  inputTypeOf,
  isEnabled,
  isLodariqOwnedElement,
  isVisible,
  localeForElement,
  localizedEvidenceFor,
  localizedTextMatches,
  matchesElementKind,
  matchesRequiredAction,
  parentElementAcrossOpenShadow,
  semanticRoleOf,
  stableKeyMatches,
} from './element-evidence';
import { viewportClassOf, visualTopologyMatches } from './visual-topology';

export * from './types';
export {
  localizedEvidenceFor,
  localizedLabelOf,
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

const VISUAL_ANCHOR_FAMILIES = new Set<TargetSignalFamily>([
  'visual-topology',
  'visual-structure',
  'visual-appearance',
  'visual-neighborhood',
  'layout-slot',
]);

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

  const collection = collectElements(root);
  if (collection.truncated) {
    return emptyResult('needs_review', 'scan_limit_exceeded', fallbackLocale);
  }
  const allElements = collection.elements.filter((element) => !isLodariqOwnedElement(element));
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

  for (const element of allElements) {
    const relevant = isPotentialIdentityCandidate(identity, element, registryTarget);
    if (!isVisible(element)) {
      if (relevant) counters.notVisible += 1;
      continue;
    }
    if (!identitySemanticGatesPass(identity, element)) {
      if (relevant) counters.semanticMismatch += 1;
      continue;
    }
    if (!requiredActionsPass(element, identity, context)) {
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
    return {
      state: 'missing',
      element: null,
      anchor: null,
      ...common,
      reasonCode: missingReasonCode(counters),
    };
  }

  if (isVisualResolution(identity)) {
    return resolveVisualAnchorResult(identity, top, second, common);
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
    return {
      state: 'needs_review',
      element: null,
      anchor: null,
      ...common,
      reasonCode: localeWasRequiredButUnavailable ? 'locale_unverified' : 'low_confidence',
    };
  }

  if (
    second &&
    topDurableScore - durableScore(second) < requiredRunnerUpMargin(topDurableScore) &&
    !localizedTextSafelyBreaksDurableTie(identity, top, candidates)
  ) {
    return {
      state: 'ambiguous',
      element: null,
      anchor: null,
      ...common,
      reasonCode:
        topDurableScore === durableScore(second) ? 'multiple_candidates' : 'insufficient_margin',
    };
  }

  const captureIssue = captureEvidenceIssue(identity);
  if (captureIssue) {
    return {
      state: captureIssue.state,
      element: null,
      anchor: null,
      ...common,
      reasonCode: captureIssue.reasonCode,
    };
  }

  const hasDrift = stableEvidenceHasDrift(identity, top);
  if (hasDrift) {
    return {
      state: 'needs_review',
      element: null,
      anchor: null,
      ...common,
      reasonCode: 'evidence_drift',
    };
  }
  return {
    state: 'found',
    element: top.element,
    anchor: elementAnchor(top.element),
    ...common,
    reasonCode: visualEvidenceHasDrift(identity, top, root, context)
      ? 'resolved_with_drift'
      : 'resolved',
  };
}

/**
 * Locale-bound text may distinguish otherwise equivalent semantic controls,
 * but only after the winner has already cleared the independent durable
 * evidence quorum. It never rescues a weak identity or overrides a stronger
 * durable candidate, and it fails closed when locale copy changes.
 */
function localizedTextSafelyBreaksDurableTie(
  identity: TargetIdentityV2,
  top: ScoredCandidate,
  candidates: readonly ScoredCandidate[],
): boolean {
  if (identity.semantics.tagName !== 'a') return false;
  const expected = localizedEvidenceFor(identity.localizedEvidence, top.locale);
  if (!expected || !hasPrimaryLocalizedEvidence(expected)) return false;
  if (!candidateHasEvidence(top, 'localized-text')) return false;

  const topDurableScore = durableScore(top);
  const requiredMargin = requiredRunnerUpMargin(topDurableScore);
  const durableNearTies = candidates.filter(
    (candidate) => candidate !== top && topDurableScore - durableScore(candidate) < requiredMargin,
  );
  if (durableNearTies.length === 0) return false;
  if (durableNearTies.some((candidate) => candidateHasEvidence(candidate, 'localized-text'))) {
    return false;
  }

  const topSemanticScore = topDurableScore + evidenceScore(top, 'localized-text');
  const runnerUpSemanticScore = Math.max(
    ...durableNearTies.map(
      (candidate) => durableScore(candidate) + evidenceScore(candidate, 'localized-text'),
    ),
  );
  return topSemanticScore - runnerUpSemanticScore >= requiredMargin;
}

function candidateHasEvidence(candidate: ScoredCandidate, family: TargetSignalFamily): boolean {
  return candidate.evidence.some((entry) => entry.family === family);
}

function evidenceScore(candidate: ScoredCandidate, family: TargetSignalFamily): number {
  return candidate.evidence
    .filter((entry) => entry.family === family)
    .reduce((total, entry) => total + entry.score, 0);
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
  target: Pick<Target, 'id' | 'fingerprint' | 'identity'>,
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
  return resolveTargetIdentity(target.identity, root, context);
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
  if (ancestorContextMatches(identity, element)) addEvidence('ancestor-context');
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

function addVisualRankingEvidence(
  identity: TargetIdentityV2,
  candidates: ScoredCandidate[],
  context: IdentityScoringContext,
): void {
  if (!identity.visualTopologies?.length || candidates.length === 0) return;
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
): boolean {
  const requiredActions = new Set(
    [identity.intent.requiredAction, context.requiredAction].filter(
      (action): action is NonNullable<typeof action> => Boolean(action),
    ),
  );
  return [...requiredActions].every((action) => matchesRequiredAction(element, action));
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
  const stableEntries = Object.entries(fingerprint.stableAttributes);
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
  if (expected.tagName) checks.push(element.tagName.toLowerCase() === expected.tagName);
  if (expected.role) checks.push(semanticRoleOf(element) === expected.role);
  if (expected.inputType) {
    checks.push(inputTypeOf(element) === expected.inputType);
  }
  if (expected.controlGroup) checks.push(controlGroupMatches(element, expected.controlGroup));
  return checks.length > 0 && checks.every(Boolean);
}

function ancestorContextMatches(identity: TargetIdentityV2, element: Element): boolean {
  const expected = identity.context.ancestorRoles;
  if (!expected?.length) return false;
  return isOrderedSubsequence(expected, ancestorRolesOf(element));
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
  return false;
}

function validateResolutionContext(
  identity: TargetIdentityV2,
  context: TargetResolutionContext,
  locale: string | null,
): ResolutionResult | null {
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

function captureEvidenceIssue(
  identity: TargetIdentityV2,
): Pick<ResolutionResult, 'state' | 'reasonCode'> | null {
  const capture = identity.captureEvidence;
  if (capture.uniqueCandidateCount !== 1) {
    return { state: 'ambiguous', reasonCode: 'multiple_candidates' };
  }
  if (capture.runnerUpMargin < MIN_CAPTURE_RUNNER_UP_MARGIN) {
    return { state: 'ambiguous', reasonCode: 'insufficient_margin' };
  }
  if (capture.quality === 'weak') {
    return { state: 'needs_review', reasonCode: 'low_confidence' };
  }
  return null;
}

function stableEvidenceHasDrift(identity: TargetIdentityV2, candidate: ScoredCandidate): boolean {
  const matched = new Set(candidate.evidence.map((entry) => entry.family));
  return identity.captureEvidence.stableSignalFamilies.some((family) => {
    if (NON_DURABLE_IDENTITY_FAMILIES.has(family)) {
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

function durableFamilyCount(candidate: ScoredCandidate): number {
  return new Set(
    candidate.evidence
      .map((entry) => entry.family)
      .filter((family) => !NON_DURABLE_IDENTITY_FAMILIES.has(family)),
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

  const captureIssue = captureEvidenceIssue(identity);
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

function isOrderedSubsequence(expected: readonly string[], actual: readonly string[]): boolean {
  let expectedIndex = 0;
  for (const value of actual) {
    if (value === expected[expectedIndex]) expectedIndex += 1;
    if (expectedIndex === expected.length) return true;
  }
  return false;
}

function safeMatches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}
