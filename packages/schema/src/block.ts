import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { BlockDiagnostic, ValidationLevel } from './common';
import { isSafeNavigationUrl } from './url';

export const LodariqBlockType = Type.Union(
  [
    // Text / content
    Type.Literal('paragraph'),
    Type.Literal('heading'),
    Type.Literal('list'),
    Type.Literal('divider'),
    // Media
    Type.Literal('media'),
    // Action
    Type.Literal('button'),
    Type.Literal('link'),
    // Experience
    Type.Literal('tourStep'),
    Type.Literal('tooltip'),
    Type.Literal('spotlight'),
    // Product connection (chips / badges)
    Type.Literal('targetChip'),
    Type.Literal('validationBadge'),
  ],
  { $id: 'LodariqBlockType' },
);
export type LodariqBlockType = Static<typeof LodariqBlockType>;

export const BLOCK_ACTION_TYPES = [
  'next',
  'back',
  'complete',
  'dismiss',
  'clickTarget',
  'openPage',
] as const;
export type BlockActionTypeValue = (typeof BLOCK_ACTION_TYPES)[number];

export const OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES = ['stay', 'continue'] as const;
export type OpenPageNavigationBehavior = (typeof OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES)[number];

const BLOCK_ACTION_TYPE_SET = new Set<string>(BLOCK_ACTION_TYPES);
const OPEN_PAGE_ACTION_TYPE: BlockActionTypeValue = 'openPage';
const OPEN_PAGE_NAVIGATION_BEHAVIOR_SET = new Set<string>(OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES);
const HEADING_LEVEL_VALUES = [1, 2, 3] as const;
const HEADING_LEVEL_SET = new Set<number>(HEADING_LEVEL_VALUES);
const PLACEMENT_VALUES = ['top', 'right', 'bottom', 'left'] as const;
const PLACEMENT_SET = new Set<string>(PLACEMENT_VALUES);
export const BUTTON_VARIANT_VALUES = ['primary', 'secondary', 'subtle', 'outline', 'link'] as const;
const BUTTON_VARIANT_SET = new Set<string>(BUTTON_VARIANT_VALUES);
export const TEXT_ALIGNMENT_VALUES = ['left', 'center', 'right'] as const;
const TEXT_ALIGNMENT_SET = new Set<string>(TEXT_ALIGNMENT_VALUES);
export const TEXT_FONT_SIZE_VALUES = [10, 12, 14, 16, 18, 24, 28, 32] as const;
const TEXT_FONT_SIZE_SET = new Set<number>(TEXT_FONT_SIZE_VALUES);
export const INLINE_TEXT_MARK_VALUES = ['bold', 'italic', 'underline'] as const;
const INLINE_TEXT_MARK_SET = new Set<string>(INLINE_TEXT_MARK_VALUES);
export const BLOCK_ALIGNMENT_VALUES = ['start', 'center', 'end', 'stretch'] as const;
const BLOCK_ALIGNMENT_SET = new Set<string>(BLOCK_ALIGNMENT_VALUES);
export const BLOCK_SPACING_VALUES = ['none', 'tight', 'normal', 'relaxed'] as const;
const BLOCK_SPACING_SET = new Set<string>(BLOCK_SPACING_VALUES);
export const BLOCK_SPACING_PX_LIMITS = { min: 0, max: 24, step: 2 } as const;
export const BUTTON_WIDTH_VALUES = ['hug', 'fill'] as const;
const BUTTON_WIDTH_SET = new Set<string>(BUTTON_WIDTH_VALUES);
export const BUTTON_WIDTH_PX_LIMITS = { min: 80, max: 480, step: 4 } as const;
export const BUTTON_SIZE_VALUES = ['compact', 'regular'] as const;
const BUTTON_SIZE_SET = new Set<string>(BUTTON_SIZE_VALUES);
export const BUTTON_RADIUS_VALUES = ['theme', 'square', 'soft', 'round'] as const;
const BUTTON_RADIUS_SET = new Set<string>(BUTTON_RADIUS_VALUES);
export const BUTTON_ICON_VALUES = ['none', 'arrow-right', 'external-link', 'check'] as const;
const BUTTON_ICON_SET = new Set<string>(BUTTON_ICON_VALUES);
export const BUTTON_ICON_PLACEMENT_VALUES = ['start', 'end'] as const;
const BUTTON_ICON_PLACEMENT_SET = new Set<string>(BUTTON_ICON_PLACEMENT_VALUES);
export const TOOLTIP_WIDTH_PX_LIMITS = { min: 240, max: 720, step: 4 } as const;
export const TOOLTIP_HEIGHT_PX_LIMITS = { min: 160, max: 640, step: 4 } as const;
export const TOOLTIP_ACTION_LAYOUT_VALUES = ['inline', 'stack'] as const;
const TOOLTIP_ACTION_LAYOUT_SET = new Set<string>(TOOLTIP_ACTION_LAYOUT_VALUES);
export const TOOLTIP_PADDING_VALUES = ['compact', 'standard', 'relaxed'] as const;
const TOOLTIP_PADDING_SET = new Set<string>(TOOLTIP_PADDING_VALUES);
export const TOOLTIP_RADIUS_VALUES = ['theme', 'square', 'soft', 'round'] as const;
const TOOLTIP_RADIUS_SET = new Set<string>(TOOLTIP_RADIUS_VALUES);
const TEXT_COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';
const INLINE_TEXT_RUN_LIMIT = 256;
const INLINE_TEXT_RUN_LENGTH_LIMIT = 10_000;
const PRESENTATION_RATIO_BOUNDS = { minimum: 0, maximum: 1 } as const;
const PRESENTATION_REGION_SIZE_BOUNDS = { exclusiveMinimum: 0, maximum: 1 } as const;

