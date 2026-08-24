# Phase 2 Technical Completion Plan

Source of truth: `../../refined-lodariq-prd.md` §§7.10, 11.3, 12, 16.4,
18.2, and 20, plus the implementation record in
`phase-2-brand-and-release-foundation.md`.

Status: **Development and staging are deployed; production is not. Workstreams A
and B1-B3 are implemented and the repository/automation code is reconciled.
Workstream C's staging provisioning (C1-C2) is complete — which is what makes
`0000_initial_baseline.sql` immutable. The open work is Workstream E, which takes
the `cursor-on-popup-editor` branch and its 48 review findings to merged and
deployed, and then C3 production.**

Deployed environments:

| Environment | Dashboard                         | API                              | State        |
| ----------- | --------------------------------- | -------------------------------- | ------------ |
| Development | <https://dev-app.lodariq.io/>     | <https://dev-api.lodariq.io>     | Deployed     |
| Staging     | <https://staging-app.lodariq.io/> | <https://staging-api.lodariq.io> | Deployed     |
| Production  | —                                 | —                                | Not deployed |

Last updated: 2026-08-23

## Scope

This plan finishes the remaining technical work from Phase 2 points 2, 3, 4,
and 6:

1. harden the three open Slice 3 paths;
2. implement Slice 4 reliability;
3. complete Lodariq's first deployment — development and staging are done, and
   production remains; and
4. make CI, deployment gates, health checks, and current documentation truthful.

Point 5 is deliberately excluded. Product research, PMM/design-partner
usability sessions, pricing validation, and paid pilots remain separate evidence
work and are not deliverables or gates in this plan. Completing this plan does
not claim that product evidence has been collected.

Development and staging are deployed and carry real data:

- Development dashboard: <https://dev-app.lodariq.io/> (API
  <https://dev-api.lodariq.io>)
- Staging dashboard: <https://staging-app.lodariq.io/> (API
  <https://staging-api.lodariq.io>)

The first shared databases are therefore already initialized, and
`packages/database/drizzle/0000_initial_baseline.sql` is immutable. Editing the
baseline no longer changes any deployed database: a deployed environment applied
the baseline as it stood at initialization and will never re-read the file.
Every schema change from here is a reviewed, numbered forward migration, and any
edit already made to the baseline needs a forward migration that reproduces it.
Production remains undeployed.

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
  `*.lodariq.io` origins. Dashboard and API deploy to Fly.io, not Vercel.

## Execution Order and Dependencies

| Order | Workstream                                                  | Depends on                                       | Exit gate                                                               |
| ----- | ----------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| 0     | Stabilized repository baseline — complete                   | Current stabilization work                       | Node 24 `pnpm verify` is green and changes are reviewable               |
| 1     | Slice 3 hardening — complete                                | Order 0                                          | Preview, atomic persistence, and findings-presentation tests pass       |
| 2     | Slice 4 local implementation — complete                     | Order 1                                          | Drift, release recovery, and analytics local gates pass                 |
| 3     | Development/staging provisioning (C1-C2) — complete         | Orders 1-2 plus operator-approved infrastructure | Both environments deployed; the baseline is applied and now immutable   |
| 4     | **E0-E5 — branch remediation, code only**                   | Order 3                                          | 48 findings closed except deferrals; suite deterministic and green      |
| 5     | **E6 — merge, then deploy the branch to dev, then staging** | Order 4                                          | Drift audit recorded, existing schema applied, live smokes pass         |
| 6     | **E7 — remediation migration set**                          | Order 5                                          | New schema applied dev → staging; RLS coverage passes on the upgrade    |
| 7     | B4 measurement-backed R2 ADR                                | Order 5                                          | Staging measurements recorded and the PostgreSQL-versus-R2 ADR accepted |
| 8     | C3 — production first deployment                            | Orders 6-7                                       | Manual approval and internal-organization production smoke pass         |
| 9     | Repository truth and closeout                               | Runs alongside 1-8; closes after 8               | CI protects `master`; automation and current docs match evidence        |

Do not start production deployment while a prior gate is incomplete. Repository
truth fixes that do not change runtime behavior may land alongside earlier
workstreams.

Orders 4-6 are Workstream E and carry one hard rule: **E0-E5 change application
code only and contain zero SQL.** Every schema change in the remediation collects
into E7. That is what makes each earlier phase independently mergeable, and stops
any of them putting a deployed database into a state a later one must unwind.

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

## Workstream C — First Deployment

**C1 and C2 are complete.** Development and staging are provisioned and deployed
at the origins listed at the top of this plan. The baseline was applied to those
shared databases, so `packages/database/drizzle/0000_initial_baseline.sql` is now
**immutable**: a deployed environment never re-reads the file, and editing it
changes no database. Every schema change from here is a numbered forward
migration. The C1/C2 text below is retained as the executed procedure and as the
template for C3; it is no longer forward-looking work.

C3 — production — remains open and now depends on Workstream E.

### C1. Provision staging infrastructure — executed

Deliverables:

- Provision isolated staging Fly apps for API, dashboard, and editor; an empty
  staging Neon database; exact Cloudflare DNS/TLS routes for
  `staging-api.lodariq.io`, `staging-app.lodariq.io`,
  `staging-editor.lodariq.io`, and `staging-cdn.lodariq.io`; and the required
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

### C2. Staging deploy and smoke gate — executed

Run the deployment in this order: database baseline and RLS verification; CDN
assets; editor; API; dashboard; health/readiness checks; capability enablement;
then end-to-end smoke.

