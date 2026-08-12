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
    actionLayout: layout?.actionLayout ?? 'inline',
    contentAlign: layout?.contentAlign ?? 'left',
    gap: layout?.gap ?? 'normal',
    heightPx: layout?.heightPx ?? null,
    padding: layout?.padding ?? 'standard',
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
