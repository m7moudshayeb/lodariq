# Lodariq Authoring Concepts

Generated on 2026-08-06 as product-design direction, not an implementation
specification. The structured Lodariq block document remains the canonical
model; these concepts intentionally keep that implementation detail out of the
creator's mental model.

Current normative sources are the PRD, `docs/plans/ux-revamp.md`, and
`docs/plans/phase-2-brand-and-release-foundation.md`. The cross-surface visual
source of truth is now Option 2, **Editorial Air**, in
`../design-system-exploration-2026-08-06/README.md`. Concepts 09 v2 and 11 v2
remain the interaction/domain references for Brand System and exact-artifact
promotion, while their persistent top bars, docks, and overall styling are
historical rather than the implementation shell target.

## Interaction Contract

- The customer's live product is the primary workspace.
- A one-time SDK installation exposes the draggable launcher only on configured
  development/staging origins; first-party activation returns to the same page.
- The creator starts with an outcome, not a document type or block taxonomy.
- Content is edited directly where the experience renders.
- A sequence rail appears inside the draggable modeless popup only for genuinely
  multi-step experiences.
- Autosave, target health, lifecycle capture, placement, and safe styling defaults
  run automatically.
- The approved Brand Theme applies automatically. Slice 2 provides the manual
  five-essential draft/review/approval workflow; Slice 3 `Match product` will
  produce safe semantic proposals, not CSS.
- Audience and completion rules use short readable sentences and always show the
  explicit SDK or Lodariq-owned data source.
- Preview and production use the same runtime renderer and pinned theme
  snapshot in one perceived workspace.
- Compact popup chrome shows independent draft, staging, and production state;
  it does not occupy the product's full width or create a permanent dock.
- Staging verification binds to one immutable artifact; production promotion
  reuses that exact artifact without recompilation.
- Diagnostics, target fingerprints, lifecycle hints, and support details remain
  available only through progressive disclosure.

## Canonical Hosted Shell Supersession

The persistent full-width session bar and fixed dock depicted in the initial
concept/implementation comparison are historical exploration, not the current
hosted shell target. The canonical Phase 2 Slice 1 convergence uses one
permanent SDK install, a direct draggable launcher in configured development and
staging products, a first-party top-level auth popup with an exact-origin
single-use code exchange and scoped activation/document session, and the same
modeless authoring popup and runtime overlay. The stable quick actions are
`New`, `Experiences on this page`, and `Preview`; no browser extension or second
dashboard-installed creator snippet is part of the core workflow. The dashboard
is setup/admin/support only.

Phase 2 adds contextual Brand, repair, and release actions to this shell. The
basic `New` action belongs to the implemented and locally verified Slice 1
hosted convergence; Phase 3 expands it into the broad outcome/type chooser shown
by Concept 01. The concept set remains visual evidence rather than proof of code.

## Concept Set

1. [Outcome-first launcher](01-new-experience-launcher.png)
2. [Tour authoring](02-tour-authoring.png)
3. [Announcement authoring](03-announcement-authoring.png)
4. [Checklist authoring](04-checklist-authoring.png)
5. [Survey authoring](05-survey-authoring.png)
6. [Hotspot authoring](06-hotspot-authoring.png)
7. [Contextual knowledge authoring](07-knowledge-authoring.png)
8. [Audience and trigger](08-audience-trigger.png)
9. [Brand System presets and pinned version](09-brand-system-v2.png)
10. [Semantic target repair](10-target-repair.png)
11. [Verified exact-artifact promotion](11-exact-artifact-promotion-v2.png)

Archived first explorations:

- [Initial safe theme styling](09-theme-styling.png)
- [Initial publish readiness](11-publish-readiness.png)

## Implementation Mapping