Required evidence:

- TLS and exact-origin checks pass for all staging origins; API `/healthz` and
  `/v1/openapi.json`, editor `/authoring.html`, dashboard, and prepared SDK assets
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

### C3. Production provision and first deploy — open

After the staging gate passes, provision separate production Fly apps, empty
production Neon database and non-owner role, production secrets, Resend config,
SDK/CDN assets, and exact TLS origins at `api.lodariq.io`, `app.lodariq.io`,
`editor.lodariq.io`, and `cdn.lodariq.io`. Apply the same immutable baseline
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

## Workstream E — Branch Remediation and Deployment

Source: `../reviews/code-review-cursor-on-popup-editor.md` — 48 findings
(8 blockers, 13 high, 16 medium, 11 low), verdict "request changes", zero fixed.
Subject: `cursor-on-popup-editor`, 8 commits ahead of `master` and 0 behind, plus
a large uncommitted staged set that includes 18 migrations.

Two facts fix the ordering:

- Development and staging run against shared databases, so the baseline is
  immutable and any edit already made to it needs a forward migration that
  reproduces it.
- Neither `.github/workflows/deploy-fly.yml` nor `.github/actions/deploy-fly`
  applies migrations. Schema is applied deliberately, **before** the app rollout
  that depends on it.

### The baseline drift

`0000_initial_baseline.sql` carries two independent in-place edits, neither with
a forward migration:

1. `analytics_events` gains column `adaptive_visitor_key_hash`, constraint
   `analytics_events_adaptive_visitor_hash_check`, and index
   `analytics_events_adaptive_evidence_idx`.
2. `authoring_sessions_capabilities_check` widens from 12 to 13 values, adding
   `document:schedule-release` to both the `<@` allow-list and the exact-length
   sum.

Both are absent on development and staging. The observable failures are a
`42703` undefined-column on analytics writes and a `23514` check violation the
moment a session is granted `document:schedule-release`, which
`packages/schema/src/sdk.ts:142-159` lists as an ordinary capability.

### E0. Make the suite mean something — executed

Precondition for every phase below.

**Corrected premise.** The 150-failures-across-30-files figure came from an
unbounded `vitest run`. It is not the gate: `packages/tests/package.json` pins
`vitest run --maxWorkers=1`, which is what `pnpm test` and CI execute. Measured
on that path, the suite was **3 failures / 2453 passed / 53 skipped**, all three
deterministic and none a timeout. The 150 are real, but they are what an
unbounded local run produces, and the two causes are the same: Argon2id at
production cost and no bound on the runner.

**The suite was green until today.** Two of the three failures are in
`analytics-warehouse.test.ts`, and both are one wall-clock time bomb. The create
route stamps `nextAttemptAt` from the real clock
(`control-plane-analytics-warehouse.ts:121`), while the test pinned the worker
clock at `2026-08-23T00:00:00Z`; the in-memory claim requires
`nextAttemptAt <= now`, so the destination stopped being claimable the moment
real time passed that constant — at midnight UTC on **2026-08-23**, the day this
phase ran. Moving the constant to 2099 makes both tests pass, which is the proof.
The Final Completion Record's 2026-08-09 green gate was therefore true when
written and false by the calendar alone. The fix derives the worker clock from
the record the route actually wrote, so it cannot expire again.

The third is M11 below.

Deliverables:

- Parameterize the Argon2id cost, keeping production values as the default.
  Derive `ARGON2ID_HASH_PATTERN` from the same constants — it currently pins
  `m=65536,p=1,t=3` as a literal regex and would drift silently.
- Set an explicit `testTimeout` and bound pool concurrency.
- Exclude `.worktrees/**`; `include: ['**/*.test.ts']` has no exclude and collects
  worktree copies that have no `node_modules`.
- Add `billing_provider_events` and `billing_meter_batches` to
  `WORKSPACE_ISOLATION_POLICY_NAMES` (`packages/tests/database/src/repository.test.ts:53-74`);
  their policies are named `_workspace_select`, not `_workspace_isolation` (M11).
  Both tables are in `tenantScopedTableNames`, so the coverage test was looking
  for policies that do not exist and failing. It is the check that would have
  caught H1.
- Invoke `tokens:check` in CI; `package.json:25,51` adds it to `verify` but CI
  never runs it (M14). Delete `shot.mjs` and `shot2.mjs` (L11).
- Make `analytics-warehouse.test.ts` clock-independent, per the time bomb above.

Two of these are worth stating as decisions rather than edits. The Argon2id cost
keeps production values as the default and drops to a reduced profile only under
`process.env.VITEST`, which no deployment sets. And `ARGON2ID_HASH_PATTERN` now
matches PHC _shape_ with the cost checked separately as a floor, so a credential
hashed at a higher cost than the one in force stays valid — raising the
production cost still needs a rehash-on-verify path before it can ship.

Done criteria: three consecutive full-suite runs produce the same result, and
that result is green.

**One more determinism defect, found by the E2/E4/E5 verification run.**
`authoring-activation.test.ts` carried a per-test `10_000` timeout on a test
that builds four Fastify apps, each registering the whole control plane and its
OpenAPI document — while the suite's own default is `30_000`. It passed alone
every time and was the single failure in a 2,539-test run, three runs in a row.
Nothing it asserts is about timing, so the cap only ever decided whether a full
run was green. Removed. One other tight per-test cap survives at
`sdk-authoring/src/authoring/overlay/mode-pill.test.ts:268` and has not misfired.

