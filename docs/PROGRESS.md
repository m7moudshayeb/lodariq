# Lodariq Implementation Progress

Tracks what has been implemented against `refined-lodariq-prd.md`. Section
references like (PRD §16.0) point to that document.

- Implemented phase: **Phase 0/1 codewise foundation retained; the Phase 2 local
  code milestone is complete. Product Match and atomic provenance, exact browser
  verification, Brand drift/acknowledgement, exact-artifact promotion and
  rollback, unpublish, and environment-isolated analytics are implemented. The
  current repository completion
  checkpoint passed the full Node 24 `pnpm verify`: **18 typecheck tasks, 12 lint
  tasks, dependency boundaries and migration safety, 126 Vitest files / 1,064
  tests, 11 builds, runtime/authoring bundle-size gates, 109 prepared SDK assets,
  77 Playwright tests with four intentional skips, and `pnpm audit` with zero
  known vulnerabilities**. This is a complete local stabilization gate, not a
  deployed-operation claim**
  (PRD §§16.2–16.4)
- Active phase: **Phase 2 — In-Product Authoring, Brand, and Release Foundation;
  Slice 0, the Editorial Air compatibility shell, Target Identity V2,
  exact-area Tour-tooltip behavior, and Slice 1 hosted entry are implemented and
  passed the consolidated local repository gate. Current-view Editorial Air
  structural QA passes; live/deployed evidence remains pending. Core
  Lodariq-owned auth is code-complete and active runtime/dependencies are
  Clerk-free; recovery,
  reset, unified outbox delivery, capability gates, activation recovery UX, and
  the consolidated local milestone gate pass. Slice 2 now includes the
  tokenized Tour renderer, persisted Brand Theme workflow, document-specific
  delivery, deterministic basic preflight, and guarded staging publication.
  Its consolidated local gate and current-view Design QA pass. Slice 3 and its
  preview/atomicity/findings hardening pass locally. Slice 4 Brand drift,
  acknowledgement, release recovery, unpublish, and analytics isolation also
  pass their local gates. Production enablement, first deployment, live RLS and
  smoke/convergence evidence, the B4 measurement-backed ADR, and usability
  evidence remain pending**
  (PRD §16.4)
- Last updated: 2026-08-15
- Current execution plan:
  `docs/plans/phase-2-technical-completion.md`

Status legend:

- ✅ Done — implemented and verified (`pnpm verify` or the named check is green).
- 🟡 Scaffolded — structure/contract in place; full behavior lands in a later phase.
- ⏳ Pending — not started yet (belongs to a later phase).
- ➖ N/A yet — deliberately deferred per the PRD.

---

## 2026-08-15 Tour rich-content checkpoint

- The Tour popup uses one reusable freeform Rich Content editor for text,
  headings, lists, callouts, dividers, links, emoji, allowlisted Lucide icons,
  images/GIFs, videos/captions, inline highlight/motion, numeric spacing, and
  resizable media. CTA buttons remain separate action items and can move before
  or after the content.
- Canonical output remains closed Lodariq block JSON with bounded inline runs;
  Lexical, React, Frimousse, selection state, upload progress, and object URLs
  remain authoring-only.
- Hosted media continues through the authenticated API. Local media metadata
  and Blobs now persist atomically in IndexedDB and resolve on demand across
  editor iframe lifecycles.
- Focused rich-content/canvas and local-dev tests, SDK authoring typecheck,
  lint, formatting, and build pass. The latest delta still needs the final
  in-app close/reopen media check and a fresh full repository regression gate;
  earlier full verification remains a pre-expansion baseline.

See `docs/guides/rich-content-authoring.md` and
`docs/plans/tour-authoring-reliability-and-capabilities.md` for the detailed
contract and completion boundary.

---

## Phase -1 scope (PRD §16.0)

| Item                                                                | Status | Where / Notes                                                          |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Product naming: `Lodariq`, `@lodariq/*`, `*.lodariq.io` (PRD §16.0) | ✅     | Used across packages, ADRs, origin model                               |
| One repo with pnpm workspaces (PRD §12.1, §16.0)                    | ✅     | `pnpm-workspace.yaml`                                                  |
| Turborepo for task caching (PRD §16.0)                              | ✅     | `turbo.json`                                                           |
| Strict TypeScript (PRD §16.0)                                       | ✅     | `tsconfig.base.json` (strict + extras)                                 |
| ESLint + Prettier (PRD §16.0)                                       | ✅     | `eslint.config.mjs`, `.prettierrc.json`                                |
| Vitest (PRD §16.0)                                                  | ✅     | Centralized `@lodariq/tests` (jsdom per-file)                          |
| Playwright (PRD §16.0)                                              | ✅     | Explicit `pnpm test:e2e` or manual CI browser workflow                 |
| Bundle-size gates (PRD §16.0, §9.1)                                 | ✅     | Runtime gzip gate for loader + runtime/tour                            |
| dependency-cruiser (PRD §16.0)                                      | ✅     | `.dependency-cruiser.cjs` + ESLint guards                              |
| `packages/schema` `@lodariq/schema` (PRD §16.0)                     | ✅     | TypeBox contracts + registry + validate                                |
| `packages/compiler` `@lodariq/compiler` (PRD §16.0)                 | ✅     | Pure isomorphic compile + content hash                                 |
| `packages/sdk-runtime` `@lodariq/sdk-runtime` (PRD §16.0)           | ✅     | loader, runtime, resolver, renderers, local-dev                        |
| └ `src/loader` (PRD §16.0)                                          | 🟡     | Config read, manifest fetch, lazy loaders                              |
| └ `src/runtime` (PRD §16.0)                                         | 🟡     | identify/track + analytics batching/beacon                             |
| └ `src/resolver` (PRD §16.0)                                        | ✅     | Confidence scoring + found/missing/ambiguous                           |
| └ `src/renderers` (PRD §16.0)                                       | 🟡     | Linear tour renderer, focus, lifecycle waits, scroll                   |
| └ `src/local-dev` (PRD §16.0)                                       | 🟡     | Local persistence, import/export, preview compile, metrics             |
| `packages/sdk-authoring` `@lodariq/sdk-authoring` (PRD §16.0)       | ✅     | authoring, bridge, editor                                              |
| └ `src/authoring` (PRD §16.0)                                       | 🟡     | Local iframe shell + target-pick wiring                                |
| └ `src/bridge` (PRD §16.0)                                          | 🟡     | Origin checks, validation, ack/timeouts, target pick                   |
| └ `src/editor` (PRD §16.0)                                          | ✅     | Reusable freeform Rich Content editor; see the rich-content guide      |
| `apps/fixture-host` (PRD §16.0)                                     | ✅     | SaaS-like routes/drawer/scroll/lazy + SDK boot                         |
| `apps/customer-like-host` (PRD §16.2)                               | ✅     | Secondary SDK host for Phase 0 overfitting checks                      |
| `apps/sdk-playground` (PRD §16.0)                                   | ✅     | Compiles fixture to delivery JSON                                      |
| No production dashboard/API/worker in Phase -1 (PRD §16.0)          | ✅     | Intentionally absent in Phase -1; API/dashboard added below in Phase 1 |
| Package-boundary checks (PRD §16.0, §9.1)                           | ✅     | Verified to fail on react/lexical/authoring imports                    |
| Lexical only in `sdk-authoring/src/editor` (PRD §16.0, §20)         | ✅     | dependency-cruiser rule `lexical-only-in-editor`                       |
| First canonical block JSON fixture (PRD §16.0)                      | ✅     | `packages/schema/fixtures/tour.linear.v1.json`                         |
| ADRs for the load-bearing decisions (PRD §16.0)                     | ✅     | `docs/adr/` (17 records)                                               |

