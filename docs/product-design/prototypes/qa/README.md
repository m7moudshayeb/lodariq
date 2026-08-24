# Prototype ⇄ SDK comparison kit

Tooling and evidence for the authoring chrome migration. Start from
[`../../authoring-chrome-migration-handoff.md`](../../authoring-chrome-migration-handoff.md).

## Tools

| file          | what it does                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.mjs`     | where output goes and how Playwright is reached — every other script imports `chromium` / `outDir` from here                                                                                                            |
| `probe.mjs`   | shared measurement helper — `probeProto` / `probeFrame` / `probeShadow` read the same computed properties from either side, `diff` compares them (1px tolerance on numbers, exact on colours, `color-mix()` normalised) |
| `add-i18n.py` | inserts a batch of translations into all 8 non-English catalogs — `python3 add-i18n.py batch.json` where the JSON is `{ "English": { "de": "…", … } }`                                                                  |

Run them in place — `node docs/product-design/prototypes/qa/t17-behaviour.mjs`.
Nothing needs copying to a scratchpad any more, and no script carries an
absolute path: `env.mjs` resolves the repo from its own URL and finds Playwright
by globbing `node_modules/.pnpm/playwright@*`, so a version bump does not break
the kit.

Screenshots go to `$TMPDIR/lodariq-qa/` by default. Set `LODARIQ_QA_OUT` to send
them somewhere else:

```bash
LODARIQ_QA_OUT=/tmp/my-run node docs/product-design/prototypes/qa/t17-build-shots.mjs
```

They land outside the session scratchpad on purpose — scratchpads are reaped
without warning, and this kit was lost that way once already.

## The two that answer most questions

| file                | what it answers                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t17-behaviour.mjs` | every Operations section has a head, a lede, a Close and the nav, with **zero legacy classes**; batch selection selects; Esc closes. The fastest read on whether anything regressed |
| `t19-light.mjs`     | walks every element in every section and prints anything painting itself light. A clean run reports only the indigo accent                                                          |

## The one that answers "why is authoring slow to open"

`t28-authoring-boot.mjs` is the odd one out: it needs no fixture host. It serves
`apps/editor/dist` over gzip from one origin, embeds it from a second (the
editor derives its trusted parent from `document.referrer`, so a same-document
harness never mounts), drives the real `authoring.init` handshake, and prints
the request waterfall with how much of it is serial, plus shell-interactive.

```bash
pnpm --filter @lodariq/editor build
node docs/product-design/prototypes/qa/t28-authoring-boot.mjs
```

`BASELINE=write` records a comparison point and later runs print the delta.
`ASSERT=1` exits non-zero when the boot shape regresses, which is the half of
the budget `apps/editor/scripts/check-size.mjs` cannot see: byte counting cannot
tell one round trip from five. `PROFILE=fast` drops the throttling, `LOCALE=de-DE`
exercises the catalog stage, `SHOT=<name>` writes a screenshot.

See `../../authoring-load-performance-plan.md` for what the numbers meant.

## The one that drives the experiences menu

`t30-experience-menu.mjs` opens the shared experiences menu from both surfaces —
the launcher's palette and the panel's mode-pill menu — against a seeded index,
and checks the parts a unit test cannot see: which side the flyout lands on, that
it stays inside the viewport after it grows, that the list pages instead of
loading every document, that "On this page" stacks above a complete "All tours"
with the second collapsed and counted, that naming happens before the document
exists, and that the type switch says what it is about to do.

```bash
SDK_PORT=5176 node docs/product-design/prototypes/qa/t30-experience-menu.mjs
```

It seeds twenty-four index entries whose documents do not exist. That is
deliberate: a row has to render from the index alone, so if listing ever goes
back to loading each document to read its title, every row disappears and this
script says so. Three more are filed under pages the run never visits, one of
them twice. Twenty-seven entries, twenty-six tours: "All tours" repeats
everything in the first list — a shortcut above a complete list, which is why
every row in it names its page — but a document filed under two screens is one
tour and prints one row.

Two things about it are layout, not markup, and only a browser has them. **The
second header must stay inside the menu** while the first list pages — under one
shared scroller its rows push that header past the bottom edge, and each scroll
toward it loads ten more rows in front of it, so the second list is never
reached. And **the seed is written late, against the key the SDK is using at that
moment**: a host that routes on boot — SocialHub sends `/` to `/login` about a
second and a half in — files everything under a page the run has already left,
which reads as an empty first scope and is a true reading of a wrong fixture.