### E1. Close the authorization holes — executed

Deliverables — code only:

- `directSdkSessionHasCapability` fails open at
  `helpers/session-capabilities.ts:276-281`, returning `true` when `capabilities`
  is not an array. Invert to fail closed (H5).
- Enforce `WRITE_DOCUMENT` on direct-SDK document save; there is no capability
  check at all after session resolve (`register-sdk-delivery.ts:397-411`) (H4).
- Make optimistic concurrency on document save mandatory rather than opt-in (H6).
- Scope public SDK form-responses to the document's own environment (M10).
- Stop disclosing the lock holder's internal user id in the step-lock 409 (L3),
  and remove the dead cross-workspace branch in
  `commercial-entitlements.ts:505-521` (L9).

Done criteria: each fix has a test that asserts refusal, not success.

**Delivered.** All six, each with a refusal test.

- **H5** was worse than described, and the literal fix would have broken live
  authoring. `register-authoring-sessions.ts` — the dashboard's own path —
  creates sessions with _no_ capabilities at all, so inverting the check alone
  would have made every dashboard session inert on development and staging. The
  fix has two halves: the check fails closed and the duplicate
  `directSdkSessionHasExplicitCapability` is folded into it, and both repository
  implementations now set `capabilities` from
  `getAuthoringDocumentSessionCapabilities(environment.kind)` at creation, so no
  caller can produce a capability-less session. Safe to deploy without a
  coordinated migration because `AUTHORING_SESSION_TTL_MS` is 15 minutes: every
  capability-null row expires within 15 minutes of the rollout.
- **H4** gates the direct-SDK save on `document:write` before the body is read.
- **H6** returns **428 Precondition Required** when `expectedDocumentUpdatedAt`
  is absent. It is a handler check, not a schema requirement: making the field
  required in TypeBox puts Fastify's body validation ahead of authentication, so
  unauthenticated requests started answering 400 instead of 401. The shipped SDK
  already sends it (`creator-install/index.ts:415` takes it as a required
  parameter), so no client is broken.
- **M10** now resolves the _deployed artifact_ for the credential's own
  environment instead of any document in the workspace, and validates each
  answer's `stepId`/`blockId` against it (422 `unknown_form_field`). The
  existing tests had to be rewritten to seed a real publication and deployment —
  they had been asserting the permissive behaviour, with a `blockId` that
  existed in no artifact at all.
- **L3** removes `holderUserId` from both wire types (`ExperienceStepLock` and
  `AuthoringCollaborationStepLock`); the server-side `ExperienceStepLockRecord`
  keeps it. The two clients used it only to synthesize a peer id for a holder
  with no live presence session, and there is exactly one lock per step, so the
  step id is a better key that names nobody.
- **L9** deletes the unreachable `existingEvent.workspaceId !== input.workspaceId`
  branch. One correction to the review: it says the real collision "surfaces as a
  generic 409" — it does not. `onConflictDoNothing` on the global unique index
  already returns no row and the code two statements down raises
  `BillingProviderEventConflictError`, which the route maps correctly. The
  in-memory guard stays, with a comment: that map has no RLS, so it stands in for
  the unique index as well as the workspace's own view.

### E2. Close the egress and integrity holes — mostly executed

Deliverables — code only:

- Replace the SSRF hostname-string allow-list with a connect-time IP check, which
  covers DNS rebinding and redirect-to-internal together (B5).
- Fix the CORS preflight that leaves the editor's entire new Operations surface
  dead in a real browser (B1), and stop `sdk-cors.ts:10-23` echoing an arbitrary
  `Origin` on OPTIONS (L1).
- Renew the webhook lease per delivery. `outbound-webhooks.ts:5-6,38-43` computes
  one 30s lease for a whole batch, then awaits each delivery serially at up to
  10s each, so customers receive duplicates (B4).
- Verify the billing provider webhook signature (H7); stop the catch-all turning
  infrastructure failures into a non-retryable 400 (H8); give `submitUsage` an
  idempotency key and a timeout, since it currently double-charges (H9);
  dead-letter disabled-endpoint deliveries instead of letting them starve the
  queue (H10); dead-letter reconciliation mismatches (M7).
- Fix the demo session cookie `Path` so it can be sent (M1); fail closed when the
  demo-link HMAC secret is unset rather than falling back to a per-process random
  value (M2); stop the catch-alls masking 500s and leaking internal messages (M4);
  rate-limit anonymous demo analytics (L10); implement webhook secret rotation,
  currently hard-coded to `secretVersion: 1` (L4).

**Delivered.**

- **B1 was bigger than the review measured — 44 routes, not 41.** The preflight
  lists were hand-maintained beside routes registered in another file, so they
  went stale silently. Replaced with one wildcard per operations base, plus
  `/v1/sdk/catalog-observations`. The real fix is the test: it walks the router
  via an `onRoute` hook and issues a real OPTIONS for every route under
  `/v1/sdk/` and `/v1/authoring/`, so a new route fails until its preflight
  exists. Two routes are allow-listed with reasons — a plain GET with no custom
  header is a CORS _simple request_ and is never preflighted.
- **L1**: the preflight now advertises only the verbs that path actually serves,
  read from the router. Echoing the origin grants nothing by itself
  (`allow-credentials` is never set, and the real response only carries
  `allow-origin` for an allow-listed origin) — what it did grant was approval
  for verbs the path does not have.