export const BlockActionProps = Type.Object(
  {
    type: Type.Union([
      Type.Literal('next'),
      Type.Literal('back'),
      Type.Literal('complete'),
      Type.Literal('dismiss'),
      Type.Literal('clickTarget'),
      Type.Literal('openPage'),
    ]),
    url: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
    navigationBehavior: Type.Optional(
      Type.Union(OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES.map((value) => Type.Literal(value))),
    ),
  },
  { $id: 'BlockActionProps', additionalProperties: false },
);
export type BlockActionProps = Static<typeof BlockActionProps>;

/** Safe block-level typography controls for structured rich-text authoring. */
export const TextStyleProps = Type.Object(
  {
    align: Type.Optional(Type.Union(TEXT_ALIGNMENT_VALUES.map((value) => Type.Literal(value)))),
    fontSizePx: Type.Optional(
      Type.Union(TEXT_FONT_SIZE_VALUES.map((value) => Type.Literal(value))),
    ),
    color: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    fontWeight: Type.Optional(
      Type.Union([Type.Literal(400), Type.Literal(500), Type.Literal(600), Type.Literal(700)]),
    ),
    fontStyle: Type.Optional(Type.Union([Type.Literal('normal'), Type.Literal('italic')])),
  },
  { $id: 'TextStyleProps', additionalProperties: false },
);
export type TextStyleProps = Static<typeof TextStyleProps>;

export const InlineTextRun = Type.Object(
  {
    text: Type.String({ maxLength: INLINE_TEXT_RUN_LENGTH_LIMIT }),
    marks: Type.Optional(
      Type.Array(Type.Union(INLINE_TEXT_MARK_VALUES.map((value) => Type.Literal(value))), {
        maxItems: INLINE_TEXT_MARK_VALUES.length,
        uniqueItems: true,
      }),
    ),
    fontSizePx: Type.Optional(
      Type.Union(TEXT_FONT_SIZE_VALUES.map((value) => Type.Literal(value))),
    ),
    color: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    highlightColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    link: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
  },
  { $id: 'InlineTextRun', additionalProperties: false },
);
export type InlineTextRun = Static<typeof InlineTextRun>;

