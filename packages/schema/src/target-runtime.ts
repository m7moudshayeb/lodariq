import { isPageKey, TARGET_PAGE_MATCHES } from './page-key';

export const TARGET_IDENTITY_SCHEMA_VERSION = 2 as const;

export const TARGET_ELEMENT_KINDS = ['control', 'field', 'content', 'container'] as const;
export const TARGET_REQUIRED_ACTIONS = ['anchor', 'observe-click', 'focus', 'input'] as const;
export const TARGET_RESOLUTION_MODES = ['semantic', 'visual-anchor', 'layout-slot'] as const;

/**
 * Which match to take when the evidence genuinely cannot separate several
 * candidates. `only` is the default and keeps today's behaviour: ambiguity is
 * reported, never guessed. The rest are explicit author answers to the
 * disambiguation question, and the data-relative ones survive the data
 * changing — which happens far more often than the UI changing.
 */
export const TARGET_SELECTION_KINDS = [
  'only',
  'any-matching',
  'ordinal',
  'first',
  'last',
  'newest-in-collection',
  'first-in-collection',
  'within-container',
] as const;
export const TARGET_SELECTION_ORDINAL_LIMITS = { min: 1, max: 50 } as const;
/** Collection ordering signals a data-relative selection may rank on. */
export const TARGET_COLLECTION_ORDERS = ['reading-order', 'recency'] as const;
export const TARGET_RELATIONSHIP_KINDS = [
  'inside',
  'labelled-by',
  'near-heading',
  'same-group',
] as const;
export const TARGET_CONTEXT_GROUP_ROLES = [
  'form',
  'group',
  'list',
  'listbox',
  'menu',
  'radiogroup',
  'tablist',
  'toolbar',
  'tree',
] as const;
export const TARGET_SIGNAL_FAMILIES = [
  'registry-contract',
  'configured-attribute',
  'semantic-attribute',
  'element-semantics',
  'ancestor-context',
  'relationship-context',
  'visual-topology',
  'visual-structure',
  'visual-appearance',
  'visual-neighborhood',
  'layout-slot',
  'sibling-position',
  'localized-text',
] as const;
export const TARGET_CAPTURE_QUALITIES = ['strong', 'usable', 'weak'] as const;
export const TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN = 0.15;
export const TARGET_VIEWPORT_CLASSES = ['mobile', 'tablet', 'desktop'] as const;
export const TARGET_VIEWPORT_BREAKPOINTS = {
  mobileMaxWidth: 767,
  tabletMaxWidth: 1_099,
} as const;
export const TARGET_VISUAL_RELATION_KINDS = [
  'inside',
  'left-of',
  'right-of',
  'above',
  'below',
  'aligned-x',
  'aligned-y',
] as const;
export const TARGET_VISUAL_REFERENCE_KINDS = ['container', 'viewport', 'semantic-peer'] as const;
export const TARGET_VISUAL_DISTANCE_BUCKETS = ['near', 'medium', 'far'] as const;

/**
 * Shared evidence calibration keeps authoring capture and live resolution from
 * disagreeing about whether the runner-up is safely far enough behind.
 */
export const TARGET_IDENTITY_SCORE_BY_FAMILY = {
  'registry-contract': 90,
  'configured-attribute': 75,
  'semantic-attribute': 45,
  'element-semantics': 30,
  'ancestor-context': 25,
  'relationship-context': 30,
  'visual-topology': 12,
  'visual-structure': 24,
  'visual-appearance': 18,
  'visual-neighborhood': 22,
  'layout-slot': 35,
  /*
   * Enough to separate two candidates nothing else can separate, and never more.
   *
   * `TARGET_MAX_RESOLUTION_RUNNER_UP_MARGIN` caps the gap a winner must open over
   * its runner-up at 30, so one confirmed positional match (30 × the stable
   * multiplier = 33) always clears it, while an identity built on position plus
   * one other family cannot: `sibling-position` is excluded from the independent
   * family count on both sides. It decides ties; it does not establish identity.
   */
  'sibling-position': 30,
  'localized-text': 15,
} as const satisfies Readonly<Record<(typeof TARGET_SIGNAL_FAMILIES)[number], number>>;
export const TARGET_STABLE_SIGNAL_MULTIPLIER = 1.1;
export const TARGET_UNCONFIRMED_SIGNAL_MULTIPLIER = 0.65;
export const TARGET_MIN_RESOLUTION_RUNNER_UP_MARGIN = 15;
export const TARGET_MAX_RESOLUTION_RUNNER_UP_MARGIN = 30;
export const TARGET_MIN_RESOLUTION_RUNNER_UP_RATIO = 0.15;

