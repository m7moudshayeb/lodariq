import { authoringText } from '../../i18n';
import { escapeHtml } from './html';
import { OVERLAY_GLYPHS } from './icons';

/**
 * Preview's own chrome (§4.7). The pill is a composing surface — it carries the
 * Editing ⇄ Browsing switch and a save state that mean nothing while the tour is
 * playing — so preview gets a bar with only the four things it can do.
 */
export interface PreviewBarState {
  readonly stepNumber: number | null;
  readonly stepCount: number;
  readonly captionsOn: boolean;
  /** The step on screen has a spoken script, so there is something to caption. */
  readonly hasScript: boolean;
}

export interface PreviewBarCallbacks {
  readonly onStep: (direction: 'previous' | 'next') => void;
  readonly onEditStep: () => void;
  readonly onExit: () => void;
  readonly onToggleCaptions: () => void;
}

export interface PreviewBar {
  readonly element: HTMLElement;
  readonly setState: (state: PreviewBarState) => void;
  readonly setVisible: (visible: boolean) => void;
}

export const PREVIEW_BAR_COPY = {
  region: authoringText('Preview controls'),
  previous: authoringText('Previous step'),
  next: authoringText('Next step'),
  editThisStep: authoringText('Edit this step'),
  exitPreview: authoringText('Exit preview'),
  preview: authoringText('Preview'),
  playNarration: authoringText('Play the narration'),
  narrationTimeline: authoringText('Narration timeline'),
  captions: authoringText('Captions'),
  /** §14.4: the disabled control has to say why, or it reads as broken. */
  narrationReason: authoringText(
    'Narration audio is not in the artifact yet, so there is nothing to play or scrub.',
  ),
  /** Captions are text, so they work — until the step has no script to show. */
  captionsReason: authoringText('This step has no spoken script yet.'),
} as const;

export function createPreviewBar(doc: Document, callbacks: PreviewBarCallbacks): PreviewBar {
  const element = doc.createElement('div');
  element.className = 'overlay-preview-bar';
  element.dataset['protectedChrome'] = 'true';
  element.dataset['lodariqAuthoringControl'] = 'true';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', PREVIEW_BAR_COPY.region);
  element.hidden = true;

  let state: PreviewBarState = {
    stepNumber: null,
    stepCount: 0,
    captionsOn: true,
    hasScript: false,
  };

  const render = (): void => {
    const first = state.stepNumber != null && state.stepNumber <= 1;
    const last = state.stepNumber != null && state.stepNumber >= state.stepCount;
    element.innerHTML = `
      ${transport(state)}
      <span class="overlay-preview-bar-progress">${escapeHtml(progressLabel(state))}</span>
      ${iconButton('previous', PREVIEW_BAR_COPY.previous, OVERLAY_GLYPHS.chevronLeft, first)}
      ${iconButton('next', PREVIEW_BAR_COPY.next, OVERLAY_GLYPHS.chevronRight, last)}
      <button type="button" class="overlay-preview-bar-button" data-preview-edit>
        ${OVERLAY_GLYPHS.pencil}<span>${escapeHtml(PREVIEW_BAR_COPY.editThisStep)}</span>
      </button>
      <button type="button" class="overlay-preview-bar-button" data-preview-exit data-primary="true">
        ${escapeHtml(PREVIEW_BAR_COPY.exitPreview)}
      </button>
    `;
  };

  element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-preview-step="previous"]')) callbacks.onStep('previous');
    else if (target.closest('[data-preview-step="next"]')) callbacks.onStep('next');
    else if (target.closest('[data-preview-captions]')) callbacks.onToggleCaptions();
    else if (target.closest('[data-preview-edit]')) callbacks.onEditStep();
    else if (target.closest('[data-preview-exit]')) callbacks.onExit();
  });

  render();
  return {
    element,
    setState: (next) => {
      state = next;
      render();
    },
    setVisible: (visible) => {
      element.hidden = !visible;
    },
  };
}

function progressLabel(state: PreviewBarState): string {
  return state.stepNumber == null
    ? PREVIEW_BAR_COPY.preview
    : authoringText('Preview · {number} of {total}', {
        number: state.stepNumber,
        total: state.stepCount,
      });
}

/**
 * WIRE_BE: narration *audio* and its timing are not in the immutable artifact yet
 * — the same gap `PlaybackControls` in `components/step-narration-section.tsx`
 * carries, waiting on the ADR-0014 amendment. There is no clock, so play and the
 * scrub have nothing to run against and both stay inert.
 *
 * Captions are not in that gap. §7.7 keeps the spoken script in the document and
 * only the audio out of the artifact, so the words are already here — the toggle
 * is live, and it is disabled only on a step nobody has written a script for.
 */
function transport(state: PreviewBarState): string {
  const why = escapeHtml(PREVIEW_BAR_COPY.narrationReason);
  const captionsWhy = escapeHtml(PREVIEW_BAR_COPY.captionsReason);
  const captions = escapeHtml(PREVIEW_BAR_COPY.captions);
  return `
    <button type="button" class="overlay-preview-bar-icon" disabled
      aria-label="${escapeHtml(PREVIEW_BAR_COPY.playNarration)}" aria-description="${why}"
      title="${escapeHtml(PREVIEW_BAR_COPY.playNarration)} — ${why}"
    >${OVERLAY_GLYPHS.play}</button>
    <div class="overlay-preview-bar-scrub" role="slider" aria-disabled="true"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
      aria-label="${escapeHtml(PREVIEW_BAR_COPY.narrationTimeline)}"
      title="${escapeHtml(PREVIEW_BAR_COPY.narrationTimeline)} — ${why}"><i></i></div>
    <button type="button" class="overlay-preview-bar-icon" data-preview-captions
      ${state.hasScript ? '' : 'disabled aria-description="' + captionsWhy + '"'}
      aria-pressed="${state.hasScript && state.captionsOn ? 'true' : 'false'}"
      aria-label="${captions}"
      title="${captions}${state.hasScript ? '' : ` — ${captionsWhy}`}"
    >${OVERLAY_GLYPHS.quote}</button>
  `;
}

function iconButton(step: string, label: string, glyph: string, disabled: boolean): string {
  return `<button type="button" class="overlay-preview-bar-icon" data-preview-step="${step}"
    ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${glyph}</button>`;
}
