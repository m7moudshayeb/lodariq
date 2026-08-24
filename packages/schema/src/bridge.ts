import { Type, type Static, type TUnion } from '@sinclair/typebox';
import { AuthoringDeliveryCapabilityMetadata } from './authoring-capabilities';
import {
  BlockActionProps,
  BlockLayoutProps,
  ButtonStyleProps,
  ExactPresentationAnchor,
  ANCHOR_ALIGN_VALUES,
  ANCHOR_OFFSET_PX_LIMITS,
  InlineTextRun,
  LodariqBlock,
  PresentationAnchor,
  TextStyleProps,
  TooltipLayoutProps,
  TooltipStyleProps,
  TOOLTIP_HEIGHT_PX_LIMITS,
  TOOLTIP_WIDTH_PX_LIMITS,
} from './block';
import { LodariqDocument } from './document';
import { TargetApproach } from './approach';
import { StepEmphasis } from './emphasis';
import { StepTransitionCondition } from './flow';
import { AdaptiveDecisionContext } from './measurement';
import { ContentLocale } from './document-localization';
import { AuthoringCollaborationStepLock, AuthoringPresencePeer } from './experience-measurement';
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
  TargetLocalizedEvidence,
  TargetRequiredAction,
  TargetSelectionPolicy,
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
import { LocaleLayoutQaReport } from './authoring-roadmap';

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
export const AUTHORING_CHROME_ACTION_REQUEST_TYPE = 'authoring.chrome-action.request' as const;
export const AUTHORING_SHELL_PRESENTATION_TYPE = 'authoring.shell.presentation' as const;
export const AUTHORING_SHELL_STEP_COMMAND_TYPE = 'authoring.shell.step-command' as const;
export const AUTHORING_SHELL_POPUP_SIZE_COMMIT_TYPE = 'authoring.shell.popup-size.commit' as const;
export const AUTHORING_SHELL_SELECTION_TYPE = 'authoring.shell.selection' as const;
/**
 * A menu inside the frame is open. The host's own chrome always paints above the
 * frame, so without this a dropdown opens underneath the card's resize handles.
 */
export const AUTHORING_SHELL_MENU_STATE_TYPE = 'authoring.shell.menu-state' as const;
export const AUTHORING_SHELL_CAPABILITIES_TYPE = 'authoring.shell.capabilities' as const;
export const AUTHORING_SHELL_PALETTE_OPEN_TYPE = 'authoring.shell.palette-open' as const;
/** A transient notice the frame wants shown over the page, not inside itself. */
export const AUTHORING_SHELL_NOTICE_TYPE = 'authoring.shell.notice' as const;
export const AUTHORING_COLLABORATION_STATE_TYPE = 'authoring.collaboration.state' as const;
/**
 * Operations, as one RPC pair rather than a message per method.
 *
 * The frame never holds a credential, so every Operations call is made by the
 * host and the frame only asks. A uniform pair keeps that boundary in one place
 * instead of spreading twenty-eight message shapes across it.
 */
export const AUTHORING_OPERATIONS_REQUEST_TYPE = 'authoring.operations.request' as const;
export const AUTHORING_OPERATIONS_RESULT_TYPE = 'authoring.operations.result' as const;
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
export const AUTHORING_LOCALE_LAYOUT_QA_REQUEST_TYPE =
  'authoring.locale-layout-qa.request' as const;
export const AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE = 'authoring.locale-layout-qa.result' as const;
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

/** A creator gesture in trusted top-level authoring chrome, forwarded to the iframe owner. */
export const AuthoringChromeActionRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_CHROME_ACTION_REQUEST_TYPE),
    action: Type.Union([
      Type.Literal('preview-full'),
      Type.Literal('open-appearance'),
      Type.Literal('open-release'),
      Type.Literal('open-operations'),
      Type.Literal('close-operations'),
      Type.Literal('save-and-exit'),
      /** §5 — re-author the document as a different kind of experience. */
      Type.Literal('switch-experience'),
      Type.Literal('toggle-recording'),
      Type.Literal('canvas-zoom-in'),
      Type.Literal('canvas-zoom-out'),
      Type.Literal('canvas-zoom-reset'),
      Type.Literal('restart'),
      /** §7.5's palette. The frame anchors the ask to a step before it runs. */
      Type.Literal('ask-lodariq'),
    ]),
    /** Operations section to land on, when the caller asked for one by name. */
    tab: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    /** The creator's own words for `ask-lodariq`, verbatim from the palette. */
    prompt: Type.Optional(Type.String({ minLength: 1, maxLength: 400 })),
    /** Experience type for `switch-experience`. Validated by the frame's registry. */
    experienceType: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { $id: 'AuthoringChromeActionRequestMessage', additionalProperties: false },
);
export type AuthoringChromeActionRequestMessage = Static<
  typeof AuthoringChromeActionRequestMessage
