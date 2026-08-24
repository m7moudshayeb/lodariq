# Shareable Interactive Demo Recording

Status: **proposed product and architecture correction**

Date: 2026-08-24

Related decisions: `../adr/0028-shareable-demo-links.md`,
`../adr/0003-server-side-publication-compilation.md`, and
`../adr/0006-origin-model.md`.

This plan does not amend an ADR by itself. Before implementation, ADR 0028 and
the capability inventory must be changed explicitly.

## Product correction

The current shareable-demo implementation is not an interactive product demo.
It creates a targetless projection of a compiled Lodariq experience and renders
the experience copy in a public shell without the customer's product UI. That
output is a structured presentation, not a product demo, and must not be
marketed as one.

The replacement feature records the customer's product workflow first,
independently of any tour. It produces a safe interactive HTML simulation of
the recorded paths. A Lodariq tour may be created from, or attached to, the
recording afterward as an optional guidance layer.

The public demo must let a prospect see the customer's real captured product
UI, scroll it, interact with reconstructed controls, and advance through the
actual states produced during recording. It must not degrade into cards over a
blank page, a video, or a sequence of screenshot swaps.

## Outcome

A creator can:

1. start a demo recording on an explicitly authorized staging or scrubbed demo
   origin;
2. use the product normally without defining a tour first;
3. stop recording and receive an editable interaction flow;
4. remove mistakes, redact data, edit safe presentation content, and add or
   record branches;
5. optionally create a tour from the recording or attach an existing tour;
6. review an immutable, sanitized public derivative; and
7. issue a revocable link on `https://demo.lodariq.io`.

A recipient can:

- view reconstructed product UI rather than Lodariq-only content;
- scroll and use safe simulated inputs;
- click captured product controls to follow recorded transitions;
- choose among explicitly authored branches;
- receive optional tour cards, narration, captions, and hotspots; and
- generate bounded, anonymous demo analytics without contacting the customer
  application.

## Honest product boundary

The default feature is a recorded HTML demo. It supports the paths and branches
that the creator captured. It does not execute the customer's application code,
contact the customer's backend, or make every unrecorded product action work.

An unrestricted demo of the real application is a separate future mode:

- **Recorded HTML demo:** safe, editable, scalable, and suitable for public
  sharing. This plan covers this mode.
- **Live sandbox demo:** a real customer application running against an
  isolated, seeded demo tenant. This requires customer provisioning,
  authentication integration, and a separate security design. It is not a
  hidden extension of recorded playback.

The product must state this distinction plainly. Recorded HTML must never be
described as a complete live copy of an arbitrary backend.

## Architecture

### 1. Capture substrate

Load a mature DOM record/replay implementation such as `@rrweb/record` only
after an authenticated creator explicitly starts recording. The recorder runs
in the customer page's authoring module and captures:

- an initial serialized DOM and style state;
- DOM and stylesheet mutations;
- scroll positions;
- safe input-state changes;
- selection and hover-relevant events;
- viewport changes;
- Shadow DOM and adopted stylesheets where supported; and
- SPA route and page-state boundaries.

The recorder is authoring-only. It must not enter `@lodariq/sdk-runtime`, the
permanently installed production runtime, or normal delivery bundles.

Use Lodariq's existing semantic observation and record-to-author work alongside
the DOM event stream. The DOM recorder supplies visual state; Lodariq supplies
meaning, lifecycle boundaries, target evidence, and the editable flow model.

Do not fork and maintain a general-purpose DOM recorder until a measured gap in
the selected substrate requires a narrow adapter or patch.

### 2. Interaction checkpoints and transitions

A raw session replay is linear and passive. Lodariq must compile it into an
interactive state graph.

For each meaningful creator action:

1. record the stable state immediately before the action;
2. identify the acted-on node and semantic evidence;
3. record the action type without persisting secret values;
4. wait for the resulting route, lifecycle, and DOM activity to settle;
5. record the resulting stable checkpoint; and
6. create a transition from the prior checkpoint to the new checkpoint.

During public playback, the replayer pauses at a checkpoint. A recipient click
on the expected reconstructed node applies the recorded mutation/event slice
and transition effects leading to the next checkpoint, then pauses again.

