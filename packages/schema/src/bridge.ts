import { Type, type Static } from '@sinclair/typebox';
import {
  BlockActionProps,
  ExactPresentationAnchor,
  LodariqBlock,
  PresentationAnchor,
  TextStyleProps,
} from './block';
import { LodariqDocument } from './document';
import {
  AuthoringBrandDriftCheckResult,
  BrandDriftCheckRequest,
  BrandThemeSnapshot,
  CustomerBrandTokenRegistration,
  ExperienceAppearance,
  ProductStyleProposal,
} from './brand';
import {
  ElementFingerprint,
  RuntimeLifecycleHints,
  TargetIdentityV2,
  TargetLocale,
  TargetRequiredAction,
  TargetSignalFamily,
  TargetViewportClass,
} from './target';
import { TargetResolutionStatus, TargetVerificationReasonCode } from './target-verification';
import {
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringBrandThemeAcknowledgementRequest,
  AuthoringBrandThemeAcknowledgementResult,
  AuthoringProductMatchApplyResult,
  AuthoringStagingPublicationRequest,
  AuthoringStagingPublicationResult,
  AuthoringStagingReleaseState,
  AuthoringStagingVerificationRequest,
  AuthoringStagingVerificationResult,
} from './sdk';
import {
  BrowserVerificationReport,
  ProductionPromotionRequest,
  ProductionPromotionResult,
  ReleaseApproval,
  ReleaseRecoveryRequest,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
} from './release';

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
export const AUTHORING_INLINE_CONTENT_COMMIT_TYPE = 'authoring.inline-content.commit' as const;
export const AUTHORING_INLINE_CONTROL_COMMIT_TYPE = 'authoring.inline-control.commit' as const;
export const AUTHORING_PANEL_MODE_OPEN_TYPE = 'authoring.panel-mode.open' as const;
export const AUTHORING_PANEL_LAYOUT_REQUEST_TYPE = 'authoring.panel-layout.request' as const;
export const AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE = 'authoring.save-and-exit.request' as const;
export const AUTHORING_SAVE_STATE_UPDATE_TYPE = 'authoring.save-state.update' as const;
export const AUTHORING_RELEASE_STATE_REQUEST_TYPE = 'authoring.release-state.request' as const;
export const AUTHORING_RELEASE_STATE_RESULT_TYPE = 'authoring.release-state.result' as const;
export const AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE =
  'authoring.release-recovery-state.request' as const;
export const AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE =
  'authoring.release-recovery-state.result' as const;
export const AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE =
  'authoring.release-recovery.request' as const;
export const AUTHORING_RELEASE_RECOVERY_RESULT_TYPE = 'authoring.release-recovery.result' as const;
export const AUTHORING_PUBLISH_STAGING_REQUEST_TYPE = 'authoring.publish-staging.request' as const;
export const AUTHORING_PUBLISH_STAGING_RESULT_TYPE = 'authoring.publish-staging.result' as const;
export const AUTHORING_BROWSER_VERIFY_REQUEST_TYPE = 'authoring.browser-verify.request' as const;
export const AUTHORING_BROWSER_VERIFY_RESULT_TYPE = 'authoring.browser-verify.result' as const;
export const AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE =
  'authoring.submit-verification.request' as const;
export const AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE =
  'authoring.submit-verification.result' as const;
export const AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE =
  'authoring.style-source.save.request' as const;
export const AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE =
  'authoring.style-source.save.result' as const;
export const AUTHORING_BRAND_DRIFT_CHECK_REQUEST_TYPE =
  'authoring.brand-drift.check.request' as const;
export const AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE =
  'authoring.brand-drift.check.result' as const;
export const AUTHORING_BRAND_DRIFT_PREVIEW_TYPE = 'authoring.brand-drift.preview' as const;
export const AUTHORING_BRAND_THEME_ACKNOWLEDGE_REQUEST_TYPE =
  'authoring.brand-theme.acknowledge.request' as const;
export const AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE =
  'authoring.brand-theme.acknowledge.result' as const;
export const AUTHORING_THEME_PREVIEW_APPLY_TYPE = 'authoring.theme-preview.apply' as const;
export const AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE =
  'authoring.promote-production.request' as const;
