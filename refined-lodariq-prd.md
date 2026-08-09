# Lodariq Product Requirements Document

Version: 2.1 SDK-first in-product authoring, Brand, and release model

Status: Canonical product and architecture direction; implementation remains phased

Last revised: 2026-08-08

History: this PRD supersedes the earlier ScriptFlow/Waymark and document-first drafts. **Lodariq** (Arabic تلميح — _hint_) remains the product name.

---

## Validation Summary

The original PRD is strategically strong: the product thesis, target personas, document-type expansion path, and "one script, many product-content outputs" model are coherent. The main weaknesses are technical and UX-related. The original draft over-relies on Markdown as both internal state and primary creator interface, treats Shadow DOM as stronger isolation than it is, uses a brittle ordered selector fallback chain, introduces too much infrastructure too early, and contains one concrete media-pipeline error around `gifski` and WebP.

The feedback is directionally correct and should be adopted. This revision also incorporates the stack resolution for a three-person AI-assisted engineering team: keep the PRD's structured-block product architecture, but favor managed infrastructure, TypeScript-first tooling, and provider choices that reduce operational load. The most important changes are:

1. Replace "Markdown is the source of truth" with "the structured block document is the source of truth."
2. Make the primary creator surface an outcome-first, live-product authoring workspace. Use the Lexical block editor as an internal authoring boundary where structured content needs it, not as a mandatory document-first layout.
3. Treat slash commands as temporary insertion gestures that create rendered blocks, not durable syntax creators must maintain.
4. Use Lexical as the committed primary editor foundation; keep CodeMirror and Lezer only for optional advanced source mode or internal tooling.
5. Split the SDK into loader, runtime, and authoring bundles.
6. Run the authoring panel in a sandboxed Lodariq-hosted iframe; use Shadow DOM only for rendered overlays and lightweight controls.
7. Replace ordered selector fallback with confidence-scored semantic resolution.
8. Use Floating UI for all anchored overlays.
9. Use Playwright live screenshots, Sharp/libvips, libwebp/img2webp for WebP, and gifski only for GIF fallback.
10. Use Cloudflare R2 plus Cloudflare CDN/DNS/WAF as the primary asset and manifest delivery path for lower egress cost and simpler operations; keep the object API S3-compatible.
11. Use managed services deliberately and keep the starting vendor set lean: Fly.io for the dashboard, backend containers, and workers; Neon for PostgreSQL; Resend or AWS SES for email; Stripe for billing; Sentry for errors; and Cloudflare R2 plus Cloudflare CDN/DNS/WAF for asset and manifest delivery. Lodariq owns the active credential, recovery, session, membership, workspace-selection, and bounded auth-email outbox implementation behind a provider-neutral boundary; active runtime code and dependencies are Clerk-free. Production remains disabled until the additive auth migrations are applied to the approved Neon target, the Resend domain/secrets are configured, API and dashboard capability flags are enabled together, and live probes pass. Do not adopt Vercel; host the Next.js dashboard on Fly.io next to the API. Defer Redis (Upstash or self-hosted) until a real async job exists, defer dedicated log aggregation (Axiom or self-hosted Loki/Grafana), and defer or dogfood internal product analytics instead of standing up PostHog early.
12. Use Drizzle with Neon PostgreSQL for the small AI-assisted team; define canonical schemas in TypeScript and pin dependency versions deliberately.
13. Keep ClickHouse out of Phase 1; start with PostgreSQL analytics and introduce ClickHouse Cloud only when volume justifies it.
14. Add explicit sanitization, observability, queue idempotency, data deletion workflows, and publication immutability.
15. Add a Phase 0 local UX prototype before backend-heavy MVP development.
16. Add an iframe bridge performance contract so editor keystrokes and block transactions do not create a chatty `postMessage` bottleneck.
17. Add runtime lifecycle handling for route transitions, async state, scroll containers, virtualized lists, drawers, tabs, and lazy-loaded UI.
18. Add media export cost controls for Playwright-based screenshot jobs.
19. Add a Flow Map view for branching and non-linear tour logic.
20. Add explicit target-selection mode UX, including cursor state, hover outlines, and target chips.
21. Add a customer data boundary: Lodariq cannot query customer databases and can only use data explicitly sent through SDK/API/integrations.
22. Add a workspace data catalog so customer-provided traits and events appear in dropdowns without requiring creators to memorize event or trait names.
23. Add an SDK-first pre-phase to build the full local Lodariq SDK foundation before app/backend MVP work begins: loader, runtime/player, authoring bridge, editor integration, resolver, compiler, renderers, local persistence, fixture host, and browser tests. Collaboration remains explicitly out of scope.
24. Do not introduce a Markdown-to-JSON compiler, custom Markdown grammar, or standalone WebSocket gateway in the starting phases; those conflict with the structured block model and iframe bridge.
25. Physically split the SDK into separate packages so the production runtime cannot import React or Lexical through the module system, not just through lint rules: `@lodariq/sdk-runtime` versus `@lodariq/sdk-authoring`.
26. Extract `@lodariq/schema` and `@lodariq/compiler` as a shared isomorphic core consumed by both client and server. Real publications must be compiled server-side; browser compilation is for local-dev preview only.
27. Make the origin architecture an explicit security boundary: serve the authoring iframe from a dedicated origin distinct from both the customer page and the dashboard, and serve hosted public demos from an origin separate from the authenticated dashboard.
28. Host the Next.js dashboard on Fly.io rather than Vercel to reduce vendor surface and simplify the origin and deployment model.
29. Adopt a single secrets manager (such as Doppler or Infisical) given the multi-vendor surface, and add PostgreSQL row-level security as defense-in-depth for tenant isolation.
30. Add Turborepo early for task caching, and add a CI gate that flags destructive database migrations for explicit human sign-off.
31. Make the customer's live product the primary creator workspace. The block document remains the canonical implementation contract, but creators begin from an outcome and edit the rendered experience in place.
32. Make a safe, shared Brand System foundational rather than optional polish: semantic tokens, renderer recipes, product-style matching, explicit inheritance, visual preflight, and reviewed drift repair without arbitrary CSS.
33. Treat publication as a release pipeline: publish an immutable artifact to staging, verify it there, promote that exact artifact to production without recompilation, and roll back by atomically moving a manifest pointer.
34. Narrow the initial commercial category to the in-product launch and adoption workflow for Product Marketing teams at frequently shipping B2B SaaS companies. Other personas remain collaborators and expansion users, not equal initial buyers.
35. Treat a 48/50 product score as an evidence-gated target, not a roadmap claim. Buyer clarity, usage, workflow advantage, and distribution must be proven through paid pilots, comparative usability tests, retention, and channel results.
36. Make the permanently installed SDK launcher the normal return path for creators in authenticated development and staging environments. The dashboard configures the product once; it is not a daily authoring gate, and a browser extension is not the canonical workflow.
37. Replace the fixed dock or page-width authoring bar with a draggable, modeless launcher and popup that preserve host-page hit testing. Target selection temporarily collapses the popup to a movable chip and restores it after selection.
38. Authenticate signed-out creators through a top-level first-party Lodariq popup and an exact-origin, single-use, short-lived activation exchange. Do not collect credentials in the customer page, depend on another Lodariq tab being open, or put bearer credentials in URLs or persistent browser storage.

## Feedback Disposition

| Area                 | Original PRD                     | Decision     | Refined PRD Change                                                                                                                                                                                          |
| -------------------- | -------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary editor       | Floating Markdown panel          | Change       | Outcome-first, in-product rendered editing backed by a dedicated Lexical SDK editor boundary and canonical typed transactions.                                                                              |
| CodeMirror           | CodeMirror 6                     | Reposition   | Optional advanced source mode, generated Markdown preview, or internal tooling.                                                                                                                             |
| Source of truth      | Markdown                         | Change       | Canonical structured block JSON; Markdown is export/interchange/source mode only.                                                                                                                           |
| Slash commands       | Durable command syntax           | Change       | Temporary insertion gestures that become rendered blocks.                                                                                                                                                   |
| Parser               | Custom grammar unspecified       | Defer        | Lezer only needed if advanced source mode ships; primary UX uses Lexical commands and typed block transactions.                                                                                             |
| SDK                  | Single vanilla JS SDK            | Change       | SDK-first TypeScript implementation with separate loader, runtime/player, authoring bridge, renderer, resolver, compiler, and local development entry points.                                               |
| Isolation            | Shadow DOM sandbox               | Change       | Shadow DOM for overlays; sandboxed iframe for authoring panel.                                                                                                                                              |
| Positioning          | Not specified                    | Add          | Floating UI for tooltips, hotspots, menus, coach marks.                                                                                                                                                     |
| Selectors            | Ordered CSS-first fallback       | Change       | Weighted semantic resolver with confidence thresholds.                                                                                                                                                      |
| Target attachment UX | Selector-like configuration      | Change       | Direct canvas selection mode with cursor change, hover outline, target chip, and target health.                                                                                                             |
| Customer data access | Implied app/backend knowledge    | Change       | Only use page context, identify traits, tracked events, Lodariq activity, and approved integrations.                                                                                                        |
| Customer values UX   | Manual event/trait memorization  | Add          | Workspace data catalog powers grouped dropdowns with source, environment, last-seen, and safe sample values.                                                                                                |
| Dashboard            | React + Tailwind                 | Keep, update | Use Next.js 16, Tailwind, shadcn/ui, TanStack Query, Zustand where needed, React Hook Form, TanStack Table, and Recharts. Deploy the dashboard on Fly.io next to the API; do not use Vercel.                |
| Backend              | Node + Fastify                   | Keep, update | Use Node.js 24 LTS, Fastify 5, TypeScript, TypeBox/JSON Schema, Ajv, and OpenAPI clients.                                                                                                                   |
| Database             | PostgreSQL                       | Keep, update | Use Neon PostgreSQL plus Drizzle for the three-person AI-assisted team; store block JSON, optional source serialization, compiled JSON, immutable publications, and normalized metadata.                    |
| Queue                | Redis + BullMQ                   | Limit        | Defer Redis entirely until a real async job exists; then prefer self-hosted Redis/Valkey on Fly.io (or Upstash on a fixed plan) for BullMQ worker jobs. Avoid queue infrastructure before async jobs exist. |
| CDN                  | S3 + CloudFront + Cloudflare     | Change       | Choose Cloudflare R2 plus Cloudflare CDN/DNS/WAF initially; avoid combining Cloudflare and CloudFront unless a specific enterprise requirement appears.                                                     |
| Analytics            | ClickHouse Phase 1               | Defer        | PostgreSQL first; ClickHouse Cloud later.                                                                                                                                                                   |
| Media                | gifski for WebP/GIF              | Correct      | img2webp/libwebp for WebP; gifski for GIF.                                                                                                                                                                  |
| Content model        | Fixed per-type command lists     | Change       | Global block registry with context-aware ranking and broad composition rules.                                                                                                                               |
| Validation           | Parser-style validity            | Change       | Save almost always succeeds; publish blocks only critical runtime errors.                                                                                                                                   |
| Product mental model | Document-first builder           | Change       | Outcome-first, live-product-first launch workspace; canonical block JSON is an internal contract, not the creator's starting point.                                                                         |
| Authoring entry      | Dashboard launch or extension    | Change       | One permanent SDK installation exposes a draggable creator launcher on allowed non-production origins; first-party popup authentication returns the creator to the same product page.                       |
| Styling              | Manual theme controls/CSS escape | Change       | Versioned semantic Brand System with safe product matching, renderer recipes, inheritance, visual preflight, and drift review; no creator-authored CSS.                                                     |
| Environments         | Publish independently            | Change       | Configure environments once, verify an immutable staging artifact, and promote the exact artifact to production with permissions, history, and rollback.                                                    |
| Initial buyer        | Several equal personas           | Change       | Product Marketing is the initial champion; Head/VP of Product Marketing or Product is the economic buyer. Other roles collaborate and expand later.                                                         |
| Security             | Basic content and PII controls   | Strengthen   | Sanitizers, URL/CSS allowlists, Trusted Types, no arbitrary HTML/CSS.                                                                                                                                       |
| Observability        | Not explicit                     | Add          | OpenTelemetry, Sentry, correlation IDs, selector diagnostics.                                                                                                                                               |

---

# 1. Product Vision

Lodariq is the in-product launch and adoption workspace for Product Marketing teams at frequently shipping B2B SaaS companies. A creator builds, tests, releases, measures, and repairs product experiences directly inside the customer's product. The architecture can expand across tours, announcements, hotspots, checklists, lightweight feedback, demos, and contextual knowledge, but the initial product is one coherent feature-release workflow rather than a collection of unrelated builders.

The creation workflow is consistent across content types:

1. A developer installs one script, configures exact origins, and optionally supplies design tokens and identify/track data.
2. A workspace admin configures the environment pipeline and approves the shared Brand System once.
3. A creator opens Lodariq from the SDK launcher in staging, resumes or starts an experience, selects the relevant product UI, and edits the rendered experience in place without first visiting the dashboard.
4. Lodariq validates content, targeting, placement health, responsive fit, accessibility, and brand consistency using the same renderer behavior used at runtime.
5. Lodariq compiles a safe, typed, immutable delivery artifact on the server and publishes it to staging.
6. After verification, the creator promotes that exact artifact to production without copying the experience or recompiling it.
7. Lodariq measures the release, detects target or brand drift, and provides focused repair actions.

North Star: a Product Marketing creator can move from a feature-launch idea to a brand-native, verified production experience in minutes, without CSS, developer handoffs, duplicate environment configuration, or a separate builder for every experience type.

# 2. Problem Statement

## 2.1 Maintenance Tax

Existing demo and in-app guidance tools usually depend on screenshots, DOM snapshots, or brittle visual builders. These approaches are fast to create initially but costly to maintain when a product ships frequent UI changes.

Lodariq reduces maintenance by storing product-content intent in a typed document model that can be recompiled, retargeted, versioned, reviewed, and repaired independently of any one captured visual state.

## 2.2 Fragmentation Tax

Teams often use separate tools for demos, onboarding, announcements, surveys, and feature adoption campaigns. Each tool has its own SDK, authoring model, billing plan, analytics surface, and governance process.

Lodariq consolidates these jobs into one SDK, one document system, one dashboard, and one publication pipeline.

## 2.3 Cognitive Overhead Tax

Visual builders tend to grow into separate configuration UIs for each feature type. Lodariq uses document types, reusable visual blocks, explicit configuration chips, and contextual controls so new content formats extend a single authoring paradigm rather than creating a new builder for every job.

## 2.4 Brand-Fit Tax

When visual controls are insufficient, existing tools push brand-sensitive teams toward CSS selectors, browser inspectors, `!important`, z-index fixes, manual responsive testing, or developer/professional-services handoffs. Shared theme edits may also drift from existing experiences or behave differently between builder preview and live runtime.

Lodariq should learn or receive the customer's design system once, express it through safe semantic tokens and renderer recipes, and continuously show whether every experience remains visually compatible. More styling knobs are not the goal; removing styling maintenance and uncertainty is.

## 2.5 Release-Confidence Tax

Testing and production publication are often separate configurations. Creators retarget domains, copy settings, publish a newly compiled version, or cannot prove that production received the exact artifact reviewed in staging.

Lodariq should make release state explicit inside the authoring workspace. Staging verification attaches to an immutable artifact, production promotion reuses that artifact, and rollback atomically restores an earlier artifact without deletion or recompilation.

# 3. Solution Overview

## 3.1 Core Model

The canonical source of truth is a typed Lodariq block document, but this is an implementation contract rather than the creator's primary mental model. Creators choose an outcome, work on the live product, edit the rendered experience, and use short plain-language controls. Markdown can exist as export or optional advanced source serialization; it is neither the primary PM-facing surface nor the database.

```text
Inline rendered editing -----\
Outcome/recipe controls ------+-> Typed transaction -> Canonical block model
Live-canvas interaction ------/                           |
                                                           +-> Preview with runtime renderer
Brand System selection ------------------------------------+-> Server-compiled artifact
Audience/trigger configuration ----------------------------+-> Optional source export
                                                           +-> Environment release manifest
```

The structured model preserves safety, extensibility, versioning, and deterministic compilation without forcing creators into a document-first workflow. Lodariq should feel like editing the finished experience inside the product, with the confidence of a typed runtime and release system.

An optional `Launch` aggregate groups related experiences under one product outcome. It owns shared audience, Brand System binding, environment pipeline, schedule, owner, goal, and success metric. A launch may contain a tour, announcement, and hotspot without cloning their common configuration. Checklist and feedback moments can join the same aggregate after their shared behavior is validated.

## 3.2 Key Product Capabilities

- One install script supports authoring, preview, production delivery, targeting, and analytics.
- The customer's live staging product is the primary authoring workspace; outcome selection, inline editing, preview, readiness, and release remain in one perceived surface.
- The same installed loader exposes a draggable creator launcher only on explicitly allowed development and staging origins. A browser extension may be tested later as an acquisition aid, but it is not required for normal authoring.
- Signed-out creators authenticate in a first-party top-level popup and return to the same customer page through an exact-origin, short-lived activation exchange; the customer page never hosts a Lodariq password form.
- A shared Brand System matches approved product styles through semantic tokens and safe renderer recipes, with explicit inheritance, impact preview, responsive/accessibility checks, and drift review.
- Workspace-configured environment pipelines enable one-action staging publication and exact-artifact production promotion.
- Production environments load only approved delivery runtime code.
- Slash commands insert or transform visual blocks; the slash syntax disappears after selection.
- Creators configure behavior through chips, menus, pickers, and direct manipulation rather than code-like arguments.
- Documents compile into typed JSON validated by shared schemas.
- Selectors are semantic fingerprints resolved by confidence scoring, not CSS-first fallback.
- The core output target is reliable in-app delivery. Hosted demos and email-friendly media exports remain later adjacent outputs that require separate buyer and demand evidence.
- Verification, promotion, review, versioning, rollback, and analytics are built around immutable artifacts, immutable release events, and per-document environment pointers.

# 4. Target Market and Personas

## 4.1 Primary Market

Initial focus: B2B SaaS companies with 10-500 employees that ship product changes weekly or more frequently and have a Product Marketing owner accountable for communicating and driving adoption of those changes.

Early geographic focus can remain MENA and EU, with EU data residency designed into the architecture but not overbuilt in MVP.

## 4.2 Personas

Primary champion — Product Marketing Manager:

- Creates feature launches, onboarding tours, announcements, and demo assets.
- Needs faster content updates after product changes.
- Success metric: time from approved launch brief to verified production experience drops from days to minutes, with no CSS or developer styling handoff.

Economic buyer — Head/VP of Product Marketing or Product:

- Owns launch quality, adoption outcomes, tooling budget, and production-release risk.
- Needs predictable governance without introducing an enterprise DAP implementation program.
- Success metric: more launches shipped on time with fewer design, engineering, and QA handoffs.

Expansion collaborator — Sales or Solutions Engineer:

- Builds prospect-specific interactive demos and email snippets.
- Needs personalization without maintaining brittle sandbox recordings.
- Success metric: demo creation time under 60 minutes.

Core collaborator — Product Manager:

- Owns adoption and activation workflows.
- Needs in-app guidance with review, targeting, and analytics.
- Success metric: increased feature adoption and onboarding completion.

Expansion collaborator — Customer Success or Enablement:

- Builds post-sale guidance, checklists, and contextual help.
- Needs low-code updates and visibility into user progress.
- Success metric: lower support burden and higher expansion readiness.

# 5. Competitive Positioning

Lodariq's advantage is the complete workflow: match the product automatically, author in place, validate against real runtime behavior, publish to staging, promote the exact verified artifact to production, and detect or repair drift. Typed documents, stable IDs, semantic fingerprints, and deterministic compilation are enabling architecture—not the headline product claim.

Competitive claims should be sharpened:

- Against screenshot demo tools: Lodariq stores intent and semantic targets, not only pixels.
- Against DOM snapshot tools: Lodariq supports live product execution, compiler validation, and semantic repair.
- Against in-app guidance tools: Lodariq removes CSS and builder/dashboard handoffs through a shared semantic Brand System, in-product authoring, proactive health checks, and immutable environment promotion.
- Against enterprise DAP platforms: Lodariq starts lighter, faster, and more creator-friendly while preserving a path to governance.

