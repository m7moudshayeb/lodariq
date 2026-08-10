# Lodariq Documentation

This index keeps product direction, implemented reality, plans, and historical
exploration from contradicting one another.

## Source-of-Truth Order

When documents conflict, use this order:

1. [`refined-lodariq-prd.md`](../refined-lodariq-prd.md) — product behavior,
   architecture, roadmap, success evidence, and implementation guardrails.
2. [`docs/adr/`](adr/README.md) — accepted durable technical decisions.
3. The current phase plan — implementation slices, API/data changes, migrations,
   tests, and acceptance.
4. [`docs/plans/ux-revamp.md`](plans/ux-revamp.md) — creator interaction and
   state behavior.
5. [`docs/PROGRESS.md`](PROGRESS.md) — what the repository implements today.
6. Guides and deployment runbooks — operational instructions.
7. Product-design concepts and research — visual evidence and exploration, not
   normative behavior.
8. [`AGENTS.md`](../AGENTS.md) — short derivative guardrail memory only.

## Current Direction

- Product: PMM feature-launch and adoption workflow, not a collection of six
  unrelated builders.
- Creator surface: outcome-first and live-product-first; canonical JSON stays an
  internal typed contract.
- Entry: a developer installs the SDK once. Phase 2 Slice 1 now lets exact
  allowed development/staging origins expose a draggable launcher; signed-out
  creators use a first-party Lodariq popup and return to the same page. No
  extension, second creator snippet, other open Lodariq tab, or daily dashboard
  launch is required. Production remains closed.
- Interaction shell: local and hosted creator modes implement the canonical icon
  actions
  **New experience**, **Experiences on this page**, and **Preview as user** over
  the draggable, modeless popup/runtime overlay. New exposes only Tour and
  creates a distinct draft. Browse starts without draft creation, uses only the
  normalized pathname, supports page/workspace scope, search, release truth,
  empty state, and explicit open/start actions. Target selection collapses the
  popup so the host page remains fully selectable; Brand repair and release/
  history appear contextually only when implemented and applicable.
- Dashboard: initial installation, environment/origin policy, membership,
  governance, reporting, support, and fallback entry—not the normal builder. It
  manages one public installation and trusted origins; admins/owners mutate while
  other roles receive read-only inspect/copy controls, then creators use **Open
  your product** instead of preparing a daily authoring handoff.
- Visual system: **Editorial Air** is the current canonical direction: a
  light-first, release-led dashboard and restrained glass only for modeless
  creator chrome. The compatibility shell passes the consolidated local
  repository gate and current-view structural Design QA; generated logos and
  exact pixels remain illustrative.
- Styling: safe versioned Brand System and shared renderer recipes; no arbitrary
  CSS. Slice 2 implements persisted drafts, immutable approvals/defaults,
  document acknowledgement, impact, tokenized Tour rendering, and deterministic
  basic preflight. Slice 3 implements bounded Product Match with atomic
  draft/provenance persistence, immediate runtime preview, and exact browser
  verification. Slice 4 adds reviewed drift repair and acknowledgement.
- Targeting: selector-free Target Identity V2 for new capture, with one-click
  control normalization, independent durable evidence gates, and a
  presentation-only visual quorum for anonymous informational regions. Visual
  anchors combine normalized topology with privacy-safe structure, occupancy,
  appearance, and neighborhood hashes; they are explicitly non-interactive and
  fail closed on ambiguity. Phase 1 CSS is read-only legacy compatibility. A
  resolved target's fresh live rectangle positions the default whole-element
  anchor. Local authoring, compilation, and runtime now implement
  normalized exact point/region positioning for target-bearing Tour tooltips;
  the owning target resolves first and geometry never becomes a product
  interaction locator. The consolidated local gate now passes. Optional
  permissioned pixel verification remains later work.
- Release target: configure environments once, publish an immutable artifact to
  staging, verify it, promote the same artifact to production, and roll back by
  pointer. Slice 2 implements document-specific direct/hosted delivery, release
  state, and guarded staging publication with server-derived request hash,
  idempotency, expected-generation CAS, and explicit capabilities. Slice 3 adds
  exact browser verification and zero-recompile production promotion with
  configurable zero-or-one approval. Slice 4 adds guarded same-artifact rollback,
  unpublish, complete history, and environment-isolated analytics.