export const AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE =
  'authoring.promote-production.result' as const;
export const AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE =
  'authoring.approve-production.request' as const;
export const AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE =
  'authoring.approve-production.result' as const;
export const STYLE_SAMPLE_START_TYPE = 'style.sample.start' as const;
export const STYLE_SAMPLE_RESULT_TYPE = 'style.sample.result' as const;
export const STYLE_SAMPLE_CANCELED_TYPE = 'style.sample.canceled' as const;
export const BRAND_TOKENS_AVAILABLE_TYPE = 'brand.tokens.available' as const;
export const AUTHORING_INLINE_CONTENT_MAX_LENGTH = 4_000;
export const AUTHORING_DOCUMENT_TITLE_MAX_LENGTH = 256;
const BRIDGE_REFERENCE_ID_OPTIONS = { minLength: 1, maxLength: 256 } as const;

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

export const AuthoringPanelModeOpenMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_PANEL_MODE_OPEN_TYPE),
    mode: Type.Literal('appearance'),
  },
  { $id: 'AuthoringPanelModeOpenMessage', additionalProperties: false },
);
export type AuthoringPanelModeOpenMessage = Static<typeof AuthoringPanelModeOpenMessage>;

/** Creator-requested presentation size for the modeless authoring workspace. */
export const AuthoringPanelLayoutMode = Type.Union([
  Type.Literal('compact'),
  Type.Literal('standard'),
  Type.Literal('focus'),
]);
export type AuthoringPanelLayoutMode = Static<typeof AuthoringPanelLayoutMode>;

export const AuthoringPanelLayoutRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_PANEL_LAYOUT_REQUEST_TYPE),
    mode: AuthoringPanelLayoutMode,
  },
  { $id: 'AuthoringPanelLayoutRequestMessage', additionalProperties: false },
);
export type AuthoringPanelLayoutRequestMessage = Static<typeof AuthoringPanelLayoutRequestMessage>;

/** Ask the verified host to persist the current draft and close the authoring session. */
export const AuthoringSaveAndExitRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE),
  },
  { $id: 'AuthoringSaveAndExitRequestMessage', additionalProperties: false },
);
export type AuthoringSaveAndExitRequestMessage = Static<typeof AuthoringSaveAndExitRequestMessage>;

export const AuthoringSaveState = Type.Union([
  Type.Literal('saved'),
  Type.Literal('saving'),
  Type.Literal('error'),
]);
export type AuthoringSaveState = Static<typeof AuthoringSaveState>;

/** Report the host-owned draft persistence state to the authoring frame. */
export const AuthoringSaveStateUpdateMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SAVE_STATE_UPDATE_TYPE),
    state: AuthoringSaveState,
    label: Type.String({ minLength: 1, maxLength: 160 }),
  },
  { $id: 'AuthoringSaveStateUpdateMessage', additionalProperties: false },
);
export type AuthoringSaveStateUpdateMessage = Static<typeof AuthoringSaveStateUpdateMessage>;

export const ScrollState = Type.Object(
  { x: Type.Number(), y: Type.Number() },
  { $id: 'ScrollState' },
);
export type ScrollState = Static<typeof ScrollState>;

