import type { LodariqBlockProps, TooltipLayoutProps, TooltipStyleProps } from '@lodariq/schema';

export const TOUR_POPUP_STYLE_VARIABLES = [
  '--lq-popup-surface',
  '--lq-popup-text',
  '--lq-popup-muted-text',
  '--lq-popup-border',
] as const;

export interface TourCompositionRecipe {
  actionAlign: NonNullable<TooltipLayoutProps['actionAlign']>;
  actionLayout: NonNullable<TooltipLayoutProps['actionLayout']>;
  contentAlign: NonNullable<TooltipLayoutProps['contentAlign']>;
  gap: NonNullable<TooltipLayoutProps['gap']>;
  heightPx: number | null;
  padding: NonNullable<TooltipLayoutProps['padding']>;
  /** Per-axis overrides. Null means "follow the preset", which is the default. */
  paddingBlockPx: number | null;
  paddingInlinePx: number | null;
  radius: NonNullable<TooltipLayoutProps['radius']>;
  showArrow: boolean;
  widthPx: number | null;
}

export interface TourActionRecipe {
  align: NonNullable<NonNullable<LodariqBlockProps['blockLayout']>['align']>;
  radius: NonNullable<NonNullable<LodariqBlockProps['buttonStyle']>['radius']>;
  size: NonNullable<NonNullable<LodariqBlockProps['buttonStyle']>['size']>;
  variant: NonNullable<LodariqBlockProps['variant']>;
  width: NonNullable<NonNullable<LodariqBlockProps['buttonStyle']>['width']>;
  widthPx: number | null;
}

export interface TourPopupStyleRecipe {
  borderColor: string | null;
  borderWeight: NonNullable<TooltipStyleProps['borderWeight']>;
  elevation: NonNullable<TooltipStyleProps['elevation']>;
  surfaceColor: string | null;
  textColor: string | null;
}

export function resolveTourCompositionRecipe(
  layout: TooltipLayoutProps | undefined,
): TourCompositionRecipe {
  return {
    actionAlign: layout?.actionAlign ?? 'start',
    actionLayout: layout?.actionLayout ?? 'stack',
    contentAlign: layout?.contentAlign ?? 'left',
    gap: layout?.gap ?? 'normal',
    heightPx: layout?.heightPx ?? null,
    padding: layout?.padding ?? 'standard',
    paddingBlockPx: layout?.paddingBlockPx ?? null,
    paddingInlinePx: layout?.paddingInlinePx ?? null,
    radius: layout?.radius ?? 'theme',
    showArrow: layout?.showArrow ?? true,
    widthPx: layout?.widthPx ?? null,
  };
}

export function resolveTourPopupStyleRecipe(
  style: TooltipStyleProps | undefined,
): TourPopupStyleRecipe {
  return {
    borderColor: style?.borderColor ?? null,
    borderWeight: style?.borderWeight ?? 'theme',
    elevation: style?.elevation ?? 'theme',
    surfaceColor: style?.surfaceColor ?? null,
    textColor: style?.textColor ?? null,
  };
}

export function tourPopupStyleVariables(
  recipe: TourPopupStyleRecipe,
): Readonly<Partial<Record<(typeof TOUR_POPUP_STYLE_VARIABLES)[number], string>>> {
  return {
    ...(recipe.surfaceColor ? { '--lq-popup-surface': recipe.surfaceColor } : {}),
    ...(recipe.textColor
      ? {
          '--lq-popup-text': recipe.textColor,
          '--lq-popup-muted-text': recipe.textColor,
        }
      : {}),
    ...(recipe.borderColor ? { '--lq-popup-border': recipe.borderColor } : {}),
  };
}

export const TOUR_COMPOSITION_PADDING_VARIABLES = [
  '--lq-tour-composition-padding-block',
  '--lq-tour-composition-padding-inline',
] as const;

/**
 * The per-axis padding overrides, as CSS variables.
 *
 * An unauthored axis contributes nothing rather than a number, so the CSS
 * fallback chain reaches the preset and the theme behind it. Shared with
 * authoring so the card a creator composes in pads exactly like the published
 * one — the editor used to pad on a single side, which made the control look
 * broken and the published popup look like a different design.
 */
export function tourCompositionPaddingVariables(
  recipe: TourCompositionRecipe,
): Readonly<Partial<Record<(typeof TOUR_COMPOSITION_PADDING_VARIABLES)[number], string>>> {
  return {
    ...(recipe.paddingBlockPx === null
      ? {}
      : { '--lq-tour-composition-padding-block': `${recipe.paddingBlockPx}px` }),
    ...(recipe.paddingInlinePx === null
      ? {}
      : { '--lq-tour-composition-padding-inline': `${recipe.paddingInlinePx}px` }),
  };
}

export function resolveTourActionRecipe(
  props: LodariqBlockProps,
  defaultVariant: TourActionRecipe['variant'] = 'primary',
): TourActionRecipe {
  return {
    align: props.blockLayout?.align ?? 'start',
    radius: props.buttonStyle?.radius ?? 'theme',
    size: props.buttonStyle?.size ?? 'regular',
    variant: props.variant ?? defaultVariant,
    width: props.buttonStyle?.width ?? 'hug',
    widthPx: props.buttonStyle?.widthPx ?? null,
  };
}
