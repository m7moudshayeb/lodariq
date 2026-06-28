import { Type, type Static } from '@sinclair/typebox';

/**
 * Semantic fingerprint of a host-page element (PRD §8.3).
 * The resolver scores candidates against this; CSS and coordinates are
 * diagnostic-only signals, never the primary resolution path.
 */
export const ElementFingerprint = Type.Object(
  {
    stableAttributes: Type.Record(Type.String(), Type.String()),
    role: Type.Optional(Type.String()),
    accessibleName: Type.Optional(Type.String()),
    tagName: Type.String(),
    inputType: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    placeholder: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    alt: Type.Optional(Type.String()),
    nearbyText: Type.Optional(Type.Array(Type.String())),
    ancestorLandmarks: Type.Optional(
      Type.Array(
        Type.Object({
          role: Type.Optional(Type.String()),
          accessibleName: Type.Optional(Type.String()),
        }),
      ),
    ),
    relativePosition: Type.Optional(
      Type.Object({
        parentRole: Type.Optional(Type.String()),
        siblingIndex: Type.Optional(Type.Number()),
      }),
    ),
    scopedCss: Type.Optional(Type.String()),
    /** Diagnostic only — never used to trigger production clicks (PRD §8.4). */
    diagnosticCoordinates: Type.Optional(Type.Object({ x: Type.Number(), y: Type.Number() })),
  },
  { $id: 'ElementFingerprint' },
);
export type ElementFingerprint = Static<typeof ElementFingerprint>;

/** Optional page-state hints used by the runtime lifecycle layer (PRD §8.6). */
export const RuntimeLifecycleHints = Type.Object(
  {
    expectedRoute: Type.Optional(Type.String()),
    waitForText: Type.Optional(Type.String()),
    waitForElement: Type.Optional(Type.Ref(ElementFingerprint)),
    scrollContainer: Type.Optional(Type.Ref(ElementFingerprint)),
    scrollStrategy: Type.Optional(
      Type.Union([
        Type.Literal('nearest'),
        Type.Literal('top'),
        Type.Literal('center'),
        Type.Literal('bottom'),
        Type.Literal('virtualized-search'),
      ]),
    ),
    openPanel: Type.Optional(Type.Ref(ElementFingerprint)),
    selectTab: Type.Optional(Type.Ref(ElementFingerprint)),
    waitForNetworkIdle: Type.Optional(Type.Boolean()),
    timeoutMs: Type.Optional(Type.Number()),
  },
  { $id: 'RuntimeLifecycleHints' },
);
export type RuntimeLifecycleHints = Static<typeof RuntimeLifecycleHints>;

/**
 * A target binds a Talmeh block to a host-page element. The canonical model
 * stores the fingerprint plus optional lifecycle hints; the resolver turns
 * this into a live element at runtime.
 */
export const Target = Type.Object(
  {
    id: Type.String(),
    fingerprint: Type.Ref(ElementFingerprint),
    lifecycle: Type.Optional(Type.Ref(RuntimeLifecycleHints)),
  },
  { $id: 'Target' },
);
export type Target = Static<typeof Target>;
