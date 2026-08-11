# Lodariq

Lodariq is an in-product launch and adoption workspace
for Product Marketing teams at frequently shipping B2B SaaS companies. Creators
work inside the live product, inherit a safe shared Brand System, verify an
immutable staging artifact, and promote that exact artifact to production.
After one permanent SDK installation, returning creators reveal a draggable
launcher on an allowed development or staging product origin with
`Ctrl/⌘ + Shift + L` or the dashboard's **Open in product** action. The launcher
is hidden by default. Lodariq sign-in uses a first-party popup and returns to the
same page; the dashboard remains the control plane for setup, policy,
administration, reporting, and support.

The architecture can expand across tours, announcements, hotspots, checklists,
feedback, demos, and contextual knowledge. The initial commercial workflow is
deliberately narrower: make feature launches look native, survive product
changes, and move safely through environments without CSS or repeated setup.

This repository is the **SDK-first monorepo** described in
`refined-lodariq-prd.md`. Phase -1 through Phase 1 established and hardened the
SDK, schema/compiler, API, dashboard, hosted editor, and publication foundation.
Phase 2 adds hosted permanent-loader creator activation, converges the modeless
in-product launcher/actions, and builds the safe Brand System and exact-artifact
environment release pipeline. Its local implementation now includes Product
Match, atomic draft/provenance persistence, exact browser verification, Brand
drift review, same-artifact promotion and rollback, unpublish, and authoritative
environment-isolated analytics. Option 2, **Editorial Air**, is the current
provisional visual target for dashboard and hosted authoring alignment; see
`docs/product-design/design-system-exploration-2026-08-06/README.md`.

## Repository layout

```text
packages/
  schema/         @lodariq/schema        Canonical TypeBox/JSON Schema contracts (zero runtime deps)
  compiler/       @lodariq/compiler      Pure isomorphic block JSON -> delivery JSON
  sdk-runtime/    @lodariq/sdk-runtime   Framework-free loader, runtime, resolver, renderers
    src/loader        install-script bootstrap, manifest pointer, lazy loading
    src/runtime       identify, track, analytics batching, playback lifecycle
    src/resolver      semantic target capture, confidence scoring, diagnostics
    src/renderers     tour renderer first; future renderers behind lazy entry points
    src/local-dev     local persistence, fixture helpers, preview compile
  sdk-authoring/  @lodariq/sdk-authoring React + Lexical; authenticated-creator only
    src/authoring     authoring shell and iframe integration
    src/bridge        host-page bridge, versioned postMessage protocol, target picking
    src/editor        the ONLY place allowed to import Lexical
  tests/          @lodariq/tests         centralized suite; mirrors each package's
                                        source path (tests/<pkg>/src/...) and tests
                                        through public entry points

apps/
  api/            Fastify control plane, SDK delivery, and event ingestion
  dashboard/      Next.js setup, policy, administration, reporting, and support control plane
  editor/         Lodariq-hosted authoring iframe origin
  fixture-host/   Realistic SaaS-like host app — primary SDK integration/test surface
  customer-like-host/
                  Secondary customer-like app for Phase 0 overfitting checks
  sdk-playground/ Visual playground for compile + tour playback in isolation

docs/             Product/UX guidance, implementation plans, progress, runbooks
docs/adr/         Durable architecture decisions
```

## The load-bearing boundary

The production runtime bundle must **never** include React or Lexical
(PRD §9.1, §20). This is guaranteed three ways:

1. **Physical package separation** — `@lodariq/sdk-runtime` does not depend on
   `@lodariq/sdk-authoring`, so the module system itself blocks the import.
2. **dependency-cruiser** (`pnpm boundaries`) — fails CI on forbidden imports.
3. **ESLint `no-restricted-imports`** — a fast local signal.

Lexical may be imported **only** inside `packages/sdk-authoring/src/editor`.

## Getting started

```bash
pnpm install
pnpm verify        # typecheck + lint + boundaries + tests + build + e2e + audit
```

Per-task scripts (run across the workspace via Turborepo):

```bash
pnpm build         # build all packages
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm boundaries    # dependency-cruiser package-boundary checks
pnpm --filter @lodariq/fixture-host dev      # run the fixture host
pnpm --filter @lodariq/customer-like-host dev # run the secondary host
pnpm --filter @lodariq/sdk-playground dev    # run the SDK playground
```

## Toolchain

- TypeScript (strict), pnpm workspaces, Turborepo task caching
- Packages build with tsup/esbuild (ESM + `.d.ts`); internal imports are bundled
  so each `dist/` is self-contained and Node-ESM runnable, while deps
  (TypeBox, Floating UI, React, Lexical, `@lodariq/*`) stay external. Source uses
  extensionless relative imports (`moduleResolution: "Bundler"`); apps build with Vite.
- TypeBox/JSON Schema as the canonical cross-system contract (not Zod)
- Vitest (+ jsdom) for unit/contract tests; Playwright for SDK host e2e across
  Chromium, Firefox, and WebKit, with Edge opt-in through `LODARIQ_E2E_EDGE=1`
- ESLint + Prettier; dependency-cruiser for package boundaries
- Node.js 24 LTS

## Status

Phase -1 through Phase 1 and the Phase 2 code milestone are verified locally
under Node 24. The 2026-08-09 completion gate passes the full `pnpm verify`: 18
typecheck tasks, 12 lint tasks, dependency boundaries and migration safety, 126
Vitest files / 1,064 tests, 11 builds, runtime/authoring size gates, 109 prepared
SDK assets, 77 Playwright tests with four intentional skips, and a
zero-vulnerability dependency audit. Phase 2 is code-complete locally. The first
clean-slate database deployment, non-owner live RLS evidence, DNS/TLS/secrets and
email setup, deployed staging/production smokes, the measurement-backed B4 ADR,
and external usability evidence remain unclaimed operational/product evidence.

Start with:

- [`refined-lodariq-prd.md`](refined-lodariq-prd.md) — canonical product,
  architecture, roadmap, and guardrails.
- [`docs/README.md`](docs/README.md) — documentation source-of-truth map.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — implemented reality and current gaps.
- [`docs/plans/phase-2-brand-and-release-foundation.md`](docs/plans/phase-2-brand-and-release-foundation.md)
  — next technical execution plan.