### Phase -1 acceptance criteria (PRD §16.0)

| Criterion                                                                     | Status | Notes                                                               |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| CI runs typecheck, lint, tests, e2e, audit, and bundle-size checks            | ✅     | Named jobs expose each check, including Playwright and `pnpm audit` |
| Repo builds loader, runtime, authoring, compiler, fixture-host artifacts      | ✅     | tsup + Vite; `dist/` is Node-ESM runnable                           |
| Package-boundary checks fail on forbidden imports                             | ✅     | Proven with `react` and `lexical` probes                            |
| First block JSON fixture versioned and validated by `@lodariq/schema`         | ✅     | Validated in `packages/tests/schema/src/document.test.ts`           |
| No production code depends on Markdown parsing, custom grammar, or WebSockets | ✅     | None present anywhere                                               |

---

## Decisions captured as ADRs (PRD §16.0)

| ADR                                        | PRD refs                         | Status                                                        |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------- |
| 0001 runtime/authoring package split       | §9.1, §16.0, §20                 | ✅ Accepted                                                   |
| 0002 schema + compiler shared core         | §9.1, §11.1, §12.1               | ✅ Accepted                                                   |
| 0003 server-side publication compilation   | §9.1, §11.3, §20                 | ✅ Accepted                                                   |
| 0004 authoring/editor boundary             | §7.2, §20                        | ✅ Accepted                                                   |
| 0005 iframe bridge                         | §9.4, §9.5, §11.1                | ✅ Accepted                                                   |
| 0006 origin model                          | §12.5, §20                       | ✅ Accepted                                                   |
| 0007 DnD approach                          | §7.2, §19.6                      | 🟡 Proposed                                                   |
| 0008 resolver strategy                     | §8.1–§8.6                        | ✅ Accepted                                                   |
| 0009 local test harness                    | §16.0–§16.2                      | ✅ Accepted                                                   |
| 0010 secrets management                    | §12.1                            | 🟡 Proposed                                                   |
| 0011 tenant isolation + RLS                | §11.2, §20                       | ✅ Accepted (applies at Phase 1)                              |
| 0012 deferred-vendor triggers              | §12.1, §12.2, §19.8              | ✅ Accepted                                                   |
| 0013 safe Brand System                     | §7.10, §16.4, §20                | 🟡 Accepted; Slice 0 contracts started                        |
| 0014 environment/document release pointers | §11.3, §16.4, §20                | 🟡 Accepted; local pointer foundation started                 |
| 0015 SDK-first in-product authoring entry  | §6.2.1, §7.3, §9.4, §16.4, §20   | ✅ Accepted; Phase 2 Slice 1 implementation locally verified  |
| 0016 selector-free Target Identity V2      | §8.1–§8.6, §16.4, §18.2, §20     | ✅ Accepted; code checkpoint consolidated-verified            |
| 0017 Lodariq-owned authentication          | §6.2.1, §11.2, §14.5, §16.4, §20 | ✅ Accepted; code milestone verified, production cutover open |

---

## Architecture contracts realized

