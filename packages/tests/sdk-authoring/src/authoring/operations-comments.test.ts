// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCommercialEntitlements, type LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { OperationsCollaboration } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/operations-collaboration';
import type { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import type { LocalAuthoringFrameSnapshot } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/types';

describe('review threads', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    vi.restoreAllMocks();
  });

  it('shows semantic anchors and sends a reply through the controller', async () => {
    const documentState = structuredClone(tourFixture) as LodariqDocument;
    const replyToComment = vi.fn();
    const takeOverStepLock = vi.fn();
    const controller = {
      activateTourStep: vi.fn(),
      addComment: vi.fn(),
      replyToComment,
      requestStepLock: vi.fn(),
      takeOverStepLock,
      resolveComment: vi.fn(),
    } as unknown as LocalAuthoringFrameController;
    const snapshot = {
      documentState,
      activeStepId: 'block_step_1',
      presence: {
        peers: [
          {
            id: 'peer:step',
            name: 'Mina Chen',
            stepId: 'block_step_1',
            holdsLock: true,
            canTakeover: true,
          },
        ],
      },
      comments: [
        {
          id: 'cmt_thread',
          anchor: {
            type: 'target',
            stepId: 'block_step_1',
            targetId: 'target_new_project',
          },
          author: 'Mina Chen',
          body: 'Check this target on mobile.',
          replies: [
            {
              id: 'cmt_reply',
              author: 'Omar Saleh',
              body: 'The target remains visible.',
              createdAt: '2026-08-21T10:01:00.000Z',
            },
          ],
          resolved: false,
          createdAt: '2026-08-21T10:00:00.000Z',
        },
      ],
    } as unknown as LocalAuthoringFrameSnapshot;
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(
        createElement(OperationsCollaboration, {
          controller,
          snapshot,
          steps: documentState.blocks,
        }),
      );
    });
    expect(rootElement.textContent).toContain('Target · Create your first project');
    expect(rootElement.textContent).toContain('The target remains visible.');
    const takeoverButton = [...rootElement.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Take over',
    );
    await act(async () => takeoverButton?.click());
    expect(takeOverStepLock).toHaveBeenCalledWith('block_step_1');

    const replyButton = [...rootElement.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Reply',
    );
    await act(async () => replyButton?.click());
    const reply = rootElement.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Reply to Mina Chen"]',
    );
    if (!reply) throw new Error('reply composer missing');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setValue?.call(reply, 'Looks good after the copy change.');
      reply.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = reply
      .closest('form')
      ?.querySelector<HTMLButtonElement>('button:not([disabled])');
    await act(async () => {
      submit?.click();
    });
    expect(replyToComment).toHaveBeenCalledWith('cmt_thread', 'Looks good after the copy change.');

    await act(async () => root.unmount());
  });

  it('keeps Growth presence readable while disabling Scale locks and comments', async () => {
    const documentState = structuredClone(tourFixture) as LodariqDocument;
    const controller = {
      activateTourStep: vi.fn(),
      addComment: vi.fn(),
      replyToComment: vi.fn(),
      requestStepLock: vi.fn(),
      takeOverStepLock: vi.fn(),
      resolveComment: vi.fn(),
    } as unknown as LocalAuthoringFrameController;
    const snapshot = {
      documentState,
      activeStepId: 'block_step_1',
      commercialUsage: { features: resolveCommercialEntitlements('growth').features },
      presence: {
        peers: [
          {
            id: 'peer:growth',
            name: 'Mina Chen',
            stepId: 'block_step_1',
            holdsLock: true,
            canTakeover: true,
          },
        ],
      },
      comments: [
        {
          id: 'cmt_growth',
          anchor: { type: 'step', stepId: 'block_step_1' },
          author: 'Mina Chen',
          body: 'Existing review stays readable.',
          replies: [],
          resolved: false,
          createdAt: '2026-08-21T10:00:00.000Z',
        },
      ],
    } as unknown as LocalAuthoringFrameSnapshot;
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(
        createElement(OperationsCollaboration, {
          controller,
          snapshot,
          steps: documentState.blocks,
        }),
      );
    });

    expect(rootElement.textContent).toContain('Mina Chen');
    expect(rootElement.textContent).toContain('Existing review stays readable.');
    expect(button(rootElement, 'Go there').disabled).toBe(false);
    expect(button(rootElement, 'Take over').disabled).toBe(true);
    expect(button(rootElement, 'Resolve').disabled).toBe(true);
    expect(button(rootElement, 'Post').disabled).toBe(true);
    expect(rootElement.querySelector('.comment-composer textarea')).toMatchObject({
      disabled: true,
    });

    await act(async () => root.unmount());
  });
});

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const match = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!match) throw new Error(`${label} button missing`);
  return match;
}
