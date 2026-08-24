# Authoring Load Performance — Plan and Results

- Status: Tiers 0–2 and 5 landed; 3, 4, 6 re-scoped below
- Date: 2026-08-21
- Related: ADR 0027 (idle page cost), ADR 0015 (SDK-first authoring entry),
  candidate-channel / merged-origin plan
- Harness: `docs/product-design/prototypes/qa/t28-authoring-boot.mjs`
- Gate: `apps/editor/scripts/check-size.mjs`

Creators waited on a five-stage serial download before the authoring frame
painted a pixel. This records what was actually wrong, what was done, and what
is left — including two hypotheses that measurement killed.

## Result

Editor iframe, gzip on, 9 Mbps / 40 ms RTT, 4x CPU throttle.

Timings are the spread over repeated runs, not a single sample; this harness
varies by roughly ±80 ms run to run.

| Metric                    | Before              | After               | Change    |
| ------------------------- | ------------------- | ------------------- | --------- |
| Shell interactive (en)    | 1558–1886 ms        | 696–826 ms          | **~−55%** |
| Shell interactive (de)    | 1510 ms             | 713–791 ms          | **~−50%** |
| Serial round trips (en)   | 5                   | 3                   | −2        |
| Serial round trips (de)   | 6                   | 3                   | −3        |
| Over the wire (en)        | 624 KiB gz          | 445 KiB gz          | −29%      |
| Over the wire (de)        | 672 KiB gz          | 493 KiB gz          | −27%      |
| Largest first-paint chunk | 1756 KB / 433 KB gz | 1233 KB / 293 KB gz | −32%      |
| Emitted JS assets         | 1688                | 41                  | −98%      |
| Built `dist`              | 25 MB               | 12 MB               | −52%      |

The harness also reports a "first paint (shim)" figure. It measures the
placeholder sentence in `authoring.html`, not authoring UI, and it moves around
with preload scheduling — ignore it. Shell-interactive is the number that
describes what a creator waits for.

Idle-page cost is unchanged: `public-bootstrap` 5803/6144 bytes gzipped,
`loader` 3102/3200. No byte was added to what a visitor with no eligible
experience downloads.

## What was actually wrong

Ordered by how much they cost, which is not the order they looked like they
would.

1. **Schema and TypeBox were bundled twice** into the largest first-paint chunk
   — roughly 250 KB. `@lodariq/sdk-authoring` inlines `@lodariq/schema` via
   tsup `noExternal`, because the CDN entries it also produces must contain no
   bare imports. The editor consumed that pre-bundled `dist` _and_ imported
   `@lodariq/schema` directly, so Rollup could not see they were the same code.
2. **Three barrel imports** pulled the entire Rich Content editor onto the
   first-paint path. `controller-base`, `controller-bridge`,
   `controller-native-events` and `controller-target-document` each imported one
   small helper from `src/editor/index.ts`, whose `export *` re-exports the
   Lexical editor. One named import cost Lexical, its plugins, and the
   `lucide-react` dynamic icon map.
3. **`DynamicIcon` shipped a ~1600-entry lazy import map** (118 KB) to render one
   of the 70 icons `ICON_RECIPE_VALUES` permits — and emitted one chunk per icon,
   which is where 1688 assets came from, plus a round trip per icon rendered.
4. **The critical path was invisible to the preloader.** `authoring.html` had no
   `modulepreload`; every stage sat behind `await import()`, so Vite emitted its
   preload hints at call time, which is already too late.
5. **Two serial awaits preceded the app chunk**: the entry awaited the locale
   before importing the application, and `sdk-authoring/src/i18n.ts` held a
   top-level await, making every module that imports `authoringText` — nearly
   all of them — wait on a network fetch before it could evaluate.
6. **The workspace chunk was requested last**, only after the `authoring.init`
   handshake and session resolution, so the largest asset started downloading
   behind two round trips it does not depend on.

## The dev-server freeze — a separate bug, found from a screen recording

The production numbers above did not describe what a creator actually saw on
`pnpm dev`: opening authoring froze for well over a second. It was a different
bug, invisible to every production budget here.

Vite pre-bundles dependencies for the dev server. While anything imported
`lucide-react/dynamic`, the optimiser had **two** entries into `lucide-react`,
so esbuild's code splitting pulled every icon into its own chunk and rewrote the
main entry as roughly **sixteen hundred static imports**:

