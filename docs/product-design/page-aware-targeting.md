# Making steps know which page they belong to

> **Steps 1–3 are built.** The page address, the saved field, the check, and
> capture recording it. See "What is built" near the end for what that covers and
> what it does not. Steps 4–6 are still to do, and step 4 matters before anyone
> uses this.

## The short version

When someone picks a button for a tour step, we save what that button **looks
like**. We never save **which page they were on**.

So later, on a different page, we go hunting for something that looks similar —
and we find one, because most apps have a button in roughly the same place. The
step points at the wrong thing and never notices.

The fix is to also save the page address, and check it before we match.

## How we found this

Someone authored a small tour by hand: step 1 on the Dashboard pointing at the
**New report** button, step 2 on Projects pointing at **Create project**. Two
steps, two pages. Nothing unusual.

Four things went wrong.

**Preview couldn't handle two pages.** Starting from Projects, preview opened at
"2 of 2" and quietly skipped step 1. Going back to step 1 killed preview
completely, with the message _"Preview stopped: this step points at something
that is not on this page."_ So you can't preview a two-page tour from start to
finish.

**Preview left the editor confused.** After it stopped, the step list and the
status bar both said "Step 1" — but the card on screen showed **step 2's**
words.

**There's no way to say which page a step is for.** Two buttons on the page were
both called "New report", so we asked which one they meant. The choices were:
any button with that name / the second one / any of them / just the one I
clicked. All four are about _this_ page. None of them says "the one on
Dashboard".

**And here's what we actually saved for step 1:**

```jsonc
{
  "name": "New report",
  "tag": "button",
  "stableAttributes": {},
  "context": { "ancestorRoles": ["main"] },
}
```

Read that last line: "inside the main area". That's the only clue about location
we keep. On the Billing page, the invoices table is also "inside the main area" —
so a step built for the projects table will happily latch onto it.

This isn't a bug in how we score matches. We simply never wrote down the
information that would rule the wrong answer out.

## Why the existing check never ran

Here's the surprising part: **a check already existed.** Someone built it a while
ago. It compares the page a target was made for against the page you're on now,
and refuses to match if they differ.

It never ran, for two reasons:

1. **Nothing fills in the page when you pick a target.** The code expects the
   customer's own app to hand us a page name through a callback. No app we have
   does that, and expecting every customer to wire it up isn't realistic.
2. **Nothing fills in the page at the other end either.** There's a slot for
   "what page is the visitor on right now" and nothing ever sets it.

So it's a feature that needs customer setup, and no customer sets it up.

We don't need them to. We can read the page address from the browser ourselves.

## What we'd build

### 1. Work out the page address

One short piece of text that describes the page, worked out the same way in both
places — when you pick a target, and when we go looking for it later.

We already have this code. It reads:

- the path (`/projects/all`)
- plus the `#/...` part, if the app uses that style of address
- and it **ignores anything after a `?`**

That last bit matters a lot. The stuff after `?` is things like search terms,
sort order, which row menu is open, and session IDs. If we included it, a step
would break every time someone sorted a column.

### 2. Save it with the target

Add the page address to what we save when someone picks a button, plus whether it
should match the page **exactly** or just the **start** of it.

"Start of it" is there for addresses like `/projects/123` where the number
changes. We can't guess that from one example, so we'd save "exactly" and let the
author loosen it if they need to.

### 3. Check it before matching

One check, in the one place all target-matching goes through. If the target says
it belongs to `/projects` and you're on `/billing`, we stop right there and say
"not found" — before we even start looking at buttons.

Putting it in that one spot means it covers everything at once: playing a tour,
the editor, click-for-me steps, and end-of-tour actions.

### 4. Give authors a control

There needs to be a switch in the step settings: **only on this page** /
**pages starting with...** / **any page**.

"Any page" is a real need. A step pointing at the top nav or a help button
genuinely belongs everywhere. So this can't be automatic and silent.

Two smaller things while we're there:

- The step list shows a red "can't find" dot for a step that's off-page. That's
  the same dot we show for a genuinely broken target. Those are different
  problems and shouldn't look identical.
- Once steps know their page, the "two things look alike" question mostly stops
  being asked, because the lookalike is usually on a different page.

### 5. Preview has to walk you to the next page

Today, preview stops dead when a step isn't on the current page. **This change
makes that stricter, not looser** — more steps will be correctly judged
off-page.

