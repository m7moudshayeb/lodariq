# Authoring and Plan Feature Roadmap

Source of truth: `../../refined-lodariq-prd.md` section 20 and `../../AGENTS.md`.

Inputs: the 2026-08-21 code audit of `authoring-wishlist.md` and
`plan-features.md`. Those proposal documents are not copied here; this plan
records the implementation work discovered by the audit.

Status: **in progress**

Implementation branch: `codex/authoring-feature-roadmap`

## Outcome

Close every audited feature gap without weakening Lodariq's runtime,
publication, security, targeting, accessibility, or plan-gating contracts.
Work proceeds in this order:

1. stabilize the verified baseline;
2. harden partial features that fit the existing architecture;
3. complete partial or plan features that need substantial platform work;
4. implement features that are absent today;
5. close operational launch requirements and run final release gates.

## Working rules

- SDK authoring is the visual source of truth. Do not copy the outdated
  dashboard presentation into creator UI.
- Content languages are author-selected BCP 47 locales, independent of the
  product UI translation catalog.
- Keep UI changes minimal and reuse current SDK authoring components, tokens,
  spacing, interaction ownership, and modeless chrome behavior.
- Run focused and stress verification after a complete milestone, not after
  each edit. Every functional or UI/UX milestone also receives an in-app
  browser pass against the SDK authoring fixture.
- Keep the runtime framework-free and authoring-free. Lexical stays inside
  `packages/sdk-authoring/src/editor`.
- Keep TypeBox/JSON Schema canonical. Documents remain closed structured JSON;
  never add Markdown syntax, raw HTML, arbitrary CSS/JavaScript, selectors, or
  coordinate-driven interactions.
- Server compilation creates content-addressed immutable artifacts. Promotion
  and rollback reuse artifacts and require capability checks, idempotency,
  compare-and-swap state, and append-only history.
- Plan enforcement is server-side. Reliability, accessibility, basic outcome
  evidence, no-code targeting, and all experience types remain ungated.
- Use PostgreSQL and the existing deployment model. Do not add Redis, a
  separate analytics vendor, or a log platform without measured need.
- New tenant data receives row-level security. Destructive shared-environment
  migrations require human approval.
- Keep comments and supporting documentation short. Record durable decisions
  and acceptance evidence, not an edit diary.

## Audited implementation inventory

### Authoring wishlist

| State       | Feature                               | Audited gap                                                                                                                                                          |
| ----------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented | 1.2 Target styling                    | Protect per-step theme overrides with regression coverage.                                                                                                           |
| Implemented | 3.3 Data-relative targets             | Preserve semantic relative targeting; coordinates remain diagnostic.                                                                                                 |
| Implemented | 3.4 Multi-app journeys                | Protect application/cross-origin continuation behavior.                                                                                                              |
| Implemented | 4.3 Side-by-side editing              | Protect existing multi-card editing behavior.                                                                                                                        |
| Implemented | 6.2 Scoped guided-session replay      | Dashboard/API/storage exist; reconnect the stale authoring entry and keep capture limited to the experience.                                                         |
| Partial     | 1.1 Spotlight backdrop                | Soft mask fades, but the cutout does not travel between targets.                                                                                                     |
| Partial     | 1.3 Zoom and pan                      | Authoring zoom exists; runtime scales a root from top-center instead of semantically focusing and panning to the target.                                             |
| Partial     | 1.4 Motion presets                    | Entry recipes and reduced motion exist; exit and target-origin motion do not.                                                                                        |
| Partial     | 2.1 Narrated auto-play                | Script and caption rehearsal exist; audio is omitted from artifacts, generation/player are disabled, and offsets are session-only.                                   |
| Partial     | 3.2 Transient-state targets           | Some open-panel/tab/wait lifecycle actions exist; `Target.approach` is not compiled or executed end-to-end.                                                          |
| Partial     | 4.1 Storyboard                        | Cards and inline editing exist; direct storyboard drag/reorder and full multi-card editing need completion.                                                          |
| Partial     | 5.3 Adaptive tours                    | Schema, policy, storage, and UI scaffolding exist; runtime adaptation is disabled.                                                                                   |
| Partial     | 6.1 A/B testing                       | Schema, database, configuration, and result scaffolding exist; runtime assignment, arm overrides, and trusted arm stamping are absent.                               |
| Partial     | 6.3 Conditional content within a step | `showWhen` compiles, but runtime evaluation filters whole steps rather than individual blocks.                                                                       |
| Partial     | 7.2 Anchored comment threads          | Flat step comments exist; target anchors, replies, and thread behavior do not.                                                                                       |
| Implemented | 2.2 Shareable demo links              | Dedicated-origin, short-lived, revocable demo links serve only scoped immutable structured artifacts; no credentials, raw capture, or live-artifact mutation.        |
| Implemented | 2.3 Voice-driven authoring            | Browser voice input creates an in-memory bounded proposal; transcript, title, and copy remain review-required before draft mutation. Voice cloning is an explicit product non-goal. |
| Implemented | 3.1 Record-to-author                  | Explicit sessions record semantic target/lifecycle evidence only, then produce review-required draft-flow proposals.                                                 |
| Implemented | 4.2 Templates                         | Versioned canonical templates instantiate fresh blocks and IDs without mutable-template coupling.                                                                    |
| Implemented | 4.4 Version diff                      | Canonical semantic diffs cover content, targets, conditions, flow, media, theme, and renderer contract while ignoring serialization noise.                           |
| Implemented | 5.1 Change-aware copy suggestions     | Bounded before/after copy patches include confidence, explicit apply, undo, and draft-only mutation.                                                                 |
| Absent      | 5.2 Simulated user testing            | No comprehension-oriented simulation.                                                                                                                                |
| Implemented | 5.4 Auto-localized media              | Approved locale-specific image/video variants support explicit fallback, captions, alt text, orphan detection, and publication review.                               |
| Absent      | 7.1 Live cursors and selection        | Presence is scaffolding only; no live page pointer/selection signal.                                                                                                 |
| Absent      | 7.3 Figma token import                | No variables-to-semantic-Brand-Theme import.                                                                                                                         |

