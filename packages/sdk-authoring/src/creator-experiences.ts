import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  defaultExperienceBehavior,
  type Environment,
  type LodariqDocument,
} from '@lodariq/schema';
import { registeredExperienceDefinition } from './authoring/experience-authoring-capabilities';
import type { CreatorEnabledExperienceType } from './creator-experience-types';

export {
  CREATOR_ENABLED_EXPERIENCE_TYPES,
  type CreatorEnabledExperienceType,
} from './creator-experience-types';

export interface CreateTourDraftInput {
  documentId: string;
  workspaceId: string;
  environment: Exclude<Environment, 'production'>;
  schemaVersion: string;
  title?: string;
  /** @deprecated Fresh drafts are empty; block ids are allocated when the creator adds a step. */
  createBlockId?: () => string;
}

export interface CreateExperienceDraftInput extends CreateTourDraftInput {
  type: CreatorEnabledExperienceType;
}

export function createTourDraft(input: CreateTourDraftInput): LodariqDocument {
  return {
    id: input.documentId,
    workspaceId: input.workspaceId,
    type: 'tour',
    status: 'draft',
    title: input.title ?? 'Untitled tour',
    trigger: { type: 'manual' },
    audience: { environments: [input.environment] },
    appearance: structuredClone(DEFAULT_EXPERIENCE_APPEARANCE),
    targets: [],
    blocks: [],
    schemaVersion: input.schemaVersion,
  };
}

const UNTITLED_EXPERIENCE_TITLES: Readonly<Record<CreatorEnabledExperienceType, string>> = {
  tour: 'Untitled tour',
  announcement: 'Untitled announcement',
  hotspot: 'Untitled hotspot',
  survey: 'Untitled survey',
  checklist: 'Untitled checklist',
};

/** Creates a real, editable draft for every experience the creator catalog offers. */
export function createExperienceDraft(input: CreateExperienceDraftInput): LodariqDocument {
  if (input.type === 'tour') return createTourDraft(input);
  const definition = registeredExperienceDefinition(input.type);
  const blocks =
    definition?.seed({
      createBlockId: input.createBlockId ?? (() => `block_${createRandomId()}`),
    }) ?? [];
  return {
    id: input.documentId,
    workspaceId: input.workspaceId,
    type: input.type,
    status: 'draft',
    title: input.title ?? UNTITLED_EXPERIENCE_TITLES[input.type],
    trigger: { type: 'manual' },
    audience: { environments: [input.environment] },
    appearance: structuredClone(DEFAULT_EXPERIENCE_APPEARANCE),
    experience: defaultExperienceBehavior(input.type),
    ...(input.type === 'announcement' ? { surfaceForm: 'modal' as const } : {}),
    ...(input.type === 'checklist' ? { surfaceForm: 'floating' as const } : {}),
    targets: [],
    blocks: structuredClone([...blocks]),
    schemaVersion: input.schemaVersion,
  };
}

export function createLocalExperienceId(): string {
  return `doc_local_${createRandomId()}`;
}

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
