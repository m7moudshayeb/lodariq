import { createHash } from 'node:crypto';
import {
  CompiledDocument as CompiledDocumentSchema,
  ReleaseArtifactPins as ReleaseArtifactPinsSchema,
  isSupportedDeliveryContract,
  isValidCompilerVersion,
  validate,
  type ReleaseArtifactPins,
} from '@lodariq/schema';

/**
 * The persisted fields required to inspect a release artifact. Keeping this
 * structural avoids coupling compatibility checks to a repository adapter.
 */
export interface ReleaseArtifactCompatibilityCandidate {
  id: string;
  documentId: string;
  contentHash: string;
  compilerVersion: string;
  themeVersionId?: string | null;
  themeContentHash?: string | null;
  rendererContractVersion?: string | null;
  compiled: unknown;
}

/**
 * Extracts immutable pins for historical display without requiring today's
 * compiler or renderer versions. Missing legacy metadata is tolerated when the
 * compiled artifact itself contains the pin; contradictory metadata is not.
 */
export function extractHistoricalReleaseArtifactPins(
  artifact: ReleaseArtifactCompatibilityCandidate,
): ReleaseArtifactPins | null {
  const compiled = asRecord(artifact.compiled);
  const theme = compiled ? asRecord(compiled['theme']) : null;
  if (!compiled || !theme) return null;

  const documentId = readString(compiled, 'documentId');
  const artifactSchemaVersion = readString(compiled, 'artifactSchemaVersion');
  const contentHash = readString(compiled, 'contentHash');
  const compilerVersion = readString(compiled, 'compilerVersion');
  const rendererContractVersion = readString(compiled, 'rendererContractVersion');
  const themeContractVersion = readString(theme, 'contractVersion');
  const themeVersionId = readString(theme, 'themeVersionId');
  const themeContentHash = readString(theme, 'contentHash');

  if (
    !documentId ||
    !artifactSchemaVersion ||
    !contentHash ||
    !compilerVersion ||
    !rendererContractVersion ||
    !themeContractVersion ||
    !themeVersionId ||
    !themeContentHash
  ) {
    return null;
  }
  if (
    artifact.documentId !== documentId ||
    artifact.contentHash !== contentHash ||
    artifact.compilerVersion !== compilerVersion ||
    !optionalPinMatches(artifact.rendererContractVersion, rendererContractVersion) ||
    !optionalPinMatches(artifact.themeVersionId, themeVersionId) ||
    !optionalPinMatches(artifact.themeContentHash, themeContentHash)
  ) {
    return null;
  }

  const pins = {
    compiledArtifactId: artifact.id,
    artifactSchemaVersion,
    contentHash,
    compilerVersion,
    rendererContractVersion,
    themeContractVersion,
    themeVersionId,
    themeContentHash,
  };
  const result = validate(ReleaseArtifactPinsSchema, pins);
  return result.valid ? result.value : null;
}

/**
 * Fail-closed deployability check for a new pointer mutation. Historical pins
 * are insufficient: the stored document must match every current contract pin,
 * persisted metadata, and both canonical content hashes.
 */
export function isReleaseArtifactCurrentlyDeployable(
  artifact: ReleaseArtifactCompatibilityCandidate,
): boolean {
  const pins = extractHistoricalReleaseArtifactPins(artifact);
  if (!pins || !hasSupportedCompatibilityPins(pins)) return false;

  const compiledResult = validate(CompiledDocumentSchema, artifact.compiled);
  if (!compiledResult.valid) return false;
  const compiled = compiledResult.value;
  if (!('artifactSchemaVersion' in compiled) || !('theme' in compiled)) return false;

  if (
    artifact.rendererContractVersion !== compiled.rendererContractVersion ||
    artifact.themeVersionId !== compiled.theme.themeVersionId ||
    artifact.themeContentHash !== compiled.theme.contentHash
  ) {
    return false;
  }

  return (
    compiled.contentHash === canonicalArtifactContentHash(compiled) &&
    compiled.theme.contentHash === canonicalThemeContentHash(compiled.theme)
  );
}

function hasSupportedCompatibilityPins(pins: ReleaseArtifactPins): boolean {
  return (
    isValidCompilerVersion(pins.compilerVersion) &&
    isSupportedDeliveryContract(
      pins.artifactSchemaVersion,
      pins.rendererContractVersion,
      pins.themeContractVersion,
    )
  );
}

function canonicalArtifactContentHash(compiled: Record<string, unknown>): string {
  const content = { ...compiled };
  delete content['contentHash'];
  return sha256ContentHash(content);
}

function canonicalThemeContentHash(theme: Record<string, unknown>): string {
  const content = { ...theme };
  delete content['contentHash'];
  return sha256ContentHash(content);
}

function sha256ContentHash(value: unknown): string {
  return `sha256-${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

/** Mirrors the publication hash canonicalization without importing authoring/compiler code. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function optionalPinMatches(persisted: string | null | undefined, compiled: string): boolean {
  return persisted === undefined || persisted === null || persisted === compiled;
}
