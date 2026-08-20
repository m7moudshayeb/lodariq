// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
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
    controller.setStepNarration(STEP_ID, { script: 'Klicken Sie auf die Schaltfläche für das Konto' });

    const markup = render(controller);
    expect(markup).toContain('data-narration-locale="de"');
    expect(markup).toContain('Bruno');
    expect(markup).not.toContain('Ada');
  });

  it('says how to get a language rather than guessing from an empty script', () => {
    const markup = render(createController());
    expect(markup).toContain('data-narration-locale=""');
    expect(markup).toContain('the language is detected');
  });
});

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
    },
    sessionId: 'session_narration',
    peerWindow: window,
  });
  controller.start();
  return controller;
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
