import {
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_AUTHORING_TARGET_STATE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import type { LodariqDocument } from '@lodariq/schema';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { CREATOR_CHROME_STATUS_TOKENS } from '../../creator-chrome-tokens';
import { authoringText } from '../../i18n';
import { tooltipOfStep, tourStepsOf } from './filmstrip';

/**
 * The on-page target ring (§4.4).
 *
 * The ring is drawn by the runtime as `.tour-target-outline`, so the ring the
 * creator styles is the ring that publishes. This module adds the two
 * creator-only parts: the ok/ctx/bad state, published as an attribute on the
 * tour host, and a hittable band on the border that opens §4.3's Target
 * inspector. Only the band takes clicks — the middle stays the customer's.
 */

export type TargetRingState = 'ok' | 'ctx' | 'bad';

/** Half-thickness of the hittable band, centred on the ring's border. */
const RING_EDGE_PX = 9;

const EDGES = ['top', 'right', 'bottom', 'left'] as const;

/** Ring state → the two custom properties `tour-styles.ts` paints it with. */
const STATE_COLOURS: Readonly<Record<Exclude<TargetRingState, 'ok'>, readonly [string, string]>> = {
  ctx: [CREATOR_CHROME_STATUS_TOKENS.attention, 'color-mix(in srgb, currentColor 14%, transparent)'],
  bad: [CREATOR_CHROME_STATUS_TOKENS.danger, 'color-mix(in srgb, currentColor 16%, transparent)'],
};

export interface TargetRingModel {
  readonly rect: ProtectedSurfaceRect | null;
  readonly outlineOffsetPx: number;
  readonly selected: boolean;
  readonly visible: boolean;
}

export interface ResolvedStepTarget {
  readonly rect: ProtectedSurfaceRect;
  readonly state: TargetRingState;
}

export function createTargetRing(doc: Document, onSelect: () => void): HTMLElement {
  const ring = doc.createElement('div');
  ring.className = 'overlay-target-ring';
  ring.dataset['protectedChrome'] = 'true';
  ring.dataset['lodariqTargetRing'] = 'true';
  ring.hidden = true;

  // One focusable edge: four tab stops around one object is four times the cost.
  const top = doc.createElement('button');
  top.type = 'button';
  top.className = 'overlay-target-ring-edge';
  top.dataset['ringEdge'] = 'top';
  top.dataset['lodariqAuthoringControl'] = 'true';
  top.setAttribute('aria-label', authoringText('Target settings'));
  top.title = authoringText('Target settings');
  ring.appendChild(top);
  for (const edge of EDGES.slice(1)) {
    const strip = doc.createElement('div');
    strip.className = 'overlay-target-ring-edge';
    strip.dataset['ringEdge'] = edge;
    ring.appendChild(strip);
  }
  ring.addEventListener('click', (event) => {
    if (!(event.target as HTMLElement | null)?.closest('[data-ring-edge]')) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
  });
  return ring;
}

export function syncTargetRing(ring: HTMLElement, model: TargetRingModel): void {
  const { rect } = model;
  ring.hidden = !model.visible || !rect;
  if (!rect) return;
  // The band tracks the drawn ring, which sits at the step's outline offset.
  const offset = model.outlineOffsetPx;
  ring.style.left = `${rect.left - offset}px`;
  ring.style.top = `${rect.top - offset}px`;
  ring.style.width = `${rect.width + offset * 2}px`;
  ring.style.height = `${rect.height + offset * 2}px`;
  ring.style.setProperty('--overlay-ring-edge', `${RING_EDGE_PX}px`);
  ring.dataset['selected'] = model.selected ? 'true' : 'false';
}

/** Scoped to this session's preview owner: a delivered tour keeps its own ring. */
export function publishTargetRingState(
  doc: Document,
  previewOwnerId: string,
  state: TargetRingState | null,
): void {
  for (const host of doc.querySelectorAll<HTMLElement>('lodariq-tour')) {
    if (host.getAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE) !== previewOwnerId) continue;
    if (!state || state === 'ok') {
      host.removeAttribute(LODARIQ_AUTHORING_TARGET_STATE_ATTRIBUTE);
      host.style.removeProperty('--lq-authoring-target-state-color');
      host.style.removeProperty('--lq-authoring-target-state-halo');
      continue;
    }
    const [colour, halo] = STATE_COLOURS[state];
    host.setAttribute(LODARIQ_AUTHORING_TARGET_STATE_ATTRIBUTE, state);
    host.style.setProperty('--lq-authoring-target-state-color', colour);
    // `currentColor` inside the halo resolves against the border colour above.
    host.style.setProperty('--lq-authoring-target-state-halo', halo.replace('currentColor', colour));
  }
}

/** Null rather than a zero rect: the caller keeps the last rect so chrome cannot jump. */
export function resolveStepTargetRing(
  documentState: LodariqDocument | null,
  stepId: string | null,
  root?: ParentNode,
): ResolvedStepTarget | null {
  if (!documentState || !stepId) return null;
  const step = tourStepsOf(documentState).find((item) => item.id === stepId);
  if (!step) return null;
  const targetId = tooltipOfStep(step)?.props.targetId ?? step.props.targetId;
  if (!targetId) return null;
  const target = documentState.targets.find((item) => item.id === targetId);
  if (!target) return null;
  const resolved = resolveTarget(target, root ?? document);
  const element = resolved.element;
  if (!element || !('getBoundingClientRect' in element)) return null;
  const rect = element.getBoundingClientRect();
  return {
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    },
    state: ringStateFor(resolved.state, Boolean(target.approach)),
  };
}

/**
 * Mirrors `targetVerificationState`, so the ring and the inspector's tag two
 * inches away never disagree. `missing` with a recorded approach is the one
 * addition: a plan for reaching it is not a fault.
 */
export function ringStateFor(
  status: 'found' | 'ambiguous' | 'missing' | 'needs_review',
  hasApproach: boolean,
): TargetRingState {
  if (status === 'found') return 'ok';
  if (status === 'needs_review') return 'ctx';
  if (status === 'missing' && hasApproach) return 'ctx';
  return 'bad';
}