```js
import { AlignVerticalJustifyCenter } from './chunk-A4PKWWOS.js';
import { AlignVerticalJustifyEnd } from './chunk-N2ZS4ZZG.js';
```

Importing one named icon therefore cost ~1600 requests. Measured on the fixture
host, opening authoring made **1890 requests, 1769 of them optimiser chunks**.

Removing `DynamicIcon` from source fixes the cause, but **a dev cache created
before that change keeps serving the split version**, so the fix is invisible
until the cache is cleared:

```bash
rm -rf apps/*/node_modules/.vite
```

|                                           | Stale cache | Fresh cache |
| ----------------------------------------- | ----------- | ----------- |
| Requests to open authoring                | 1890        | **140**     |
| Optimiser dep files                       | 7058        | **76**      |
| Optimiser chunks                          | 3503        | **13**      |
| Static chunk imports in `lucide-react.js` | ~1600       | **2**       |
| `lucide-react/dynamic` optimiser entry    | present     | gone        |

A restart of any dev server started before the cache was cleared is required —
Vite holds the old graph in memory.

`t29-authoring-open-cost.mjs` checks this, because nothing in
`apps/editor/scripts/check-size.mjs` can: a production build never had this
shape. It exits non-zero above 400 requests, 20 MB, or 600 ms of main-thread
blocking — verified against both a stale server (exit 1) and a fresh one
(exit 0).

The same fix removed the stale icon assets from the fixture host's production
build: **1700 → 65** emitted assets on rebuild.

## Lexical — where it is, what it costs, and the card delay

### Live tours never load it

Verified rather than assumed: `@lodariq/sdk-runtime` does not depend on
`lexical`, imports it nowhere, and its built output contains no reference to it.
The viewer renders rich content with its own framework-free renderer
(`renderers/tour-content.ts` — `BODY_NODE_RENDERERS`, `appendStepBody`).

What an end user downloads for a page that shows a tour:

|                                     | gzipped |
| ----------------------------------- | ------- |
| `loader`                            | 3.1 KB  |
| `public-bootstrap` (idle page cost) | 5.8 KB  |
| `public-delivery`                   | 7.1 KB  |
| `runtime+tour`                      | 52.5 KB |

~65 KB total, no React, no Lexical, no xstate. The authoring weight cannot reach
a live tour: it is a different package, and the CDN asset script fails the build
on any bare import.

### The blank-card delay was ours, and it was not Lexical's weight

Making the Rich Content editor lazy bought the shell 53%, but the card then drew
its frame and sat blank until Lexical arrived a round trip later:

|                           | Before preload | After preload              |
| ------------------------- | -------------- | -------------------------- |
| Shell + card frame (cold) | 761 ms         | 720 ms                     |
| Card **text** (cold)      | 950 ms         | 856 ms                     |
| Card **text** (warm)      | —              | 518 ms                     |
| Gap                       | 189 ms         | ~135 ms cold, ~120 ms warm |

The fix was to preload the chunk: lazy for chunking, preloaded for timing. The
residual gap is Lexical's compile and first render at 4x CPU throttle, not
download — it is roughly a third of that on an unthrottled machine.

### Should it be replaced?

No, and the reason is not sentiment. ADR-0004 accepted Lexical deliberately and
confines it to `src/editor`; it backs paragraphs, headings, lists, media, icons,
callouts, plus serialization, paste, migration and accessibility coverage.
Replacing it means rebuilding a rich text editor, to save 42.5 KB gzipped on a
chunk that is now preloaded and cached immutably.

### The one Lexical cost worth revisiting

**125 KB raw of Lexical is still on the first-paint path**, and it is there for
exactly one reason: `controller-base` constructs an editor so
`normalizeDocument` can canonicalise a document by round-tripping it through
`parseEditorState`.

Removing that would move all of it to the lazy chunk — worth roughly 28 KB gz
and ~40 ms. Two ways, both with real risk:

- Replace the round trip with a direct `sanitizeBlockProps` /
  `sanitizeInlineTextRuns` pass. Those are already Lexical-free, but the round
  trip also normalises text-node shape and nesting; getting it wrong corrupts
  documents silently.
- Defer normalisation until after first paint, which changes what is rendered
  and saved in the interim.

**Recommendation: leave it.** A ~40 ms prize does not justify a
document-corruption risk. Revisit only alongside a test that proves block-JSON
equivalence across a corpus of real documents.

### If the card must show text immediately