export const PreviewPatchOperation = Type.Union(
  [
    Type.Object({
      op: Type.Literal('setDocumentTitle'),
      title: Type.String(),
    }),
    Type.Object(
      {
        op: Type.Literal('setAppearance'),
        appearance: ExperienceAppearance,
      },
      { additionalProperties: false },
    ),
    Type.Object({
      op: Type.Literal('insertBlock'),
      block: LodariqBlock,
      anchorBlockId: Type.Optional(Type.String()),
      position: Type.Optional(Type.Union([Type.Literal('before'), Type.Literal('after')])),
    }),
    Type.Object({ op: Type.Literal('insertBlocks'), blocks: Type.Array(LodariqBlock) }),
    Type.Object({
      op: Type.Literal('insertStepContent'),
      stepBlockId: Type.String(),
      block: LodariqBlock,
      index: Type.Number(),
    }),
    Type.Object({ op: Type.Literal('updateContent'), content: Type.String() }),
    Type.Object(
      {
        op: Type.Literal('setTextStyle'),
        textStyle: Type.Optional(Type.Ref(TextStyleProps)),
      },
      { additionalProperties: false },
    ),
    Type.Object({
      op: Type.Literal('moveBlock'),
      direction: Type.Union([Type.Literal('up'), Type.Literal('down')]),
    }),
    Type.Object({
      op: Type.Literal('moveStepContent'),
      stepBlockId: Type.String(),
      direction: Type.Union([Type.Literal('up'), Type.Literal('down')]),
    }),
    Type.Object({
      op: Type.Literal('reorderBlock'),
      beforeBlockId: Type.String(),
      position: Type.Optional(Type.Union([Type.Literal('before'), Type.Literal('after')])),
    }),
    Type.Object({
      op: Type.Literal('reorderStepContent'),
      stepBlockId: Type.String(),
      targetChildBlockId: Type.String(),
      position: Type.Optional(Type.Union([Type.Literal('before'), Type.Literal('after')])),
    }),
    Type.Object({
      op: Type.Literal('removeBlock'),
      stepBlockId: Type.Optional(Type.String()),
    }),
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
    Type.Object(
      {
        op: Type.Literal('setVariant'),
        variant: Type.Union([Type.Literal('primary'), Type.Literal('secondary')]),
      },
      { additionalProperties: false },
    ),
    Type.Object({
      op: Type.Literal('setPlacement'),
      placement: Type.Union([
        Type.Literal('top'),
        Type.Literal('right'),
        Type.Literal('bottom'),
        Type.Literal('left'),
      ]),
    }),
    Type.Object(
      {
        op: Type.Literal('setPresentationAnchor'),
        presentationAnchor: Type.Optional(Type.Ref(PresentationAnchor)),
      },
      { additionalProperties: false },
    ),
    Type.Object({
      op: Type.Literal('attachTarget'),
      targetId: Type.String(),
      fingerprint: ElementFingerprint,
      identity: Type.Optional(Type.Ref(TargetIdentityV2)),
    }),
    Type.Object({
      op: Type.Literal('updateTargetEvidence'),
      targetId: Type.String(),
      fingerprint: ElementFingerprint,
      identity: Type.Ref(TargetIdentityV2),
    }),
    Type.Object({
      op: Type.Literal('removeTarget'),
      targetId: Type.String(),
    }),
    Type.Object({
      op: Type.Literal('setTargetLifecycle'),
      targetId: Type.String(),
      lifecycle: Type.Optional(RuntimeLifecycleHints),
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
    state: TargetResolutionStatus,
    confidence: Type.Number(),
    candidateCount: Type.Number(),
    resolutionMethod: Type.Optional(Type.String()),
    message: Type.Optional(Type.String()),
    /** Independent evidence families that supported the observed candidate. */
    evidenceFamilies: Type.Optional(
      Type.Array(TargetSignalFamily, {
        maxItems: 8,
        uniqueItems: true,
      }),
    ),
    reasonCode: Type.Optional(TargetVerificationReasonCode),
    runnerUpConfidence: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    currentLocale: Type.Optional(Type.Union([TargetLocale, Type.Null()])),
    viewportClass: Type.Optional(TargetViewportClass),
    observedAt: Type.Optional(
      Type.String({
        minLength: 20,
        maxLength: 64,
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$',
      }),
    ),
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

/**
 * Closed host -> iframe commit for direct editing on an authoring preview.
 * Content remains plain text and is sent once per semantic commit, never for
 * individual keystrokes.
 */
export const AuthoringInlineContentCommitMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_INLINE_CONTENT_COMMIT_TYPE),
    blockId: Type.String({ minLength: 1, maxLength: 256 }),
    content: Type.String({ maxLength: AUTHORING_INLINE_CONTENT_MAX_LENGTH }),
  },
  { $id: 'AuthoringInlineContentCommitMessage', additionalProperties: false },
);
export type AuthoringInlineContentCommitMessage = Static<
  typeof AuthoringInlineContentCommitMessage
>;

/**
 * Small, closed set of authoring controls rendered next to the live preview.
 * These are semantic commits, never raw style or arbitrary-property patches.
 */
export const AuthoringInlineControlOperation = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal('setDocumentTitle'),
        title: Type.String({ maxLength: AUTHORING_DOCUMENT_TITLE_MAX_LENGTH }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('setAppearance'),
        appearance: ExperienceAppearance,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('setPlacement'),
        blockId: Type.String({ minLength: 1, maxLength: 256 }),
        placement: Type.Union([
          Type.Literal('top'),
          Type.Literal('right'),
          Type.Literal('bottom'),
          Type.Literal('left'),
        ]),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('setAction'),
        blockId: Type.String({ minLength: 1, maxLength: 256 }),
        actionType: Type.Union([
          Type.Literal('next'),
          Type.Literal('back'),
          Type.Literal('complete'),
          Type.Literal('dismiss'),
          Type.Literal('clickTarget'),
        ]),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('openAdvanced'),
        stepId: Type.String({ minLength: 1, maxLength: 256 }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'AuthoringInlineControlOperation' },
);
export type AuthoringInlineControlOperation = Static<typeof AuthoringInlineControlOperation>;

export const AuthoringInlineControlCommitMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_INLINE_CONTROL_COMMIT_TYPE),
    operation: AuthoringInlineControlOperation,
  },
  { $id: 'AuthoringInlineControlCommitMessage', additionalProperties: false },
);
export type AuthoringInlineControlCommitMessage = Static<
  typeof AuthoringInlineControlCommitMessage