The moat is the interaction between the Brand System, in-context authoring, deterministic compiler, semantic resolver, and release pipeline. A theme editor or environment dropdown by itself is table stakes.

## 5.1 Product Idea Scorecard and 48/50 Gate

The scorecard is a decision framework, not a marketing claim. Product design and roadmap scope can improve plausibility, but buyer clarity, usage frequency, competitive advantage, and distribution receive a top score only after observed customer evidence.

| Scope                       | Current baseline | Expected after Phase 2 | Evidence-gated target |
| --------------------------- | ---------------: | ---------------------: | --------------------: |
| Broad platform architecture |        38.0 / 50 |             41-42 / 50 |             48.0 / 50 |
| Focused PMM launch workflow |        42.5 / 50 |           45.5-46 / 50 |             48.0 / 50 |

The SDK-first launcher decision strengthens the expected UX-weakness and
competitive-advantage scores because it removes the repeated dashboard/second-
snippet transition from the actual workflow. The Phase 2 Slice 1 hosted path is
implemented and locally verified, but code completion alone does not increase
the current score. Styling, release, deployed-operation, retention, buyer, and
distribution evidence below must still be observed.

Target composition:

| Criterion             | Broad target | Focused target | Required evidence or product constraint                                                                                                                   |
| --------------------- | -----------: | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proven demand         |          5.0 |            5.0 | Multiple established competitors earn material revenue in product adoption, tours, and in-product messaging.                                              |
| UX weakness           |          5.0 |            5.0 | Brand setup under two minutes; at least 80% publish without CSS/developer help; comparative tasks complete at least 2x faster than a leading alternative. |
| Build difficulty      |          4.0 |            4.5 | One overlay kernel and shared contracts; tour first, then announcement/hotspot; defer storage-heavy or different-category outputs.                        |
| Maintenance           |          4.0 |            4.0 | Constrained theme tokens, renderer conformance, semantic resolver fixtures, compatibility matrix, health diagnostics, and immutable release rollback.     |
| Infrastructure        |          5.0 |            5.0 | JSON/CDN delivery, PostgreSQL, batched events, and no core runtime AI, session replay, RAG, or unmetered browser jobs.                                    |
| Competitive advantage |          5.0 |            5.0 | Prove the whole match -> author -> verify -> promote -> detect/repair workflow removes design, engineering, and QA handoffs.                              |
| Buyer clarity         |          5.0 |            5.0 | At least three paid pilots with Product Marketing as the recurring champion and the same executive role approving budget.                                 |
| Usage frequency       |          5.0 |            5.0 | Target teams shipping weekly; release preparation, staging verification, promotion, analytics, and health review recur for each launch.                   |
| Expansion             |          5.0 |            5.0 | At least 40% of validated customers use two experience types under the same launch, theme, audience, and analytics model.                                 |
| Distribution          |          5.0 |            4.5 | One repeatable acquisition channel with measured conversion and acceptable payback; channel hypotheses are not proof.                                     |
| **Total**             |     **48.0** |       **48.0** |                                                                                                                                                           |

Scores must not be forced upward to satisfy the total. Broad build difficulty remains at most 4 because browser/runtime integration and multiple renderers are irreducible. Maintenance remains at most 4 until real compatibility and drift data exists. Distribution remains provisional until a channel repeatedly creates paying customers.

Phase 2 validation instruments:

- Time/actions from an allowed staging page to an authenticated, resumable
  authoring session; dashboard visits, popup recovery failures, hover-only
  actions, and host-page obstruction events.
- Time from authoring open to first brand-native preview.
- Percentage of experiences published without CSS or developer styling help.
- First-review design approval rate.
- Context switches and configuration surfaces in ordinary styling/release tasks.
- Time and error rate for publish-to-staging, verification, promotion, and rollback.
- Exact-hash preservation across every promotion.
- Target and Brand Theme drift false-positive/repair rates.
- Comparative completion time against at least one leading competitor.
- Paid-pilot champion, buyer, release frequency, retention, and acquisition-source evidence.

# 6. System Architecture

## 6.1 Logical Layers

```text
Authoring Layer
  Draggable launcher/modeless popup, inline experience editor, element/style picker, runtime preview, release state

Creator Activation Layer
  Exact-origin environment resolution, first-party popup auth, single-use code exchange, short-lived scoped session

Document Model Layer
  Lexical editor state, Lodariq block JSON, commands, validation states

Brand System Layer
  Semantic theme contracts, approved versions, renderer recipes, product-match proposals, visual health

Compiler Layer
  Schema validation, semantic fingerprints, exact theme snapshot, renderer contract, delivery JSON

Control Plane
  Workspaces, launches, documents, revisions, themes, environments, deployments, release operations, users, billing

Delivery Layer
  Document-specific manifest pointers, immutable artifacts, lazy runtime renderers, targeting, analytics batching

Worker Layer
  Optional scheduled verification/drift, exports, and webhooks only after synchronous paths prove insufficient

Data Plane
  PostgreSQL, object storage, CDN/cache, analytics tables; no queue until a real async job requires it
```

## 6.2 SDK Installation

Customer install:

```html
<script
  src="https://cdn.lodariq.com/loader/v1/lodariq-loader.js"
  data-installation="ins_pub_xxx"
  async
  crossorigin="anonymous"
></script>
```

The developer installs this loader once in the customer application. The
public installation identifier is not a bearer secret. The bootstrap API maps
the request's exact origin to one authenticated customer environment and
returns only that environment's permitted runtime policy. Dashboard
configuration may change origins, pipeline order, or authoring policy without
requiring a second creator snippet or a code change. Existing environment-token
snippets remain an explicit compatibility path while installed clients migrate
to the canonical origin-resolved public installation bootstrap.

Identification:

```ts
Lodariq.identify({
  userId: 'user_abc123',
  email: 'user@company.com',
  plan: 'pro',
  role: 'admin',
  custom: {
    company: 'Acme Corp',
    industry: 'fintech',
  },
});
```

Customer events:

```ts
Lodariq.track('project_created', {
  source: 'dashboard',
  plan: 'pro',
});
```

Optional explicit Brand System input:

```ts
Lodariq.registerBrandTokens({
  schemaVersion: '1',
  sourceId: 'customer-design-system',
  revision: 'token-build-id',
  modes: {
    light: {
      colors: { accent: '#2457ff', onAccent: '#ffffff' },
      typography: { fontFamilies: ['Customer Sans', 'system-ui'] },
    },
  },
});
```

Rules:

- A configured production origin loads only the loader and required runtime renderer bundles; it does not receive launcher or creator-bootstrap code.
- Configured staging and development origins may expose the lightweight creator launcher. The authoring bundle loads lazily only after authenticated creator activation.
- The authoring bundle is never loaded for ordinary production viewers.
- Installation identifiers are public and revocable; delivery grants and authoring sessions are short-lived, capability-scoped, and resolved server-side to one environment and exact origin.
- Registered Brand values are explicit customer-provided inputs exposed only to
  an authenticated authoring session; a public installation ID, bootstrap
  grant, or compatibility environment token cannot approve or persist workspace
  themes.

### 6.2.1 Authenticated In-Product Authoring Activation

The launcher must work whether or not `app.lodariq.com` is already open. It
must not attempt to discover arbitrary browser tabs or depend on third-party
cookie behavior.

Activation flow:

1. On an authoring-enabled development or staging origin, the installed loader
   renders the minimized Lodariq launcher without loading the authoring bundle.
2. A signed-out creator selects **Continue with Lodariq**. The launcher opens a
   top-level `https://app.lodariq.com/authoring/activate` popup. Lodariq sign-in
   and organization selection happen only on this first-party origin.
3. The activation request carries only non-secret request metadata: a random
   state value, a PKCE-style challenge, the public installation ID, and the
   claimed opener origin. The API validates membership, the exact configured
   origin, the resolved environment, and the environment's authoring policy.
4. The popup returns a single-use authorization code to the exact validated
   opener origin with `postMessage`; wildcard targets are forbidden. Popup
   cancellation, blocking, expiry, and replay have explicit retry states.
5. The launcher exchanges the code and verifier for a short-lived activation
   grant scoped to the creator, workspace, environment, exact origin, and
   capabilities. Selecting or creating a document then uses the existing
   document-scoped authoring-session endpoint.
6. After the content-addressed creator module loads, its credential-free
   sandboxed iframe at `editor.lodariq.com` proves its exact origin/source. The
   host transfers the activation grant once; the iframe selects or creates the
   document, creates and owns the document session, and never returns the
   session bearer to customer-page JavaScript. Reloading the customer page
   repeats the safe handshake and may complete without another prompt when the
   first-party Lodariq session is still valid.

No Lodariq password field is rendered inside the customer page. Bearer tokens,
activation codes, and authoring-session credentials must not be placed in URL
history or `localStorage`; the host bootstrap holds only the minimum in-memory
grant needed to create or restore the iframe session. Opening, authenticating,
minimizing, restoring, or creating an authoring session never publishes.

## 6.3 Customer Data Boundary and Catalog

Lodariq does not query or inspect the customer's database. Targeting, checklist completion, survey branching, visibility rules, and conditional logic can use only these data sources:

- Page context: URL, route, query params, page title, and visible DOM state.
- Identify traits explicitly sent through `Lodariq.identify()`.
- Events explicitly sent through `Lodariq.track()`.
- Lodariq-owned activity: document viewed, tour completed, announcement dismissed, survey submitted, checklist item completed, CTA clicked.
- Approved integrations that the customer intentionally connects.

The UI must never imply that Lodariq knows backend state unless the customer has instrumented it.

Lodariq should maintain a workspace data catalog built from observed SDK/API/integration inputs. This catalog powers dropdowns and search pickers in the builder.

Catalog entries:

```ts
interface DataCatalogEntry {
  id: string;
  source: 'identify_trait' | 'track_event' | 'lodariq_activity' | 'page_context' | 'integration';
  key: string;
  displayName?: string;
  environments: Array<'development' | 'staging' | 'production'>;
  lastSeenAt?: string;
  valueType?: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'unknown';
  sampleValues?: string[];
  isHighCardinality?: boolean;
  isSensitive?: boolean;
}
```

Builder pickers should group options by source:

```text
Lodariq activity
  Tour completed
  Announcement dismissed
  Survey submitted

User traits from identify()
  plan
  role
  daysSinceSignup

Events from track()
  project_created
  billing_connected

Page context
  Current URL
  Route contains
  Query parameter
```

Each customer-specific option should show its source, environment, and last-seen timestamp. Value suggestions may appear only when safe:

- Boolean values show `true` and `false`.
- Low-cardinality strings may show observed values such as `free`, `pro`, `enterprise`.
- High-cardinality or sensitive fields require manual entry and should not expose raw samples by default.
- Email, name, token, URL with secrets, and similar values are treated as sensitive unless explicitly configured otherwise.

If a creator searches for a trait or event Lodariq has never seen, the UI should provide an implementation handoff:

```text
No matching event found.
Ask engineering to send it with:
Lodariq.track("project_created")
```

This keeps the builder easy without pretending Lodariq has native access to customer backend data.

## 6.4 Rule Builder UX for Customer-Provided Data

Rule configuration should feel like a native Lodariq picker, but every option must map to an explicit data source.

Top-level rule options:

```text
Show when
[ Always ]
[ URL or page ]
[ User trait ]
[ Event happened ]
[ Lodariq activity ]
```

If the creator chooses `User trait`, Lodariq opens a trait picker from the data catalog:

```text
Choose trait

User traits from identify()
  plan
  role
  daysSinceSignup
  accountType
```

Then the creator chooses an operator and value:

```text
Trait
[ plan ]

Condition
[ equals ]

Value
[ pro ]
```

If the creator chooses `Event happened`, Lodariq opens an event picker:

```text
Choose event

Events from track()
  project_created
  billing_connected
  teammate_invited
```

The rule summary should remain explicit:

```text
Show when
[ Event: project_created occurred ]
```

Avoid summaries that imply business meaning Lodariq did not receive:

```text
Show when user created their first project
```

That more polished phrasing is allowed only if the customer has configured a friendly display name for the event in the data catalog.

Checklist completion should use the same explicit source model:

```text
Complete item when
[ User checks it manually ]
[ Lodariq tour completes ]
[ Host app sends event ]
```

If `Host app sends event` is selected:

```text
Event
[ project_created ]
Source: Lodariq.track()
Last seen: staging, 2 hours ago
```

This creates a friendly UX without relying on NLP, database access, or hidden product assumptions.

# 7. Document Model and Builder

## 7.1 Canonical Block Model

The canonical document model stores stable block IDs, typed content, typed behavior, targets, triggers, validation states, diagnostics, and render configuration. It is a structured block tree, not raw Markdown.

Example:

```ts
interface LodariqDocument {
  id: string;
  workspaceId: string;
  launchId?: string;
  type: 'tour' | 'announcement' | 'checklist' | 'survey' | 'hotspot' | 'knowledge';
  workflowStatus: 'draft' | 'review' | 'approved' | 'archived';
  title: string;
  trigger: TriggerDefinition;
  audience: AudienceDefinition;
  themeBinding?: ThemeBinding;
  appearance?: ExperienceAppearance;
  blocks: LodariqBlock[];
  schemaVersion: string;
}

interface LodariqBlock {
  id: string;
  type: LodariqBlockType;
  content?: string;
  props: Record<string, unknown>;
  children: LodariqBlock[];
  status?: 'ready' | 'incomplete' | 'invalid';
  diagnostics?: BlockDiagnostic[];
}
```

`live` is not a document workflow status. A document can have a newer draft
while different immutable versions are active or verified in several product
environments. Release state is derived from environment/document deployments.
Legacy string `themeRef` remains readable during schema migration, but new
writes use the typed theme binding described in §7.10.

Example tooltip block:

```json
{
  "id": "block_42",
  "type": "tooltip",
  "props": {
    "placement": "bottom",
    "targetId": "target_17"
  },
  "children": [
    {
      "id": "block_43",
      "type": "heading",
      "props": { "level": 2 },
      "content": "Create your first project",
      "children": []
    },
    {
      "id": "block_44",
      "type": "paragraph",
      "content": "Projects help organize your team's work.",
      "props": {},
      "children": []
    },
    {
      "id": "block_45",
      "type": "button",
      "content": "Continue",
      "props": {
        "variant": "primary",
        "action": { "type": "clickTarget" }
      },
      "children": []
    }
  ]
}
```

## 7.2 SDK Authoring Editor Boundary

Lodariq should build a dedicated authoring editor boundary on top of Lexical, and it should live inside the authoring package `@lodariq/sdk-authoring`, which is physically separate from the production runtime package. This is a product foundation, not a throwaway wrapper around a generic rich-text editor. The split is deliberate: because React and Lexical are dependencies of `@lodariq/sdk-authoring` and not of `@lodariq/sdk-runtime`, the production runtime cannot import them through the module system, not just by convention.

Package boundary:

```text
packages/sdk-authoring/src/editor
  Core Lexical nodes
  Commands
  Block registry
  Plugin registry
  Drag/drop and nesting
  Selection and keyboard model
  Property chips and menus
  Validation decorations
  Serialization and migrations
  Flow Map primitives when branching ships
  Test fixtures and harnesses
```

The editor lives within `@lodariq/sdk-authoring`. It may later be extracted into a dedicated `@lodariq/editor` package if the dashboard, SDK authoring iframe, tests, and future tools need a separately versioned package. Do not extract it just to satisfy an abstract monorepo shape.

Import boundary:

- `packages/sdk-authoring/src/editor` is the only source area allowed to import from `lexical` or `@lexical/*`.
- SDK authoring, iframe editor, tests, and compiler-facing code consume editor APIs through this boundary.
- `@lodariq/sdk-runtime` and production SDK bundles do not depend on `@lodariq/sdk-authoring` or any authoring editor code; this is enforced by package boundaries and verified by dependency-cruiser in CI.

Node implementation policy:

- Implement MVP nodes fully.
- Define future block types in the shared schema.
- Add placeholder renderers only when needed to load older documents, migration fixtures, or intentionally deferred document types.
- Do not maintain fake fully registered nodes for product ideas that have not been validated.
- Do not make every block a Lexical `DecoratorNode`. Use Lexical's standard text and element patterns for paragraphs, headings, lists, and inline text. Reserve custom/decorator-style nodes for Lodariq-specific UI such as target chips, validation badges, survey questions, tooltips, tour step cards, and action buttons.

MVP node families:

- Text/content: paragraph, heading, list, divider.
- Media: image/media placeholder.
- Action: button, link, dismiss, next, open page, start tour.
- Experience: tour step, tooltip, spotlight.
- Product connection: target chip, trigger chip, condition chip, data-source chip, validation badge.
- Prototype logic and graph primitives: branch placeholder, condition placeholder, Flow Map node and edge metadata.

Future schema-only block families:

- Announcement container.
- Checklist container and checklist item variants beyond the Phase 0/1 prototype.
- Survey question variants beyond the Phase 0/1 prototype.
- Hotspot and beacon variants.
- Knowledge article and search widget blocks.
- Advanced layout blocks such as columns, embeds, tables, and reusable sections.

Initial command families:

- Slash insertion commands.
- Block transform commands.
- Block wrap and unwrap commands.
- Move up/down and drag/drop reorder commands.
- Nest and unnest commands.
- Set target, action, trigger, and condition commands.
- Validation and repair commands.
- Preview patch commands.
- Flow Map edge creation and edge update commands.

Required editor capabilities:

- Custom rendered blocks that do not expose code-like syntax.
- Drag handles for top-level and nested blocks.
- Safe nesting rules by block type.
- Keyboard navigation across blocks and chips.
- Undo/redo across editor and canvas-originated transactions.
- Clipboard and paste normalization from Google Docs, Word, Notion-like editors, and plain HTML.
- Accessibility labels, focus rings, and screen-reader behavior for custom nodes.
- Serialization from Lexical state to canonical Lodariq block JSON.
- Deserialization from canonical Lodariq block JSON into Lexical state.
- Versioned migrations for older block JSON.
- Validation decorations for ready, incomplete, and invalid blocks.
- Stable Lodariq block IDs that survive editing, drag/drop, copy/paste, and migrations.
- Lexical node keys must never be treated as persistent Lodariq block IDs.
- Deterministic test fixtures for every supported block type.

Explicitly out of scope for the editor SDK pre-phase:

- Multi-user collaborative editing.
- Presence cursors.
- Comment threads.
- Realtime conflict resolution.
- Backend persistence beyond test fixtures and local examples.

## 7.3 Live Product Authoring Workspace

The primary creator interface is the rendered experience inside the customer's live staging product. The authoring iframe, structured editor, and block document remain essential implementation boundaries, but they should not force a document-first layout or vocabulary.

Default creator loop:

1. Open or restore Lodariq from the draggable launcher already present on an authoring-enabled staging or development origin.
2. If needed, authenticate in the first-party popup and return automatically to the same product page.
3. Start a new enabled experience, open an experience on this page, or preview as a user. Phase 2 exposes Tour; Phase 3 expands the enabled type and outcome catalog.
4. When the experience is contextual, click the product element involved.
5. Edit the tooltip, modal, banner, hotspot, checklist, or survey directly where it renders.
6. Use short plain-language controls for action, audience, trigger, completion, and appearance.
7. Preview with the real runtime renderer and fix only surfaced blockers.
8. Publish to the next configured environment without leaving the workspace.

Interaction rules:

- Simple experiences open with usable content, placement, behavior, and Brand System defaults; they do not begin as empty configuration forms.
- The idle launcher has three stable icon actions: **New experience**, **Experiences on this page**, and **Preview as user**. Each action has an accessible name and a short tooltip on hover or focus; the icon dock avoids repeating full labels over the customer product. `New experience` lists only types implemented and enabled for the workspace.
- Hover or focus may reveal the quick actions visually, but hover must never be the only way to discover or operate them. Click, tap, and keyboard activation pin the action palette. A pinned palette remains open across pointer leave and action activation; only an explicit launcher toggle, outside click, or `Escape` collapses it.
- Repair, the derived release action, recent release activity, and later performance data appear only when they are relevant; the launcher must not become a miniature dashboard.
- **Experiences on this page** opens a compact route-scoped list of drafts,
  staging versions, and live experiences with resume, preview, and recent
  release history. Search or **Browse all** stays inside the popup when needed;
  it does not force a dashboard transition.
