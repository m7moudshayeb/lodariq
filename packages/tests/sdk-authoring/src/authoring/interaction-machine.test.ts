import { describe, expect, it } from 'vitest';
import { createAuthoringInteractionActor } from '../../../../../packages/sdk-authoring/src/authoring/state/interaction-machine';

describe('authoring interaction state', () => {
  it('keeps one selected target while moving between quick and detailed editing', () => {
    const actor = createAuthoringInteractionActor();
    actor.start();

    actor.send({ type: 'SELECT_BLOCK', blockId: 'button_1' });
    expect(actor.getSnapshot().value).toBe('inspecting');
    expect(actor.getSnapshot().context.selectedBlockId).toBe('button_1');

    actor.send({ type: 'OPEN_DETAILS' });
    expect(actor.getSnapshot().value).toBe('details');

    actor.send({ type: 'CLOSE_OVERLAY' });
    expect(actor.getSnapshot().value).toBe('inspecting');
    expect(actor.getSnapshot().context.selectedBlockId).toBe('button_1');
  });

  it('returns to idle when an insertion overlay closes without a selection', () => {
    const actor = createAuthoringInteractionActor();
    actor.start();

    actor.send({ type: 'OPEN_INSERT' });
    expect(actor.getSnapshot().value).toBe('inserting');

    actor.send({ type: 'CLOSE_OVERLAY' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.selectedBlockId).toBeNull();
  });

  it('clears selection and closes every contextual state explicitly', () => {
    const actor = createAuthoringInteractionActor();
    actor.start();

    actor.send({ type: 'SELECT_BLOCK', blockId: 'text_1' });
    actor.send({ type: 'BEGIN_TEXT_EDIT' });
    expect(actor.getSnapshot().value).toBe('editingText');

    actor.send({ type: 'CLEAR_SELECTION' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.selectedBlockId).toBeNull();
  });
});
