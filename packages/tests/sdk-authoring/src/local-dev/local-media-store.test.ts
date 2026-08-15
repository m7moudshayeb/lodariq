// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import type { AuthoringMediaAssetResource } from '@lodariq/schema';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadLocalMediaAssetBlob,
  loadLocalMediaAssetResources,
  saveLocalMediaAssetRecord,
} from '../../../../../packages/sdk-authoring/src/local-dev/local-media-store';

describe('local authoring media persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips video metadata and bytes across independent database reads', async () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
    const blob = new NodeBlob([bytes], { type: 'video/mp4' }) as Blob;
    const resource: AuthoringMediaAssetResource = {
      id: 'asset_local_persisted_video',
      kind: 'video',
      filename: 'persisted-video.mp4',
      contentType: 'video/mp4',
      byteLength: blob.size,
      contentHash: `sha256-${'a'.repeat(64)}`,
      savedToLibrary: true,
      createdAt: '2026-08-15T00:00:00.000Z',
      downloadPath: '/v1/authoring/media-assets/asset_local_persisted_video',
    };

    await saveLocalMediaAssetRecord({ blob, resource });

    const hydratedResources = await loadLocalMediaAssetResources();
    const hydratedBlob = await loadLocalMediaAssetBlob(resource.id);

    expect(hydratedResources).toEqual([resource]);
    expect(hydratedResources[0]).not.toBe(resource);
    expect(hydratedBlob).not.toBeNull();
    expect(hydratedBlob).not.toBe(blob);
    expect(hydratedBlob?.type).toBe('video/mp4');
    expect(new Uint8Array(await hydratedBlob!.arrayBuffer())).toEqual(bytes);
  });
});
