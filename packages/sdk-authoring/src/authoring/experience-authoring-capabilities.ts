import type {
  DocumentType,
  LodariqBlock,
  LodariqBlockType,
  LodariqDocument,
} from '@lodariq/schema';

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

const SURFACE_CAPABILITIES = [
  'structuredContent',
  'actions',
  'targeting',
  'popupComposition',
  'presentation',
  'reviewRecovery',
] as const satisfies readonly AuthoringExperienceCapability[];

const CONTENT_CAPABILITIES = [
  'structuredContent',
  'actions',
  'presentation',
  'reviewRecovery',
] as const satisfies readonly AuthoringExperienceCapability[];

/**
 * The profile is the only experience-type switch in the authoring layer.
 * New root renderers compose existing capabilities and provide only the blocks
 * and workspace behavior that are genuinely experience-specific.
 */
export const EXPERIENCE_AUTHORING_PROFILES = {
  tour: {
    capabilities: [...SURFACE_CAPABILITIES, 'flow', 'batch'],
    rootBlockTypes: ['tourStep'],
    workspace: 'sequence',
  },
  announcement: {
    capabilities: SURFACE_CAPABILITIES,
    rootBlockTypes: ['tooltip'],
    workspace: 'singleSurface',
  },
  hotspot: {
    capabilities: SURFACE_CAPABILITIES,
    rootBlockTypes: ['spotlight', 'tooltip'],
    workspace: 'singleSurface',
  },
  checklist: {
    capabilities: CONTENT_CAPABILITIES,
    rootBlockTypes: [],
    workspace: 'collection',
  },
  survey: {
    capabilities: CONTENT_CAPABILITIES,
    rootBlockTypes: [],
    workspace: 'collection',
  },
  knowledge: {
    capabilities: CONTENT_CAPABILITIES,
    rootBlockTypes: [],
    workspace: 'collection',
  },
} as const satisfies Record<DocumentType, ExperienceAuthoringProfile>;

const BLOCK_CAPABILITIES: Partial<
  Record<LodariqBlockType, readonly AuthoringExperienceCapability[]>
> = {
  tourStep: ['targeting', 'presentation', 'flow', 'batch', 'reviewRecovery'],
  tooltip: [
    'structuredContent',
    'actions',
    'targeting',
    'popupComposition',
    'presentation',
    'reviewRecovery',
  ],
  spotlight: ['targeting', 'presentation'],
  heading: ['structuredContent'],
  paragraph: ['structuredContent'],
  list: ['structuredContent'],
  divider: ['structuredContent'],
  media: ['structuredContent', 'presentation'],
  callout: ['structuredContent', 'presentation'],
  stat: ['structuredContent', 'presentation'],
  icon: ['structuredContent', 'presentation'],
  formField: ['structuredContent'],
  button: ['structuredContent', 'actions'],
  link: ['structuredContent', 'actions'],
};

export function experienceAuthoringProfile(type: DocumentType): ExperienceAuthoringProfile {
  return EXPERIENCE_AUTHORING_PROFILES[type];
}

export function experienceSupportsAuthoringCapability(
  type: DocumentType,
  capability: AuthoringExperienceCapability,
): boolean {
  const capabilities: readonly AuthoringExperienceCapability[] =
    EXPERIENCE_AUTHORING_PROFILES[type].capabilities;
  return capabilities.includes(capability);
}

export function blockSupportsAuthoringCapability(
  block: Pick<LodariqBlock, 'type'>,
  capability: AuthoringExperienceCapability,
): boolean {
  return BLOCK_CAPABILITIES[block.type]?.includes(capability) ?? false;
}

export function selectExperienceRootBlocks(document: LodariqDocument): LodariqBlock[] {
  const rootTypes = new Set<LodariqBlockType>(
    EXPERIENCE_AUTHORING_PROFILES[document.type].rootBlockTypes,
  );
  return document.blocks.filter((block) => rootTypes.has(block.type));
}
