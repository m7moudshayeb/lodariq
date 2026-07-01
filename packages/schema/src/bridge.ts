import { Type, type Static } from '@sinclair/typebox';
import { BlockActionProps, LodariqBlock } from './block';
import { LodariqDocument } from './document';
import { ElementFingerprint } from './target';

/**
 * Versioned iframe <-> host-page bridge protocol (PRD §9.5).
 *
 * The iframe is a security boundary, not a license to send every keystroke.
 * Keystrokes never cross the bridge; Lexical updates are batched into semantic
 * patches. Every message carries protocol version + correlation metadata, and
 * payloads must be runtime-validated against these schemas before dispatch.
 *
 * These schemas are owned here in @lodariq/schema so the iframe and host bridge
 * validate against EXACTLY the same definitions (PRD §11.1).
 */
export const BRIDGE_PROTOCOL_VERSION = '1' as const;

/** Envelope present on every bridge message (PRD §9.5). */
export const BridgeEnvelope = Type.Object(
  {
    protocol: Type.Literal(BRIDGE_PROTOCOL_VERSION),
    sessionId: Type.String(),
    documentId: Type.String(),
    correlationId: Type.String(),
  },
  { $id: 'BridgeEnvelope' },
);
export type BridgeEnvelope = Static<typeof BridgeEnvelope>;

export const ScrollState = Type.Object(
  { x: Type.Number(), y: Type.Number() },
  { $id: 'ScrollState' },
);
export type ScrollState = Static<typeof ScrollState>;

export const PreviewPatchOperation = Type.Union(
  [
    Type.Object({ op: Type.Literal('insertBlock'), block: LodariqBlock }),
    Type.Object({ op: Type.Literal('insertBlocks'), blocks: Type.Array(LodariqBlock) }),
    Type.Object({ op: Type.Literal('updateContent'), content: Type.String() }),
    Type.Object({
      op: Type.Literal('moveBlock'),
      direction: Type.Union([Type.Literal('up'), Type.Literal('down')]),
    }),
    Type.Object({ op: Type.Literal('reorderBlock'), beforeBlockId: Type.String() }),
    Type.Object({
      op: Type.Literal('transformBlock'),
      type: Type.Union([
        Type.Literal('paragraph'),
        Type.Literal('heading'),
        Type.Literal('list'),
        Type.Literal('divider'),
        Type.Literal('button'),
        Type.Literal('link'),
        Type.Literal('media'),
      ]),
    }),
    Type.Object({
      op: Type.Literal('setAction'),
      action: Type.Optional(BlockActionProps),
    }),
    Type.Object({
      op: Type.Literal('attachTarget'),
      targetId: Type.String(),
      fingerprint: ElementFingerprint,
    }),
    Type.Object({
      op: Type.Literal('removeTarget'),
      targetId: Type.String(),
    }),
    Type.Object({ op: Type.Literal('replaceDocument'), document: LodariqDocument }),
  ],
  { $id: 'PreviewPatchOperation' },
);
export type PreviewPatchOperation = Static<typeof PreviewPatchOperation>;

export const PreviewPatch = Type.Object(
  { ops: Type.Array(PreviewPatchOperation) },
  { $id: 'PreviewPatch' },
);
export type PreviewPatch = Static<typeof PreviewPatch>;

export const ResolverDiagnostic = Type.Object(
  {
    state: Type.Union([Type.Literal('found'), Type.Literal('missing'), Type.Literal('ambiguous')]),
    confidence: Type.Number(),
    candidateCount: Type.Number(),
    resolutionMethod: Type.Optional(Type.String()),
    message: Type.Optional(Type.String()),
  },
  { $id: 'ResolverDiagnostic' },
);
export type ResolverDiagnostic = Static<typeof ResolverDiagnostic>;

export const TargetInspectAction = Type.Union([
  Type.Literal('view'),
  Type.Literal('test'),
  Type.Literal('health'),
]);
export type TargetInspectAction = Static<typeof TargetInspectAction>;

/** Discriminated union of bridge message bodies (PRD §9.5). */
export const BridgeMessage = Type.Intersect([
  BridgeEnvelope,
  Type.Union([
    Type.Object({
      type: Type.Literal('target.pick.start'),
      blockId: Type.String(),
    }),
    Type.Object({
      type: Type.Literal('target.pick.result'),
      blockId: Type.String(),
      fingerprint: ElementFingerprint,
    }),
    Type.Object({
      type: Type.Literal('target.pick.canceled'),
      blockId: Type.String(),
    }),
    Type.Object({
      type: Type.Literal('target.inspect.request'),
      blockId: Type.String(),
      targetId: Type.String(),
      action: TargetInspectAction,
      fingerprint: ElementFingerprint,
    }),
    Type.Object({
      type: Type.Literal('target.inspect.result'),
      blockId: Type.String(),
      targetId: Type.String(),
      action: TargetInspectAction,
      diagnostic: ResolverDiagnostic,
    }),
    Type.Object({
      type: Type.Literal('preview.patch'),
      blockId: Type.String(),
      patch: PreviewPatch,
    }),
    Type.Object({
      type: Type.Literal('authoring.save.request'),
    }),
    Type.Object({
      type: Type.Literal('authoring.save.result'),
      requestCorrelationId: Type.String(),
      document: Type.Optional(LodariqDocument),
    }),
    Type.Object({
      type: Type.Literal('authoring.init'),
      workspaceId: Type.String(),
      environment: Type.Union([Type.Literal('development'), Type.Literal('staging')]),
      document: LodariqDocument,
    }),
    Type.Object({
      type: Type.Literal('page.lifecycle.update'),
      route: Type.String(),
      scrollState: ScrollState,
    }),
    Type.Object({
      type: Type.Literal('resolver.diagnostic'),
      stepId: Type.String(),
      diagnostic: ResolverDiagnostic,
    }),
    Type.Object({
      type: Type.Literal('ack'),
      ackOf: Type.String(),
    }),
  ]),
]);
export type BridgeMessage = Static<typeof BridgeMessage>;
