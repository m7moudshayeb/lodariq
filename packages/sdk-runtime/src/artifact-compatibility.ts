import type {
  ActiveManifestPointerV2,
  CompiledDocument,
  CompiledDocumentV2,
  CompiledDocumentV3,
  CompiledDocumentV4,
  CompiledDocumentV5,
} from '@lodariq/schema';
import {
  PUBLIC_MANIFEST_SCHEMA_VERSION,
  isSupportedDeliveryContract,
} from '@lodariq/schema/delivery-compatibility';

const ARTIFACT_COMPATIBILITY_ERROR_MESSAGE = 'Lodariq artifact is incompatible with this runtime';

/** A fail-closed compatibility failure that callers must not treat as resume corruption. */
export class LodariqArtifactCompatibilityError extends Error {
  constructor() {
    super(ARTIFACT_COMPATIBILITY_ERROR_MESSAGE);
    this.name = 'LodariqArtifactCompatibilityError';
  }
}

type SupportedCompiledDocument =
  CompiledDocumentV2 | CompiledDocumentV3 | CompiledDocumentV4 | CompiledDocumentV5;

/**
 * Verifies the complete compatibility tuple before the public runtime is
 * installed. Keeping this check independent of TypeBox avoids pulling the
 * schema validator into the small production loader.
 */
export function assertSupportedArtifactManifest(manifest: ActiveManifestPointerV2): void {
  const candidate: unknown = manifest;
  if (!isRecord(candidate) || !isRecord(candidate['artifact'])) {
    throw new LodariqArtifactCompatibilityError();
  }
  const artifact = candidate['artifact'];
  if (
    candidate['schemaVersion'] !== PUBLIC_MANIFEST_SCHEMA_VERSION ||
    typeof artifact['compilerVersion'] !== 'string' ||
    !isSupportedDeliveryContract(
      artifact['artifactSchemaVersion'],
      artifact['rendererContractVersion'],
      artifact['themeContractVersion'],
    )
  ) {
    throw new LodariqArtifactCompatibilityError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Requires the loaded bytes to agree with both this runtime and every immutable
 * identity/compatibility pin advertised by the active manifest.
 */
export function assertSupportedArtifactMatchesManifest(
  document: CompiledDocument,
  manifest: ActiveManifestPointerV2,
): asserts document is SupportedCompiledDocument {
  assertSupportedArtifactManifest(manifest);
  assertSupportedCompiledArtifact(document);
  if (
    document.documentId !== manifest.documentId ||
    document.contentHash !== manifest.artifact.contentHash ||
    document.compilerVersion !== manifest.artifact.compilerVersion ||
    document.rendererContractVersion !== manifest.artifact.rendererContractVersion ||
    document.theme.contractVersion !== manifest.artifact.themeContractVersion ||
    document.theme.themeVersionId !== manifest.artifact.themeVersionId ||
    document.theme.contentHash !== manifest.artifact.themeContentHash
  ) {
    throw new LodariqArtifactCompatibilityError();
  }
}

/** Rejects every versioned artifact this runtime cannot render exactly. */
export function assertSupportedCompiledArtifact(
  document: CompiledDocument,
): asserts document is SupportedCompiledDocument {
  const candidate: unknown = document;
  if (!isRecord(candidate) || !isRecord(candidate['theme'])) {
    throw new LodariqArtifactCompatibilityError();
  }
  const theme = candidate['theme'];
  if (
    typeof candidate['compilerVersion'] !== 'string' ||
    !isSupportedDeliveryContract(
      candidate['artifactSchemaVersion'],
      candidate['rendererContractVersion'],
      theme['contractVersion'],
    )
  ) {
    throw new LodariqArtifactCompatibilityError();
  }
}

/** Preserves Phase 1 playback while fail-closing every explicitly versioned artifact. */
export function assertSupportedCompiledArtifactIfVersioned(document: CompiledDocument): void {
  if (
    Object.prototype.hasOwnProperty.call(document, 'artifactSchemaVersion') ||
    Object.prototype.hasOwnProperty.call(document, 'rendererContractVersion') ||
    Object.prototype.hasOwnProperty.call(document, 'theme')
  ) {
    assertSupportedCompiledArtifact(document);
  }
}
