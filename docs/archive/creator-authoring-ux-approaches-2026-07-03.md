# Archived: Creator Authoring UX Approaches

Status: superseded by `../plans/ux-revamp.md`. Retained only as exploration
history; do not implement from this document.

Source of truth guardrails: `refined-lodariq-prd.md` section 20 and
`AGENTS.md`.

Goal: make Lodariq's creator authoring experience usable by non-developer
creators, especially PMs, without onboarding or training.

## Problem

The current authoring panel is powerful, but it can feel like an
editor/debugger hybrid. A first-time creator needs to understand three things
quickly:

- What am I making?
- What should I click next?
- Can I trust what Lodariq will publish?

The recommended direction is to make the first-use experience task-first and
confidence-first, while keeping advanced controls available only when needed.

## Approach 1: Canvas-First Element Selection

### Summary

The creator starts on the live product page, clicks the product element they
want to explain, and Lodariq opens a compact authoring popup next to that
element. The block document still exists as the canonical model, but the first
mental model is simple: click an element, write content, preview it.

### Primary Workflow

1. Creator opens Lodariq on a staging or demo page.
2. Lodariq asks, "What do you want to explain?"
3. Creator clicks a real product element on the page.
4. Lodariq creates a tour step attached to that placement.
5. A small popup appears beside the selected element.
6. Creator writes the message inline.
7. Creator chooses a simple action, such as Next, Done, Open page, or Start
   tour.
8. Creator previews the step in place.
9. Lodariq shows readiness checks before publish.

### Why This Helps

- It matches how PMs think: "I want to explain this button," not "I need to
  configure a target resolver."
- It makes the live page the primary canvas, instead of making the creator
  understand a separate abstract builder first.
- It gives immediate visual feedback and shortens the path to the first useful
  result.
- It can keep slash commands, block menus, lifecycle controls, backup JSON, and
  diagnostics out of the default first-use path.

### Confidence Signals

- Placement chip: "Lodariq can find this button again."
- Preview state: "Tested on this page."
- Publish checklist:
  - Page element selected.
  - Message added.
  - Action chosen.
  - Preview tested.
  - Ready to publish.
- Failed checks should show one clear fix button, such as "Choose another
  element" or "Add button action."

### Advanced Controls

Advanced options should be progressively disclosed under labels like:

- Troubleshooting.
- Placement settings.
- Before this appears.
- Support package.

Avoid showing terms like target, lifecycle, diagnostic, compiled package, or raw
JSON in the default creator path.

### Product Guardrails

- The canonical state remains structured Lodariq block JSON.
- The popup edits rendered blocks through typed transactions.
- No Markdown-to-JSON compiler is introduced.
- Coordinates remain diagnostic only; production playback still resolves
  semantic placements.
- The authoring iframe and bridge still use exact allowed origins and semantic
  batched messages.

### Best Fit

This should be the preferred default for tours, hotspots, tooltips,
announcements attached to page context, and any experience where placement is
the creator's first decision.

## Approach 2: Guided Storyboard Builder

### Summary

The creator starts by choosing an outcome, then fills a short storyboard of
steps. Instead of first clicking around the product page, the creator answers a
plain-language sequence: who is this for, when should it appear, what should it
say, what should happen next, and how should success be measured.

This treats Lodariq like a campaign/story builder first, with placement added
as one required checklist item per step.

### Primary Workflow

1. Creator chooses a goal:
   - Introduce a new feature.
   - Guide a first-time user.
   - Announce a change.
   - Drive users to complete a setup task.
   - Collect feedback.
2. Lodariq creates a draft storyboard with a small number of recommended
   steps.
3. Each step appears as a fillable card:
   - Placement: choose page element.
   - Message: write what the user sees.
   - Action: what happens next.
   - Audience: who should see it.
   - Timing: when it appears.
4. Creator completes the checklist cards in any order.
5. Creator previews the full story.
6. Lodariq reports readiness by step before publish.

### Why This Helps

- It gives first-time creators a clear starting point even if they do not know
  which product element to click first.
- It maps to PM language: goal, audience, message, action, success.
- It is better for multi-step tours and campaigns where narrative order matters
  more than a single placement.
- It makes incomplete work feel safe because every missing piece is visible in
  a checklist.

### Confidence Signals

- Storyboard progress: "3 of 4 steps ready."
- Step-level readiness:
  - Needs placement.
  - Needs message.
  - Needs action.
  - Ready.
- Preview result:
  - "All steps can be found on this page."
  - "Step 2 needs attention."
- Publish button stays disabled until blockers are fixed, but save remains
  available.

### Advanced Controls

Advanced controls should appear only from the relevant card:

- Audience card opens trait/event pickers.
- Timing card opens trigger controls.
- Placement card opens troubleshooting and lifecycle controls.
- Action card opens document/page/action selection.

