# 0014. Environment/document release pointers and exact-artifact promotion

- Status: Accepted
- PRD references: §3.2, §10, §11.3, §16.4, §20
- Extends: ADR 0003

## Context

ADR 0003 established server-side content-addressed publication and mutable
manifest pointers, but the Phase 1 implementation resolves the current
publication only by workspace and environment. That supports one effective
active document per environment and cannot safely deliver a broad experience
catalog.

An environment selector alone also cannot prove that production received the
artifact verified in staging. Recompiling, copying documents, or re-entering
configuration during release creates drift and avoidable risk.

## Decision

The active deployment key is:

```text
(workspaceId, environmentId, documentId)
```

- Documents and compiled artifacts are not copied per environment.
- Publishing compiles a persisted document version and exact approved theme on
  the server, persists an immutable artifact, appends an immutable publication,
  and atomically advances the environment/document pointer.
- Promotion requires an explicit active/verified source publication and creates
  a target publication referencing the exact same `compiledArtifactId` and
  `contentHash`. Source provenance is constrained to the same workspace and
  document, but intentionally not the destination environment, so a production
  publication can reference staging. Promotion never calls the compiler.
- Rollback appends a new release event referencing an earlier artifact and
  atomically moves the pointer. It never mutates history or recompiles.
- Unpublish creates an auditable inactive pointer state without deleting
  history.
- Every release mutation uses explicit capabilities, an idempotency key,
  request hash, correlation ID, and compare-and-swap deployment generation.
- Verification and approvals bind to one exact publication/hash and become
  invalid after any content, target, behavior, theme, or renderer-contract
  change.
- SDK-token creation, environment creation, editor launch, and authoring-session
  creation are independent operations and never publish implicitly.
- Runtime analytics context is stamped by the server from the resolved
  environment token and deployment pointer.
- Product environments remain distinct from Lodariq control-plane deployment
  environments.

## Consequences

- Multiple documents can be live simultaneously in one product environment.
- Staging and production can intentionally point to different versions while
  promotion retains exact-artifact identity.
- Rollback/unpublish remain cheap pointer operations with immutable audit
  history.
- Because Lodariq has never initialized a shared database, the former
  environment-global current-document model requires no compatibility migration;
  the document-scoped model is part of the sole clean-slate
  `0000_initial_baseline.sql`.
- New deployment, release-operation, verification, and approval records must be
  workspace-scoped and protected by PostgreSQL RLS.
- The clean-slate baseline creates no historical publication rows and performs no
  backfill. After the first shared database is initialized, later schema changes
  use reviewed forward migrations.
