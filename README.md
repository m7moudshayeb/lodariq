# Talmeh

Talmeh (Arabic تلميح — _hint_) is a universal product-content platform for
creating and maintaining interactive demos, product tours, onboarding
checklists, feature announcements, surveys, hotspots, and lightweight knowledge
widgets through one document-driven authoring model.

This repository is the **SDK-first monorepo** described in
`refined-talmeh-prd.md`. Phase -1 establishes package boundaries and local
tooling; Pre-Phase builds the local SDK foundation before dashboard/API work.

## Repository layout

```text
packages/
  schema/         @talmeh/schema        Canonical TypeBox/JSON Schema contracts (zero runtime deps)
  compiler/       @talmeh/compiler      Pure isomorphic block JSON -> delivery JSON
  sdk-runtime/    @talmeh/sdk-runtime   Framework-free loader, runtime, resolver, renderers
    src/loader        install-script bootstrap, manifest pointer, lazy loading
    src/runtime       identify, track, analytics batching, playback lifecycle
    src/resolver      semantic target capture, confidence scoring, diagnostics
    src/renderers     tour renderer first; future renderers behind lazy entry points
    src/local-dev     local persistence, fixture helpers, preview compile
  sdk-authoring/  @talmeh/sdk-authoring React + Lexical; authenticated-creator only
    src/authoring     authoring shell and iframe integration
    src/bridge        host-page bridge, versioned postMessage protocol, target picking
    src/editor        the ONLY place allowed to import Lexical
  tests/          @talmeh/tests         centralized suite; mirrors each package's
                                        source path (tests/<pkg>/src/...) and tests
                                        through public entry points

apps/
  fixture-host/   Realistic SaaS-like host app — primary SDK integration/test surface
  customer-like-host/
                  Secondary customer-like app for Phase 0 overfitting checks
  sdk-playground/ Visual playground for compile + tour playback in isolation

docs/adr/         Architecture Decision Records (Phase -1 decisions)
```

## The load-bearing boundary

The production runtime bundle must **never** include React or Lexical
(PRD §9.1, §20). This is guaranteed three ways:

1. **Physical package separation** — `@talmeh/sdk-runtime` does not depend on
   `@talmeh/sdk-authoring`, so the module system itself blocks the import.
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
pnpm --filter @talmeh/fixture-host dev      # run the fixture host
pnpm --filter @talmeh/customer-like-host dev # run the secondary host
pnpm --filter @talmeh/sdk-playground dev    # run the SDK playground
```

## Toolchain

- TypeScript (strict), pnpm workspaces, Turborepo task caching
- Packages build with tsup/esbuild (ESM + `.d.ts`); internal imports are bundled
  so each `dist/` is self-contained and Node-ESM runnable, while deps
  (TypeBox, Floating UI, React, Lexical, `@talmeh/*`) stay external. Source uses
  extensionless relative imports (`moduleResolution: "Bundler"`); apps build with Vite.
- TypeBox/JSON Schema as the canonical cross-system contract (not Zod)
- Vitest (+ jsdom) for unit/contract tests; Playwright for SDK host e2e across
  Chromium, Firefox, and WebKit, with Edge opt-in through `TALMEH_E2E_EDGE=1`
- ESLint + Prettier; dependency-cruiser for package boundaries
- Node.js 24 LTS

## Status

Phase -1, the Pre-Phase local SDK foundation, and Phase 0 SDK UX/integration
validation are complete for the codewise scope. Phase 0 automated hardening now
covers local metrics, a secondary SDK host, browser matrix e2e, and install
docs. The remaining full Phase 0 product-sign-off gap is design-partner/proxy
usability evidence. See `docs/PROGRESS.md` and `docs/local-sdk-installation.md`.
