import {
  TARGET_CONTEXT_GROUP_ROLES,
  TARGET_IDENTITY_SCORE_BY_FAMILY,
  TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN,
  TARGET_STABLE_SIGNAL_MULTIPLIER,
  TARGET_VIEWPORT_BREAKPOINTS,
  type ElementFingerprint,
  type TargetIdentityV2,
  type TargetSignalFamily,
  type TargetVisualRelation,
  type TargetVisualTopology,
} from '@lodariq/schema';
import {
  TARGET_MAX_RESOLUTION_RUNNER_UP_MARGIN,
  TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS,
  TARGET_MAX_VISUAL_TOPOLOGY_VARIANTS,
  TARGET_MIN_RESOLUTION_RUNNER_UP_MARGIN,
  TARGET_MIN_RESOLUTION_RUNNER_UP_RATIO,
  TARGET_KEY_MAX_LENGTH,
  TARGET_KEY_PATTERN,
} from '@lodariq/schema/target-runtime';
import {
  accessibleNameOf,
  ancestorLandmarksOf,
  attributeEntry,
  isInsideCollection,
  nearbyTextOf,
  roleOf,
  stableAttributesOf,
} from '@lodariq/schema/dom';
import {
  captureVisualFingerprint,
  localizedEvidenceFor,
  localizedLabelOf,
  localizedTextMatches,
  matchesRequiredAction,
  visualEvidenceFor,
  visualFingerprintStabilityValue,
} from '@lodariq/sdk-runtime/resolver';

const DEFAULT_CAPTURE_LOCALE = 'und';
const DEFAULT_PROBE_DURATION_MS = 1_400;
const DEFAULT_PROBE_SAMPLE_DELAYS_MS = [80, 240, 620, 1_120] as const;
const DEFAULT_MAX_PROBE_SAMPLES = 6;
const MAX_CANDIDATES = 160;
const MAX_SCANNED_ELEMENTS = 3_000;
const MAX_NEARBY_TEXT_ITEMS = 4;
const MAX_RELATIONSHIPS = 8;
const MAX_VISUAL_RELATIONS = 5;
const MAX_VISUAL_PEERS = 32;
const MAX_ANCESTOR_DEPTH = 8;
const MAX_ATTRIBUTE_VALUE_LENGTH = 512;
const MAX_LOCALIZED_TEXT_LENGTH = 1_024;
const MAX_AUTHOR_LABEL_LENGTH = 256;
const STRONG_RUNNER_UP_MARGIN = 0.25;
const MIN_VARIANT_CONTINUITY_FAMILIES = 2;
const TARGET_STATE_ID_REGEX = new RegExp(TARGET_KEY_PATTERN);

const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
]);

const GROUP_ROLES = new Set<string>(TARGET_CONTEXT_GROUP_ROLES);

const LANDMARK_ROLES = new Set([
  'banner',
  'complementary',
  'contentinfo',
  'dialog',
  'form',
  'main',
  'navigation',
  'region',
  'search',
]);

const PRESENTATION_TAGS = new Set(['b', 'em', 'i', 'path', 'small', 'span', 'strong', 'use']);
const VISUAL_TAGS = new Set(['canvas', 'figure', 'img', 'picture', 'svg', 'video']);
const CONTENT_TAGS = new Set([
  'blockquote',
  'code',
  'dd',
  'dt',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'p',
  'pre',
]);

const CONFIGURED_ATTRIBUTE_NAMES = [
  'data-lodariq-id',
  'data-testid',
  'data-test',
  'data-cy',
  'id',
] as const;

const SEMANTIC_ATTRIBUTE_NAMES = [
  'name',
  'autocomplete',
  'aria-controls',
  'aria-details',
  'aria-haspopup',
  'aria-multiline',
  'aria-orientation',
  'aria-owns',
] as const;

/**
 * Durable enough to separate two candidates, not independent enough to count as
 * evidence that the target is identifiable at all. Mirrors
 * `SUPPORTING_DURABLE_FAMILIES` in the resolver: comparable, but never
 * qualifying.
 */
const SUPPORTING_QUALITY_FAMILIES = new Set<TargetSignalFamily>(['sibling-position']);

const NON_DURABLE_QUALITY_FAMILIES = new Set<TargetSignalFamily>([
  'localized-text',
  'visual-topology',
  'visual-structure',
  'visual-appearance',
  'visual-neighborhood',
  'layout-slot',
]);

const VISUAL_QUALITY_FAMILIES = new Set<TargetSignalFamily>([
  'visual-topology',
  'visual-structure',
  'visual-appearance',
  'visual-neighborhood',
  'layout-slot',
]);

const DURABLE_VARIANT_CONTINUITY_FAMILIES = new Set<TargetSignalFamily>([
  'registry-contract',
  'configured-attribute',
  'semantic-attribute',
  'element-semantics',
  'ancestor-context',
  'relationship-context',
]);

export interface TargetCaptureOptions {
  locale?: string;
  requiredAction?: TargetIdentityV2['intent']['requiredAction'];
  resolutionMode?: TargetIdentityV2['intent']['resolutionMode'];
  stateId?: string;
  targetId?: string;
}

export interface TargetEvidenceCapture {
  fingerprint: ElementFingerprint;
  identity: TargetIdentityV2;
}

export interface PassiveTargetProbeOptions extends TargetCaptureOptions {
  durationMs?: number;
  maxSamples?: number;
  onUpdate?: (capture: TargetEvidenceCapture) => void;
}

export interface PassiveTargetProbe {
  cancel: () => void;
  current: () => TargetEvidenceCapture;
}

interface CaptureSample {
  actionable: boolean;
  capture: TargetEvidenceCapture;
  familyValues: ReadonlyMap<TargetSignalFamily, string>;
}

interface CandidateAssessment {
  runnerUpMargin: number;
  uniqueCandidateCount: number;
}

interface CandidatePool {
  candidates: Element[];
  truncated: boolean;
}

/**
 * Turns a click on an icon, SVG path, or nested label into the control a creator
 * sees. This is an authoring affordance only; no coordinates are persisted as
 * target identity and closed shadow roots remain intentionally opaque.
 */
export function normalizeTargetElement(element: Element): Element {
  const labelControl = controlForLabel(element);
  if (labelControl) return labelControl;

  let current: Element | null = element;
  let depth = 0;
  while (current && depth < MAX_ANCESTOR_DEPTH) {
    if (isMeaningfulInteractiveElement(current)) return current;
    if (isDocumentBoundary(current)) break;
    current = composedParentElement(current);
    depth += 1;
  }

  const tagName = element.tagName.toLowerCase();
  if (VISUAL_TAGS.has(tagName)) return element;
  if (!PRESENTATION_TAGS.has(tagName)) return element;

  current = composedParentElement(element);
  depth = 0;
  while (current && depth < MAX_ANCESTOR_DEPTH) {
    if (isDocumentBoundary(current)) break;
    const currentTag = current.tagName.toLowerCase();
    if (VISUAL_TAGS.has(currentTag) || isMeaningfulVisualContainer(current)) {
      return current;
    }
    current = composedParentElement(current);
    depth += 1;
  }

  return element;
}

/** Legacy fingerprint remains readable while TargetIdentityV2 rolls out. */
export function captureElementFingerprint(
  element: Element,
  event?: MouseEvent,
): ElementFingerprint {
  const stableAttributes = stableAttributesOf(element);
  const role = roleOf(element);
  const accessibleName = normalizedText(localizedLabelOf(element));
  const label = associatedLabelOf(element);
  const rect = element.getBoundingClientRect();

  return {
    stableAttributes,
    tagName: element.tagName.toLowerCase(),
    ...(role ? { role } : {}),
    ...(accessibleName ? { accessibleName } : {}),
    ...(label ? { label } : {}),
    ...(isInputElement(element) ? { inputType: inputTypeOf(element) ?? 'text' } : {}),
    ...attributeEntry(element, 'placeholder'),
    ...attributeEntry(element, 'title'),
    ...attributeEntry(element, 'alt'),
    nearbyText: nearbyTextOf(element),
    ancestorLandmarks: ancestorLandmarksOf(element),
    relativePosition: {
      ...(element.parentElement ? { parentRole: roleOf(element.parentElement) } : {}),
      siblingIndex: element.parentElement
        ? [...element.parentElement.children].indexOf(element)
        : undefined,
    },
    diagnosticCoordinates: {
      x: event?.clientX ?? rect.left + rect.width / 2,
      y: event?.clientY ?? rect.top + rect.height / 2,
    },
  };
}

