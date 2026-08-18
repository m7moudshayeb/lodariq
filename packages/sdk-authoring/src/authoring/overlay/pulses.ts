import type { LodariqDocument } from '@lodariq/schema';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { rectIntersectsViewport } from '../canvas/edge-resize';
import { authoringText } from '../../i18n';
import { tooltipOfStep, tourStepsOf } from './filmstrip';

export function resolvedStepTargetRect(
  documentState: LodariqDocument | null,
  stepId: string | null,
  root?: ParentNode,
): ProtectedSurfaceRect | null {
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
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function createPulseLayer(doc: Document): HTMLElement {
  const layer = doc.createElement('div');
  layer.className = 'overlay-pulses';
  layer.dataset['protectedChrome'] = 'true';
  layer.dataset['lodariqPulses'] = 'true';
  layer.setAttribute('aria-hidden', 'false');
  return layer;
}

export function syncPulses(
  layer: HTMLElement,
  options: {
    activeStepId: string | null;
    document: LodariqDocument | null;
    hideActive: boolean;
    onSelect: (stepId: string) => void;
    root?: ParentNode;
  },
): void {
  const doc = layer.ownerDocument;
  const viewport = {
    width: doc.defaultView?.innerWidth ?? 0,
    height: doc.defaultView?.innerHeight ?? 0,
  };
  const steps = tourStepsOf(options.document);
  const nextIds = new Set<string>();
  for (const [index, step] of steps.entries()) {
    if (options.hideActive && step.id === options.activeStepId) continue;
    const targetId = tooltipOfStep(step)?.props.targetId ?? step.props.targetId;
    if (!targetId) continue;
    const target = options.document?.targets.find((item) => item.id === targetId);
    if (!target) continue;
    const resolved = resolveTarget(target, options.root ?? doc);
    const element = resolved.element;
    if (!element || !('getBoundingClientRect' in element)) continue;
    const rect = element.getBoundingClientRect();
    if (!rectIntersectsViewport(rect, viewport)) continue;
    nextIds.add(step.id);
    let pulse = layer.querySelector<HTMLButtonElement>(`[data-pulse-step="${step.id}"]`);
    if (!pulse) {
      pulse = doc.createElement('button');
      pulse.type = 'button';
      pulse.className = 'overlay-pulse';
      pulse.dataset['pulseStep'] = step.id;
      pulse.dataset['lodariqAuthoringControl'] = 'true';
      pulse.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onSelect(step.id);
      });
      layer.appendChild(pulse);
    }
    const number = typeof step.props.index === 'number' ? step.props.index + 1 : index + 1;
    pulse.textContent = String(number);
    pulse.setAttribute('aria-label', authoringText('Edit step {number}', { number }));
    pulse.style.left = `${rect.left + rect.width / 2}px`;
    pulse.style.top = `${rect.top + rect.height / 2}px`;
  }
  for (const pulse of [...layer.querySelectorAll<HTMLElement>('[data-pulse-step]')]) {
    const stepId = pulse.dataset['pulseStep'];
    if (stepId && !nextIds.has(stepId)) pulse.remove();
  }
}
