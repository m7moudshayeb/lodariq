# Element Target Reliability: Research and Recommended Architecture

- Status: Accepted by ADR 0016; code checkpoint implemented and verified
- Date: 2026-08-07
- Scope: target capture, runtime resolution, localization, health, verification,
  and repair
- Supersedes for V2: the fixed-score/new-capture parts of ADR 0008; Phase 1
  fingerprints remain readable compatibility

## Executive Decision

Lodariq should not require `data-lodariq-id`, and it should not claim that a
single selector or confidence score can survive arbitrary customer UI changes.

The accepted product is a **versioned target identity with evidence-backed
verification**:

1. Capture several independent identity signals from the selected element and
   its semantic context.
2. Observe which signals are actually stable instead of trusting a fixed global
   weight table.
3. Re-resolve the identity against the current page every time it is needed.
4. Require actionability, uniqueness, a confidence floor, and a meaningful
   margin over the runner-up.
5. Treat text and accessible names as locale-scoped supporting evidence, never
   durable identity.
6. Derive placement health from real verification and runtime observations, not
   from the fingerprint captured on day one.
7. Adapt automatically only when the approved identity still has enough
   independent evidence. When intent itself is uncertain, fail closed and
   create a reviewable repair proposal rather than silently rewriting a live
   artifact.

This gives PMMs a one-click normal path without pretending that arbitrary DOM
changes can always be inferred safely. `data-lodariq-id`, a target registry, or
another customer-owned stable attribute remains an optional escape hatch for
the small set of targets that are otherwise indistinguishable.

## What the Market Proves

The common commercial implementation is still selector capture plus manual
repair:

- Appcues stores CSS selectors, documents failures from generated React/Ember
  classes, and recommends a developer-owned stable attribute such as
  `data-appcues`. It warns that text targeting is appropriate only when the text
  is static for every user, including language. [Appcues element
  targeting](https://docs.appcues.com/flows/css-selectors) and [frontend
  preparation](https://docs.appcues.com/en_US/installation-overview/preparing-your-frontend-for-appcues-best-practices-for-targeting-elements)
- Pendo guide anchors are CSS rules. Its designer filters values that appear
  generated, encourages stable custom attributes, and warns against localized
  text matching. [Pendo guide CSS
  rules](https://support.pendo.io/hc/en-us/articles/28618614571547-Use-CSS-rules-for-guide-targeting)
  and [advanced feature
  tagging](https://support.pendo.io/hc/en-us/articles/360031950112-Advanced-Feature-tagging)
- Userpilot automatically generates a CSS selector, then exposes manual CSS,
  order, text, and an exclusion list when the automatic result is weak.
  [Userpilot element
  selection](https://docs.userpilot.com/in-app-engagement/flows/CE/select-element)
- Chameleon also stores CSS criteria and recommends `data-chmln` for dynamic
  applications. Some documented flows use the first match when several
  elements match, which is a failure mode Lodariq should explicitly avoid.
  [Chameleon element
  selection](https://help.chameleon.io/en/articles/1502544-selecting-the-right-element)

The most advanced vendors have moved toward multi-signal analysis:

- WalkMe describes DeepUI as automatic element recognition based on a detailed
  description of the element and its surroundings, with a separate Lexicon for
  host-application language changes. The mechanism and safety thresholds are
  proprietary. [WalkMe multi-language and
  Lexicon](https://support.walkme.com/knowledge-base/multi-language/)
- Whatfix's 2026 ScreenSense documentation describes asynchronous analysis of
  HTML structure, surrounding context, and cross-language meaning. Its beta
  Auto-heal compares authoring evidence with runtime DOM context and screenshots,
  applies only sufficiently confident repairs, masks PII, and admits that the
  first affected user may still see a failure. [Whatfix AI element
  detection](https://support.whatfix.com/docs/screensense-ai-powered-ed) and
  [Auto-heal](https://support.whatfix.com/docs/screensense-auto-heal)

The opportunity is therefore not a novel promise of perfect zero-code
selection. It is a safer, cheaper, and more transparent version of the
multi-signal workflow, without making PMMs debug CSS.

## What the Browser and Research Evidence Proves

### Resolver behavior

Playwright provides the strongest practical model for safe resolution:

- Prefer user-facing semantics or an explicit test contract over long CSS/XPath
  chains.
- Resolve a locator again before each action so a React re-render does not leave
  a stale node reference.
- Reject multiple matches rather than quietly choosing the first one.
- Check visibility, stability, enabled state, and event reception before an
  interaction.

See [Playwright locators](https://playwright.dev/docs/locators) and
[actionability](https://playwright.dev/docs/actionability).

The accessibility tree is useful evidence, but not a universal identity layer.
Computed names can come from visible content, labels, `aria-label`, `title`, or
`alt`, all of which may be localized. Accessibility node identifiers are also
session-scoped rather than durable across reloads. See the [W3C accessible-name
algorithm](https://www.w3.org/TR/accname-1.2/) and [Chrome accessibility tree
overview](https://developer.chrome.com/blog/full-accessibility-tree/).

### What `getBoundingClientRect()` proves—and does not prove

`Element.getBoundingClientRect()` is valuable because it reports the element's
current rendered border box. It can help Lodariq draw the authoring outline,
distinguish a candidate's position inside a meaningful container, and notice
material layout drift.

It is not a durable locator. The returned rectangle is relative to the current
viewport, includes scroll position effects, and changes with responsive layout,
zoom, fonts, animation, banners, container changes, and node replacement. MDN
explicitly notes that its boundary edges change when the viewport scrolls. See
[MDN `getBoundingClientRect()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect).

The safe use is therefore **normalized rendered topology**:

- width and height relative to a bounded visual container;
- center relative to a meaningful semantic container when one exists;
- aspect ratio;
- container size relative to the viewport;
- coarse spatial relations to the container, viewport, or a stable semantic
  peer.

Scrollable semantic containers include their live scroll offset and content
extent in normalization. If there is no meaningful semantic container,
viewport-relative center is not stable across scrolling and is omitted. The
remaining coarse shape can be diagnostic or ranking evidence only.

Lodariq records topology only as explicit viewport and optional application-
state variants, then recomputes it from the live render during resolution. For
semantic and interaction targets it remains supporting-only: it cannot satisfy
the durable minimum, clear a durable tie, or veto a uniquely resolved target.
For a presentation-only visual anchor it may be one member of a three-family
visual quorum, but it still cannot identify a target by itself or trigger a
production click/focus/input. Raw rectangle values and absolute coordinates do
not enter Target Identity V2 or normal telemetry. The
separately retained Phase 1 compatibility fingerprint may still carry its
diagnostic point for authoring overlays; V2 resolution does not score or consume
that point.

This does not prevent geometry from positioning the authored experience. Once
the owning target has resolved from durable identity, the renderer may use its
fresh live rectangle as a presentation anchor. Static content and containers
are valid for this `anchor` intent; actionability is required only for an
authored click/focus/input behavior. If an author needs an exact point or
sub-region inside a larger target, store that as bounded ratios relative to the
resolved element/container in presentation configuration, not as target
identity. Resolve first, project the ratios second, and never bind an
interaction to the virtual rectangle. The current implementation consumes this
contract for target-bearing Tour-tooltip positioning only; spotlight/hotspot
rendering remains future renderer work.

Pixels are a different capability boundary. Browser screen capture through
`getDisplayMedia()` requires a user permission flow; an extension can use
`captureVisibleTab()` only with its extension permission model; and Playwright
can capture screenshots in an explicitly controlled browser session. See [MDN
Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia),
[Chrome `captureVisibleTab`](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab),
and [Playwright screenshots](https://playwright.dev/docs/screenshots). A later
redacted pixel verifier can therefore be permissioned extension/automation
work, but it is neither silent SDK functionality nor a required base locator.

### Self-healing evidence

Research consistently favors several signals over one locator, but also shows
why Lodariq must be able to abstain:

- Similo compares multiple DOM, text, neighborhood, and geometry properties.
  A 2025 replication and extension reports 98.8% recovery on the subset with
  broken traditional locators in its short-interval benchmark, but the dataset
  is mostly static front pages and the paper documents false-positive cases.
  The original algorithm always returns a candidate, which is unsafe without a
  rejection threshold. [Comparative Similo
  study](https://arxiv.org/html/2505.16424)
- Visually overlapping node grouping helps treat an icon, nested text, and a
  button as one visible control, but cannot by itself identify the exact node
  for every interaction. [VON
  Similo](https://arxiv.org/abs/2301.03863)
- A multi-locator voting study improved over individual locator strategies, but
  still produced 66 wrong automated repairs in 914 repair actions. [Multi-
  Locators paper](https://sepl.dibris.unige.it/publications/2015-leotta-ICST.pdf)

The implication is precise: fuzzy matching is valuable for ranking and repair
suggestions, but a production resolver needs hard gates, a runner-up margin, and
an explicit `ambiguous` or `missing` result.

## Phase 1 Limitation and Current V2 Implementation

The Phase 1 `ElementFingerprint` and fixed-score resolver were a useful
prototype, not a reliable health system. They could duplicate correlated text
points, lacked confirmed locale/viewport/state variants, permitted a scoped CSS
hint, and treated capture confidence as if it described later runtime health.
Changing those weights would improve a benchmark without fixing the model.

The current working milestone implements the accepted V2 boundary:

- `packages/schema/src/target.ts` defines the closed selector-free identity,
  resolution modes, locale evidence, capture evidence, normalized topology,
  and bounded visual-fingerprint variants;
  `target-verification.ts` defines privacy-safe observations.
- New authoring capture leaves `scopedCss` absent, normalizes nested visual
  nodes, attaches usable captures immediately, and passively samples bounded
  stability/uniqueness. Phase 1 CSS remains readable only through the explicit
  legacy compatibility path. Compilation strips the legacy CSS hint and raw
  diagnostic point whenever a target has V2 identity.
- The V2 runtime enumerates live candidates without a selector locator and
  applies hard context/action/visibility gates. Semantic interactions require
  two durable nonvisual evidence families. Presentation-only visual anchors
  require at least three visual families and return a non-interactive region.
  Both paths enforce a strict runner-up margin and abstain on weak evidence.
- `getBoundingClientRect()` is captured/recomputed only as normalized topology.
  Container-relative position is enforced only with a meaningful semantic
  container; viewport-center drift is ignored. Visual structure, 8x8 occupancy,
  quantized appearance, and neighborhood shape are persisted only as bounded
  hashes. Raw CSS, text, HTML, screenshots, and coordinates are excluded.
- Authoring/runtime health uses factual verified, drift, ambiguous, missing,
  and unverified states; the runtime withholds an unsafe attachment instead of
  acting on the best available guess.
- Target-bearing Tour tooltips now support an optional normalized point/region
  outside V2 identity. Authoring resolves the owner before direct manipulation
  and again before commit; compilation validates and lifts the anchor beside the
  target binding; runtime projects it onto fresh owner geometry while keeping
  customer-page interaction attached only to the real resolved owner.
- The fixture host now has a target with no ID, class, `data-*`, Lodariq
  attribute, or target registry, plus nested content, EN/DE localization, full
  node replacement, responsive reflow, and a similar distractor.

The original Target Identity V2 code checkpoint passed the consolidated Node 24
repository gate on 2026-08-07: 42 unit-test files/415 tests and 59 browser tests
passed, with four planned browser skips; typecheck, lint, dependency boundaries,
migration safety, builds, bundle-size gates, CDN asset preparation, and the
security audit also passed. The subsequent exact-area Tour-tooltip additions
have focused schema/compiler/authoring/runtime/browser coverage, but their final
consolidated gate is pending bundle-size cleanup and is not yet claimed green.
Persisted artifact/environment verification history, target revisions, repair
proposals, an issue queue, and optional permissioned pixel verification remain
later work and must not be inferred from the V2 runtime implementation.

## Target Identity V2

The canonical object should separate durable identity, contextual evidence,
localized evidence, capture observations, and an author-facing label.

```ts
interface TargetIdentityV2 {
  schemaVersion: 2;
  targetId: string;

  intent: {
    elementKind: 'control' | 'field' | 'content' | 'container';
    requiredAction?: 'anchor' | 'observe-click' | 'focus' | 'input';
  };

  invariants: {
    registryKey?: string;
    configuredAttributes?: Record<string, string>;
    semanticAttributes?: Record<string, string>;
  };

  semantics: {
    tagName?: string;
    role?: string;
    inputType?: string;
    controlGroup?: string;
  };

  context: {
    routePatternId?: string;
    stateId?: string;
    ancestorRoles?: string[];
    relationships?: Array<{
      kind: 'inside' | 'labelled-by' | 'near-heading' | 'same-group';
      semanticRole?: string;
      stableKey?: string;
    }>;
  };

  visualTopologies?: Array<{
    viewportClass: 'mobile' | 'tablet' | 'desktop';
    stateId?: string;
    target: {
      widthRatio: number;
      heightRatio: number;
      aspectRatio: number;
      centerXRatio?: number;
      centerYRatio?: number;
    };
    container?: {
      widthRatio: number;
      heightRatio: number;
    };
    relations?: Array<{
      kind: 'inside' | 'left-of' | 'right-of' | 'above' | 'below' | 'aligned-x' | 'aligned-y';
      reference: 'container' | 'viewport' | 'semantic-peer';
      referenceKey?: string;
      distanceBucket?: 'near' | 'medium' | 'far';
      distanceRatio?: number;
    }>;
  }>;

  localizedEvidence: Array<{
    locale: string;
    accessibleName?: string;
    label?: string;
    placeholder?: string;
    title?: string;
    nearbyText?: string[];
  }>;

  captureEvidence: {
    sampleCount: number;
    stableSignalFamilies: string[];
    uniqueCandidateCount: number;
    runnerUpMargin: number;
    quality: 'strong' | 'usable' | 'weak';
  };

  display: {
    authorLabel: string;
  };
}
```

Contract rules:

- `display.authorLabel` never participates in resolution.
- Text evidence is considered only after BCP 47 locale matching, for example
  `de-DE` to a confirmed `de` variant. English text is never fuzzily compared
  with German text in the production runtime.
- Text cannot generate enough confidence to resolve a target by itself.
- Correlated evidence is counted once. A name derived from a label is one
  evidence family, not two independent votes.
- Incidental IDs and classes are not presumed stable. Explicitly configured
  customer attributes are stronger, while hash-like or mutating values are
  discarded.
- Raw HTML, full DOM snapshots, class lists, query-bearing URLs, screenshots,
  and diagnostic coordinates are not durable target identity.
- `getBoundingClientRect()` may help draw an authoring outline and may be
  converted into normalized topology, but raw rectangles/coordinates are never
  identity or normal telemetry and never trigger a production interaction.
- Visual evidence and localized text do not count toward the two-family durable
  minimum for semantic interactions. A presentation-only visual mode has a
  separate three-family quorum and can never authorize an interaction.
- One target may have approved locale, responsive, or application-state
  variants without duplicating the document per environment.

## One-Click Authoring Behavior

The normal creator flow remains one click:

1. The creator clicks the visible control they mean.
2. Lodariq normalizes nested `svg`, icon, and text nodes to the nearest meaningful
   interactive or visual control.
3. The target attaches immediately. The popup returns to content editing.
4. A passive background probe samples the target during render settling and
   subsequent DOM mutations. It does not force a reload, click the customer's
   UI, or block the creator on a technical form.
5. If the target is unique and several independent signal families remain
   stable, no configuration is shown.
6. If it is weak, Lodariq says what the creator can do in plain language:
   `This placement may be hard to find after this page changes`, with
   `Choose another` and `Verify another state`. Technical evidence remains under
   troubleshooting.

Additional visits, preview runs, locales, and viewport checks add evidence over
time. The first click should not pretend to prove every customer state.

## Runtime Resolution

The production runtime remains deterministic and lightweight; no LLM or image
model ships to customer pages.

1. Confirm the exact environment, route pattern, and required page state.
2. Wait for the bounded lifecycle condition and observe the smallest relevant
   subtree. Do not scan the full page on every mutation.
3. Generate visible candidates from element kind, strong attributes, semantic
   role/type, semantic relationships, and the applicable visual mode.
4. Normalize nested icon/text/SVG nodes through composed DOM ancestry to the
   exact actionable node required by the step.
5. Recompute size/aspect, semantic-container-relative position, container
   ratios, and bounded spatial relations for the current viewport/state variant. Raw
   `getBoundingClientRect()` values are never compared as a durable locator.
6. Score independent evidence families using per-target observed stability.
   Semantic interactions use the two-family durable nonvisual minimum. Visual
   anchors use a bounded topology shortlist followed by a three-family visual
   quorum; broad pools abstain before expensive hashing.
7. Apply localized text evidence only when the current locale has a confirmed
   variant.
8. Require exactly one visible/actionable candidate, a minimum confidence floor,
   and a meaningful margin over the runner-up.
9. Return one of `found`, `ambiguous`, `missing`, or `needs_review` with bounded
   reason codes.
10. Resolve again when the node is replaced; never keep a live DOM reference as
    durable state.

An approved multi-signal identity naturally survives many attribute, wrapper,
and layout changes. That is adaptive resolution, not a silent mutation. If the
only possible match requires guessing new intent, the runtime abstains.

## Health Must Be Evidence, Not a Score Badge

Placement health should be calculated from observations tied to the exact
artifact and context:

```ts
interface TargetVerificationObservation {
  targetId: string;
  artifactId: string;
  environmentId: string;
  routePatternId?: string;
  locale?: string;
  viewportClass?: 'mobile' | 'tablet' | 'desktop';
  result: 'found' | 'ambiguous' | 'missing' | 'needs_review';
  scoreBucket: 'high' | 'medium' | 'low';
  candidateCountBucket: 'zero' | 'one' | 'many';
  reasonCode: string;
  observedAt: string;
}
```

Do not send customer text, selectors, attributes, DOM fragments, screenshots,
coordinates, or raw URLs in normal telemetry.

Creator-facing states should be factual:

- `Verified on Staging · EN and DE · desktop · 2 hours ago`
- `Observed working in Production · 418 recent resolutions`
- `Drift detected · review before next release`
- `Ambiguous · two controls now look like this placement`
- `Missing · last seen before the latest product change`
- `Unverified · this locale or viewport has not been checked`

An authoring or staging verification runs in the creator's already authenticated
browser through the installed SDK. Lodariq does not need the customer's password
or a server-held browser session for the first version. The verification is
bound to the exact artifact hash, environment, route, locale, viewport, and
time. Production runtime observations then detect drift between explicit checks.

An optional later verifier may run ephemeral staging browsers with an explicit
customer-provided state recipe and consent. It should retain only verdicts and
reason codes by default; visual crops require masking and separate opt-in.

## Repair Without Silent Corruption

There are two different cases:

1. **Approved identity still matches.** The runtime may use the current element
   because independent evidence and safety gates still pass. Nothing is rewritten.
2. **Intent is uncertain.** A repeated high-ranking alternative becomes a repair
   proposal. It does not alter the live target, target history, or immutable
   artifact.

A repair proposal shows the creator:

- where the old placement was last verified;
- the proposed current element highlighted in the product;
- the independent evidence that agrees and the reason the old evidence drifted;
- affected experiences, locales, viewport classes, and environments;
- `Approve and publish` or `Choose another`.

Approval creates a new target revision and compiled artifact. Rollback remains
possible. Lodariq must never learn a new production target from one user's page
and silently apply it to everyone.

## Optional Reliability Contracts

The zero-required-code path comes first. Workspaces can then opt into stronger
contracts without adopting Lodariq-specific markup everywhere:

1. Configure existing attributes once, such as `data-testid`, `data-cy`,
   `data-qa`, or a product-owned semantic attribute.
2. Register a target through the SDK for a particularly dynamic component.
3. Add `data-lodariq-id` only as the final escape hatch.

These contracts are most valuable for repeated identical controls, canvases,
closed shadow roots, cross-origin frames, and virtualized elements that are not
mounted until customer-specific state exists.

## Honest Limits

No browser algorithm can infer intent safely in every zero-code case. Lodariq
must fail closed when:

- several visible controls are semantically and structurally indistinguishable;
- a target moved into a cross-origin iframe or closed shadow root the SDK cannot
  inspect;
- the UI is rendered only in canvas/WebGL without an accessible DOM mapping;
- a virtualized target is not mounted and no deterministic state recipe can
  reveal it;
- the customer removed or fundamentally repurposed the control;
- localized text is the only distinguishing evidence and that locale was never
  confirmed.

The credible promise is:

> No target attributes required for the normal flow. Lodariq adapts when the
> approved identity still agrees, detects uncertainty before it becomes a
> confidently wrong placement, and makes repair a one-click product workflow.

It is not "every target survives every product rewrite with no integration."

## Recommended Implementation Sequence

### Immediate Phase 2 contract

Implemented and consolidated-verified in the current working milestone:

1. `TargetIdentityV2`, legacy fingerprint compatibility, compiler preservation,
   and outer/identity ID validation.
2. Separate invariant, semantic, relational, normalized topology, localized,
   capture, and display evidence.
3. One-click nested-control normalization and immediate usable attachment.
4. Bounded passive authoring-time uniqueness/stability sampling with one
   debounced semantic bridge update.
5. Runtime locale from explicit SDK context or inherited `lang`, normalized for
   locale-scoped evidence and lifecycle text.
6. Independent evidence-family scoring, a two-family durable nonvisual minimum
   for interactions, a three-family quorum for presentation-only visual
   anchors, hard gates, a confidence floor, and strict runner-up margin.
7. Fresh resolution after node replacement, with lifecycle waits retained by
   the tour renderer.
8. Normalized `getBoundingClientRect()` topology for semantic-container-relative
   center, size, aspect, container ratios, and spatial relations; never raw
   coordinate identity or interaction.
9. Privacy-safe `found`, `ambiguous`, `missing`, and `needs_review`
   diagnostics/observation contracts.
10. Creator UI labels for **Verified**, **Drift detected**, **Ambiguous**,
    **Missing**, and **Unverified**, plus verification-aware local authoring
    readiness.
11. Anonymous informational-card recovery, duplicate-card abstention,
    interaction rejection, node-free health/calibration records, and focused
    schema/compiler/authoring/runtime acceptance cases.

Still required before the complete health/release system can be claimed:

1. Persist observations against the exact artifact, environment, route/state,
   locale, and viewport.
2. Enforce those persisted observations in the control-plane staging
   verification and production-promotion policy, not only local authoring
   readiness/runtime fail-closed behavior.
3. Show exact verification coverage/time and production observation history
   from persisted evidence.
4. Extend the maintained browser matrix with additional viewport/state variants
   and deployed-origin evidence as those Phase 2 capabilities land.

### Phase 2 follow-on

1. Add target revisions and assisted repair proposals.
2. Add confirmed locale, responsive, role, and A/B/state variants.
3. Add workspace configuration for existing stable attribute names.
4. Add a target issue queue grouped by root cause and affected release.
5. Build a fixture corpus with React replacement, localization, responsive
   duplication, dynamic IDs, portals, shadow DOM, A/B variants, and false-positive
   controls.

### Later reliability tier

1. Opt-in ephemeral staging verification with state recipes.
2. Explicitly permissioned, redacted screenshot/pixel or semantic analysis
   through an optional extension or customer-approved automation runner as a
   tie-breaker and repair assistant, never the normal SDK runtime locator or an
   interaction trigger.
3. Optional host-application translation dictionaries for targets that truly
   depend on text.
4. Optional SDK target registry for otherwise unobservable components.

## Acceptance Cases

- A target authored in English resolves in German when stable non-text evidence
  still identifies it; English text is not compared against German UI text.
- A text-only target becomes `needs_review` instead of selecting the wrong
  translated control.
- Clicking an icon or nested `span` attaches the containing button.
- New capture persists no scoped CSS selector. An old Phase 1 selector remains
  readable only through the legacy resolver; it is stripped from compiled V2
  delivery targets.
- A React re-render replaces the DOM node and the resolver finds the replacement
  from the identity recipe.
- Hash-like IDs and classes are downgraded after passive stability observation.
- A mobile and desktop copy of the same control resolves only the visible,
  actionable variant.
- Two equally plausible controls return `ambiguous`; neither first-match nor
  coordinates are used.
- Responsive reflow changes raw rectangles while the matching viewport/state
  topology is recomputed; topology alone cannot make the result `found`.
- An anonymous informational card can resolve from a visual quorum even when it
  has no stable attribute or actionable role; the result cannot receive a click
  listener.
- Two visually indistinguishable anonymous cards return `ambiguous` or
  `needs_review`; the resolver never returns the first DOM candidate.
- A route mismatch prevents resolution despite a high DOM similarity score.
- Normal telemetry contains no customer copy or DOM structure.
- A repair proposal cannot change a live artifact until an authorized creator
  approves and republishes it.
- The ordinary PMM flow succeeds without `data-lodariq-id` or a target registry.
