# Code review — `cursor-on-popup-editor` (758 files, +89,556 / −11,368 vs `766a4d4`)

Scope: everything staged on the branch. Six parallel review passes (tenancy/RLS, auth/session, API surface,
DB performance + workers, integration/wiring) plus an adversarial verification pass on every contested or
Critical claim. **All seven claims sent to verification came back CONFIRMED.**

Not done: nothing was executed. `node_modules` is macOS-arch and the bridge VM is Linux, so no build, no
typecheck, no vitest, no `EXPLAIN`. Every finding below is static, but each one names the file and line that
proves it.

---

## 1. Ship blockers

### B1 — The editor's entire new Operations surface is dead in a real browser (CORS preflight)
`apps/api/src/routes/control-plane/register-health-and-cors.ts:75-107, 114-120, 133-169`

There is no `@fastify/cors` in `apps/api/package.json`, no wildcard `OPTIONS`, no `setNotFoundHandler`, and no
preflight-answering `onRequest` hook anywhere in `apps/` or `packages/`. Every preflight is a hand-written
`fastify.options(path, …)` from three literal arrays. `register-sdk-authoring-operations.ts:215` registers 34
suffixes under **two** base paths (`:163-168`), and these have a mutating route but **no** options handler
under either base:

`/copy-suggestions`, `/copy-suggestions/decisions`, `/document-versions`, `/document-version-diff`,
`/templates/instantiate`, `/demo-links`, `/demo-links/:demoId`, `/demo-links/review`, `/demo-links/analytics`,
`/analytics-exports`, `/analytics-exports/:jobId`, `/analytics-exports/:jobId/download`, `/commercial-usage`,
`/data-catalog`, `/delivery-schedules`, `/delivery-schedules/:scheduleId`, `/delivery-schedules/history`,
`/narration`, `/accessibility-sweeps` — plus `POST /v1/sdk/catalog-observations`
(`register-sdk-delivery.ts:309`), which bootstrap advertises to every SDK as `catalogUrl`.

The preflight is definitely triggered: the editor is served from `editor.lodariq.io`
(`packages/schema/src/sdk.ts:68`) and calls `api.lodariq.io` (`apps/editor/src/hosted-operations-services.ts:84`)
with `content-type: application/json` and a custom session header on **every** request, GETs included
(`apps/editor/src/authoring-api-client.ts:43`). The unmatched OPTIONS 404s with no `Access-Control-Allow-Origin`
and the fetch is blocked.

Why it survived review: the dashboard is unaffected — `apps/dashboard/next.config.mjs` rewrites `/v1/:path*` to
same-origin `/api/:path*`. And every server-side test passes, because tests never issue a preflight.

**Fix:** derive both OPTIONS lists from the same suffix array `registerOperationsRouteSet` iterates, or register
a wildcard `OPTIONS /v1/{sdk/,}authoring/operations/*`. Add `/v1/sdk/catalog-observations`. Better: adopt
`@fastify/cors` with the existing origin allow-list so this cannot drift again.

### B2 — `0000_initial_baseline.sql` was edited in place; no forward migration follows
`packages/database/drizzle/0000_initial_baseline.sql:1049-1064`

```sql
-      and jsonb_array_length(capabilities) between 1 and 12
+      and jsonb_array_length(capabilities) between 1 and 13
+      ... "document:schedule-release" added to the <@ allow-list
```

`authoring_sessions_capabilities_check` and `document:schedule-release` appear in **only** that one file across
all 34 SQL migrations — nothing in 0014–0033 drops and recreates the constraint. Meanwhile
`packages/database/src/domains/authoring-policy.ts:109-127` now emits 6 base + 7 staging = 13 capabilities
including `SCHEDULE_RELEASE`, written straight to the column at
`packages/database/src/drizzle/authoring-activation.ts:358,370`.

Result: on any database provisioned before this branch, opening the hosted editor against a staging environment
fails the 12-value CHECK with SQLSTATE 23514 and activation 500s. **All staging authoring breaks everywhere
already deployed.**

The tests cannot catch it: `packages/tests/database/src/authoring-session-capabilities.test.ts:47-50` asserts
against the *edited* baseline, and the Postgres harness builds every fixture DB fresh from 0000 forward, so the
upgrade path is never exercised. `drizzle/README.md` itself says to treat the baseline as immutable — and the
other baseline edit in this same commit (`adaptive_visitor_key_hash`) *does* have a forward migration
(`0020_adaptive_delivery.sql:4`), so this is an omission against your own convention.

**Fix:** revert the 0000 edit; add `0034` that drops and recreates the constraint with the 13-value set.

### B3 — 19 of the 21 new migrations have no application path
`packages/database/drizzle/README.md`

There is no migration runner in this repo: no `meta/_journal.json`, no `drizzle.config.*`, no `drizzle-kit`, no
`migrate()` call (the only hit is `packages/sdk-authoring/src/editor/serialize.ts:144`, a document-schema
migration, unrelated). `.github/workflows/deploy-fly.yml` has no `psql`/migration step, and
`apps/api/Dockerfile:32` is `node check-runtime-env.mjs && exec node dist/server.js`.

