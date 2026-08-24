# Task: tour progress, resume, and Preview parity

Discovered while authoring a real cross-page tour against a live application:
**a tour that spans pages does not resume after the full page load.** It restarts
from step 1. This is the blocker behind multi-page tours actually being usable.

**Standing constraints:** do not commit, do not push, do not run `pnpm format`,
do not run the full `pnpm verify`.

**Run all four sections end to end without stopping.** Shayeb is away. Every
decision that would normally be a check-in is pre-answered below; where something
genuinely cannot be decided from the evidence, write down the options and the
recommendation, take the reversible path, and keep going. **Nothing irreversible:
no commits, no pushes, no database migrations, no new API endpoints deployed.**
Leave one written summary at the end covering what was built, what was designed
but deliberately not built, and anything the evidence contradicted.

---

## What already exists — do not rebuild it

`packages/sdk-runtime/src/runtime/index.ts` has a complete, careful resume
mechanism:

- `writeTourResume(manifest, document, step)` → `sessionStorage`
- `readTourResume(manifest)` → validated against `documentId`,
  `manifestVersion`, `contentHash`, `stepId`, and `TOUR_RESUME_MAX_AGE_MS`
- `clearTourResume()`, called from `endTour`

The content-hash check is the good part: a republished tour cannot resume into a
step that no longer exists.

**CORRECTION (verified 2026-08-23): this claim was WRONG.** The resume mechanism
was fully wired at HEAD — `loader/index.ts:381` calls `readTourResume` on boot and
`tracked-tour-player.ts:41` calls `writeTourResume` on every step change. The
original grep was truncated with `head -20`, the test files filled those twenty
lines, and the truncation was read as the whole answer. **Concluding "nothing"
from a truncated list is the same error as trusting a fixture that silently ran
zero trials.** Section 2 as first written would have rebuilt working code.

Cross-page resume failed for three unrelated reasons, all found by measurement:
the delivery orchestrator restarted the tour it had just resumed (in-memory
`firedPublications` is gone after a hard navigation, so the trigger re-fired and
called `playTourById` with no `initialStepId` → `stopTour()` →
`clearTourResume()` → step 1); the fixture host's own `RESUME_KEY` re-entered
`play()` on top of the SDK's resume; and `tour.ts` set `stepPageKey = null` on a
resolution failure while `applyPageScope` early-returns on a null key, so a step
that landed on the wrong screen never re-rendered when the visitor came back. `apps/fixture-host/src/lodariq-loader.ts`
implements resume *itself* with `RESUME_KEY = 'meridian.tour.resume'` plus
`?tour=`/`&step=` in the URL — that is the fixture solving its own problem, not
the SDK's mechanism being exercised, and it is why cross-page resume looks
supported when it is not.

**Hard constraint from Shayeb: never append anything to the host's URL.** It
breaks the customer's routing, their analytics and the back button. The URL
approach in the fixture is not the product pattern and must not be promoted into
one.

---

## 1. Decide the storage split — this is the design decision, make it first

Two different facts get conflated. They have different lifetimes and different
owners:

| Fact | Lifetime | Belongs to | Fits |
|---|---|---|---|
| **Where I am in this tour** | Minutes. Dies with the visit. | This browsing session | `sessionStorage` — the existing `writeTourResume` |
| **Whether I finished or skipped this tour** | Forever | **The person**, across devices | Server-side, keyed to the identified user |

Shayeb's requirement — *"track progress of any user in each tour and continue
from where they stopped unless they skipped it"* — spans both rows. The second
one cannot live in browser storage: a user who switches to their phone would see
a tour they already dismissed.

`experience-runtime-core.ts` already gates surveys and checklists on
`localStorage`/`sessionStorage` by `frequency`. That is device-scoped precedent,
and it is not sufficient for skip/complete state.

The SDK already receives identity: `runtime.identify(traits)` with a required
`userId`, exposed through the loader. **Correction:** `analytics-export.ts`'s `completedAt` is the *export job's*
finish time (`AnalyticsExportJob`), not a tour completion — it is not a building
block for per-user progress. The real prerequisite is that `engagementKey` is
attached to `experience_shown` **only**, so terminal events carry no per-person
key and skip/complete cannot be derived from the stream as it stands.

**The decision is already made — implement this, and report if the evidence
contradicts it rather than pausing:**

- **Resume position → `sessionStorage`**, via the existing `writeTourResume`.
  Build it (section 2).
- **Skip/complete → keyed by `userId` from `identify` when available, in
  `localStorage`, written so a later server sync can replace the store without
  changing callers.** Build this.
- **Do NOT build the server-side per-user store.** Design it and write it up as
  an ADR draft instead: the schema, where it sits relative to the analytics
  event stream, the data-residency obligations from `data-residency.ts`, and
  whether skip/complete can be derived from events already emitted rather than
  stored separately. A wrong schema here is expensive to undo and Shayeb is not
  available to review it — design is reversible, a shipped table is not.

Still work through and record these, because they shape the code you write:

- Which store holds resume position, and which holds skip/complete.
- What happens when `identify` has not been called yet, or the visitor is
  anonymous — this must fail toward *showing* the tour rather than silently
  suppressing it, consistent with the fail-open rule in
  `triggerMatchesPage`.
- Whether skip/complete needs a new API surface or fits the existing analytics
  event stream. **Prefer reading state the events already imply over inventing a
  parallel store**, if that can be made reliable.
- Data-residency and retention implications of storing per-user experience state
  server-side — there is a `data-residency.ts` in schema; check what it obliges.

---

## 2. Wire the resume that already exists