export const BlockLayoutProps = Type.Object(
  {
    align: Type.Optional(Type.Union(BLOCK_ALIGNMENT_VALUES.map((value) => Type.Literal(value)))),
    spacingBefore: Type.Optional(
      Type.Union(BLOCK_SPACING_VALUES.map((value) => Type.Literal(value))),
    ),
    spacingAfter: Type.Optional(
      Type.Union(BLOCK_SPACING_VALUES.map((value) => Type.Literal(value))),
    ),
    spacingAfterPx: Type.Optional(
      Type.Integer({
        minimum: BLOCK_SPACING_PX_LIMITS.min,
        maximum: BLOCK_SPACING_PX_LIMITS.max,
        multipleOf: BLOCK_SPACING_PX_LIMITS.step,
      }),
    ),
  },
  { $id: 'BlockLayoutProps', additionalProperties: false },
);
export type BlockLayoutProps = Static<typeof BlockLayoutProps>;

/** Per-action presentation. Interaction states remain renderer-derived and accessible. */
export const ButtonStyleProps = Type.Object(
  {
    width: Type.Optional(Type.Union(BUTTON_WIDTH_VALUES.map((value) => Type.Literal(value)))),
    widthPx: Type.Optional(
      Type.Integer({
        minimum: BUTTON_WIDTH_PX_LIMITS.min,
        maximum: BUTTON_WIDTH_PX_LIMITS.max,
        multipleOf: BUTTON_WIDTH_PX_LIMITS.step,
      }),
    ),
    size: Type.Optional(Type.Union(BUTTON_SIZE_VALUES.map((value) => Type.Literal(value)))),
    fillColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    textColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    borderColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    radius: Type.Optional(Type.Union(BUTTON_RADIUS_VALUES.map((value) => Type.Literal(value)))),
    icon: Type.Optional(Type.Union(BUTTON_ICON_VALUES.map((value) => Type.Literal(value)))),
    iconPlacement: Type.Optional(
      Type.Union(BUTTON_ICON_PLACEMENT_VALUES.map((value) => Type.Literal(value))),
    ),
  },
  { $id: 'ButtonStyleProps', additionalProperties: false },
);
export type ButtonStyleProps = Static<typeof ButtonStyleProps>;

/** Popup composition controls. They arrange the flow; coordinates are never persisted. */
export const TooltipLayoutProps = Type.Object(
  {
    widthPx: Type.Optional(
      Type.Integer({
        minimum: TOOLTIP_WIDTH_PX_LIMITS.min,
        maximum: TOOLTIP_WIDTH_PX_LIMITS.max,
        multipleOf: TOOLTIP_WIDTH_PX_LIMITS.step,
      }),
    ),
    heightPx: Type.Optional(
      Type.Integer({
        minimum: TOOLTIP_HEIGHT_PX_LIMITS.min,
        maximum: TOOLTIP_HEIGHT_PX_LIMITS.max,
        multipleOf: TOOLTIP_HEIGHT_PX_LIMITS.step,
      }),
    ),
    contentAlign: Type.Optional(
      Type.Union(TEXT_ALIGNMENT_VALUES.map((value) => Type.Literal(value))),
    ),
    actionLayout: Type.Optional(
      Type.Union(TOOLTIP_ACTION_LAYOUT_VALUES.map((value) => Type.Literal(value))),
    ),
    actionAlign: Type.Optional(
      Type.Union(BLOCK_ALIGNMENT_VALUES.map((value) => Type.Literal(value))),
    ),
    gap: Type.Optional(Type.Union(BLOCK_SPACING_VALUES.map((value) => Type.Literal(value)))),
    padding: Type.Optional(Type.Union(TOOLTIP_PADDING_VALUES.map((value) => Type.Literal(value)))),
    radius: Type.Optional(Type.Union(TOOLTIP_RADIUS_VALUES.map((value) => Type.Literal(value)))),
    showArrow: Type.Optional(Type.Boolean()),
  },
  { $id: 'TooltipLayoutProps', additionalProperties: false },
);
export type TooltipLayoutProps = Static<typeof TooltipLayoutProps>;

/**
 * Visual attachment inside a resolved target's live border box.
 *
 * This is presentation geometry, not target identity. Ratios are normalized to
 * the resolved owner element so immutable artifacts remain independent of
 * viewport pixels and diagnostic capture coordinates.
 */
