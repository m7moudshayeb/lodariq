# Phase 2 Technical Completion Plan

Source of truth: `../../refined-lodariq-prd.md` §§7.10, 11.3, 12, 16.4,
18.2, and 20, plus the implementation record in
`phase-2-brand-and-release-foundation.md`.

Status: **Current — Workstream 0 is complete. The full Node 24 `pnpm verify`
passes 18 typecheck tasks, 12 lint tasks, dependency boundaries and migration
safety, 86 Vitest files / 810 tests, 11 builds, runtime/authoring size gates, 95
prepared SDK assets, 77 Playwright tests with four intentional skips, and a
zero-vulnerability dependency audit. Workstream A is ready to begin.**

Last updated: 2026-08-09

## Scope

This plan finishes the remaining technical work from Phase 2 points 2, 3, 4,
and 6:

1. harden the three open Slice 3 paths;
2. implement Slice 4 reliability;
3. complete Lodariq's first clean-slate deployment; and
4. make CI, deployment gates, health checks, and current documentation truthful.

Point 5 is deliberately excluded. Product research, PMM/design-partner
usability sessions, pricing validation, and paid pilots remain separate evidence
work and are not deliverables or gates in this plan. Completing this plan does
not claim that product evidence has been collected.

The repository has never been deployed. Deployment therefore starts from an
empty database using only `packages/database/drizzle/0000_initial_baseline.sql`.
There is no historical schema upgrade, data backfill, compatibility window, or
migration rollback to execute. Once the first shared database is initialized,
the baseline becomes immutable and later schema changes use reviewed forward
migrations.

## Non-Negotiable Guardrails

- Canonical content remains structured block JSON and cross-system contracts
  remain closed TypeBox/JSON Schema contracts in `@lodariq/schema`.
- Product sampling and drift checks run only in authenticated authoring. Never
  persist raw CSS, selectors, class names, stylesheet text, DOM/HTML snapshots,
  URLs, screenshots used only for style drift, or coordinates as theme data.
- Preview uses the production runtime renderer. Production delivery never loads
  authoring, React, Lexical, sampling, or theme-editing code.
- Publishing compiles server-side. Promotion and rollback reuse an existing
  immutable artifact without recompilation or per-environment document/theme
  copies.
- Every release mutation requires an explicit capability, idempotency, expected-
  pointer compare-and-swap, correlation identity, and append-only history.
- Database access in deployed applications uses a non-owner role with forced
  row-level security. Shared-environment database changes require human approval.
- The dashboard, API, editor iframe, and CDN use separate exact
  `*.lodariq.com` origins. Dashboard and API deploy to Fly.io, not Vercel.

## Execution Order and Dependencies

| Order | Workstream                                | Depends on                                       | Exit gate                                                         |
| ----- | ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 0     | Stabilized repository baseline — complete | Current stabilization work                       | Node 24 `pnpm verify` is green and changes are reviewable         |
| 1     | Slice 3 hardening — ready                 | Order 0                                          | Preview, atomic persistence, and findings-presentation tests pass |
| 2     | Slice 4 core implementation               | Order 1                                          | Drift, release recovery, and analytics local gates pass           |
| 3     | Staging deployment/R2 decision            | Orders 1-2 plus operator-approved infrastructure | Live smokes pass and the measurement-backed R2 ADR is accepted    |
| 4     | Production first deployment               | Proven staging deployment and completed Slice 4  | Manual approval and internal-organization production smoke pass   |
| 5     | Repository truth and closeout             | Runs alongside 1-4; closes after 4               | CI protects `master`; automation and current docs match evidence  |

Do not start production deployment while a prior gate is incomplete. Repository
truth fixes that do not change runtime behavior may land alongside earlier
workstreams.

## Workstream A — Slice 3 Hardening

### A1. Refresh the matched-theme preview immediately

Deliverables:

- Treat the API's validated, persisted mutable-theme draft and revision as the
  result of accepting Product Match; do not reconstruct it from the proposal in
  the browser.
