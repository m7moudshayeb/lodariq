import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '@lodariq/compiler';
import {
  BASIC_VISUAL_PREFLIGHT_ISSUE_CODES,
  BASIC_VISUAL_PREFLIGHT_ISSUE_LABELS,
  BasicVisualPreflightReport,
  BrandThemeSnapshot,
  ExperienceAppearance,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  ThemeBinding,
  basicVisualPreflightIssueLabel,
  validate,
  type BrandThemeSnapshot as BrandThemeSnapshotType,
} from '@lodariq/schema';

describe('Brand Theme contracts', () => {
  it('ships a valid, immutable, content-addressed fallback snapshot', async () => {
    const theme = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1;
    expect(validate(BrandThemeSnapshot, theme)).toEqual({ valid: true, value: theme });
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.definition.tokens.modes.light.colors)).toBe(true);

    const { contentHash, ...hashPayload } = theme;
    expect(contentHash).toBe(`sha256-${await sha256Hex(canonicalJson(hashPayload))}`);
  });

  it('rejects CSS syntax, font URLs, unknown keys, and out-of-range values', () => {
    const unsafeColor = cloneFallback();
    unsafeColor.definition.tokens.modes.light.colors.accent = 'var(--customer-accent)';
    expect(validate(BrandThemeSnapshot, unsafeColor).valid).toBe(false);

    const unsafeFont = cloneFallback();
    unsafeFont.definition.tokens.typography.fontFamilies = [
      'url(https://example.com/customer.woff2)',
    ];
    expect(validate(BrandThemeSnapshot, unsafeFont).valid).toBe(false);

    const unknownRecipeKey = cloneFallback() as BrandThemeSnapshotType & {
      definition: BrandThemeSnapshotType['definition'] & {
        recipes: BrandThemeSnapshotType['definition']['recipes'] & { css?: string };
      };
    };
    unknownRecipeKey.definition.recipes.css = 'filter: blur(2px)';
    expect(validate(BrandThemeSnapshot, unknownRecipeKey).valid).toBe(false);

    const oversizedRadius = cloneFallback();
    oversizedRadius.definition.tokens.radii.lg = 64;
    expect(validate(BrandThemeSnapshot, oversizedRadius).valid).toBe(false);
  });

  it('keeps theme binding and experience appearance semantic and closed', () => {
    expect(
      validate(ThemeBinding, {
        policy: 'pinned',
        themeId: 'theme_customer',
        themeVersionId: 'themev_customer_3',
      }).valid,
    ).toBe(true);
    expect(
      validate(ThemeBinding, {
        policy: 'workspace-current',
        themeId: 'theme_customer',
        acknowledgedThemeVersionId: 'themev_customer_3',
        css: '.tooltip { color: red }',
      }).valid,
    ).toBe(false);

    expect(
      validate(ExperienceAppearance, {
        preset: 'minimal',
        density: 'compact',
        width: 'narrow',
        colorMode: 'system',
      }).valid,
    ).toBe(true);
    expect(
      validate(ExperienceAppearance, {
        preset: 'custom-css',
        density: 'compact',
        width: 'narrow',
        colorMode: 'system',
      }).valid,
    ).toBe(false);
  });

  it('keeps basic visual-preflight reports closed and free of captured creator data', () => {
    const report = {
      schemaVersion: '1',
      checkedAt: '2026-08-07T12:00:00.000Z',
      status: 'warnings',
      issues: [
        {
          code: 'long_copy_risk',
          severity: 'warning',
          stepIndex: 0,
          nodeIndex: 1,
          characterCount: 320,
          recommendedMaximum: 240,
        },
      ],
    };

    expect(validate(BasicVisualPreflightReport, report).valid).toBe(true);
    expect(
      validate(BasicVisualPreflightReport, {
        ...report,
        issues: [
          {
            ...report.issues[0],
            message: 'Captured creator copy',
            url: 'https://customer.example/private',
            selector: '#customer-control',
            css: 'position: fixed',
          },
        ],
      }).valid,
    ).toBe(false);
    expect(
      validate(BasicVisualPreflightReport, {
        ...report,
        screenshot: 'data:image/png;base64,unsafe',
      }).valid,
    ).toBe(false);
    expect(
      validate(BasicVisualPreflightReport, {
        ...report,
        issues: [{ ...report.issues[0], severity: 'blocker' }],
      }).valid,
    ).toBe(false);
    expect(
      validate(BasicVisualPreflightReport, {
        ...report,
        issues: [{ code: 'creator_defined_issue', severity: 'warning' }],
      }).valid,
    ).toBe(false);
  });

  it('centralizes a label for every basic visual-preflight issue code', () => {
    expect(Object.keys(BASIC_VISUAL_PREFLIGHT_ISSUE_LABELS)).toEqual([
      ...BASIC_VISUAL_PREFLIGHT_ISSUE_CODES,
    ]);
    for (const code of BASIC_VISUAL_PREFLIGHT_ISSUE_CODES) {
      expect(basicVisualPreflightIssueLabel(code)).toBe(BASIC_VISUAL_PREFLIGHT_ISSUE_LABELS[code]);
    }
  });
});

function cloneFallback(): BrandThemeSnapshotType {
  return structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
}