The panel mounts a second flyout while the launcher's is still in the document,
so the script checks over there that each accordion header's `aria-controls`
resolves to a list inside its own menu — one reused id sends a screen reader to
a list belonging to a menu nobody has open.

The panel half needs a host that exposes `openAuthoring()`, which the ordinary
`pnpm --filter @lodariq/fixture-host dev` does. Set `LODARIQ_HOST_APP` and the
fixture's own pages are proxied away with it, so the script reports the launcher
checks and prints `SKIP` for the rest instead of dying.

The accordion headers are 30px tall and the full 288px of the menu. WCAG 2.2's
AA target-size bar is 24×24 (2.5.8); the 44×44 in the control map is the AAA one,
which the launcher button holds itself to because it stands alone on the host's
page. A full-width row inside a menu is a large target by area and is sized to
the rows it sits above.

## The one that answers "why did the SDK freeze when it loaded"

`t29-authoring-open-cost.mjs` opens authoring on the fixture host and reports
requests, bytes and main-thread blocking. `ASSERT=1` fails above 400 requests.

```bash
SDK_PORT=5177 ASSERT=1 node docs/product-design/prototypes/qa/t29-authoring-open-cost.mjs
```

If it reports requests in the **thousands**, the Vite dependency cache is stale
rather than the code being slow:

```bash
rm -rf apps/*/node_modules/.vite   # then restart the dev server
```

Vite pre-bundles deps for the dev server, and while anything imported
`lucide-react/dynamic` it split every icon into its own chunk — so one named
icon cost ~1600 requests. Source no longer does that, but a cache built before
the change keeps serving the split version, and a running server holds it in
memory. A production build never had this shape, which is why no size budget
catches it.
## The one that answers "why is this step showing on the wrong page"

`t34-page-scope.mjs` plays the fixture tour, walks the visitor to an unrelated
screen, and checks that the step suspends and comes back — and, just as
importantly, that sorting a column or opening a row menu does not suspend
anything. The fixture keeps sort order, dialogs and row menus in the hash query,
so it is the right host to prove the page key ignores them.

```bash
node docs/product-design/prototypes/qa/t34-page-scope.mjs
```

Both halves matter. Step 4 anchors the projects table, which used to rebind to
the invoices table on `/billing`; step 5 anchors the Reports nav link, which
exists on every screen, so it is the case no target-availability check can
catch.

`t35-persistent-dom-page-scope.mjs` is the companion, and the one that actually
proves the mechanism. The fixture host wipes the document on every route
(`root.innerHTML = shell(state)`), so half of t34 would pass even if page scope
were only a target-availability check wearing a hat. t35 serves its own host —
one DOM built once, every screen present from the first paint, routing that
toggles nothing but `hidden`, nothing added or removed after boot — which is how
React and Vue actually behave. It asserts the anchor is the _identical node_,
still connected and still on screen, at the moment the step suspends.

```bash
pnpm --filter @lodariq/sdk-runtime build
node docs/product-design/prototypes/qa/t35-persistent-dom-page-scope.mjs
```

It needs no fixture host; it serves `packages/sdk-runtime/dist` itself and drives
a real `TourPlayer`.

## The one that answers "why did it click the wrong button"

`t36-page-aware-targeting.mjs` covers the half `t34`/`t35` cannot: hiding the
card does not stop a click-for-me step or an end-of-tour action, both of which
press whatever the resolver returned. It serves the built resolver over a host
that puts the _same_ button — same tag, same name, same marker — on two screens
at once, neither ever removed, and asks the resolver for it from each.

```bash
pnpm --filter @lodariq/sdk-runtime build
node docs/product-design/prototypes/qa/t36-page-aware-targeting.mjs
```

One line in the output is the whole point: the same call with no page recorded
takes the Billing lookalike. That is the before and after in a single run, so a
regression that quietly drops `identity.context.page` shows up as two passes
turning into one.

## The one that answers "does a two-page tour actually work"

`t36` proves the resolver refuses the wrong page. That is not the same claim as
"a tour spanning two screens works", which is what someone authors.
`t37-cross-page-tour.mjs` plays one on the fixture application: step A anchored
on Projects, step B anchored on Billing, walking the visitor between them and
back.

```bash
pnpm --filter @lodariq/sdk-runtime build   # fixture host on :5177
node docs/product-design/prototypes/qa/t37-cross-page-tour.mjs
```

The control run at the end is why this exists. With the page removed from both
targets — the shape of every target authored before this change — step B shows
on **Projects**, pointing at the Import button, and then goes blank once the
visitor reaches Billing where it belongs. Backwards in both directions, and no
target-availability check can see it: both buttons are present the whole time.

