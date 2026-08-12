# Architecture Recovery

This is the single implementation ledger for the maintainability and authoring
recovery. Product behavior remains governed by `refined-lodariq-prd.md` and
`ux-revamp.md`.

## Delivery order

Status: **Complete**. Legacy coordinators are composition roots and the
extracted production modules are protected by responsibility-boundary checks.

| Slice                                       | Status   | Completion evidence                                                       |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| Safety rails and baselines                  | Complete | Architecture, dependency, style and migration boundaries                  |
| Authoring design system and style ownership | Complete | Shared primitives, feature styles, Radix overlays and Lucide icons        |
| Interaction state and semantic commands     | Complete | XState selection/overlay model and semantic document commands             |
| Canonical property registry                 | Complete | One value path and command per property; button vertical slice            |
| Canvas engine                               | Complete | Zoom, selection, InteractJS drag/resize and keyboard parity               |
| Shared experience renderer                  | Complete | Authoring/runtime recipe parity and decomposed Tour renderer              |
| Modal and hotspot proof                     | Complete | Registry extension proof without exposing unfinished creator controls     |
| API and repository domains                  | Complete | API, in-memory and Drizzle behavior is owned by bounded domain modules    |
| Consolidated verification                   | Complete | Lint, types, tests, build, boundaries, size and security checks completed |

## Enforced decomposition targets

- `authoring/index.ts` and `database/schema.ts` are declarative public barrels.
- The authoring panel delegates configuration, geometry, styling, page context,
  and document preview behavior to focused modules.
- `controller.ts`, `repository.ts`, `drizzle-repository.ts`, and
  `control-plane.ts` remain composition roots over their owning feature modules.
- Extracted modules cannot depend back on their facade, and dependency-cycle
  checks remain mandatory.
- The architecture check fails when responsibilities collapse back into a
  barrel or composition root; line count is not used as a proxy for cohesion.

## Functionality migration ledger

Every changed capability is recorded here. A row may be marked complete only
after automated or browser verification.

| Existing capability                | Replacement or enhancement                                                     | Status   |
| ---------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Contextual element toolbar         | Capability-driven quick controls anchored to the selected element              | Complete |
| Advanced configuration tray        | Detailed controls generated from the same property registry                    | Complete |
| Popup and CTA drag/resize          | Unified transform engine with keyboard support and constraints                 | Complete |
| Text editing                       | Existing Lexical boundary retained; selection state integrated with the canvas | Complete |
| Alignment, color, size and spacing | One canonical property path per value; duplicate independent controls removed  | Complete |
| Tour runtime rendering             | Same behavior through decomposed surface/content/action/theme recipes          | Complete |
| Authoring preview                  | Uses the runtime recipe rather than a separate visual approximation            | Complete |
| Existing popup experience          | Retained and enhanced with responsive sizing and accessible focus/dismissal    | Complete |
| Future modal and hotspot           | Registry proof added; UI remains gated until each renderer is production-ready | Complete |
| In-memory and Drizzle persistence  | Existing behavior retained behind matching domain repository contracts         | Complete |

Secondary footer actions moved into the overflow menu; Review & recovery remains
available there. Duplicate layout controls and the inactive floating Behavior
action were removed in favor of the selected element's canonical property tray.
No authoring capability was removed.

## Non-negotiable checks

- No silent capability removal or misleading control.
- Structured TypeBox document JSON remains canonical.
- Runtime stays independent from React, Lexical and authoring code.
- Customer styling uses safe semantic tokens and recipes, never arbitrary CSS,
  JavaScript or raw HTML.
- Public barrels remain declarative and coordinators delegate feature behavior
  to focused modules without reverse facade dependencies.
- Pointer interactions have keyboard equivalents and visible focus states.
