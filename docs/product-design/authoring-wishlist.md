# Lodariq — Authoring Wishlist

Status: ideas, unprioritised for delivery · Date: 2026-08-17
Companion to `authoring-ux-model.md` (the committed interaction model) and `plan-features.md` (what is
built and what is sold). **Nothing here is committed.** Effort is a rough order of magnitude, not an
estimate.

Sources are marked: **[S]** raised by Shayeb · **[R]** from the competitive research · **[N]** new here.

---

## 0. The one idea worth reading first

Three of the items below — **narration**, **auto-zoom**, and **auto-advance** — are individually nice.
Together they are a different product:

> **The same experience, authored once, plays two ways: as a guided tour for a real user, and as a
> self-playing narrated demo for a prospect — both running on the live product.**

Every interactive-demo tool on the market captures a _snapshot_ of the product, which starts rotting the
day it's taken. Storylane, Navattic, Supademo, Reprise, Walnut — all of them. It is the category's
defining weakness and their own docs concede the maintenance burden.

Lodariq runs on the real application. A narrated, zooming, auto-advancing experience on the live product
**cannot go stale**, and it reuses content the customer already wrote for onboarding. That is a second
market entered with no second product, and it is the strongest single idea on this list.

It also inverts the sales motion: the demo you send a prospect is the onboarding they get after they buy.

---

## 1. Canvas, motion and presentation

### 1.1 Spotlight backdrop — dim everything except the target **[S]**

Soft-masked overlay dimming the page, with the target and card cut out. Animated transition as the
spotlight travels between steps.

Intercom auto-dims and it is close to table stakes — but nobody does it _well_. Doing it well means: a
true soft mask rather than four rectangles, an eased travel between steps so the eye follows, configurable
click-through (does clicking the dimmed area dismiss, do nothing, or advance?), and a dimming level that
respects the customer's brand rather than defaulting to 50% black.

_Effort: small. Risk: low. Dependency: none._

### 1.2 Target styling, per step, on top of the theme **[S]**

The highlight ring is currently one look. Let it be styled: outline colour and weight, glow, pulse,
corner radius that follows the element's own radius, offset, and a per-step override on top of the theme
default.

The subtle version matters more than the loud one — a ring that inherits the target's actual border
radius reads as _part of the product_ rather than a box drawn on top of it.

_Effort: small. Risk: low. Dependency: theme token layer (exists)._

### 1.3 Zoom and pan to target **[S]**

Two separate features that share a name:

**Runtime zoom** — the viewport eases toward the target as the step opens. Essential when the target is
small, or on mobile, and it is what makes a narrated demo watchable. Arcade ships auto pan-and-zoom and
it is one of the most-praised things in their product.

**Authoring zoom** — zoom the canvas while authoring, Figma-style, to work on a 16px icon without
squinting. Cheaper and less visible, but the thing a creator asks for on day two.

Runtime zoom is the one with strategic weight (§0). Do it first.

_Effort: medium (runtime), small (authoring). Risk: medium — zoom on a live app fights the app's own
scroll and sticky positioning. Needs care with `position: fixed` headers._

### 1.4 Motion presets for step entry and exit **[N]**

A small closed set — fade, slide from the target, scale from the target — with reduced-motion honoured
automatically. Not a general animation editor; three good options beat thirty configurable ones.

_Effort: small. Risk: low._

---

## 2. The narrated demo (the §0 idea, broken out)

### 2.1 Narrated auto-play mode **[S]**

Narration plays, the viewport zooms to the target, the step advances when the audio ends. A play/pause
bar, a scrubber, and per-step timing offsets.

Narration model already exists in the codebase. Zoom is 1.3. Auto-advance is a runtime scheduler. The
three together are the product.

_Effort: medium. Risk: medium — audio autoplay policy in browsers requires a user gesture to start._

### 2.2 Shareable demo links **[N]**

Publish an experience as a public URL that plays on a sandboxed instance of the customer's app. Custom
branding, no Lodariq badge above Starter, view analytics.

