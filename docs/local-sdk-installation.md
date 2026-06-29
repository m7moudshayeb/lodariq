# Local SDK Installation

This is the Phase 0 evaluator path for installing the local Lodariq SDK without
dashboard, backend, or production publication infrastructure.

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

Open the Vite URL, then use the fixed **Author** button to open local authoring.
The host page loads Lodariq through the script tag in
`apps/fixture-host/index.html`, using:

- `data-workspace="wk_local_dev"`
- `data-env="development"`
- `data-manifest="/lodariq-local/manifest.json"`

The script lazy-loads runtime, authoring, and the tour renderer from local
workspace builds. Browser compilation is preview-only.

## Local CSP Assumption

The Phase 0 local hosts intentionally run without a strict Content Security
Policy. The SDK uses module scripts, dynamic imports, and injected Shadow DOM
styles during local validation. SDK-injected stylesheet tags honor
`<meta property="csp-nonce" nonce="...">` or `<meta name="csp-nonce" content="...">`
when a host wants nonce-compatible local testing, but full strict-CSP support is
not claimed in Phase 0 because target-picking and placement overlays still apply
dynamic inline positioning. Production CSP hardening belongs with the Phase 1
hosted iframe/runtime work.

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