- Commercial score: 48/50 is an evidence-gated target, not a roadmap claim.
- Authentication: the active API/dashboard runtime and dependency graph are
  Clerk-free. Lodariq now owns password credentials, opaque database-backed
  sessions, first-party cookies, workspace selection, and membership-backed
  authorization. Recovery/set-password, the unified verification/reset outbox
  worker and Resend adapter, authoritative API/BFF capability gates, and the
  activation reset-then-retry UX are code-complete. The full local milestone
  gate passes. This is not a production cutover: the sole
  `0000_initial_baseline.sql` must be applied exactly once to an approved empty
  Neon database, then non-owner RLS validation, Resend domain/secrets,
  coordinated API/dashboard flag enablement, deployment, and live probes remain
  required. Public production signup and recovery stay disabled until those
  gates pass.
- Phase status: the Phase 2 code milestone is complete locally. The 2026-08-09
  full Node 24 `pnpm verify` gate passes with 126 Vitest files / 1,064 tests and
  77 Playwright tests with four intentional skips. First deployment, live RLS,
  deployed smoke/convergence evidence, the measurement-backed B4 ADR, production
  enablement, and external usability evidence remain unclaimed.

## Current Plan

- [`Phase 2 In-Product Authoring, Brand, and Release Foundation`](plans/phase-2-brand-and-release-foundation.md)
- [`Phase 2 Technical Completion`](plans/phase-2-technical-completion.md)
- [`Creator authoring and release UX`](plans/ux-revamp.md)
- [`Phase 2 usability validation`](plans/phase-2-brand-release-usability-test.md)

## Technical Decisions

- [`ADR 0013 — Safe Brand System`](adr/0013-safe-brand-system.md)
- [`ADR 0014 — Environment/document release pointers`](adr/0014-environment-document-release-pointers.md)
- [`ADR 0015 — SDK-first in-product authoring entry`](adr/0015-sdk-first-in-product-authoring-entry.md)
- [`ADR 0016 — Selector-free Target Identity V2`](adr/0016-target-identity-v2.md)
- [`ADR 0017 — Lodariq-owned authentication and workspace sessions`](adr/0017-lodariq-owned-authentication.md)
- [`ADR 0003 — Server-side publication compilation`](adr/0003-server-side-publication-compilation.md)
- [`ADR 0008 — Semantic target resolver`](adr/0008-resolver-strategy.md)

## Guides and Operations

- [`How to author and release`](guides/authoring-and-release.md)
- [`Phase 1 Fly deployment runbook`](deployment/phase-1-fly.md)
- [`Local SDK installation`](local-sdk-installation.md)
- [`Manual and external validation handoff`](handoffs/manual-and-external-validation.md)
  — isolated migration/RLS evidence, deployment operations, optional
  deliverability/SSO validation, paid-pilot/product-score evidence, and
  propagation/residency/legal work that repository code cannot prove.

## Evidence and Visual Exploration

- [`Element target reliability research`](research/element-target-reliability-2026-08-07.md)
  — accepted zero-required-code target identity, normalized rendered topology,
  evidence-backed health, localization, honest limits, and later assisted
  repair/pixel-verification boundaries. The original V2 code checkpoint passed
  consolidated Node 24 verification on 2026-08-07; the later exact-area
  Tour-tooltip additions are included in the passing Slice 1 consolidated local
  gate.
- [`Selected design-system direction`](product-design/design-system-exploration-2026-08-06/README.md)
  — Option 2, Editorial Air, is the current canonical visual direction. The
  current shell and Slice 1 interaction path are implemented; same-viewport
  visual alignment is not claimed until Design QA passes.
- [`Authoring concept set`](product-design/authoring-concepts-2026-08-06/README.md)
  — eleven visual cases and market evidence. Concepts 09 v2 and 11 v2 remain
  specialized Brand/release flow references; Editorial Air governs their shared
  shell and visual language.

## Historical Records

Completed Pre-Phase, Phase 0, and Phase 1 plans remain under `docs/plans/` as
completion evidence. Their dashboard-issued creator snippet and fixed-bar/dock
descriptions are labeled historical and do not override the Phase 2 hosted-entry
convergence. Superseded exploratory drafts live under `docs/archive/` and must
not be treated as current requirements.
