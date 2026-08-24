import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { TargetApproach } from './approach';
import { PAGE_KEY_MAX_LENGTH, PAGE_KEY_PATTERN, TARGET_PAGE_MATCHES } from './page-key';
import { TARGET_COLLECTION_ORDERS, TARGET_SELECTION_ORDINAL_LIMITS } from './target-runtime';
import {
  TARGET_ATTRIBUTE_VALUE_MAX_LENGTH,
  TARGET_ATTRIBUTE_VALUE_PATTERN,
  TARGET_AUTHOR_LABEL_MAX_LENGTH,
  TARGET_CAPTURE_QUALITIES,
  TARGET_CONFIGURED_ATTRIBUTE_NAME_PATTERN,
  TARGET_ELEMENT_KINDS,
  TARGET_ID_MAX_LENGTH,
  TARGET_ID_PATTERN,
  TARGET_IDENTITY_SCHEMA_VERSION,
  TARGET_KEY_MAX_LENGTH,
  TARGET_KEY_PATTERN,
  TARGET_LOCALIZED_TEXT_MAX_LENGTH,
  TARGET_LOCALE_PATTERN,
  TARGET_MAX_ANCESTOR_ROLES,
  TARGET_MAX_CANDIDATE_COUNT,
  TARGET_MAX_CAPTURE_SAMPLES,
  TARGET_MAX_CONFIGURED_ATTRIBUTES,
  TARGET_MAX_CONTEXT_RELATIONSHIPS,
  TARGET_MAX_LOCALE_VARIANTS,
  TARGET_MAX_LAYOUT_SIBLINGS,
  TARGET_MAX_NEARBY_TEXT_ITEMS,
  TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS,
  TARGET_MAX_VISUAL_RELATIONS,
  TARGET_MAX_VISUAL_TOPOLOGY_VARIANTS,
  TARGET_OCCUPANCY_GRID_PATTERN,
  TARGET_RELATIONSHIP_KINDS,
  TARGET_REQUIRED_ACTIONS,
  TARGET_RESOLUTION_MODES,
  TARGET_ROLE_PATTERN,
  TARGET_SEMANTIC_ATTRIBUTE_NAME_PATTERN,
  TARGET_SIGNAL_FAMILIES,
  TARGET_VIEWPORT_CLASSES,
  TARGET_VISUAL_DISTANCE_BUCKETS,
  TARGET_VISUAL_HASH_PATTERN,
  TARGET_VISUAL_REFERENCE_KINDS,
  TARGET_VISUAL_RELATION_KINDS,
} from './target-runtime';

export {
  TARGET_CAPTURE_QUALITIES,
  TARGET_COLLECTION_ORDERS,
  TARGET_SELECTION_KINDS,
  TARGET_SELECTION_ORDINAL_LIMITS,
  TARGET_CONFIGURED_ATTRIBUTE_NAME_PATTERN,
  TARGET_CONTEXT_GROUP_ROLES,
  TARGET_ELEMENT_KINDS,
  TARGET_IDENTITY_SCHEMA_VERSION,
  TARGET_IDENTITY_SCORE_BY_FAMILY,
  TARGET_LOCALE_PATTERN,
  TARGET_MAX_LAYOUT_SIBLINGS,
  TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS,
  TARGET_OCCUPANCY_GRID_PATTERN,
  TARGET_MAX_RESOLUTION_RUNNER_UP_MARGIN,
  TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN,
  TARGET_MIN_RESOLUTION_RUNNER_UP_MARGIN,
  TARGET_MIN_RESOLUTION_RUNNER_UP_RATIO,
  TARGET_RELATIONSHIP_KINDS,
  TARGET_REQUIRED_ACTIONS,
  TARGET_RESOLUTION_MODES,
  TARGET_SEMANTIC_ATTRIBUTE_NAME_PATTERN,
  TARGET_SIGNAL_FAMILIES,
  TARGET_STABLE_SIGNAL_MULTIPLIER,
  TARGET_UNCONFIRMED_SIGNAL_MULTIPLIER,
  TARGET_VIEWPORT_BREAKPOINTS,
  TARGET_VIEWPORT_CLASSES,
  TARGET_VISUAL_DISTANCE_BUCKETS,
  TARGET_VISUAL_HASH_PATTERN,
  TARGET_VISUAL_REFERENCE_KINDS,
  TARGET_VISUAL_RELATION_KINDS,
} from './target-runtime';