The initial release may require an explicit creator confirmation when a
meaningful action boundary is ambiguous. It must not silently infer destructive
or security-sensitive actions.

### 3. Recording-first domain model

The demo is independent of a tour:

```text
Demo project
  -> private recording session(s)
  -> sanitized immutable demo revision
       -> page/checkpoint graph
       -> transition graph
       -> captured assets
       -> optional tour-revision binding
  -> revocable share link(s)
```

The canonical Lodariq document remains structured block JSON. Recorded DOM is a
separate, explicitly opted-in demo artifact and must never be inserted as raw
HTML into a Lodariq document.

Use TypeBox/JSON Schema for all cross-system demo contracts. New tenant tables
must use row-level security. Likely durable records include:

- demo projects;
- recording sessions and their state;
- immutable demo revisions and content hashes;
- checkpoint and transition metadata;
- optional tour bindings;
- share links and revocation state; and
- bounded analytics attribution.

Large snapshots, event chunks, styles, fonts, and media belong in the
workspace's jurisdiction-matched R2 storage. PostgreSQL stores metadata,
content hashes, state, ownership, and release history. Do not store recording
blobs or base64 capture assets in Neon JSON/text columns.

### 4. Tour attachment

A tour is optional and may be attached before or after the demo is recorded.

Do not match a tour step to a recorded element by position alone. Bindings use:

```text
demo revision
+ checkpoint id
+ captured node id
+ semantic fingerprint
+ role and accessible name
+ ancestor/page context
+ geometry for placement and final tie-breaking only
```

When an existing tour is attached, Lodariq searches all relevant checkpoints
using the normal semantic evidence and proposes matches. The creator confirms
or corrects every ambiguous match.

When no tour exists, the creator may click an element in the recorded demo to
create a new step. The recording can also remain self-guided, using only
interaction hints and transitions.

Geometry may position Lodariq-owned overlays inside an immutable recorded
artifact. It must never authorize or trigger an interaction in the customer's
live application.

### 5. Public playback

Serve the player only from `demo.lodariq.io`. Rebuild the sanitized derivative
inside a sandboxed iframe with customer scripts disabled. The outer player
owns navigation, progress, optional guide chrome, accessibility, analytics,
and share-session authorization.

The player must:

- pause at interaction checkpoints;
- resolve the expected captured node by immutable recording identity;
- permit bounded scrolling, focus, and safe local input behavior;
- intercept captured transitions without allowing arbitrary navigation;
- preload likely next event chunks and assets;
- support back, restart, and explicit branches;
- fit or responsively render the recorded viewport without position-only
  identity; and
- provide keyboard and screen-reader equivalents for every required action.

Existing Lodariq tour rendering, narration, media, theme, and analytics
contracts may be reused only after they are bound to the recorded product
surface. The targetless artifact projection is not the player foundation.

## Sanitization and privacy boundary

Recording a rendered product can collect customer data. Capture is therefore an
explicit, authenticated authoring operation, never default session replay.

### Record-time controls

- Restrict initial recording to approved staging or explicitly scrubbed demo
  origins.
- Mask password fields and all input values by default.
- Support customer-marked blocked, ignored, and masked regions.
- Never record cookies, storage values, authorization headers, request/response
  bodies, console payloads, or customer database values not rendered in the
  reviewed page.
- Exclude Lodariq authoring chrome from the recording.
- Display a persistent recording indicator and a visible stop action.
- Bound recording duration, event count, bytes, pages, and asset count by plan
  and hard platform ceilings.

### Private capture and public derivative

- Private raw chunks are encrypted, tenant-scoped, and inaccessible to public
  demo routes.
- Private raw chunks receive a short automatic retention window, proposed as
  24 hours after the sanitized derivative is created, with immediate manual
  deletion available.
- A sanitizer creates a distinct immutable public derivative.
- Link issuance is blocked until sensitive-data review is explicitly approved.
- Revocation blocks future demo sessions; short-lived asset authorization
  bounds any already-issued asset access.
- Workspace deletion and residency operations include private recordings,
  derivatives, and assets.

### Scriptless replay

The public derivative must:

- convert script elements to inert content;
- strip inline event handlers and `javascript:` URLs;
- disable forms, downloads, popups, top-level navigation, service workers,
  fetch/XHR, WebSockets, and customer-origin requests;
