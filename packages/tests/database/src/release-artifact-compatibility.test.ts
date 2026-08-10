import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocumentV2,
} from '@lodariq/schema';
import {
  extractHistoricalReleaseArtifactPins,
  isReleaseArtifactCurrentlyDeployable,
  type ReleaseArtifactCompatibilityCandidate,
} from '../../../database/src/release-artifact-compatibility.js';

const HELPER_PATH = fileURLToPath(
  new URL('../../../database/src/release-artifact-compatibility.ts', import.meta.url),
);

describe('release artifact compatibility', () => {
  it('extracts historical pins separately from current deployability', () => {
    const historical = createArtifact({ compilerVersion: '0.2.0' });

    expect(extractHistoricalReleaseArtifactPins(historical)).toEqual({
      compiledArtifactId: historical.id,
      artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
      contentHash: historical.contentHash,
      compilerVersion: '0.2.0',
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: historical.themeVersionId,
      themeContentHash: historical.themeContentHash,
    });
    expect(isReleaseArtifactCurrentlyDeployable(historical)).toBe(false);
  });

  it('requires every current compatibility version without hiding valid historical pins', () => {
    const historicalArtifacts = [
      createArtifact({ artifactSchemaVersion: '3' }),
      createArtifact({ compilerVersion: '0.2.0' }),
      createArtifact({ rendererContractVersion: '3' }),
      createArtifact({ themeContractVersion: '2' }),
    ];

    for (const artifact of historicalArtifacts) {
      expect(extractHistoricalReleaseArtifactPins(artifact)).not.toBeNull();
      expect(isReleaseArtifactCurrentlyDeployable(artifact)).toBe(false);
    }
  });

  it('accepts only a fully consistent current artifact with canonical hashes', () => {
    const artifact = createArtifact();
    const before = structuredClone(artifact);

    expect(extractHistoricalReleaseArtifactPins(artifact)).not.toBeNull();
    expect(isReleaseArtifactCurrentlyDeployable(artifact)).toBe(true);
    expect(artifact).toEqual(before);
  });

  it('keeps historical pins readable when optional legacy metadata is absent', () => {
    const artifact = createArtifact();
    delete artifact.rendererContractVersion;
    delete artifact.themeVersionId;
    delete artifact.themeContentHash;

    expect(extractHistoricalReleaseArtifactPins(artifact)).toMatchObject({
      compiledArtifactId: artifact.id,
      compilerVersion: COMPILER_VERSION,
    });
    expect(isReleaseArtifactCurrentlyDeployable(artifact)).toBe(false);
  });

  it('rejects contradictory persisted metadata before exposing historical pins', () => {
    const mismatches: ReleaseArtifactCompatibilityCandidate[] = [
      { ...createArtifact(), documentId: 'doc_other' },
      { ...createArtifact(), contentHash: `sha256-${'f'.repeat(64)}` },
      { ...createArtifact(), compilerVersion: '0.2.0' },
      { ...createArtifact(), rendererContractVersion: '99' },
      { ...createArtifact(), themeVersionId: 'themev_other' },
      { ...createArtifact(), themeContentHash: `sha256-${'e'.repeat(64)}` },
    ];

    for (const artifact of mismatches) {
      expect(extractHistoricalReleaseArtifactPins(artifact)).toBeNull();
      expect(isReleaseArtifactCurrentlyDeployable(artifact)).toBe(false);
    }
  });

  it('fails closed when immutable artifact or theme content no longer matches its hash', () => {
    const artifactTamper = createArtifact();
    const artifactCompiled = artifactTamper.compiled as CompiledDocumentV2;
    artifactCompiled.audience = { environments: ['staging'] };

    const themeTamper = createArtifact();
    const themeCompiled = themeTamper.compiled as CompiledDocumentV2;
    themeCompiled.theme.definition.tokens.modes.light.colors.accent = '#123456';

    expect(extractHistoricalReleaseArtifactPins(artifactTamper)).not.toBeNull();
    expect(isReleaseArtifactCurrentlyDeployable(artifactTamper)).toBe(false);
    expect(extractHistoricalReleaseArtifactPins(themeTamper)).not.toBeNull();
    expect(isReleaseArtifactCurrentlyDeployable(themeTamper)).toBe(false);
  });

  it('does not treat Phase 1 artifacts as Phase 2 recovery targets', () => {
    const legacy: ReleaseArtifactCompatibilityCandidate = {
      id: 'artifact_legacy',
      documentId: 'doc_legacy',
      contentHash: `sha256-${'a'.repeat(64)}`,
      compilerVersion: '0.1.0',
      compiled: {
        documentId: 'doc_legacy',
        type: 'tour',
        contentHash: `sha256-${'a'.repeat(64)}`,
        schemaVersion: '1.0.0',
        compilerVersion: '0.1.0',
        targets: [],
        steps: [],
      },
    };

    expect(extractHistoricalReleaseArtifactPins(legacy)).toBeNull();
    expect(isReleaseArtifactCurrentlyDeployable(legacy)).toBe(false);
  });

  it('has no compiler dependency or invocation path', () => {
    const source = readFileSync(HELPER_PATH, 'utf8');
    expect(source).not.toContain('@lodariq/compiler');
    expect(source).not.toMatch(/\bcompile(?:Document)?\s*\(/u);
  });
});

function createArtifact(overrides: ArtifactVersionOverrides = {}): ReleaseArtifactCompatibilityCandidate {
  const artifactSchemaVersion =
    overrides.artifactSchemaVersion ?? COMPILED_ARTIFACT_SCHEMA_VERSION;
  const compilerVersion = overrides.compilerVersion ?? COMPILER_VERSION;
  const rendererContractVersion =
    overrides.rendererContractVersion ?? RENDERER_CONTRACT_VERSION;
  const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1) as unknown as Record<
    string,
    unknown
  >;
  theme['contractVersion'] =
    overrides.themeContractVersion ?? BRAND_THEME_CONTRACT_VERSION;
  delete theme['contentHash'];
  theme['contentHash'] = contentHash(theme);
  const contentWithoutHash = {
    artifactSchemaVersion,
    documentId: 'doc_recovery',
    type: 'tour',
    schemaVersion: '1.0.0',
    compilerVersion,
    rendererContractVersion,
    trigger: { type: 'manual' as const },
    audience: { environments: ['production' as const] },
    theme,
    appearance: DEFAULT_EXPERIENCE_APPEARANCE,
    targets: [],
    steps: [],
  };
  const compiled = {
    ...contentWithoutHash,
    contentHash: contentHash(contentWithoutHash),
  };
  const compiledTheme = compiled.theme as Record<string, unknown>;
  return {
    id: `artifact_${compiled.documentId}_${compiled.contentHash}`,
    documentId: compiled.documentId,
    contentHash: compiled.contentHash,
    compilerVersion: compiled.compilerVersion,
    themeVersionId: String(compiledTheme['themeVersionId']),
    themeContentHash: String(compiledTheme['contentHash']),
    rendererContractVersion: compiled.rendererContractVersion,
    compiled,
  };
}

interface ArtifactVersionOverrides {
  artifactSchemaVersion?: string;
  compilerVersion?: string;
  rendererContractVersion?: string;
  themeContractVersion?: string;
}

function contentHash(value: unknown): string {
  return `sha256-${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

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
