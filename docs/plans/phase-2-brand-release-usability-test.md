# Phase 2 Authoring Entry, Brand, and Release Usability Test

Source of truth: `../../refined-lodariq-prd.md` §§5.1, 6.2.1, 7.3, 7.10,
11.3, and 18.2.

Status: **Planned evidence protocol**
Target participants: 8-12 Product Marketing creators from frequently shipping
B2B SaaS companies, including at least 5 who have used a competing in-product
guidance platform.

## Research Questions

1. Can a creator make a tooltip/tour look native without CSS or developer help?
2. Does `Match product` produce a trustworthy starting point without forcing
   theme configuration?
3. Can the creator understand inheritance, local overrides, and the impact of a
   shared change at first glance?
4. Can the creator distinguish draft, staging, verified staging, and production
   state without opening another dashboard?
5. Does exact-artifact promotion feel safer and simpler than independent
   publishing?
6. Are visual, target, and release blockers actionable without technical
   language?
7. Can a returning or signed-out creator discover and activate Lodariq from the
   staging product without a dashboard, extension, or second install?

## Setup

- Use one unfamiliar realistic SaaS fixture with staging and production origins.
- Preinstall Lodariq; installation time is measured separately.
- Configure a partial product Brand Theme so the participant encounters both
  automatic matching and one uncertain proposal.
- Seed one existing live tour and one moved/visually changed product target.
- Make staging v12 verified, production v11 live, and draft v13 contain a small
  copy/style change.
- Use the same task in one leading competitor for comparative participants.
- Record screen, clicks, route/surface changes, assistance, task time, errors,
  confidence, and final artifact IDs/hashes.

## Participant Tasks

### Task 0 — Enter and orient in the product

Prompt:

> You are on the staging version of this product. Open Lodariq, find the
> experience affecting this page, move the controls if they cover the product,
> and preview the page as a user.

Run half the participants with an active first-party Lodariq session and half
signed out. Include one recoverable popup-blocked or expired-code trial after
the normal path.

Success without facilitator help:

- Discovers and opens or restores the draggable launcher from the product page.
- If signed out, completes first-party Lodariq authentication and returns to the
  same page without entering credentials in the customer product.
- Understands **New experience**, **Experiences on this page**, and **Preview as
  user** at first glance.
- Opens the route-scoped existing experience and moves/minimizes the popup
  without losing state.
- Can select a product element previously covered by the popup because target
  mode collapses it.
- Does not visit the dashboard, install an extension, or install a second
  creator snippet.

### Task A — Create a brand-native tooltip

Prompt:

> Introduce the new export button to workspace admins. Make it look like it
> belongs in this product, preview it on desktop and mobile, and prepare it for
> staging.

Success without facilitator help:

- Chooses an appropriate outcome/type.
- Selects the product target.
- Writes content in place.
- Uses the approved theme or `Match product` without CSS.
- Understands any uncertain style proposal.
- Resolves critical contrast/overflow issues.
- Publishes to staging.

### Task B — Change a shared brand role

Prompt:

> Marketing has approved a new primary action color. Update the workspace brand
> and make sure existing experiences will not change unexpectedly.

Success:

- Distinguishes workspace theme from local override.
- Reviews affected experiences before approval.
- Understands that approval does not mutate live artifacts.
- Produces a new immutable theme version.

### Task C — Verify and promote

Prompt:

> QA has tested the staging experience. Confirm what will reach production and
> release it.

Success:

- Finds staging verification state without dashboard context switch.
- Understands the source/destination and meaningful diff.
- Identifies that production receives the exact tested artifact.
- Promotes with one action plus deliberate confirmation.
- Does not reconfigure audience, trigger, appearance, placement, or domains.

### Task D — Repair drift

Prompt:

> The product button moved and its styling changed. Make the live experience
> reliable again without rebuilding it.

Success:

- Distinguishes target drift from brand drift.
- Uses the focused repair action.
- Reviews proposed target/style changes.
- Publishes and verifies a new staging artifact before promotion.

### Task E — Roll back

Prompt:

> The latest production release has a bad CTA. Restore the previous verified
> release.

Success:

- Finds release history.
- Understands the before/after diff and target environment.
- Restores the previous artifact with one confirmation/reason.
- Understands history remains intact.

## Required Measurements

Per task:

- Time and deliberate actions from launcher discovery to session ready.
- Authentication prompt, popup-blocked/closed/expired recovery, and return-to-
  same-page success.
- Completion and critical error.
- Time to first useful preview.
- Total completion time.
- Clicks and configuration surfaces.
- Dashboard/editor context switches.
- Launcher moves/minimizes, accidental hover activations, inaccessible actions,
  and host-page clicks blocked outside visible popup bounds.
- CSS, developer, or facilitator help.
- Incorrect assumptions about what changes live content.
- Confidence rating from 1-7 before and after the critical action.
- Final document, theme, artifact, publication, and environment IDs/hashes.

Across participants:

- Median Brand Theme setup time.
- Percentage publishing without CSS/developer help.
- First-review design approval rate.
- Visual-preflight issue comprehension and repair rate.
- Staging publish, verification, promotion, and rollback completion/error rates.
- Promotion artifact/hash preservation.
- Drift false-positive and successful-repair rate.
- Comparative time/error ratio against the selected competitor.
- Recurring champion, economic buyer, shipping frequency, willingness to pay,
  and acquisition source.

## Phase 2 Product Gates

- Returning signed-in entry completes in one deliberate action with zero
  dashboard visits.
- Signed-out entry returns to the same page in no more than two Lodariq primary
  actions, excluding workspace-required identity-provider steps.
- All four stable launcher actions complete by mouse, touch, and keyboard;
  hover-only activation and host-page obstruction failures are zero.
- Median initial Brand Theme setup under 2 minutes.
- At least 80% publish without CSS or developer styling help.
- At least 80% pass design review on the first review.
- Ready draft to staging in one primary action.
- Verified staging to production in one action plus confirmation.
- Zero ordinary dashboard/editor context switches.
- Zero repeated content/theme/audience/trigger/placement configuration during
  promotion.
- 100% exact artifact ID/hash preservation across promotion.
- Rollback completion without recompilation or history loss.
- Comparative completion at least 2x faster on the combined style/release task.

Failing a gate changes the product or phase plan; it must not be explained away
by raising the strategic score.

## 48/50 Evidence Gate

Do not record the focused workflow as 48/50 until:

- At least three paid pilots have the same PMM champion and recurring economic
  buyer role.
- The workflow repeats weekly or for every product release.
- At least 40% of validated customers use two experience types under one launch.
- A measured acquisition channel produces paying customers with acceptable
  payback.
- Maintenance data shows renderer, browser, target, and brand drift remain
  bounded.
