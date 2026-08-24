# Authoring Control Map

Status: current
Source: `docs/plans/authoring-ux-model.md` §9
Enforced by: `packages/tests/sdk-authoring/src/authoring/control-map.test.ts`

The **visible control is the design.** Read the middle column as the product. The third column exists
so a creator who builds forty tours a quarter can go faster; nobody ever needs to know it is there.

Three rules keep this table honest:

1. **Every primary control is reachable without prior knowledge.** A control that lives only in a menu
   the creator has no reason to open fails the test.
2. **Shortcuts are shown, never taught** — printed on the menu row or in the control's tooltip. There is
   no shortcut-memorisation onboarding step.
3. **The zero-keyboard completion test gates release.** Build a six-step tour with a pointer only. A
   step that needs a keystroke is a bug.

## The map

`Accelerator` is `—` when nothing is wired. **Printing a shortcut that does not exist teaches a lie**,
so this column is empty by decision until each accelerator ships with its visible control in the same
change (§3.1a).

| Action | Visible control (primary) | Where it lives | Accelerator |
|---|---|---|---|
| Open authoring | Launcher in the product, or `Open in product` from the dashboard | host page | — |
| Reach another screen of my app | **Editing ⇄ Browsing** switch | mode pill | — |
| Point a step at something | Automatic on step creation; `Choose target` | inspector → Target | — |
| Re-point a step | `Change target` | inspector → Target, and the target outline | — |
| Select a bigger / smaller element | Breadcrumb, `Pick bigger`, `Pick smaller` | picker band | — |
| Keep a menu open while picking | Automatic freeze, plus `Freeze page` | picker band | — |
| Pick something under an overlay | Disambiguation chooser | picker band | — |
| Preview | `Preview` | mode pill menu | — |
| Edit what I am previewing | `Edit this step` | preview bar | — |
| Configure the selected thing | `⋯` on the object | card toolbar | — |
| Reuse a style | `Copy style`, `Paste style`, `Apply to…`, `Create style from this step` | inspector → Style | — |
| Write the spoken script | `Spoken script`, `Sync from step text` | inspector → Narration | — |
| Rewrite selected copy | `AI` control with five verbs | card toolbar | — |
| Ask for a change in words | `Ask Lodariq…` | toolbar `AI` menu, and `⌘K` | `⌘K` |
| Choose a brand starting point | `Blends in` / `Stands out` / `Start plain` | Operations → Appearance → Brand match | — |
| Set the form of an announcement or checklist | Drag the card to an edge or the middle | canvas | — |
| Get chrome out of the way | Automatic avoidance; drag the pill to a corner | overlay chrome | — |
| Hide everything | `Hide all panels` | mode pill menu | — |
| Move between steps | Filmstrip click | filmstrip | — |
| Multi-select steps | ⇧-click extends, ⌘/⌃-click adds | filmstrip | — |
| Check before publishing | `Check` | Operations | — |
| Fix something Check found | `Take me there` on the row | Operations → Check | — |
| Ask for a step someone else holds | `Ask for it` | step lock banner | — |
| Resolve a conflicting edit | `Keep mine` / `Keep theirs` / `Open both side by side` | conflict chooser | — |
| See a theme change | `Theme updated — reload to see it` + `Reload` | Operations → Appearance | — |
| Operations | `⌄` menu | mode pill | — |
| Back out | `Cancel` / `Close`; click-outside | every surface | `Esc` |

`Esc` is listed because it is the one accelerator that is genuinely wired everywhere and universally
expected — the inspector dismisses on it, the picker cancels on it, and the assist prompt closes on it.

## Keyboard operability (a separate obligation)

Not the same thing as shortcuts, and not optional:

- 44×44 CSS px minimum targets for controls that stand on their own. That is WCAG 2.2's AAA bar
  (AA asks 24×24, 2.5.8); a full-width row inside a menu is sized to its list and is large by area.
  Hover is never required and never activating.
- Enter/Space activate; drag needs a handle plus a movement threshold and suppresses the click.
- The inspector is a focus-trapped popover: `Esc` dismisses, Tab cycles inside it, and focus returns to
  whatever opened it.
- The Editing/Browsing switch is a labelled two-state control, operable by Enter/Space and announced.
- The picker announces the hovered element's accessible name and its live match count.
- Connector lines and status dots are decorative; the meaning is always also in text.

## Validating rather than asserting

§9.2's task set, five PMMs, no training, think-aloud, with the pointer-only instruction withheld:

1. Build a three-step tour where step 2 is on a screen you have to navigate to.
2. Point a step at an item inside a dropdown menu.
3. Make step 3 look like step 1.
4. Change the target of step 2 after the fact.
5. Publish to staging and verify.

Success bar: all five completed with a pointer only, and nobody asks about a keyboard shortcut. If task
1 fails, the Editing/Browsing switch is in the wrong place or wrongly labelled — the highest-risk single
element in the spec.