/**
 * Every container between the element and its captured context, and every
 * captured container the element does not have at all, costs it this much
 * agreement.
 *
 * Calibrated against the runner-up margin, not picked for feel: `ancestor-context`
 * scores 25, so a direct match is 27.5 with the stable multiplier and one level
 * of indirection is 8.25. The 19.25 between them clears the margin a winner must
 * open over its runner-up, which is 15 at the floor and about 16.5 for a control
 * carrying two other families. Anything softer and the two still tie.
 */
export const TARGET_ANCESTOR_INDIRECTION_DECAY = 0.3;

/**
 * How well a candidate's ancestor roles agree with the captured ones, read from
 * the element outwards. 1 when the captured chain sits directly above it, less
 * the further out it had to be found, 0 when it is not there at all.
 *
 * The nearest containers are the ones that say what an element *is*. Asking only
 * whether the captured roles appear in order somewhere above made a toolbar
 * button captured under `main` score identically to every row menu buried in a
 * `table` inside `main` — ten indistinguishable candidates on a page with one
 * toolbar. Depth is not a detail here; it is the difference.
 *
 * Shared so capture and resolution cannot disagree about it.
 */
export function ancestorContextSimilarity(
  expected: readonly string[],
  actual: readonly string[],
): number {
  if (expected.length === 0) return 0;
  let index = 0;
  let matched = 0;
  let skipped = 0;
  let missing = 0;
  for (const role of expected) {
    let cursor = index;
    let pending = 0;
    while (cursor < actual.length && actual[cursor] !== role) {
      // A repeat of the role just matched is one container reported twice, not a
      // step further out: capture folds those away and resolution does not.
      if (actual[cursor] !== actual[cursor - 1]) pending += 1;
      cursor += 1;
    }
    // Absent entirely: costs a step like any other disagreement, and the walk
    // that failed to find it is not charged on top. Letting it cost nothing put
    // an element with no `article` above one that had it a container further
    // out — the opposite of what depth is being measured for.
    if (cursor >= actual.length) {
      missing += 1;
      continue;
    }
    index = cursor + 1;
    skipped += pending;
    matched += 1;
  }
  return matched === 0
    ? 0
    : (matched / expected.length) * TARGET_ANCESTOR_INDIRECTION_DECAY ** (skipped + missing);
}

const MIN_STABLE_TEXT_LENGTH = 2;

/**
 * The words every sample agreed on. What differs between samples is data; what
 * survives all of them is the label. `partial` marks the result a fragment.
 */
export function stableTextAcrossSamples(
  values: readonly (string | undefined)[],
): { readonly text: string; readonly partial: boolean } | null {
  if (values.length === 0) return null;
  // Absent from any sample means the field is not reliably there.
  const present: string[] = [];
  for (const value of values) {
    const trimmed = value?.replace(/\s+/g, ' ').trim();
    if (!trimmed) return null;
    present.push(trimmed);
  }
  const first = present[0]!;
  if (present.every((value) => value === first)) return { text: first, partial: false };

  const shared = present.slice(1).reduce<Set<string>>((carried, value) => {
    const words = new Set(textShapeWords(value));
    return new Set([...carried].filter((word) => words.has(word)));
  }, new Set(textShapeWords(first)));

  const kept = first.split(' ').filter((word) => {
    const normalized = textShapeWord(word);
    return normalized !== null && shared.has(normalized);
  });
  const text = kept.join(' ').trim();
  // Nothing held still: a name, a total, a timestamp. Storing it stores data.
  return text.length >= MIN_STABLE_TEXT_LENGTH ? { text, partial: true } : null;
}

