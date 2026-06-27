# Talmeh Product Requirements Document

Version: 1.9 talmeh brand naming  
Status: Implementation-ready draft pending founder review  
Source reviewed: `C:\Users\shayeb\Downloads\waymark.md`  
Note: the source PRD uses the name "ScriptFlow"; this refinement uses **Talmeh** (Arabic تلميح — *hint*), reflecting the product's hint/tooltip-first UX and contextual in-app guidance model.

---

## Validation Summary

The original PRD is strategically strong: the product thesis, target personas, document-type expansion path, and "one script, many product-content outputs" model are coherent. The main weaknesses are technical and UX-related. The original draft over-relies on Markdown as both internal state and primary creator interface, treats Shadow DOM as stronger isolation than it is, uses a brittle ordered selector fallback chain, introduces too much infrastructure too early, and contains one concrete media-pipeline error around `gifski` and WebP.

The feedback is directionally correct and should be adopted. This revision also incorporates the stack resolution for a three-person AI-assisted engineering team: keep the PRD's structured-block product architecture, but favor managed infrastructure, TypeScript-first tooling, and provider choices that reduce operational load. The most important changes are:

1. Replace "Markdown is the source of truth" with "the structured block document is the source of truth."
2. Make the primary creator surface a Notion-like Floating Document Builder, not a Markdown/source editor.
3. Treat slash commands as temporary insertion gestures that create rendered blocks, not durable syntax creators must maintain.
4. Use Lexical as the committed primary editor foundation; keep CodeMirror and Lezer only for optional advanced source mode or internal tooling.
5. Split the SDK into loader, runtime, and authoring bundles.
6. Run the authoring panel in a sandboxed Talmeh-hosted iframe; use Shadow DOM only for rendered overlays and lightweight controls.
7. Replace ordered selector fallback with confidence-scored semantic resolution.
8. Use Floating UI for all anchored overlays.
9. Use Playwright live screenshots, Sharp/libvips, libwebp/img2webp for WebP, and gifski only for GIF fallback.
10. Use Cloudflare R2 plus Cloudflare CDN/DNS/WAF as the primary asset and manifest delivery path for lower egress cost and simpler operations; keep the object API S3-compatible.
11. Use managed services by default for the first build, but keep the starting vendor set deliberately lean: Fly.io for the dashboard, backend containers, and workers; Neon for PostgreSQL; Clerk for auth (kept behind a thin internal interface to contain lock-in); Resend or AWS SES for email; Stripe for billing; Sentry for errors; and Cloudflare R2 plus Cloudflare CDN/DNS/WAF for asset and manifest delivery. Do not adopt Vercel; host the Next.js dashboard on Fly.io next to the API. Defer Redis (Upstash or self-hosted) until a real async job exists, defer dedicated log aggregation (Axiom or self-hosted Loki/Grafana), and defer or dogfood internal product analytics instead of standing up PostHog early.
12. Use Drizzle with Neon PostgreSQL for the small AI-assisted team; define canonical schemas in TypeScript and pin dependency versions deliberately.
13. Keep ClickHouse out of Phase 1; start with PostgreSQL analytics and introduce ClickHouse Cloud only when volume justifies it.
14. Add explicit sanitization, observability, queue idempotency, data deletion workflows, and publication immutability.
15. Add a Phase 0 local UX prototype before backend-heavy MVP development.
16. Add an iframe bridge performance contract so editor keystrokes and block transactions do not create a chatty `postMessage` bottleneck.
17. Add runtime lifecycle handling for route transitions, async state, scroll containers, virtualized lists, drawers, tabs, and lazy-loaded UI.
18. Add media export cost controls for Playwright-based screenshot jobs.
19. Add a Flow Map view for branching and non-linear tour logic.
20. Add explicit target-selection mode UX, including cursor state, hover outlines, and target chips.
21. Add a customer data boundary: Talmeh cannot query customer databases and can only use data explicitly sent through SDK/API/integrations.
22. Add a workspace data catalog so customer-provided traits and events appear in dropdowns without requiring creators to memorize event or trait names.
23. Add an SDK-first pre-phase to build the full local Talmeh SDK foundation before app/backend MVP work begins: loader, runtime/player, authoring bridge, editor integration, resolver, compiler, renderers, local persistence, fixture host, and browser tests. Collaboration remains explicitly out of scope.
24. Do not introduce a Markdown-to-JSON compiler, custom Markdown grammar, or standalone WebSocket gateway in the starting phases; those conflict with the structured block model and iframe bridge.
25. Physically split the SDK into separate packages so the production runtime cannot import React or Lexical through the module system, not just through lint rules: `@talmeh/sdk-runtime` versus `@talmeh/sdk-authoring`.
26. Extract `@talmeh/schema` and `@talmeh/compiler` as a shared isomorphic core consumed by both client and server. Real publications must be compiled server-side; browser compilation is for local-dev preview only.
27. Make the origin architecture an explicit security boundary: serve the authoring iframe from a dedicated origin distinct from both the customer page and the dashboard, and serve hosted public demos from an origin separate from the authenticated dashboard.
28. Host the Next.js dashboard on Fly.io rather than Vercel to reduce vendor surface and simplify the origin and deployment model.
29. Adopt a single secrets manager (such as Doppler or Infisical) given the multi-vendor surface, and add PostgreSQL row-level security as defense-in-depth for tenant isolation.
30. Add Turborepo early for task caching, and add a CI gate that flags destructive database migrations for explicit human sign-off.

## Feedback Disposition

| Area | Original PRD | Decision | Refined PRD Change |
|---|---|---|---|
| Primary editor | Floating Markdown panel | Change | Floating Document Builder using a dedicated Lexical-based SDK authoring editor boundary. |
| CodeMirror | CodeMirror 6 | Reposition | Optional advanced source mode, generated Markdown preview, or internal tooling. |
| Source of truth | Markdown | Change | Canonical structured block JSON; Markdown is export/interchange/source mode only. |
| Slash commands | Durable command syntax | Change | Temporary insertion gestures that become rendered blocks. |
| Parser | Custom grammar unspecified | Defer | Lezer only needed if advanced source mode ships; primary UX uses Lexical commands and typed block transactions. |
| SDK | Single vanilla JS SDK | Change | SDK-first TypeScript implementation with separate loader, runtime/player, authoring bridge, renderer, resolver, compiler, and local development entry points. |
| Isolation | Shadow DOM sandbox | Change | Shadow DOM for overlays; sandboxed iframe for authoring panel. |
| Positioning | Not specified | Add | Floating UI for tooltips, hotspots, menus, coach marks. |
| Selectors | Ordered CSS-first fallback | Change | Weighted semantic resolver with confidence thresholds. |
| Target attachment UX | Selector-like configuration | Change | Direct canvas selection mode with cursor change, hover outline, target chip, and target health. |
| Customer data access | Implied app/backend knowledge | Change | Only use page context, identify traits, tracked events, Talmeh activity, and approved integrations. |
| Customer values UX | Manual event/trait memorization | Add | Workspace data catalog powers grouped dropdowns with source, environment, last-seen, and safe sample values. |
| Dashboard | React + Tailwind | Keep, update | Use Next.js 16, Tailwind, shadcn/ui, TanStack Query, Zustand where needed, React Hook Form, TanStack Table, and Recharts. Deploy the dashboard on Fly.io next to the API; do not use Vercel. |
| Backend | Node + Fastify | Keep, update | Use Node.js 24 LTS, Fastify 5, TypeScript, TypeBox/JSON Schema, Ajv, and OpenAPI clients. |
| Database | PostgreSQL | Keep, update | Use Neon PostgreSQL plus Drizzle for the three-person AI-assisted team; store block JSON, optional source serialization, compiled JSON, immutable publications, and normalized metadata. |
| Queue | Redis + BullMQ | Limit | Defer Redis entirely until a real async job exists; then prefer self-hosted Redis/Valkey on Fly.io (or Upstash on a fixed plan) for BullMQ worker jobs. Avoid queue infrastructure before async jobs exist. |
| CDN | S3 + CloudFront + Cloudflare | Change | Choose Cloudflare R2 plus Cloudflare CDN/DNS/WAF initially; avoid combining Cloudflare and CloudFront unless a specific enterprise requirement appears. |
| Analytics | ClickHouse Phase 1 | Defer | PostgreSQL first; ClickHouse Cloud later. |
| Media | gifski for WebP/GIF | Correct | img2webp/libwebp for WebP; gifski for GIF. |
| Content model | Fixed per-type command lists | Change | Global block registry with context-aware ranking and broad composition rules. |
| Validation | Parser-style validity | Change | Save almost always succeeds; publish blocks only critical runtime errors. |
| Security | Basic content and PII controls | Strengthen | Sanitizers, URL/CSS allowlists, Trusted Types, no arbitrary HTML/CSS. |
| Observability | Not explicit | Add | OpenTelemetry, Sentry, correlation IDs, selector diagnostics. |

