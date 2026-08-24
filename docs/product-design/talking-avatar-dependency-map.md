# Talking avatar presenter — dependency map

- Status: Exploration, not a decision
- PRD references: §5, §7.7, §11.3
- Touches: ADR 0003, ADR 0012, ADR 0014, ADR 0027

## The idea

A tour step where a human-like character stands beside the target, speaks the
step's content aloud, and travels to the next target instead of the popup
teleporting there.

## The headline

**Rendering the avatar is the small part.** The character, its travel animation
and the speech bubble are perhaps 15% of this feature. The other 85% is
everything required to make a voice exist, sit inside an immutable artifact, and
survive a browser's autoplay policy. What follows is that chain in dependency
order, with the specific constraints in this repo that each layer collides with.

Read the layers as a build order. Each one is shippable on its own, and Layer 0
alone is already a real product.

---

## Layer 0 — The presenter surface

_Rendering only. No audio. Lowest risk, and it stands alone._

The seams already exist:

- `packages/sdk-runtime/src/renderers/experience-surface-registry.ts` is a frozen
  table of `anchor / ariaRole / focus / dismissal / backdrop / resizable /
defaultSize` keyed by `ExperienceSurfaceKind`. A presenter is a fourth row, not
  a branch.
- `TourPlayer` already keeps **one** shadow root with a singleton `card`, `arrow`,
  `backdrop` and `targetOutline`, reused across steps and repositioned by
  floating-ui. A character that persists and moves is the lifecycle you already
  have — add one more persistent element and a FLIP transition between the old
  and new solved positions.
- The content model does not change. A speech bubble is a tooltip with different
  chrome: same `body[]` node tree, same `tooltipLayout` / `tooltipStyle` recipes.

### New work

| Item                            | Where                                       | Note                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `presenter` surface kind        | `experience-surface-registry.ts`            | Data, not logic                                                                                                                                                              |
| Two-rect positioning middleware | `tour-positioning.ts`                       | Today solves card-vs-target; now avatar **and** bubble must both clear the target, stay in viewport, and mirror in RTL                                                       |
| `travel` motion recipe          | `schema/src/presentation.ts`                | `TOUR_MOTION_RECIPE_VALUES` is a closed set with a required `reducedMotion: 'none'`. Here the motion _is_ the feature, so the reduced-motion answer is a deliberate teleport |
| Lazy renderer chunk             | `renderers/`                                | `runtime+tour` is gated at **52 KiB gz** with forbidden-static-import assertions. Lottie is ~40–60 KiB gz, Rive more. Must be behind `import()` keyed on surface kind        |
| Character asset delivery        | `resolveMediaAsset`                         | Rides the existing assetId pipeline — see Layer 1 for why that pipeline is a problem                                                                                         |
| Accessibility                   | `tour.ts`                                   | Avatar is decoration: `aria-hidden`, `pointer-events: none`. The bubble keeps `role="dialog"` and the accessible name                                                        |
| Shadow styles                   | `tour-styles.ts`                            | Already 30 KB of CSS-in-TS; this is where the character's CSS lands                                                                                                          |
| Authoring registration          | `sdk-authoring/.../experiences/built-in.ts` | Experience definitions are registry data — capabilities, inspector sections, seed. Add a `presenter` capability and an inspector section                                     |

### The unanswered product questions

These are not implementation details; they are visible bugs if left unanswered:

1. **What does the avatar do while waiting?** Choreography allows up to 8 wait
   stages and a 60 s timeout. The next target may not exist yet, may be
   off-screen, may be behind a route change.
2. **Where does it stand on a step with no `targetId`?** Today the card simply
   centres itself.
3. **What happens on `leaveForHandoff`** to another application? Does the
   character walk off-screen, or vanish?
4. **Scroll and re-layout mid-travel.** `trackLiveTarget` already follows a moving
   target for the card; the avatar inherits that, and a travel animation racing a
   scroll is where this will look broken first.

---

## Layer 1 — Audio inside the immutable artifact

_This is the blocker. `narration.ts` and `narration-model.ts` both point at it by
name: "needs the ADR-0014 amendment and a content-addressed object-storage
design."_

### What the storage actually looks like today

- Compiled artifacts are **rows in Postgres** (`compiled_artifacts`), immutable and
  content-addressed by `contentHash`.
- Media assets are `authoring_media_assets` — and the column is
  **`content_base64: text`**, with two CHECK constraints that matter here:
  - `byte_length between 1 and 5242880` — a **5 MiB** ceiling per asset
  - `kind in ('image', 'video', 'captions')` — no `audio`
- Assets are served by the API at `/v1/sdk/media-assets/:assetId`, already with
  `cache-control: public, max-age=31536000, immutable` and permissive CORS — so
  the response is CDN-ready, but there is no CDN in front of it today. Every cold
  byte is decoded from base64 out of Postgres by a Fly instance.
- R2 exists, but only for SDK JS bundles, written by a CI script. **ADR-0027
  deliberately withheld bucket-write credentials from the API** — the eligibility
  digest was served from the API specifically to avoid granting them.

So there is no runtime-writable object store, by design. Introducing one is the
substance of the amendment, not a detail of it.

### What the amendment has to decide

1. **Where generated audio lives.** R2 with runtime write credentials, or a worker
   that holds the credentials and the API never does. ADR-0027's reasoning argues
   for the second.
