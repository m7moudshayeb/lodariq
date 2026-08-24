# Agent Guardrails Memory

Keep these PRD guardrails in mind before implementing Lodariq changes. The source
of truth is `refined-lodariq-prd.md` §20; this file is a short memory aid for AI
agents working in the repo.

- Product name is Lodariq. Use `@lodariq/*` packages, `https://lodariq.io`
  for the canonical marketing origin, and `*.lodariq.io` for canonical product
  origins. `lodariq.com` is brand protection and redirects only; do not serve
  authenticated product surfaces from it.
- Always write clean, extendable code. Centralize literal value sets and labels in
  constants/maps, avoid nested ternary conditions, and avoid nested switch
  statements so future block types and actions can be added in one obvious place.
- The canonical document is structured block JSON, not Markdown. Do not add a Markdown-to-JSON compiler or custom Markdown grammar in Pre-phase, Phase 0, or Phase 1.
- Do not collapse `@lodariq/sdk-runtime` and `@lodariq/sdk-authoring`; production runtime must not depend on authoring code, React, or Lexical.
- Lexical may be imported only inside `packages/sdk-authoring/src/editor`.
- Browser compilation is preview-only. Real, content-addressed publication artifacts must be compiled server-side.
- Do not ship authoring code in the normal production runtime.
- The permanently installed SDK must render no visible creator UI by default,
  even on an authoring-enabled development/staging origin. Reveal the launcher
  only through `Ctrl/⌘ + Shift + L` or a dashboard **Open in product** intent;
  both are entry gestures, never authorization. Do not require a browser
  extension or a second creator snippet.
- Production bootstrap must not expose launcher, activation, creator-module, or
  editor-iframe metadata, and authoring code must load only after verified
  non-production origin plus creator activation. Only workspace `member`,
  `admin`, and `owner` roles may activate creator authoring; `viewer` must fail
  closed.
- Creator sign-in belongs in a first-party top-level Lodariq popup with an
  exact-origin, source/state-bound, single-use short-lived exchange. Do not
  render password fields on customer pages, discover other Lodariq tabs, or put
  bearer/session credentials in URLs, DOM attributes, persistent storage, or logs.
- The customer-page host may hold only short-lived bootstrap/activation grants
  in memory. Hand activation to the exact `editor.lodariq.io` iframe once; the
  iframe owns the document-scoped authoring-session bearer in memory.
- Keep the launcher, filmstrip, pulses, and overlay editor iframe modeless. Only
  visible chrome pixels intercept input; the customer page outside those bounds
  stays interactive. Target selection collapses overlay chrome to a movable chip
  and restores the same draft/step. The floating editor panel is not the
  authoring surface. Flow, translation, batch, appearance, release, and review
  open in an explicit operations modal. Do not mount Lexical or the session
  bearer on the customer page.
- Follow the provisionally selected Editorial Air visual direction in
  `docs/product-design/design-system-exploration-2026-08-06/README.md`: a
  light-first, release-led dashboard; restrained glass only for creator chrome;
  and separate dashboard, creator-chrome, and customer Brand Theme tokens. The
  generated logo and exact pixels are not approved assets.
- The authoring iframe and hosted public demos must not be served from the authenticated dashboard origin.
- The iframe bridge must use exact allowed origins, runtime validation, and semantic batched messages. Do not use wildcard `postMessage` targets or send every keystroke/pointer movement.
- Do not allow coordinates to trigger production interactions. Resolver coordinates are diagnostic only.
- Resolver work must use semantic scoring, lifecycle waits, scroll handling, and failure diagnostics; do not rely on CSS-first fallback chains.
- Do not allow arbitrary CSS, JavaScript, or raw HTML in documents. Use narrow allowlists and sanitization where raw import/export is unavoidable.
- Treat the Brand System as versioned semantic tokens and renderer recipes. Product-style sampling is authenticated-authoring-only; never persist raw CSS, selectors, stylesheet text, DOM/HTML snapshots, URLs, class names, or coordinates as theme data.
- Compile the exact approved Brand Theme snapshot and renderer contract version into every immutable artifact. Theme approval or drift detection must never mutate a live artifact automatically.
- Do not create per-environment document or theme copies. Active delivery is keyed by workspace, environment, and document; promotion and rollback must reuse an existing immutable compiled artifact without recompilation.
- SDK-token creation, environment configuration, editor launch, and authoring-session creation must never publish as a side effect.
- Release mutations require explicit capabilities, idempotency, compare-and-swap pointer state, and append-only history. Keep staging and production analytics separate by default.
- Do not make creators maintain code-like attributes such as `src=""`, `action=""`, or `target=""` in the primary editor.
- Slash commands are gestures, not durable syntax.
- Do not imply Lodariq can access customer database values unless they were explicitly sent through SDK/API/integrations.
- Use TypeBox/JSON Schema in `@lodariq/schema` as the canonical cross-system contract. Do not replace it with Zod.
- Host the dashboard on Fly.io, not Vercel. Do not introduce Redis, dedicated log aggregation, or a separate internal analytics vendor before a real need exists.
- Do not apply destructive database migrations to shared environments without explicit human sign-off, and back tenant isolation with PostgreSQL row-level security.
