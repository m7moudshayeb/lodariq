import { Type, type Static } from '@sinclair/typebox';
import { ANALYTICS_EVENT_LIMITS, ANALYTICS_INGEST_DIAGNOSTIC_CODES } from './events-runtime';
import { TargetLocale, TargetSignalFamily, TargetViewportClass } from './target';
import { ContentLocale } from './document-localization';
import {
  TARGET_RESOLUTION_STATUSES,
  TargetCandidateCountBucket,
  TargetResolutionStatus,
  TargetScoreBucket,
  TargetVerificationReasonCode,
} from './target-verification';

/**
 * Analytics / debug events batched by the runtime (PRD §9.3, §15).
 * Delivered over batched HTTP + sendBeacon, never WebSockets (PRD §11.1).
 */
export const AnalyticsEvent = Type.Object(
  {
    name: Type.String(),
    documentId: Type.Optional(Type.String()),
    stepId: Type.Optional(Type.String()),
    /** SDK version in every event (PRD §15). */
    sdkVersion: Type.String(),
    correlationId: Type.Optional(Type.String()),
    timestamp: Type.String(),
    props: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { $id: 'AnalyticsEvent' },
);
export type AnalyticsEvent = Static<typeof AnalyticsEvent>;

export {
  ANALYTICS_EVENT_LIMITS,
  ANALYTICS_FORBIDDEN_PAYLOAD_KEYS,
  ANALYTICS_INGEST_DIAGNOSTIC_CODES,
  ANALYTICS_RESERVED_IDENTITY_KEYS,
} from './events-runtime';

const AnalyticsIdentifier = Type.String({
  minLength: 1,
  maxLength: ANALYTICS_EVENT_LIMITS.identifierLength,
});
const AnalyticsContentHash = Type.String({ pattern: '^sha256-[0-9a-f]{64}$' });

/** Privacy-safe, bounded JSON values accepted as event properties. */
export const AnalyticsPropertyValue = Type.Recursive(
  (Self) =>
    Type.Union([
      Type.String({ maxLength: ANALYTICS_EVENT_LIMITS.stringLength }),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
      Type.Array(Self, { maxItems: ANALYTICS_EVENT_LIMITS.arrayLength }),
      Type.Record(
        Type.String({
          minLength: 1,
          maxLength: ANALYTICS_EVENT_LIMITS.propertyKeyLength,
        }),
        Self,
        { maxProperties: ANALYTICS_EVENT_LIMITS.propertyCount },
      ),
    ]),
  { $id: 'AnalyticsPropertyValue' },
);
export type AnalyticsPropertyValue = Static<typeof AnalyticsPropertyValue>;

export const AnalyticsEventProperties = Type.Record(
  Type.String({
    minLength: 1,
    maxLength: ANALYTICS_EVENT_LIMITS.propertyKeyLength,
  }),
  AnalyticsPropertyValue,
  {
    $id: 'AnalyticsEventProperties',
    maxProperties: ANALYTICS_EVENT_LIMITS.propertyCount,
  },
);
export type AnalyticsEventProperties = Static<typeof AnalyticsEventProperties>;

/**
 * An untrusted assertion about the document pointer that produced an event.
 * The server must compare all three fields with the current active pointer;
 * none of these values are copied into storage before that comparison passes.
 */
export const AnalyticsPointerAssertion = Type.Object(
  {
    generation: Type.Integer({ minimum: 1 }),
    publicationId: AnalyticsIdentifier,
    contentHash: AnalyticsContentHash,
  },
  { $id: 'AnalyticsPointerAssertion', additionalProperties: false },
);
export type AnalyticsPointerAssertion = Static<typeof AnalyticsPointerAssertion>;

/** Server-issued pointer descriptor cached by the runtime for event assertions. */
export const AnalyticsDocumentPointer = Type.Object(
  {
    documentId: AnalyticsIdentifier,
    generation: Type.Integer({ minimum: 1 }),
    publicationId: AnalyticsIdentifier,
    contentHash: AnalyticsContentHash,
  },
  { $id: 'AnalyticsDocumentPointer', additionalProperties: false },
);
export type AnalyticsDocumentPointer = Static<typeof AnalyticsDocumentPointer>;

/**
 * Identity-free SDK wire event. `documentId` selects a server-owned pointer;
 * `pointer` only asserts which immutable publication the client rendered.
 * Workspace and environment identity never come from the customer page.
 */
export const SdkAnalyticsEvent = Type.Object(
  {
    name: Type.String({
      minLength: 1,
      maxLength: ANALYTICS_EVENT_LIMITS.eventNameLength,
      pattern: '^[a-z][a-z0-9_.-]*$',
    }),
    documentId: AnalyticsIdentifier,
    pointer: AnalyticsPointerAssertion,
    stepId: Type.Optional(AnalyticsIdentifier),
    sdkVersion: Type.String({ minLength: 1, maxLength: 128 }),
    correlationId: Type.Optional(
      Type.String({ minLength: 1, maxLength: ANALYTICS_EVENT_LIMITS.correlationIdLength }),
    ),
    timestamp: Type.String({ format: 'date-time' }),
    props: Type.Optional(AnalyticsEventProperties),
  },
  { $id: 'SdkAnalyticsEvent', additionalProperties: false },
);
export type SdkAnalyticsEvent = Static<typeof SdkAnalyticsEvent>;

/** Server-owned identity persisted after the current pointer assertion passes. */
export const AuthoritativeAnalyticsEvent = Type.Object(
  {
    workspaceId: AnalyticsIdentifier,
    environmentId: AnalyticsIdentifier,
    documentId: AnalyticsIdentifier,
    publicationId: AnalyticsIdentifier,
    contentHash: AnalyticsContentHash,
    pointerGeneration: Type.Integer({ minimum: 1 }),
    name: Type.String({
      minLength: 1,
      maxLength: ANALYTICS_EVENT_LIMITS.eventNameLength,
      pattern: '^[a-z][a-z0-9_.-]*$',
    }),
    stepId: Type.Optional(AnalyticsIdentifier),
    sdkVersion: Type.String({ minLength: 1, maxLength: 128 }),
    correlationId: Type.Optional(
      Type.String({ minLength: 1, maxLength: ANALYTICS_EVENT_LIMITS.correlationIdLength }),
    ),
    timestamp: Type.String({ format: 'date-time' }),
    props: Type.Optional(AnalyticsEventProperties),
  },
  { $id: 'AuthoritativeAnalyticsEvent', additionalProperties: false },
);
export type AuthoritativeAnalyticsEvent = Static<typeof AuthoritativeAnalyticsEvent>;

export const AnalyticsIngestDiagnosticCode = Type.Union(
  ANALYTICS_INGEST_DIAGNOSTIC_CODES.map((code) => Type.Literal(code)),
  { $id: 'AnalyticsIngestDiagnosticCode' },
);
export type AnalyticsIngestDiagnosticCode = Static<typeof AnalyticsIngestDiagnosticCode>;

/** Fixed-code, count-only diagnostics intentionally carry no client values. */
export const AnalyticsIngestDiagnostic = Type.Object(
  {
    code: AnalyticsIngestDiagnosticCode,
    count: Type.Integer({ minimum: 1, maximum: ANALYTICS_EVENT_LIMITS.batchSize }),
  },
  { $id: 'AnalyticsIngestDiagnostic', additionalProperties: false },
);
export type AnalyticsIngestDiagnostic = Static<typeof AnalyticsIngestDiagnostic>;

export const AnalyticsIngestResult = Type.Object(
  {
    accepted: Type.Integer({ minimum: 0, maximum: ANALYTICS_EVENT_LIMITS.batchSize }),
    rejected: Type.Integer({ minimum: 0, maximum: ANALYTICS_EVENT_LIMITS.batchSize }),
    diagnostics: Type.Array(AnalyticsIngestDiagnostic, {
      maxItems: ANALYTICS_INGEST_DIAGNOSTIC_CODES.length,
    }),
  },
  { $id: 'AnalyticsIngestResult', additionalProperties: false },
);
export type AnalyticsIngestResult = Static<typeof AnalyticsIngestResult>;

/**
 * Analytics reads always select exactly one environment. Requiring the field
 * in the canonical contract prevents staging and production from being merged
 * by an omitted/default filter.
 */
export const AnalyticsEnvironmentQuery = Type.Object(
  {
    environmentId: AnalyticsIdentifier,
    documentId: Type.Optional(AnalyticsIdentifier),
    publicationId: Type.Optional(AnalyticsIdentifier),
    contentHash: Type.Optional(AnalyticsContentHash),
    locale: Type.Optional(Type.Ref(ContentLocale)),
    from: Type.Optional(Type.String({ format: 'date-time' })),
    to: Type.Optional(Type.String({ format: 'date-time' })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000 })),
  },
  { $id: 'AnalyticsEnvironmentQuery', additionalProperties: false },
);
export type AnalyticsEnvironmentQuery = Static<typeof AnalyticsEnvironmentQuery>;