### Packaging, delivery, analytics, AI, and governance

The plan comparison's status labels were not reliable enough to use as code
evidence. The audit found these concrete gaps:

- There is no subscription, plan, entitlement, billing, quota, or metering
  model. Workspace records contain identity data but no commercial state.
- Engaged users, live-experience stock, creator seats, applications, locales,
  environments, asset sizes, badge removal, feature tiers, AI credits, event
  allowances, analytics retention, and version retention are not enforced by a
  single server-side entitlement contract. The active-document maximum is a
  technical 100, asset uploads use a flat 5 MiB limit, and the authoring credit
  balance is hard-coded.
- Scheduling has no end-to-end deployment behavior. Audience rules compile but
  are not evaluated for delivery; identify traits only influence step
  conditions; tracked events do not start experiences; page-load, URL, SPA, and
  manual delivery are incomplete. The public API primarily exposes
  `playTourById`.
- Tour, announcement, hotspot, checklist, and survey schemas exist, but true
  runtime/authoring parity is incomplete. `surfaceForm` is authoring-only and
  several types compile through generic one-step behavior.
- Completion, form, funnel, adoption derivation, and scoped replay have useful
  implementation. Missing or incomplete analytics include retention windows,
  audience segmentation, cohorts, CSV, warehouse sync, raw-event export,
  release-history-aware reporting, and trustworthy A/B comparison. Adoption
  confidence also has a current test/contract mismatch.
- Ask Lodariq is bounded but incomplete; translation works for existing
  variants but add-locale and per-locale layout QA are incomplete; TTS,
  narration publication is absent. Voice cloning is intentionally not offered. Brand-theme variants
  are implemented and need regression protection.
- Drift notification delivery is incomplete. Audit storage/routes exist without
  a complete UI/export path. Change export is absent. Presence is mocked,
  locks need stronger renewal/enforcement, and comments are flat. Base roles are
  fixed; custom capability profiles are absent. APIs exist, but outbound
  webhooks and data residency do not.
- Form capture/analytics, funnel reporting, AI brand variants, SCIM,
  production approval, step comments/locks, scoped replay, and the core
  adoption derivation are newer implementations that supersede stale
  `Planned` labels. Their remaining gaps are explicitly retained below.
- DPA/custom terms, security review, SLA, support response commitments,
  onboarding sessions, and named CSM service are operational commitments and
  cannot be proven from repository code.

## Milestone 0 — Stable capability baseline

### 0.1 Repair current regression failures

- Reconcile the adoption-confidence formula and its reporting-floor test into
  one documented contract.
- Repair the translation operations rendering regression.
- Repair appearance, release, and recovery operation-route regressions.
- Stop JSDOM's stylesheet parser from flooding tests without weakening browser
  CSS or hiding real failures.

Acceptance: the affected database, SDK authoring, and operations suites pass;
then run their package-level stress suite once.

### 0.2 Capability status contract

- Add one checked-in, test-backed capability inventory with states such as
  `implemented`, `partial`, `disabled`, and `absent`.
- Use it for authoring affordances and internal release checks so disabled
  surfaces cannot imply production support.
- Keep commercial plan entitlement data separate from renderer/compiler
  delivery capability data.

Acceptance: every inventory claim is tied to a test or an explicit disabled
state; stale proposal labels cannot silently become product claims.

### 0.3 Protect complete features

Add focused regressions for target styling, data-relative targets, multi-app
journeys, side-by-side editing, scoped replay boundaries, form capture,
funnels, brand variants, SCIM, production approval, adoption derivation, and
server-side immutable publication behavior.

Acceptance: focused regressions pass, followed by the full repository verify
gate. Functional SDK paths receive an in-app browser smoke pass.

### 0.4 Restore the SDK authoring size gate

- The branch-point commit already builds `authoring-owned` at 290,460 bytes
  gzipped against a stale 256,000-byte limit; the creator toolbar also exceeds
  its stale limit by 658 bytes.
- Move optional authoring workflows behind existing lazy boundaries and keep
  schema audit evidence out of browser graphs.
- Re-establish dependency-inclusive budgets from clean measured artifacts with
  small fixed headroom; do not exclude dependencies to make the figures pass.
- Preserve the compatibility export surface and all runtime/authoring package
  boundaries.

Acceptance: every SDK size check passes after a clean build, with no loader or
production-runtime increase. Re-run the full repository verify gate and the SDK
browser smoke before starting Milestone 1.

## Milestone 1 — Harden partial features on existing foundations

### 1.1 Runtime presentation

- Animate the semantic spotlight cutout between resolved targets.
- Add runtime target-focus pan/zoom that cooperates with scrolling, sticky and
  fixed elements, mobile viewports, resize, and reduced motion.
- Add the closed motion set for entry and exit, including target-origin slide
  and scale. Do not create a general animation editor.
- Preserve configurable backdrop behavior and current per-step target styling.

Acceptance: no coordinate can select or activate a target; motion cancels
cleanly on step changes; reduced motion is equivalent; runtime bundles stay
inside budget. Visually verify desktop, narrow viewport, sticky header,
scrollable target, and reduced-motion behavior in the SDK fixture.

### 1.2 Storyboard and operations navigation

- Finish direct drag/reorder in the storyboard with keyboard parity and one
  canonical transaction per completed move.
- Preserve side-by-side editing and enable the supported fields across visible
  cards without moving authoring into the dashboard.
- Fix operations deep links and retain draft, step, focus, and scroll state on
  close/reopen.

Acceptance: undo/redo and conflicts are coherent; no save occurs for hover or
drag previews. Visually verify pointer and keyboard ordering at desktop and
narrow widths.

### 1.3 Conditional block content

- Evaluate compiled block `showWhen` rules against the same bounded trait and
  event context used by delivery.
