# 0016. Selector-free Target Identity V2

- Status: Accepted
- Date: 2026-08-07
- PRD references: §8.1–§8.6, §16.4, §18.2, §20
- Related: ADR 0008 (Phase 1 legacy resolver), ADR 0014 (immutable releases),
  ADR 0015 (SDK-first in-product authoring)

## Context

Phase 1 proved direct canvas selection and semantic resolution, but its
`ElementFingerprint` still permits a scoped CSS selector and one fixed scoring
model. A selector, an English label, or a saved rectangle can all become stale
when a customer changes frameworks, localization, responsive layout, wrappers,
or component state.

`Element.getBoundingClientRect()` is useful while observing the current render,
but its values are a viewport-relative snapshot. Scroll, zoom, responsive
layout, fonts, animation, banners, and DOM replacement can change it without
changing the creator's intended control. Persisting that rectangle as identity
or clicking its coordinates would therefore convert layout drift into a
potentially wrong production interaction.

The normal PMM path must remain one click and must not require a Lodariq-specific
attribute. At the same time, the runtime must be allowed to abstain when the
page no longer provides enough independent evidence of the approved intent.

## Decision

### Add a Versioned, Selector-Free Identity

New target capture writes `TargetIdentityV2` as an additive identity alongside
the readable Phase 1 fingerprint. V2 separates:

- intended element kind and required action;
- optional customer registry/configured-attribute contracts;
- semantic element attributes;
- ancestor and relationship context;
- locale-scoped text evidence;
- viewport/state-scoped normalized rendered topology;
- bounded structural, occupancy, appearance, and neighborhood hashes;
- an explicit semantic, visual-anchor, or layout-slot resolution mode;
- passive capture stability and uniqueness evidence; and
- author-only display copy, which never participates in resolution.

V2 does not author or persist a CSS selector, class list, raw style, URL, DOM or
HTML snapshot, screenshot, or absolute rectangle. The outer target ID and the
identity's target ID must agree.

The Phase 1 `ElementFingerprint.scopedCss` field remains readable only so
existing immutable documents and artifacts continue to work. The legacy
resolver may use it as a small ranking hint; it cannot clear the resolution
floor by itself. New V2 capture does not populate it. When a compiled target
contains V2 identity, the compiler also removes `scopedCss` and diagnostic
coordinates from its compatibility fingerprint; fingerprint-only Phase 1
targets retain the legacy reader path.

### Treat Rectangles as Normalized Rendered Topology

Authoring and runtime may call `getBoundingClientRect()` on the current live
candidate and its bounded visual context. Before any value enters V2 identity,
Lodariq converts it into coarse normalized evidence:

- target width and height relative to its visual container;
- target center relative to a meaningful semantic container when one exists;
- aspect ratio;
- container size relative to the viewport;
- bounded spatial relations to a container, viewport, or semantic peer.

Scrollable semantic containers include their live scroll offset and content
extent in the normalization. When no meaningful container exists,
viewport-relative center coordinates are omitted because scrolling would
change them. Only coarse shape evidence may remain available for ranking in
that fallback.

Topology is recorded as explicit viewport and optional application-state
variants. It is recomputed from the current render on every resolution attempt.
Raw page or viewport coordinates are not V2 identity, are not target-health
telemetry, and never select, click, focus, or otherwise trigger a production
interaction. While the additive Phase 1 fingerprint is still required for
compatibility, it may retain its diagnostic point for authoring overlays; V2
resolution does not score or consume that point.

Visual topology is an independent supporting family for semantic targets. It
cannot satisfy their durable-evidence requirement, clear a durable tie, or veto
an element that remains uniquely identified by sufficient durable evidence.
For a presentation-only visual mode it may be one member of a three-family
visual quorum; it is never sufficient alone and can never grant interaction
capability. Layout drift on an otherwise safe result is reported as
`resolved_with_drift` rather than silently selecting a different candidate.

The remaining visual families are one-way summaries: structural SimHash, an
8x8 descendant-occupancy mask, quantized appearance SimHash, and bounded
neighborhood SimHash. Optional sibling index/count evidence is used only by an
explicit `layout-slot` mode. These values exclude customer text, raw CSS, class
names, HTML, screenshots, URLs, and coordinates, and they ignore Lodariq-owned
chrome so mounting a tour cannot change a customer's target fingerprint.

### Separate Presentation Geometry from Identity

Once an element, semantic region, or presentation-only visual region has resolved safely, its freshly computed
rectangle may position a tooltip, step, spotlight, or hotspot. An anchor-only
target may be static content or a container; actionability is required only
when the authored behavior observes a click, focus, or input.