The **only** ordered runbook is that README's `psql -X -v ON_ERROR_STOP=1 -f <file>` list — and its diff against
`766a4d4` adds exactly one line, for 0014. Migrations **0015 through 0033** are listed nowhere.
`pnpm migrations:check` (`packages/database/scripts/check-migration-safety.mjs`) only scans for destructive
statements; it never reads the README, so CI cannot catch the drift.

An operator following the runbook applies through 0014, deploys, and every table added by 0015–0033 — billing
lifecycle, webhooks, residency, warehouse sync, accessibility, comment threads, step locks, presence, analytics
exports — is absent. Every new route 500s on its first query.

**Fix:** append 0015–0033 now, then replace the hand-maintained list with a `migrations:apply` script that
iterates the directory in sorted order, so the list cannot drift again.

### B4 — Outbound webhooks: the lease expires mid-batch, so customers get duplicates
`apps/api/src/outbound-webhooks.ts:5-6, 38-43`

```ts
const WEBHOOK_LEASE_MS = 30_000;  const WEBHOOK_TIMEOUT_MS = 10_000;
// leaseExpiresAt computed ONCE for the whole batch, then:
for (const delivery of deliveries) await deliverWebhook(options, delivery, now);
```

Sequential, 10s timeout each, batch default 10 and max 100. Four slow endpoints exhaust the 30s lease; a full
batch can run ~1000s against it. `packages/database/src/drizzle/webhooks.ts:218-224` explicitly re-leases
`status='delivering' AND leasedUntil <= now`, re-stamping `leaseOwner` (`:263-268`) — so a second pod re-POSTs
the same events. Then `completeWebhookDelivery` (`:303-305`) is guarded on `leaseOwner`, so pod A's completion
silently returns `false`, the row stays `delivering`, and it repeats until `attempts` hits 8 and it is marked
`dead` — despite every POST having returned 200.

**Fix:** re-stamp the lease immediately before each delivery (`leasedUntil = now + 2 × timeout`), or set
`WEBHOOK_LEASE_MS ≥ batchSize × WEBHOOK_TIMEOUT_MS + slack`.

### B5 — SSRF: hostname-string allow-list, no connect-time IP check
`packages/schema/src/webhooks.ts:125-146` — validated only at endpoint-creation time
(`control-plane-governance.ts:446`, `drizzle/webhooks.ts:53`); `outbound-webhooks.ts:134` re-fetches the stored
URL with no revalidation.

```ts
if (/^127\./u.test(host) || /^10\./u.test(host) || /^169\.254\./u.test(host)) return false;
...
return Boolean(host.includes('.'));
```

Three working bypasses:
- **DNS rebinding.** Register `hook.attacker.com` on a public IP, flip it to `169.254.169.254` before the worker
  fires. Nothing ever checks the resolved address.
- **`metadata.google.internal`** — has a dot, isn't `.local`, passes every regex. GCP metadata token exfiltration.
- **`https://0.0.0.0/`** — passes all five regexes, routes to loopback on Linux.

Also unblocked: `100.64.0.0/10` (CGNAT), `fc00::/7`, `fe80::/10` (only `::1` is listed). Same shape applies to
the customer-supplied warehouse destination URLs.

**Fix:** resolve the host and reject non-public addresses **at connect time** via an `undici` Agent `connect`
hook that pins the validated IP, and re-run `isSafeWebhookEndpointUrl` inside `deliverWebhook`.

### B6 — Governance change-history fans out 11 × `SELECT *` × 10,000 rows, one carrying full document JSON
`packages/database/src/drizzle/governance-change-history.ts:42-119`

```ts
tx.select().from(documentVersions).where(eq(workspaceId))
  .orderBy(desc(documentVersions.createdAt)).limit(SOURCE_QUERY_LIMIT),  // = 10_000
```

`documentVersions.canonical` is `jsonb LodariqDocument` (`schema/documents.ts:311`) — the whole document. Only
five scalar fields are used (`:123-134`). 10,000 versions × ~200KB ≈ 2GB transferred **per request**, across 11
source tables, then merged/sorted/filtered **in JS** (`domains/governance-change-history.ts:62-74`) — so
`?documentId=X&limit=1` still pays the full cost. Reachable on `/v1/governance/change-history` and its `.csv`.

**Fix:** explicit column projections, and push `documentId`/`from`/`to`/`limit` into each SQL query — or one
`UNION ALL … ORDER BY occurred_at DESC LIMIT n`.

### B7 — `readExperienceAnalytics` loads the whole environment's event history into Node heap
`packages/database/src/drizzle/experience-measurement.ts:276-304`, filtered at `:327`

```ts
.where(and(eq(workspaceId), eq(environmentId), gte(occurredAt, cutoff), lte(occurredAt, asOfDate)));
// :327 — the document filter happens in JavaScript, after the fetch
const scoped = events.filter((event) => event.documentId === input.documentId);
```

