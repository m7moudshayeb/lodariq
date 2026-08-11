# Phase 1 Product Hardening Plan

Source of truth: `refined-lodariq-prd.md` sections 16.3 and 20.

Status: **Local implementation aligned through 2026-08-06; external deployment
evidence remains pending**. This document remains the plan and completion record
for the non-deployment Phase 1 product-hardening scope.

Historical boundary: this plan records what Phase 1 implemented. Current Brand
System and environment release behavior is specified by
`phase-2-brand-and-release-foundation.md`, ADR 0013, and ADR 0014. Do not read
Phase 1's environment-global publication scaffold as the final multi-document
promotion model.

The Phase 1 creator installer, dashboard-launched second creator snippet,
persistent full-width authoring bar, and fixed left dock are also historical
implementation evidence, not the current canonical shell. The planned hosted
convergence uses one permanent SDK install, a direct draggable launcher in
configured development/staging products, a first-party top-level auth popup
with an exact-origin single-use code exchange, short-lived activation grant,
and document-scoped session, followed by the same modeless popup and runtime
overlay. Its stable quick actions are `New`, `Experiences on this page`, and
`Preview`; repair and release actions appear contextually. The dashboard is
setup/admin/support only. Phase 2 Slice 1 owns this convergence, Phase 2 adds
contextual Brand/release behavior, and Phase 3 expands `New` into the broad
outcome/type chooser. None of that convergence is claimed as implemented by
this completion record.

## Summary

This plan closes the non-deployment Phase 1 gaps left after the foundation work.
The priority is the production authoring loop: hosted editor, semantic bridge
updates, creator-facing validation, target lifecycle configuration, and
reliability polish.

Lower-priority items cover authorization depth, observability hooks, content
safety tightening, and the publication artifact shape needed before object
storage rollout.

Deployment setup, CDN upload, live Fly/Clerk smoke tests, and object storage
rollout are explicitly out of scope for this plan.

## Guardrails

- Product name remains Lodariq, with `@lodariq/*` packages and canonical
  `*.lodariq.io` origins.
- The canonical document is structured block JSON, not Markdown.
- Do not add a Markdown-to-JSON compiler or custom Markdown grammar.
- Keep `@lodariq/sdk-runtime` and `@lodariq/sdk-authoring` physically separate.
- Keep Lexical imports limited to `packages/sdk-authoring/src/editor`.
- Do not ship authoring code in normal production runtime paths.
- Browser compilation remains preview-only; trusted publication artifacts
  compile server-side.
- The authoring iframe and hosted public demos must not be served from the
  authenticated dashboard origin.
- Bridge messages must use exact allowed origins, runtime validation, semantic
  batching, acknowledgement, timeout behavior, and message-size limits.
- Coordinates are diagnostic only and must never trigger production
  interactions.
- Do not allow arbitrary CSS, JavaScript, or raw HTML in canonical documents.
- Do not introduce Redis, dedicated log aggregation, a separate analytics vendor,
  or a WebSocket authoring transport for this phase.
- Use TypeBox/JSON Schema in `@lodariq/schema` as the canonical cross-system
  contract.

## Workstreams

### 1. Production Hosted Authoring

- Treat `apps/editor`, the creator installer, and API-backed load/save as the
  default Phase 1 authoring experience.
- Keep the current React local-frame/controller as the Phase 1 UI shell while
  documenting that Lexical owns editor serialization primitives, stable block
  IDs, paste handling, and editor-boundary APIs.
- Remove local-development assumptions from creator-facing copy, errors, and
  state labels in hosted authoring paths.
- Keep all editor primitives that import Lexical inside
  `packages/sdk-authoring/src/editor`.
- Preserve the hosted editor origin split from both the dashboard origin and
  customer application origins.

### 2. Semantic Preview Patches

- Prefer semantic operations for block insert, delete, move, duplicate, content
  update, action update, target attach/remove, and lifecycle-hint updates.
- Keep `replaceDocument` only for initial hydration, import/export restore, and
  explicit recovery fallback.
- Coalesce editor updates so preview remains responsive without sending
  keystroke-level bridge traffic.
- Preserve bridge schema validation, exact-origin checks, acknowledgement,
  timeout behavior, and message-size limits.
- Add regression coverage around semantic patch emission and fallback boundaries.

### 3. Bridge And Runtime Reliability

- Remove React `flushSync` lifecycle warnings from authoring tests.
- Ensure lifecycle-triggered preview updates do not emit React warnings.
- Keep bridge/runtime imports free of authoring-only code.
- Add focused tests for lifecycle-triggered updates, coalescing, and message
  acknowledgement behavior.

