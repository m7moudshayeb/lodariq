/**
 * The experience menu's glyphs, taken from the overlay's one glyph module.
 *
 * Imported rather than redrawn: the same five type icons already appear in the
 * pill's menu, and a Tour that is a map in one list and a flag in the other
 * reads as two different things.
 */
import { OVERLAY_GLYPHS } from '../authoring/overlay/icons';

/** §5 — one glyph per creator-facing type, shared by every list that names them. */
export const EXPERIENCE_TYPE_GLYPHS: Readonly<Record<string, string>> = {
  tour: OVERLAY_GLYPHS.map,
  announcement: OVERLAY_GLYPHS.bell,
  hotspot: OVERLAY_GLYPHS.sparkle,
  survey: OVERLAY_GLYPHS.form,
  checklist: OVERLAY_GLYPHS.check,
  knowledge: OVERLAY_GLYPHS.layers,
};

export function experienceTypeGlyph(type: string): string {
  return EXPERIENCE_TYPE_GLYPHS[type] ?? OVERLAY_GLYPHS.layers;
}