- rewrite approved assets to Lodariq-owned, content-addressed objects;
- omit customer URLs, credentials, tokens, selectors, and unreviewed hidden
  content from the public manifest;
- use a restrictive CSP and a sandbox without `allow-scripts`; and
- treat all recorded content as untrusted input during rebuild.

Canvas, WebGL, video, and inaccessible cross-origin iframe regions need safe
raster or approved media fallbacks. Do not enable a replay mode that requires
customer scripts. A raster fallback is for an opaque region, not the primary
screen-transition model.

## Page and navigation behavior

- SPA route changes stay in one recording session and become checkpoint/page
  boundaries.
- Same-origin hard navigations create separate capture segments joined into
  one demo graph.
- Because authoring bearers remain memory-only, a hard navigation may require a
  visible **Continue recording** confirmation and a newly authorized upload
  grant. Do not persist an authoring bearer to make navigation seamless.
- Cross-origin application handoffs require an explicitly configured
  application boundary and a new scoped capture segment.
- Public playback never navigates to the recorded customer URL.

## Asset and storage strategy

- Use direct, bounded uploads to jurisdiction-matched R2 through one-time,
  asset/session-scoped upload grants. The host page never receives the
  authoring-session bearer.
- Compress and pack event chunks before storage.
- Content-address immutable public derivatives and captured assets.
- Deduplicate identical assets within the same residency boundary.
- Generate thumbnails and raster fallbacks asynchronously outside request
  handlers.
- Keep R2 objects private; public access is authorized through the demo session
  and short-lived asset delivery.
- Add lifecycle deletion for abandoned private captures, expired links where
  retention permits, and superseded unreferenced derivatives.

No Playwright or headless browser runs per public view. Server browser work is
reserved for explicit verification/export jobs if later evidence requires it.

## Analytics

Record only bounded demo events such as:

- demo viewed;
- checkpoint viewed;
- expected interaction completed;
- branch selected;
- demo completed; and
- demo dismissed.

Batch events through the existing analytics ingestion boundary. Do not create
one general-purpose roadmap row for every interaction. Public events contain no
visitor identity, input values, captured page text, raw node data, or customer
URLs.

## Implementation sequence

### Slice 0 — Restore product truth

- Remove `authoring.shareable-demo-links` from implemented product claims.
- Hide or clearly rename the current targetless sharing UI.
- Stop issuing new policy-v1 targetless links under the demo name.
- Let existing time-limited links expire; never reinterpret them as recorded
  demo revisions.
- Record the correction in ADR 0028 and the roadmap.

Gate: no user-facing or capability surface claims an interactive demo exists.

### Slice 1 — Fidelity and safety spike

Build an authoring-only prototype against `apps/fixture-host` that records and
replays:

- a menu and hover state;
- a modal open/close transition;
- a masked form input;
- scrolling;
- an SPA route transition;
- responsive CSS;
- Shadow DOM/adopted styles;
- an animation;
- a canvas or cross-origin fallback region; and
- a script-injection fixture proving that replay executes no captured script.

Compile the linear event stream into clickable checkpoints. Do not start the
durable database migration until this spike passes the fidelity and sandbox
tests.

### Slice 2 — Contracts, storage, and sanitization

- Add TypeBox contracts for recording chunks, checkpoints, transitions,
  revisions, review evidence, tour bindings, links, and events.
- Add additive RLS-backed metadata tables.
- Add one-time bounded R2 upload grants and regional object keys.
- Implement record-time masking, sanitization, review, hashing, retention, and
  deletion.
- Add an idempotent asynchronous derivative job with explicit retries and
  terminal failure states.

Gate: malicious and sensitive fixtures cannot reach a public derivative.

### Slice 3 — Recording and demo editing

- Add **Record demo** independently of the experience/tour workflow.
- Capture semantic actions and DOM events together.
- Show the generated checkpoint/transition flow.
- Support trim, reorder where valid, restart, branch recording, text
  replacement, redaction, and preview.
- Surface unsupported regions and missing assets as explicit blockers.

Gate: a creator can build a useful self-guided demo without creating a tour.

### Slice 4 — Interactive public player and sharing

