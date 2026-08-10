import {
  BRAND_DRIFT_MAX_AFFECTED_EXPERIENCES,
  BRAND_DRIFT_SEMANTIC_ROLES,
  PRODUCT_STYLE_SOURCE_PRIORITY,
  type BrandDriftAccessibilityConsequence,
  type BrandDriftAffectedExperience,
  type BrandDriftAuditReport,
  type BrandDriftCheckResult,
  type BrandDriftSemanticRole,
  type BrandDriftSourceComparison,
  type BrandDriftTrigger,
  type BrandThemeSnapshot,
  type ProductStyleProposal,
  type ProductStyleSource,
  type ThemeTokens,
} from './brand';

const ACTIONABLE_CONFIDENCE = 85;

const COLOR_ROLE_KEYS = {
  accent: ['accent', 'accentHover', 'onAccent'],
  surface: ['surface', 'surfaceRaised', 'surfaceInverse'],
  text: ['text', 'textMuted', 'textInverse'],
  focus: ['focus'],
  status: ['success', 'onSuccess', 'warning', 'onWarning', 'danger', 'onDanger'],
} as const satisfies Record<
  Extract<BrandDriftSemanticRole, 'accent' | 'surface' | 'text' | 'focus' | 'status'>,
  readonly string[]
>;

const TOKEN_GROUP_ROLES = {
  typography: 'typography',
  spacing: 'spacing',
  radius: 'radii',
  border: 'borders',
  sizing: 'sizing',
  motion: 'motion',
  elevation: 'elevations',
} as const satisfies Record<
  Extract<
    BrandDriftSemanticRole,
    'typography' | 'spacing' | 'radius' | 'border' | 'sizing' | 'motion' | 'elevation'
  >,
  keyof ThemeTokens
>;

export interface ClassifyBrandDriftInput {
  checkId: string;
  checkedAt: string;
  trigger: BrandDriftTrigger;
  baselineTheme: BrandThemeSnapshot;
  baselineSources: readonly ProductStyleSource[];
  observedProposal: ProductStyleProposal;
  affectedExperiences?: readonly BrandDriftAffectedExperience[];
}

/**
 * Compares bounded normalized evidence only. This module has no DOM, browser,
 * persistence, approval, or publication capability, so detection cannot mutate
 * a draft, approved theme, or live artifact.
 */
export function classifyBrandDrift(input: ClassifyBrandDriftInput): BrandDriftCheckResult {
  const sourceComparisons = compareBrandSourceFingerprints(
    input.baselineSources,
    input.observedProposal.sources,
  );
  const changedRoles = changedSemanticRoles(input.baselineTheme, input.observedProposal);
  const classification = driftClassification(
    sourceComparisons,
    changedRoles,
    input.observedProposal,
    input.baselineSources.length > 0,
  );
  const confidence = driftConfidence(sourceComparisons, input.observedProposal.confidence);
  const common = {
    schemaVersion: '1' as const,
    checkId: input.checkId,
    checkedAt: input.checkedAt,
    trigger: input.trigger,
    themeId: input.baselineTheme.themeId,
    baselineThemeVersionId: input.baselineTheme.themeVersionId,
    confidence,
    sourceComparisons,
    changedRoles,
    accessibilityConsequences: accessibilityConsequences(changedRoles),
    affectedExperiences:
      classification === 'actionable'
        ? normalizeAffectedExperiences(input.affectedExperiences ?? [])
        : [],
  };

  if (classification === 'actionable') {
    return {
      ...common,
      classification,
      proposal: structuredClone(input.observedProposal),
    };
  }
  return { ...common, classification };
}

export function createBrandDriftAuditReport(
  result: BrandDriftCheckResult,
): BrandDriftAuditReport {
  return {
    schemaVersion: result.schemaVersion,
    checkId: result.checkId,
    checkedAt: result.checkedAt,
    trigger: result.trigger,
    themeId: result.themeId,
    baselineThemeVersionId: result.baselineThemeVersionId,
    classification: result.classification,
    confidence: result.confidence,
    sourceComparisons: structuredClone(result.sourceComparisons),
    changedRoles: [...result.changedRoles],
    accessibilityConsequences: structuredClone(result.accessibilityConsequences),
    affectedExperiences: structuredClone(result.affectedExperiences),
  };
}