Independent of section 1, and much smaller: make the runtime actually call
`writeTourResume` as a tour advances and consult `readTourResume` on boot.

- Write on step advance; clear on completion and on dismissal.
- On bootstrap, if a fresh resume record matches the current manifest and content
  hash, start at that step instead of step 1.
- **No URL mutation.** Nothing is appended, rewritten, or read back from
  `location`.
- Cross-page is the case that matters: in the host application `/inbox` and
  `/cp2` are separate bundles that each replace `<body>` on boot, so resume must
  survive a full application teardown, not a route change.
- Remove the fixture host's private `RESUME_KEY` mechanism once the SDK's own
  path works, so the fixture exercises the product rather than shadowing it.

Add an e2e that walks a two-page tour across a hard navigation. The existing t34
/ t36 / t37 / t38 cover off-page step suspension but hand-write the identity;
this one should author through the picker.

---

## 3. Preview must use the same path

Shayeb: *"The Preview should work the same."*

Today the authoring panel drives its own render, and `resumeDraftPreview` in
`panel.ts` restores a preview after an in-page interaction — a different thing
from surviving a document teardown.

Establish whether Preview can share the runtime's resume or genuinely needs its
own, and say which. If it needs its own, it still must not touch the URL, and it
should key on the draft document rather than a published manifest version.

A creator previewing a cross-page tour is the single most common way this feature
gets exercised during authoring. If Preview restarts at step 1 every time the
page reloads, the feature is unusable regardless of what the runtime does.

---

## 4. Performance — measure before concluding

Authoring "feels slow and lagging" against a real application. Before attributing
that to the SDK, note the known contributors already found:

- A watchdog in `apps/fixture-host/src/lodariq-embed.ts` was observing
  `document.documentElement` with `subtree: true` — a callback on every DOM
  mutation in a live app, each running a `querySelector`. **Already fixed**
  (body-level `childList`, coalesced to one idle check) but re-verify.
- The evaluation setup runs Vite dev: unbundled ES modules, hundreds of
  requests, no minification. Not representative of a CDN bundle.
- The `LODARIQ_HOST_APP` proxy buffers every HTML response to inject the loader
  tag. Document loads only, but it is there.

Re-verify the watchdog fix is live, then **measure rather than guess** — a profile of
the authoring session against the live app, attributing time to SDK work versus
host work. The repo already has size budgets and ADR-0027 on idle cost, so there
is an established standard to report against. Note also that `check-size.mjs`
measures only static import graphs, so the resolver and authoring chunks are
unbudgeted (project memory: `sdk-size-budget-blind-spot`).

---

## 5. Edit mode must show the style that will actually render

Reported after authoring against a real application: **the card in edit mode does
not reflect the applied style at all.** The creator styles a tour and the editor
shows something else, so what they are composing is not what ships.

Treat this as a **fidelity** problem with one correct shape — *one source of
truth for style, consumed by both surfaces* — not as "make the editor look
closer." Two renderers that merely resemble each other drift forever, and every
future style feature has to be built twice.

### Where the seam probably is — verify before fixing

The recipe layer is already shared.
`local-frame-ui/components/step-presentation-preview.tsx` imports
`resolveTourThemeStyle`, `resolveTourPopupStyleRecipe`,
`resolveTourCompositionRecipe`, `resolveTourActionRecipe`,
`tourPopupStyleVariables` and `tourCompositionPaddingVariables` straight from
`@lodariq/sdk-runtime/renderers/tour`. So the editor is not a from-scratch
reimplementation, which is good news.

The likely break is one level up. The runtime applies the theme with
`applyCompiledTourTheme(host, document)` and `resolveCompiledTourTheme(...)` in
`renderers/tour-theme.ts` — both driven by a **CompiledDocument**. In edit mode
there is no compilation, only a draft, so the theme's custom properties plausibly
never land on the authoring canvas host and the card falls back to recipe
defaults.

`compilePreview` exists in `@lodariq/sdk-runtime/local-dev` and
`authoring/preview-document.ts` already builds a preview document, so a draft
*can* be compiled. If that is the gap, the fix is to resolve and apply the theme
from the preview compilation rather than skipping theming until publish.

Also check `block-card.tsx` and the authoring canvas host: if edit-mode chrome
paints its own background, border or radius over the card, the runtime variables
can be correct and still be invisible.

### What to do

1. **Establish the actual divergence with evidence.** Render the same document
   through both paths and diff the computed styles on the card root — background,
   text colour, border, radius, shadow, font family and size, spacing, button
   fills. Report the list. Do not guess from reading the code.
2. **Fix at the source of truth.** The editor should consume the same resolved
   theme the runtime will use, from the same functions, applied to the authoring
   host the same way. Adding a parallel stylesheet in the editor is the wrong
   answer even if it looks right.
3. **Do not silently change runtime rendering to match the editor.** If the two
   disagree, the runtime is correct — it is what customers' users see. If a case
   turns up where the runtime looks wrong, report it rather than fixing it here.
4. **Cover the Brand Theme path specifically.** The workspace's persisted Brand
   Theme is the thing most likely to be missing in edit mode, and it is exactly
   the setting a creator will notice is being ignored.
5. **Add a regression check** that asserts the two surfaces resolve to the same
   theme values for a document with a non-default brand theme. A test that
   compares resolved tokens is enough — do not screenshot-diff.

### Scope

Style parity only: colours, typography, spacing, radius, shadow, button
appearance. **Not** positioning, spotlight, choreography or motion — the editor
legitimately differs there because it is a canvas, not an anchored overlay. If
a positioning difference turns up while you are in the code, write it down and
leave it.
