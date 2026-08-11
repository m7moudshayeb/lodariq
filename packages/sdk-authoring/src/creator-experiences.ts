import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  type Environment,
  type LodariqDocument,
} from '@lodariq/schema';

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

export function createLocalExperienceId(): string {
  return `doc_local_${createRandomId()}`;
}

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