>;

/** Begin direct manipulation of presentation geometry inside a resolved target. */
export const PresentationAnchorPickStartMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('presentation.anchor.pick.start'),
    blockId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    targetId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    current: Type.Optional(Type.Ref(PresentationAnchor)),
  },
  { $id: 'PresentationAnchorPickStartMessage', additionalProperties: false },
);
export type PresentationAnchorPickStartMessage = Static<typeof PresentationAnchorPickStartMessage>;

/** Commit an exact point/region chosen for the request identified by correlation id. */
export const PresentationAnchorPickResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('presentation.anchor.pick.result'),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    blockId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    targetId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    presentationAnchor: Type.Ref(ExactPresentationAnchor),
  },
  { $id: 'PresentationAnchorPickResultMessage', additionalProperties: false },
);
export type PresentationAnchorPickResultMessage = Static<
  typeof PresentationAnchorPickResultMessage
>;

/** Cancel only the matching active request; stale completions are ignored by correlation id. */
export const PresentationAnchorPickCanceledMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('presentation.anchor.pick.canceled'),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    blockId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    targetId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
  },
  { $id: 'PresentationAnchorPickCanceledMessage', additionalProperties: false },
);
export type PresentationAnchorPickCanceledMessage = Static<
  typeof PresentationAnchorPickCanceledMessage
>;

/** Preview one selected step. The selected step is always explicit. */
export const AuthoringStepPreviewRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('authoring.preview.request'),
    mode: Type.Literal('step'),
    stepId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
  },
  { $id: 'AuthoringStepPreviewRequestMessage', additionalProperties: false },
);
export type AuthoringStepPreviewRequestMessage = Static<typeof AuthoringStepPreviewRequestMessage>;

/** Preview the full experience. A step id is deliberately forbidden. */
export const AuthoringFullPreviewRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('authoring.preview.request'),
    mode: Type.Literal('full'),
  },
  { $id: 'AuthoringFullPreviewRequestMessage', additionalProperties: false },
);
export type AuthoringFullPreviewRequestMessage = Static<typeof AuthoringFullPreviewRequestMessage>;

export const AuthoringInitMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('authoring.init'),
    workspaceId: Type.String(),
    environment: Type.Union([Type.Literal('development'), Type.Literal('staging')]),
    document: LodariqDocument,
    theme: Type.Optional(BrandThemeSnapshot),
    releaseStateCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE),
    ),
    stagingPublicationCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING),
    ),
    stagingVerificationCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING),
    ),
    productionApprovalCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION),
    ),
    productionPromotionCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION),
    ),
    productStyleSamplingCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE),
    ),
    brandDriftCheckCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE),
    ),
    brandThemeAcknowledgementCapability: Type.Optional(
      Type.Literal(AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT),
    ),
  },
  { $id: 'AuthoringInitMessage', additionalProperties: false },
);
export type AuthoringInitMessage = Static<typeof AuthoringInitMessage>;