No `documentId` predicate, no LIMIT, and the retention window is entitlement-driven up to a year. One dashboard
load — and every `analytics-export-worker` summary job (`analytics-export-worker.ts:126`) — streams every event
in the environment, `props` JSONB included, into memory. The unscoped set is genuinely needed by
`deriveAdoptionImpact`, so the fix is to compute in SQL, not to add a filter.

**Fix:** `count(distinct correlation_id) … group by name` aggregates for shown/completed/dismissed/funnel/adoption.

### B8 — Warehouse sync cursor sorts on an unindexed column, every 15s, per destination
`packages/database/src/drizzle/analytics-warehouse.ts:215-241`

The cursor is `(ingested_at, id) > checkpoint ORDER BY ingested_at, id LIMIT 1000`, but **no index anywhere
contains `analytics_events.ingested_at`** — the four existing ones are on `occurred_at`, `publication_id`, and
`adaptive_visitor_key_hash`. The planner takes the `(workspace_id, environment_id)` prefix and then
filter-and-sorts every event in the environment. At 50M events that is a multi-second sort every 15s per
destination, permanently pinning a core.

**Fix:**
```sql
create index concurrently analytics_events_warehouse_cursor_idx
  on analytics_events(workspace_id, environment_id, document_id, ingested_at, id);
```

---

## 2. High — fix before this reaches customers

### H1 — Billing meter batches are silently stranded by a missing RLS UPDATE policy (revenue loss)
`packages/database/drizzle/0030_commercial_billing_lifecycle.sql:121-135` defines four policies for
`billing_meter_batches`; the only UPDATE policy is `_worker_update`, gated on `lodariq.billing_worker`. But
`completeBillingMeterBatch` (`drizzle/commercial-entitlements.ts:725`) and `failBillingMeterBatch` (`:764`) run
under `this.scoped(...)` → `runWithWorkspaceScope`, which sets only `lodariq.workspace_id` — and the worker
calls them in **separate transactions** outside the claim scope (`commercial-billing-worker.ts:39, 50, 59` vs
the claim at `:32`).

Under `force row level security` the `SELECT … FOR UPDATE` at `:726`/`:765` is itself filtered by the UPDATE
policy's USING clause, so both methods return `null` before writing anything. The batch stays `submitting`
forever, and `claimBillingMeterBatches` (`:688-698`) only re-claims `pending`/`failed` — so that workspace's
metering stops permanently after one attempt, with the provider-side submission never reconciled. **Usage
accrues and is never billed.**

**Fix:** add `billing_meter_batches_workspace_update`, or wrap both methods in `runWithBillingWorkerScope`.

### H2 — Billing, residency, and warehouse workers are inert in production
`apps/api/src/server.ts:5` is `createApiApp({ logger: true })` — the sole entrypoint
(`apps/api/Dockerfile:32`; no separate process group in `fly.toml`). `apps/api/src/app.ts:169-172`:

```ts
const billingProvider = options.billingProvider ?? undefined;
const dataResidencyProvider = options.dataResidencyProvider ?? undefined;
const analyticsWarehouseProviders = options.analyticsWarehouseProviders ?? [];
```

No `create…FromEnvironment` exists for any of the three (compare `createDeepLAuthoringTranslationProvider()` at
`:157`, which does). So `commercialBillingWorker`, `dataResidencyWorker`, and `analyticsWarehouseWorker` are
always `null` in every deployment, and `billingProvider` is threaded into the routes at `:414` as `undefined`.
`authoringAssistProvider` (`:158`) and `narrationProvider` (`:160`) are unreachable the same way.

**Fix:** add env-based provider constructors and wire them, or build them in `server.ts`.

### H3 — Residency migrations and warehouse destinations are accepted with no executor
`apps/api/src/routes/control-plane-governance.ts:648` persists a residency migration, emits a
`residency.migration_changed` webhook, and returns 201 with no provider check. Warehouse destination creation is
the same. Billing gets this right — `control-plane-billing.ts:61,109` return `providerUnavailable(reply)` → 503.
Combined with H2: an admin requests a region migration, sees 201 and a "pending" row that nothing will ever
advance, and no error ever reaches them.

**Fix:** mirror the billing 503 guard.

### H4 — Direct-SDK document save enforces no capability at all
`apps/api/src/routes/control-plane/register-sdk-delivery.ts:397-411`

```ts
const authoringSession = await authenticateAuthoringSessionForToken(...);
if (!authoringSession) return;
setCredentialResponseHeaders(reply);   // no WRITE_DOCUMENT check here or below (verified through :530)
```

A page completes activation requesting only `["document:read","document:preview"]`; the approver sees a
read-only consent screen and approves. The page then `POST /v1/sdk/authoring/document` and overwrites the
document. The hosted twin routes every write through `requireAuthoringSessionCapability`
(`helpers/session-capabilities.ts:125-136`) — this path does not.

**Fix:** call `requireAuthoringSessionCapability(session, AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT, reply)`
right after the session resolves.

