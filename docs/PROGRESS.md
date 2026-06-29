# Lodariq Implementation Progress

Tracks what has been implemented against `refined-lodariq-prd.md`. Section
references like (PRD §16.0) point to that document.

- Current phase: **Phase 0 — SDK UX and Integration Validation** (PRD §16.2)
- Last updated: 2026-06-29

Status legend:

- ✅ Done — implemented and verified (`pnpm verify` or the named check is green).
- 🟡 Scaffolded — structure/contract in place; full behavior lands in a later phase.
- ⏳ Pending — not started yet (belongs to a later phase).
- ➖ N/A yet — deliberately deferred per the PRD.

---

## Phase -1 scope (PRD §16.0)

| Item                                                             | Status | Where / Notes                                              |
| ---------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Product naming: `Lodariq`, `@lodariq/*`, `*.lodariq.com` (PRD §16.0) | ✅     | Used across packages, ADRs, origin model                   |
| One repo with pnpm workspaces (PRD §12.1, §16.0)                 | ✅     | `pnpm-workspace.yaml`                                      |
| Turborepo for task caching (PRD §16.0)                           | ✅     | `turbo.json`                                               |
| Strict TypeScript (PRD §16.0)                                    | ✅     | `tsconfig.base.json` (strict + extras)                     |
| ESLint + Prettier (PRD §16.0)                                    | ✅     | `eslint.config.mjs`, `.prettierrc.json`                    |
| Vitest (PRD §16.0)                                               | ✅     | Centralized `@lodariq/tests` (jsdom per-file)               |
| Playwright (PRD §16.0)                                           | ✅     | Fixture-host e2e runs through `pnpm verify`                |
| Bundle-size gates (PRD §16.0, §9.1)                              | ✅     | Runtime gzip gate for loader + runtime/tour                |
| dependency-cruiser (PRD §16.0)                                   | ✅     | `.dependency-cruiser.cjs` + ESLint guards                  |
| `packages/schema` `@lodariq/schema` (PRD §16.0)                   | ✅     | TypeBox contracts + registry + validate                    |
| `packages/compiler` `@lodariq/compiler` (PRD §16.0)               | ✅     | Pure isomorphic compile + content hash                     |
| `packages/sdk-runtime` `@lodariq/sdk-runtime` (PRD §16.0)         | ✅     | loader, runtime, resolver, renderers, local-dev            |
| └ `src/loader` (PRD §16.0)                                       | 🟡     | Config read, manifest fetch, lazy loaders                  |
| └ `src/runtime` (PRD §16.0)                                      | 🟡     | identify/track + analytics batching/beacon                 |
| └ `src/resolver` (PRD §16.0)                                     | ✅     | Confidence scoring + found/missing/ambiguous               |
| └ `src/renderers` (PRD §16.0)                                    | 🟡     | Linear tour renderer, focus, lifecycle waits, scroll       |
| └ `src/local-dev` (PRD §16.0)                                    | 🟡     | Local persistence, import/export, preview compile, metrics |
| `packages/sdk-authoring` `@lodariq/sdk-authoring` (PRD §16.0)     | ✅     | authoring, bridge, editor                                  |
| └ `src/authoring` (PRD §16.0)                                    | 🟡     | Local iframe shell + target-pick wiring                    |
| └ `src/bridge` (PRD §16.0)                                       | 🟡     | Origin checks, validation, ack/timeouts, target pick       |
| └ `src/editor` (PRD §16.0)                                       | 🟡     | Lexical boundary, stable IDs, serialize/migrate hooks      |
| `apps/fixture-host` (PRD §16.0)                                  | ✅     | SaaS-like routes/drawer/scroll/lazy + SDK boot             |
| `apps/customer-like-host` (PRD §16.2)                            | ✅     | Secondary SDK host for Phase 0 overfitting checks          |
| `apps/sdk-playground` (PRD §16.0)                                | ✅     | Compiles fixture to delivery JSON                          |
| No production dashboard/API/worker yet (PRD §16.0)               | ✅     | Intentionally absent                                       |
| Package-boundary checks (PRD §16.0, §9.1)                        | ✅     | Verified to fail on react/lexical/authoring imports        |
| Lexical only in `sdk-authoring/src/editor` (PRD §16.0, §20)      | ✅     | dependency-cruiser rule `lexical-only-in-editor`           |
| First canonical block JSON fixture (PRD §16.0)                   | ✅     | `packages/schema/fixtures/tour.linear.v1.json`             |
| ADRs for the load-bearing decisions (PRD §16.0)                  | ✅     | `docs/adr/` (13 records)                                   |

### Phase -1 acceptance criteria (PRD §16.0)

| Criterion                                                                     | Status | Notes                                                              |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| CI runs typecheck, lint, tests, e2e, audit, and bundle-size checks            | ✅     | Workflow runs `pnpm verify`, including Playwright and `pnpm audit` |
| Repo builds loader, runtime, authoring, compiler, fixture-host artifacts      | ✅     | tsup + Vite; `dist/` is Node-ESM runnable                          |
| Package-boundary checks fail on forbidden imports                             | ✅     | Proven with `react` and `lexical` probes                           |
| First block JSON fixture versioned and validated by `@lodariq/schema`          | ✅     | Validated in `packages/tests/schema/src/document.test.ts`          |
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

