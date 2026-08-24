# Authoring chrome migration — handoff

**Branch:** `cursor-on-popup-editor` · **Last completed:** Task 15b — the toolbar overflow bug (§9)
**Source of truth:** `docs/product-design/prototypes/authoring-spec.html`

Read this whole file before touching anything. The method matters as much as the
work: most of the defects found so far were invisible in code review and only
showed up when the thing was driven in a browser.

---

## 0. Start here

**Nothing is committed or staged by this work.** ~63 files sit uncommitted in the
working tree, across roughly a dozen sessions. The user's standing rule is
**never touch git state unprompted** — no `add`, no `commit`, no `push`, ever,
until they say so in that message. Read-only git (`git show HEAD:path` for a
baseline) is fine.

The tree also carries a **staged targeting changeset** — do not revert or "clean
up" anything you did not write. Two long-standing test failures belong to it
(§10 #11); they predate the chrome work and are not a blocker.

The chrome migration itself is **finished**: every surface in the prototype
exists, and the Operations sheet (§4.6) is built section by section. What remains
is listed in §10 and none of it blocks.

**On picking a next task — read §10 before believing any summary of it,
including this one.** This paragraph has been wrong twice. It once claimed a
second fixture document would close four sections; it then claimed
`local-dev/mock-operations.ts` would close three. Neither was true. A/B
(`EXPERIMENT_DELIVERY_AVAILABLE = false`) and Share (`DEMO_CAPTURE_AVAILABLE =
false`) are hard-gated on control-plane and runtime seams that do not exist, and
a mock behind those flags would make an inert surface look live — which is the
exact thing the flags were added to prevent. The honest remaining scope of #12 is
**Analytics plus Collaboration's comments**.

The pattern worth noticing: every time this section named a "highest-value next
task", it was estimating from the section list rather than from the code. Open
the files first.

Before you touch anything:

```bash
# is the fixture up?
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5177/

# does it still build, and do the gates still pass?
pnpm --filter @lodariq/schema --filter @lodariq/compiler \
     --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build 2>&1 | grep -iE "error|✘"
node scripts/check-design-tokens.mjs
node scripts/check-localization-catalogs.mjs

# does the sheet still behave?
node docs/product-design/prototypes/qa/t17-behaviour.mjs
```

That last one is the fastest read on whether anything regressed: it walks all 16
sections and asserts each has a head, a lede, a Close, the nav, and zero legacy
classes — plus that batch selection works and Esc closes the sheet.

⚠️ **Do not use a bare `pnpm build`.** Turbo walks the whole workspace and dies on
`@lodariq/loader`, which has no `node_modules` in this environment — so the four
packages you actually needed never get built and you debug a stale `dist` for an
hour. The `--filter` form above is the one that works. §6 and §8.17 have the rest
of this trap; it has cost time more than once.

---

## 1. The brief

Migrate the Lodariq SDK's **creator chrome** so it matches the authoring
prototype. In the user's words:

> create every UI element from the prototype in the SDK, only the UI of the SDK
> elements, not the fixture-host app

> Check them pixel against pixel

> if something requires wiring to DB or BE, mock it and add a note prefixed with
> WIRE_{BE/DB/DASHBOARD/IFRAME}

> Start items by item

The fixture host (`apps/fixture-host`) is the fake customer product the chrome
floats over. It is **not** in scope — only the SDK's own surfaces are.

## 2. Standing constraints (still in force)

These are the user's own instructions and they override defaults:

- **"never stage or commit or push your changes again until I say so"** — no
  `git add`, no `git commit`, no `git push`, ever, unless the user asks in that
  same message. A one-off approval covers that one command and does not carry
  forward. Read-only git is fine. Leave everything in the working tree.
- **"Dude, be brief always in your comments, what am I goign to do with 10 lines
  of comments!"** — one or two lines, saying _why_. This has been said twice.
- **"Dont run the tests man, always use the visual testing in the browser"** — do
  not run the test suite as your verification. Verify in a real browser with
  Playwright scratchpad scripts. (You may still _update_ a test whose contract
  you deliberately changed — just don't lean on the runner to tell you the work
  is right.)
- **"your comments are too huge, be brief with the comments"** — code comments
  earn their place by saying _why_, in one or two lines. No essays.
- **"always use visual comparison on the browser"** — show actual screenshots in
  your report, not claims that something looks right.
- Adopt the prototype's wording. Rationale from the user: _"we are selling this
  to non-coding users."_ Prefer "The answer box" over "Input field".

## 3. The WIRE_ prefix convention

When a surface needs data or an action the SDK cannot perform yet, **build the
UI, mock the data, and mark the seam with a comment prefixed by the layer that
owes the wiring**:

| Prefix           | Means                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| `WIRE_BE`        | needs the control plane / an authenticated session / an API the SDK doesn't call |
| `WIRE_DB`        | needs a schema field or persisted shape that does not exist                      |
| `WIRE_DASHBOARD` | needs something the dashboard app owns (workspace settings, docs base, plan)     |
| `WIRE_IFRAME`    | needs a bridge operation between the frame and the host page                     |

Rules:

- The note says **what the real thing is** and **where the swap happens**, not
  just "TODO".
- A control that cannot work yet is **printed and disabled with its reason**, not
  hidden. §14.4: a named-but-unavailable row explains the limit; a missing row
  reads as a missing feature.
- Mocks live in `packages/sdk-authoring/src/local-dev/` (the fixture-host seam)
  and never ship to a hosted origin. Follow `mock-assist.ts` / `mock-presence.ts`.
- A mock that changes what the fixture always looks like should be **opt-in via a
  query param** (see `?lodariqPresence=demo`), so screenshots stay trustworthy.

Current inventory — **23 markers** (17 `WIRE_BE`, 2 `WIRE_DASHBOARD`, 2 `WIRE_DB`,
2 `WIRE_IFRAME`), all in `sdk-authoring`. This section said 52 for a long time,
and listed several seams that no longer exist; the count and the table below are
generated, not maintained by hand. Regenerate both with:

```
grep -rn "WIRE_[A-Z]" packages/*/src apps/*/src | grep -o "WIRE_[A-Z]*" | sort | uniq -c
```

There is **no `WIRE_RUNTIME`** in the tree. Delivery-side gaps are tracked as
ADRs, not as markers, because the runtime is the correct behaviour by definition
(§5) and a marker there would invite someone to "fix" delivery to match the
editor.

| Marker           | Where                                                            | Seam                                                     |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `WIRE_BE`        | `operations-analytics.tsx:259`                                   | workspace event catalogue is not in the Operations contract |
| `WIRE_BE`        | `operations-analytics.tsx:360`                                   | cohort reports the frame never sees                       |
| `WIRE_BE`        | `step-conditions-section.tsx:281`                                | real traits come from the workspace identify payload      |
| `WIRE_BE`        | `step-flow-section.tsx:289`                                      | adaptive skipping reads product usage                     |
| `WIRE_BE`        | `target-inspector-sections.tsx:349`                              | target health history is a server-side ledger             |
| `WIRE_BE`        | `target-inspector-sections.tsx:503`                              | simulating a changed page needs the hosted resolver sandbox |
| `WIRE_BE`        | `controller-operations.ts:73`                                    | same event catalogue, from the controller side            |
| `WIRE_BE`        | `overlay/shell.ts:191`                                           | "ask a colleague" is a collaboration-channel message      |
| `WIRE_BE`        | `rich-content-block-inspector.tsx:661`                           | asset replacement and per-locale variants                 |
| `WIRE_BE`        | `rich-content-block-inspector.tsx:692`                           | media frame is drawn by the runtime from theme tokens     |
| `WIRE_BE`        | `rich-content-block-inspector.tsx:786`                           | description generation is an Assist call                  |
| `WIRE_BE`        | `rich-content-block-inspector.tsx:1106`                          | empty-field message has no schema field                   |
| `WIRE_BE`        | `local-dev/mock-assist.ts:12`                                    | the local stand-in for `requestAiAssist`                  |
| `WIRE_BE`        | `local-dev/mock-operations.ts:2`, `local-dev/frame.ts:92`        | the local stand-in for the Operations boundary            |
| `WIRE_BE`        | `local-dev/mock-brand.ts:2`                                      | the local stand-in for the Brand seam                     |
| `WIRE_BE`        | `local-dev/frame.ts:74`                                          | where the assist stand-in is installed                    |
| `WIRE_DASHBOARD` | `toolbar-style-picker.tsx:7`                                     | named style rows the dashboard owns                       |
| `WIRE_DASHBOARD` | `rich-content-block-handles.tsx:84`                              | a Link block's workspace docs base                        |
| `WIRE_DB`        | `local-frame-ui/types.ts:486`                                    | the document has no `styleId`                             |
| `WIRE_DB`        | `step-target-section.tsx:15`                                     | no disambiguation rule is stored                          |
| `WIRE_IFRAME`    | `step-target-section.tsx:147`                                    | scrolling the host page to an element                     |
| `WIRE_IFRAME`    | `palette-commands.ts:86`                                         | palette rows open a section instead of firing its verb    |

Three things that were `WIRE_` and are not any more, so do not re-add them:

- **Step locks are enforced.** `panel.ts` runs `stepEditability` before accepting
  a frame patch and refuses with the holder's name. The band and the
  Collaboration table explain a real boundary.
- **Captions work.** §7.7 keeps the spoken script in the document; only the audio
  is out of the artifact.
- **Adding a language works, and never needed a backend.** It carried a `WIRE_BE`
  and a disabled button for months on a false premise: `mutableVariant()` creates
  a variant locally, on demand, in the document. Nothing crosses a service
  boundary. See Task 15 in §9 — the marker was the bug, not the missing wiring.

## 4. Architecture — where things live

The chrome is **split across two documents**. Getting this wrong wastes hours.

**Host page, inside the panel's shadow root** — plain DOM, no bundler of its own,
styles are one big CSS-in-TS string:

```
packages/sdk-authoring/src/authoring/
  panel.ts                    opens the panel, owns the iframe, wires callbacks
  panel-styles.ts             ALL host-side chrome CSS (one template literal)
  overlay/
    shell.ts                  orchestrates every host-side surface
    mode-pill.ts              §4.1  ← Task 7
    mode-pill-copy.ts         every pill string, in one place
    filmstrip.ts              §4.5  ← Task 6
    band-styles.ts            the band stylesheet, shared with the bridge  ← Task 9
    lock-band.ts              §15.2 step lock  ← Task 9
    solver.ts                 places card / toolbar / inspector in viewport coords
    icons.ts                  inline SVG glyph set (mirrors the prototype's `P` map)
    geometry.ts               iframe sizing + reveal/hide
    constants.ts              re-exports the geometry tokens
```

**Authoring iframe** — React + Lexical:

```
packages/sdk-authoring/src/authoring/local-frame-ui/
  components/*.tsx            toolbar, inspector sections
  components/operations-*.tsx the Operations sections            ← Task 11/12
  components/operations-hub.tsx  the sheet: nav, head, section switch
  styles/*.ts                 frame CSS-in-TS (overlay-shell.ts is the big one)
  styles/operations-sections.ts  the sheet's shared `ops-` vocabulary
  optional-panel-styles.ts    every card/list/status row Appearance,
                              Release and History draw — load-bearing, see §9
  controller-*.ts             the frame's state machine
packages/sdk-authoring/src/editor/
  rich-content-*.tsx          Lexical nodes, block inspector, block handles
```

The sheet is built from one set of parts, not per-section CSS. Before adding a
section, read the vocabulary at the top of `styles/operations-sections.ts`:
`.ops-box` `.ops-cols[data-cols]` `.ops-btn[data-variant|data-size]` `.ops-list`
`.ops-table` `.ops-meter` `.ops-barrow` `.ops-kv` `.ops-callout[data-tone]`
`.ops-tag[data-tone]` `.ops-code` `.ops-pill-tabs`. A section that needs
something none of them express needs a new part _there_, not a local one-off —
that is how fourteen screens drift into fourteen designs.

The picker is the bridge's, not the panel's, so **its** bands are drawn on the
host page's light DOM rather than in either of the two documents above:

```
packages/sdk-authoring/src/bridge/
  target-picker.ts            outline, hover card, freeze, commit
  targeting/picker-band.ts    §4.4a top and bottom bands  ← Task 9
  targeting/legibility.ts     plain-language names, breadcrumb, bigger/smaller
```

Shared:

```
packages/sdk-authoring/src/creator-chrome-tokens.ts   the ONLY colour literals
  CREATOR_CHROME_TOKENS        graphite + indigo, the chrome everywhere
  CREATOR_CHROME_CONTROL_TOKENS  controls and menus on glass
  OPERATIONS_SHEET_TOKENS      the sheet's deeper well/surface pair
  OPERATIONS_TAG_TOKENS        status ink lifted for near-black
  OPERATIONS_NOTE_TOKENS       the four inline-note triples
packages/sdk-authoring/src/i18n-catalogs/*.ts         8 non-English locales
packages/sdk-authoring/src/authoring/content-locales.ts
  the language the CUSTOMER authors in — flags, endonyms, direction, search.
  NOT PRODUCT_LOCALES. See §4a, this distinction has been got wrong twice.
packages/schema/src/presentation.ts                   persisted style props
packages/schema/src/bridge.ts                         host ⇄ frame message union
packages/sdk-runtime/src/renderers/tour-*.ts          what published output does
```

Key invariants:

- The iframe is **sized to its content by a host-side solver**. It is ~444×220 in
  overlay mode. Anything that needs to be big (a modal, a palette) needs its own
  presentation mode — this is why the keyboard map is a menu view and not a modal.
- Three absolutely-positioned peers live in the frame: `.overlay-step-toolbar`,
  `.overlay-step-card`, `.overlay-step-inspector`, boxed by `solveOverlayFrame` /
  `solveToolbar` / `solveInspector` and published as `--overlay-*` properties.
- The inspector section registry caps at 6/7 sections per selection kind.
  `InspectorSelectionKind = 'card' | 'button' | 'formField' | 'media' | 'target' | 'step'`.

## 4a. Two locale concepts. Do not merge them.

This was conflated in the original build and cost a whole session to unpick. The
two lists look alike and mean opposite things:

|              | `PRODUCT_LOCALES`                                | `ContentLocale`                                  |
| ------------ | ------------------------------------------------ | ------------------------------------------------ |
| Answers      | "can Lodariq draw **its own UI** in this?"       | "what language is the **customer's copy** in?"   |
| Values       | exactly 9, we ship catalogs for them             | any well-formed BCP-47 tag                       |
| Lives in     | `i18n-catalogs/*.ts`, `currentAuthoringLocale()` | `content-locales.ts`, `canonicalContentLocale()` |
| Validated by | membership — it is in the list or it is not      | **shape only** — `CONTENT_LOCALE_PATTERN`        |
| Adding one   | means writing a catalog                          | means typing a tag                               |

The rule, in the user's words:

> the current selector is only which locales we support on our own platform, not
> what languages we support in the authored content. Users should author whatever
> they want

> I dont really know why we care what text the user has inserted TBH, its rich
> content for us, the only thing we need to care about is security, not a
> language selector

So: **the copy inside a card is opaque text we never parse.** The tag on a
variant is a _routing key_ — what the runtime matches an end user against, what
goes in `lang`, what direction derives from, what a translation targets. It is
not a claim about the characters, and gating it on the nine languages our chrome
speaks was a category error. A creator can author Swahili, Tagalog or Cherokee
today; none of them will ever be a `PRODUCT_LOCALE`.

The one place a _language selector_ is still legitimately required is machine
translation, which needs a target. Everywhere else it was ceremony.

## 5. How to work a task

Item by item, and each item end to end. The loop:

1. **Read the prototype section first.** `grep -n "§4.1" authoring-spec.html` finds
   both the CSS block and the JS that draws it. Read both. The prototype's
   comments carry design rationale worth keeping.
2. **Find the SDK's current version** and decide: does it exist, is it partial, or
   is it missing? Most of these tasks were "exists but drifted", not "missing".
3. **Write a probe script** that measures both sides _before_ changing anything
   (§6). You need the diff to know what you're fixing.
4. **Fix presentation**, rebuild, re-probe until the diff is empty or every
   remaining line is a deliberate, stated deviation.
5. **Then drive the thing.** Click every control, press every shortcut the UI
   advertises, switch every mode. This is where the real defects are — all three
   found in Task 7 were invisible in the CSS diff.
6. **Run the gates** (§7).
7. **Report with screenshots**, and say plainly what you changed, what you found,
   and what you deliberately did not match.

Scope discipline: if something belongs to a later task, don't build it — write it
into that task's description instead (Task 10 carries the keyboard-map
promotion).