### H5 — `directSdkSessionHasCapability` fails open
`apps/api/src/routes/control-plane/helpers/session-capabilities.ts:276-281`

```ts
return !Array.isArray(session.capabilities) || session.capabilities.includes(capability);
```

`authoring_sessions.capabilities` is legitimately `NULL` for every non-activation session, and those are created
by `POST /v1/authoring/sessions` behind `requireRole(auth,'member')` — a *role* check, not a capability check.
So an admin who narrows a member's environment profile to `authoring:read` is overridden: that member creates a
legacy session and drives every `/v1/sdk/authoring/operations/*` write route with it. The whole
`resolveEnvironmentGovernanceCapabilities` model is never consulted on this path (the hosted twin does enforce
it, so this is an asymmetry rather than a global miss).

**Fix:** `Array.isArray(session.capabilities) && session.capabilities.includes(capability)`, and resolve legacy
sessions through `authoringSessionCapabilitiesForGovernance` — which also closes the staleness gap where
revoking a profile takes effect in the hosted editor immediately but not on the direct SDK panel until TTL.

### H6 — Optimistic concurrency on document save is opt-in
`apps/api/src/routes/control-plane-contracts.ts:320-324`; consumers `register-sdk-delivery.ts:483-488`,
`register-authoring-documents.ts:183-188`

`expectedDocumentUpdatedAt` is `Type.Optional`, and `drizzle/documents.ts:431-445` only takes the
`SELECT … FOR UPDATE` + version comparison **when it is defined**. A client that omits it — or a retry that
drops it — does an unguarded last-write-wins overwrite of another author's draft with no
`DocumentSaveConflictError`. `findAuthoringStepLockConflict` does not close this: it only fires when another
session holds a lock on a changed step, and holding a lock is never required to save.

**Fix:** make the field required.

### H7 — The billing provider webhook cannot verify a signature
`apps/api/src/routes/control-plane-billing.ts:126-135`, contract at `apps/api/src/commercial-billing.ts:5-10`

The route declares `body: Type.Unknown()` and passes Fastify's **parsed** `request.body` into `verifyWebhook`.
There is no `addContentTypeParser`/raw-body capture anywhere in `apps/api/src`, so no adapter can HMAC the exact
bytes the provider signed. Any implementation must re-serialize — which breaks on key order and whitespace, and
if made lenient, admits forged billing events on an unauthenticated endpoint.

**Fix:** register a raw-body parser for `/v1/billing/provider-events/:provider` and pass the `Buffer` alongside
the parsed payload.

### H8 — Billing webhook catch-all turns infrastructure failures into a non-retryable 400
`apps/api/src/routes/control-plane-billing.ts:155-166` — `ingestBillingProviderEvent` runs inside the same
`try`, and the final `catch` returns `400 billing_provider_verification_failed` for anything that isn't
`BillingProviderEventConflictError`. A DB outage answers the provider with a 4xx, which providers treat as
"malformed, do not retry" — the event is dropped permanently.

**Fix:** map only `BillingProviderVerificationError` to 400; let the rest become 5xx so the provider retries.

### H9 — `submitUsage` has no idempotency key and no timeout → double-charging
`apps/api/src/commercial-billing.ts:41`, called at `commercial-billing-worker.ts:49`

```ts
submitUsage(batch: BillingMeterBatchRecord): Promise<BillingUsageSubmissionResult>;
```

`AnalyticsWarehouseProvider.deliver` and `DataResidencyProvider.copy/verify/cutover` both take an explicit
replay-stable `idempotencyKey`. This one doesn't, and there's no AbortController. A hung provider call outlives
`BILLING_METER_LEASE_MS` (120s), a second pod claims the same batch (`commercial-entitlements.ts:686-701`) and
reports the same usage again. Same outcome if the process dies between `submitUsage` returning and
`completeBillingMeterBatch`. Compounded by `commercial-entitlements.ts:780` — `2 ** attemptCount * 60_000` with
**no jitter** (webhook, warehouse and residency retries all have it), so a provider outage retries every
workspace in lockstep.

**Fix:** add `idempotencyKey: \`${batch.id}:${batch.meterVersion}\``, a timeout shorter than the lease, and ±20% jitter.

### H10 — Disabled-endpoint webhook deliveries become poison rows that starve the queue
`packages/database/src/drizzle/webhooks.ts:261` (`if (!endpoint || !event) continue;`) vs `:115-128` (disabling
only marks `status='pending'` rows dead). A delivery that is `delivering` when its endpoint is disabled is
missed by the sweep; the worker fails it back to `pending`, then every lease finds no enabled endpoint and
`continue`s — never marking it `dead`, never advancing `attempts`. Because the lease orders by
`available_at asc`, these rows sit at the head of the queue forever and consume batch slots.

**Fix:** in that `continue` branch, `update … set status='dead', lastErrorCode='endpoint_unavailable'`.

### H11 — Ten missing indexes behind queries this branch made hot

