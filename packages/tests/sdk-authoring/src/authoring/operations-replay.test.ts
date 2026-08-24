// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LodariqBlock } from '@lodariq/schema';
import { OperationsAnalytics } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/operations-analytics';
import type { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import type { LocalAuthoringFrameSnapshot } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/types';
import { createBridgeOperationsServices } from '../../../../../packages/sdk-authoring/src/authoring/operations/operations-bridge';

const session = {
  correlationId: 'run_scoped_1',
  startedAt: '2026-08-21T10:00:00.000Z',
  endedAt: '2026-08-21T10:00:12.000Z',
  durationMs: 12_000,
  outcome: 'completed' as const,
  stepsReached: 1,
  unresolvedStepIds: [],
  beats: [
    { name: 'experience_shown', at: '2026-08-21T10:00:00.000Z', offsetMs: 0 },
    {
      name: 'step_shown',
      at: '2026-08-21T10:00:01.000Z',
      offsetMs: 1_000,
      stepId: 'step_1',
      resolved: true,
    },
    { name: 'experience_completed', at: '2026-08-21T10:00:12.000Z', offsetMs: 12_000 },
  ],
};

describe('scoped experience replay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('crosses the semantic operations bridge', async () => {
    const listeners = new Set<(message: never) => void>();
    const services = createBridgeOperationsServices({
      send: (requestId, method) => {
        expect(method).toBe('listSessions');
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({ requestId, result: [session] } as never);
          }
        });
      },
      subscribe: (listener) => {
        listeners.add(listener as never);
        return () => listeners.delete(listener as never);
      },
    });

    await expect(services.listSessions?.()).resolves.toEqual([session]);
  });

  it('heartbeats and leaves collaboration through the same credential-owning bridge', async () => {
    const listeners = new Set<(message: never) => void>();
    const send = vi.fn((requestId: string, method: string) => {
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({
            requestId,
            result:
              method === 'heartbeatCollaboration'
                ? {
                    selfParticipantId: `presence_${'a'.repeat(24)}`,
                    generatedAt: '2026-08-21T10:00:00.000Z',
                    documentUpdatedAt: '2026-08-21T10:00:00.000Z',
                    draftChanged: false,
                    peers: [],
                    locks: [],
                    comments: [],
                  }
                : undefined,
          } as never);
        }
      });
    });
    const services = createBridgeOperationsServices({
      send,
      subscribe: (listener) => {
        listeners.add(listener as never);
        return () => listeners.delete(listener as never);
      },
    });

    await expect(
      services.heartbeatCollaboration?.({ stepId: 'step_1', selection: null }),
    ).resolves.toMatchObject({ selfParticipantId: expect.stringMatching(/^presence_/u) });
    await expect(services.leaveCollaboration?.()).resolves.toBeUndefined();
    expect(send.mock.calls.map((call) => call[1])).toEqual([
      'heartbeatCollaboration',
      'leaveCollaboration',
    ]);
  });

  it('reveals only bounded experience beats', async () => {
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    const steps: LodariqBlock[] = [
      {
        id: 'step_1',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          { id: 'heading_1', type: 'heading', content: 'Welcome', props: {}, children: [] },
        ],
      },
    ];
    const snapshot = {
      experienceAnalytics: {
        environmentId: 'env_staging',
        shown: 1,
        completed: 1,
        dismissed: 0,
        funnel: [],
        adoption: [],
        formResponses: [],
      },
      experienceSessions: [session],
    } as unknown as LocalAuthoringFrameSnapshot;

    await act(async () => {
      root.render(
        createElement(OperationsAnalytics, {
          controller: {} as LocalAuthoringFrameController,
          snapshot,
          steps,
        }),
      );
    });

    const toggle = [...rootElement.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'See recent sessions',
    );
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => toggle?.click());
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(rootElement.textContent).toContain('Completed · 12s · 1 step');
    expect(rootElement.textContent).toContain('Experience shown');
    expect(rootElement.textContent).toContain('Step shown · Welcome');
    expect(rootElement.textContent).not.toContain('pointer');
    expect(rootElement.textContent).not.toContain('keystroke');

    await act(async () => root.unmount());
  });
});
