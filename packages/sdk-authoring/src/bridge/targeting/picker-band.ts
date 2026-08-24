/**
 * The picker's two bands (§3.3, §4.4, §4.4a).
 *
 * "The picker announces itself with a full-width instruction band and a `Cancel`
 * button, so there is never a moment where the creator is in the picker without
 * being told so and given an exit."
 *
 * Top band: what to do, whether the page is frozen, and the way out. Bottom
 * band: what is currently under the pointer, and the three controls that replace
 * DevTools chords — the clickable ancestor breadcrumb, Pick bigger / Pick
 * smaller, and Use this. Split top from bottom because they answer different
 * questions: the mode, and the choice.
 *
 * Cancel and `Interact first` live here and only here. They used to be drawn a
 * second time as a floating pill pair in the opposite corner, so the picker
 * offered two exits and the creator had to work out whether they differed.
 */
import { createNonceStyleElement } from '@lodariq/schema/dom';
import { OVERLAY_GLYPHS } from '../../authoring/overlay/icons';
import { bandStyles } from '../../authoring/overlay/band-styles';
import { authoringText } from '../../i18n';
import { pickBigger, pickSmaller, targetBreadcrumb, type TargetCrumb } from './legibility';

export const PICKER_BAND_ATTRIBUTE = 'target-picker-band';

export interface PickerBandCallbacks {
  readonly onCancel: () => void;
  readonly onPickBigger: () => void;
  readonly onPickSmaller: () => void;
  readonly onFreeze: () => void;
  readonly onUnfreeze: () => void;
  /** Commit whatever the breadcrumb is currently pointing at. */
  readonly onUseThis: () => void;
  /** Interact with the product once without choosing a placement. */
  readonly onInteractOnce: () => void;
  readonly onCrumb: (element: Element) => void;
  readonly onCrumbHover: (element: Element | null) => void;
}

export interface PickerBand {
  /** Top and bottom, in mount order. */
  readonly elements: readonly HTMLElement[];
  /** Redraws the breadcrumb and the trail controls for the hovered element. */
  readonly setTarget: (element: Element | null) => void;
  /** Swaps `Freeze page` for the frozen tag and its immediate undo. */
  readonly setFrozen: (frozen: boolean) => void;
  readonly destroy: () => void;
}

export const PICKER_BAND_COPY = {
  instruction: authoringText('Click the thing this step should point at.'),
  pickBigger: authoringText('Pick bigger'),
  pickSmaller: authoringText('Pick smaller'),
  useThis: authoringText('Use this'),
  freeze: authoringText('Freeze page'),
  unfreeze: authoringText('Unfreeze'),
  frozen: authoringText('Page frozen'),
  interactOnce: authoringText('Interact first'),
  interactLabel: authoringText('Interact with the page once'),
  cancel: authoringText('Cancel'),
  cancelLabel: authoringText('Cancel placement selection'),
  /** The trail's root, before anything is hovered. */
  page: authoringText('Page'),
} as const;

