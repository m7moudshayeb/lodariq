import { registerBuiltInExperiences } from './experiences/built-in';
import { experienceDefinition, type ExperienceDefinition } from './experiences/definition';
import type { ExperienceGesture } from './experiences/gestures';
import type {
  DocumentType,
  LodariqBlock,
  LodariqBlockType,
  LodariqDocument,
} from '@lodariq/schema';

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

/**
 * Whether a type answers a gesture on the page. The definitions have always
 * declared this — `announcement` has never listed `pick-target` — but nothing
 * read it, so the toolbar offered target picking for every type. An
 * announcement is triggered, not anchored: it is placed by dragging it to a
 * region, and *when* it appears is the trigger's job.
 */
export function experienceAnswersGesture(type: DocumentType, gesture: ExperienceGesture): boolean {
  return requireExperience(type).gestures.includes(gesture);
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

/**
 * The same bootstrapping read, for callers that treat an unregistered type as
 * "this gesture does not apply" rather than as an error.
 *
 * Reading `experienceDefinition` directly is a trap: it answers from whatever
 * the registry happens to hold, so a caller only worked as long as some
 * unrelated module had already been imported for its registration side effect.
 * Removing one such import turned a drop gesture into a silent no-op, which is
 * exactly the import-order dependence this indirection exists to remove.
 */
export function registeredExperienceDefinition(
  type: DocumentType,
): ExperienceDefinition | undefined {
  const existing = experienceDefinition(type);
  if (existing) return existing;
  registerBuiltInExperiences();
  return experienceDefinition(type);
}