- Opening the page list is browse-only and does not create a draft or authoring
  session. Page context sent for this lookup contains only a normalized pathname,
  never the query, fragment, or full customer URL. **Browse all** explicitly
  expands the selection scope from the current page to the workspace; choosing
  an item or starting the Tour flow then creates or restores its document-scoped
  authoring session.
- Selecting the launcher center opens, restores, or resumes the most relevant state. While the authoring popup is open, the launcher becomes its minimize/restore control rather than duplicating editing commands.
- The authoring surface is a bounded, draggable, modeless popup. Only its visible bounds may intercept pointer input; the customer page outside it remains clickable and scrollable.
- Target selection collapses the popup to a draggable status chip so any covered element can be selected, then restores the popup without losing draft, step, or focus context.
- The popup is viewport-clamped, edge-aware, keyboard movable, and responsive. Quick-action controls use visible labels or tooltips, real buttons, at least 44-by-44-pixel touch targets, predictable focus order, and `Escape` collapse behavior.
- Content and component controls stay on or beside the rendered experience.
- A sequence rail appears inside the popup only for genuinely multi-step experiences such as tours or checklists.
- Advanced audience, lifecycle, placement, and diagnostic controls are progressively disclosed from the item they affect.
- Autosave is quiet and continuous. Draft save remains permissive; publish blocks only critical safety or runtime failures.
- The dedicated close control and **Save & exit** are different intentional
  exits. Close revokes the activation/session and drops only iframe changes that
  have not reached persistence; previously autosaved revisions remain. **Save &
  exit** first flushes the latest iframe state, then revokes the session. Neither
  action publishes.
- Compact popup chrome shows exact draft, staging, and production release truth and derives the next primary action without occupying page width.
- Creators never re-enter theme, audience, trigger, action, or placement configuration merely to promote an artifact.
- Launcher position, popup position, minimize state, and palette expansion are local UI state only; changing them never mutates the document or a release pointer.

The current visual source of truth is **Editorial Air**, selected provisionally
on 2026-08-06 and recorded in
`docs/product-design/design-system-exploration-2026-08-06/README.md`. It uses
restrained deep-evergreen glass for the draggable launcher and popup header, a
substantially opaque warm-white popup body, persistent icon quick actions with
accessible tooltips when pinned, and clear separation between Lodariq creator chrome and the
customer-themed rendered experience. The generated logo, copy, fixture data,
and exact coordinates are illustrative; the interaction, accessibility,
security, and release contracts above remain authoritative.

The structured editor still supports familiar accelerators:

- Click and type to edit ordinary text.
- Type `/` to open a searchable block menu where that is faster than the visible add menu.
- Select a command to insert or transform a visual block.
- Edit headings, paragraphs, buttons, labels, and captions inline.
- Configure behavior through explicit chips, menus, and pickers.
- Drag blocks to reorder them where ordering is meaningful.
- Select product UI elements from the live canvas to create or update targets.
- Preview immediately without requiring manual compilation.

Slash commands are temporary creation gestures. For example:

```text
/button Take a quick tour
```

Creates a rendered button block. The slash text disappears. The creator then configures the button through a popover:

```text
What should happen when clicked?

Go to the next step
Start a tour
Open a page
Close this message
Trigger an event
```

The rendered experience may display the final block as:

```text
[ Take a quick tour ]
  Starts "Dashboard 2.0 Tour"
```

This phrasing is allowed only after the creator explicitly chooses the action and selects the tour from Lodariq's own document list. The builder must not invent product semantics or rewrite customer data into polished natural language.

The creator should not see or maintain:

```text
/button "Take a quick tour" { action="start-tour" target="tour_dashboard_v2" }
```

## 7.4 Block Transactions

The block editor and live canvas both mutate the same canonical model through typed transactions.

Supported transactions:

- `insertBlock`
- `updateBlock`
- `moveBlock`
- `removeBlock`
- `wrapBlocks`
- `unwrapBlock`
- `setTarget`
- `setAction`
- `setTrigger`
- `setCondition`
- `markIncomplete`
- `resolveDiagnostic`

Required behavior:

- Typing in the document updates the block model.
- Editing on the canvas updates the same block model.
- Dragging media above a heading changes block order in the model.
- Selecting a target on the canvas updates an explicit target chip.
- Changing a button action through a popover updates hidden action metadata.
- Neither the editor nor canvas should parse the other surface as source text.

## 7.5 Document Types as Root Renderers

| Type           | Delivery phase | Use case                        | Initial output mode                          |
| -------------- | -------------: | ------------------------------- | -------------------------------------------- |
| `tour`         |              1 | Step-by-step interactive guide  | In-app; hosted/media only after later proof  |
| `announcement` |              3 | Modal, banner, slide-in         | In-app                                       |
| `hotspot`      |              3 | Persistent beacon and tooltip   | In-app                                       |
| `checklist`    |        3 gated | Persistent onboarding checklist | In-app after shared state behavior validates |
| `survey`       |        3 gated | Lightweight product feedback    | In-app after response storage validates      |
| `knowledge`    |        6/later | Lightweight help widget         | In-app after distinct demand evidence        |

Document types control:

- Where the experience appears.
- Which triggers are available.
- Which output channels are supported.
- Which blocks are prioritized in the slash menu.
- How completion is measured.
- What runtime constraints apply.

Document types should not force rigid content forms. An announcement can contain headings, paragraphs, media, lists, columns, callouts, buttons, and dismiss actions. A tooltip can contain rich content, not only a text string. A survey question requires a response mechanism, but surrounding content remains flexible.

## 7.6 Global Block Registry

Lodariq should use a global block registry with context-aware ranking rather than separate hardcoded command lists for every document type.

Content blocks:

- Heading.
- Paragraph.
- List.
- Quote.
- Callout.
- Divider.
- Spacer.
- Image.
- Video.
- Media.
- Embed.
- Code.
- Table.
- Columns.

Action blocks:

- Button.
- Link.
- Dismiss.
- Next.
- Back.
- Go to page.
- Start tour.
- Complete.
- Trigger event.

Experience blocks:

- Tooltip.
- Modal.
- Banner.
- Slide-in.
- Hotspot.
- Beacon.
- Spotlight.
- Pulse.
- Checklist.
- Question.

Logic and personalization blocks:

- If.
- Else.
- Branch.
- Variable.
- Personalization token.
- Show when.
- Hide when.

The slash menu should prioritize contextually relevant blocks. For example, NPS ranks highly in a survey, spotlight ranks highly in a tour, and heading/text/media/button remain available almost everywhere.

## 7.7 Unexpected Content and Validation

Lodariq should be permissive about content and structured about behavior.

| User Behavior                   | Lodariq Response                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| Types ordinary unexpected text  | Preserve as paragraph text.                                                               |
| Types an unknown slash command  | Search the slash menu; if no command is selected, leave as normal text.                   |
| Adds a button without action    | Save as incomplete button and show "Choose action."                                       |
| Deletes a required target       | Keep the block and show "Target needed."                                                  |
| Pastes from Google Docs or Word | Convert recognized headings, lists, links, and images; sanitize the rest.                 |
| Pastes unsupported formatting   | Preserve text, remove unsafe or unsupported formatting, and show an optional import note. |
| Drags a block somewhere invalid | Show valid drop locations; do not accept invalid nesting.                                 |
| References a deleted tour       | Show a broken-reference chip and relink action.                                           |
| Creates incomplete survey       | Save as draft; block publish until required pieces exist.                                 |
| Changes document type           | Migrate compatible blocks; place incompatible blocks in a review section.                 |

Validation levels:

- Ready: complete and safe to deliver.
- Incomplete: structurally valid but missing configuration; save and preview are allowed where possible.
- Invalid: cannot safely run; save is allowed, publish is blocked.

Save should almost always succeed. Publishing should be blocked only by critical runtime errors such as missing actions, unresolved targets, broken references, unsafe content, or invalid branching.

## 7.8 Markdown and Source Mode

Markdown remains useful for portability, version history, exports, support workflows, and advanced users. It should be a serialization of the block model, not the normal editing surface.

Optional advanced source mode:

- Uses CodeMirror.
- Uses Lezer only if Lodariq offers a real custom source language.
- Shows tolerant inline errors.
- Keeps unknown text visible and editable.
- Preserves the last valid compiled version.
- Offers one-click repairs where possible.
- Blocks publish, not save, when critical errors remain.

## 7.9 Flow Map for Non-Linear Experiences

The block document is the primary editing surface, but branching tours and conditional onboarding flows also need a map view. Lexical should own the editable step blocks and inline controls, while the Flow Map renders and mutates graph relationships over the same canonical model.

Lodariq should provide a Flow Map view for tours and any future document type with branching behavior.

Flow Map responsibilities:

- Show steps as nodes.
- Show conditions and transitions as edges.
- Highlight unreachable steps, loops, and broken references.
- Allow creators to add simple branches through explicit condition controls.
- Keep the block editor and flow map synchronized through the same canonical model.

Example creator-facing branch controls:

```text
If user has no projects -> show Empty state step
Otherwise -> skip to Invite teammate
After this step -> continue to Security settings
```

Canonical model sketch:

```ts
interface FlowEdge {
  id: string;
  fromBlockId: string;
  toBlockId: string;
  condition?: ConditionExpression;
  label?: string;
}
```

Phase 1 should support only linear tours plus a minimal step list. Branching can be modeled in the schema but should not be a full authoring requirement until a later phase. The PRD should avoid making advanced branching a hidden MVP dependency.

## 7.10 Brand System, Styling, and Content Safety

Styling is a core product workflow, not an escape hatch. Lodariq must produce a native-looking accessible result without requiring creators to understand CSS or configure every component. Do not allow arbitrary CSS, JavaScript, or raw HTML in author-authored documents, themes, imports, environment overrides, or runtime configuration.

### 7.10.1 Creator Contract

The default behavior is:

1. Apply the workspace's approved Brand Theme automatically.
2. If none exists, derive a safe proposal from explicitly supplied design tokens, the current product page, and the selected target.
3. Render the proposal immediately through the real production renderer.
4. Ask for confirmation only when evidence is incomplete, conflicting, inaccessible, or would change an approved token.
5. Keep every live publication unchanged until a new theme-backed artifact is explicitly published or promoted.

Primary creator actions:

```text
Match product
Use this element's look
Choose preset
Edit workspace brand
```

Creators may choose semantic options such as `accent`, `minimal`, `compact`, or `wide`. They never see selectors, CSS declarations, arbitrary token keys, font URLs, HTML, or JavaScript.

Target budgets:

- Existing approved theme: zero required configuration.
- Target-bound tooltip matched to product: at most one action.
- Modal or unbound experience matched to product: at most one element selection.
- Initial workspace brand setup: under two minutes in usability testing.
- Shared theme impact review: one surface showing affected experiences before approval.

### 7.10.2 Theme Contract and Inheritance

`@lodariq/schema` owns a versioned TypeBox `BrandThemeSnapshot` contract with `additionalProperties: false`. It contains normalized semantic roles rather than CSS property bags:

- Solid sRGB colors for surfaces, text, borders, accent states, focus, success, warning, danger, and overlay.
- Font-family names only; no font URLs.
- Bounded typography, spacing, radius, border, width, motion, and elevation values.
- Structured shadow layers rather than CSS strings.
- Light mode and optional dark mode.
- Typed renderer recipes for shipped experience types only.
- Theme, schema, contract, and content-hash versions.

Reject selectors, declarations, `var(...)`, URLs, gradients in the first version, animation names, unknown property maps, and unsafe properties such as `background-image`, `filter`, `mask`, `content`, and `cursor`.

Inheritance is intentionally narrow:

```text
Lodariq accessible baseline
  -> approved workspace theme version
  -> experience appearance preset
  -> renderer/component semantic variant
```

Documents bind either to a pinned approved theme version or to a workspace-current policy with the last acknowledged version. Per-block appearance remains semantic. Do not add environment-specific theme overrides: staging and production must render the same artifact. Product-specific or white-label brands are explicit theme/document variants.

### 7.10.3 Safe Product Matching

Style capture exists only in authenticated authoring code. Ordinary viewers never load it.

Source priority:

1. Customer-provided semantic design tokens sent explicitly through SDK/API.
2. A creator-selected product element.
3. A bounded sample of nearby visible semantic controls and page typography.
4. Lodariq's accessible fallback theme.

The authoring bridge may sample an existing target, `body`, up to six ancestors, and at most twenty nearby visible semantic controls. It may read an allowlist of resolved computed values: color, background color, typography, border, radius, padding, shadow, width, and max width. It must not crawl the full DOM, read stylesheet text, copy class names, persist DOM/HTML snapshots, mutate hover/focus state, or store diagnostic coordinates as style data.

Wait for route readiness, `document.fonts.ready`, and two stable animation frames before sampling. Normalize computed values into the theme schema, discard unsupported/raw CSS data, attach provenance and confidence, and require explicit confirmation before lower-confidence inference replaces an approved token.

Customer applications may explicitly register safe semantic tokens:

```ts
Lodariq.registerBrandTokens({
  schemaVersion: '1',
  sourceId: 'customer-design-system',
  revision: 'token-build-id',
  modes: { light: { colors: { accent: '#2457ff', onAccent: '#ffffff' } } },
});
```

The exact-origin resolved environment may expose registered values only through
a short-lived authenticated authoring session. A public installation ID,
bootstrap grant, or compatibility environment token must never authorize
persistent theme writes. Theme approval and workspace-default changes require
an admin capability.

### 7.10.4 Compiler and Renderer Parity

The compiler accepts an explicit validated `BrandThemeSnapshot` plus renderer contract version. Server compilation embeds the exact normalized theme snapshot into the immutable compiled artifact, and its content hash covers content, behavior, targets, theme values, and renderer contract version.

Runtime presentation consists only of static structural renderer CSS, schema-controlled CSS variables, and enum-to-recipe mappings. A centralized serializer emits controlled property names and normalized values; user strings are never concatenated as CSS syntax.

Authoring preview must invoke the same `@lodariq/sdk-runtime` renderer and compatible compiled JSON used in production. The iframe must not maintain a visually similar but behaviorally separate preview implementation. Changing an approved workspace theme does not mutate a live artifact or republish documents automatically.

### 7.10.5 Visual Preflight and Drift

Visual preflight checks:

- Theme/schema and renderer-contract compatibility.
- Text and control contrast.
- Long-copy overflow and primary-action clipping.
- Viewport and target collisions after Floating UI positioning.
- Missing fonts and accessible fallbacks.
- Focus visibility and reduced-motion behavior.
- Host stacking-context obstruction.
- RTL, dark mode, responsive widths, and 200 percent zoom.

Unsafe schema values, renderer failures, unreadable critical controls, clipped primary actions, and incompatible versions block publication. Missing optional fonts or preferred-layout differences may remain warnings when an accessible fallback exists.

Drift detection compares normalized style-source fingerprints, not CSS files or screenshots. It runs when authoring opens, when a creator chooses `Check brand`, and later through opt-in scheduled staging checks. Drift never changes a live theme automatically. It creates a proposed draft showing changed tokens, provenance, confidence, affected experiences, before/after runtime preview, and accessibility consequences. Approval creates a new immutable theme version; affected workspace-current documents become `needs review` until acknowledged and republished.

### 7.10.6 Storage and Safety

Persist workspace-scoped `themes`, immutable `theme_versions`, bounded `style_sources`, and `visual_check_runs`. Compiled artifacts record `themeVersionId`, `themeContentHash`, and `rendererContractVersion`. All rows use RLS and additive migrations.

Do not store complete DOM snapshots, stylesheet text, arbitrary CSS, screenshots solely for style drift, secret design-token credentials, or raw high-cardinality page content.

General content safety remains:

- Plain text by default.
- URL protocol allowlist: `https:`, `mailto:`, safe relative paths, and explicitly approved app schemes.
- Media host allowlist or proxy.
- `rehype-sanitize` only where Markdown/source import or export exists.
- DOMPurify where browser-side HTML handling is unavoidable.
- Trusted Types where available.
- Output-specific warnings when a block cannot be represented safely in an output channel.

# 8. Target Identity and Element Resolution

## 8.1 Problem

The original CSS-first fallback chain is too brittle and dangerous. CSS selectors are often implementation details. Coordinates must not trigger production clicks because they can point to unrelated controls after layout changes.

## 8.2 Target Selection Mode

Creators attach Lodariq blocks to the product through direct canvas selection. They should not write selectors, inspect DOM paths, or memorize product implementation details.

Target selection flow:

1. Creator selects a block that needs a target.
2. Creator clicks `Select element`.
3. The modeless popup collapses or moves so it cannot cover the intended UI.
4. The host page enters target selection mode.
5. Cursor changes to an indicating cursor, such as `crosshair` or a custom target cursor.
6. Page shows a subtle selection veil.
7. Hovered elements receive an outline.
8. A small hover label shows the element type and best available label.
9. Clicking an element normalizes a nested `svg`, icon, or text node to the
   meaningful interactive or visual control, attaches it immediately, and
   creates a target chip.
10. The authoring popup and normal page interaction return to their prior state.
11. A bounded passive probe samples stability and uniqueness while the render
    settles; it does not click the customer's UI or show a technical form.
12. Lodariq prompts the creator only when the resulting identity is weak or
    ambiguous, with plain-language actions such as `Choose another` or
    `Verify another state`.

Cursor states:

| State            | Cursor                              | Meaning                                                                              |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| Normal authoring | `default`                           | Creator edits document and panel normally.                                           |
| Target selection | `crosshair` or custom target cursor | Creator is selecting an element in the product.                                      |
| Blocked target   | `not-allowed`                       | Element cannot be selected, such as Lodariq UI, hidden elements, or unsafe controls. |

Hover label examples should stay mechanical and honest:

```text
Button
New Project
Click to attach
```

Placement chip examples:

```text
Appears on
[ New Project ]
```

```text
Appears on
[ Select element ]
```

Placement menu:

- Show on page.
- Choose another element.
- Before this step.
- Troubleshoot placement.
- Remove placement.

Placement status must report observed truth without exposing implementation
details by default. Matching strategy, evidence families, fingerprint, role,
and hierarchy remain behind explicit troubleshooting/developer disclosure:

```text
Verified on Staging · EN and DE · desktop · 2 hours ago
```

```text
Drift detected · review before the next release
```

Creator-facing states are **Verified**, **Drift detected**, **Ambiguous**,
**Missing**, and **Unverified**. Do not present capture confidence as a health
percentage. Advanced details may show bounded identity evidence. A legacy
selector may be disclosed only when troubleshooting an immutable Phase 1
fingerprint; selectors are not authored for Target Identity V2.

Interaction rules:

- While target selection is active, normal product clicks are intercepted.
- `Esc` cancels selection.
- Lodariq UI cannot be selected as a product target.
- Nested targets can be cycled with parent/deeper controls.
- A click-through modifier may temporarily restore product interaction if the creator needs to open a menu before selecting an item.
- The selection overlay must not permanently mutate host-page DOM styles.

## 8.3 Target Identity V2 and Legacy Compatibility

