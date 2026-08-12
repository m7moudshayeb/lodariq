import { describe, expect, it, vi } from 'vitest';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import {
  BUTTON_PROPERTY_DEFINITIONS,
  type ButtonPropertyContext,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/properties/button-properties';
import { visibleProperties } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/properties/registry';

const button: LodariqBlock = {
  id: 'button_1',
  type: 'button',
  content: 'Continue',
  props: {
    action: { type: 'openPage', url: '/next', navigationBehavior: 'continue' },
    variant: 'primary',
  },
  children: [],
};

const tooltip: LodariqBlock = {
  id: 'tooltip_1',
  type: 'tooltip',
  props: { tooltipLayout: { actionAlign: 'center' } },
  children: [button],
};

describe('button property registry', () => {
  it('owns each canonical property exactly once', () => {
    const ids = BUTTON_PROPERTY_DEFINITIONS.map((property) => property.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'button.alignment')).toHaveLength(1);
    expect(ids.filter((id) => id === 'button.fillColor')).toHaveLength(1);
  });

  it('keeps the link destination visible in the behavior group', () => {
    const context = createContext();
    const behavior = visibleProperties(BUTTON_PROPERTY_DEFINITIONS, context, 'behavior');

    expect(behavior.map((property) => property.id)).toEqual([
      'button.action',
      'button.destination',
      'button.navigationBehavior',
    ]);
    expect(behavior[1]?.read(context)).toBe('/next');
    expect(behavior[2]?.read(context)).toBe('continue');
  });

  it('routes navigation recovery through its semantic command', () => {
    const context = createContext();
    const navigationBehavior = BUTTON_PROPERTY_DEFINITIONS.find(
      (property) => property.id === 'button.navigationBehavior',
    );

    navigationBehavior?.apply(context, 'stay');

    expect(context.controller.setActionNavigationBehavior).toHaveBeenCalledWith('button_1', 'stay');
  });

  it('routes action alignment through its single semantic command', () => {
    const context = createContext();
    const alignment = BUTTON_PROPERTY_DEFINITIONS.find(
      (property) => property.id === 'button.alignment',
    );

    alignment?.apply(context, 'end');

    expect(context.controller.setActionAlignment).toHaveBeenCalledWith(
      'button_1',
      'tooltip_1',
      'end',
    );
    expect(context.controller.setContentBlockLayout).not.toHaveBeenCalled();
  });
});

function createContext(): ButtonPropertyContext {
  const controller = {
    resetButtonStyleFields: vi.fn(),
    setActionAlignment: vi.fn(),
    setActionNavigationBehavior: vi.fn(),
    setActionUrl: vi.fn(),
    setButtonAction: vi.fn(),
    setButtonStyle: vi.fn(),
    setButtonVariant: vi.fn(),
    setContentBlockLayout: vi.fn(),
  } as unknown as LocalAuthoringFrameController;
  return { block: structuredClone(button), controller, tooltip: structuredClone(tooltip) };
}
