import { registerBuiltInExperiences } from './experiences/built-in';
import { experienceDefinition, type ExperienceDefinition } from './experiences/definition';
import type { DocumentType, LodariqBlock, LodariqBlockType, LodariqDocument } from '@lodariq/schema';

export {
  AUTHORING_EXPERIENCE_CAPABILITIES,
  type AuthoringExperienceCapability,
  type ExperienceAuthoringProfile,
  type ExperienceWorkspaceKind,
} from './experiences/capabilities';
import type {
  AuthoringExperienceCapability,
  ExperienceAuthoringProfile,
} from './experiences/capabilities';

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

/**
 * Reads the experience registry, which is the one place a type's capabilities are
 * declared. A second table here is exactly the drift this indirection prevents.
 */
export function experienceAuthoringProfile(type: DocumentType): ExperienceAuthoringProfile {
  const definition = requireExperience(type);
  return {
    capabilities: definition.capabilities,
    rootBlockTypes: definition.rootBlockTypes,
    workspace: definition.workspace,
  };
}

export function experienceSupportsAuthoringCapability(
  type: DocumentType,
  capability: AuthoringExperienceCapability,
): boolean {
  return requireExperience(type).capabilities.includes(capability);
}

export function blockSupportsAuthoringCapability(
  block: Pick<LodariqBlock, 'type'>,
  capability: AuthoringExperienceCapability,
): boolean {
  return BLOCK_CAPABILITIES[block.type]?.includes(capability) ?? false;
}

export function selectExperienceRootBlocks(document: LodariqDocument): LodariqBlock[] {
  const rootTypes = new Set<LodariqBlockType>(requireExperience(document.type).rootBlockTypes);
  return document.blocks.filter((block) => rootTypes.has(block.type));
}

/**
 * Registration is idempotent and happens on first read, so no caller has to
 * remember to bootstrap the registry and no import order can leave it empty.
 */
function requireExperience(type: DocumentType): ExperienceDefinition {
  const existing = experienceDefinition(type);
  if (existing) return existing;
  registerBuiltInExperiences();
  const registered = experienceDefinition(type);
  if (!registered) throw new Error(`Lodariq: no experience definition for "${type}"`);
  return registered;
}
