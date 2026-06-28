# Talmeh Implementation Progress

Tracks what has been implemented against `refined-waymark-prd.md`. Section
references like (PRD §16.0) point to that document.

- Current phase: **Phase -1 — Decisions and Repo Skeleton** (PRD §16.0)
- Last updated: 2026-06-28

Status legend:

- ✅ Done — implemented and verified (`pnpm verify` green).
- 🟡 Scaffolded — structure/contract in place; full behavior lands in a later phase.
- ⏳ Pending — not started yet (belongs to a later phase).
- ➖ N/A yet — deliberately deferred per the PRD.

---

## Phase -1 scope (PRD §16.0)

| Item | Status | Where / Notes |
|---|---|---|
| Product naming: `Talmeh`, `@talmeh/*`, `*.talmeh.io` (PRD §16.0) | ✅ | Used across packages, ADRs, origin model |
| One repo with pnpm workspaces (PRD §12.1, §16.0) | ✅ | `pnpm-workspace.yaml` |
| Turborepo for task caching (PRD §16.0) | ✅ | `turbo.json` |
| Strict TypeScript (PRD §16.0) | ✅ | `tsconfig.base.json` (strict + extras) |
| ESLint + Prettier (PRD §16.0) | ✅ | `eslint.config.mjs`, `.prettierrc.json` |
| Vitest (PRD §16.0) | ✅ | Centralized `@talmeh/tests` (jsdom per-file) |
| Playwright (PRD §16.0) | ⏳ | Deferred to Pre-phase e2e (PRD §16.1) |
| size-limit (PRD §16.0, §9.1) | ⏳ | Bundle-size gates not wired yet |
| dependency-cruiser (PRD §16.0) | ✅ | `.dependency-cruiser.cjs` + ESLint guards |
| `packages/schema` `@talmeh/schema` (PRD §16.0) | ✅ | TypeBox contracts + registry + validate |
| `packages/compiler` `@talmeh/compiler` (PRD §16.0) | ✅ | Pure isomorphic compile + content hash |
| `packages/sdk-runtime` `@talmeh/sdk-runtime` (PRD §16.0) | ✅ | loader, runtime, resolver, renderers, local-dev |
| └ `src/loader` (PRD §16.0) | 🟡 | Config read, manifest fetch, lazy loaders |
| └ `src/runtime` (PRD §16.0) | 🟡 | identify/track + analytics batching/beacon |
| └ `src/resolver` (PRD §16.0) | ✅ | Confidence scoring + found/missing/ambiguous |
| └ `src/renderers` (PRD §16.0) | 🟡 | Linear tour renderer (Floating UI + Shadow DOM) |
| └ `src/local-dev` (PRD §16.0) | 🟡 | Local persistence, import/export, preview compile |
| `packages/sdk-authoring` `@talmeh/sdk-authoring` (PRD §16.0) | ✅ | authoring, bridge, editor |
| └ `src/authoring` (PRD §16.0) | 🟡 | Shell + bridge wiring; UI lands Pre-phase |
| └ `src/bridge` (PRD §16.0) | 🟡 | Origin checks + schema validation + send guard |
| └ `src/editor` (PRD §16.0) | 🟡 | Lexical boundary, stable IDs, serialize/migrate hooks |
| `apps/fixture-host` (PRD §16.0) | ✅ | SaaS-like routes/drawer/scroll/lazy + SDK boot |
| `apps/sdk-playground` (PRD §16.0) | ✅ | Compiles fixture to delivery JSON |
| No production dashboard/API/worker yet (PRD §16.0) | ✅ | Intentionally absent |
| Package-boundary checks (PRD §16.0, §9.1) | ✅ | Verified to fail on react/lexical/authoring imports |
| Lexical only in `sdk-authoring/src/editor` (PRD §16.0, §20) | ✅ | dependency-cruiser rule `lexical-only-in-editor` |
| First canonical block JSON fixture (PRD §16.0) | ✅ | `packages/schema/fixtures/tour.linear.v1.json` |
| ADRs for the load-bearing decisions (PRD §16.0) | ✅ | `docs/adr/` (13 records) |

### Phase -1 acceptance criteria (PRD §16.0)

| Criterion | Status | Notes |
|---|---|---|
| CI runs typecheck, lint, tests, and bundle-size checks | 🟡 | `pnpm verify` runs typecheck/lint/boundaries/test/build locally; no CI workflow file or size-limit yet |
| Repo builds loader, runtime, authoring, compiler, fixture-host artifacts | ✅ | tsup + Vite; `dist/` is Node-ESM runnable |
| Package-boundary checks fail on forbidden imports | ✅ | Proven with `react` and `lexical` probes |
| First block JSON fixture versioned and validated by `@talmeh/schema` | ✅ | Validated in `packages/tests/schema/src/document.test.ts` |
| No production code depends on Markdown parsing, custom grammar, or WebSockets | ✅ | None present anywhere |

---

## Decisions captured as ADRs (PRD §16.0)