## The same tour, driven the way a creator drives it

`t37` uses the runtime alone. `t38-authoring-page-navigation.mjs` opens the
authoring session and uses the creator's own controls — the filmstrip, the
preview pill, the card's Continue. Selecting a step navigates from the authoring
side and advancing navigates from the runtime, so they fail independently: the
filmstrip left the creator on the wrong screen while the preview toolbar worked.

```bash
pnpm --filter @lodariq/sdk-authoring build   # fixture host on :5177
node docs/product-design/prototypes/qa/t38-authoring-page-navigation.mjs
```

The build line is not boilerplate. The fixture host loads the _published_ SDK,
so a runtime change that is never bundled into `@lodariq/sdk-authoring` is
invisible in the browser however green the unit tests are — which is exactly how
mid-tour navigation came to look broken after it had been written and tested.

## The one that answers "how is this button not unique?"

`t39-ancestor-depth.mjs` measures the tie set for the Projects toolbar's Import
button with each cue removed in turn. It ran the capture module against the live
fixture rather than a fixture DOM on purpose: the ancestor roles a real
application produces are the whole subject.

```bash
pnpm --filter @lodariq/schema --filter @lodariq/sdk-authoring build
node docs/product-design/prototypes/qa/t39-ancestor-depth.mjs
```

Ancestor context used to ask only whether the captured roles appeared somewhere
above the candidate, so a control captured directly under `main` matched every
row menu buried in a table inside `main` — ten identical scores on a page with
one toolbar. It now agrees by depth, and the script pins the number: ten before,
two after, and those two are the toolbar itself.

## The one that answers "why is the resize ring taller than the card?"

`t40-frame-after-preview.mjs` finishes a tour and checks that the ring closes
back onto the card. The frame's height travels from inside the iframe as a
dataset number, and the iframe is then sized from it — so the shell it was
measured on is as tall as the answer it produces. When the card shrank on its
own, nothing was watching a box that had changed and the last number held.

```bash
pnpm --filter @lodariq/sdk-authoring build   # fixture host on :5177
node docs/product-design/prototypes/qa/t40-frame-after-preview.mjs
```

A real ResizeObserver and a real iframe are the whole subject, so this cannot be
a unit test.

## The one that answers "did we point at the right button, or just at a button?"

`t41-wrong-element.mjs` captures the Projects toolbar's Import button, swaps it
with Filter, and resolves again. Every recorded cue survives the swap, so every
gate that asks "is what I recorded still here?" says yes about the wrong button:
before the contradiction gate this returned `found` on Filter. It also checks
that a language the target was never captured in is read back off a clean win
rather than asked about.

```bash
pnpm --filter @lodariq/schema --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
node docs/product-design/prototypes/qa/t41-wrong-element.mjs
```
## The one that answers "does a tour survive the visitor leaving the page?"

`t37` walks a two-page tour with hash routing, where the SDK is never torn down.
`t43-cross-page-resume.mjs` covers the case the report came from: a hard
navigation. Play, advance, reload, and ask what step came back — then cross to
another screen with a full load and come back again. It also watches the address
bar, because resume must be invisible from the URL.

```bash
pnpm --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
node docs/product-design/prototypes/qa/t43-cross-page-resume.mjs
```

The tour is started through the host's own chrome (`__meridian.playTour`), not
`Lodariq.playTour`, because that is the path that was broken: the fixture used to
keep a resume key of its own and re-enter playback on boot, restarting at step 1
on top of the resume the SDK had already applied.

## The same question, asked of Preview

`t44-preview-resume.mjs`. Preview cannot borrow the runtime's resume record —
that one is checked against a published manifest version and content hash, and a
draft has neither — and the harder half is that a reload takes the authoring
panel with it. This checks the session came back *and* landed on the right step.

```bash
node docs/product-design/prototypes/qa/t44-preview-resume.mjs
```

## The one that answers "whose code is making authoring feel slow?"

`t29` measures what opening authoring costs to load. `t45-authoring-profile.mjs`
answers the different question: once it is open and someone is working, who is on
the main thread. It samples the CPU profiler over CDP and attributes self-time by
script URL across four phases — install, open, a working session, and 2,000 host
DOM mutations.

```bash
node docs/product-design/prototypes/qa/t45-authoring-profile.mjs
```

Two cautions on reading it. V8's `(idle)`/`(program)` frames are held out of the
attribution rather than folded into it, or every share is meaningless — the page
is idle 85-95% of the time in all four phases. And the fixture loads the
authoring bundle, which has the runtime bundled *into* it, so runtime cost shows
up under `sdk-authoring`; the `sdk-runtime` row only catches the separately
loaded chunks. These are Vite dev numbers, not CDN numbers.

