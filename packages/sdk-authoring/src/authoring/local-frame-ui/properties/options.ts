import { authoringText } from '../../../i18n';
import {
  TOOLTIP_BORDER_WEIGHT_VALUES,
  TOOLTIP_ELEVATION_VALUES,
  TOUR_MOTION_EASING_VALUES,
  TOUR_MOTION_RECIPE_VALUES,
  type TooltipStyleProps,
} from '@lodariq/schema';

export const BLOCK_ALIGNMENT_OPTIONS = [
  { value: 'start', label: authoringText('Start') },
  { value: 'center', label: authoringText('Center') },
  { value: 'end', label: authoringText('End') },
  { value: 'stretch', label: authoringText('Stretch') },
] as const;

export const BLOCK_SPACING_OPTIONS = [
  { value: 'none', label: authoringText('None') },
  { value: 'tight', label: authoringText('Tight') },
  { value: 'normal', label: authoringText('Normal') },
  { value: 'relaxed', label: authoringText('Relaxed') },
] as const;

export const CONTENT_ALIGNMENT_OPTIONS = [
  { value: 'left', label: authoringText('Left') },
  { value: 'center', label: authoringText('Center') },
  { value: 'right', label: authoringText('Right') },
] as const;

export const ACTION_LAYOUT_OPTIONS = [
  { value: 'inline', label: authoringText('Inline') },
  { value: 'stack', label: authoringText('Stacked') },
] as const;

export const POPUP_PADDING_OPTIONS = [
  { value: 'compact', label: authoringText('Compact') },
  { value: 'standard', label: authoringText('Standard') },
  { value: 'relaxed', label: authoringText('Relaxed') },
] as const;

export const POPUP_RADIUS_OPTIONS = [
  { value: 'theme', label: authoringText('Brand') },
  { value: 'square', label: authoringText('Square') },
  { value: 'soft', label: authoringText('Soft') },
  { value: 'round', label: authoringText('Rounded') },
] as const;

export const POPUP_ARROW_OPTIONS = [
  { value: 'show', label: authoringText('Show') },
  { value: 'hide', label: authoringText('Hide') },
] as const;

const POPUP_BORDER_WEIGHT_LABELS = {
  theme: authoringText('Theme'),
  none: authoringText('None'),
  subtle: authoringText('Subtle'),
  strong: authoringText('Strong'),
} as const satisfies Record<NonNullable<TooltipStyleProps['borderWeight']>, string>;

export const POPUP_BORDER_WEIGHT_OPTIONS = TOOLTIP_BORDER_WEIGHT_VALUES.map((value) => ({
  value,
  label: POPUP_BORDER_WEIGHT_LABELS[value],
}));

const POPUP_ELEVATION_LABELS = {
  theme: authoringText('Theme'),
  none: authoringText('None'),
  resting: authoringText('Soft'),
  floating: authoringText('Strong'),
} as const satisfies Record<NonNullable<TooltipStyleProps['elevation']>, string>;

export const POPUP_ELEVATION_OPTIONS = TOOLTIP_ELEVATION_VALUES.map((value) => ({
  value,
  label: POPUP_ELEVATION_LABELS[value],
}));

/**
 * Which side of the target the popup sits on. Worded as "Anchor …" rather than
 * a bare compass point: the dots on the target say the same thing by gesture,
 * and the menu has to read as the same choice rather than a second one.
 */
export const PLACEMENT_SIDE_OPTIONS = [
  { value: 'top', label: authoringText('Anchor top') },
  { value: 'right', label: authoringText('Anchor right') },
  { value: 'bottom', label: authoringText('Anchor bottom') },
  { value: 'left', label: authoringText('Anchor left') },
] as const;

/** The bare side, for the toolbar chip — the menu says "Anchor …" in full. */
const PLACEMENT_SIDE_SHORT_LABELS = {
  top: authoringText('Top'),
  right: authoringText('Right'),
  bottom: authoringText('Bottom'),
  left: authoringText('Left'),
} as const;

export function placementSideLabel(side: keyof typeof PLACEMENT_SIDE_SHORT_LABELS): string {
  return PLACEMENT_SIDE_SHORT_LABELS[side];
}

/**
 * The same four sides for a row already labelled "Side". A menu that has to
 * stand on its own says "Anchor top"; inside a labelled row that repeats the
 * word the row just said.
 */
export const PLACEMENT_SIDE_SHORT_OPTIONS = [
  { value: 'top', label: PLACEMENT_SIDE_SHORT_LABELS.top },
  { value: 'right', label: PLACEMENT_SIDE_SHORT_LABELS.right },
  { value: 'bottom', label: PLACEMENT_SIDE_SHORT_LABELS.bottom },
  { value: 'left', label: PLACEMENT_SIDE_SHORT_LABELS.left },
] as const;

export const ANCHOR_ALIGN_OPTIONS = [
  { value: 'start', label: authoringText('Align start') },
  { value: 'center', label: authoringText('Align center') },
  { value: 'end', label: authoringText('Align end') },
] as const;

/** As above: the bare value, for the inspector's "Align" row. */
export const ANCHOR_ALIGN_SHORT_OPTIONS = [
  { value: 'start', label: authoringText('Start') },
  { value: 'center', label: authoringText('Center') },
  { value: 'end', label: authoringText('End') },
] as const;

const MOTION_RECIPE_LABELS = {
  fade: authoringText('Fade'),
  lift: authoringText('Lift'),
  scale: authoringText('Scale'),
  pulse: authoringText('Pulse'),
} as const satisfies Record<(typeof TOUR_MOTION_RECIPE_VALUES)[number], string>;

export const MOTION_RECIPE_OPTIONS = TOUR_MOTION_RECIPE_VALUES.map((value) => ({
  value,
  label: MOTION_RECIPE_LABELS[value],
}));

const MOTION_EASING_LABELS = {
  standard: authoringText('Standard'),
  emphasized: authoringText('Emphasized'),
  linear: authoringText('Linear'),
} as const satisfies Record<(typeof TOUR_MOTION_EASING_VALUES)[number], string>;

export const MOTION_EASING_OPTIONS = TOUR_MOTION_EASING_VALUES.map((value) => ({
  value,
  label: MOTION_EASING_LABELS[value],
}));

export function motionRecipeLabel(recipe: keyof typeof MOTION_RECIPE_LABELS): string {
  return MOTION_RECIPE_LABELS[recipe];
}
