import { describe, expect, it } from 'vitest';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type NewCompiledDocument,
} from '@lodariq/schema';
import { materializeExperimentAssignment } from '../../../../sdk-runtime/src/activation/experiment-runtime.js';

const document: NewCompiledDocument = {
  artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  documentId: 'doc_experiment',
  type: 'tour',
  contentHash: `sha256-${'e'.repeat(64)}`,
  schemaVersion: '1.0.0',
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  trigger: { type: 'manual' },
  audience: { environments: ['production'] },
  theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  appearance: DEFAULT_EXPERIENCE_APPEARANCE,
  targets: [],
  steps: [
    {
      id: 'step_1',
      placement: 'bottom',
      body: [{ id: 'copy_1', type: 'paragraph', text: 'Control', props: {} }],
    },
  ],
  localization: {
    defaultLocale: 'en',
    defaultTitle: 'Experiment',
    variants: [
      {
        locale: 'de',
        fallbackLocale: 'en',
        title: 'Experiment',
        steps: [
          {
            id: 'step_1',
            placement: 'bottom',
            body: [{ id: 'copy_1', type: 'paragraph', text: 'Kontrolle', props: {} }],
          },
        ],
      },
    ],
  },
  experiment: {
    id: 'exp_runtime',
    varies: 'copy',
    successEventName: 'project_created',
    arms: [
      { id: 'A', label: 'Control', overrides: [] },
      {
        id: 'B',
        label: 'Variant',
        overrides: [{ type: 'copy', blockId: 'copy_1', text: 'Variant' }],
      },
    ],
  },
};

describe('experiment runtime projection', () => {
  it('materializes only the assigned arm without mutating immutable source identity', () => {
    const variant = materializeExperimentAssignment(document, {
      experimentId: 'exp_runtime',
      armId: 'B',
      allocationRevision: 2,
    });

    expect(variant.steps[0]?.body[0]?.text).toBe('Variant');
    expect(variant.localization?.variants[0]?.steps[0]?.body[0]?.text).toBe('Variant');
    expect(variant.contentHash).toBe(document.contentHash);
    expect(document.steps[0]?.body[0]?.text).toBe('Control');
  });

  it('fails closed when the assignment is not part of the artifact', () => {
    expect(() =>
      materializeExperimentAssignment(document, {
        experimentId: 'exp_other',
        armId: 'B',
        allocationRevision: 1,
      }),
    ).toThrow(/does not match/);
  });
});
