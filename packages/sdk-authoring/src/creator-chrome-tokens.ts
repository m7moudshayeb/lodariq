/**
 * Creator chrome design tokens.
 *
 * The creator tool is dark so it reads as an editing layer on any (mostly light)
 * customer page. The accent has exactly one meaning: the thing being acted on
 * (active step, selection outline, primary action). Status colors are always
 * paired with words, never used alone.
 *
 * Palette: indigo on graphite, adopted 2026-08-17 from the authoring interaction
 * prototype (docs/product-design/prototypes/authoring-spec.html). It replaces the
 * earlier "Graphite + Mint" values. Only the values changed — every name below is
 * unchanged, so all ten consuming modules pick the new palette up without edits.
 *
 * Anti-drift: these are the only color literals in the package. A hex outside this
 * file is a bug; `pnpm --filter @lodariq/sdk-authoring lint` should be the thing
 * that catches it, not review.
 */
export const CREATOR_CHROME_TOKENS = {
  /** Indigo accent: primary action fills and the selection outline. */
  action: '#7c8cff',
  actionHover: '#96a3ff',
  /** Text/icon color on top of an `action` fill. */
  onAction: '#0b0d11',
  /** Hairline border on graphite. */
  border: '#313642',
  /** Graphite base: panel bodies and page-level chrome background. */
  canvas: '#14161c',
  /** Graphite chrome: headers, launcher, floating chips. */
  chrome: '#14161c',
  /** Raised graphite: cards, inputs, expanded rows. */
  surface: '#1e212a',
  /** Focus rings and target selection share the accent. */
  focus: '#7c8cff',
  /** Primary text on graphite. */
  ink: '#e7e9ee',
  /**
   * Above `ink`: the one step of emphasis available on chrome — a hovered menu
   * row, an open section's heading, the selected step's title. Only ever paired
   * with a change of state, never used as a second body colour.
   */
  inkStrong: '#ffffff',
  /** Text and scrims that sit on a thumbnail rather than on chrome. */
  onImage: '#ffffff',
  imageScrim: 'rgba(0, 0, 0, 0.55)',
  /**
   * The plate behind subtitle text laid over a customer's product (§4.7's
   * captions). Darker and denser than `imageScrim`, which sits over chrome we
   * control: a caption has to stay readable over whatever the page happens to be.
   */
  captionScrim: 'rgba(8, 9, 13, 0.86)',
  /** Miniature content inside a thumbnail: legible, and clearly not a control. */
  thumbnailInk: '#39404f',
  /** Secondary text on graphite. */
  muted: '#98a0b0',
  /** Between `ink` and `muted`: de-emphasised body copy that must stay readable. */
  inkSoft: '#c6cbd3',
  /** Below `muted`: hints and disabled labels. Never load-bearing text. */
  subtle: '#7a828d',
  /** Above `surface`: nested rows, pressed states. */
  surfaceStrong: '#26292f',
  /**
   * Below `canvas`: a well rather than a raised surface — the filmstrip
   * thumbnail, a segmented control's track, a scrubber's groove. Anything that
   * has to read as a recess in the chrome rather than as another control.
   */
  surfaceRecessed: '#0f1218',
  /** Below `border`: dividers inside an already-bordered surface. */
  borderSoft: '#26292f',
  onChrome: '#e7e9ee',
} as const;

/**
 * Restrained glass, used only for creator chrome that floats over the customer
 * page — toolbar, mode pill, filmstrip, inspector. Never for the card, which
 * renders in the customer's Brand Theme and must look like published output.
 */
export const CREATOR_CHROME_GLASS = {
  /** Background for floating chrome. Slightly transparent over the page. */
  background: 'rgba(20, 22, 28, 0.94)',
  blur: 'blur(14px)',
  shadow: '0 8px 24px -6px rgba(0, 0, 0, 0.55)',
  /** Deeper elevation: inspector, sheets. */
  shadowRaised: '0 18px 44px -10px rgba(0, 0, 0, 0.65)',
  /** Lift for the small on-page markers (placement dots) that carry no border. */
  shadowDot: '0 1px 4px rgba(0, 0, 0, 0.35)',
} as const;

/**
 * Controls that sit *on* glass: toolbar buttons, inspector pickers, chips, menus.
 *
 * Glass is translucent, so a control painted with the opaque `surface` above
 * reads as a hole punched through it. These are the prototype's on-glass values
 * and they exist only for chrome that floats over the customer page.
 */
export const CREATOR_CHROME_CONTROL_TOKENS = {
  /** Resting fill for a picker or chip on glass. */
  surface: '#242935',
  /** Hover fill for an otherwise transparent toolbar button. */
  hover: '#333a49',
  border: '#333a48',
  /** Quieter fill: close buttons and other secondary glyphs. */
  quiet: '#272c37',
  /** Menus float above glass and are opaque, so they get their own pair. */
  menu: '#1a1e28',
  menuBorder: '#2b3140',
} as const;