```ts
interface TargetIdentityV2 {
  schemaVersion: 2;
  targetId: string;
  intent: {
    elementKind: 'control' | 'field' | 'content' | 'container';
    requiredAction?: 'anchor' | 'observe-click' | 'focus' | 'input';
    resolutionMode?: 'semantic' | 'visual-anchor' | 'layout-slot';
  };
  invariants: {
    registryKey?: string;
    configuredAttributes?: Record<string, string>;
    semanticAttributes?: Record<string, string>;
  };
  semantics: {
    tagName?: string;
    role?: string;
    inputType?: string;
    controlGroup?: string;
  };
  context: {
    routePatternId?: string;
    stateId?: string;
    ancestorRoles?: string[];
    relationships?: Array<{
      kind: 'inside' | 'labelled-by' | 'near-heading' | 'same-group';
      semanticRole?: string;
      stableKey?: string;
    }>;
  };
  visualTopologies?: Array<{
    viewportClass: 'mobile' | 'tablet' | 'desktop';
    stateId?: string;
    target: {
      widthRatio: number;
      heightRatio: number;
      aspectRatio: number;
      centerXRatio?: number;
      centerYRatio?: number;
    };
    container?: { widthRatio: number; heightRatio: number };
    relations?: Array<{
      kind: 'inside' | 'left-of' | 'right-of' | 'above' | 'below' | 'aligned-x' | 'aligned-y';
      reference: 'container' | 'viewport' | 'semantic-peer';
      referenceKey?: string;
      distanceBucket?: 'near' | 'medium' | 'far';
      distanceRatio?: number;
    }>;
  }>;
  visualFingerprints?: Array<{
    viewportClass: 'mobile' | 'tablet' | 'desktop';
    stateId?: string;
    structuralHash: string;
    occupancyGrid: string;
    appearanceHash: string;
    neighborhoodHash: string;
    layoutSlot?: { siblingIndex: number; siblingCount: number };
  }>;
  localizedEvidence: Array<{
    locale: string;
    accessibleName?: string;
    label?: string;
    placeholder?: string;
    title?: string;
    nearbyText?: string[];
  }>;
  captureEvidence: {
    sampleCount: number;
    stableSignalFamilies: string[];
    uniqueCandidateCount: number;
    runnerUpMargin: number;
    quality: 'strong' | 'usable' | 'weak';
  };
  display: {
    authorLabel: string;
  };
}
```

`display.authorLabel` is author-only and never resolver input. Localized text is
considered only for a matching BCP 47 locale and is supporting evidence, not
durable identity. English copy must not be fuzzily compared with German UI.

`resolutionMode` separates two risk classes. `semantic` is the default and the
only mode allowed for `observe-click`, `focus`, or `input`. `visual-anchor` and
`layout-slot` are allowed only with `requiredAction: 'anchor'`; they may locate
an informational region for presentation, but the returned anchor is marked
non-interactive and cannot own a host-page action listener.

V2 does not author or persist CSS selectors, class lists, raw styles, raw URLs,
DOM/HTML snapshots, screenshots, or absolute rectangles. Existing Phase 1
`ElementFingerprint` values remain readable so immutable artifacts continue to
work. Its optional `scopedCss` is read-only compatibility and at most a small
legacy ranking hint; new capture does not populate it and V2 never falls back
to it silently. Compiling a target that contains V2 identity removes
`scopedCss` and diagnostic coordinates from its compatibility fingerprint;
fingerprint-only Phase 1 artifacts retain the legacy reader path.

`data-lodariq-id` is not required. Existing customer-owned attributes, a target
registry, or `data-lodariq-id` may be configured as optional reliability
contracts only when ordinary independent evidence cannot distinguish controls.

Visual fingerprints are bounded, one-way summaries of coarse element
structure, an 8x8 descendant-occupancy mask, quantized appearance categories,
and local neighborhood shape. They contain no text, class names, selectors,
raw computed values, HTML, screenshots, or coordinates. Lodariq-owned runtime
and creator chrome is excluded from these summaries. A sibling slot is captured
as optional evidence and participates only in explicit `layout-slot` mode.

### 8.3.1 Rendered Topology from `getBoundingClientRect()`

Authoring and runtime may call `getBoundingClientRect()` on the current element
and a bounded visual container. The raw rectangle is a viewport-relative,
scroll- and layout-dependent snapshot, not identity. Before geometry enters V2,
Lodariq normalizes it into size ratios, aspect ratio, container-to-viewport
ratios, and bounded spatial relations. Center ratios are meaningful only
relative to a role-bearing semantic container and account for that container's
scroll offset/content extent; viewport-relative center is omitted because
scroll changes it. These observations are stored only as
explicit viewport and optional state variants and are recomputed from the
current render for every resolution attempt.

For semantic and interaction targets, rendered topology may rank candidates and
report layout drift. It cannot satisfy the durable-evidence minimum, clear a tie
between otherwise identical durable candidates, or veto a uniquely resolved
durable target. For an explicit presentation-only visual mode, normalized
topology may instead be one member of a three-family visual quorum, but it can
never choose a target by itself or trigger a click, focus, input, or other
production interaction. Raw coordinates are excluded from V2 identity and
normal telemetry. During compatibility
migration, the separately required Phase 1 fingerprint may still carry its
diagnostic point for authoring overlays; V2 resolution never scores or consumes
it.

### 8.3.2 Presentation Anchors Are Not Interaction Locators

Target identity answers **which live element or semantic region the creator
meant**. Presentation anchoring answers **where the tooltip, step, spotlight,
or hotspot is drawn after that target has resolved**. These are separate
contracts.

The default one-click path anchors to the resolved element's complete live
border box. An `anchor` target may be static content or a container; it does
not need to be clickable or expose a durable semantic attribute. When semantic
evidence is insufficient, a visual quorum may resolve a non-interactive
`visual-region` anchor backed by the current live owner. After resolution, the
renderer may use the anchor's fresh rectangle to position the experience, draw
a spotlight, or follow it during scroll, resize, node replacement, and layout
changes.

When a creator intentionally needs a point or sub-region inside a larger
resolved element, Lodariq may store bounded presentation geometry outside
`TargetIdentityV2`:

```ts
type PresentationAnchor =
  | { kind: 'element-bounds' }
  | { kind: 'point'; xRatio: number; yRatio: number }
  | {
      kind: 'region';
      xRatio: number;
      yRatio: number;
      widthRatio: number;
      heightRatio: number;
    };
```

Authoring normalizes ratios to the resolved element or semantic container and
never stores absolute page/viewport coordinates. Schema and compiler validation
reject non-finite or out-of-range ratios, zero-sized regions, and regions whose
`xRatio + widthRatio` or `yRatio + heightRatio` exceeds `1`; the runtime also
clamps defensively while projecting trusted compiled input. The runtime first
resolves the owning target from durable identity, then maps the normalized point
or region onto the target's current rectangle. If that owning target cannot be
resolved safely, the experience does not render.

For the current linear Tour implementation, canonical authoring stores the
optional `presentationAnchor` on the target-bearing `tooltip` block. The
compiler validates that ownership, removes presentation geometry from body
props, and lifts it to `CompiledStep.presentationAnchor` beside the target
binding. Omitting the property is the canonical whole-element default; an
explicit `element-bounds` value remains readable.

Presentation geometry may position or crop creator-authored UI. It cannot
generate a DOM candidate, improve identity confidence, clear ambiguity, bind a
click/focus/input listener, call `elementFromPoint()`, or become an interaction
target. A step that waits for a product click still binds only to a separately
resolved target whose `requiredAction` is `observe-click`.

The authoring UX keeps whole-element anchoring as the zero-configuration
default. Exact-area anchoring is a contextual direct-manipulation gesture, such
as dragging a region inside the selection outline, rather than a coordinate
form. The current Phase 2 checkpoint implements point/region authoring and live
positioning for target-bearing Tour tooltips. Future spotlight or hotspot
renderers may consume the same contract only after their own renderer behavior
and verification ship; they are not implied by the Tour checkpoint.

## 8.4 Independent Evidence Resolution and Health

Candidates are ranked using independent evidence families instead of an ordered
fallback or duplicate points from correlated fields:

| Evidence family      | Role in resolution                                       |
| -------------------- | -------------------------------------------------------- |
| Registry contract    | Optional customer-owned durable identity                 |
| Configured attribute | Optional existing customer-owned durable identity        |
| Semantic attribute   | Narrow exact semantic evidence                           |
| Element semantics    | Element kind, role, tag, input type, and actionability   |
| Ancestor context     | Ordered semantic containment evidence                    |
| Relationship context | Label, heading, group, and containment relationships     |
| Visual topology      | Normalized container-relative shape and relations        |
| Visual structure     | Hashed element/descendant structure and occupancy        |
| Visual appearance    | Hashed quantized color, border, radius, shadow, density  |
| Visual neighborhood  | Hashed bounded ancestor and adjacent-sibling shape       |
| Layout slot          | Explicit repeater slot evidence, never a sole locator    |
| Locale-scoped text   | Supporting evidence only in the confirmed current locale |

Resolution succeeds only when:

- Element-kind, visibility, required-action, route, state, and lifecycle gates
  pass.
- Semantic and interaction targets require at least two independent durable
  nonvisual evidence families. Visual evidence and localized text do not count
  toward this minimum.
- Presentation-only visual targets require at least three independent visual
  families, a bounded candidate shortlist, and `requiredAction: 'anchor'`.
- The top candidate exceeds the confidence floor.
- Exactly one actionable candidate clearly beats the runner-up by the required
  margin.
- Required stable evidence has not drifted below the applicable quorum. Partial
  supporting drift is reported without converting an otherwise safe result
  into an interaction capability.

The resolver re-enumerates and re-resolves live candidates after render or node
replacement. It never persists a live DOM node or selects the first plausible
match. The V2 states are `found`, `ambiguous`, `missing`, and `needs_review`.
Production rendering fails closed when the result is not `found`; it does not
leave an experience attached to a stale or guessed element.

Health is evidence tied to an artifact, environment, route/state, locale,
viewport class, and observation time. The creator-facing mapping is:

| Observed condition                                     | Creator state  |
| ------------------------------------------------------ | -------------- |
| Required context resolved and was explicitly checked   | Verified       |
| It still ranks, but previously stable evidence changed | Drift detected |
| Two or more candidates remain plausible                | Ambiguous      |
| No candidate exists or the required UI is not mounted  | Missing        |
| Required locale/viewport/state has not been checked    | Unverified     |

Required targets that are missing, ambiguous, drifted, or unverified block the
verification-aware release-readiness path. Normal diagnostics contain only
opaque IDs, bounded states/reason codes, evidence-family names, score and
candidate-count buckets, locale/viewport context, and timestamps. Do not send
customer text, selectors, attributes, DOM fragments, screenshots, coordinates,
or raw URLs. Semantic-target confidence and runner-up score buckets are derived
from durable evidence only. Presentation-only anchors report their visual
quorum separately and never imply interaction safety.

## 8.5 Browser vs Server Capability

The browser SDK derives semantics from live DOM attributes, accessible-name
rules, relationships, and freshly normalized rendered topology. It does not
need an LLM, image model, screenshot, or extension for the normal authoring and
runtime path.

A later verifier may use a permissioned browser extension or customer-approved
Playwright/Chromium automation to compare a masked screenshot crop as an
additional repair or verification signal. Page-pixel capture requires explicit
browser/user permission or an automation session; the installed SDK must not
silently capture authenticated page pixels. Pixel evidence never becomes the
sole production locator or interaction trigger, and an extension remains
optional rather than a base SDK dependency.

## 8.6 Runtime Lifecycle and Virtualized UI Handling

Semantic scoring only works after the target element exists in the DOM. Modern SaaS applications often hide, destroy, or lazily create DOM nodes through virtualized lists, async tables, route transitions, tabs, drawers, popovers, and infinite scrolling. Lodariq therefore needs a runtime lifecycle layer around the resolver.

Each targetable step may include optional page-state hints:

```ts
interface RuntimeLifecycleHints {
  expectedRoute?: string;
  waitForTextLocale?: string;
  waitForText?: string;
  waitForElement?: ElementFingerprint;
  scrollContainer?: ElementFingerprint;
  scrollStrategy?: 'nearest' | 'top' | 'center' | 'bottom' | 'virtualized-search';
  openPanel?: ElementFingerprint;
  selectTab?: ElementFingerprint;
  waitForNetworkIdle?: boolean;
  timeoutMs?: number;
}
```

Resolution flow:

1. Confirm expected route or route pattern.
2. Wait for stable page state, skeleton completion, or configured readiness hint.
3. Resolve or open required container state, such as a tab, drawer, accordion, or modal.
4. If target is inside a scroll container, scroll that container, not the whole document.
5. If target is inside a virtualized list, use configured row text, nearby text, or app-provided stable attributes to drive incremental scroll/search.
6. Run V2 candidate gates and independent evidence-family resolution; use a
   Phase 1 fingerprint only for an immutable legacy target.
7. Reposition overlays with Floating UI and observers.
8. Emit privacy-safe diagnostics if resolution is missing, ambiguous, drifted,
   or unverified.

Creator-facing controls should stay friendly:

- `Wait until "Projects" is visible`.
- `Open the Billing tab first`.
- `Look inside this table`.
- `Scroll this list until target appears`.
- `Target depends on list state`.

Runtime constraints:

- Do not full-scan the page on every mutation.
- Observe the smallest relevant subtree.
- Debounce mutation-driven retries.
- Cap scroll/search attempts.
- Do not automatically click coordinates in production.
- Do not let normalized rendered topology or locale-scoped text satisfy the
  durable nonvisual evidence minimum.
- If a virtualized target cannot be made visible deterministically, block publish or require an explicit app integration hint.

# 9. SDK Architecture

## 9.1 Implementation Principle

The SDK is the first product surface and the primary pre-phase deliverable. Dashboard, API, billing, analytics UI, and managed deployment choices exist to support the SDK; they should not drive the early architecture.

Runtime philosophy should be vanilla browser primitives, but implementation should be TypeScript. The authoring SDK may use React and Lexical because it loads only for authenticated creators, but the production loader and runtime/player remain framework-free.

SDK bundle rules:

- Build SDK bundles with Rollup plus esbuild or an equivalent production bundling path.
- Target ES2020 for the first release unless customer browser requirements force a lower target.
- `lodariq-loader.js` should stay tiny and only bootstrap configuration, manifest lookup, and lazy bundle loading.
- Runtime/player bundles must not depend on React, Lexical, dashboard code, or authoring UI.
- Floating UI DOM is the only allowed default third-party dependency in the runtime/player bundle.
- Authoring bundles may use React and Lexical because they load only for authenticated creators.
- Initial CI budget gates:
  - `lodariq-loader.js` under 3 KB gzipped.
  - Core runtime plus tour renderer under 40 KB gzipped for Phase 1.
  - Authoring bundle tracked but not size-blocked in Phase 1 because it is authenticated-creator-only.

Bundles:

```text
lodariq-loader.js
lodariq-runtime.js
lodariq-authoring.js
lodariq-local-dev.js
renderers/tour.js
renderers/announcement.js
renderers/checklist.js
renderers/survey.js
renderers/hotspot.js
renderers/knowledge.js
```

Package and source boundaries:

```text
packages/
  schema/          @lodariq/schema        canonical TypeBox/JSON Schema contracts; zero runtime deps
  compiler/        @lodariq/compiler       pure isomorphic block JSON to preview/delivery JSON
  sdk-runtime/     @lodariq/sdk-runtime    no React or Lexical; production runtime surface
    loader/        install script bootstrap, manifest pointer, lazy loading
    runtime/       identify, track, targeting, analytics batching, lifecycle
    resolver/      semantic target capture, scoring, diagnostics
    renderers/     tour first, future document renderers behind lazy entry points
    local-dev/     local persistence, fixture host helpers, debug panel
  sdk-authoring/   @lodariq/sdk-authoring  React + Lexical; authenticated-creator only
    authoring/     authoring shell and iframe integration
    bridge/        host-page bridge, postMessage protocol, target picking
    editor/        Lexical nodes, commands, serialization, migrations
```

The runtime and authoring packages must be physically separate, not folders inside one `@lodariq/sdk` package. This is the single load-bearing boundary in the SDK: the production runtime bundle must never include React or Lexical, and physical package separation makes that a module-system guarantee rather than a lint rule an agent can accidentally violate. `@lodariq/schema` and `@lodariq/compiler` form a shared isomorphic core consumed by both the SDK and the server worker; the compiler must be a pure function with no DOM or Node-only dependencies. Browser compilation is used only for local-dev preview, while the trusted, content-addressed publication artifact is always compiled server-side. Enforce the remaining boundaries (no `sdk-runtime` to `sdk-authoring`, no `lexical` imports outside `sdk-authoring`) with dependency-cruiser in CI in addition to package separation. Split further only if bundle ownership, dependency boundaries, or build times justify it.

## 9.2 Loader

Responsibilities:

- Read workspace token and environment.
- Fetch manifest pointer.
- Determine eligible documents.
- Load only required runtime modules.
- Expose minimal bootstrap API.
- Support version-pinned URLs and customer-controlled upgrade channels.

## 9.3 Runtime

Responsibilities:

- Identify users.
- Evaluate targeting rules.
- Fetch immutable compiled document JSON.
- Apply only the compiled, schema-controlled Brand Theme snapshot and renderer recipes; never sample host styles at runtime.
- Resolve elements.
- Render overlays using custom elements and Shadow DOM.
- Position overlays with Floating UI.
- Batch analytics with `fetch` and `navigator.sendBeacon()` on page exit.
- Report SDK errors to Sentry with workspace, document, step, and SDK version metadata.

## 9.4 Authoring

Loaded lazily only after an authenticated creator activates authoring from an
allowed development or staging origin. The small launcher bootstrap is distinct
from the authoring bundle and is never returned to production origins.

Responsibilities:

- Draggable launcher, modeless authoring popup, element picker, and owner-bound
  exact-area presentation picker.
- Signed-out launcher state and the exact-origin activation handshake described
  in §6.2.1; Lodariq credentials are entered only in the first-party popup.
- Host-page bridge for bounded DOM inspection, highlight rendering, target
  picking, owner-bound exact-area presentation picking, and authoring-only safe
  style sampling.
- Sandboxed iframe editor hosted from a Lodariq domain.
- `New experience`, `Experiences on this page`, and `Preview as user` as the
  stable quick actions; type expansion remains capability-gated.
- Outcome launcher plus in-product rendered experience editing, backed by a Lexical editor boundary and custom Lodariq nodes where structured text behavior is required.
- Inline content controls, optional slash menu, sequence rails, property chips, Brand System controls, visual preflight, release state, review UI, and document sync.
- Versioned `postMessage` protocol between iframe and host bridge.

Iframe example:

```html
<iframe
  src="https://editor.lodariq.com/session/..."
  sandbox="allow-scripts allow-same-origin"
></iframe>
```

The launcher bootstrap may request activation but never owns account credentials.
The bridge may inspect the customer page within explicit target/style allowlists;
the iframe owns the document-scoped authoring session, document state, editor UI,
block transactions, theme proposal/approval UI, validation, release controls,
and review controls. Raw computed styles, DOM HTML, stylesheet text, class names,
and pointer streams must not cross or persist through the bridge.

Authoring decorations and preview must enhance the same renderer-owned overlay
instance used to represent the experience. Lodariq must not stack a second
authoring-only tooltip or modal over a runtime preview. The modeless popup may
move independently and must collapse while its own bounds would prevent target
selection.

## 9.5 Bridge Performance Contract

The iframe architecture is a security boundary, not a license to send every editor update across `postMessage`. The editor must remain locally responsive even when the host page is busy.

Ownership boundaries:

- Iframe owns Lexical editor state, document drafts, auth, block selection, menus, theme proposal/impact UI, validation UI, release UI, review UI, and undo/redo.
- Host-page bridge owns bounded DOM inspection, target picking, authoring-only style sampling, page-state observation, highlight rendering, scroll tracking, and live overlay preview on the customer page.
- Server owns persistence, approved theme versions, compilation, immutable artifacts, publication/release operations, environment pointers, and long-running jobs.

Bridge protocol rules:

- Keystrokes do not cross the bridge individually.
- Lexical updates are batched into semantic document patches.
- Drag/reorder events are emitted at interaction end, with optional throttled preview updates.
- Canvas scroll and resize updates are throttled with `requestAnimationFrame`.
- High-frequency pointer movement is handled in the host bridge, not the iframe.
- Preview overlay state is diffed and patched rather than re-rendered wholesale.
- Style sampling completes in the host bridge and sends one normalized, schema-validated result; pointer movement and raw computed-style work never become high-frequency messages.
- The one pre-session activation-grant handoff includes protocol version,
  request/state binding, exact source/origin validation, and one-time semantics.
  Every established-session message includes protocol version, session ID,
  document ID, and correlation ID.
