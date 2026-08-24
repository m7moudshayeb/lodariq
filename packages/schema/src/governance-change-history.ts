import { Type, type Static, type TSchema } from '@sinclair/typebox';

export const GOVERNANCE_CHANGE_HISTORY_VERSION = '2026-08-22.1' as const;
export const GOVERNANCE_CHANGE_CATEGORIES = [
  'document',
  'review',
  'release',
  'deployment',
  'governance',
] as const;

export const GovernanceChangeCategory = Type.Union(
  GOVERNANCE_CHANGE_CATEGORIES.map((category) => Type.Literal(category)),
  { $id: 'GovernanceChangeCategory' },
);
export type GovernanceChangeCategory = Static<typeof GovernanceChangeCategory>;

const Identifier = Type.String({ minLength: 1, maxLength: 256 });

export const GovernanceChangeEvent = Type.Object(
  {
    schemaVersion: Type.Literal(GOVERNANCE_CHANGE_HISTORY_VERSION),
    id: Type.String({ minLength: 1, maxLength: 512 }),
    category: Type.Ref(GovernanceChangeCategory),
    action: Type.String({ minLength: 1, maxLength: 120, pattern: '^[a-z][a-z0-9_.-]*$' }),
    actorUserId: Type.Union([Identifier, Type.Null()]),
    documentId: Type.Union([Identifier, Type.Null()]),
    environmentId: Type.Union([Identifier, Type.Null()]),
    resourceId: Identifier,
    occurredAt: Type.String({ format: 'date-time' }),
    details: Type.Record(
      Type.String({ pattern: '^[a-z][a-zA-Z0-9]*$', maxLength: 80 }),
      Type.Union([
        Type.String({ maxLength: 512 }),
        Type.Integer(),
        Type.Boolean(),
        Type.Null(),
      ]),
      { maxProperties: 12 },
    ),
  },
  { $id: 'GovernanceChangeEvent', additionalProperties: false },
);
export type GovernanceChangeEvent = Static<typeof GovernanceChangeEvent>;

export const GovernanceChangeHistoryQuery = Type.Object(
  {
    category: Type.Optional(Type.Ref(GovernanceChangeCategory)),
    documentId: Type.Optional(Identifier),
    from: Type.Optional(Type.String({ format: 'date-time' })),
    to: Type.Optional(Type.String({ format: 'date-time' })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000, default: 1_000 })),
  },
  { $id: 'GovernanceChangeHistoryQuery', additionalProperties: false },
);
export type GovernanceChangeHistoryQuery = Static<typeof GovernanceChangeHistoryQuery>;

export const GovernanceChangeHistory = Type.Object(
  {
    schemaVersion: Type.Literal(GOVERNANCE_CHANGE_HISTORY_VERSION),
    events: Type.Array(Type.Ref(GovernanceChangeEvent), { maxItems: 10_000 }),
  },
  { $id: 'GovernanceChangeHistory', additionalProperties: false },
);

export const GOVERNANCE_CHANGE_HISTORY_REFERENCE_SCHEMAS: TSchema[] = [
  GovernanceChangeCategory,
  GovernanceChangeEvent,
];
export const GOVERNANCE_CHANGE_HISTORY_SCHEMAS: TSchema[] = [
  GovernanceChangeHistoryQuery,
  GovernanceChangeHistory,
];
