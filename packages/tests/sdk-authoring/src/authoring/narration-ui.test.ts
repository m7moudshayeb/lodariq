// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  COMMERCIAL_PLAN_VERSION,
  commercialUsageValue,
  resolveCommercialEntitlements,
  type LodariqBlock,
  type LodariqDocument,
  type WorkspaceCommercialUsage,
} from '@lodariq/schema';
import type { LocalAuthoringFrameServices } from '@lodariq/sdk-authoring/authoring-frame';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import { StepNarrationSection } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/step-narration-section';
import {
  inspectorSectionsFor,
  registerBuiltInInspectorSections,
  resetInspectorSections,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/inspector-sections';
import { registerExperienceInspectorSections } from '../../../../../packages/sdk-authoring/src/authoring/experiences/inspector-registration';
import { registerBuiltInExperiences } from '../../../../../packages/sdk-authoring/src/authoring/experiences';
import { INSPECTOR_SECTION_LABELS } from '../../../../../packages/sdk-authoring/src/authoring/overlay/inspector-copy';

const STEP_ID = 'step_narrated';

describe('Narration section (§7.7)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  it('is a registered card section, so it costs no branch in a surface', () => {
    resetInspectorSections();
    registerBuiltInInspectorSections(INSPECTOR_SECTION_LABELS);
    registerBuiltInExperiences();
    registerExperienceInspectorSections('tour');
    const sections = inspectorSectionsFor('card').sections.map((section) => section.id);
    expect(sections).toContain('narration');
    // Style still opens first; narration sits before Advanced.
    expect(sections.indexOf('narration')).toBeLessThan(sections.indexOf('advanced'));
    expect(sections[0]).toBe('style');
  });

  it('keeps the spoken script separate from the on-screen copy', () => {
    const controller = createController();
    controller.setStepNarration(STEP_ID, { script: 'Pick a plan, then continue.' });

    const step = stepOf(controller);
    expect(step?.props.narration?.script).toBe('Pick a plan, then continue.');
    // The visible copy is untouched: that separation is the point.
    expect(tooltipOf(controller)?.children[0]?.content).toBe('Choose your plan');
  });

  it('drafts a script from the step text on request, rather than writing twice', () => {
    const controller = createController();
    const markup = render(controller);
    expect(markup).toContain('data-narration-action="sync"');

    controller.setStepNarration(STEP_ID, { script: 'x' });
    expect(stepOf(controller)?.props.narration).toBeDefined();
    controller.setStepNarration(STEP_ID, null);
    expect(stepOf(controller)?.props.narration).toBeUndefined();
  });

  it('shows the inferred language and filters the voices to it', () => {
    const controller = createController([
      { id: 'v_en', name: 'Ada', locale: 'en-US' },
      { id: 'v_de', name: 'Bruno', locale: 'de-DE' },
    ]);
    controller.setStepNarration(STEP_ID, {
      script: 'Klicken Sie auf die Schaltfläche für das Konto',
    });

    const markup = render(controller);
    expect(markup).toContain('data-narration-locale="de"');
    expect(markup).toContain('Bruno');
    expect(markup).not.toContain('Ada');
  });

  it('says how to get a language rather than guessing from an empty script', () => {
    const markup = render(createController());
    expect(markup).toContain('data-narration-locale=""');
    expect(markup).toContain('Not detected yet');
    expect(markup).not.toContain('data-narration-action="lexicon"');
  });

  it('keeps existing narration readable and removable after a plan downgrade', () => {
    const controller = createController();
    controller.setStepNarration(STEP_ID, { script: 'Keep this existing narration.' });
    const snapshot = {
      ...controller.getSnapshot(),
      commercialUsage: commercialUsageForStarter(),
    };
    const markup = renderToStaticMarkup(
      createElement(StepNarrationSection, {
        controller,
        snapshot,
        step: stepOf(controller)!,
        tooltip: tooltipOf(controller)!,
      }),
    );

    expect(markup).toContain('Keep this existing narration.');
    expect(markup).toContain('This tool is not included in the current workspace plan.');
    expect(markup).toMatch(/data-narration-script=""[^>]*disabled/iu);
    expect(markup).toMatch(/<input[^>]*disabled[^>]*type="range"/iu);
    expect(markup).toContain('data-narration-action="clear"');
    expect(markup).not.toMatch(/data-narration-action="clear"[^>]*disabled/iu);
  });

  it('keeps generated audio for timing edits and invalidates it for source edits', () => {
    const controller = createController();
    const audio = generatedAudio();
    controller.setStepNarration(STEP_ID, {
      script: 'Choose your plan.',
      voiceId: 'voice_en',
      audio,
    });

    controller.setStepNarration(STEP_ID, {
      ...stepOf(controller)?.props.narration,
      script: 'Choose your plan.',
      voiceId: 'voice_en',
      startOffsetMs: 500,
      advanceOnEnd: true,
    });
    expect(stepOf(controller)?.props.narration?.audio).toEqual(audio);

    controller.setStepNarration(STEP_ID, {
      ...stepOf(controller)?.props.narration,
      script: 'Choose a plan and continue.',
    });
    expect(stepOf(controller)?.props.narration?.audio).toBeUndefined();
  });

  it('attaches generated audio and persists the exact updated draft', async () => {
    const persistDocument = vi.fn(async (_document: LodariqDocument) => {});
    const generateNarration = vi.fn(async () => ({
      operationId: 'narration_operation',
      replayed: false,
      audio: generatedAudio(),
      asset: {
        id: 'asset_narration',
        kind: 'audio' as const,
        filename: 'narration.wav',
        contentType: 'audio/wav',
        byteLength: 12,
        contentHash: `sha256-${'1'.repeat(64)}`,
        createdAt: '2026-08-21T00:00:00.000Z',
        downloadPath: '/v1/authoring/media-assets/asset_narration',
      },
    }));
    const controller = createController(undefined, { generateNarration, persistDocument });
    controller.setStepNarration(STEP_ID, { script: 'Choose your plan.', voiceId: 'voice_en' });

    await expect(controller.generateStepNarration(STEP_ID)).resolves.toBe(true);

    expect(generateNarration).toHaveBeenCalledWith(STEP_ID);
    expect(stepOf(controller)?.props.narration?.audio).toEqual(generatedAudio());
    expect(controller.getSnapshot().mediaAssets).toEqual([
      expect.objectContaining({ id: 'asset_narration', kind: 'audio' }),
    ]);
    expect(persistDocument).toHaveBeenCalledTimes(2);
    expect(persistDocument.mock.calls[1]?.[0].blocks[0]?.props.narration?.audio).toEqual(
      generatedAudio(),
    );
    expect(render(controller)).toContain('Audio ready · 1 seconds');
  });

  it('keeps the draft unchanged when generation fails', async () => {
    const controller = createController(undefined, {
      generateNarration: vi.fn(async () => {
        throw new Error('provider offline');
      }),
    });
    controller.setStepNarration(STEP_ID, { script: 'Choose your plan.' });

    await expect(controller.generateStepNarration(STEP_ID)).resolves.toBe(false);
    expect(stepOf(controller)?.props.narration?.audio).toBeUndefined();
    expect(controller.getSnapshot().status).toBe('Narration generation failed. Try again.');
  });
});