const TargetIdentifier = Type.String({
  minLength: 1,
  maxLength: TARGET_ID_MAX_LENGTH,
  pattern: TARGET_ID_PATTERN,
});
const TargetStableKey = Type.String({
  minLength: 1,
  maxLength: TARGET_KEY_MAX_LENGTH,
  pattern: TARGET_KEY_PATTERN,
});
const TargetRoleName = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: TARGET_ROLE_PATTERN,
});

export const TargetElementKind = Type.Union(
  TARGET_ELEMENT_KINDS.map((value) => Type.Literal(value)),
);
export type TargetElementKind = Static<typeof TargetElementKind>;

export const TargetRequiredAction = Type.Union(
  TARGET_REQUIRED_ACTIONS.map((value) => Type.Literal(value)),
);
export type TargetRequiredAction = Static<typeof TargetRequiredAction>;

export const TargetResolutionMode = Type.Union(
  TARGET_RESOLUTION_MODES.map((value) => Type.Literal(value)),
);
export type TargetResolutionMode = Static<typeof TargetResolutionMode>;

export const TargetRelationshipKind = Type.Union(
  TARGET_RELATIONSHIP_KINDS.map((value) => Type.Literal(value)),
);
export type TargetRelationshipKind = Static<typeof TargetRelationshipKind>;

export const TargetSignalFamily = Type.Union(
  TARGET_SIGNAL_FAMILIES.map((value) => Type.Literal(value)),
);
export type TargetSignalFamily = Static<typeof TargetSignalFamily>;

export const TargetCaptureQuality = Type.Union(
  TARGET_CAPTURE_QUALITIES.map((value) => Type.Literal(value)),
);
export type TargetCaptureQuality = Static<typeof TargetCaptureQuality>;

export const TargetViewportClass = Type.Union(
  TARGET_VIEWPORT_CLASSES.map((value) => Type.Literal(value)),
);
export type TargetViewportClass = Static<typeof TargetViewportClass>;

export const TargetVisualRelationKind = Type.Union(
  TARGET_VISUAL_RELATION_KINDS.map((value) => Type.Literal(value)),
);
export type TargetVisualRelationKind = Static<typeof TargetVisualRelationKind>;

export const TargetVisualReferenceKind = Type.Union(
  TARGET_VISUAL_REFERENCE_KINDS.map((value) => Type.Literal(value)),
);
export type TargetVisualReferenceKind = Static<typeof TargetVisualReferenceKind>;

export const TargetVisualDistanceBucket = Type.Union(
  TARGET_VISUAL_DISTANCE_BUCKETS.map((value) => Type.Literal(value)),
);
export type TargetVisualDistanceBucket = Static<typeof TargetVisualDistanceBucket>;

export const TargetLocale = Type.String({
  minLength: 2,
  maxLength: 64,
  pattern: TARGET_LOCALE_PATTERN,
});
export type TargetLocale = Static<typeof TargetLocale>;

export const TargetIntent = Type.Union([
  Type.Object(
    {
      elementKind: TargetElementKind,
      requiredAction: Type.Optional(TargetRequiredAction),
      resolutionMode: Type.Optional(Type.Literal('semantic')),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      elementKind: TargetElementKind,
      /** Visual modes are presentation-only and can never authorize host interactions. */
      requiredAction: Type.Optional(Type.Literal('anchor')),
      resolutionMode: Type.Union([Type.Literal('visual-anchor'), Type.Literal('layout-slot')]),
    },
    { additionalProperties: false },
  ),
]);
export type TargetIntent = Static<typeof TargetIntent>;

const TargetConfiguredAttributes = Type.Record(
  Type.String({ pattern: TARGET_CONFIGURED_ATTRIBUTE_NAME_PATTERN }),
  Type.String({
    minLength: 1,
    maxLength: TARGET_ATTRIBUTE_VALUE_MAX_LENGTH,
    pattern: TARGET_ATTRIBUTE_VALUE_PATTERN,
  }),
  {
    additionalProperties: false,
    maxProperties: TARGET_MAX_CONFIGURED_ATTRIBUTES,
  },
);

