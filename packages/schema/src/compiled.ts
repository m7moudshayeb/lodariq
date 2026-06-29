import { Type, type Static } from '@sinclair/typebox';
import { LodariqBlockProps } from './block';
import { ElementFingerprint, RuntimeLifecycleHints } from './target';

/**
 * Compiled delivery JSON consumed by the runtime/player (PRD §6.1, §11.3).
 *
 * Real publications are compiled SERVER-SIDE and content-addressed; browser
 * compilation is preview-only (PRD §9.1, §20). This is the typed shape the
 * runtime renders — it must never carry raw HTML/CSS (PRD §7.10, §14.2).
 */
export const CompiledStep = Type.Object(
  {
    id: Type.String(),
    targetId: Type.Optional(Type.String()),
    placement: Type.Optional(Type.String()),
    /** Pre-sanitized, render-ready node tree. */
    body: Type.Array(
      Type.Object({
        id: Type.String(),
        type: Type.String(),
        text: Type.Optional(Type.String()),
        props: LodariqBlockProps,
      }),
    ),
    lifecycle: Type.Optional(RuntimeLifecycleHints),
  },
  { $id: 'CompiledStep' },
);
export type CompiledStep = Static<typeof CompiledStep>;

export const CompiledTarget = Type.Object(
  {
    id: Type.String(),
    fingerprint: ElementFingerprint,
  },
  { $id: 'CompiledTarget' },
);
export type CompiledTarget = Static<typeof CompiledTarget>;

export const CompiledDocument = Type.Object(
  {
    documentId: Type.String(),
    type: Type.String(),
    /** sha256 content hash of this compiled artifact (PRD §11.3). */
    contentHash: Type.String(),
    schemaVersion: Type.String(),
    compilerVersion: Type.String(),
    targets: Type.Array(CompiledTarget),
    steps: Type.Array(CompiledStep),
  },
  { $id: 'CompiledDocument' },
);
export type CompiledDocument = Static<typeof CompiledDocument>;

/** Tiny manifest pointer the edge loader reads (PRD §11.3). */
export const ManifestPointer = Type.Object(
  {
    documentId: Type.String(),
    currentVersion: Type.String(),
  },
  { $id: 'ManifestPointer' },
);
export type ManifestPointer = Static<typeof ManifestPointer>;
