import { Type, type Static } from '@sinclair/typebox';
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

export const BlockActionProps = Type.Object(
  {
    type: Type.Union([Type.Literal('next'), Type.Literal('dismiss'), Type.Literal('clickTarget')]),
  },
  { $id: 'BlockActionProps', additionalProperties: false },
);
export type BlockActionProps = Static<typeof BlockActionProps>;

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
    targetId: Type.Optional(Type.String({ minLength: 1 })),
    variant: Type.Optional(Type.Union([Type.Literal('primary'), Type.Literal('secondary')])),
  },
  { $id: 'LodariqBlockProps', additionalProperties: false },
);
export type LodariqBlockProps = Static<typeof LodariqBlockProps>;

export function sanitizeBlockProps(props: Record<string, unknown>): LodariqBlockProps {
  const next: LodariqBlockProps = {};
  if (isRecord(props.action)) {
    const type = props.action['type'];
    if (type === 'next' || type === 'dismiss' || type === 'clickTarget') next.action = { type };
  }
  if (typeof props.index === 'number' && Number.isFinite(props.index)) next.index = props.index;
  if (props.level === 1 || props.level === 2 || props.level === 3) next.level = props.level;
  if (
    props.placement === 'top' ||
    props.placement === 'right' ||
    props.placement === 'bottom' ||
    props.placement === 'left'
  ) {
    next.placement = props.placement;
  }
  if (typeof props.targetId === 'string' && props.targetId.trim()) next.targetId = props.targetId;
  if (props.variant === 'primary' || props.variant === 'secondary') next.variant = props.variant;
  return next;
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
    Type.Object({
      id: Type.String({ minLength: 1 }),
      type: LodariqBlockType,
      content: Type.Optional(Type.String()),
      props: LodariqBlockProps,
      children: Type.Array(Self),
      status: Type.Optional(ValidationLevel),
      diagnostics: Type.Optional(Type.Array(BlockDiagnostic)),
    }),
  { $id: 'LodariqBlock' },
);
export type LodariqBlock = Static<typeof LodariqBlock>;
