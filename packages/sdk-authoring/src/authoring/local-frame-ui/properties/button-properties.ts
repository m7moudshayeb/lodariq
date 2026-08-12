import {
  BLOCK_SPACING_PX_LIMITS,
  type ButtonStyleProps,
  type LodariqBlock,
  type TooltipLayoutProps,
} from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { EDITABLE_ACTION_OPTIONS, EDITABLE_BUTTON_VARIANT_OPTIONS } from '../types';
import { BLOCK_ALIGNMENT_OPTIONS } from './options';
import type { PropertyDefinition } from './registry';

export type ButtonPropertyGroup =
  'appearance' | 'behavior' | 'size' | 'alignment' | 'shape' | 'colors' | 'spacing';

export interface ButtonPropertyContext {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  tooltip: LodariqBlock;
}

const BUTTON_WIDTH_OPTIONS = [
  { value: 'hug', label: 'Hug' },
  { value: 'fill', label: 'Fill' },
] as const;

const BUTTON_SIZE_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'regular', label: 'Regular' },
] as const;

const BUTTON_RADIUS_OPTIONS = [
  { value: 'theme', label: 'Brand' },
  { value: 'square', label: 'Square' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Pill' },
] as const;

const BUTTON_ICON_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'arrow-right', label: 'Arrow' },
  { value: 'external-link', label: 'External' },
  { value: 'check', label: 'Check' },
] as const;

const BUTTON_ICON_PLACEMENT_OPTIONS = [
  { value: 'start', label: 'Before' },
  { value: 'end', label: 'After' },
] as const;

const OPEN_PAGE_NAVIGATION_OPTIONS = [
  { value: 'continue', label: 'Continue tour' },
  { value: 'stay', label: 'Keep current step' },
] as const;

export const BUTTON_PROPERTY_DEFINITIONS: ReadonlyArray<PropertyDefinition<ButtonPropertyContext>> =
  [
    {
      id: 'button.variant',
      group: 'appearance',
      label: 'Appearance',
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
      label: 'Action',
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
      label: 'Destination',
      description: 'Use an HTTPS URL or a safe relative path.',
      scope: 'block',
      control: 'text',
      isVisible: ({ block }) => block.props.action?.type === 'openPage',
      read: ({ block }) => block.props.action?.url ?? '',
      apply: ({ block, controller }, value) => {
        if (typeof value === 'string') controller.setActionUrl(block.id, value);
      },
    },
    {
      id: 'button.navigationBehavior',
      group: 'behavior',
      label: 'After navigation',
      description: 'Continue applies to same-origin navigation in this tab.',
      scope: 'block',
      control: 'segmented',
      options: OPEN_PAGE_NAVIGATION_OPTIONS,
      isVisible: ({ block }) => block.props.action?.type === 'openPage',
      read: ({ block }) => block.props.action?.navigationBehavior ?? 'stay',
      apply: ({ block, controller }, value) => {
        if (!isOptionValue(OPEN_PAGE_NAVIGATION_OPTIONS, value)) return;
        controller.setActionNavigationBehavior(block.id, value);
      },
    },
    {
      id: 'button.width',
      group: 'size',
      label: 'Width',
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
      label: 'Size',
      scope: 'block',
      control: 'segmented',
      options: BUTTON_SIZE_OPTIONS,
      read: ({ block }) => block.props.buttonStyle?.size ?? 'regular',
      apply: ({ block, controller }, value) => {
        if (isOptionValue(BUTTON_SIZE_OPTIONS, value))
          controller.setButtonStyle(block.id, { size: value });
      },
    },
    {
      id: 'button.alignment',
      group: 'alignment',
      label: 'Alignment',
      scope: 'surface',
      control: 'segmented',
      options: BLOCK_ALIGNMENT_OPTIONS,
      quick: true,
      read: ({ block, tooltip }) =>
        tooltip.props.tooltipLayout?.actionAlign ?? block.props.blockLayout?.align ?? 'start',
      apply: ({ block, controller, tooltip }, value) => {
        if (!isOptionValue(BLOCK_ALIGNMENT_OPTIONS, value)) return;
        controller.setActionAlignment(block.id, tooltip.id, value);
      },
    },
    ...buttonStyleDefinitions(),
    {
      id: 'button.spacingAfter',
      group: 'spacing',
      label: 'After this button',
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
      'Corner radius',
      'radius',
      'theme',
      BUTTON_RADIUS_OPTIONS,
    ),
    buttonStyleOption('button.icon', 'shape', 'Icon', 'icon', 'none', BUTTON_ICON_OPTIONS),
    buttonStyleOption(
      'button.iconPlacement',
      'shape',
      'Icon position',
      'iconPlacement',
      'end',
      BUTTON_ICON_PLACEMENT_OPTIONS,
    ),
    buttonColor('button.fillColor', 'Fill', 'fillColor', '#006b58'),
    buttonColor('button.textColor', 'Label', 'textColor', '#ffffff'),
    buttonColor('button.borderColor', 'Border', 'borderColor', '#006b58'),
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
  return widthPx ? `Custom ${widthPx}px · resize directly on the canvas` : null;
}

export function buttonColorIsCustomized(block: LodariqBlock, propertyId: string): boolean {
  const field = propertyId.replace('button.', '') as keyof ButtonStyleProps;
  return block.props.buttonStyle?.[field] !== undefined;
}

export function actionAlignmentValue(
  block: LodariqBlock,
  tooltip: LodariqBlock,
): NonNullable<TooltipLayoutProps['actionAlign']> {
  return tooltip.props.tooltipLayout?.actionAlign ?? block.props.blockLayout?.align ?? 'start';
}