/**
 * One environment-scoped analytics aggregate. Every immutable release
 * dimension is retained so rollback generations and equal-content
 * publications are never collapsed into an invented cross-release total.
 */
export const ANALYTICS_TARGET_RESOLUTION_STATUSES = [
  ...TARGET_RESOLUTION_STATUSES,
  'unknown',
] as const;
export const AnalyticsTargetResolutionStatus = Type.Union(
  ANALYTICS_TARGET_RESOLUTION_STATUSES.map((status) => Type.Literal(status)),
);
export type AnalyticsTargetResolutionStatus = Static<typeof AnalyticsTargetResolutionStatus>;

const AnalyticsAggregateDimensions = {
  workspaceId: AnalyticsIdentifier,
  environmentId: AnalyticsIdentifier,
  documentId: AnalyticsIdentifier,
  publicationId: AnalyticsIdentifier,
  contentHash: AnalyticsContentHash,
  pointerGeneration: Type.Integer({ minimum: 1 }),
  locale: Type.Optional(Type.Ref(ContentLocale)),
  count: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  firstTimestamp: Type.String({ format: 'date-time' }),
  lastTimestamp: Type.String({ format: 'date-time' }),
};

export const AnalyticsEventAggregate = Type.Union(
  [
    Type.Object(
      {
        ...AnalyticsAggregateDimensions,
        name: Type.Literal('target_resolution'),
        targetResolutionStatus: AnalyticsTargetResolutionStatus,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...AnalyticsAggregateDimensions,
        name: Type.String({
          minLength: 1,
          maxLength: ANALYTICS_EVENT_LIMITS.eventNameLength,
          pattern: '^(?!target_resolution$)[a-z][a-z0-9_.-]*$',
        }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'AnalyticsEventAggregate' },
);
export type AnalyticsEventAggregate = Static<typeof AnalyticsEventAggregate>;

/** Closed API response for a single explicitly selected environment. */
export const AnalyticsAggregateResponse = Type.Object(
  {
    aggregates: Type.Array(AnalyticsEventAggregate, {
      maxItems: 1_000,
    }),
  },
  { $id: 'AnalyticsAggregateResponse', additionalProperties: false },
);
export type AnalyticsAggregateResponse = Static<typeof AnalyticsAggregateResponse>;

/** Legacy Phase 1 selector diagnostic event retained for immutable readers. */
export const SelectorDiagnosticEvent = Type.Object(
  {
    documentId: Type.String(),
    stepId: Type.String(),
    resolutionMethod: Type.String(),
    confidence: Type.Number(),
    candidateCount: Type.Number(),
    primarySelectorFailed: Type.Boolean(),
    sdkVersion: Type.String(),
  },
  { $id: 'SelectorDiagnosticEvent' },
);
export type SelectorDiagnosticEvent = Static<typeof SelectorDiagnosticEvent>;

/**
 * Privacy-safe Target Identity V2 observability. It carries bounded outcomes,
 * never selectors, DOM, customer text, coordinates, URLs, or screenshots.
 */
export const TargetDiagnosticEvent = Type.Object(
  {
    documentId: Type.String(),
    stepId: Type.String(),
    targetId: Type.String(),
    result: TargetResolutionStatus,
    reasonCode: TargetVerificationReasonCode,
    evidenceFamilies: Type.Array(TargetSignalFamily, {
      maxItems: 8,
      uniqueItems: true,
    }),
    scoreBucket: TargetScoreBucket,
    candidateCountBucket: TargetCandidateCountBucket,
    locale: Type.Optional(TargetLocale),
    viewportClass: Type.Optional(TargetViewportClass),
    sdkVersion: Type.String(),
  },
  { $id: 'TargetDiagnosticEvent', additionalProperties: false },
);
export type TargetDiagnosticEvent = Static<typeof TargetDiagnosticEvent>;
