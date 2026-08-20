/**
 * The step-lock band (§15.2 layer 2).
 *
 * A full-width strip rather than a line inside the card, because being locked
 * out is a fact about the mode you are in, not about one surface. The card still
 * renders and is still readable — a lock that hides the work is worse than one
 * that explains it.
 *
 * `Ask for it` pings the holder rather than forcing a takeover, and `Duplicate
 * instead` is the way out that needs nobody's permission.
 *
 * The host applies the same `stepEditability` decision before accepting a frame
 * patch, so this band is an explanation of an enforced boundary rather than a
 * decorative claim. Presence transport remains a host service concern.
 */
import { authoringText } from '../../i18n';
import { OVERLAY_GLYPHS } from './icons';

export interface LockBandModel {
  /** The held step, so the actions know what they act on. */
  readonly stepId: string;
  readonly holderName: string;
  /**
   * A document operation (layer 3) locks everything for a moment and there is
   * nothing to ask for or duplicate around, so it states the wait and offers no
   * actions.
   */
  readonly reason: 'step' | 'document';
}

export interface LockBandCallbacks {
  readonly onAsk: (stepId: string, holderName: string) => void;
  readonly onDuplicate: (stepId: string) => void;
}

export interface LockBand {
  readonly element: HTMLElement;
  /** Null hides it: nobody is holding this step. */
  readonly setHolder: (model: LockBandModel | null) => void;
}

export const LOCK_BAND_COPY = {
  ask: authoringText('Ask for it'),
  duplicate: authoringText('Duplicate instead'),
} as const;

export function createLockBand(doc: Document, callbacks: LockBandCallbacks): LockBand {
  const band = doc.createElement('div');
  band.className = 'lq-band overlay-lock-band';
  band.dataset['band'] = 'top';
  band.dataset['protectedChrome'] = 'true';
  band.dataset['lodariqAuthoringControl'] = 'true';
  band.setAttribute('role', 'status');
  band.hidden = true;
  band.innerHTML = `
    <p class="lq-band-title">${OVERLAY_GLYPHS.lock}<span data-lock-band-message></span></p>
    <span class="lq-band-grow"></span>
    <button type="button" data-lock-band-action="ask">${LOCK_BAND_COPY.ask}</button>
    <button type="button" data-lock-band-action="duplicate">${OVERLAY_GLYPHS.copy}${LOCK_BAND_COPY.duplicate}</button>
  `;

  const message = band.querySelector<HTMLElement>('[data-lock-band-message]')!;
  const actions = [...band.querySelectorAll<HTMLElement>('[data-lock-band-action]')];
  let holder: LockBandModel | null = null;

  band.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '[data-lock-band-action]',
    )?.dataset['lockBandAction'];
    if (!action || !holder) return;
    if (action === 'ask') callbacks.onAsk(holder.stepId, holder.holderName);
    else callbacks.onDuplicate(holder.stepId);
  });

  return {
    element: band,
    setHolder: (model) => {
      holder = model;
      band.hidden = !model;
      if (!model) return;
      for (const action of actions) action.hidden = model.reason === 'document';
      message.textContent =
        model.reason === 'document'
          ? authoringText('{name} is reordering steps — one moment.', { name: model.holderName })
          : authoringText('{name} is editing this step — you are read-only.', {
              name: model.holderName,
            });
    },
  };
}
