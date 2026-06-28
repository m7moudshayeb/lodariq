# 0007. Editor drag-and-drop approach

- Status: Proposed
- PRD references: §7.2, §19 (open decision 6)

## Context

The editor needs drag handles for top-level and nested blocks with safe nesting
rules. The choice between native pointer logic and a dedicated DnD library is
still open (PRD §19.6).

## Decision

Start with native pointer-event logic around Lexical nodes for top-level reorder
in the Pre-phase. Revisit a dedicated DnD library only if nested drag, keyboard
DnD, or accessibility requirements exceed what native logic handles cleanly.

## Consequences

- Keeps the Pre-phase dependency surface small.
- Decision to be confirmed once nested-block DnD UX is validated; this ADR will
  move to Accepted or be superseded.