---

# 1. Product Vision

Talmeh is a universal product-content platform for creating and maintaining interactive demos, product tours, onboarding checklists, feature announcements, surveys, hotspots, and lightweight knowledge widgets through one document-driven authoring model.

The creation workflow is consistent across content types:

1. A developer installs one script and one identify call.
2. A creator opens Talmeh in a staging or demo environment.
3. The creator records or authors a document using a block-based Floating Document Builder and live canvas.
4. Talmeh compiles that document into safe, typed delivery JSON.
5. The same document can render in-app, as a hosted demo, or as exportable media when supported.

North Star: a PMM, sales engineer, product manager, or customer success operator can create, publish, measure, and maintain product content in minutes, without re-recording from scratch after ordinary UI changes and without learning a separate builder for every content type.

# 2. Problem Statement

## 2.1 Maintenance Tax

Existing demo and in-app guidance tools usually depend on screenshots, DOM snapshots, or brittle visual builders. These approaches are fast to create initially but costly to maintain when a product ships frequent UI changes.

Talmeh reduces maintenance by storing product-content intent in a typed document model that can be recompiled, retargeted, versioned, reviewed, and repaired independently of any one captured visual state.

## 2.2 Fragmentation Tax

Teams often use separate tools for demos, onboarding, announcements, surveys, and feature adoption campaigns. Each tool has its own SDK, authoring model, billing plan, analytics surface, and governance process.

Talmeh consolidates these jobs into one SDK, one document system, one dashboard, and one publication pipeline.

## 2.3 Cognitive Overhead Tax

Visual builders tend to grow into separate configuration UIs for each feature type. Talmeh uses document types, reusable visual blocks, explicit configuration chips, and contextual controls so new content formats extend a single authoring paradigm rather than creating a new builder for every job.

# 3. Solution Overview

## 3.1 Core Model

The canonical source of truth is a typed Talmeh block document. Creators edit rendered blocks and explicit controls. Markdown can exist as an export, interchange format, or optional advanced source mode, but it is not the primary PM-facing editing surface and not the internal database.

```text
Block editor interaction ----\
                             -> Block transaction -> Canonical block model
Canvas interaction ----------/                         |
                                                        -> Compiled delivery JSON
                                                        -> Live canvas preview
                                                        -> Markdown/source serialization
                                                        -> Publication manifest
```

This preserves the original PRD's document-first thesis while avoiding unsafe string-based state management and code-like authoring. Talmeh should feel like the speed of a document, the clarity of a visual builder, and the safety of a structured runtime model.

## 3.2 Key Product Capabilities

- One install script supports authoring, preview, production delivery, targeting, and analytics.
- Staging and demo environments enable recording and authoring.
- Production environments load only approved delivery runtime code.
- Slash commands insert or transform visual blocks; the slash syntax disappears after selection.
- Creators configure behavior through chips, menus, pickers, and direct manipulation rather than code-like arguments.
- Documents compile into typed JSON validated by shared schemas.
- Selectors are semantic fingerprints resolved by confidence scoring, not CSS-first fallback.
- Output targets include in-app overlays, hosted public demos, and email-friendly media exports.
- Review, versioning, rollback, and analytics are built around immutable publications.

# 4. Target Market and Personas

## 4.1 Primary Market

Initial focus: B2B SaaS teams with frequent product releases, especially teams with 10-500 employees where PMM, sales engineering, product, and customer success all create user-facing product content.

Early geographic focus can remain MENA and EU, with EU data residency designed into the architecture but not overbuilt in MVP.

## 4.2 Personas

Product Marketing Manager:
- Creates feature launches, onboarding tours, announcements, and demo assets.
- Needs faster content updates after product changes.
- Success metric: time from UI change to updated content drops from days to minutes.

Sales or Solutions Engineer:
- Builds prospect-specific interactive demos and email snippets.
- Needs personalization without maintaining brittle sandbox recordings.
- Success metric: demo creation time under 60 minutes.

Product Manager:
- Owns adoption and activation workflows.
- Needs in-app guidance with review, targeting, and analytics.
- Success metric: increased feature adoption and onboarding completion.

Customer Success or Enablement:
- Builds post-sale guidance, checklists, and contextual help.
- Needs low-code updates and visibility into user progress.
- Success metric: lower support burden and higher expansion readiness.

# 5. Competitive Positioning

Talmeh's advantage is not only that content is written in a document. The advantage is that every document has a typed canonical model, stable IDs, semantic element fingerprints, deterministic compilation, and multiple render targets.

Competitive claims should be sharpened:

- Against screenshot demo tools: Talmeh stores intent and semantic targets, not only pixels.
- Against DOM snapshot tools: Talmeh supports live product execution, compiler validation, and semantic repair.
- Against in-app guidance tools: Talmeh offers source-level review, versioning, and a unified document type system.
- Against enterprise DAP platforms: Talmeh starts lighter, faster, and more creator-friendly while preserving a path to governance.

The moat is the document compiler plus runtime resolver plus authoring workflow, not Markdown alone.

# 6. System Architecture

## 6.1 Logical Layers

```text
Authoring Layer
  Toolbar, element picker, iframe editor, live preview

Document Model Layer
  Lexical editor state, Talmeh block JSON, commands, validation states

Compiler Layer
  Schema validation, semantic fingerprints, delivery JSON, media jobs

Control Plane
  Workspaces, documents, revisions, environments, users, billing, publication

Delivery Layer
  Loader, runtime modules, renderers, targeting, analytics batching

Worker Layer
  Compilation, screenshots, exports, webhooks, scheduled jobs

Data Plane
  PostgreSQL, object storage, CDN, cache, queue, analytics tables
```

## 6.2 SDK Installation

Customer install:

```html
<script
  src="https://cdn.talmeh.io/loader/v1/talmeh-loader.js"
  data-workspace="wk_live_xxx"
  data-env="production"
  async
  crossorigin="anonymous"></script>
```

Identification:

```ts
Talmeh.identify({
  userId: "user_abc123",
  email: "user@company.com",
  plan: "pro",
  role: "admin",
  custom: {
    company: "Acme Corp",
    industry: "fintech"
  }
});
```

Customer events:

```ts
Talmeh.track("project_created", {
  source: "dashboard",
  plan: "pro"
});
```

Rules:

- `production` loads only the loader and required runtime renderer bundles.
- `staging` and `development` may enable authoring only after authenticated creator verification.
- The authoring bundle is never loaded for ordinary production viewers.
- SDK tokens are environment-scoped and revocable.

## 6.3 Customer Data Boundary and Catalog

Talmeh does not query or inspect the customer's database. Targeting, checklist completion, survey branching, visibility rules, and conditional logic can use only these data sources:

- Page context: URL, route, query params, page title, and visible DOM state.
- Identify traits explicitly sent through `Talmeh.identify()`.
- Events explicitly sent through `Talmeh.track()`.
- Talmeh-owned activity: document viewed, tour completed, announcement dismissed, survey submitted, checklist item completed, CTA clicked.
- Approved integrations that the customer intentionally connects.

The UI must never imply that Talmeh knows backend state unless the customer has instrumented it.

Talmeh should maintain a workspace data catalog built from observed SDK/API/integration inputs. This catalog powers dropdowns and search pickers in the builder.

Catalog entries:

```ts
interface DataCatalogEntry {
  id: string;
  source: "identify_trait" | "track_event" | "talmeh_activity" | "page_context" | "integration";
  key: string;
  displayName?: string;
  environments: Array<"development" | "staging" | "production">;
  lastSeenAt?: string;
  valueType?: "string" | "number" | "boolean" | "date" | "enum" | "unknown";
  sampleValues?: string[];
  isHighCardinality?: boolean;
  isSensitive?: boolean;
}
```

Builder pickers should group options by source:

```text
Talmeh activity
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

If a creator searches for a trait or event Talmeh has never seen, the UI should provide an implementation handoff:

```text
No matching event found.
Ask engineering to send it with:
Talmeh.track("project_created")
```

This keeps the builder easy without pretending Talmeh has native access to customer backend data.

## 6.4 Rule Builder UX for Customer-Provided Data

Rule configuration should feel like a native Talmeh picker, but every option must map to an explicit data source.

Top-level rule options:

```text
Show when
[ Always ]
[ URL or page ]
[ User trait ]
[ Event happened ]
[ Talmeh activity ]
```

If the creator chooses `User trait`, Talmeh opens a trait picker from the data catalog:

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

If the creator chooses `Event happened`, Talmeh opens an event picker:

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

Avoid summaries that imply business meaning Talmeh did not receive:

```text
Show when user created their first project
```

That more polished phrasing is allowed only if the customer has configured a friendly display name for the event in the data catalog.

Checklist completion should use the same explicit source model:

```text
Complete item when
[ User checks it manually ]
[ Talmeh tour completes ]
[ Host app sends event ]
```

If `Host app sends event` is selected:

```text
Event
[ project_created ]
Source: Talmeh.track()
Last seen: staging, 2 hours ago
```

This creates a friendly UX without relying on NLP, database access, or hidden product assumptions.

# 7. Document Model and Builder

## 7.1 Canonical Block Model

The canonical document model stores stable block IDs, typed content, typed behavior, targets, triggers, validation states, diagnostics, and render configuration. It is a structured block tree, not raw Markdown.

Example:

```ts
interface TalmehDocument {
  id: string;
  workspaceId: string;
  type: "tour" | "announcement" | "checklist" | "survey" | "hotspot" | "knowledge";
  status: "draft" | "review" | "approved" | "live" | "archived";
  title: string;
  trigger: TriggerDefinition;
  audience: AudienceDefinition;
  themeRef?: string;
  blocks: TalmehBlock[];
  schemaVersion: string;
}