export const PresentationAnchor = Type.Union(
  [
    Type.Object({ kind: Type.Literal('element-bounds') }, { additionalProperties: false }),
    Type.Object(
      {
        kind: Type.Literal('point'),
        xRatio: Type.Number(PRESENTATION_RATIO_BOUNDS),
        yRatio: Type.Number(PRESENTATION_RATIO_BOUNDS),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('region'),
        xRatio: Type.Number(PRESENTATION_RATIO_BOUNDS),
        yRatio: Type.Number(PRESENTATION_RATIO_BOUNDS),
        widthRatio: Type.Number(PRESENTATION_REGION_SIZE_BOUNDS),
        heightRatio: Type.Number(PRESENTATION_REGION_SIZE_BOUNDS),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'PresentationAnchor' },
);
export type PresentationAnchor = Static<typeof PresentationAnchor>;

/** A deliberate sub-element choice returned by direct-manipulation authoring. */
export const ExactPresentationAnchor = Type.Exclude(
  PresentationAnchor,
  Type.Object({ kind: Type.Literal('element-bounds') }),
  { $id: 'ExactPresentationAnchor' },
);
export type ExactPresentationAnchor = Static<typeof ExactPresentationAnchor>;

/**
 * JSON Schema can bound each ratio but cannot express the two cross-field sums.
 * Use this semantic guard before accepting a draft anchor or compiling it for
 * publication.
 */
export function isPresentationAnchor(value: unknown): value is PresentationAnchor {
  if (!Value.Check(PresentationAnchor, value)) return false;
  const anchor = value as PresentationAnchor;
  if (anchor.kind !== 'region') return true;
  return anchor.xRatio + anchor.widthRatio <= 1 && anchor.yRatio + anchor.heightRatio <= 1;
}

/** Returns an isolated canonical value, or omits malformed draft input. */
export function sanitizePresentationAnchor(value: unknown): PresentationAnchor | undefined {
  if (!isPresentationAnchor(value)) return undefined;
  if (value.kind === 'element-bounds') return { kind: value.kind };
  if (value.kind === 'point') {
    return { kind: value.kind, xRatio: value.xRatio, yRatio: value.yRatio };
  }
  return {
    kind: value.kind,
    xRatio: value.xRatio,
    yRatio: value.yRatio,
    widthRatio: value.widthRatio,
    heightRatio: value.heightRatio,
  };
}

/**
 * Narrow author-controlled block props. Documents must not carry arbitrary
 * CSS, JavaScript, raw HTML, or code-like attributes (PRD §7.10, §14.2, §20).
 */
export const LodariqBlockProps = Type.Object(
  {
    action: Type.Optional(BlockActionProps),
    index: Type.Optional(Type.Number()),
    level: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)])),
    placement: Type.Optional(
      Type.Union([
        Type.Literal('top'),
        Type.Literal('right'),
        Type.Literal('bottom'),
        Type.Literal('left'),
      ]),
    ),
    presentationAnchor: Type.Optional(Type.Ref(PresentationAnchor)),
    targetId: Type.Optional(Type.String({ minLength: 1 })),
    textStyle: Type.Optional(Type.Ref(TextStyleProps)),
    blockLayout: Type.Optional(Type.Ref(BlockLayoutProps)),
    buttonStyle: Type.Optional(Type.Ref(ButtonStyleProps)),
    tooltipLayout: Type.Optional(Type.Ref(TooltipLayoutProps)),
    variant: Type.Optional(Type.Union(BUTTON_VARIANT_VALUES.map((value) => Type.Literal(value)))),
  },
  { $id: 'LodariqBlockProps', additionalProperties: false },
);
export type LodariqBlockProps = Static<typeof LodariqBlockProps>;

export function sanitizeBlockProps(props: Record<string, unknown>): LodariqBlockProps {
  const next: LodariqBlockProps = {};
  if (isRecord(props.action)) {
    const action = sanitizeActionProps(props.action);
    if (action) next.action = action;
  }
  if (typeof props.index === 'number' && Number.isFinite(props.index)) next.index = props.index;
  const level = headingLevelValue(props.level);
  if (level) next.level = level;
  const placement = placementValue(props.placement);
  if (placement) next.placement = placement;
  const presentationAnchor = sanitizePresentationAnchor(props.presentationAnchor);
  if (presentationAnchor) next.presentationAnchor = presentationAnchor;
  if (typeof props.targetId === 'string' && props.targetId.trim()) next.targetId = props.targetId;
  const textStyle = sanitizeTextStyleProps(props.textStyle);
  if (textStyle) next.textStyle = textStyle;
  const blockLayout = sanitizeBlockLayoutProps(props.blockLayout);
  if (blockLayout) next.blockLayout = blockLayout;
  const buttonStyle = sanitizeButtonStyleProps(props.buttonStyle);
  if (buttonStyle) next.buttonStyle = buttonStyle;
  const tooltipLayout = sanitizeTooltipLayoutProps(props.tooltipLayout);
  if (tooltipLayout) next.tooltipLayout = tooltipLayout;
  const variant = buttonVariantValue(props.variant);
  if (variant) next.variant = variant;
  return next;
}