## The one that answers "why doesn't the editor look like what ships?"

`t46-edit-mode-style-parity.mjs` puts both renderers on screen at once — the
editor's card inside the authoring iframe and the runtime's card on the host page
— and diffs the computed styles a creator would actually notice.

```bash
pnpm --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
node docs/product-design/prototypes/qa/t46-edit-mode-style-parity.mjs
```

It corrected the guess it was written to test. The resolved theme variables were
never wrong: all ten matched exactly on both sides, because the overlay already
applies the full `resolveTourThemeStyle` result. What differed was the editor's
own stylesheet not asking for them — the border was absent, the radius was a
hard-coded 12px, the shadow was the editor's popover token and the font was the
editor's UI font. Seven properties, now two.

Note the card it reads is `.overlay-step-card`, not
`.step-presentation-preview-card`. The latter is a different surface that edit
mode does not render, which is why a source-level guard on it would have proved
nothing.

## The one that answers "does the inspector actually change the card?"

`t49-inspector-reaches-card.mjs` drives every row of the step inspector the way a
creator would — pills, sliders, number fields and colour popovers — and reads the
card's computed style before and after each one. A control that moves its own
pill and nothing else fails here.

```bash
pnpm --filter @lodariq/sdk-authoring build
node docs/product-design/prototypes/qa/t49-inspector-reaches-card.mjs
```

It found one dead control and one honest gap. **Colour scheme** held its choice
in a local `useState` and wrote nothing at all, so picking Inverse repainted no
card; it also listed `surface` and `muted`, which no Tour recipe answers to. It
now writes the experience's appearance preset — the thing `resolveTourThemeStyle`
actually reads — and offers only the three presets that exist.

**Pointer arrow** is listed as expected-inert, with the reason in the script. The
overlay draws no arrow because the frame is never told which side of the target
the host solved the card onto: `overlayFrameGeometry` carries numbers only, and
the side stops at the host. Drawing it from the authored `placement` the way the
storyboard does would point the wrong way whenever the solver moved the card,
which is worse than the current silence.

## The one that answers "why does editing feel slow and jumpy?"

`t48-inspector-cost.mjs` counts what one edit actually costs: DOM writes, focus
moves, the gap between choosing and seeing, whether the inspector keeps its
scroll position, and how many times a slider drag tears the preview down.

```bash
pnpm --filter @lodariq/sdk-authoring build
node docs/product-design/prototypes/qa/t48-inspector-cost.mjs
```

It named the scroll bug outright: 2.3 `focus()` calls per edit and scroll 120 →
0. The inspector's focus trap depended on `onClose`, which its caller writes
inline, so every snapshot tore the trap down and set it up again — focus to the
opener, back to the first section, and the creator's place in the list with it.
Now 0 focus calls per edit and the scroll holds.

Read the drag line rather than the discrete-edit line for playback cost. A
synchronous burst is coalesced by the in-flight request guard on its own and
proves nothing, so the script spaces the moves like a hand: 20 moves used to be
11 preview rebuilds, and each rebuild recompiles the document and re-resolves the
step's target against the page. `t45`'s profile puts 31% of busy main-thread time
in the resolver's element-visibility scan, which is what those rebuilds pay for.

## The one that answers "why does every experience act like a tour"

`t50-experience-surfaces.mjs` renders all seven surfaces — popup, modal,
hotspot, banner, slideIn, drawer, floating — twice each, once with a target and
once without, and asserts the rendered card against
`experience-surface-registry.ts` rather than against numbers pasted into the
script. It reads the registry live, so a surface whose contract changes and
whose renderer does not is a failing run, not a stale harness.

```bash
pnpm --filter @lodariq/sdk-runtime build
node docs/product-design/prototypes/qa/t50-experience-surfaces.mjs
```

The bug it was written for: a target used to set `data-lodariq-anchored`, every
surface rule was qualified `:not([data-lodariq-anchored])`, and `modal` had no
rule of its own — so attaching an announcement to an element turned it back into
a tour tooltip. The two geometry lines are the proof: a banner is 960 wide at
`top: 12` and a modal is 520 centered, identically with and without a target.
`SHOT=1` writes one screenshot per surface.

## The one that answers "does the mode pill still print rows that do nothing?"

`t50-chrome-wiring.mjs` opens the pill menu in the shell's shadow root and reads
back the three canvas-zoom rows and the record row.

