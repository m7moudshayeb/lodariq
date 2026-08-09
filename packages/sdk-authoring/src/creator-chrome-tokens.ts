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

/** Status colors: always rendered next to a word (Placed, Not placed, …). */
export const CREATOR_CHROME_STATUS_TOKENS = {
  attention: '#f5b84d',
  danger: '#f26d6d',
  positive: '#34c98e',
} as const;

export const CREATOR_CHROME_FONT_STACK =
  'Inter, "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