/** Synchronous initial capture used by the one-click authoring path. */
export function captureTargetEvidence(
  element: Element,
  event?: MouseEvent,
  options: TargetCaptureOptions = {},
): TargetEvidenceCapture {
  const fingerprint = captureElementFingerprint(element, event);
  const identity = createTargetIdentity(element, fingerprint, options);
  return { fingerprint, identity };
}

/** Accept only the same opaque, bounded stable-key envelope used by schema. */
export function normalizeTargetStateId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('Target state ID is invalid');
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > TARGET_KEY_MAX_LENGTH ||
    !TARGET_STATE_ID_REGEX.test(normalized)
  ) {
    throw new Error('Target state ID is invalid');
  }
  return normalized;
}

/**
 * Keeps previously confirmed viewport/state evidence when the creator verifies
 * the same durable target again. The fresh capture remains authoritative for
 * the currently observed variant and for every semantic field. Existing
 * variants are carried forward only when two independent stable, non-visual
 * signal families still have exactly the same bounded value.
 */
export function mergeTargetCaptureVariants(
  existingIdentity: TargetIdentityV2 | undefined,
  capture: TargetEvidenceCapture,
): TargetEvidenceCapture {
  if (!existingIdentity || !hasDurableVariantContinuity(existingIdentity, capture.identity)) {
    return capture;
  }

  const observedVariantKeys = variantKeysOf(capture.identity);
  if (observedVariantKeys.size === 0) return capture;

  const visualTopologies = mergeVisualVariantEvidence(
    capture.identity.visualTopologies,
    existingIdentity.visualTopologies,
    observedVariantKeys,
    TARGET_MAX_VISUAL_TOPOLOGY_VARIANTS,
  );
  const visualFingerprints = mergeVisualVariantEvidence(
    capture.identity.visualFingerprints,
    existingIdentity.visualFingerprints,
    observedVariantKeys,
    TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS,
  );
  const context = mergedVariantContext(
    existingIdentity,
    capture.identity,
    visualTopologies,
    visualFingerprints,
  );

  return {
    ...capture,
    identity: {
      ...capture.identity,
      context,
      ...(visualTopologies.length ? { visualTopologies } : {}),
      ...(visualFingerprints.length ? { visualFingerprints } : {}),
    },
  };
}

/**
 * Samples only small, typed evidence for a bounded settling window. It does not
 * click, navigate, reload, retain HTML, or persist a DOM snapshot. Mutations are
 * observed on the smallest practical semantic container around the target.
 */
export function observeTargetEvidence(
  element: Element,
  initialCapture: TargetEvidenceCapture,
  options: PassiveTargetProbeOptions = {},
): PassiveTargetProbe {
  const maxSamples = clampInteger(options.maxSamples ?? DEFAULT_MAX_PROBE_SAMPLES, 2, 10);
  const durationMs = clampInteger(options.durationMs ?? DEFAULT_PROBE_DURATION_MS, 200, 4_000);
  const samples: CaptureSample[] = [captureSample(initialCapture, element)];
  const doc = element.ownerDocument;
  const observationRoot = observationRootFor(element);
  let currentElement: Element | null = element;
  let currentCapture = initialCapture;
  let canceled = false;
  let mutationTimer: number | undefined;
  const scheduledTimers: number[] = [];

  const update = (): void => {
    if (canceled || samples.length >= maxSamples) return;
    currentElement = resolveObservedElement(
      currentElement,
      initialCapture.identity,
      doc,
      observationRoot,
    );
    if (!currentElement) return;
    const nextCapture = captureTargetEvidence(currentElement, undefined, {
      locale: options.locale,
      requiredAction: options.requiredAction,
      resolutionMode: options.resolutionMode,
      stateId: options.stateId,
      targetId: initialCapture.identity.targetId,
    });
    samples.push(captureSample(nextCapture, currentElement));
    currentCapture = mergeCaptureSamples(samples);
    options.onUpdate?.(currentCapture);
  };

  const scheduleMutationSample = (): void => {
    if (canceled || mutationTimer !== undefined) return;
    mutationTimer = windowFor(doc).setTimeout(() => {
      mutationTimer = undefined;
      update();
    }, 60);
  };

  const observer = createMutationObserver(doc, scheduleMutationSample);
  if (observer && observationRoot) {
    observer.observe(observationRoot, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        'aria-label',
        'aria-labelledby',
        'aria-controls',
        'data-cy',
        'data-lodariq-id',
        'data-test',
        'data-testid',
        'disabled',
        'hidden',
        'id',
        'lang',
        'name',
        'role',
        'tabindex',
        'title',
        'type',
      ],
    });
  }

  for (const delay of DEFAULT_PROBE_SAMPLE_DELAYS_MS) {
    if (delay > durationMs) continue;
    scheduledTimers.push(windowFor(doc).setTimeout(update, delay));
  }

  const cancel = (): void => {
    if (canceled) return;
    canceled = true;
    observer?.disconnect();
    if (mutationTimer !== undefined) windowFor(doc).clearTimeout(mutationTimer);
    for (const timer of scheduledTimers) windowFor(doc).clearTimeout(timer);
  };

  scheduledTimers.push(windowFor(doc).setTimeout(cancel, durationMs));
  return { cancel, current: () => currentCapture };
}

export function captureNeedsConfirmation(identity: TargetIdentityV2): boolean {
  const evidence = identity.captureEvidence;
  return (
    evidence.quality === 'weak' ||
    evidence.uniqueCandidateCount !== 1 ||
    evidence.runnerUpMargin < TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN
  );
}

function createTargetIdentity(
  element: Element,
  fingerprint: ElementFingerprint,
  options: TargetCaptureOptions,
): TargetIdentityV2 {
  const configuredAttributes = configuredAttributesOf(element);
  const semanticAttributes = semanticAttributesOf(element);
  const ancestorRoles = ancestorRolesOf(element);
  const relationships = relationshipsOf(element);
  const localizedEvidence = localizedEvidenceOf(element, options.locale);
  const visualTopology = visualTopologyOf(element, options.stateId);
  const requiredAction = options.requiredAction ?? 'anchor';
  const resolutionMode = resolutionModeFor(element, requiredAction, options.resolutionMode);
  const visualFingerprint = captureVisualFingerprint(element, options.stateId);
  const semanticTagName = normalizedTagNameOf(element);
  const semanticRole = normalizedRoleOf(element);
  const semanticInputType = inputTypeOf(element);
  const actionable = matchesRequiredAction(element, requiredAction);
  const stableSignalFamilies = initialSignalFamilies({
    configuredAttributes,
    semanticAttributes,
    hasElementSemantics: Boolean(semanticTagName || semanticRole || semanticInputType),
    ancestorRoles,
    relationships,
    localizedEvidence,
    hasVisualTopology: Boolean(visualTopology),
    hasVisualFingerprint: Boolean(visualFingerprint),
    hasSiblingPosition: Boolean(visualFingerprint?.layoutSlot) && !isInsideCollection(element),
    resolutionMode,
  });

  const identityWithoutAssessment: TargetIdentityV2 = {
    schemaVersion: 2,
    targetId: options.targetId ?? createTemporaryTargetId(),
    intent:
      resolutionMode === 'semantic'
        ? { elementKind: elementKindOf(element), requiredAction, resolutionMode }
        : { elementKind: elementKindOf(element), requiredAction: 'anchor', resolutionMode },
    invariants: {
      ...(Object.keys(configuredAttributes).length ? { configuredAttributes } : {}),
      ...(Object.keys(semanticAttributes).length ? { semanticAttributes } : {}),
    },
    semantics: {
      ...(semanticTagName ? { tagName: semanticTagName } : {}),
      ...(semanticRole ? { role: semanticRole } : {}),
      ...(semanticInputType ? { inputType: semanticInputType } : {}),
      ...controlGroupEntry(element),
    },
    context: {
      ...(ancestorRoles.length ? { ancestorRoles } : {}),
      ...(relationships.length ? { relationships } : {}),
    },
    ...(visualTopology ? { visualTopologies: [visualTopology] } : {}),
    ...(visualFingerprint ? { visualFingerprints: [visualFingerprint] } : {}),
    localizedEvidence,
    captureEvidence: {
      sampleCount: 1,
      stableSignalFamilies,
      uniqueCandidateCount: 0,
      runnerUpMargin: 0,
      quality: 'weak',
    },
    display: { authorLabel: authorLabelOf(element, fingerprint) },
  };

  let assessedIdentity = identityWithoutAssessment;
  let assessment = assessCandidateUniqueness(element, assessedIdentity);
  if (
    options.resolutionMode === undefined &&
    resolutionMode === 'visual-anchor' &&
    !captureAssessmentIsUnique(assessment) &&
    visualFingerprint?.layoutSlot
  ) {
    const layoutSlotIdentity = promoteToLayoutSlot(assessedIdentity);
    const layoutSlotAssessment = assessCandidateUniqueness(element, layoutSlotIdentity);
    if (captureAssessmentIsUnique(layoutSlotAssessment)) {
      assessedIdentity = layoutSlotIdentity;
      assessment = layoutSlotAssessment;
    }
  }
  return {
    ...assessedIdentity,
    captureEvidence: {
      ...assessedIdentity.captureEvidence,
      ...assessment,
      ...captureQuality(
        actionable,
        assessedIdentity.intent.resolutionMode ?? 'semantic',
        1,
        assessedIdentity.captureEvidence.stableSignalFamilies,
        assessment.uniqueCandidateCount,
        assessment.runnerUpMargin,
      ),
    },
  };
}