>;

export const AuthoringShellPresentation = Type.Union([
  Type.Literal('overlay'),
  Type.Literal('collapsed'),
  Type.Literal('picking'),
  Type.Literal('operations'),
  Type.Literal('previewing'),
]);
export type AuthoringShellPresentation = Static<typeof AuthoringShellPresentation>;

/** Host and iframe share which in-product shell surface is visible. */
export const AuthoringShellPresentationMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_PRESENTATION_TYPE),
    presentation: AuthoringShellPresentation,
  },
  { $id: 'AuthoringShellPresentationMessage', additionalProperties: false },
);
export type AuthoringShellPresentationMessage = Static<typeof AuthoringShellPresentationMessage>;

export const AuthoringShellStepCommand = Type.Union([
  Type.Literal('add'),
  Type.Literal('select'),
  Type.Literal('collapse'),
  Type.Literal('retarget'),
  /** The on-page ring was clicked: show §4.3's Target kind for this step. */
  Type.Literal('select-target'),
  Type.Literal('move-up'),
  Type.Literal('move-down'),
  /** Removal belongs where insertion is — the filmstrip is Tier 1 for both (§4.5). */
  Type.Literal('remove'),
  /** The lock band's `Duplicate instead`: your own copy of a held step (§15.2). */
  Type.Literal('duplicate'),
  /**
   * Insert before `stepId`, from the ⊕ between two chips (§4.5). Carried as a
   * neighbour rather than an index: an index would be read against a document
   * the host does not own, and a stale one would insert in the wrong place.
   */
  Type.Literal('insert-before'),
  /** Filmstrip multi-select: the prerequisite for `Apply to…` and batch ops (§4.5). */
  Type.Literal('select-add'),
  Type.Literal('select-range'),
]);
export type AuthoringShellStepCommand = Static<typeof AuthoringShellStepCommand>;

export const AuthoringShellStepCommandMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_STEP_COMMAND_TYPE),
    command: AuthoringShellStepCommand,
    stepId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  },
  { $id: 'AuthoringShellStepCommandMessage', additionalProperties: false },
);
export type AuthoringShellStepCommandMessage = Static<typeof AuthoringShellStepCommandMessage>;

/**
 * The frame's batch selection, so the on-page filmstrip can mark it (§4.5).
 * Step ids only: no content and no coordinates cross the bridge for this.
 */
export const AuthoringShellSelectionMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_SELECTION_TYPE),
    stepIds: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 500 }),
  },
  { $id: 'AuthoringShellSelectionMessage', additionalProperties: false },
);
export type AuthoringShellSelectionMessage = Static<typeof AuthoringShellSelectionMessage>;

/** Whether a menu is open inside the frame. No content, only the fact. */
export const AuthoringShellMenuStateMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_MENU_STATE_TYPE),
    open: Type.Boolean(),
  },
  { $id: 'AuthoringShellMenuStateMessage', additionalProperties: false },
);
export type AuthoringShellMenuStateMessage = Static<typeof AuthoringShellMenuStateMessage>;

/**
 * What this session can actually do, so host chrome can disable a control rather
 * than offer it and fail. An assist provider is supplied per session, not per
 * build, and only the frame holds it.
 */
export const AuthoringShellCapabilitiesMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_CAPABILITIES_TYPE),
    assist: Type.Boolean(),
    /* Optional so a frame built before these fields still validates here. */
    recording: Type.Optional(Type.Boolean()),
    /** True only while a surface that honours a canvas zoom is on screen. */
    canvasZoomable: Type.Optional(Type.Boolean()),
  },
  { $id: 'AuthoringShellCapabilitiesMessage', additionalProperties: false },
);
export type AuthoringShellCapabilitiesMessage = Static<typeof AuthoringShellCapabilitiesMessage>;

