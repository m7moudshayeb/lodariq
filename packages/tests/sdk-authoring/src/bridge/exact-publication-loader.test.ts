// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
  type NewCompiledDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { loadExactPublishedArtifact } from '@lodariq/sdk-authoring/bridge';

describe('exact publication loader', () => {
  beforeEach(() => {
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts only a schema-valid artifact whose canonical bytes match both hashes', async () => {
    const compiled = await compiledFixture();
    stubArtifactResponse(compiled);

    await expect(
      loadExactPublishedArtifact({
        url: 'https://api.lodariq.io/v1/sdk/artifacts/current',
        documentId: compiled.documentId,
        expectedContentHash: compiled.contentHash,
        expectedThemeVersionId: compiled.theme.themeVersionId,
      }),
    ).resolves.toEqual(compiled);
  });

  it('rejects a body changed without recomputing its claimed content hash', async () => {
    const compiled = await compiledFixture();
    const tampered = structuredClone(compiled);
    tampered.steps[0]!.body[0]!.text = 'Tampered after publication';
    stubArtifactResponse(tampered);

    await expect(
      loadExactPublishedArtifact({
        url: 'https://api.lodariq.io/v1/sdk/artifacts/current',
        documentId: compiled.documentId,
        expectedContentHash: compiled.contentHash,
      }),
    ).rejects.toThrow('content-addressed integrity');
  });
});

async function compiledFixture(): Promise<NewCompiledDocument> {
  return compileDocument({
    document: structuredClone(tourFixture) as LodariqDocument,
    theme: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
}

function stubArtifactResponse(compiled: NewCompiledDocument): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(compiled), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}