function promoteToLayoutSlot(identity: TargetIdentityV2): TargetIdentityV2 {
  return {
    ...identity,
    intent: { ...identity.intent, requiredAction: 'anchor', resolutionMode: 'layout-slot' },
    captureEvidence: {
      ...identity.captureEvidence,
      stableSignalFamilies: [
        ...identity.captureEvidence.stableSignalFamilies.filter(
          (family) => family !== 'layout-slot',
        ),
        'layout-slot',
      ],
    },
  };
}

function captureAssessmentIsUnique(assessment: CandidateAssessment): boolean {
  return (
    assessment.uniqueCandidateCount === 1 &&
    assessment.runnerUpMargin >= TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN
  );
}

function resolutionModeFor(
  element: Element,
  requiredAction: NonNullable<TargetIdentityV2['intent']['requiredAction']>,
  requestedMode: TargetIdentityV2['intent']['resolutionMode'],
): NonNullable<TargetIdentityV2['intent']['resolutionMode']> {
  if (requiredAction !== 'anchor') return 'semantic';
  if (requestedMode) return requestedMode;
  return isMeaningfulInteractiveElement(element) ? 'semantic' : 'visual-anchor';
}

function captureSample(capture: TargetEvidenceCapture, element: Element): CaptureSample {
  return {
    actionable: matchesRequiredAction(element, capture.identity.intent.requiredAction),
    capture,
    familyValues: signalFamilyValues(capture.identity),
  };
}

function mergeCaptureSamples(samples: readonly CaptureSample[]): TargetEvidenceCapture {
  const first = samples[0]!;
  const latest = samples[samples.length - 1]!;
  // Merging may only remove a drifted family, never add one: `signalFamilyValues`
  // has none of `initialSignalFamilies`' collection and mode guards, so keying off
  // it put `sibling-position` back for a target inside a <ul>.
  const admitted = new Set(first.capture.identity.captureEvidence.stableSignalFamilies);
  const stableSignalFamilies = [...first.familyValues.keys()].filter((family) => {
    if (!admitted.has(family)) return false;
    const expected = first.familyValues.get(family);
    return samples.every((sample) => sample.familyValues.get(family) === expected);
  });
  const uniqueCandidateCount = Math.max(
    ...samples.map((sample) => sample.capture.identity.captureEvidence.uniqueCandidateCount),
  );
  const runnerUpMargin = Math.min(
    ...samples.map((sample) => sample.capture.identity.captureEvidence.runnerUpMargin),
  );
  const localizedEvidence = mergeLocalizedEvidence(samples);
  const visualTopologies = mergeVisualTopologies(samples);
  const visualFingerprints = mergeVisualFingerprints(samples);
  const sampleCount = samples.length;
  const identity: TargetIdentityV2 = {
    ...withoutVisualTopologies(latest.capture.identity),
    targetId: first.capture.identity.targetId,
    ...(visualTopologies.length ? { visualTopologies } : {}),
    ...(visualFingerprints.length ? { visualFingerprints } : {}),
    localizedEvidence,
    captureEvidence: {
      sampleCount,
      stableSignalFamilies,
      uniqueCandidateCount,
      runnerUpMargin,
      ...captureQuality(
        samples.every((sample) => sample.actionable),
        first.capture.identity.intent.resolutionMode ?? 'semantic',
        sampleCount,
        stableSignalFamilies,
        uniqueCandidateCount,
        runnerUpMargin,
      ),
    },
    display: first.capture.identity.display,
  };
  return { fingerprint: latest.capture.fingerprint, identity };
}

function mergeLocalizedEvidence(
  samples: readonly CaptureSample[],
): TargetIdentityV2['localizedEvidence'] {
  const evidenceByLocale = new Map<string, TargetIdentityV2['localizedEvidence'][number]>();
  for (const sample of samples) {
    for (const evidence of sample.capture.identity.localizedEvidence) {
      evidenceByLocale.set(evidence.locale, evidence);
    }
  }
  return [...evidenceByLocale.values()];
}

function mergeVisualTopologies(samples: readonly CaptureSample[]): TargetVisualTopology[] {
  const topologyByVariant = new Map<string, TargetVisualTopology>();
  for (const sample of samples) {
    for (const topology of sample.capture.identity.visualTopologies ?? []) {
      topologyByVariant.set(`${topology.viewportClass}:${topology.stateId ?? ''}`, topology);
    }
  }
  return [...topologyByVariant.values()].slice(0, TARGET_MAX_VISUAL_TOPOLOGY_VARIANTS);
}

function mergeVisualFingerprints(
  samples: readonly CaptureSample[],
): NonNullable<TargetIdentityV2['visualFingerprints']> {
  const fingerprintByVariant = new Map<
    string,
    NonNullable<TargetIdentityV2['visualFingerprints']>[number]
  >();
  for (const sample of samples) {
    for (const fingerprint of sample.capture.identity.visualFingerprints ?? []) {
      fingerprintByVariant.set(
        `${fingerprint.viewportClass}:${fingerprint.stateId ?? ''}`,
        fingerprint,
      );
    }
  }
  return [...fingerprintByVariant.values()].slice(0, TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS);
}

function hasDurableVariantContinuity(
  existingIdentity: TargetIdentityV2,
  currentIdentity: TargetIdentityV2,
): boolean {
  if (existingIdentity.targetId !== currentIdentity.targetId) return false;
  if (existingIdentity.intent.elementKind !== currentIdentity.intent.elementKind) return false;
  if (
    (existingIdentity.intent.requiredAction ?? 'anchor') !==
    (currentIdentity.intent.requiredAction ?? 'anchor')
  ) {
    return false;
  }
  if (
    (existingIdentity.intent.resolutionMode ?? 'semantic') !==
    (currentIdentity.intent.resolutionMode ?? 'semantic')
  ) {
    return false;
  }

  const existingValues = signalFamilyValues(existingIdentity);
  const currentValues = signalFamilyValues(currentIdentity);
  const currentStableFamilies = new Set(currentIdentity.captureEvidence.stableSignalFamilies);
  const commonDurableFamilies = existingIdentity.captureEvidence.stableSignalFamilies.filter(
    (family) =>
      DURABLE_VARIANT_CONTINUITY_FAMILIES.has(family) && currentStableFamilies.has(family),
  );

  return (
    commonDurableFamilies.length >= MIN_VARIANT_CONTINUITY_FAMILIES &&
    commonDurableFamilies.every(
      (family) =>
        existingValues.get(family) !== undefined &&
        existingValues.get(family) === currentValues.get(family),
    )
  );
}

function variantKeysOf(identity: TargetIdentityV2): Set<string> {
  return new Set([
    ...(identity.visualTopologies ?? []).map(visualVariantKey),
    ...(identity.visualFingerprints ?? []).map(visualVariantKey),
  ]);
}

