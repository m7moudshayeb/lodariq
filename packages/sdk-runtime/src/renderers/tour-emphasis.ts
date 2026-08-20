import { hostSafe } from '../host-safety';
import type { CompiledStep, StepBackdrop, StepEmphasis, TargetOutline } from '@lodariq/schema';

/**
 * Backdrop, outline treatment and viewport focus — the three things that make a
 * step read as pointing at something rather than floating over it.
 *
 * The dim is one element: a box sized to the target carrying an oversized
 * `box-shadow`, so the hole follows the target's own radius and nothing covers
 * the target itself. A `clickTarget` step therefore stays clickable, which a
 * full-viewport overlay would break. Click-outside is a separate document
 * listener rather than a hit-testable layer, for the same reason.
 */

/**
 * §4.4's spotlight is one soft mask, not four rectangles — the blur is what
 * makes it read as a light falling on the target rather than a cut-out. It is
 * the shadow's blur, so the hole keeps the target's own radius and stays
 * click-through.
 */
const BACKDROP_SOFTNESS_PX = 18;
const BACKDROP_SPREAD_PX = 9999;

/** ADR-0013: a role resolves to a theme variable; a literal colour never persists. */
const OUTLINE_COLOR_VARIABLES = {
  accent: '--lq-tour-focus-color',
  ink: '--lq-tour-text-color',
  border: '--lq-tour-border-color',
  onAccent: '--lq-tour-primary-text',
} as const;

const BACKDROP_TINT_VARIABLES = {
  accent: '--lq-tour-focus-color',
  ink: '--lq-tour-text-color',
  border: '--lq-tour-border-color',
  onAccent: '--lq-tour-primary-text',
} as const;

export function createTourBackdrop(doc: Document): HTMLDivElement {
  const backdrop = doc.createElement('div');
  backdrop.className = 'tour-backdrop';
  backdrop.setAttribute('data-lodariq-backdrop', '');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.hidden = true;
  return backdrop;
}

export function applyStepOutlineEmphasis(
  outline: HTMLElement | null,
  emphasis: StepEmphasis | undefined,
): void {
  if (!outline) return;
  const treatment = emphasis?.targetOutline;
  outline.removeAttribute('data-lodariq-outline-line');
  outline.removeAttribute('data-lodariq-outline-glow');
  outline.removeAttribute('data-lodariq-outline-follow-radius');
  for (const property of [
    '--lq-outline-weight',
    '--lq-outline-offset',
    '--lq-outline-radius',
    '--lq-outline-color',
  ]) {
    outline.style.removeProperty(property);
  }
  if (!treatment) return;

  if (treatment.line) outline.setAttribute('data-lodariq-outline-line', treatment.line);
  if (treatment.glow) outline.setAttribute('data-lodariq-outline-glow', 'true');
  if (treatment.followTargetRadius)
    outline.setAttribute('data-lodariq-outline-follow-radius', 'true');
  if (treatment.weightPx !== undefined)
    outline.style.setProperty('--lq-outline-weight', `${treatment.weightPx}px`);
  if (treatment.offsetPx !== undefined)
    outline.style.setProperty('--lq-outline-offset', `${treatment.offsetPx}px`);
  if (treatment.radiusPx !== undefined)
    outline.style.setProperty('--lq-outline-radius', `${treatment.radiusPx}px`);
  // A literal wins over the role, the way the popup surface already works.
  if (treatment.color) outline.style.setProperty('--lq-outline-color', treatment.color);
  else if (treatment.colorRole)
    outline.style.setProperty(
      '--lq-outline-color',
      `var(${OUTLINE_COLOR_VARIABLES[treatment.colorRole]})`,
    );
  // `pulse` reuses the spotlight animation so reduced motion keeps one rule to disable.
  if (treatment.pulse !== undefined)
    outline.dataset['lodariqSpotlightPulse'] = treatment.pulse ? 'true' : 'false';
}