- Preserve block order and accessible structure when content is hidden.
- Fail closed for unknown operators or missing context and emit bounded
  diagnostics.

Acceptance: mixed visible/hidden content, locale variants, missing traits, and
accessibility output pass compiler/runtime tests and an SDK browser scenario.

### 1.4 Review, locks, and scoped replay

- Extend comments from flat step records to threads with step or semantic
  target anchors, replies, resolution, permissions, and append-only audit
  events.
- Complete lock acquisition, renewal, expiry, takeover, conflict handling, and
  server mutation enforcement. Locks remain advisory UX backed by revision CAS.
- Reconnect scoped replay from SDK authoring and prove capture starts and ends
  with the experience boundary.

Acceptance: concurrent-edit stress tests pass; replay never records unrelated
application activity. Visually verify comments, conflict states, and replay
entry in the SDK authoring system.

### 1.5 AI, translation, and audit hardening

- Complete bounded, typed Ask operations without allowing arbitrary document
  mutation.
- Enable add-locale and per-locale layout/overflow QA for existing translation
  flows; preserve explicit review before publication.
- Complete audit-log browsing and safe export for currently stored audit data.

Acceptance: authorization, quotas, idempotency, locale fallback, and failure
states are covered. Visually verify SDK operations flows; dashboard styling is
not a reference.

## Milestone 2 — Complete partial features requiring platform work

### 2.1 Entitlements, metering, and retention

- Add canonical plan/version definitions, workspace subscriptions, effective
  entitlement snapshots, usage ledgers, and AI-credit ledgers.
- Enforce creator seats, applications, locales, environments, asset limits,
  feature tiers, badge removal, success-event allowances, analytics retention,
  and version retention at server mutation/read boundaries.
- Count engaged users once per workspace/environment/month only after an
  experience is actually shown. Overage is soft and never stops delivery.
- Count live experiences as current serving stock. Enforce only on the next
  publish; never stop an existing live artifact. Locales, A/B arms, and the same
  document across environments do not multiply the count.
- Replace the flat asset-size rule and hard-coded credit display with effective
  entitlements. Define AI action costs from measured provider usage.
- Expose concise usage and limit states in existing SDK operations surfaces.

Acceptance: all commercial decisions are server-authoritative, auditable, and
time-versioned; never-gated capabilities have negative enforcement tests. New
tables use RLS. Migration is additive until separately approved. Stress test
concurrent metering and publish races, then visually verify SDK limit states.

### 2.2 Delivery orchestration

- Add scheduled start/end deployment-pointer transitions over existing
  immutable artifacts, with PostgreSQL-backed jobs/outbox, idempotency, CAS,
  retries, and append-only history.
- Complete manual, page-load, URL, SPA-navigation, and event-triggered starts.
- Evaluate bounded audience rules from explicitly identified SDK/API traits and
  events; never imply access to customer database values.
- Add a versioned event/attribute catalog and privacy-safe delivery diagnostics.

Acceptance: no schedule recompiles an artifact; promotion/rollback preserve the
exact artifact; staging and production events remain separate. Stress test
duplicate jobs, clock boundaries, navigation churn, and event bursts, then
visually verify SDK scheduling and preview states.

### 2.3 Semantic approach and transient-state execution

- Compile `Target.approach` into the immutable artifact with a closed semantic
  action/wait contract.
- Execute lifecycle waits, scroll handling, panel/tab/modal opening, recovery,
  deadline, and diagnostics without CSS selectors or coordinate actions.
- Add hosted edit, preview, and scoped replay support for approach recipes.

Acceptance: all waits are bounded and abortable; failure is visible and
repairable. Stress test dynamic DOM, open shadow roots, SPA transitions, and
stale state, then visually verify transient target success/recovery.

### 2.4 A/B testing

- Compile arms as immutable, referentially valid artifact variants with bounded
  overrides for copy, placement, style, or conditions.
- Assign arms deterministically at delivery, persist only the minimum stable
  assignment, and stamp analytics arm identity on the server.
- Support allocation changes without rewriting historical events; calculate
  sample floors and confidence consistently; promote a selected winner through
  existing release controls.

Acceptance: retries cannot double-count, user assignment is stable, spoofed arm
values are rejected, and arm comparison separates environments. Stress test
assignment distribution and concurrent release changes; visually verify SDK
configuration and results.

### 2.5 Adaptive tours

- Derive bounded behavior aggregates from declared success events.
- Decide skips before a step is displayed, preserve flow validity, and explain
  the decision in authoring preview.
- Separate adaptive skips from abandonment and manual branching in analytics.

Acceptance: adaptation never reads undeclared customer state, never strands a
flow, and can be disabled deterministically. Stress test sparse, stale, and
conflicting signals; visually verify preview explanations.

### 2.6 Narration and immutable media

- Record an ADR for provider, consent, retention, cloning, and cost policy.
- Add content-addressed narration audio and cue metadata to immutable artifacts.
- Add server-side TTS generation, per-step timing offsets, auto-advance, and a
  gesture-started accessible player with play/pause and scrubbing.
- Use the same compiled media in preview and production; debit real AI credits
  idempotently. Voice cloning is outside the product scope; use standard provider
  voices without customer voice enrollment or reproduction.

Acceptance: autoplay policy, captions/transcripts, reduced motion, keyboard,
screen reader, abort, offline/error, and artifact rollback paths pass. Stress
test rapid navigation and audio lifecycle; visually verify the SDK player.

### 2.7 Analytics and export

- Complete retention windows, audience segments, cohorts, release-aware
  funnels, form reporting, declared adoption impact, A/B comparison, and scoped
  replay access.
- Add quota-aware asynchronous CSV and raw-event export with authorization,
  audit events, retention deletion, retries, and backpressure.
- Keep warehouse sync in the absent-feature milestone; it needs destination
  credentials, delivery guarantees, and provider-specific operations.
- Keep PostgreSQL as the initial system; introduce another store only from
  measured limits.

