import { Type, type Static } from '@sinclair/typebox';

/** Environments an SDK token / catalog entry can be scoped to (PRD §6.2, §6.3). */
export const Environment = Type.Union(
  [Type.Literal('development'), Type.Literal('staging'), Type.Literal('production')],
  { $id: 'Environment' },
);
export type Environment = Static<typeof Environment>;

/** Document types act as root renderers (PRD §7.5). */
export const DocumentType = Type.Union(
  [
    Type.Literal('tour'),
    Type.Literal('announcement'),
    Type.Literal('checklist'),
    Type.Literal('survey'),
    Type.Literal('hotspot'),
    Type.Literal('knowledge'),
  ],
  { $id: 'DocumentType' },
);
export type DocumentType = Static<typeof DocumentType>;

/** Document lifecycle status (PRD §7.1, §16.6). */
export const DocumentStatus = Type.Union(
  [
    Type.Literal('draft'),
    Type.Literal('review'),
    Type.Literal('approved'),
    Type.Literal('live'),
    Type.Literal('archived'),
  ],
  { $id: 'DocumentStatus' },
);
export type DocumentStatus = Static<typeof DocumentStatus>;

/**
 * Block validation level (PRD §7.7).
 * - ready: complete and safe to deliver.
 * - incomplete: structurally valid but missing configuration.
 * - invalid: cannot safely run; save allowed, publish blocked.
 */
export const ValidationLevel = Type.Union(
  [Type.Literal('ready'), Type.Literal('incomplete'), Type.Literal('invalid')],
  { $id: 'ValidationLevel' },
);
export type ValidationLevel = Static<typeof ValidationLevel>;

/** A non-fatal diagnostic attached to a block (PRD §7.1, §7.7). */
export const BlockDiagnostic = Type.Object(
  {
    code: Type.String(),
    level: ValidationLevel,
    message: Type.String(),
    /** Optional repair command id the editor can offer (PRD §7.8). */
    repair: Type.Optional(Type.String()),
  },
  { $id: 'BlockDiagnostic' },
);
export type BlockDiagnostic = Static<typeof BlockDiagnostic>;