/**
 * The offset the outline sits at, so the backdrop hole and the ring agree. The
 * ring is drawn outside the target, and a hole narrower than the ring would
 * leave a dark seam between them.
 */
export function outlineOffsetPx(emphasis: StepEmphasis | undefined, fallbackPx: number): number {
  return emphasis?.targetOutline?.offsetPx ?? fallbackPx;
}

export function positionTourBackdrop(
  backdrop: HTMLElement | null,
  target: Element,
  emphasis: StepEmphasis | undefined,
  offsetPx: number,
): void {
  if (!backdrop) return;
  const config = emphasis?.backdrop;
  if (!config) {
    backdrop.hidden = true;
    return;
  }
  const rect = target.getBoundingClientRect();
  const tint = config.tintRole
    ? `var(${BACKDROP_TINT_VARIABLES[config.tintRole]})`
    : 'rgb(0 0 0 / 100%)';
  Object.assign(backdrop.style, {
    left: `${rect.left - offsetPx}px`,
    top: `${rect.top - offsetPx}px`,
    width: `${rect.width + offsetPx * 2}px`,
    height: `${rect.height + offsetPx * 2}px`,
    boxShadow: `0 0 ${BACKDROP_SOFTNESS_PX}px ${BACKDROP_SPREAD_PX}px color-mix(in srgb, ${tint} ${config.dimPercent}%, transparent)`,
  });
  if (emphasis?.targetOutline?.followTargetRadius) {
    const radius = target.ownerDocument.defaultView?.getComputedStyle(target).borderRadius;
    if (radius) backdrop.style.borderRadius = radius;
  } else if (emphasis?.targetOutline?.radiusPx !== undefined) {
    backdrop.style.borderRadius = `${emphasis.targetOutline.radiusPx}px`;
  } else {
    backdrop.style.removeProperty('border-radius');
  }
  backdrop.hidden = false;
}

/**
 * Clicks outside the hole. Bound in the capture phase on the host document so a
 * host that stops propagation cannot swallow a dismiss, and hit-tested against
 * the hole rect rather than an overlay element so the target stays interactive.
 */
export function armBackdropClick(
  backdrop: HTMLElement | null,
  config: StepBackdrop | undefined,
  handlers: { advance: () => void; dismiss: () => void },
): () => void {
  if (!backdrop || !config || config.clickBehavior === 'none') return () => {};
  const doc = backdrop.ownerDocument;
  const onClick = (event: MouseEvent): void => {
    if (backdrop.hidden) return;
    const rect = backdrop.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside) return;
    event.preventDefault();
    event.stopPropagation();
    if (config.clickBehavior === 'advance') handlers.advance();
    else handlers.dismiss();
  };
  // Document-level capture on the customer's page: never let this throw.
  const safeOnClick = hostSafe('tour.emphasisBackdropClick', onClick);
  doc.addEventListener('click', safeOnClick, true);
  return () => doc.removeEventListener('click', safeOnClick, true);
}

/**
 * `zoom` scales the host document. It is opt-in per step because a page-level
 * transform fights sticky headers and every rect the resolver measures — so the
 * player re-measures on the next frame rather than trusting the pre-zoom rects.
 */
export function applyViewportZoom(step: CompiledStep, doc: Document): () => void {
  const focus = step.emphasis?.viewportFocus;
  if (!focus || focus.behavior !== 'zoom') return () => {};
  const scale = (focus.scalePercent ?? 100) / 100;
  if (scale === 1) return () => {};
  const root = doc.documentElement;
  const previousTransform = root.style.transform;
  const previousOrigin = root.style.transformOrigin;
  root.style.transformOrigin = 'top center';
  root.style.transform = `scale(${scale})`;
  return () => {
    root.style.transform = previousTransform;
    root.style.transformOrigin = previousOrigin;
  };
}

export function stepEmphasisOf(step: CompiledStep): StepEmphasis | undefined {
  return step.emphasis;
}

export type { StepBackdrop, TargetOutline };