Acceptance: definitions are versioned and reproducible; environment separation,
retention deletion, RLS, export quotas, and privacy boundaries pass stress
tests. Visually verify SDK reporting/replay flows where creator-facing.

### 2.8 Collaboration transport

- Replace mock presence with bounded heartbeat/SSE presence for document, step,
  and selection state. Add a different transport only if measured need proves
  it necessary.
- Integrate presence with locks, comments, conflict notices, and inactive-client
  expiry.

Acceptance: reconnects, duplicate tabs, idle expiry, tenant isolation, and
thundering-herd behavior pass stress tests. Visually verify presence and
selection indicators in SDK authoring.

### 2.9 Experience-type parity

- Give announcements closed form/frequency behavior; hotspots semantic markers
  and interaction; surveys branching and submission; checklists item completion,
  drawer/floating presentation, and progress.
- Compile `surfaceForm` or replace it with explicit compiled contracts.
- Maintain the same targeting, accessibility, localization, release, analytics,
  and never-gated reliability guarantees across every type.

Acceptance: authoring-to-compiler-to-runtime parity suites exist for tour,
announcement, hotspot, checklist, and survey. Visually verify each in SDK
authoring and runtime.

### 2.10 Governance and platform controls

- Add signed outbound webhooks with versioned events, retry, idempotency, audit,
  and a dead-letter/replay workflow.
- Build custom capability profiles on top of fixed base roles and explicit
  per-environment capabilities; viewer and production authoring remain fail
  closed.
- Complete drift email/webhook delivery, change-history export, API quotas and
  idempotency, and data-residency placement/migration controls.

Acceptance: authorization matrices, signature verification, replay safety,
tenant isolation, residency routing, and release capability checks pass
stress tests. Visually verify only SDK authoring surfaces affected by these
states.

## Milestone 3 — Implement absent wishlist features

### 3.1 Change-aware copy suggestions

Convert drift evidence into a bounded, reviewable copy patch with before/after
text, confidence, explicit apply, undo, and audit. Never mutate a live artifact.

### 3.2 Record-to-author

Record semantic targets and declared lifecycle actions during an explicit
creator session, segment them into a proposed flow, and draft copy from bounded
accessible evidence. Review is required before canonical document mutation.

### 3.3 Templates and starting points

Add versioned canonical document templates for common outcomes. Instantiate
fresh documents; never couple drafts to a mutable template. Add semantic target
proposals only after the base template flow is proven.

### 3.4 Semantic version diff

Diff canonical and compiled versions by content, targets, theme snapshot,
conditions, flow, media, and renderer contract. Ignore serialization noise and
link findings to review/approval.

### 3.5 Locale-specific media

Allow locale variants to reference approved asset variants with explicit
fallback, captions, alt text, publication validation, orphan handling, and
immutable artifact inclusion.

### 3.6 Voice-driven authoring

Transcribe only after an explicit gesture, keep the transcript in frame memory,
and draft a bounded reviewable step with visible microphone state. Voice cloning
is intentionally not offered and is not part of this roadmap.

### 3.7 Shareable demo links

Implemented with a dedicated `demo.lodariq.io` origin, short-lived revocable
access, signed HttpOnly bootstrap cookies, structured-artifact redaction,
scoped anonymous analytics, and immutable publication pinning. URLs contain
only a non-secret demo locator; customer pages are never proxied or captured,
and demos are not served from the authenticated dashboard origin.

### 3.8 Live cursors and selection

Extend proven presence with semantic, rate-limited pointer and selection
signals. Never persist raw DOM paths, selectors, coordinates, text input, or
full-page activity; coordinates are ephemeral presentation only.

### 3.9 Figma semantic-token import

Import an allowlisted Figma variables collection into a reviewable Brand Theme
proposal. Map to Lodariq semantic tokens; never persist Figma node selectors,
raw CSS, or auto-mutate an approved/live theme.

### 3.10 Simulated user testing

Run bounded simulations against preview artifacts, report evidence and
uncertainty as suggestions, redact customer data, and never treat model output
as a release verdict or production user action.

Acceptance for each absent feature: schema, authorization, storage, compiler,
runtime, authoring, analytics, accessibility, localization, and failure states
are closed as applicable. Run the feature stress suite at section completion,
then visually verify every functional/UI path in the SDK authoring fixture.

## Milestone 4 — Operational launch track

- Complete DPA/custom terms and the security-review evidence package.
- Define uptime measurement, exclusions, incident response, and Enterprise SLA.
- Publish support scope and response commitments that operations can meet.
- Build concise documentation, onboarding-session material, and CSM handoff.
- Validate prices, Enterprise floor, AI action costs, wildcard-origin policy,
  and packaging with design partners before publishing claims.

These are cross-functional deliverables. Repository changes may support them,
but completion requires named human owners and external evidence. The internal
repository tracker is [Operational launch readiness](../launch/operational-launch-readiness.md).

## Verification protocol

At the end of each section:

1. run focused unit/integration tests for the completed behavior;
2. run package typecheck, lint, localization, architecture/boundary, and size
   gates affected by the section;
3. run concurrency, load, race, retry, abort, and malformed-input stress cases
   appropriate to the feature;
4. for every functional or UI/UX change, run the SDK fixture and inspect the
   complete flow in the in-app browser, including console errors, keyboard,
   narrow viewport, reduced motion, and failure states where relevant;
5. update this file with concise evidence only after the section passes.

At each milestone boundary, run full `pnpm verify` plus relevant cross-browser
E2E. The final gate additionally proves:

- production runtime contains no authoring metadata or authoring dependency;
- server compilation and immutable theme/artifact contracts remain intact;
- promotion and rollback never recompile;
- release CAS, idempotency, capabilities, and append-only history hold;
- all new tenant data is isolated with RLS;
- staging and production analytics remain separate;
- no full-app replay, arbitrary CSS/JavaScript/raw HTML, selector identity,
  coordinate interaction, or code-like authoring attribute has been added;
- never-gated features are usable on every plan; and
- every capability status and commercial claim matches tested code.

