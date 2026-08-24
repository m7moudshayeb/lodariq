/**
 * Creator-facing types are an explicit capability catalog, not every value the
 * canonical schema can read. A type belongs here only once authoring,
 * compilation, preview, and publication all support it.
 *
 * All five are single-surface or sequence experiences over the same block model:
 * the compiler wraps a single-surface root as a one-step sequence, so one
 * renderer delivers every one of them. `knowledge` is deliberately absent — it
 * seeds no blocks yet, so it would author into an empty artifact.
 */
export const CREATOR_ENABLED_EXPERIENCE_TYPES = [
  {
    id: 'tour',
    label: authoringText('Tour'),
    description: authoringText('Guide people through a short sequence on this page.'),
  },
  {
    id: 'announcement',
    label: authoringText('Announcement'),
    description: authoringText('Say one thing, once, wherever it belongs on the page.'),
  },
  {
    id: 'hotspot',
    label: authoringText('Hotspot'),
    description: authoringText('Mark something and explain it on hover.'),
  },
  {
    id: 'survey',
    label: authoringText('Survey'),
    description: authoringText('Ask a question and collect the answers.'),
  },
  {
    id: 'checklist',
    label: authoringText('Checklist'),
    description: authoringText('A list of things to get done.'),
  },
] as const;

export type CreatorEnabledExperienceType = (typeof CREATOR_ENABLED_EXPERIENCE_TYPES)[number]['id'];

/** Narrows a canonical document type to the shipped catalog above. */
export function isCreatorEnabledExperienceType(
  value: string,
): value is CreatorEnabledExperienceType {
  return CREATOR_ENABLED_EXPERIENCE_TYPES.some((entry) => entry.id === value);
}
import { authoringText } from './i18n';
