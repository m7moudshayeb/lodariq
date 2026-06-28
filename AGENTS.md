# Agent Guardrails Memory

Keep these PRD guardrails in mind before implementing Talmeh changes. The source
of truth is `refined-waymark-prd.md` §20; this file is a short memory aid for AI
agents working in the repo.

- Product name is Talmeh. Use `@talmeh/*` packages and `*.talmeh.io` canonical origins.
- The canonical document is structured block JSON, not Markdown. Do not add a Markdown-to-JSON compiler or custom Markdown grammar in Pre-phase, Phase 0, or Phase 1.
- Do not collapse `@talmeh/sdk-runtime` and `@talmeh/sdk-authoring`; production runtime must not depend on authoring code, React, or Lexical.
- Lexical may be imported only inside `packages/sdk-authoring/src/editor`.
- Browser compilation is preview-only. Real, content-addressed publication artifacts must be compiled server-side.
- Do not ship authoring code in the normal production runtime.
- The authoring iframe and hosted public demos must not be served from the authenticated dashboard origin.
- The iframe bridge must use exact allowed origins, runtime validation, and semantic batched messages. Do not use wildcard `postMessage` targets or send every keystroke/pointer movement.
- Do not allow coordinates to trigger production interactions. Resolver coordinates are diagnostic only.
- Resolver work must use semantic scoring, lifecycle waits, scroll handling, and failure diagnostics; do not rely on CSS-first fallback chains.
- Do not allow arbitrary CSS, JavaScript, or raw HTML in documents. Use narrow allowlists and sanitization where raw import/export is unavoidable.
- Do not make creators maintain code-like attributes such as `src=""`, `action=""`, or `target=""` in the primary editor.
- Slash commands are gestures, not durable syntax.
- Do not imply Talmeh can access customer database values unless they were explicitly sent through SDK/API/integrations.
- Use TypeBox/JSON Schema in `@talmeh/schema` as the canonical cross-system contract. Do not replace it with Zod.
- Host the dashboard on Fly.io, not Vercel. Do not introduce Redis, dedicated log aggregation, or a separate internal analytics vendor before a real need exists.
- Do not apply destructive database migrations to shared environments without explicit human sign-off, and back tenant isolation with PostgreSQL row-level security.
