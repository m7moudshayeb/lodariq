import { AUTHORING_PANEL_LABELS } from '../panel-config';
import type { OverlayPlacement } from '../canvas/edge-resize';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';

const PLACEMENT_CHEVRONS: Record<OverlayPlacement, string> = {
  top: '<polyline points="6 14 12 8 18 14"/>',
  right: '<polyline points="10 6 16 12 10 18"/>',
  bottom: '<polyline points="6 10 12 16 18 10"/>',
  left: '<polyline points="14 6 8 12 14 18"/>',
};

const PLACEMENT_OPTIONS: ReadonlyArray<{ placement: OverlayPlacement; label: string }> = [
  { placement: 'top', label: AUTHORING_PANEL_LABELS.placementAbove },
  { placement: 'right', label: AUTHORING_PANEL_LABELS.placementRight },
  { placement: 'bottom', label: AUTHORING_PANEL_LABELS.placementBelow },
  { placement: 'left', label: AUTHORING_PANEL_LABELS.placementLeft },
];

export function createCompass(doc: Document): HTMLElement {
  const compass = doc.createElement('div');
  compass.className = 'overlay-compass';
  compass.dataset['protectedChrome'] = 'true';
  compass.dataset['lodariqCompass'] = 'true';
  compass.hidden = true;
  for (const option of PLACEMENT_OPTIONS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'overlay-compass-hit';
    button.dataset['placement'] = option.placement;
    button.setAttribute('aria-label', option.label);
    button.title = option.label;
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${PLACEMENT_CHEVRONS[option.placement]}</svg>`;
    compass.appendChild(button);
  }
  const retarget = doc.createElement('button');
  retarget.type = 'button';
  retarget.className = 'overlay-compass-retarget';
  retarget.dataset['retarget'] = 'true';
  retarget.setAttribute('aria-label', AUTHORING_PANEL_LABELS.changeTarget);
  retarget.title = AUTHORING_PANEL_LABELS.changeTarget;
  retarget.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
  compass.appendChild(retarget);
  return compass;
}

export function syncCompass(
  compass: HTMLElement,
  target: ProtectedSurfaceRect | null,
  visible: boolean,
  onPlace: (placement: OverlayPlacement) => void,
  onRetarget?: () => void,
  currentPlacement?: OverlayPlacement | null,
): void {
  compass.hidden = !visible || !target;
  if (!target) return;
  compass.style.left = `${target.left}px`;
  compass.style.top = `${target.top}px`;
  compass.style.width = `${target.width}px`;
  compass.style.height = `${target.height}px`;
  for (const button of compass.querySelectorAll<HTMLButtonElement>('[data-placement]')) {
    const placement = button.dataset['placement'] as OverlayPlacement | undefined;
    button.hidden = false;
    button.setAttribute('aria-pressed', placement === currentPlacement ? 'true' : 'false');
    button.onclick = () => {
      if (placement) onPlace(placement);
    };
  }
  const retarget = compass.querySelector<HTMLButtonElement>('[data-retarget]');
  if (retarget) retarget.onclick = () => onRetarget?.();
}
