import type { CompiledStep, ResponsiveStepOverride } from '@lodariq/schema';

export type RuntimeViewportClass = 'compact' | 'medium' | 'wide';

export function runtimeViewportClass(width: number): RuntimeViewportClass {
  if (width < 600) return 'compact';
  if (width < 1_024) return 'medium';
  return 'wide';
}

/** Resolves one closed responsive override without changing target identity. */
export function resolveResponsiveTourStep(step: CompiledStep, viewportWidth: number): CompiledStep {
  const override = step.responsive?.[runtimeViewportClass(viewportWidth)];
  if (!override) return step;
  return {
    ...step,
    ...(override.placement ? { placement: override.placement } : {}),
    tooltipLayout: responsiveTooltipLayout(step, override),
    body:
      override.mediaVisible === false
        ? step.body.filter((node) => node.type !== 'media')
        : step.body,
  };
}

export function applyStepMotion(card: HTMLElement, step: CompiledStep): void {
  if (!step.motion) {
    delete card.dataset['lodariqMotion'];
    card.style.removeProperty('--lq-step-motion-duration');
    card.style.removeProperty('--lq-step-motion-easing');
    return;
  }
  card.dataset['lodariqMotion'] = step.motion.recipe;
  card.style.setProperty('--lq-step-motion-duration', `${step.motion.durationMs}ms`);
  card.style.setProperty('--lq-step-motion-easing', motionEasing(step.motion.easing));
}

function responsiveTooltipLayout(
  step: CompiledStep,
  override: ResponsiveStepOverride,
): CompiledStep['tooltipLayout'] {
  const layout = { ...step.tooltipLayout };
  if (override.widthPx !== undefined) layout.widthPx = override.widthPx;
  if (override.actionLayout) layout.actionLayout = override.actionLayout;
  return Object.keys(layout).length ? layout : undefined;
}

function motionEasing(easing: 'standard' | 'emphasized' | 'linear'): string {
  if (easing === 'linear') return 'linear';
  return easing === 'emphasized' ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.2, 0, 0, 1)';
}
