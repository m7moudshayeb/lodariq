# Lodariq Implementation Progress

Tracks what has been implemented against `refined-lodariq-prd.md`. Section
references like (PRD §16.0) point to that document.

- Current phase: **Phase 1 — Foundation** (PRD §16.3)
- Last updated: 2026-06-30
- Current evidence audit: `docs/plans/phase-1-foundation-audit.md`

Status legend:

- ✅ Done — implemented and verified (`pnpm verify` or the named check is green).
- 🟡 Scaffolded — structure/contract in place; full behavior lands in a later phase.
- ⏳ Pending — not started yet (belongs to a later phase).
- ➖ N/A yet — deliberately deferred per the PRD.

---

## Phase -1 scope (PRD §16.0)

| Item                                                                 | Status | Where / Notes                                                          |
| -------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Product naming: `Lodariq`, `@lodariq/*`, `*.lodariq.com` (PRD §16.0) | ✅     | Used across packages, ADRs, origin model                               |
| One repo with pnpm workspaces (PRD §12.1, §16.0)                     | ✅     | `pnpm-workspace.yaml`                                                  |
| Turborepo for task caching (PRD §16.0)                               | ✅     | `turbo.json`                                                           |
| Strict TypeScript (PRD §16.0)                                        | ✅     | `tsconfig.base.json` (strict + extras)                                 |
| ESLint + Prettier (PRD §16.0)                                        | ✅     | `eslint.config.mjs`, `.prettierrc.json`                                |
| Vitest (PRD §16.0)                                                   | ✅     | Centralized `@lodariq/tests` (jsdom per-file)                          |
| Playwright (PRD §16.0)                                               | ✅     | Fixture-host e2e runs through `pnpm verify`                            |
| Bundle-size gates (PRD §16.0, §9.1)                                  | ✅     | Runtime gzip gate for loader + runtime/tour                            |
| dependency-cruiser (PRD §16.0)                                       | ✅     | `.dependency-cruiser.cjs` + ESLint guards                              |
| `packages/schema` `@lodariq/schema` (PRD §16.0)                      | ✅     | TypeBox contracts + registry + validate                                |
| `packages/compiler` `@lodariq/compiler` (PRD §16.0)                  | ✅     | Pure isomorphic compile + content hash                                 |
| `packages/sdk-runtime` `@lodariq/sdk-runtime` (PRD §16.0)            | ✅     | loader, runtime, resolver, renderers, local-dev                        |
| └ `src/loader` (PRD §16.0)                                           | 🟡     | Config read, manifest fetch, lazy loaders                              |
| └ `src/runtime` (PRD §16.0)                                          | 🟡     | identify/track + analytics batching/beacon                             |
| └ `src/resolver` (PRD §16.0)                                         | ✅     | Confidence scoring + found/missing/ambiguous                           |
| └ `src/renderers` (PRD §16.0)                                        | 🟡     | Linear tour renderer, focus, lifecycle waits, scroll                   |
| └ `src/local-dev` (PRD §16.0)                                        | 🟡     | Local persistence, import/export, preview compile, metrics             |
| `packages/sdk-authoring` `@lodariq/sdk-authoring` (PRD §16.0)        | ✅     | authoring, bridge, editor                                              |
| └ `src/authoring` (PRD §16.0)                                        | 🟡     | Local iframe shell + target-pick wiring                                |
| └ `src/bridge` (PRD §16.0)                                           | 🟡     | Origin checks, validation, ack/timeouts, target pick                   |
| └ `src/editor` (PRD §16.0)                                           | 🟡     | Lexical boundary, stable IDs, serialize/migrate hooks                  |
| `apps/fixture-host` (PRD §16.0)                                      | ✅     | SaaS-like routes/drawer/scroll/lazy + SDK boot                         |
| `apps/customer-like-host` (PRD §16.2)                                | ✅     | Secondary SDK host for Phase 0 overfitting checks                      |
| `apps/sdk-playground` (PRD §16.0)                                    | ✅     | Compiles fixture to delivery JSON                                      |
| No production dashboard/API/worker in Phase -1 (PRD §16.0)           | ✅     | Intentionally absent in Phase -1; API/dashboard added below in Phase 1 |
| Package-boundary checks (PRD §16.0, §9.1)                            | ✅     | Verified to fail on react/lexical/authoring imports                    |
| Lexical only in `sdk-authoring/src/editor` (PRD §16.0, §20)          | ✅     | dependency-cruiser rule `lexical-only-in-editor`                       |
| First canonical block JSON fixture (PRD §16.0)                       | ✅     | `packages/schema/fixtures/tour.linear.v1.json`                         |
| ADRs for the load-bearing decisions (PRD §16.0)                      | ✅     | `docs/adr/` (13 records)                                               |