/**
 * The creator pressed the palette chord inside the frame (§7.5).
 *
 * ⌘K has to mean one thing wherever the focus happens to be, and the palette is
 * host chrome. A key pressed in the frame never reaches the host document, so the
 * frame forwards the chord rather than answering it with a second surface.
 */
export const AuthoringShellPaletteOpenMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_PALETTE_OPEN_TYPE),
  },
  { $id: 'AuthoringShellPaletteOpenMessage', additionalProperties: false },
);
export type AuthoringShellPaletteOpenMessage = Static<typeof AuthoringShellPaletteOpenMessage>;

/**
 * Creator-facing text only. It is shown verbatim, so it must already be
 * localized and must never carry customer content.
 */
export const AuthoringShellNoticeMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_NOTICE_TYPE),
    message: Type.String({ minLength: 1, maxLength: 240 }),
    kind: Type.Optional(
      Type.Union([
        Type.Literal('neutral'),
        Type.Literal('positive'),
        Type.Literal('warning'),
        Type.Literal('danger'),
      ]),
    ),
  },
  { $id: 'AuthoringShellNoticeMessage', additionalProperties: false },
);
export type AuthoringShellNoticeMessage = Static<typeof AuthoringShellNoticeMessage>;

export const AUTHORING_OPERATIONS_METHODS = [
  'readMeasurement',
  'updateMeasurement',
  'readAnalytics',
  'listSessions',
  'readExperiment',
  'createExperiment',
  'updateExperiment',
  'listComments',
  'addComment',
  'replyToComment',
  'resolveComment',
  'listStepLocks',
  'claimStepLock',
  'releaseStepLock',
  'heartbeatCollaboration',
  'leaveCollaboration',
  'listApplications',
  'readCommercialUsage',
  'instantiateTemplate',
  'listDocumentVersions',
  'compareDocumentVersions',
  'listCopySuggestions',
  'createCopySuggestions',
  'decideCopySuggestion',
  'requestAiAssist',
  'generateNarration',
  'listAuditEvents',
  'exportAuditCsv',
  'readDemoLinks',
  'readDemoAnalytics',
  'reviewDemoArtifact',
  'createDemoLink',
  'revokeDemoLink',
] as const;
export type AuthoringOperationsMethod = (typeof AUTHORING_OPERATIONS_METHODS)[number];

export const AuthoringOperationsRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_OPERATIONS_REQUEST_TYPE),
    requestId: Type.String({ minLength: 1, maxLength: 128 }),
    method: Type.Union(AUTHORING_OPERATIONS_METHODS.map((name) => Type.Literal(name))),
    /** Method arguments, validated by the host against the route's own contract. */
    args: Type.Optional(Type.Array(Type.Unknown(), { maxItems: 4 })),
  },
  { $id: 'AuthoringOperationsRequestMessage', additionalProperties: false },
);
export type AuthoringOperationsRequestMessage = Static<typeof AuthoringOperationsRequestMessage>;

export const AuthoringOperationsResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_OPERATIONS_RESULT_TYPE),
    requestId: Type.String({ minLength: 1, maxLength: 128 }),
    result: Type.Optional(Type.Unknown()),
    /** Creator-facing reason. Present only when the call failed. */
    error: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
  },
  { $id: 'AuthoringOperationsResultMessage', additionalProperties: false },
);
export type AuthoringOperationsResultMessage = Static<typeof AuthoringOperationsResultMessage>;

/** Semantic collaboration state forwarded from the credential-owning iframe. */
export const AuthoringCollaborationStateMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_COLLABORATION_STATE_TYPE),
    selfParticipantId: Type.String({ pattern: '^presence_[a-f0-9]{24}$' }),
    peers: Type.Array(Type.Ref(AuthoringPresencePeer), { maxItems: 100 }),
    locks: Type.Array(Type.Ref(AuthoringCollaborationStepLock), { maxItems: 200 }),
    draftChanged: Type.Boolean(),
  },
  { $id: 'AuthoringCollaborationStateMessage', additionalProperties: false },
);
export type AuthoringCollaborationStateMessage = Static<typeof AuthoringCollaborationStateMessage>;

export const AuthoringShellPopupSizeCommitMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_SHELL_POPUP_SIZE_COMMIT_TYPE),
    blockId: Type.String({ minLength: 1, maxLength: 256 }),
    /**
     * Each axis is present only when the dragged edge drives it: an east edge
     * authors a width and says nothing about the height. Sending both meant a
     * width drag also stamped a height, which the minimum then rounded up — the
     * card grew taller for a gesture that was purely horizontal.
     */
    widthPx: Type.Optional(
      Type.Integer({
        minimum: TOOLTIP_WIDTH_PX_LIMITS.min,
        maximum: TOOLTIP_WIDTH_PX_LIMITS.max,
        multipleOf: TOOLTIP_WIDTH_PX_LIMITS.step,
      }),
    ),
    heightPx: Type.Optional(
      Type.Integer({
        minimum: TOOLTIP_HEIGHT_PX_LIMITS.min,
        maximum: TOOLTIP_HEIGHT_PX_LIMITS.max,
        multipleOf: TOOLTIP_HEIGHT_PX_LIMITS.step,
      }),
    ),
  },
  { $id: 'AuthoringShellPopupSizeCommitMessage', additionalProperties: false },
);
export type AuthoringShellPopupSizeCommitMessage = Static<
  typeof AuthoringShellPopupSizeCommitMessage
