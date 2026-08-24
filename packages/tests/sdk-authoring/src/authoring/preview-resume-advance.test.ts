// @vitest-environment jsdom
/**
 * The record has to name the step the creator advanced TO before their click
 * finishes.
 *
 * A step whose "next" is the customer's own link is a real navigation: the page
 * unloads inside that click. `onStepChange` — which fires after the arriving
 * step renders — never runs, so a record written only there still names the step
 * the preview STARTED on. Restoring it replays that step, and because a restored
 * interactive preview navigates to its step's page, the creator is pulled back
 * to the screen they just left with the panel in edit mode. Which is the bug
 * that was reported.
 *
 * `onBeforeStepChange` is synchronous and runs first. Delivery already depends
 * on it (`tracked-tour-player`); this proves preview does too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';
import { compileDocument } from '@lodariq/compiler';
import {
  LOCAL_AUTHORING_SESSION_ID,
  openLocalAuthoringPanel,
} from '@lodariq/sdk-authoring/lodariq-authoring';
import { readDraftPreviewResume } from '../../../../../packages/sdk-authoring/src/authoring/preview-resume';

const WORKSPACE = 'wk_local_dev';

function tourStep(index: number): LodariqDocument['blocks'][number] {
  return {
    id: `step_${index + 1}`,
    type: 'tourStep',
    props: { index },
    status: 'incomplete',
    children: [
      {
        id: `tooltip_${index + 1}`,
        type: 'tooltip',
        props: { placement: 'bottom' },
        status: 'incomplete',
        children: [
          {
            id: `heading_${index + 1}`,
            type: 'heading',
            content: `Step ${index + 1}`,
            props: { level: 2 },
            status: 'ready',
            children: [],
          },
          {
            id: `button_${index + 1}`,
            type: 'button',
            content: 'Continue',
            props: { variant: 'primary', action: { type: 'next' } },
            status: 'ready',
            children: [],
          },
        ],
      },
    ],
  } as unknown as LodariqDocument['blocks'][number];
}

const twoStepDocument: LodariqDocument = {
  id: 'doc_tour_welcome',
  workspaceId: WORKSPACE,
  type: 'tour',
  status: 'draft',
  title: 'Welcome tour',
  trigger: { type: 'manual' },
  audience: { environments: ['development', 'staging'] },
  schemaVersion: '1.0.0',
  targets: [],
  blocks: [tourStep(0), tourStep(1)],
};

interface CapturedPreviewOptions {
  ownerId: string;
  stepId?: string;
  interactive?: boolean;
  onBeforeStepChange?: (index: number, stepId: string) => void;
  onStepChange?: (index: number, stepId: string) => void;
}

describe('preview resume follows the creator across a step advance', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('records the arriving step before the advance, not after it renders', async () => {
    let captured: CapturedPreviewOptions | null = null;
    const playPreview = vi.fn(
      (_compiled: CompiledDocument, previewOptions: CapturedPreviewOptions): Promise<void> => {
        captured = previewOptions;
        return Promise.resolve();
      },
    );

    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: twoStepDocument.id,
        workspaceId: WORKSPACE,
        environment: 'development',
      },
      {
        autoPreview: true,
        initialPreviewInteractive: true,
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(twoStepDocument),
        preview: {
          loadDocument: () => structuredClone(twoStepDocument),
          compilePreview: (document) =>
            compileDocument({
              document,
              theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
              rendererContractVersion: RENDERER_CONTRACT_VERSION,
            }),
          playPreview,
        },
      },
    );

    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() } as unknown as Window,
      configurable: true,
    });
    iframe.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(playPreview).toHaveBeenCalled());

    const options = captured as CapturedPreviewOptions | null;
    if (!options) throw new Error('preview options missing');
    expect(options.interactive).toBe(true);
    expect(typeof options.onBeforeStepChange).toBe('function');

    // The renderer is leaving step 1 for step 2. Nothing has rendered yet — this
    // is the last moment before a navigating click could take the page away.
    options.onBeforeStepChange?.(1, 'step_2');

    const record = readDraftPreviewResume(WORKSPACE);
    expect(record?.stepId).toBe('step_2');
    expect(record?.interactive).toBe(true);
    expect(record?.documentId).toBe(twoStepDocument.id);

    panel.close();
  });
});