| Concept                          | Current implementation status                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02 — Tour authoring              | Historical Phase 0/1 shell evidence: persistent session bar and fixed dock around a compact multi-step rail, authoring-only direct editing in the rendered tooltip, autosave, semantic preview requests, and runtime-backed live preview. Direct editing remains valid; the shell is superseded by the locally verified Phase 2 Slice 1 hosted convergence. |
| 10 — Semantic target repair      | Implemented for tours: direct repair from the step rail immediately proposes one clear resolver match, accepts it in one click, and preserves canonical target identity and lifecycle hints.                                                                                                                                                                |
| 09 v2 — Brand System             | Phase 2 Brand interaction/state reference. Slice 2 locally implements persisted drafts, immutable approval/default behavior, impact, acknowledgement, and tokenized Tour rendering; its gate/visual QA and Slice 3 product-match provenance remain open.                                                                                                    |
| 11 v2 — Exact-artifact promotion | Phase 2 release interaction/state reference. Slice 2 locally implements document-specific delivery, release state, deterministic preflight, and guarded staging publication. Exact browser verification, production approval/promotion, rollback/unpublish, and analytics isolation remain.                                                                 |
| 01 — Outcome-first launcher      | The stable Tour-only `New` quick action is implemented in Phase 2 Slice 1; the broad multi-outcome/type chooser shown here remains Phase 3 and is not current functionality.                                                                                                                                                                                |
| 08 — Audience and trigger        | Deferred to Phase 3; it remains an interaction direction, not a completed Phase 0/1 flow.                                                                                                                                                                                                                                                                   |

Concepts 03–07 remain later experience-type directions and must reuse the same
authoring, Brand, target, and release contracts rather than introducing separate
builders.

Historical content-authoring QA passed for concepts 02 and 10. It did not verify
the canonical one-install launcher/auth shell. Source/implementation comparisons are
stored in `docs/product-design/implementation-captures/`, with the full rubric
and accepted scope differences recorded in the repository-level
`design-qa.md` report.

## UX Design Targets

These are validation targets, not measured production results.

| Task                                                                  | Target                                      |
| --------------------------------------------------------------------- | ------------------------------------------- |
| Context switches after opening the creator                            | 0                                           |
| Required manual saves                                                 | 0                                           |
| Required theme configuration for a usable result                      | 0                                           |
| Workspace Brand Theme setup                                           | Under 2 minutes median                      |
| Experiences published without CSS/developer styling help              | At least 80%                                |
| Required target-health checks                                         | 0                                           |
| Required configuration surfaces for a default announcement or hotspot | 0                                           |
| New single-moment experience                                          | Choose outcome, click target, type, publish |
| Add a tour step                                                       | One target click, then type in place        |
| Repair a moved target                                                 | One confirmation when confidence is high    |
| Publish a ready experience to staging                                 | One primary action                          |
| Verify/open staging                                                   | One primary action                          |
| Promote the verified artifact to production                           | One action plus production confirmation     |
| Artifact/hash changes during promotion                                | 0                                           |
| Authoring/dashboard context switches during ordinary release          | 0                                           |
| Advanced or support controls visible by default                       | 0                                           |

## Prompt Set

All concepts used the built-in Image Gen workflow as production-quality desktop
SaaS UI mockups at a 1440 x 1024 target. The shared direction was: deep ink-green
Lodariq chrome, warm off-white customer-product canvas, restrained teal and
cobalt accents, Plus Jakarta Sans-like typography, generous whitespace, subtle
dividers, minimal shadow, no card grid, and no browser chrome. Each prompt kept
the live Atlas product dominant and prohibited document jargon, manual save,
selectors, coordinates, raw CSS, code, debug controls, and unnecessary settings.

That styling describes the historical concept set. Editorial Air now controls
the cross-surface visual system; these prompts remain useful only for their
case-specific content and interaction hierarchy.

Case-specific prompts focused respectively on: outcome selection; inline anchored
tour authoring; direct announcement composition; event-backed checklist
completion; a simple survey follow-up; click-and-type hotspot creation;
page-scoped contextual help; a sourced audience sentence; pinned Brand System
presets; one-click semantic repair; and verified exact-artifact promotion with
no recompile.

