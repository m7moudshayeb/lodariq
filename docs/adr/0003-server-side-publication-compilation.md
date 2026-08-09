# 0003. Server-side publication compilation

- Status: Accepted
- PRD references: §9.1, §11.3, §20
- Extended by: [ADR 0014](0014-environment-document-release-pointers.md)

## Context

Compiled documents drive runtime execution. A browser-produced artifact cannot
be trusted as the publication of record.

## Decision

Real publications are compiled server-side and stored as immutable,
content-addressed (`sha256-…`) objects, with a tiny manifest pointer for
rollback. Browser compilation (`@lodariq/compiler` via `sdk-runtime/local-dev`)
is preview-only.

## Consequences

- Rollback is a manifest pointer update; no recompilation, no broad CDN
  invalidation.
- The active pointer is document-specific within a product environment;
  environment-global current-document lookup is only a Phase 1 compatibility
  limitation.
- Do not compile a real publication artifact in the browser (§20).