| PRD concept                                                  | Status | Implementation                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical block document is source of truth (PRD §3.1, §7.1) | ✅     | `schema/src/document.ts`, `block.ts`                                                                                                                                                                                                      |
| Element fingerprint (PRD §8.3)                               | ✅     | `schema/src/target.ts`                                                                                                                                                                                                                    |
| Runtime lifecycle hints (PRD §8.6)                           | 🟡     | Route/text/element/network-idle waits, semantic open-panel/select-tab activation, scroll containers, skeleton/loading state, transformed content, and virtualized-search covered                                                          |
| Resolution scoring (PRD §8.4)                                | ✅     | `sdk-runtime/src/resolver` scores captured semantic signals, including stable attrs, role/name, labels, landmarks, nearby text, tag/input type, relative position, and scoped CSS                                                         |
| Compiled delivery JSON + content hash (PRD §6.1, §11.3)      | ✅     | `compiler/src/compile.ts`, `hash.ts`                                                                                                                                                                                                      |
| Manifest pointer / immutable publication (PRD §11.3)         | 🟡     | `ManifestPointer` schema; server pipeline pending                                                                                                                                                                                         |
| Bridge message protocol + envelope (PRD §9.5, §11.1)         | ✅     | `schema/src/bridge.ts`, validated in `sdk-authoring/src/bridge`, ack/timeouts and message-size limits included                                                                                                                            |
| Bridge page-state observation (PRD §9.5)                     | ✅     | `sdk-authoring/src/authoring` emits coalesced `page.lifecycle.update` route/scroll messages with ack/timeout handling                                                                                                                     |
| Data catalog entry (PRD §6.3)                                | 🟡     | `schema/src/catalog.ts`; builder UI pending                                                                                                                                                                                               |
| Analytics + selector diagnostic events (PRD §15)             | 🟡     | Schemas + runtime batching; ingestion pending                                                                                                                                                                                             |
| Local Phase 0 usability metrics (PRD §16.2)                  | ✅     | Local metrics capture time-to-first-block, time-to-first-target, failed picks, preview-open, and cancel rate                                                                                                                              |
| Target chip actions and health (PRD §8.2, §16.2)             | ✅     | Authoring target chips expose view/change/test/health/remove/advanced details, resolve saved fingerprints through the host bridge, and mark steps incomplete when a target is removed without deleting content                            |
| Nested target and click-through UX (PRD §8.2)                | ✅     | Host picker supports parent/deeper candidate cycling plus one-click product click-through while selection remains active                                                                                                                  |
| Product-click gated tour steps (PRD §7.1, §8.6)              | ✅     | Button actions support `clickTarget`; runtime listens for the real resolved target click, lets the host app handle it, advances with lifecycle waits, and resumes after same-tab navigation/reload when the manifest/document still match |
| Stable block IDs ≠ Lexical node keys (PRD §7.2, §20)         | ✅     | `sdk-authoring/src/editor/ids.ts`                                                                                                                                                                                                         |
| Serialization + versioned migrations (PRD §7.2)              | ✅     | Lexical helpers, migration hook, and local frame round-trip through the Lexical serialization boundary                                                                                                                                    |
| No arbitrary HTML/CSS in documents (PRD §7.10, §14.2)        | ✅     | Block/compiled `props` use narrow allowlists; import rejects arbitrary CSS/JS/raw HTML props                                                                                                                                              |

---

## Guardrails compliance (PRD §20)

| Guardrail                                                                            | Status                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| No canvas editing against raw Markdown strings                                       | ✅                                         |
| No Markdown-to-JSON compiler / custom grammar in Pre-phase…Phase 1                   | ✅                                         |
| Lexical not imported outside `sdk-authoring/src/editor`                              | ✅                                         |
| `sdk-runtime` and `sdk-authoring` not collapsed; runtime cannot import React/Lexical | ✅                                         |
| Production runtime does not depend on `sdk-authoring`                                | ✅                                         |
| Browser compilation is preview-only (real artifact server-side)                      | ✅ (preview path only exists)              |
| No Vercel; Fly.io intended                                                           | ✅ (recorded; infra not built)             |
| No standalone WebSocket gateway                                                      | ✅                                         |
| Zod not used as canonical contract (TypeBox/JSON Schema)                             | ✅                                         |
| Slash commands treated as gestures, not durable syntax                               | ✅ (local authoring frame)                 |
| Coordinates never trigger production interactions                                    | ✅ (resolver: coordinates diagnostic-only) |

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

## Remaining Before Full Phase 0 Product Sign-Off

- **Phase 0 product evidence:** code-side hardening and the usability script
  are in place, but design-partner/proxy-creator completion rates, 80%
  slash-to-block comprehension, and first-tour-under-10-minutes need real test
  sessions and recorded metrics.

## Later Phases

- **Phase 0 (PRD §16.2):** design-partner usability evidence and the optional
  Edge-channel browser run where the channel is installed.
- **Phase 1 (PRD §16.3):** Next.js dashboard, Fastify API, Clerk auth, Neon +
  Drizzle persistence, staging authoring, production SDK build pipeline.
- **Phase 2+ (PRD §16.4–§16.8):** hosted demos, media export, in-app delivery,
  governance, analytics, platform maturity.
- **Infrastructure (PRD §12):** Fly.io, Cloudflare R2/CDN, secrets manager,
  RLS and destructive-migration gate — recorded in ADRs, not built.

---

## How to verify current state

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs typecheck, lint, package boundaries, unit tests, build,
bundle-size checks, fixture-host Playwright e2e, and `pnpm audit`.
