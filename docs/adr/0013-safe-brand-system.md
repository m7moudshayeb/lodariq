# 0013. Safe Brand System and compiled theme snapshots

- Status: Accepted
- PRD references: §3.2, §7.10, §9.3–§9.5, §11.2, §16.4, §20

## Context

Brand-sensitive customers need tooltips, modals, announcements, hotspots, and
later renderers to look native. Existing tools often force advanced teams into
CSS selectors, browser inspection, manual responsive testing, or developer
handoffs. Allowing arbitrary CSS would recreate that maintenance burden and
would weaken Lodariq's security, runtime isolation, and deterministic preview.

Preview/live drift also occurs when authoring and runtime use different visual
implementations or when a mutable workspace theme changes after publication.

## Decision

Lodariq uses a versioned, TypeBox-defined Brand Theme made of normalized
semantic tokens and renderer recipes. It does not store or execute arbitrary
customer CSS.

- Product-style matching runs only in authenticated authoring code.
- The bridge samples a bounded allowlist of resolved computed values, maps them
  into semantic roles, and discards raw CSS, selectors, class names, HTML, URLs,
  and coordinates.
- Explicit customer tokens supplied through SDK/API have higher priority than
  inferred page values.
- Inferred values carry provenance/confidence and require confirmation before
  replacing approved tokens.
- Approved theme versions are immutable.
- Server compilation receives one exact approved theme snapshot and renderer
  contract version and includes both in the compiled artifact/content hash.
- Runtime renderers use structural CSS plus controlled variables and known
  recipe mappings.
- Authoring preview uses the same `@lodariq/sdk-runtime` renderer and compatible
  compiled JSON as production.
- Theme approval or detected drift never changes a live publication
  automatically.
- Staging and production do not have hidden theme overrides; the promoted
  artifact contains the tested theme.

## Consequences

- Creators can get a native-looking result without CSS while the runtime stays
  deterministic and safe.
- Theme contract changes require schema migration and renderer conformance
  tests.
- New renderers cannot ship until they implement typed recipes, accessibility,
  responsive, visual-preflight, and preview/runtime parity coverage.
- Style sampling and drift logic must remain outside `@lodariq/sdk-runtime`.
- Customers needing arbitrary CSS must instead extend approved semantic tokens
  or request a new typed recipe; arbitrary CSS is not an escape hatch.