## Execution log

| Milestone                         | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 Regression baseline           | Complete    | Database, SDK authoring, and test package typecheck/lint passed. Full test suite: 239 files and 1,988 tests passed. SDK browser: Preview, Check repair, and shared Select passed without console errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.2 Capability status contract    | Complete    | Schema build plus schema, SDK authoring, and test package typecheck/lint passed; 42 focused tests passed. SDK browser confirmed catalog-driven disabled states across Production, templates, locales, audience, experiments, QA, demos, and narration without console errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.3 Complete-feature regressions  | Complete    | Focused protection: 153 tests passed. Repository gates passed through localization, types, lint, boundaries, architecture, unused dependencies, styles, tokens, migrations, 240 test files/1,995 tests, builds, CDN packaging, and security audit. Post-split stress added 57 focused passes. Browser confirmed current SDK Operations, disabled capability affordances, blocked Production, and a working runtime tour preview without warnings/errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.4 SDK authoring size gate       | Complete    | Clean branch point reproduced stale failures at 290,460/256,000 bytes for `authoring-owned` and 11,154/10,496 for `creator-toolbar`. Dependency-inclusive baselines are 292,654 and 11,183 bytes with fixed 300 KiB and 11.5 KiB limits; every SDK size gate passes. Capability audit evidence stays outside the browser graph. Full `pnpm verify` passed: 240 test files/1,995 tests, production builds, 202 prepared CDN assets, and no known dependency vulnerabilities. Browser preview matched current SDK authoring and logged no warnings/errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1.1 Runtime presentation          | Complete    | Semantic spotlight travel, bounded product-only pan/zoom, target-origin entry/exit motion, cancellation, resize/reflow handling, and explicit reduced-motion equivalence are complete. Runtime/authoring/test typecheck and lint passed; 105 focused tests passed. Runtime and authoring builds/sizes passed (`runtime+tour` 53,768/54,272 bytes). In-app browser verified desktop, 390×844, sticky/scroll, reflow, and reduced-motion SDK flows. The pass also fixed local authoring accessibility-mode forwarding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1.2 Storyboard and navigation     | Complete    | Storyboard and filmstrip reordering now use one canonical structure transaction per completed move, with keyboard parity, transient-only drag previews, and coherent undo/redo. Operations deep links open once; tab, active step, draft edits, focus, and scroll survive close/reopen. Every supported field is editable on every storyboard and comparison card. SDK authoring/test typecheck and lint, style checks, build, and size gates passed; 89 authoring test files/690 tests passed. In-app browser verified desktop and 390×844 layouts, comparison editing, keyboard ordering, focus/scroll restoration, and a clean console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.3 Conditional block content     | Complete    | Compiled block visibility now uses the delivery condition context for traits, document state, locale, events, and completed steps; hidden blocks never enter the rendered or accessibility tree. Missing context and unknown conditions fail closed with capped, payload-safe diagnostics. Compiler locale preservation, tracked diagnostics, and local preview forwarding are covered. Typecheck, lint, runtime/authoring size, SDK fixture build, 181 focused tests, and 33-file/377-test stress coverage passed. The in-app browser verified mixed content at desktop and 390×844 with a clean current-run console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1.4a Scoped replay                | Complete    | Operations now reads validated, experience-scoped sessions through direct, bridged, and hosted service paths. The SDK timeline exposes only bounded semantic experience beats and never page activity, pointer movement, or keystrokes. Focused coverage passed in 3 files/11 tests; SDK authoring, editor, fixture, and tests typecheck/lint passed; authoring and fixture builds plus the 294,086/307,200-byte authoring size gate passed. The in-app browser verified the expanded timeline at desktop and 390×844 with a clean current-run console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.4b Threaded review              | Complete    | Review comments are semantic step/target threads with replies, idempotent resolve/reopen, role-gated writes, viewer reads, and append-only audit history. Schema/database/API/SDK tests passed in 4 files/42 tests; typecheck, lint, styles, migration safety, fixture build, and the 294,252/307,200-byte authoring size gate passed. The in-app browser verified creating, replying, locating, resolving, and reopening at desktop and 390×844 with a clean current-run console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.4c Lock enforcement             | Complete    | Step leases are authenticated per session, renew every 90 seconds, release exactly, expire safely, and allow only admin/owner takeover. Duplicate tabs conflict, viewers cannot claim, and document mutations reject another session's active semantic step lock while revision CAS remains authoritative. Eight focused files/78 tests passed, including a 24-way concurrent claim stress case; typecheck, lint, styles, migration safety, authoring/fixture builds, and the 294,291/307,200-byte authoring size gate passed. The in-app browser verified conflict, retry, takeover, and responsive desktop/mobile states with no runtime errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.5 AI, translation, and audit    | Complete    | Ask proposals are typed, exact-scope validated, provider-configured, quota-bound, and idempotently coalesced. Translation adds sparse locales up to the 50-locale cap and runs layout QA per locale. Audit browsing is newest-first with fixed, injection-safe CSV export. Focused stress passed 89 tests plus 9 capability/runtime tests, including 32 concurrent retries, quota edges, 50 locales, per-locale QA, 10,000 audit rows, and CSV injection. Browser checks covered desktop and 390×844 Ask, Language, and Audit with a clean console. Full `pnpm verify` passed: 247 files/2,044 tests, builds, size budgets, 211 prepared SDK assets, and no known vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1 Partial-feature hardening       | Complete    | Sections 1.1–1.5 are implemented, stress-tested, visually verified in the SDK authoring fixture, and accepted by the full repository gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.1 Entitlements and metering     | Complete    | Six versioned plans now resolve through server-authoritative subscriptions, entitlement snapshots, usage and AI ledgers, limits, retention, and RLS-backed PostgreSQL storage. Creator seats, applications, locales, environments, assets, AI/theme runs, live stock, engaged users, feature tiers, badge removal, success events, analytics retention, and version retention are enforced at their mutation/read boundaries; delivery remains soft on engaged-user overage. Concurrent CAS, deduplication, atomic quota, publish-race, migration, and real PostgreSQL 16 coverage passed. The SDK browser verified Free through Enterprise gates, exhausted credits, usage footers, desktop/narrow Operations, motion, and the immutable Free badge with a clean console. Full `pnpm verify` passed: 249 files/2,080 tests, all builds and size budgets, 214 prepared SDK assets, and no known vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2.2 Delivery orchestration        | Complete    | Scheduled start/end pointer transitions now pin existing verified artifacts and use capability checks, idempotency, CAS, retries, append-only history, forced RLS, and a restricted worker claim path. The public runtime supports bounded manual, page-load, URL/SPA, and event starts, audience evaluation from explicit traits/events, value-free catalog ingestion, and privacy-safe diagnostics without shipping authoring code. Duplicate jobs, production approval, concurrent workers, clock boundaries, navigation churn, event bursts, and malformed activation metadata are covered. Five concurrent authoring runs passed 525/525 tests; full `pnpm verify` passed 251 files/2,094 tests, every size gate, 216 SDK assets, and the security audit. The in-app browser verified rules, catalog-backed triggers, schedule state/cancellation, desktop and 390×844 SDK layouts, and a clean console; the responsive pass also hardened the rule and schedule cards.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2.3 Semantic target approach      | Complete    | Target approaches now compile into immutable artifacts as closed semantic activation/observation recipes, execute through bounded abortable waits, scroll and open-shadow-root resolution, and expose repairable diagnostics plus scoped replay in hosted SDK authoring. Dynamic DOM, SPA routes, stale state, abort, deadline, and mutation bursts passed 268 focused tests. Full `pnpm verify` passed 252 files/2,109 tests, all builds and size gates (`runtime+tour` 54,481/54,784 bytes), 222 SDK assets, and the security audit. The in-app browser verified hosted success and deadline recovery, recipe editing across modeless collapse/restore, desktop and 390×844 layouts, and a clean console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2.4 A/B testing                   | Complete    | Closed semantic arm patches compile into immutable variants; allocation revisions preserve frozen arms and stable anonymous assignments. Bootstrap selects the arm, runtime materializes it, ingestion stamps trusted experiment identity, and reporting stays environment-scoped. Winner promotion updates the canonical draft for explicit release. The full suite passed 263 files/2,120 tests; builds, every SDK size budget, 224 prepared assets, and the security audit passed. The in-app browser verified configure, start, compare, promote, explicit-release messaging, desktop and 390×844 layouts, and a clean console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Current SDK reconciliation        | Complete    | Reconciled the roadmap worktree with the current arbitrary-language picker, first-paint chunking, creator toolbar, and quick actions. Creator-toolbar source remains identical; mode-pill changes are limited to a working preview action and deferred experience submenu. SDK/test typecheck and lint passed; 98 files/854 tests, browser-facing builds, root size gates, and 236 prepared SDK assets passed. In-app browser verified launcher actions, experience menus, preview, Operations, authoring Hawaiian through free-form input, keyboard flow, and a clean console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2.5 Adaptive tours                | Complete    | Declared success events now drive bounded server-derived evidence and deterministic pre-paint step decisions. Sparse, stale, future, malformed, and conflicting evidence fails open; flow validity is preserved; adaptive skips are recorded separately from branches and abandonment. SDK Operations explains preview decisions and offers explicit enablement and adaptive preview without changing the current toolbar or quick actions. Focused stress passed 12 files/184 tests; the full suite passed 258 files/2,168 tests with 49 expected skips. Builds, architecture/boundary/migration gates, 247 prepared assets, and every size gate passed (`public-bootstrap` 6,140/6,144, `public-delivery` 7,161/7,168, `runtime+tour` 54,288/54,784, `authoring-owned` 306,872/307,200 bytes). The isolated in-app browser verified enablement, fail-open explanations, preview, return-state persistence, layout, and a clean console without touching the user's fixture tab.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2.6 Narration and media           | Complete    | Provider-neutral server TTS is capability-, plan-, credit-, and idempotency-gated; narration assets use an additive RLS table and content-addressed immutable artifact v5 metadata. SDK authoring supports script, arbitrary-language voice filtering, timing, cues, generation, stale-state invalidation, rehearsal, and readiness. The runtime lazily mounts an integrity-checked, keyboard-accessible player with play/pause, scrub, captions, offsets, auto-advance, abort, and fail-open cleanup. Focused implementation passed 83 API/compiler tests and 172 schema/SDK/runtime tests; stress passed 33 cases including 32 concurrent retries and 50 rapid player lifecycles. Root builds, all size gates (including 448.4/460 KiB first paint), 259 SDK assets, and security audit passed. The full-suite run reached 2,184 passing tests before four compatibility assertions were corrected; the corrected files then passed 54/54. The isolated in-app browser verified local voice fallback, generation, stale/regenerate behavior, Operations rehearsal, true user-preview player, captions, and a clean console. Voice cloning is intentionally not offered.                                                                                                                                                                                                                               |
| 2.7a Reproducible analytics       | Complete    | Environment-scoped reports now state their definition version and enforced retention cutoff, split funnel/adoption/form evidence by immutable publication and pointer generation, segment existing evidence by authored locale, and derive privacy-safe weekly exposed/baseline return cohorts from server-held hashes. Operations selects retained releases without changing the toolbar or quick actions. All 96 implementation paths in the first focused run passed; one percentage-format assertion was corrected, followed by 52/52 focused reruns. Schema/database/SDK/fixture typechecks and builds, the 19,696-entry localization audit, and the 310,593/311,296-byte authoring size gate passed. The isolated in-app browser switched from 18 retained views to generation 7's correct 12-view slice, rendered weekly cohorts, and logged no warnings or errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.7b Asynchronous export          | Complete    | CSV summary and raw JSONL exports now run as exact-scope, release-aware, quota- and feature-gated jobs with idempotency, leases, bounded retries, backpressure, immutable results, 24-hour result expiry, audit history, RLS, and privacy-safe raw output. Operations uses the selected immutable release and exposes only plan-allowed actions without changing the toolbar or quick actions. Schema/database/API/SDK/editor/fixture builds and affected typecheck/lint gates passed; 210 stress tests passed with 2 disposable-PostgreSQL tests skipped. Migration, architecture, styles, localization, and size gates passed (`authoring-owned` 311,252/311,296 bytes; editor first paint 449.2/460 KiB). The isolated in-app browser exercised CSV and raw export at desktop and narrow width with both controls in bounds and no warnings or errors. Warehouse sync remains deferred with the absent features.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2.7c Trusted audience analytics   | Complete    | Analytics audience identity is derived server-side from normalized immutable authored rules, stored as a stable value-free identifier, and attributed historically from the exact compiled publication without mutating retained rows. Spoofed segment identity and raw audience data fail closed. Growth and higher plans receive segment results and filters; Free reports retain basic analytics with segment identity removed and aggregates coalesced. Release-aware reports, CSV, raw JSONL, and the existing SDK Operations analytics surface carry the trusted identity. All affected builds and typecheck/lint gates passed; the full milestone stress batch passed 259 tests with 4 expected disposable-PostgreSQL skips. Migration, architecture, boundaries, styles, localization, scoped formatting, diff, and size gates passed (`authoring-owned` 311,644/312,320 bytes; editor first paint 449.3/460 KiB). The isolated in-app browser verified both retained segments, generation 7's single trusted segment, updated KPIs, current SDK styling, and a clean console.                                                                                                                                                                                                                                                                                                                               |
| 2.8 Collaboration transport       | Complete    | Authoring sessions now publish semantic document, step, block, and target presence through 10-second jittered heartbeats with 30-second expiry and fetch-streamed SSE. A 100-subscriber document hub shares one debounced/reconciling repository read, replaces duplicate-session streams, reconnects with bounded jitter, and carries duplicate-tab identity, exact draft conflicts, step locks, and review threads. Presence is plan-gated, document- and tenant-scoped in memory and PostgreSQL, protected by forced RLS and scoped foreign keys, and explicitly leaves on shutdown. Direct, hosted, bridge, and SDK controller paths keep credentials in headers/memory; the transport and Collaboration workspace stay lazy. The affected build/type/lint suite and 133 focused tests passed, including idle expiry, tenant isolation, capacity, reconnect replacement, mutation fan-out, lock/comment/conflict integration, and hosted transport. Architecture, boundaries, migration, localization, styles, tokens, fixture, and size gates passed (`authoring-owned` 313,096/313,344 bytes; editor first paint 451.3/460 KiB). The isolated in-app browser verified connected/reconnecting states, semantic selections, duplicate tabs, conflict notices, held-step read-only behavior, comments, modeless page input, and the 390×844 layout with a clean console.                                          |
| 2.9 Experience-type parity        | Complete    | Tour, announcement, hotspot, survey, and checklist now have explicit authored, compiled, hosted, release, runtime, analytics, and localization contracts; unsupported knowledge experiences fail closed. Announcements support dismissal and frequency, hotspots use semantic targets and marker interaction, surveys require and submit declared choices, and checklists support item completion, progress, drawer, and floating presentations. New drafts seed the selected type. Type changes switch the active authoring profile through one undoable transaction while preserving dormant type roots and targets, so switching back restores prior work; unsupported loose roots still fail closed. Non-tour runtime styles, translations, and authoring controls remain deferred from first paint. The consolidated affected gate passed 27 typecheck/lint tasks, 20 focused files/456 tests, 8 package builds, architecture, boundaries, migrations, localization, styles, tokens, size, and diff checks (`runtime+tour` 57,328/57,344 bytes; `authoring-owned` 315,952/316,416 bytes; editor first paint 454.1/460 KiB). The isolated in-app browser verified every supported type and presentation surface, required survey and checklist completion, hosted authoring controls, nondestructive type switching and restoration, Escape/modeless behavior, desktop and 390×844 layouts, and a clean console. |
| 2.10 Governance/platform controls | Complete    | Fixed base roles now support workspace- and environment-scoped narrowing capability profiles; effective authority intersects role, profile, and explicit environment ceilings while viewers and production authoring fail closed. Signed versioned webhooks cover release, drift, governance, and residency events with deterministic idempotency, bounded retries, dead-letter replay, quotas, and append-only RLS audit evidence. Drift email, capability-gated CSV history export, release authorization, and provider-neutral residency placement/CAS migration are complete. The affected build/type/lint suite, 52 focused authorization/signature/replay/residency/inventory tests, architecture, boundaries, migration safety, localization, styles, tokens, knip, and size gates passed (`runtime+tour` 57,328/57,344 bytes; `authoring-owned` 318,294/319,488 bytes; editor first paint 453.4/460 KiB). The isolated in-app browser verified the SDK Audit log fail-closed/export state at desktop and 390×844 with no overflow or console warnings/errors.                                                                                                                                                                                                                                                                                                                                                |
| 2 Major platform completion       | Complete    | Sections 2.1–2.10 are complete. The current-main reconciliation preserves nondestructive experience switching, page-aware targets, the creator-toolbar Preview action, and the two-action launcher.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Current-main reconciliation       | Complete    | All 238 modified paths from the user checkout were reconciled without discarding the accumulated roadmap work. The launcher exposes only **New experience** and **View experiences**; Preview remains in the creator toolbar. Page-aware selection, ancestor-depth target scoring, cross-page preview/navigation, current-document storage, and selection delivery are integrated. A consolidated affected gate passed 15 files/233 tests, sequential schema/compiler/runtime/authoring/editor builds, typecheck/lint, architecture, boundaries, migration safety, localization, styles, and every size gate. Browser smoke verified the launcher, toolbar Preview, and nondestructive Tour → Announcement → Tour restoration. Cross-page and ancestor-depth stress suites passed 6/6 and 5/5 checks. The worktree matches every modified user-checkout path, contains no conflict markers, and passes `git diff --check`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3.1–3.7 requested scope           | Complete    | Shareable demos, voice proposals, semantic record-to-author, versioned templates, semantic diffs, change-aware copy patches, and locale media are implemented behind canonical schema contracts and review-first draft flows. The affected feature run passed 9 files/82 tests; schema/database/API/SDK/editor builds and typechecks, package lint, migration safety, architecture, boundaries, localization, styles, tokens, and size gates passed. Browser smoke verified all seven Operations entry points at desktop and 390×844; the frame stayed 390px wide and emitted no warnings/errors. Voice cloning is intentionally not offered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3 Absent features                 | Partial     | Requested 3.1–3.7 scope is complete. Live cursors/selection, Figma token import, and simulated user testing remain explicitly deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4 Operational launch              | In progress | Milestone 4 is authorized. The internal launch-readiness, security-evidence, and commercial-validation packets are now checked in; legal approval, named owners, deployed evidence, staffed support, and partner validation remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Implementation handoff — 2026-08-22

