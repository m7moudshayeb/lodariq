import { describe, expect, it } from 'vitest';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  CompiledDocumentV1,
  CompiledDocumentV2,
  CompiledDocumentV3,
  CompiledDocumentV4,
  CompiledDocumentV5,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocument,
  type CompiledDocumentV2 as CompiledDocumentV2Type,
  type CompiledDocumentV3 as CompiledDocumentV3Type,
  type CompiledDocumentV4 as CompiledDocumentV4Type,
  type CompiledDocumentV5 as CompiledDocumentV5Type,
} from '@lodariq/schema';
import {
  COMPILED_RUNTIME_SCHEMA_REFERENCES,
  isValidCompiledRuntimeArtifact,
} from '@lodariq/schema/compiled-runtime';

const v1: CompiledDocument = {
  documentId: 'doc_runtime_validation_legacy',
  type: 'tour',
  contentHash: `sha256-${'b'.repeat(64)}`,
  schemaVersion: '1.0.0',
  compilerVersion: '0.1.0',
  targets: [],
  steps: [],
};

const base = {
  documentId: 'doc_runtime_validation',
  type: 'tour',
  contentHash: `sha256-${'a'.repeat(64)}`,
  schemaVersion: '1.0.0',
  trigger: { type: 'manual' as const },
  audience: { environments: ['production' as const] },
  theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  appearance: DEFAULT_EXPERIENCE_APPEARANCE,
  targets: [],
  steps: [],
};

const v2: CompiledDocumentV2Type = {
  ...base,
  artifactSchemaVersion: '2',
  compilerVersion: '0.3.0',
  rendererContractVersion: '2',
};

const v3: CompiledDocumentV3Type = {
  ...base,
  artifactSchemaVersion: '3',
  compilerVersion: '0.4.0',
  rendererContractVersion: '3',
  localization: { defaultLocale: 'en', defaultTitle: 'Legacy tour', variants: [] },
};

const v4: CompiledDocumentV4Type = {
  ...base,
  artifactSchemaVersion: '4',
  compilerVersion: '0.5.0',
  rendererContractVersion: '4',
  localization: { defaultLocale: 'en', defaultTitle: 'Version four tour', variants: [] },
};

const v5: CompiledDocumentV5Type = {
  ...base,
  artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  localization: { defaultLocale: 'en', defaultTitle: 'Current tour', variants: [] },
};

describe('compiled runtime artifact validation', () => {
  it('fully validates each supported immutable artifact schema', () => {
    expect(isValidCompiledRuntimeArtifact(v1)).toBe(true);
    expect(isValidCompiledRuntimeArtifact(v2)).toBe(true);
    expect(isValidCompiledRuntimeArtifact(v3)).toBe(true);
    expect(isValidCompiledRuntimeArtifact(v4)).toBe(true);
    expect(isValidCompiledRuntimeArtifact(v5)).toBe(true);
  });

  it('rejects unknown fields, unsafe theme values, and mixed-version structures', () => {
    expect(isValidCompiledRuntimeArtifact({ ...v4, rawHtml: '<script>alert(1)</script>' })).toBe(
      false,
    );

    const unsafeTheme = structuredClone(v4) as unknown as Record<string, unknown>;
    const theme = unsafeTheme['theme'] as Record<string, unknown>;
    const definition = theme['definition'] as Record<string, unknown>;
    const tokens = definition['tokens'] as Record<string, unknown>;
    const modes = tokens['modes'] as Record<string, unknown>;
    const light = modes['light'] as Record<string, unknown>;
    const colors = light['colors'] as Record<string, unknown>;
    colors['surface'] = 'url(javascript:alert(1))';
    expect(isValidCompiledRuntimeArtifact(unsafeTheme)).toBe(false);

    expect(
      isValidCompiledRuntimeArtifact({
        ...v3,
        completion: { type: 'dismiss' },
      }),
    ).toBe(false);
  });

  it('accepts only the closed delivery approach contract', () => {
    const withApproach = {
      ...v4,
      targets: [
        {
          id: 'final',
          fingerprint: { tagName: 'button', stableAttributes: {} },
          approach: {
            legs: [
              {
                act: { kind: 'activateTarget', targetId: 'opener' },
                wait: { type: 'targetAvailable', targetId: 'final' },
                label: 'Open the panel',
              },
            ],
          },
        },
        {
          id: 'opener',
          fingerprint: { tagName: 'button', stableAttributes: {} },
        },
      ],
    };
    expect(isValidCompiledRuntimeArtifact(withApproach)).toBe(true);
    expect(
      isValidCompiledRuntimeArtifact({
        ...withApproach,
        targets: [
          {
            ...withApproach.targets[0],
            approach: {
              legs: [
                {
                  act: { kind: 'navigate', routePatternId: 'projects' },
                  label: 'Navigate',
                },
              ],
            },
          },
        ],
      }),
    ).toBe(false);
  });

  it('keeps the lazy runtime reference registry complete for every artifact version', () => {
    const roots = [
      CompiledDocumentV1,
      CompiledDocumentV2,
      CompiledDocumentV3,
      CompiledDocumentV4,
      CompiledDocumentV5,
    ];
    const references = new Map(
      COMPILED_RUNTIME_SCHEMA_REFERENCES.flatMap((schema) =>
        typeof schema.$id === 'string' ? [[schema.$id, schema] as const] : [],
      ),
    );
    const unresolved = unresolvedReferences(roots, references);

    expect(unresolved).toEqual([]);
    expect(references.size).toBe(COMPILED_RUNTIME_SCHEMA_REFERENCES.length);
  });
});

function unresolvedReferences(
  roots: readonly unknown[],
  references: ReadonlyMap<string, unknown>,
): string[] {
  const unresolved = new Set<string>();
  const visited = new Set<unknown>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    const record = value as Record<string, unknown>;
    if (typeof record['$ref'] === 'string') {
      const [referenceId] = record['$ref'].split('#');
      if (!referenceId) return;
      const referenced = references.get(referenceId);
      if (!referenced) unresolved.add(referenceId);
      else visit(referenced);
    }
    for (const child of Object.values(record)) visit(child);
  };

  for (const root of roots) visit(root);
  return [...unresolved].sort();
}