```bash
pnpm --filter @lodariq/sdk-authoring build
SDK_PORT=5177 ASSERT=1 node docs/product-design/prototypes/qa/t50-chrome-wiring.mjs
```

The zoom rows were live and moved nothing: `zoomCanvas()` wrote a controller
field no snapshot carried, and the only surface that honours
`--storyboard-canvas-zoom` is not on screen in overlay editing at all. It cannot
be: the card is drawn at the size it will ship and `frame-layout.ts` owns its
box, so scaling only Lodariq's card would make it lie about the shipped size.
They are drawn disabled now, with that reason printed under the group — which is
also the answer the creator wanted (use the browser's own zoom). The frame
publishes `canvasZoomable` on `authoring.shell.capabilities`, so a workspace that
does honour a canvas zoom flips them back on without touching the pill.

## The one that answers "does an announcement's inspector look like a tour's?"

`t51-inspector-parity.mjs` opens the step inspector for each non-tour experience
type and fails on any control that is not one the tour uses.

```bash
pnpm --filter @lodariq/sdk-authoring build
SDK_PORT=5177 ASSERT=1 node docs/product-design/prototypes/qa/t51-inspector-parity.mjs
```

`experience-behavior-section.tsx` was the only inspector code not built from the
shared property controls — a bare `<select>` in `.storyboard-property-row` and a
bare checkbox in `.storyboard-property-toggle`, **neither class defined by any
stylesheet in the repo**. So announcement, hotspot, survey and checklist opened
their inspector on unstyled browser widgets.

Two traps this script had to learn. The app replaces its own URL with a hash
route on boot, so `page.reload()` drops `?scenario=` and the host silently opens
the tour fixture instead — navigate again rather than reload. And count the
shared rows *inside the type's own section*: every type carries the shared Style
stack, so a panel-wide count stays healthy even when the behaviour body rendered
nothing, which is exactly how an earlier version of this script passed against
the code it was written to catch.

## The one that answers "did Product match actually land?"

`t52-product-match.mjs` runs a match, waits for the outcome, and measures the
card it was supposed to restyle.

```bash
pnpm --filter @lodariq/sdk-authoring build
SDK_PORT=5177 ASSERT=1 node docs/product-design/prototypes/qa/t52-product-match.mjs
```

Adopting a match reported "Product match was saved, but the preview could not
refresh" about a preview that had refreshed. The host's `theme.preview.apply`
handler *returned* the replay promise, and a returned promise holds the bridge
ack until it settles (see the bridge's `onMessage`), against a 2s budget in the
frame. A replay is compile + resolve + play. The error arrived at **2075ms with
the repainted dialog already on the page**. The handler acks the apply now — it
is complete the moment the theme is stored — and fires the replay separately,
so a genuine replay failure is a host toast rather than a lie about the apply.
Saved at ~400ms after, and the card takes the product's radius and fonts.

The script asserts the timing as well as the outcome: a failure landing between
1.9s and 2.6s is called out by name, because that is the ack budget coming back.

## The one that answers "is my saved style still there tomorrow?"

`t53-resources-persist.mjs` creates a named style, reloads the whole page, and
looks for it again.

```bash
pnpm --filter @lodariq/sdk-authoring build
SDK_PORT=5177 ASSERT=1 node docs/product-design/prototypes/qa/t53-resources-persist.mjs
```

The reload is the entire point — an in-memory stand-in passes every other check.
Local dev answered none of `loadStepStyleRecipes`, `loadDraftCheckpoints` or
`saveAuthoringResources`, so a style lived until the next refresh and the row
offering to create one was a control that undid itself. They are backed by the
same IndexedDB the media library uses, one database over.

Two traps. "Step settings" *toggles*, so re-opening an inspector that is already
open closes it. And `Custom` is not a saved style — it is offered only while the
step matches nothing, so creating a style *removes* it and a naive length
comparison sees no change; count the named rows.

## The rest

Named per task, matching `../../authoring-chrome-migration-handoff.md` §9:
`t8-*` the target layer, `t10-*` the modal / palette / captions, `t11-*` card
resize, `t16-*` and `t17-*` the Operations sheet, `t19-*`/`t20-*` its palette and
card geometry. `open-authoring.mjs` opens the fixture with authoring running and
leaves the browser up — the quickest way to look at something by hand.

All of them expect the fixture host on `:5177` and a current
`pnpm --filter @lodariq/sdk-authoring build`. Screenshots are evidence for a
report, not artifacts — they are written to `LODARIQ_QA_OUT` and stay out of the
repo.