- **B5**: `metadata.google.internal`, `0.0.0.0`, CGNAT, `fc00::/7`, `fe80::/10`
  and IPv4-mapped forms all passed the old regexes. The check is now an address
  classifier, and it is re-run at delivery along with a DNS resolution — the URL
  was validated once at creation and never again. **Residual**: closing DNS
  rebinding entirely needs the socket pinned to the address that was checked,
  which Node's global `fetch` gives no hook for. That needs `undici` as a
  dependency — a decision, not an oversight.
- **B4**: the lease is derived from the batch (`batchSize x` the per-delivery
  budget) instead of a flat 30s a full batch outlived, and the worker stops
  early if the margin has been eaten.
- **H7**: a raw-body parser in its own encapsulation scope — a parser on the
  shared instance would replace JSON parsing for every control-plane route. The
  test signs a pretty-printed body so that only a signature over the real bytes
  verifies, which is the failure being fixed.
- **H8**: verification and ingest are now separate `try` blocks. A database
  outage answers 5xx and the provider retries, instead of a 400 that every
  provider reads as "malformed, do not retry".
- **H9**: `submitUsage` takes a replay-stable `idempotencyKey` and an
  `AbortSignal` timed at half the lease; the backoff gained ±20% jitter derived
  from the batch id, so a provider outage no longer brings every workspace back
  on the same minute.
- **H10**: the drizzle fix is the review's — dead-letter instead of `continue`.
  The in-memory repository had the _same_ bug in a different shape: its
  candidate filter excluded disabled endpoints entirely, so those rows could
  never be selected and therefore never finished.
- **M1** `Path=/`, **M2** no per-process demo secret (unconfigured now refuses
  with 503, the way the webhook signing key already worked), **M10**, **L3**,
  **L9**, **L10** (a per-session ceiling on anonymous demo events), **M4** (typed
  `ExperimentRuleError`; fixed messages where raw Postgres text was being
  returned in a 400).
- **M3**: `check-runtime-env.mjs` now requires `LODARIQ_WEBHOOK_SIGNING_KEY` and
  `LODARIQ_DEMO_LINK_SECRET`. **This will fail the development deploy until both
  are set in Fly secrets** — which is the point, since webhooks were silently
  off without the first.

**Not done, and why:**

- **L4 (webhook secret rotation)** needs two schema changes — an audit event
  type for the rotation and a column for the overlap deadline. A rotate route
  that cannot be audited and has no overlap window is not the fix; it is a
  fragment that would read as one. Held for E7.
- **M7** has its operator half: `POST /v1/billing/meter-batches/:batchId/resets`
  returns an exhausted batch to the queue. A real `dead` status needs a CHECK
  constraint change, so the dead-letter half is E7.

### E3. Make each experience type behave as its type — executed

The user-visible symptom is that every experience type behaves like a tour.
Three stacked defects:

1. **`modal` has no positioning rule at all.**
   `experience-runtime-styles.ts` defines rules only for `banner`, `slideIn`,
   `drawer`, and `floating`. `modal` is the default surface for announcements
   (`compile.ts:266-290`) and the only surface for surveys, so it never centers
   and falls through to tour tooltip layout.
2. **Choosing a target disables surface layout entirely.** Every surface rule is
   qualified `:not([data-lodariq-anchored])`, and `tour.ts:615` sets that
   attribute whenever `step.targetId` is truthy. A banner attached to a target
   stops being a banner.
3. **The registry defining the per-surface contract is dead code.**
   `experience-surface-registry.ts` specifies `anchor`, `ariaRole`, `focus`,
   `dismissal`, `backdrop`, `resizable`, and `defaultSize` for all seven
   surfaces, and is imported by nothing except its own test.

Deliverables:

- Make the registry load-bearing: `experience-runtime.ts` reads the definition
  instead of special-casing `modal`.
- Use the registry's `anchor: 'target' | 'viewport'` to decide layout. This is the
  correct fix for defect 2 — a banner is viewport-anchored regardless of target,
  because a target scopes **when** an experience appears, not **where** it sits.
- Add the missing `modal`, `popup`, and `hotspot` rules, sized from `defaultSize`.
- Drive `ariaRole`, `focus`, `dismissal`, and `backdrop` from the registry so each
  type gets its own accessibility contract rather than the tour's.
- Add a per-surface QA harness under `../product-design/prototypes/qa/` covering
  all seven surfaces, with and without a target.

Done criteria: each of the five enabled creator types renders with its own
geometry, focus behavior, and dismissal set, with and without a target.

Verification note: the fixture host and the size gates read built `dist`. Rebuild
`@lodariq/sdk-runtime` **and** `@lodariq/sdk-authoring` before browser QA — the
latter re-bundles its own copy of the runtime. Vitest reads `src`.

**Delivered.** `experience-surface-registry.ts` is now the single description of
what each surface is, and three places read it:

- `tour.ts` asks the registry for `anchor` before it sets
  `data-lodariq-anchored`, so only a target-anchored surface is placed by its
  target. A viewport surface with a target waits for that target to resolve —
  the target still decides _whether_ the experience appears — and is then shown
  where its own stylesheet puts it, with no positioner run and no arrow.
- `experience-runtime.ts` applies `backdrop`, `focus`, `dismissal`, `resizable`
  and `defaultSize` instead of testing `surface === 'modal'`. Two behaviours
  that were missing fall out of this: surveys and checklists now get the close
  control their surfaces declare (they previously had no way out at all), and a
  surface declaring `outside-press` gets it — dismissing, except on a hotspot,
  which owns the gesture and collapses instead.