interface TalmehBlock {
  id: string;
  type: TalmehBlockType;
  content?: string;
  props: Record<string, unknown>;
  children: TalmehBlock[];
  status?: "ready" | "incomplete" | "invalid";
  diagnostics?: BlockDiagnostic[];
}
```

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

Talmeh should build a dedicated authoring editor boundary on top of Lexical, and it should live inside the authoring package `@talmeh/sdk-authoring`, which is physically separate from the production runtime package. This is a product foundation, not a throwaway wrapper around a generic rich-text editor. The split is deliberate: because React and Lexical are dependencies of `@talmeh/sdk-authoring` and not of `@talmeh/sdk-runtime`, the production runtime cannot import them through the module system, not just by convention.

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

The editor lives within `@talmeh/sdk-authoring`. It may later be extracted into a dedicated `@talmeh/editor` package if the dashboard, SDK authoring iframe, tests, and future tools need a separately versioned package. Do not extract it just to satisfy an abstract monorepo shape.

Import boundary:

- `packages/sdk-authoring/src/editor` is the only source area allowed to import from `lexical` or `@lexical/*`.
- SDK authoring, iframe editor, tests, and compiler-facing code consume editor APIs through this boundary.
- `@talmeh/sdk-runtime` and production SDK bundles do not depend on `@talmeh/sdk-authoring` or any authoring editor code; this is enforced by package boundaries and verified by dependency-cruiser in CI.

Node implementation policy:

- Implement MVP nodes fully.
- Define future block types in the shared schema.
- Add placeholder renderers only when needed to load older documents, migration fixtures, or intentionally deferred document types.
- Do not maintain fake fully registered nodes for product ideas that have not been validated.
- Do not make every block a Lexical `DecoratorNode`. Use Lexical's standard text and element patterns for paragraphs, headings, lists, and inline text. Reserve custom/decorator-style nodes for Talmeh-specific UI such as target chips, validation badges, survey questions, tooltips, tour step cards, and action buttons.

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
- Serialization from Lexical state to canonical Talmeh block JSON.
- Deserialization from canonical Talmeh block JSON into Lexical state.
- Versioned migrations for older block JSON.
- Validation decorations for ready, incomplete, and invalid blocks.
- Stable Talmeh block IDs that survive editing, drag/drop, copy/paste, and migrations.
- Lexical node keys must never be treated as persistent Talmeh block IDs.
- Deterministic test fixtures for every supported block type.

Explicitly out of scope for the editor SDK pre-phase:

- Multi-user collaborative editing.
- Presence cursors.
- Comment threads.
- Realtime conflict resolution.
- Backend persistence beyond test fixtures and local examples.

## 7.3 Floating Document Builder

The primary creator interface is a block-based Floating Document Builder, not a Markdown editor.

Creator experience:

- Click and type to write ordinary text.
- Type `/` to open a searchable block menu.
- Select a command to insert or transform a visual block.
- Edit headings, paragraphs, buttons, labels, and captions inline.
- Configure behavior through explicit chips, menus, and pickers.
- Drag blocks to reorder them.
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

The editor may display the final block as:

```text
[ Take a quick tour ]
  Starts "Dashboard 2.0 Tour"
```

This phrasing is allowed only after the creator explicitly chooses the action and selects the tour from Talmeh's own document list. The builder must not invent product semantics or rewrite customer data into polished natural language.

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

| Type | MVP Phase | Use Case | Output Modes |
|---|---:|---|---|
| `tour` | 1 | Step-by-step interactive guide | In-app, hosted demo, media export |
| `announcement` | 3 | Modal, banner, slide-in | In-app |
| `checklist` | 3 | Persistent onboarding checklist | In-app |
| `survey` | 3 | NPS, CSAT, CES, custom feedback | In-app |
| `hotspot` | 3 | Persistent beacon and tooltip | In-app |
| `knowledge` | 3 or later | Lightweight help widget | In-app |

Document types control:

- Where the experience appears.
- Which triggers are available.
- Which output channels are supported.
- Which blocks are prioritized in the slash menu.
- How completion is measured.
- What runtime constraints apply.

Document types should not force rigid content forms. An announcement can contain headings, paragraphs, media, lists, columns, callouts, buttons, and dismiss actions. A tooltip can contain rich content, not only a text string. A survey question requires a response mechanism, but surrounding content remains flexible.

## 7.6 Global Block Registry

Talmeh should use a global block registry with context-aware ranking rather than separate hardcoded command lists for every document type.

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

Talmeh should be permissive about content and structured about behavior.

| User Behavior | Talmeh Response |
|---|---|
| Types ordinary unexpected text | Preserve as paragraph text. |
| Types an unknown slash command | Search the slash menu; if no command is selected, leave as normal text. |
| Adds a button without action | Save as incomplete button and show "Choose action." |
| Deletes a required target | Keep the block and show "Target needed." |
| Pastes from Google Docs or Word | Convert recognized headings, lists, links, and images; sanitize the rest. |
| Pastes unsupported formatting | Preserve text, remove unsafe or unsupported formatting, and show an optional import note. |
| Drags a block somewhere invalid | Show valid drop locations; do not accept invalid nesting. |
| References a deleted tour | Show a broken-reference chip and relink action. |
| Creates incomplete survey | Save as draft; block publish until required pieces exist. |
| Changes document type | Migrate compatible blocks; place incompatible blocks in a review section. |

Validation levels:

- Ready: complete and safe to deliver.
- Incomplete: structurally valid but missing configuration; save and preview are allowed where possible.
- Invalid: cannot safely run; save is allowed, publish is blocked.

Save should almost always succeed. Publishing should be blocked only by critical runtime errors such as missing actions, unresolved targets, broken references, unsafe content, or invalid branching.

## 7.8 Markdown and Source Mode

Markdown remains useful for portability, version history, exports, support workflows, and advanced users. It should be a serialization of the block model, not the normal editing surface.

Optional advanced source mode:

- Uses CodeMirror.
- Uses Lezer only if Talmeh offers a real custom source language.
- Shows tolerant inline errors.
- Keeps unknown text visible and editable.
- Preserves the last valid compiled version.
- Offers one-click repairs where possible.
- Blocks publish, not save, when critical errors remain.

## 7.9 Flow Map for Non-Linear Experiences

The block document is the primary editing surface, but branching tours and conditional onboarding flows also need a map view. Lexical should own the editable step blocks and inline controls, while the Flow Map renders and mutates graph relationships over the same canonical model.

Talmeh should provide a Flow Map view for tours and any future document type with branching behavior.

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

## 7.10 Styling and Content Safety

Do not allow arbitrary CSS or raw HTML in author-authored documents.

Creators configure presentation through visual controls and theme tokens, not raw CSS:

```text
Style: Emphasis
Placement: Below target
Width: Medium
Accent: Primary
```

Security requirements:

- Plain text by default.
- URL protocol allowlist: `https:`, `mailto:`, and explicitly approved app schemes only.
- Media host allowlist or proxy.
- CSS property allowlist compiled from style tokens.
- `rehype-sanitize` for Markdown/source import and export pipelines.
- DOMPurify for browser-side HTML sanitization where HTML is unavoidable.
- Trusted Types support where available.
- Output-specific warnings when a block cannot be represented fully in an output channel.

# 8. Selector and Element Resolution

## 8.1 Problem

The original CSS-first fallback chain is too brittle and dangerous. CSS selectors are often implementation details. Coordinates must not trigger production clicks because they can point to unrelated controls after layout changes.

## 8.2 Target Selection Mode

Creators attach Talmeh blocks to the product through direct canvas selection. They should not write selectors, inspect DOM paths, or memorize product implementation details.

Target selection flow:

1. Creator selects a block that needs a target.
2. Creator clicks `Select element`.
3. The host page enters target selection mode.
4. Cursor changes to an indicating cursor, such as `crosshair` or a custom target cursor.
5. Page shows a subtle selection veil.
6. Hovered elements receive an outline.
7. A small hover label shows the element type and best available label.
8. Clicking an element attaches it and creates a target chip.
9. Cursor and page interaction return to normal.

Cursor states:

| State | Cursor | Meaning |
|---|---|---|
| Normal authoring | `default` | Creator edits document and panel normally. |
| Target selection | `crosshair` or custom target cursor | Creator is selecting an element in the product. |
| Blocked target | `not-allowed` | Element cannot be selected, such as Talmeh UI, hidden elements, or unsafe controls. |

Hover label examples should stay mechanical and honest:

```text
Button
New Project
Click to attach
```

Target chip examples:

```text
Target
[ New Project ]
```

```text
Target
[ Select element ]
```

Target chip menu:

- View target.
- Change target.
- Test target.
- Target health.
- Advanced details.

Target health should explain how the element is currently found without exposing implementation details by default:

```text
Healthy
Found by role and label
Confidence 94%
```

Advanced details may show selector/fingerprint information for developers, but this should not be the default PM-facing view.

Interaction rules:

- While target selection is active, normal product clicks are intercepted.
- `Esc` cancels selection.
- Talmeh UI cannot be selected as a product target.
- Nested targets can be cycled with parent/deeper controls.
- A click-through modifier may temporarily restore product interaction if the creator needs to open a menu before selecting an item.
- The selection overlay must not permanently mutate host-page DOM styles.

## 8.3 Element Fingerprint

```ts
interface ElementFingerprint {
  stableAttributes: Record<string, string>;
  role?: string;
  accessibleName?: string;
  tagName: string;
  inputType?: string;
  label?: string;
  placeholder?: string;
  title?: string;
  alt?: string;
  nearbyText?: string[];
  ancestorLandmarks?: Array<{
    role?: string;
    accessibleName?: string;
  }>;
  relativePosition?: {
    parentRole?: string;
    siblingIndex?: number;
  };
  scopedCss?: string;
  diagnosticCoordinates?: { x: number; y: number };
}
```

## 8.4 Resolution Scoring

Candidates are scored instead of resolved by ordered fallback.

| Signal | Score |
|---|---:|
| `data-talmeh-id` match | +100 |
| Customer configured stable attribute | +90 |
| Role and accessible name | +70 |
| Associated label, placeholder, title, or alt | +65 |
| Same ancestor landmark | +30 |
| Same nearby text | +20 |
| Same tag/input type | +15 |
| Same relative position | +10 |
| Scoped short CSS selector | +10 |

Resolution succeeds only when:

- Top score exceeds the minimum confidence threshold.
- Top candidate clearly beats the second candidate.
- Candidate is visible.
- Candidate is enabled and interactive when the step requires interaction.
- Current page state matches expected URL, route, or state guard.

Coordinates are diagnostic only.

## 8.5 Browser vs Server Capability

The browser SDK should derive semantics from DOM attributes and accessible-name rules. Server-side Playwright/Chromium can use CDP accessibility capabilities when needed for authoring and compile diagnostics.

## 8.6 Runtime Lifecycle and Virtualized UI Handling

Semantic scoring only works after the target element exists in the DOM. Modern SaaS applications often hide, destroy, or lazily create DOM nodes through virtualized lists, async tables, route transitions, tabs, drawers, popovers, and infinite scrolling. Talmeh therefore needs a runtime lifecycle layer around the resolver.

Each targetable step may include optional page-state hints:

```ts
interface RuntimeLifecycleHints {
  expectedRoute?: string;
  waitForText?: string;
  waitForElement?: ElementFingerprint;
  scrollContainer?: ElementFingerprint;
  scrollStrategy?: "nearest" | "top" | "center" | "bottom" | "virtualized-search";
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
6. Run semantic candidate scoring.
7. Reposition overlays with Floating UI and observers.
8. Emit diagnostics if resolution fails or requires fallback.

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
- If a virtualized target cannot be made visible deterministically, block publish or require an explicit app integration hint.

# 9. SDK Architecture

## 9.1 Implementation Principle

The SDK is the first product surface and the primary pre-phase deliverable. Dashboard, API, billing, analytics UI, and managed deployment choices exist to support the SDK; they should not drive the early architecture.

Runtime philosophy should be vanilla browser primitives, but implementation should be TypeScript. The authoring SDK may use React and Lexical because it loads only for authenticated creators, but the production loader and runtime/player remain framework-free.

SDK bundle rules:

- Build SDK bundles with Rollup plus esbuild or an equivalent production bundling path.
- Target ES2020 for the first release unless customer browser requirements force a lower target.
- `talmeh-loader.js` should stay tiny and only bootstrap configuration, manifest lookup, and lazy bundle loading.
- Runtime/player bundles must not depend on React, Lexical, dashboard code, or authoring UI.
- Floating UI DOM is the only allowed default third-party dependency in the runtime/player bundle.
- Authoring bundles may use React and Lexical because they load only for authenticated creators.
- Initial CI budget gates:
  - `talmeh-loader.js` under 3 KB gzipped.
  - Core runtime plus tour renderer under 40 KB gzipped for Phase 1.
  - Authoring bundle tracked but not size-blocked in Phase 1 because it is authenticated-creator-only.

Bundles:

```text
talmeh-loader.js
talmeh-runtime.js
talmeh-authoring.js
talmeh-local-dev.js
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
  schema/          @talmeh/schema        canonical TypeBox/JSON Schema contracts; zero runtime deps
  compiler/        @talmeh/compiler       pure isomorphic block JSON to preview/delivery JSON
  sdk-runtime/     @talmeh/sdk-runtime    no React or Lexical; production runtime surface
    loader/        install script bootstrap, manifest pointer, lazy loading
    runtime/       identify, track, targeting, analytics batching, lifecycle
    resolver/      semantic target capture, scoring, diagnostics
    renderers/     tour first, future document renderers behind lazy entry points
    local-dev/     local persistence, fixture host helpers, debug panel
  sdk-authoring/   @talmeh/sdk-authoring  React + Lexical; authenticated-creator only
    authoring/     authoring shell and iframe integration
    bridge/        host-page bridge, postMessage protocol, target picking
    editor/        Lexical nodes, commands, serialization, migrations
```

The runtime and authoring packages must be physically separate, not folders inside one `@talmeh/sdk` package. This is the single load-bearing boundary in the SDK: the production runtime bundle must never include React or Lexical, and physical package separation makes that a module-system guarantee rather than a lint rule an agent can accidentally violate. `@talmeh/schema` and `@talmeh/compiler` form a shared isomorphic core consumed by both the SDK and the server worker; the compiler must be a pure function with no DOM or Node-only dependencies. Browser compilation is used only for local-dev preview, while the trusted, content-addressed publication artifact is always compiled server-side. Enforce the remaining boundaries (no `sdk-runtime` to `sdk-authoring`, no `lexical` imports outside `sdk-authoring`) with dependency-cruiser in CI in addition to package separation. Split further only if bundle ownership, dependency boundaries, or build times justify it.

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
- Resolve elements.
- Render overlays using custom elements and Shadow DOM.
- Position overlays with Floating UI.
- Batch analytics with `fetch` and `navigator.sendBeacon()` on page exit.
- Report SDK errors to Sentry with workspace, document, step, and SDK version metadata.

## 9.4 Authoring

Loaded only when an authenticated creator enters authoring mode.

Responsibilities:

- Floating toolbar and element picker.
- Host-page bridge for DOM inspection and highlight rendering.
- Sandboxed iframe editor hosted from a Talmeh domain.
- Lexical-based Floating Document Builder with custom Talmeh nodes.
- Slash menu, drag handles, property chips, validation states, review UI, and document sync.
- Versioned `postMessage` protocol between iframe and host bridge.

Iframe example:

```html
<iframe
  src="https://editor.talmeh.io/session/..."
  sandbox="allow-scripts allow-same-origin"></iframe>
```

The bridge may inspect the customer page; the iframe owns authentication, document state, editor UI, block transactions, validation, and review controls.

## 9.5 Bridge Performance Contract

The iframe architecture is a security boundary, not a license to send every editor update across `postMessage`. The editor must remain locally responsive even when the host page is busy.

Ownership boundaries:

- Iframe owns Lexical editor state, document drafts, auth, block selection, menus, validation UI, review UI, and undo/redo.
- Host-page bridge owns DOM inspection, target picking, page-state observation, highlight rendering, scroll tracking, and live overlay preview on the customer page.
- Server owns persistence, compilation, publication, and long-running jobs.

Bridge protocol rules:

- Keystrokes do not cross the bridge individually.
- Lexical updates are batched into semantic document patches.
- Drag/reorder events are emitted at interaction end, with optional throttled preview updates.
- Canvas scroll and resize updates are throttled with `requestAnimationFrame`.
- High-frequency pointer movement is handled in the host bridge, not the iframe.
- Preview overlay state is diffed and patched rather than re-rendered wholesale.
- All messages include protocol version, session ID, document ID, and correlation ID.
- Every bridge command has an acknowledgement or timeout path.
- The iframe and host bridge negotiate allowed origins during session creation.
- Incoming iframe messages must validate the customer app parent origin, not the iframe's own Talmeh origin.
- Outbound messages must use the exact allowed target origin; do not use `postMessage(..., "*")` outside local development fixtures.
- Message payloads must be runtime-validated before dispatching Lexical commands.
- Session tokens must be short-lived and scoped to one workspace, environment, document, and authoring session.

Example bridge messages:

```ts
type BridgeMessage =
  | { type: "target.pick.start"; sessionId: string }
  | { type: "target.pick.result"; blockId: string; fingerprint: ElementFingerprint }
  | { type: "preview.patch"; blockId: string; patch: PreviewPatch }
  | { type: "page.lifecycle.update"; route: string; scrollState: ScrollState }
  | { type: "resolver.diagnostic"; stepId: string; diagnostic: ResolverDiagnostic };
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

- Documents list with status, type, environment, owner, last edit, and publication state.
- Block document editor with live preview and optional advanced source view.
- Review inbox.
- Publication history.
- Environments and tokens.
- Theme editor.
- Segments and targeting.
- Customer data catalog for observed `identify()` traits and `track()` events.
- Analytics.
- Workspace settings, roles, billing, and audit log.

For a three-person AI-assisted team, Next.js is preferred over a plain Vite dashboard because the App Router, middleware examples, and community patterns give AI agents more useful context. The dashboard is deployed as a Next.js Node server on Fly.io alongside the API rather than on Vercel; this removes a vendor, simplifies the origin and deployment model, and avoids Vercel-specific lock-in, at the cost of giving up Vercel's preview-deploy convenience. Vite remains appropriate for isolated playgrounds, SDK fixtures, and lightweight test hosts.

Use shadcn/ui for dashboard primitives because the generated components live in the repository and can be customized deeply for Talmeh-specific screens such as the editor shell, target diagnostics, data catalog, and analytics. Use React Aria selectively when a component has complex keyboard or accessibility requirements that exceed the default shadcn/Radix behavior.

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

Canonical API and SDK schemas should live in `@talmeh/schema` as TypeBox/JSON Schema definitions with inferred TypeScript types. This package also owns the bridge `postMessage` message schemas, so the iframe and host bridge validate against exactly the same definitions. Zod may be used inside dashboard forms when it improves React Hook Form ergonomics, but Zod is not the canonical cross-system contract.

A single `correlationId` should be minted at the start of an authoring session and at each publish, then propagated through the bridge envelope, API requests, worker job payloads, and OpenTelemetry baggage, so authoring, compilation, publication, playback, and export can be traced end to end.

Initial service boundaries:

```text
Control API
  Workspaces, documents, revisions, environments, users, roles, billing, publication

Authoring Gateway
  Temporary authenticated sessions for live authoring and iframe bridge coordination

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
- Environments and SDK tokens.
- Documents.
- Versioned canonical block JSON as JSONB.
- Optional Markdown/source serialization.
- Versioned compiled delivery JSON.
- Normalized document metadata columns.
- Content hashes.
- Immutable publication records.
- Targeting definitions.
- Customer data catalog entries for observed identify traits, tracked events, page-context fields, integration fields, and Talmeh-owned activity.
- Billing metadata.
- Workflow state.

Do not store complete compiled documents only as opaque JSON blobs.

Neon branching should be part of the development workflow once CI is in place. Each pull request can run against an isolated database branch so AI-generated migrations, fixtures, and tests do not corrupt shared staging data. Branch testing proves a migration runs; it does not prove it is non-destructive, so CI should additionally flag any `DROP`, destructive `ALTER`, or column-type change in a migration diff and require explicit human sign-off before it can target a shared environment.

Tenant isolation relies on a `workspaceId` column on every multi-tenant row with application-level scoping through Drizzle. Add PostgreSQL row-level security as defense-in-depth so a missing workspace filter in agent-generated query code cannot leak data across tenants. Decide the RLS model during the schema phase, not after.

## 11.3 Publication Model

Publications are immutable. A document change creates a new compiled version and a new content-addressed object:

```text
/documents/doc_123/sha256-a91f...json
```

The edge loader reads a small manifest pointer:

```json
{
  "documentId": "doc_123",
  "currentVersion": "sha256-a91f..."
}
```

This enables rollback without recompilation, improves cache safety, and avoids broad CDN invalidations.

# 12. Infrastructure

## 12.1 Recommended Initial Stack

```text
Language and repo
  TypeScript
  Single repository
  pnpm workspaces for package boundaries
  Turborepo early for task caching (cheap to add; high CI churn from AI-assisted work)

Packages
  @talmeh/schema        canonical contracts, zero runtime deps
  @talmeh/compiler      pure isomorphic block JSON to delivery JSON
  @talmeh/sdk-runtime   loader, runtime, resolver, renderers; no React or Lexical
  @talmeh/sdk-authoring React, Lexical, editor, authoring bridge; creator-only

Pre-phase product surface
  @talmeh/sdk-runtime and @talmeh/sdk-authoring as the primary deliverables
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
  Extract @talmeh/editor later only if needed
  Custom Talmeh nodes
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
  Clerk (behind a thin internal auth interface to contain lock-in)
  Stripe Billing
  Resend or AWS SES
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
cdn.talmeh.io     Cloudflare R2 + CDN: loader, runtime/renderer bundles, compiled
                   manifests, hosted demo assets, exports (immutable, content-addressed)
editor.talmeh.io  Authoring iframe app; a distinct origin from BOTH the customer
                   page and the dashboard
app.talmeh.io     Next.js dashboard on Fly.io
api.talmeh.io     Fastify API on Fly.io (api service)
                   plus a separate Fly.io worker service for compile/screenshot/export jobs
demos.talmeh.io   Hosted public demo player; a separate origin from the authenticated
                   dashboard so viewer sessions never share cookies with it
```

Rules:

- The authoring iframe origin (`editor.talmeh.io`) must be distinct from the dashboard origin. Even if the editor is later embedded in the dashboard, it must remain served from its own canonical origin so cross-origin isolation and `postMessage` origin checks stay meaningful.
- Public, unauthenticated demo traffic must not run on the authenticated dashboard origin.
- The dashboard, API, and worker run on Fly.io. The API and worker are separate deployables because Playwright export jobs need their own scaling tier and isolation, as described in section 13.
- Vercel is not used.

## 13.1 Hosted Public Demo

Every published tour can generate a hosted URL:

```text
https://app.talmeh.io/demo/acme-enterprise-demo
```

Requirements:

- No Talmeh account required to view unless restricted.
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

- Authoring disabled in production by default.
- Creator must authenticate with Talmeh before authoring.
- Environment-scoped SDK tokens.
- Sandboxed editor iframe.
- Narrow versioned `postMessage` protocol.
- No `eval()` or arbitrary dynamic code execution in SDK.

## 14.2 Content Safety

- No arbitrary HTML.
- No arbitrary CSS.
- Typed style and content commands.
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

## 14.5 Enterprise Controls

Later phases:

- SAML SSO.
- SCIM.
- Audit log.
- Role-based permissions.
- Domain restrictions.
- IP allowlist.
- EU data residency.
- DPA and subprocessors page.

Clerk is the default auth provider. Use Clerk's enterprise features for SAML, SSO, and provisioning first; evaluate WorkOS only if Clerk creates a concrete product, compliance, pricing, or integration limitation.

# 15. Observability

Build observability from the beginning.

Required:

- OpenTelemetry for traces and metrics.
- Sentry for dashboard, SDK, and worker errors.
- Structured logs.
- Correlation IDs across authoring, compile, publication, playback, and export.
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

- Product name confirmed as **Talmeh**; use `Talmeh` for SDK globals, `@talmeh/*` for packages, and `*.talmeh.io` for canonical origins before generating implementation artifacts.
- Create one repository with pnpm workspaces.
- Add Turborepo for task caching; it is cheap to add and AI-assisted work generates high CI churn.
- Add strict TypeScript, ESLint, Prettier, Vitest, Playwright, size-limit, and dependency-cruiser.
- Create initial packages:
  - `packages/schema` (`@talmeh/schema`) for TypeBox/JSON Schema, inferred TypeScript types, and bridge message schemas.
  - `packages/compiler` (`@talmeh/compiler`) for the pure isomorphic block JSON to preview/delivery JSON compiler.
  - `packages/sdk-runtime` (`@talmeh/sdk-runtime`), with no React or Lexical, containing:
    - `src/loader` for install-script bootstrap.
    - `src/runtime` for production runtime/player behavior.
    - `src/resolver` for semantic target capture, scoring, and diagnostics.
    - `src/renderers` for tour renderer first and future lazy renderers.
    - `src/local-dev` for local persistence, debug UI, and fixture helpers.
  - `packages/sdk-authoring` (`@talmeh/sdk-authoring`), creator-only, containing:
    - `src/authoring` for the authoring UI shell.
    - `src/bridge` for host-page inspection, target picking, and `postMessage`.
    - `src/editor` for Lexical integration and editor primitives.
- Create initial apps/examples:
  - `apps/fixture-host` as the primary SaaS-like integration test surface.
  - `apps/sdk-playground` if a separate visual SDK playground is useful.
  - No production dashboard, API, or worker app yet.
- Add package-boundary checks enforced by package separation and dependency-cruiser:
  - `@talmeh/sdk-runtime` cannot import `react`, `lexical`, `@lexical/*`, `@talmeh/sdk-authoring`, or dashboard-only dependencies.
  - `lexical` imports are allowed only inside `packages/sdk-authoring/src/editor`.
  - No production runtime imports from authoring-only code.
- Add the first canonical block JSON fixture before editor UI is built.
- Add ADRs for the runtime/authoring package split, schema and compiler ownership, server-side publication compilation, authoring/editor boundary, iframe bridge, origin model, DnD approach, resolver strategy, local test harness, secrets management, tenant isolation/RLS, and the build-vs-buy trigger conditions for deferred vendors (Redis, log aggregation, internal analytics).

Acceptance criteria:

- CI runs typecheck, lint, tests, and bundle-size checks.
- The repo can build SDK loader, runtime, authoring, compiler, and fixture-host artifacts.
- Package-boundary checks fail on forbidden imports.
- The first block JSON fixture is versioned and validated by `@talmeh/schema`.
- No production product code depends on Markdown parsing, custom grammar parsing, or WebSockets.

## 16.1 Pre-Phase: Full Local SDK Foundation

Timeline: weeks 1-6  
Goal: build the entire local Talmeh SDK foundation before app/backend MVP work begins. This phase should prove that a customer can install the script into a realistic page, open local authoring, create a linear tour, select targets, preview playback, serialize the document, reload it, and play it again through SDK bundles without a production backend.

Scope:

- `packages/sdk-runtime` and `packages/sdk-authoring` as the primary implementation surfaces, with `packages/schema` and `packages/compiler` as the shared core.
- SDK entry points:
  - `talmeh-loader.js`.
  - `talmeh-runtime.js`.
  - `talmeh-authoring.js`.
  - `talmeh-local-dev.js`.
  - `renderers/tour.js`.
- Loader bootstrap:
  - Reads workspace/environment config from script attributes.
  - Supports local manifest fixtures.
  - Lazy-loads runtime, authoring, and tour renderer bundles.
- Runtime/player:
  - Exposes `Talmeh.identify()`.
  - Exposes `Talmeh.track()`.
  - Loads compiled local tour JSON.
  - Evaluates minimal local eligibility rules.
  - Renders linear tour playback with Floating UI placement.
  - Batches local analytics/debug events.
- Authoring bridge:
  - Host-page bridge for DOM inspection, target picking, hover outlines, and preview patches.
  - Versioned `postMessage` envelope with origin checks, acknowledgements, timeouts, and runtime validation.
  - Same-origin iframe mode for local development, with architecture compatible with future Talmeh-hosted iframe.
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
  - `talmeh-local-dev.js` or equivalent helper for local persistence, debug panel, fixture manifest, document import/export, and reset controls.
  - Playwright tests that install the local SDK into the fixture host and exercise authoring plus playback.
- Bundle and dependency checks:
  - `@talmeh/sdk-runtime` (loader/runtime/renderers) cannot import React, Lexical, dashboard code, or `@talmeh/sdk-authoring`, enforced by package separation and dependency-cruiser.
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

- Fixture host can load `talmeh-loader.js` from the local build.
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
- Lexical node keys are not used as persistent Talmeh block IDs.
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
- Same-origin iframe bridge remains acceptable locally, but the protocol must match the future cross-origin Talmeh-hosted iframe design.
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

Scope:

- Single repository with minimal workspace boundaries.
- `@talmeh/schema` with TypeBox/JSON Schema as the canonical contract.
- Production-ready SDK build pipeline for loader, runtime, authoring, bridge, compiler, resolver, and tour renderer.
- Productionization of the SDK authoring editor boundary.
- Canonical typed block JSON.
- Compiler from canonical block JSON to preview and delivery JSON.
- Minimal Next.js 16 dashboard with document list, environment tokens, and an SDK installation snippet.
- Fastify 5 API deployed as a modular monolith.
- Clerk authentication.
- Neon PostgreSQL document storage through Drizzle.
- Staging authoring toolbar.
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

Phase 1 acceptance criteria:

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

## 16.4 Phase 2: Output Layer

Timeline: weeks 16-21  
Goal: add hosted demo links, media export, and a controlled theme system.

Scope:

- Hosted public demo player.
- Immutable publication objects and manifest pointers.
- Playwright live screenshot capture.
- Sharp/libvips image processing.
- Animated WebP and GIF fallback.
- Browser-worker queue, quota, caching, and cost controls.
- Theme tokens and visual style controls.
- Preview metadata.
- Optional password and expiry for demo links.

Acceptance criteria:

- Hosted demo loads under 2 seconds on a normal broadband connection.
- Email export renders in Gmail, Outlook, and Apple Mail.
- WebP uses libwebp/img2webp, not gifski.
- GIF fallback generated with gifski.
- Theme changes update preview within 500 ms.
- No arbitrary CSS or HTML accepted by importer, editor, or compiler.
- Export jobs show queued, running, failed, canceled, and completed states.
- Workspace export concurrency limits are enforced.

## 16.5 Phase 3: In-App Delivery Platform

Timeline: weeks 22-33  
Goal: expand from demo tool to product-content platform.

Scope:

- Production delivery mode.
- Client-side targeting evaluator using signed manifests.
- Workspace data catalog for identify traits, tracked events, page context, Talmeh activity, and approved integrations.
- Segment builder.
- Announcement renderer.
- Checklist renderer.
- Survey renderer.
- Hotspot renderer.
- Knowledge widget if capacity permits; otherwise defer.
- Renderer-level lazy loading.
- Frequency controls.
- Runtime lifecycle resolver for async page state, tabs, drawers, and virtualized containers.

Acceptance criteria:

- Targeting evaluates correctly for user attributes, event history, URL, segment, and date windows.
- Rule-builder dropdowns show customer-provided traits and events grouped by source with last-seen metadata.
- Missing traits or events show implementation handoff snippets instead of empty dead ends.
- Runtime loads only eligible renderer bundles.
- Runtime can wait for route readiness and scroll relevant containers before resolving targets.
- Announcement, checklist, survey, and hotspot render without host layout interference.
- Checklist state persists per user.
- Survey responses are stored and exportable.
- Hotspots track dynamic SPA elements using observers without full-page mutation scans.

## 16.6 Phase 4: Workflow and Governance

Timeline: weeks 34-41  
Goal: make Talmeh governable for teams. Collaboration beyond review comments remains out of scope until customer demand is proven.

Scope:

- Status lifecycle: draft, review, approved, live, archived.
- Review links.
- Inline step comments.
- Role permissions.
- Version history.
- Immutable publication history.
- Instant rollback by manifest pointer update.
- Multi-environment promotion.
- Activity log.
- Customer-visible Flow Map view for tour branching, if Phase 3 customer evidence justifies it.

Acceptance criteria:

- Status transitions enforce role permissions.
- Live document edits create draft revisions.
- Rollback takes effect globally within 60 seconds.
- Review links work for non-account reviewers with email confirmation.
- Version diff shows source and model changes.
- Multi-environment promotion does not require manual recompilation.
- Flow Map, if shipped, identifies broken edges and unreachable steps.

## 16.7 Phase 5: Analytics and Optimization

Timeline: weeks 42-51  
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

Timeline: week 52+  
Goal: expand enterprise readiness and integration surface.

Scope:

- Salesforce, HubSpot, Slack, Segment, Amplitude, Mixpanel, PostHog.
- Webhooks.
- Public REST API.
- SSO and SCIM.
- Audit log.
- EU data residency.
- Enterprise roles.
- Mobile SDK exploration.

Acceptance criteria:

- Webhooks retry with idempotency and DLQ handling.
- SSO works with Okta and Azure AD.
- Audit log captures all privileged actions.
- Public API rate limits and auth are tested.
- Data deletion workflow covers every storage system.

# 17. Pricing and Packaging

The original MAU plus document-volume pricing is directionally reasonable, but packaging should align with expansion from demos to in-app delivery.

Recommended starting tiers:

| Tier | Indicative Price | Best For | Limits |
|---|---:|---|---|
| Starter | $49/month | Early teams validating tours | 1,000 MAU, 10 active docs, staging plus hosted demos |
| Growth | $149/month | PMM and product teams | 5,000 MAU, 50 active docs, announcements/checklists/surveys |
| Pro | $299/month | Multi-team SaaS orgs | 20,000 MAU, unlimited docs, A/B testing, webhooks/API |
| Enterprise | Custom | Larger and regulated teams | SSO, SCIM, audit log, residency, SLA, custom limits |

Billing notes:

- Stripe remains the correct billing system.
- Aggregate usage before reporting MAU/metered usage.
- Use idempotency identifiers for billing events.
- Do not emit one Stripe billing event for every SDK interaction.

# 18. Success Metrics

## 18.1 Pre-Phase Through Phase 1 Metrics

- 100 percent of MVP Lexical nodes have serialization, deserialization, migration, and validation fixtures.
- Zero direct `lexical` imports outside `packages/sdk-authoring/src/editor` unless the editor boundary has been intentionally extracted into `@talmeh/editor`.
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

## 18.2 Growth Metrics

- 150 paying customers by Phase 3 completion.
- 40 percent of customers using at least two document types.
- 60 percent of PMM customers using media export.
- Average 8 active documents per customer.
- Gross margin above 80 percent.

## 18.3 Scale Metrics

- 500 paying customers.
- 10 enterprise customers.
- Net revenue retention above 110 percent.
- A/B testing used by 30 percent of Pro customers.
- Support ticket rate below 0.5 per customer per month.

## 18.4 Product Health Metrics

- Time to first value.
- Week 2 creator retention.
- Document completion rate.
- Self-healing trigger rate.
- Resolver ambiguity rate.
- Lifecycle wait/retry failure rate.
- Virtualized-container target failure rate.
- Bridge message queue depth and dropped update count.
- Media export queue wait time and cost per export.
- Authoring bundle load failures.
- Publication rollback count.
- SDK error rate by version.

# 19. Open Decisions

1. ~~Brand naming~~ **Resolved:** product name is **Talmeh** (Arabic تلميح — *hint*). Retired draft names: ScriptFlow (original PRD), Waymark (intermediate refinement).
2. Knowledge widget timing: include in Phase 3 only if it does not slow core in-app delivery.
3. Branching: decide when Flow Map authoring becomes customer-visible instead of schema-only.
4. Data catalog display names: decide whether friendly names are configured manually, imported from analytics integrations, or inferred only after user confirmation.
5. Lexical editor boundary: decide which UI components live inside `packages/sdk-authoring/src/editor`, which live in the generic `@talmeh/sdk-authoring` UI, and whether extraction to a standalone `@talmeh/editor` package is justified later.
6. Drag/drop implementation: decide whether to use native pointer logic first or a dedicated DnD library around Lexical nodes.
7. Flow Map rendering: decide whether the first implementation is custom canvas/SVG or a graph library wrapped behind Talmeh primitives.
8. Redis introduction and provider: define the first real async job that justifies introducing Redis at all, whether to self-host Redis/Valkey on Fly.io or use Upstash on a fixed plan, and the command-volume, cost, or latency threshold that later triggers moving worker jobs to Cloudflare Queues, SQS, or another durable queue.
9. R2 object privacy model: decide which generated assets are public, signed, password-protected, expiring, or workspace-private.
10. Fly.io region strategy: choose initial regions and latency targets for the dashboard, API, authoring sessions, and ingestion, and confirm they satisfy the MENA/EU data-residency goal across Fly.io, Neon, and Clerk.

# 20. Implementation Guardrails

- Do not build canvas editing directly against raw Markdown strings.
- Do not add a Markdown-to-JSON compiler or custom Markdown grammar in Pre-phase, Phase 0, or Phase 1.
- Do not import Lexical outside `packages/sdk-authoring/src/editor`; if that boundary is later extracted, use the extracted `@talmeh/editor` package.
- Do not collapse `@talmeh/sdk-runtime` and `@talmeh/sdk-authoring` into one package; the runtime must be unable to import React or Lexical through the module system, not just by lint rule.
- Do not let the production runtime depend on `@talmeh/sdk-authoring`.
- Do not compile a real publication artifact in the browser; browser compilation is preview-only and the content-addressed artifact must be compiled server-side.
- Do not serve the authoring iframe or the hosted public demo from the authenticated dashboard origin.
- Do not adopt Vercel; host the dashboard on Fly.io.
- Do not scatter Clerk calls across the codebase; access auth, sessions, and users only through a thin internal interface so the provider can be replaced later.
- Do not introduce Redis, dedicated log aggregation, or a separate internal product-analytics vendor before a real need exists.
- Do not apply a destructive database migration to a shared environment without explicit human sign-off.
- Do not rely on application-level workspace scoping alone; back it with PostgreSQL row-level security.
- Do not use Zod as the canonical cross-system schema contract; use `@talmeh/schema` with TypeBox/JSON Schema and keep Zod limited to dashboard form ergonomics if used.
- Do not make PMs maintain code-like attributes such as `src=""`, `action=""`, or `target=""` in the primary editor.
- Do not treat slash commands as durable syntax; they are insertion and transformation gestures.
- Do not send every keystroke or pointer movement across the iframe bridge.
- Do not create a standalone WebSocket gateway in Pre-phase, Phase 0, or Phase 1.
- Do not require server compilation before the local authoring UX is validated.
- Do not make dashboard code the owner of Talmeh editor behavior; the SDK authoring/editor boundary owns it first.
- Do not ship editor nodes without serialization, deserialization, migration, validation, paste, and accessibility coverage.
- Do not use Lexical node keys as persistent Talmeh block IDs.
- Do not implement future document-type nodes before the product behavior is validated; define schema placeholders instead.
- Do not ship authoring code in the normal production runtime.
- Do not allow coordinates to trigger production interactions.
- Do not imply Talmeh can access customer database values that were not explicitly sent through SDK/API/integrations.
- Do not turn event or trait keys into polished business-language summaries unless the customer configured those display names.
- Do not show sensitive or high-cardinality observed values in dropdowns by default.
- Do not assume semantic scoring can find elements that are not mounted in the DOM.
- Do not ship target resolution without lifecycle waits, scroll-container handling, and failure diagnostics.
- Do not allow arbitrary CSS, JavaScript, or raw HTML in documents.
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