export function sanitizeTextStyleProps(value: unknown): TextStyleProps | undefined {
  if (!isRecord(value)) return undefined;
  const next: TextStyleProps = {};
  if (typeof value.align === 'string' && TEXT_ALIGNMENT_SET.has(value.align)) {
    next.align = value.align as TextStyleProps['align'];
  }
  if (
    typeof value.fontSizePx === 'number' &&
    Number.isInteger(value.fontSizePx) &&
    TEXT_FONT_SIZE_SET.has(value.fontSizePx)
  ) {
    next.fontSizePx = value.fontSizePx as TextStyleProps['fontSizePx'];
  }
  if (typeof value.color === 'string' && new RegExp(TEXT_COLOR_PATTERN, 'u').test(value.color)) {
    next.color = value.color.toLowerCase();
  }
  if ([400, 500, 600, 700].includes(value.fontWeight as number)) {
    next.fontWeight = value.fontWeight as TextStyleProps['fontWeight'];
  }
  if (value.fontStyle === 'normal' || value.fontStyle === 'italic') {
    next.fontStyle = value.fontStyle;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function sanitizeInlineTextRuns(value: unknown): InlineTextRun[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const runs = value.slice(0, INLINE_TEXT_RUN_LIMIT).flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.text !== 'string') return [];
    const text = candidate.text.slice(0, INLINE_TEXT_RUN_LENGTH_LIMIT);
    if (!text) return [];
    const marks = Array.isArray(candidate.marks)
      ? ([
          ...new Set(
            candidate.marks.filter(
              (mark) => typeof mark === 'string' && INLINE_TEXT_MARK_SET.has(mark),
            ),
          ),
        ] as InlineTextRun['marks'])
      : undefined;
    const color = safeHexColor(candidate.color);
    const highlightColor = safeHexColor(candidate.highlightColor);
    const fontSizePx =
      typeof candidate.fontSizePx === 'number' &&
      Number.isInteger(candidate.fontSizePx) &&
      TEXT_FONT_SIZE_SET.has(candidate.fontSizePx)
        ? (candidate.fontSizePx as InlineTextRun['fontSizePx'])
        : undefined;
    const linkCandidate =
      typeof candidate.link === 'string' ? candidate.link.trim().slice(0, 2_048) : '';
    const link = isSafeNavigationUrl(linkCandidate) ? linkCandidate : '';
    return [
      {
        text,
        ...(marks?.length ? { marks } : {}),
        ...(fontSizePx ? { fontSizePx } : {}),
        ...(color ? { color } : {}),
        ...(highlightColor ? { highlightColor } : {}),
        ...(link ? { link } : {}),
      },
    ];
  });
  return runs.length > 0 ? mergeAdjacentInlineTextRuns(runs) : undefined;
}