/**
 * The Operations sheet (§4.6), which covers the page rather than floating over it.
 *
 * Deeper than the floating chrome above, and for the opposite reason: glass has a
 * customer's page behind it and must stay thin, while the sheet *is* the page for
 * as long as it is open. Its own well/surface pair, one step below `canvas`, is
 * what gives a full-bleed dark surface enough room to sit a nav, a body and a
 * card on without any two of them reading as the same plane.
 */
export const OPERATIONS_SHEET_TOKENS = {
  /** The sheet body: the ground everything else sits on. */
  body: '#0f1117',
  /** The nav rail, a well beside the body. */
  nav: '#0b0d12',
  /** A card on the body. The sheet's only raised surface. */
  box: '#141821',
  navHover: '#161a22',
  /** The current section. Indigo-tinted rather than a grey step, so it reads as a selection. */
  navActive: '#232a3d',
  /** Groove behind a coverage bar. */
  meterTrack: '#1c2130',
  /** Between rows of a data table: softer than a box edge, which would stripe. */
  tableRule: '#1a1e27',
  /** Below everything: embedded code and payloads read as a hole, not a card. */
  code: '#080a0e',
  /** The flow map's pegboard and its dots. */
  mapSurface: '#0b0d12',
  mapDot: '#1b202b',
  mapNode: '#161b26',
} as const;

/**
 * Status tags and nav badges on the sheet.
 *
 * The chrome's `positiveInk`/`attentionInk`/`dangerInk` trio is *darkened* for
 * status text inside a customer's light card. On the sheet's near-black the same
 * hues have to go the other way, so these are the lifted pair of that set. Each
 * still only ever appears next to a word (§13) — the hue is never the message.
 */
export const OPERATIONS_TAG_TOKENS = {
  okInk: '#5fe0ab',
  warnInk: '#f7bd5c',
  badInk: '#ff8b8f',
  /** No status at all: a count, a unit, a step number. */
  neutralSurface: '#232838',
  neutralInk: '#9fb0e0',
  /** Another creator, matching the presence hue rather than a status. */
  peerInk: '#4fd7a8',
  /** The thing being acted on, matching the accent. */
  accentInk: '#a9b4ff',
} as const;

/**
 * Inline notes on the sheet. Each is a background/border/ink triple, because a
 * coloured left edge alone is exactly the "colour carries the meaning" failure
 * §13 rules out — the ink shifts with it so the words stay the signal.
 */
export const OPERATIONS_NOTE_TOKENS = {
  warnSurface: '#241a10',
  warnBorder: '#4a3416',
  warnInk: '#e0c08a',
  okSurface: '#0f2119',
  okBorder: '#1c4634',
  okInk: '#93d9b8',
  badSurface: '#241214',
  badBorder: '#4d2024',
  badInk: '#f0a8ab',
  infoSurface: '#141a2b',
  infoBorder: '#25304d',
  infoInk: '#b3bfea',
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
  accent: '#4f46e5',
  accentHover: '#4338ca',
  accentSoft: '#eef2ff',
  focus: '#7c8cff',
  shadow: '0 18px 44px rgba(15, 23, 42, 0.16)',
} as const;

/** Status colors: always rendered next to a word (Placed, Not placed, …). */
export const CREATOR_CHROME_STATUS_TOKENS = {
  attention: '#f5a524',
  danger: '#f2555a',
  positive: '#3ecf8e',
  /** Another creator holds this step. Presence, not status — see §15. */
  peer: '#0f9b6c',
  /*
   * The same three states as text on a light surface. A status badge renders
   * inside the customer's card, not on the dark chrome, and the chrome hues are
   * far too light there to read — these are the darkened pair for that ground.
   */
  positiveInk: '#0d7a52',
  attentionInk: '#8a5a06',
  dangerInk: '#a12127',
} as const;

/**
 * Presence avatars (§15.2 layer 1). One hue per person, picked by a hash of the
 * creator id so the same face is the same colour every session. Hues are evenly
 * spaced so two people never read as one; initials carry the identity, the hue
 * only supports it. Darker than the prototype's 45% lightness so white initials
 * stay legible at avatar size.
 */
export const CREATOR_CHROME_PEER_HUES = [
  '#2e669e',
  '#662e9e',
  '#9e2e66',
  '#2e9e66',
  '#9e662e',
  '#2e8b9e',
] as const;

export const CREATOR_CHROME_FONT_STACK =
  'Inter, "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/**
 * Editorial Air typography for creator chrome / authoring UI.
 *
 * Only the reusable 10–18px text ladder is exposed as CSS variables. Micro
 * labels and display type sit outside that ladder and remain explicit pixel
 * values at their call sites.
 */
export const AUTHORING_TYPE_SCALE = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
} as const;
export const AUTHORING_SPACE_SCALE = [4, 8, 12, 16, 24, 32, 40] as const;
export const AUTHORING_RADIUS_SCALE = [8, 12, 16] as const;
export const AUTHORING_FONT_WEIGHT = {
  regular: 400,
  medium: 400,
  semibold: 500,
  bold: 700,
} as const;

