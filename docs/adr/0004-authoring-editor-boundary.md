# 0004. Authoring editor boundary on Lexical

- Status: Accepted
- PRD references: §7.2, §18.1, §20

## Context

Lexical is a heavy authoring dependency. It must never leak toward the runtime,
block identity must be stable across edits, and freeform creator interactions
must still produce Lodariq's closed structured JSON rather than HTML or a second
durable editor format.

## Decision

All Lexical usage lives only in `packages/sdk-authoring/src/editor`. Standard
Lexical text/element nodes back paragraphs/headings/lists; custom/decorator
nodes back Lodariq-specific content such as media, icons, dividers, callouts,
and other bounded compositions. Stable Lodariq block IDs come from
`editor/ids.ts`; Lexical node keys are never persisted as block IDs.

`RichContentEditor` is the reusable freeform component. It receives and emits
canonical `LodariqBlock` values and receives media upload/preview behavior as
callbacks. The component does not own Tour actions, API credentials, media
persistence, release state, or publication. Selection, toolbar state, upload
progress, and object URLs remain authoring-only ephemeral state.

Emoji discovery may use Frimousse and icon discovery/rendering may use Lucide in
authoring, but persisted icon names remain a closed Lodariq allowlist with a
deterministic framework-free runtime renderer.

## Consequences

- Extraction to a standalone `@lodariq/editor` is allowed later only if justified.
- Other experience types may reuse `RichContentEditor` without adopting Tour
  block/action ownership.
- Every node ships serialization, deserialization, migration, validation, paste,
  and accessibility coverage before it lands (§20).
- Canonical documents never contain Lexical state, raw HTML/CSS, object URLs,
  uploaded bytes, or arbitrary icon markup.