**Built, and not only in preview.** Advancing to a step that belongs to another
page takes you there and then shows it. Pressing Preview when the _first_ step is
elsewhere does the same, and so does selecting a step in the filmstrip — picking
a step means "show me this one", which cannot happen off its screen.

Two mechanisms, and they failed independently: selecting navigates from the
authoring side, advancing navigates from the runtime. Only the first was wired,
so the preview toolbar worked and the card's own Continue did nothing. `t38`
drives all three from the creator's controls for that reason.

Only on the way **into** a step, never on a page change. Leaving is the visitor's
own move and still just suspends — navigating on every mismatch would drag anyone
who wandered off straight back, with no way out.

It never reloads, so it only makes moves a client-side router answers: a hash
change for a hash route, `pushState` plus `popstate` otherwise. If the
application does not follow, the step fails to anchor exactly as before rather
than hanging.

Cost: +224 B gzipped on `runtime+tour`, budget raised 52 KiB -> 53 KiB.

## The one that actually worries me

Most of the time, a step matching the wrong element just shows a card in a silly
place. Annoying.

But there are two places where we don't only _show_ the step — we **click the
button for the person**:

- "click this for me" steps
- the action at the end of a tour

On the wrong page, that clicks some unrelated button in the customer's live app.

The fix I already shipped (hiding a step's card when you leave its page) does
**not** help here. It hides the card, but the matching still happens underneath,
so the click still lands. Only checking the page during matching stops it.

If we only do one thing from this document, do this one.

## Modals are a separate problem

**Opening a modal usually doesn't change the page address.** So none of the above
helps with modals.

There's a matching idea for app state ("the invite dialog is open") that has the
same problem as the page one — it exists, nothing fills it in. But working out a
state name automatically is much harder than reading the page address, because
there's nothing in the browser that tells us "a modal is open".

Some options, none obviously right:

- remember which dialog was open when the target was picked, and require the same
  dialog to be open when matching
- just record "this was inside a modal" as a yes/no
- leave it needing customer setup and accept modal steps stay weaker

My suggestion: **leave modals out of this piece of work.** Do pages first, prove
it, then design modals separately.

One warning for whoever tests this: our fixture app puts modals _in_ the page
address, which is unusual. Testing only there would make modals look fine when
they aren't. Test on an app whose modals leave the address alone.

## Existing tours

Tours saved before this change have no page recorded. The check is skipped and
they behave exactly as they do today. They pick up page-awareness the next time
someone edits them.

One note for whoever writes the code: adding the page field means also adding it
to the strict data check in `target-runtime.ts`, which only accepts a fixed list
of known fields. Miss that and the new field gets rejected.

## Order of work

1. ~~Move the page-address code somewhere shared, and test it — especially that
   it ignores everything after `?`.~~ **Done.**
2. ~~Add the page field, the check, and the "what page am I on" plumbing.~~
   **Done.**
3. ~~Save the page when someone picks a target.~~ **Done.**
4. Author control, step-list badge, tidier lookalike question.
5. ~~Walking you between pages.~~ **Done**, in preview and in delivery.
6. Modals — separate design.

## What is built

The mechanism works end to end. Picking a target now saves the page it was
picked on, and the resolver refuses to match anywhere else — checked in the
browser against the real editor, not only in tests.

Three things are worth knowing about how it turned out.

**Nobody has to wire anything up.** The old check waited for the customer's app
to tell us the page name, which is why it never ran. This one reads the address
from the browser itself. If a host wants to name the page instead, it still can.

**The badge already says the right thing.** A step that is off-page shows
**"Needs context"**, not "Cannot find" — those are different problems and they
now look different. That came free: the page check reports the same reason code
the old route check did, and the editor already knew how to read it.

**Old tours are untouched.** In the same editor, on the Billing page, a step
saved before this change still says "Verified" while a step saved after it says
"Needs context". Both are correct. Old steps gain the page the next time someone
picks their target again.

### Three other things that got in the way — now fixed

None of these were page scope. All three showed up while trying to author and
play one two-page tour, and each one on its own stopped you finishing.

**Deleting a step broke the document.** The translations for the deleted step
stayed behind and the document then refused to compile —
_"Document localization is invalid: unknown_block"_ — so the tour would not play
at all until someone removed them by hand. Every place that removes blocks now
goes through one function that takes the step's targets and its translations
with it.

**The look-alike answer did not stick.** This turned out to be three separate
leaks, each dropping it the same way — by rebuilding a target from a message
that only carries evidence:

1. The next evidence sample after the pick rebuilt the target without it. The
   probe keeps sampling for a while, so the answer was usually gone within a
   second of being given.
2. The patch that tells the host about the new target never carried it, and the
   host's copy can become authoritative after a conflict.
3. The compiler left it out of the delivery artifact entirely.

Number three is the serious one. The publish gate refuses an ambiguous target
without an answer — and then compilation dropped the answer, so **every
published tour that needed one shipped without it.** The resolver saw the
ambiguity, abstained, and the step never anchored.

**Playing a locally authored tour showed an empty card.** Same root cause as
above: the target was ambiguous because its answer had been discarded, so
nothing could anchor and the card stayed hidden.

### Two gaps in this work itself

- **There is still no way to say "any page".** Every newly picked target is
  scoped to the page it was picked on. That is the safe default, but a step on a
  top nav or a help button genuinely belongs everywhere, and today the only way
  to get that is to not re-pick the target. **Step 4 needs to land before this is
  usable.**
- **Preview still cannot walk you between pages** (step 5), so a multi-page tour
  still cannot be tested end to end.

### A two-page tour, walked

The thing someone actually authors. Step A on Projects, step B on Billing,
played on the fixture application.

|                                   | With the page saved | Without it (every older tour) |
| --------------------------------- | ------------------- | ----------------------------- |
| Step B while still on Projects    | out of the way      | **shows, pointing at Import** |
| Step B once you reach Billing     | appears             | **blank**                     |
| Step B if you go back to Projects | stands down         | —                             |

Without the page, the tour is wrong in both directions at once: it appears on
the page it does not belong to and disappears on the one it does. No
target-availability check can catch it, because every button involved is on
screen the whole time.

`node docs/product-design/prototypes/qa/t37-cross-page-tour.mjs` runs exactly
that walk, control included.

How the rest was checked:

- `node docs/product-design/prototypes/qa/t36-page-aware-targeting.mjs` — the
  built resolver, on a host with the same button on two screens at once, neither
  ever removed. The interesting line is the one showing that _without_ a page
  recorded it takes the wrong button.
- Unit tests for the key, the resolver gate, capture, and the end-of-tour click.
  The click one was confirmed to fail without the gate: it really does press an
  unrelated button.
- By hand in the editor on the fixture app: picked a target on Projects,
  confirmed `page: { key: "/#/projects/all" }` was saved, then watched the same
  target refuse to resolve on Billing and on Reports while a sort and an open
  dialog left it alone.

## Still to decide

- Do we need "pages starting with..." in the first version, or is "exactly this
  page" plus an author switch enough until a changing address actually causes
  trouble?
- When the page doesn't match, should the visitor just see nothing (safer during
  a live tour), or should the author see a warning (more useful while building)?
  Possibly both, depending on who's looking.