- Every bridge command has an acknowledgement or timeout path.
- The iframe and host bridge negotiate allowed origins during session creation.
- Incoming iframe messages must validate the customer app parent origin, not the iframe's own Lodariq origin.
- Outbound messages must use the exact allowed target origin; do not use `postMessage(..., "*")` outside local development fixtures.
- Message payloads must be runtime-validated before dispatching Lexical commands.
- Session tokens must be short-lived and scoped to one workspace, environment, document, and authoring session.

Example bridge message bodies below omit the common protocol/session/document/
correlation envelope:

```ts
type BridgeMessage =
  | {
      type: 'target.pick.start';
      blockId: string;
      requiredAction?: TargetRequiredAction;
      fingerprint?: ElementFingerprint;
      identity?: TargetIdentityV2;
    }
  | {
      type: 'target.pick.result';
      blockId: string;
      fingerprint: ElementFingerprint;
      identity?: TargetIdentityV2;
      captureCorrelationId?: string;
    }
  | {
      type: 'target.evidence.update';
      blockId: string;
      fingerprint: ElementFingerprint;
      identity: TargetIdentityV2;
      captureCorrelationId: string;
    }
  | {
      type: 'presentation.anchor.pick.start';
      blockId: string;
      targetId: string;
      current?: PresentationAnchor;
    }
  | {
      type: 'presentation.anchor.pick.result';
      requestCorrelationId: string;
      blockId: string;
      targetId: string;
      presentationAnchor: ExactPresentationAnchor;
    }
  | {
      type: 'presentation.anchor.pick.canceled';
      requestCorrelationId: string;
      blockId: string;
      targetId: string;
    }
  | { type: 'preview.patch'; blockId: string; patch: PreviewPatch }
  | { type: 'page.lifecycle.update'; route: string; scrollState: ScrollState }
  | { type: 'resolver.diagnostic'; stepId: string; diagnostic: ResolverDiagnostic };
```

Performance targets:

- Typing latency in the editor under 50 ms at p95.
- Target highlight movement under 1 animation frame when possible.
- Preview patch application under 100 ms at p95.
- Bridge message payloads under 32 KB for normal interactions.
- No unbounded message queue growth during rapid scroll or drag.

Phase 0 may use a Shadow DOM-only prototype to validate the interaction loop quickly. Production architecture should still converge on the iframe bridge unless security and authentication requirements are proven unnecessary.

# 10. Dashboard

The dashboard is not a pre-phase dependency. It should consume the SDK/editor/compiler contracts after those are proven in the fixture host and local SDK playground.

Use:

- Next.js 16.
- React.
- Tailwind.
- shadcn/ui on Radix primitives.
- TanStack Query.
- Zustand for local client state where the state is not server-backed.
- React Hook Form for forms.
- TanStack Table for dense tables.
- Recharts for first-pass dashboard charts.
- Fly.io deployment, co-located with the API. Do not use Vercel.

Core dashboard areas:

- Administrative launches and experiences inventory with outcome, type, owner, target health, brand health, last edit, and per-environment release state. Normal page-scoped browsing and editing remain available in the in-product launcher.
- Optional fallback entry into the live-product authoring workspace plus support/debug views. Returning creators do not need to visit the dashboard to start or resume authoring.
- Review inbox.
- Administrative deployment matrix, immutable release history, audit evidence, and emergency rollback/unpublish controls. Ordinary verify, promote, rollback, and recent-history actions live contextually in authoring.
- Environment pipeline, exact origins, SDK tokens, authoring policy, publisher capabilities, approval policy, and promotion source configuration.
- Brand System editor with semantic tokens, renderer recipes, style-source provenance, impact preview, drift reports, and immutable approved theme versions.
- Segments and targeting.
- Customer data catalog for observed `identify()` traits and `track()` events.
- Analytics.
- Workspace settings, roles, billing, and audit log.

Environment controls must distinguish customer product environments from Lodariq's own infrastructure deployments. An admin configures product environments, exact origins, and policy once in the dashboard; a creator then discovers the launcher, page-scoped experiences, release truth, and the derived next action inside authoring. The normal create, edit, verify, promote, and history path must not require a dashboard/editor context switch.

SDK installation administration follows the same explicit capability boundary:
admins and owners may create installations, synchronize their exact trusted
origins, and revoke them. Other authenticated workspace roles receive only the
read-only installation identity, snippet, and mapped-origin view needed for
inspection or copying; the UI must not expose controls that can only fail with an
authorization error.

For a three-person AI-assisted team, Next.js is preferred over a plain Vite dashboard because the App Router, middleware examples, and community patterns give AI agents more useful context. The dashboard is deployed as a Next.js Node server on Fly.io alongside the API rather than on Vercel; this removes a vendor, simplifies the origin and deployment model, and avoids Vercel-specific lock-in, at the cost of giving up Vercel's preview-deploy convenience. Vite remains appropriate for isolated playgrounds, SDK fixtures, and lightweight test hosts.

Use shadcn/ui for dashboard primitives because the generated components live in the repository and can be customized deeply for Lodariq-specific screens such as the editor shell, target diagnostics, data catalog, and analytics. Use React Aria selectively when a component has complex keyboard or accessibility requirements that exceed the default shadcn/Radix behavior.

The dashboard follows the provisionally selected **Editorial Air** hierarchy:
a light-first control plane, restrained navigation, grouped experience/release
rows, inline environment progression for the selected item, and useful recent
activity. Avoid a generic summary-card wall, empty analytics, nested setup
cards, or an authoring launch form on the dashboard home. **Open in product** is
a convenience and fallback, not a daily gate. Dashboard surfaces are opaque and
quiet; glass is reserved for creator chrome. Customer Brand System tokens never
restyle Lodariq administrative UI, and Lodariq tokens never override the
customer-themed runtime experience.

# 11. Backend and Data Model

## 11.1 Backend Stack

Use:

- Node.js 24 LTS.
- Fastify 5.
- TypeScript.
- TypeBox or JSON Schema.
- Ajv validation.
- `@fastify/swagger`.
- OpenAPI-generated clients.
- Modular monolith initially.

Canonical API and SDK schemas should live in `@lodariq/schema` as TypeBox/JSON Schema definitions with inferred TypeScript types. This package also owns the bridge `postMessage` message schemas, so the iframe and host bridge validate against exactly the same definitions. Zod may be used inside dashboard forms when it improves React Hook Form ergonomics, but Zod is not the canonical cross-system contract.

A single `correlationId` should be minted at the start of an authoring session and at each publish, then propagated through the bridge envelope, API requests, worker job payloads, and OpenTelemetry baggage, so authoring, compilation, publication, playback, and export can be traced end to end.

Initial service boundaries:

```text
Control API
  Workspaces, documents, revisions, environments, users, roles, billing, publication

Authoring Gateway
  First-party activation requests, single-use code exchange, temporary scoped
  authoring sessions, and iframe bridge coordination

Worker Service
  Compilation, screenshots, media exports, webhook delivery, scheduled jobs

Event Ingestion
  Lightweight HTTP endpoint for batched SDK events
```

Do not send production analytics over WebSockets. Use batched HTTP and beacon delivery.

Do not create a standalone WebSocket gateway in Pre-phase, Phase 0, or Phase 1. The starting authoring protocol is the versioned iframe `postMessage` bridge plus normal HTTP persistence. Add WebSockets only after a specific realtime requirement appears that cannot be handled by bridge messages and HTTP polling or patches.

## 11.2 Database

Use Neon PostgreSQL as the control-plane database.

Use Drizzle for the first implementation. For a small AI-assisted team, Drizzle's TypeScript schema-as-code model gives agents and reviewers a single typed source for tables, migrations, and query shape. Pin Drizzle versions deliberately and upgrade intentionally because the ecosystem can still introduce breaking changes.

Store:

- Workspaces.
- Users and memberships.
- Roles and permissions.
- Public SDK installations, exact-origin environment mappings, short-lived
  bootstrap grants, and revocable compatibility environment tokens during
  migration.
- Authoring authorization requests/code hashes, atomic consumption/expiry, and
  short-lived hash-stored authoring sessions scoped to exact origin, document,
  creator, and closed capabilities.
- Launch aggregates and their shared goal, owner, audience, theme, schedule, and success metric.
- Documents.
- Versioned canonical block JSON as JSONB.
- Optional Markdown/source serialization.
- Versioned compiled delivery JSON.
- Normalized document metadata columns.
- Content hashes.
- Workspace themes, immutable approved theme versions, bounded style-source fingerprints, and visual-check reports.
- Immutable publication records.
- Per-document environment deployment pointers, release operations, staging verifications, and release approvals.
- Targeting definitions.
- Customer data catalog entries for observed identify traits, tracked events, page-context fields, integration fields, and Lodariq-owned activity.
- Billing metadata.
- Workflow state.

Do not store complete compiled documents only as opaque JSON blobs.

Neon branching should be part of the development workflow once CI is in place. Each pull request can run against an isolated database branch so AI-generated migrations, fixtures, and tests do not corrupt shared staging data. Branch testing proves a migration runs; it does not prove it is non-destructive, so CI should additionally flag any `DROP`, destructive `ALTER`, or column-type change in a migration diff and require explicit human sign-off before it can target a shared environment.

Tenant isolation relies on a `workspaceId` column on every multi-tenant row with application-level scoping through Drizzle. Add PostgreSQL row-level security as defense-in-depth so a missing workspace filter in agent-generated query code cannot leak data across tenants. Decide the RLS model during the schema phase, not after.

## 11.3 Publication Model

Publication is an environment-aware release pipeline, not an overwrite action. Product environments are workspace configuration and remain distinct from Lodariq's own Fly/Neon deployment environments.

### 11.3.1 Invariants

1. The active deployment key is `(workspaceId, environmentId, documentId)`. Multiple documents can be live in the same environment without replacing one another.
2. Documents and compiled artifacts are never copied per environment.
3. Publishing compiles one persisted document version plus an exact approved Brand Theme snapshot on the server.
4. Promotion references the exact source `compiledArtifactId` and `contentHash`; it never invokes the compiler.
5. Rollback creates a new immutable release event referencing a previous artifact and atomically moves the pointer; it never mutates history or recompiles.
6. Unpublish creates an auditable inactive deployment state; it never deletes publication history.
7. Draft edits and theme approvals never change an active deployment.
8. Environment selection is release state, not audience targeting. Do not store product environments inside audience definitions.
9. The first release has no per-environment content or theme overrides. If typed bindings are introduced later, their immutable bundle must be included in the promoted hash.
10. Production never allows authoring or loads authoring code.

### 11.3.2 Environment Configuration

The first release keeps one `development`, `staging`, and `production` row per workspace while allowing each row to be enabled, named, ordered, and policy-configured. This preserves the current security-tier model and avoids prematurely supporting arbitrary pipelines.

Each environment records:

- Stable ID, kind, display name, enabled state, and pipeline position.
- Exact normalized allowed origins.
- Whether authoring is enabled; production always forces false.
- Optional promotion source environment.
- Direct-publish, source-verification, approval-count, publisher-role, rollback-role, and separation-of-duties policy.

Production origins require HTTPS. Wildcards, credentials, paths, queries, fragments, and invalid trailing-path variants are rejected. Localhost HTTP is allowed only for development/staging. Default capabilities are explicit rather than inferred from a broad role rank: members edit and publish/verify non-production; admins and owners configure environments and may promote, rollback, or unpublish production according to policy.

If proven demand later requires QA, UAT, regional production, or multiple staging environments, split fixed `kind` into a security `tier` plus unique environment `slug`; do not add that complexity to the first slice.

### 11.3.3 Persistence

Keep `compiled_artifacts` immutable and content-addressed. An insert conflict reads the existing artifact; it must not rewrite the document version, compiler metadata, theme metadata, or creation time.

Add workspace-scoped, forced-RLS records:

```text
document_deployments
  workspace_id, environment_id, document_id
  active_publication_id nullable
  pending_release_operation_id nullable
  generation integer
  state active | inactive
  updated_at
  primary key (workspace_id, environment_id, document_id)

release_operations
  id, workspace_id, environment_id, document_id
  action publish | promote | rollback | unpublish
  requested_artifact_id nullable
  source_publication_id nullable
  expected_generation
  idempotency_key, request_hash
  status awaiting_approval | activating | completed | failed
  correlation_id, requested_by_user_id
  error_code nullable, created_at, completed_at nullable

publication_verifications
  id, workspace_id, environment_id, document_id, publication_id
  result passed | failed
  checks_json, verified_origin, sdk_version
  verified_by_user_id, created_at

release_approvals
  id, workspace_id, release_operation_id
  decision approved | rejected
  reason nullable, decided_by_user_id, created_at
```

`publications` remains the immutable record of successful activations and additionally stores `action`, `sourcePublicationId`, `previousPublicationId`, and `releaseOperationId`. Unpublish has no artifact, so it is a completed release operation plus an inactive deployment pointer. All new tables carry `workspaceId`, forced RLS, isolation tests, and `(workspace, environment, document)` indexes.

### 11.3.4 Artifacts and Manifest Pointers

Immutable artifacts use content-addressed paths:

```text
workspaces/{workspaceId}/documents/{documentId}/artifacts/{contentHash}.json
```

Each product environment/document has a small mutable pointer:

```text
workspaces/{workspaceId}/environments/{environmentId}/documents/{documentId}/manifest.json
```

Representative active pointer:

```json
{
  "schemaVersion": "2",
  "workspaceId": "wk_123",
  "environmentId": "env_staging",
  "documentId": "doc_123",
  "state": "active",
  "generation": 12,
  "publicationId": "pub_123",
  "activatedAt": "2026-08-06T12:00:00Z",
  "artifact": {
    "contentHash": "sha256-a91f...",
    "compilerVersion": "0.3.0",
    "rendererContractVersion": "2",
    "themeVersionId": "themev_123",
    "url": "https://cdn.lodariq.com/.../sha256-a91f....json",
    "integrity": "sha256-..."
  }
}
```

Use a TypeBox discriminated union for active and inactive pointers with `additionalProperties: false`. Immutable artifacts receive long-lived immutable caching. Pointers receive short caching with ETag revalidation and must converge globally after rollback/unpublish within 60 seconds. The database deployment row is authoritative initially; R2 pointer materialization can be added through a PostgreSQL outbox when object delivery is enabled. Do not add Redis only for this workflow.

### 11.3.5 Release Operations

Publish:

1. Resolve the explicit environment and caller capability.
2. Load a requested immutable document version and approved theme version.
3. Run server-side readiness, content, target, and visual checks.
4. Compile and validate with `@lodariq/compiler` on the server.
5. Persist/upload the immutable artifact idempotently.
6. Lock the environment/document deployment, compare the expected generation, append the operation/publication, and atomically advance only that pointer.

Promote:

1. Require an explicit source publication that is still active for the same document.
2. Require the latest configured verification and approvals.
3. Create a target publication referencing the same `compiledArtifactId`, `contentHash`, theme snapshot, and renderer contract.
4. Advance only the target pointer. Do not call the compiler.

Rollback selects a prior successful publication from the same environment/document history, requires the appropriate capability and reason, appends a rollback publication referencing that artifact, and compare-and-swap updates the pointer. Unpublish appends an auditable operation, increments the generation, and makes the pointer inactive while preserving history and analytics.

Every release mutation requires `Idempotency-Key`, explicit target environment, correlation ID, and `expectedGeneration` or `expectedActivePublicationId`. The same key and request returns the existing result; the same key with a different request hash returns `409 idempotency_conflict`; stale generation returns `409 deployment_changed`.

Creating an SDK token, opening an editor, or creating an authoring session must never publish implicitly. Those operations remain separate.

### 11.3.6 Verification, Analytics, and UI State

Verification belongs to one exact publication/hash and records manifest integrity, schema validity, exact origin, SDK/renderer versions, target resolution, lifecycle waits, Brand Theme/layout health, responsive viewports, and verifier identity/time. Editing content, targets, behavior, or theme produces a different hash and invalidates earlier verification.

Default production eligibility is:

```text
source publication is active
AND source verification passed
AND exact artifact is unchanged
AND caller can promote to production
AND required approvals are satisfied
```

The server stamps `workspaceId`, `environmentId`, `documentId`, `publicationId`, and `contentHash` onto events from the resolved token/pointer. Ignore or reject client-supplied environment identity. Staging and production analytics remain separate by default.

Per-document environment state is one of `not_published`, `activating`, `active_unverified`, `verified`, `update_available`, `awaiting_approval`, `failed`, or `inactive`. The authoring top bar derives a deterministic primary action:

```text
not ready                       -> Review blockers
staging missing or outdated     -> Publish to Staging
staging current but unverified  -> Verify on Staging
staging verified, prod outdated -> Promote to Production
production has identical hash   -> Live in Production
```

The environment menu exposes exceptions, scheduling, history, rollback, and unpublish. It must not turn the normal workflow into a repeated environment-selection form.

# 12. Infrastructure

## 12.1 Recommended Initial Stack

```text
Language and repo
  TypeScript
  Single repository
  pnpm workspaces for package boundaries
  Turborepo early for task caching (cheap to add; high CI churn from AI-assisted work)

Packages
  @lodariq/schema        canonical contracts, zero runtime deps
  @lodariq/compiler      pure isomorphic block JSON to delivery JSON
  @lodariq/sdk-runtime   loader, runtime, resolver, renderers; no React or Lexical
  @lodariq/sdk-authoring React, Lexical, editor, authoring bridge; creator-only

Pre-phase product surface
  @lodariq/sdk-runtime and @lodariq/sdk-authoring as the primary deliverables
  Fixture host app as the primary integration test surface
  Local demo/debug server only as needed
  Dashboard and production API deferred until the SDK contract is real

Runtime and dashboard
  Node.js 24 LTS
  Next.js 16
  React
  Tailwind
  shadcn/ui
  TanStack Query
  Zustand
  React Hook Form
  TanStack Table
  Recharts
  Fly.io (Next.js Node server next to the API; no Vercel)

Authoring editor
  Lexical
  packages/sdk-authoring/src/editor
  Extract @lodariq/editor later only if needed
  Custom Lodariq nodes
  CodeMirror only for optional advanced source mode

API and workers
  Fastify 5
  TypeBox or JSON Schema
  Ajv
  OpenAPI clients
  Fly.io: api service plus a separate worker service

Data
  Neon PostgreSQL
  Drizzle
  PostgreSQL row-level security for tenant isolation
  No Redis until a real async job exists; then self-hosted Redis/Valkey on Fly.io, or Upstash on a fixed plan

Jobs
  No queue before a real async job exists
  BullMQ on self-hosted Redis (or Upstash fixed plan) once jobs exist
  Consider Cloudflare Queues, SQS, or Temporal later only when durability or workflow complexity justifies it

Browser automation
  Playwright
  Isolated browser contexts
  Fly.io worker containers

Storage and delivery
  Cloudflare R2
  Cloudflare CDN/DNS/WAF
  Immutable content-addressed assets
  Short-lived manifest pointers

Analytics
  PostgreSQL initially
  ClickHouse Cloud later

Auth, billing, messaging, and observability
  Lodariq-owned credentials, opaque sessions, memberships, and workspace context
  PostgreSQL auth outbox worker with Resend delivery; production configuration remains gated
  Stripe Billing
  Sentry
  OpenTelemetry
  Secrets manager (Doppler or Infisical)

Deferred until a real need appears
  Dedicated log aggregation (Axiom, or self-hosted Loki/Grafana)
  Internal product analytics (dogfood the event pipeline, or PostHog free tier)
```

## 12.2 Queue Strategy

Pre-phase and Phase 0:

- No queue infrastructure.
- Keep all jobs local and synchronous unless the prototype proves an async boundary is needed.

Phase 1:

- Avoid BullMQ unless a real async job exists.
- Event ingestion should acknowledge batches quickly and may write directly to PostgreSQL at low volume.
- If background jobs are introduced, every job must be idempotent.

MVP worker phases:

- BullMQ can handle compilation, screenshot, export, and webhook jobs once those jobs exist.
- Prefer a small self-hosted Redis/Valkey on Fly.io for BullMQ, since the worker load is a fixed, known shape and BullMQ generates high Redis command volume that is expensive on pay-per-request plans. Upstash on a fixed plan is an acceptable alternative.
- Every job must be idempotent.
- Whatever Redis is chosen should not become the sole dependency for cache, sessions, rate limits, and durable jobs as the system scales.