export const AuthoringReleaseStateRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_RELEASE_STATE_REQUEST_TYPE),
  },
  { $id: 'AuthoringReleaseStateRequestMessage', additionalProperties: false },
);
export type AuthoringReleaseStateRequestMessage = Static<
  typeof AuthoringReleaseStateRequestMessage
>;

export const AuthoringReleaseStateResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_RELEASE_STATE_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        { ok: Type.Literal(true), releaseState: AuthoringStagingReleaseState },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ok: Type.Literal(false),
          code: Type.String({ minLength: 1, maxLength: 120 }),
          message: Type.String({ minLength: 1, maxLength: 512 }),
        },
        { additionalProperties: false },
      ),
    ]),
  },
  { $id: 'AuthoringReleaseStateResultMessage', additionalProperties: false },
);
export type AuthoringReleaseStateResultMessage = Static<typeof AuthoringReleaseStateResultMessage>;

export const AuthoringPublishStagingRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_PUBLISH_STAGING_REQUEST_TYPE),
    request: AuthoringStagingPublicationRequest,
  },
  { $id: 'AuthoringPublishStagingRequestMessage', additionalProperties: false },
);
export type AuthoringPublishStagingRequestMessage = Static<
  typeof AuthoringPublishStagingRequestMessage
>;

export const AuthoringPublishStagingResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_PUBLISH_STAGING_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: AuthoringStagingPublicationResult,
  },
  { $id: 'AuthoringPublishStagingResultMessage', additionalProperties: false },
);
export type AuthoringPublishStagingResultMessage = Static<
  typeof AuthoringPublishStagingResultMessage
>;

export const AuthoringBrowserVerifyRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_BROWSER_VERIFY_REQUEST_TYPE),
    publicationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    expectedContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { $id: 'AuthoringBrowserVerifyRequestMessage', additionalProperties: false },
);
export type AuthoringBrowserVerifyRequestMessage = Static<
  typeof AuthoringBrowserVerifyRequestMessage
>;

const AuthoringHostOperationFailure = Type.Object(
  {
    ok: Type.Literal(false),
    code: Type.String({ minLength: 1, maxLength: 120 }),
    message: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

export const AuthoringBrowserVerifyResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_BROWSER_VERIFY_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        { ok: Type.Literal(true), report: Type.Ref(BrowserVerificationReport) },
        { additionalProperties: false },
      ),
      AuthoringHostOperationFailure,
    ]),
  },
  { $id: 'AuthoringBrowserVerifyResultMessage', additionalProperties: false },
);
export type AuthoringBrowserVerifyResultMessage = Static<
  typeof AuthoringBrowserVerifyResultMessage
>;

/** Reads complete, server-vetted recovery truth for one exact target environment. */
export const AuthoringReleaseRecoveryStateRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE),
    environmentId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
  },
  { $id: 'AuthoringReleaseRecoveryStateRequestMessage', additionalProperties: false },
);
export type AuthoringReleaseRecoveryStateRequestMessage = Static<
  typeof AuthoringReleaseRecoveryStateRequestMessage
>;

export const AuthoringReleaseRecoveryStateResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        { ok: Type.Literal(true), state: ReleaseRecoveryStateResponse },
        { additionalProperties: false },
      ),
      AuthoringHostOperationFailure,
    ]),
  },
  { $id: 'AuthoringReleaseRecoveryStateResultMessage', additionalProperties: false },
);
export type AuthoringReleaseRecoveryStateResultMessage = Static<
  typeof AuthoringReleaseRecoveryStateResultMessage
>;

/** Mutates only one exact pointer using the canonical recovery CAS request. */
export const AuthoringReleaseRecoveryRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE),
    environmentId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    request: ReleaseRecoveryRequest,
  },
  { $id: 'AuthoringReleaseRecoveryRequestMessage', additionalProperties: false },
);
export type AuthoringReleaseRecoveryRequestMessage = Static<
  typeof AuthoringReleaseRecoveryRequestMessage
>;

export const AuthoringReleaseRecoveryResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_RELEASE_RECOVERY_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: ReleaseRecoveryResult,
  },
  { $id: 'AuthoringReleaseRecoveryResultMessage', additionalProperties: false },
);
export type AuthoringReleaseRecoveryResultMessage = Static<
  typeof AuthoringReleaseRecoveryResultMessage
>;

export const AuthoringSubmitVerificationRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE),
    request: Type.Ref(AuthoringStagingVerificationRequest),
  },
  { $id: 'AuthoringSubmitVerificationRequestMessage', additionalProperties: false },
);
export type AuthoringSubmitVerificationRequestMessage = Static<
  typeof AuthoringSubmitVerificationRequestMessage
>;

export const AuthoringSubmitVerificationResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Ref(AuthoringStagingVerificationResult),
  },
  { $id: 'AuthoringSubmitVerificationResultMessage', additionalProperties: false },
);
export type AuthoringSubmitVerificationResultMessage = Static<
  typeof AuthoringSubmitVerificationResultMessage
>;

export const AuthoringStyleSourceSaveRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE),
    proposal: Type.Ref(ProductStyleProposal),
  },
  { $id: 'AuthoringStyleSourceSaveRequestMessage', additionalProperties: false },
);
export type AuthoringStyleSourceSaveRequestMessage = Static<
  typeof AuthoringStyleSourceSaveRequestMessage
>;

export const AuthoringStyleSourceSaveResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        {
          ok: Type.Literal(true),
          sourceId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
          sourceHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
          productMatch: Type.Ref(AuthoringProductMatchApplyResult),
        },
        { additionalProperties: false },
      ),
      AuthoringHostOperationFailure,
    ]),
  },
  { $id: 'AuthoringStyleSourceSaveResultMessage', additionalProperties: false },
);
export type AuthoringStyleSourceSaveResultMessage = Static<
  typeof AuthoringStyleSourceSaveResultMessage
>;

export const AuthoringBrandDriftCheckRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_BRAND_DRIFT_CHECK_REQUEST_TYPE),
    request: Type.Ref(BrandDriftCheckRequest),
  },
  { $id: 'AuthoringBrandDriftCheckRequestMessage', additionalProperties: false },
);
export type AuthoringBrandDriftCheckRequestMessage = Static<
  typeof AuthoringBrandDriftCheckRequestMessage
>;

export const AuthoringBrandDriftCheckResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        {
          ok: Type.Literal(true),
          brandDrift: Type.Ref(AuthoringBrandDriftCheckResult),
        },
        { additionalProperties: false },
      ),
      AuthoringHostOperationFailure,
    ]),
  },
  { $id: 'AuthoringBrandDriftCheckResultMessage', additionalProperties: false },
);
export type AuthoringBrandDriftCheckResultMessage = Static<
  typeof AuthoringBrandDriftCheckResultMessage
>;

/** Selects one server-returned review snapshot; it never carries page or theme data itself. */
export const AuthoringBrandDriftPreviewMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_BRAND_DRIFT_PREVIEW_TYPE),
    mode: Type.Union([Type.Literal('current'), Type.Literal('proposed'), Type.Literal('restore')]),
  },
  { $id: 'AuthoringBrandDriftPreviewMessage', additionalProperties: false },
);
export type AuthoringBrandDriftPreviewMessage = Static<typeof AuthoringBrandDriftPreviewMessage>;

export const AuthoringBrandThemeAcknowledgeRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_BRAND_THEME_ACKNOWLEDGE_REQUEST_TYPE),
    request: Type.Ref(AuthoringBrandThemeAcknowledgementRequest),
  },
  { $id: 'AuthoringBrandThemeAcknowledgeRequestMessage', additionalProperties: false },
);
export type AuthoringBrandThemeAcknowledgeRequestMessage = Static<
  typeof AuthoringBrandThemeAcknowledgeRequestMessage
>;

export const AuthoringBrandThemeAcknowledgeResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        {
          ok: Type.Literal(true),
          acknowledgement: Type.Ref(AuthoringBrandThemeAcknowledgementResult),
        },
        { additionalProperties: false },
      ),
      AuthoringHostOperationFailure,
    ]),
  },
  { $id: 'AuthoringBrandThemeAcknowledgeResultMessage', additionalProperties: false },
);
export type AuthoringBrandThemeAcknowledgeResultMessage = Static<
  typeof AuthoringBrandThemeAcknowledgeResultMessage
