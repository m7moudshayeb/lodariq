import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { BlockDiagnostic, ValidationLevel } from './common';
import { JourneyHandoff, sanitizeJourneyHandoff } from './application';
import { StepChoreography, sanitizeStepChoreography } from './choreography';
import { StepEmphasis, sanitizeStepEmphasis } from './emphasis';
import {
  StepTransition,
  StepTransitionCondition,
  sanitizeStepTransition,
  sanitizeStepTransitionCondition,
} from './flow';
import { isSafeNavigationUrl } from './url';
import { StepNarration, sanitizeStepNarration } from './narration';
import {
  FormFieldPresentation,
  MediaPresentation,
  ResponsiveStepPresentation,
  SpotlightPresentation,
  StructuredCompositionPresentation,
  TourMotionPresentation,
  sanitizeFormFieldPresentation,
  sanitizeMediaPresentation,
  sanitizeResponsiveStepPresentation,
  sanitizeSpotlightPresentation,
  sanitizeStructuredCompositionPresentation,
  sanitizeTourMotionPresentation,
} from './presentation';

export const LodariqBlockType = Type.Union(
  [
    // Text / content
    Type.Literal('paragraph'),
    Type.Literal('heading'),
    Type.Literal('list'),
    Type.Literal('divider'),
    // Media
    Type.Literal('media'),
    Type.Literal('callout'),
    Type.Literal('stat'),
    Type.Literal('icon'),
    Type.Literal('formField'),
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
  'runSequence',
  'openPage',
] as const;
export type BlockActionTypeValue = (typeof BLOCK_ACTION_TYPES)[number];

export const OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES = ['stay', 'continue'] as const;
export type OpenPageNavigationBehavior = (typeof OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES)[number];

const BLOCK_ACTION_TYPE_SET = new Set<string>(BLOCK_ACTION_TYPES);
const OPEN_PAGE_ACTION_TYPE: BlockActionTypeValue = 'openPage';
const OPEN_PAGE_NAVIGATION_BEHAVIOR_SET = new Set<string>(OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES);
const TEACHES_PATTERN = /^[a-z][a-z0-9_]*$/;
const HEADING_LEVEL_VALUES = [1, 2, 3] as const;
const HEADING_LEVEL_SET = new Set<number>(HEADING_LEVEL_VALUES);
const PLACEMENT_VALUES = ['top', 'right', 'bottom', 'left'] as const;
const PLACEMENT_SET = new Set<string>(PLACEMENT_VALUES);
export const BUTTON_VARIANT_VALUES = ['primary', 'secondary', 'subtle', 'outline', 'link'] as const;
const BUTTON_VARIANT_SET = new Set<string>(BUTTON_VARIANT_VALUES);
export const TEXT_ALIGNMENT_VALUES = ['left', 'center', 'right'] as const;
/** Where the card sits along the side it is anchored to. */
export const ANCHOR_ALIGN_VALUES = ['start', 'center', 'end'] as const;
const ANCHOR_ALIGN_SET = new Set<string>(ANCHOR_ALIGN_VALUES);
export const ANCHOR_OFFSET_PX_LIMITS = { min: 0, max: 96, step: 1 } as const;
export type AnchorAlign = (typeof ANCHOR_ALIGN_VALUES)[number];
const TEXT_ALIGNMENT_SET = new Set<string>(TEXT_ALIGNMENT_VALUES);
/** Suggested authoring choices. The contract also accepts custom whole-pixel values in range. */
export const TEXT_FONT_SIZE_VALUES = [10, 12, 14, 16, 18, 24, 28, 32] as const;
export const TEXT_FONT_SIZE_PX_LIMITS = { min: 8, max: 96, step: 1 } as const;
export const INLINE_TEXT_MARK_VALUES = ['bold', 'italic', 'underline'] as const;
const INLINE_TEXT_MARK_SET = new Set<string>(INLINE_TEXT_MARK_VALUES);
export const BLOCK_ALIGNMENT_VALUES = ['start', 'center', 'end', 'stretch'] as const;
const BLOCK_ALIGNMENT_SET = new Set<string>(BLOCK_ALIGNMENT_VALUES);
export const BLOCK_SPACING_VALUES = ['none', 'tight', 'normal', 'relaxed'] as const;
const BLOCK_SPACING_SET = new Set<string>(BLOCK_SPACING_VALUES);
export const BLOCK_SPACING_PX_LIMITS = { min: 0, max: 96, step: 1 } as const;
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
export const TOOLTIP_BORDER_WEIGHT_VALUES = ['theme', 'none', 'subtle', 'strong'] as const;
const TOOLTIP_BORDER_WEIGHT_SET = new Set<string>(TOOLTIP_BORDER_WEIGHT_VALUES);
export const TOOLTIP_ELEVATION_VALUES = ['theme', 'none', 'resting', 'floating'] as const;
const TOOLTIP_ELEVATION_SET = new Set<string>(TOOLTIP_ELEVATION_VALUES);
const TEXT_COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';
const INLINE_TEXT_RUN_LIMIT = 256;
const INLINE_TEXT_RUN_LENGTH_LIMIT = 10_000;
const PRESENTATION_RATIO_BOUNDS = { minimum: 0, maximum: 1 } as const;
const PRESENTATION_REGION_SIZE_BOUNDS = { exclusiveMinimum: 0, maximum: 1 } as const;

const OptionalStepTransition = Type.Optional(Type.Ref(StepTransition));

/**
 * Closed action registry. Each member declares only the fields it can consume,
 * so behavior, navigation, and choreography data cannot leak across actions.
 */
export const BlockActionProps = Type.Union(
  [
    ...(['next', 'back', 'complete', 'dismiss', 'clickTarget'] as const).map((type) =>
      Type.Object(
        { type: Type.Literal(type), transition: OptionalStepTransition },
        { additionalProperties: false },
      ),
    ),
    Type.Object(
      {
        type: Type.Literal('runSequence'),
        sequence: Type.Ref(StepChoreography),
        transition: OptionalStepTransition,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('openPage'),
        url: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
        navigationBehavior: Type.Optional(
          Type.Union(OPEN_PAGE_NAVIGATION_BEHAVIOR_VALUES.map((value) => Type.Literal(value))),
        ),
        transition: OptionalStepTransition,
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'BlockActionProps' },
);
export type BlockActionProps = Static<typeof BlockActionProps>;

/** Safe block-level typography controls for structured rich-text authoring. */
export const TextStyleProps = Type.Object(
  {
    align: Type.Optional(Type.Union(TEXT_ALIGNMENT_VALUES.map((value) => Type.Literal(value)))),
    fontSizePx: Type.Optional(
      Type.Integer({
        minimum: TEXT_FONT_SIZE_PX_LIMITS.min,
        maximum: TEXT_FONT_SIZE_PX_LIMITS.max,
      }),
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
      Type.Integer({
        minimum: TEXT_FONT_SIZE_PX_LIMITS.min,
        maximum: TEXT_FONT_SIZE_PX_LIMITS.max,
      }),
    ),
    color: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    highlightColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    animation: Type.Optional(Type.Ref(TourMotionPresentation)),
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

/** Safe per-popup appearance overrides. Omitted fields inherit the compiled Brand Theme. */
export const TooltipStyleProps = Type.Object(
  {
    surfaceColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    textColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    borderColor: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    borderWeight: Type.Optional(
      Type.Union(TOOLTIP_BORDER_WEIGHT_VALUES.map((value) => Type.Literal(value))),
    ),
    elevation: Type.Optional(
      Type.Union(TOOLTIP_ELEVATION_VALUES.map((value) => Type.Literal(value))),
    ),
  },
  { $id: 'TooltipStyleProps', additionalProperties: false },
);
export type TooltipStyleProps = Static<typeof TooltipStyleProps>;

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
    /** Position along the anchored side; the compass sets this directly. */
    anchorAlign: Type.Optional(Type.Union(ANCHOR_ALIGN_VALUES.map((value) => Type.Literal(value)))),
    anchorOffsetPx: Type.Optional(
      Type.Integer({ minimum: ANCHOR_OFFSET_PX_LIMITS.min, maximum: ANCHOR_OFFSET_PX_LIMITS.max }),
    ),
    /** Flip to the opposite side when the chosen one does not fit. Defaults to on. */
    anchorAutoFlip: Type.Optional(Type.Boolean()),
    targetId: Type.Optional(Type.String({ minLength: 1 })),
    textStyle: Type.Optional(Type.Ref(TextStyleProps)),
    blockLayout: Type.Optional(Type.Ref(BlockLayoutProps)),
    buttonStyle: Type.Optional(Type.Ref(ButtonStyleProps)),
    /** Optional passive sequence that starts when a Tour step becomes presentable. */
    entrySequence: Type.Optional(Type.Ref(StepChoreography)),
    media: Type.Optional(Type.Ref(MediaPresentation)),
    formField: Type.Optional(Type.Ref(FormFieldPresentation)),
    motion: Type.Optional(Type.Ref(TourMotionPresentation)),
    responsive: Type.Optional(Type.Ref(ResponsiveStepPresentation)),
    spotlight: Type.Optional(Type.Ref(SpotlightPresentation)),
    /** Backdrop, target outline and viewport focus for this step. */
    emphasis: Type.Optional(Type.Ref(StepEmphasis)),
    /**
     * Whether this block renders at all. On a step it gates the whole step; on a
     * child it varies content inside one step. One contract, both jobs.
     */
    showWhen: Type.Optional(Type.Ref(StepTransitionCondition)),
    /** Behaviour this step exists to teach; adaptive delivery skips it once shown. */
    teaches: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9_]*$' })),
    /** Hands the journey to a second application after this step. */
    handoff: Type.Optional(Type.Ref(JourneyHandoff)),
    composition: Type.Optional(Type.Ref(StructuredCompositionPresentation)),
    accessibilityName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    /** Spoken script, authored separately from the on-screen copy (§7.7). */
    narration: Type.Optional(Type.Ref(StepNarration)),
    tooltipLayout: Type.Optional(Type.Ref(TooltipLayoutProps)),
    tooltipStyle: Type.Optional(Type.Ref(TooltipStyleProps)),
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
  if (typeof props.anchorAlign === 'string' && ANCHOR_ALIGN_SET.has(props.anchorAlign)) {
    next.anchorAlign = props.anchorAlign as (typeof ANCHOR_ALIGN_VALUES)[number];
  }
  if (
    typeof props.anchorOffsetPx === 'number' &&
    Number.isInteger(props.anchorOffsetPx) &&
    props.anchorOffsetPx >= ANCHOR_OFFSET_PX_LIMITS.min &&
    props.anchorOffsetPx <= ANCHOR_OFFSET_PX_LIMITS.max
  ) {
    next.anchorOffsetPx = props.anchorOffsetPx;
  }
  if (typeof props.anchorAutoFlip === 'boolean') next.anchorAutoFlip = props.anchorAutoFlip;
  if (typeof props.targetId === 'string' && props.targetId.trim()) next.targetId = props.targetId;
  const narration = sanitizeStepNarration(props.narration);
  if (narration) next.narration = narration;
  const textStyle = sanitizeTextStyleProps(props.textStyle);
  if (textStyle) next.textStyle = textStyle;
  const blockLayout = sanitizeBlockLayoutProps(props.blockLayout);
  if (blockLayout) next.blockLayout = blockLayout;
  const buttonStyle = sanitizeButtonStyleProps(props.buttonStyle);
  if (buttonStyle) next.buttonStyle = buttonStyle;
  const entrySequence = sanitizeStepChoreography(props.entrySequence);
  if (entrySequence) next.entrySequence = entrySequence;
  const media = sanitizeMediaPresentation(props.media);
  if (media) next.media = media;
  const formField = sanitizeFormFieldPresentation(props.formField);
  if (formField) next.formField = formField;
  const motion = sanitizeTourMotionPresentation(props.motion);
  if (motion) next.motion = motion;
  const responsive = sanitizeResponsiveStepPresentation(props.responsive);
  if (responsive) next.responsive = responsive;
  const spotlight = sanitizeSpotlightPresentation(props.spotlight);
  if (spotlight) next.spotlight = spotlight;
  const emphasis = sanitizeStepEmphasis(props.emphasis);
  if (emphasis) next.emphasis = emphasis;
  const showWhen = sanitizeStepTransitionCondition(props.showWhen);
  if (showWhen) next.showWhen = showWhen;
  if (typeof props.teaches === 'string' && TEACHES_PATTERN.test(props.teaches)) {
    next.teaches = props.teaches;
  }
  const handoff = sanitizeJourneyHandoff(props.handoff);
  if (handoff) next.handoff = handoff;
  const composition = sanitizeStructuredCompositionPresentation(props.composition);
  if (composition) next.composition = composition;
  if (typeof props.accessibilityName === 'string' && props.accessibilityName.trim()) {
    next.accessibilityName = props.accessibilityName.trim().slice(0, 300);
  }
  const tooltipLayout = sanitizeTooltipLayoutProps(props.tooltipLayout);
  if (tooltipLayout) next.tooltipLayout = tooltipLayout;
  const tooltipStyle = sanitizeTooltipStyleProps(props.tooltipStyle);
  if (tooltipStyle) next.tooltipStyle = tooltipStyle;
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
    value.fontSizePx >= TEXT_FONT_SIZE_PX_LIMITS.min &&
    value.fontSizePx <= TEXT_FONT_SIZE_PX_LIMITS.max
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
    const animation = sanitizeTourMotionPresentation(candidate.animation);
    const fontSizePx =
      typeof candidate.fontSizePx === 'number' &&
      Number.isInteger(candidate.fontSizePx) &&
      candidate.fontSizePx >= TEXT_FONT_SIZE_PX_LIMITS.min &&
      candidate.fontSizePx <= TEXT_FONT_SIZE_PX_LIMITS.max
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
        ...(animation ? { animation } : {}),
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

export function sanitizeTooltipStyleProps(value: unknown): TooltipStyleProps | undefined {
  if (!isRecord(value)) return undefined;
  const next: TooltipStyleProps = {};
  const surfaceColor = safeHexColor(value.surfaceColor);
  if (surfaceColor) next.surfaceColor = surfaceColor;
  const textColor = safeHexColor(value.textColor);
  if (textColor) next.textColor = textColor;
  const borderColor = safeHexColor(value.borderColor);
  if (borderColor) next.borderColor = borderColor;
  if (typeof value.borderWeight === 'string' && TOOLTIP_BORDER_WEIGHT_SET.has(value.borderWeight)) {
    next.borderWeight = value.borderWeight as TooltipStyleProps['borderWeight'];
  }
  if (typeof value.elevation === 'string' && TOOLTIP_ELEVATION_SET.has(value.elevation)) {
    next.elevation = value.elevation as TooltipStyleProps['elevation'];
  }
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
    animation: run.animation ?? null,
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
  if (type === 'runSequence') {
    const sequence = sanitizeStepChoreography(action['sequence']);
    const transition = sanitizeStepTransition(action['transition']);
    return sequence ? { type, sequence, ...(transition ? { transition } : {}) } : null;
  }
  const transition = sanitizeStepTransition(action['transition']);
  if (type !== OPEN_PAGE_ACTION_TYPE) return { type, ...(transition ? { transition } : {}) };
  const url = actionUrlValue(action['url']);
  const navigationBehavior = openPageNavigationBehaviorValue(action['navigationBehavior']);
  return {
    type,
    ...(url ? { url } : {}),
    ...(navigationBehavior ? { navigationBehavior } : {}),
    ...(transition ? { transition } : {}),
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
        // Embed a scope-neutral copy so HTTP serializers resolve property
        // references against the registered cross-system schemas rather than
        // treating the nested LodariqBlockProps `$id` as a new URI base.
        props: Type.Omit(LodariqBlockProps, []),
        children: Type.Array(Self),
        status: Type.Optional(Type.Ref(ValidationLevel)),
        diagnostics: Type.Optional(Type.Array(Type.Ref(BlockDiagnostic))),
      },
      { additionalProperties: false },
    ),
  { $id: 'LodariqBlock' },
);
export type LodariqBlock = Static<typeof LodariqBlock>;
