import type {
  ActiveManifestPointerV2,
  CompiledDocument,
  CompiledDocumentV2,
} from '@lodariq/schema';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
} from '@lodariq/schema/version';

const ARTIFACT_COMPATIBILITY_ERROR_MESSAGE = 'Lodariq artifact is incompatible with this runtime';

/** A fail-closed compatibility failure that callers must not treat as resume corruption. */
export class LodariqArtifactCompatibilityError extends Error {
  constructor() {
    super(ARTIFACT_COMPATIBILITY_ERROR_MESSAGE);
    this.name = 'LodariqArtifactCompatibilityError';
  }
}

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
    candidate['schemaVersion'] !== COMPILED_ARTIFACT_SCHEMA_VERSION ||
    artifact['artifactSchemaVersion'] !== COMPILED_ARTIFACT_SCHEMA_VERSION ||
    artifact['compilerVersion'] !== COMPILER_VERSION ||
    artifact['rendererContractVersion'] !== RENDERER_CONTRACT_VERSION ||
    artifact['themeContractVersion'] !== BRAND_THEME_CONTRACT_VERSION
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
): asserts document is CompiledDocumentV2 {
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
): asserts document is CompiledDocumentV2 {
  const candidate: unknown = document;
  if (!isRecord(candidate) || !isRecord(candidate['theme'])) {
    throw new LodariqArtifactCompatibilityError();
  }
  const theme = candidate['theme'];
  if (
    candidate['artifactSchemaVersion'] !== COMPILED_ARTIFACT_SCHEMA_VERSION ||
    candidate['compilerVersion'] !== COMPILER_VERSION ||
    candidate['rendererContractVersion'] !== RENDERER_CONTRACT_VERSION ||
    theme['contractVersion'] !== BRAND_THEME_CONTRACT_VERSION
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