function textShapeWords(value: string): string[] {
  return value
    .split(' ')
    .map(textShapeWord)
    .filter((word): word is string => word !== null);
}

/** Case and punctuation write the same word twice, not two words. */
function textShapeWord(value: string): string | null {
  const stripped = value.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Deliberately excludes class, style, href, src, action, and selector-shaped
 * keys. Target identity may retain narrow semantic attributes, never raw CSS,
 * HTML, URLs, or DOM snapshots.
 */
export const TARGET_CONFIGURED_ATTRIBUTE_NAME_PATTERN =
  '^(?:id|name|data-[a-z][a-z0-9_.:-]{0,62})$';
export const TARGET_SEMANTIC_ATTRIBUTE_NAME_PATTERN =
  '^(?:name|type|for|autocomplete|aria-(?:controls|details|haspopup|multiline|orientation|owns))$';

/** Practical BCP 47 envelope; runtime canonicalizes casing and aliases. */
export const TARGET_LOCALE_PATTERN = '^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$';

export const TARGET_ID_MAX_LENGTH = 256;
export const TARGET_KEY_MAX_LENGTH = 128;
export const TARGET_ATTRIBUTE_VALUE_MAX_LENGTH = 512;
export const TARGET_LOCALIZED_TEXT_MAX_LENGTH = 1_024;
export const TARGET_AUTHOR_LABEL_MAX_LENGTH = 256;
export const TARGET_MAX_CONFIGURED_ATTRIBUTES = 24;
export const TARGET_MAX_CONTEXT_RELATIONSHIPS = 12;
export const TARGET_MAX_ANCESTOR_ROLES = 12;
export const TARGET_MAX_LOCALE_VARIANTS = 32;
export const TARGET_MAX_NEARBY_TEXT_ITEMS = 8;
export const TARGET_MAX_CAPTURE_SAMPLES = 10_000;
export const TARGET_MAX_CANDIDATE_COUNT = 10_000;
export const TARGET_MAX_VISUAL_RELATIONS = 16;
export const TARGET_MAX_VISUAL_TOPOLOGY_VARIANTS = 12;
export const TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS = 12;
export const TARGET_MAX_LAYOUT_SIBLINGS = 10_000;
export const TARGET_VISUAL_HASH_PATTERN = '^[0-9a-f]{16}$';
export const TARGET_OCCUPANCY_GRID_PATTERN = '^[01]{64}$';
export const TARGET_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]*$';
export const TARGET_KEY_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]*$';
export const TARGET_ROLE_PATTERN = '^[a-z][a-z0-9-]*$';
export const TARGET_ATTRIBUTE_VALUE_PATTERN =
  '^(?![A-Za-z][A-Za-z0-9+.-]*:)(?!.*[\\\\/<>?\\r\\n])[^\\r\\n]+$';

