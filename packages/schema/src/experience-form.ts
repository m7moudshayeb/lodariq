/**
 * The form an experience takes on screen (§5).
 *
 * This exists so "edge-drag decides the form" has somewhere to land. Announcements
 * and checklists have historically asked modal-vs-banner or drawer-vs-floating as a
 * radio group *before* the creator has seen anything; making the form a consequence
 * of where the card was dropped turns a Tier-3 dialog into a Tier-1 gesture.
 *
 * The compiler validates this authoring gesture against the document type and
 * emits an explicit renderer surface. Invalid cross-type combinations fail
 * closed instead of being guessed by the runtime.
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
