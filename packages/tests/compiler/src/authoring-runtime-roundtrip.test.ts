import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  CompiledDocument,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  validate,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { resolveResponsiveTourStep } from '@lodariq/sdk-runtime/renderers/tour';
import { executeStepChoreography } from '@lodariq/sdk-runtime/renderers/tour-choreography';

describe('authoring compiler-to-runtime round trip', () => {
  it('preserves choreography, responsive presentation, motion, flow, and media semantics', async () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    const step = document.blocks[0]!;
    const tooltip = step.children.find((block) => block.type === 'tooltip')!;
    step.props.entrySequence = {
      trigger: { type: 'manual' },
      waitFor: [{ type: 'networkIdle' }],
      transition: { type: 'next' },
      timeoutMs: 1_500,
      onTimeout: 'skip',
    };
    step.props.motion = {
      recipe: 'lift',
      durationMs: 220,
      easing: 'emphasized',
      reducedMotion: 'none',
    };
    step.props.responsive = {
      compact: {
        placement: 'bottom',
        widthPx: 296,
        actionLayout: 'stack',
        mediaVisible: false,
      },
    };
    tooltip.children.splice(2, 0, {
      id: 'media-roundtrip',
      type: 'media',
      content: 'Product preview',
      props: {
        media: {
          kind: 'image',
          assetId: 'asset-roundtrip',
          accessibilityName: 'Product preview',
        },
      },
      status: 'ready',
      children: [],
    });
    tooltip.children.splice(
      3,
      0,
      {
        id: 'callout-roundtrip',
        type: 'callout',
        content: 'Keep this workspace open.',
        props: {
          accessibilityName: 'Workspace reminder',
          composition: { kind: 'callout', tone: 'warning' },
        },
        status: 'ready',
        children: [],
      },
      {
        id: 'stat-roundtrip',
        type: 'stat',
        content: '42% adopted',
        props: {
          accessibilityName: 'Adoption is 42 percent',
          composition: { kind: 'stat', emphasis: 'strong' },
        },
        status: 'ready',
        children: [],
      },
      {
        id: 'icon-roundtrip',
        type: 'icon',
        content: 'Recommended',
        props: {
          accessibilityName: 'Recommended path',
          composition: { kind: 'icon', icon: 'star' },
        },
        status: 'ready',
        children: [],
      },
    );

    const compiled = await compileDocument({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    expect(validate(CompiledDocument, compiled).valid).toBe(true);
    const compiledStep = compiled.steps[0]!;
    expect(compiledStep.entrySequence).toEqual(step.props.entrySequence);
    expect(compiledStep.motion).toEqual(step.props.motion);
    expect(compiledStep.body.find((node) => node.id === 'media-roundtrip')?.props.media).toEqual({
      kind: 'image',
      assetId: 'asset-roundtrip',
      accessibilityName: 'Product preview',
    });
    expect(
      compiledStep.body
        .filter((node) => node.id.endsWith('-roundtrip') && node.id !== 'media-roundtrip')
        .map((node) => [node.type, node.props.composition, node.props.accessibilityName]),
    ).toEqual([
      ['callout', { kind: 'callout', tone: 'warning' }, 'Workspace reminder'],
      ['stat', { kind: 'stat', emphasis: 'strong' }, 'Adoption is 42 percent'],
      ['icon', { kind: 'icon', icon: 'star' }, 'Recommended path'],
    ]);

    const compact = resolveResponsiveTourStep(compiledStep, 420);
    expect(compact.tooltipLayout).toMatchObject({ widthPx: 296, actionLayout: 'stack' });
    expect(compact.body.some((node) => node.id === 'media-roundtrip')).toBe(false);

    const stages: string[] = [];
    await executeStepChoreography(
      compiledStep.entrySequence!,
      {
        runTrigger: async () => void stages.push('trigger'),
        runWait: async () => void stages.push('wait'),
        runTransition: () => void stages.push('transition'),
      },
      new AbortController().signal,
    );
    expect(stages).toEqual(['trigger', 'wait', 'transition']);
  });
});
