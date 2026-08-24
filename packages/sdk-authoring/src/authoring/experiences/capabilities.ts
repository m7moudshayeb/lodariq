/**
 * The capability vocabulary every experience definition composes from.
 *
 * A leaf module on purpose: the registry needs these names and the capability
 * helpers need the registry, so keeping the words here is what stops that becoming
 * a cycle.
 */
import type { LodariqBlockType } from '@lodariq/schema';

export const AUTHORING_EXPERIENCE_CAPABILITIES = [
  'structuredContent',
  'actions',
  'targeting',
  'popupComposition',
  'presentation',
  'flow',
  'batch',
  'reviewRecovery',
] as const;

export type AuthoringExperienceCapability = (typeof AUTHORING_EXPERIENCE_CAPABILITIES)[number];
export type ExperienceWorkspaceKind = 'sequence' | 'singleSurface' | 'collection';

export interface ExperienceAuthoringProfile {
  capabilities: readonly AuthoringExperienceCapability[];
  rootBlockTypes: readonly LodariqBlockType[];
  workspace: ExperienceWorkspaceKind;
}