- Replace the active authoring theme state with that returned draft and patch the
  runtime-backed preview immediately, without reopening the editor or refreshing
  the customer page.
- Discard stale/out-of-order Product Match responses by request and draft
  revision so a slower response cannot overwrite newer authoring state.
- Preserve the existing accessible fallback when matching fails, and surface a
  focused retry/conflict state without changing an approved theme or live
  artifact.

Gate:

- Unit and hosted/direct authoring tests prove success, failure, stale-response,
  and revision-conflict behavior.
- Maintained fixtures show the returned draft in the production runtime renderer
  and meet the PRD's preview-update target of under 250 ms at p95.

### A2. Make draft and provenance persistence atomic

Deliverables:

- Introduce one database repository operation that, inside one transaction,
  locks or compare-and-swaps the expected mutable-draft revision, writes the
  normalized theme draft, inserts the complete bounded style-source provenance
  set, and advances the revision.
- Validate the closed semantic payload before entering the transaction. Keep raw
  sampled data outside persistence and logs.
- Roll back every write if the draft CAS, any provenance insert, or final
  invariant fails. Map stale revisions to a deterministic conflict response;
  retries must not create partial or duplicate provenance.
- Keep theme approval, default selection, acknowledgement, and publication as
  separate explicit mutations with no side effects from Product Match.

Gate:

- PostgreSQL integration tests cover success, stale CAS, concurrent acceptance,
  mid-transaction failure, retry/idempotency, tenant isolation, and forced RLS.
- A failed operation leaves both the draft revision and provenance collection
  unchanged; a successful operation commits both exactly once.

### A3. Keep exact-verification findings visible in the compact release flow

Deliverables:

- Present every bounded `release.findings` label and severity inside the active
  Release options workflow; do not rely on the currently unused legacy release
  strip component.
- Keep the compact authoring footer concise, but provide an accessible path from
  its blocked/current state to the complete finding list and affected viewport
  or target context.
- Preserve the closed, privacy-safe finding contract. Do not introduce raw DOM,
  selectors, CSS, screenshots, coordinates, or sampled page content into the
  release UI or persisted payload.

Gate:

- Direct and hosted authoring tests assert that warning and blocker labels from
  the exact browser report remain visible after publication state refreshes.
- Keyboard and screen-reader smoke coverage reaches the finding list from the
  compact Release status region and returns to authoring without losing state.

### Slice 3 done criteria

- A1, A2, and A3 pass in direct and hosted authoring paths.
- Package-boundary, TypeBox contract, migration-safety, privacy, and production-
  bundle checks remain green under the full Node 24 repository gate.
- The Phase 2 checkpoint and `docs/PROGRESS.md` record the completed gate without
  claiming deployed or product-research evidence.

## Workstream B — Slice 4 Reliability

### B1. Brand drift and acknowledgement

Deliverables:

- Compare normalized style-source fingerprints when authenticated authoring
  opens and when a creator explicitly chooses **Check brand**. Do not run
  sampling in the ordinary production runtime.
- Classify unchanged, warning, and actionable drift with provenance and
  confidence. Maintain a false-positive fixture corpus with a target below five
  percent.
- Turn actionable drift into a reviewable mutable-draft proposal showing changed
  semantic tokens, affected experiences, runtime before/after preview, and
  accessibility consequences. Never mutate an approved theme or artifact
  automatically.
- When a new immutable theme is approved, mark workspace-current documents
  `needs review`; require explicit document acknowledgement before a later
  publish. Pinned documents remain pinned.

Gate: contract, repository/RLS, authoring, accessibility, and maintained drift-
fixture tests pass, including zero live-theme mutation from detection alone.

### B2. Rollback and unpublish

Deliverables:

- Add contextual history, rollback, and unpublish controls for authorized admins
  and owners, with confirmation and a required reason.
- Rollback selects a prior successful publication for the same
  workspace/environment/document, appends a new operation referencing its exact
  artifact, and compare-and-swaps the pointer. It performs zero compiler calls.
- Unpublish appends an auditable operation, increments the generation, makes the
  pointer inactive, and preserves artifacts, history, and analytics.