## Product Scorecard

Scale: 5 is strongest. The baseline combines competitor evidence with the local
implementation state. The Phase 2 estimate and 48/50 target are not achieved
scores; they remain gated by the evidence protocol in
`docs/plans/phase-2-brand-release-usability-test.md`.

| Criterion             | Broad platform | Focused tour/launch wedge |
| --------------------- | -------------: | ------------------------: |
| Proven demand         |            5.0 |                       5.0 |
| UX weakness           |            4.5 |                       4.5 |
| Build difficulty      |            2.5 |                       4.0 |
| Maintenance           |            2.5 |                       3.0 |
| Infrastructure        |            4.0 |                       4.5 |
| Competitive advantage |            4.0 |                       4.5 |
| Buyer clarity         |            3.0 |                       4.5 |
| Usage frequency       |            4.0 |                       4.0 |
| Expansion             |            4.5 |                       4.5 |
| Distribution          |            4.0 |                       4.0 |
| **Total**             |  **38.0 / 50** |             **42.5 / 50** |

| Scope                       | Baseline | Expected after Phase 2 implementation | Evidence-gated target |
| --------------------------- | -------: | ------------------------------------: | --------------------: |
| Broad architecture          |     38.0 |                                 41-42 |                  48.0 |
| Focused PMM launch workflow |     42.5 |                               45.5-46 |                  48.0 |

The target requires: no-CSS brand setup under two minutes; at least 80% first
design approval; comparative completion at least 2x faster; exact-hash
promotion; three paid pilots with the same PMM champion/buyer pattern; recurring
weekly/release usage; multi-type expansion under one launch; and a repeatable
paying acquisition channel.

The recommended initial buyer is a Product Marketing leader at a frequently
shipping B2B SaaS company. The first wedge is creating and maintaining reliable
in-product feature launches and short tours directly inside the product. Add
announcement, hotspot, checklist, survey, and contextual knowledge delivery only
after the shared creation and repair loop is validated.

## Evidence Links

- [Appcues pricing](https://www.appcues.com/spark-plan) and
  [flow workflow](https://docs.appcues.com/en_US/flows/create-a-flow), plus
  [its advanced/custom CSS warning](https://docs.appcues.com/styling-appcues-with-custom-css?kb_language=en_US)
- [Userpilot pricing](https://userpilot.com/pricing/)
- [Chameleon pricing](https://www.chameleon.io/plans) and
  [builder workflow](https://help.chameleon.io/en/articles/13846348-what-is-the-chameleon-builder-and-how-does-it-work),
  [styling](https://help.chameleon.io/en/articles/5883579-styling-overview), and
  [environment delivery](https://help.chameleon.io/en/articles/13892202-how-to-test-across-environments-staging-and-production)
- [Whatfix workflow](https://support.whatfix.com/docs/understanding-the-whatfix-workflow)
- [Whatfix styling/AI documentation](https://support.whatfix.com/docs/en/what-are-the-ai-features-powered-by-whatfix)
- [Pendo guide workflow](https://support.pendo.io/hc/en-us/articles/8146679315867-Creating-a-Guide)
- [Pendo theme maintenance](https://support.pendo.io/hc/en-us/articles/360032747071-Manage-guide-styling-with-themes)
  and [staging behavior](https://support.pendo.io/hc/en-us/articles/360032203991-Stage-your-guide)
- [Intercom Product Tours](https://www.intercom.com/help/en/articles/2900887-design-your-product-tour)
- [WalkMe acquisition](https://news.sap.com/2024/09/sap-completes-walkme-acquisition/)
- [Whatfix growth and financing](https://whatfix.com/newsroom/press-releases/whatfix-raises-125-million-series-e/)
- [Storylane pricing](https://www.storylane.io/plans),
  [Walnut pricing](https://www.walnut.io/pricing/), and
  [Supademo pricing](https://supademo.com/pricing)
