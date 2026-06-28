import { Type, type Static } from '@sinclair/typebox';
import { ElementFingerprint } from './target';

/**
 * Versioned iframe <-> host-page bridge protocol (PRD §9.5).
 *
 * The iframe is a security boundary, not a license to send every keystroke.
 * Keystrokes never cross the bridge; Lexical updates are batched into semantic
 * patches. Every message carries protocol version + correlation metadata, and
 * payloads must be runtime-validated against these schemas before dispatch.
 *
 * These schemas are owned here in @talmeh/schema so the iframe and host bridge
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

export const PreviewPatch = Type.Object(
  { ops: Type.Array(Type.Record(Type.String(), Type.Unknown())) },
  { $id: 'PreviewPatch' },
);
export type PreviewPatch = Static<typeof PreviewPatch>;

export const ResolverDiagnostic = Type.Object(
  {
    state: Type.Union([Type.Literal('found'), Type.Literal('missing'), Type.Literal('ambiguous')]),
    confidence: Type.Number(),
    candidateCount: Type.Number(),
    message: Type.Optional(Type.String()),
  },
  { $id: 'ResolverDiagnostic' },
);
export type ResolverDiagnostic = Static<typeof ResolverDiagnostic>;

/** Discriminated union of bridge message bodies (PRD §9.5). */
export const BridgeMessage = Type.Intersect([
  BridgeEnvelope,
  Type.Union([
    Type.Object({ type: Type.Literal('target.pick.start') }),
    Type.Object({
      type: Type.Literal('target.pick.result'),
      blockId: Type.String(),
      fingerprint: ElementFingerprint,
    }),
    Type.Object({
      type: Type.Literal('preview.patch'),
      blockId: Type.String(),
      patch: PreviewPatch,
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