- Preserve idempotency replay/conflict behavior, exact target environment,
  expected generation or active publication, and capability denial across API,
  hosted authoring, and dashboard administration.

Gate: concurrency, stale-generation, replay/conflict, cross-document/environment,
capability, inactive-pointer, zero-recompile, and controlled pointer-convergence
tests pass. The staging acceptance gate must then demonstrate deployed rollback
and unpublish convergence within 60 seconds.

### B3. Analytics isolation

Deliverables:

- Derive and stamp `workspaceId`, `environmentId`, `documentId`,
  `publicationId`, and `contentHash` from the resolved server-side token/pointer;
  ignore or reject client-supplied environment/publication identity.
- Preserve those dimensions through ingestion, storage, queries, and release
  history. Keep staging and production aggregations separate by default.
- Add bounded, privacy-safe diagnostics for invalid or stale publication
  context without recording credentials or prohibited host-page data.

Gate: spoofing, stale-pointer, tenant-RLS, environment-isolation, aggregation,
and rollback/unpublish continuity tests pass; no default query merges staging
and production.

### B4. Decide on publication artifact/pointer materialization

Keep PostgreSQL deployment rows authoritative initially. Before adding an R2
outbox, capture staging measurements for artifact/pointer request volume,
latency, database load, cache behavior, retry needs, and the 60-second global
convergence requirement. Record the decision in an ADR.

- If PostgreSQL delivery meets the measured operating target, close this item
  with the ADR and do not add R2, Redis, or another queue.
- If measurements show a concrete delivery or availability need, implement an
  idempotent PostgreSQL outbox to materialize immutable artifacts and short-lived
  pointers to R2. The database remains authoritative; retries must converge and
  never recompile. Do not introduce Redis for this workflow.

Prepared SDK/runtime assets may still use the configured CDN delivery path;
that is distinct from optional publication pointer materialization.

### Slice 4 done criteria

- B1-B3 local gates pass before staging. Their live acceptance checks pass in
  staging, and B4 has a measurement-backed ADR before production, with
  implementation only when the ADR demonstrates need.
- Release recovery preserves immutable history, analytics attribution, tenant
  isolation, and the exact approved theme/renderer contract.
- Full repository verification is green before staging deployment.

## Workstream C — Clean-Slate First Deployment

### C1. Provision staging infrastructure

Deliverables:

- Provision isolated staging Fly apps for API, dashboard, and editor; an empty
  staging Neon database; exact Cloudflare DNS/TLS routes for
  `staging-api.lodariq.com`, `staging-app.lodariq.com`,
  `staging-editor.lodariq.com`, and `staging-cdn.lodariq.com`; and the required
  SDK asset delivery path.
- Apply `0000_initial_baseline.sql` exactly once with an owner/admin connection.
  Do not run historical migrations, backfills, compatibility cleanup, or a
  destructive rollback script.
- Provision a staging non-owner runtime role, confirm `BYPASSRLS` is disabled,
  store only that role's URL as the API `DATABASE_URL`, and run the live forced-
  RLS cross-tenant/scratch-row verification.
- Configure separate staging secrets for database access, API/dashboard BFF
  authentication, sessions, exact public origins, creator module integrity, and
  error reporting. Never put credentials in URLs, client bundles, logs, or the
  editor service.
- Verify the Resend domain and from address. Keep email delivery, public signup,
  and recovery disabled for the migration-only smoke, then enable matching API
  and dashboard capability modes together for the email/auth smoke.

### C2. Staging deploy and smoke gate

Run the deployment in this order: database baseline and RLS verification; CDN
assets; editor; API; dashboard; health/readiness checks; capability enablement;
then end-to-end smoke.

Required evidence:

- TLS and exact-origin checks pass for all staging origins; API `/healthz` and
  `/openapi.json`, editor `/authoring.html`, dashboard, and prepared SDK assets
  return the expected cache and security behavior.
- Signup/verification, sign-in, recovery, session rotation, workspace selection,
  email outbox delivery/retry, and API/dashboard BFF boundaries pass using
  non-owner database access.
