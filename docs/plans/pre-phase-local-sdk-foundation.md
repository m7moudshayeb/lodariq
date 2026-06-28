# Pre-Phase Local SDK Foundation Plan

Source of truth: `refined-talmeh-prd.md`.

## Goal

Build the local Talmeh SDK foundation before app/backend MVP work. This phase must
prove that a customer can install the script into a realistic page, open local
authoring, create a linear tour, select targets, preview playback, serialize the
document, reload it, and play it again through SDK bundles without a production
backend. (PRD §16.1)

## Current Baseline

- [x] SDK-first package skeleton exists: `@talmeh/schema`, `@talmeh/compiler`,
      `@talmeh/sdk-runtime`, and `@talmeh/sdk-authoring`. (PRD §16.0)
- [x] `apps/fixture-host` exists as the primary SaaS-like integration surface.
      (PRD §16.0, §16.1)
- [x] Canonical block JSON fixture exists and compiles for local preview.
      (PRD §16.0, §16.1)
- [x] Runtime smoke test can play one compiled linear tour in browser.
      (PRD §16.1)
- [x] Runtime/authoring package boundaries are separated and guarded.
      (PRD §16.0, §20)
- [x] Full local SDK validation, Lexical editor MVP, Playwright, clipboard,
      accessibility, and lifecycle gates are completed for the local pre-phase
      scope. (PRD §16.1)

## Milestones And Tasks

### M1. Local SDK Install Flow

- [x] Build local SDK entry outputs: `talmeh-loader.js`,
      `talmeh-runtime.js`, `talmeh-authoring.js`, `talmeh-local-dev.js`, and
      `renderers/tour.js`. (PRD §16.1 SDK entry points)
- [x] Make `apps/fixture-host` load Talmeh through a script tag and local
      manifest fixture instead of direct Vite imports. (PRD §16.1 Loader bootstrap;
      §16.1 acceptance)
- [x] Read workspace and environment config from script attributes. (PRD §16.1
      Loader bootstrap)
- [x] Support local manifest fixtures. (PRD §16.1 Loader bootstrap)
- [x] Lazy-load runtime, authoring, and tour renderer bundles. (PRD §16.1
      Loader bootstrap; §16.1 acceptance)
- [x] Keep authoring out of ordinary production runtime loading. (PRD §20)

### M2. Runtime Playback Hardening

- [x] Expose and verify `Talmeh.identify()`. (PRD §16.1 Runtime/player)
- [x] Expose and verify `Talmeh.track()`. (PRD §16.1 Runtime/player)
- [x] Load compiled local tour JSON from the local manifest/helper. (PRD §16.1
      Runtime/player)
- [x] Evaluate minimal local eligibility rules. (PRD §16.1 Runtime/player)
- [x] Render linear tour playback with Floating UI placement. (PRD §16.1
      Runtime/player; §16.1 acceptance)
- [x] Add basic Shadow DOM popup styling so playback is inspectable in browser.
      (PRD §16.1 Runtime/player)
- [x] Prevent duplicate concurrent tour popups by keeping one active player per
      runtime/page. (PRD §16.1 Runtime/player)
- [x] Batch local analytics/debug events without breaking host pages. (PRD
      §16.1 Runtime/player)

### M3. Local Authoring Shell And Bridge

- [x] Add a local creator toolbar in the fixture host. (PRD §16.1 Authoring
      bridge; §16.1 acceptance)
- [x] Open authoring mode inside the fixture host. (PRD §16.1 acceptance)
- [x] Use same-origin iframe mode for local development while keeping the
      architecture compatible with a future Talmeh-hosted iframe. (PRD §16.1
      Authoring bridge)
- [x] Use versioned `postMessage` envelopes with origin checks,
      acknowledgements, timeouts, and runtime validation. (PRD §16.1 Authoring
      bridge; §20)
- [x] Send semantic preview patches, not every editor keystroke. (PRD §16.1
      Authoring bridge; §20)
- [x] Keep bridge/runtime imports separated from authoring-only code. (PRD
      §16.1 Bundle and dependency checks; §20)

### M4. Lexical Editor MVP

- [x] Implement MVP nodes for paragraph, heading, tour step, tooltip, button,
      target chip, and validation badge. (PRD §16.1 Authoring editor)
- [x] Keep Lexical imports only inside `packages/sdk-authoring/src/editor`.
      (PRD §16.1 Authoring editor; §20)
- [x] Add slash command menu and command registry for MVP nodes. (PRD §16.1
      Authoring editor)