| table | query source | existing index | needed |
|---|---|---|---|
| `document_versions` | change-history `:42` | `(workspace_id)` | `(workspace_id, created_at desc)` |
| `publications` | change-history | `(workspace_id, environment_id, published_at)` | `(workspace_id, published_at desc)` |
| `release_operations` | change-history | `(workspace_id, environment_id, document_id, created_at)` | `(workspace_id, created_at desc)` |
| `release_approvals` | change-history | `(workspace_id, release_operation_id, created_at)` | `(workspace_id, created_at desc)` |
| `publication_verifications` | change-history | `(workspace_id, publication_id, created_at desc)` | `(workspace_id, created_at desc)` |
| `document_deployments` | change-history | `(workspace_id, environment_id, state)` | `(workspace_id, updated_at desc)` |
| `experience_comment_audit_events` | change-history | `(workspace_id, document_id, occurred_at)` | `(workspace_id, occurred_at desc)` |
| `accessibility_finding_events` | change-history | `(workspace_id, finding_id, occurred_at)` | `(workspace_id, occurred_at desc)` |
| `data_residency_migration_history` | change-history | `(workspace_id, migration_id, occurred_at)` | `(workspace_id, occurred_at desc)` |
| `analytics_events` | `readExperiment` `experience-measurement.ts:1029` | `(workspace_id, environment_id, document_id, occurred_at)` | `(workspace_id, document_id, occurred_at)` — `document-compilation.ts:41` calls it **without** `environmentId`, breaking the prefix, so every document compile scans the workspace's whole event table |

(`tenant_audit_events` and `governance_audit_events` already have the right `(workspace_id, occurred_at)` index.)
Also add `webhook_deliveries(available_at, created_at, id) where status in ('pending','delivering')` — the
current `(status, available_at)` index can't serve the `OR` between the pending and expired-`delivering`
branches, so the lease full-sorts, and succeeded/dead rows accumulate in the index forever.

### H12 — No retention or pruning on any of the new high-volume tables
The only `DELETE`s in `packages/database` are the TTL sweeps for `experience_step_locks` and
`authoring_presence`. There is no pruning, TTL, `pg_cron` job, or partitioning for `analytics_events`,
`webhook_events`, `webhook_deliveries`, `governance_audit_events`, `analytics_warehouse_sync_runs`,
`analytics_export_audit_events`, `experience_form_responses`, `accessibility_finding_events`,
`delivery_transition_history`, `data_residency_migration_history`, or `billing_provider_events`.
`entitlements.analyticsRetentionDays` is applied only as a **read filter**
(`experience-measurement.ts:275`) — a 30-day-retention tenant still stores events forever and pays for the
index bloat.

**Fix:** a pruning worker (or `pg_partman` monthly partitions on `analytics_events.occurred_at`); delete
succeeded/dead webhook deliveries older than 30 days.

### H13 — `expireAnalyticsExportJobs` transfers up to 1.6GB to null a column
`packages/database/src/drizzle/experience-measurement.ts:857-867` — `select()` (not a projection) over 100
completed jobs whose `result_content_base64` is capped at 16MiB each (`0022_analytics_exports.sql:65`), just to
set it to `null`. Runs on **every** export-worker tick (`:588`, every 5s). Same shape at `:828`, where
`markAnalyticsExportDownloaded` selects the whole blob to test existence.
**Fix:** `.select({ id, workspaceId, requestedByUserId })` in both.

---

## 3. Medium

- **Demo session cookie can never be sent.** `apps/api/src/authoring-demo-links.ts:483` sets `Path=/d/${link.id}`,
  but the endpoints that read it are `/v1/demos/:demoId/artifact` and `/v1/demos/:demoId/events`
  (`packages/schema/src/public-demo-runtime.ts:1-5`). Nothing else carries the session — the client sends only
  `credentials: 'same-origin'` and a JSON body (`packages/sdk-runtime/src/demo-player.ts:120-133`). So **every**
  demo analytics POST 401s with `demo_session_invalid`, and the artifact endpoint's session gate is permanently
  inert (it only rejects a cookie that is present-but-bad). Fix: `Path=/`.
- **Demo-link HMAC secret falls back to a per-process random value.**
  `register-sdk-authoring-operations.ts:158` — `options.demoLinkSecret ?? randomBytes(32).toString('hex')`.
  `LODARIQ_DEMO_LINK_SECRET` is in no `.env.example`, no docs, no deploy config, and not in
  `check-runtime-env.mjs`. A shared public demo link dies non-deterministically on restart or on a second Fly
  machine. Fix: throw at startup when absent.
- **`check-runtime-env.mjs` doesn't know two new production secrets.** Diffing every `process.env.*` read in
  `apps/api/src` against the checker leaves `LODARIQ_DEMO_LINK_SECRET` and `LODARIQ_WEBHOOK_SIGNING_KEY`
  unvalidated. Without the latter, `createOutboundWebhookWorker` is skipped (`app.ts:256`) and
  `POST /v1/governance/webhooks` returns 503 (`control-plane-governance.ts:439`) — the whole webhooks feature is
  off with no deploy-time signal.