const TargetSemanticAttributes = Type.Record(
  Type.String({ pattern: TARGET_SEMANTIC_ATTRIBUTE_NAME_PATTERN }),
  Type.String({
    minLength: 1,
    maxLength: TARGET_ATTRIBUTE_VALUE_MAX_LENGTH,
    pattern: TARGET_ATTRIBUTE_VALUE_PATTERN,
  }),
  {
    additionalProperties: false,
    maxProperties: TARGET_MAX_CONFIGURED_ATTRIBUTES,
  },
);

export const TargetInvariants = Type.Object(
  {
    registryKey: Type.Optional(TargetStableKey),
    configuredAttributes: Type.Optional(TargetConfiguredAttributes),
    semanticAttributes: Type.Optional(TargetSemanticAttributes),
  },
  { additionalProperties: false },
);
export type TargetInvariants = Static<typeof TargetInvariants>;

export const TargetSemantics = Type.Object(
  {
    tagName: Type.Optional(
      Type.String({ minLength: 1, maxLength: 64, pattern: TARGET_ROLE_PATTERN }),
    ),
    role: Type.Optional(TargetRoleName),
    inputType: Type.Optional(
      Type.String({ minLength: 1, maxLength: 64, pattern: TARGET_ROLE_PATTERN }),
    ),
    controlGroup: Type.Optional(TargetStableKey),
  },
  { additionalProperties: false },
);
export type TargetSemantics = Static<typeof TargetSemantics>;

export const TargetRelationship = Type.Object(
  {
    kind: TargetRelationshipKind,
    semanticRole: Type.Optional(TargetRoleName),
    stableKey: Type.Optional(TargetStableKey),
  },
  { additionalProperties: false },
);
export type TargetRelationship = Static<typeof TargetRelationship>;

/**
 * The page the target was picked on. Absent means any page — which is both what
 * an author asks for on a top nav or help button, and what every target written
 * before this field existed says by default.
 */
export const TargetPageScope = Type.Object(
  {
    key: Type.String({
      minLength: 1,
      maxLength: PAGE_KEY_MAX_LENGTH,
      pattern: PAGE_KEY_PATTERN,
    }),
    /** Defaults to `exact`; `prefix` is for paths carrying a record id. */
    match: Type.Optional(Type.Union(TARGET_PAGE_MATCHES.map((value) => Type.Literal(value)))),
  },
  { additionalProperties: false },
);
export type TargetPageScope = Static<typeof TargetPageScope>;

export const TargetContext = Type.Object(
  {
    page: Type.Optional(TargetPageScope),
    routePatternId: Type.Optional(TargetStableKey),
    stateId: Type.Optional(TargetStableKey),
    ancestorRoles: Type.Optional(
      Type.Array(TargetRoleName, {
        maxItems: TARGET_MAX_ANCESTOR_ROLES,
        uniqueItems: true,
      }),
    ),
    relationships: Type.Optional(
      Type.Array(TargetRelationship, { maxItems: TARGET_MAX_CONTEXT_RELATIONSHIPS }),
    ),
  },
  { additionalProperties: false },
);
export type TargetContext = Static<typeof TargetContext>;