| PRD concept                                                  | Status | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical block document is source of truth (PRD §3.1, §7.1) | ✅     | Closed TypeBox schemas in `schema/src/document.ts` and `block.ts`; document, nested block, target, trigger, audience, and diagnostic objects reject unknown keys                                                                                                                                                                                                                                                                                                                                            |
| Product and authored-content localization                    | ✅     | English, German, French, Spanish, Portuguese, Arabic, Turkish, Italian, and Belgian Dutch product copy is complete across dashboard, server feedback, authoring, creator chrome, and runtime. Customer-authored experience variants use sparse structured JSON, validated fallback chains, server-compiled immutable locale views, runtime exact/same-language/default selection with RTL direction, and locale-scoped analytics. Git-first catalogs and CI checks keep the recurring tooling cost at zero. |
| Target identity contracts (PRD §8.3)                         | ✅     | Closed selector-free `TargetIdentityV2`, explicit resolution modes, normalized rendered-topology variants, privacy-safe visual fingerprints, locale-scoped evidence, passive capture evidence, and node-free verification observations are implemented. Phase 1 `ElementFingerprint` remains readable compatibility.                                                                                                                                                                                        |
| Runtime lifecycle hints (PRD §8.6)                           | 🟡     | Route/text/element/network-idle waits, semantic open-panel/select-tab activation, scroll containers, skeleton/loading state, transformed content, and virtualized-search covered                                                                                                                                                                                                                                                                                                                            |
| Target resolution (PRD §8.4)                                 | ✅     | V2 enumerates live candidates without a selector locator and applies visibility/action/context gates. Semantic interactions require two durable nonvisual families and a strict runner-up margin. Presentation-only visual modes require a three-family visual quorum, return a non-interactive region anchor, and abstain on broad or ambiguous pools. The Phase 1 resolver and its small legacy CSS hint remain compatibility only.                                                                       |
| Compiled delivery JSON + content hash (PRD §6.1, §11.3)      | ✅     | Localized compiled artifact schema `3`, emitted by `@lodariq/compiler` `0.4.0` against renderer contract `3`, requires an explicit semantic theme snapshot and compiles resolved customer-content locale variants into the same immutable artifact; document, localization, theme, and renderer identity are embedded in and covered by the artifact hash                                                                                                                                                   |
| Semantic Brand Theme contracts (PRD §7.10, §16.4)            | ✅     | Closed tokens/recipes/bindings/appearance, persisted workspace drafts, immutable approvals/defaults, document acknowledgement, impact views, tokenized rendering, atomic Product Match provenance, and reviewed drift/acknowledgement are implemented and locally verified. Live evidence is tracked separately.                                                                                                                                                                                            |
| Manifest pointer / immutable publication (PRD §11.3)         | ✅     | Immutable artifact storage, per-document generation, delivery, guarded staging activation, exact verification, same-artifact production promotion/rollback, unpublish, recovery history, CAS, and explicit capabilities are implemented and locally verified. External-database/deployed evidence remains separate.                                                                                                                                                                                         |
| Bridge message protocol + envelope (PRD §9.5, §11.1)         | ✅     | `schema/src/bridge.ts`, validated in `sdk-authoring/src/bridge`; semantic patch and step/full preview requests, bounded direct-preview content commits, correlated exact-area start/result/cancel messages, exact-origin scope, ack/timeouts, and message-size limits are covered                                                                                                                                                                                                                           |
| Bridge page-state observation (PRD §9.5)                     | ✅     | `sdk-authoring/src/authoring` emits coalesced `page.lifecycle.update` route/scroll messages with ack/timeout handling                                                                                                                                                                                                                                                                                                                                                                                       |
| SDK-first creator activation (PRD §6.2.1, §9.4)              | ✅     | The permanent public installation keeps the non-production launcher hidden until `Ctrl/⌘ + Shift + L` or dashboard **Open in product** reveals it, then uses exact-origin activation/exchange, a memory-only host grant, an iframe-owned document session, lazy authoring load, and explicit activation/session revocation. Production stays closed.                                                                                                                                                        |
| Data catalog entry (PRD §6.3)                                | 🟡     | `schema/src/catalog.ts`; builder UI pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Analytics + target diagnostic events (PRD §15)               | ✅     | Privacy-safe runtime events carry pointer assertions and the selected bounded content locale; the server derives workspace/environment/document/publication/hash identity, rejects stale or spoofed context, persists append-only forced-RLS facts, and returns environment- and locale-filtered release aggregates without customer copy.                                                                                                                                                                  |
| Local Phase 0 usability metrics (PRD §16.2)                  | ✅     | Local metrics capture time-to-first-block, time-to-first-target, failed picks, preview-open, and cancel rate                                                                                                                                                                                                                                                                                                                                                                                                |
| Placement actions and health (PRD §8.2, §16.2)               | 🟡     | Compact placement actions remain; current V2 UI reports **Verified**, **Drift detected**, **Ambiguous**, **Missing**, and **Unverified**, progressively discloses bounded evidence, rechecks after locale/viewport/page-state change, and keeps content when placement is removed. **Use exact area** and **Use whole element** now author/reset normalized Tour-tooltip point/region positioning against the safely resolved owner. Persisted environment/artifact verification history remains pending.   |
| One-click V2 target capture (PRD §8.2–§8.4)                  | ✅     | Nested SVG/icon/text selection normalizes to the meaningful control, usable capture attaches immediately, and bounded passive stability/uniqueness sampling emits one debounced evidence update. Weak/ambiguous evidence alone prompts. New capture persists no CSS selector, and the milestone is consolidated-verified.                                                                                                                                                                                   |
| Nested target and click-through UX (PRD §8.2)                | ✅     | Host picker supports parent/deeper candidate cycling plus one-click product click-through while selection remains active                                                                                                                                                                                                                                                                                                                                                                                    |
| Product-click gated tour steps (PRD §7.1, §8.6)              | ✅     | Button actions support `clickTarget`; runtime listens for the real resolved target click, lets the host app handle it, advances with lifecycle waits, and resumes after same-tab navigation/reload when the manifest/document still match                                                                                                                                                                                                                                                                   |
| Stable block IDs ≠ Lexical node keys (PRD §7.2, §20)         | ✅     | `sdk-authoring/src/editor/ids.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Serialization + versioned migrations (PRD §7.2)              | ✅     | Lexical helpers, migration hook, and local frame round-trip through the Lexical serialization boundary                                                                                                                                                                                                                                                                                                                                                                                                      |
| No arbitrary HTML/CSS in documents (PRD §7.10, §14.2)        | ✅     | Block/compiled `props` use narrow allowlists; import rejects arbitrary CSS/JS/raw HTML props                                                                                                                                                                                                                                                                                                                                                                                                                |

---

## Guardrails compliance (PRD §20)

| Guardrail                                                                                                                  | Status                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No canvas editing against raw Markdown strings                                                                             | ✅                                                                                                                                                                                                                                                               |
| No Markdown-to-JSON compiler / custom grammar in Pre-phase…Phase 1                                                         | ✅                                                                                                                                                                                                                                                               |
| Lexical not imported outside `sdk-authoring/src/editor`                                                                    | ✅                                                                                                                                                                                                                                                               |
| `sdk-runtime` and `sdk-authoring` not collapsed; runtime cannot import React/Lexical                                       | ✅                                                                                                                                                                                                                                                               |
| Production runtime does not depend on `sdk-authoring`                                                                      | ✅                                                                                                                                                                                                                                                               |
| Browser compilation is preview-only (real artifact server-side)                                                            | ✅ (preview path only exists)                                                                                                                                                                                                                                    |
| No Vercel; Fly.io intended                                                                                                 | ✅ (Fly configs and runbook added in Phase 1)                                                                                                                                                                                                                    |
| No standalone WebSocket gateway                                                                                            | ✅                                                                                                                                                                                                                                                               |
| Zod not used as canonical contract (TypeBox/JSON Schema)                                                                   | ✅                                                                                                                                                                                                                                                               |
| Slash commands treated as gestures, not durable syntax                                                                     | ✅ (local authoring frame)                                                                                                                                                                                                                                       |
| Coordinates never trigger production interactions                                                                          | ✅ (resolver: coordinates diagnostic-only)                                                                                                                                                                                                                       |
| V2 authors/persists no CSS selector; Phase 1 CSS is read-only compatibility                                                | ✅ Implemented and consolidated-verified                                                                                                                                                                                                                         |
| Rectangles are never identity/interaction triggers; fresh geometry may place resolved UI                                   | ✅ Normalized topology, whole-element placement, and target-bearing Tour-tooltip point/region authoring, compiler validation, and owner-first live projection passed the consolidated gate. Additional persisted viewport/state verification remains later work. |
| V2 interactions need two durable nonvisual families; visual anchors need a three-family quorum and strict runner-up margin | ✅ Anonymous informational-card recovery, duplicate-card abstention, and interaction-safety cases are verified                                                                                                                                                   |
| Target-health telemetry excludes customer text/DOM/selectors/screenshots/coordinates                                       | ✅ Closed observation/event boundary verified; persistence and verification history remain pending                                                                                                                                                               |
| Screenshot/pixel verification is optional and permissioned, not a base SDK dependency                                      | ✅ No screenshot/extension dependency exists; later verifier remains deliberately deferred                                                                                                                                                                       |
| Brand data is semantic tokens/recipes, never raw CSS/DOM/selectors/URLs/coordinates                                        | 🟡 Contracts, persisted theme/version workflow, and the bounded Slice 3 sampler/provenance path enforce the boundary locally; final gate and live evidence remain open                                                                                           |
| Immutable V2 artifacts pin and hash theme plus renderer contract                                                           | ✅ Local compiler/artifact contract                                                                                                                                                                                                                              |
| Token, environment, editor, and authoring-session operations do not publish                                                | ✅ Hosted/local code paths and focused tests                                                                                                                                                                                                                     |
| Active delivery is keyed by workspace, environment, and document                                                           | 🟡 Document-specific direct/hosted delivery and staging pointer mutation passed the consolidated local gate; external-database/deployment evidence remains pending                                                                                               |
| Canonical authoring needs no extension or second snippet                                                                   | ✅ Permanent installation plus keyboard/dashboard launcher reveal locally verified                                                                                                                                                                               |
| Production bootstrap returns no launcher/activation/creator/editor metadata                                                | ✅ Closed production response and runtime/authoring bundle boundaries locally verified                                                                                                                                                                           |
| Account/long-lived credentials stay off the customer page; authoring bearer is memory-only                                 | ✅ Host keeps only short-lived activation material in memory; the exact editor iframe owns the document-session bearer                                                                                                                                           |

---

## Pre-Phase Codewise Sign-Off

- **Pre-Phase code gates:** local SDK install, authoring, target picking,
  playback, serialization, import/export, migrations, accessibility smoke tests,
  package boundaries, size checks, and audit are covered by `pnpm verify`; e2e
  remains an explicit local command and manually dispatched CI workflow.
- **Status:** complete for the implemented code scope as of 2026-06-29.

## Phase 0 Codewise Sign-Off

- **Status:** locally aligned through 2026-08-06. In addition to the original
  fixture/customer-like-host, resolver, bridge, bundle, and browser coverage,
  the canonical document contracts are closed; the local authoring shell is a
  draggable, modeless popup with a hidden-by-default movable launcher and
  target-selection collapse behavior; drafts autosave and close through a
  serialized retrying queue; step/full preview is semantic and live; the active
  tooltip heading/body are edited directly with one semantic commit instead of
  keystroke bridge traffic; and direct target repair preserves target identity
  and lifecycle hints.
- **Product evidence boundary:** automated checks establish code behavior, not
  first-glance usability. Design-partner/proxy-creator sessions still need to
  record comprehension, completion time, clicks, context switches, failed
  placement attempts, and styling assistance.

## Phase 1 Foundation Progress

| Item                                                              | Status | Where / Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` `@lodariq/api` Fastify modular monolith                | 🟡     | `apps/api`; Fastify 5 app, health route, document, environment, token, event routes, Fly.io service config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| TypeBox/JSON Schema at API boundary                               | 🟡     | Route schemas for params/simple bodies, SDK authoring save wrapper bodies, and event batches; canonical documents validated through `@lodariq/schema`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| OpenAPI route discovery                                           | 🟡     | `GET /openapi.json` generated by `@fastify/swagger` from Fastify route schemas for client integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Lodariq-owned identity/session boundary                           | ✅     | `apps/api/src/auth` uses the established `argon2` package for Argon2id (`m=65536`, `t=3`, `p=1`, 32-byte hash), equivalent dummy work, bounded hash admission, hash-stored opaque sessions, expiry/revocation/rotation, purpose-separated verification/reset challenges, generic recovery, capability gates, rate limits, and one auth-email outbox/Resend worker. Signup stores a random unusable pending credential; verification atomically installs the chosen password and session. Active runtime is Clerk-free; production enablement remains open.                                                       |
| Dashboard owned-auth and workspace UI                             | ✅     | Same-origin BFF routes expose Editorial Air sign-in/sign-up/verification/recovery/reset, account/workspace selection and creation, sign-out, protected dashboard state, and resumable authoring activation. API and BFF enforce matching signup/recovery capability gates, and activation offers reset in a new first-party tab followed by an explicit launcher retry. Invitations/member administration remain later product work.                                                                                                                                                                             |
| Workspace-scoped document access                                  | 🟡     | API passes `AuthContext.workspaceId`; repository rejects workspace mismatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| API role gates                                                    | 🟡     | Viewer sessions can read but cannot save documents, compile artifacts, or mint SDK tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Server-side document compilation                                  | 🟡     | API save/compile routes call `@lodariq/compiler` and validate compiled JSON                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Internal JSON/debug view                                          | 🟡     | `GET /v1/debug/documents/:documentId` plus on-demand dashboard support panel return redacted canonical JSON, delivery JSON, latest artifact metadata, and version history; dashboard action coverage verifies sensitive canonical/compiled keys are redacted before client state                                                                                                                                                                                                                                                                                                                                 |
| Basic event ingestion and SDK error reporting                     | 🟡     | User-auth `POST /v1/events`, token-auth `POST /v1/sdk/events`, runtime batching, page-exit beacon delivery, API-side sensitive event prop redaction, sanitized runtime error events, automatic playback-failure reporting, and publication correlation IDs propagated into runtime events                                                                                                                                                                                                                                                                                                                        |
| `packages/database` `@lodariq/database`                           | 🟡     | Drizzle/Neon schema, document history, immutable artifacts/publications, per-document deployments, release operations, theme drafts/versions, and visual-check runs are implemented locally. Because Lodariq has not been deployed, the development SQL chain is squashed into the single transactional `0000_initial_baseline.sql`; isolated Neon and shared-environment application remain pending.                                                                                                                                                                                                            |
| RLS baseline                                                      | 🟡     | The initial baseline enables and forces RLS across the current tenant tables and includes owned-auth, authoring, Brand, verification, approval, and release policies without inserting historical rows. Local PostgreSQL catalog validation passes; isolated/live validation with a provisioned non-owner role remains pending.                                                                                                                                                                                                                                                                                  |
| Runtime DB role provisioning                                      | 🟡     | `pnpm db:provision:runtime-role` implements limited-role creation and verifies `BYPASSRLS` is disabled. Applying it to the first isolated/shared Neon targets and recording redacted evidence remain deployment work.                                                                                                                                                                                                                                                                                                                                                                                            |
| Live RLS smoke command                                            | 🟡     | `pnpm rls:verify:live` covers owned-auth/recovery/outbox, release pointers, themes/versions/defaults, visual-check scopes, and cross-tenant denial. It has not yet produced external Neon evidence; apply the baseline to an isolated target, provision its non-owner role, and run the verifier before enabling auth, Brand, or release capabilities.                                                                                                                                                                                                                                                           |
| Destructive migration guard                                       | ✅     | `pnpm run migrations:check` scans Drizzle SQL and requires explicit sign-off metadata for destructive shared-env migrations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Deployment runtime env checks                                     | ✅     | `pnpm live:check-env` requires owned auth, a shared strong BFF secret, non-owner DB role, HTTPS origins, and valid signup/recovery/email modes. API delivery is authoritative: enabled signup/recovery requires Resend mode plus app origin, from address, API key, and token secret; local/test header auth and Clerk configuration are rejected.                                                                                                                                                                                                                                                               |
| Fly deployment packaging                                          | ✅     | API, dashboard, and hosted editor Fly configs use explicit monorepo Dockerfiles; staging and production configs are split; API serves `/healthz`, dashboard ships Next standalone assets, and editor serves `/authoring.html`                                                                                                                                                                                                                                                                                                                                                                                    |
| Deployment provider runbook                                       | ✅     | `docs/deployment/phase-1-fly.md` documents Fly/Neon owned-auth configuration, shared BFF secret, the one-time initial database baseline, RLS validation, Resend setup, coordinated capabilities, staging release smoke, rollback, and rotation. Historical Clerk references remain history only.                                                                                                                                                                                                                                                                                                                 |
| `apps/dashboard` `@lodariq/dashboard` Next.js control-plane shell | 🟡     | Next.js 16, Fly config, document/release inventory, one-time public SDK installation and trusted-origin management, **Open your product** entry, and on-demand redacted debug inspection. The dashboard no longer prepares a daily creator-token/snippet handoff.                                                                                                                                                                                                                                                                                                                                                |
| Dashboard component system                                        | 🟡     | The dashboard follows the Editorial Air compatibility shell: light-first navigation, a release-led overview, environment progress, recent activity, and setup/admin work behind focused destinations instead of stacked home-page forms. Desktop navigation starts as an icon rail and expands to labeled destinations; mobile uses a modal drawer instead of a horizontal navigation strip. Current-view structural Design QA passed; live/deployed and broader responsive/usability evidence remain pending. No recorded publication is labeled verified or live without corresponding evidence/pointer truth. |
| Staging SDK token/snippet flow                                    | 🟡     | Dashboard server actions mint/revoke environment tokens, expose only staging environments in the Phase 1 install panel, return module SDK snippets only at creation time, keep client tokens out of list/debug responses, and install the generated snippet into a fake allowed staging host in browser e2e coverage                                                                                                                                                                                                                                                                                             |
| Staging creator authoring gate                                    | ✅     | The historical Phase 1 dashboard-created `lodariq-creator.js` path remains compatibility evidence. Phase 2 Slice 1 supersedes it with the permanent-loader launcher, first-party activation/exchange, memory-only host grant, exact editor handoff, and document-session revocation.                                                                                                                                                                                                                                                                                                                             |
| Token-scoped SDK bootstrap                                        | 🟡     | Exact-origin bootstrap and document-specific direct/hosted reads resolve the active document artifact locally; complete deployed multi-document/browser evidence and pointer materialization remain pending.                                                                                                                                                                                                                                                                                                                                                                                                     |
| SDK current-document playback path                                | 🟡     | Document-specific delivery is implemented. `/v1/sdk/current-document` remains a read-only old-client compatibility route that allows only zero or one active document and deterministically rejects ambiguous multiple-active state.                                                                                                                                                                                                                                                                                                                                                                             |
| SDK token CORS/origin enforcement                                 | 🟡     | SDK endpoints use bearer environment tokens, reject revoked tokens, require exact environment origin allowlist matches for browser-origin requests, and withhold readable CORS responses from denied actual origins                                                                                                                                                                                                                                                                                                                                                                                              |
| Production SDK bundle gates                                       | ✅     | `@lodariq/sdk-runtime` gates loader and runtime+tour size, browser-resolvable imports, and built-bundle React/Lexical/authoring/dashboard references; `@lodariq/sdk-authoring` gates creator-only Lodariq-owned authoring, creator installer, and toolbar chunks                                                                                                                                                                                                                                                                                                                                                 |
| SDK CDN asset packaging                                           | ✅     | `pnpm sdk:prepare-assets` stages loader/runtime/tour/creator CDN files under `dist/sdk-assets/sdk/`, follows relative chunks, strips source-map comments, and emits a SHA-256/cache-policy manifest for Cloudflare R2 upload                                                                                                                                                                                                                                                                                                                                                                                     |
| Dependency security gate                                          | ✅     | `pnpm audit` is clean after patched Drizzle and PostCSS dependency graph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Phase 1 focused tests                                             | ✅     | Existing API/database/dashboard/runtime/browser coverage plus closed schema rejection, unknown slash preservation, semantic preview requests, modeless popup/launcher movement and target collapse, autosave serialization/error/retry/late-iframe close races, target-repair identity/lifecycle preservation, hosted draft load/save, and no-implicit-publication tests; the full combined `pnpm verify` rerun is green end-to-end                                                                                                                                                                              |

