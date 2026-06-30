// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, type LodariqDocument } from '@lodariq/schema';

describe('hosted editor authoring frame', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML =
      '<div id="authoring" data-state="waiting">Waiting for Lodariq authoring session.</div>';
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://staging.lodariq.com/products',
    });
    delete (window as { __lodariqEditorMounted?: boolean }).__lodariqEditorMounted;
  });

  it('ignores init messages from origins other than the embedding host', async () => {
    await import('../../../../apps/editor/src/authoring-frame');

    window.dispatchEvent(initEvent('https://evil.example'));

    expect((window as { __lodariqEditorMounted?: boolean }).__lodariqEditorMounted).toBe(false);
    expect(document.getElementById('authoring')?.getAttribute('data-state')).toBe('waiting');
  });

  it('mounts only after a validated authoring init bridge message', async () => {
    await import('../../../../apps/editor/src/authoring-frame');

    window.dispatchEvent(initEvent('https://staging.lodariq.com'));

    expect((window as { __lodariqEditorMounted?: boolean }).__lodariqEditorMounted).toBe(true);
    expect(document.getElementById('authoring')?.getAttribute('data-state')).toBeNull();
  });
});

function initEvent(origin: string): MessageEvent {
  return new MessageEvent('message', {
    data: {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'authsess_editor',
      documentId: 'doc_tour_welcome',
      correlationId: 'authoring_init_1',
      type: 'authoring.init',
      workspaceId: 'wk_editor',
      environment: 'staging',
      document: editorDocument(),
    },
    origin,
    source: window.parent,
  });
}

function editorDocument(): LodariqDocument {
  return {
    id: 'doc_tour_welcome',
    workspaceId: 'wk_editor',
    type: 'tour',
    status: 'draft',
    title: 'Hosted editor test',
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      {
        id: 'step_1',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'tooltip_1',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'ready',
            children: [
              {
                id: 'heading_1',
                type: 'heading',
                content: 'Hosted editor',
                props: { level: 2 },
                status: 'ready',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
}
