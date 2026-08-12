import type { BrandThemeDefinition } from '@lodariq/schema';

export const BRAND_FONT_OPTIONS = [
  { value: 'system-ui', label: 'System sans' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia serif' },
] as const;

export const BRAND_RADIUS_OPTIONS = [
  { value: 6, label: 'Crisp' },
  { value: 10, label: 'Balanced' },
  { value: 16, label: 'Soft' },
  { value: 24, label: 'Rounded' },
] as const;

export interface BrandThemeDraftPatch {
  accent?: string;
  surface?: string;
  text?: string;
  radius?: number;
  fontFamily?: string;
}

export interface BrandApprovalReviewIdentity {
  id: string;
  revision: number;
  updatedAt: string;
}

/** A completed review is valid only for the exact saved draft seen by the creator. */
export function brandApprovalReviewKey(theme: BrandApprovalReviewIdentity): string {
  return `${theme.id}:${theme.revision}:${theme.updatedAt}`;
}

export function isCurrentBrandApprovalReview(
  completedReviewKey: string | null,
  theme: BrandApprovalReviewIdentity,
): boolean {
  return completedReviewKey === brandApprovalReviewKey(theme);
}

export function updateBrandThemeDefinition(
  definition: BrandThemeDefinition,
  patch: BrandThemeDraftPatch,
): BrandThemeDefinition {
  const lightColors = definition.tokens.modes.light.colors;
  const currentFontFamilies = definition.tokens.typography.fontFamilies;
  const fontFamilies = patch.fontFamily
    ? [
        patch.fontFamily,
        ...currentFontFamilies.filter((fontFamily) => fontFamily !== patch.fontFamily),
      ].slice(0, 5)
    : [...currentFontFamilies];

  return {
    ...definition,
    tokens: {
      ...definition.tokens,
      modes: {
        ...definition.tokens.modes,
        light: {
          ...definition.tokens.modes.light,
          colors: {
            ...lightColors,
            ...(patch.accent ? { accent: patch.accent } : {}),
            ...(patch.surface ? { surface: patch.surface } : {}),
            ...(patch.text ? { text: patch.text } : {}),
          },
        },
      },
      typography: {
        ...definition.tokens.typography,
        fontFamilies,
      },
      radii: {
        ...definition.tokens.radii,
        ...(patch.radius === undefined ? {} : { md: patch.radius }),
      },
    },
  };
}

export function hasUnapprovedBrandChanges(
  definition: BrandThemeDefinition,
  approvedDefinition?: BrandThemeDefinition,
): boolean {
  if (!approvedDefinition) return true;
  return JSON.stringify(definition) !== JSON.stringify(approvedDefinition);
}

export function safeBrandSwatchColor(value: string): string {
  return /^#[0-9a-f]{6}$/u.test(value) ? value : '#d8e3df';
}