>;

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
    Type.Object(
      {
        op: Type.Literal('replaceStepRichContent'),
        stepBlockId: Type.String(),
        blocks: Type.Array(LodariqBlock),
      },
      { additionalProperties: false },
    ),
    Type.Object({ op: Type.Literal('updateContent'), content: Type.String() }),
    Type.Object(
      {
        op: Type.Literal('updateContentRuns'),
        content: Type.String(),
        contentRuns: Type.Optional(Type.Array(Type.Ref(InlineTextRun))),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        op: Type.Literal('setTextStyle'),
        textStyle: Type.Optional(Type.Ref(TextStyleProps)),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        op: Type.Literal('setBlockLayout'),
        blockLayout: Type.Optional(Type.Ref(BlockLayoutProps)),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        op: Type.Literal('setButtonStyle'),
        buttonStyle: Type.Optional(Type.Ref(ButtonStyleProps)),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        op: Type.Literal('setTooltipLayout'),
        tooltipLayout: Type.Optional(Type.Ref(TooltipLayoutProps)),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        op: Type.Literal('setTooltipStyle'),
        tooltipStyle: Type.Optional(Type.Ref(TooltipStyleProps)),
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
        Type.Literal('callout'),
        Type.Literal('stat'),
        Type.Literal('icon'),
        Type.Literal('formField'),
      ]),
    }),
    Type.Object({
      op: Type.Literal('setAction'),
      action: Type.Optional(BlockActionProps),
    }),
    Type.Object(
      {
        op: Type.Literal('setVariant'),
        variant: Type.Union([
          Type.Literal('primary'),
          Type.Literal('secondary'),
          Type.Literal('subtle'),
          Type.Literal('outline'),
          Type.Literal('link'),
        ]),
      },
      { additionalProperties: false },
    ),
    Type.Object({
      op: Type.Literal('setTeaches'),
      /** Absent means the step teaches nothing measurable. */
      eventName: Type.Optional(
        Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9_]*$' }),
      ),
    }),
    Type.Object({
      op: Type.Literal('setEmphasis'),
      /** Absent clears every emphasis on the step. */
      emphasis: Type.Optional(Type.Ref(StepEmphasis)),
    }),
    Type.Object({
      op: Type.Literal('setShowWhen'),
      /** Absent clears the rule, so the block shows unconditionally again. */
      showWhen: Type.Optional(Type.Ref(StepTransitionCondition)),
    }),
    Type.Object({
      op: Type.Literal('setPlacement'),
      placement: Type.Union([
        Type.Literal('top'),
        Type.Literal('right'),
        Type.Literal('bottom'),
        Type.Literal('left'),
      ]),
      /**
       * Position along that side, and the gap to the target.
       *
       * These used to travel only on the host-side commit the compass sends, so
       * a creator dragging a dot saw the card move and a creator setting the
       * same two values from a menu did not — the document changed and the live
       * card stayed put. Absent still means "leave what is already there".
       */
      align: Type.Optional(Type.Union(ANCHOR_ALIGN_VALUES.map((value) => Type.Literal(value)))),
      offsetPx: Type.Optional(
        Type.Integer({
          minimum: ANCHOR_OFFSET_PX_LIMITS.min,
          maximum: ANCHOR_OFFSET_PX_LIMITS.max,
        }),
      ),
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
      /** The look-alike answer, or the mirror rebuilds the target without one. */
      selection: Type.Optional(Type.Ref(TargetSelectionPolicy)),
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
    Type.Object({
      op: Type.Literal('setTargetApproach'),
      targetId: Type.String(),
      approach: Type.Optional(Type.Ref(TargetApproach)),
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

export const AuthoringTransactionScope = Type.Union(
  [
    Type.Literal('appearance'),
    Type.Literal('content'),
    Type.Literal('structure'),
    Type.Literal('target'),
    Type.Literal('behavior'),
  ],
  { $id: 'AuthoringTransactionScope' },
);
export type AuthoringTransactionScope = Static<typeof AuthoringTransactionScope>;

/** Additive transaction V2 metadata accepted alongside legacy preview patches. */
export const PreviewTransactionMetadata = Type.Object(
  {
    transactionId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    baseRevision: Type.Integer({ minimum: 0 }),
    revision: Type.Integer({ minimum: 1 }),
    scope: Type.Ref(AuthoringTransactionScope),
    coalescingKey: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
  },
  { $id: 'PreviewTransactionMetadata', additionalProperties: false },
);
export type PreviewTransactionMetadata = Static<typeof PreviewTransactionMetadata>;

export const PREVIEW_TRANSACTION_RESULT_STATES = [
  'applied',
  'persisted',
  'retrying',
  'conflict',
] as const;

export const PreviewTransactionResultState = Type.Union(
  PREVIEW_TRANSACTION_RESULT_STATES.map((state) => Type.Literal(state)),
  { $id: 'PreviewTransactionResultState' },
);
export type PreviewTransactionResultState = Static<typeof PreviewTransactionResultState>;

export const AUTHORING_DIAGNOSTIC_EVENT_NAMES = [
  'authoring.opened',
  'block.inserted',
  'transaction.committed',
  'transaction.coalesced',
  'transaction.retried',
  'transaction.conflicted',
  'transaction.persisted',
  'target.pick.started',
  'target.pick.succeeded',
  'target.pick.failed',
  'target.pick.canceled',
  'target.unavailable',
  'target.context-restored',
  'target.verification-passed',
  'target.repair-opened',
  'preview.opened',
  'preview.from-step',
  'preview.step-changed',
  'preview.branch-chosen',
  'preview.completed',
  'preview.exited',
  'choreography.stage-started',
  'choreography.stage-satisfied',
  'choreography.stage-timed-out',
  'choreography.retried',
  'choreography.skipped',
  'choreography.completed',
  'chrome.moved',
  'chrome.collapsed',
  'chrome.restored',
  'chrome.collision-unresolved',
  'style.copied',
  'style.applied',
  'style.recipe-used',
  'style.recipe-updated',
  'copy-suggestion.applied',
  'template.instantiated',
  'record-to-author.applied',
  'voice-proposal.applied',
  'locale-layout-qa.completed',
  'locale-layout-qa.failed',
  'contrast.warning',
  'contrast.blocker',
  'readiness.finding',
  'readiness.repair-opened',
  'readiness.repair-completed',
  'checkpoint.saved',
  'checkpoint.restored',
  'document.exported',
  'document.imported',
  'experience.type.changed',
  'recording.started',
  'recording.stopped',
] as const;

export const AuthoringDiagnosticEventName = Type.Union(
  AUTHORING_DIAGNOSTIC_EVENT_NAMES.map((name) => Type.Literal(name)),
  { $id: 'AuthoringDiagnosticEventName' },
);
export type AuthoringDiagnosticEventName = Static<typeof AuthoringDiagnosticEventName>;

/** Closed diagnostic dimensions that cannot carry customer or authored content. */
export const AuthoringDiagnosticAttributes = Type.Object(
  {
    environment: Type.Optional(
      Type.Union([
        Type.Literal('development'),
        Type.Literal('staging'),
        Type.Literal('production'),
      ]),
    ),
    stepId: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
    blockId: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
    targetId: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
    transactionId: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
    scope: Type.Optional(Type.Ref(AuthoringTransactionScope)),
    revision: Type.Optional(Type.Integer({ minimum: 0, maximum: 2_147_483_647 })),
    durationMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 3_600_000 })),
    count: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000 })),
    state: Type.Optional(Type.String({ minLength: 1, maxLength: 80, pattern: '^[a-z0-9._-]+$' })),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 80, pattern: '^[a-z0-9._-]+$' })),
  },
  { $id: 'AuthoringDiagnosticAttributes', additionalProperties: false },
);
export type AuthoringDiagnosticAttributes = Static<typeof AuthoringDiagnosticAttributes>;

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
    /** Copy read off a clean win in a language the target has none for. */
    learnedLocalizedEvidence: Type.Optional(TargetLocalizedEvidence),
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
        /** Position along that side, set by the compass dot the creator chose. */
        align: Type.Optional(Type.Union(ANCHOR_ALIGN_VALUES.map((value) => Type.Literal(value)))),
        /** Gap between target and card, set by dragging the dot outward. */
        offsetPx: Type.Optional(
          Type.Integer({
            minimum: ANCHOR_OFFSET_PX_LIMITS.min,
            maximum: ANCHOR_OFFSET_PX_LIMITS.max,
          }),
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('setAction'),
        blockId: Type.String({ minLength: 1, maxLength: 256 }),
        actionType: Type.Union([
          Type.Literal(''),
          Type.Literal('next'),
          Type.Literal('back'),
          Type.Literal('complete'),
          Type.Literal('dismiss'),
          Type.Literal('clickTarget'),
          Type.Literal('openPage'),
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
    locale: Type.Optional(Type.Ref(ContentLocale)),
    stepId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
  },
  { $id: 'AuthoringStepPreviewRequestMessage', additionalProperties: false },
);
export type AuthoringStepPreviewRequestMessage = Static<typeof AuthoringStepPreviewRequestMessage>;

/** Replays one target recipe without advancing the authored experience. */
export const AuthoringApproachPreviewRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('authoring.preview.request'),
    mode: Type.Literal('approach'),
    locale: Type.Optional(Type.Ref(ContentLocale)),
    stepId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
  },
  { $id: 'AuthoringApproachPreviewRequestMessage', additionalProperties: false },
);
export type AuthoringApproachPreviewRequestMessage = Static<
  typeof AuthoringApproachPreviewRequestMessage