- **Catch-alls that mask 500s and leak internal messages.** `register-experience-measurement.ts:253-258, 293-298`
  and `register-sdk-authoring-operations.ts:877-882, 903-908` return `409 experiment_conflict` /
  `422 experiment_invalid` with `error.message` for **any** throw, and `updateExperiment`
  (`experience-measurement.ts:1128,1133`) throws plain `Error` for domain rules — so a DB timeout is
  indistinguishable from a validation failure and the client retries forever. Same at `:492-497`
  (`template_instantiation_failed`), `:727-732` (`analytics_export_scope_invalid`), and
  `control-plane-sdk-installations.ts:248-274`, which returns raw Postgres constraint text in a 400.
  Fix: typed repository errors (as `DeploymentScheduleConflictError` already does) and rethrow the rest.
- **Workspace-wide accessibility sweep is an unthrottled synchronous scan.**
  `apps/api/src/accessibility-governance.ts:33-70` lists every document and issues two queries per document
  inline in the request, capped only at 10,000 findings. `control-plane-accessibility.ts:39-63` is the one
  mutating governance route that never calls `enforceGovernanceMutationQuota`, and its `Idempotency-Key` is
  checked for `typeof string && trim()` only — not the shared `^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$` pattern used
  at `control-plane-governance.ts:735`. Any member can loop with random keys and pin a connection per request.
- **Measurement endpoints declare no `response` schema** while every client validates against
  `ExperienceMeasurementConfig` (`apps/dashboard/src/lib/api.ts:687-702`,
  `apps/editor/src/hosted-operations-services.ts:115-125`). Drift in `adaptivePolicy`/`successEvent` surfaces as
  a client-side contract error instead of being caught by the serializer.
  (`register-experience-measurement.ts:69,89`; `register-sdk-authoring-operations.ts:633,640`.)
- **Reconciliation mismatch permanently kills a pipeline with no dead-letter.**
  `drizzle/analytics-warehouse.ts:295` and `commercial-entitlements.ts:748` set `attemptCount = MAX_ATTEMPTS` on
  a single mismatch, and the claim queries require `attemptCount < MAX_ATTEMPTS`. One bad provider echo removes
  the destination/batch from the queue forever — no alert, no operator reset route.
- **SCIM base path moved without a compatibility window.** `routes/enterprise-identity.ts:904,918,946,964,1049,1103`
  (and the `location` header at `:1035`) moved `/scim/v2/*` → `/v1/scim/*`. Already-provisioned Okta/Entra
  connectors start 404-ing on the next sync. The same commit moved the OIDC callbacks
  (`auth/oidc-provider.ts:213`, `auth/enterprise-oidc-provider.ts:279`) and those **throw at startup** if
  `LODARIQ_*_REDIRECT_URI` still ends `/api/auth/...` — so the env change must ship with the deploy.
- **`workspace_applications.theme_id` has no composite scope FK.** `0014_experience_measurement.sql:157` is a
  bare `text`, unlike every other cross-reference on this branch (0018/0022/0029/0032/0033 all use
  `foreign key(workspace_id, x) references t(workspace_id, id)`). `PUT /v1/applications/:applicationId`
  (`register-experience-measurement.ts:527`) spreads the body straight through, so workspace B can persist a
  pointer to workspace A's theme id. Content doesn't leak today (theme reads go through
  `findWorkspaceTheme(tx, workspaceId, themeId)`) — it's a latent dangling cross-tenant reference.
- **Public SDK form-responses accepts any `documentId` in the workspace.**
  `register-sdk-delivery.ts:318-330` validates only `getDocument(scope.workspaceId, body.documentId)`. The
  installation id is public page source and `Origin` is forgeable by any non-browser client, so anyone can record
  50 × 2,000-char responses against a document never deployed to that environment. Contrast `recordPublicEvent`,
  which validates `stepId` against the artifact's step set. Fix: require an active deployment in
  `scope.environmentId` and validate `stepId`/`blockId` against the deployed artifact.
- **The RLS coverage test can't match the two billing tables.**
  `packages/tests/database/src/repository.test.ts:2431-2437` asserts a `${table}_workspace_isolation` policy
  unless overridden, and `billing_provider_events` / `billing_meter_batches` use `_workspace_select` names with
  no entry in `WORKSPACE_ISOLATION_POLICY_NAMES` (`:53-74`). As written the test fails; if it gets loosened,
  both tables silently lose the guard. (This is the check that would have caught H1.)
- **In-memory change-history omits a source drizzle includes.** Drizzle reads 11 sources
  (`drizzle/governance-change-history.ts:98-101`); the in-memory version reads 9, missing
  `dataResidencyMigrationHistory` — which *is* written (`in-memory/governance.ts:685,760`), just never read back.
  Since all API tests use `createInMemoryControlPlaneRepository`, the residency change-history path is entirely
  unexercised.
