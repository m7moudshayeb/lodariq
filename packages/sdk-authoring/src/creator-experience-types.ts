/**
 * Creator-facing types are an explicit capability catalog, not every value the
 * canonical schema can read. Add a type here only after authoring, compilation,
 * preview, and publication all support it.
 */
export const CREATOR_ENABLED_EXPERIENCE_TYPES = [
  {
    id: 'tour',
    label: 'Tour',
    description: 'Guide people through a short sequence on this page.',
  },
] as const;

export type CreatorEnabledExperienceType = (typeof CREATOR_ENABLED_EXPERIENCE_TYPES)[number]['id'];