function mergedVariantContext(
  existingIdentity: TargetIdentityV2,
  currentIdentity: TargetIdentityV2,
  visualTopologies: readonly { stateId?: string }[],
  visualFingerprints: readonly { stateId?: string }[],
): TargetIdentityV2['context'] {
  const context = structuredClone(currentIdentity.context);
  const variantStateIds = [...visualTopologies, ...visualFingerprints].map(
    (variant) => variant.stateId,
  );
  const sharedExplicitStateId = variantStateIds[0];
  const allVariantsShareExplicitState = Boolean(
    sharedExplicitStateId && variantStateIds.every((stateId) => stateId === sharedExplicitStateId),
  );
  if (!allVariantsShareExplicitState) {
    delete context.stateId;
    return context;
  }

  const currentStateId = currentIdentity.context.stateId;
  if (currentStateId) {
    if (currentStateId !== sharedExplicitStateId) delete context.stateId;
    return context;
  }
  const existingStateId = existingIdentity.context.stateId;
  if (existingStateId === sharedExplicitStateId) {
    context.stateId = existingStateId;
  }
  return context;
}

function mergeVisualVariantEvidence<Variant extends { viewportClass: string; stateId?: string }>(
  current: readonly Variant[] | undefined,
  existing: readonly Variant[] | undefined,
  observedVariantKeys: ReadonlySet<string>,
  limit: number,
): Variant[] {
  const merged = (current ?? []).map((variant) => structuredClone(variant));
  const includedKeys = new Set(merged.map(visualVariantKey));
  for (const variant of existing ?? []) {
    const key = visualVariantKey(variant);
    if (observedVariantKeys.has(key) || includedKeys.has(key) || merged.length >= limit) continue;
    merged.push(structuredClone(variant));
    includedKeys.add(key);
  }
  return merged;
}

function visualVariantKey(variant: { viewportClass: string; stateId?: string }): string {
  return `${variant.viewportClass}:${variant.stateId ?? ''}`;
}

function withoutVisualTopologies(identity: TargetIdentityV2): TargetIdentityV2 {
  const copy = { ...identity };
  delete copy.visualTopologies;
  delete copy.visualFingerprints;
  return copy;
}

function signalFamilyValues(identity: TargetIdentityV2): ReadonlyMap<TargetSignalFamily, string> {
  const values = new Map<TargetSignalFamily, string>();
  if (identity.invariants.registryKey) {
    values.set('registry-contract', identity.invariants.registryKey);
  }
  if (identity.invariants.configuredAttributes) {
    values.set('configured-attribute', stableRecordValue(identity.invariants.configuredAttributes));
  }
  if (identity.invariants.semanticAttributes) {
    values.set('semantic-attribute', stableRecordValue(identity.invariants.semanticAttributes));
  }
  if (identity.semantics.tagName || identity.semantics.role || identity.semantics.inputType) {
    values.set(
      'element-semantics',
      [identity.semantics.tagName, identity.semantics.role, identity.semantics.inputType]
        .filter(Boolean)
        .join('|'),
    );
  }
  if (identity.context.ancestorRoles?.length) {
    values.set('ancestor-context', identity.context.ancestorRoles.join('|'));
  }
  if (identity.context.relationships?.length) {
    values.set('relationship-context', JSON.stringify(identity.context.relationships));
  }
  if (identity.visualTopologies?.length) {
    values.set('visual-topology', identity.visualTopologies.map(quantizedTopologyValue).join('|'));
  }
  const visualFingerprint = identity.visualFingerprints?.[0];
  if (visualFingerprint) {
    values.set('visual-structure', visualFingerprint.structuralHash);
    values.set('visual-appearance', visualFingerprint.appearanceHash);
    values.set('visual-neighborhood', visualFingerprint.neighborhoodHash);
    if (visualFingerprint.layoutSlot) {
      const slot = `${visualFingerprint.layoutSlot.siblingIndex}:${visualFingerprint.layoutSlot.siblingCount}`;
      if (identity.intent.resolutionMode === 'layout-slot') {
        values.set('layout-slot', visualFingerprintStabilityValue(visualFingerprint));
      } else {
        // Only the two numbers. Tracking the whole fingerprint here would let an
        // unrelated appearance change report the position as unstable.
        values.set('sibling-position', slot);
      }
    }
  }
  if (identity.localizedEvidence.length) {
    values.set('localized-text', JSON.stringify(identity.localizedEvidence));
  }
  return values;
}

function initialSignalFamilies(input: {
  configuredAttributes: Record<string, string>;
  semanticAttributes: Record<string, string>;
  hasElementSemantics: boolean;
  ancestorRoles: string[];
  relationships: NonNullable<TargetIdentityV2['context']['relationships']>;
  localizedEvidence: TargetIdentityV2['localizedEvidence'];
  hasVisualTopology: boolean;
  hasVisualFingerprint: boolean;
  hasSiblingPosition: boolean;
  resolutionMode: NonNullable<TargetIdentityV2['intent']['resolutionMode']>;
}): TargetSignalFamily[] {
  const families: TargetSignalFamily[] = [];
  if (Object.keys(input.configuredAttributes).length) families.push('configured-attribute');
  if (Object.keys(input.semanticAttributes).length) families.push('semantic-attribute');
  if (input.hasElementSemantics) families.push('element-semantics');
  if (input.ancestorRoles.length) families.push('ancestor-context');
  if (input.relationships.length) families.push('relationship-context');
  if (input.hasVisualTopology) families.push('visual-topology');
  if (input.hasVisualFingerprint) {
    families.push('visual-structure', 'visual-appearance', 'visual-neighborhood');
    if (input.resolutionMode === 'layout-slot') families.push('layout-slot');
    // Semantic mode only. `visual-anchor` capture is allowed to *become*
    // layout-slot mode when nothing else separates it, and offering the same
    // measurement here under a second name would settle the assessment first
    // and rob it of that promotion.
    else if (input.resolutionMode === 'semantic' && input.hasSiblingPosition) {
      families.push('sibling-position');
    }
  }
  if (input.localizedEvidence.length) families.push('localized-text');
  return families;
}

/**
 * Quality, plus the one thing a creator can do something about.
 *
 * `weak` has several causes and they are not equally answerable. Thin evidence,
 * a drifting layout slot and an element that cannot take the required action are
 * facts about the page — no author answer changes them. Ambiguity is different:
 * when the evidence is otherwise sound and several elements simply read the same
 * way, "which one did you mean" is a question with an answer (§4.4a). Saying so
 * here is what lets the publish gate accept that answer without also waving
 * through the causes an answer cannot fix.
 */
function captureQuality(
  actionable: boolean,
  resolutionMode: NonNullable<TargetIdentityV2['intent']['resolutionMode']>,
  sampleCount: number,
  stableSignalFamilies: readonly TargetSignalFamily[],
  uniqueCandidateCount: number,
  runnerUpMargin: number,
): Pick<TargetIdentityV2['captureEvidence'], 'quality' | 'ambiguityIsSoleWeakness'> {
  const unique =
    uniqueCandidateCount === 1 && runnerUpMargin >= TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN;
  const requiredFamilyCount = resolutionMode === 'semantic' ? 2 : 3;
  const qualifyingFamilyCount = stableSignalFamilies.filter((family) =>
    resolutionMode === 'semantic'
      ? !NON_DURABLE_QUALITY_FAMILIES.has(family) && !SUPPORTING_QUALITY_FAMILIES.has(family)
      : VISUAL_QUALITY_FAMILIES.has(family),
  ).length;
  const soundApartFromAmbiguity =
    actionable &&
    !(resolutionMode === 'layout-slot' && !stableSignalFamilies.includes('layout-slot')) &&
    qualifyingFamilyCount >= requiredFamilyCount;

  if (!soundApartFromAmbiguity) return { quality: 'weak' };
  if (!unique) return { quality: 'weak', ambiguityIsSoleWeakness: true };
  if (sampleCount >= 2 && runnerUpMargin >= STRONG_RUNNER_UP_MARGIN) return { quality: 'strong' };
  return { quality: 'usable' };
}

/**
 * The elements the capture-time uniqueness check could not separate from the
 * selected one, in document order and including it.
 *
 * This is the set `uniqueCandidateCount` counts, and therefore the only honest
 * set to build the "which one did you mean" question from (§4.4a). Deriving that
 * question from anything else — from the accessible name, say — asks about a
 * different set of elements than the one the resolver will actually tie on, so
 * an ordinal answer would point at the wrong element. Empty when the target is
 * unique, and empty when the capture is undecided for a reason ambiguity cannot
 * explain: too little durable evidence to compare candidates at all.
 */