## Phase 1 Product Hardening Progress

| Item                                 | Status | Where / Notes                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted authoring compatibility path  | ✅     | `apps/editor`, creator installer, API-backed draft load/save, and dashboard launch snippets preserve the historical path without implicit publication. Phase 2 Slice 1 now supersedes it as the canonical returning-creator entry; compatibility APIs remain temporarily readable.                                                                                                                                                          |
| Semantic preview patches             | ✅     | Bridge/controller emit batched semantic edit operations and step/full preview requests; automatic browser preview uses the runtime renderer, while replacement remains hydration/restore/recovery-only                                                                                                                                                                                                                                      |
| Authoring reliability polish         | ✅     | Canvas-first authoring now defaults to a compact sequence rail with no duplicated form; `Add step` immediately starts semantic target selection, attachment autofocuses the rendered heading, heading/body/button/link labels edit in place, placement/action/`More` stay contextual, advanced settings mount on demand, and batched semantic commits preserve serialized autosave, retry, close-drain, and WebKit action-label reliability |
| Publish readiness UX                 | ✅     | `validateTourPublishReadiness` drives authoring badges and dashboard debug/publish surfaces with missing target, incomplete action, unsafe URL, and lifecycle-hint labels                                                                                                                                                                                                                                                                   |
| Target lifecycle controls            | ✅     | Target controls expose lifecycle and health actions without JSON; direct rail repair preserves the target ID and lifecycle while replacing its semantic fingerprint                                                                                                                                                                                                                                                                         |
| Membership-backed authorization      | ✅     | API authorization resolves workspace roles from `users` and `workspace_memberships`; dev-header role fallback remains local/test-only                                                                                                                                                                                                                                                                                                       |
| Vendor-neutral observability         | ✅     | Internal observability sink and correlation IDs cover authoring sessions, save, compile, publish, runtime playback, SDK events, and SDK error paths                                                                                                                                                                                                                                                                                         |
| Content safety                       | ✅     | URL policy is centralized for `https:`, `mailto:`, safe relative paths, and approved app schemes; arbitrary CSS, JavaScript, and raw HTML remain outside canonical documents                                                                                                                                                                                                                                                                |
| Publication artifact shape           | ✅     | Server-side V2 compilation pins/hashes theme and renderer identity. Phase 2 now provides immutable insert/readback, full document delivery, verification, promotion, rollback, and unpublish without recompilation.                                                                                                                                                                                                                         |
| Runtime/package boundary regressions | ✅     | Build and deploy tests assert production runtime remains free of authoring, React, Lexical, and dashboard code                                                                                                                                                                                                                                                                                                                              |
| Product hardening verification       | ✅     | Node 24 full `pnpm verify` passed on 2026-08-07: `typecheck`, `lint`, `boundaries` (0 errors), `migrations:check`, build and size checks, SDK asset preparation, `test` (42 files / 415 tests), `test:e2e` (59 passed / 4 planned browser skips), and `audit:security` (0 known vulnerabilities)                                                                                                                                            |