const TargetNormalizedDimensions = Type.Object(
  {
    widthRatio: Type.Number({ minimum: 0, maximum: 1 }),
    heightRatio: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

const TargetNormalizedShape = Type.Object(
  {
    ...TargetNormalizedDimensions.properties,
    aspectRatio: Type.Number({ minimum: 0.01, maximum: 100 }),
    /** Present only inside a chosen semantic container, never for the viewport fallback. */
    centerXRatio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    centerYRatio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  },
  { additionalProperties: false },
);

export const TargetVisualRelation = Type.Object(
  {
    kind: TargetVisualRelationKind,
    reference: TargetVisualReferenceKind,
    referenceKey: Type.Optional(TargetStableKey),
    distanceBucket: Type.Optional(TargetVisualDistanceBucket),
    distanceRatio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  },
  { additionalProperties: false },
);
export type TargetVisualRelation = Static<typeof TargetVisualRelation>;

/**
 * Coarse, normalized visual grouping evidence. These ratios may rank or group
 * candidates but can never trigger an interaction. Absolute page/viewport
 * coordinates, screenshots, styles, and DOM geometry are intentionally absent.
 */
export const TargetVisualTopology = Type.Object(
  {
    viewportClass: TargetViewportClass,
    stateId: Type.Optional(TargetStableKey),
    target: TargetNormalizedShape,
    container: Type.Optional(TargetNormalizedDimensions),
    relations: Type.Optional(
      Type.Array(TargetVisualRelation, { maxItems: TARGET_MAX_VISUAL_RELATIONS }),
    ),
  },
  { additionalProperties: false },
);
export type TargetVisualTopology = Static<typeof TargetVisualTopology>;

export const TargetLayoutSlot = Type.Object(
  {
    siblingIndex: Type.Integer({ minimum: 0, maximum: TARGET_MAX_LAYOUT_SIBLINGS }),
    siblingCount: Type.Integer({ minimum: 1, maximum: TARGET_MAX_LAYOUT_SIBLINGS }),
  },
  { additionalProperties: false },
);
export type TargetLayoutSlot = Static<typeof TargetLayoutSlot>;

/**
 * Privacy-safe rendered evidence for presentation-only visual anchors. Hashes
 * are derived from bounded structural/appearance tokens; occupancyGrid is an
 * 8x8 descendant-layout bitmask. No text, CSS values, HTML, or coordinates are
 * persisted here.
 */
export const TargetVisualFingerprint = Type.Object(
  {
    viewportClass: TargetViewportClass,
    stateId: Type.Optional(TargetStableKey),
    structuralHash: Type.String({
      minLength: 16,
      maxLength: 16,
      pattern: TARGET_VISUAL_HASH_PATTERN,
    }),
    occupancyGrid: Type.String({
      minLength: 64,
      maxLength: 64,
      pattern: TARGET_OCCUPANCY_GRID_PATTERN,
    }),
    appearanceHash: Type.String({
      minLength: 16,
      maxLength: 16,
      pattern: TARGET_VISUAL_HASH_PATTERN,
    }),
    neighborhoodHash: Type.String({
      minLength: 16,
      maxLength: 16,
      pattern: TARGET_VISUAL_HASH_PATTERN,
    }),
    layoutSlot: Type.Optional(TargetLayoutSlot),
  },
  { additionalProperties: false },
);
export type TargetVisualFingerprint = Static<typeof TargetVisualFingerprint>;

export const TargetLocalizedEvidence = Type.Object(
  {
    locale: TargetLocale,
    accessibleName: Type.Optional(
      Type.String({ minLength: 1, maxLength: TARGET_LOCALIZED_TEXT_MAX_LENGTH }),
    ),
    label: Type.Optional(
      Type.String({ minLength: 1, maxLength: TARGET_LOCALIZED_TEXT_MAX_LENGTH }),
    ),
    placeholder: Type.Optional(
      Type.String({ minLength: 1, maxLength: TARGET_LOCALIZED_TEXT_MAX_LENGTH }),
    ),
    title: Type.Optional(
      Type.String({ minLength: 1, maxLength: TARGET_LOCALIZED_TEXT_MAX_LENGTH }),
    ),
    nearbyText: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: TARGET_LOCALIZED_TEXT_MAX_LENGTH }), {
        maxItems: TARGET_MAX_NEARBY_TEXT_ITEMS,
      }),
    ),
    /** Only the words every sample agreed on. Match by containment, not likeness. */
    partial: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type TargetLocalizedEvidence = Static<typeof TargetLocalizedEvidence>;

