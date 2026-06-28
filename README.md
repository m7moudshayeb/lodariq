# Talmeh

Talmeh (Arabic تلميح — _hint_) is a universal product-content platform for
creating and maintaining interactive demos, product tours, onboarding
checklists, feature announcements, surveys, hotspots, and lightweight knowledge
widgets through one document-driven authoring model.

This repository is the **SDK-first monorepo skeleton** described in the PRD's
Phase -1 (`refined-waymark-prd.md`, §16.0). The SDK is the first product
surface; the dashboard, API, and workers come later and exist to support it.

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
pnpm verify        # typecheck + lint + boundaries + tests + build
```

Per-task scripts (run across the workspace via Turborepo):

```bash
pnpm build         # build all packages
pnpm typecheck
pnpm lint
pnpm test
pnpm boundaries    # dependency-cruiser package-boundary checks
pnpm --filter @talmeh/fixture-host dev      # run the fixture host
pnpm --filter @talmeh/sdk-playground dev    # run the SDK playground
```

## Toolchain

- TypeScript (strict), pnpm workspaces, Turborepo task caching
- Packages build with tsup/esbuild (ESM + `.d.ts`); internal imports are bundled
  so each `dist/` is self-contained and Node-ESM runnable, while deps
  (TypeBox, Floating UI, React, Lexical, `@talmeh/*`) stay external. Source uses
  extensionless relative imports (`moduleResolution: "Bundler"`); apps build with Vite.
- TypeBox/JSON Schema as the canonical cross-system contract (not Zod)
- Vitest (+ jsdom) for unit/contract tests; Playwright for end-to-end (later)
- ESLint + Prettier; dependency-cruiser for package boundaries
- Node.js 22.12+ today; PRD targets Node 24 LTS for production services

## Status

Phase -1 skeleton: package boundaries, canonical schema + first fixture,
isomorphic compiler, framework-free runtime/resolver/tour renderer, authoring
bridge + editor boundary, fixture host, and ADRs. See `docs/adr/` and the PRD
roadmap (§16) for what comes next.