>;

export const AuthoringAccessibilityPreviewMode = Type.Union(
  [
    Type.Literal('keyboard'),
    Type.Literal('screenReader'),
    Type.Literal('reducedMotion'),
    Type.Literal('zoom200'),
    Type.Literal('rtl'),
    Type.Literal('compactReflow'),
  ],
  { $id: 'AuthoringAccessibilityPreviewMode' },
);
export type AuthoringAccessibilityPreviewMode = Static<typeof AuthoringAccessibilityPreviewMode>;

const AuthoringFlowSimulationValue = Type.Union([
  Type.String({ maxLength: 160 }),
  Type.Number({ minimum: -1_000_000, maximum: 1_000_000 }),
  Type.Boolean(),
]);

const AuthoringFlowSimulationValues = Type.Record(
  Type.String({ pattern: '^[A-Za-z][A-Za-z0-9._:-]{0,79}$' }),
  AuthoringFlowSimulationValue,
  { maxProperties: 20, additionalProperties: false },
);

/** Explicit, bounded authoring-only inputs for deterministic branch simulation. */
export const AuthoringFlowSimulationContext = Type.Object(
  {
    identifyTraits: Type.Optional(AuthoringFlowSimulationValues),
    documentState: Type.Optional(AuthoringFlowSimulationValues),
    adaptive: Type.Optional(Type.Ref(AdaptiveDecisionContext)),
  },
  { $id: 'AuthoringFlowSimulationContext', additionalProperties: false, minProperties: 1 },
);
export type AuthoringFlowSimulationContext = Static<typeof AuthoringFlowSimulationContext>;