- `experience-runtime-styles.ts` gained the `modal` rule and dropped every
  `:not([data-lodariq-anchored])` qualifier. The qualifier was defect 2's other
  half: keeping it would mean a stray attribute silently disables surface
  layout, which is the failure being fixed.

Two corrections to the plan's own text:

- **`popup` needs no rule and gets no registry width.** It is the tour surface,
  it is already laid out by `tour-styles.ts`, and its width is the authored
  theme's (`--lq-tour-width`). Overriding it from the registry would silently
  resize every existing tour.
- **`defaultSize` means two different things.** For a resizable surface it is
  the card's default width, applied as `--lq-tour-width` so an authored custom
  width still wins on specificity. For a non-resizable one (hotspot) it is the
  _marker's_ size, applied as `--lq-experience-marker`; applying it to the card
  would have shrunk the panel the marker opens to 40px. The first version of
  this change did exactly that.

Evidence: `packages/tests/sdk-runtime/src/renderers/experience-surface-contract.test.ts`
(7 tests; the headline one fails on the old anchoring rule, verified by
reverting it) and `docs/product-design/prototypes/qa/t50-experience-surfaces.mjs`,
which renders all seven surfaces twice each in a real browser and checks the
result against the registry read live. Full run: 68 checks, all passing —
banner 960x72 at `top: 12`, modal 520 centered, slideIn/drawer 400 at the right
edge, floating 368 bottom-right, identical with and without a target.
`runtime+tour` is 59258/59392 bytes gzipped, so this leaves 134 bytes of budget.

#### Deferred: the announcement authoring surface

Raised by the user while E3 was closing, and parked at their request. Delivery
is fixed; **authoring an announcement is not.** What was confirmed by reading:

- **A target was being offered for types that have none.** `ANNOUNCEMENT.gestures`
  has never listed `pick-target` and its inspector has never had a target
  section — but `gestures` had no consumer, so the panel toolbar rendered the
  "Choose target" crosshair for every type (`overlay-step-editor.tsx:515`, gated
  only on `step ?`). **Fixed now**: `experienceAnswersGesture` makes the registry
  load-bearing, and `ANNOUNCEMENT.capabilities` drops `targeting` to agree with
  survey and checklist. The publish gate already agreed — `requireTarget` is
  `type === 'tour' || type === 'hotspot'` (`publish.ts:224`).
- **An announcement cannot be resized.** `usePopupTransform` — drag and resize —
  is used only by `RichStepContentEditor`, which only `TourStepInspector` renders,
  which only the standalone tour rail reaches. The panel routes every type to
  `OverlayStepEditor`, which has no transform at all.
- **The size limits cannot express the surfaces.** `TOOLTIP_WIDTH_PX_LIMITS` is
  `{min: 240, max: 720}` and `TOOLTIP_HEIGHT_PX_LIMITS` is `{min: 160, max: 640}`
  (`block.ts:110-111`), enforced in TypeBox. A banner's own default width is 960,
  so **a creator cannot author a banner at the size the runtime gives it**. The
  renderer already clamps to the viewport
  (`width: min(var(--lq-popup-width), calc(100vw - 24px))`), so raising the
  ceiling is safe — the clamp, not the schema, is what protects the page.
- **Four inspector sections are placeholders.** `overlay-step-inspector.tsx:301-320`
  maps `audience`, `tooltip`, `question` and `options` to
  `<ExperienceBehaviorSection section="content">`, and that component has no
  `content` branch — so each renders the fallback hint "Edit this content on the
  card." That is why Audience appears to do nothing.
- **Inspector controls are stylistically inconsistent** — `dismissal` renders a
  `.storyboard-property-toggle`, `frequency` a `.storyboard-property-row`. Not
  yet traced against the rest of the inspector's control set.
- **Drop shadow / surface styling: unconfirmed.** `OverlayStepEditor` does apply
  the resolved popup theme and `data-lodariq-popup-elevation` to
  `.overlay-step-card` (`:573-588`), so the plumbing exists in the panel path.
  Whether that class consumes `--lq-tour-elevation` was not checked.

### E4. Wire the inert subsystems — provider decision recorded

Billing, data residency, and analytics warehouse ship routes, tables, and
workers, but no provider is ever constructed: `app.ts:169-172` defaults all three
to `undefined`/`[]` with no `create…FromEnvironment` anywhere (H2).

Deliverables — code only:

- Construct all three providers from the environment (H2).
- Reject residency migrations and warehouse destinations at the API when no
  executor is configured, instead of accepting work nothing will run (H3).
- Teach `apps/api/scripts/check-runtime-env.mjs` about the two unregistered
  production secrets (M3).
- Declare `response` schemas on the measurement endpoints; every client validates
  against them (M6).
- Restore the change-history source the in-memory implementation omits and
  drizzle includes — 11 sources versus 10 (M12).

**Delivered.** H3 — residency migrations and warehouse destinations answer 503
when no executor is configured, instead of returning 201 and a pending row
nothing will advance. M3 (above). M6 — the four measurement endpoints declare
`ExperienceMeasurementConfig` as their response schema. M12 — the in-memory
change-history was missing _two_ sources, not one: `dataResidencyMigrationHistory`
as the review found, and `governanceAuditEvents`, which has no in-memory store at
all. Both are now read back.

