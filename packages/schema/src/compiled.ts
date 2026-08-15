import { Type, type Static } from '@sinclair/typebox';
import {
  InlineTextRun,
  LodariqBlockProps,
  PresentationAnchor,
  TooltipLayoutProps,
  TooltipStyleProps,
} from './block';
import { BrandThemeSnapshot, ExperienceAppearance } from './brand';
import { AudienceDefinition, TourCompletionBehavior, TriggerDefinition } from './document';
import { ContentLocale } from './document-localization';
import { RendererContractVersion } from './release';
import { ElementFingerprint, RuntimeLifecycleHints, TargetIdentityV2 } from './target';
import { COMPILED_ARTIFACT_SCHEMA_VERSION } from './version';

const CONTENT_HASH_PATTERN = '^sha256-[0-9a-f]{64}$';

const LegacyCompiledActionProps = Type.Object(
  {
    type: Type.Union([
      Type.Literal('next'),
      Type.Literal('back'),
      Type.Literal('complete'),
      Type.Literal('dismiss'),
      Type.Literal('clickTarget'),
      Type.Literal('openPage'),
    ]),
    url: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
    navigationBehavior: Type.Optional(Type.Union([Type.Literal('stay'), Type.Literal('continue')])),
  },
  { additionalProperties: false },
);

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

/** Frozen pre-V4 body props; newer behavior/presentation fields must not validate as V2/V3. */
const LegacyCompiledBodyProps = Type.Object(
  {
    ...Type.Omit(LodariqBlockProps, [
      'action',
      'presentationAnchor',
      'entrySequence',
      'media',
      'motion',
      'responsive',
      'spotlight',
      'composition',
      'accessibilityName',
    ]).properties,
    action: Type.Optional(LegacyCompiledActionProps),
  },
  { additionalProperties: false },
);

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
    tooltipLayout: Type.Optional(Type.Ref(TooltipLayoutProps)),
    tooltipStyle: Type.Optional(Type.Ref(TooltipStyleProps)),
    entrySequence: Type.Optional(LodariqBlockProps.properties.entrySequence),
    motion: Type.Optional(LodariqBlockProps.properties.motion),
    responsive: Type.Optional(LodariqBlockProps.properties.responsive),
    spotlight: Type.Optional(LodariqBlockProps.properties.spotlight),
    accessibilityName: Type.Optional(LodariqBlockProps.properties.accessibilityName),
    /** Pre-sanitized, render-ready node tree. */
    body: Type.Array(
      Type.Object(
        {
          id: Type.String(),
          type: Type.String(),
          text: Type.Optional(Type.String()),
          contentRuns: Type.Optional(Type.Array(Type.Ref(InlineTextRun))),
          props: CompiledBodyProps,
        },
        { additionalProperties: false },
      ),
    ),
    lifecycle: Type.Optional(Type.Ref(RuntimeLifecycleHints)),
  },
  { $id: 'CompiledStep', additionalProperties: false },
);
export type CompiledStep = Static<typeof CompiledStep>;

const CompiledStepV1 = Type.Object({
  id: Type.String(),
  targetId: Type.Optional(Type.String()),
  placement: Type.Optional(Type.String()),
  presentationAnchor: Type.Optional(Type.Ref(PresentationAnchor)),
  tooltipLayout: Type.Optional(Type.Ref(TooltipLayoutProps)),
  tooltipStyle: Type.Optional(Type.Ref(TooltipStyleProps)),
  body: Type.Array(
    Type.Object({
      id: Type.String(),
      type: Type.String(),
      text: Type.Optional(Type.String()),
      contentRuns: Type.Optional(Type.Array(Type.Ref(InlineTextRun))),
      props: LegacyCompiledBodyProps,
    }),
  ),
  lifecycle: Type.Optional(CompiledRuntimeLifecycleHintsV1),
});

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
    contentRuns: Type.Optional(Type.Array(Type.Ref(InlineTextRun))),
    props: LegacyCompiledBodyProps,
  },
  { additionalProperties: false },
);