### Phase 1 Remaining

- Preserve the historical Fly/Neon/Clerk/Cloudflare checklist only as labeled
  Phase 1 reproduction evidence. Active runtime code and dependencies are
  Clerk-free; do not restore provider-specific deployment work.
- Initialize an approved empty Neon target exactly once with
  `0000_initial_baseline.sql`, provision a non-owner runtime role, and run the
  expanded live RLS verifier before enabling owned auth or release capabilities.
  There is no historical migration chain or data backfill to run.
- Verify the Resend sending domain and configure the API's app-base URL, from
  address, API key, and token secret. Then enable API Resend/signup/recovery and
  matching dashboard signup/recovery flags as one reviewed deployment.
- Deploy API, dashboard, editor, CDN assets, and the permanent public SDK
  installation using the same strong `LODARIQ_AUTH_BFF_SOURCE_SECRET` in API and
  dashboard.
- Run live verification/reset delivery, expiry/replay, ambiguous legacy-email,
  outbox retry/terminal, session revocation/rotation, and Fly BFF-source probes.
- Run the live staging-origin launcher → first-party popup → exact-origin exchange
  → lazy authoring iframe smoke test, including blocked/expired/replayed
  activation recovery and a production assertion of zero creator network loads.
- Run deployed production runtime smoke coverage after CDN/object-storage upload.