- [x] Ensure slash commands become rendered blocks, not durable syntax. (PRD
      §16.1 acceptance; §20)
- [x] Add block transform commands. (PRD §16.1 Authoring editor)
- [x] Add top-level drag/drop reorder. (PRD §16.1 Authoring editor)
- [x] Add keyboard reorder. (PRD §16.1 Authoring editor)
- [x] Add property chips. (PRD §16.1 Authoring editor)
- [x] Add validation decorations. (PRD §16.1 Authoring editor)
- [x] Add undo/redo. (PRD §16.1 Authoring editor)
- [x] Add safe basic paste handling. (PRD §16.1 Authoring editor; §16.1
      acceptance)
- [x] Ensure Lexical node keys are never persistent Talmeh block IDs. (PRD
      §16.1 acceptance; §20)

### M5. Target Picker And Resolver Lifecycle

- [x] Add target selection mode with cursor change. (PRD §16.1 acceptance)
- [x] Add hover outlines while selecting. (PRD §16.1 Authoring bridge; §16.1
      acceptance)
- [x] Intercept product clicks until target selection is completed or canceled.
      (PRD §16.1 acceptance)
- [x] Capture host-page element fingerprints. (PRD §16.1 Resolver)
- [x] Attach selected targets as target chips. (PRD §16.1 acceptance)
- [x] Keep coordinates diagnostic-only. (PRD §16.1 Resolver; §20)
- [x] Add visible/enabled checks. (PRD §16.1 Resolver)
- [x] Add lifecycle waits for route transitions, async state, drawers, tabs,
      scroll containers, virtualized lists, and lazy-loaded UI. (PRD §8.6, §16.1
      Resolver, §20)
- [x] Add scroll-container handling. (PRD §16.1 Resolver; §20)
- [x] Report found, missing, and ambiguous resolver diagnostics. (PRD §16.1
      Resolver; §16.1 acceptance)
- [x] Verify resolver succeeds when non-semantic CSS selector details change but
      role, label, text, or stable attributes remain. (PRD §16.1 acceptance)

### M6. Canonical JSON, Persistence, Import/Export

- [x] Serialize authoring editor state to canonical block JSON without losing
      stable IDs. (PRD §16.1 Schema and compiler; §16.1 acceptance)
- [x] Deserialize canonical block JSON back into editor state. (PRD §16.1
      Schema and compiler)
- [x] Compile canonical block JSON to local delivery JSON. (PRD §16.1 Schema
      and compiler; §16.1 acceptance)
- [x] Add local persistence. (PRD §16.1 Fixture and local development)
- [x] Add local debug panel. (PRD §16.1 Fixture and local development)
- [x] Add fixture manifest support. (PRD §16.1 Fixture and local development)
- [x] Add document import/export controls. (PRD §16.1 Fixture and local
      development; §16.1 acceptance)
- [x] Add reset controls. (PRD §16.1 Fixture and local development)
- [x] Add at least one versioned migration. (PRD §16.1 Schema and compiler;
      §16.1 acceptance)
- [x] Ensure export, re-import, recompile, and replay preserve stable block IDs.
      (PRD §16.1 acceptance)

### M7. Tests, Size Gates, And CI

- [x] Add Playwright tests that install the local SDK into the fixture host.
      (PRD §16.1 Fixture and local development)
- [x] Add Playwright coverage for authoring plus playback. (PRD §16.1 Fixture
      and local development; §16.1 acceptance)
- [x] Add accessibility smoke tests for keyboard focus, labels, and
      screen-reader names. (PRD §16.1 acceptance)
- [x] Test validation badge states: ready, incomplete, and invalid. (PRD §16.1
      acceptance)
- [x] Test clipboard paste preserves safe basic content and strips unsupported
      or unsafe formatting. (PRD §16.1 acceptance)
- [x] Add size gate for loader under 3 KB gzipped. (PRD §16.1 acceptance)
- [x] Add size gate for runtime plus tour renderer under 40 KB gzipped. (PRD
      §16.1 acceptance)
- [x] Add CI workflow running typecheck, lint, boundaries, tests, build, and
      size checks. (PRD §16.0 acceptance; §16.1 Bundle and dependency checks)
- [x] Preserve dependency-cruiser checks blocking runtime imports of React,
      Lexical, dashboard code, or authoring code. (PRD §16.1 Bundle and dependency
      checks; §20)

## Public Interfaces

- Browser global: `Talmeh.identify()` and `Talmeh.track()`. (PRD §16.1
  Runtime/player)