This is the commercial half of §0 — without it, narrated auto-play is a nice onboarding mode rather than
a second market.

_Effort: large. Risk: high — needs an answer to "which instance does the prospect see," which is the same
problem Demostack solved with a backend proxy and Reprise solved with capture. **This is the hard part,
and it is worth scoping before committing to §0.**_

### 2.3 Voice-driven authoring **[N]**

The inverse: point at an element and dictate what the step should say. Transcribe, draft the step, keep
the audio as the narration script.

Genuinely faster than typing for long-form narration, and it makes the narration script the _first-class_
artifact rather than an afterthought — which §7.7 of the model doc argues it should be.

_Effort: medium. Risk: low._

---

## 3. Targeting — beyond what exists

### 3.1 Record-to-author **[R]**

The creator clicks through the flow once. Lodariq generates the step skeleton — targets captured,
approach recipes recorded, placement guessed, copy drafted from accessible names.

**This is the single biggest time-saver available**, and most of the machinery already exists: approach
recipes already observe navigation, and the targeting engine already captures semantically. What's
missing is the recorder and the step-generation pass.

Arcade's "Avery" does record → segment → script for video. Doing it for _live targets_ is more valuable,
because the output stays bound to the real product.

_Effort: medium-large. Risk: medium. Dependency: approach recipes (exist)._

### 3.2 Transient-state targets **[N]**

Target things that only exist in a state — a hover menu, an open modal, an empty state, an error state, a
loading skeleton.

Page-freeze already handles _authoring_ against transient UI. The missing half is the runtime: recreating
the state so the step can fire. Walnut makes creators toggle every interactive element on and off by
hand during capture; doing it semantically would be a straight win over the whole category.

_Effort: large. Risk: high — reproducing app state you don't control is genuinely hard, and failure is
invisible until a user hits it._

### 3.3 Data-relative targets **[N]**

"The row for the newest project" rather than "row 3." "The first item in this list." "The button inside
the card titled X."

Every real product is full of lists, and a target pinned to position breaks the moment the data changes —
which is far more often than the UI changes. This is a class of breakage the current model probably
doesn't cover, and it's invisible in testing because test data is static.

_Effort: medium. Risk: medium. **Worth investigating whether ADR-0016 already handles it** — if not, this
may be a bigger reliability gap than redesigns._

### 3.4 Multi-app journeys **[N]**

One experience spanning two applications — finish in the marketing site, continue in the product.

_Effort: large. Risk: medium. Dependency: the application model and cross-origin state._

---

## 4. Authoring speed

### 4.1 Storyboard view **[N]**

All steps as cards on one surface, editable inline, drag to reorder. The filmstrip shows _order_; a
storyboard shows _the whole story at once_ — which is how you notice that step 4 repeats step 2.

There's already `storyboard-canvas.ts` and `storyboard-shell.ts` in the styles directory, so some of this
may exist or have been started.

_Effort: medium. Risk: low._

### 4.2 Templates and starting points **[R]**

Start from a proven pattern — activation checklist, feature announcement, empty-state nudge, NPS at
milestone. Pendo ships saved layouts and it is one of the few things reviewers praise unprompted.

The strong version is **templates that target semantically on arrival**: pick "activation checklist," and
Lodariq proposes the targets by reading your app.

_Effort: small (templates), large (auto-targeting). Risk: low._

### 4.3 Side-by-side step editing **[N]**

Edit two or three cards at once to make voice and length consistent across a sequence. Copy tends to
drift when written one card at a time through a keyhole.

_Effort: medium. Risk: low._

### 4.4 Version diff **[N]**

See what changed between two releases — content, targets, styles, conditions — before promoting. Version
history exists; a readable diff on top of it is what makes review possible rather than ceremonial.

_Effort: medium. Risk: low. Dependency: version history (exists)._

---

## 5. Intelligence

### 5.1 Change-aware copy suggestions **[N]**

When drift is detected, don't just flag it — propose the fix: _"The button you referenced is now labelled
'Create workspace'. Update this step's text?"_

