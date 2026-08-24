import type {
  ActiveExperimentAssignment,
  CompiledDocument,
  CompiledDocumentV4,
  CompiledDocumentV5,
  CompiledStep,
  ExperimentOverride,
} from '@lodariq/schema';

/** Applies one server-resolved arm after immutable artifact validation. */
export function materializeExperimentAssignment(
  document: CompiledDocument,
  assignment: ActiveExperimentAssignment,
): CompiledDocumentV4 | CompiledDocumentV5 {
  if (document.artifactSchemaVersion !== '4' && document.artifactSchemaVersion !== '5') {
    throw new Error('Lodariq experiment assignment is incompatible with this artifact');
  }
  const experiment = document.experiment;
  if (!experiment || experiment.id !== assignment.experimentId) {
    throw new Error('Lodariq experiment assignment does not match this artifact');
  }
  const arm = experiment.arms.find((candidate) => candidate.id === assignment.armId);
  if (!arm) throw new Error('Lodariq experiment arm is unavailable');

  return {
    ...document,
    steps: applyExperimentOverrides(document.steps, arm.overrides),
    localization: {
      ...document.localization,
      variants: document.localization.variants.map((variant) => ({
        ...variant,
        steps: applyExperimentOverrides(variant.steps, arm.overrides),
      })),
    },
  } satisfies CompiledDocumentV4 | CompiledDocumentV5;
}

function applyExperimentOverrides(
  source: readonly CompiledStep[],
  overrides: readonly ExperimentOverride[],
): CompiledStep[] {
  return source.map((step) => {
    const next = structuredClone(step);
    for (const override of overrides) {
      if (override.type === 'placement' && override.stepId === step.id) {
        next.placement = override.placement;
      } else if (override.type === 'style' && override.stepId === step.id) {
        next.tooltipStyle = structuredClone(override.tooltipStyle);
      } else if (override.type === 'condition' && override.blockId === step.id) {
        next.showWhen = structuredClone(override.showWhen);
      } else if ('blockId' in override) {
        next.body = next.body.map((block) => {
          if (block.id !== override.blockId) return block;
          if (override.type === 'copy') {
            const { contentRuns: _contentRuns, ...rest } = block;
            return { ...rest, text: override.text };
          }
          if (override.type === 'condition') {
            return {
              ...block,
              props: { ...block.props, showWhen: structuredClone(override.showWhen) },
            };
          }
          if (override.type === 'media') {
            return { ...block, props: { ...block.props, media: structuredClone(override.media) } };
          }
          return block;
        });
      }
    }
    return next;
  });
}