### Phase -1 acceptance criteria (PRD §16.0)

| Criterion                                                                     | Status | Notes                                                              |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| CI runs typecheck, lint, tests, e2e, audit, and bundle-size checks            | ✅     | Workflow runs `pnpm verify`, including Playwright and `pnpm audit` |
| Repo builds loader, runtime, authoring, compiler, fixture-host artifacts      | ✅     | tsup + Vite; `dist/` is Node-ESM runnable                          |
| Package-boundary checks fail on forbidden imports                             | ✅     | Proven with `react` and `lexical` probes                           |
| First block JSON fixture versioned and validated by `@lodariq/schema`         | ✅     | Validated in `packages/tests/schema/src/document.test.ts`          |
| No production code depends on Markdown parsing, custom grammar, or WebSockets | ✅     | None present anywhere                                              |

---

## Decisions captured as ADRs (PRD §16.0)

| ADR                                      | PRD refs            | Status                           |
| ---------------------------------------- | ------------------- | -------------------------------- |
| 0001 runtime/authoring package split     | §9.1, §16.0, §20    | ✅ Accepted                      |
| 0002 schema + compiler shared core       | §9.1, §11.1, §12.1  | ✅ Accepted                      |
| 0003 server-side publication compilation | §9.1, §11.3, §20    | ✅ Accepted                      |
| 0004 authoring/editor boundary           | §7.2, §20           | ✅ Accepted                      |
| 0005 iframe bridge                       | §9.4, §9.5, §11.1   | ✅ Accepted                      |
| 0006 origin model                        | §12.5, §20          | ✅ Accepted                      |
| 0007 DnD approach                        | §7.2, §19.6         | 🟡 Proposed                      |
| 0008 resolver strategy                   | §8.1–§8.6           | ✅ Accepted                      |
| 0009 local test harness                  | §16.0–§16.2         | ✅ Accepted                      |
| 0010 secrets management                  | §12.1               | 🟡 Proposed                      |
| 0011 tenant isolation + RLS              | §11.2, §20          | ✅ Accepted (applies at Phase 1) |
| 0012 deferred-vendor triggers            | §12.1, §12.2, §19.8 | ✅ Accepted                      |

---

## Architecture contracts realized

| PRD concept                                                  | Status | Implementation                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical block document is source of truth (PRD §3.1, §7.1) | ✅     | `schema/src/document.ts`, `block.ts`                                                                                                                                                                                                          |
| Element fingerprint (PRD §8.3)                               | ✅     | `schema/src/target.ts`                                                                                                                                                                                                                        |
| Runtime lifecycle hints (PRD §8.6)                           | 🟡     | Route/text/element/network-idle waits, semantic open-panel/select-tab activation, scroll containers, skeleton/loading state, transformed content, and virtualized-search covered                                                              |
| Resolution scoring (PRD §8.4)                                | ✅     | `sdk-runtime/src/resolver` scores captured semantic signals, including stable attrs, role/name, labels, landmarks, nearby text, tag/input type, relative position, and scoped CSS; resolver tests include a stale-CSS selector fixture corpus |
| Compiled delivery JSON + content hash (PRD §6.1, §11.3)      | ✅     | `compiler/src/compile.ts`, `hash.ts`                                                                                                                                                                                                          |
| Manifest pointer / immutable publication (PRD §11.3)         | 🟡     | `ManifestPointer` schema plus Phase 1 environment publication records; full object/manifest pipeline pending                                                                                                                                  |
| Bridge message protocol + envelope (PRD §9.5, §11.1)         | ✅     | `schema/src/bridge.ts`, validated in `sdk-authoring/src/bridge`, ack/timeouts and message-size limits included                                                                                                                                |
| Bridge page-state observation (PRD §9.5)                     | ✅     | `sdk-authoring/src/authoring` emits coalesced `page.lifecycle.update` route/scroll messages with ack/timeout handling                                                                                                                         |
| Data catalog entry (PRD §6.3)                                | 🟡     | `schema/src/catalog.ts`; builder UI pending                                                                                                                                                                                                   |
| Analytics + selector diagnostic events (PRD §15)             | 🟡     | Schemas, runtime batching, page-exit beacons, token/user-auth ingestion routes, and sanitized SDK error events; dashboard analytics views pending                                                                                             |
| Local Phase 0 usability metrics (PRD §16.2)                  | ✅     | Local metrics capture time-to-first-block, time-to-first-target, failed picks, preview-open, and cancel rate                                                                                                                                  |
| Target chip actions and health (PRD §8.2, §16.2)             | ✅     | Authoring target chips expose view/change/test/health/remove/advanced details, resolve saved fingerprints through the host bridge, and mark steps incomplete when a target is removed without deleting content                                |
| Nested target and click-through UX (PRD §8.2)                | ✅     | Host picker supports parent/deeper candidate cycling plus one-click product click-through while selection remains active                                                                                                                      |
| Product-click gated tour steps (PRD §7.1, §8.6)              | ✅     | Button actions support `clickTarget`; runtime listens for the real resolved target click, lets the host app handle it, advances with lifecycle waits, and resumes after same-tab navigation/reload when the manifest/document still match     |
| Stable block IDs ≠ Lexical node keys (PRD §7.2, §20)         | ✅     | `sdk-authoring/src/editor/ids.ts`                                                                                                                                                                                                             |
| Serialization + versioned migrations (PRD §7.2)              | ✅     | Lexical helpers, migration hook, and local frame round-trip through the Lexical serialization boundary                                                                                                                                        |
| No arbitrary HTML/CSS in documents (PRD §7.10, §14.2)        | ✅     | Block/compiled `props` use narrow allowlists; import rejects arbitrary CSS/JS/raw HTML props                                                                                                                                                  |

