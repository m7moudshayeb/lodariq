# Task: two-scope experience list, and reaching multi-page tours locally

Two requests from Shayeb after authoring a working 3-step tour against a real
application (SocialHub) through the fixture-host proxy. They are very different
sizes — do them in order and stop between.

**Standing constraints:** do not commit, do not push, do not run `pnpm format`,
do not run the full `pnpm verify`.

---

## 1. Experience list: two scopes, "On this page" then "All tours"

Today `listLocalPageExperiences` (`packages/sdk-authoring/src/local-dev/install.ts`)
filters the creator index to `entry.routeKey === routeKey` and returns one flat
page. Shayeb wants two accordions, in this order:

1. **On this page** — current behaviour, unchanged, expanded by default.
2. **All tours** — every experience in the workspace regardless of route.

### This is shipping UI, not local scaffolding

The list renders in `packages/sdk-authoring/src/experience-menu/flyout.ts`,
driven by `listExperiences` in `experience-menu/types.ts`. So this change carries
the obligations that come with the authoring surface:

- **i18n.** There are locale catalogs for de, ar, es, fr, it, nl-BE, tr and
  more. Two new section labels need entries in every catalog, and
  `pnpm i18n:check` must pass.
- **Accessibility.** The launcher's documented contract is 44×44 CSS pixel
  targets, accessible names, and keyboard operation (Enter/Space). Accordion
  headers are buttons with `aria-expanded` and `aria-controls`, not divs.
- **RTL.** `ar` is in the catalogs, so the accordion chevron and indentation
  must not assume left-to-right.
- **Editorial Air.** Match the existing visual system rather than inventing
  chrome; the repo's Design QA pass is current-view only, so keep the change
  inside the established tokens.

### Design decisions, already made — implement these

- **Do not duplicate rows.** An experience on the current page appears under
  "On this page" only, and is excluded from "All tours". Showing it twice makes
  the counts lie.
- **Second accordion collapsed by default**, and it should show a count in its
  header so a creator can see there is something there without opening it.
- **Keep pagination per scope.** The existing cursor is an offset into a
  filtered array; each scope needs its own cursor rather than a shared one.
- **Each row in "All tours" must say which page it belongs to**, or the list is
  unusable once there are more than a handful. Render the `routeKey` — the
  entry already carries it.
- **Empty states are distinct.** "No experiences on this page yet" is a normal
  state and should invite creating one; "No experiences in this workspace" is a
  different message.
- Extend the provider contract in `experience-menu/types.ts` with an explicit
  scope rather than adding a second parallel callback — one `listExperiences`
  that takes a scope keeps the flyout's data flow single-sourced.

### Note on the index

`readLocalExperienceIndex` is a single array in `localStorage`. "All tours" reads
the same array without the route filter, so there is no new storage shape and no
migration. Entries written before the route-key fix carry stale keys containing
query strings; they will group oddly under "All tours" and that is acceptable —
do not write a migration for local scratch data.

**Stop and report after this section.**

---

## 2. Multi-page tours — they are already built. Find out why the local path cannot reach them.

**Do not build this feature.** It exists end to end:

- **Schema** — `packages/schema/src/approach.ts`: `TargetApproach` with up to 8
  legs, each `activateTarget` / `navigate(routePatternId)` / `observe`, with a
  semantic `wait` and a plain-language label. Documented as *"How the runtime
  reaches a target that is not on the current screen. Recorded from the route
  the creator actually took, replayable, and editable per leg."* Note it is
  route **patterns**, never URLs, and explicitly *"never a selector, never a
  coordinate."*
- **Authoring** — `bridge/targeting/approach.ts` has `recordApproach`,
  `replayApproach`, `approachSentences`, `moveApproachStep`,
  `removeApproachStep`, `toTargetApproach`, `fromTargetApproach`.
  `authoring/panel.ts` has an `'approach'` mode with `approachReplay` and
  `goToStepPage`. `authoring/preview-document.ts` has a `setTargetApproach` op.
- **Runtime** — `renderers/target-approach-runtime.ts` exposes
  `executeStepTargetApproach` and `showTargetApproachRecovery`, wired into
  `renderers/tour.ts` with per-leg stage updates.

### The actual question

Authoring a tour on `/inbox` and then navigating to `/cp2`, the creator is never
offered a way to say "the next step is on another page." Establish **which of
these is true**:

1. The affordance exists in the authoring panel but the local-dev install path
   (`local-dev/install.ts`) never enables it — in which case wire it up, and the
   fix is small.
2. The affordance exists but is only reachable through a flow the fixture host
   does not present (a picker state, a step-kind choice, a keyboard entry).
3. The recording UI genuinely is not built, and only the schema, the recorder
   functions and the runtime replay are — in which case report what is missing
   and stop; that is a feature decision, not a fix.

Answer with evidence from the code, not inference. Then, if it is 1 or 2, make
it reachable from the local path and confirm end to end: author step 1 on
`/inbox/tickets`, step 2 on `/cp2/calendar/month`, reload, and replay.

### Context worth carrying

The host application is a monorepo where `/inbox` and `/cp2` are separate
bundles that each replace `<body>` on boot. So a cross-page tour there is not one
app changing route — it is a full application teardown and reboot between steps.
Whatever the approach runtime does about resumption after a hard navigation is
the interesting part, and the jsdom corpus cannot produce it.