/** Preview the full experience, optionally beginning from an explicit step. */
export const AuthoringFullPreviewRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('authoring.preview.request'),
    mode: Type.Literal('full'),
    locale: Type.Optional(Type.Ref(ContentLocale)),
    initialStepId: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
    accessibilityMode: Type.Optional(Type.Ref(AuthoringAccessibilityPreviewMode)),
    simulationContext: Type.Optional(Type.Ref(AuthoringFlowSimulationContext)),
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
    prefersDark: Type.Optional(Type.Boolean()),
    prefersReducedMotion: Type.Optional(Type.Boolean()),
    deliveryCapabilities: Type.Optional(Type.Ref(AuthoringDeliveryCapabilityMetadata)),
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

export const AuthoringLocaleLayoutQaRequestMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_LOCALE_LAYOUT_QA_REQUEST_TYPE),
    expectedDocumentRevision: Type.Integer({ minimum: 0 }),
  },
  { $id: 'AuthoringLocaleLayoutQaRequestMessage', additionalProperties: false },
);
export type AuthoringLocaleLayoutQaRequestMessage = Static<
  typeof AuthoringLocaleLayoutQaRequestMessage
>;

export const AuthoringLocaleLayoutQaResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal(AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE),
    requestCorrelationId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    result: Type.Union([
      Type.Object(
        { ok: Type.Literal(true), report: Type.Ref(LocaleLayoutQaReport) },
        { additionalProperties: false },
      ),
      AuthoringHostOperationFailure,
    ]),
  },
  { $id: 'AuthoringLocaleLayoutQaResultMessage', additionalProperties: false },
);
export type AuthoringLocaleLayoutQaResultMessage = Static<
  typeof AuthoringLocaleLayoutQaResultMessage
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

export const PreviewTransactionResultMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('preview.transaction.result'),
    transactionId: Type.String(BRIDGE_REFERENCE_ID_OPTIONS),
    revision: Type.Integer({ minimum: 1 }),
    state: Type.Ref(PreviewTransactionResultState),
    authoritativeRevision: Type.Optional(Type.Integer({ minimum: 0 })),
    authoritativeDocument: Type.Optional(Type.Ref(LodariqDocument)),
  },
  { $id: 'PreviewTransactionResultMessage', additionalProperties: false },
);
export type PreviewTransactionResultMessage = Static<typeof PreviewTransactionResultMessage>;

