// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  createFilmstrip,
  renderFilmstripSteps,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/filmstrip';

/** The fixture ships one step; multi-select needs several. */
function documentState(stepCount = 3): LodariqDocument {
  const base = structuredClone(tourFixture) as LodariqDocument;
  const template = base.blocks.find((block) => block.type === 'tourStep');
  if (!template) throw new Error('Tour fixture has no step');
  const steps = Array.from({ length: stepCount }, (_unused, index) => {
    const step = structuredClone(template);
    step.id = `step_${index + 1}`;
    step.props = { ...step.props, index };
    return step;
  });
  return {
    ...base,
    blocks: [...steps, ...base.blocks.filter((block) => block.type !== 'tourStep')],
  };
}

describe('filmstrip step state and multi-select (§4.5)', () => {
  let filmstrip: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    filmstrip = createFilmstrip(document);
    document.body.append(filmstrip);
  });

  it('carries a state dot per step rather than colour alone', () => {
    renderFilmstripSteps(filmstrip, documentState(), null);
    const steps = [...filmstrip.querySelectorAll<HTMLElement>('.overlay-filmstrip-step')];
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      // Four states (§4.5), not two: a step whose target exists reads
      // differently from one whose target is simply on another screen, and
      // collapsing those into "targeted" hid the only one worth acting on.
      expect(step.dataset['targetState']).toMatch(/^(ok|ctx|bad|draft)$/u);
      // The number is the label; the dot only qualifies it.
      expect(step.textContent?.trim()).not.toBe('');
      expect(step.getAttribute('aria-label')).toContain('step');
    }
  });

  it('marks the batch selection and announces it', () => {
    const state = documentState();
    const steps = state.blocks.filter((block) => block.type === 'tourStep');
    const selected = [steps[0]!.id, steps[1]!.id];
    renderFilmstripSteps(filmstrip, state, steps[0]!.id, new Set(selected));

    const rendered = [...filmstrip.querySelectorAll<HTMLElement>('.overlay-filmstrip-step')];
    expect(rendered[0]?.dataset['batchSelected']).toBe('true');
    expect(rendered[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(rendered[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(rendered[2]?.getAttribute('aria-pressed')).toBe('false');
    expect(rendered[2]?.dataset['batchSelected']).toBeUndefined();
  });

  it('keeps the active step distinct from the batch selection', () => {
    const state = documentState();
    const steps = state.blocks.filter((block) => block.type === 'tourStep');
    renderFilmstripSteps(filmstrip, state, steps[1]!.id, new Set([steps[0]!.id]));
    const rendered = [...filmstrip.querySelectorAll<HTMLElement>('.overlay-filmstrip-step')];
    expect(rendered[1]?.getAttribute('aria-current')).toBe('step');
    expect(rendered[1]?.getAttribute('aria-pressed')).toBe('false');
    expect(rendered[0]?.getAttribute('aria-current')).toBe('false');
    expect(rendered[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('is step order only — Operations and Close moved to the pill', () => {
    expect(filmstrip.querySelector('[data-filmstrip-operations]')).toBeNull();
    expect(filmstrip.querySelector('[data-filmstrip-close]')).toBeNull();
    expect(filmstrip.querySelector('[data-filmstrip-add-step]')).not.toBeNull();
  });
});