- **`listDocuments` is a 2N+1.** `drizzle/documents.ts:311-333` does `select()` (including `canonical jsonb`)
  over all workspace documents with no LIMIT, then per row `getLatestArtifact` + `getLatestPublicationsForDocument`
  — the latter fetching all publications and deduping by environment in JS. Fix: projection +
  `DISTINCT ON (environment_id)` with `inArray(documentIds)`.
- **The new design-token gate never runs in CI.** `package.json:25,51` adds `tokens:check` to `verify`, but
  `.github/workflows/verify.yml:15-29` doesn't list it. The new 159-line script and 219-line baseline only run
  locally.
- **`leaseWebhookDeliveries` issues 3 queries per row while holding `FOR UPDATE` locks**
  (`drizzle/webhooks.ts:235-281`) — up to 300 round-trips at max batch size. Fix: `innerJoin` + one
  `UPDATE … WHERE id = ANY($1) RETURNING *`.
- **Analytics export generation is CPU-bound and inline in the API process.**
  `analytics-export-worker.ts:109-135` — `buildRawAnalyticsJsonl` + base64 over up to 16MiB, synchronous, two
  jobs per tick, on a pod also serving HTTP.

---

## 4. Low / cleanup

- `apps/api/src/routes/control-plane/helpers/sdk-cors.ts:10-23` echoes an arbitrary `Origin` on OPTIONS. Not
  credential-bearing and the real response only gets an ACAO for allow-listed origins, so responses stay
  unreadable — but it does let an attacker page get a preflight approved for the newly-widened
  `PUT/PATCH/DELETE`. Validate the origin in the preflight handler too.
- The demo-link public RLS policy (`0028_authoring_roadmap_records.sql`) matches on
  `kind='demo_link' and status='active'` with **no expiry predicate**; expiry is enforced only in app code
  (`authoring-demo-links.ts:437`) and the status flip is fire-and-forget. Add
  `and (expires_at is null or expires_at > now())` as the DB backstop.
- Step-lock 409 discloses the holder's internal user id (`packages/schema/src/experience-measurement.ts:422-430`)
  — `holderName` alone satisfies the UX intent.
- Webhook secret rotation is unimplemented: `control-plane-governance.ts:460,498` hard-code `secretVersion: 1`,
  there's no rotate route, and `deriveWebhookSigningSecret` derives everything from one root key — so rotating
  it breaks every receiver at once with no overlap window. The DB column already supports versions.
- `listWebhookDeliveries` returns up to 10,000 full rows with no pagination (`drizzle/webhooks.ts:356-361`).
- Worker-flag RLS disjuncts (`lodariq.webhook_worker` etc.) are unconditional cross-tenant grants gated on a
  *settable GUC*. All ten call sites are genuinely background pollers today, so no live IDOR — but
  `webhook_endpoints_workspace_select` is that table's only select policy, so any future request-path use of
  `runWithWebhookWorkerScope` returns every tenant's endpoint URLs. Consider a dedicated DB role, or at minimum
  a lint rule confining `runWith*WorkerScope` to `apps/api/src/*-worker.ts`.
- `governance_audit_events.environment_id` and `tenant_audit_events.environment_id`
  (`0025_governance_capability_profiles.sql:32,41`) are bare `text` with no composite scope FK.