const TARGET_ID_REGEX = new RegExp(TARGET_ID_PATTERN);
const TARGET_KEY_REGEX = new RegExp(TARGET_KEY_PATTERN);
const TARGET_ROLE_REGEX = new RegExp(TARGET_ROLE_PATTERN);
const TARGET_LOCALE_REGEX = new RegExp(TARGET_LOCALE_PATTERN);
const TARGET_CONFIGURED_ATTRIBUTE_NAME_REGEX = new RegExp(TARGET_CONFIGURED_ATTRIBUTE_NAME_PATTERN);
const TARGET_SEMANTIC_ATTRIBUTE_NAME_REGEX = new RegExp(TARGET_SEMANTIC_ATTRIBUTE_NAME_PATTERN);
const TARGET_ATTRIBUTE_VALUE_REGEX = new RegExp(TARGET_ATTRIBUTE_VALUE_PATTERN);
const TARGET_ELEMENT_KIND_SET = new Set<string>(TARGET_ELEMENT_KINDS);
const TARGET_REQUIRED_ACTION_SET = new Set<string>(TARGET_REQUIRED_ACTIONS);
const TARGET_RESOLUTION_MODE_SET = new Set<string>(TARGET_RESOLUTION_MODES);
const TARGET_RELATIONSHIP_KIND_SET = new Set<string>(TARGET_RELATIONSHIP_KINDS);
const TARGET_SIGNAL_FAMILY_SET = new Set<string>(TARGET_SIGNAL_FAMILIES);
const TARGET_CAPTURE_QUALITY_SET = new Set<string>(TARGET_CAPTURE_QUALITIES);
const TARGET_VIEWPORT_CLASS_SET = new Set<string>(TARGET_VIEWPORT_CLASSES);
const TARGET_VISUAL_RELATION_KIND_SET = new Set<string>(TARGET_VISUAL_RELATION_KINDS);
const TARGET_VISUAL_REFERENCE_KIND_SET = new Set<string>(TARGET_VISUAL_REFERENCE_KINDS);
const TARGET_VISUAL_DISTANCE_BUCKET_SET = new Set<string>(TARGET_VISUAL_DISTANCE_BUCKETS);
const TARGET_PAGE_MATCH_SET = new Set<string>(TARGET_PAGE_MATCHES);
const TARGET_VISUAL_HASH_REGEX = new RegExp(TARGET_VISUAL_HASH_PATTERN);
const TARGET_OCCUPANCY_GRID_REGEX = new RegExp(TARGET_OCCUPANCY_GRID_PATTERN);

/**
 * Lightweight browser envelope guard for the fields consumed by the resolver.
 * The canonical security and persistence boundary remains the TypeBox
 * `TargetIdentityV2` schema; this guard prevents malformed delivery data from
 * reaching DOM resolution without shipping TypeBox to every customer page.
 */
export function hasTargetIdentityV2Envelope(value: unknown): boolean {
  if (!isObjectWithKeys(value, TARGET_IDENTITY_KEYS)) return false;
  return (
    value.schemaVersion === TARGET_IDENTITY_SCHEMA_VERSION &&
    isBoundedString(value.targetId, TARGET_ID_MAX_LENGTH, TARGET_ID_REGEX) &&
    hasTargetIntentEnvelope(value.intent) &&
    hasTargetInvariantsEnvelope(value.invariants) &&
    hasTargetSemanticsEnvelope(value.semantics) &&
    hasTargetContextEnvelope(value.context) &&
    isOptionalArray(
      value.visualTopologies,
      1,
      TARGET_MAX_VISUAL_TOPOLOGY_VARIANTS,
      hasTargetVisualTopologyEnvelope,
    ) &&
    isOptionalArray(
      value.visualFingerprints,
      1,
      TARGET_MAX_VISUAL_FINGERPRINT_VARIANTS,
      hasTargetVisualFingerprintEnvelope,
    ) &&
    isArrayOf(
      value.localizedEvidence,
      0,
      TARGET_MAX_LOCALE_VARIANTS,
      hasLocalizedEvidenceEnvelope,
    ) &&
    hasCaptureEvidenceEnvelope(value.captureEvidence) &&
    isObjectWithKeys(value.display, TARGET_DISPLAY_KEYS) &&
    isBoundedString(value.display.authorLabel, TARGET_AUTHOR_LABEL_MAX_LENGTH)
  );
}