export function ambiguousCandidates(
  selected: Element,
  identity: TargetIdentityV2,
): readonly Element[] {
  const scored = scoreCandidatePool(selected, identity);
  if (!scored) return [];
  // The resolver ties on a band, not on exact equality. An ordinal counted in a
  // narrower set than the one it is applied to lands one element over.
  const topScore = scored.scores[0]?.score ?? scored.targetScore;
  const margin = Math.min(
    TARGET_MAX_RESOLUTION_RUNNER_UP_MARGIN,
    Math.max(
      TARGET_MIN_RESOLUTION_RUNNER_UP_MARGIN,
      topScore * TARGET_MIN_RESOLUTION_RUNNER_UP_RATIO,
    ),
  );
  const tied = scored.scores
    .filter((entry) => topScore - entry.score < margin)
    .map((entry) => entry.candidate);
  // If something outscores the clicked element, an ordinal cannot settle it.
  return tied.length > 1 && tied.includes(selected) ? inDocumentOrder(tied) : [];
}

function inDocumentOrder(elements: readonly Element[]): Element[] {
  return [...elements].sort((left, right) => {
    if (left === right) return 0;
    const position = left.compareDocumentPosition(right);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

interface ScoredCandidatePool {
  scores: Array<{ candidate: Element; score: number }>;
  targetScore: number;
  truncated: boolean;
  selected: Element;
}

/** Scores every comparable candidate on the page against the captured identity. */
function scoreCandidatePool(
  selected: Element,
  identity: TargetIdentityV2,
): ScoredCandidatePool | null {
  const durableFamilies = durableComparableFamilies(identity);
  // Supporting families separate candidates but never qualify one, so they must
  // not be what gets a pool past this gate.
  const qualifyingFamilies = durableFamilies.filter(
    (family) => !SUPPORTING_QUALITY_FAMILIES.has(family),
  );
  if (qualifyingFamilies.length < 2) return null;
  const availableFamilies = captureComparableFamilies(identity, durableFamilies, selected);
  const pool = candidatePool(selected.ownerDocument, identity, selected);
  const selectedScore = scoreCandidate(selected, identity, availableFamilies);
  const scores = pool.candidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(candidate, identity, availableFamilies),
  }));
  scores.sort((left, right) => right.score - left.score);
  const selectedEntry = scores.find((entry) => entry.candidate === selected);
  return {
    scores,
    targetScore: selectedEntry?.score ?? selectedScore,
    truncated: pool.truncated,
    selected,
  };
}

function assessCandidateUniqueness(
  selected: Element,
  identity: TargetIdentityV2,
): CandidateAssessment {
  const scored = scoreCandidatePool(selected, identity);
  if (!scored) {
    return { uniqueCandidateCount: 2, runnerUpMargin: 0 };
  }
  const { scores, targetScore } = scored;
  const uniqueCandidateCount = scores.filter((entry) => entry.score === targetScore).length;
  const runnerUp = scores.find((entry) => entry.candidate !== selected)?.score ?? 0;
  const margin = clampRatio((targetScore - runnerUp) / Math.max(targetScore, 1));
  if (scored.truncated)
    return { uniqueCandidateCount: Math.max(2, uniqueCandidateCount), runnerUpMargin: 0 };
  return {
    uniqueCandidateCount: Math.max(1, uniqueCandidateCount),
    runnerUpMargin: scores.length === 1 ? 1 : margin,
  };
}

/**
 * Which families the capture-time uniqueness check may compare.
 *
 * Visible copy is deliberately not enough on its own: two buttons that differ
 * only in their words are not distinguishable in a way worth trusting. An
 * explicit `aria-label` is different — it is metadata the product author wrote
 * about the element, not the element's own text — so it counts, and the runtime
 * still compares it per locale rather than as one global string.
 */
function captureComparableFamilies(
  identity: TargetIdentityV2,
  durableFamilies: readonly TargetSignalFamily[],
  selected?: Element,
): TargetSignalFamily[] {
  if (durableFamilies.includes('localized-text')) return [...durableFamilies];
  const hasNamedLocalizedEvidence = identity.localizedEvidence.some((evidence) =>
    hasPrimaryLocalizedEvidence(evidence),
  );
  if (!hasNamedLocalizedEvidence) return [...durableFamilies];
  const semanticMode = (identity.intent.resolutionMode ?? 'semantic') === 'semantic';
  const isAnchorControl = identity.semantics.tagName === 'a';
  const named = selected ? hasConfiguredAccessibleName(selected) : false;
  return (semanticMode && isAnchorControl) || named
    ? [...durableFamilies, 'localized-text']
    : [...durableFamilies];
}

/** An accessible name the product wrote down, rather than one read off the copy. */
function hasConfiguredAccessibleName(element: Element): boolean {
  return Boolean(
    element.getAttribute('aria-label')?.trim() || element.getAttribute('aria-labelledby')?.trim(),
  );
}

function durableComparableFamilies(identity: TargetIdentityV2): TargetSignalFamily[] {
  if ((identity.intent.resolutionMode ?? 'semantic') !== 'semantic') {
    // Position is only emitted in semantic mode: comparing it here costs a
    // fingerprint per candidate and always answers no.
    return identity.captureEvidence.stableSignalFamilies.filter(
      (family) => family !== 'localized-text' && !SUPPORTING_QUALITY_FAMILIES.has(family),
    );
  }
  return identity.captureEvidence.stableSignalFamilies.filter(
    (family) => !NON_DURABLE_QUALITY_FAMILIES.has(family),
  );
}

function scoreCandidate(
  candidate: Element,
  identity: TargetIdentityV2,
  families: readonly TargetSignalFamily[],
): number {
  let score = 0;
  for (const family of families) {
    if (candidateMatchesFamily(candidate, identity, family)) {
      score += TARGET_IDENTITY_SCORE_BY_FAMILY[family] * TARGET_STABLE_SIGNAL_MULTIPLIER;
    }
  }
  return score;
}

function candidateMatchesFamily(
  candidate: Element,
  identity: TargetIdentityV2,
  family: TargetSignalFamily,
): boolean {
  if (family === 'configured-attribute') {
    return recordHasExactMatch(candidate, identity.invariants.configuredAttributes);
  }
  if (family === 'semantic-attribute') {
    return recordHasExactMatch(candidate, identity.invariants.semanticAttributes);
  }
  if (family === 'element-semantics') {
    const tagMatches =
      !identity.semantics.tagName || candidate.tagName.toLowerCase() === identity.semantics.tagName;
    const roleMatches =
      !identity.semantics.role || normalizedRoleOf(candidate) === identity.semantics.role;
    const typeMatches =
      !identity.semantics.inputType || inputTypeOf(candidate) === identity.semantics.inputType;
    return tagMatches && roleMatches && typeMatches;
  }
  if (family === 'ancestor-context') {
    const expected = identity.context.ancestorRoles ?? [];
    return expected.length > 0 && isOrderedSubsequence(expected, ancestorRolesOf(candidate));
  }
  if (family === 'relationship-context') {
    const expected = identity.context.relationships ?? [];
    return (
      expected.length > 0 && JSON.stringify(relationshipsOf(candidate)) === JSON.stringify(expected)
    );
  }
  if (family === 'localized-text') {
    const locale = captureLocaleOf(candidate, undefined);
    const expected = localizedEvidenceFor(identity.localizedEvidence, locale);
    return Boolean(expected && localizedTextMatches(candidate, expected));
  }
  if (family === 'visual-topology') {
    const expected = identity.visualTopologies?.[0];
    const current = visualTopologyOf(candidate, expected?.stateId);
    return Boolean(expected && current && visualTopologiesAreSimilar(current, expected));
  }
  if (
    family === 'visual-structure' ||
    family === 'visual-appearance' ||
    family === 'visual-neighborhood' ||
    family === 'layout-slot' ||
    family === 'sibling-position'
  ) {
    return visualEvidenceFor(identity, candidate, identity.visualFingerprints?.[0]?.stateId).some(
      (match) => match.family === family,
    );
  }
  return false;
}

function candidatePool(
  doc: Document,
  identity: TargetIdentityV2,
  selected?: Element,
  searchRoot?: Element | null,
): CandidatePool {
  const candidates: Element[] = selected ? [selected] : [];
  const seen = new Set<Element>(candidates);
  const root = searchRoot ?? doc.body ?? doc.documentElement;
  const queue: Element[] = [root];
  let visited = 0;
  while (queue.length && visited < MAX_SCANNED_ELEMENTS && candidates.length < MAX_CANDIDATES) {
    const candidate = queue.shift()!;
    visited += 1;
    if (isAuthoringChrome(candidate)) continue;
    queue.push(...childElementsIncludingOpenShadow(candidate));
    if (
      !seen.has(candidate) &&
      isPotentiallyVisible(candidate) &&
      candidateMatchesCaptureShape(candidate, identity)
    ) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  }
  return {
    candidates,
    truncated: queue.length > 0 || candidates.length >= MAX_CANDIDATES,
  };
}