**H2 is decided in ADR 0031.** The first adapter target is Paddle for billing,
with PayPro Global as the fallback if seller-jurisdiction onboarding fails,
regional Neon projects plus jurisdictioned Cloudflare R2 for residency, and
BigQuery for warehouse delivery. The absence of an adapter or its deployment
credentials remains fail-closed; this decision does not authorize fake
providers or a generic arbitrary-URL copier. Snowflake is the later enterprise
adapter, and APAC residency remains gated until its storage/deployment
guarantee is real.

**The second half of M12 is now closed.** Drizzle splits governance audits
across two tables — `governance_audit_events` for webhook, capability-profile
and residency events, `tenant_audit_events` for the rest — and change history
labels each by the table it came from, encoding it in the event id as
`change:<source>:<sourceId>`. The in-memory repository keeps one map, so every
one of those events came back as `change:tenant-governance:…` where Postgres
returns `change:platform-governance:…`. Since every API test uses the in-memory
repository, that id was wrong in tests and right in production, which is the
exact failure mode M12 named. The split is now reproduced at write time
(`platformGovernanceAuditEventIds`) and a test in `platform-governance.test.ts`
asserts the id prefix — it fails against the previous behaviour.

### E5. Bound the unbounded — partly executed

Every item is a query or loop with no ceiling. The indexes these depend on are
E7, not here.

Deliverables — code only:

- Governance change-history fans out 11 × `SELECT *` × 10,000 rows, one carrying
  full document JSON (B6).
- `readExperienceAnalytics` loads an entire environment's event history into Node
  heap (B7).
- The warehouse sync cursor sorts on an unindexed column every 15s per
  destination — code side here, index in E7 (B8).
- `expireAnalyticsExportJobs` transfers up to 1.6 GB to null a column (H13).
- Retention and pruning for the new high-volume tables: the job and its
  scheduling here, partitioning/index support in E7 (H12).
- `listDocuments` is a 2N+1 selecting `canonical jsonb` it does not use (M13);
  `leaseWebhookDeliveries` issues 3 queries per row while holding `FOR UPDATE`
  locks (M15); analytics export generation is CPU-bound and inline in the API
  process (M16); the workspace accessibility sweep is unthrottled and synchronous
  (M5); `listWebhookDeliveries` returns up to 10,000 rows unpaginated (L5).

**Delivered.**

- **B7** turned out to be a clean split rather than the SQL-aggregate rewrite the
  review sized. Every consumer of the rich row set filters to the document on its
  first line — `deriveExperienceAnalyticsBreakdown` literally does — so the main
  query is now scoped in SQL. Only `deriveAdoptionImpact` needs the environment's
  wider cohort, it reads three columns, and it does not run at all unless a
  success event is configured.
- **B6**: `documentVersions` is projected to the five scalars actually read
  (`canonical` is the whole authored document as jsonb), and the `from`/`to`
  window and `documentId` are pushed into SQL across all eleven sources.
- **H13**: projections in all three places that selected a 16 MiB blob to write a
  status.
- **M13**: `listDocuments` projects `type`/`status` out of `canonical` with `->>`
  instead of loading every document in the workspace.
- **M15**: the webhook lease batched from three queries per row — up to 300 round
  trips while holding `for update` locks — to two batched selects and two bulk
  updates.
- **M5**: the accessibility sweep takes the shared governance quota, which it was
  the only mutating governance route to skip, and its idempotency key is checked
  against the same pattern as every other one rather than "non-empty".
- **L5**: `listWebhookDeliveries` is keyset-paginated, default 100, ceiling 500.
- **H12**, in part: finished webhook deliveries are swept after 30 days on the
  worker's own tick, bounded per call so a first sweep of a neglected table
  drains steadily rather than locking it.

**Not done, and why:**

- **B8** is an index. The query is already a correct keyset cursor with a bound —
  there is no code-side change to make. E7.
- **H12 for `analytics_events`** is the large half. Deleting from a table that
  size without partitions is itself the risk, so it belongs with the partitioning
  work in E7.
- **M16 is delivered with a worker thread.** Production moves CPU-bound export
  formatting to a separately bundled Node worker-thread entrypoint while the
  API thread retains database leasing, authorization, source reads, and
  completion. The durable job contract can later move the same boundary to a
  separate deployable if export volume warrants the extra service.

  Which path a process takes is decided by whether the worker artifact is on
  disk. Not `NODE_ENV` — every tier sets it to `production`, so it names
  "deployed" while reading as "the production tier". And not this file's own
  extension, which answers "was I bundled": that agrees with "can I spawn the
  worker" only while the tsup entry keeps the name the spawn uses, and nothing
  enforces it, because the response type crosses as `import type` and erases.
  Dropping `tsup.config.ts:7` builds, typechecks and deploys green; under an
  extension check it would ship a bundle where every export job fails, and
  under the probe it falls back to inline. Verified against the real bundle by
  removing the artifact: `worker` with it, `inline` without,
  `LODARIQ_ANALYTICS_EXPORT_GENERATION` overriding both.

### E6. Merge, then deploy to development

The first phase that touches a deployed system. No new schema here — only schema
that already exists and has never been applied.

Deliverables:

**The merge is the deploy.** `verify.yml:162-176` runs `deploy-development` on
every push to `master`, gated only on `static-checks`, `build`, and
`dependency-audit` — `unit-tests` is not in its `needs`. So merging does not
_precede_ the development rollout, it _causes_ it, and nothing about that gate
knows whether the schema is ready. Steps 2 and 3 therefore run **before** the
merge, against development's database, or the auto-deploy ships code that reads
44 tables development does not have, plus the `0015` installation-suspension column.