/** Shared declarations for every document or shadow root that paints creator UI. */
export const AUTHORING_TYPOGRAPHY_CSS_PROPERTIES = `
  --lq-font-xs: ${AUTHORING_TYPE_SCALE.xs}px;
  --lq-font-sm: ${AUTHORING_TYPE_SCALE.sm}px;
  --lq-font-md: ${AUTHORING_TYPE_SCALE.md}px;
  --lq-font-lg: ${AUTHORING_TYPE_SCALE.lg}px;
  --lq-font-xl: ${AUTHORING_TYPE_SCALE.xl}px;
  --lq-weight-regular: ${AUTHORING_FONT_WEIGHT.regular};
  --lq-weight-medium: ${AUTHORING_FONT_WEIGHT.medium};
  --lq-weight-semibold: ${AUTHORING_FONT_WEIGHT.semibold};
  --lq-weight-bold: ${AUTHORING_FONT_WEIGHT.bold};
`;
/** Compact / default / primary control heights. */
export const AUTHORING_CONTROL_HEIGHT = {
  sm: 36,
  md: 40,
  lg: 44,
} as const;

/**
 * On-page overlay chrome geometry.
 *
 * These sit deliberately off the workspace ladders above. On-page chrome floats
 * over the customer's product, which sets the visual context — it has to read as
 * a thin editing layer, not as a second application. The workspace ladders keep
 * governing everything inside the authoring frame; this block governs only what
 * is drawn over the customer page.
 *
 * Adopted 2026-08-17 with the prototype. Every overlay measurement lives here, so
 * there is still exactly one source — see `authoring/overlay/constants.ts`, which
 * re-exports these under the names the shell already uses.
 */
export const OVERLAY_CHROME_GEOMETRY = {
  /** Toolbar is not width-coupled to the card; it takes its own minimum. */
  toolbarHeight: 38,
  toolbarGap: 10,
  toolbarMinWidth: 420,
  /**
   * Floating-chrome radii. Deliberately off the 8/12/16 workspace ladder — glass
   * chrome sits between the two, and the prototype's values are what read right
   * against a customer page rather than against the workspace.
   */
  toolbarRadius: 10,
  controlRadius: 6,
  inspectorWidth: 320,
  inspectorGap: 10,
  /** Fraction of viewport height; content scrolls internally beyond it. */
  inspectorMaxHeightRatio: 0.6,
  /**
   * Floor for the reserved height, used for the frame it is opened in before the
   * frame has reported what its content measures. Without it the first paint
   * reserves nothing and the inspector opens clipped to its own header.
   */
  inspectorMinHeight: 240,
  /**
   * Hard cap. Stops the inspector quietly becoming a panel again.
   *
   * Seven, not §4.3's six: the card also carries Target, because a creator
   * re-points a step from the card they selected rather than by selecting the
   * target itself. Style · Actions · Placement · Target · Narration · Advanced is
   * six today, and Conditions makes seven.
   */
  inspectorMaxSections: 7,
  pillHeight: 38,
  /** A thumbnail wide enough to read a truncated title under, and no wider. */
  filmstripThumbWidth: 74,
  /**
   * Shallow on purpose: the number and the state dot float in its corners rather
   * than taking rows of their own, so the picture is the whole tile.
   */
  filmstripThumbHeight: 36,
  pillCollapsedSize: 28,
  pillIdleCollapseMs: 8000,
  /** Minimum distance any overlay surface keeps from the viewport edge. */
  stagePadding: 12,
  /**
   * Re-solve threshold. Placement is solved on selection, resize, move and
   * viewport change — never on content change. Without this the toolbar jitters
   * on every line break while the creator types.
   */
  resolveHysteresis: 24,
  /** Gutter handles render outside the card box so content geometry is published-identical. */
  /*
   * Further out than the prototype's -27, deliberately.
   *
   * At -27 the 22px column ends at -5, which is exactly where the resize
   * handle's 9px square reaches: the handles and the gutter buttons sat on the
   * same pixels and read as one confused stack. This clears the handle by ~11px,
   * so the card's edge controls and the block's controls are visibly separate
   * things.
   */
  cardGutterOffset: -38,
} as const;

/** Motion. Movement must be legible rather than startling. */
export const OVERLAY_CHROME_MOTION = {
  surfaceMoveMs: 200,
  surfaceMoveEasing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  chromeAvoidMs: 150,
  modeFadeMs: 180,
} as const;

/** Opacity of the whole authoring layer in non-editing states. */
export const OVERLAY_CHROME_GHOST_OPACITY = {
  /** Browsing: clicks reach the customer product. */
  browsing: 0.15,
  /** Peek: transient, while the accelerator is held. */
  peek: 0.12,
} as const;