This prevents creators from scanning unrelated controls while they are trying
to complete one task.

### Product Guardrails

- Storyboard cards write typed block transactions into the canonical document.
- Slash commands remain optional accelerators, not durable syntax.
- Creators never maintain code-like attributes such as `src`, `action`, or
  `target`.
- Save should almost always succeed; publish should block only critical runtime
  issues.

### Best Fit

This should be considered for multi-step tours, onboarding checklists,
announcements, surveys, and any workflow where the creator starts from a product
goal rather than a specific screen element.

## Approach 3: Plain-Language Recipe Builder

### Summary

The creator builds each experience as a plain-language recipe:

```text
When [this user/context] sees [this page element], show [this message], then
[this action happens].
```

Every bracket is a clickable picker or inline field. The creator never starts
from an empty editor, a debug panel, or a schema-shaped form. They complete a
sentence that already explains the expected behavior.

This approach borrows from trigger-action authoring patterns used by products
like IFTTT and Zapier, where non-developers compose behavior from understandable
parts: trigger, condition, action, and output. The IFTTT team describes its
model as simple trigger/action logic, and HCI research on IFTTT and Zapier
frames these tools as trigger-action systems for end users.

References:

- [What is IFTTT and how does it work?](https://ifttt.com/explore/what-is-ifttt)
- [IFTTT vs. Zapier: A Comparative Study of Trigger-Action Programming Frameworks](https://arxiv.org/abs/1709.02788)

### Primary Workflow

1. Creator chooses a starter recipe:
   - Show a tooltip on this element.
   - Guide users through these steps.
   - Announce something on this page.
   - Ask for feedback after this action.
2. Lodariq shows a complete sentence with empty blanks.
3. Creator fills each blank using simple controls:
   - When: page, audience, trigger, or timing.
   - Where: selected page element or placement.
   - What: message, media, question, or checklist item.
   - Then: next step, dismiss, open page, start tour, or complete.
4. Lodariq shows a live human-readable summary under the recipe.
5. Creator previews the result.
6. Lodariq marks each blank as ready, missing, or blocked.

### Why This Helps

- It makes authoring feel deterministic: fill the blanks and the behavior is
  known.
- It gives creators an obvious mental model without requiring them to learn
  blocks, targets, lifecycle hints, compiler output, or bridge behavior.
- It scales from simple to advanced by adding optional clauses instead of
  exposing a large panel.
- It is easy to validate because every missing or unsafe piece maps to one
  visible blank.

### Example Recipes

```text
When a user opens the Projects page, show "Create your first project" beside
the New project button, then continue to the next step.
```

```text
When a new workspace admin visits Billing, show this announcement at the top of
the page, then let them dismiss it.
```

```text
When a user finishes onboarding, ask "How easy was setup?", then save the
response.
```

### Confidence Signals

- Each blank has a clear status:
  - Filled.
  - Missing.
  - Needs review.
  - Cannot publish.
- The recipe has a final readback:
  - "This will show a tooltip beside New project on the Projects page."
  - "This will appear only for workspace admins."
  - "This will continue when the user clicks Next."
- Publish blockers point to the exact blank that needs work.
- Preview confirms whether the recipe can run on the current page.

### Advanced Controls

Advanced controls become optional recipe clauses:

```text
Only if [condition].
Wait until [text appears].
Scroll [element] into view first.
After [delay].
Stop showing when [event happens].
```

This keeps simple recipes simple while preserving a path to richer behavior.

### Product Guardrails

- Recipes are UI composition, not durable syntax. They compile to typed block
  transactions and canonical Lodariq block JSON.
- The sentence is a rendered control surface, not Markdown and not a custom
  grammar.
- Creators choose actions and placements through Lodariq-owned pickers.
- Lodariq must not imply access to customer database values unless values were
  explicitly sent through SDK/API/integrations.
- Advanced conditions should use the workspace data catalog where available.

### Best Fit

This should be considered for first-time authoring, announcements, simple
tooltips, surveys, and any workflow where creators need the strongest possible
"1 + 1 = 2" sense of cause and effect.

## Directional Recommendation

Use Approach 1 as the default first-use authoring path for contextual product
experiences. Add Approach 2 as the planning mode for creators who start from a
campaign or onboarding goal. Use Approach 3 as the simplest authoring shell for
first-time creators and simple experiences where clarity matters more than
layout flexibility.

The three approaches can share the same underlying block model:

- Approach 1 is canvas-first.
- Approach 2 is storyboard-first.
- Approach 3 is recipe-first.
- All three write typed transactions to canonical Lodariq block JSON.
- All three hide advanced diagnostics until the creator asks for help or a check
  fails.
