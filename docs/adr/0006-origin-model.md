# 0006. Origin and deployment model

- Status: Accepted
- PRD references: §12.5, §20

## Context

For an iframe-based authoring product, origin boundaries are a security design,
not an incidental detail, and must be fixed early.

## Decision

Use distinct canonical origins:

- `cdn.talmeh.io` — Cloudflare R2 + CDN: loader, runtime/renderer bundles,
  compiled manifests, demo assets, exports (immutable, content-addressed).
- `editor.talmeh.io` — authoring iframe; distinct from both the customer page
  and the dashboard.
- `app.talmeh.io` — Next.js dashboard on Fly.io.
- `api.talmeh.io` — Fastify API on Fly.io, plus a separate worker service.
- `demos.talmeh.io` — public demo player, separate from the authenticated
  dashboard so viewer sessions never share cookies.

## Consequences

- Vercel is not used; the dashboard is a Next.js Node server on Fly.io.
- Public demo traffic never runs on the authenticated dashboard origin.