These are external deployment checks. They do not reduce the locally verified
Slice 1 code status and are tracked separately from repository verification.

## Phase 2 In-Product Authoring, Brand, and Release Foundation

The direction is specified in the PRD, ADR 0013, ADR 0014, ADR 0015, ADR 0016, the
current UX plan, and
`docs/plans/phase-2-brand-and-release-foundation.md`. **Slice 0, the Editorial
Air compatibility shell, Target Identity V2, exact-area Tour-tooltip behavior,
and Slice 1 hosted in-product entry are implemented and passed the consolidated
local repository gate. Core owned auth is implemented and Clerk-free, with its
recovery/reset, unified outbox worker, capability gates, activation recovery UX,
and full local milestone gate passing. Slice 2's tokenized Tour renderer,
persisted theme workflow, exact-theme direct/hosted authoring, document-specific
delivery, deterministic basic preflight, release state, and guarded staging
publication are implemented locally and passed the consolidated local gate and
current-view Editorial Air structural QA. Slice 3's bounded Product match,
provenance/confidence, exact staging browser verification, and same-artifact
production promotion with optional one-person approval are implemented locally.
The current stabilization checkpoint passes the full Node 24 `pnpm verify` and
dependency audit; the Chromium/Firefox/WebKit Playwright matrix is run
explicitly and remains independent from deployment.
The local Phase 2 code gate is complete. Production enablement/cutover,
live/deployed RLS and smoke/convergence evidence, the B4 measurement-backed ADR,
and usability evidence remain unclaimed.**

