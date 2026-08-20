/**
 * The form an experience takes on screen (§5).
 *
 * This exists so "edge-drag decides the form" has somewhere to land. Announcements
 * and checklists have historically asked modal-vs-banner or drawer-vs-floating as a
 * radio group *before* the creator has seen anything; making the form a consequence
 * of where the card was dropped turns a Tier-3 dialog into a Tier-1 gesture.
 *
 * Authoring-only for now. The runtime renders popup / modal / hotspot surfaces
 * today, so banner, slide-in, drawer and floating are authored and stored but not
 * yet rendered; the compiled artifact does not carry this field, exactly as it does
 * not carry narration. Storing the creator's decision now means the renderers
 * inherit correct data instead of a migration.
 */
import { Type, type Static } from '@sinclair/typebox';

export const EXPERIENCE_SURFACE_FORMS = [
  'modal',
  'banner',
  'slideIn',
  'drawer',
  'floating',
  'inline',
] as const;

export const ExperienceSurfaceForm = Type.Union(
  EXPERIENCE_SURFACE_FORMS.map((value) => Type.Literal(value)),
  { $id: 'ExperienceSurfaceForm' },
);
export type ExperienceSurfaceForm = Static<typeof ExperienceSurfaceForm>;

export function sanitizeExperienceSurfaceForm(value: unknown): ExperienceSurfaceForm | undefined {
  return typeof value === 'string' &&
    (EXPERIENCE_SURFACE_FORMS as readonly string[]).includes(value)
    ? (value as ExperienceSurfaceForm)
    : undefined;
}
