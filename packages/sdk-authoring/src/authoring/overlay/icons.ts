/**
 * The overlay's glyph set.
 *
 * Host-page chrome is plain DOM with no bundler of its own, so these are inline
 * SVG strings rather than a component import. One module for all of them: the
 * mode pill, the card tools and the filmstrip draw from the same shapes, and
 * three private copies of a `svg()` helper is how they drift.
 *
 * Shapes mirror the prototype's `P` map, at the same 24×24 grid.
 */
export function overlayGlyph(shapes: string, size = 13, fill = 'none'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="${fill}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
}

const GRIP_DOTS =
  '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>';

export const OVERLAY_GLYPHS = {
  grip: overlayGlyph(GRIP_DOTS, 13, 'currentColor'),
  pencil: overlayGlyph('<path d="M4 20h4L19 9a2.1 2.1 0 10-3-3L5 17z"/>'),
  cursor: overlayGlyph('<path d="M6 3l14 9-6 1 3 6-2.5 1.2-3-6-4.5 4z"/>'),
  eye: overlayGlyph(
    '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  ),
  /** Four-way arrow: the card's own move affordance (§3.4 rule 4). */
  move: overlayGlyph(
    '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    12,
  ),
  /** "There is more behind this control" — the pill's menu, never a decoration. */
  chevronDown: overlayGlyph('<path d="M6 9l6 6 6-6"/>', 14),
  /** Back out of a menu view, into the rows it came from. */
  chevronLeft: overlayGlyph('<path d="M15 6l-6 6 6 6"/>', 14),
  /*
   * Menu-row glyphs (§4.1). A row's icon is what makes a fifteen-row menu
   * scannable — without them every row is the same grey rectangle. Same shapes
   * and same 24×24 grid as the prototype's `P` map.
   */
  map: overlayGlyph('<path d="M9 4L3 7v13l6-3 6 3 6-3V4l-6 3zM9 4v13M15 7v13"/>', 15),
  bell: overlayGlyph(
    '<path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.5 21a2 2 0 003 0"/>',
    15,
  ),
  sparkle: overlayGlyph('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', 15),
  form: overlayGlyph('<path d="M4 5h16v14H4zM7 9h10M7 13h6"/>', 15),
  check: overlayGlyph('<path d="M20 6L9 17l-5-5"/>', 15),
  layers: overlayGlyph('<path d="M12 3l9 5-9 5-9-5zM3 14l9 5 9-5"/>', 15),
  columns: overlayGlyph('<path d="M4 4h7v16H4zM13 4h7v16h-7z"/>', 15),
  shield: overlayGlyph('<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>', 15),
  rocket: overlayGlyph(
    '<path d="M5 15c-1 3 0 5 0 5s2 1 5 0M9 15l-3-3a9 9 0 0113-9 9 9 0 01-9 13z"/><circle cx="14.5" cy="9.5" r="1.6"/>',
    15,
  ),
  volume: overlayGlyph('<path d="M11 5L6 9H2v6h4l5 4zM16 8a5 5 0 010 8M19 5a9 9 0 010 14"/>', 15),
  crosshair: overlayGlyph(
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="7"/>',
    15,
  ),
  bot: overlayGlyph(
    '<path d="M8 5h8v4H8zM5 9h14v10H5zM12 5V2"/><circle cx="9.5" cy="14" r="1"/><circle cx="14.5" cy="14" r="1"/>',
    15,
  ),
  zoomIn: overlayGlyph(
    '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>',
    15,
  ),
  zoomOut: overlayGlyph('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>', 15),
  refresh: overlayGlyph('<path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"/>', 15),
  help: overlayGlyph(
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 013.9-1.8c1.5.9 1 2.6-.4 3.3-.8.4-1 .9-1 1.6"/><circle cx="12" cy="17" r="0.6"/>',
    15,
  ),
  external: overlayGlyph('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>', 15),
  minimize: overlayGlyph('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>', 15),
  /** Band glyphs (§4.4a): pick bigger, and who is holding this step. */
  maximize: overlayGlyph('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 15),
  lock: overlayGlyph('<path d="M5 11h14v10H5zM8 11V7a4 4 0 018 0v4"/>', 15),
  chevronRight: overlayGlyph('<path d="M9 6l6 6-6 6"/>', 11),
  copy: overlayGlyph('<path d="M9 9h11v11H9zM5 15V4h11"/>', 15),
  eyeSmall: overlayGlyph(
    '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
    12,
  ),
  /** The big modal's dismiss (§10). Esc does it too — this is the visible one. */
  close: overlayGlyph('<path d="M18 6L6 18M6 6l12 12"/>', 13),
  /** Preview transport (§4.7): narration playback and its captions. */
  play: overlayGlyph('<path d="M6 4l14 8-14 8z"/>', 14, 'currentColor'),
  quote: overlayGlyph('<path d="M7 7h4v6H7zM13 7h4v6h-4zM7 13c0 2 1 3 3 4M13 13c0 2 1 3 3 4"/>', 13),
} as const;
