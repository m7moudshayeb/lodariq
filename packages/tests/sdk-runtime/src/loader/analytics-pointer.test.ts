// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLodariq } from '@lodariq/sdk-runtime/lodariq-loader';
import { LodariqRuntime } from '@lodariq/sdk-runtime/runtime';

describe('loader analytics pointer propagation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes environment-token bootstrap pointers into the runtime event envelope', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const pointer = {
      documentId: 'doc_viewer',
      generation: 3,
      publicationId: 'pub_viewer_3',
      contentHash: `sha256-${'a'.repeat(64)}`,
    };

    class ViewerRuntime extends LodariqRuntime {
      override track(name: string, props?: Record<string, unknown>): void {
        super.track(name, props);
        this.flush();
      }
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_viewer',
        environment: 'staging',
        manifestUrl: '/lodariq/manifest.json',
      },
      {
        fetchInstallContext: async () => ({
          workspaceId: 'wk_viewer',
          environmentId: 'env_staging',
          environment: 'staging',
          manifest: {
            documentId: pointer.documentId,
            currentVersion: pointer.contentHash,
          },
          currentDocumentUrl: '/v1/sdk/current-document',
          ingestUrl: '/v1/sdk/events',
          analyticsPointers: [pointer],
          authoring: { enabled: false },
        }),
        loadRuntime: async () => ({ LodariqRuntime: ViewerRuntime }),
      },
    );

    api.track('tour_started', { documentId: pointer.documentId });

    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<Record<string, unknown>>;
    };
    expect(body.events[0]).toMatchObject({
      name: 'tour_started',
      documentId: pointer.documentId,
      pointer: {
        generation: pointer.generation,
        publicationId: pointer.publicationId,
        contentHash: pointer.contentHash,
      },
    });
  });
});