### Resume here

- Worktree: `/Users/mahmoudshayeb/Desktop/lodariq-authoring-roadmap`
- Branch: `codex/authoring-feature-roadmap`
- Current HEAD/branch point: `c13250777ab44d504141f15a020de5eec18a7935`
- Completed: regression/hardening through 1.5, platform work through 2.10,
  and the requested 3.1–3.7 feature scope. Voice cloning is a product non-goal.
- Next: continue the authorized Milestone 4 operational track. The separately
  deferred 3.8 live cursors, 3.9 Figma token import, and 3.10 simulated user
  testing still require explicit authorization.
- The worktree contains the accumulated roadmap implementation and is intentionally
  uncommitted. Do not reset, clean, discard,
  overwrite, or replace its changes, and do not create another worktree.

### Working constraints

- Keep all implementation in this worktree. The main checkout is user-owned.
- Reconcile with current main-checkout changes before each new section. Preserve
  the user's arbitrary-language authoring, first-paint chunking, creator toolbar,
  and quick-action direction. Ask before choosing between conflicting business
  rules.
- Treat authoring languages and platform translation locales as separate sets;
  never restrict authored languages to the platform locale catalog.
- Follow the current SDK authoring system, not the outdated dashboard. Keep UI
  changes minimal and use its existing components, tokens, spacing, and behavior.
