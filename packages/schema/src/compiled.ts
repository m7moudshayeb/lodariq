import { Type, type Static } from '@sinclair/typebox';
import { LodariqBlockProps, PresentationAnchor } from './block';
import { BrandThemeSnapshot, ExperienceAppearance } from './brand';
import { AudienceDefinition, TriggerDefinition } from './document';
import { RendererContractVersion } from './release';
import { ElementFingerprint, RuntimeLifecycleHints, TargetIdentityV2 } from './target';
import { COMPILED_ARTIFACT_SCHEMA_VERSION } from './version';

const CONTENT_HASH_PATTERN = '^sha256-[0-9a-f]{64}$';

/*
 * Phase 1 artifacts were validated before target fingerprints and lifecycle
 * hints became closed contracts. Keep an open compatibility copy here instead
 * of weakening the canonical authoring schemas or the V2 delivery contract.
 */
const CompiledElementFingerprintV1 = Type.Object({
  ...ElementFingerprint.properties,
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
  diagnosticCoordinates: Type.Optional(Type.Object({ x: Type.Number(), y: Type.Number() })),
});

const CompiledRuntimeLifecycleHintsV1 = Type.Object({
  ...RuntimeLifecycleHints.properties,
  waitForElement: Type.Optional(CompiledElementFingerprintV1),
  scrollContainer: Type.Optional(CompiledElementFingerprintV1),
  openPanel: Type.Optional(CompiledElementFingerprintV1),
  selectTab: Type.Optional(CompiledElementFingerprintV1),
});

/** Step presentation belongs beside the target binding, never in body props. */
const CompiledBodyProps = Type.Omit(LodariqBlockProps, ['presentationAnchor'], {
  additionalProperties: false,
});

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
    presentationAnchor: Type.Optional(Type.Ref(PresentationAnchor)),
    /** Pre-sanitized, render-ready node tree. */
    body: Type.Array(
      Type.Object({
        id: Type.String(),
        type: Type.String(),
        text: Type.Optional(Type.String()),
        props: CompiledBodyProps,
      }),
    ),
    lifecycle: Type.Optional(CompiledRuntimeLifecycleHintsV1),
  },
  { $id: 'CompiledStep' },
);
export type CompiledStep = Static<typeof CompiledStep>;

export const CompiledTarget = Type.Object(
  {
    id: Type.String(),
    fingerprint: CompiledElementFingerprintV1,
    identity: Type.Optional(Type.Ref(TargetIdentityV2)),
  },
  { $id: 'CompiledTarget' },
);
export type CompiledTarget = Static<typeof CompiledTarget>;

/**
 * Phase 2 delivery nodes are closed independently of the permissive Phase 1
 * read contract above. This keeps immutable legacy artifacts readable while
 * preventing new artifacts from carrying undeclared renderer input.
 */
const CompiledBodyNodeV2 = Type.Object(
  {
    id: Type.String(),
    type: Type.String(),
    text: Type.Optional(Type.String()),
    props: CompiledBodyProps,
  },
  { additionalProperties: false },
);

const CompiledStepV2 = Type.Object(
  {
    id: Type.String(),
    targetId: Type.Optional(Type.String()),
    placement: Type.Optional(Type.String()),
    presentationAnchor: Type.Optional(Type.Ref(PresentationAnchor)),
    body: Type.Array(CompiledBodyNodeV2),
    lifecycle: Type.Optional(RuntimeLifecycleHints),
  },
  { additionalProperties: false },
);

const CompiledTargetV2 = Type.Object(
  {
    id: Type.String(),
    fingerprint: ElementFingerprint,
    identity: Type.Optional(Type.Ref(TargetIdentityV2)),
  },
  { additionalProperties: false },
);

/** Phase 1 delivery shape retained so immutable stored artifacts remain readable. */
export const CompiledDocumentV1 = Type.Object(
  {
    /** Prevent malformed V2 artifacts from falling through the legacy branch. */
    artifactSchemaVersion: Type.Optional(Type.Never()),
    documentId: Type.String(),
    type: Type.String(),
    /** sha256 content hash of this compiled artifact (PRD §11.3). */
    contentHash: Type.String(),
    schemaVersion: Type.String(),
    compilerVersion: Type.String(),
    targets: Type.Array(CompiledTarget),
    steps: Type.Array(CompiledStep),
  },
  { $id: 'CompiledDocumentV1' },
);
export type CompiledDocumentV1 = Static<typeof CompiledDocumentV1>;

/**
 * Phase 2 delivery shape. The exact approved theme and renderer contract are
 * part of the immutable, content-addressed artifact.
 */
export const CompiledDocumentV2 = Type.Object(
  {
    artifactSchemaVersion: Type.Literal(COMPILED_ARTIFACT_SCHEMA_VERSION),
    documentId: Type.String(),
    type: Type.String(),
    /** sha256 content hash of every other field in this compiled artifact. */
    contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    schemaVersion: Type.String(),
    compilerVersion: Type.String(),
    rendererContractVersion: RendererContractVersion,
    trigger: TriggerDefinition,
    audience: AudienceDefinition,
    theme: BrandThemeSnapshot,
    appearance: ExperienceAppearance,
    targets: Type.Array(CompiledTargetV2),
    steps: Type.Array(CompiledStepV2),
  },
  { $id: 'CompiledDocumentV2', additionalProperties: false },
);
export type CompiledDocumentV2 = Static<typeof CompiledDocumentV2>;

/** Compatibility read contract for immutable Phase 1 and Phase 2 artifacts. */
export const CompiledDocument = Type.Union([CompiledDocumentV1, CompiledDocumentV2], {
  $id: 'CompiledDocument',
});
export type CompiledDocument = Static<typeof CompiledDocument>;

/** New compilations always return the Phase 2 delivery contract. */
export const NewCompiledDocument = CompiledDocumentV2;
export type NewCompiledDocument = CompiledDocumentV2;