function commercialUsageForStarter(): WorkspaceCommercialUsage {
  const limits = resolveCommercialEntitlements('starter');
  return {
    planId: 'starter',
    planVersion: COMMERCIAL_PLAN_VERSION,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    engagedUsers: commercialUsageValue(0, limits.engagedUsersPerMonth, 'soft'),
    liveExperiences: commercialUsageValue(0, limits.liveExperiences, 'hard'),
    creatorSeats: commercialUsageValue(1, limits.creatorSeats, 'hard'),
    applications: commercialUsageValue(1, limits.applications, 'hard'),
    locales: commercialUsageValue(1, limits.locales, 'hard'),
    environments: commercialUsageValue(1, limits.environments, 'hard'),
    aiCredits: commercialUsageValue(0, limits.aiCreditsPerMonth, 'hard'),
    themeGenerationRuns: commercialUsageValue(0, limits.themeGenerationRuns, 'hard'),
    analyticsExports: commercialUsageValue(0, limits.analyticsExportsPerMonth, 'hard'),
    assetBytes: limits.assetBytes,
    analyticsRetentionDays: limits.analyticsRetentionDays,
    versionRetentionDays: limits.versionRetentionDays,
    removeBadge: limits.removeBadge,
    features: [...limits.features],
  };
}

function render(controller: LocalAuthoringFrameController): string {
  const snapshot = controller.getSnapshot();
  const step = stepOf(controller)!;
  const tooltip = tooltipOf(controller)!;
  return renderToStaticMarkup(
    createElement(StepNarrationSection, { controller, snapshot, step, tooltip }),
  );
}

function stepOf(controller: LocalAuthoringFrameController): LodariqBlock | undefined {
  return controller.getSnapshot().documentState.blocks.find((block) => block.id === STEP_ID);
}

function tooltipOf(controller: LocalAuthoringFrameController): LodariqBlock | undefined {
  return stepOf(controller)?.children.find((child) => child.type === 'tooltip');
}

function createController(
  narrationVoices?: LocalAuthoringFrameServices['narrationVoices'],
  serviceOverrides: Partial<LocalAuthoringFrameServices> = {},
): LocalAuthoringFrameController {
  const controller = new LocalAuthoringFrameController({
    root: document.getElementById('authoring')!,
    baseDocument: narratedDocument(),
    services: {
      loadDocument: () => null,
      saveDocument: vi.fn(),
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
      ...(narrationVoices ? { narrationVoices } : {}),
      ...serviceOverrides,
    },
    sessionId: 'session_narration',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function generatedAudio() {
  return {
    assetId: 'asset_narration',
    contentHash: `sha256-${'1'.repeat(64)}`,
    sourceHash: `sha256-${'2'.repeat(64)}`,
    contentType: 'audio/wav' as const,
    durationMs: 1_000,
    cues: [{ text: 'Choose your plan.', startMs: 0, durationMs: 1_000 }],
  };
}

function narratedDocument(): LodariqDocument {
  return {
    id: 'doc_narration',
    workspaceId: 'wk_narration',
    type: 'tour',
    status: 'draft',
    title: 'Narration',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      {
        id: STEP_ID,
        type: 'tourStep',
        props: { index: 0 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_narration',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'incomplete',
            children: [
              {
                id: 'body_narration',
                type: 'paragraph',
                props: {},
                status: 'ready',
                content: 'Choose your plan',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
}
