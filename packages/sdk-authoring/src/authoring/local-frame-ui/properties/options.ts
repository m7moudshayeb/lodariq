export const BLOCK_ALIGNMENT_OPTIONS = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
] as const;

export const BLOCK_SPACING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'tight', label: 'Tight' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
] as const;

export const CONTENT_ALIGNMENT_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;

export const ACTION_LAYOUT_OPTIONS = [
  { value: 'inline', label: 'Inline' },
  { value: 'stack', label: 'Stacked' },
] as const;

export const POPUP_PADDING_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'relaxed', label: 'Relaxed' },
] as const;

export const POPUP_RADIUS_OPTIONS = [
  { value: 'theme', label: 'Brand' },
  { value: 'square', label: 'Square' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Rounded' },
] as const;

export const POPUP_ARROW_OPTIONS = [
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
] as const;