export function compareBrandSourceFingerprints(
  baselineSources: readonly ProductStyleSource[],
  observedSources: readonly ProductStyleSource[],
): BrandDriftSourceComparison[] {
  const baseline = sourceMap(baselineSources);
  const observed = sourceMap(observedSources);
  const keys = [...new Set([...baseline.keys(), ...observed.keys()])].sort(compareSourceKeys);
  const comparisons: BrandDriftSourceComparison[] = [];

  for (const key of keys) {
    const previous = baseline.get(key);
    const current = observed.get(key);
    if (previous && current && previous.fingerprintHash === current.fingerprintHash) continue;
    if (!previous && current) {
      comparisons.push({
        sourceId: current.sourceId,
        kind: current.kind,
        change: 'added',
        confidence: current.confidence,
        observedFingerprintHash: current.fingerprintHash,
        ...(current.revision ? { observedRevision: current.revision } : {}),
      });
      continue;
    }
    if (previous && !current) {
      comparisons.push({
        sourceId: previous.sourceId,
        kind: previous.kind,
        change: 'removed',
        confidence: previous.confidence,
        previousFingerprintHash: previous.fingerprintHash,
        ...(previous.revision ? { previousRevision: previous.revision } : {}),
      });
      continue;
    }
    if (previous && current) {
      comparisons.push({
        sourceId: current.sourceId,
        kind: current.kind,
        change: 'changed',
        confidence: Math.min(previous.confidence, current.confidence),
        previousFingerprintHash: previous.fingerprintHash,
        observedFingerprintHash: current.fingerprintHash,
        ...(previous.revision ? { previousRevision: previous.revision } : {}),
        ...(current.revision ? { observedRevision: current.revision } : {}),
      });
    }
  }

  return comparisons;
}

export function changedSemanticRoles(
  baselineTheme: BrandThemeSnapshot,
  proposal: ProductStyleProposal,
): BrandDriftSemanticRole[] {
  const baseline = baselineTheme.definition.tokens;
  const proposed = mergeThemeTokens(baseline, proposal);
  const changed = new Set<BrandDriftSemanticRole>();

  for (const [role, keys] of Object.entries(COLOR_ROLE_KEYS) as Array<
    [keyof typeof COLOR_ROLE_KEYS, readonly string[]]
  >) {
    if (colorRoleChanged(baseline, proposed, keys)) changed.add(role);
  }
  for (const [role, group] of Object.entries(TOKEN_GROUP_ROLES) as Array<
    [keyof typeof TOKEN_GROUP_ROLES, (typeof TOKEN_GROUP_ROLES)[keyof typeof TOKEN_GROUP_ROLES]]
  >) {
    if (!equalCanonical(baseline[group], proposed[group])) changed.add(role);
  }

  return BRAND_DRIFT_SEMANTIC_ROLES.filter((role) => changed.has(role));
}

function driftClassification(
  comparisons: readonly BrandDriftSourceComparison[],
  changedRoles: readonly BrandDriftSemanticRole[],
  proposal: ProductStyleProposal,
  hasBaseline: boolean,
): 'unchanged' | 'warning' | 'actionable' {
  const meaningfulComparisons = comparisons.filter((comparison) => comparison.kind !== 'fallback');
  if (meaningfulComparisons.length === 0 && changedRoles.length === 0) return 'unchanged';
  if (!hasBaseline) return 'warning';
  if (changedRoles.length === 0 || meaningfulComparisons.length === 0) return 'warning';

  const strongSourceChanged = meaningfulComparisons.some(
    (comparison) =>
      comparison.kind === 'registered_tokens' ||
      (comparison.kind === 'selected_element' && comparison.confidence >= ACTIONABLE_CONFIDENCE),
  );
  if (
    strongSourceChanged &&
    proposal.confidence >= ACTIONABLE_CONFIDENCE &&
    !proposal.requiresConfirmation
  ) {
    return 'actionable';
  }
  return 'warning';
}

function driftConfidence(
  comparisons: readonly BrandDriftSourceComparison[],
  proposalConfidence: number,
): number {
  const meaningful = comparisons.filter((comparison) => comparison.kind !== 'fallback');
  if (meaningful.length === 0) return proposalConfidence;
  const strongestComparison = Math.max(...meaningful.map((comparison) => comparison.confidence));
  return Math.min(proposalConfidence, strongestComparison);
}

