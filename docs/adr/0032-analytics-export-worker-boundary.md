# 0032. Analytics export generation worker boundary

- Status: Accepted
- Date: 2026-08-23
- PRD references: §10.2, §17.3, §20
- Related: ADR 0012 (deferred vendor triggers)

## Context

Analytics export jobs already have durable database leases, authorization
checks, bounded source reads, and idempotent completion. The remaining M16
problem is CPU-heavy JSONL/CSV formatting on the API event loop. A separate
deployable would add another Fly app, process lifecycle, and coordination path
before the export volume justifies that operational cost.

## Decision

Deployed analytics export formatting runs in a Node worker thread inside the
API process. The main thread retains job claiming, source reads, authorization,
lease renewal, completion, and failure recording. It sends the already-scoped
source payload to a short-lived worker, which returns only the generated
artifact or a typed generation error. Every deployment takes the worker-thread
path — development and staging included; the source tree takes the synchronous
one for deterministic debugging, and the worker mechanics are covered by tests
that spawn real threads against an injected entrypoint.

The worker is a separately bundled deployment entrypoint, so the API image
contains the worker code without requiring a second service. Existing job
batch bounds remain the concurrency guard. If payload cloning or sustained
export volume later becomes the bottleneck, the same generation boundary can
move to a dedicated worker deployment without changing the job contract.

### The switch is neither `NODE_ENV` nor a file extension

Every Lodariq tier sets `NODE_ENV=production` — `fly.development.toml`,
`fly.staging.toml` and `fly.toml` alike, and `check-runtime-env.mjs` refuses to
start without it. Keying the path on it would therefore name "deployed" while
reading as "the production tier", and would leave local runs and CI on a path
no deployment takes.

So the mode asks whether the worker entrypoint is on disk. Not whether this
file was bundled — an extension check answers that, and the two only agree while
the tsup entry keeps the name the spawn uses. Nothing enforces that agreement:
the response type crosses the boundary as `import type` and erases, so deleting
the entry from `tsup.config.ts` builds, typechecks and deploys green. Under an
extension check that ships a bundle where every export job fails; under the
probe it falls back to the inline path and exports keep running.
`LODARIQ_ANALYTICS_EXPORT_GENERATION=inline|worker` overrides the probe in
either direction, so an operator can fall back without a redeploy.

## Consequences

- CPU-heavy formatting no longer monopolizes the Fastify event loop during
  production exports.
- Database credentials, provider clients, bearer tokens, and repository access
  stay on the main thread.
- There is no new queue, Redis dependency, Fly app, or shared mutable state.
- Worker failure is recorded as a job failure and the durable lease remains the
  recovery mechanism. Every terminal outcome settles: a worker that exits
  cleanly without answering, and a generation that exceeds its budget, both
  fail the attempt rather than leaving the promise pending — `runOnce` only
  re-arms its timer in a `finally`, so an unsettled generation would stop the
  process running any further exports at all.
