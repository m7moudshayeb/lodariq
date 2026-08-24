# Dashboard and fixture launch-readiness audit

Date: 2026-08-24
Branch: `codex/dashboard-launch-readiness`

This audit is the visual/manual evidence companion to [TESTING-SCENARIOS.md](TESTING-SCENARIOS.md), which contains 540 planned cases for later automation.

## Changes made

- Aligned dashboard light tokens with the SDK authoring-context palette and dashboard dark tokens with the SDK creator-chrome graphite palette.
- Consolidated Members into one workspace-access surface with semantic dividers instead of competing cards.
- Prebundled `@xyflow/react` in the fixture host so Flow map does not pull a second optimized React URL during a session.
- Added a development-only owned-session adapter for the dashboard's header-auth mode so tenant and enterprise BFF requests use the same local identity as the API.
- Fixed the authoring native-event bridge so it intercepts only controller-owned actions; React-owned controls such as Conditions, test-user presets, and button insertion now receive their clicks.
- Kept the authoring shell modeless across customer-page navigation by removing the click-outside collapse path.
- Warmed the experience menu chunk during authoring bootstrap so the first launcher click opens the picker reliably.
- Delayed Flow Map mounting until its canvas has measured dimensions, eliminating the zero-size React Flow mount path.

## Manually verified in the in-app browser

- Dashboard navigation, Members route, light/dark theme toggle, invalid invitation validation, and launcher visibility.
- Dashboard route sweep across Overview, Experiences, Releases, Analytics, Brand system, Environments, Applications, Billing, Members, and Enterprise identity; local empty/loading states settled without browser errors.
- Members before/after visual comparison at [route-members.png](screenshots/route-members.png) and [02-members-after.png](screenshots/02-members-after.png).
- Five-step Tour creation, target verification, persisted reopen, Flow map, and declared-data branch simulation at [06-flow-map-five-step.png](screenshots/06-flow-map-five-step.png).
- Step settings, Conditions rule creation/change/test-user flow, and persisted rule reopen at [07-tour-step-settings.png](screenshots/07-tour-step-settings.png); the repaired rule row was also rechecked live in the in-app browser.
- Announcement, Hotspot, Survey, and Checklist starter editors at [08-announcement-editor.png](screenshots/08-announcement-editor.png), [09-hotspot-editor.png](screenshots/09-hotspot-editor.png), [10-survey-editor.png](screenshots/10-survey-editor.png), and [11-checklist-editor.png](screenshots/11-checklist-editor.png).
- Multi-page Projects → Reports navigation with the authoring iframe and draft shell preserved.
- One-click launcher → New experience opening in a fresh fixture session.

## Remaining launch-readiness work

1. The 540-case matrix in [TESTING-SCENARIOS.md](TESTING-SCENARIOS.md) is a planned execution backlog; it has not been falsely represented as automated coverage.
2. Full-page Analytics capture and responsive viewport override were limited by this browser session; repeat those visual captures with a fresh browser context.
3. The fixture-host standalone TypeScript check depends on generated workspace SDK declarations; the SDK source typecheck and fixture Vite production bundle pass, while the package-only check needs the full declaration-producing workspace build.
4. Analytics first-load latency in local development is several seconds while the API compiles/aggregates; the dashboard shows an explicit loading state and settles to the correct empty Production state.

These are the remaining evidence-backed limits of this pass. The branch contains the source fixes and targeted browser verification, but it should not be described as 100% launch-ready until the remaining visual captures and the scenario matrix are executed.
