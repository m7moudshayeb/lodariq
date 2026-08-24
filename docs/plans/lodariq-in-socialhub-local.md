# Running the local Lodariq SDK inside SocialHub (dev)

Goal: author and replay a real Lodariq tour against SocialHub's local build, so
capture, the look-alike card, and resolution are exercised on a real app instead
of synthetic fixtures. This is the Phase 0 local path — no dashboard, no backend,
no publication.

**Expect friction.** `apps/fixture-host/src/lodariq-loader.ts` is not a drop-in
script: it is a TypeScript module bundled by Vite that imports workspace packages
and fixture-host's own router. Steps 1–2 exist to make an app-agnostic version.

---

## Step 1 — Add a generic local entry to fixture-host

Create `apps/fixture-host/src/lodariq-embed.ts`. It should be everything
`lodariq-loader.ts` does *minus* the Meridian/router specifics:

```ts
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import type { LodariqDocument } from '@lodariq/schema';
import { installLocalLodariqAuthoringFromScript } from '@lodariq/sdk-authoring/local-dev/install';

const origin = new URL(import.meta.url).origin; // the Lodariq dev server

void installLocalLodariqAuthoringFromScript({
  baseDocument: tourFixture as unknown as LodariqDocument,
  // MUST be absolute — the default '/authoring.html' would resolve against the
  // host app (localhost:3000) and 404.
  iframeSrc: `${origin}/authoring.html`,
});
```

Read `installLocalLodariqAuthoringFromScript` in
`packages/sdk-authoring/src/local-dev/install.ts` before writing this — the
options interface is small (`baseDocument`, `script`, `scriptSelector`,
`iframeSrc`, `sessionId`, `authoringTrigger`, `installOptions`) and
`readConfigFromScript` decides which `data-*` attributes are required.

## Step 2 — Serve it

```bash
pnpm install
pnpm build
pnpm --filter @lodariq/fixture-host dev     # port 5175
```

Confirm `http://localhost:5175/src/lodariq-embed.ts` returns transformed JS and
that `http://localhost:5175/authoring.html` loads. Vite dev sends permissive CORS
by default; verify rather than assume.

## Step 3 — Add one tag to SocialHub's dev HTML

In SocialHub's dev entry template (the `index.html` its dev server serves), add:

```html
<script
  type="module"
  src="http://localhost:5175/src/lodariq-embed.ts"
  data-lodariq-loader
  data-workspace="wk_local_dev"
  data-env="development"
  data-manifest="http://localhost:5175/lodariq-local/manifest.json"
></script>
```

`data-env="development"` matters: `AuthoringEnvironment` is
`'development' | 'staging'` only, and production cannot author
(`public-bootstrap.ts` gates the authoring import on it). `http://localhost` is a
valid development origin.

**Do not commit this to any SocialHub branch.** Keep it a local-only edit —
`git stash`, a `.local` template, or an env-gated conditional.

## Step 4 — Relax CSP locally

SocialHub sends CSP headers; `docs/local-sdk-installation.md` states plainly that
the Phase 0 local path does **not** claim strict-CSP support (dynamic imports,
injected Shadow DOM styles, inline positioning during target picking).

For the dev build only, allow `http://localhost:5175` in `script-src`,
`style-src`, `connect-src`, `frame-src` and `img-src`, and permit
`'unsafe-inline'` styles. If SocialHub's CSP is set in code rather than headers,
gate the relaxation behind the dev environment flag.

Note what happens here — SocialHub's real CSP is a genuine signal about what a
security-conscious customer will require, and Phase 2's CSP hardening is unbuilt.
**Record whatever you have to loosen; it is a requirements list, not a
workaround.**

## Step 5 — Author a tour

Reload SocialHub. The draggable local launcher should appear. Then:

1. **New experience → Tour**
2. Point at real controls — pick deliberately hard ones. Based on the measured
   targetability of this app (see project memory `real-app-targetability`):
   - **Settings / channels** — worst case, 22% uniquely identifiable, one tie of
     34 identical controls, 73 of 99 elements with no accessible name.
   - **Calendar month** — repetition: ties of 15, 9, 8, 8 (day cells).
   - **Inbox** — ten ties of exactly 4 (ticket rows).
   - **Publisher edit** — best case, 60%. Use it as the control.
3. **Preview as user**, then reload the page and preview again.

## Step 6 — Record what actually happens

This is the point of the exercise. For each step captured, note:

- Did capture produce a usable target, or did the weak-target card appear?
- Which answers did the look-alike card offer, and were any of them right? The
  Arm B measurement says content-anchored is the only policy that survives —
  check whether the card even offers it on these shapes.
- Did the step still resolve after a reload? After navigating away and back?
- Anything the jsdom corpus **cannot** produce: async/skeleton loading,
  virtualised lists, portals, hydration timing, scroll containers. ADR 0029 names
  these as out of scope for the harness — this is the first chance to see them.

Feed real findings back as **new fixtures in the corpus** — written from scratch
to reproduce the shape, never by copying SocialHub markup into the repo.

---

## Simpler fallback if step 3 or 4 fights you

`pnpm --filter @lodariq/customer-like-host dev` already exists to avoid
overfitting to one fixture. Rebuild a couple of SocialHub's hardest *shapes*
there by hand — the 34-way settings tie, the calendar grid — and author against
those. Less realistic, no integration work, and it still tests the resolver on
the structures that actually defeat it.