- The permanently installed SDK on an exact allowlisted staging origin exposes
  the launcher; popup exchange is source/state/origin-bound and single use; the
  exact editor iframe receives activation once and owns the authoring bearer in
  memory.
- Production bootstrap fixtures expose no launcher, activation, creator-module,
  or editor metadata, and normal delivery contains no authoring bundle.
- An internal document completes match/preview, staging publish, exact browser
  verification, same-artifact promotion, analytics stamping, rollback, and
  unpublish without implicit publication or recompilation.
- B4's staging measurements are recorded and its PostgreSQL-versus-R2 ADR is
  accepted before production infrastructure is approved.
- Logs, release IDs, screenshots where allowed, and command output are captured
  as dated evidence without secrets or prohibited customer-page data.

### C3. Production provision and first deploy

After the staging gate passes, provision separate production Fly apps, empty
production Neon database and non-owner role, production secrets, Resend config,
SDK/CDN assets, and exact TLS origins at `api.lodariq.com`, `app.lodariq.com`,
`editor.lodariq.com`, and `cdn.lodariq.com`. Apply the same immutable baseline
once to the empty production database.

Production requires a named human approval after reviewing the exact commit,
artifact manifests, staging evidence, database target, RLS report, origin
matrix, secrets/capability matrix, and recovery procedure. Deploy in the same
dependency order as staging, begin with public auth capabilities disabled,
enable coordinated modes only after core health checks pass, then run the
bounded smoke with an internal organization. A failed gate disables the affected
capability or restores the prior application release; it does not attempt to
reverse the initial schema baseline.

### First-deployment done criteria

- Staging and production each have one recorded baseline application, a verified
  non-owner runtime role, forced RLS evidence, separate secrets/data, and exact
  healthy origins.
- Auth/email, canonical authoring entry, delivery, release, analytics, rollback,
  and unpublish smokes pass without leaking credentials or loading authoring code
  in production delivery.
- The baseline is frozen after first shared use; later database work is planned
  as forward migrations only.

## Workstream D — Repository Truth and Automation

Deliverables:

- Change `.github/workflows/verify.yml` push protection from stale `main` to the
  repository's default branch, `master`, while keeping pull-request verification
  on Node 24. Require the green verify job before merge.
- Add deploy automation that consumes immutable build/SDK manifests, targets the
  explicit staging or production app/origin matrix, runs health and smoke gates,
  and records the deployed commit. Production uses a protected environment with
  manual approval; CI never applies a database baseline implicitly.
- Make service health checks useful: process liveness plus dependency readiness
  where required, with no secret/config disclosure. Fly checks and deployment
  automation must probe the separate API, dashboard, editor, and asset origins.
- Add a first-deployment checklist that requires explicit confirmation of the
  empty database before offering the one-time baseline command, then records RLS,
  capability, DNS/TLS, email, and smoke evidence.
- Reconcile current documentation and status tables with the single
  `0000_initial_baseline.sql`, completed Slice 3/4 gates, and actual deployed
  evidence. Preserve dated/archive records as history; remove stale claims only
  from current operational guidance.
- Keep `pnpm migrations:check`, baseline-content/RLS tests, package-boundary
  checks, production-bundle gates, `git diff --check`, and the full Node 24
  `pnpm verify` in the closeout gate.

Done criteria:

- A push or pull request targeting `master` runs the required verification;
  staging deployment is repeatable; production cannot proceed without manual
  approval and passing health/smoke gates.
- Current plans, progress, database guidance, and deployment guidance agree on
  what is implemented, locally verified, deployed, and still unproven.
- No automation assumes historical migrations or applies schema changes to a
  shared environment without an explicit operator decision.

## Final Completion Record

Close this plan only when all four workstreams have their dated evidence linked
from `docs/PROGRESS.md`, the full repository gate is green, and the worktree is
clean. The completion record must distinguish local verification from staging
and production proof and must repeat that point 5 product research/paid-pilot
evidence was outside this technical scope.
