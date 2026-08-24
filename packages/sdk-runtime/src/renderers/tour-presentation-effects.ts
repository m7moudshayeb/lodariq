import type { CompiledStep } from '@lodariq/schema';

const STEP_PRESENTATION_STYLE_ATTRIBUTE = 'data-lodariq-step-presentation-styles';
const STEP_PRESENTATION_STYLES = `
div[role="dialog"][data-lodariq-motion-phase][data-lodariq-motion="fade"]{animation:lq-card-fade-in var(--lq-step-motion-duration) var(--lq-step-motion-easing) both}
div[role="dialog"][data-lodariq-motion-phase][data-lodariq-motion="lift"]{animation:lq-card-slide-in var(--lq-step-motion-duration) var(--lq-step-motion-easing) both}
div[role="dialog"][data-lodariq-motion="scale"]{transform-origin:var(--lq-step-origin-x,50%) var(--lq-step-origin-y,50%)}
div[role="dialog"][data-lodariq-motion-phase][data-lodariq-motion="scale"]{animation:lq-card-scale-in var(--lq-step-motion-duration) var(--lq-step-motion-easing) both}
div[role="dialog"][data-lodariq-motion-phase][data-lodariq-motion="pulse"]{animation:lq-card-pulse var(--lq-step-motion-duration) var(--lq-step-motion-easing) 2}
div[role="dialog"][data-lodariq-motion-phase="exit"]{animation-direction:reverse;pointer-events:none}
div[role="dialog"][data-lodariq-motion-phase="exit"][data-lodariq-motion="pulse"]{animation-name:lq-card-fade-in;animation-iteration-count:1}
@keyframes lq-card-fade-in{from{opacity:0}}
@keyframes lq-card-slide-in{from{opacity:0;translate:var(--lq-step-slide-x,0) var(--lq-step-slide-y,8px)}}
@keyframes lq-card-scale-in{from{opacity:0;scale:.94}}
@keyframes lq-card-pulse{50%{scale:1.02}}
`;

export function installStepPresentationStyles(card: HTMLElement): void {
  const root = card.getRootNode();
  const ShadowRootConstructor = card.ownerDocument.defaultView?.ShadowRoot;
  if (
    root !== card.ownerDocument &&
    !(ShadowRootConstructor && root instanceof ShadowRootConstructor)
  ) {
    return;
  }
  const styleRoot = root as Document | ShadowRoot;
  if (styleRoot.querySelector(`style[${STEP_PRESENTATION_STYLE_ATTRIBUTE}]`)) return;
  const style = card.ownerDocument.createElement('style');
  style.setAttribute(STEP_PRESENTATION_STYLE_ATTRIBUTE, '');
  style.textContent = STEP_PRESENTATION_STYLES;
  styleRoot.appendChild(style);
}

export function positionStepMotionOrigin(
  card: HTMLElement,
  targetRect: DOMRect,
  cardPosition: { x: number; y: number },
): void {
  const cardRect = card.getBoundingClientRect();
  const cardWidth = card.offsetWidth || cardRect.width;
  const cardHeight = card.offsetHeight || cardRect.height;
  const directionX = targetRect.left + targetRect.width / 2 - cardPosition.x - cardWidth / 2;
  const directionY = targetRect.top + targetRect.height / 2 - cardPosition.y - cardHeight / 2;
  const distance = Math.hypot(directionX, directionY) || 1;
  const slideDistance = Math.min(32, distance);
  card.style.setProperty('--lq-step-slide-x', `${(directionX / distance) * slideDistance}px`);
  card.style.setProperty('--lq-step-slide-y', `${(directionY / distance) * slideDistance}px`);
  card.style.setProperty(
    '--lq-step-origin-x',
    `${clamp(targetRect.left + targetRect.width / 2 - cardPosition.x, -cardWidth, cardWidth * 2)}px`,
  );
  card.style.setProperty(
    '--lq-step-origin-y',
    `${clamp(targetRect.top + targetRect.height / 2 - cardPosition.y, -cardHeight, cardHeight * 2)}px`,
  );
}

export function restartStepEntryMotion(card: HTMLElement): void {
  if (!card.dataset['lodariqMotion']) return;
  installStepPresentationStyles(card);
  cancelCardAnimations(card);
  delete card.dataset['lodariqMotionPhase'];
  void card.offsetWidth;
  card.dataset['lodariqMotionPhase'] = 'entry';
}

export function startStepExitMotion(
  card: HTMLElement,
  step: CompiledStep,
  onComplete: () => void,
): (() => void) | null {
  if (!step.motion || card.hidden || prefersReducedStepMotion(card)) return null;
  installStepPresentationStyles(card);
  cancelCardAnimations(card);
  delete card.dataset['lodariqMotionPhase'];
  void card.offsetWidth;
  card.dataset['lodariqMotionPhase'] = 'exit';
  let settled = false;
  const settle = (): void => {
    if (settled) return;
    settled = true;
    card.removeEventListener('animationend', onAnimationEnd);
    clearTimeout(timeout);
    onComplete();
  };
  const onAnimationEnd = (event: AnimationEvent): void => {
    if (event.target === card) settle();
  };
  const timeout = setTimeout(settle, step.motion.durationMs + 50);
  card.addEventListener('animationend', onAnimationEnd);
  return () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    card.removeEventListener('animationend', onAnimationEnd);
    cancelCardAnimations(card);
  };
}

function cancelCardAnimations(card: HTMLElement): void {
  card.getAnimations?.().forEach((animation) => animation.cancel());
}

function prefersReducedStepMotion(card: HTMLElement): boolean {
  const root = card.getRootNode();
  const ShadowRootConstructor = card.ownerDocument.defaultView?.ShadowRoot;
  const host = ShadowRootConstructor && root instanceof ShadowRootConstructor ? root.host : null;
  return (
    host?.getAttribute('data-lodariq-accessibility-preview') === 'reducedMotion' ||
    Boolean(card.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
