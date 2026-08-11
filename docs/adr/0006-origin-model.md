# 0006. Origin and deployment model

- Status: Accepted
- PRD references: §12.5, §20
- Related: ADR 0015, ADR 0017

## Context

For an iframe-based authoring product, origin boundaries are a security design,
not an incidental detail, and must be fixed early.

## Decision

Use distinct canonical origins:

- `lodariq.io` — canonical public marketing site. `www.lodariq.io` redirects to
  the apex origin.
- `cdn.lodariq.io` — Cloudflare R2 + CDN: loader, runtime/renderer bundles,
  compiled manifests, demo assets, exports (immutable, content-addressed).
- `editor.lodariq.io` — authoring iframe; distinct from both the customer page
  and the dashboard.
- `app.lodariq.io` — Next.js dashboard on Fly.io; it hosts the first-party
  creator activation route at `/authoring/activate`.
- `api.lodariq.io` — Fastify API on Fly.io, plus a separate worker service.
- `demos.lodariq.io` — public demo player, separate from the authenticated
  dashboard so viewer sessions never share cookies.
- `lodariq.com` and `www.lodariq.com` — brand-protection redirect origins only;
  they permanently redirect to the matching canonical `lodariq.io` marketing
  URL and never receive authentication cookies.

## Consequences

- Vercel is not used; the dashboard is a Next.js Node server on Fly.io.
- Canonical links, sitemap URLs, transactional email links, OAuth callbacks,
  CSP/CORS allowlists, and SDK metadata use `lodariq.io` origins exclusively.
- No authenticated route, API, SDK asset, authoring iframe, or public demo is
  served from `lodariq.com`.
- Public demo traffic never runs on the authenticated dashboard origin.
- Under ADRs 0015 and 0017, Lodariq-owned credential/session UI remains on
  `app.lodariq.io`; the customer page receives only an exact-origin, one-time
  authorization result, while the authoring iframe remains isolated on
  `editor.lodariq.io`. The dashboard's HttpOnly session cookie is never exposed
  to customer-page JavaScript.
