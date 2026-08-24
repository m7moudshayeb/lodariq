import { Type, type Static } from '@sinclair/typebox';
import { ContentLocale } from './document-localization';

export const AI_REWRITE_VERBS = [
  'shorter',
  'clearer',
  'more-formal',
  'friendlier',
  'fix-grammar',
] as const;
export type AiRewriteVerb = (typeof AI_REWRITE_VERBS)[number];

const StepId = Type.String({ minLength: 1, maxLength: 256 });
const StepIds = Type.Array(StepId, { minItems: 1, maxItems: 100, uniqueItems: true });

export const AiTargetContext = Type.Object(
  {
    accessibleName: Type.String({ minLength: 1, maxLength: 500 }),
    role: Type.String({ minLength: 1, maxLength: 100 }),
    nearbyText: Type.Optional(Type.String({ maxLength: 1_000 })),
  },
  { $id: 'AiTargetContext', additionalProperties: false },
);
export type AiTargetContext = Static<typeof AiTargetContext>;

export const AiAssistRequest = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal('rewrite'),
        scope: Type.Literal('selection'),
        verb: Type.Union(AI_REWRITE_VERBS.map((verb) => Type.Literal(verb))),
        text: Type.String({ minLength: 1, maxLength: 10_000 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('draft-step'),
        scope: Type.Literal('step'),
        stepId: StepId,
        target: Type.Ref(AiTargetContext),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('command'),
        scope: Type.Union([Type.Literal('selection'), Type.Literal('step'), Type.Literal('batch')]),
        prompt: Type.String({ minLength: 1, maxLength: 400 }),
        stepIds: StepIds,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('translate'),
        scope: Type.Literal('batch'),
        locale: Type.Ref(ContentLocale),
        stepIds: StepIds,
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'AiAssistRequest' },
);
export type AiAssistRequest = Static<typeof AiAssistRequest>;

export const AiAssistEdit = Type.Object(
  {
    path: Type.String({ minLength: 1, maxLength: 300 }),
    before: Type.String({ maxLength: 10_000 }),
    after: Type.String({ maxLength: 10_000 }),
    locale: Type.Optional(Type.Ref(ContentLocale)),
  },
  { $id: 'AiAssistEdit', additionalProperties: false },
);
export type AiAssistEdit = Static<typeof AiAssistEdit>;

export const AiAssistProposal = Type.Object(
  {
    proposalId: Type.String({ minLength: 1, maxLength: 128 }),
    summary: Type.String({ minLength: 1, maxLength: 240 }),
    edits: Type.Array(Type.Ref(AiAssistEdit), { minItems: 1, maxItems: 100 }),
  },
  { $id: 'AiAssistProposal', additionalProperties: false },
);
export type AiAssistProposal = Static<typeof AiAssistProposal>;

export const AuthoringAssistOperationRequest = Type.Object(
  {
    operationId: Type.String({
      minLength: 25,
      maxLength: 128,
      pattern: '^aiop_[A-Za-z0-9_-]{20,}$',
    }),
    request: Type.Ref(AiAssistRequest),
  },
  { $id: 'AuthoringAssistOperationRequest', additionalProperties: false },
);
export type AuthoringAssistOperationRequest = Static<typeof AuthoringAssistOperationRequest>;

export const AuthoringAssistOperationResult = Type.Object(
  {
    operationId: AuthoringAssistOperationRequest.properties.operationId,
    proposal: Type.Ref(AiAssistProposal),
    replayed: Type.Boolean(),
  },
  { $id: 'AuthoringAssistOperationResult', additionalProperties: false },
);
export type AuthoringAssistOperationResult = Static<typeof AuthoringAssistOperationResult>;
