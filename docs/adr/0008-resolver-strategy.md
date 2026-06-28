# 0008. Confidence-scored semantic resolver

- Status: Accepted
- PRD references: §8.1–§8.6, §20

## Context

CSS-first ordered fallback chains are brittle and dangerous; coordinates must
never trigger production clicks.

## Decision

Resolve targets by scoring candidates against a semantic `ElementFingerprint`
(stable attributes, role + accessible name, label/placeholder/title/alt,
landmarks, nearby text, tag/type, scoped CSS). Resolution succeeds only when the
top score clears a confidence threshold AND clearly beats the runner-up, the
candidate is visible, and (when interaction is required) enabled. Coordinates
are diagnostic only. A runtime lifecycle layer handles route readiness, scroll
containers, and virtualized/lazy UI before scoring.

## Consequences

- Resolver emits found / missing / ambiguous diagnostics for observability.
- Do not ship target resolution without lifecycle waits and failure diagnostics
  (§20).