- Local SDK files: `talmeh-loader.js`, `talmeh-runtime.js`,
  `talmeh-authoring.js`, `talmeh-local-dev.js`, and `renderers/tour.js`. (PRD
  §16.1 SDK entry points)
- Canonical document contract remains TypeBox/JSON Schema in `@talmeh/schema`.
  (PRD §16.1 Schema and compiler; §20)
- Browser compilation remains preview-only; real publication artifacts are
  server-side later. (PRD §20)

## Explicitly Out Of Scope

- Multi-user collaboration, presence cursors, realtime conflict resolution, and
  Collaboration/Yjs wiring. (PRD §16.1 Explicitly out of scope)
- Backend persistence, production dashboard, production API, production auth,
  and production publication workflow. (PRD §16.1 Explicitly out of scope)
- Data-source chip implementation and condition chip implementation beyond
  schema stubs. (PRD §16.1 Explicitly out of scope)
- Flow Map primitives and branching UI. (PRD §16.1 Explicitly out of scope)
- Spotlight node unless Phase 0 usability testing proves it is essential. (PRD
  §16.1 Explicitly out of scope)
- Full Google Docs or Word paste fidelity. (PRD §16.1 Explicitly out of scope)
- Complete implementations for every future document type. (PRD §16.1
  Explicitly out of scope)
- Markdown-to-JSON compilation or a custom Markdown grammar with Ohm, Lezer, or
  any other parser. (PRD §16.1 Explicitly out of scope; §20)
- Standalone WebSocket service. (PRD §16.1 Explicitly out of scope; §20)

## Acceptance Checklist

- [x] Fixture host can load `talmeh-loader.js` from the local build. (PRD
      §16.1 acceptance)
- [x] Loader can lazy-load runtime, authoring, and tour renderer bundles. (PRD
      §16.1 acceptance)
- [x] Creator can open local authoring mode inside the fixture host. (PRD §16.1
      acceptance)
- [x] Creator can add blocks with slash commands. (PRD §16.1 acceptance)
- [x] Slash commands become rendered blocks. (PRD §16.1 acceptance)
- [x] Creator can select a host-page element and attach a target chip. (PRD
      §16.1 acceptance)
- [x] Target selection mode changes cursor, outlines hovered elements, and
      intercepts product clicks until target selection is completed or canceled.
      (PRD §16.1 acceptance)
- [x] Authoring editor state serializes to canonical block JSON without losing
      stable block IDs. (PRD §16.1 acceptance)
- [x] Canonical block JSON compiles to local delivery JSON. (PRD §16.1
      acceptance)
- [x] Local delivery JSON plays back as a linear tour through the runtime/player
      bundle. (PRD §16.1 acceptance)
- [x] A tour fixture can be exported, re-imported, recompiled, and replayed
      without losing stable block IDs. (PRD §16.1 acceptance)
- [x] Resolver succeeds when non-semantic CSS selector details change but role,
      label, text, or stable attributes remain. (PRD §16.1 acceptance)
- [x] Resolver reports found, missing, and ambiguous states. (PRD §16.1
      acceptance)
- [x] Lexical node keys are not used as persistent Talmeh block IDs. (PRD §16.1
      acceptance; §20)
- [x] Migrations can upgrade at least one older fixture version. (PRD §16.1
      acceptance)
- [x] Validation badges render ready, incomplete, and invalid states. (PRD
      §16.1 acceptance)
- [x] Clipboard paste preserves safe basic content and strips unsupported or
      unsafe formatting. (PRD §16.1 acceptance)
- [x] Accessibility smoke tests pass for keyboard focus, labels, and
      screen-reader names. (PRD §16.1 acceptance)
- [x] CI fails if loader/runtime/renderers import React, Lexical, dashboard
      code, or authoring-only code. (PRD §16.1 acceptance)
- [x] Loader is under 3 KB gzipped. (PRD §16.1 acceptance)
- [x] Runtime plus tour renderer is under 40 KB gzipped. (PRD §16.1 acceptance)
- [x] Collaboration is not implemented and no architecture depends on it. (PRD
      §16.1 acceptance)

## Documentation Test Plan

- [x] Every milestone and task cites `refined-talmeh-prd.md` by section.
- [x] The document does not claim unfinished implementation is complete.
- [x] Terminology uses Talmeh, `@talmeh/*`, and local SDK language consistently.
- [x] `docs/PROGRESS.md` remains unchanged unless actual implementation status
      changes.
- [x] `pnpm format:check` passes.
