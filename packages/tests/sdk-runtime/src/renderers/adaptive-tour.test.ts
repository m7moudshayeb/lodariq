// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledDocument } from '@lodariq/schema';
import { TourPlayer } from '@lodariq/sdk-runtime/renderers/adaptive-tour';

const evaluatedAt = '2026-08-21T12:00:00.000Z';
const documentFixture = {
  documentId: 'doc_adaptive',
  type: 'tour',
  contentHash: 'local-preview',
  schemaVersion: '1.0.0',
  compilerVersion: '0.1.0',
  targets: [],
  steps: [
    step('step_create', 'Create a project', 'project_created'),
    step('step_invite', 'Invite a teammate', 'member_invited'),
    step('step_finish', 'Finish setup'),
  ],
} as unknown as CompiledDocument;

describe('adaptive tour playback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.querySelector('lodariq-tour')?.remove();
  });

  it('decides before paint and reports adaptive skips separately', async () => {
    const onAdaptiveSkip = vi.fn();
    const player = new TourPlayer(documentFixture, {
      adaptiveContext: {
        policy: { enabled: true, minimumOccurrences: 2, lookbackDays: 30 },
        evaluatedAt,
        evidence: [{ eventName: 'project_created', occurrences: 2, lastObservedAt: evaluatedAt }],
      },
      onAdaptiveSkip,
    });

    player.start();
    await player.waitUntilReady();
    const text = document.querySelector('lodariq-tour')?.shadowRoot?.textContent ?? '';
    expect(text).not.toContain('Create a project');
    expect(text).toContain('Invite a teammate');
    expect(onAdaptiveSkip).toHaveBeenCalledOnce();
    expect(onAdaptiveSkip).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'step_create' }),
      expect.objectContaining({ reason: 'demonstrated', occurrences: 2 }),
    );
    player.stop();
  });

  it('keeps the final step visible when every taught step is demonstrated', async () => {
    const taughtOnly = {
      ...documentFixture,
      steps: documentFixture.steps.slice(0, 2),
    } as CompiledDocument;
    const player = new TourPlayer(taughtOnly, {
      adaptiveContext: {
        policy: { enabled: true, minimumOccurrences: 1, lookbackDays: 30 },
        evaluatedAt,
        evidence: [
          { eventName: 'project_created', occurrences: 1, lastObservedAt: evaluatedAt },
          { eventName: 'member_invited', occurrences: 1, lastObservedAt: evaluatedAt },
        ],
      },
    });

    player.start();
    await player.waitUntilReady();
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Invite a teammate',
    );
    player.stop();
  });
});

function step(id: string, text: string, teaches?: string): CompiledDocument['steps'][number] {
  return {
    id,
    ...(teaches ? { teaches } : {}),
    placement: 'bottom',
    body: [{ id: `${id}_text`, type: 'paragraph', text, props: {} }],
  };
}
