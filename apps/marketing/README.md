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

## SEO / GEO

- `public/robots.txt` — disallows `/demo/` (fixture product, must never be indexed
  as its own page) and explicitly welcomes GPTBot, ClaudeBot, PerplexityBot,
  Google-Extended, Applebot-Extended and cohere-ai on everything else.
- `public/llms.txt` — a plain-language factual summary for AI systems, including
  what Lodariq is _not_ and a note that Meridian is a fixture, not a customer.
- `public/sitemap.xml`, `public/og-image.png` (1200×630, regenerate by rendering
  the same markup if the headline changes).
- JSON-LD `@graph` in `index.html`: Organization, WebSite, SoftwareApplication,
  FAQPage. **The FAQPage entries are generated from the FAQ markup** so the
  schema text can never drift from what the page shows — if you edit an
  answer, update the corresponding `acceptedAnswer` too.
- `scripts/prepare-demo.mjs` injects `<meta name="robots" content="noindex, nofollow">`
  into the demo build. Both that and the robots.txt rule are needed: a
  disallowed URL can still be indexed from an external link.

Two rendering rules protect crawlability:

1. `[data-reveal]` sections are **visible by default**; `main.ts` sets
   `data-reveal-armed` on `<html>` to opt into the animation. A crawler or a
   failed script sees content, not `opacity: 0`.
2. The demo iframe loads on the `load` event — unconditionally, but after first
   paint, so ~700KB of fixture-host bundle doesn't compete with LCP.

## Content accuracy

The copy is written for the **buyer — a product marketing manager**, not for the
developer who approves the script tag. Technical detail lives in the FAQ, which
is where an evaluator looks; the page body stays in outcome language.

Constrained by `docs/product-design/plan-features.md` and
`positioning-and-pricing.md`:

- **Tours are the only shipped experience type.** The four use cases on the page
  are all jobs a tour does. Announcements, hotspots, checklists and surveys are
  named as coming, never as available.
- **No prices are published** — the plan doc marks every figure a placeholder
  pending design partners. The page sells the _metric_ (engaged users) instead.
- **No resolution-rate claim.** That number is unmeasured; the FAQ says so.
- **Analytics claims stop at completions, drop-off and dismissals.** Funnels,
  cohorts and export are labelled as still being built.
- No customer logos, testimonials or case studies, because there are none.
- **No competitor is named anywhere** on the page or in `llms.txt`. Naming one
  commits you to defending that characterisation as their product changes.
  Category placement uses the generic terms ("digital adoption platform",
  "product tour tool"), which is what carries the SEO value anyway.

## Waitlist

Pre-launch, the form POSTs `{ email, source }` to `VITE_WAITLIST_ENDPOINT`
when configured, and otherwise falls back to a prefilled email draft to
`hello@lodariq.io` so no request is silently dropped.
