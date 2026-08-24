// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompiledDocument, PublicDemoArtifact } from '@lodariq/schema';
import { mountPublicDemo } from '@lodariq/sdk-runtime/demo-player';

const HASH = `sha256-${'1'.repeat(64)}`;

const artifact: CompiledDocument = {
  documentId: 'doc_public_demo',
  type: 'tour',
  contentHash: HASH,
  schemaVersion: '1.0.0',
  compilerVersion: '0.1.0',
  targets: [],
  steps: [
    {
      id: 'step_public_demo',
      body: [
        { id: 'heading_public_demo', type: 'heading', text: 'Public demo', props: {} },
        {
          id: 'button_public_demo',
          type: 'button',
          text: 'Finish',
          props: { action: { type: 'complete' } },
        },
      ],
    },
  ],
};

const envelope: PublicDemoArtifact = {
  schemaVersion: '1',
  demoId: 'demo_12345678901234567890',
  contentHash: `sha256-${'2'.repeat(64)}`,
  presentationContentHash: HASH,
  artifact,
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('public demo player', () => {
  it('loads a targetless artifact, renders it interactively, and emits only bounded events', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const root = document.createElement('section');
    document.body.append(root);

    await mountPublicDemo(root, '/d/demo_12345678901234567890');

    const host = document.body.querySelector('lodariq-tour');
    expect(host).not.toBeNull();
    host?.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click();
    await Promise.resolve();

    expect(requests[0]?.url).toBe('/v1/demos/demo_12345678901234567890/artifact');
    expect(
      requests
        .slice(1)
        .every((request) => request.url === '/v1/demos/demo_12345678901234567890/events'),
    ).toBe(true);
    const events = requests
      .slice(1)
      .map((request) => JSON.parse(String(request.init?.body)) as Record<string, unknown>);
    expect(events).toEqual(
      expect.arrayContaining([
        { schemaVersion: '1', event: 'viewed' },
        { schemaVersion: '1', event: 'step_started', stepId: 'step_public_demo' },
        { schemaVersion: '1', event: 'completed' },
      ]),
    );
    expect(events.every((event) => Object.keys(event).every((key) => key !== 'userId'))).toBe(true);
  });
});