>;

/**
 * One semantic, validated mutable-theme adoption. It carries no raw page data
 * and is accepted only by the already-bound authoring host session.
 */
export const AuthoringThemePreviewApplyMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_THEME_PREVIEW_APPLY_TYPE),
    draftRevision: Type.Integer({ minimum: 1 }),
    previewTheme: Type.Ref(BrandThemeSnapshot),
  },
  { $id: 'AuthoringThemePreviewApplyMessage', additionalProperties: false },
);
export type AuthoringThemePreviewApplyMessage = Static<typeof AuthoringThemePreviewApplyMessage>;

export const AuthoringPromoteProductionRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE),
    request: Type.Ref(ProductionPromotionRequest),
  },
  { $id: 'AuthoringPromoteProductionRequestMessage', additionalProperties: false },
);
export type AuthoringPromoteProductionRequestMessage = Static<
  typeof AuthoringPromoteProductionRequestMessage
>;

export const AuthoringPromoteProductionResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Ref(ProductionPromotionResult),
  },
  { $id: 'AuthoringPromoteProductionResultMessage', additionalProperties: false },
);
export type AuthoringPromoteProductionResultMessage = Static<
  typeof AuthoringPromoteProductionResultMessage
>;

export const AuthoringApproveProductionRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE),
    operationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  },
  { $id: 'AuthoringApproveProductionRequestMessage', additionalProperties: false },
);
export type AuthoringApproveProductionRequestMessage = Static<
  typeof AuthoringApproveProductionRequestMessage
>;

export const AuthoringApproveProductionResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        {
          ok: Type.Literal(true),
          approval: Type.Ref(ReleaseApproval),
          promotion: Type.Ref(ProductionPromotionResult),
        },
        { additionalProperties: false },
      ),
      AuthoringHostOperationFailure,
    ]),
  },
  { $id: 'AuthoringApproveProductionResultMessage', additionalProperties: false },
);
export type AuthoringApproveProductionResultMessage = Static<
  typeof AuthoringApproveProductionResultMessage
>;

const SelectedTargetStyleSampleRequest = Type.Object(
  {
    scope: Type.Literal('selected-target'),
    targetId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
  },
  { additionalProperties: false },
);

const PageStyleSampleRequest = Type.Object(
  { scope: Type.Literal('page') },
  { additionalProperties: false },
);

/** One acknowledged request, never a stream of pointer or computed-style data. */
export const StyleSampleStartMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(STYLE_SAMPLE_START_TYPE),
    request: Type.Union([SelectedTargetStyleSampleRequest, PageStyleSampleRequest]),
  },
  { $id: 'StyleSampleStartMessage', additionalProperties: false },
);
export type StyleSampleStartMessage = Static<typeof StyleSampleStartMessage>;

export const StyleSampleResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(STYLE_SAMPLE_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        {
          ok: Type.Literal(true),
          proposal: Type.Ref(ProductStyleProposal),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ok: Type.Literal(false),
          code: Type.Union([
            Type.Literal('not_authorized'),
            Type.Literal('no_selected_element'),
            Type.Literal('no_visible_samples'),
            Type.Literal('sampling_timeout'),
            Type.Literal('unsupported_document'),
            Type.Literal('internal_error'),
          ]),
          message: Type.String({ minLength: 1, maxLength: 512 }),
        },
        { additionalProperties: false },
      ),
    ]),
  },
  { $id: 'StyleSampleResultMessage', additionalProperties: false },
);
export type StyleSampleResultMessage = Static<typeof StyleSampleResultMessage>;

export const StyleSampleCanceledMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(STYLE_SAMPLE_CANCELED_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    reason: Type.Union([
      Type.Literal('creator_canceled'),
      Type.Literal('selection_changed'),
      Type.Literal('superseded'),
    ]),
  },
  { $id: 'StyleSampleCanceledMessage', additionalProperties: false },
);
export type StyleSampleCanceledMessage = Static<typeof StyleSampleCanceledMessage>;

