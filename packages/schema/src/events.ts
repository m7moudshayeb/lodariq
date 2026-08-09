import { Type, type Static } from '@sinclair/typebox';
import { TargetLocale, TargetSignalFamily, TargetViewportClass } from './target';
import {
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