- Build the scriptless checkpoint player as a separate CDN entry.
- Add responsive fit, input simulation, scrolling, focus, keyboard behavior,
  branching, restart, and deterministic replay.
- Pin a link to one immutable sanitized demo revision.
- Add revocation, expiration policy, rate limits, CSP, asset authorization, and
  bounded analytics.

Gate: the public link displays and interacts with captured customer UI while
making zero requests to customer origins.

### Slice 5 — Optional tour binding

- Create a tour from selected recorded interactions.
- Attach an existing immutable tour revision.
- Match semantic targets across checkpoints and require confirmation for
  ambiguous results.
- Render the tour, narration, captions, and media against recorded nodes.
- Keep demo publication independent from in-app environment release pointers.

Gate: attaching or removing a tour never changes the captured workflow or the
customer's live publication.

### Slice 6 — Hardening and launch evidence

- Add same-origin hard-navigation segment continuation.
- Add multi-page and explicitly configured cross-application capture.
- Add data-residency, deletion, abuse, accessibility, performance, and browser
  compatibility evidence.
- Measure recorder overhead, derivative sizes, load latency, R2 operations,
  analytics writes, and failure rates in staging.
- Re-enable the product capability only after every required gate passes.

## Release acceptance gates

### Fidelity

- The public demo visibly includes the captured product UI.
- Menus, modals, scrolling, inputs, hover-dependent styling, SPA navigation,
  responsive layout, and explicit branches replay correctly.
- Transitions apply recorded DOM state rather than swapping whole-page
  screenshots.
- Unsupported regions degrade to reviewed bounded fallbacks with a visible
  authoring warning.

### Interaction identity

- Captured node identity and semantic evidence drive transitions.
- Position is never the sole identity or action authority.
- Tour matching explains confidence and requires confirmation below the
  accepted threshold.
- Coordinates never act on a live customer page during public playback.

### Security and privacy

- No captured script, event handler, URL scheme, form, or network primitive can
  execute.
- Public playback makes no customer-origin requests.
- Passwords and configured private regions never enter the public derivative.
- Review, retention, deletion, RLS, origin, and residency tests pass.
- Canvas replay never weakens the scriptless sandbox.

### Packaging and performance

- The recorder is absent from normal runtime and delivery bundles.
- The replayer is absent from the permanently installed customer runtime.
- Public event and asset payloads are bounded, compressed, and lazy-loaded.
- Recording overhead and page jank remain within a measured acceptance budget.
- Demo playback reaches an interactive checkpoint within the measured target
  on representative mobile and desktop connections.

### Publication and operations

- Every link pins one reviewed immutable demo revision and content hash.
- Revocation, expiry, idempotency, retries, and concurrent updates are tested.
- Existing policy-v1 targetless links are never upgraded in place.
- Analytics are environment/demo scoped and retain no captured values.
- Additive migrations pass migration safety and PostgreSQL/RLS verification
  before approved shared-environment application.

## Decisions to close before Slice 2

1. Select and pin the DOM recorder/replayer dependency and license version.
2. Approve the private raw-capture retention window and deletion SLA.
3. Set hard and plan-specific limits for duration, events, pages, and bytes.
4. Define the initial browser support floor.
5. Decide whether multiple tour revisions may bind to one demo revision or a
   binding always creates a new demo revision.
6. Define public link lifetime choices and whether passcode/email gates belong
   in the first release.
7. Define the exact asset-rewrite policy for public CDN assets, protected
   images, fonts, video, canvas, and cross-origin iframes.

## Reference implementations and evidence

- rrweb design and sandbox model:
  <https://github.com/rrweb-io/rrweb/blob/main/docs/design/index.md>
- rrweb snapshot/rebuild safety:
  <https://rrweb.com/docs/packages/rrweb-snapshot/>
- rrweb recording privacy controls:
  <https://rrweb.com/docs/guide>
- rrweb canvas replay security boundary:
  <https://github.com/rrweb-io/rrweb/blob/main/docs/recipes/canvas.md>
- Storylane HTML demo model:
  <https://docs.storylane.io/recording-demos/recording-html-demos>
- Reprise HTML capture model:
  <https://reprise.zendesk.com/hc/en-us/articles/17279084088859-HTML-Editor-Capturing>