Production:

- Consider Cloudflare Queues or SQS for durable queues when queue durability, throughput, or cost requires moving beyond BullMQ.
- Use dead-letter queues.
- Use idempotency keys for compilation, publication, billing, exports, and webhooks.
- Consider Temporal later for long-running multi-stage workflows.

## 12.3 CDN Strategy

Choose one primary CDN path.

Recommended:

```text
Cloudflare R2 + Cloudflare CDN/DNS/WAF + Fly.io + Neon (Redis added only when a real async job exists)
```

Use Cloudflare R2 for SDK bundles, compiled manifests, hosted demo assets, screenshots, and exports. R2 keeps the object API close to S3-compatible while avoiding a separate CloudFront layer and reducing egress exposure for high-read public assets.

Do not combine Cloudflare and CloudFront unless a specific enterprise requirement justifies the extra caching, invalidation, debugging, and observability complexity.

## 12.4 SRI Strategy

SRI is compatible with version-pinned SDK files. It is not compatible with an auto-updating stable SDK URL unless the customer updates the hash at the same time.

Use one of:

- Version-pinned SDK URL with SRI.
- Small pinned loader with SRI that loads signed manifests.
- Customer-controlled upgrade channels.

## 12.5 Deployment Topology and Origins

For an iframe-based authoring product the origin boundaries are a security design, not an incidental detail, and they should be fixed early.

```text
cdn.lodariq.com     Cloudflare R2 + CDN: loader, runtime/renderer bundles, compiled
                   manifests, hosted demo assets, exports (immutable, content-addressed)
editor.lodariq.com  Authoring iframe app; a distinct origin from BOTH the customer
                   page and the dashboard
app.lodariq.com     Next.js dashboard and top-level creator activation popup on Fly.io
api.lodariq.com     Fastify API on Fly.io (api service)
                   plus a separate Fly.io worker service for compile/screenshot/export jobs
demos.lodariq.com   Hosted public demo player; a separate origin from the authenticated
                   dashboard so viewer sessions never share cookies with it
```

Rules:

- The authoring iframe origin (`editor.lodariq.com`) must be distinct from the dashboard origin. Even if the editor is later embedded in the dashboard, it must remain served from its own canonical origin so cross-origin isolation and `postMessage` origin checks stay meaningful.
- The first-party activation popup may use `app.lodariq.com/authoring/activate`
  so it can reuse the normal Lodariq login session. It returns only a single-use
  code to the exact validated customer origin; the editor iframe remains on
  `editor.lodariq.com`.
- Public, unauthenticated demo traffic must not run on the authenticated dashboard origin.
- The dashboard, API, and worker run on Fly.io. The API and worker are separate deployables because Playwright export jobs need their own scaling tier and isolation, as described in section 13.
- Vercel is not used.

## 13.1 Hosted Public Demo

Every published tour can generate a hosted URL:

```text
https://app.lodariq.com/demo/acme-enterprise-demo
```

Requirements:

- No Lodariq account required to view unless restricted.
- Optional password protection.
- Optional expiry.
- Optional allowed domains.
- Open Graph metadata.
- Personalization variables.
- Viewer analytics with consent controls where required.

## 13.2 Animated Export

Use live Playwright sessions to capture actual screenshots after each step. Do not rely on stored DOM snapshots to faithfully reproduce a page later.

Pipeline:

```text
Playwright live page
  -> deterministic step screenshots
  -> Sharp/libvips crop, resize, redaction, composition
  -> libwebp/img2webp animated WebP
  -> gifski GIF fallback
  -> optional FFmpeg MP4 preview
  -> Cloudflare R2 + Cloudflare CDN asset delivery
```

Requirements:

- Redaction before persistence when possible.
- 2 MB target for email exports where feasible.
- Static PNG fallback.
- Creator trim, duration, and loop controls.
- Browser traces retained for failed export jobs.
- Export jobs are asynchronous and visibly queued.
- Low-resolution preview renders before full-quality export.
- Full-quality export requires explicit creator confirmation.
- Per-workspace concurrency and monthly quota limits prevent runaway costs.
- Screenshot frames are cached by document version, target URL, viewport, and content hash.
- Browser workers run in a separate queue and scaling tier from normal compilation jobs.
- Browser contexts are reused only when isolation guarantees are preserved.
- Failed jobs retain Playwright traces and logs, but redact sensitive content.
- Enterprise plans can purchase higher export concurrency.

Cost-control targets:

- Default export concurrency: 1 active browser job per workspace.
- Default timeout: 5 minutes per export job.
- Default frame cap: 20 frames unless user explicitly raises it.
- Preview frame size: low-resolution until final render.
- Queue status shown in the dashboard with retry and cancel controls.

# 14. Security, Privacy, and Compliance

## 14.1 Authoring Safety

- Authoring disabled in production unconditionally; environment policy cannot
  override this.
- Creator must authenticate with Lodariq before authoring.
- Environment-scoped SDK tokens.
- Sandboxed editor iframe.
- Narrow versioned `postMessage` protocol.
- Product-style sampling is authenticated-authoring-only, bounded, normalized,
  and stripped of raw CSS/DOM data before persistence.
- No `eval()` or arbitrary dynamic code execution in SDK.

## 14.2 Content Safety

- No arbitrary HTML.
- No arbitrary CSS.
- Typed semantic Brand Theme, renderer recipes, and content commands.
- Sanitization with narrow allowlists.
- Media URL validation and optional proxying.
- Compiled documents signed or integrity checked before execution.

## 14.3 PII and Redaction

- `/mask` prevents captured field values from entering screenshots, analytics, and exports.
- Server-side scanners detect common sensitive patterns.
- Customer-defined redaction rules.
- Field-level redaction audit events.
- Default analytics should avoid raw email addresses where pseudonymous IDs are enough.

## 14.4 Data Deletion

`DELETE /users/:id` must cover:

- PostgreSQL user interaction rows.
- Analytics aggregates or raw events.
- Object storage exports.
- Cached manifests if user-specific.
- Webhook retries.
- ClickHouse records once ClickHouse exists.

Deletion must be a tracked workflow, not only a SQL cascade.

## 14.5 Governance and Enterprise Controls

Core controls required before production promotion:

- Workspace membership and explicit release capabilities.
- Exact environment origin allowlists.
- Production authoring prohibition.
- Publisher/rollback policy and optional basic approval gate.
- Idempotent, compare-and-swap, append-only release history.
- PostgreSQL RLS for every workspace-scoped table.

Later enterprise controls:

- SAML SSO.
- SCIM.
- Organization-wide audit export and retention policy.
- Advanced custom roles, multiple approvers, and separation of duties.
- Domain restrictions.
- IP allowlist.
- EU data residency.
- DPA and subprocessors page.

The active runtime and dependency graph use Lodariq-owned credentials with the
established `argon2` package and Argon2id (`m=65536`, `t=3`, `p=1`, 32-byte
hash), equivalent dummy work for unknown accounts, bounded hash-work admission,
hash-stored opaque sessions, secure first-party cookies, workspace selection,
membership-backed authorization, and authoring-popup authentication behind a
provider-neutral boundary. Node crypto remains responsible for random tokens,
HMACs, and SHA-256 token/lookup hashes, not password-KDF implementation. The
additive migration retains the nullable legacy `clerk_user_id` column only as a
rollback/cutover aid; removing it requires a separately approved contract
migration.

The code milestone includes generic enumeration-resistant password enrollment/
recovery, purpose-separated single-use reset challenges, credential replacement,
prior-session revocation, a unified verification/reset outbox worker, Resend
delivery, bounded leasing/retry/terminal lifecycle, and dashboard recovery UX.
Public signup accepts no chosen password: it stores an unusable random pending
credential, and verification atomically installs the creator's chosen Argon2id
credential, verifies the email, revokes prior sessions, and creates the first
credential-bound session.

API and dashboard each enforce explicit signup/recovery capability flags; the API
delivery capability is authoritative.

This is not yet a production account cutover. Public production signup and
password recovery remain disabled until the sole `0000_initial_baseline.sql` is
applied exactly once to an approved empty Neon target, Resend domain/secrets are
configured, both services' flags are enabled together, and live
email/auth/RLS/Fly-boundary probes pass.
Invitations and member-role administration remain required product work. SAML,
SSO, and provisioning remain later enterprise capabilities and must not delay
the owned-auth deployment gates.

# 15. Observability

Build observability from the beginning.

Required:

- OpenTelemetry for traces and metrics.
- Sentry for dashboard, SDK, and worker errors.
- Structured logs.
- Correlation IDs across authoring, compile, publication, playback, and export.
- Release-operation IDs, deployment generations, source/target publication IDs,
  exact artifact/hash, and verification/approval state.
- Theme version, renderer contract, visual-preflight issue codes, and drift
  source/confidence where applicable.
- Queue job attempt IDs and idempotency IDs.
- SDK version in every event.
- Per-document and per-step resolver diagnostics.
- Browser trace or recording for failed Playwright jobs.

Selector diagnostic event:

```json
{
  "documentId": "doc_123",
  "stepId": "step_03",
  "resolutionMethod": "role_and_name",
  "confidence": 0.92,
  "candidateCount": 1,
  "primarySelectorFailed": true,
  "sdkVersion": "1.3.2"
}
```

# 16. Roadmap

## 16.0 Phase -1: Decisions and Repo Skeleton

Timeline: days 1-5  
Goal: lock the SDK-first implementation contract before agents or humans generate broad code. This phase exists because AI-assisted development moves quickly enough that unclear runtime, authoring, and bundle boundaries can create expensive churn within days.

Scope:

- Product name confirmed as **Lodariq**; use `Lodariq` for SDK globals, `@lodariq/*` for packages, and `*.lodariq.com` for canonical origins before generating implementation artifacts.
- Create one repository with pnpm workspaces.
- Add Turborepo for task caching; it is cheap to add and AI-assisted work generates high CI churn.
- Add strict TypeScript, ESLint, Prettier, Vitest, Playwright, size-limit, and dependency-cruiser.
- Create initial packages:
  - `packages/schema` (`@lodariq/schema`) for TypeBox/JSON Schema, inferred TypeScript types, and bridge message schemas.
  - `packages/compiler` (`@lodariq/compiler`) for the pure isomorphic block JSON to preview/delivery JSON compiler.
  - `packages/sdk-runtime` (`@lodariq/sdk-runtime`), with no React or Lexical, containing:
    - `src/loader` for install-script bootstrap.
    - `src/runtime` for production runtime/player behavior.
    - `src/resolver` for semantic target capture, scoring, and diagnostics.
    - `src/renderers` for tour renderer first and future lazy renderers.
    - `src/local-dev` for local persistence, debug UI, and fixture helpers.
  - `packages/sdk-authoring` (`@lodariq/sdk-authoring`), creator-only, containing:
    - `src/authoring` for the authoring UI shell.
    - `src/bridge` for host-page inspection, target picking, and `postMessage`.
    - `src/editor` for Lexical integration and editor primitives.
- Create initial apps/examples:
  - `apps/fixture-host` as the primary SaaS-like integration test surface.
  - `apps/sdk-playground` if a separate visual SDK playground is useful.
  - No production dashboard, API, or worker app yet.
- Add package-boundary checks enforced by package separation and dependency-cruiser:
  - `@lodariq/sdk-runtime` cannot import `react`, `lexical`, `@lexical/*`, `@lodariq/sdk-authoring`, or dashboard-only dependencies.
  - `lexical` imports are allowed only inside `packages/sdk-authoring/src/editor`.
  - No production runtime imports from authoring-only code.
- Add the first canonical block JSON fixture before editor UI is built.
- Add ADRs for the runtime/authoring package split, schema and compiler ownership, server-side publication compilation, authoring/editor boundary, iframe bridge, origin model, DnD approach, resolver strategy, local test harness, secrets management, tenant isolation/RLS, and the build-vs-buy trigger conditions for deferred vendors (Redis, log aggregation, internal analytics).

Acceptance criteria:

- CI runs typecheck, lint, tests, and bundle-size checks.
- The repo can build SDK loader, runtime, authoring, compiler, and fixture-host artifacts.
- Package-boundary checks fail on forbidden imports.
- The first block JSON fixture is versioned and validated by `@lodariq/schema`.
- No production product code depends on Markdown parsing, custom grammar parsing, or WebSockets.

## 16.1 Pre-Phase: Full Local SDK Foundation

Timeline: weeks 1-6  
Goal: build the entire local Lodariq SDK foundation before app/backend MVP work begins. This phase should prove that a customer can install the script into a realistic page, open local authoring, create a linear tour, select targets, preview playback, serialize the document, reload it, and play it again through SDK bundles without a production backend.

Scope:

- `packages/sdk-runtime` and `packages/sdk-authoring` as the primary implementation surfaces, with `packages/schema` and `packages/compiler` as the shared core.
- SDK entry points:
  - `lodariq-loader.js`.
  - `lodariq-runtime.js`.
  - `lodariq-authoring.js`.
  - `lodariq-local-dev.js`.
  - `renderers/tour.js`.
- Loader bootstrap:
  - Reads workspace/environment config from script attributes.
  - Supports local manifest fixtures.
  - Lazy-loads runtime, authoring, and tour renderer bundles.
- Runtime/player:
  - Exposes `Lodariq.identify()`.
  - Exposes `Lodariq.track()`.
  - Loads compiled local tour JSON.
  - Evaluates minimal local eligibility rules.
  - Renders linear tour playback with Floating UI placement.
  - Batches local analytics/debug events.
- Authoring bridge:
  - Host-page bridge for DOM inspection, target picking, hover outlines, and preview patches.
  - Versioned `postMessage` envelope with origin checks, acknowledgements, timeouts, and runtime validation.
  - Same-origin iframe mode for local development, with architecture compatible with future Lodariq-hosted iframe.
- Authoring editor:
  - Lexical integration limited to `packages/sdk-authoring/src/editor`.
  - MVP nodes for paragraph, heading, tour step, tooltip, button, target chip, and validation badge.
  - Slash command menu and command registry for MVP nodes.
  - Block transform commands, top-level drag/drop reorder, keyboard reorder, property chips, validation decorations, undo/redo, and safe basic paste handling.
- Schema and compiler:
  - `packages/schema` with TypeBox/JSON Schema for canonical document, block, target, compiled tour, bridge message, and analytics/debug event schemas.
  - Local compiler from canonical block JSON to preview/delivery JSON.
  - Serialization from Lexical state to canonical block JSON.
  - Deserialization from canonical block JSON to Lexical state.
  - Versioned block JSON migrations.
- Resolver:
  - Basic fingerprint capture.
  - Semantic target scoring.
  - Visible/enabled checks.
  - Found, missing, and ambiguous diagnostics.
  - Coordinates are diagnostic only.
- Fixture and local development:
  - `apps/fixture-host` with realistic SaaS-like routes, table/list, drawer/modal, scroll container, and lazy-loaded content.
  - `lodariq-local-dev.js` or equivalent helper for local persistence, debug panel, fixture manifest, document import/export, and reset controls.
  - Playwright tests that install the local SDK into the fixture host and exercise authoring plus playback.
- Bundle and dependency checks:
  - `@lodariq/sdk-runtime` (loader/runtime/renderers) cannot import React, Lexical, dashboard code, or `@lodariq/sdk-authoring`, enforced by package separation and dependency-cruiser.
  - Lexical imports are allowed only inside `packages/sdk-authoring/src/editor`.
  - Size checks for loader and runtime/tour renderer.

Explicitly out of scope:

- Multi-user collaboration.
- Presence cursors.
- Realtime conflict resolution.
- Backend persistence.
- Production dashboard.
- Production API.
- Production auth.
- Production publication workflow.
- Data-source chip implementation.
- Condition chip implementation beyond schema stub.
- Flow Map primitives and branching UI.
- Spotlight node unless Phase 0 usability testing proves it is essential.
- Full Google Docs or Word paste fidelity.
- Complete implementations for every future document type.
- Collaboration/Yjs wiring.
- Markdown-to-JSON compilation.
- Custom Markdown grammar with Ohm, Lezer, or any other parser.
- Standalone WebSocket service.

Pre-phase acceptance criteria:

- Fixture host can load `lodariq-loader.js` from the local build.
- Loader can lazy-load runtime, authoring, and tour renderer bundles.
- Creator can open local authoring mode inside the fixture host.
- Creator can add blocks with slash commands.
- Slash commands become rendered blocks.
- Creator can select a host-page element and attach a target chip.
- Target selection mode changes cursor, outlines hovered elements, and intercepts product clicks until target selection is completed or canceled.
- Authoring editor state serializes to canonical block JSON without losing stable block IDs.
- Canonical block JSON compiles to local delivery JSON.
- Local delivery JSON plays back as a linear tour through the runtime/player bundle.
- A tour fixture can be exported, re-imported, recompiled, and replayed without losing stable block IDs.
- Resolver succeeds when non-semantic CSS selector details change but role, label, text, or stable attributes remain.
- Resolver reports found, missing, and ambiguous states.
- Lexical node keys are not used as persistent Lodariq block IDs.
- Migrations can upgrade at least one older fixture version.
- Validation badges render ready, incomplete, and invalid states.
- Clipboard paste preserves safe basic content and strips unsupported or unsafe formatting.
- Accessibility smoke tests pass for keyboard focus, labels, and screen-reader names.
- CI fails if loader/runtime/renderers import React, Lexical, dashboard code, or authoring-only code.
- Loader is under 3 KB gzipped.
- Runtime plus tour renderer is under 40 KB gzipped.
- Collaboration is not implemented and no architecture depends on it.

## 16.2 Phase 0: SDK UX and Integration Validation

Timeline: weeks 7-9  
Goal: validate and harden the full local SDK built in Pre-phase before committing to production backend, dashboard, publication, and billing architecture.

Scope:

- Local SDK from Pre-phase.
- Hardening the loader/runtime/authoring/compiler/resolver/renderers against realistic host-page behavior.
- Same-origin iframe bridge remains acceptable locally, but the protocol must match the future cross-origin Lodariq-hosted iframe design.
- Tour document type only.
- Expanded fixture host coverage:
  - Multiple client-side routes.
  - Modal and drawer.
  - Scroll containers.
  - Table/list with repeated labels.
  - Lazy-loaded sections.
  - Basic skeleton/loading state.
  - Host app CSS transforms and z-index conflicts.
- Install the local SDK into at least one additional test app or cloned customer-like UI to avoid overfitting to the fixture host.
- Usability test script for 5-10 design partners.
- Instrumented local metrics: time to first block, time to attach first target, failed target picks, preview-open rate, and cancel rate.
- Local JSON fixture import/export for repeatable usability tests.
- Browser coverage for current Chrome, Safari, Firefox, and Edge where feasible.
- Host-page conflict checks for CSP assumptions, z-index, Shadow DOM styles, scroll containers, and route transitions.
- Basic local installation docs for engineering evaluators.
- No backend database.
- No server compiler.
- No authenticated iframe requirement.
- No standalone WebSocket service.
- No hosted demo or production runtime.

Phase 0 acceptance criteria:

- 5-10 design partners or proxy creators complete a guided SDK authoring test.
- 80 percent of tested creators understand slash-to-block insertion without documentation.
- First local tour can be created in under 10 minutes after SDK install.
- Creator can attach targets in route, drawer/modal, scroll-container, and lazy-loaded states.
- Target selection mode consistently changes cursor, outlines hovered elements, and intercepts product clicks until selection is completed or canceled.
- Preview tooltip renders on selected targets without host layout interference.
- Incomplete actions save locally without data loss.
- Unknown slash text remains ordinary text.
- Local tour fixtures export, import, recompile, and replay without losing stable block IDs.
- Bridge protocol proves origin validation, acknowledgements, timeout behavior, batching, and message-size limits.
- Loader/runtime/renderers remain under Phase 1 size budgets.
- Local installation docs are sufficient for an engineer to install the SDK into the fixture host without handholding.

## 16.3 Phase 1: Foundation

Timeline: weeks 10-16  
Goal: productionize the validated SDK and add the minimum control plane required for secure staging authoring, persistence, and linear tour playback.