function candidateMatchesCaptureShape(candidate: Element, identity: TargetIdentityV2): boolean {
  if ((identity.intent.resolutionMode ?? 'semantic') !== 'semantic') {
    return elementKindOf(candidate) === identity.intent.elementKind;
  }
  if (recordHasExactMatch(candidate, identity.invariants.configuredAttributes)) return true;
  if (recordHasExactMatch(candidate, identity.invariants.semanticAttributes)) return true;
  const expectedTag = identity.semantics.tagName;
  const expectedRole = identity.semantics.role;
  const expectedType = identity.semantics.inputType;
  if (expectedTag && candidate.tagName.toLowerCase() !== expectedTag) return false;
  if (expectedRole && normalizedRoleOf(candidate) !== expectedRole) return false;
  if (expectedType && inputTypeOf(candidate) !== expectedType) return false;
  return Boolean(expectedTag || expectedRole || expectedType);
}

function resolveObservedElement(
  current: Element | null,
  identity: TargetIdentityV2,
  doc: Document,
  observationRoot: Element | null,
): Element | null {
  if (current?.isConnected) return current;
  if (!observationRoot?.isConnected) return null;
  const pool = candidatePool(doc, identity, undefined, observationRoot);
  if (pool.truncated) return null;
  const candidates = pool.candidates;
  const families = durableComparableFamilies(identity);
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, identity, families) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best || best.score < 2 || best.score === runnerUp?.score) return null;
  return best.candidate;
}

function configuredAttributesOf(element: Element): Record<string, string> {
  return captureAttributeRecord(element, CONFIGURED_ATTRIBUTE_NAMES);
}

function semanticAttributesOf(element: Element): Record<string, string> {
  return captureAttributeRecord(element, SEMANTIC_ATTRIBUTE_NAMES);
}

function captureAttributeRecord(
  element: Element,
  names: readonly string[],
): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const name of names) {
    const value = normalizedAttributeValue(element.getAttribute(name));
    if (!value || isProbablyGeneratedValue(value)) continue;
    entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}

function localizedEvidenceOf(
  element: Element,
  explicitLocale: string | undefined,
): TargetIdentityV2['localizedEvidence'] {
  const accessibleName = normalizedText(localizedLabelOf(element));
  const label = associatedLabelOf(element);
  const placeholder = normalizedText(element.getAttribute('placeholder'));
  const title = normalizedText(element.getAttribute('title'));
  const nearbyText = nearbyTextOf(element)
    .map((item) => normalizedText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_NEARBY_TEXT_ITEMS);
  const hasLocalizedEvidence = Boolean(
    accessibleName || label || placeholder || title || nearbyText.length,
  );
  if (!hasLocalizedEvidence) return [];
  return [
    {
      locale: captureLocaleOf(element, explicitLocale),
      ...(accessibleName ? { accessibleName } : {}),
      ...(label ? { label } : {}),
      ...(placeholder ? { placeholder } : {}),
      ...(title ? { title } : {}),
      ...(nearbyText.length ? { nearbyText } : {}),
    },
  ];
}

function captureLocaleOf(element: Element, explicitLocale: string | undefined): string {
  const inheritedLocale = inheritedLangOf(element);
  const documentLocale = element.ownerDocument.documentElement.getAttribute('lang');
  return canonicalLocale(
    explicitLocale ?? inheritedLocale ?? documentLocale ?? DEFAULT_CAPTURE_LOCALE,
  );
}

function inheritedLangOf(element: Element): string | undefined {
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < MAX_ANCESTOR_DEPTH) {
    const lang = current.getAttribute('lang')?.trim();
    if (lang) return lang;
    current = composedParentElement(current);
    depth += 1;
  }
  return undefined;
}

function canonicalLocale(value: string): string {
  const candidate = value.trim().replace(/_/g, '-');
  if (!candidate) return DEFAULT_CAPTURE_LOCALE;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? DEFAULT_CAPTURE_LOCALE;
  } catch {
    return DEFAULT_CAPTURE_LOCALE;
  }
}

function ancestorRolesOf(element: Element): string[] {
  const roles: string[] = [];
  let current = composedParentElement(element);
  let depth = 0;
  while (current && depth < MAX_ANCESTOR_DEPTH) {
    const role = normalizedRoleOf(current);
    if (role && !roles.includes(role)) roles.push(role);
    if (isDocumentBoundary(current)) break;
    current = composedParentElement(current);
    depth += 1;
  }
  return roles;
}

function relationshipsOf(
  element: Element,
): NonNullable<TargetIdentityV2['context']['relationships']> {
  const relationships: NonNullable<TargetIdentityV2['context']['relationships']> = [];
  const labelledBy = element.getAttribute('aria-labelledby')?.trim();
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/).slice(0, 3)) {
      const label = element.ownerDocument.getElementById(id);
      const labelRole = label ? normalizedRoleOf(label) : undefined;
      relationships.push({
        kind: 'labelled-by',
        ...(labelRole ? { semanticRole: labelRole } : {}),
        ...(safeStableKey(id) ? { stableKey: safeStableKey(id) } : {}),
      });
    }
  }

  const parent = composedParentElement(element);
  const parentRole = parent ? normalizedRoleOf(parent) : undefined;
  const parentStableKey = parent ? stableKeyOf(parent) : undefined;
  if (parentRole || parentStableKey) {
    relationships.push({
      kind: 'inside',
      ...(parentRole ? { semanticRole: parentRole } : {}),
      ...(parentStableKey ? { stableKey: parentStableKey } : {}),
    });
  }

  const group = closestRoleElement(element, GROUP_ROLES);
  if (group) {
    const groupRole = normalizedRoleOf(group);
    relationships.push({
      kind: 'same-group',
      ...(groupRole ? { semanticRole: groupRole } : {}),
      ...stableKeyEntry(group),
    });
  }

  const heading = nearbyHeadingOf(element);
  if (heading) {
    relationships.push({
      kind: 'near-heading',
      semanticRole: 'heading',
      ...stableKeyEntry(heading),
    });
  }
  return relationships.slice(0, MAX_RELATIONSHIPS);
}

function visualTopologyOf(element: Element, stateId?: string): TargetVisualTopology | undefined {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (!view || view.innerWidth <= 0 || view.innerHeight <= 0) return undefined;
  const targetRect = element.getBoundingClientRect();
  if (!validRect(targetRect)) return undefined;

  const container = visualContainerOf(element, targetRect);
  const containerRect = container?.getBoundingClientRect();
  const referenceRect =
    containerRect && validRect(containerRect)
      ? containerRect
      : { left: 0, top: 0, width: view.innerWidth, height: view.innerHeight };
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const centerReferenceWidth = container
    ? Math.max(referenceRect.width, container.scrollWidth)
    : referenceRect.width;
  const centerReferenceHeight = container
    ? Math.max(referenceRect.height, container.scrollHeight)
    : referenceRect.height;
  const targetShape = {
    widthRatio: roundedRatio(targetRect.width / referenceRect.width),
    heightRatio: roundedRatio(targetRect.height / referenceRect.height),
    aspectRatio: round(clamp(targetRect.width / targetRect.height, 0.01, 100), 3),
    ...(containerRect && validRect(containerRect)
      ? {
          centerXRatio: roundedRatio(
            (targetCenterX - referenceRect.left + (container?.scrollLeft ?? 0)) /
              centerReferenceWidth,
          ),
          centerYRatio: roundedRatio(
            (targetCenterY - referenceRect.top + (container?.scrollTop ?? 0)) /
              centerReferenceHeight,
          ),
        }
      : {}),
  };
  const relations = visualRelationsOf(element, container, targetRect, referenceRect);

  return {
    viewportClass: viewportClassOf(view.innerWidth),
    ...(stateId ? { stateId } : {}),
    target: targetShape,
    ...(containerRect && validRect(containerRect)
      ? {
          container: {
            widthRatio: roundedRatio(containerRect.width / view.innerWidth),
            heightRatio: roundedRatio(containerRect.height / view.innerHeight),
          },
        }
      : {}),
    ...(relations.length ? { relations } : {}),
  };
}

