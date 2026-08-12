import type { ActiveManifestPointerV2, CompiledDocument } from '@lodariq/schema';
import {
  LodariqArtifactCompatibilityError,
  assertSupportedArtifactMatchesManifest,
  assertSupportedCompiledArtifact,
} from '../artifact-compatibility';

/** Heavy compatibility tuple checks stay outside the sub-3 KiB bootstrap graph. */
export function assertPlaybackArtifact(
  document: CompiledDocument,
  requireManifest: boolean,
  manifest?: ActiveManifestPointerV2,
): void {
  assertSupportedCompiledArtifact(document);
  if (!requireManifest) return;
  if (!manifest) throw new LodariqArtifactCompatibilityError();
  assertSupportedArtifactMatchesManifest(document, manifest);
}