## Where the code is

| What                                                      | Where                                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The page address, shared by everyone                      | `packages/schema/src/page-key.ts`                                                                                                        |
| The check                                                 | `packages/sdk-runtime/src/resolver/resolve.ts` — `validateResolutionContext`                                                             |
| The field                                                 | `packages/schema/src/target.ts` — `TargetPageScope`, on `TargetContext`                                                                  |
| The strict data check                                     | `packages/schema/src/target-runtime.ts` — `hasTargetPageScopeEnvelope`                                                                   |
| Where the page gets saved                                 | `packages/sdk-authoring/src/bridge/targeting/capture.ts` — `capturePageScope`                                                            |
| Where the editor drops a stale off-page check             | `.../local-frame-ui/controller-target-document.ts` — `handlePageLifecycleUpdate`                                                         |
| Taking the creator to the page Preview starts on          | `packages/sdk-authoring/src/authoring/preview-page-navigation.ts`                                                                        |
| Deleting a step's targets and translations with it        | `packages/sdk-authoring/src/authoring/document-ops.ts` — `documentWithBlocks`                                                            |
| The three places the look-alike answer used to be dropped | `controller-target-document.ts` (evidence update), `preview-document.ts` (`attachTarget`), `packages/compiler/src/compile.ts` (delivery) |
| Watching for the page changing while a tour plays         | `packages/sdk-runtime/src/renderers/tour-page-scope.ts`                                                                                  |
| The two places we click for the user                      | `renderers/tour.ts` (`activateCompletionTarget`), `renderers/tour-choreography-runtime.ts` (`activateTarget`)                            |
