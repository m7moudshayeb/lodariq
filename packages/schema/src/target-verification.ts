import { Type, type Static } from '@sinclair/typebox';
import { TargetLocale, TargetViewportClass } from './target';

export const TARGET_RESOLUTION_STATUSES = [
  'found',
  'ambiguous',
  'missing',
  'needs_review',
] as const;
export const TARGET_SCORE_BUCKETS = ['high', 'medium', 'low'] as const;
export const TARGET_CANDIDATE_COUNT_BUCKETS = ['zero', 'one', 'many'] as const;
export const TARGET_VERIFICATION_REASON_CODES = [
  'resolved',
  'resolved_with_drift',
  'route_mismatch',
  'state_mismatch',
  'lifecycle_timeout',
  'no_candidates',
  'multiple_candidates',
  'low_confidence',
  'insufficient_margin',
  'not_visible',
  'not_actionable',
  'locale_unverified',
  'context_unverified',
  'unsupported_boundary',
  'scan_limit_exceeded',
  'evidence_drift',
  'identity_invalid',
] as const;

export const TargetResolutionStatus = Type.Union(
  TARGET_RESOLUTION_STATUSES.map((value) => Type.Literal(value)),
);
export type TargetResolutionStatus = Static<typeof TargetResolutionStatus>;

export const TargetScoreBucket = Type.Union(
  TARGET_SCORE_BUCKETS.map((value) => Type.Literal(value)),
);
export type TargetScoreBucket = Static<typeof TargetScoreBucket>;

export const TargetCandidateCountBucket = Type.Union(
  TARGET_CANDIDATE_COUNT_BUCKETS.map((value) => Type.Literal(value)),
);
export type TargetCandidateCountBucket = Static<typeof TargetCandidateCountBucket>;

export const TargetVerificationReasonCode = Type.Union(
  TARGET_VERIFICATION_REASON_CODES.map((value) => Type.Literal(value)),
);
export type TargetVerificationReasonCode = Static<typeof TargetVerificationReasonCode>;

const ObservationIdentifier = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});
const ObservationTimestamp = Type.String({
  minLength: 20,
  maxLength: 64,
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$',
});

/**
 * Privacy-safe evidence for factual target health. This intentionally carries
 * only opaque IDs, bounded verdicts, and context buckets: no customer text,
 * selectors, attributes, DOM fragments, screenshots, coordinates, or raw URLs.
 */
export const TargetVerificationObservation = Type.Object(
  {
    targetId: ObservationIdentifier,
    artifactId: ObservationIdentifier,
    environmentId: ObservationIdentifier,
    routePatternId: Type.Optional(ObservationIdentifier),
    stateId: Type.Optional(ObservationIdentifier),
    locale: Type.Optional(TargetLocale),
    viewportClass: Type.Optional(TargetViewportClass),
    result: TargetResolutionStatus,
    scoreBucket: TargetScoreBucket,
    candidateCountBucket: TargetCandidateCountBucket,
    reasonCode: TargetVerificationReasonCode,
    observedAt: ObservationTimestamp,
  },
  { $id: 'TargetVerificationObservation', additionalProperties: false },
);
export type TargetVerificationObservation = Static<typeof TargetVerificationObservation>;
