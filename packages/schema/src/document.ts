import { Type, type Static } from '@sinclair/typebox';
import { DocumentStatus, DocumentType, Environment } from './common';
import { LodariqBlock } from './block';
import { ExperienceAppearance, ThemeBinding } from './brand';
import { Target } from './target';

export const TRIGGER_TYPES = ['manual', 'pageLoad', 'urlMatch', 'event'] as const;

/**
 * When/where a document is shown. Every non-manual trigger has a narrow,
 * typed configuration so canonical documents cannot smuggle HTML, CSS, or
 * undeclared customer data through an open-ended record (PRD §6.3, §7.10).
 */
export const TriggerDefinition = Type.Union(
  [
    Type.Object({ type: Type.Literal('manual') }, { additionalProperties: false }),
    Type.Object(
      {
        type: Type.Literal('pageLoad'),
        config: Type.Optional(
          Type.Object(
            { delayMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 60_000 })) },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('urlMatch'),
        config: Type.Object(
          {
            pattern: Type.String({ minLength: 1, maxLength: 2_048 }),
            mode: Type.Optional(
              Type.Union([Type.Literal('exact'), Type.Literal('prefix'), Type.Literal('contains')]),
            ),
          },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('event'),
        config: Type.Object(
          { eventName: Type.String({ minLength: 1, maxLength: 120 }) },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'TriggerDefinition' },
);
export type TriggerDefinition = Static<typeof TriggerDefinition>;

export const AUDIENCE_RULE_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'exists',
  'notExists',
] as const;

export const AudienceRule = Type.Object(
  {
    source: Type.Union([Type.Literal('identify'), Type.Literal('event')]),
    key: Type.String({ minLength: 1, maxLength: 120 }),
    operator: Type.Union([
      Type.Literal('equals'),
      Type.Literal('notEquals'),
      Type.Literal('contains'),
      Type.Literal('exists'),
      Type.Literal('notExists'),
    ]),
    value: Type.Optional(
      Type.Union([Type.String({ maxLength: 1_024 }), Type.Number(), Type.Boolean()]),
    ),
  },
  { $id: 'AudienceRule', additionalProperties: false },
);
export type AudienceRule = Static<typeof AudienceRule>;

/**
 * Legacy Phase 1 audience shape. Product environments remain readable here
 * until the versioned Phase 2 document contract lands; new release state is
 * never inferred from this field (PRD §11.3.1).
 */
export const AudienceDefinition = Type.Object(
  {
    environments: Type.Array(Environment),
    rules: Type.Optional(Type.Array(AudienceRule, { maxItems: 50 })),
  },
  { $id: 'AudienceDefinition', additionalProperties: false },
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
    /** Legacy read compatibility only. New writes use `themeBinding`. */
    themeRef: Type.Optional(Type.String()),
    themeBinding: Type.Optional(ThemeBinding),
    appearance: Type.Optional(ExperienceAppearance),
    targets: Type.Array(Target),
    blocks: Type.Array(Type.Ref(LodariqBlock)),
    schemaVersion: Type.String(),
  },
  { $id: 'LodariqDocument', additionalProperties: false },
);
export type LodariqDocument = Static<typeof LodariqDocument>;
