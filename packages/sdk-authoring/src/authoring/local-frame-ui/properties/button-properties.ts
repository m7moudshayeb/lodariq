import {
  BLOCK_SPACING_PX_LIMITS,
  type ButtonStyleProps,
  type LodariqBlock,
  CONTRAST_RATIO_TARGETS,
  evaluateContrast,
  type ContrastEvaluation,
} from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { EDITABLE_ACTION_OPTIONS, EDITABLE_BUTTON_VARIANT_OPTIONS } from '../types';
import type { PropertyDefinition } from './registry';
import { authoringText } from '../../../i18n';

export type ButtonPropertyGroup =
  'appearance' | 'behavior' | 'size' | 'shape' | 'colors' | 'spacing';

export interface ButtonPropertyContext {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  tooltip: LodariqBlock;
}

const BUTTON_WIDTH_OPTIONS = [
  { value: 'hug', label: authoringText('Hug') },
  { value: 'fill', label: authoringText('Fill') },
] as const;

const BUTTON_SIZE_OPTIONS = [
  { value: 'compact', label: authoringText('Compact') },
  { value: 'regular', label: authoringText('Regular') },
] as const;

const BUTTON_RADIUS_OPTIONS = [
  { value: 'theme', label: authoringText('Brand') },
  { value: 'square', label: authoringText('Square') },
  { value: 'soft', label: authoringText('Soft') },
  { value: 'round', label: authoringText('Pill') },
] as const;

const BUTTON_ICON_OPTIONS = [
  { value: 'none', label: authoringText('None') },
  { value: 'arrow-right', label: authoringText('Arrow') },
  { value: 'external-link', label: authoringText('External') },
  { value: 'check', label: authoringText('Check') },
] as const;

const BUTTON_ICON_PLACEMENT_OPTIONS = [
  { value: 'start', label: authoringText('Before') },
  { value: 'end', label: authoringText('After') },
] as const;

const OPEN_PAGE_NAVIGATION_OPTIONS = [
  { value: 'continue', label: authoringText('Continue tour') },
  { value: 'stay', label: authoringText('Keep current step') },
] as const;

export const BUTTON_PROPERTY_DEFINITIONS: ReadonlyArray<PropertyDefinition<ButtonPropertyContext>> =
  [
    {
      id: 'button.variant',
      group: 'appearance',
      label: authoringText('Appearance'),
      scope: 'block',
      control: 'segmented',
      options: EDITABLE_BUTTON_VARIANT_OPTIONS,
      read: ({ block }) => block.props.variant ?? defaultActionVariant(block),
      apply: ({ block, controller }, value) => {
        if (!isOptionValue(EDITABLE_BUTTON_VARIANT_OPTIONS, value)) return;
        controller.setButtonVariant(block.id, value);
      },
    },
    {
      id: 'button.action',
      group: 'behavior',
      label: authoringText('Action'),
      scope: 'block',
      control: 'segmented',
      options: EDITABLE_ACTION_OPTIONS,
      read: ({ block }) => block.props.action?.type ?? '',
      apply: ({ block, controller }, value) => {
        if (!isOptionValue(EDITABLE_ACTION_OPTIONS, value)) return;
        controller.setButtonAction(block.id, value);
      },
    },
    {
      id: 'button.destination',
      group: 'behavior',
      label: authoringText('Destination'),
      description: authoringText('Use an HTTPS URL or a safe relative path.'),
      scope: 'block',
      control: 'text',
      isVisible: ({ block }) => block.props.action?.type === 'openPage',
      read: ({ block }) =>
        block.props.action?.type === 'openPage' ? (block.props.action.url ?? '') : '',
      apply: ({ block, controller }, value) => {
        if (typeof value === 'string') controller.setActionUrl(block.id, value);
      },
    },
    {
      id: 'button.navigationBehavior',
      group: 'behavior',
      label: authoringText('After navigation'),
      description: authoringText('Continue applies to same-origin navigation in this tab.'),
      scope: 'block',
      control: 'segmented',
      options: OPEN_PAGE_NAVIGATION_OPTIONS,
      isVisible: ({ block }) => block.props.action?.type === 'openPage',
      read: ({ block }) =>
        block.props.action?.type === 'openPage'
          ? (block.props.action.navigationBehavior ?? 'stay')
          : 'stay',
      apply: ({ block, controller }, value) => {
        if (!isOptionValue(OPEN_PAGE_NAVIGATION_OPTIONS, value)) return;
        controller.setActionNavigationBehavior(block.id, value);
      },
    },
    {
      id: 'button.width',
      group: 'size',
      label: authoringText('Width'),
      scope: 'block',
      control: 'segmented',
      options: BUTTON_WIDTH_OPTIONS,
      quick: true,
      read: ({ block }) =>
        block.props.buttonStyle?.widthPx ? 'custom' : (block.props.buttonStyle?.width ?? 'hug'),
      apply: ({ block, controller }, value) => {
        if (!isOptionValue(BUTTON_WIDTH_OPTIONS, value)) return;
        controller.setButtonStyle(block.id, { width: value, widthPx: undefined });
      },
    },
    {
      id: 'button.size',
      group: 'size',
      label: authoringText('Size'),
      scope: 'block',
      control: 'segmented',
      options: BUTTON_SIZE_OPTIONS,
      read: ({ block }) => block.props.buttonStyle?.size ?? 'regular',
      apply: ({ block, controller }, value) => {
        if (isOptionValue(BUTTON_SIZE_OPTIONS, value))
          controller.setButtonStyle(block.id, { size: value });
      },
    },
    ...buttonStyleDefinitions(),
    {
      id: 'button.spacingAfter',
      group: 'spacing',
      label: authoringText('After this button'),
      scope: 'block',
      control: 'range',
      min: BLOCK_SPACING_PX_LIMITS.min,
      max: BLOCK_SPACING_PX_LIMITS.max,
      step: BLOCK_SPACING_PX_LIMITS.step,
      unit: 'px',
      read: ({ block }) => blockSpacingAfterPx(block),
      apply: ({ block, controller }, value) => {
        if (typeof value !== 'number') return;
        controller.setContentBlockLayout(block.id, { spacingAfterPx: value });
      },
    },
  ];