---

## Guardrails compliance (PRD §20)

| Guardrail                                                                            | Status                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------- |
| No canvas editing against raw Markdown strings                                       | ✅                                            |
| No Markdown-to-JSON compiler / custom grammar in Pre-phase…Phase 1                   | ✅                                            |
| Lexical not imported outside `sdk-authoring/src/editor`                              | ✅                                            |
| `sdk-runtime` and `sdk-authoring` not collapsed; runtime cannot import React/Lexical | ✅                                            |
| Production runtime does not depend on `sdk-authoring`                                | ✅                                            |
| Browser compilation is preview-only (real artifact server-side)                      | ✅ (preview path only exists)                 |
| No Vercel; Fly.io intended                                                           | ✅ (Fly configs and runbook added in Phase 1) |
| No standalone WebSocket gateway                                                      | ✅                                            |
| Zod not used as canonical contract (TypeBox/JSON Schema)                             | ✅                                            |
| Slash commands treated as gestures, not durable syntax                               | ✅ (local authoring frame)                    |
| Coordinates never trigger production interactions                                    | ✅ (resolver: coordinates diagnostic-only)    |

---

## Pre-Phase Codewise Sign-Off

- **Pre-Phase code gates:** local SDK install, authoring, target picking,
  playback, serialization, import/export, migrations, accessibility smoke tests,
  package boundaries, size checks, e2e, and audit are covered by `pnpm verify`.
- **Status:** complete for the implemented code scope as of 2026-06-29.

## Phase 0 Codewise Sign-Off

- **Status:** complete for codewise Phase 0 SDK UX and integration validation as
  of 2026-06-29. The SDK authoring UI, fixture host, customer-like host,
  resolver lifecycle coverage, local metrics, bridge semantics, bundle-size
  gates, Playwright matrix, and security audit are covered by `pnpm verify`.

## Phase 1 Foundation Progress

