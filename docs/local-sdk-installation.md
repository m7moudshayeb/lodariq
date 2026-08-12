# Local SDK Installation

This is the Phase 0 evaluator path for the local Lodariq SDK without dashboard,
backend, or production publication infrastructure. It demonstrates the
implemented modeless draggable authoring popup/runtime overlay; it is not a
second customer installation model.

Customer applications install one permanent SDK entry in their application
shell. They do not add a separate authoring snippet or rely on a browser
extension as the canonical workflow.

## Prerequisites

- Node.js 24 LTS or newer.
- pnpm 9 or newer.
- Playwright browsers when running e2e locally:

```bash
pnpm exec playwright install chromium firefox webkit
```

## Primary Fixture Host

```bash
pnpm install
pnpm build
pnpm --filter @lodariq/fixture-host dev
```

Open the Vite URL, then use the draggable local Lodariq launcher to open
authoring. It opens the existing compact modeless popup over the fixture instead
of a full-width bar, modal backdrop, or permanent dock. The host page loads
Lodariq through the script tag in
`apps/fixture-host/index.html`, using:

- `data-workspace="wk_local_dev"`
- `data-env="development"`
- `data-manifest="/lodariq-local/manifest.json"`

The script lazy-loads runtime, authoring, and the tour renderer from local
workspace builds. Browser compilation is preview-only.

The popup is draggable, while the page outside its visible bounds remains
clickable. Starting target selection collapses the popup to a small movable
instruction chip so it cannot cover the intended element. The selected click is
captured for authoring without firing the fixture's product action; Escape
cancels and restores the prior editing state.

The local Editorial Air launcher now exposes the canonical three icon actions:

- **New experience** opens an enabled-type picker. Phase 2 exposes only Tour;
  choosing it creates and persists a distinct draft with useful starter content.
- **Experiences on this page** opens a compact local route-scoped list and can
  resume a draft without a dashboard transition.
- **Preview as user** runs the active experience through the runtime renderer.

Each icon has an accessible name and a short hover/focus tooltip. Click, tap,
Enter, or Space pins the dock; pointer leave and action activation do not close
it. The launcher toggle, outside click, or `Escape` closes it.

The dashboard, launcher, and popup implementation pass still awaits the
milestone verification and same-viewport Design QA. This local path does not
prove hosted activation, authentication, release mutation, staging
verification, or production-live state.

The hosted Phase 2 entry will converge on this same popup/runtime overlay behind
a small draggable SDK launcher. The hosted compatibility path keeps **Edit
current experience** until first-party activation supplies creator-only
create/list/open capabilities; it must not fake the local flows. All actions
have targets of at least 44 by 44 CSS pixels. Optional hover reveal is an
enhancement, not a requirement.

Autosave recovery, repair, Brand readiness, release, and history are contextual
surfaces, not permanent launcher actions.

## Hosted Direct Activation Target

The local fixture intentionally bypasses customer authentication. Hosted
development/staging authoring will use the permanently installed SDK and this
flow:

1. A signed-out creator activates the in-product launcher.
2. The user gesture opens a first-party Lodariq authentication page in a
   top-level popup. No password form is embedded in the customer page, and the
   flow does not depend on another Lodariq tab already being open.
3. Lodariq verifies membership, environment, capability, and the exact opener
   origin.
4. The popup returns a one-time activation result only to that exact origin.
5. The SDK exchanges it for a short-lived capability-scoped authoring session
   and opens the same modeless popup/runtime overlay.

Production never enables this authoring activation or loads authoring code. The
dashboard remains responsible for initial installation, exact-origin and
environment policy, membership, Brand approval, administration, and fallback
or recovery when direct activation cannot complete.

## Local CSP Assumption

The Phase 0 local hosts intentionally run without a strict Content Security
Policy. The SDK uses module scripts, dynamic imports, and injected Shadow DOM
styles during local validation. SDK-injected stylesheet tags honor
`<meta property="csp-nonce" nonce="...">` or `<meta name="csp-nonce" content="...">`
when a host wants nonce-compatible local testing, but full strict-CSP support is
not claimed in Phase 0 because target-picking and placement overlays still apply
dynamic inline positioning. Remaining hosted CSP and direct-activation
hardening belong to the Phase 2 entry convergence work.

## Secondary Customer-Like Host

```bash
pnpm --filter @lodariq/customer-like-host dev
```

This app installs the same local loader into a different page structure with
sticky z-index content, repeated labels, skeleton state, and transformed cards.
It exists to keep Phase 0 validation from overfitting to the primary fixture.

## Verification

```bash
pnpm verify
```

`pnpm verify` runs typecheck, lint, package boundaries, unit tests, build,
bundle-size gates, SDK-host Playwright e2e, and `pnpm audit`.

For optional installed Edge-channel coverage:

```bash
LODARIQ_E2E_EDGE=1 pnpm test:e2e
```
