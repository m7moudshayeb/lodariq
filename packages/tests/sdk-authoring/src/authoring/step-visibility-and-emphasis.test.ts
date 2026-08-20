import { describe, expect, it } from 'vitest';
import type { LodariqBlock } from '@lodariq/schema';
import {
  setBlockEmphasis,
  setBlockShowWhen,
} from '../../../../../packages/sdk-authoring/src/authoring/document-ops';

function blocks(): LodariqBlock[] {
  return [
    {
      id: 'step_1',
      type: 'tourStep',
      props: {},
      children: [{ id: 'tip_1', type: 'tooltip', props: {}, children: [] }],
    },
  ];
}

describe('a step’s visibility rule', () => {
  it('is set and cleared through the same call', () => {
    const withRule = setBlockShowWhen(blocks(), 'step_1', {
      source: 'identifyTrait',
      key: 'plan',
      operator: 'equals',
      value: 'growth',
    });
    expect(withRule[0]?.props.showWhen).toEqual({
      source: 'identifyTrait',
      key: 'plan',
      operator: 'equals',
      value: 'growth',
    });
    expect(setBlockShowWhen(withRule, 'step_1')[0]?.props.showWhen).toBeUndefined();
  });

  it('applies to a child block too, which is how content varies inside one step', () => {
    const next = setBlockShowWhen(blocks(), 'tip_1', { source: 'locale', locale: 'de' });
    expect(next[0]?.children[0]?.props.showWhen).toEqual({ source: 'locale', locale: 'de' });
    expect(next[0]?.props.showWhen).toBeUndefined();
  });

  it('drops a rule the contract does not recognise', () => {
    const next = setBlockShowWhen(blocks(), 'step_1', {
      source: 'phaseOfMoon',
    } as never);
    expect(next[0]?.props.showWhen).toBeUndefined();
  });
});

describe('a step’s emphasis', () => {
  it('keeps a backdrop, ring and viewport focus expressed in token roles', () => {
    const next = setBlockEmphasis(blocks(), 'step_1', {
      backdrop: { dimPercent: 55, clickBehavior: 'advance' },
      targetOutline: { colorRole: 'accent', weightPx: 3, followTargetRadius: true },
      viewportFocus: { behavior: 'scroll-into-view' },
    });
    expect(next[0]?.props.emphasis?.backdrop?.clickBehavior).toBe('advance');
    expect(next[0]?.props.emphasis?.targetOutline?.weightPx).toBe(3);
    expect(next[0]?.props.emphasis?.viewportFocus?.behavior).toBe('scroll-into-view');
  });

  it('refuses a raw colour, so ADR-0013 holds at the mutation boundary', () => {
    const next = setBlockEmphasis(blocks(), 'step_1', {
      targetOutline: { colorRole: '#6d3bf5' },
    } as never);
    expect(next[0]?.props.emphasis).toBeUndefined();
  });

  it('clears when passed nothing', () => {
    const withEmphasis = setBlockEmphasis(blocks(), 'step_1', {
      backdrop: { dimPercent: 40, clickBehavior: 'none' },
    });
    expect(setBlockEmphasis(withEmphasis, 'step_1')[0]?.props.emphasis).toBeUndefined();
  });
});
