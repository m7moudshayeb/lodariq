import { Type, type Static } from '@sinclair/typebox';
import { DocumentStatus, DocumentType, Environment } from './common';
import { LodariqBlock } from './block';
import { Target } from './target';

/**
 * When/where a document is shown. Conditions may reference ONLY explicitly
 * provided data sources (PRD §6.3 customer data boundary). Kept permissive in
 * Phase -1 — concrete condition schemas are stubbed and tightened later.
 */
export const TriggerDefinition = Type.Object(
  {
    type: Type.Union([
      Type.Literal('manual'),
      Type.Literal('pageLoad'),
      Type.Literal('urlMatch'),
      Type.Literal('event'),
    ]),
    config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { $id: 'TriggerDefinition' },
);
export type TriggerDefinition = Static<typeof TriggerDefinition>;

/** Who sees a document (PRD §16.5 segments/targeting). Stubbed in Phase -1. */
export const AudienceDefinition = Type.Object(
  {
    environments: Type.Array(Environment),
    rules: Type.Optional(Type.Array(Type.Record(Type.String(), Type.Unknown()))),
  },
  { $id: 'AudienceDefinition' },
);
export type AudienceDefinition = Static<typeof AudienceDefinition>;

/**
 * Canonical Lodariq document — the source of truth (PRD §3.1, §7.1).
 * NOT Markdown. Markdown is export/interchange/source-mode only.
 */
export const LodariqDocument = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    workspaceId: Type.String({ minLength: 1 }),
    type: DocumentType,
    status: DocumentStatus,
    title: Type.String(),
    trigger: TriggerDefinition,
    audience: AudienceDefinition,
    themeRef: Type.Optional(Type.String()),
    targets: Type.Array(Target),
    blocks: Type.Array(LodariqBlock),
    schemaVersion: Type.String(),
  },
  { $id: 'LodariqDocument' },
);
export type LodariqDocument = Static<typeof LodariqDocument>;
