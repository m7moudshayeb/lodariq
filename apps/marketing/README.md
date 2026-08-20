# @lodariq/marketing

The Lodariq marketing site (`https://lodariq.io`). Static Vite build, no
framework — the SDK ships framework-free and so does this page.

## The hero is real

The window in the hero is `apps/fixture-host` (Meridian) built as a static
bundle, embedded same-origin under `/demo/`, with the real SDK installed
through its normal loader-config script tag. "Play the tour" compiles a real
block document (`src/demo/meridian-tour.ts`) in the visitor's browser with
`@lodariq/compiler` — themed by a real Brand Theme snapshot
(`src/demo/demo-theme.ts`, hash recomputed through the compiler's own hasher)
— and plays it through `window.Lodariq.playTour`, the same public API a
customer page uses. Targets are semantic fingerprints; there are no CSS
selectors anywhere in the demo.

Per PRD §20 the public demo never lives on the authenticated dashboard origin:
sign-in/up links point at `app.lodariq.io`, and the demo ships as static files
with this site.

## Commands

```bash
pnpm --filter @lodariq/marketing dev       # builds the demo host once if missing, then vite dev on :5178
pnpm --filter @lodariq/marketing build     # typecheck + rebuild demo host + vite build (demo copied to dist/demo)
pnpm --filter @lodariq/marketing demo:prepare  # force-rebuild the embedded fixture host
```

`scripts/prepare-demo.mjs` builds the fixture host with `--base /demo/` into
`apps/fixture-host/dist-demo` (its normal `dist/` stays untouched for e2e),
re-points the loader's manifest URL, and injects the loader-config script tag
that Vite's bundling would otherwise drop.

## Design system

The palette is the SDK's creator-chrome token set
(`packages/sdk-authoring/src/creator-chrome-tokens.ts`): indigo `#7c8cff` on
graphite `#14161c`, status hues as small color moments, glass reserved for
chrome. Geometry snaps to the SDK ladders (type 12–32, space 4–40, radius
8/12/16, motion 200ms). Display headlines use Fraunces; UI text is Inter, both
self-hosted. The dashboard is expected to migrate to this same system.

## Waitlist

Pre-launch, the form POSTs `{ email, source }` to `VITE_WAITLIST_ENDPOINT`
when configured, and otherwise falls back to a prefilled email draft to
`hello@lodariq.io` so no request is silently dropped.