export const TargetCaptureEvidence = Type.Object(
  {
    sampleCount: Type.Integer({ minimum: 1, maximum: TARGET_MAX_CAPTURE_SAMPLES }),
    stableSignalFamilies: Type.Array(TargetSignalFamily, {
      maxItems: TARGET_SIGNAL_FAMILIES.length,
      uniqueItems: true,
    }),
    uniqueCandidateCount: Type.Integer({ minimum: 0, maximum: TARGET_MAX_CANDIDATE_COUNT }),
    /** Normalized difference between the selected candidate and its runner-up. */
    runnerUpMargin: Type.Number({ minimum: 0, maximum: 1 }),
    quality: TargetCaptureQuality,
    /**
     * True when candidate ambiguity is the *only* reason `quality` is `weak` —
     * the evidence itself is rich, stable and actionable, and several elements
     * simply cannot be told apart.
     *
     * Ambiguity is the one weakness an author can answer for (§4.4a), so this
     * is what lets a recorded `Target.selection` clear the publish gate without
     * also excusing thin evidence or a non-actionable element. Absent on capture
     * written before this field existed, which keeps those targets blocked.
     */
    ambiguityIsSoleWeakness: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type TargetCaptureEvidence = Static<typeof TargetCaptureEvidence>;

export const TargetDisplay = Type.Object(
  {
    /** Author-only copy; it must never participate in runtime resolution. */
    authorLabel: Type.String({ minLength: 1, maxLength: TARGET_AUTHOR_LABEL_MAX_LENGTH }),
  },
  { additionalProperties: false },
);
export type TargetDisplay = Static<typeof TargetDisplay>;

/**
 * Versioned, selector-free identity captured alongside the readable Phase 1
 * fingerprint. Locale text is supporting evidence only; display copy is never
 * resolver input. The outer Target.id and identity.targetId must agree.
 */
export const TargetIdentityV2 = Type.Object(
  {
    schemaVersion: Type.Literal(TARGET_IDENTITY_SCHEMA_VERSION),
    targetId: TargetIdentifier,
    intent: TargetIntent,
    invariants: TargetInvariants,
    semantics: TargetSemantics,
    context: TargetContext,
    /** Confirmed viewport/state variants used as supporting topology evidence. */
    visualTopologies: Type.Optional(
      Type.Array(TargetVisualTopology, {
        minItems: 1,
        maxItems: TARGET_MAX_VISUAL_TOPOLOGY_VARIANTS,
      }),
    ),
    visualFingerprints: Type.Optional(
      Type.Array(TargetVisualFingerprint, {
        minItems: 1,
        maxItems: TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS,
      }),
    ),
    localizedEvidence: Type.Array(TargetLocalizedEvidence, {
      maxItems: TARGET_MAX_LOCALE_VARIANTS,
    }),
    captureEvidence: TargetCaptureEvidence,
    display: TargetDisplay,
  },
  { $id: 'TargetIdentityV2', additionalProperties: false },
);
export type TargetIdentityV2 = Static<typeof TargetIdentityV2>;

/** Targeted runtime decoder; this schema contains no external references. */
export function isTargetIdentityV2(value: unknown): value is TargetIdentityV2 {
  return Value.Check(TargetIdentityV2, value);
}

/**
 * Semantic fingerprint of a host-page element (PRD §8.3).
 * The resolver scores candidates against this; CSS and coordinates are
 * diagnostic-only signals, never the primary resolution path.
 */
export const ElementFingerprint = Type.Object(
  {
    /** Optional: most pages carry no stable markers, and `{}` is not evidence. */
    stableAttributes: Type.Optional(Type.Record(Type.String(), Type.String())),
    role: Type.Optional(Type.String()),
    accessibleName: Type.Optional(Type.String()),
    tagName: Type.String(),
    inputType: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    placeholder: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    alt: Type.Optional(Type.String()),
    nearbyText: Type.Optional(Type.Array(Type.String())),
    ancestorLandmarks: Type.Optional(
      Type.Array(
        Type.Object(
          {
            role: Type.Optional(Type.String()),
            accessibleName: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
      ),
    ),
    relativePosition: Type.Optional(
      Type.Object(
        {
          parentRole: Type.Optional(Type.String()),
          siblingIndex: Type.Optional(Type.Number()),
        },
        { additionalProperties: false },
      ),
    ),
    scopedCss: Type.Optional(Type.String()),
    /** Diagnostic only — never used to trigger production clicks (PRD §8.4). */
    diagnosticCoordinates: Type.Optional(
      Type.Object({ x: Type.Number(), y: Type.Number() }, { additionalProperties: false }),
    ),
  },
  { $id: 'ElementFingerprint', additionalProperties: false },
);
export type ElementFingerprint = Static<typeof ElementFingerprint>;

/** Optional page-state hints used by the runtime lifecycle layer (PRD §8.6). */
export const RuntimeLifecycleHints = Type.Object(
  {
    expectedRoute: Type.Optional(Type.String()),
    /** Qualifies legacy waitForText; runtime compares it only in this locale. */
    waitForTextLocale: Type.Optional(TargetLocale),
    waitForText: Type.Optional(Type.String()),
    waitForElement: Type.Optional(Type.Ref(ElementFingerprint)),
    scrollContainer: Type.Optional(Type.Ref(ElementFingerprint)),
    scrollStrategy: Type.Optional(
      Type.Union([
        Type.Literal('nearest'),
        Type.Literal('top'),
        Type.Literal('center'),
        Type.Literal('bottom'),
        Type.Literal('virtualized-search'),
      ]),
    ),
    openPanel: Type.Optional(Type.Ref(ElementFingerprint)),
    selectTab: Type.Optional(Type.Ref(ElementFingerprint)),
    waitForNetworkIdle: Type.Optional(Type.Boolean()),
    timeoutMs: Type.Optional(Type.Number()),
  },
  { $id: 'RuntimeLifecycleHints', additionalProperties: false },
);
export type RuntimeLifecycleHints = Static<typeof RuntimeLifecycleHints>;

/**
 * Author intent about which match to take, kept out of the identity model so it
 * can never be mistaken for evidence. Answers the disambiguation question in
 * the creator's own words.
 */
export const TargetSelectionPolicy = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Union([
          Type.Literal('only'),
          Type.Literal('any-matching'),
          Type.Literal('first'),
          Type.Literal('last'),
        ]),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('ordinal'),
        position: Type.Integer({
          minimum: TARGET_SELECTION_ORDINAL_LIMITS.min,
          maximum: TARGET_SELECTION_ORDINAL_LIMITS.max,
        }),
        order: Type.Optional(
          Type.Union(TARGET_COLLECTION_ORDERS.map((value) => Type.Literal(value))),
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Union([
          Type.Literal('newest-in-collection'),
          Type.Literal('first-in-collection'),
        ]),
        /** Collection the rank is taken within, named by its own accessible label. */
        collectionLabel: Type.Optional(
          Type.String({ minLength: 1, maxLength: TARGET_AUTHOR_LABEL_MAX_LENGTH }),
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('within-container'),
        containerLabel: Type.String({
          minLength: 1,
          maxLength: TARGET_AUTHOR_LABEL_MAX_LENGTH,
        }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'TargetSelectionPolicy' },
);
export type TargetSelectionPolicy = Static<typeof TargetSelectionPolicy>;

/**
 * Whether an author's answer is one the runtime can actually act on.
 *
 * `only` — "just the one I clicked" — is the absence of an answer: when the
 * evidence genuinely cannot separate the candidates there is nothing for the
 * resolver to apply, so it abstains and the target stays blocked. Every other
 * policy names a rule the resolver can follow. The conditional ones (a named
 * collection or container, `recency` order) can still fail against a live page;
 * that failure surfaces as an `ambiguous` verification diagnostic rather than
 * as a capture-time guess.
 */
export function selectionSettlesAmbiguity(policy: TargetSelectionPolicy | undefined): boolean {
  return Boolean(policy) && policy?.kind !== 'only';
}

/**
 * A target binds a Lodariq block to a host-page element. The canonical model
 * stores the fingerprint plus optional lifecycle hints; the resolver turns
 * this into a live element at runtime.
 */
export const Target = Type.Object(
  {
    id: Type.String(),
    fingerprint: Type.Ref(ElementFingerprint),
    /** Additive V2 identity; legacy fingerprints remain required and readable. */
    identity: Type.Optional(Type.Ref(TargetIdentityV2)),
    lifecycle: Type.Optional(Type.Ref(RuntimeLifecycleHints)),
    /** How to choose when evidence cannot separate candidates. Defaults to `only`. */
    selection: Type.Optional(Type.Ref(TargetSelectionPolicy)),
    /** How the runtime reaches this target when it is not on the current screen. */
    approach: Type.Optional(Type.Ref(TargetApproach)),
  },
  { $id: 'Target', additionalProperties: false },
);
export type Target = Static<typeof Target>;

export function sanitizeTargetSelectionPolicy(value: unknown): TargetSelectionPolicy | undefined {
  if (!Value.Check(TargetSelectionPolicy, [], value)) return undefined;
  return structuredClone(value as TargetSelectionPolicy);
}