### 4. Publish Readiness UX

- Surface `validateTourPublishReadiness` results in the authoring frame and in
  dashboard publish/debug areas.
- Show blocking issues by step or block with actionable labels, including
  missing target, incomplete button action, unsafe URL, and unresolved lifecycle
  hint.
- Keep backend publish blocking as the source of truth.
- Avoid exposing raw internal JSON as the primary creator-facing validation
  experience.

### 5. Target Lifecycle Configuration

- Let creators configure supported runtime lifecycle hints through controls
  instead of JSON.
- Cover wait-for-text, open-panel, select-tab, scroll behavior, and target
  health/test actions in Phase 1 controls.
- Store lifecycle hints as canonical structured block or target props, not
  durable slash-command syntax.
- Ensure runtime playback resolves lifecycle hints semantically, with lifecycle
  waits, scroll handling, and failure diagnostics.

### 6. Authorization Depth

- Keep Clerk behind the existing auth boundary.
- Use database `users` and `workspace_memberships` as the authorization source
  for workspace access and roles.
- Preserve development-header auth only for local development and tests.
- Add API/database coverage for membership-backed workspace authorization and
  role gates.

### 7. Observability Wiring

- Standardize correlation IDs across authoring session, save, compile, publish,
  runtime playback, and SDK error events.
- Add structured spans/log events behind an internal observability interface.
- Keep the interface vendor-neutral so Phase 1 does not require Redis,
  ClickHouse, dedicated log aggregation, a standalone analytics vendor, or a new
  WebSocket gateway.

### 8. Content Safety

- Enforce the final Phase 1 URL policy for navigation and action URLs:
  `https:`, `mailto:`, relative same-app paths where safe, and explicitly
  approved app schemes.
- Keep arbitrary CSS, JavaScript, and raw HTML out of canonical documents.
- Defer full raw import/export sanitization pipelines unless a raw import path
  is introduced.
- Add schema/runtime tests for stricter URL policy behavior.

### 9. Publication Artifact Shape

- Keep server-side compilation and database-backed compiled artifacts for
  Phase 1.
- Add manifest and pointer metadata shape needed for later object storage.
- Do not require object upload, CDN integration, or live object-storage rollout
  in this plan.
- Preserve browser compilation as preview-only.

## Public Interfaces And Types

- Extend canonical schema only for explicit target lifecycle hint configuration
  and stricter safe URL validation.
- Extend bridge preview patch types only where semantic operations are missing.
- Add or formalize an internal observability interface for correlation IDs and
  structured events.
- Do not introduce Markdown parsing, Zod as the canonical contract, package
  collapse between runtime and authoring, raw HTML/CSS/JS document fields, or
  WebSocket authoring transport.

## Test Plan

Run the full verification suite under Node 24:

```bash
pnpm run typecheck
pnpm run lint
pnpm run boundaries
pnpm run migrations:check
pnpm run size
pnpm run test
pnpm run test:e2e
```

Add focused coverage for the hardening work:

- SDK authoring tests for semantic patch emission and `replaceDocument` fallback
  boundaries.
- Authoring UI tests for publish readiness issue display and target lifecycle
  controls.
- API/database tests for membership-backed workspace authorization.
- Schema/runtime tests for stricter URL policy and lifecycle hint playback.
- Regression coverage proving production runtime still excludes authoring,
  React, Lexical, and dashboard code.

## Acceptance Criteria

- Hosted authoring through `apps/editor` and API-backed load/save is the default
  documented Phase 1 path.
- Creator-facing hosted authoring copy no longer presents the flow as local-only
  development tooling.
- Preview updates use semantic patches for normal editing and reserve
  `replaceDocument` for hydration, restore, and recovery fallback.
- Lifecycle-triggered authoring updates do not emit React warnings.
- Publish readiness issues are visible in authoring and dashboard debug/publish
  surfaces with actionable labels.
- Creators can configure supported lifecycle hints through controls rather than
  JSON.
- Workspace authorization uses database membership and role records behind the
  auth boundary.
- Correlation IDs can be traced through authoring, save, compile, publish,
  playback, and SDK error paths.
- URL validation rejects unsafe navigation/action URLs according to the Phase 1
  policy.
- Publication artifacts include manifest/pointer metadata for later object
  storage without requiring object upload.
- Production runtime bundle checks continue to exclude authoring, React,
  Lexical, and dashboard code.

## Completion Record