| ADR | PRD refs | Status |
|---|---|---|
| 0001 runtime/authoring package split | §9.1, §16.0, §20 | ✅ Accepted |
| 0002 schema + compiler shared core | §9.1, §11.1, §12.1 | ✅ Accepted |
| 0003 server-side publication compilation | §9.1, §11.3, §20 | ✅ Accepted |
| 0004 authoring/editor boundary | §7.2, §20 | ✅ Accepted |
| 0005 iframe bridge | §9.4, §9.5, §11.1 | ✅ Accepted |
| 0006 origin model | §12.5, §20 | ✅ Accepted |
| 0007 DnD approach | §7.2, §19.6 | 🟡 Proposed |
| 0008 resolver strategy | §8.1–§8.6 | ✅ Accepted |
| 0009 local test harness | §16.0–§16.2 | ✅ Accepted |
| 0010 secrets management | §12.1 | 🟡 Proposed |
| 0011 tenant isolation + RLS | §11.2, §20 | ✅ Accepted (applies at Phase 1) |
| 0012 deferred-vendor triggers | §12.1, §12.2, §19.8 | ✅ Accepted |

---

## Architecture contracts realized

| PRD concept | Status | Implementation |
|---|---|---|
| Canonical block document is source of truth (PRD §3.1, §7.1) | ✅ | `schema/src/document.ts`, `block.ts` |
| Element fingerprint (PRD §8.3) | ✅ | `schema/src/target.ts` |
| Runtime lifecycle hints (PRD §8.6) | 🟡 | Schema present; resolver lifecycle waits pending |
| Resolution scoring (PRD §8.4) | ✅ | `sdk-runtime/src/resolver` + tests |
| Compiled delivery JSON + content hash (PRD §6.1, §11.3) | ✅ | `compiler/src/compile.ts`, `hash.ts` |
| Manifest pointer / immutable publication (PRD §11.3) | 🟡 | `ManifestPointer` schema; server pipeline pending |
| Bridge message protocol + envelope (PRD §9.5, §11.1) | ✅ | `schema/src/bridge.ts`, validated in `sdk-authoring/src/bridge` |
| Data catalog entry (PRD §6.3) | 🟡 | `schema/src/catalog.ts`; builder UI pending |
| Analytics + selector diagnostic events (PRD §15) | 🟡 | Schemas + runtime batching; ingestion pending |
| Stable block IDs ≠ Lexical node keys (PRD §7.2, §20) | ✅ | `sdk-authoring/src/editor/ids.ts` |
| Serialization + versioned migrations (PRD §7.2) | 🟡 | Boundary + migration hook; full mapping Pre-phase |
| No arbitrary HTML/CSS in documents (PRD §7.10, §14.2) | 🟡 | Schema/import validation exists, but block/compiled `props` are still permissive and sanitizers are not wired yet |

---

## Guardrails compliance (PRD §20)

| Guardrail | Status |
|---|---|
| No canvas editing against raw Markdown strings | ✅ |
| No Markdown-to-JSON compiler / custom grammar in Pre-phase…Phase 1 | ✅ |
| Lexical not imported outside `sdk-authoring/src/editor` | ✅ |
| `sdk-runtime` and `sdk-authoring` not collapsed; runtime cannot import React/Lexical | ✅ |
| Production runtime does not depend on `sdk-authoring` | ✅ |
| Browser compilation is preview-only (real artifact server-side) | ✅ (preview path only exists) |
| No Vercel; Fly.io intended | ✅ (recorded; infra not built) |
| No standalone WebSocket gateway | ✅ |
| Zod not used as canonical contract (TypeBox/JSON Schema) | ✅ |
| Slash commands treated as gestures, not durable syntax | ➖ (editor UI Pre-phase) |
| Coordinates never trigger production interactions | ✅ (resolver: coordinates diagnostic-only) |

---

## Not yet started (later phases)

- **Pre-phase (PRD §16.1):** full Lexical MVP nodes (paragraph, heading, tour
  step, tooltip, button, target chip, validation badge), slash menu + command
  registry, drag/drop + keyboard reorder, target-selection mode UX, lifecycle
  waits/scroll handling, Playwright e2e against the fixture host, size gates.
- **Phase 0 (PRD §16.2):** hardening, expanded fixtures, design-partner usability tests.
- **Phase 1 (PRD §16.3):** Next.js dashboard, Fastify API, Clerk auth, Neon +
  Drizzle persistence, staging authoring, production SDK build pipeline.
- **Phase 2+ (PRD §16.4–§16.8):** hosted demos, media export, in-app delivery,
  governance, analytics, platform maturity.
- **Infrastructure (PRD §12):** Fly.io, Cloudflare R2/CDN, secrets manager,
  RLS, CI workflow + destructive-migration gate — recorded in ADRs, not built.

---

## How to verify current state

```bash
pnpm install
pnpm verify   # typecheck + lint + boundaries + test + build
```

All packages' `dist/` are self-contained ESM and runnable directly under Node
(verified by importing each package by name through Node).