const CompiledStepV2 = Type.Object(
  {
    id: Type.String(),
    targetId: Type.Optional(Type.String()),
    placement: Type.Optional(Type.String()),
    presentationAnchor: Type.Optional(Type.Ref(PresentationAnchor)),
    tooltipLayout: Type.Optional(Type.Ref(TooltipLayoutProps)),
    tooltipStyle: Type.Optional(Type.Ref(TooltipStyleProps)),
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

/** One fully resolved locale view; fallback resolution happens during server compilation. */
export const CompiledDocumentLocaleVariant = Type.Object(
  {
    locale: Type.Ref(ContentLocale),
    fallbackLocale: Type.Ref(ContentLocale),
    title: Type.String({ maxLength: 1_024 }),
    steps: Type.Array(CompiledStepV2),
  },
  { $id: 'CompiledDocumentLocaleVariant', additionalProperties: false },
);
export type CompiledDocumentLocaleVariant = Static<typeof CompiledDocumentLocaleVariant>;

export const CompiledDocumentLocalization = Type.Object(
  {
    defaultLocale: Type.Ref(ContentLocale),
    defaultTitle: Type.String({ maxLength: 1_024 }),
    variants: Type.Array(Type.Ref(CompiledDocumentLocaleVariant), { maxItems: 50 }),
  },
  { $id: 'CompiledDocumentLocalization', additionalProperties: false },
);
export type CompiledDocumentLocalization = Static<typeof CompiledDocumentLocalization>;

export const CompiledDocumentLocaleVariantV4 = Type.Object(
  {
    locale: Type.Ref(ContentLocale),
    fallbackLocale: Type.Ref(ContentLocale),
    title: Type.String({ maxLength: 1_024 }),
    steps: Type.Array(CompiledStep),
  },
  { $id: 'CompiledDocumentLocaleVariantV4', additionalProperties: false },
);
export type CompiledDocumentLocaleVariantV4 = Static<typeof CompiledDocumentLocaleVariantV4>;

export const CompiledDocumentLocalizationV4 = Type.Object(
  {
    defaultLocale: Type.Ref(ContentLocale),
    defaultTitle: Type.String({ maxLength: 1_024 }),
    variants: Type.Array(Type.Ref(CompiledDocumentLocaleVariantV4), { maxItems: 50 }),
  },
  { $id: 'CompiledDocumentLocalizationV4', additionalProperties: false },
);
export type CompiledDocumentLocalizationV4 = Static<typeof CompiledDocumentLocalizationV4>;

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
    steps: Type.Array(CompiledStepV1),
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
    artifactSchemaVersion: Type.Literal('2'),
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

/**
 * Localized delivery shape. Locale variants are compiled into the same
 * immutable artifact, so runtime selection never calls a translation service.
 */
export const CompiledDocumentV3 = Type.Object(
  {
    ...CompiledDocumentV2.properties,
    artifactSchemaVersion: Type.Literal('3'),
    localization: Type.Ref(CompiledDocumentLocalization),
  },
  { $id: 'CompiledDocumentV3', additionalProperties: false },
);
export type CompiledDocumentV3 = Static<typeof CompiledDocumentV3>;

/** Closed choreography and typed-flow delivery contract. */
export const CompiledDocumentV4 = Type.Object(
  {
    ...CompiledDocumentV2.properties,
    artifactSchemaVersion: Type.Literal(COMPILED_ARTIFACT_SCHEMA_VERSION),
    steps: Type.Array(CompiledStep),
    localization: Type.Ref(CompiledDocumentLocalizationV4),
    completion: Type.Optional(Type.Ref(TourCompletionBehavior)),
  },
  { $id: 'CompiledDocumentV4', additionalProperties: false },
);
export type CompiledDocumentV4 = Static<typeof CompiledDocumentV4>;

/** Compatibility read contract for immutable Phase 1, Phase 2, and localized artifacts. */
export const CompiledDocument = Type.Union(
  [CompiledDocumentV1, CompiledDocumentV2, CompiledDocumentV3, CompiledDocumentV4],
  {
    $id: 'CompiledDocument',
  },
);
export type CompiledDocument = Static<typeof CompiledDocument>;

/** New compilations always return the localized delivery contract. */
export const NewCompiledDocument = CompiledDocumentV4;
export type NewCompiledDocument = CompiledDocumentV4;