function visualRelationsOf(
  element: Element,
  container: Element | null,
  targetRect: DOMRect,
  referenceRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): TargetVisualRelation[] {
  const relations: TargetVisualRelation[] = [
    { kind: 'inside', reference: container ? 'container' : 'viewport' },
  ];
  const searchRoot = container ?? element.ownerDocument;
  const targetCenter = centerOf(targetRect);
  const diagonal = Math.max(1, Math.hypot(referenceRect.width, referenceRect.height));
  const peers = boundedDescendantElements(searchRoot, MAX_VISUAL_PEERS * 8)
    .filter(isMeaningfulInteractiveElement)
    .filter((candidate) => Boolean(stableKeyOf(candidate)))
    .filter((candidate) => candidate !== element && !element.contains(candidate))
    .filter(isPotentiallyVisible)
    .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
    .filter((entry) => validRect(entry.rect))
    .map((entry) => {
      const center = centerOf(entry.rect);
      const distance = Math.hypot(center.x - targetCenter.x, center.y - targetCenter.y);
      return { ...entry, center, distance };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, MAX_VISUAL_RELATIONS - 1);

  for (const peer of peers) {
    const distanceRatio = clampRatio(peer.distance / diagonal);
    relations.push({
      kind: relativeVisualRelation(targetCenter, peer.center, referenceRect),
      reference: 'semantic-peer',
      ...stableReferenceKeyEntry(peer.candidate),
      distanceBucket: distanceBucketOf(distanceRatio),
      distanceRatio: round(distanceRatio, 3),
    });
  }
  return relations.slice(0, MAX_VISUAL_RELATIONS);
}

function relativeVisualRelation(
  target: { x: number; y: number },
  peer: { x: number; y: number },
  container: Pick<DOMRect, 'width' | 'height'>,
): TargetVisualRelation['kind'] {
  const dx = peer.x - target.x;
  const dy = peer.y - target.y;
  const alignedX = Math.abs(dx) <= Math.max(8, container.width * 0.03);
  const alignedY = Math.abs(dy) <= Math.max(8, container.height * 0.03);
  if (alignedX && !alignedY) return 'aligned-x';
  if (alignedY && !alignedX) return 'aligned-y';
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'right-of' : 'left-of';
  return dy < 0 ? 'below' : 'above';
}

function visualContainerOf(element: Element, targetRect: DOMRect): Element | null {
  let current = composedParentElement(element);
  let depth = 0;
  while (current && depth < 6) {
    if (isDocumentBoundary(current)) break;
    const rect = current.getBoundingClientRect();
    if (
      isStableVisualContainer(current) &&
      isPotentiallyVisible(current) &&
      validRect(rect) &&
      containsRect(rect, targetRect) &&
      rectArea(rect) >= rectArea(targetRect) * 1.25
    ) {
      return current;
    }
    current = composedParentElement(current);
    depth += 1;
  }
  return null;
}

/**
 * Generic layout wrappers are deliberately ignored. A wrapper insertion should
 * not silently change the coordinate space used by normalized topology.
 */
function isStableVisualContainer(element: Element): boolean {
  return Boolean(normalizedRoleOf(element));
}

function observationRootFor(element: Element): Element | null {
  let current = composedParentElement(element);
  let fallback = current;
  let depth = 0;
  while (current && depth < 4) {
    if (isDocumentBoundary(current)) break;
    fallback = current;
    const role = normalizedRoleOf(current);
    if (role && (LANDMARK_ROLES.has(role) || GROUP_ROLES.has(role))) return current;
    current = composedParentElement(current);
    depth += 1;
  }
  return fallback ?? element.ownerDocument.body;
}

function elementKindOf(element: Element): TargetIdentityV2['intent']['elementKind'] {
  const tagName = element.tagName.toLowerCase();
  const role = normalizedRoleOf(element);
  if (
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea' ||
    role === 'textbox' ||
    role === 'combobox' ||
    element.getAttribute('contenteditable') === 'true'
  ) {
    return 'field';
  }
  if (isMeaningfulInteractiveElement(element)) return 'control';
  if (CONTENT_TAGS.has(tagName) || VISUAL_TAGS.has(tagName)) return 'content';
  return 'container';
}

function authorLabelOf(element: Element, fingerprint: ElementFingerprint): string {
  const label =
    fingerprint.accessibleName ??
    fingerprint.label ??
    fingerprint.placeholder ??
    fingerprint.title ??
    fingerprint.alt;
  if (label) return label.slice(0, MAX_AUTHOR_LABEL_LENGTH);
  const role = roleOf(element);
  if (role) return humanizeToken(role).slice(0, MAX_AUTHOR_LABEL_LENGTH);
  return humanizeToken(element.tagName.toLowerCase()).slice(0, MAX_AUTHOR_LABEL_LENGTH);
}

function associatedLabelOf(element: Element): string | undefined {
  if (isLabelableElement(element)) {
    const labels = element.labels;
    const labelText = labels
      ? [...labels]
          .map((label) => normalizedText(label.textContent))
          .filter((item): item is string => Boolean(item))
          .join(' ')
      : undefined;
    if (labelText) return labelText.slice(0, MAX_LOCALIZED_TEXT_LENGTH);
  }
  const wrappingLabel = element.closest('label');
  return normalizedText(wrappingLabel?.textContent);
}

function controlForLabel(element: Element): Element | null {
  const label = element.closest('label');
  return label?.control ?? null;
}

function controlGroupEntry(
  element: Element,
): Pick<TargetIdentityV2['semantics'], 'controlGroup'> | object {
  const group = closestRoleElement(element, GROUP_ROLES);
  const key = group ? stableKeyOf(group) : undefined;
  return key ? { controlGroup: key } : {};
}

function closestRoleElement(element: Element, roles: ReadonlySet<string>): Element | null {
  let current = composedParentElement(element);
  let depth = 0;
  while (current && depth < MAX_ANCESTOR_DEPTH) {
    const role = normalizedRoleOf(current);
    if (role && roles.has(role)) return current;
    if (isDocumentBoundary(current)) break;
    current = composedParentElement(current);
    depth += 1;
  }
  return null;
}

function nearbyHeadingOf(element: Element): Element | null {
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 4) {
    const parent = composedParentElement(current);
    if (!parent) break;
    const heading = [...parent.children].find((candidate) => {
      const tagName = candidate.tagName.toLowerCase();
      return /^h[1-6]$/.test(tagName) || candidate.getAttribute('role') === 'heading';
    });
    if (heading && !heading.contains(element)) return heading;
    current = parent;
    depth += 1;
  }
  return null;
}

function boundedDescendantElements(root: ParentNode, limit: number): Element[] {
  const elements: Element[] = [];
  const queue: Element[] = [];
  if (root instanceof Element) {
    queue.push(...childElementsIncludingOpenShadow(root));
  } else {
    const documentRoot = root instanceof Document ? (root.body ?? root.documentElement) : null;
    if (documentRoot) queue.push(documentRoot);
  }
  while (queue.length && elements.length < limit) {
    const element = queue.shift()!;
    elements.push(element);
    if (elements.length < limit) queue.push(...childElementsIncludingOpenShadow(element));
  }
  return elements;
}

function childElementsIncludingOpenShadow(element: Element): Element[] {
  const children = [...element.children];
  const shadowRoot = 'shadowRoot' in element ? element.shadowRoot : null;
  if (shadowRoot) children.push(...shadowRoot.children);
  return children;
}

function isMeaningfulInteractiveElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = normalizedRoleOf(element);
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  if (
    tagName === 'button' ||
    tagName === 'select' ||
    tagName === 'summary' ||
    tagName === 'textarea'
  ) {
    return true;
  }
  if (tagName === 'a') return true;
  if (tagName === 'input' && element.getAttribute('type')?.toLowerCase() !== 'hidden') return true;
  if (element.getAttribute('contenteditable') === 'true') return true;
  const tabIndex = element.getAttribute('tabindex');
  if (tabIndex !== null && Number(tabIndex) >= 0) return true;
  return false;
}

function hasPrimaryLocalizedEvidence(
  evidence: TargetIdentityV2['localizedEvidence'][number],
): boolean {
  return Boolean(
    evidence.accessibleName || evidence.label || evidence.placeholder || evidence.title,
  );
}

function isMeaningfulVisualContainer(container: Element): boolean {
  const tagName = container.tagName.toLowerCase();
  if (CONTENT_TAGS.has(tagName)) return true;
  return Boolean(
    normalizedRoleOf(container) ||
    accessibleNameOf(container) ||
    Object.keys(configuredAttributesOf(container)).length,
  );
}

