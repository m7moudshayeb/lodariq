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
}

export interface PreviewBarCallbacks {
  readonly onStep: (direction: 'previous' | 'next') => void;
  readonly onEditStep: () => void;
  readonly onExit: () => void;
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
  };

  const render = (): void => {
    const first = state.stepNumber != null && state.stepNumber <= 1;
    const last = state.stepNumber != null && state.stepNumber >= state.stepCount;
    element.innerHTML = `
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

function iconButton(step: string, label: string, glyph: string, disabled: boolean): string {
  return `<button type="button" class="overlay-preview-bar-icon" data-preview-step="${step}"
    ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${glyph}</button>`;
}