export function sanitizeBlockLayoutProps(value: unknown): BlockLayoutProps | undefined {
  if (!isRecord(value)) return undefined;
  const next: BlockLayoutProps = {};
  if (typeof value.align === 'string' && BLOCK_ALIGNMENT_SET.has(value.align)) {
    next.align = value.align as BlockLayoutProps['align'];
  }
  if (typeof value.spacingBefore === 'string' && BLOCK_SPACING_SET.has(value.spacingBefore)) {
    next.spacingBefore = value.spacingBefore as BlockLayoutProps['spacingBefore'];
  }
  if (typeof value.spacingAfter === 'string' && BLOCK_SPACING_SET.has(value.spacingAfter)) {
    next.spacingAfter = value.spacingAfter as BlockLayoutProps['spacingAfter'];
  }
  if (
    typeof value.spacingAfterPx === 'number' &&
    Number.isInteger(value.spacingAfterPx) &&
    value.spacingAfterPx >= BLOCK_SPACING_PX_LIMITS.min &&
    value.spacingAfterPx <= BLOCK_SPACING_PX_LIMITS.max &&
    value.spacingAfterPx % BLOCK_SPACING_PX_LIMITS.step === 0
  ) {
    next.spacingAfterPx = value.spacingAfterPx;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function sanitizeButtonStyleProps(value: unknown): ButtonStyleProps | undefined {
  if (!isRecord(value)) return undefined;
  const next: ButtonStyleProps = {};
  if (typeof value.width === 'string' && BUTTON_WIDTH_SET.has(value.width)) {
    next.width = value.width as ButtonStyleProps['width'];
  }
  if (
    typeof value.widthPx === 'number' &&
    Number.isInteger(value.widthPx) &&
    value.widthPx >= BUTTON_WIDTH_PX_LIMITS.min &&
    value.widthPx <= BUTTON_WIDTH_PX_LIMITS.max &&
    value.widthPx % BUTTON_WIDTH_PX_LIMITS.step === 0
  ) {
    next.widthPx = value.widthPx;
  }
  if (typeof value.size === 'string' && BUTTON_SIZE_SET.has(value.size)) {
    next.size = value.size as ButtonStyleProps['size'];
  }
  const fillColor = safeHexColor(value.fillColor);
  if (fillColor) next.fillColor = fillColor;
  const textColor = safeHexColor(value.textColor);
  if (textColor) next.textColor = textColor;
  const borderColor = safeHexColor(value.borderColor);
  if (borderColor) next.borderColor = borderColor;
  if (typeof value.radius === 'string' && BUTTON_RADIUS_SET.has(value.radius)) {
    next.radius = value.radius as ButtonStyleProps['radius'];
  }
  if (typeof value.icon === 'string' && BUTTON_ICON_SET.has(value.icon)) {
    next.icon = value.icon as ButtonStyleProps['icon'];
  }
  if (
    typeof value.iconPlacement === 'string' &&
    BUTTON_ICON_PLACEMENT_SET.has(value.iconPlacement)
  ) {
    next.iconPlacement = value.iconPlacement as ButtonStyleProps['iconPlacement'];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function sanitizeTooltipLayoutProps(value: unknown): TooltipLayoutProps | undefined {
  if (!isRecord(value)) return undefined;
  const next: TooltipLayoutProps = {};
  if (
    typeof value.widthPx === 'number' &&
    Number.isInteger(value.widthPx) &&
    value.widthPx >= TOOLTIP_WIDTH_PX_LIMITS.min &&
    value.widthPx <= TOOLTIP_WIDTH_PX_LIMITS.max &&
    value.widthPx % TOOLTIP_WIDTH_PX_LIMITS.step === 0
  ) {
    next.widthPx = value.widthPx;
  }
  if (
    typeof value.heightPx === 'number' &&
    Number.isInteger(value.heightPx) &&
    value.heightPx >= TOOLTIP_HEIGHT_PX_LIMITS.min &&
    value.heightPx <= TOOLTIP_HEIGHT_PX_LIMITS.max &&
    value.heightPx % TOOLTIP_HEIGHT_PX_LIMITS.step === 0
  ) {
    next.heightPx = value.heightPx;
  }
  if (typeof value.contentAlign === 'string' && TEXT_ALIGNMENT_SET.has(value.contentAlign)) {
    next.contentAlign = value.contentAlign as TooltipLayoutProps['contentAlign'];
  }
  if (typeof value.actionLayout === 'string' && TOOLTIP_ACTION_LAYOUT_SET.has(value.actionLayout)) {
    next.actionLayout = value.actionLayout as TooltipLayoutProps['actionLayout'];
  }
  if (typeof value.actionAlign === 'string' && BLOCK_ALIGNMENT_SET.has(value.actionAlign)) {
    next.actionAlign = value.actionAlign as TooltipLayoutProps['actionAlign'];
  }
  if (typeof value.gap === 'string' && BLOCK_SPACING_SET.has(value.gap)) {
    next.gap = value.gap as TooltipLayoutProps['gap'];
  }
  if (typeof value.padding === 'string' && TOOLTIP_PADDING_SET.has(value.padding)) {
    next.padding = value.padding as TooltipLayoutProps['padding'];
  }
  if (typeof value.radius === 'string' && TOOLTIP_RADIUS_SET.has(value.radius)) {
    next.radius = value.radius as TooltipLayoutProps['radius'];
  }
  if (typeof value.showArrow === 'boolean') next.showArrow = value.showArrow;
  return Object.keys(next).length > 0 ? next : undefined;
}

function mergeAdjacentInlineTextRuns(runs: InlineTextRun[]): InlineTextRun[] {
  const merged: InlineTextRun[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && inlineRunStyleKey(previous) === inlineRunStyleKey(run)) {
      previous.text += run.text;
    } else {
      merged.push(structuredClone(run));
    }
  }
  return merged;
}

function inlineRunStyleKey(run: InlineTextRun): string {
  return JSON.stringify({
    marks: run.marks ?? [],
    fontSizePx: run.fontSizePx ?? null,
    color: run.color ?? null,
    highlightColor: run.highlightColor ?? null,
    link: run.link ?? null,
  });
}

function safeHexColor(value: unknown): string | undefined {
  return typeof value === 'string' && new RegExp(TEXT_COLOR_PATTERN, 'u').test(value)
    ? value.toLowerCase()
    : undefined;
}

function sanitizeActionProps(action: Record<string, unknown>): BlockActionProps | null {
  const type = blockActionTypeValue(action['type']);
  if (!type) return null;
  if (type !== OPEN_PAGE_ACTION_TYPE) return { type };
  const url = actionUrlValue(action['url']);
  const navigationBehavior = openPageNavigationBehaviorValue(action['navigationBehavior']);
  return {
    type,
    ...(url ? { url } : {}),
    ...(navigationBehavior ? { navigationBehavior } : {}),
  };
}

function blockActionTypeValue(value: unknown): BlockActionTypeValue | null {
  if (typeof value !== 'string') return null;
  return BLOCK_ACTION_TYPE_SET.has(value) ? (value as BlockActionTypeValue) : null;
}

function actionUrlValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  return url || null;
}

function openPageNavigationBehaviorValue(value: unknown): OpenPageNavigationBehavior | null {
  if (typeof value !== 'string') return null;
  return OPEN_PAGE_NAVIGATION_BEHAVIOR_SET.has(value)
    ? (value as OpenPageNavigationBehavior)
    : null;
}

function headingLevelValue(value: unknown): LodariqBlockProps['level'] | null {
  if (typeof value !== 'number') return null;
  return HEADING_LEVEL_SET.has(value) ? (value as LodariqBlockProps['level']) : null;
}

function placementValue(value: unknown): LodariqBlockProps['placement'] | null {
  if (typeof value !== 'string') return null;
  return PLACEMENT_SET.has(value) ? (value as LodariqBlockProps['placement']) : null;
}

function buttonVariantValue(value: unknown): LodariqBlockProps['variant'] | null {
  if (typeof value !== 'string') return null;
  return BUTTON_VARIANT_SET.has(value) ? (value as LodariqBlockProps['variant']) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Canonical recursive block node (PRD §7.1).
 *
 * `id` is a stable Lodariq block ID that must survive editing, drag/drop,
 * copy/paste, and migrations. Lexical node keys are NEVER used here (PRD §7.2, §20).
 */
export const LodariqBlock = Type.Recursive(
  (Self) =>
    Type.Object(
      {
        id: Type.String({ minLength: 1 }),
        type: LodariqBlockType,
        content: Type.Optional(Type.String()),
        contentRuns: Type.Optional(
          Type.Array(Type.Ref(InlineTextRun), { maxItems: INLINE_TEXT_RUN_LIMIT }),
        ),
        props: LodariqBlockProps,
        children: Type.Array(Self),
        status: Type.Optional(Type.Ref(ValidationLevel)),
        diagnostics: Type.Optional(Type.Array(Type.Ref(BlockDiagnostic))),
      },
      { additionalProperties: false },
    ),
  { $id: 'LodariqBlock' },
);
export type LodariqBlock = Static<typeof LodariqBlock>;
