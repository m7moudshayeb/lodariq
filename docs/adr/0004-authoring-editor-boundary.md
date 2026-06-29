# 0004. Authoring editor boundary on Lexical

- Status: Accepted
- PRD references: §7.2, §18.1, §20

## Context

Lexical is a heavy authoring dependency. It must never leak toward the runtime,
and block identity must be stable across edits.

## Decision

All Lexical usage lives only in `packages/sdk-authoring/src/editor`. Standard
Lexical text/element nodes back paragraphs/headings/lists; custom/decorator
nodes back Lodariq-specific UI (target chips, validation badges, tooltips, tour
steps, action buttons). Stable Lodariq block IDs come from `editor/ids.ts`;
Lexical node keys are never persisted as block IDs.

## Consequences

- Extraction to a standalone `@lodariq/editor` is allowed later only if justified.
- Every node ships serialization, deserialization, migration, validation, paste,
  and accessibility coverage before it lands (§20).