Drift detection already exists. This turns a warning into a one-click repair, and it is a genuinely good
use of AI: bounded, verifiable, obviously useful. **Nobody in the category does it.**

_Effort: small-medium. Risk: low. Dependency: drift detection (exists)._

### 5.2 Simulated user testing **[N]**

Run the experience with an agent instructed to behave like a confused first-time user. Report where it
hesitated, mis-clicked, or gave up.

Predictive QA already simulates _layout_. This simulates _comprehension_. It answers the question no
analytics can answer before launch: "is this actually followable?"

_Effort: large. Risk: high — easy to produce confident nonsense. Would need to be framed as a hint, never
a verdict._

### 5.3 Adaptive tours **[N]**

Skip steps the user has already demonstrated. If telemetry shows they've used the export feature twice,
don't explain export.

The most sophisticated idea here and the one most likely to produce a genuine outcome improvement — long
tours fail because they explain things people already know. Depends on adoption analytics (planned).

_Effort: large. Risk: medium. Dependency: adoption impact / success events._

### 5.4 Auto-localised media **[N]**

Screenshots and video swapped per locale, so a Japanese tour doesn't show English UI.

_Effort: medium. Risk: low._

---

## 6. Measurement

### 6.1 A/B testing **[S]**

Two variants of copy, placement, or style; automatic split; significance reporting. Already priced into
Growth in `plan-features.md` and currently **Planned, not built**.

_Effort: medium. Risk: low._

### 6.2 Guided-session replay — scoped **[S]**

Replay how a user moved through _your experience only_ — not their whole session. Where they paused,
where they went back, where they abandoned.

Per the earlier decision this is **metered as a published experience**, not given away as analytics, and
it is emphatically not full-app session replay (which stays permanently excluded at 91% → 48% margin).

_Effort: medium. Risk: medium — scope discipline is the whole game. The moment it captures anything
outside the experience it becomes the thing that breaks the business model._

### 6.3 Conditional content within a step **[N]**

Not branching between steps — varying content _inside_ one step. "Show this paragraph only to admins."

_Effort: medium. Risk: low._

---

## 7. Collaboration

### 7.1 Live cursors and selection **[N]**

Beyond presence: see where your colleague is pointing, in real time, on the page.

_Effort: medium. Risk: low. Dependency: presence (planned)._

### 7.2 Comment threads anchored to steps or targets **[N]**

Review happens in Slack today. Anchoring it to the step makes approval workflow real rather than
procedural.

_Effort: medium. Risk: low._

### 7.3 Figma token import **[N]**

Pull brand tokens from a Figma variables collection instead of sampling the page. Chameleon ships a Figma
integration but it is _reverse_ — a components file designers restyle, then values re-entered by hand.
Actual import would be better than what exists.

_Effort: medium. Risk: low._

---

## 8. If you only do five

Ranked by leverage per unit of effort, given what already exists in the codebase.

| #   | Feature                                                 | Why this one                                                        |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | **Record-to-author** (3.1)                              | Biggest time saving available; most of the machinery exists         |
| 2   | **Change-aware copy suggestions** (5.1)                 | Small effort, sits on existing drift detection, nobody has it       |
| 3   | **Spotlight + target styling + runtime zoom** (1.1–1.3) | Cheap, highly visible, and the prerequisite for §0                  |
| 4   | **A/B testing** (6.1)                                   | Already sold in the plan and not built — this is a debt, not a wish |
| 5   | **Narrated auto-play** (2.1)                            | Opens the second market, and narration already exists in code       |

**The one to scope before committing:** shareable demo links (2.2). It is what turns §0 from a feature
into a market, and it is also the only item on this list with a genuinely unsolved architectural question
— which instance of the customer's app does a prospect see? Answer that before building toward it.

**The one to investigate rather than build:** data-relative targets (3.3). If ADR-0016 doesn't already
cover list-position targeting, that is a live reliability gap affecting real customers today — and it
would outrank everything else on this page.