- Constraint-name drift: `schema/environments.ts:130` says `environments_governance_capabilities_check`;
  `0025:9` creates `..._check_v1`. No runtime effect, but any future schema-drift diff flags it. That same
  `alter table` also lacks an `if not exists` guard (unlike 0020's `pg_constraint` pattern), so re-running 0025
  aborts.
- Dead cross-workspace branch in `commercial-entitlements.ts:505-521` — the dedupe select is RLS-scoped, so the
  `existingEvent.workspaceId !== input.workspaceId` guard is unreachable; the real collision surfaces as a
  generic 409 from the global unique index.
- Anonymous demo analytics can be inflated — `authoring-demo-links.ts:298-348` has no rate limit.
- **`shot.mjs` and `shot2.mjs` at the repo root should not be committed.** Both hardcode
  `/Users/mahmoudshayeb/Desktop/lodariq/node_modules/.pnpm/...` and write to a `/private/tmp/claude-501/`
  scratchpad. `shot2.mjs:16` calls `window.__meridian.openAuthoring()`, which exists nowhere in the codebase —
  the script is already dead.

---

## 5. What's solidly built

Worth saying, because the density of findings above understates the quality of the foundation:

- **RLS discipline is real.** All 44 new tables have both `enable` and `force row level security`. Zero
  `using (true)` anywhere. Every one of the 85 `tenantScopedTableNames` entries maps to a real table, and every
  workspace-scoped table in the chain is in the array. Composite `(workspace_id, id)` foreign keys are used
  consistently — `workspace_applications.theme_id` is the single exception.
- **Every new repository method runs inside a scope helper.** All 44 methods in `experience-measurement.ts`, plus
  `governance.ts`, `webhooks.ts`, `accessibility-governance.ts`, `commercial-entitlements.ts`,
  `delivery-orchestration.ts`, `data-residency.ts`. The three raw `database.transaction` calls each set a GUC
  first. Every id-taking method also filters on `workspaceId` in the WHERE clause. No worker scope is reachable
  from a request path.
- **No workspace id is ever accepted from params, query, or body** across the 802 new lines of
  `control-plane-governance.ts`, `register-experience-measurement.ts`, or the 1,946 lines of
  `register-sdk-authoring-operations.ts` — it always comes from the session. `assignGovernanceCapabilityProfile`
  (`drizzle/governance.ts:212-248`) validates the profile, the target membership, *and* the environment all
  belong to the caller's workspace before inserting.
- **OIDC/SSO is correct.** 32-byte state and nonce, stored as SHA-256 and compared with `timingSafeEqual`; PKCE
  S256 on both flows; verifier+nonce sealed in AES-256-GCM with attempt-id AAD; `jwtVerify` pinning
  issuer/audience/RS256/`maxTokenAge: 10m`; enterprise discovery re-checks `body.issuer === connection.issuer`
  and pins endpoints to the issuer origin; single-use state. `emailVerified` is never used to link an existing
  account — `authenticateEnterpriseSso` returns `conflict` on any existing `user_emails` row and requires a
  verified domain row for the same connection. Group→role mapping is capped, admin-configured, never grants
  `owner`, and is intersected with the base role. Domain verification puts the token hash in the UPDATE's WHERE
  clause, which closes the cross-tenant `_lodariq.<domain>` collision.
- **Token handling throughout:** 18–24 random bytes, stored and looked up as SHA-256; no `===` on a secret
  anywhere; no low-entropy value hashed as a credential. Cookies are `__Host-` prefixed, `HttpOnly`,
  `SameSite=Lax`, `Secure` in production. The logger redacts `authorization`, `cookie`, `set-cookie`, `*.token`,
  `*.state`, `*.code`. Dev header auth throws in production.
- **The public demo shell has no stored XSS** — CSP `default-src 'none'`, nonce-only styles,
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `no-store`; the artifact is JSON and redaction covers
  targets, triggers, audience, experiment, per-step `targetId`/`lifecycle`/`showWhen`/`handoff`, body-run links
  and unsafe actions, localization variants included.
- **Input validation is complete.** All 240 `fastify.<method>` registrations have matching TypeBox schemas; every
  body/query/params schema resolves to `additionalProperties: false` (so the `{ ...scopeOf(session), ...body }`
  spreads can't be used to shadow `workspaceId`); every new array and pagination input has an explicit cap; no
  throwing `.parse()` on a request path.
- **Concurrency control is mostly excellent** — `claimExperienceStepLock` is a single atomic
  `INSERT … ON CONFLICT DO UPDATE` with a lease predicate; `releaseExperienceStepLock` filters on both
  `holderUserId` and `sessionId`; `updateGovernanceCapabilityProfile` uses `FOR UPDATE` + `expectedRevision`;
  `observeWorkspaceDataCatalog` and `updateExperiment` take advisory transaction locks;
  `lockSortedReleaseDocumentEnvironments` deliberately locks in sorted order to avoid deadlock. H6 is the one
  gap.
- **Worker tick discipline is right** — all six use `if (stopped || active) return` with `setTimeout` rescheduled
  in `finally`, no overlapping ticks, no unhandled rejections; `app.ts:470-480` `onClose` awaits every
  `worker.stop()`, so jobs drain rather than being abandoned. Warehouse and residency idempotency keys are
  replay-stable. Webhook signing is HMAC-SHA256 over `${timestamp}.${body}` with a 300s tolerance and
  `timingSafeEqual`; redirects are `manual` and classified as `redirect_forbidden`.
- **Repository parity is genuinely good.** Every method across the nine new sub-repository interfaces has a real
  implementation in both `drizzle/` and `in-memory/` — zero gaps, faithful mirrors of workspace filtering,
  ordering, limit clamps, lease-owner checks, and error types. The in-memory change-history source is the only
  divergence found.
- Postgres tests really do run in CI against the full checked-in migration chain
  (`verify.yml:71-72`, `governance-platform-postgres16.test.ts:42`) — the fresh-database path is well covered.
  The untested path is strictly the *upgrade* of an existing database, which is exactly where B2 hides.

---

## 6. Verdict

**Request changes.** The eight blockers in §1 are not style disagreements — three of them (B1, B2, B3) mean the
branch cannot be deployed successfully at all, and B4/B5 are customer-visible. The security architecture
underneath is strong; the failures cluster in the seams between layers, and specifically in the paths that no
test exercises: browser preflights, the migration *upgrade* path, drizzle-backed routes (all API tests use the
in-memory repo), and production provider wiring.

The highest-leverage structural fix is the last one: **add one end-to-end test that runs a route against the
drizzle repository on an upgraded (not freshly built) database.** That single test would have caught B2, H1, and
the in-memory change-history divergence.

Suggested order: B2 + B3 first (they gate every deploy), then B1, then B5 + B4, then H1 + H2 + H4 + H5, then the
index batch in H11.
