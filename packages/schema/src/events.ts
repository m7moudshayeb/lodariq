import { Type, type Static } from '@sinclair/typebox';

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

/** Selector diagnostic event for resolver observability (PRD §15). */
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