export function createPickerBand(
  doc: Document,
  zIndex: number,
  callbacks: PickerBandCallbacks,
): PickerBand {
  const style = createNonceStyleElement(doc, bandStyles(zIndex));
  doc.head.appendChild(style);

  const top = createBand(doc, 'top');
  top.setAttribute('aria-label', PICKER_BAND_COPY.instruction);
  top.innerHTML = `
    <p class="lq-band-title">${OVERLAY_GLYPHS.crosshair}${PICKER_BAND_COPY.instruction}</p>
    <span class="lq-band-grow"></span>
    <span class="lq-band-tag" data-picker-frozen hidden>${OVERLAY_GLYPHS.lock}${PICKER_BAND_COPY.frozen}</span>
    <button type="button" data-picker-action="freeze">${OVERLAY_GLYPHS.lock}${PICKER_BAND_COPY.freeze}</button>
    <button type="button" data-picker-action="unfreeze" hidden>${PICKER_BAND_COPY.unfreeze}</button>
    <button type="button" data-picker-action="interact" data-lodariq-bridge="target-interact" data-action="click-through" aria-label="${PICKER_BAND_COPY.interactLabel}">${PICKER_BAND_COPY.interactOnce}</button>
    <button type="button" data-picker-action="cancel" data-lodariq-bridge="target-cancel" data-action="cancel" aria-label="${PICKER_BAND_COPY.cancelLabel}">${PICKER_BAND_COPY.cancel}</button>
  `;

  const bottom = createBand(doc, 'bottom');
  bottom.innerHTML = `
    <nav class="lq-band-crumbs" data-band-crumbs aria-label="${PICKER_BAND_COPY.instruction}"></nav>
    <span class="lq-band-grow"></span>
    <button type="button" data-picker-action="bigger">${OVERLAY_GLYPHS.maximize}${PICKER_BAND_COPY.pickBigger}</button>
    <button type="button" data-picker-action="smaller">${OVERLAY_GLYPHS.minimize}${PICKER_BAND_COPY.pickSmaller}</button>
    <button type="button" data-picker-action="use" data-band-primary>${OVERLAY_GLYPHS.check}${PICKER_BAND_COPY.useThis}</button>
  `;

  const crumbHost = bottom.querySelector<HTMLElement>('[data-band-crumbs]')!;
  const action = (name: string): HTMLButtonElement =>
    (top.querySelector<HTMLButtonElement>(`[data-picker-action="${name}"]`) ??
      bottom.querySelector<HTMLButtonElement>(`[data-picker-action="${name}"]`))!;
  const frozenTag = top.querySelector<HTMLElement>('[data-picker-frozen]')!;
  let crumbs: readonly TargetCrumb[] = [];

  const ACTIONS: Readonly<Record<string, () => void>> = {
    bigger: callbacks.onPickBigger,
    smaller: callbacks.onPickSmaller,
    use: callbacks.onUseThis,
    freeze: callbacks.onFreeze,
    unfreeze: callbacks.onUnfreeze,
    interact: callbacks.onInteractOnce,
    cancel: callbacks.onCancel,
  };

  const onClick = (event: Event): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const crumbIndex = button.dataset['crumbIndex'];
    if (crumbIndex !== undefined) {
      const crumb = crumbs[Number(crumbIndex)];
      if (crumb) callbacks.onCrumb(crumb.element);
      return;
    }
    ACTIONS[button.dataset['pickerAction'] ?? '']?.();
  };

  const onHover = (event: Event): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    const crumbIndex = button?.dataset['crumbIndex'];
    callbacks.onCrumbHover(
      crumbIndex === undefined ? null : (crumbs[Number(crumbIndex)]?.element ?? null),
    );
  };

  top.addEventListener('click', onClick);
  bottom.addEventListener('click', onClick);
  crumbHost.addEventListener('pointerover', onHover);
  crumbHost.addEventListener('pointerout', () => callbacks.onCrumbHover(null));

  return {
    elements: [top, bottom],
    setTarget: (element) => {
      const rect = element?.getBoundingClientRect();
      for (const band of [top, bottom]) band.dataset['dodge'] = String(overlaps(band, rect));
      crumbs = element ? targetBreadcrumb(element) : [];
      crumbHost.replaceChildren();
      if (!crumbs.length) crumbHost.appendChild(rootCrumb(doc));
      crumbs.forEach((crumb, index) => {
        if (index > 0) crumbHost.appendChild(separator(doc));
        const button = doc.createElement('button');
        button.type = 'button';
        button.dataset['crumbIndex'] = String(index);
        button.textContent = crumb.label;
        // The trail ends at the element itself, so the last crumb is the choice.
        if (index === crumbs.length - 1) button.setAttribute('aria-current', 'true');
        crumbHost.appendChild(button);
      });
      // Disabled rather than hidden: the trail's ends are information (§14.4).
      action('bigger').disabled = !element || !pickBigger(element);
      action('smaller').disabled = !element || !pickSmaller(element);
      action('use').disabled = !element;
    },
    setFrozen: (frozen) => {
      frozenTag.hidden = !frozen;
      action('freeze').hidden = frozen;
      action('unfreeze').hidden = !frozen;
    },
    destroy: () => {
      top.removeEventListener('click', onClick);
      bottom.removeEventListener('click', onClick);
      top.remove();
      bottom.remove();
      style.remove();
    },
  };
}

/** Whether the candidate is behind this band, so the band can step aside. */
function overlaps(band: HTMLElement, rect: DOMRect | undefined): boolean {
  if (!rect) return false;
  const box = band.getBoundingClientRect();
  return rect.left < box.right && box.left < rect.right && rect.top < box.bottom && box.top < rect.bottom;
}

function createBand(doc: Document, edge: 'top' | 'bottom'): HTMLElement {
  const band = doc.createElement('div');
  band.dataset['lodariqBridge'] = PICKER_BAND_ATTRIBUTE;
  band.dataset['band'] = edge;
  band.className = 'lq-band';
  band.setAttribute('role', 'region');
  return band;
}

function separator(doc: Document): HTMLElement {
  const element = doc.createElement('span');
  element.dataset['bandSeparator'] = 'true';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = OVERLAY_GLYPHS.chevronRight;
  return element;
}

/** Nothing hovered yet: the trail still has to say where you are. */
function rootCrumb(doc: Document): HTMLElement {
  const element = doc.createElement('span');
  element.textContent = PICKER_BAND_COPY.page;
  element.setAttribute('aria-current', 'true');
  return element;
}