function accessibilityConsequences(
  roles: readonly BrandDriftSemanticRole[],
): BrandDriftAccessibilityConsequence[] {
  const roleSet = new Set(roles);
  const consequences: BrandDriftAccessibilityConsequence[] = [];
  if (roleSet.has('accent')) {
    consequences.push({
      code: 'primary_control_contrast',
      severity: 'review',
      roles: ['accent'],
    });
  }
  if (roleSet.has('surface') || roleSet.has('text')) {
    const contrastRoles = roles.filter(
      (role): role is Extract<BrandDriftSemanticRole, 'surface' | 'text'> =>
        role === 'surface' || role === 'text',
    );
    consequences.push(
      { code: 'body_text_contrast', severity: 'review', roles: contrastRoles },
      { code: 'supporting_text_contrast', severity: 'review', roles: contrastRoles },
    );
  }
  if (roleSet.has('focus')) {
    consequences.push({ code: 'focus_visibility', severity: 'review', roles: ['focus'] });
  }
  if (roleSet.has('status')) {
    consequences.push({ code: 'status_contrast', severity: 'review', roles: ['status'] });
  }
  if (roleSet.has('typography')) {
    consequences.push({ code: 'text_legibility', severity: 'review', roles: ['typography'] });
  }
  if (roleSet.has('motion')) {
    consequences.push({ code: 'motion_preference', severity: 'review', roles: ['motion'] });
  }
  if (roles.length > 0 && consequences.length === 0) {
    consequences.push({ code: 'none_detected', severity: 'review', roles: [...roles] });
  }
  return consequences;
}

function normalizeAffectedExperiences(
  affectedExperiences: readonly BrandDriftAffectedExperience[],
): BrandDriftAffectedExperience[] {
  const byDocument = new Map<string, BrandDriftAffectedExperience>();
  for (const affected of affectedExperiences) {
    if (affected.bindingPolicy !== 'workspace-current') continue;
    byDocument.set(affected.documentId, {
      documentId: affected.documentId,
      bindingPolicy: 'workspace-current',
      impact: affected.impact,
    });
  }
  return [...byDocument.values()]
    .sort((left, right) => left.documentId.localeCompare(right.documentId))
    .slice(0, BRAND_DRIFT_MAX_AFFECTED_EXPERIENCES);
}

function mergeThemeTokens(baseline: ThemeTokens, proposal: ProductStyleProposal): ThemeTokens {
  const overrides = structuredClone(proposal.tokens) as Record<string, unknown>;
  const modes = overrides['modes'];
  if (isRecord(modes)) {
    const light = modes['light'];
    const modeTypography = isRecord(light) ? light['typography'] : undefined;
    if (isRecord(modeTypography)) {
      overrides['typography'] = deepMerge(overrides['typography'], modeTypography);
    }
    for (const mode of ['light', 'dark']) {
      const value = modes[mode];
      if (isRecord(value)) delete value['typography'];
    }
  }
  return deepMerge(structuredClone(baseline), overrides) as ThemeTokens;
}

function colorRoleChanged(
  baseline: ThemeTokens,
  proposed: ThemeTokens,
  keys: readonly string[],
): boolean {
  for (const mode of ['light', 'dark'] as const) {
    const previous = baseline.modes[mode]?.colors;
    const current = proposed.modes[mode]?.colors;
    for (const key of keys) {
      const colorKey = key as keyof NonNullable<typeof previous>;
      if (previous?.[colorKey] !== current?.[colorKey]) return true;
    }
  }
  return false;
}

function sourceMap(sources: readonly ProductStyleSource[]): Map<string, ProductStyleSource> {
  const result = new Map<string, ProductStyleSource>();
  const sorted = [...sources].sort((left, right) => {
    const keyOrder = sourceKey(left).localeCompare(sourceKey(right));
    if (keyOrder !== 0) return keyOrder;
    const capturedOrder = left.capturedAt.localeCompare(right.capturedAt);
    if (capturedOrder !== 0) return capturedOrder;
    return left.fingerprintHash.localeCompare(right.fingerprintHash);
  });
  for (const source of sorted) result.set(sourceKey(source), source);
  return result;
}

function sourceKey(source: Pick<ProductStyleSource, 'kind' | 'sourceId'>): string {
  return `${source.kind}\u0000${source.sourceId}`;
}

function compareSourceKeys(left: string, right: string): number {
  const [leftKind = '', leftId = ''] = left.split('\u0000');
  const [rightKind = '', rightId = ''] = right.split('\u0000');
  const leftPriority = PRODUCT_STYLE_SOURCE_PRIORITY.indexOf(
    leftKind as (typeof PRODUCT_STYLE_SOURCE_PRIORITY)[number],
  );
  const rightPriority = PRODUCT_STYLE_SOURCE_PRIORITY.indexOf(
    rightKind as (typeof PRODUCT_STYLE_SOURCE_PRIORITY)[number],
  );
  const priorityOrder = normalizedPriority(leftPriority) - normalizedPriority(rightPriority);
  return priorityOrder || leftId.localeCompare(rightId);
}

function normalizedPriority(priority: number): number {
  return priority < 0 ? PRODUCT_STYLE_SOURCE_PRIORITY.length : priority;
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isRecord(base) || !isRecord(override)) return structuredClone(override ?? base);
  const merged: Record<string, unknown> = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    merged[key] = key in merged ? deepMerge(merged[key], value) : structuredClone(value);
  }
  return merged;
}

function equalCanonical(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