The right fix is not removing Lexical. Render the block content on first paint
with the viewer's framework-free renderer — already on the first-paint path,
already the thing a published tour uses, so zero added bytes — and upgrade to
the editable surface when Lexical lands. That trades the blank card for a
possible re-render flash, so it is a product call, not a performance one.

## Service workers — considered, not needed

There is no service-worker plan anywhere in this repo (no ADR, no mention in any
tracked file). The question is worth answering anyway, because "cache the chunks
so they are not re-fetched" is the obvious next idea.

It is already true. `apps/editor/scripts/serve-static.mjs` serves hashed assets
`public, max-age=31536000, immutable` and the document `no-store`, so a repeat
open costs no network at all:

|                   | Cold       | Warm (repeat open) |
| ----------------- | ---------- | ------------------ |
| Over the wire     | 445 KiB gz | **0 KiB gz**       |
| Served from cache | 0 of 17    | **16 of 17**       |
| Shell interactive | 993 ms     | **544 ms**         |

The one uncached request is `authoring.html`, which must not be cached so a
deployment takes effect. Measure it with `WARM=1` on the boot harness.

So a service worker would buy nothing for repeat opens — the HTTP cache already
does it. What it could add is _pre-warming before first use_, and that is better
done with a speculative fetch on the activation gesture: same effect, no new
lifecycle to reason about, and no persistent scope.

Do not put one on the customer's origin. A service worker there would intercept
every fetch on their site and outlive the session, which is the opposite of what
ADR-0027 and the merged-origin plan's "an unauthenticated visitor downloads zero
authoring bytes" rule exist to guarantee. On the editor origin it would be safe
but, per the numbers above, close to pointless.

Revisit only if offline authoring becomes a requirement.

## Two hypotheses that measurement killed

Recorded because both are plausible enough to be tried again.

- **"The 408 KB of CSS-in-TS is a parse cost."** It is not. The real stylesheet
  is 438 KB and 2205 rules, and injecting it costs **1.7 ms**. CSSOM is
  effectively free here; moving those styles to a `.css` file would not have
  bought first-paint time. It remains worth doing for cacheability and for
  splitting by surface — but as a _byte_ argument, not a parse one.
- **"The boot is execution-bound."** A CPU profile of the whole boot came back
  965 ms sampled, of which **503 ms was idle** waiting on the network, 98 ms was
  V8 compile, and ~310 ms was actual execution. The boot is bandwidth-bound
  first. That is what redirected the work from restructuring rendering to
  removing bytes and removing serialisation.

## Tiers

### Tier 0 — Measurement harness — done

`t28-authoring-boot.mjs` serves the built editor over gzip from one origin,
embeds it from a second (the editor derives its trusted parent from
`document.referrer`, so a same-document harness never mounts), drives the real
`authoring.init` handshake, and reports the request waterfall, serial depth,
first paint, shell-interactive, console errors and a screenshot. `BASELINE=write`
records a comparison point; `ASSERT=1` exits non-zero on regression.

### Tier 1 — Remove the serial round trips — done

- `modulepreload` for the application and workspace chunks, emitted from the
  build by `apps/editor/vite-plugins/critical-modulepreload.ts`. It resolves
  _module ids_ to chunks, not chunk names, and **fails the build** when a marker
  stops matching — which it did, correctly, the moment the build switched to
  source resolution.
- The editor entry starts the application import before resolving the locale
  rather than after.
- The top-level await is gone from `i18n.ts`; the catalog load still starts at
  module evaluation, but nothing waits on it to evaluate.
- `prewarmLocalAuthoringFrame()` starts the workspace download when the frame
  document loads, overlapping it with the handshake.

Result: 5 serial round trips → 3; German 6 → 3.

### Tier 2 — Split the trunk — done

- `resolve.conditions: ['source', ...]` in the editor build, so workspace
  packages resolve to source. This removed the duplicate schema/TypeBox and gave
  Rollup real modules instead of tsup's pre-merged chunks. App chunk 775 KB →
  399 KB.
- Barrel imports replaced with direct module imports; `createLodariqEditor` moved
  out of the barrel into `src/editor/create-editor.ts`.
- `RICH_CONTENT_BLOCK_TYPES` / `TEXT_BLOCK_TYPES` extracted to
  `rich-content-block-types.ts`, and the serialized-node types to
  `block-node-types.ts`, so reading block JSON no longer requires Lexical.
