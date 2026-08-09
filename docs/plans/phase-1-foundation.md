# Phase 1 Foundation Plan

Source of truth: `refined-lodariq-prd.md` §16.3.

## Summary

Phase -1, the Pre-Phase local SDK foundation, and Phase 0 SDK UX and integration
validation are complete. Phase 1 productionizes the validated SDK and adds the
minimum secure control plane required for staging authoring, persistence, and
linear tour playback.

## Canonical Authoring Entry Supersession

This plan preserves the Phase 1 implementation target and evidence as it was
defined at the time. Its dashboard-generated staging snippet and generic
authenticated toolbar are historical foundations, not the current canonical
creator entry workflow.

The canonical hosted target is one permanent SDK installation that exposes a
direct, draggable launcher only in configured development and staging products.
The launcher starts a first-party top-level authentication popup, exchanges an
exact-origin single-use code for a short-lived activation grant, creates a
document-scoped session, and only then lazily loads authoring code. It opens the
same modeless authoring popup and runtime overlay, with stable `New`,
`Experiences on this page`, and `Preview` actions.
No browser extension or second dashboard-installed creator snippet is part of
the core path. The dashboard is limited to setup, administration, and support.

This convergence is planned for Phase 2 Slice 1 and is **not implemented or
proven by this historical Phase 1 plan**. Phase 2 adds contextual Brand and
release actions to that shell. Phase 3 expands `New` into the broad
outcome/type chooser.

This phase must keep the PRD guardrails intact:

- Do not add a Markdown-to-JSON compiler or custom Markdown grammar.
- Do not collapse `@lodariq/sdk-runtime` and `@lodariq/sdk-authoring`.
- Keep Lexical imports limited to `packages/sdk-authoring/src/editor`.
- Keep browser compilation preview-only; real publication artifacts compile
  server-side.
- Do not add a standalone WebSocket gateway.
- Do not allow arbitrary CSS, JavaScript, or raw HTML in documents.
- Do not use coordinates for production interactions.

## Implementation Changes

### Control Plane Scaffold

- Add `apps/dashboard` as `@lodariq/dashboard`.
  - Use Next.js 16 on the Node runtime.
  - Target Fly.io deployment, not Vercel.
  - Implement the minimum Phase 1 views: document list, environment tokens, and
    SDK installation snippet.

- Add `apps/api` as `@lodariq/api`.
  - Use Fastify 5 with TypeScript.
  - Use TypeBox/Ajv validation at the HTTP boundary.
  - Keep the API as a modular monolith.

- Add `packages/database` as `@lodariq/database`.
  - Use Drizzle with Neon PostgreSQL-compatible schema and migrations.
  - Model workspaces, users or memberships, environments, environment tokens,
    documents, document versions or drafts, compiled artifacts, and basic events.
  - Add PostgreSQL row-level security before using any shared environment.
  - Require explicit human sign-off before destructive shared-environment
    migrations.

### Auth And Tenancy

- Integrate Clerk through a thin internal auth boundary in the API.
- Do not spread Clerk-specific SDK calls through domain or persistence code.
- Scope all document, environment, token, and event access by workspace.
- Keep secrets and environment tokens out of client-rendered surfaces except for
  the intended SDK installation snippet.

### Document Persistence And Compilation

- Persist canonical block JSON as the source of truth.
- Validate canonical documents through `@lodariq/schema`.
- Compile preview and delivery JSON server-side through `@lodariq/compiler`.
- Keep browser compilation only for local preview and fixture workflows.
- Add an internal JSON/debug view for support and diagnostics.

### Staging SDK Flow

The bullets below record the historical Phase 1 flow. They do not supersede the
canonical convergence target above.

- Dashboard generates staging SDK snippets from environment tokens.
- Staging toolbar appears only for authenticated creators.
- Production viewer/runtime paths never load `@lodariq/sdk-authoring`, React,
  Lexical, dashboard code, or the authoring iframe.
- Runtime continues to lazy-load the tour renderer.

### Bridge And Authoring

- The iframe editor owns local editing state; keystrokes do not cross the bridge.
- Keep bridge messages versioned, batched, semantic, runtime-validated, and sent
  only to exact allowed origins.
- Preserve acknowledgement, timeout, and message-size-limit behavior.
- Support target chips with view, change, found, missing, and ambiguous states.
- Deleting a target marks the step incomplete without deleting creator-authored
  content.

## Test Plan

- `pnpm verify` remains green after each Phase 1 slice.
- Dashboard test coverage proves the document list, environment token view, and
  SDK snippet render from API-backed data.
- API tests prove canonical block JSON is validated with `@lodariq/schema`.
- Compiler tests prove server-side compilation produces schema-valid delivery
  JSON.
- Database tests cover workspace scoping, document persistence, compiled
  artifact persistence, and RLS policy behavior.
- E2E coverage proves staging SDK install, authenticated toolbar visibility,
  iframe authoring, save, compile, and linear tour playback.
- Boundary checks prove production runtime does not import authoring, React,
  Lexical, or dashboard dependencies.

## Acceptance Criteria

These are the historical Phase 1 acceptance criteria. They do not claim the
later one-install launcher, direct popup authentication, or modeless-shell
convergence.

- Engineer can install a staging SDK snippet from the dashboard into a test app.
- Staging toolbar appears only for authenticated creators.
- Production environment never loads the authoring bundle.
- Iframe editor owns local editing state; keystrokes do not cross the bridge.
- Bridge messages are batched and versioned.
- Typing `/button` inserts a rendered button block, not source syntax.
- Unknown slash text can remain ordinary paragraph text.
- Button without action saves as incomplete and blocks publish.
- Deleting a target marks the step incomplete without deleting content.
- Dragging blocks updates the canonical model and canvas preview.
- Canvas target selection updates an explicit target chip.
- Target chips expose view, change, and basic found/missing/ambiguous status.
- Pasted content is sanitized and unsupported formatting is reported or safely
  removed.
- Compiler validates block JSON and delivery JSON with shared schema.
- Resolver succeeds when a CSS selector changes but semantic signals remain
  stable.
- Coordinates are never used for production clicks.
- Runtime loads tour renderer lazily.
- Production runtime bundle never includes the authoring iframe, Lexical editor,
  or dashboard-only dependencies.
- No standalone WebSocket gateway is required for authoring.
- End-to-end flow completes in under 5 minutes for a simple 5-step tour.

## Assumptions

- The completed real/proxy creator evidence is accepted as the Phase 0 product
  sign-off record.
- Phase 1 should begin from the existing SDK-first monorepo, not by replacing the
  local SDK architecture.
- Raw participant-level usability notes should not be committed unless provided
  separately and intentionally anonymized.
- Phase 1 implementation should be delivered in small vertical slices that keep
  `pnpm verify` green.
