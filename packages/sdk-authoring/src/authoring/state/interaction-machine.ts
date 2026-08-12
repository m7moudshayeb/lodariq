import { assign, createActor, setup, type ActorRefFrom } from 'xstate';

export type AuthoringInteractionMode =
  'idle' | 'inspecting' | 'editingText' | 'details' | 'transforming' | 'inserting' | 'previewing';

interface AuthoringInteractionContext {
  selectedBlockId: string | null;
}

export type AuthoringInteractionEvent =
  | { type: 'SELECT_BLOCK'; blockId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'BEGIN_TEXT_EDIT' }
  | { type: 'OPEN_DETAILS' }
  | { type: 'BEGIN_TRANSFORM' }
  | { type: 'OPEN_INSERT' }
  | { type: 'OPEN_PREVIEW' }
  | { type: 'CLOSE_OVERLAY' };

export const authoringInteractionMachine = setup({
  types: {
    context: {} as AuthoringInteractionContext,
    events: {} as AuthoringInteractionEvent,
  },
  actions: {
    clearSelection: assign({ selectedBlockId: null }),
    selectBlock: assign({
      selectedBlockId: ({ event }) => (event.type === 'SELECT_BLOCK' ? event.blockId : null),
    }),
  },
  guards: {
    hasSelection: ({ context }) => context.selectedBlockId !== null,
  },
}).createMachine({
  id: 'authoringInteraction',
  initial: 'idle',
  context: { selectedBlockId: null },
  on: {
    SELECT_BLOCK: { actions: 'selectBlock', target: '.inspecting' },
    CLEAR_SELECTION: { actions: 'clearSelection', target: '.idle' },
    OPEN_INSERT: { target: '.inserting' },
    OPEN_PREVIEW: { target: '.previewing' },
  },
  states: {
    idle: {},
    inspecting: {
      on: {
        BEGIN_TEXT_EDIT: { guard: 'hasSelection', target: '#authoringInteraction.editingText' },
        BEGIN_TRANSFORM: { guard: 'hasSelection', target: '#authoringInteraction.transforming' },
        OPEN_DETAILS: { guard: 'hasSelection', target: '#authoringInteraction.details' },
      },
    },
    editingText: {
      on: { CLOSE_OVERLAY: '#authoringInteraction.inspecting' },
    },
    details: {
      on: { CLOSE_OVERLAY: '#authoringInteraction.inspecting' },
    },
    transforming: {
      on: { CLOSE_OVERLAY: '#authoringInteraction.inspecting' },
    },
    inserting: {
      on: {
        CLOSE_OVERLAY: [
          { guard: 'hasSelection', target: '#authoringInteraction.inspecting' },
          { target: '#authoringInteraction.idle' },
        ],
      },
    },
    previewing: {
      on: {
        CLOSE_OVERLAY: [
          { guard: 'hasSelection', target: '#authoringInteraction.inspecting' },
          { target: '#authoringInteraction.idle' },
        ],
      },
    },
  },
});

export type AuthoringInteractionActor = ActorRefFrom<typeof authoringInteractionMachine>;

export function createAuthoringInteractionActor(): AuthoringInteractionActor {
  return createActor(authoringInteractionMachine);
}

export function selectedBlockIdOf(actor: AuthoringInteractionActor): string | null {
  return actor.getSnapshot().context.selectedBlockId;
}
