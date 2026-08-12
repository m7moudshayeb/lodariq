import { describe, expect, it } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DocumentDeployment,
  ManifestPointer,
  ManifestPointerV2,
  ReleaseMutationGuard,
  RENDERER_CONTRACT_VERSION,
  VersionedManifestPointer,
  validate,
} from '@lodariq/schema';

const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;
const THEME_HASH = `sha256-${'b'.repeat(64)}`;

describe('release pointer contracts', () => {
  it('requires bounded idempotency and compare-and-swap release guards', () => {
    expect(
      validate(ReleaseMutationGuard, {
        idempotencyKey: 'publish:request_123',
        requestHash: CONTENT_HASH,
        expectedGeneration: 0,
      }).valid,
    ).toBe(true);
    expect(
      validate(ReleaseMutationGuard, {
        idempotencyKey: 'short',
        requestHash: 'not-a-hash',
        expectedGeneration: -1,
      }).valid,
    ).toBe(false);
  });

  it('discriminates active and inactive document deployments', () => {
    expect(
      validate(DocumentDeployment, {
        workspaceId: 'wk_1',
        environmentId: 'env_staging',
        documentId: 'doc_1',
        state: 'active',
        generation: 3,
        activePublicationId: 'pub_3',
        pendingReleaseOperationId: null,
        updatedAt: '2026-08-06T12:00:00.000Z',
      }).valid,
    ).toBe(true);
    expect(
      validate(DocumentDeployment, {
        workspaceId: 'wk_1',
        environmentId: 'env_staging',
        documentId: 'doc_1',
        state: 'inactive',
        generation: 0,
        activePublicationId: null,
        updatedAt: '2026-08-06T12:00:00.000Z',
      }).valid,
    ).toBe(true);
    expect(
      validate(DocumentDeployment, {
        workspaceId: 'wk_1',
        environmentId: 'env_staging',
        documentId: 'doc_1',
        state: 'active',
        generation: 3,
        activePublicationId: null,
        updatedAt: '2026-08-06T12:00:00.000Z',
      }).valid,
    ).toBe(false);
  });

  it('validates strict active and inactive V2 manifests', () => {
    const active = {
      schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
      workspaceId: 'wk_1',
      environmentId: 'env_staging',
      documentId: 'doc_1',
      state: 'active',
      generation: 3,
      publicationId: 'pub_3',
      activatedAt: '2026-08-06T12:00:00.000Z',
      artifact: {
        artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
        contentHash: CONTENT_HASH,
        compilerVersion: COMPILER_VERSION,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
        themeVersionId: 'themev_1',
        themeContentHash: THEME_HASH,
        url: `/v1/sdk/workspaces/wk_1/environments/env_staging/documents/doc_1/artifacts/${CONTENT_HASH}`,
        integrity: 'sha256-YWJjZA==',
      },
    };
    expect(validate(ManifestPointerV2, active).valid).toBe(true);
    expect(
      validate(ManifestPointerV2, {
        ...active,
        artifact: { ...active.artifact, compilerVersion: 'future-compiler' },
      }).valid,
    ).toBe(false);
    expect(
      validate(ManifestPointerV2, {
        schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
        workspaceId: 'wk_1',
        environmentId: 'env_staging',
        documentId: 'doc_1',
        state: 'inactive',
        generation: 4,
        deactivatedAt: '2026-08-06T13:00:00.000Z',
      }).valid,
    ).toBe(true);
    expect(validate(ManifestPointerV2, { ...active, selector: '.tour' }).valid).toBe(false);
  });

  it('keeps the Phase 1 manifest readable through the compatibility contracts', () => {
    const legacy = {
      documentId: 'doc_legacy',
      currentVersion: CONTENT_HASH,
      artifact: {
        contentHash: CONTENT_HASH,
        compilerVersion: '0.1.0',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    };

    expect(validate(ManifestPointer, legacy).valid).toBe(true);
    expect(validate(VersionedManifestPointer, legacy).valid).toBe(true);
    expect(
      validate(VersionedManifestPointer, {
        ...legacy,
        schemaVersion: '3',
      }).valid,
    ).toBe(false);
  });
});