| Capability                        | Status | Implemented truth / next work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permanent SDK creator entry       | ✅     | One public installation supports ordinary runtime delivery and a development/staging-only launcher that starts hidden, reveals from the keyboard toggle or dashboard entry intent, and uses first-party activation, exact-origin exchange, memory-only host grants, iframe-owned document sessions, lazy authoring load, and explicit revoke/expiry handling. Production remains closed.                                                                                                                                                                                                                  |
| Modeless creator launcher actions | ✅     | Hosted entry uses the canonical icon dock: **New experience**, **Experiences on this page**, **Preview as user**, and **Hide Lodariq**. New exposes only Tour and creates a distinct persisted draft; browse starts without draft creation, searches the normalized current pathname, can expand explicitly to workspace scope, and opens the selected document without a dashboard transition.                                                                                                                                                                                                           |
| Hosted browse/session lifecycle   | ✅     | Closed page/workspace query contracts, pathname-only page context, same-workspace Tour summaries, search/empty/release-truth states, activation/session revocation, minimized/restore coordination, dedicated Close, and flush-then-revoke **Save & exit** are locally verified. Autosaved server revisions survive Close; only pending iframe state may be dropped.                                                                                                                                                                                                                                      |
| One-install origin administration | ✅     | Dashboard/API list public installations deterministically, synchronize trusted origins atomically, preserve revoked rows for audit, revalidate origin mappings after mutation, and open the configured product instead of generating a daily authoring handoff.                                                                                                                                                                                                                                                                                                                                           |
| Installation role gating          | ✅     | Provider-neutral `/v1/auth/context` drives the dashboard. Admins/owners may create, synchronize, and revoke installations; members/viewers receive read-only inspect/copy controls and are not sent into predictable authorization failures.                                                                                                                                                                                                                                                                                                                                                              |
| Lodariq-owned auth code milestone | ✅     | Active API/dashboard runtime and dependencies are Clerk-free. The established `argon2` package provides Argon2id credentials; signup uses a random unusable pending credential and verification atomically installs the chosen password/session. Opaque sessions, purpose-separated challenges, unified outbox/Resend delivery, rate limits, membership, API+BFF gates, recovery/reset, and activation retry pass the local gate. Production flags remain disabled pending first-database baseline application, provider/secrets, deploy, and live probes.                                                |
| Editorial Air visual direction    | 🟡     | Option 2 is the current canonical visual direction. Its light-first, release-led dashboard and restrained-glass creator chrome pass structural QA at the current in-app browser viewport. The user-approved dashboard refinement uses a collapsed-by-default desktop icon rail that expands to labels and a modal mobile drawer; progressive disclosure and icon-only launcher actions are also intentional later decisions. Broader responsive, contrast, usability, automatic sampling/provenance, and exact brand-native styling remain pending. The generated mark and exact pixels are illustrative. |
| Selector-free Target Identity V2  | ✅     | Schema/compiler preservation, one-click normalization, passive stability/uniqueness sampling, locale/viewport/state variants, semantic interaction resolution, and presentation-only visual-region resolution are implemented. Visual capture uses privacy-safe structural, occupancy, appearance, neighborhood, topology, and optional layout-slot evidence; duplicates and broad pools abstain, visual anchors cannot interact, Lodariq chrome is excluded, health reports retain no DOM nodes, and Phase 1 CSS remains read-only compatibility.                                                        |
| Exact-area Tour-tooltip anchors   | ✅     | Closed point/region contracts, correlated bridge messages, pointer/keyboard direct manipulation, whole-element reset, target-change cleanup, compiler lifting to `CompiledStep.presentationAnchor`, and owner-first runtime projection passed the consolidated schema/compiler/authoring/runtime/E2E gate. Geometry positions Lodariq UI only; spotlight/hotspot delivery is not claimed.                                                                                                                                                                                                                 |
| Target verification expansion     | 🟡     | Mobile/tablet and bounded application-state Target Identity variants plus persisted environment/artifact verification are implemented. A broader repair queue and optional permissioned pixel verification remain later work.                                                                                                                                                                                                                                                                                                                                                                             |
| Canonical Brand Theme schema      | ✅     | Closed semantic contracts, persisted drafts, immutable approvals/defaults, acknowledgement, impact, atomic bounded Product Match provenance, and drift review are implemented locally. First-database/non-owner live RLS evidence remains operational follow-up.                                                                                                                                                                                                                                                                                                                                          |
| V2 compiled artifact              | 🟡     | Compiler hashes the exact approved theme and renderer contract into immutable V2 output; direct/hosted authoring, staging publication, exact browser verification, and production promotion preserve that identity locally. Live deployed verification remains open.                                                                                                                                                                                                                                                                                                                                      |
| Runtime-backed themed renderer    | ✅     | Delivery and authoring preview share the tokenized Tour renderer and compiled semantic recipes. Product Match atomically updates the mutable draft without raw CSS and immediately refreshes the active preview from the persisted receipt.                                                                                                                                                                                                                                                                                                                                                               |
| Workspace theme versions          | 🟡     | Theme drafts, optimistic revision guards, immutable approvals, first-approved default behavior, explicit default changes, impact view, RLS, and document binding/acknowledgement passed local Slice 2 verification; first-database/live evidence remains pending.                                                                                                                                                                                                                                                                                                                                         |
| Match product                     | ✅     | Authenticated authoring supports bounded sampling and explicit semantic `registerBrandTokens()`, commits normalized tokens/provenance/hashes/confidence atomically, and returns the exact preview receipt—never raw CSS, selectors, DOM, URLs, class names, coordinates, or stylesheet text.                                                                                                                                                                                                                                                                                                              |
| Visual preflight and brand drift  | ✅     | Deterministic preflight, the exact 13-check browser report, maintained drift classification, affected-experience/accessibility review, runtime before/after preview, and explicit acknowledgement are locally verified. Optional permissioned pixel evidence remains later work.                                                                                                                                                                                                                                                                                                                          |
| Immutable artifact persistence    | 🟡     | Insert-on-conflict preserves and reads the existing immutable artifact rather than mutating metadata; object storage/materialization remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Per-document environment pointer  | 🟡     | Schema/RLS/indexes, document-specific reads, generation, active/inactive state, and guarded staging pointer activation are implemented locally and included in `0000_initial_baseline.sql`. The baseline has not been applied to an external database; live multi-document delivery evidence is pending.                                                                                                                                                                                                                                                                                                  |
| Explicit release operations       | ✅     | Direct/hosted/dashboard paths cover guarded staging publish, exact verification, production promotion, rollback, and unpublish. Idempotency, expected-generation CAS, exact artifact/theme identity, capabilities, required recovery reasons, and append-only history are enforced.                                                                                                                                                                                                                                                                                                                       |
| Legacy direct production publish  | ✅     | Legacy `/v1/documents/:documentId/publish` remains closed for all environments. Staging uses the guarded document-scoped release API; production is reachable only through verified same-artifact promotion.                                                                                                                                                                                                                                                                                                                                                                                              |
| Exact-artifact promotion          | 🟡     | Direct and hosted API/controller/UI paths promote the verified staging publication's exact compiled artifact, content hash, theme version/hash, and renderer contract with zero compiler calls. Policy may require zero or one explicit approval. Final consolidated/live evidence remains open.                                                                                                                                                                                                                                                                                                          |
| Token/session side-effect removal | ✅     | Environment-token creation/configuration, editor launch, and authoring-session creation no longer publish; hosted authoring loads/saves drafts                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Analytics environment isolation   | ✅     | Server-owned pointer identity stamps environment/publication/hash; storage and dashboard aggregation require one explicit environment and preserve rollback generations.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Phase 2 usability evidence        | ⏳     | Run `docs/plans/phase-2-brand-release-usability-test.md`; do not claim the 48/50 target from documentation or local contracts alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