- `LazyRichContentEditor` is the single Suspense boundary both popup surfaces
  render through.
- `DynamicIcon` replaced by `rich-content-icon-set.tsx`, a static map of the 70
  permitted icons. Adding a recipe without adding it there is now a type error.

Lexical core stays on the first-paint path deliberately: the controller
round-trips the document through `parseEditorState` to canonicalise it at mount.
Moving that is a correctness-sensitive change and was not attempted here.

### Tier 5 — Gates — done

`apps/editor/scripts/check-size.mjs`, wired into the `size` task:

- **First-paint budget** — 390.1/430 KiB gzipped across the entry, the preloaded
  chunks, and their static closure.
- **Largest first-paint chunk** — 292.5/320 KiB gzipped.
- **Chunk count** — 41/80. Would have caught 1688.
- **Duplicated bytes** — 30.6/96 KiB, attributed through sourcemaps. Would have
  caught schema and TypeBox twice.
- **Preload declaration** — every critical module must be named by a
  `modulepreload` in the shipped document, checked against the manifest the
  plugin writes rather than against a guessed chunk name.

Each of the five was verified to fail when its budget is crossed. The runtime
half — serial depth, shell-interactive, console errors — lives in the harness
behind `ASSERT=1`, because byte counting cannot see serialisation.

`build.sourcemap: 'hidden'` and `build.manifest: true` exist to feed these
checks.

### Tier 3 — CSS — re-scoped, not done

Now known to be worth ~0 ms of parse time. What remains true is that all 405 KB
arrives before first paint, including styles for operations, storyboard, flow
and release surfaces a creator has not opened. The win is splitting by surface —
shell styles on the first-paint path, the rest with the chunk that uses them —
worth roughly 250 KB raw. Do it as a byte reduction, and only after the cheaper
items below.

### Tier 4 — Locales — partly obsolete

Tier 1 removed the serialisation, which was the actual cost: German now boots in
the same 3 round trips as English, at 750 ms against 738 ms. What is left is
47 KB gz of catalog for a surface that shows a fraction of it. Splitting the
catalog per surface, and shipping JSON rather than a JS module, are still worth
doing — but this is no longer urgent.

### Tier 6 — The on-host creator panel — measured, not fixed

The vanilla panel in `packages/sdk-authoring/dist` — not the iframe — pulls
**986 KB raw / 262 KB gz across 46 chunks on the customer's main thread**, of
which **51 KB is `panel-styles.ts`**. Unchanged by this work, because it is built
by tsup, which must keep schema inlined so the CDN entries stay free of bare
imports.

Two findings apply directly:

- ~263 KB of the sdk-authoring `dist` is modules duplicated across chunks,
  including three copies of TypeBox. That is a tsup chunking problem, not a
  consumer problem, and it is the largest single item.
- The same barrel and icon fixes landed here already; they did not move the
  number, because the panel's weight is schema, not the editor.

Idle-page cost is unaffected either way — this is creator-session cost, charged
to the customer's main thread. It matters more once merged origins put this on a
live production page.

## Known pre-existing failures, untouched

- `pnpm --filter @lodariq/sdk-authoring size` fails: `authoring-owned` is
  291 KB gzipped against a 256 KB limit. It was already 283.8 KB gz at the start
  of this work — roughly 34 KB over — from other in-flight changes on this
  branch. This work adds ~0.5 KB to it.
- 24 test failures across the authoring and editor suites pre-date this work.
  Verified by reverting these changes and re-running the identical subset: the
  failure list is byte-identical.
- `import-surface.test.ts` additionally reports that
  `AUTHORING_TYPOGRAPHY_CSS_PROPERTIES` is exported from the narrow authoring
  frame entry but not from the compatibility entry. Left alone; it belongs to
  whoever added it.

## Constraints from the merged-origin plan

- No `modulepreload` and no prefetch in the customer's HTML. Everything added
  here lives in the editor origin's own document, which loads only inside the
  authoring iframe, which is created on a creator gesture.
- No capability request at page load.
- The harness doubles as the phase 4 network-trace gate: same script, the
  assertion becomes zero authoring bytes for an unauthenticated visitor.

## Rules

- Measure before and after. Two of the three things that looked most expensive
  here were not, and one thing nobody suspected — a duplicated dependency — was
  the single largest item.
- Raising a budget in `check-size.mjs` means a creator waits longer. Move it only
  with a harness run attached.
