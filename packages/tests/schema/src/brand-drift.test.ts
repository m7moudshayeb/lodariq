import { describe, expect, it } from 'vitest';
import {
  BRAND_DRIFT_ACCESSIBILITY_CONSEQUENCE_LABELS,
  BRAND_DRIFT_ACCESSIBILITY_CONSEQUENCES,
  BRAND_DRIFT_SEMANTIC_ROLE_LABELS,
  BRAND_DRIFT_SEMANTIC_ROLES,
  BrandDocumentThemeReviewState,
  BrandDriftCheckRequest,
  BrandDriftCheckResult,
  BrandDriftSourceComparison,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  classifyBrandDrift,
  compareBrandSourceFingerprints,
  validate,
  type ProductStyleProposal,
  type ProductStyleSource,
  type ProductStyleSourceKind,
} from '@lodariq/schema';
import { BRAND_DRIFT_FALSE_POSITIVE_CORPUS } from './fixtures/brand-drift-false-positive-corpus';

const CHECKED_AT = '2026-08-09T12:00:00.000Z';
const BASELINE_HASH = hash('a');
const OBSERVED_HASH = hash('b');

describe('Brand drift contracts and classifier', () => {
  it('classifies identical normalized fingerprints and semantic values as unchanged', () => {
    const source = productStyleSource('selected_element', BASELINE_HASH, 90);
    const proposal = productStyleProposal(source, { modes: { light: { colors: {} } } });

    const result = classifyBrandDrift({
      checkId: 'brand_check_unchanged',
      checkedAt: CHECKED_AT,
      trigger: 'authoring_open',
      baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      baselineSources: [source],
      observedProposal: proposal,
    });

    expect(result).toMatchObject({
      classification: 'unchanged',
      sourceComparisons: [],
      changedRoles: [],
      accessibilityConsequences: [],
      affectedExperiences: [],
    });
    expect(validate(BrandDriftCheckResult, result)).toEqual({ valid: true, value: result });
  });

  it('returns a warning for lower-confidence evidence without creating an adoptable proposal', () => {
    const result = classifyBrandDrift({
      checkId: 'brand_check_warning',
      checkedAt: CHECKED_AT,
      trigger: 'creator_check',
      baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      baselineSources: [productStyleSource('nearby_control', BASELINE_HASH, 72)],
      observedProposal: productStyleProposal(
        productStyleSource('nearby_control', OBSERVED_HASH, 72),
        { modes: { light: { colors: { accent: '#7c3aed' } } } },
        { confidence: 72, requiresConfirmation: true },
      ),
    });

    expect(result.classification).toBe('warning');
    expect('proposal' in result).toBe(false);
    expect(result.changedRoles).toEqual(['accent']);
    expect(result.affectedExperiences).toEqual([]);
  });

  it('does not report actionable drift when no approved fingerprint baseline exists', () => {
    const result = classifyBrandDrift({
      checkId: 'brand_check_no_baseline',
      checkedAt: CHECKED_AT,
      trigger: 'authoring_open',
      baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      baselineSources: [],
      observedProposal: productStyleProposal(
        productStyleSource('registered_tokens', OBSERVED_HASH, 100),
        { modes: { light: { colors: { accent: '#7c3aed' } } } },
        { confidence: 100, requiresConfirmation: false },
      ),
    });

    expect(result.classification).toBe('warning');
    expect('proposal' in result).toBe(false);
  });

  it('creates a reviewable proposal for strong semantic drift without mutating inputs', () => {
    const baselineSource = productStyleSource('registered_tokens', BASELINE_HASH, 100);
    const proposal = productStyleProposal(
      productStyleSource('registered_tokens', OBSERVED_HASH, 100),
      {
        modes: {
          light: { colors: { accent: '#7c3aed', focus: '#6d28d9' } },
        },
        typography: { baseSizePx: 17 },
      },
      { confidence: 100, requiresConfirmation: false },
    );
    const baselineBefore = JSON.stringify(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
    const proposalBefore = JSON.stringify(proposal);

    const result = classifyBrandDrift({
      checkId: 'brand_check_actionable',
      checkedAt: CHECKED_AT,
      trigger: 'creator_check',
      baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      baselineSources: [baselineSource],
      observedProposal: proposal,
      affectedExperiences: [
        {
          documentId: 'tour_z',
          bindingPolicy: 'workspace-current',
          impact: 'would_require_review_on_approval',
        },
        {
          documentId: 'tour_a',
          bindingPolicy: 'workspace-current',
          impact: 'would_require_review_on_approval',
        },
        {
          documentId: 'tour_a',
          bindingPolicy: 'workspace-current',
          impact: 'would_require_review_on_approval',
        },
      ],
    });

    expect(result.classification).toBe('actionable');
    expect(result.changedRoles).toEqual(['accent', 'focus', 'typography']);
    expect(result.accessibilityConsequences.map((item) => item.code)).toEqual([
      'primary_control_contrast',
      'focus_visibility',
      'text_legibility',
    ]);
    expect(result.affectedExperiences.map((item) => item.documentId)).toEqual(['tour_a', 'tour_z']);
    expect('proposal' in result && result.proposal).toEqual(proposal);
    expect(JSON.stringify(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1)).toBe(baselineBefore);
    expect(JSON.stringify(proposal)).toBe(proposalBefore);
    expect(validate(BrandDriftCheckResult, result)).toEqual({ valid: true, value: result });
  });

  it('compares source additions, removals, and revisions deterministically', () => {
    const comparisons = compareBrandSourceFingerprints(
      [
        productStyleSource('nearby_control', BASELINE_HASH, 72),
        productStyleSource('registered_tokens', BASELINE_HASH, 100, 'build_1'),
      ],
      [
        productStyleSource('selected_element', OBSERVED_HASH, 90),
        productStyleSource('registered_tokens', OBSERVED_HASH, 100, 'build_2'),
      ],
    );

    expect(comparisons.map(({ kind, change }) => `${kind}:${change}`)).toEqual([
      'registered_tokens:changed',
      'selected_element:added',
      'nearby_control:removed',
    ]);
    expect(comparisons[0]).toMatchObject({
      previousRevision: 'build_1',
      observedRevision: 'build_2',
    });
  });

  it('keeps the maintained benign fixture corpus below five percent actionable drift', () => {
    const actionable = BRAND_DRIFT_FALSE_POSITIVE_CORPUS.filter((fixture) => {
      const baselineSource = productStyleSource(
        fixture.sourceKind,
        BASELINE_HASH,
        fixture.sourceConfidence,
      );
      const observedSource = productStyleSource(
        fixture.sourceKind,
        fixture.fingerprintChanged ? OBSERVED_HASH : BASELINE_HASH,
        fixture.sourceConfidence,
      );
      const accent =
        fixture.semanticChange === 'different-value'
          ? '#7c3aed'
          : fixture.semanticChange === 'same-value'
            ? LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition.tokens.modes.light.colors.accent
            : undefined;
      const proposal = productStyleProposal(
        observedSource,
        accent ? { modes: { light: { colors: { accent } } } } : {},
        {
          confidence: fixture.proposalConfidence,
          requiresConfirmation: fixture.requiresConfirmation,
        },
      );
      return (
        classifyBrandDrift({
          checkId: `check.${fixture.id}`,
          checkedAt: CHECKED_AT,
          trigger: 'authoring_open',
          baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
          baselineSources: [baselineSource],
          observedProposal: proposal,
        }).classification === 'actionable'
      );
    });

    const falsePositiveRate = actionable.length / BRAND_DRIFT_FALSE_POSITIVE_CORPUS.length;
    expect(BRAND_DRIFT_FALSE_POSITIVE_CORPUS.length).toBeGreaterThanOrEqual(20);
    expect(actionable).toEqual([]);
    expect(falsePositiveRate).toBeLessThan(0.05);
  });

  it('keeps check, result, and acknowledgement payloads closed and privacy-safe', () => {
    const source = productStyleSource('selected_element', BASELINE_HASH, 90);
    const proposal = productStyleProposal(source, {});
    expect(validate(BrandDriftCheckRequest, { trigger: 'creator_check', proposal }).valid).toBe(
      true,
    );
    expect(
      validate(BrandDriftCheckRequest, {
        trigger: 'creator_check',
        proposal,
        selector: '#private-control',
        url: 'https://customer.example/private',
        css: 'color: red',
        coordinates: { x: 1, y: 2 },
      }).valid,
    ).toBe(false);
    expect(
      validate(BrandDocumentThemeReviewState, {
        policy: 'workspace-current',
        reviewState: 'needs_review',
        themeId: 'theme_primary',
        approvedThemeVersionId: 'themev_primary_v3',
        acknowledgedThemeVersionId: 'themev_primary_v2',
      }).valid,
    ).toBe(true);
    expect(
      validate(BrandDocumentThemeReviewState, {
        policy: 'pinned',
        reviewState: 'pinned',
        themeId: 'theme_primary',
        themeVersionId: 'themev_primary_v1',
        acknowledgedThemeVersionId: 'themev_primary_v3',
      }).valid,
    ).toBe(false);
    expect(
      validate(BrandDriftSourceComparison, {
        sourceId: 'source.selected_element',
        kind: 'selected_element',
        change: 'changed',
        confidence: 90,
        observedFingerprintHash: OBSERVED_HASH,
      }).valid,
    ).toBe(false);
    expect(
      validate(BrandDriftSourceComparison, {
        sourceId: 'source.selected_element',
        kind: 'selected_element',
        change: 'added',
        confidence: 90,
        previousFingerprintHash: BASELINE_HASH,
        observedFingerprintHash: OBSERVED_HASH,
      }).valid,
    ).toBe(false);
  });

  it('centralizes accessible labels for every role and consequence', () => {
    expect(Object.keys(BRAND_DRIFT_SEMANTIC_ROLE_LABELS)).toEqual([...BRAND_DRIFT_SEMANTIC_ROLES]);
    expect(Object.keys(BRAND_DRIFT_ACCESSIBILITY_CONSEQUENCE_LABELS)).toEqual([
      ...BRAND_DRIFT_ACCESSIBILITY_CONSEQUENCES,
    ]);
  });
});

function productStyleSource(
  kind: ProductStyleSourceKind,
  fingerprintHash: string,
  confidence: number,
  revision?: string,
): ProductStyleSource {
  return {
    sourceId: `source.${kind}`,
    kind,
    ...(revision ? { revision } : {}),
    confidence,
    fingerprintHash,
    capturedAt: CHECKED_AT,
  };
}

function productStyleProposal(
  source: ProductStyleSource,
  tokens: ProductStyleProposal['tokens'],
  overrides: Partial<Pick<ProductStyleProposal, 'confidence' | 'requiresConfirmation'>> = {},
): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId: 'proposal.brand-drift',
    sources: [source],
    samples: [],
    tokens,
    confidence: overrides.confidence ?? source.confidence,
    requiresConfirmation: overrides.requiresConfirmation ?? source.confidence < 85,
    createdAt: CHECKED_AT,
  };
}

function hash(character: string): string {
  return `sha256-${character.repeat(64)}`;
}
