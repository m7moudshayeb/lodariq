import { describe, expect, it } from 'vitest';
import { LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1 } from '@lodariq/schema';
import {
  brandApprovalReviewKey,
  hasUnapprovedBrandChanges,
  isCurrentBrandApprovalReview,
  safeBrandSwatchColor,
  updateBrandThemeDefinition,
} from '../../../../apps/dashboard/src/lib/brand-system';
import { compileBrandReviewPreviews } from '../../../../apps/dashboard/src/lib/brand-preview';

describe('@lodariq/dashboard Brand system', () => {
  it('changes only the five safe authoring seams and preserves the typed definition', () => {
    const original = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition;
    const updated = updateBrandThemeDefinition(original, {
      accent: '#0b6655',
      surface: '#f8f7f2',
      text: '#202522',
      radius: 16,
      fontFamily: 'Plus Jakarta Sans',
    });

    expect(updated.tokens.modes.light.colors).toMatchObject({
      accent: '#0b6655',
      surface: '#f8f7f2',
      text: '#202522',
    });
    expect(updated.tokens.radii.md).toBe(16);
    expect(updated.tokens.typography.fontFamilies[0]).toBe('Plus Jakarta Sans');
    expect(updated.tokens.modes.dark).toEqual(original.tokens.modes.dark);
    expect(updated.tokens.motion).toEqual(original.tokens.motion);
    expect(updated.tokens.elevations).toEqual(original.tokens.elevations);
    expect(updated.recipes).toEqual(original.recipes);
    expect(original.tokens.modes.light.colors.accent).toBe('#2457ff');
  });

  it('recognizes approval drift without trusting unsafe swatch values', () => {
    const approved = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition;
    const changed = updateBrandThemeDefinition(approved, { accent: '#0b6655' });

    expect(hasUnapprovedBrandChanges(approved, approved)).toBe(false);
    expect(hasUnapprovedBrandChanges(changed, approved)).toBe(true);
    expect(hasUnapprovedBrandChanges(changed)).toBe(true);
    expect(safeBrandSwatchColor('#0b6655')).toBe('#0b6655');
    expect(safeBrandSwatchColor('url(https://attacker.test/pixel)')).toBe('#d8e3df');
  });

  it('invalidates approval review completion when the saved draft identity changes', () => {
    const savedDraft = {
      id: 'theme_product',
      revision: 4,
      updatedAt: '2026-08-08T10:00:00.000Z',
    };
    const completedKey = brandApprovalReviewKey(savedDraft);

    expect(isCurrentBrandApprovalReview(completedKey, savedDraft)).toBe(true);
    expect(
      isCurrentBrandApprovalReview(completedKey, {
        ...savedDraft,
        revision: savedDraft.revision + 1,
      }),
    ).toBe(false);
  });

  it('compiles the approval comparison through the real Tour artifact contract', async () => {
    const draft = updateBrandThemeDefinition(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition, {
      accent: '#0b6655',
      radius: 16,
    });
    const previews = await compileBrandReviewPreviews({
      name: 'Product brand',
      draft,
      activeVersion: {
        version: 1,
        snapshot: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      },
    });

    expect(previews.before.theme.contentHash).toBe(
      LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.contentHash,
    );
    expect(previews.after.theme.definition.tokens.modes.light.colors.accent).toBe('#0b6655');
    expect(previews.after.theme.definition.tokens.radii.md).toBe(16);
    expect(previews.before.appearance.colorMode).toBe('light');
    expect(previews.after.appearance.colorMode).toBe('light');
    expect(previews.before.steps[0]?.body.map((node) => node.text)).toEqual(
      previews.after.steps[0]?.body.map((node) => node.text),
    );
    expect(previews.after.steps.some((step) => step.targetId)).toBe(false);
  });
});
