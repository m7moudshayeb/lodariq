// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { compile } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  TOUR_STEP_INDICATOR_DOTS_MAX_STEPS as SCHEMA_DOTS_MAX_STEPS,
  type CompiledExperienceBehavior,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  TOUR_STEP_INDICATOR_DOTS_MAX_STEPS,
  attachTourStepIndicator,
  createTourStepIndicator,
  resolveTourStepIndicatorRecipe,
} from '../../../../../packages/sdk-runtime/src/renderers/tour-step-indicator';

const tourBehavior = (
  extra: Partial<Extract<CompiledExperienceBehavior, { type: 'tour' }>> = {},
): CompiledExperienceBehavior =>
  ({ type: 'tour', surface: 'popup', ...extra }) as CompiledExperienceBehavior;

const contentWithActions = (actionCount = 2): HTMLElement => {
  const content = document.createElement('div');
  content.className = 'tour-content';
  const heading = document.createElement('h2');
  content.appendChild(heading);
  const group = document.createElement('div');
  group.className = 'tour-action-group';
  for (let index = 0; index < actionCount; index += 1) {
    group.appendChild(document.createElement('button'));
  }
  content.appendChild(group);
  return content;
};

describe('resolveTourStepIndicatorRecipe', () => {
  it('keeps the pre-existing card when nothing was authored', () => {
    expect(resolveTourStepIndicatorRecipe(undefined, 5, 'inline').style).toBe('none');
    expect(resolveTourStepIndicatorRecipe(tourBehavior(), 5, 'inline').style).toBe('none');
    expect(resolveTourStepIndicatorRecipe(tourBehavior({ stepIndicator: 'none' }), 5, 'inline').style).toBe(
      'none',
    );
  });

  it('reports nothing for a tour with a single step', () => {
    expect(resolveTourStepIndicatorRecipe(tourBehavior({ stepIndicator: 'count' }), 1, 'inline').style).toBe(
      'none',
    );
  });

  it('degrades dots to a count once a dot row stops being readable', () => {
    const behavior = tourBehavior({ stepIndicator: 'dots' });
    expect(resolveTourStepIndicatorRecipe(behavior, TOUR_STEP_INDICATOR_DOTS_MAX_STEPS, 'inline').style).toBe(
      'dots',
    );
    expect(
      resolveTourStepIndicatorRecipe(behavior, TOUR_STEP_INDICATOR_DOTS_MAX_STEPS + 1, 'inline').style,
    ).toBe('count');
  });

  it('falls back to its own line when the actions are stacked full-width rows', () => {
    const behavior = tourBehavior({ stepIndicator: 'count', stepIndicatorPlacement: 'inline' });
    expect(resolveTourStepIndicatorRecipe(behavior, 4, 'inline').placement).toBe('inline');
    expect(resolveTourStepIndicatorRecipe(behavior, 4, 'stack').placement).toBe('block');
  });

  it('defaults placement to block and wording to the bare form', () => {
    const recipe = resolveTourStepIndicatorRecipe(tourBehavior({ stepIndicator: 'count' }), 4, 'inline');
    expect(recipe).toEqual({ style: 'count', placement: 'block', countForm: 'bare' });
  });

  it('mirrors the schema dot ceiling, which the runtime copies to avoid a barrel import', () => {
    expect(TOUR_STEP_INDICATOR_DOTS_MAX_STEPS).toBe(SCHEMA_DOTS_MAX_STEPS);
  });
});

describe('createTourStepIndicator', () => {
  it('renders both count wordings', () => {
    const bare = createTourStepIndicator(
      document,
      { style: 'count', placement: 'block', countForm: 'bare' },
      1,
      5,
    );
    expect(bare?.textContent).toBe('2 of 5');
    const labeled = createTourStepIndicator(
      document,
      { style: 'count', placement: 'block', countForm: 'labeled' },
      1,
      5,
    );
    expect(labeled?.textContent).toBe('Step 2 of 5');
  });

  it('marks every dot done, current or todo', () => {
    const element = createTourStepIndicator(
      document,
      { style: 'dots', placement: 'block', countForm: 'bare' },
      2,
      5,
    );
    const states = [...(element?.querySelectorAll('.tour-progress-dot') ?? [])].map(
      (dot) => (dot as HTMLElement).dataset['lodariqStepState'],
    );
    expect(states).toEqual(['done', 'done', 'current', 'todo', 'todo']);
  });

  it('fills the bar to the current position', () => {
    const element = createTourStepIndicator(
      document,
      { style: 'bar', placement: 'block', countForm: 'bare' },
      1,
      5,
    );
    expect(element?.querySelector<HTMLElement>('.tour-progress-fill')?.style.width).toBe('40%');
  });

  it('stays out of the accessibility tree, because the live region already announces position', () => {
    const element = createTourStepIndicator(
      document,
      { style: 'count', placement: 'block', countForm: 'bare' },
      0,
      3,
    );
    expect(element?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders nothing for the none style', () => {
    expect(
      createTourStepIndicator(document, { style: 'none', placement: 'block', countForm: 'bare' }, 0, 3),
    ).toBeNull();
  });
});

describe('attachTourStepIndicator', () => {
  it('wraps the action group in a footer for inline placement, leaving the group marker intact', () => {
    const content = contentWithActions();
    const indicator = document.createElement('div');
    indicator.className = 'tour-progress';
    attachTourStepIndicator(content, indicator, 'inline');

    const footer = content.querySelector('.tour-footer');
    expect(footer).not.toBeNull();
    expect(footer?.firstElementChild).toBe(indicator);
    expect(footer?.lastElementChild?.className).toBe('tour-action-group');
    // Creator tooling and the existing renderer test both bind to this.
    expect(content.querySelector('button')?.parentElement?.className).toBe('tour-action-group');
  });

  it('puts the indicator on its own line above the actions for block placement', () => {
    const content = contentWithActions();
    const indicator = document.createElement('div');
    attachTourStepIndicator(content, indicator, 'block');

    expect(content.querySelector('.tour-footer')).toBeNull();
    expect(indicator.nextElementSibling?.className).toBe('tour-action-group');
  });

  it('appends to the card when a step has no actions at all', () => {
    const content = document.createElement('div');
    content.appendChild(document.createElement('p'));
    const indicator = document.createElement('div');
    attachTourStepIndicator(content, indicator, 'inline');

    expect(content.lastElementChild).toBe(indicator);
    expect(content.querySelector('.tour-footer')).toBeNull();
  });
});

describe('compiler pass-through', () => {
  it('carries the authored indicator into the delivery artifact', () => {
    const compiled = compile({
      document: {
        ...(tourFixture as LodariqDocument),
        experience: {
          type: 'tour',
          stepIndicator: 'dots',
          stepIndicatorPlacement: 'inline',
          stepIndicatorCountForm: 'labeled',
        },
      } as LodariqDocument,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });

    expect(compiled.experience).toEqual({
      type: 'tour',
      surface: 'popup',
      stepIndicator: 'dots',
      stepIndicatorPlacement: 'inline',
      stepIndicatorCountForm: 'labeled',
    });
  });

  it('still compiles a tour authored before the field existed', () => {
    const compiled = compile({
      document: { ...(tourFixture as LodariqDocument), experience: { type: 'tour' } } as LodariqDocument,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    expect(compiled.experience).toEqual({ type: 'tour', surface: 'popup' });
  });
});
