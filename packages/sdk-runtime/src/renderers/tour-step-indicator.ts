import type { CompiledExperienceBehavior } from '@lodariq/schema';
import { tourRuntimeText } from '../tour-i18n';

/**
 * Mirror of `TOUR_STEP_INDICATOR_DOTS_MAX_STEPS` in `@lodariq/schema`.
 *
 * It is duplicated rather than imported because the schema barrel is a value
 * import, and the delivered runtime bundle is size-budgeted. The duplication is
 * held honest by a unit test that asserts the two constants stay equal.
 */
export const TOUR_STEP_INDICATOR_DOTS_MAX_STEPS = 8;

export type TourStepIndicatorStyle = 'none' | 'count' | 'dots' | 'bar';
export type TourStepIndicatorPlacement = 'block' | 'inline';
export type TourStepIndicatorCountForm = 'bare' | 'labeled';

export interface TourStepIndicatorRecipe {
  style: TourStepIndicatorStyle;
  placement: TourStepIndicatorPlacement;
  countForm: TourStepIndicatorCountForm;
}

const NO_INDICATOR: TourStepIndicatorRecipe = {
  style: 'none',
  placement: 'block',
  countForm: 'bare',
};

/**
 * Resolves what the card should actually draw, which is not always what was
 * authored: a dot row past the ceiling reports as a count instead of shrinking
 * until the dots merge, a one-step tour has no position worth reporting, and
 * stacked actions are full-width rows that nothing can share a line with.
 */
export function resolveTourStepIndicatorRecipe(
  behavior: CompiledExperienceBehavior | undefined,
  totalSteps: number,
  actionLayout: 'inline' | 'stack',
): TourStepIndicatorRecipe {
  if (!behavior || behavior.type !== 'tour') return NO_INDICATOR;
  const requested = behavior.stepIndicator ?? 'none';
  if (requested === 'none' || totalSteps < 2) return NO_INDICATOR;
  const style =
    requested === 'dots' && totalSteps > TOUR_STEP_INDICATOR_DOTS_MAX_STEPS ? 'count' : requested;
  const placement = actionLayout === 'stack' ? 'block' : (behavior.stepIndicatorPlacement ?? 'block');
  return { style, placement, countForm: behavior.stepIndicatorCountForm ?? 'bare' };
}

export function tourStepIndicatorCountText(
  current: number,
  total: number,
  form: TourStepIndicatorCountForm,
): string {
  return form === 'labeled'
    ? tourRuntimeText('Step {current} of {total}', { current, total })
    : tourRuntimeText('{current} of {total}', { current, total });
}

/**
 * The indicator is `aria-hidden`: the card's live region already announces the
 * step position on every change, so exposing this too would double-announce it.
 */
export function createTourStepIndicator(
  ownerDocument: Document,
  recipe: TourStepIndicatorRecipe,
  currentIndex: number,
  totalSteps: number,
): HTMLElement | null {
  if (recipe.style === 'none' || totalSteps < 2) return null;
  const current = Math.min(Math.max(currentIndex + 1, 1), totalSteps);
  const element = ownerDocument.createElement('div');
  element.className = 'tour-progress';
  element.dataset['lodariqStepIndicator'] = recipe.style;
  element.setAttribute('aria-hidden', 'true');

  if (recipe.style === 'count') {
    element.textContent = tourStepIndicatorCountText(current, totalSteps, recipe.countForm);
    return element;
  }

  if (recipe.style === 'dots') {
    for (let position = 1; position <= totalSteps; position += 1) {
      const dot = ownerDocument.createElement('span');
      dot.className = 'tour-progress-dot';
      dot.dataset['lodariqStepState'] =
        position === current ? 'current' : position < current ? 'done' : 'todo';
      element.appendChild(dot);
    }
    return element;
  }

  const track = ownerDocument.createElement('span');
  track.className = 'tour-progress-track';
  const fill = ownerDocument.createElement('span');
  fill.className = 'tour-progress-fill';
  fill.style.width = `${Math.round((current / totalSteps) * 100)}%`;
  track.appendChild(fill);
  element.appendChild(track);
  return element;
}

/**
 * Placement never reaches inside `.tour-action-group`: creator tooling binds to
 * that marker, the group wraps, and its justification is already spoken for by
 * `actionAlign`. Inline placement wraps the group in a footer row instead, so
 * the two stay independent.
 */
export function attachTourStepIndicator(
  content: HTMLElement,
  indicator: HTMLElement,
  placement: TourStepIndicatorPlacement,
): void {
  const groups = content.querySelectorAll<HTMLElement>('.tour-action-group');
  const actionGroup = groups.length > 0 ? groups[groups.length - 1] : null;
  if (!actionGroup?.parentElement) {
    content.appendChild(indicator);
    return;
  }
  if (placement !== 'inline') {
    actionGroup.parentElement.insertBefore(indicator, actionGroup);
    return;
  }
  const footer = content.ownerDocument.createElement('div');
  footer.className = 'tour-footer';
  actionGroup.replaceWith(footer);
  footer.appendChild(indicator);
  footer.appendChild(actionGroup);
}