The consolidated Slice 1 local gate passed on 2026-08-07. Installation completed
with only the expected Node 22 versus required Node 24 warning; changed-package
and workspace typechecks, lint, dependency boundaries, migration safety, all 55
test files/581 tests, all 11 builds, every listed bundle-size budget, SDK asset
preparation (58 assets), and the security audit (zero known vulnerabilities)
passed. After correcting two stale browser assertions, all 62 executed E2E tests
passed with four planned skips. This verifies the local code milestone, not a
Node 24 production runtime or deployed service.

The subsequent owned-auth milestone removed active Clerk runtime code and
dependencies and completed recovery/set-password, verification/reset outbox
delivery, authoritative API/BFF gates, workspace/session behavior, and activation
reset-then-retry UX. Its consolidated Node 24 gate passed typecheck, lint,
boundaries, migration safety, 66 Vitest files/648 tests, integration coverage,
all builds and size budgets, SDK asset preparation, 62 E2E tests with four
intentional skips, and the dependency audit with no known vulnerabilities. One
Firefox focus assertion passed on an immediate isolated retry and remains a
recorded browser flake.

The 2026-08-08 Slice 2 implementation checkpoint added the shared tokenized Tour
renderer, persisted Brand Theme drafts/immutable approvals/defaults/impact,
document binding and acknowledgement, the corresponding database schema, exact-
theme direct and hosted authoring, document-specific delivery, deterministic basic preflight,
release state, and guarded staging publication with server-derived request hash,
idempotency, expected-generation CAS, and capability checks. Its local milestone
gate passed: full browser E2E completed with **62 passed, four intentional
dashboard cross-browser skips, and zero failures** across Chromium, Firefox,
and WebKit; the affected unit regression set passed **42/42**; schema,
authoring, and tests typechecks, relevant lint, schema/authoring builds,
authoring size budgets, and the security audit passed. The prior complete
unit/integration gate remains **724/724 passed**.

The current-view Option 2 comparison also passed structural Editorial Air
conformance using
`product-design/implementation-captures/editorial-air-dashboard-slice2-qa.png`,
`product-design/implementation-captures/editorial-air-authoring-panel-slice2-qa.png`,
and `product-design/implementation-captures/editorial-air-slice2-comparison.png`.
Collapsed default navigation, progressive disclosure, and icon-only launcher
actions are intentional later-decision deltas.

The 2026-08-08 Slice 3 implementation checkpoint adds bounded authenticated
Product match and semantic token registration, persisted provenance/confidence,
all-target exact browser verification for one immutable staging identity, and
same-artifact production promotion with configurable zero/one approval. Direct
and hosted authoring expose the workflow without a dashboard handoff.

**Repository completion checkpoint (2026-08-09):** The full Node 24
`pnpm verify` passes: 18 typecheck tasks, 12 lint tasks, dependency-boundary and
migration-safety checks, **126 Vitest files / 1,064 tests**, 11 builds, the
runtime/authoring bundle-size gates, 109 prepared SDK assets, 77 Playwright tests
with four intentional skips, and `pnpm audit` with zero known vulnerabilities.
This closes the local Phase 2 code milestone. Rows remain 🟡 only where later
product scope, live/deployed proof, or operational evidence is outstanding.

Because Lodariq has never been deployed, the retired development migration chain
has been squashed into `0000_initial_baseline.sql`. No external database has been
initialized, no shared-environment migration has run, and no deployment has
occurred. Live Drizzle/RLS release-operation, pointer, analytics, and owned-auth
proof; provider/flag/deployment cutover; deployed exact-verification and release
convergence; deployed launcher/auth evidence; the B4 measurement ADR; and
external usability evidence remain required. No production-live pointer or full
product acceptance is claimed. Current operational execution
is tracked in `docs/plans/phase-2-technical-completion.md`; point 5 product
research and paid-pilot evidence is explicitly outside that plan. Visual QA
evidence belongs in `design-qa.md` and
`docs/product-design/implementation-captures/`.

## Remaining Before Full Phase 0 Product Sign-Off

- **Phase 0 product evidence:** code-side hardening and the usability script
  are in place, but design-partner/proxy-creator completion rates, 80%
  slash-to-block comprehension, and first-tour-under-10-minutes need real test
  sessions and recorded metrics.

## Later Phases

- **Phase 0 (PRD §16.2):** design-partner usability evidence and the optional
  Edge-channel browser run where the channel is installed.
- **Phase 1 (PRD §16.3):** historical Clerk deployment evidence, deployed
  staging dashboard/API smoke coverage, historical hosted authoring
  compatibility evidence, CDN/object-storage rollout, and deployed production
  SDK smoke coverage. The active code is Clerk-free, and the dashboard-issued
  second creator snippet is not the canonical future entry.
- **Phase 2 (PRD §16.4):** Slice 1 permanent-loader creator activation, hosted
  browse, modeless launcher/action convergence, session lifecycle, one-install
  origin sync, and role-gated dashboard controls are locally verified. The
  Clerk-free owned-auth code milestone, including recovery and email-worker
  behavior, passes. Slice 2's persisted Brand workflow, tokenized renderer,
  document-specific delivery, deterministic preflight, and staging release
  workflow passed the consolidated local milestone and current-view structural
  visual QA. Slice 3 product matching/provenance, exact staging browser
  verification, production promotion/approval, Slice 3 hardening, and Slice 4
  drift/recovery/analytics are implemented locally. The completion gate passes
  the full Node 24 `pnpm verify` and dependency audit; the three-browser
  Playwright matrix remains an explicit non-deployment-blocking gate. Live auth
  enablement, first deployment and RLS/smoke
  evidence, and the measurement-backed object-materialization decision remain
  operational gates.
- **Phase 3 (PRD §16.5):** coordinated PMM launch workflow with announcement and
  hotspot first, expanding **New experience** into the full outcome/type chooser;
  checklist/survey remain gated by shared conformance and demand.
- **Phase 4+ (PRD §16.6–§16.8):** deeper governance, analytics, integrations,
  and only evidence-backed adjacent outputs such as knowledge, hosted demos, or
  media export.
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
unit tests, build, bundle-size checks, SDK CDN asset staging, and `pnpm audit`.
Run `pnpm test:e2e` explicitly for the full local browser suite; CI browser
coverage is available from the manually dispatched **End-to-end browser tests**
workflow and does not delay or gate deployment.