function buttonStyleDefinitions(): ReadonlyArray<PropertyDefinition<ButtonPropertyContext>> {
  return [
    buttonStyleOption(
      'button.radius',
      'shape',
      authoringText('Corner radius'),
      'radius',
      'theme',
      BUTTON_RADIUS_OPTIONS,
    ),
    buttonStyleOption(
      'button.icon',
      'shape',
      authoringText('Icon'),
      'icon',
      'none',
      BUTTON_ICON_OPTIONS,
    ),
    buttonStyleOption(
      'button.iconPlacement',
      'shape',
      authoringText('Icon position'),
      'iconPlacement',
      'end',
      BUTTON_ICON_PLACEMENT_OPTIONS,
    ),
    buttonColor('button.fillColor', authoringText('Fill'), 'fillColor', '#006b58'),
    buttonColor('button.textColor', authoringText('Label'), 'textColor', '#ffffff'),
    buttonColor('button.borderColor', authoringText('Border'), 'borderColor', '#006b58'),
  ];
}

function buttonStyleOption(
  id: string,
  group: ButtonPropertyGroup,
  label: string,
  field: keyof ButtonStyleProps,
  fallback: string,
  options: ReadonlyArray<{ value: string; label: string }>,
): PropertyDefinition<ButtonPropertyContext> {
  return {
    id,
    group,
    label,
    scope: 'block',
    control: 'segmented',
    options,
    read: ({ block }) => String(block.props.buttonStyle?.[field] ?? fallback),
    apply: ({ block, controller }, value) => {
      if (!isOptionValue(options, value)) return;
      controller.setButtonStyle(block.id, { [field]: value });
    },
  };
}

function buttonColor(
  id: string,
  label: string,
  field: 'borderColor' | 'fillColor' | 'textColor',
  fallback: string,
): PropertyDefinition<ButtonPropertyContext> {
  return {
    id,
    group: 'colors',
    label,
    scope: 'block',
    control: 'color',
    read: ({ block }) => block.props.buttonStyle?.[field] ?? fallback,
    apply: ({ block, controller }, value) => {
      if (typeof value === 'string') controller.setButtonStyle(block.id, { [field]: value });
    },
    reset: ({ block, controller }) => controller.resetButtonStyleFields(block.id, [field]),
  };
}

function isOptionValue<Value extends string>(
  options: ReadonlyArray<{ value: Value }>,
  value: unknown,
): value is Value {
  return typeof value === 'string' && options.some((option) => option.value === value);
}

function blockSpacingAfterPx(block: LodariqBlock): number {
  const layout = block.props.blockLayout;
  if (layout?.spacingAfterPx !== undefined) return layout.spacingAfterPx;
  return { none: 0, tight: 8, normal: 16, relaxed: 24 }[layout?.spacingAfter ?? 'normal'];
}

export function defaultActionVariant(block: LodariqBlock): 'primary' | 'link' {
  return block.type === 'link' ? 'link' : 'primary';
}

export function buttonWidthDescription(block: LodariqBlock): string | null {
  const widthPx = block.props.buttonStyle?.widthPx;
  return widthPx
    ? authoringText('Custom {width}px · resize directly on the canvas', { width: widthPx })
    : null;
}

export function buttonColorIsCustomized(block: LodariqBlock, propertyId: string): boolean {
  const field = propertyId.replace('button.', '') as keyof ButtonStyleProps;
  return block.props.buttonStyle?.[field] !== undefined;
}

export function buttonColorContrast(block: LodariqBlock, propertyId: string): ContrastEvaluation {
  const style = block.props.buttonStyle;
  const fill = style?.fillColor ?? '#006b58';
  const text = style?.textColor ?? '#ffffff';
  const border = style?.borderColor ?? fill;
  if (propertyId === 'button.borderColor') {
    return evaluateContrast(
      border,
      fill,
      CONTRAST_RATIO_TARGETS.focus,
      CONTRAST_RATIO_TARGETS.focusUnusable,
    );
  }
  return evaluateContrast(
    text,
    fill,
    CONTRAST_RATIO_TARGETS.text,
    CONTRAST_RATIO_TARGETS.textUnusable,
  );
}