The normal one-click result uses the resolved element's entire live border box.
An exact point or sub-region inside a larger target is represented, when
needed, as ratios relative to that resolved element/container and stored in the
experience's presentation configuration—not in `TargetIdentityV2`. The runtime
resolves identity first and only then projects those ratios onto the current
live rectangle. If identity does not resolve, the virtual presentation anchor
does not exist and nothing renders.

Presentation geometry may draw and position Lodariq UI. It never creates a
candidate, clears ambiguity, increases target health, calls
`elementFromPoint()`, or becomes the source of a production interaction. Exact
area selection is progressively disclosed as direct manipulation rather than
a coordinate form.

### Require Independent Evidence and Allow Abstention

The V2 runtime resolves the identity afresh against the live page rather than
retaining a DOM node. It applies visibility, element-kind, required-action,
route, state, and lifecycle gates before accepting a result. Candidate scoring
counts independent evidence families rather than duplicate points from
correlated fields:

- registry contract;
- configured attribute;
- semantic attribute;
- element semantics;
- ancestor context;
- relationship context;
- visual topology;
- visual structure;
- visual appearance;
- visual neighborhood;
- optional layout slot; and
- locale-scoped text.

Semantic and interaction resolution requires at least two durable nonvisual
families, a confidence floor, one actionable winner, and a strict margin over
the runner-up. Visual evidence and localized text do not count toward that
durable minimum. Presentation-only `visual-anchor` and `layout-slot` modes
require `requiredAction: 'anchor'`, at least three independent visual families,
a confidence floor, and the same strict runner-up rule. They return a
non-interactive visual-region anchor. A locale's text is considered only for
that locale; English copy is not compared with German UI. Author-facing display
text is never resolver input.

The runtime returns `found`, `ambiguous`, `missing`, or `needs_review`. It fails
closed when the identity is weak, stable evidence drifts, required context is
unverified, or two candidates remain plausible. It never silently falls back
from a malformed V2 identity to a legacy selector and never chooses the first
match merely because one candidate must be returned.

### Keep One-Click Capture Honest

Selection normalizes a nested `svg`, icon, or text node to the meaningful
interactive or visual control. A usable selection attaches immediately and the
creator returns to content editing. A bounded passive probe samples stability
and uniqueness while the render settles, then sends one debounced semantic
evidence update. It does not click the customer's UI or stream pointer/mutation
events across the iframe bridge. Rectangle containment alone never promotes a
clicked presentation node to a generic wrapper.

The creator sees extra choices only when evidence is weak or ambiguous. The
primary UI reports factual states—**Verified**, **Drift detected**,
**Ambiguous**, **Missing**, or **Unverified**—instead of a synthetic health
percentage. Technical evidence remains progressively disclosed.

Required target contexts must pass the verification-aware authoring readiness
check before release. Runtime delivery fails closed and withholds the rendered
experience when a target is not safely resolved. Resolver diagnostics contain
only opaque IDs, bounded verdicts, evidence-family names, score/count buckets,
reason codes, locale/viewport context, and timestamps; they exclude customer
text, attributes, selectors, DOM fragments, screenshots, coordinates, and raw
URLs.

### Keep Pixel Verification Optional and Permissioned

Screenshot or pixel comparison is not required by the installed SDK's base
resolver. A later verifier may use an explicitly permissioned browser extension
or customer-approved browser automation to capture a redacted crop as an
additional tie-breaker or repair signal. It must not silently capture an
authenticated page, become the production interaction trigger, or make an
extension mandatory for normal authoring.

## Consequences

- Ordinary targets require no `data-lodariq-id`, CSS editing, or technical
  confirmation form. Customer-owned configured attributes and registry keys
  remain optional reliability contracts for otherwise indistinguishable UI.
- V2 survives many selector, wrapper, localization, node-replacement, and
  responsive changes while preserving the ability to report uncertainty.
- `getBoundingClientRect()` remains valuable, but only as freshly recomputed,
  normalized topology within a multi-family presentation quorum, or as live
  presentation geometry after resolution. Absolute geometry is never a durable
  target locator or interaction trigger.
- Existing Phase 1 artifacts remain readable. Their CSS hint is a contained
  compatibility liability, not a pattern for new capture.
- The product cannot promise perfect zero-code targeting across cross-origin
  frames, closed shadow roots, canvas/WebGL, unmounted virtualized content, or
  indistinguishable repeated controls. These cases fail closed or use an
  explicit optional customer contract.
- Verification observations are suitable for target-health and release gates,
  but persistence, environment-wide verification history, assisted repair
  proposals, and permissioned pixel verification remain later work.