function isPotentiallyVisible(element: Element): boolean {
  if (
    element.hasAttribute('hidden') ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  ) {
    return false;
  }
  const view = element.ownerDocument.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return false;
  const style = view.getComputedStyle(element);
  return style?.display !== 'none' && style?.visibility !== 'hidden';
}

function composedParentElement(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node;
}

function isDocumentBoundary(element: Element): boolean {
  return (
    element === element.ownerDocument.body || element === element.ownerDocument.documentElement
  );
}

function isAuthoringChrome(element: Element): boolean {
  if (element.tagName.toLowerCase().startsWith('lodariq-')) return true;
  return Boolean(
    element.closest(
      'lodariq-authoring-panel, [data-lodariq-authoring-trigger="true"], [data-lodariq-bridge]',
    ),
  );
}

function isInputElement(element: Element): boolean {
  return element.tagName.toLowerCase() === 'input';
}

function normalizedTagNameOf(element: Element): string | undefined {
  const tagName = element.tagName.toLowerCase();
  return /^[a-z][a-z0-9-]*$/.test(tagName) ? tagName : undefined;
}

function normalizedRoleOf(element: Element): string | undefined {
  const role = roleOf(element)?.trim().split(/\s+/)[0]?.toLowerCase();
  return role && /^[a-z][a-z0-9-]*$/.test(role) ? role : undefined;
}

function inputTypeOf(element: Element): string | undefined {
  if (!isInputElement(element)) return undefined;
  const rawType =
    'type' in element && typeof element.type === 'string'
      ? element.type
      : (element.getAttribute('type') ?? 'text');
  const inputType = rawType.trim().toLowerCase();
  return /^[a-z][a-z0-9-]*$/.test(inputType) ? inputType : 'text';
}

function isLabelableElement(
  element: Element,
): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement {
  return ['button', 'input', 'select', 'textarea'].includes(element.tagName.toLowerCase());
}

function stableKeyEntry(
  element: Element,
): Pick<NonNullable<TargetIdentityV2['context']['relationships']>[number], 'stableKey'> | object {
  const stableKey = stableKeyOf(element);
  return stableKey ? { stableKey } : {};
}

function stableReferenceKeyEntry(
  element: Element,
): Pick<TargetVisualRelation, 'referenceKey'> | object {
  const referenceKey = stableKeyOf(element);
  return referenceKey ? { referenceKey } : {};
}

function stableKeyOf(element: Element): string | undefined {
  const attributes = configuredAttributesOf(element);
  for (const [name, value] of Object.entries(attributes)) {
    const candidate = safeStableKey(`${name}:${value}`);
    if (candidate) return candidate;
  }
  const semanticName = normalizedAttributeValue(element.getAttribute('name'));
  return semanticName ? safeStableKey(`name:${semanticName}`) : undefined;
}

function safeStableKey(value: string): string | undefined {
  if (value.length > 128) return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) ? value : undefined;
}

function recordHasExactMatch(
  element: Element,
  record: Record<string, string> | undefined,
): boolean {
  if (!record) return false;
  const entries = Object.entries(record);
  return (
    entries.length > 0 &&
    entries.every(([name, value]) => element.getAttribute(name)?.trim() === value)
  );
}

function normalizedAttributeValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized.length > MAX_ATTRIBUTE_VALUE_LENGTH) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) return undefined;
  if (/[\\/<>?\r\n]/.test(normalized)) return undefined;
  return normalized;
}

function normalizedText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_LOCALIZED_TEXT_LENGTH);
}

function isProbablyGeneratedValue(value: string): boolean {
  if (/^[:_][A-Za-z0-9_-]{6,}$/.test(value)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return true;
  if (/^[0-9a-f]{12,}$/i.test(value)) return true;
  if (/\b(?:css|sc|emotion|mui)-[A-Za-z0-9_-]{6,}\b/i.test(value)) return true;
  const digitCount = [...value].filter((character) => /\d/.test(character)).length;
  return value.length >= 16 && digitCount / value.length > 0.45;
}

function stableRecordValue(record: Record<string, string>): string {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
}

function quantizedTopologyValue(topology: TargetVisualTopology): string {
  const target = topology.target;
  return JSON.stringify({
    viewportClass: topology.viewportClass,
    stateId: topology.stateId ?? null,
    target: {
      widthRatio: round(target.widthRatio, 1),
      heightRatio: round(target.heightRatio, 1),
      aspectRatio: round(target.aspectRatio, 1),
      centerXRatio: target.centerXRatio === undefined ? null : round(target.centerXRatio, 1),
      centerYRatio: target.centerYRatio === undefined ? null : round(target.centerYRatio, 1),
    },
    container: topology.container
      ? {
          widthRatio: round(topology.container.widthRatio, 1),
          heightRatio: round(topology.container.heightRatio, 1),
        }
      : null,
    relations:
      topology.relations?.map((relation) => ({
        kind: relation.kind,
        reference: relation.reference,
        referenceKey: relation.referenceKey ?? null,
        distanceBucket: relation.distanceBucket ?? null,
        distanceRatio:
          relation.distanceRatio === undefined ? null : round(relation.distanceRatio, 1),
      })) ?? [],
  });
}

function visualTopologiesAreSimilar(
  current: TargetVisualTopology,
  expected: TargetVisualTopology,
): boolean {
  if (current.viewportClass !== expected.viewportClass) return false;
  const currentTarget = current.target;
  const expectedTarget = expected.target;
  const shapeMatches =
    Math.abs(currentTarget.widthRatio - expectedTarget.widthRatio) <= 0.12 &&
    Math.abs(currentTarget.heightRatio - expectedTarget.heightRatio) <= 0.12 &&
    normalizedCentersMatch(currentTarget, expectedTarget) &&
    relativeDifference(currentTarget.aspectRatio, expectedTarget.aspectRatio) <= 0.35;
  return shapeMatches;
}

function normalizedCentersMatch(
  current: TargetVisualTopology['target'],
  expected: TargetVisualTopology['target'],
): boolean {
  if (expected.centerXRatio === undefined || expected.centerYRatio === undefined) return true;
  if (current.centerXRatio === undefined || current.centerYRatio === undefined) return false;
  return (
    Math.abs(current.centerXRatio - expected.centerXRatio) <= 0.18 &&
    Math.abs(current.centerYRatio - expected.centerYRatio) <= 0.18
  );
}

function createTemporaryTargetId(): string {
  const viewCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  const randomPart =
    viewCrypto && 'randomUUID' in viewCrypto
      ? viewCrypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `target_${randomPart}`;
}

function createMutationObserver(
  doc: Document,
  callback: MutationCallback,
): MutationObserver | null {
  const Observer = doc.defaultView?.MutationObserver;
  return Observer ? new Observer(callback) : null;
}

function windowFor(doc: Document): Window {
  return doc.defaultView ?? window;
}

function viewportClassOf(width: number): TargetVisualTopology['viewportClass'] {
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.mobileMaxWidth) return 'mobile';
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.tabletMaxWidth) return 'tablet';
  return 'desktop';
}

function distanceBucketOf(ratio: number): NonNullable<TargetVisualRelation['distanceBucket']> {
  if (ratio <= 0.15) return 'near';
  if (ratio <= 0.4) return 'medium';
  return 'far';
}

function centerOf(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): {
  x: number;
  y: number;
} {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function validRect(rect: Pick<DOMRect, 'width' | 'height'>): boolean {
  return (
    Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0
  );
}

function containsRect(
  container: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  child: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): boolean {
  return (
    child.left >= container.left - 1 &&
    child.top >= container.top - 1 &&
    child.left + child.width <= container.left + container.width + 1 &&
    child.top + child.height <= container.top + container.height + 1
  );
}

function rectArea(rect: Pick<DOMRect, 'width' | 'height'>): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function isOrderedSubsequence(expected: readonly string[], actual: readonly string[]): boolean {
  let expectedIndex = 0;
  for (const value of actual) {
    if (value === expected[expectedIndex]) expectedIndex += 1;
    if (expectedIndex === expected.length) return true;
  }
  return expected.length === 0;
}

function humanizeToken(value: string): string {
  const words = value.replace(/[-_]+/g, ' ').trim();
  return words ? `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}` : 'Page element';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.round(clamp(value, minimum, maximum));
}

function clampRatio(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function roundedRatio(value: number): number {
  return round(clampRatio(value), 4);
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 0.01);
}