## 6. How to verify — the browser loop

Browser MCPs do not connect in this environment. Everything is driven by Node
scripts importing Playwright by absolute path, from the session scratchpad.

**Setup (already running in the user's terminals):**

```
http://localhost:5177/      apps/fixture-host — resolves @lodariq/sdk-authoring to dist/
file:///…/docs/product-design/prototypes/authoring-spec.html    the prototype
```

**After ANY source change you must rebuild before the browser sees it:**

```bash
pnpm --filter @lodariq/schema build      # only if schema changed
pnpm --filter @lodariq/sdk-runtime build # only if runtime changed
pnpm --filter @lodariq/sdk-authoring build
```

⚠️ **Never `| tail -2` a build.** tsup prints its DTS lines _after_ the ESM phase,
so a failed build looks like a successful one while `dist/**/*.js` is empty. Do:

```bash
pnpm --filter @lodariq/sdk-authoring build 2>&1 | grep -iE "error|✘" | head -5
ls packages/sdk-authoring/dist/local-dev/install.js >/dev/null && echo "build ok"
```

**Run the scripts in place** — `node docs/product-design/prototypes/qa/<name>.mjs`.
Nothing needs copying to a scratchpad, and no script carries an absolute path any
more.

`qa/env.mjs` is what makes that true: it resolves the repo from its own URL and
finds Playwright by globbing `node_modules/.pnpm/playwright@*` (there is no local
dep on it, so a bare import fails). Every script imports `chromium` and `outDir`
from it. Screenshots go to `$TMPDIR/lodariq-qa/`, overridable with
`LODARIQ_QA_OUT` — deliberately outside the session scratchpad, because **the
scratchpad is reaped without warning and this whole kit was lost that way once.**

**The shared probe helper** is `qa/probe.mjs`. It exports `OUT`, `PROTO_URL`,
`SDK_URL`, `probeProto`, `probeFrame`, `probeShadow`, `diff`, `report`. It reads a
fixed set of computed properties, compares numbers with 1px tolerance and colours
exactly (normalising `color-mix()`), and screenshots the same element. Reuse it;
don't write a fourth copy.

**Opening the SDK:**

```js
await sdk.goto(SDK_URL); // + '?lodariqPresence=demo' for peers
await sdk.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await sdk.reload();
await sdk.waitForTimeout(2200);
await sdk.evaluate(() => window.__meridian.openAuthoring());
await sdk.waitForTimeout(4500);
```

**Reaching the chrome** — it is in a shadow root, so a flat `querySelector` misses
it:

```js
const ev = async (fn) =>
  sdk.evaluate((body) => {
    const host = [...document.querySelectorAll('*')].find((n) =>
      n.shadowRoot?.querySelector('[data-overlay-root]'),
    );
    return new Function('root', body)(host.shadowRoot);
  }, fn);
```

**Reaching the frame:** `sdk.frames().find(f => f.url().includes('authoring.html'))`

**Opening the prototype's equivalent:** click `#tbar [data-m="more"]`, force
`#insp details` open by summary text, screenshot `#insp`. The prototype exposes
its state as globals (`S`, `DOC`, `drawPill()`, `solve()`), so you can put it into
any state directly: `await proto.evaluate(() => { S.pill.collapsed = true; drawPill(); solve(); })`.

**Reading persistence:** `localStorage['lodariq:doc:*']` holds the saved document.
Use it to prove an inspector edit actually reached the document — several did not.

**Opening Operations:** ⌘K → type the section → Enter. That is the route a
creator has, and it exercises the palette on the way. Once the sheet is open,
`[data-operations-tab="<id>"]` switches section without leaving it.

Scripts live in `docs/product-design/prototypes/qa/`, named per task.
`open-authoring.mjs` opens the fixture with authoring already running and leaves
the browser up, which is the quickest way to look at something by hand. The four
worth knowing before you write a fifth:

| Script                        | What it answers                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `t17-build-shots.mjs`         | screenshots all 16 sections; change the `tabs` array to narrow it                                                                     |
| `t17-behaviour.mjs`           | every section has a head, a lede, a Close, the nav, and **zero legacy classes**; batch selection actually selects; Esc closes         |
| `t19-light.mjs`               | walks every element in every section and prints anything painting itself light. Use this instead of chasing screenshots one at a time |
| `t20-release-card.mjs`        | geometry of one card — width, display, padding, font size — when something looks wrong but you cannot say why                         |
| `t21-language.mjs`            | Language with real locale variants — the coverage table, the meters and "Still to write", printed row by row                          |
| `t22-targets.mjs`             | the target health ledger — which steps were inspected and what each reports                                                           |
| `t23-fixes.mjs`               | the five Task 14 defects, each asserted separately                                                                                    |
| `t24-locales.mjs`             | switching the product UI locale across all 9 catalogs                                                                                 |
| `t25-five-steps.mjs`          | the surfaces that had one step and now have five                                                                                      |
| `t26-author-any-language.mjs` | authoring a card in a language with no product catalog, end to end, incl. RTL                                                         |
| `t27-toolbar-overflow.mjs`    | sweeps the toolbar across widths and asserts it never clips and More stays reachable                                                  |

Traps these were written around:

- **A synthetic `.click()` does not open a select.** `ui-select-trigger` toggles
  on `pointerdown`, so `el.click()` silently does nothing and your probe reports
  a false pass. Use a real Playwright click.
- **Two sections still only render their empty state** in this fixture
  (§10 #12 — Analytics, and Collaboration's comments). An empty section is not
  proof the populated one works. A/B and Share are a different case: they are
  deliberately inert behind availability flags, not waiting on a fixture.
- **A `str.replace` on CSS can split a selector list.** Anchor on something
  unique; a rule that lands mid-list silently strips the rules above it and
  nothing fails.
- **Presence is not visibility, and visibility is not discoverability.** A probe
  that asserts `querySelector(...)` is non-null proves only the first. This cost
  a false "it works" report: the add-a-language control was in the DOM, visible,
  and read as a view filter — so the user's reply was _"WTF dude, I dont see any
  button like that?"_. If the claim is that a creator can do X, the probe has to
  do X the way a creator would, and the report has to carry the screenshot.

Screenshots stay in the session scratchpad — they do not belong in the repo.
Show them in your report; do not commit them.

## 7. Gates before you call a task done

```bash
for p in schema sdk-runtime sdk-authoring database; do
  npx tsc --noEmit -p packages/$p/tsconfig.json   # silent = pass
done
npx tsc --noEmit -p apps/api/tsconfig.json
node scripts/check-design-tokens.mjs          # "Design-token boundary passed …"
node scripts/check-localization-catalogs.mjs  # "Validated N … across 8 non-English locales"
```

**The runner is not your verification — but it is your contract check.** The
standing instruction is to verify in the browser, and that holds. It does _not_
mean shipping a contract change that silently breaks a test nobody runs. When you
remove a control, rename a class, or change what a report contains, grep for
tests naming it and run **those files only**:

```bash
grep -rl "TheThingYouChanged" packages/ apps/ | grep -E "test|spec"
npx vitest run <that file>
```

Update the test when its contract is the thing you deliberately changed; say so
in your report. Do not "fix" a failure in code you do not own — check whether it
was already failing (§10 #11 lists two that were).

To print more than the localization checker's first 3 keys:

```bash
sed 's/\.slice(0, 3)/.slice(0, 400)/; s/\.join('"'"', '"'"')/.join("\\n")/' \
  scripts/check-localization-catalogs.mjs > scripts/.gv.tmp.mjs
node scripts/.gv.tmp.mjs; rm -f scripts/.gv.tmp.mjs
```

Removing stale keys across all 8 catalogs (entry-aware, so a wrapped value is not
cut in half): `docs/product-design/prototypes/qa/strip-stale.py <keys.txt>`.

**i18n is not optional.** Every `authoringText('…')` needs an entry in all 8
catalogs (`ar de es fr it nl-BE pt tr`) and the checker fails on **missing _and_
stale**. Changing a string means adding the new key _and_ deleting the old one if
nothing else uses it. Helper: `docs/product-design/prototypes/qa/add-i18n.py
<batch.json>` where the JSON is `{ "English string": { "de": "…", … } }`.

Three things that will bite:

- The helper **inserts at the top of the catalog object**, so a key that already
  exists lower down becomes a TS1117 duplicate. Check before adding.
- The checker validates **placeholder parity** — a translation must carry the
  same `{count}` / `{name}` tokens as its English key. Validate your batch before
  applying; a missing `{count}` in one Arabic string fails the whole gate.
- Plurals are chosen **at the call site**, per `release-findings.tsx`:
  `authoringText(count === 1 ? '{count} finding' : '{count} findings', { count })`.
  Both forms need catalog entries.

## 8. Traps that have already cost time

1. **A backtick inside a comment in a CSS-in-TS file terminates the template
   literal** and the build fails somewhere else entirely. Hit three times. Never
   quote a CSS property or token in backticks in `panel-styles.ts` or
   `local-frame-ui/styles/*.ts`.
2. **Inline styles beat every stylesheet rule.** `revealIframe` wrote
   `opacity: 1; pointer-events: auto` inline, which silently disabled the entire
   Browsing/Picking ghost. If a mode is supposed to change appearance, make sure
   nothing writes that property inline.
3. **Two nested scroll containers eat the wheel.** `overscroll-behavior: contain`
   on a container with nothing to scroll swallows the event instead of chaining
   it outward. Cost a user-reported bug in the field inspector.
4. **Lexical decorators consume clicks.** A decorator preview must open its
   inspector on `pointerdown`, not `click`.
5. **The inspector's flush guard.** `flush()` used to bail whenever the inspector
   owned focus — but a segmented control or swatch keeps focus forever, so
   nothing the block inspector wrote ever reached the document. It now bails only
   while genuinely _typing_ (`inspectorIsTyping`), and forces a flush on focusout.
6. **A bare descendant selector in the preview CSS** (`.preview label`) also
   matched the field's own label, so the authoring preview disagreed with the
   runtime. Scope preview rules tightly and check them against
   `sdk-runtime/src/renderers/tour-styles.ts`.
7. **Undefined tokens fall through silently.** `--lq-color-attention` is defined
   nowhere; the warning text just rendered muted grey. Grep the token exists.
8. **A very large `box-shadow` is dropped by a full-viewport headless capture.**
   The spotlight backdrop's `0 0 18px 9999px` dim renders correctly but a
   `page.screenshot()` of the whole viewport shows it undimmed, while a clipped
   capture of the same frame shows it. Verify large shadows with a `clip`.
9. **A declared `display` beats `[hidden]` on the host page.** The shadow root
   has one global `[hidden] { display: none !important }` rule; the bridge's own
   stylesheets do not, so `.lq-band button { display: flex }` kept hidden buttons
   painted. Any host-page component with a declared display needs its own
   `[hidden]` rule.
10. **`textContent` includes hidden nodes.** A probe that reads a band's text
    will report both `Freeze page` and `Unfreeze`; only computed `display` tells
    you which is on screen.
11. **Probe/selector gotchas:** the form field needs a two-step insert (Form field
    → Text field); media needs `input[type=file]` + `setInputFiles`, not a file
    chooser; runtime nodes are in a shadow root; the bridge does not use
    `postMessage`, so hooking it catches nothing. The filmstrip's chips are
    `[data-step-id]`, and the shell's mode is `data-lodariq-shell` on the panel
    host.
12. **A light palette can be applied from three places at once.** The Operations
    sheet rendered white because `html:has(.shell-operations)` handed it the
    light workspace tokens, `.shell-panel:not(.shell-overlay)` in
    `advanced-shell.ts` re-applied them, and `rich-text.ts` painted `#ffffff`
    underneath. Fixing one changes nothing. If a surface is the wrong colour,
    find _every_ rule that matches it before editing — `t19-light.mjs` does this
    for you.
13. **A component styled for the 320px panel does not survive being dropped into
    a 1200px sheet.** Reused surfaces (`tour-flow-map-workspace`,
    `tour-review-workspace`, `panel-mode-card`) carry their own light plates and
    their own scroll. Override them scoped to `.operations-hub-body` rather than
    editing the module they came from — they still render in their original home.
14. **`useOptionalPanelModeStyles()` is load-bearing.** Every card, list and
    status row Appearance, Release and History draw lives in that one stylesheet.
    A surface that renders them without calling the hook comes out as bare markup
    — a numbered list where the steps should be — and nothing errors.
15. **A `str.replace` can split a CSS selector list.** Replacing on
    `"  .panel-mode-disclosure {\n"` matched inside
    `.panel-mode-card, .panel-mode-section, .panel-mode-disclosure {` and cut it
    in half, so `.panel-mode-card` silently lost display, padding and background
    everywhere. Anchor on something unique, and look at the result.
16. **A synthetic `.click()` does not open a Radix select.** `ui-select-trigger`
    toggles on `pointerdown`. A probe using `el.click()` finds no menu and reads
    as a pass.
17. **Vitest and the browser both read the built `dist`, never your source.**
    `@lodariq/schema`, `@lodariq/compiler`, `@lodariq/sdk-runtime` and
    `@lodariq/sdk-authoring` resolve to `dist/`. A source edit is invisible to
    both until you rebuild — a one-line schema change once looked like 44 broken
    fixture tests. And `pnpm build` alone does not do it: turbo dies on
    `@lodariq/loader` (no `node_modules`), so use the four-`--filter` form in §0.
18. **Lexical owns `dir` on its own root and strips the prop.** Setting
    `lang`/`dir` on `<ContentEditable>` applies the `lang` and _silently drops the
    `dir`_ — measured `{lang: "ar", dir: null, computed: "ltr"}`, which looks
    wired up and is not. Put them on `.rich-content-canvas-shell` instead;
    direction inherits through and Lexical does not touch it.
19. **Measuring a flex item's natural width while items are hidden reads 0.**
    The toolbar overflow pass has to un-hide everything, measure, _then_ decide.
    Keep the running `Math.max` of each item's observed width too — a single
    measurement taken mid-transition is not the natural width. See Task 15b.
20. **The localization checker fails on stale keys as well as missing ones.** So
    removing a string is a two-sided edit: delete it from all 8 catalogs, and if
    the string later comes back into use, restore it from `git show HEAD:path`.
    Changing wording without deleting the old key fails the gate just as loudly
    as forgetting to add the new one.
21. **A single test run is not evidence, in either direction.** The suite is
    genuinely noisy (§10), so one new failure may be noise — but three failures
    were once dismissed as "flaky" when they failed 5/5 and were real, caused by
    wiring left behind after `[data-panel-document-title]` was removed. Re-run
    the file in isolation before you conclude anything, and prefer the name-level
    baseline diff in §10 over any count.

## 9. What is done

Tasks 1–7 are complete. Every one was verified in the browser against the
prototype and screenshotted.

| #   | Task                                                                      | Notes                                |
| --- | ------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Toolbar (§4.2a) — full contextual middle                                  |                                      |
| 2   | Floating menus — menu / optList / number / text / colour / grid4          | frame-side (React `chrome-menu.tsx`) |
| 3   | Card block types — all 13 renderers                                       |                                      |
| 4   | Card chrome — frame, 8 handles, gutter, card tools, add-block             |                                      |
| 5   | Inspector popover (§4.3) — all sections                                   | see below                            |
| 6   | Filmstrip (§4.5)                                                          | strip and cell metrics match         |
| 7   | Mode pill (§4.1)                                                          | see below                            |
| 8   | On-page target layer (§4.4) + §4.3 `target` kind                          | see below                            |
| 9   | Bands (§3.3 / §4.4a / §15.2)                                              | see below                            |
| 10  | Big modal, keyboard map, preview bar, palette, captions, show chip        | see below                            |
| 11  | Operations sheet (§4.6) — chrome complete, sections in progress           | see below                            |
| 12  | The sheet section by section, + 12b duplicates, + 12c test contracts      | see below                            |
| 13  | QA kit into the repo; fixture enriched to 5 steps / 5 targets / 3 locales | see below (§10 #12)                  |
| 14  | Five defects from the test plan                                           | see below                            |
| 15  | Content languages are the customer's — free-form BCP-47, flags, RTL       | see below                            |
| 15b | The toolbar overflow bug — three stacked causes                           | see below                            |

### Task 5 — inspector popover (§4.3)

All seven card sections, three button sections, three media sections, three field
sections, plus the Style command menu and `Update "<name>"`. The last needed a new
session-scoped `stepStyleRecipeByStep` because a style binding is derived from a
content hash and is lost the moment any value drifts (`WIRE_DB` in
`local-frame-ui/types.ts:396`).

Field Style is grouped as **The label** / **The answer box** / **The two
together** — the user asked for label, input and joint-alignment options
explicitly. Five new persisted properties were added to
`schema/src/presentation.ts` (`labelPlacement`, `labelSize`, `labelWeight`,
`controlWidth`, `gapPx`), honoured by `sdk-runtime/src/renderers/tour-content.ts`
and mirrored in the authoring preview.

Defects fixed during it: the block inspector wrote nothing to the document (flush
guard, §8.5); the config glyph on the form field was removed at the user's request
and clicking then stopped opening the inspector (§8.4); the preview disagreed with
the runtime on label placement (§8.6); the field label was near-invisible on a
white card (wrong token fallback); the warning colour was undefined (§8.7); the
block gutter drew on top of the inspector (stale measurement + solver gutter
allowance); and the user reported the Style tab would not scroll (§8.3).

### Task 7 — mode pill (§4.1)

**Presentation** — seven gaps closed: switch track used the base graphite instead
of `surfaceRecessed`; switch buttons 2px short and a weight light; environment
word too bold; Preview and the menu button were two different chip treatments,
neither the prototype's 24px quiet chip; menu button was a text `⌄` not the
chevron glyph; collapsed pill was a solid indigo disc instead of a glass circle
with a 9px dot; presence was a word-chip where the prototype has faces.

The **menu** had no icons on any of its 25 rows, wrong surface tokens, an
unbolded current row, and the production note stretching it to 520px. Now
icon-per-row (18 new glyphs in `overlay/icons.ts`), the menu token pair, bold
current row, and 252px with the note wrapping — the note uses `width: 0` +
`min-width: 100%` so a sentence cannot drive the menu's max-content width.

**Presence faces** replace the count chip: names and initials from the presence
model, one of six hues from `CREATOR_CHROME_PEER_HUES` picked by a hash of the
creator id, capped at 3 with `+N`, and the sentence still rendered clipped for
screen readers. `presence-ui.test.ts` was updated to the new contract.

**Three functional defects, all found by driving it:**

1. **Browsing never handed the page back.** `revealIframe` wrote
   `opacity: 1; pointer-events: auto` inline, outranking the §3.3 ghost rule — so
   Browsing _and_ Picking had never once ghosted the card. It now clears those
   two properties. Verified by hit-test at the card's centre: Editing → `IFRAME`,
   Browsing → the product's `<h3>` underneath, back → `IFRAME`.
2. **`⌘⇧\` and `P` were printed but not bound.** Both are now bound on the host
   page in `mode-pill.ts`, with an `isTypingTarget` guard so the bare `P` cannot
   fire into the customer's own inputs.
3. **Keyboard map was a dead row** — it set `keyboardMapOpen`, which nothing
   reads. The prototype uses a big modal; that shell is Task 10's, and the iframe
   is too small for one. It is now a **view of the pill's own menu**, listing only
   the ten shortcuts the build actually binds. Promoted to the modal in Task 10.
   (Superseded) Task 10 carried the note to promote
   it into the modal.

### Task 8 — target layer (§4.4) and the `target` inspector kind (§4.3)

**The ring already existed.** The runtime draws `.tour-target-outline` during
authoring, from the step's own `targetOutline` — weight, colour, line, glow,
pulse, offset and follow-radius were all already wired. Building a second ring on
the host layer would have been the §3.4 rule 1 overlap, and it would have let the
authoring ring drift from the published one. So the work was what §4.4 adds on
top, and both parts are creator-only:

- **State.** `ok` / `ctx` / `bad`, published as
  `data-lodariq-authoring-target-state` on the tour host with the hue as a custom
  property, and read by two rules in `tour-styles.ts`. Nothing sets the attribute
  outside an authoring session, so a delivered tour never draws a diagnostic. The
  mapping mirrors `targetVerificationState`, so the ring and the inspector's own
  tag cannot disagree.
- **Selection.** The ring is how §4.3's `target` kind is reached. A transparent
  `.overlay-target-ring` sits on the ring's own offset and only its **border
  band** takes clicks — verified by hit-test: the middle of the ring still
  resolves to the customer's `BUTTON.btn`. The top edge is the one focusable
  stop.

`overlay/target-ring.ts` holds all of it; `panel-styles.ts` has only the band.

**§4.3's target concerns live inside the step inspector's Target section**, as
five nested rows — Ring style / Spotlight & zoom / Evidence / Approach / Repair —
in `components/target-inspector-sections.tsx`. They are _not_ a separate
selection kind: the inspector is capped at seven sections, the card already has
seven, and the cap is what keeps the inspector from becoming a panel again
(§13). Nesting also puts them next to what they are about. `step-emphasis-
controls.tsx` was deleted. Evidence reads real resolver data (accessible name,
role, landmark, capture stability, look-alike count); Approach renders the stored
legs; Repair reads the health ledger.

Clicking the ring sends `select-target` (a new shell step command) and opens the
step inspector with Target expanded — one inspector, one place for these
controls, so the toolbar has no `target` context.

**Ring colour is a colour, not a role name.** `TargetOutline` gained an optional
literal `color` beside `colorRole`; the runtime prefers the literal, and the
control is `PropertyColorField` with a `Use Brand accent` reset — the pattern the
popup surface already uses. The role enum alone offered `accent` / `ink` /
`border` / `onAccent`, which is implementation language and shows the creator
nothing about what the ring will look like.

**Three defects found by driving it:**

1. **Every ring control clobbered the previous one.** Each spread the emphasis it
   was _rendered_ with, so setting Line then Glow shipped only Glow — the
   document ended up `{weightPx, pulse}` after four edits. Controls now send only
   what changed through `patchStepEmphasis`, which merges against the live
   document two levels deep.
2. **A target in plain sight read "Needs context".** The health ledger only hears
   about explicit inspections, and nothing requested one for the selected step —
   so the inspector's tag contradicted the ring two inches away. The Target
   section now requests a health check when it renders without an observation,
   and `activateTourStep` requests one on selection. (A first attempt pushed the
   host's own resolution over a new `resolver.diagnostic` message; it lands
   before the frame's bridge starts listening, and was reverted.)
3. **The spotlight looked broken and was not.** See §8.8 — a full-viewport
   headless capture drops the backdrop's shadow.

Also in this task: the compass gained the prototype's dashed `#cmpring` and its
`#offsetline` (a dashed rule the length of the gap, with the number on it) and
matched `.cmp` metrics; the pulse dot gained the expanding halo and the `.peer`
variant driven by presence; the picking highlight became `#hilite`'s tinted fill
with a hairline, with the amber `alt` tint on crumb hover; and the hover label
became the prototype's `.hovcard` — role · name, size with the under-44×44
warning, a ruled live match count, and what a click will do.

Ring visibility was checked across modes: visible in Editing, ghosted to 0.15 in
Browsing, hidden while picking and previewing.

**Presence wiring** — there is no bridge message for presence at all. `panel.ts`
now takes it through a `LocalAuthoringPresenceServices` option (`WIRE_BE`),
`shell.ts` marks where peers arrive, and `local-dev/mock-presence.ts` is the
stand-in, off unless `?lodariqPresence=demo`.

Two colour diffs remain by choice: the switch track and the chip ink sit 3/255
from the prototype's literals, inside the rounding of `surfaceRecessed` and
`inkSoft`. Adding near-duplicate hexes would violate the token file's own
anti-drift rule.

### Task 9 — bands (§3.3, §4.4a, §15.2)

Three strips, all 1440×46 glass at an edge, all from one stylesheet:
`overlay/band-styles.ts`. The picker's two live on the host page (the bridge owns
the picker) and the lock band lives in the panel's shadow root, so a shared
`bandStyles(zIndex)` is what keeps them one component rather than two lookalikes.

**The picker was one floating card; it is now two bands.** Top: crosshair,
instruction, `Freeze page` / `Interact first` / `Cancel`. Bottom: the ancestor
breadcrumb, then `Pick bigger` / `Pick smaller` / **`Use this`**. Splitting them
is the prototype's arrangement and it separates two different questions — what
mode you are in, and what you are about to choose.

**`Use this` was missing and it mattered.** Reaching an ancestor through a crumb
or `Pick bigger` left it selected but uncommittable: the only way to commit was
clicking the page, and any pointer move over the product recomputed the trail and
threw the choice away. `Use this` commits the current candidate through the same
path a click takes, weak-target confirmation included.

**The bands take no clicks, and they step aside.** The top edge is where a
product keeps its own navigation, and that is often exactly what the creator is
pointing at. Two things together fix it, and one without the other is no use:

- `pointer-events: none` on the strip, `auto` on the buttons, so the crosshair
  and the highlight track whatever is underneath. Verified by hit-test —
  `elementFromPoint` at the top band's own coordinates returns the product's
  `<a>`.
- The band drops to `opacity: .12` while the candidate is behind it, because you
  cannot choose what you cannot see. It returns as soon as the candidate is not,
  and hovering its own buttons restores it — a child with pointer-events still
  hovers its parent. The old floating band solved the same problem by moving to
  the bottom edge, which cannot work once both edges hold a band.

**The draggable "Select an element · Esc to cancel" chip is deleted.** It sat at
`top: 24px`, directly _under_ the new top band, and said less than the band says
(no Cancel, no trail). It was the third copy of the same announcement — the
picker band's own header records that a floating pair was removed once before for
exactly this reason. The presentation-anchor picker has its own guidance card
with its own Cancel, so nothing is left unannounced. `createPickingChip`,
`attachChipDrag`, `.overlay-picking-chip`, `.target-picking-label` and both
`AUTHORING_PANEL_LABELS` strings went with it; `setPanelTargetPicking` now only
toggles the attribute.

**Step-lock band.** Host-side, driven by `stepEditability`, showing while
composing only (not Browsing, picking, preview or panels-hidden). `Ask for it`
raises a notice (`WIRE_BE` — there is no channel to deliver it on) and `Duplicate
instead` sends a new `duplicate` shell step command. `StepLockBanner`, the frame
component that had been written for this and never rendered anywhere, was
deleted, and its document-lock wording moved onto the band.

`local-dev/mock-presence.ts` now actually holds a step and clamps peers onto
steps that exist — with one step in the fixture, the old mock parked both peers
on nothing and the surface was unreachable.

**One defect found by driving it: `Freeze page` did nothing.** It pinned whatever
was already open, then reported `freeze.frozen()` — so pressing it with no menu
on screen left the button unchanged and the creator with no feedback at all. It
is a mode now: the picker's observer pins every transient layer that opens for
its whole life, which is what the button claims, and the band swaps to the
`PAGE FROZEN` tag plus `Unfreeze`.

### Task 10 (part) — big modal, keyboard map, preview bar (§4.7, §10)

**`overlay/big-modal.ts`** is the overlay's one modal: 720px, scrim, Escape and
scrim-click both close it, toasts sit above it. Drawn in the panel's shadow root,
not the frame — the frame is content-sized, this document is not.

**The keyboard map moved into it** (`overlay/keyboard-map.ts`). It had been a
second view of the pill's 260px menu because there was no modal; three rows at a
time is not a reference table. The pill's `MenuView`, `renderKeyboardMap` and the
`.overlay-mode-pill-keys` CSS are gone.

**The `keyboard-map` chrome action was dead and is deleted.** The pill drew the
map _and_ sent a bridge message that set `keyboardMapOpen` in the frame, which
nothing rendered. Removed from `schema/src/bridge.ts`, `panel.ts`,
`controller-bridge.ts` and `controller-chrome.ts`.

**`overlay/preview-bar.ts`** replaces the pill in preview, in the prototype's
order: play, scrub, captions, progress, Previous / Next step, `Edit this step`,
`Exit preview`. The first three are `WIRE_BE` and disabled (#10a). The pill is
hidden while previewing — its switch and save state are about composing. Verified
at 647×40, bottom centre, five disabled controls at 0.45, no console errors.

One defect found by measuring it: `OVERLAY_CHROME_GHOST_OPACITY` is an object
(`{browsing, peek}`), so `opacity: ${'${...}'}` on the disabled arrows resolved to
`[object Object]` and was dropped — they rendered at full strength and read as
enabled. Disabled chrome uses the bands' 0.45; the ghost token is the whole
layer's browsing dim, at 0.15.

**The command palette** is `overlay/command-palette.ts` plus its 17-row catalogue
in `overlay/palette-commands.ts`, at z 8 in the shadow root. ⌘K opens it from
either document: the frame forwards the chord over
`authoring.shell.palette-open` rather than answering it locally. It had been
bound three times — once host-side and once in each of the two frame editors —
and since focus is almost always in the frame, the palette was unreachable. The
in-frame prompt row keeps its visible route (toolbar → Assist → `Ask Lodariq…`)
and lost its stale `⌘K` hint.

**Captions** (`overlay/captions.ts`) are real, not stubs: the script lives in the
document, so only the _audio_ is missing (#10a). The preview bar's toggle is live
and `aria-pressed`, and disabled with a reason when the step has no script.

**`authoring.shell.capabilities`** tells the chrome whether assist is available.
Sent from `start()`, not from the `authoring.init` reply — the host sends `init`
before the frame is listening, so the reply-path version never arrived.

### Task 10 — card resize, five defects

All five fixed and verified per-frame across eight edges, growing and shrinking:

1. `getCardSize()` returned `cardRect` while the frame drew something else, so
   every delta was short by the difference. It reads the frame's box now.
2. Authored height was a floor (`Math.max`), so shrinking did nothing. Added
   `authoredHeight` through `frame-layout.ts` and `geometry.ts`.
3. Both axes were committed on every drag, so a width drag stamped a height and
   rounded it to the 160px minimum. `widthPx`/`heightPx` are optional on the
   bridge message and `EdgeResizeAxes` says which one moved.
4. Releasing flashed back to the old size for one frame. `holdResizeDraft()`
   keeps the drafted rect until the runtime agrees, `releaseResizeDraft()` drops
   it when it does.
5. Clamp-held corners did not move on shrink. `draftedCardRect()` compares with
   `>=` and a 1px tolerance — the runtime reports a rect a few pixels past the
   limit and the solver pulls it back, so exact equality matched nothing.

### Task 10 — assist had no way out

`accept` left the machine in `applied`, so `AssistPreview` rendered its shell with
every branch false: an empty black box that would not go away. Added a `dismiss`
action; the machine settles to idle after the write. Both surfaces now close on ✕
and on Escape — `AssistPreview` (the accept/reject panel) and `AssistPrompt` (the
one-line ask). `cancelAiAssist` bumps `assistRequestVersion` so a late proposal
cannot reopen a panel the creator has closed.

`.assist-prompt button` is an element selector and out-specifies a bare class, so
the prompt's ✕ needs `.assist-prompt button.assist-prompt-close` or it wears the
primary Ask fill.

### Task 11 — Operations sheet (§4.6)

Measured against the prototype's `#sheet` first (`qa/t16-ops-measure.mjs`), which
is what §5 asks for. The chrome is done; the section interiors are partly done.

**The sheet covers the page.** `applyOperationsGeometry` was a centred 1040×720
card with the product half-visible behind it. §4.6 is explicit that Tier 3 covers
the page _because the page is not the subject_, and the centred card cost the flow
map and the wide tables a third of their width. Full-bleed now, with a 200ms
scale-in written through the Web Animations API — the iframe is **slotted**, so it
belongs to the host page's tree and never sees a `@keyframes` declared in the
shadow root.

**The nav matches**: 214px (was 200), 12.5px / `7px 9px` / 7px row metrics (was
14px / `8px 12px` / 8px), and a distinct glyph on all sixteen rows where there
were none.

**Badges are derived, not decorative.** Check, Language, Collaboration and History
read from the one `buildCheckReport` the hub builds and hands to the section, so a
row and its section cannot disagree. `incompleteLocales` was extracted from
`publish-check.ts` for the Language count rather than duplicating the rule. Every
badge carries an `aria-label` — a coloured pill reading "11" tells a screen reader
nothing.

**Every section has an opening line**, passed as `PanelModeShell`'s `description`.
Fourteen sections is more than anyone holds in their head.

**Check** was rebuilt to the prototype's shape: the four-up tally, findings grouped
by kind rather than by step, and a publish action that prints the blocker count
when blocked.

Two pre-existing bugs surfaced on the way:

- **Operations' header had no styles at all.** `useOptionalPanelModeStyles` is
  loaded by `panel-body-mode-impl` and `release-recovery-impl` and was never
  loaded here, so the header rendered as an unstyled block — back button and
  title jammed together at 0,0. The centred modal hid it; full-bleed did not.
- **A block of `.operations-hub-title` rules sat inside the `max-width: 720px`
  media query**, so it only ever applied on narrow viewports. Removed, and that
  query got the rules it actually needs.

**Adding the header ledes duplicated five sections' own opening paragraphs.**
Removed from Templates, Audience, Share and A/B; Storyboard keeps only its
side-by-side instruction, which is not in the header line. Narration's and
Analytics' remaining paragraphs are empty states, not ledes.

#### WIRE_ audit of Task 11

- **`WIRE_BE`** — the nav's plan footer. Only the locale count is the document's
  to know; seats, live experiences, the plan name and the AI allowance belong to
  the workspace and no message carries them here. The footer prints the count it
  has and says what it is waiting for, rather than inventing a quota.
- **`WIRE_IFRAME`** — Check's `Simulate a confused user`. The `simulate-user`
  chrome action exists but only opens this section; nothing drives the page.
- **`WIRE_BE`** — Check's `Accessibility sweep`. A workspace-level report, not a
  re-run of the rules already listed below it.
- **`WIRE_IFRAME`** — Collaboration's new step-lock card. A lock is named, not
  enforced (#9a).

Both Check sweeps are **printed and disabled at 0.45 with the reason on them**,
with a note under the row, per §3 — not omitted, which is what they were before
this pass.

Not `WIRE_`, and fully wired: the badges, the tally, the grouped findings, the
publish action, the sixth template, the step-lock card's data, and the full-bleed
geometry.

### Task 12 — the sheet section by section (§4.6)

Task 11 got the sheet's _shape_ right and everything inside it wrong. This pass
matched the palette, the parts and the content, tab by tab.

**The sheet is dark.** It was rendering white. `html:has(.shell-operations)` was
handing the whole sheet the light Editorial Air palette, and two other rules
reinforced it: `.shell-panel:not(.shell-overlay)` in `advanced-shell.ts` (whose
own comment already explains this exact bug for the overlay) and a `#ffffff`
block in `rich-text.ts`. Both now exclude `.shell-operations` as well.

New token groups in `creator-chrome-tokens.ts`, because the sheet is a deeper
surface than the floating glass — nothing shows through it, so it needs its own
well/surface pair:

- `OPERATIONS_SHEET_TOKENS` — body `#0f1117`, nav `#0b0d12`, box `#141821`, plus
  the nav/meter/table/code/map values.
- `OPERATIONS_NOTE_TOKENS` — the four inline-note triples.
- `OPERATIONS_TAG_TOKENS` — status ink _lifted_ for near-black, where the
  chrome's `positiveInk`/`attentionInk`/`dangerInk` are darkened for light cards.

**One shared vocabulary, in `operations-sections.ts`.** The prototype's
`.box` / `.cols` / `.sbtn` / `.lst` / `.dt` / `.meter` / `.kv` / `.note` / `.tag`
under `ops-` names that cannot collide with the workspace's own:
`.ops-box`, `.ops-cols[data-cols]`, `.ops-btn[data-variant|data-size]`,
`.ops-list`, `.ops-table`, `.ops-meter`, `.ops-barrow`, `.ops-kv`,
`.ops-callout[data-tone]`, `.ops-tag[data-tone]`, `.ops-code`, `.ops-pill-tabs`.
Thirteen sections, zero legacy `.operations-card` / `.operations-table` left —
`t17-behaviour.mjs` asserts that count is 0.

**The shell matches the prototype.** The section's name and lede moved _into_ the
scrolling body (`.operations-hub-head`), the nav got its own `Operations` title
and full-height column, and a `.operations-hub-close` sits top-right with `Esc`
printed next to it. `OperationsHub` no longer uses `PanelModeShell`.

**The workspace footer is gone from Operations only.** The prototype's sheet has
none, and Save & exit / Preview under a sheet you have not finished with offers a
second, different way out. Every other panel mode keeps it.

**Esc now actually closes the sheet.** The Close button had been printing the
shortcut all along and nothing handled it. The handler yields to anything that
takes Esc for itself — menus, selects, dialogs, fields.

Section by section, against the prototype:

| Section       | What changed                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow map      | Pegboard well + dot grid; the node inspector was white-on-white                                                                                                             |
| Storyboard    | Pill tabs (All / Side by side / Repetition), 4-col card grid, per-card preview plate                                                                                        |
| Batch edits   | **Rebuilt.** It only showed a selection made elsewhere, so it opened empty. Now a selection table with Select all / Clear / Only the broken ones, plus five real operations |
| Templates     | 3-col grid, uppercase tags, small `Use` chip, auto-targeting note                                                                                                           |
| Language      | **Rebuilt** from a locale dropdown into the prototype's three boxes: coverage table with meters, "Still to write", per-language pictures                                    |
| Narration     | Caption on its own plate at reading size; boxes and tags                                                                                                                    |
| Audience      | **Six boxes**, up from two: added Who sees this, When it starts, visitor details, events                                                                                    |
| A/B testing   | Experiment box with two arm cards, confidence meter, success-event box                                                                                                      |
| Check         | Tally as cards, sweeps left and publish alone on the right, findings as boxes with `.ops-list` rows                                                                         |
| Analytics     | 3-up KPI cards, funnel on `.ops-barrow`, adoption with a difference column, replay + retention printed disabled                                                             |
| Review        | Rows were white-on-white                                                                                                                                                    |
| Collaboration | 2-col Presence + Step locks, then comments; avatars, thread stacking                                                                                                        |
| Share a demo  | 2-col recorded/redaction, link box, "Who watched it" table                                                                                                                  |

New `WIRE_` markers this pass: `AUDIENCE_EDITING_AVAILABLE` (`WIRE_BE` — the
frame can read `documentState.audience` and `trigger` but has no message to write
either), per-language pictures and adding a language (`WIRE_BE`), per-language
placement re-measurement (`WIRE_IFRAME`), session replay and return-rate
(`WIRE_BE`), and Share's "Who watched it".

`localeCoverage()` joins `publish-check.ts` beside `incompleteLocales()`, so the
Language meters, the Check rows and the nav badge are one measurement.

**All sixteen rows are sections.** Appearance, Release and History & recovery
used to call their panel-mode openers, which swapped the whole surface out and
unmounted the nav — three rows that navigated where thirteen switched. They
render in the sheet now. Three things had to move:

- `ReleaseVerificationMode` and `ReleaseHistoryMode` were private to
  `panel-body-mode-impl.tsx`; both are exported.
- The openers did the loading. `loadReleaseForOperations()` and
  `loadRecoveryForOperations(environmentId)` are the data half without the mode
  switch — the second still seeds the environment, the entry to focus and the
  cleared intent, which is what the section reads.
- **`useOptionalPanelModeStyles()` is load-bearing here.** Every card, list and
  status row those three draw lives in that stylesheet. Without the call they
  render as bare markup — a numbered list where the steps should be. The hub
  calls it again; it was dropped when Operations stopped using `PanelModeShell`.

Inside the body the nested `PanelModeShell` flattens: the header is hidden (the
sheet's own head already names the section, and its back button would close a
mode nobody is in) and the body keeps its grid but gives up the scroll and the
outer padding.

The three openers are shared with the chrome actions and the command palette, so
each now routes by context: **a section when Operations is open, a mode when it
is not**. Check's "Publish to staging" is the in-sheet caller that proves it —
it lands on the Release section rather than leaving the sheet.

### Task 12b — duplicates removed, and the last light surfaces

Three surfaces were saying the same thing twice.

**Review lost Placement and Edit details.** Placement rendered the _same_
`StepPlacementEditor` the card's own property tray does — one component in two
places, and the card is where you are looking when you care about placement. Edit
details opened the review-and-preview aside, not step settings: its preview
buttons are on the toolbar, its issue list is Check, and its support package is
one of Advanced's four links. Its label promised something it never showed.

**Check absorbed the publish gate.** Release ran `validateTourPublishReadiness`
and Check did not, so Check's own opening line — "everything that must be true
before this can publish" — was false, and a creator could clear Check and still
be refused. `readinessRows()` is now the first group in `buildCheckReport`,
deduped against `targetRows` via `TARGET_CODES_ALREADY_REPORTED` so one missing
target is one row. Only then could Release drop its list for a count plus **Take
me to Check** — pointing at a report that did not carry the problem would have
been worse than the duplication.

**The last light surfaces.** Rather than chase them one screenshot at a time,
`t19-light.mjs` walks every element in every section and reports anything whose
background is light. It found the flow map workspace/toolbar/buttons, the branch
workbench's rule, condition and fallback cards, Review's back button, and one
nobody had reported (the `Pan` tool). All fixed; the scan now returns only the
indigo accent.

**Dropdowns were the interesting one.** `CHROME_MENU_SURFACES` gave the dark menu
palette to `html:has(.shell-overlay)` only, so every select in the sheet fell
through to the light workspace rule. Now both roots. Note for anyone testing a
select: the trigger toggles on **pointerdown**, so a synthetic `.click()` never
opens it and a probe that uses one will report a false pass.

### Task 12c — the test contracts those changes broke

Eight of ten failures across `footer-actions.test.ts` and
`authoring-frame.test.ts` were mine, and each encoded a contract this work
deliberately changed. Updated rather than worked around:

- The footer tests reached a footer by opening **Operations**, which no longer
  has one. New `openPanelRelease()` helper opens a mode that does; the sheet is
  now asserted to have _no_ footer and a Close instead.
- `panelModeView()` found a mode by its back button. The sheet has none, so it
  falls back to `.operations-hub-body`.
- The appearance-return test asserted a mode swap; it now asserts the nav
  survives and the sheet's head names the section.
- Two tests drove `Edit details` and `[data-review-row="placement"]`. Both rows
  are gone, so they assert the three that remain and that Edit details is absent.

**Two failures are not from this work** and were left alone:
`keeps Open page fields…` (a missing `Button label` input) and
`progressively discloses placement…` (the first postMessage is now the
capabilities handshake, not the inspect request). Both live in the staged
targeting changeset — `rich-step-content-editor.tsx`, `target-picker.ts`,
`rich-content-block-inspector.tsx` — which this work never touched.

**A trap worth naming.** A `str.replace` on `"  .panel-mode-disclosure {\n"`
matched inside the selector list `.panel-mode-card, .panel-mode-section,
.panel-mode-disclosure {` and split it, so `.panel-mode-card` silently lost its
display, padding and background. Every card in Appearance, Release and History
went unstyled and nothing failed — the sheet still rendered. Anchor edits on
something that is actually unique.

### Review remediation — the targeting changeset

Fifteen findings from `/code-review` on the working-tree targeting work, all
addressed. The ones worth knowing:

- **SPA delivery was silently dead.** ADR-0027 prunes `urlMatch` manifests
  against the landing URL, and the loader bootstraps once. A visitor landing on
  `/` and routing to `/settings` never got the experience.
  `activation/page-navigation-watch.ts` re-asks on a pathname change; an
  installed runtime is never torn down.
- **A probe sample discarded the creator's disambiguation answer** —
  `pendingWeakResult` was rebuilt without `selection`.
- **The capture tie set was exact-score equality; the resolver ties on a band.**
  An ordinal answer was counted in a narrower set than it was applied to.
  `ambiguousCandidates` now mirrors `requiredRunnerUpMargin`.
- **`isInsideCollection` missed div-based card grids and stopped at shadow
  boundaries**, so positional evidence was admitted into real collections.
- **`mergeCaptureSamples` re-added `sibling-position`** that
  `initialSignalFamilies` had withheld; merging may now only remove a family.
- **The ordinal answer could exceed the schema's cap of 50**, so the creator's
  only unblocking answer failed validation.
- **`currentAmbiguousCandidates` ran a whole-page scan on every pointermove.**
  Memoised per element.

Not changed, deliberately: `any-matching` still fails closed when the visitor's
locale was never captured. That is the module's stated contract — a wrong element
is worse than an honest abstain — but the result now carries `locale_unverified`
instead of a generic ambiguity reason, so the cause is legible.

### Task 14 — five defects from the test plan

1. **Check called un-inspected targets broken.** The health ledger only records
   _explicit_ inspections, so `unverified` means "nobody has looked", not "looked
   and failed" — but `targetRows` reported it as a finding. Both `targetRows` and
   `translationRows`' target overrides now skip it, on the stated rule _never
   looked at is not a finding_. `tour-batch-workspace.tsx`'s **Only the broken
   ones** had the same bug and would silently select every unexamined step.
2. **Nobody was requesting the inspections in the first place**, which is why
   #1 was reachable at all. Check and Batch each needed the same effect, so it is
   one hook — `local-frame-ui/use-target-inspections.ts`. It carries a `useRef`
   guard: the first version had `snapshot.targetHealth` in its deps and
   re-requested forever, which broke `renders the check section`.
3. **The coach toast occluded every section's lede.** It was `position: fixed;
top: 14px`, landing exactly on the sheet's opening line. Moved to the bottom,
   above the caption strip when one is showing
   (`.overlay-captions:not([hidden]) ~ .overlay-toasts`), with the entry
   animation flipped to match. A `:has()` version was tried first and reverted —
   a HEAD-revert baseline proved the 7 failures it seemed to cause were
   pre-existing, but the sibling selector is the safer construct anyway.
4. **Storyboard's lede described a feature that does not exist.** Rewritten, and
   the string re-translated across all 8 catalogs.
5. **`stableAttributes` was required and almost always empty.** Now
   `Type.Optional(...)` in `schema/src/target.ts`, with `?? {}` guards at the
   five read sites (`publish.ts`, `resolve.ts`, `preview-document.ts`,
   `utils.ts`, `controller-bridge.ts`) and the seven pointless `stableAttributes:
{}` literals removed from the fixture and `marketing/src/demo/meridian-tour.ts`.

**And a correction to the record.** Three tests in `authoring.test.ts` had been
written off in an earlier session as "flaky". They failed 5/5. The cause was real
and left behind by the chrome migration: `[data-panel-document-title]` was
removed but its wiring was not — `panelDocumentTitle`, `commitOverlayTitle`,
`onTitleCommit`, the `shell.ts` input listener and keydown handler, and
`setDocument`'s second parameter. All deleted. §8.21 is the lesson.

### Task 15 — content languages are the customer's

Started as "add locale switching to the test plan" and turned into an
architectural correction. §4a has the principle; this is what changed.

**`authoring/content-locales.ts` is new** and replaces `PRODUCT_LOCALES`
everywhere in the content path:

- `canonicalContentLocale()` and `CONTENT_LOCALE_PATTERN` both live in
  `packages/schema/src/document-localization.ts` and validate **shape, not
  membership**. `PT_br` canonicalises to `pt-BR`; `not a language!!` is refused.
- `contentLocaleLabel()` gives the endonym — 日本語, not "Japanese" — through
  `Intl.DisplayNames`, with `standaloneCase()` on top because CLDR returns the
  sentence form and a list of _"français, español, italiano"_ reads as a list of
  typos. Falls back to the bare tag, which is the honest answer for a tag `Intl`
  has never heard of. Never throws, never refuses.
- `contentLocaleSearchText()` matches on endonym, English name and tag alike, so
  "Japanese", "日本語" and "ja" all land.
- `contentLocaleFlag()` — see the deviation in §11. Region from the tag, else
  `maximize()`, else 🌐.
- `contentLocaleDirection()` — 10 RTL languages, handling tags carrying a region
  or script (`ar-EG` → rtl, `zh-Hans` → ltr).
- `CONTENT_LOCALE_SUGGESTIONS` is **typeahead, not a gate.** 74 base languages,
  one entry per language. Absent from it means not _suggested_, never refused.

**The selector takes free-form input.** `design-system/select.tsx` gained
`search.custom { accept, label }`: when the filter empties, the typed query
becomes a committable row, Enter takes it, and `NativeSelectMirror` renders the
extra `<option>` so the value is not lost. `triggerLabel` lets the trigger say
something other than the current value, which is what makes an _action_ out of a
control that otherwise reads as a filter.

**`setContentLocale` used to return silently on a tag it did not like**, so a
rejected tag was indistinguishable from a dead control. It now says so:
`{locale} is not a language tag Lodariq understands.`

**Adding a language never needed a backend.** The disabled button and its
`WIRE_BE` were built on a false premise — `mutableVariant()` creates a variant
locally. `addAuthoringDocumentLocale()` writes an empty variant so the language
appears in the coverage table at 0% immediately, rather than after the first word
is typed. The control is now a `ContentLocalePicker` with a `Plus` icon and an
explicit **Add a language** label.

That control shipped once as an unlabelled `English ⌄` dropdown and was reported
working on the strength of a non-null `querySelector`. It read as a view filter,
and picking a language produced nothing visible. §6's fourth trap is the lesson.

**RTL authoring.** `RichContentEditor` takes a `contentLocale` prop and stamps
`lang`/`dir` on `.rich-content-canvas-shell` — _not_ on `ContentEditable`, which
silently drops it (§8.18). Verified `ltr` → `rtl` on switching to `ar`, with the
Continue button flipping to the right edge of the card.

**The runtime's variant matcher was non-deterministic**, in
`sdk-runtime/src/document-localization.ts`. A visitor on `en-AU` with both
`en-GB` and `en-US` present got whichever came first in array order. It now
prefers an exact base match, then the shortest tag, then alphabetical — and
`buildCheckReport` gained `localeShapeRows()`, which warns when a document has
two or more region variants of a language and no plain one, because that is the
shape where a reader elsewhere gets one picked for them.

Verified end to end: a `ja` variant created with `fallbackLocale: "en"` holding
`プロジェクトを作成しましょう`. The matcher test fails 2/5 against the old
matcher and passes 5/5 against the new one — it was checked that it catches the
bug, rather than assumed.

### Task 15b — the toolbar overflow bug

Reported twice with screenshots (_"I see this fucking bug again about items
getting hiddne in the toolbar on resize"_). It was **three stacked bugs** in
`editor/rich-content-selection-toolbar.tsx`, and fixing any one alone left it
broken:

1. A missing dep in the effect's array, so the pass did not re-run.
2. Natural widths were measured while items were still hidden, reading 0. Fixed
   by un-hiding everything first and keeping a running `Math.max` (§8.19).
3. The loop kept trying subsequent items after the first that did not fit, so a
   narrow control could slip in after a wide one was dropped, and a divider could
   survive the whole group it separated. Now it stops at the first miss and
   sweeps trailing dividers.

Plus `flex: 0 0 auto` on non-spacer children in
`styles/agreed-content-properties.ts` — they were shrinking instead of
overflowing, which is why it looked like clipping rather than collapse.

Proved by `t27-toolbar-overflow.mjs`, which sweeps widths and asserts
`scrollWidth === clientWidth` at each one, that **More** stays reachable, and
that the collapse is reversible on widening.

## 10. What is left

**#10a — play and the scrub on the preview bar are printed, not wired.**
Both are drawn and disabled at 0.45 with the reason on them (`WIRE_BE` in
`overlay/preview-bar.ts`): narration _audio_ is not in the immutable artifact yet,
the same gap `PlaybackControls` carries in `components/step-narration-section.tsx`.
Captions are no longer in this gap — the script is in the document, so they work.
The player exposes no clock to this document either, so prev/next replay from the
neighbouring step rather than seeking.

**#10b — the palette's ask cannot reach a step the frame has not selected.**
`askFromChrome` refuses with a notice rather than guessing. Nothing is wrong with
that, but a creator who opens the palette before selecting anything gets a toast
where they expected an answer.

**#10c — four palette rows open a section instead of doing the thing.** The
prototype fires the verb as well (`openOps('appearance'); runBrandSampler()`);
`open-operations` carries a tab and no verb, so the rows land you where the
operation lives. `WIRE_IFRAME` in `overlay/palette-commands.ts`.

**#11 — two tests fail _in `authoring-frame.test.ts`_.** `keeps Open page fields…`
(a missing `Button label` input) and `progressively discloses placement…` (the
first `postMessage` is now the capabilities handshake, so `mock.calls[0]` no
longer holds the inspect request). Both exercise the staged targeting changeset —
`rich-step-content-editor.tsx`, `target-picker.ts`,
`rich-content-block-inspector.tsx` — which the chrome work never touched.

They are long-standing and have been failing since before the chrome work — not
a regression from it, and not a blocker. Earlier revisions filed them under
"whoever owns that change"; in practice that is this branch and this tree, so
treat them as available to pick up whenever the targeting work is next opened.

⚠️ **Do not read that as "the suite is otherwise green."** A full
`npx vitest run` fails **~170–210 tests across ~62–67 files**, and has for the
whole of this work. Most of it is environmental: the `api/` package alone
accounts for over half, failing with `expected 401` and 5s timeouts because
there is no database or auth in this environment. The count **moves by 10–40
between identical runs**, so a single number means nothing.

If you are about to change something broad, do what §7 says and take a baseline
first — capture the failing _test names_, not the count:

```bash
npx vitest run > /tmp/baseline.txt 2>&1        # never pipe through `tail`
grep -E "^ FAIL " /tmp/baseline.txt | sed 's/^ FAIL  //' | sort -u > /tmp/baseline-tests.txt
# …make the change, re-run into after.txt, then:
comm -13 /tmp/baseline-tests.txt /tmp/after-tests.txt
```

Anything that surfaces outside `api/` is yours. Anything inside it probably is
not — confirm by checking whether the failure is an assertion or a timeout.

**Last measured baseline: 63 failing test _files_ before Tasks 14–15b, 60 after
— zero new failures.** Use the file-name diff, not the count. Two further notes
from taking it a dozen times:

- **Rebuild before you baseline.** A `git show HEAD:path` revert with a stale
  `dist` measures nothing (§8.17).
- **One run is not evidence** (§8.21). `footer-actions.test.ts` surfaced as new
  once and passed 3/3 in isolation and on the next full run. Conversely, three
  `authoring.test.ts` failures dismissed as flaky failed 5/5 and were real.
- `zsh` does not word-split an unquoted `$FILES`. Write the list to a file and
  `while read` it.

**#12 — partly closed. Language is done; two sections remain, not three.**

The fixture was enriched in place (`packages/schema/fixtures/tour.linear.v1.json`):
**5 steps, 5 targets, 3 locale variants** at deliberately uneven coverage — `de`
100%, `fr` 60%, `es` 20% of 15 translatable strings. That was enough to render
Language populated for the first time: the coverage table, the per-row meters
(green/amber/red by coverage), "Still to write", and the nav badge all agree,
because they are one `localeCoverage()` measurement. Storyboard picked up a real
5-card grid and Check went from 5 boxes to 7. Driven by
`qa/t21-language.mjs`.

**A second fixture document was _not_ the right shape, and the earlier note here
was wrong to say it would close all four.** Only Language reads from the
document. The other three come in over the Operations service boundary:

| Section          | Reads from                                      | What it needs                                                                  |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| ~~Language~~     | `snapshot.documentState.localization.variants`  | ✅ done                                                                        |
| Analytics        | `operations.readAnalytics(environmentId)`       | `readAnalytics()`                                                              |
| Collaboration    | `snapshot.presence.peers` + `snapshot.comments` | presence ✅ exists (`?lodariqPresence=demo`); **comments have no mock at all** |
| ~~A/B testing~~  | `snapshot.experiment` / `experimentResults`     | ❌ **not a fixture problem** — see below                                       |
| ~~Share a demo~~ | capture + link state                            | ❌ **not a fixture problem** — see below                                       |

**A/B and Share are deliberately inert, and a mock must not "fix" them.**
`operations-experiment.tsx` has `EXPERIMENT_DELIVERY_AVAILABLE = false` and
`operations-share.tsx` has `DEMO_CAPTURE_AVAILABLE = false`. Both gate on seams
that genuinely do not exist — the control plane does not assign an arm, delivery
does not resolve `overridesRef` or stamp `armId`, and there is no host-page
capture bridge. Feeding them mock data would make a surface that cannot work look
like it works, which is the precise failure mode §3's printed-and-disabled rule
exists to prevent. Leave the flags alone.

So the remaining work is **one `local-dev/mock-operations.ts`** implementing
`AuthoringOperationsServices` (13 methods,
`authoring/operations/operations-services.ts`), passed through
`panel.ts`'s existing optional `operations?:` option — verified present at
`panel.ts:189` and dispatched at `panel.ts:1676`, the same seam `presence` uses
at `local-dev/install.ts:150`. Follow `mock-presence.ts` and gate it behind a
query param so the default fixture screenshots stay trustworthy.

Scope it to `readAnalytics` and the three comment methods (`listComments`,
`addComment`, `resolveComment`). That is the whole of the honest gap.

**Enriching the fixture cost eight test-contract updates**, all of them
assertions that had hard-coded the old poverty (`toHaveLength(1)`,
`'1/1 verified'`, `['block_step_1']`). They were rewritten to derive from the
fixture instead of naming a number, so the next enrichment does not re-break
them. Two composed on the fixture in ways worth knowing:
`reliability-primitives` compared a one-step flow map against a whole-document
analysis, and `schema/publish.test.ts` gave a diagnostic to one target while
asserting no other target was unverified.

Two things you might read as gaps are decided deviations, not work: Check has no
"Predictive layout QA" button, and the flow map keeps its own shape rather than
the prototype's Entry / Branches / Test-user boxes. Both are in §11 with the
reasoning — do not re-open them.

## 11. Deviations the user has already decided

Do not re-litigate these:

- **Placement** stays in the toolbar only, not duplicated into the inspector.
- **Gap** stays token-valued rather than free numeric.
- **Screen region** is out.
- **Flip-if-it-does-not-fit** is a note, not a control.
- The card's **extra capabilities** (Border weight, Content alignment, Pointer
  arrow) stay in the Style section — the user called them "important configs".
- ~~The pill keeps its preview-mode rendering.~~ Resolved in Task 10: the pill is
  hidden in preview and `overlay/preview-bar.ts` draws §4.7's bar instead.
- The **ring is one element, drawn by the runtime**, not a second one on the
  authoring layer. See §9's Task 8 note.
- §4.3's **`target` selection kind is deliberately not registered.** Its six
  sections are nested inside the card's Target section instead, because the
  seven-section cap has no room and the user asked for them to be findable
  without hunting for the ring.
- The **hover card is anchored to the element**, not to the cursor, so the
  prototype's pin has nothing to fix and is left out.
- The **bands are pointer-transparent and ghost out of the way**. The prototype's
  bands take clicks and never move; ours cannot, because ours cover a real
  product's own navigation rather than a mock inset in a stage.
- **`Interact first` stays on the top band.** The prototype has no such control —
  it is the SDK's visible form of alt-click, and it belongs with `Freeze page`
  because both are about what the page does while you pick.
- The picker's bottom band **starts at the step's current target**, not at the
  prototype's bare `Page`, when the step already has one.
- The **pulse dot stays on the target's top-left**, where Task 5 put it, rather
  than the prototype's top-right corner.
- The **Operations sheet has no workspace footer.** The prototype's does not
  either, and Save & exit / Preview under a surface you have not finished with
  offers a second, different way out. Close and Esc are its exit; every other
  panel mode keeps the footer.
- **The experience-title field lives in the sheet's nav.** A build addition — the
  name is document-scoped, so it sits with the document's other settings rather
  than in the filmstrip, which is about steps.
- **Check has no "Predictive layout QA" button.** The prototype makes it an
  action; here the pass runs on every render and its findings are already listed
  below it. Omitted rather than printed-and-disabled, because "disabled because
  it already happened" is not a reason anyone can act on.
- **The flow map keeps its own shape.** The prototype puts Entry / Branches /
  Test-user boxes under the canvas; the build has a ReactFlow canvas with a node
  inspector and a branch workbench, which is richer. It is the one section not
  rebuilt on the shared `ops-` vocabulary.
- **Review keeps only its three flow-level settings.** Placement rendered the
  same `StepPlacementEditor` the card's property tray does, and "Edit details"
  opened a review-and-preview aside rather than the step settings its label
  promised. Both removed in Task 12b.
- **Check carries the publish gate.** `validateTourPublishReadiness` is a row
  kind in `buildCheckReport`, deduped against the target rows. Release states the
  count and links here rather than listing the same issues again.
- **Language selectors keep their flags.** I argued against this — flags are
  countries, languages are not, and `en` → 🇺🇸 or `ar` → 🇪🇬 is imprecise by
  construction. The user overruled it: _"Dude, the flags are easier to identify,
  put them back FFS"_. They are right about the thing that matters — a flag is
  picked out of a list far faster than a two-letter code, and the tag and endonym
  sit beside it to carry the precision. `maximize()` at least makes the
  imprecision CLDR's rather than ours, and 🌐 covers what it cannot place so no
  row is ragged. This applies to the dashboard's `LOCALE_FLAGS` too. **Settled —
  do not raise it again.**
- **The option label is `FLAG TAG`, upper-cased, with the endonym beneath.**
  The user's spec: _"Make the label of eash option be Flag + Abbreviation but the
  search should work on abbreviation and the full language name"_. The label is
  upper-cased for legibility only — the **stored value stays canonical**, so
  `pt-BR` is written `pt-BR` in the document, not `PT-BR`.
- **Suggestions carry one entry per language, not region variants beside it.**
  `en-GB` next to `en` reads as a duplicate and doubles the list to scan. Anyone
  who genuinely needs to separate British from American copy types the tag and the
  free-form row takes it. `zh-Hans` / `zh-Hant` stay — those are writing systems,
  not accents. The removal is cosmetic: it narrows what is _suggested_, never what
  is accepted.
- **There is no gate on what language a creator may author in.** See §4a. Shape
  validation only. A future "supported languages" list in the content path is a
  regression, not a feature.
- **The Operations sheet's A/B and Share sections stay inert.** §10 #12.