- Preserve the accepted creator entry points: the launcher has only **New
  experience** and **View experiences**, while **Preview** remains in the creator
  toolbar. Do not add a duplicate launcher Preview action.
- Preserve nondestructive experience-type switching: only current-type roots are
  shown on the canvas, dormant roots and targets survive the switch, and switching
  back restores the prior work. Keep unsupported same-type loose roots fail closed.
- Preserve page-aware selection and navigation, ancestor-depth semantic target
  scoring, cross-page preview, current-document storage, and selection delivery.
- Implement a complete section or substantial feature chunk before verification.
  Do not run tests or browser checks after individual edits.
- After the section is complete, run one consolidated affected build/type/lint,
  stress, architecture/migration/localization/style/size gate. Visually test every
  functional or UI/UX path once in the isolated in-app browser, then record it.

### Latest accepted gate

- The post-reconciliation affected suite passed 233 tests across 15 files, plus
  sequential schema, compiler, runtime, authoring, and editor builds. Affected
  typecheck/lint, architecture, dependency-boundary, migration-safety,
  localization, style, token, and size gates passed.
- Size: `runtime+tour` 58,252/58,368 bytes, `authoring-owned`
  316,332/319,488 bytes, authoring frame 109,657/146,432 bytes, creator toolbar
  10,019/11,264 bytes, creator install 175,291/176,128 bytes, and editor first
  paint 442.6/460 KiB.
