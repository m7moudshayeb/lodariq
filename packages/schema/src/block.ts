import { Type, type Static } from '@sinclair/typebox';
import { BlockDiagnostic, ValidationLevel } from './common';

/**
 * MVP block types implemented in the editor (PRD §7.2 "MVP node families").
 * Future families (announcement, checklist item, survey question, hotspot,
 * knowledge, layout) are intentionally schema-only for now (PRD §7.2) and can
 * be added here as they are validated, without breaking the document shape.
 */
export const TalmehBlockType = Type.Union(
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
  { $id: 'TalmehBlockType' },
);
export type TalmehBlockType = Static<typeof TalmehBlockType>;

/**
 * Canonical recursive block node (PRD §7.1).
 *
 * `id` is a stable Talmeh block ID that must survive editing, drag/drop,
 * copy/paste, and migrations. Lexical node keys are NEVER used here (PRD §7.2, §20).
 */
export const TalmehBlock = Type.Recursive(
  (Self) =>
    Type.Object({
      id: Type.String({ minLength: 1 }),
      type: TalmehBlockType,
      content: Type.Optional(Type.String()),
      props: Type.Record(Type.String(), Type.Unknown()),
      children: Type.Array(Self),
      status: Type.Optional(ValidationLevel),
      diagnostics: Type.Optional(Type.Array(BlockDiagnostic)),
    }),
  { $id: 'TalmehBlock' },
);
export type TalmehBlock = Static<typeof TalmehBlock>;
