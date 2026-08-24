import type { CompiledStep } from '@lodariq/schema';

const DEFAULT_MOTION_MS = 240;
const TARGET_VIEWPORT_RATIO = 0.82;

/** Centers the semantic target first, then applies bounded product-surface zoom. */
export function applyViewportFocus(
  step: CompiledStep,
  target: Element,
  host: HTMLElement,
): () => void {
  const focus = step.emphasis?.viewportFocus;
  if (!focus) return () => {};
  const doc = target.ownerDocument;
  const reducedMotion = prefersReducedMotion(host);
  const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth';
  if (focus.behavior !== 'zoom' || reducedMotion) {
    scrollTargetToCenter(target, behavior);
    return () => {};
  }

  const body = doc.body;
  const previousParent = host.parentNode;
  const previousSibling = host.nextSibling;
  const previousZoom = body?.style.zoom ?? '';
  const scale = boundedScale(target, (focus.scalePercent ?? 100) / 100);
  if (!body || !previousParent || scale <= 1 || !['', '1'].includes(previousZoom.trim())) {
    scrollTargetToCenter(target, behavior);
    return () => {};
  }

  doc.documentElement.appendChild(host);
  body.style.zoom = String(scale);
  scrollTargetToCenter(target, behavior);
  const rect = target.getBoundingClientRect();
  const transformOrigin = `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;
  const animation =
    !hasFixedChrome(doc, host) && typeof body.animate === 'function'
      ? body.animate(
          [
            { transform: `scale(${1 / scale})`, transformOrigin },
            { transform: 'scale(1)', transformOrigin },
          ],
          { duration: motionDuration(host), easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        )
      : null;

  return () => {
    animation?.cancel();
    body.style.zoom = previousZoom;
    if (!previousParent.isConnected) return;
    if (previousSibling?.parentNode === previousParent) {
      previousParent.insertBefore(host, previousSibling);
    } else {
      previousParent.appendChild(host);
    }
  };
}

function scrollTargetToCenter(target: Element, behavior: ScrollBehavior): void {
  if (typeof target.scrollIntoView !== 'function') return;
  try {
    target.scrollIntoView({ behavior, block: 'center', inline: 'center' });
  } catch {
    target.scrollIntoView();
  }
}

function boundedScale(target: Element, authoredScale: number): number {
  const rect = target.getBoundingClientRect();
  const viewportWidth = target.ownerDocument.defaultView?.innerWidth ?? 0;
  const widthBound = rect.width > 0 ? (viewportWidth * TARGET_VIEWPORT_RATIO) / rect.width : 1;
  return Math.max(1, Math.min(2, authoredScale, widthBound));
}

function hasFixedChrome(doc: Document, host: HTMLElement): boolean {
  return [...doc.body.children].slice(0, 200).some((element) => {
    const position = doc.defaultView?.getComputedStyle(element).position;
    if (element === host || (position !== 'fixed' && position !== 'sticky')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function prefersReducedMotion(element: Element): boolean {
  if (element.getAttribute('data-lodariq-accessibility-preview') === 'reducedMotion') return true;
  const root = element.getRootNode();
  const ShadowRootConstructor = element.ownerDocument.defaultView?.ShadowRoot;
  const host = ShadowRootConstructor && root instanceof ShadowRootConstructor ? root.host : null;
  return (
    host?.getAttribute('data-lodariq-accessibility-preview') === 'reducedMotion' ||
    Boolean(
      element.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    )
  );
}

function motionDuration(element: Element): number {
  const value = element.ownerDocument.defaultView
    ?.getComputedStyle(element)
    .getPropertyValue('--lq-tour-motion-duration');
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? Math.min(1_200, Math.max(0, parsed)) : DEFAULT_MOTION_MS;
}