Historical boundary note (2026-08-06): Phase 1 was completed codewise against a
dashboard-issued creator-launch flow. The product decision now requires the
permanently installed SDK to provide direct in-product re-entry instead. The
Phase 1 package, bridge, session, and modeless-popup foundations remain valid;
the historical entry was superseded by the locally verified Phase 2 Slice 1
hosted launcher, browse, activation, and session path on 2026-08-07. This Phase 1
section remains historical evidence and does not itself prove that later work.

Scope:

- Single repository with minimal workspace boundaries.
- `@lodariq/schema` with TypeBox/JSON Schema as the canonical contract.
- Production-ready SDK build pipeline for loader, runtime, authoring, bridge, compiler, resolver, and tour renderer.
- Productionization of the SDK authoring editor boundary.
- Canonical typed block JSON.
- Compiler from canonical block JSON to preview and delivery JSON.
- Minimal Next.js 16 dashboard for initial installation, exact-origin/environment policy, membership, support inventory, and diagnostics.
- Fastify 5 API deployed as a modular monolith.
- Clerk authentication.
- Neon PostgreSQL document storage through Drizzle.
- Staging authoring shell; the historical dashboard-issued creator snippet is a
  retained compatibility path superseded by Phase 2's permanent SDK launcher.
- Sandboxed iframe editor.
- Bridge performance contract and versioned `postMessage` protocol.
- Productionized element picker and semantic fingerprint capture from the SDK.
- Block transactions shared by editor and canvas.
- Runtime lifecycle hints for route readiness, wait-for-text, and basic scroll-into-view.
- Tour document type only.
- Runtime tour renderer for preview and staging playback.
- Floating UI for tooltip placement.
- Basic event ingestion and error reporting.
- Internal JSON/debug view.
- Resolver fixture corpus proving semantic resolution survives common CSS selector changes.
- SDK bundle-size gates for loader, runtime, renderer, and authoring bundles.
- Explicit CI check proving production runtime does not import authoring code.
- Linear tours only in the authoring UI; Flow Map schema remains internal unless explicitly enabled for testing.

Historical Phase 1 acceptance criteria (retained as the codewise baseline):

- Engineer can install the staging SDK snippet from the dashboard into a test app.
- Staging toolbar appears only for authenticated creators.
- Production environment never loads authoring bundle.
- Iframe editor owns local editing state; keystrokes do not cross the bridge.
- Bridge messages are batched and versioned.
- Typing `/button` inserts a rendered button block, not source syntax.
- Unknown slash text can remain ordinary paragraph text.
- Button without action saves as incomplete and blocks publish.
- Deleting a target marks the step incomplete without deleting content.
- Dragging blocks updates the canonical model and canvas preview.
- Canvas target selection updates an explicit target chip.
- Target chips expose view, change, and basic found/missing/ambiguous status.
- Pasted content is sanitized and unsupported formatting is reported or safely removed.
- Compiler validates block JSON and delivery JSON with shared schema.
- Resolver succeeds when a CSS selector changes but semantic signals remain stable.
- Coordinates are never used for production clicks.
- Runtime loads tour renderer lazily.
- Production runtime bundle never includes the authoring iframe, Lexical editor, or dashboard-only dependencies.
- No standalone WebSocket gateway is required for authoring.
- End-to-end flow completes in under 5 minutes for a simple 5-step tour.

Superseding entry requirements inherited by Phase 2:

- One permanent SDK installation supports delivery and lazy creator activation;
  creators do not install an extension or a second creator snippet.
- An authenticated development or staging origin exposes a draggable launcher;
  production exposes neither launcher nor creator bootstrap.
- Signed-out activation uses a first-party popup, exact-origin single-use code,
  short-lived scoped grant, and the existing document authoring session.
- The modeless popup leaves the product page clickable, collapses for target
  selection, and restores the same document and overlay state.
- Stable idle actions are **New experience**, **Experiences on this page**, and
  **Preview as user**. In the tour-only foundation, **New experience** creates a
  tour; Phase 3 expands the outcome/type catalog.
- The dashboard remains setup, administration, support, and fallback entry; it
  is not required for a returning creator's normal session.

Explicitly out of scope for Phase 1:

- Hosted public demo links.
- Server-side media export.
- Full immutable publication system.
- Branching/conditional Flow Map authoring.
- ClickHouse analytics.
- Multi-document-type production delivery.
- Markdown export.
- Custom Markdown grammar or Markdown-to-JSON compiler.
- Standalone WebSocket gateway.
- Full virtualized-list, drawer, and tab lifecycle automation.
- Full target health diagnostics menu beyond found, missing, and ambiguous.

## 16.4 Phase 2: In-Product Authoring, Brand, and Release Foundation

Timeline: weeks 16-25 (re-estimated to include hosted SDK-first creator-entry convergence)

Goal: make the existing tour workflow look native automatically and move safely from staging to production. This phase turns styling and release confidence into foundational product behavior before expanding the experience catalog.

Scope:

- Hosted convergence on the permanently installed SDK launcher for
  authoring-enabled development and staging origins; no extension or separately
  installed creator snippet is required.
- Signed-out launcher, top-level first-party activation popup, exact-origin
  one-time-code exchange, short-lived activation grant, document-scoped session
  creation, expiry/replay/cancel recovery, and production-origin exclusion.
- Converged draggable launcher and modeless authoring popup with the stable
  **New experience**, **Experiences on this page**, and **Preview as user**
  actions. Page-level drafts/history and release stay in-product.
- Selector-free Target Identity V2 capture and runtime resolution. New targets
  use independent durable semantic/context evidence, strict ambiguity and
  runner-up gates, locale-scoped supporting text, and container-relative
  rendered-topology variants; Phase 1 CSS fingerprints remain read-only
  compatibility only.
- One-click control normalization plus bounded passive stability/uniqueness
  sampling. Show an extra target-confirmation choice only for weak or ambiguous
  evidence.
- Whole-element placement remains the zero-configuration Tour default. A
  progressively disclosed exact-area action lets the creator choose a normalized
  point or region inside the already resolved owner for Tour-tooltip positioning;
  it never creates an interaction locator.
- Factual placement health—**Verified**, **Drift detected**, **Ambiguous**,
  **Missing**, and **Unverified**—backed by privacy-safe observations rather
  than capture-score badges.
- TypeBox public-installation/origin-resolution, authoring-activation/exchange,
  scoped-session, Brand Theme, style-sample, theme-binding, visual-check,
  environment-policy, deployment-pointer, verification, and release-operation
  contracts.
- Versioned accessible Lodariq fallback theme.
- Workspace themes plus immutable approved theme versions.
- Compiler input includes an exact theme snapshot and renderer contract version.
- Compiled tour artifacts embed their exact theme snapshot; renderer hardcoded visual values move to controlled semantic tokens/recipes.
- Existing authoring preview continues through the real runtime tour renderer.
- Basic Brand System editor with product match, element-style match, preset selection, provenance/confidence, impact preview, and explicit approval.
- Authoring-only bounded computed-style sampler and explicit `Lodariq.registerBrandTokens()` input.
- Per-document environment deployment pointers keyed by `(workspaceId, environmentId, documentId)`.
- Environment configuration for exact origins, pipeline order, authoring policy, publisher capabilities, verification requirement, and basic approval policy.
- Separate token creation, authoring-session creation, and publication; none may trigger another implicitly.
- Server-side publish to staging with idempotency and compare-and-swap generation.
- Staging verification tied to one publication/hash.
- Exact-artifact production promotion with no compiler call.
- Append-only rollback and unpublish operations.
- Contextual popup release state and per-document environment history. Release
  and repair actions appear only when relevant and do not replace the three
  stable launcher actions.
- Environment-stamped analytics context and separate staging/production reporting.
- Production delivery for the linear tour renderer using document-specific manifest pointers.
- PostgreSQL-first persistence and API/database pointer delivery; R2 materialization may follow through an outbox without introducing Redis.

Implementation checkpoint — 2026-08-07: Phase 2 Slice 1 is code-complete and
locally verified. One permanent public installation now resolves exact allowed
origins, exposes the production-disabled creator launcher on configured
development/staging pages, supports the stable Tour-only **New experience**,
pathname-scoped **Experiences on this page**, workspace browsing, and runtime
**Preview as user** actions, and hands document-scoped authoring sessions to the
exact editor origin with explicit revocation. The dashboard synchronizes trusted
origins and gates installation mutation to admins/owners while keeping lower
roles read-only. This checkpoint does not complete Phase 2 or prove deployed/live
infrastructure, Brand persistence, document-specific delivery, verification,
promotion, rollback, or external usability evidence.

Owned-auth checkpoint — 2026-08-07: the active API/dashboard runtime and
dependency graph are Clerk-free. Closed TypeBox contracts, Argon2id credentials
implemented with the established `argon2` package (`m=65536`, `t=3`, `p=1`,
32-byte hash), equivalent dummy work for unknown accounts, bounded hash-work
admission, generic recovery and set-password flows, hash-stored opaque sessions,
first-party secure cookies, purpose-separated challenges, unified verification/
reset outbox delivery, source-first rate limiting, workspace list/create/select
with session rotation, membership-backed authorization, authoritative API/BFF
capability gates, and activation reset-then-retry UX are code-complete. Signup
stores an unusable random pending credential; verification atomically replaces
it with the creator's chosen Argon2id credential, verifies the email, revokes
prior sessions, and creates a credential-bound session. The additive schema
keeps the nullable legacy identity column only for rollback.

The consolidated Node 24 milestone gate passed typecheck, lint, dependency
boundaries, migration safety, 66 Vitest files/648 tests, integration coverage,
all builds and size budgets, SDK asset preparation, 62 E2E tests with four
intentional skips, and the dependency audit with no known vulnerabilities. One
Firefox focus assertion passed on an immediate isolated retry and remains
recorded as a browser flake.

This checkpoint is not a production cutover. Before production auth traffic is
enabled, apply the sole `0000_initial_baseline.sql` exactly once to the approved
empty Neon target and verify RLS with the non-owner role; verify the Resend domain
and configure delivery/base-URL/from/token secrets; enable the API and dashboard
signup/recovery flags together with API Resend delivery; deploy; then complete
live email, reset/replay, BFF-source, RLS, workspace, and launcher probes. Public
signup and recovery stay disabled until those gates pass.

Implementation checkpoint — 2026-08-08: Phase 2 Slice 2 is implemented and its
local milestone gate is closed. The final Node 24 browser matrix completed with
**62 passed, four intentional dashboard cross-browser skips, and zero failures**
across Chromium, Firefox, and WebKit. The affected unit regression set passed
**42/42**; schema, authoring, and tests typechecks, relevant lint, schema and
authoring builds, authoring size budgets, and the security audit all passed. The
prior complete unit/integration repository gate remains **724/724 passed**.

The combined current-view comparison against Option 2, **Editorial Air**,
also passes structural conformance. Evidence is recorded in
`docs/product-design/implementation-captures/editorial-air-dashboard-slice2-qa.png`,
`editorial-air-authoring-panel-slice2-qa.png`, and
`editorial-air-slice2-comparison.png`. The implementation intentionally reflects
later approved decisions that differ from the original concept image: desktop
navigation is collapsed by default, controls use progressive disclosure, and
launcher actions are icon-only with accessible labels/tooltips. This result is
not approval of generated branding or exact pixels; automatic product sampling,
provenance/confidence, and exact brand-native styling remain Slice 3 work.

The Tour renderer now consumes one tokenized Brand Theme recipe in both
delivery and runtime-backed authoring preview. Workspace theme drafts,
optimistic updates, immutable approvals, first-approved default selection,
explicit default changes, document bindings, acknowledgement, and impact views
are persisted behind capability-gated APIs and dashboard controls. Direct and
hosted authoring load the document with its exact approved theme, preserve the
same renderer contract, and expose document-scoped release state. The SDK serves
document-specific active delivery instead of relying on an environment-global
current document.

The Slice 2 staging action publishes only a reviewed immutable artifact for the
configured staging environment. The server derives the canonical request hash,
requires an idempotency key and expected deployment generation, enforces
membership/session capabilities, and advances the document pointer through the
append-only release operation transaction. Its deterministic DOM-free preflight
checks artifact/theme identity, renderer compatibility, semantic contrast,
long-copy risk, and estimated 320 px density; it deliberately does not claim
real-browser target, font, clipping, stacking, RTL, zoom, or pixel verification.
The pre-deployment `0000_initial_baseline.sql` includes authoring-session
compatibility pins, theme drafts, immutable theme versions, visual-check runs,
scoped indexes, and forced RLS without historical rows or an automatic
backfill.

At the Slice 2 checkpoint, Product-style sampling and provenance/confidence
capture, real browser/runtime verification tied to the exact staging
publication, production approval and same-artifact promotion,
rollback/unpublish, analytics isolation, R2 materialization, live migration and
deployment evidence, and external usability evidence remained later Slice 3/4
or operational work.

Implementation checkpoint — 2026-08-08: Phase 2 Slice 3 is implemented locally,
but Phase 2 is **not complete**. Direct-SDK and hosted-editor authoring now wire
the in-product UI and capability-gated APIs for Product match, exact staging
verification, production promotion, and the optional approval decision without
requiring a dashboard handoff.

Product match accepts only the bounded authoring-time computed-style sample
contract or explicitly registered semantic values from
`Lodariq.registerBrandTokens()`. It produces a validated semantic-token proposal;
accepted values update only the mutable workspace Brand Theme draft, while one
privacy-safe, append-only style-source record preserves the primary source,
fingerprint hash, confidence, environment, and capture time. It does not mutate
an approved theme version or an active artifact, and it does not persist raw
CSS, selectors, stylesheet text, DOM/HTML snapshots, URLs, class names, or
coordinates.

Browser verification is bound server-side to the active staging publication,
its exact compiled artifact ID, content hash, approved theme snapshot, renderer
contract, and the request's exact allowlisted staging origin. A report is valid
only when it contains the complete closed verification-check set exactly once
and its aggregate status agrees with those checks. Production promotion selects
that verified staging publication and reuses the same immutable artifact and
hash with **zero compiler calls**. A production environment may require zero or
one approval: zero proceeds through the guarded promotion immediately; one
creates an `awaiting_approval` operation that resumes only after an explicit,
immutable approval decision. Release mutations retain capability checks,
idempotency keys, compare-and-swap deployment generations, and append-only
operation/publication history.

This local checkpoint is not deployed or live evidence and does not establish
rollback/unpublish, Brand drift detection or repair, staging/production
analytics isolation, R2 materialization, or external usability evidence. Two
known Slice 3 follow-ups remain: accepting a Product-match proposal does not yet
refresh the active authoring preview immediately, and the theme-draft
compare-and-swap plus append-only style-source insert are two repository writes
rather than one atomic transaction.

Acceptance criteria:

- A returning signed-in creator can open or restore the in-product authoring
  workspace from an allowed staging page with one deliberate action and no
  dashboard visit.
- A signed-out creator authenticates on the first-party Lodariq origin and
  returns to the same staging page; popup cancellation, expiry, replay, and
  disallowed-origin states fail closed with a clear retry path.
- Production pages never receive launcher, activation, authoring, React, or
  Lexical code. Activation and authoring-session creation never publish.
- Moving, minimizing, restoring, or expanding the launcher does not mutate a
  document or release. The host page outside the popup remains interactive, and
  target selection can reach elements previously covered by the popup.
- Launcher quick actions work with click, touch, and keyboard; hover is an
  optional visual affordance, not an activation requirement.
- Clicking nested icon/text/SVG content attaches the intended control in one
  action when at least two durable nonvisual evidence families uniquely identify
  it; no CSS selector or Lodariq-specific attribute is required in the ordinary
  flow.
- A target-bearing Tour tooltip defaults to the resolved owner's complete live
  bounds. **Use exact area** supports pointer click, pointer drag, and keyboard
  point placement, collapses/restores the modeless popup, and persists only
  normalized owner-relative geometry. The host re-resolves the same owner before
  committing; removal, replacement, hiding, ambiguity, or owner drift cancels or
  withholds the anchor. Runtime geometry positions Lodariq UI only, while any
  product-click step remains bound to the freshly resolved real owner.
- React node replacement, responsive reflow, and a confirmed locale change do
  not reuse a stale node, raw coordinate, or cross-locale text. The runtime
  re-resolves the live page and returns **Ambiguous**, **Missing**, or **Drift
  detected** instead of guessing when independent evidence no longer agrees.
- Required target contexts that have not been verified, or that are missing,
  ambiguous, or drifted, fail closed in release readiness and production
  rendering. Normal diagnostic payloads contain no customer text, selectors,
  attributes, DOM fragments, screenshots, coordinates, or raw URLs.
- Existing approved theme requires no creator configuration for a usable preview.
- At least 80 percent of tested creators publish without CSS or developer styling help.
- `Match product` returns an accessible proposal locally in under two seconds on maintained fixtures.
- Theme edits update runtime-backed preview under 250 ms at p95.
- Compiled artifacts pin content, theme, compiler, and renderer contract versions; an approved theme change never mutates a live artifact.
- Preview and production use the same compiled schema and runtime renderer.
- Unsafe token values, critical contrast failures, clipped primary actions, renderer incompatibility, and layout blockers stop publication with one focused repair path.
- Two documents can be active simultaneously in the same environment without replacing one another.
- Publishing to staging takes one primary action when readiness passes.
- Production promotion preserves the exact `compiledArtifactId` and `contentHash` and performs zero compiler calls.
- Draft edits never change active staging or production pointers.
- Rollback is globally effective within 60 seconds and preserves immutable history.
- Staging and production analytics remain separate by default.
- Production runtime remains free of React, Lexical, authoring, style sampling, and theme-editing code.

Explicitly out of scope:

- Arbitrary CSS, JavaScript, raw HTML, gradients, or unbounded token maps.
- Environment-specific theme/content copies or overrides.
- Runtime AI or continuous production DOM/style scraping.
- Multiple custom environment tiers beyond development/staging/production.
- Multi-approver enterprise workflows, scheduling, and separation-of-duties beyond the basic policy gate.
- Hosted public demos, media export, session replay, and knowledge/RAG.
- Checklist persistence and survey response storage.
- A browser extension as the primary authoring workflow. A later
  try-before-install experiment must still hand off to the SDK-based runtime and
  cannot replace the canonical overlay or authentication model.
- Screenshot/pixel matching as a required SDK locator. A later permissioned
  extension or customer-approved browser-automation verifier may use redacted
  pixels only as supporting verification or repair evidence.

## 16.5 Phase 3: Feature Launch Workflow Expansion

Timeline: weeks 26-36

Goal: expand the validated tour foundation into one coordinated PMM feature-release workflow without becoming a collection of separate builders.

Scope:

- `Launch` aggregate with goal, owner, theme, audience, environments, schedule, and success metric.
- Outcome-first launcher and in-product authoring across the shared shell.
- Announcement renderer and authoring surface.
- Hotspot renderer and authoring surface.
- Shared overlay kernel, Brand System recipe conformance, release preflight, and semantic target health across all shipped types.
- Client-side targeting evaluator using signed manifests.
- Workspace data catalog for identify traits, tracked events, page context, Lodariq activity, and approved integrations.
- Segment and trigger builder with explicit data provenance.
- Renderer-level lazy loading, frequency controls, and runtime lifecycle resolution for async page state, tabs, drawers, and virtualized containers.
- Basic launch analytics for exposure, interaction, completion, target failure, and release health.
- Checklist and lightweight survey contracts behind feature flags; production delivery proceeds only after the shared renderer/storage behavior is validated.
- Knowledge widgets, hosted demos, and media export remain later adjacencies requiring separate demand evidence.

Acceptance criteria:

- A PMM can create, style, target, verify, and release an announcement, tour, or hotspot without leaving the live-product workspace.
- One launch-level audience, theme, environment pipeline, and success metric can be reused by its experiences without hidden copies.
- Targeting evaluates correctly for explicit user attributes, tracked events, URL, Lodariq activity, and date windows.
- Missing traits/events show implementation handoff snippets rather than implying Lodariq can query customer databases.
- Runtime loads only eligible renderer bundles.
- Every shipped renderer passes Brand Theme, accessibility, responsive, lifecycle, bundle-size, and environment-promotion conformance tests.
- At least 40 percent of validated customers use two experience types under the same launch before more types are prioritized.