/** Explicit customer token input exposed only inside an authenticated session. */
export const BrandTokensAvailableMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(BRAND_TOKENS_AVAILABLE_TYPE),
    registrations: Type.Array(Type.Ref(CustomerBrandTokenRegistration), {
      maxItems: 16,
    }),
  },
  { $id: 'BrandTokensAvailableMessage', additionalProperties: false },
);
export type BrandTokensAvailableMessage = Static<typeof BrandTokensAvailableMessage>;

/** Discriminated union of bridge message bodies (PRD §9.5). */
const ExistingBridgeMessage = Type.Intersect([
  BridgeEnvelope,
  Type.Union([
    Type.Object({
      type: Type.Literal('target.pick.start'),
      blockId: Type.String(),
      requiredAction: Type.Optional(TargetRequiredAction),
      fingerprint: Type.Optional(ElementFingerprint),
      identity: Type.Optional(Type.Ref(TargetIdentityV2)),
    }),
    Type.Object({
      type: Type.Literal('target.pick.result'),
      blockId: Type.String(),
      fingerprint: ElementFingerprint,
      identity: Type.Optional(Type.Ref(TargetIdentityV2)),
      captureCorrelationId: Type.Optional(Type.String()),
    }),
    Type.Object({
      type: Type.Literal('target.evidence.update'),
      blockId: Type.String(),
      fingerprint: ElementFingerprint,
      identity: Type.Ref(TargetIdentityV2),
      captureCorrelationId: Type.String(),
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
      identity: Type.Optional(Type.Ref(TargetIdentityV2)),
    }),
    Type.Object({
      type: Type.Literal('target.inspect.result'),
      /** Required from current hosts; optional only for legacy bridge readers. */
      requestCorrelationId: Type.Optional(Type.String()),
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
      type: Type.Literal('page.lifecycle.update'),
      route: Type.String(),
      scrollState: ScrollState,
      locale: Type.Optional(TargetLocale),
      viewportClass: Type.Optional(TargetViewportClass),
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
export const BridgeMessage = Type.Union(
  [
    AuthoringInlineContentCommitMessage,
    AuthoringInlineControlCommitMessage,
    AuthoringPanelModeOpenMessage,
    AuthoringPanelLayoutRequestMessage,
    AuthoringSaveAndExitRequestMessage,
    AuthoringSaveStateUpdateMessage,
    PresentationAnchorPickStartMessage,
    PresentationAnchorPickResultMessage,
    PresentationAnchorPickCanceledMessage,
    AuthoringStepPreviewRequestMessage,
    AuthoringFullPreviewRequestMessage,
    AuthoringInitMessage,
    AuthoringReleaseStateRequestMessage,
    AuthoringReleaseStateResultMessage,
    AuthoringReleaseRecoveryStateRequestMessage,
    AuthoringReleaseRecoveryStateResultMessage,
    AuthoringReleaseRecoveryRequestMessage,
    AuthoringReleaseRecoveryResultMessage,
    AuthoringPublishStagingRequestMessage,
    AuthoringPublishStagingResultMessage,
    AuthoringBrowserVerifyRequestMessage,
    AuthoringBrowserVerifyResultMessage,
    AuthoringSubmitVerificationRequestMessage,
    AuthoringSubmitVerificationResultMessage,
    AuthoringStyleSourceSaveRequestMessage,
    AuthoringStyleSourceSaveResultMessage,
    AuthoringBrandDriftCheckRequestMessage,
    AuthoringBrandDriftCheckResultMessage,
    AuthoringBrandDriftPreviewMessage,
    AuthoringBrandThemeAcknowledgeRequestMessage,
    AuthoringBrandThemeAcknowledgeResultMessage,
    AuthoringThemePreviewApplyMessage,
    AuthoringPromoteProductionRequestMessage,
    AuthoringPromoteProductionResultMessage,
    AuthoringApproveProductionRequestMessage,
    AuthoringApproveProductionResultMessage,
    StyleSampleStartMessage,
    StyleSampleResultMessage,
    StyleSampleCanceledMessage,
    BrandTokensAvailableMessage,
    ExistingBridgeMessage,
  ],
  { $id: 'BridgeMessage' },
);
export type BridgeMessage = Static<typeof BridgeMessage>;