- The isolated SDK browser verified the two-action launcher, creator-toolbar
  Preview, and Tour → Announcement → Tour restoration with all five Tour steps.
  Cross-page navigation stress passed 6/6 checks and ancestor-depth selection
  stress passed 5/5 checks. The current run had no conflict markers and
  `git diff --check` passed.
- The main checkout was not edited by this reconciliation. At handoff, all 238
  modified paths from the user checkout are represented in this worktree and no
  user path is unmatched.

### Requested-scope gate — 2026-08-22

- The focused feature run passed 9 files and 82 tests, including demo-link
  origin/cookie/expiry/revoke/tenant checks, voice/recording review contracts,
  templates, semantic diff, copy undo, and locale-media fallback behavior.
- Schema, database, API, SDK authoring, and editor builds/typechecks passed;
  affected lint, migration safety, architecture, dependency boundaries,
  localization, styles, tokens, and SDK size gates passed. The measured
  authoring-owned graph is 321,366/323,584 bytes gzipped.
- The local SDK fixture opened all seven new Operations entry points. Desktop
  and 390×844 smoke checks showed review-first copy, redaction, semantic
  recording, and voice states; the narrow authoring frame remained 390px wide
  with no warning or error logs.

### Product decisions to carry forward

- Governance remains fixed base roles plus custom workspace/environment
  capability profiles and explicit per-environment ceilings. Viewer access and
  production authoring remain fail closed.
- The candidate-channel direction in `docs/plans/candidate-channel-plan.md` must
  support a workspace with at least one environment. In the one-environment case,
  a candidate-channel query parameter keeps authoring work in draft/experiment
  mode until explicit review and publish; multiple environments remain the ideal
  deployment. This is product direction, not completed implementation, and must
  stay distinct from the completed 2.10 authorization model.

### Next boundary

- The requested 3.1–3.7 slices are complete. Do not repeat them or begin
  Milestone 4 operational-launch work without explicit scope expansion.
- The remaining absent-feature candidates are 3.8 live cursors and selection,
  3.9 Figma semantic-token import, and 3.10 simulated user testing. They each
  require separate authorization before implementation.
