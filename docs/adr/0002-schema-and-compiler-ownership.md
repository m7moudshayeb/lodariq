# 0002. Schema and compiler as a shared isomorphic core

- Status: Accepted
- PRD references: §9.1, §11.1, §12.1

## Context

The same contracts and compile logic are needed in the browser (preview) and on
the server (trusted publication). Duplicating them risks drift.

## Decision

`@talmeh/schema` owns canonical TypeBox/JSON Schema contracts (documents,
blocks, targets, compiled JSON, bridge messages, catalog, events) with zero
runtime deps beyond TypeBox. `@talmeh/compiler` is a pure isomorphic function
from canonical block JSON to delivery JSON with no DOM or Node-only deps. Both
are consumed by the SDK and the server worker.

## Consequences

- The iframe and host bridge validate against exactly the same message schemas.
- Zod is not the canonical cross-system contract; it is limited to dashboard
  form ergonomics (§20).
- dependency-cruiser enforces schema's dep ceiling and the compiler's purity.