## 16.6 Phase 4: Workflow and Governance

Timeline: weeks 37-44

Goal: deepen governance for teams after the creation, brand, and release workflow is validated.

Scope:

- Status lifecycle: draft, review, approved, live, archived.
- Review links and inline comments.
- Version and release diffs.
- Advanced role/capability policy, approval requests, multiple approvers, separation of duties, and scheduled promotion.
- Activity and audit history.
- Release collision/dependency checks and controlled rollout percentage.
- Optional custom environment slugs/tier model only when customer demand proves the fixed pipeline insufficient.
- Customer-visible Flow Map view for tour branching only if customer evidence justifies it.

Acceptance criteria:

- Status transitions and privileged release operations enforce explicit capabilities.
- Live document edits create draft revisions and never mutate a deployed artifact.
- Review links work for non-account reviewers with email confirmation.
- Version/release diff shows content, target, behavior, Brand Theme, and environment-binding changes.
- Approval and verification are bound to an exact artifact and invalidated by change.
- Scheduled promotion still references the verified immutable artifact.
- Flow Map, if shipped, identifies broken edges and unreachable steps.

## 16.7 Phase 5: Analytics and Optimization

Timeline: weeks 45-54
Goal: measure product-content impact.

MVP analytics should remain PostgreSQL-backed unless event volume justifies ClickHouse.

Scope:

- Impressions.
- Completions.
- Drop-off by step.
- Time to complete.
- Dismissal rate.
- CTA clicks.
- Survey results.
- CSV export.
- Conversion windows.
- A/B testing.

Acceptance criteria:

- Metrics reconcile within 1 percent of raw event counts.
- Funnel view handles branches.
- A/B assignment is stable per user and document.
- Conversion event windows are configurable.
- CSV exports handle 100k rows without timeout.

## 16.8 Phase 6: Platform Maturity

Timeline: week 55+
Goal: expand enterprise readiness and integration surface.

Scope:

- Salesforce, HubSpot, Slack, Segment, Amplitude, Mixpanel, PostHog.
- Webhooks.
- Public REST API.
- SSO and SCIM.
- Audit log.
- EU data residency.
- Enterprise roles.
- Server-side design-token integrations with workspace-scoped credentials where paid demand exists.
- Checklist, survey, and knowledge depth that passed the shared renderer/release conformance and buyer tests.
- Hosted demos and metered media export only if they strengthen the same buyer workflow or have independently validated buyers and distribution.
- Mobile SDK exploration.

Acceptance criteria:

- Webhooks retry with idempotency and DLQ handling.
- SSO works with Okta and Azure AD.
- Audit log captures all privileged actions.
- Public API rate limits and auth are tested.
- Data deletion workflow covers every storage system.

# 17. Pricing and Packaging

Packaging should align with the focused PMM launch workflow. Do not package Lodariq as a bundle of unrelated content types, and do not reserve basic Brand System consistency, staging verification, production promotion, or rollback for enterprise customers; those are part of the product's reliability promise. Public pricing remains a paid-pilot hypothesis until buyer and willingness-to-pay evidence exists.

Recommended starting tiers:

| Tier           | Indicative hypothesis | Best for                                                   | Included direction                                                                                 |
| -------------- | --------------------: | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Design Partner |       $300-$750/month | Frequently shipping B2B SaaS teams validating the workflow | Guided setup, one product, Brand System, tours, staging/production release, health review          |
| Starter        |            $149/month | Small PMM teams                                            | One product, three creators, core launches, safe Brand System, staging/production, basic analytics |
| Growth         |            $399/month | PMM and product teams running recurring launches           | More MAU/launches, announcement and hotspot, review workflow, richer analytics, integrations       |
| Enterprise     |                Custom | Larger or regulated organizations                          | Multiple products, SSO/SCIM, advanced approvals, audit, residency, SLA, custom limits              |

Billing notes:

- Stripe remains the correct billing system.
- Aggregate usage before reporting MAU/metered usage.
- Use idempotency identifiers for billing events.
- Do not emit one Stripe billing event for every SDK interaction.

# 18. Success Metrics

## 18.1 Pre-Phase Through Phase 1 Metrics

- 100 percent of MVP Lexical nodes have serialization, deserialization, migration, and validation fixtures.
- Zero direct `lexical` imports outside `packages/sdk-authoring/src/editor` unless the editor boundary has been intentionally extracted into `@lodariq/editor`.
- Editor playground covers every MVP node, command, and validation state.
- Slash menu command execution under 100 ms at p95.
- Drag/drop reorder interaction under 100 ms at p95 for a 50-block document.
- Keyboard navigation works across text blocks, chips, nested blocks, and validation badges.
- Paste normalization preserves safe content and strips unsupported formatting in tested fixtures.
- 5-10 design partners complete a guided authoring test.
- 80 percent of tested creators understand slash-to-block insertion without documentation.
- First local prototype tour created in under 10 minutes.
- First saved staging tour created in under 30 minutes.
- SDK install to first authoring session under 60 minutes.
- Creator NPS above 40.
- End-to-end authoring failure rate under 5 percent.
- Resolver confidence above threshold for 95 percent of recorded steps.
- Iframe editor typing latency under 50 ms at p95.
- Preview patch application under 100 ms at p95.

## 18.2 Phase 2 Brand and Release Metrics

- Returning signed-in creator opens or restores the in-product workspace from an
  allowed staging page with one deliberate action and zero dashboard visits.
- Signed-out creator completes first-party activation and returns to the same
  page in no more than two primary actions after choosing to author, excluding
  identity-provider steps the workspace requires.
- Zero production requests for launcher activation metadata, creator bundles, or
  the authoring iframe.
- Zero launcher/popup obstruction failures: every element outside the visible
  popup bounds remains selectable, and target selection can collapse/restore
  without losing state.
- All three stable launcher actions pass mouse, keyboard, and touch validation;
  hover-only activation is zero.
- Ordinary target attachment completes with one product-element click and no
  CSS/attribute configuration when the page provides at least two durable
  nonvisual evidence families.
- Zero production interactions triggered by saved coordinates, normalized
  topology, localized text alone, or a first-match selector fallback.
- Target fixture coverage includes nested icon selection, complete DOM-node
  replacement, EN/DE locale change, responsive reflow, similar distractors,
  and a zero-marker control with no ID, class, or `data-*` attribute.
- Ambiguous or insufficient-evidence fixtures fail closed; false confident
  matches are zero in the maintained acceptance corpus.
- Existing approved Brand Theme requires zero configuration for a usable new experience.
- Median initial Brand Theme setup under two minutes in design-partner sessions.
- At least 80 percent of tested creators publish without CSS or developer styling help.
- At least 80 percent of experiences pass design review on the first review.
- `Match product` returns an accessible local proposal in under two seconds at p95 on maintained fixtures.
- Brand Theme preview update under 250 ms at p95.
- Preview/runtime controlled-fixture visual difference under 0.5 percent.
- Drift false-positive rate under 5 percent in the maintained fixture corpus.
- Zero ordinary authoring-to-release dashboard context switches.
- Ready draft to staging publication in one primary action.
- Verified staging publication to production in one action plus one deliberate production confirmation.
- 100 percent of promotions preserve the exact tested compiled artifact ID and content hash.
- Zero implicit publishes when creating tokens, environments, or authoring sessions.
- Rollback globally effective within 60 seconds.
- Staging and production analytics never merge by default.
- Two or more documents can remain independently live in the same environment.

## 18.3 Growth Metrics

- 150 paying customers by Phase 3 completion.
- 40 percent of customers using at least two document types.
- 60 percent of PMM customers create or update at least one launch per month.
- Average 8 active documents per customer.
- Gross margin above 80 percent.

## 18.4 Scale Metrics

- 500 paying customers.
- 10 enterprise customers.
- Net revenue retention above 110 percent.
- A/B testing used by 30 percent of Pro customers.
- Support ticket rate below 0.5 per customer per month.

## 18.5 Product Health Metrics

- Time to first value.
- Week 2 creator retention.
- Document completion rate.
- Brand Theme first-review approval rate.
- Styling tasks requiring developer help.
- Visual preflight blocker/warning rate by renderer and viewport.
- Brand drift detection, confirmation, false-positive, and repair rate.
- Self-healing trigger rate.
- Resolver ambiguity rate.
- Lifecycle wait/retry failure rate.
- Virtualized-container target failure rate.
- Bridge message queue depth and dropped update count.
- Media export queue wait time and cost per export.
- Authoring bundle load failures.
- Publication rollback count.
- Promotion artifact/hash mismatch count; target is zero.
- Release-operation conflict, idempotency replay, approval, and rollback latency.
- Environment/document pointer generation conflicts.
- SDK error rate by version.

# 19. Open Decisions

1. ~~Brand naming~~ **Resolved:** product name is **Lodariq** (Arabic تلميح — _hint_). Retired draft names: ScriptFlow (original PRD), Waymark (intermediate refinement).
2. Knowledge widget timing: include in Phase 3 only if it does not slow core in-app delivery.
3. Branching: decide when Flow Map authoring becomes customer-visible instead of schema-only.
4. Data catalog display names: decide whether friendly names are configured manually, imported from analytics integrations, or inferred only after user confirmation.
5. Lexical editor boundary: decide which UI components live inside `packages/sdk-authoring/src/editor`, which live in the generic `@lodariq/sdk-authoring` UI, and whether extraction to a standalone `@lodariq/editor` package is justified later.
6. Drag/drop implementation: decide whether to use native pointer logic first or a dedicated DnD library around Lexical nodes.
7. Flow Map rendering: decide whether the first implementation is custom canvas/SVG or a graph library wrapped behind Lodariq primitives.
8. Redis introduction and provider: define the first real async job that justifies introducing Redis at all, whether to self-host Redis/Valkey on Fly.io or use Upstash on a fixed plan, and the command-volume, cost, or latency threshold that later triggers moving worker jobs to Cloudflare Queues, SQS, or another durable queue.
9. R2 object privacy model: decide which generated assets are public, signed, password-protected, expiring, or workspace-private.
10. Fly.io region strategy: choose initial regions and latency targets for the dashboard, API, authoring sessions, and ingestion, and confirm they satisfy the MENA/EU data-residency goal across Fly.io, Neon, the owned-auth tables, and the selected email-delivery provider.
11. Brand token ingestion beyond the SDK: decide which design-token sources justify a server-side integration after the typed SDK registration path is validated.
12. Custom environment tiers: keep development/staging/production for Phase 2; add QA/UAT/regional/custom slugs only after paid-customer demand proves the additional policy and UI complexity.
13. Checklist and feedback timing: ship only after tour, announcement, and hotspot pass the shared Brand System, renderer, release, and maintenance conformance suite.
14. Hosted demos and media export: treat as later adjacent outputs requiring buyer and distribution evidence rather than an automatic next phase.
15. ~~Launcher and cross-surface visual direction~~ **Provisionally resolved on
    2026-08-06:** follow Option 2, **Editorial Air**, as recorded in
    `docs/product-design/design-system-exploration-2026-08-06/README.md`. Its
    hierarchy, light-first dashboard, restrained creator glass, and three-layer
    token separation are approved; the Slice 2 current-view structural Design QA
    passed on 2026-08-08. The real Lodariq mark, exact motion, final contrast
    values, sampled brand-native styling, and pixel refinements remain open for
    Slice 3 and usability validation. The state,
    action, accessibility, and security contracts in §§6.2.1 and 7.3 remain
    fixed.
16. Shortcut discovery: validate an optional keyboard shortcut for opening the
    launcher after the click/tap flow is proven; the shortcut cannot be the only
    entry method.

# 20. Implementation Guardrails

- Do not build canvas editing directly against raw Markdown strings.
- Do not add a Markdown-to-JSON compiler or custom Markdown grammar in Pre-phase, Phase 0, or Phase 1.
- Do not import Lexical outside `packages/sdk-authoring/src/editor`; if that boundary is later extracted, use the extracted `@lodariq/editor` package.
- Do not collapse `@lodariq/sdk-runtime` and `@lodariq/sdk-authoring` into one package; the runtime must be unable to import React or Lexical through the module system, not just by lint rule.
- Do not let the production runtime depend on `@lodariq/sdk-authoring`.
- Do not compile a real publication artifact in the browser; browser compilation is preview-only and the content-addressed artifact must be compiled server-side.
- Do not serve the authoring iframe or the hosted public demo from the authenticated dashboard origin.
- Do not adopt Vercel; host the dashboard on Fly.io.
- Do not scatter credential/session implementation details across the codebase.
  Keep Lodariq-owned auth behind the provider-neutral boundary for identity,
  sessions, users, memberships, and workspace context. Do not reintroduce Clerk
  runtime code or dependencies; retain the nullable legacy identity column only
  until the approved enrollment/cutover and rollback window are complete.
- Do not introduce Redis, dedicated log aggregation, or a separate internal product-analytics vendor before a real need exists.
- Do not apply a destructive database migration to a shared environment without explicit human sign-off.
- Do not rely on application-level workspace scoping alone; back it with PostgreSQL row-level security.
- Do not use Zod as the canonical cross-system schema contract; use `@lodariq/schema` with TypeBox/JSON Schema and keep Zod limited to dashboard form ergonomics if used.
- Do not make PMs maintain code-like attributes such as `src=""`, `action=""`, or `target=""` in the primary editor.
- Do not treat slash commands as durable syntax; they are insertion and transformation gestures.
- Do not send every keystroke or pointer movement across the iframe bridge.
- Do not create a standalone WebSocket gateway in Pre-phase, Phase 0, or Phase 1.
- Do not require server compilation before the local authoring UX is validated.
- Do not make dashboard code the owner of Lodariq editor behavior; the SDK authoring/editor boundary owns it first.
- Do not ship editor nodes without serialization, deserialization, migration, validation, paste, and accessibility coverage.
- Do not use Lexical node keys as persistent Lodariq block IDs.
- Do not implement future document-type nodes before the product behavior is validated; define schema placeholders instead.
- Do not ship authoring code in the normal production runtime.
- Do not return launcher, activation, creator-module, or editor-iframe metadata
  from production bootstrap responses.
- Do not require a browser extension, a second creator snippet, or a dashboard
  visit for the canonical returning-creator workflow after the permanent SDK is
  installed. An extension may be evaluated only as an optional later
  acquisition or trial surface.
- Do not attempt to infer authentication by discovering whether a Lodariq tab is
  open. Use the first-party popup and exact-origin activation protocol.
- Do not render Lodariq credential fields in the customer page or place bearer
  tokens, activation codes, or authoring-session secrets in URLs, DOM
  attributes, persistent browser storage, or logs.
- Do not expose the document-scoped authoring-session bearer to customer-page
  JavaScript. Transfer only the short-lived activation grant once to the exact
  `editor.lodariq.com` iframe; the iframe owns the session bearer in memory.
- Do not load the authoring bundle before a development/staging origin and an
  authenticated creator have both been verified.
- Do not use wildcard popup or iframe `postMessage` targets. Validate exact
  origin, source window, request state, session, document, and payload schema.
- Do not let the launcher or popup block host-page hit testing outside its
  visible bounds. Target selection must collapse or move authoring chrome when
  necessary and restore state afterward.
- Do not make hover the only mechanism for launcher discovery or activation;
  click, tap, and keyboard paths must be complete.
- Do not allow coordinates to trigger production interactions.
- Do not newly author or persist CSS selectors in Target Identity V2. Keep the
  Phase 1 `ElementFingerprint.scopedCss` path read-only for immutable legacy
  compatibility only.
- Do not treat `getBoundingClientRect()` as durable target identity. Persist
  only coarse container-relative topology and bounded one-way visual summaries,
  recompute them from the live render, and never use one visual family as the
  sole match or as an interaction trigger.
  After the owning target resolves, fresh live geometry may position Lodariq UI;
  an exact point/region must remain normalized presentation configuration
  relative to that owner.
- Do not let locale-scoped text or visual evidence satisfy the durable minimum
  for interaction targets. Require at least two independent durable nonvisual
  families for interactions. A presentation-only visual anchor instead
  requires at least three visual families and a strict runner-up margin; fail
  closed on ambiguity or insufficient evidence.
- Do not emit customer text, target attributes, selectors, DOM/HTML fragments,
  screenshots, coordinates, or raw URLs in target-health telemetry.
- Do not require screenshot/pixel capture or a browser extension for the base
  SDK resolver. Any later pixel verifier must be explicitly permissioned,
  redacted, supporting-only, and unable to trigger production interaction.
- Do not imply Lodariq can access customer database values that were not explicitly sent through SDK/API/integrations.
- Do not turn event or trait keys into polished business-language summaries unless the customer configured those display names.
- Do not show sensitive or high-cardinality observed values in dropdowns by default.
- Do not assume semantic scoring can find elements that are not mounted in the DOM.
- Do not ship target resolution without lifecycle waits, scroll-container handling, and failure diagnostics.
- Do not allow arbitrary CSS, JavaScript, or raw HTML in documents.
- Do not store or compile arbitrary CSS declarations, selectors, custom-property maps, font URLs, stylesheet text, or DOM/HTML snapshots as Brand Theme input.
- Keep product-style sampling inside authenticated `@lodariq/sdk-authoring`; production runtime must never sample host styles, run drift detection, or depend on authoring/AI code.
- Map sampled or explicitly registered design values into the versioned TypeBox Brand Theme allowlist, attach provenance/confidence, and require confirmation before inferred values replace approved tokens.
- Compile an exact approved Brand Theme snapshot and renderer contract version into every immutable artifact. Theme approval alone must never mutate or republish a live artifact.
- Do not add environment-specific theme or document copies. Staging and production promotion must reference the same immutable compiled artifact unless a future typed binding bundle is explicitly hashed and verified.
- Key active deployments by workspace, environment, and document; never use one environment-global "current document" pointer for a multi-document runtime.
- Do not recompile during promotion or rollback. Promotion reuses the verified artifact; rollback appends history and atomically changes the pointer.
- Do not let SDK-token creation, environment creation, editor launch, or authoring-session creation publish implicitly.
- Require explicit release capabilities, idempotency keys, compare-and-swap generation, correlation IDs, and append-only audit history for publish, promote, rollback, and unpublish.
- Stamp environment, document, publication, and content-hash analytics context on the server from the resolved token and active pointer; do not trust client-supplied environment identity or merge staging/production by default.
- Do not introduce ClickHouse before PostgreSQL analytics becomes a bottleneck.
- Do not run unlimited Playwright export jobs without quotas, caching, and concurrency limits.
- Do not combine Cloudflare and CloudFront without a concrete reason.
- Do not replace Cloudflare R2 with S3 plus CloudFront without a concrete enterprise, compliance, or scale reason.
- Do not claim Shadow DOM is a JavaScript sandbox.
- Do not invalidate entire CDN paths for normal document updates.
- Do not use DOM snapshots as the primary media export source.

---

## References Checked

- Lexical editor framework guidance.
- Lexical custom node, command, and editor-state patterns.
- CodeMirror and Lezer guidance for optional advanced source mode.
- Floating UI DOM positioning and auto-update behavior.
- Playwright screenshot capture.
- gifski as GIF encoder.
- Google `img2webp` for animated WebP.
- MDN Subresource Integrity behavior.
- Fastify validation and serialization.
- Node.js LTS release schedule.
- Next.js App Router and deployment guidance.
- Drizzle ORM documentation.
- Neon branching documentation.
- Cloudflare R2 pricing and S3-compatible API behavior.
- Upstash BullMQ integration guidance.
- Amazon SQS dead-letter queues.
- DOMPurify and rehype-sanitize.
- Sharp/libvips image processing.
- Appcues theme, custom CSS, and testing/publishing documentation.
- Chameleon theme generation, custom CSS, and environment publishing documentation.
- Whatfix brand-compliant styling and production-publish documentation.
- Pendo theme propagation, staged/public guide, and rollback behavior documentation.
- LaunchDarkly environment comparison, approval, and version restoration patterns
  as a release-management reference rather than a direct product competitor.