Implemented scope:

- Hosted authoring is treated as the default Phase 1 creator path through
  `apps/editor`, creator installer wiring, and API-backed draft load/save.
  Environment-token creation, environment configuration, editor launch, and
  authoring-session creation do not publish as a side effect.
- Canonical document, block, target, trigger, and audience contracts are closed
  TypeBox schemas. Unknown keys are rejected at the shared contract boundary.
- Normal authoring edits now use semantic, batched preview patches; full
  document replacement is reserved for hydration, restore, and recovery paths.
- The iframe can request step or full-document preview semantically. Hosted and
  local authoring compile browser previews only and play them through the
  runtime renderer; publication compilation remains server-side.
- The creator shell is a reliable clickable workspace: a persistent authoring
  bar and left dock leave the customer product visible, a compact sequence rail
  selects the active step, and live preview follows semantic edits. This is the
  verified historical shell; it is superseded as a product target by the
  draggable, modeless hosted convergence described above.
- Draft changes autosave through a debounced, serialized queue. Save-and-exit
  waits for the iframe's latest semantic document, retains close intent through
  transient failures, retries bounded failures, and does not let an older save
  overwrite newer save state.
- Authoring reliability coverage includes lifecycle-driven update regression
  tests and no React `flushSync` warning output in the covered lifecycle path.
- Publish readiness issues are surfaced in authoring and dashboard surfaces with
  actionable labels while backend publish blocking remains the source of truth.
- Target lifecycle hints are configured through creator controls for text waits,
  scroll behavior, panel openers, tab selectors, and target health/test actions.
- Direct target repair reuses the canonical target identity and preserves its
  lifecycle hints while replacing the semantic fingerprint; resolver score is
  presented as diagnostic evidence rather than a production coordinate or
  misleading match percentage.
- Workspace authorization uses database user and membership records behind the
  existing auth boundary, with dev-header auth preserved for local/test paths.
- Vendor-neutral observability events and correlation IDs cover authoring
  session creation, save, compile, publish, runtime playback, and SDK errors.
- Phase 1 URL safety policy is centralized and tested for navigation/action
  URLs.
- Server-side compilation and DB-backed compiled artifacts now include the
  manifest/pointer metadata shape needed for later object storage.
- Production runtime bundle checks continue to exclude authoring, React,
  Lexical, and dashboard code.

Verification completed under Node 24:

```bash
pnpm run typecheck
pnpm run lint
pnpm run boundaries
pnpm run migrations:check
pnpm run size
pnpm run test
pnpm run test:e2e
```

Final observed results: unit/integration tests passed with 38 files and 350
tests; Playwright e2e passed with 55 tests and 2 planned browser skips. The full
Node 24 `pnpm verify` gate also passed build, bundle-size, SDK asset preparation,
and dependency-audit checks with 0 known vulnerabilities.

The 2026-08-06 alignment added focused schema, authoring-dock, autosave,
preview-request, target-repair, hosted-draft, compiler V2, and database
deployment-pointer coverage. Named package typechecks and focused Vitest suites
are green. The repository-wide `pnpm verify` integration gate for the combined
change set is green and recorded in `docs/PROGRESS.md`.

### Evidence still required

- Run the Phase 0 creator sessions and record first-glance comprehension,
  completion time, clicks, context switches, failed placement attempts, and
  styling assistance rather than treating local automation as usability proof.
- Run live Fly/Clerk/Neon/Cloudflare CDN smoke coverage for sign-in, active
  organization, dashboard launch, hosted iframe load/save, token/origin gates,
  immutable delivery, and production runtime packaging.
- The dashboard-launch smoke above remains useful for the historical path. It
  does not prove the planned Phase 2 Slice 1 one-install flow. That convergence
  still needs explicit coverage for launcher drag/pass-through behavior,
  first-party popup authentication, exact-origin single-use code exchange plus
  scoped activation/document session,
  same-overlay authoring, stable quick actions, and a dashboard-independent
  creator entry.
- Keep object-storage rollout and full document-specific SDK delivery/release
  UI in Phase 2; the local Phase 1 authoring alignment does not prove those
  external paths.

## Assumptions

- Phase 1 remains linear-tour only.
- Deployment, CDN, Fly, Clerk live smoke, and object-storage rollout were out of
  scope for the local implementation and remain external evidence gates.
- The current React authoring controller remains acceptable for Phase 1 if the
  Lexical boundary stays enforced and clearly owned.
- Server-side compilation remains the trusted publication path; browser
  compilation stays preview-only.