const TARGET_IDENTITY_KEYS = new Set([
  'schemaVersion',
  'targetId',
  'intent',
  'invariants',
  'semantics',
  'context',
  'visualTopologies',
  'visualFingerprints',
  'localizedEvidence',
  'captureEvidence',
  'display',
]);
const TARGET_INTENT_KEYS = new Set(['elementKind', 'requiredAction', 'resolutionMode']);
const TARGET_INVARIANT_KEYS = new Set([
  'registryKey',
  'configuredAttributes',
  'semanticAttributes',
]);
const TARGET_SEMANTICS_KEYS = new Set(['tagName', 'role', 'inputType', 'controlGroup']);
const TARGET_CONTEXT_KEYS = new Set([
  'page',
  'routePatternId',
  'stateId',
  'ancestorRoles',
  'relationships',
]);
const TARGET_PAGE_SCOPE_KEYS = new Set(['key', 'match']);
const TARGET_RELATIONSHIP_KEYS = new Set(['kind', 'semanticRole', 'stableKey']);
const TARGET_TOPOLOGY_KEYS = new Set([
  'viewportClass',
  'stateId',
  'target',
  'container',
  'relations',
]);
const TARGET_SHAPE_KEYS = new Set([
  'widthRatio',
  'heightRatio',
  'aspectRatio',
  'centerXRatio',
  'centerYRatio',
]);
const TARGET_DIMENSION_KEYS = new Set(['widthRatio', 'heightRatio']);
const TARGET_VISUAL_RELATION_KEYS = new Set([
  'kind',
  'reference',
  'referenceKey',
  'distanceBucket',
  'distanceRatio',
]);
const TARGET_VISUAL_FINGERPRINT_KEYS = new Set([
  'viewportClass',
  'stateId',
  'structuralHash',
  'occupancyGrid',
  'appearanceHash',
  'neighborhoodHash',
  'layoutSlot',
]);
const TARGET_LAYOUT_SLOT_KEYS = new Set(['siblingIndex', 'siblingCount']);
const TARGET_LOCALIZED_EVIDENCE_KEYS = new Set([
  'locale',
  'accessibleName',
  'label',
  'placeholder',
  'title',
  'nearbyText',
  'partial',
]);
const TARGET_CAPTURE_EVIDENCE_KEYS = new Set([
  'sampleCount',
  'stableSignalFamilies',
  'uniqueCandidateCount',
  'runnerUpMargin',
  'quality',
  'ambiguityIsSoleWeakness',
]);
const TARGET_DISPLAY_KEYS = new Set(['authorLabel']);

function hasTargetIntentEnvelope(value: unknown): boolean {
  if (!(
    isObjectWithKeys(value, TARGET_INTENT_KEYS) &&
    isMember(value.elementKind, TARGET_ELEMENT_KIND_SET) &&
    isOptionalMember(value.requiredAction, TARGET_REQUIRED_ACTION_SET) &&
    isOptionalMember(value.resolutionMode, TARGET_RESOLUTION_MODE_SET)
  ))
    return false;
  if (value.resolutionMode === 'visual-anchor' || value.resolutionMode === 'layout-slot') {
    return value.requiredAction === undefined || value.requiredAction === 'anchor';
  }
  return true;
}

function hasTargetInvariantsEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_INVARIANT_KEYS) &&
    isOptionalBoundedString(value.registryKey, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX) &&
    isOptionalAttributeRecord(value.configuredAttributes, TARGET_CONFIGURED_ATTRIBUTE_NAME_REGEX) &&
    isOptionalAttributeRecord(value.semanticAttributes, TARGET_SEMANTIC_ATTRIBUTE_NAME_REGEX)
  );
}

function hasTargetSemanticsEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_SEMANTICS_KEYS) &&
    isOptionalBoundedString(value.tagName, 64, TARGET_ROLE_REGEX) &&
    isOptionalBoundedString(value.role, 64, TARGET_ROLE_REGEX) &&
    isOptionalBoundedString(value.inputType, 64, TARGET_ROLE_REGEX) &&
    isOptionalBoundedString(value.controlGroup, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX)
  );
}

function hasTargetContextEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_CONTEXT_KEYS) &&
    (value.page === undefined || hasTargetPageScopeEnvelope(value.page)) &&
    isOptionalBoundedString(value.routePatternId, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX) &&
    isOptionalBoundedString(value.stateId, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX) &&
    isOptionalUniqueStringArray(
      value.ancestorRoles,
      TARGET_MAX_ANCESTOR_ROLES,
      TARGET_ROLE_REGEX,
    ) &&
    isOptionalArray(
      value.relationships,
      0,
      TARGET_MAX_CONTEXT_RELATIONSHIPS,
      hasTargetRelationshipEnvelope,
    )
  );
}

function hasTargetPageScopeEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_PAGE_SCOPE_KEYS) &&
    isPageKey(value.key) &&
    isOptionalMember(value.match, TARGET_PAGE_MATCH_SET)
  );
}

function hasTargetRelationshipEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_RELATIONSHIP_KEYS) &&
    isMember(value.kind, TARGET_RELATIONSHIP_KIND_SET) &&
    isOptionalBoundedString(value.semanticRole, 64, TARGET_ROLE_REGEX) &&
    isOptionalBoundedString(value.stableKey, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX)
  );
}

function hasTargetVisualTopologyEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_TOPOLOGY_KEYS) &&
    isMember(value.viewportClass, TARGET_VIEWPORT_CLASS_SET) &&
    isOptionalBoundedString(value.stateId, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX) &&
    hasNormalizedShapeEnvelope(value.target) &&
    (value.container === undefined || hasNormalizedDimensionsEnvelope(value.container)) &&
    isOptionalArray(
      value.relations,
      0,
      TARGET_MAX_VISUAL_RELATIONS,
      hasTargetVisualRelationEnvelope,
    )
  );
}

function hasTargetVisualFingerprintEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_VISUAL_FINGERPRINT_KEYS) &&
    isMember(value.viewportClass, TARGET_VIEWPORT_CLASS_SET) &&
    isOptionalBoundedString(value.stateId, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX) &&
    isBoundedString(value.structuralHash, 16, TARGET_VISUAL_HASH_REGEX) &&
    isBoundedString(value.occupancyGrid, 64, TARGET_OCCUPANCY_GRID_REGEX) &&
    isBoundedString(value.appearanceHash, 16, TARGET_VISUAL_HASH_REGEX) &&
    isBoundedString(value.neighborhoodHash, 16, TARGET_VISUAL_HASH_REGEX) &&
    (value.layoutSlot === undefined || hasTargetLayoutSlotEnvelope(value.layoutSlot))
  );
}

function hasTargetLayoutSlotEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_LAYOUT_SLOT_KEYS) &&
    isIntegerInRange(value.siblingIndex, 0, TARGET_MAX_LAYOUT_SIBLINGS) &&
    isIntegerInRange(value.siblingCount, 1, TARGET_MAX_LAYOUT_SIBLINGS)
  );
}

function hasNormalizedShapeEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_SHAPE_KEYS) &&
    hasNormalizedDimensionValues(value) &&
    isNumberInRange(value.aspectRatio, 0.01, 100) &&
    isOptionalNumberInRange(value.centerXRatio, 0, 1) &&
    isOptionalNumberInRange(value.centerYRatio, 0, 1)
  );
}

function hasNormalizedDimensionsEnvelope(value: unknown): boolean {
  return isObjectWithKeys(value, TARGET_DIMENSION_KEYS) && hasNormalizedDimensionValues(value);
}

function hasNormalizedDimensionValues(value: Record<string, unknown>): boolean {
  return isNumberInRange(value.widthRatio, 0, 1) && isNumberInRange(value.heightRatio, 0, 1);
}

function hasTargetVisualRelationEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_VISUAL_RELATION_KEYS) &&
    isMember(value.kind, TARGET_VISUAL_RELATION_KIND_SET) &&
    isMember(value.reference, TARGET_VISUAL_REFERENCE_KIND_SET) &&
    isOptionalBoundedString(value.referenceKey, TARGET_KEY_MAX_LENGTH, TARGET_KEY_REGEX) &&
    isOptionalMember(value.distanceBucket, TARGET_VISUAL_DISTANCE_BUCKET_SET) &&
    isOptionalNumberInRange(value.distanceRatio, 0, 1)
  );
}

function hasLocalizedEvidenceEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_LOCALIZED_EVIDENCE_KEYS) &&
    isBoundedString(value.locale, 64, TARGET_LOCALE_REGEX) &&
    isOptionalBoundedString(value.accessibleName, TARGET_LOCALIZED_TEXT_MAX_LENGTH) &&
    isOptionalBoundedString(value.label, TARGET_LOCALIZED_TEXT_MAX_LENGTH) &&
    isOptionalBoundedString(value.placeholder, TARGET_LOCALIZED_TEXT_MAX_LENGTH) &&
    isOptionalBoundedString(value.title, TARGET_LOCALIZED_TEXT_MAX_LENGTH) &&
    isOptionalArray(value.nearbyText, 0, TARGET_MAX_NEARBY_TEXT_ITEMS, (item) =>
      isBoundedString(item, TARGET_LOCALIZED_TEXT_MAX_LENGTH),
    ) &&
    (value.partial === undefined || typeof value.partial === 'boolean')
  );
}

function hasCaptureEvidenceEnvelope(value: unknown): boolean {
  return (
    isObjectWithKeys(value, TARGET_CAPTURE_EVIDENCE_KEYS) &&
    isIntegerInRange(value.sampleCount, 1, TARGET_MAX_CAPTURE_SAMPLES) &&
    isUniqueMemberArray(
      value.stableSignalFamilies,
      TARGET_SIGNAL_FAMILIES.length,
      TARGET_SIGNAL_FAMILY_SET,
    ) &&
    isIntegerInRange(value.uniqueCandidateCount, 0, TARGET_MAX_CANDIDATE_COUNT) &&
    isNumberInRange(value.runnerUpMargin, 0, 1) &&
    isMember(value.quality, TARGET_CAPTURE_QUALITY_SET) &&
    isOptionalBoolean(value.ambiguityIsSoleWeakness)
  );
}

function isObjectWithKeys(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  );
}

function isBoundedString(value: unknown, maxLength: number, pattern?: RegExp): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maxLength &&
    (pattern?.test(value) ?? true)
  );
}

function isOptionalBoundedString(value: unknown, maxLength: number, pattern?: RegExp): boolean {
  return value === undefined || isBoundedString(value, maxLength, pattern);
}

function isOptionalAttributeRecord(value: unknown, keyPattern: RegExp): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= TARGET_MAX_CONFIGURED_ATTRIBUTES &&
    entries.every(
      ([key, entryValue]) =>
        keyPattern.test(key) &&
        isBoundedString(
          entryValue,
          TARGET_ATTRIBUTE_VALUE_MAX_LENGTH,
          TARGET_ATTRIBUTE_VALUE_REGEX,
        ),
    )
  );
}

function isMember(value: unknown, allowedValues: ReadonlySet<string>): value is string {
  return typeof value === 'string' && allowedValues.has(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalMember(value: unknown, allowedValues: ReadonlySet<string>): boolean {
  return value === undefined || isMember(value, allowedValues);
}

function isNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function isOptionalNumberInRange(value: unknown, minimum: number, maximum: number): boolean {
  return value === undefined || isNumberInRange(value, minimum, maximum);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && isNumberInRange(value, minimum, maximum);
}

function isArrayOf(
  value: unknown,
  minimum: number,
  maximum: number,
  predicate: (item: unknown) => boolean,
): value is unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value) || !predicate(value[index])) {
      return false;
    }
  }

  return true;
}

function isOptionalArray(
  value: unknown,
  minimum: number,
  maximum: number,
  predicate: (item: unknown) => boolean,
): boolean {
  return value === undefined || isArrayOf(value, minimum, maximum, predicate);
}

function isOptionalUniqueStringArray(value: unknown, maximum: number, pattern: RegExp): boolean {
  return (
    value === undefined ||
    (isArrayOf(value, 0, maximum, (item) => isBoundedString(item, 64, pattern)) &&
      new Set(value).size === value.length)
  );
}

function isUniqueMemberArray(
  value: unknown,
  maximum: number,
  allowedValues: ReadonlySet<string>,
): boolean {
  return (
    isArrayOf(value, 0, maximum, (item) => isMember(item, allowedValues)) &&
    new Set(value).size === value.length
  );
}