2. **How audio binds to the artifact hash.** The claim being defended is that
   preview and production sound identical, which only holds if the artifact
   references audio by content hash. Today `compiledMediaAssetIds()` walks only
   `node.props.media`; narration audio has to enter that set.
3. **Rollback and promotion semantics.** Promotion reuses the exact
   `compiledArtifactId` without recompiling. Audio objects must therefore be
   immutable and must never be collected while any pointer still references them.
4. **Delivery.** An actual CDN. The cache and CORS headers are already right; what
   is missing is anything in front of the origin, which matters far more for a
   multi-megabyte clip than for a 40 KB screenshot.
5. **The two CHECK constraints.** Both the 5 MiB cap and the `kind` enum change, or
   audio bypasses this table entirely.

**Photoreal video makes this non-negotiable.** A 20 s talking-head clip is
2–10 MB; twelve steps across eight locales is ~96 clips. Base64 in Postgres is not
a candidate.

---

## Layer 2 — Generation pipeline

_This layer trips a deferred-vendor trigger._

ADR-0012 defers Redis/queue until "a real async job exists (compilation,
screenshots, exports, webhooks)." **Narration generation is that job.** Expect
BullMQ on Fly with idempotent jobs, per that ADR's own stated preference.

Already designed, and it holds up:

- `narrationCacheKey(script, voiceId, model, speed)` in `narration-model.ts` — the
  cost that matters is regeneration churn, and only dirty steps regenerate.
- `inferNarrationLocale()` — language comes from the script, which is what
  prevents Spanish text narrated in English.
- `NarrationLexiconEntry` — respelling, not IPA. Note that it must be applied at
  synthesis time, and not every TTS provider accepts respellings; some want SSML
  `<phoneme>` with IPA, which is precisely what the design refuses to make
  creators write. That conversion is real work.

Still missing:

- A TTS vendor. Cheap at this volume — `positioning-and-pricing.md` estimates
  ~$0.04 for a 12-step tour on OpenAI TTS-1.
- **Publish readiness.** `validateDocumentReleaseReadiness` needs a new issue
  type: a step carrying a script but no rendered audio must block publish, the
  same way invalid media assets do today.
- Fan-out over locales. Localization variants live inside the same artifact
  (`CompiledDocumentLocalizationV4`), so audio is per `(step, locale)` and the job
  count multiplies accordingly.

---

## Layer 3 — Playback in the runtime

_The layer that is routinely underestimated._

1. **Autoplay policy is a product decision, not a bug.** Chrome and Safari block
   audio without a user gesture. A tour that auto-starts on page load **cannot**
   speak. The options are an explicit "start with sound" affordance on step 1, or
   starting muted with captions and unmuting on first interaction. Choosing late
   means rebuilding step 1.
2. **Two clocks.** Advancement today is driven by choreography — `observeTargetClick`,
   waits, timeouts. Audio brings its own clock. What happens when the user clicks
   Next mid-sentence? When a wait stage runs 40 s and the audio ended at 6 s?
3. **Captions are mandatory, not a nice-to-have** (WCAG). `splitNarrationCues` and
   `estimateCueMs` already exist for the rehearsal, but with real audio you want
   real timings — request word or sentence timestamps from the provider rather
   than shipping the estimate.
4. **Bytes again.** An audio element, a playback state machine and a caption
   renderer, all against the 52 KiB gate. All lazy.
5. The ordinary long tail: pause, resume, replay, volume, mute persisted across
   steps, locale switch mid-tour.

---

## Layer 4 — The face

Only relevant once there is audio.

**Rigged 2D character** — a generic "talking" loop that runs while audio plays.
Optionally viseme-driven if the provider returns phoneme timings. Nobody inspects
a cartoon's mouth; this is almost certainly good enough.

**Photoreal talking head** — a different business, not a different renderer:

- HeyGen-class pricing is $1–5/minute. Twelve steps × eight locales × ~20 s ≈
  32 minutes ≈ **$32–160 per tour version**, regenerated on every script edit.
- `positioning-and-pricing.md` already calls this out and puts it out of scope
  until demand exists. Nothing found here argues with that.
- The regeneration-churn cache is the only thing that makes the economics
  survivable, and it is already designed.

---

## Suggested sequencing

1. **Layer 0 with the existing caption rehearsal.** A silent character that
   travels between steps and shows timed captions. Real product, zero new infra,
   no vendor, no ADR.
2. **ADR-0028: content-addressed generated-asset storage**, amending 0014. Design
   before any code. This is the gate everything else waits behind.
3. **Layer 2** behind a flag: queue, TTS vendor, audio as a first-class compiled
   asset with its own publish-readiness rule.
4. **Layer 3** captions-first, sound-on-gesture.
5. **Layer 4 photoreal** only if customers ask and the cost model closes.

## Three decisions needed before any code

1. **TTS or uploaded human recordings?** Uploads skip Layer 2 entirely — no queue,
   no vendor, no ADR-0012 trigger — and change the authoring model completely.
2. **Illustrated or photoreal?** Decides whether Layer 1 stores kilobytes or
   gigabytes, and whether the 5 MiB row cap can survive.
3. **What does a tour do when audio is blocked or unavailable?** Degrade silently
   to captions, or refuse to start? This determines the shape of step 1.
