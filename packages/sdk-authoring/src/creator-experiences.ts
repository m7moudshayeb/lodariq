import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  type Environment,
  type LodariqBlock,
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
  createBlockId?: () => string;
}

export function createTourDraft(input: CreateTourDraftInput): LodariqDocument {
  const createBlockId = input.createBlockId ?? createLocalBlockId;
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
    blocks: [createStartingStep(createBlockId)],
    schemaVersion: input.schemaVersion,
  };
}

function createStartingStep(createBlockId: () => string): LodariqBlock {
  return {
    id: createBlockId(),
    type: 'tourStep',
    props: { index: 0 },
    status: 'incomplete',
    children: [
      {
        id: createBlockId(),
        type: 'tooltip',
        props: { placement: 'bottom' },
        status: 'incomplete',
        children: [
          {
            id: createBlockId(),
            type: 'heading',
            content: 'Introduce this feature',
            props: { level: 2 },
            status: 'ready',
            children: [],
          },
          {
            id: createBlockId(),
            type: 'paragraph',
            content: 'Explain what is useful here in one short sentence.',
            props: {},
            status: 'ready',
            children: [],
          },
          {
            id: createBlockId(),
            type: 'button',
            content: 'Continue',
            props: { variant: 'primary', action: { type: 'next' } },
            status: 'ready',
            children: [],
          },
        ],
      },
    ],
  };
}

function createLocalBlockId(): string {
  return `blk_${createRandomId()}`;
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