0. **Set two Fly secrets first, or the deploy fails on startup.**
   `check-runtime-env.mjs` now requires `LODARIQ_WEBHOOK_SIGNING_KEY` and
   `LODARIQ_DEMO_LINK_SECRET` (E2/M3). Neither exists in any `.env.example`,
   doc, or deploy configuration today, and without the first the outbound
   webhook worker was never started and `POST /v1/governance/webhooks` answered
   503 — the feature was off with nothing in the deploy saying so. That is the
   point of the check, but it means the secrets have to be in place _before_ the
   push in step 1 fires the rollout. Both must be at least 32 characters.
1. **Merge, last.** The branch is 8 ahead and 0 behind, so the merge is clean.
   The uncommitted staged set — 18 new migrations plus the baseline edit — is
   committed here rather than carried into a deploy as uncommitted state. This
   step fires the development deploy, so it runs after the schema is in place.
2. **Schema drift audit, before anything else touches development.** The
   repository cannot state development's schema; it must be measured. Establish
   which migration was last applied, whether `analytics_events.adaptive_visitor_key_hash`
   exists, whether the capabilities constraint admits 12 or 13 values, and
   **whether any other divergence exists** between the deployed schema and the
   baseline as it now stands. That last point carries the most weight: two
   in-place edits are already confirmed, which establishes the practice, and the
   audit is how the unnoticed ones are found. Build on
   `packages/database/scripts/check-migration-safety.mjs` and `verify-live-rls.mjs`.
3. **Apply existing schema.** Migrations `0014`-`0033` in order, then an
   explicitly approved `0034_authoring_session_capabilities.sql` that widens
   the stale 12-capability constraint to include `document:schedule-release`.
   Migration `0020` already forwards the adaptive visitor-hash baseline edit;
   `0034` must not duplicate it. The `0014`-`0033` sequence creates 44 tables
   the branch's API reads and development does not have, plus the `0015`
   installation-suspension column, so a code-first deploy fails on contact.
4. **Two E4 features will still answer 503 after this deploy, by design.**
   Data residency migrations and analytics warehouse destinations refuse while
   no provider is constructed (H3), rather than accepting work nothing advances.
   They become real only once H2 is decided. Billing already behaved this way.
5. **Verify the deploy.** The push in step 1 has already rolled out API,
   dashboard, and editor; `deploy-fly.yml` `workflow_dispatch` is the manual
   path if that run needs repeating. Verify health checks; the E3 experience types on a real origin for the first time
   outside the fixture host; the E1 refusals actually refusing; and an authoring
   session carrying `document:schedule-release` activating without a `23514`,
   which is the direct proof the drift repair worked.
6. **Rewrite the migration runbook.** `packages/database/drizzle/README.md`
   must list the full ordered set and record, per environment, which migration
   it sits at — otherwise the next deploy repeats this audit from scratch (B3).
7. **Staging.** Repeat steps 2-4 against staging, which is a separate database at
   its own migration point and needs its own audit. Do not assume development's
   answer transfers.

### E7. The remediation migration set

Every new schema change, authored together and applied development → staging.
Running last means each is written against a schema whose real state was
established in E6 rather than assumed.

Deliverables:

- The missing RLS `UPDATE` policy on `billing_meter_batches`; batches are
  currently stranded silently, which is direct revenue loss, and E0 restores the
  coverage test that catches it (H1).
- The ten missing indexes behind queries this branch made hot, including the
  warehouse sync cursor column from E5 (H11).
- The composite scope FK on `workspace_applications.theme_id`
  (`0014_experience_measurement.sql:157`) (M9).
- Tighten the demo-link public RLS policy in
  `0028_authoring_roadmap_records.sql` (L2).
- Make the worker-flag RLS disjuncts (`lodariq.webhook_worker` and siblings)
  conditional; they are currently unconditional cross-tenant grants (L6).
- Add `environment_id` to `governance_audit_events` and `tenant_audit_events` (L7).
- Resolve constraint-name drift between `schema/environments.ts:130` and the
  database (L8).
- Partitioning or index support for the E5 retention job (H12).

Done criteria: applied to development, verified, then staging, with RLS coverage
passing against an upgraded database rather than only against a fresh baseline.
Those are different tests and only one reflects production.

**Authored as `0035`-`0040`; applied to development on 2026-08-24, staging
pending.** Written after E6 established both environments at `0034`, so against
a measured schema rather than an assumed one. Development used snapshot
`lodariq-dev-before-0035-0040-2026-08-24` and explicit approval covering the
`0040` constraint replacements. Catalog, data, invalid-index, restricted-role,
and live scratch-isolation postflight checks passed. The hosted API readiness
check passed; the full service probe still requires a development deployment
that includes the current `/v1/openapi.json` route.

| File                                | Findings     | Gate                                                         |
| ----------------------------------- | ------------ | ------------------------------------------------------------ |
| `0035_rls_scope_containment.sql`    | L6, L2       | development passed; staging pending                          |
| `0036_cross_scope_foreign_keys.sql` | M9, L7       | development passed; staging pending                          |
| `0037_billing_batch_recovery.sql`   | H1           | development passed; staging pending                          |
| `0038_hot_query_indexes.sql`        | H11          | development passed; staging pending                          |
| `0039_analytics_events_indexes.sql` | B8, H11, H12 | development passed; staging pending                          |
| `0040_dead_letter_and_rotation.sql` | L4, M7, L8   | development approved/applied; staging needs current approval |