| Item                                                              | Status | Where / Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` `@lodariq/api` Fastify modular monolith                | 🟡     | `apps/api`; Fastify 5 app, health route, document, environment, token, event routes, Fly.io service config                                                                                                                                                                                                                                                                                                                                                                                                                             |
| TypeBox/JSON Schema at API boundary                               | 🟡     | Route schemas for params/simple bodies, SDK authoring save wrapper bodies, and event batches; canonical documents validated through `@lodariq/schema`                                                                                                                                                                                                                                                                                                                                                                                  |
| OpenAPI route discovery                                           | 🟡     | `GET /openapi.json` generated by `@fastify/swagger` from Fastify route schemas for client integration                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Thin auth boundary                                                | 🟡     | `apps/api/src/auth`; dev headers plus Clerk token verifier scoped by active organization claims, explicit production Clerk auth mode, and invalid auth-mode rejection                                                                                                                                                                                                                                                                                                                                                                  |
| Dashboard Clerk auth UI and credential forwarding                 | 🟡     | Dashboard uses Clerk Next.js provider, protected Proxy middleware, sign-in/sign-up routes, user/org controls, and a `server-only` API helper that forwards request bearer or `__session` cookie to the API; dev workspace headers are local fallback only                                                                                                                                                                                                                                                                              |
| Workspace-scoped document access                                  | 🟡     | API passes `AuthContext.workspaceId`; repository rejects workspace mismatch                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| API role gates                                                    | 🟡     | Viewer sessions can read but cannot save documents, compile artifacts, or mint SDK tokens                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Server-side document compilation                                  | 🟡     | API save/compile routes call `@lodariq/compiler` and validate compiled JSON                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Internal JSON/debug view                                          | 🟡     | `GET /v1/debug/documents/:documentId` plus on-demand dashboard support panel return redacted canonical JSON, delivery JSON, latest artifact metadata, and version history; dashboard action coverage verifies sensitive canonical/compiled keys are redacted before client state                                                                                                                                                                                                                                                       |
| Basic event ingestion and SDK error reporting                     | 🟡     | User-auth `POST /v1/events`, token-auth `POST /v1/sdk/events`, runtime batching, page-exit beacon delivery, API-side sensitive event prop redaction, sanitized runtime error events, automatic playback-failure reporting, and publication correlation IDs propagated into runtime events                                                                                                                                                                                                                                              |
| `packages/database` `@lodariq/database`                           | 🟡     | Drizzle/Neon schema, token helpers, document version history, environment-scoped publication records, additive correlation-ID migration, tenant-scoped in-memory and Drizzle repositories                                                                                                                                                                                                                                                                                                                                              |
| RLS migration                                                     | ✅     | `packages/database/drizzle/0000_phase_1_foundation.sql` applied to live Neon on 2026-06-30; tenant tables have forced RLS; token lookup policies are bounded to environment token/environment rows and documented in ADR 0011 plus the Fly/Neon runbook                                                                                                                                                                                                                                                                                |
| Runtime DB role provisioning                                      | ✅     | `pnpm db:provision:runtime-role` created/updated permanent live Neon role `lodariq_app` with `BYPASSRLS` disabled; local `.env.local` now stores the non-owner `DATABASE_URL`                                                                                                                                                                                                                                                                                                                                                          |
| Live RLS smoke command                                            | ✅     | `pnpm rls:verify:live` passed on live Neon with permanent role `lodariq_app`; verified scratch tenant isolation, token lookup, document versions, and publication rows                                                                                                                                                                                                                                                                                                                                                                 |
| Destructive migration guard                                       | ✅     | `pnpm run migrations:check` scans Drizzle SQL and requires explicit sign-off metadata for destructive shared-env migrations                                                                                                                                                                                                                                                                                                                                                                                                            |
| Deployment runtime env checks                                     | ✅     | `pnpm live:check-env` verifies production API/dashboard env shape before live smoke tests; rejects owner DB roles, missing Clerk parties, missing dashboard Clerk keys, localhost URLs, and non-HTTPS origins                                                                                                                                                                                                                                                                                                                          |
| Fly deployment packaging                                          | ✅     | API, dashboard, and hosted editor Fly configs use explicit monorepo Dockerfiles; staging and production configs are split; API serves `/healthz`, dashboard ships Next standalone assets, and editor serves `/authoring.html`                                                                                                                                                                                                                                                                                                          |
| Deployment provider runbook                                       | ✅     | `docs/deployment/phase-1-fly.md` documents staging/production Fly apps for API/dashboard/editor, Neon migrations including additive correlation IDs, Clerk, Cloudflare R2/DNS, Sentry, Resend, Stripe, secrets, promotion, rollback, and rotation setup                                                                                                                                                                                                                                                                                |
| `apps/dashboard` `@lodariq/dashboard` Next.js control-plane shell | 🟡     | Next.js 16, Fly config, document list with owner/last-edit/publication state, environment list, SDK snippet, authoring launch forms, and on-demand debug JSON inspection                                                                                                                                                                                                                                                                                                                                                               |
| Dashboard component system                                        | 🟡     | shadcn-style local Radix/Tailwind components, TanStack Table document list search/sorting, client components kept on server actions instead of direct fetch calls, visible dark-default theme tokens, theme toggle without inline color-scheme locking, and dark authoring surfaces                                                                                                                                                                                                                                                    |
| Staging SDK token/snippet flow                                    | 🟡     | Dashboard server actions mint/revoke environment tokens, expose only staging environments in the Phase 1 install panel, return module SDK snippets only at creation time, keep client tokens out of list/debug responses, and install the generated snippet into a fake allowed staging host in browser e2e coverage                                                                                                                                                                                                                   |
| Staging creator authoring gate                                    | 🟡     | Dashboard creates short-lived authoring launch snippets that load `lodariq-creator.js`; SDK bootstrap header gate plus creator-only installer/toolbar keep ordinary installs disabled; hosted editor init/load/save all require the scoped authoring session                                                                                                                                                                                                                                                                           |
| Token-scoped SDK bootstrap                                        | 🟡     | `/v1/sdk/bootstrap` resolves environment token to the current published artifact for that environment                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| SDK current-document playback path                                | 🟡     | `/v1/sdk/current-document` returns the current published server artifact for the token environment                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| SDK token CORS/origin enforcement                                 | 🟡     | SDK endpoints use bearer environment tokens, reject revoked tokens, require exact environment origin allowlist matches for browser-origin requests, and withhold readable CORS responses from denied actual origins                                                                                                                                                                                                                                                                                                                    |
| Production SDK bundle gates                                       | ✅     | `@lodariq/sdk-runtime` gates loader and runtime+tour size, browser-resolvable imports, and built-bundle React/Lexical/authoring/dashboard references; `@lodariq/sdk-authoring` gates creator-only Lodariq-owned authoring, creator installer, and toolbar chunks                                                                                                                                                                                                                                                                       |
| SDK CDN asset packaging                                           | ✅     | `pnpm sdk:prepare-assets` stages loader/runtime/tour/creator CDN files under `dist/sdk-assets/sdk/`, follows relative chunks, strips source-map comments, and emits a SHA-256/cache-policy manifest for Cloudflare R2 upload                                                                                                                                                                                                                                                                                                           |
| Dependency security gate                                          | ✅     | `pnpm audit` is clean after patched Drizzle and PostCSS dependency graph                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Phase 1 focused tests                                             | 🟡     | API, database, resolver stale-CSS fixture corpus, publication/authoring correlation propagation, direct document ID workspace isolation, API-backed dashboard, dashboard client/server-action boundary, debug JSON redaction, target-chip health copy helpers and component render states, real Next browser dashboard flow, generated SDK module snippet install/playback, token revocation, short-lived authoring launch install/save, creator toolbar gate, drag-to-reorder canonical/preview sync, five-step browser playback budget, SDK loader/runtime tests, target-controls render-state test |

### Phase 1 Remaining

- Apply the Fly/Neon/Clerk/Cloudflare setup in
  `docs/deployment/phase-1-fly.md`: store the permanent non-owner Neon
  `DATABASE_URL` plus Clerk secrets as Fly runtime secrets, deploy the editor
  Fly app, then run `pnpm live:check-env` in the deployed API/dashboard runtime
  shape; reserve `neondb_owner` for migrations/admin work.
- Run a live Clerk environment smoke test with dashboard sign-in, active
  organization selection, dashboard-forwarded credentials, and
  `CLERK_AUTHORIZED_PARTIES` configured.
- Run the browser/Next dashboard flow against deployed staging API and Clerk
  credentials once live service configuration is available.
- Run a live Clerk-backed creator authoring-session smoke test against the
  deployed dashboard launch flow, staging API, and hosted editor iframe.
- Expand `pnpm verify` coverage after the live API/database/dashboard paths are
  connected.

## Remaining Before Full Phase 0 Product Sign-Off

- **Phase 0 product evidence:** code-side hardening and the usability script
  are in place, but design-partner/proxy-creator completion rates, 80%
  slash-to-block comprehension, and first-tour-under-10-minutes need real test
  sessions and recorded metrics.

## Later Phases

- **Phase 0 (PRD §16.2):** design-partner usability evidence and the optional
  Edge-channel browser run where the channel is installed.
- **Phase 1 (PRD §16.3):** live Clerk auth, deployed staging dashboard/API
  smoke coverage, staging authoring integration, and production SDK build
  pipeline hardening.
- **Phase 2+ (PRD §16.4–§16.8):** hosted demos, media export, in-app delivery,
  governance, analytics, platform maturity.
- **Infrastructure (PRD §12):** Fly.io, Cloudflare R2/CDN, and deployed secrets
  manager wiring remain; the destructive-migration gate and live RLS verifier
  are now enforced locally.

---

## How to verify current state

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs typecheck, lint, package boundaries, migration safety checks,
unit tests, build, bundle-size checks, SDK CDN asset staging, fixture-host
Playwright e2e, and `pnpm audit`.
