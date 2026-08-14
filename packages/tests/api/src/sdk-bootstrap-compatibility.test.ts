import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  PUBLIC_MANIFEST_SCHEMA_VERSION,
  type CompiledDocumentV3,
} from '@lodariq/schema';
import type { PersistedDocumentDeployment, PersistedPublication } from '@lodariq/database';
import { createActiveManifestPointerFromPublication } from '../../../../apps/api/src/routes/control-plane/helpers/sdk-bootstrap';

const compiled: CompiledDocumentV3 = {
  artifactSchemaVersion: '3',
  documentId: 'doc_legacy_supported',
  type: 'tour',
  contentHash: `sha256-${'a'.repeat(64)}`,
  schemaVersion: '1.0.0',
  compilerVersion: '0.4.0',
  rendererContractVersion: '3',
  trigger: { type: 'manual' },
  audience: { environments: ['production'] },
  theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  appearance: DEFAULT_EXPERIENCE_APPEARANCE,
  targets: [],
  steps: [],
  localization: { defaultLocale: 'en', defaultTitle: 'Legacy supported tour', variants: [] },
};

const deployment: PersistedDocumentDeployment = {
  workspaceId: 'wk_compatibility',
  environmentId: 'env_production',
  documentId: compiled.documentId,
  state: 'active',
  generation: 3,
  activePublicationId: 'pub_legacy_supported',
  updatedAt: '2026-08-14T18:00:00.000Z',
};

function publication(document: CompiledDocumentV3): PersistedPublication {
  return {
    id: 'pub_legacy_supported',
    workspaceId: deployment.workspaceId,
    correlationId: 'corr_legacy_supported',
    environmentId: deployment.environmentId,
    environment: 'production',
    documentId: document.documentId,
    documentVersionId: 'docv_legacy_supported',
    compiledArtifactId: 'artifact_legacy_supported',
    contentHash: document.contentHash,
    action: 'rollback',
    sourcePublicationId: 'pub_legacy_original',
    previousPublicationId: 'pub_current',
    releaseOperationId: 'relop_legacy_supported',
    publishedByUserId: 'user_owner',
    publishedAt: deployment.updatedAt,
    artifact: {
      id: 'artifact_legacy_supported',
      workspaceId: deployment.workspaceId,
      documentId: document.documentId,
      documentVersionId: 'docv_legacy_supported',
      contentHash: document.contentHash,
      compilerVersion: document.compilerVersion,
      themeVersionId: document.theme.themeVersionId,
      themeContentHash: document.theme.contentHash,
      rendererContractVersion: document.rendererContractVersion,
      compiled: document,
      createdAt: '2026-08-10T12:00:00.000Z',
    },
  };
}

describe('public SDK manifest compatibility', () => {
  it('materializes a supported historical artifact without recompilation', () => {
    const manifest = createActiveManifestPointerFromPublication(
      'https://api.lodariq.io',
      deployment,
      publication(compiled),
    );

    expect(manifest).toMatchObject({
      schemaVersion: PUBLIC_MANIFEST_SCHEMA_VERSION,
      publicationId: deployment.activePublicationId,
      artifact: {
        artifactSchemaVersion: '3',
        compilerVersion: '0.4.0',
        rendererContractVersion: '3',
      },
    });
  });

  it('fails closed for a mismatched artifact and renderer pair', () => {
    const incompatible = { ...compiled, rendererContractVersion: '4' } as CompiledDocumentV3;

    expect(
      createActiveManifestPointerFromPublication(
        'https://api.lodariq.io',
        deployment,
        publication(incompatible),
      ),
    ).toBeNull();
  });
});
