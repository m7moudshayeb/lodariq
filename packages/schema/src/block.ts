import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { BlockDiagnostic, ValidationLevel } from './common';

/**
 * MVP block types implemented in the editor (PRD §7.2 "MVP node families").
 * Future families (announcement, checklist item, survey question, hotspot,
 * knowledge, layout) are intentionally schema-only for now (PRD §7.2) and can
 * be added here as they are validated, without breaking the document shape.
 */
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

const BLOCK_ACTION_TYPE_SET = new Set<string>(BLOCK_ACTION_TYPES);
const OPEN_PAGE_ACTION_TYPE: BlockActionTypeValue = 'openPage';
const HEADING_LEVEL_VALUES = [1, 2, 3] as const;
const HEADING_LEVEL_SET = new Set<number>(HEADING_LEVEL_VALUES);
const PLACEMENT_VALUES = ['top', 'right', 'bottom', 'left'] as const;
const PLACEMENT_SET = new Set<string>(PLACEMENT_VALUES);
const BUTTON_VARIANT_VALUES = ['primary', 'secondary'] as const;
const BUTTON_VARIANT_SET = new Set<string>(BUTTON_VARIANT_VALUES);
export const TEXT_ALIGNMENT_VALUES = ['left', 'center', 'right'] as const;
const TEXT_ALIGNMENT_SET = new Set<string>(TEXT_ALIGNMENT_VALUES);
const TEXT_COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';
const TEXT_FONT_SIZE_BOUNDS = { minimum: 10, maximum: 72 } as const;
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
  },
  { $id: 'BlockActionProps', additionalProperties: false },
);
export type BlockActionProps = Static<typeof BlockActionProps>;

/** Safe block-level typography controls for structured rich-text authoring. */
export const TextStyleProps = Type.Object(
  {
    align: Type.Optional(Type.Union(TEXT_ALIGNMENT_VALUES.map((value) => Type.Literal(value)))),
    fontSizePx: Type.Optional(Type.Integer(TEXT_FONT_SIZE_BOUNDS)),
    color: Type.Optional(Type.String({ pattern: TEXT_COLOR_PATTERN })),
    fontWeight: Type.Optional(
      Type.Union([Type.Literal(400), Type.Literal(500), Type.Literal(600), Type.Literal(700)]),
    ),
    fontStyle: Type.Optional(Type.Union([Type.Literal('normal'), Type.Literal('italic')])),
  },
  { $id: 'TextStyleProps', additionalProperties: false },
);
export type TextStyleProps = Static<typeof TextStyleProps>;

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
    variant: Type.Optional(Type.Union([Type.Literal('primary'), Type.Literal('secondary')])),
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
    value.fontSizePx >= TEXT_FONT_SIZE_BOUNDS.minimum &&
    value.fontSizePx <= TEXT_FONT_SIZE_BOUNDS.maximum
  ) {
    next.fontSizePx = value.fontSizePx;
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

function sanitizeActionProps(action: Record<string, unknown>): BlockActionProps | null {
  const type = blockActionTypeValue(action['type']);
  if (!type) return null;
  if (type !== OPEN_PAGE_ACTION_TYPE) return { type };
  const url = actionUrlValue(action['url']);
  return url ? { type, url } : { type };
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