`0039` carries no transaction block on purpose: `create index concurrently`
cannot run inside one, and a plain build on `analytics_events` locks ingestion
for its duration. `0040` is the only file that drops constraints, grouped so
exactly one migration needs approval instead of three. Development received
that approval. The recorded sign-off does not replace fresh operator approval
immediately before staging execution.

**H1 was worse than the review measured.** The missing `UPDATE` policy did not
merely strand batches: `resetBillingMeterBatch` runs in workspace scope, so the
operator reset route delivered for M7 in E2 matched zero rows under `force row
level security` and reported every batch as not found. The remediation was
disabled by the defect it remediates. Only the in-memory repository, which has
no RLS, made it look like it worked.

**H12 remains half done and should not be read as closed.** The index makes a
per-tenant retention sweep affordable; deleting from an unpartitioned table of
that size is still the risk the review named, and monthly `occurred_at`
partitions are a table rewrite and their own change.

### The destructive-migration guard was not working

Found while checking that `0040` failed the gate as it should. It did not — and
neither did anything else. `stripCommentsAndStrings` removed single-quoted
strings _before_ block comments, so an apostrophe in prose opened a phantom
string literal that blanked every statement up to the next apostrophe. Two
apostrophes in comments straddling a destructive statement hid it completely:

```sql
/* This directory's guard protects shared environments. */
alter table foo
  drop constraint if exists bar_check;      -- not reported
/* And 0025's rename is guarded. */
```

This is the control that decides what may reach development and staging without
a human looking at it. Rewritten as one left-to-right scanner — independent
passes cannot agree on what a quote means, and reversing the order only moves
the hole, since a `--` inside a string literal would then eat that line.
Dollar-quoting, nested block comments, `''`, `E'...'` backslashes and quoted
identifiers are all handled in the one pass, and blanked regions keep their
newlines so a finding names the right line. Four regression tests cover it.

With the guard working, it reported one already-applied migration:
`0016_experience_comment_threads.sql` drops
`experience_comments_resolution_check`, which had no sign-off because the
apostrophe in "the root's semantic anchor" hid it from the old scanner. It is a
transactional drop-and-recreate with a wider predicate, so development and
staging keep the applied schema. The file now records the retrospective review
and sign-off; `migrations:check` passes with the repaired guard.

### Deferred from Workstream E

| Item                                                     | Why deferred                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCIM base path moved without a compatibility window (M8) | Breaking for any provisioned client. Because development and staging are deployed, "no existing installs" is not available as a justification; this needs a compatibility window and a coordinated deploy, which is its own change.                                                                       |
| Environment restriction removal                          | `candidate-channel-plan.md` is Proposed with zero implementation. `AuthoringEnvironment` is still `development \| staging` (`packages/schema/src/sdk.ts:118-121`) and `release-checks.ts:52-53` still hard-requires staging across seven enforcement layers. A coherent feature project, not remediation. |
| ADR 0030 per-person progress                             | Proposed. Requires `engagementKey` on terminal events; currently attached only to `experience_shown` (`sdk-runtime/src/runtime/index.ts:171`).                                                                                                                                                            |
| `knowledge` experience type                              | Deliberately withheld — it seeds no blocks yet (`creator-experience-types.ts`).                                                                                                                                                                                                                           |

### Review-scope caveat

The review header claims 758 files against `766a4d4`, but no diff reproduces
those numbers; the closest match is staged-versus-`HEAD`. The roughly 570 files
and 94,499 lines already committed in `a645e48` and `c132507` appear never to
have been reviewed. These 48 findings are therefore not a complete inventory of
the branch's defects.

Three counts in the review do not hold: there are **33 migrations, not 21** (34
SQL files, of which 19 are missing from the runbook); Fastify registrations are
**261, not 240**; and "44 new tables" counts `0014`'s six, where the staged set
`0016`-`0033` creates 38. The 85 `tenantScopedTableNames` entries are correct.

## Finding disposition — all 48

Audited against the working tree on 2026-08-23, finding by finding, rather than
against this document's own prose. The audit is what found the live half of M12.

| Disposition                   | Count | Findings                                                                                                                                      |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Code-complete on the branch   | 33    | B1, B4, B5, B6, B7, H3, H4, H5, H6, H7, H8, H9, H10, H13, M1, M2, M3, M4, M5, M6, M10, M11, M12, M13, M14, M15, M16, L1, L3, L5, L9, L10, L11 |
| Held for the E7 migration set | 13    | B2, B3, B8, H1, H11, H12, M7, M9, L2, L4, L6, L7, L8                                                                                          |
| Decided, adapters unbuilt     | 1     | H2                                                                                                                                            |
| Deferred with a reason        | 1     | M8                                                                                                                                            |

Two of the E7 thirteen are half-delivered here and half in schema: **H12**'s
webhook-delivery sweep runs today and only `analytics_events` waits on
partitioning; **M7**'s operator reset route exists and only the `dead` status
waits on a CHECK constraint. Everything else in that column is schema-only.

Nothing in the first row is awaiting a decision, a migration, or a deploy.

## Final Completion Record

Local technical completion was recorded on 2026-08-09 with the full repository
gate green. Development and staging were provisioned and deployed after that,
closing C1-C2 and freezing the baseline.

The plan is now the operational checklist for **Workstream E** — taking
`cursor-on-popup-editor` and its 48 review findings to merged and deployed — and
after that for C3 production and the B4 measurement-backed ADR, which staging
deployment has unblocked. No production proof is claimed, and point 5 product
research/paid-pilot evidence remains outside this technical scope.
