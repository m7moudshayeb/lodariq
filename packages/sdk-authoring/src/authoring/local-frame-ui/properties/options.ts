import { authoringText } from '../../../i18n';
import {
  TOOLTIP_BORDER_WEIGHT_VALUES,
  TOOLTIP_ELEVATION_VALUES,
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
