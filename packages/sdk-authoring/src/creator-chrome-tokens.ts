/**
 * Creator chrome design tokens — "Graphite + Mint".
 *
 * The creator tool is dark graphite so it reads as an editing layer on any
 * (mostly light) customer page. Mint has exactly one meaning: the thing being
 * acted on (active step, selection outline, primary action). Status colors are
 * always paired with words, never used alone.
 */
export const CREATOR_CHROME_TOKENS = {
  /** Mint accent: primary action fills and the selection outline. */
  action: '#3de8b0',
  actionHover: '#5cf0c0',
  /** Text/icon color on top of a mint `action` fill. */
  onAction: '#101216',
  /** Hairline border on graphite (~8% white, pre-blended). */
  border: '#2e3138',
  /** Graphite base: panel bodies and page-level chrome background. */
  canvas: '#17181c',
  /** Graphite chrome: headers, launcher, floating chips. */
  chrome: '#17181c',
  /** Raised graphite: cards, inputs, expanded rows. */
  surface: '#1f2126',
  /** Focus rings and target selection share the mint accent. */
  focus: '#3de8b0',
  /** Primary text on graphite. */
  ink: '#f4f5f7',
  /** Secondary text on graphite. */
  muted: '#9ba3ae',
  onChrome: '#f4f5f7',
} as const;

/**
 * Light contextual surfaces used inside the Editorial Air authoring workspace.
 *
 * These are deliberately separate from the dark creator chrome above: launcher
 * chrome may contrast with a customer page, while menus, popovers, and inline
 * editing controls belong to the light authoring workspace.
 */
export const AUTHORING_CONTEXT_SURFACE_TOKENS = {
  ink: '#162033',
  muted: '#667085',
  surface: '#ffffff',
  elevated: '#f7faf9',
  border: '#d8dfe3',
  borderSoft: '#e8ecee',
  accent: '#006b58',
  accentHover: '#005647',
  accentSoft: '#edf8f5',
  focus: '#367bf5',
  shadow: '0 18px 44px rgba(15, 36, 31, 0.16)',
} as const;

/** Status colors: always rendered next to a word (Placed, Not placed, …). */
export const CREATOR_CHROME_STATUS_TOKENS = {
  attention: '#f5b84d',
  danger: '#f26d6d',
  positive: '#34c98e',
} as const;

export const CREATOR_CHROME_FONT_STACK =
  'Inter, "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/**
 * Editorial Air geometry for creator chrome / authoring UI.
 * Snap every local size to these ladders — no 9/11/13px type, no 650/720 weights.
 */
export const AUTHORING_TYPE_SCALE = [8, 10, 12, 14, 16, 18, 24, 28, 32] as const;
export const AUTHORING_SPACE_SCALE = [4, 8, 12, 16, 24, 32, 40] as const;
export const AUTHORING_RADIUS_SCALE = [8, 12, 16] as const;
export const AUTHORING_FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;
/** Compact / default / primary control heights. */
export const AUTHORING_CONTROL_HEIGHT = {
  sm: 36,
  md: 40,
  lg: 44,
} as const;