export const AuthoringDiagnosticRecordMessage = Type.Object(
  {
    ...BridgeEnvelope.properties,
    type: Type.Literal('authoring.diagnostic.record'),
    name: Type.Ref(AuthoringDiagnosticEventName),
    attributes: Type.Optional(Type.Ref(AuthoringDiagnosticAttributes)),
  },
  { $id: 'AuthoringDiagnosticRecordMessage', additionalProperties: false },
);
export type AuthoringDiagnosticRecordMessage = Static<typeof AuthoringDiagnosticRecordMessage>;

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
      /** Author's answer to the disambiguation question, when one was asked. */
      selection: Type.Optional(Type.Ref(TargetSelectionPolicy)),
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
      locale: Type.Optional(Type.Ref(ContentLocale)),
      transaction: Type.Optional(Type.Ref(PreviewTransactionMetadata)),
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
      routePatternId: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
      stateId: Type.Optional(Type.String(BRIDGE_REFERENCE_ID_OPTIONS)),
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
      appliedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
  ]),
]);
type BridgeMessageSchema =
  | typeof AuthoringApproachPreviewRequestMessage
  | typeof AuthoringInlineContentCommitMessage
  | typeof AuthoringInlineControlCommitMessage
  | typeof AuthoringPanelModeOpenMessage
  | typeof AuthoringChromeActionRequestMessage
  | typeof AuthoringShellPresentationMessage
  | typeof AuthoringShellStepCommandMessage
  | typeof AuthoringShellPopupSizeCommitMessage
  | typeof AuthoringShellSelectionMessage
  | typeof AuthoringShellMenuStateMessage
  | typeof AuthoringShellCapabilitiesMessage
  | typeof AuthoringShellPaletteOpenMessage
  | typeof AuthoringShellNoticeMessage
  | typeof AuthoringOperationsRequestMessage
  | typeof AuthoringOperationsResultMessage
  | typeof AuthoringCollaborationStateMessage
  | typeof AuthoringPanelLayoutRequestMessage
  | typeof AuthoringSaveAndExitRequestMessage
  | typeof AuthoringSaveStateUpdateMessage
  | typeof PresentationAnchorPickStartMessage
  | typeof PresentationAnchorPickResultMessage
  | typeof PresentationAnchorPickCanceledMessage
  | typeof AuthoringStepPreviewRequestMessage
  | typeof AuthoringFullPreviewRequestMessage
  | typeof AuthoringInitMessage
  | typeof AuthoringReleaseStateRequestMessage
  | typeof AuthoringReleaseStateResultMessage
  | typeof AuthoringReleaseRecoveryStateRequestMessage
  | typeof AuthoringReleaseRecoveryStateResultMessage
  | typeof AuthoringReleaseRecoveryRequestMessage
  | typeof AuthoringReleaseRecoveryResultMessage
  | typeof AuthoringPublishStagingRequestMessage
  | typeof AuthoringPublishStagingResultMessage
  | typeof AuthoringBrowserVerifyRequestMessage
  | typeof AuthoringBrowserVerifyResultMessage
  | typeof AuthoringLocaleLayoutQaRequestMessage
  | typeof AuthoringLocaleLayoutQaResultMessage
  | typeof AuthoringSubmitVerificationRequestMessage
  | typeof AuthoringSubmitVerificationResultMessage
  | typeof AuthoringStyleSourceSaveRequestMessage
  | typeof AuthoringStyleSourceSaveResultMessage
  | typeof AuthoringBrandDriftCheckRequestMessage
  | typeof AuthoringBrandDriftCheckResultMessage
  | typeof AuthoringBrandDriftPreviewMessage
  | typeof AuthoringBrandThemeAcknowledgeRequestMessage
  | typeof AuthoringBrandThemeAcknowledgeResultMessage
  | typeof AuthoringThemePreviewApplyMessage
  | typeof AuthoringPromoteProductionRequestMessage
  | typeof AuthoringPromoteProductionResultMessage
  | typeof AuthoringApproveProductionRequestMessage
  | typeof AuthoringApproveProductionResultMessage
  | typeof StyleSampleStartMessage
  | typeof StyleSampleResultMessage
  | typeof StyleSampleCanceledMessage
  | typeof BrandTokensAvailableMessage
  | typeof PreviewTransactionResultMessage
  | typeof AuthoringDiagnosticRecordMessage
  | typeof ExistingBridgeMessage;

const BRIDGE_MESSAGE_SCHEMAS: BridgeMessageSchema[] = [
  AuthoringApproachPreviewRequestMessage,
  AuthoringInlineContentCommitMessage,
  AuthoringInlineControlCommitMessage,
  AuthoringPanelModeOpenMessage,
  AuthoringChromeActionRequestMessage,
  AuthoringShellPresentationMessage,
  AuthoringShellStepCommandMessage,
  AuthoringShellPopupSizeCommitMessage,
  AuthoringShellSelectionMessage,
  AuthoringShellMenuStateMessage,
  AuthoringShellCapabilitiesMessage,
  AuthoringShellPaletteOpenMessage,
  AuthoringShellNoticeMessage,
  AuthoringOperationsRequestMessage,
  AuthoringOperationsResultMessage,
  AuthoringCollaborationStateMessage,
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
  AuthoringLocaleLayoutQaRequestMessage,
  AuthoringLocaleLayoutQaResultMessage,
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
  PreviewTransactionResultMessage,
  AuthoringDiagnosticRecordMessage,
  ExistingBridgeMessage,
];

export const BridgeMessage: TUnion<BridgeMessageSchema[]> = Type.Union(BRIDGE_MESSAGE_SCHEMAS, {
  $id: 'BridgeMessage',
});
export type BridgeMessage = Static<typeof BridgeMessage>;
