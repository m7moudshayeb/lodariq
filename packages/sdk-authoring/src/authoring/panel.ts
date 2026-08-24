import {
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
  AUTHORING_CHROME_ACTION_REQUEST_TYPE,
  AUTHORING_OPERATIONS_REQUEST_TYPE,
  AUTHORING_OPERATIONS_RESULT_TYPE,
  AUTHORING_SHELL_PRESENTATION_TYPE,
  AUTHORING_SHELL_MENU_STATE_TYPE,
  AUTHORING_SHELL_CAPABILITIES_TYPE,
  AUTHORING_SHELL_PALETTE_OPEN_TYPE,
  AUTHORING_SHELL_NOTICE_TYPE,
  AUTHORING_COLLABORATION_STATE_TYPE,
  AUTHORING_SHELL_SELECTION_TYPE,
  AUTHORING_SHELL_STEP_COMMAND_TYPE,
  AUTHORING_SHELL_POPUP_SIZE_COMMIT_TYPE,
  AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
  AUTHORING_SAVE_STATE_UPDATE_TYPE,
  AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE,
  AUTHORING_BROWSER_VERIFY_REQUEST_TYPE,
  AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
  AUTHORING_LOCALE_LAYOUT_QA_REQUEST_TYPE,
  AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
  AUTHORING_BRAND_DRIFT_CHECK_REQUEST_TYPE,
  AUTHORING_BRAND_DRIFT_PREVIEW_TYPE,
  AUTHORING_BRAND_THEME_ACKNOWLEDGE_REQUEST_TYPE,
  AUTHORING_PUBLISH_STAGING_REQUEST_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE,
  AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE,
  AUTHORING_RELEASE_STATE_REQUEST_TYPE,
  AUTHORING_RELEASE_STATE_RESULT_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE,
  AUTHORING_THEME_PREVIEW_APPLY_TYPE,
  AUTHORING_SESSION_CAPABILITIES,
  HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
  HOSTED_CREATOR_PANEL_STATE_EVENT,
  HOSTED_CREATOR_PANEL_TOGGLE_EVENT,
  STYLE_SAMPLE_START_TYPE,
  HostedAuthoringSessionCloseRequestMessage,
  HostedAuthoringSessionCloseResultMessage,
  isPresentationAnchor,
  LODARIQ_EDITOR_ORIGIN,
  validate,
  EXPERIENCE_STEP_LOCK_TTL_SECONDS,
  type AuthoringInlineControlOperation,
  type AuthoringShellStepCommand,
  type AuthoringAccessibilityPreviewMode,
  type AdaptiveDecisionContext,
  type AuthoringFlowSimulationContext,
  type AuthoringSaveState,
  type AuthoringDiagnosticAttributes,
  type AuthoringDiagnosticEventName,
  CURRENT_AUTHORING_DELIVERY_CAPABILITY_METADATA,
  type AuthoringProductMatchApplyResult,
  type AuthoringBrandDriftCheckResult,
  type AuthoringBrandThemeAcknowledgementRequest,
  type AuthoringBrandThemeAcknowledgementResult,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingReleaseState,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type BrandThemeSnapshot,
  type BrandDriftCheckRequest,
  type BridgeMessage,
  type CompiledDocument,
  type NewCompiledDocument,
  type ElementFingerprint,
  type PreviewPatchOperation,
  type PreviewTransactionMetadata,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
  type TargetIdentityV2,
  type HostedAuthoringSessionCloseMode,
  type HostedCreatorPanelState,
  type AnchorAlign,
} from '@lodariq/schema';
import type { AdaptiveStepDecision } from '@lodariq/schema/adaptive-runtime';
import { applyAuthoringLocale, authoringText, currentAuthoringLocale } from '../i18n';
import { AUTHORING_LOCALE_QUERY_PARAMETER } from '@lodariq/schema/authoring-entry-runtime';
import type { ResolutionResult } from '@lodariq/sdk-runtime/resolver';
import type { AuthoringOperationsServices } from './operations/operations-services';
import type {
  ChoreographyRecoveryUpdate,
  ChoreographyStageUpdate,
  ProtectedSurfaceRect,
} from '@lodariq/sdk-runtime/renderers/tour';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import type { InlinePreviewEditor } from './inline-preview-editor';
import {
  AuthoringBridge,
  BRIDGE_PROTOCOL_VERSION,
  RELEASE_RECOVERY_BRIDGE_MESSAGE_BYTE_LIMITS,
  createBridgeCorrelationId,
} from '../bridge/transport';
import type { TargetPicker } from '../bridge/target-picker';
import type { PresentationAnchorPicker } from '../bridge/presentation-anchor-picker';
import { startProductStylePicker, type ProductStylePicker } from '../bridge/product-style-picker';
import { runPublicationBrowserVerification } from '../bridge/publication-verifier';
import { createInlinePreviewEditor } from './inline-preview-editor';
import { createPanelStyles } from './panel-styles';
import { clearTargetReveal, inspectTarget, startPageLifecycleObserver } from './page-context';
import { applyPreviewPatch, inlinePreviewControlContext } from './preview-document';
import { createOverlayShell } from './overlay/shell';
import {
  goToPreviewPage,
  stepPageDestination,
  PreviewPageUnreachableError,
} from './preview-page-navigation';
import { clearDraftPreviewResume, writeDraftPreviewResume } from './preview-resume';
import { publishTargetRingState } from './overlay/target-ring';
import { stepEditability, type PresenceState } from './presence/presence-model';
import type { OverlayShell } from './overlay/types';
import { tooltipOfStep, tourStepsOf } from './overlay/filmstrip';
import type { OverlayPlacement } from './canvas/edge-resize';
import {
  AUTHORING_AUTOSAVE_DEBOUNCE_MS,
  AUTHORING_AUTOSAVE_MAX_RETRIES,
  AUTHORING_AUTOSAVE_RETRY_MS,
  AUTHORING_ENVIRONMENT_LABELS,
  AUTHORING_PANEL_LABELS,
  AUTHORING_SELECTABLE_ENVIRONMENTS,
  AUTHORING_SAVE_REQUEST_TIMEOUT_MS,
  HOSTED_SESSION_CLOSE_TIMEOUT_MS,
  PILL_SAVE_STATE_BY_SAVE_STATE,
  type AuthoringPanelRestoreState,
} from './panel-config';
import {
  activePanelFocusElement,
  restorePanelAfterTargetPicking,
  schedulePanelFocusRestore,
  setAuthoringPanelOpenState,
  setAuthoringTriggerPanelState,
  setPanelTargetPicking,
} from './panel-geometry';
import { domRectAsProtectedSurface } from './protected-surface-registry';
import { listExperienceDefinitions } from './experiences/definition';
// The registry is populated by the frame, but the pill lives on the host and
// needs the same list to print the Experience type group. Registration is
// idempotent, so asking here costs nothing and never diverges from the frame.
import { registerBuiltInExperiences } from './experiences/built-in';
import { EXPERIENCE_TYPE_LABELS } from './overlay/mode-pill-copy';
import { CREATOR_ENABLED_EXPERIENCE_TYPES } from '../creator-experience-types';
import { LOCAL_AUTHORING_PANEL_TOGGLE_EVENT } from './constants';
import { findContainingTourStepId, resolvePreviewStepId } from './preview-step-state';
import {
  AUTHORING_FRAME_MENU_OPEN_ATTRIBUTE,
  AUTHORING_PANEL_MINIMIZED_ATTRIBUTE,
  AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE,
  AUTHORING_TARGET_PICKING_ATTRIBUTE,
} from './panel-attributes';

/**
 * Authoring shell (PRD §9.4).
 *
 * Loaded ONLY for authenticated creators entering authoring mode. Owns the
 * live overlay editor iframe, filmstrip, pulses, and operations modal.
 * served from a dedicated Lodariq origin (editor.lodariq.io, PRD §12.5).
 *
 * Ownership split (PRD §9.5):
 * - iframe: Lexical editor state, drafts, auth, selection, validation/review UI.
 * - host bridge: DOM inspection, target picking, page-state, overlay preview.
 * - server: persistence, compilation, publication, long-running jobs.
 *
 * React + Lexical are intentionally available in this package because it is
 * never shipped to production viewers (PRD §6.2, §9.1, §20).
 */
export interface AuthoringSession {
  sessionId: string;
  documentId: string;
  workspaceId: string;
  environment: 'development' | 'staging';
}

export interface LocalAuthoringPanelOptions {
  iframeSrc: string;
  initialDocument?: LodariqDocument;
  initialTheme?: BrandThemeSnapshot;
  /** Reads the host application's current opaque state at target-pick time. */
  getTargetStateId?: () => string | undefined;
  /** Reads a customer-configured opaque route pattern identifier. */
  getTargetRoutePatternId?: () => string | undefined;
  autoPreview?: boolean;
  /** Step a restored session was previewing, so a reload does not land on step 1. */
  initialPreviewStepId?: string;
  initialPreviewInteractive?: boolean;
  preview?: LocalAuthoringPreviewServices;
  release?: LocalAuthoringReleaseServices;
  /**
   * The Operations boundary (§4.7). The host owns the API origin and both
   * credentials; the frame asks over the bridge and receives normalized data.
   * Absent in local preview, which makes the measurement, experiment and
   * collaboration sections read-only rather than half-working.
   */
  operations?: AuthoringOperationsServices;
  /**
   * Optional local-development presence source. Hosted sessions receive the
   * same semantic state through the authoring bridge after authenticated
   * heartbeat/SSE setup. Absent means single-player until that stream starts.
   */
  presence?: LocalAuthoringPresenceServices;
  onSave?: (document: LodariqDocument) => Promise<void> | void;
}

export interface LocalAuthoringPresenceServices {
  /** Pushes a fresh snapshot whenever it changes; returns an unsubscribe. */
  subscribe: (onChange: (presence: PresenceState | null) => void) => () => void;
}

/**
 * Product Match save result exposed to both bridge-v1 receipt consumers and
 * consumers of the complete persisted Product Match draft.
 */
export type AuthoringStyleSourceSaveResult = AuthoringProductMatchApplyResult & {
  sourceId: string;
  sourceHash: string;
};

export interface LocalAuthoringReleaseServices {
  releaseStateCapability: typeof AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE;
  getReleaseState: () => Promise<AuthoringStagingReleaseState>;
  releaseRecoveryStateCapability?: typeof AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE;
  getReleaseRecoveryState?: (environmentId: string) => Promise<ReleaseRecoveryStateResponse>;
  rollbackReleaseCapability?: typeof AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE;
  unpublishReleaseCapability?: typeof AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE;
  recoverRelease?: (
    environmentId: string,
    request: ReleaseRecoveryRequest,
  ) => Promise<ReleaseRecoveryResult>;
  stagingPublicationCapability?: typeof AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING;
  publishToStaging?: (
    request: AuthoringStagingPublicationRequest,
  ) => Promise<AuthoringStagingPublicationResult>;
  productStyleSamplingCapability?: typeof AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE;
  saveStyleSource?: (proposal: ProductStyleProposal) => Promise<AuthoringStyleSourceSaveResult>;
  brandDriftCheckCapability?: typeof AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE;
  checkBrandDrift?: (request: BrandDriftCheckRequest) => Promise<AuthoringBrandDriftCheckResult>;
  brandThemeAcknowledgementCapability?: typeof AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT;
  acknowledgeBrandTheme?: (
    request: AuthoringBrandThemeAcknowledgementRequest,
  ) => Promise<AuthoringBrandThemeAcknowledgementResult>;
  stagingVerificationCapability?: typeof AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING;
  submitStagingVerification?: (
    request: AuthoringStagingVerificationRequest,
  ) => Promise<AuthoringStagingVerificationResult>;
  productionPromotionCapability?: typeof AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION;
  promoteProduction?: (request: ProductionPromotionRequest) => Promise<ProductionPromotionResult>;
  productionApprovalCapability?: typeof AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION;
  approveProduction?: (
    operationId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) => Promise<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }>;
}

/**
 * Adopts the editor iframe that already completed the hosted pre-session
 * handshake. The iframe remains the persistence and credential owner; the
 * customer-page host receives only the canonical document and scoped context.
 */
export interface HostedAuthoringPanelOptions {
  iframe: HTMLIFrameElement;
  initialDocument: LodariqDocument;
  /** Optional for existing hosted callers; Brand preview actions fail closed without it. */
  initialTheme?: BrandThemeSnapshot;
  /** Reads the host application's current opaque state at target-pick time. */
  getTargetStateId?: () => string | undefined;
  /** Reads a customer-configured opaque route pattern identifier. */
  getTargetRoutePatternId?: () => string | undefined;
  autoPreview?: boolean;
  preview?: LocalAuthoringPreviewServices;
  onClose?: () => void;
}

export interface LocalAuthoringPreviewOptions {
  /** Exact owner used to mark and isolate this panel's creator preview. */
  ownerId: string;
  /** Full-tour preview mode enables the experience's real step controls. */
  interactive?: boolean;
  locale?: string;
  stepId?: string;
  accessibilityMode?: AuthoringAccessibilityPreviewMode;
  flowConditionContext?: {
    identifyTraits?: Readonly<Record<string, string | number | boolean>>;
    documentState?: Readonly<Record<string, string | number | boolean>>;
  };
  adaptiveContext?: AdaptiveDecisionContext;
  /** Exact live selection for immediate creator preview; never persisted. */
  authoringTargetOverride?: { stepId: string; element: Element };
  /**
   * Synchronous, before the renderer leaves for the step. The click that
   * advances a step may also be a real navigation that unloads the page, so
   * anything that must survive the reload (the preview resume record) has to
   * be written here — `onStepChange` may never fire.
   */
  onBeforeStepChange?: (index: number, stepId: string) => void;
  onStepChange?: (index: number, stepId: string) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  onSkip?: () => void;
  onChoreographyStageChange?: (stepId: string, update: ChoreographyStageUpdate) => void;
  onChoreographyRecovery?: (stepId: string, update: ChoreographyRecoveryUpdate) => void;
  onBranchChoice?: (stepId: string, ruleIndex: number | null, destination: string) => void;
  onAdaptiveSkip?: (stepId: string, decision: AdaptiveStepDecision) => void;
  getAuthoringProtectedSurfaces?: () => readonly ProtectedSurfaceRect[];
  onAuthoringSurfaceChange?: (rect: ProtectedSurfaceRect | null) => void;
}

export interface LocalAuthoringPreviewServices {
  loadDocument: (documentId: string) => LodariqDocument | null;
  compilePreview: (
    doc: LodariqDocument,
    themeOverride?: BrandThemeSnapshot,
  ) => Promise<CompiledDocument>;
  /** Loads the active immutable staging artifact and verifies its expected hash. */
  loadExactPublishedArtifact?: (expectedContentHash: string) => Promise<NewCompiledDocument>;
  playPreview: (doc: CompiledDocument, options: LocalAuthoringPreviewOptions) => Promise<void>;
  stopPreview?: (ownerId: string) => void;
  onPreviewError?: (error: unknown) => void;
}

export interface LocalAuthoringPanel {
  close: () => void;
  destroy: () => void;
  isMinimized: () => boolean;
  minimize: () => void;
  restore: () => void;
  saveAndClose: () => Promise<void>;
}

let activePanel: LocalAuthoringPanel | null = null;
let activePanelHost: HTMLElement | null = null;
let activePanelSessionKey: string | null = null;
const HOSTED_AUTHORING_IFRAME_PATH = '/authoring.html';
interface PendingIframeSaveRequest {
  reject: (error: Error) => void;
  resolve: (document: LodariqDocument | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingHostedSessionClose {
  reject: (error: Error) => void;
  requestId: string;
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface AuthoringPanelOpenOptions extends LocalAuthoringPanelOptions {
  adoptedIframe?: HTMLIFrameElement;
  onClose?: () => void;
  persistenceOwner: 'host' | 'iframe';
}

function withPanelFrameParams(iframeSrc: string): string {
  const parentOrigin = window.location.origin;

  try {
    const url = new URL(iframeSrc, window.location.href);
    url.searchParams.set('lodariqFrame', 'panel');
    url.searchParams.set(AUTHORING_LOCALE_QUERY_PARAMETER, currentAuthoringLocale());
    if (
      parentOrigin &&
      parentOrigin !== 'null' &&
      url.origin !== parentOrigin &&
      ['http:', 'https:'].includes(url.protocol)
    ) {
      url.searchParams.set('parentOrigin', parentOrigin);
    }
    return url.toString();
  } catch {
    return iframeSrc;
  }
}

function requireAdoptableHostedIframe(iframe: HTMLIFrameElement): void {
  let url: URL;
  try {
    url = new URL(iframe.src);
  } catch {
    throw new Error('Lodariq hosted editor iframe is invalid');
  }
  const sandboxTokens = new Set(iframe.getAttribute('sandbox')?.split(/\s+/u).filter(Boolean));
  if (
    iframe.ownerDocument !== document ||
    !iframe.isConnected ||
    !iframe.contentWindow ||
    url.origin !== LODARIQ_EDITOR_ORIGIN ||
    url.pathname !== HOSTED_AUTHORING_IFRAME_PATH ||
    url.username !== '' ||
    url.password !== '' ||
    !hasExpectedHostedLocale(url) ||
    url.hash !== '' ||
    iframe.referrerPolicy !== 'origin' ||
    sandboxTokens.size !== 2 ||
    !sandboxTokens.has('allow-scripts') ||
    !sandboxTokens.has('allow-same-origin')
  ) {
    throw new Error('Lodariq hosted editor iframe is invalid');
  }
}

function hasExpectedHostedLocale(url: URL): boolean {
  const entries = [...url.searchParams.entries()];
  return (
    entries.length === 1 &&
    entries[0]?.[0] === AUTHORING_LOCALE_QUERY_PARAMETER &&
    entries[0]?.[1] === currentAuthoringLocale()
  );
}

export function openLocalAuthoringPanel(
  session: AuthoringSession,
  options: LocalAuthoringPanelOptions,
): LocalAuthoringPanel {
  return openAuthoringPanel(session, { ...options, persistenceOwner: 'host' });
}

export function adoptHostedAuthoringPanel(
  session: AuthoringSession,
  options: HostedAuthoringPanelOptions,
): LocalAuthoringPanel {
  requireAdoptableHostedIframe(options.iframe);
  return openAuthoringPanel(session, {
    adoptedIframe: options.iframe,
    autoPreview: options.autoPreview,
    iframeSrc: options.iframe.src,
    getTargetStateId: options.getTargetStateId,
    getTargetRoutePatternId: options.getTargetRoutePatternId,
    initialDocument: options.initialDocument,
    initialTheme: options.initialTheme,
    onClose: options.onClose,
    persistenceOwner: 'iframe',
    preview: options.preview,
  });
}

function openAuthoringPanel(
  session: AuthoringSession,
  options: AuthoringPanelOpenOptions,
): LocalAuthoringPanel {
  const sessionKey = authoringSessionKey(session);
  const currentPanel = activePanel;
  if (currentPanel) {
    if (!activePanelHost?.isConnected) {
      currentPanel.destroy();
    } else if (activePanelSessionKey !== sessionKey) {
      throw new Error(
        authoringText(
          'Another Lodariq draft is already open. Save and exit before opening a different experience.',
        ),
      );
    } else {
      currentPanel.restore();
      return currentPanel;
    }
  }

  const host = document.createElement('lodariq-authoring-panel');
  applyAuthoringLocale(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const iframeSrc = options.adoptedIframe
    ? options.adoptedIframe.src
    : withPanelFrameParams(options.iframeSrc);
  const iframeOrigin = new URL(iframeSrc, window.location.href).origin;
  const preview = options.preview;
  const releaseServices = options.onSave ? options.release : undefined;
  const publishToStaging =
    releaseServices?.stagingPublicationCapability === AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING
      ? releaseServices.publishToStaging
      : undefined;
  const getReleaseRecoveryState =
    releaseServices?.releaseRecoveryStateCapability ===
    AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE
      ? releaseServices.getReleaseRecoveryState
      : undefined;
  const recoverRelease = releaseServices?.recoverRelease;
  const canRollbackRelease = Boolean(
    recoverRelease &&
    releaseServices?.rollbackReleaseCapability === AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
  );
  const canUnpublishRelease = Boolean(
    recoverRelease &&
    releaseServices?.unpublishReleaseCapability ===
      AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
  );
  const saveStyleSource =
    releaseServices?.productStyleSamplingCapability ===
    AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE
      ? releaseServices.saveStyleSource
      : undefined;
  const checkBrandDrift =
    releaseServices?.brandDriftCheckCapability ===
    AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE
      ? releaseServices.checkBrandDrift
      : undefined;
  const acknowledgeBrandTheme =
    releaseServices?.brandThemeAcknowledgementCapability ===
    AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT
      ? releaseServices.acknowledgeBrandTheme
      : undefined;
  const submitStagingVerification =
    releaseServices?.stagingVerificationCapability === AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING
      ? releaseServices.submitStagingVerification
      : undefined;
  const promoteProduction =
    releaseServices?.productionPromotionCapability ===
    AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION
      ? releaseServices.promoteProduction
      : undefined;
  const approveProduction =
    releaseServices?.productionApprovalCapability ===
    AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION
      ? releaseServices.approveProduction
      : undefined;
  const previewOwnerId = createBridgeCorrelationId('authoring_preview_owner');
  let previewDocument =
    (options.initialDocument ? structuredClone(options.initialDocument) : null) ??
    preview?.loadDocument(session.documentId) ??
    null;
  let previewTheme = options.initialTheme ? structuredClone(options.initialTheme) : undefined;
  let previewThemeRevision = 0;
  let previewRequestId = 0;
  let latestPreviewTransactionRevision = 0;
  let latestPreviewTransactionId: string | null = null;
  let previewPending = false;
  let previewPresented = false;
  /*
   * The replay a burst of edits collapses into.
   *
   * `playPreview` has one shape: stop the mounted player and build a new one,
   * which recompiles the document, re-resolves the step's target against the
   * page and re-mounts the card. Every patch asked for that, so dragging a
   * padding slider tore the preview down and rebuilt it around eleven times a
   * second — the flicker, and the bulk of an edit's main-thread cost, which the
   * profile puts in the resolver's element scan.
   *
   * Leading edge, then a floor between replays: the first move of a drag is
   * answered immediately, so nothing feels delayed, and the rest arrive at a
   * rate a creator can actually read. A superseded request is dropped rather
   * than queued — the document already holds every change, so the last request
   * describes all of them.
   *
   * Discrete edits are further apart than the floor, so a pill or a menu still
   * replays on the spot.
   */
  const PREVIEW_REPLAY_FLOOR_MS = 220;
  let queuedPreviewReplay: PreviewPlaybackRequest | null = null;
  let queuedPreviewReplayTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPreviewReplayAt = 0;
  let previewContentLocale = previewDocument?.localization?.defaultLocale ?? 'en';
  let suspendedPreview: { stepId?: string } | null = null;
  const authoringTargetOverrides = new Map<string, Element>();
  let picker: TargetPicker | null = null;
  let productStylePicker: ProductStylePicker | null = null;
  let pendingTargetPickCorrelationId: string | null = null;
  let presentationAnchorPicker: PresentationAnchorPicker | null = null;
  let pendingPresentationAnchorPick: {
    blockId: string;
    targetId: string;
    requestCorrelationId: string;
  } | null = null;
  let bridge: AuthoringBridge | null = null;
  const hostOptionalPanelServices = import('./host-optional-panel-services').then(
    ({ createAuthoringHostOptionalPanelServices }) =>
      createAuthoringHostOptionalPanelServices({
        session,
        getActiveBridge: () => bridge,
        getReleaseRecoveryState,
        recoverRelease,
        canRollbackRelease,
        canUnpublishRelease,
        checkBrandDrift,
        acknowledgeBrandTheme,
        brandDriftRuntimePreview: {
          readPreviewTheme: () => (previewTheme ? structuredClone(previewTheme) : undefined),
          playPreviewTheme: async (theme) => {
            previewTheme = theme ? structuredClone(theme) : undefined;
            await playPreviewDocument({
              stepId: pendingInlinePreviewStepId(),
              rejectOnFailure: true,
            });
          },
        },
        adoptDocument: (document) => {
          previewDocument = document;
        },
        publishToStaging,
        saveStyleSource,
        submitStagingVerification,
        promoteProduction,
        approveProduction,
        documentRoot: document,
        resolveProductStyleElement,
      }),
  );
  void hostOptionalPanelServices.catch(() => undefined);
  let inlinePreviewEditor: InlinePreviewEditor | null = null;
  let pendingInlineFocusBlockId: string | null = null;
  let stopLifecycleObserver: (() => void) | null = null;
  let stopPanelChrome: (() => void) | null = null;
  let overlayShell: OverlayShell | null = null;
  let stopPresence: (() => void) | null = null;
  let currentPresence: PresenceState | null = null;
  let collaborationConflictNotified = false;
  let minimizedRestoreState: AuthoringPanelRestoreState | null = null;
  let targetPickingRestoreState: AuthoringPanelRestoreState | null = null;
  let presentationAnchorRestoreState: AuthoringPanelRestoreState | null = null;
  let pendingSaveBeforeClose: {
    requestCorrelationId: string;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let pendingAutoSave: {
    document: LodariqDocument;
    generation: number;
    transaction?: PreviewTransactionMetadata;
  } | null = null;
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let targetEvidenceUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTargetEvidenceUpdate: {
    blockId: string;
    captureCorrelationId: string;
    fingerprint: ElementFingerprint;
    identity: TargetIdentityV2;
  } | null = null;
  let autoSaveRetryCount = 0;
  let autoSaveGeneration = 0;
  let persistedAutoSaveGeneration = 0;
  let autoSaveSequence: Promise<void> = Promise.resolve();
  let closeDrainPromise: Promise<void> | null = null;
  let iframeOwnedClosePromise: Promise<void> | null = null;
  let iframeOwnedDiscardPromise: Promise<void> | null = null;
  let pendingHostedSessionClose: PendingHostedSessionClose | null = null;
  let closeNotified = false;
  let currentSaveState: AuthoringSaveState = 'saved';
  let currentSaveStateLabel: string = AUTHORING_PANEL_LABELS.draftSaved;
  let currentHeaderStepId = tourStepsOf(previewDocument)[0]?.id ?? null;
  let previewPathStepIds: string[] = [];
  const pendingIframeSaveRequests = new Map<string, PendingIframeSaveRequest>();

  shadow.appendChild(
    createPanelStyles({
      defaultHeight: 800,
      defaultWidth: 1120,
      headerHeight: 64,
    }),
  );
  const panelElement = document.createElement('section');
  panelElement.className = 'overlay-root';
  panelElement.dataset['overlayRoot'] = 'true';
  panelElement.setAttribute('aria-label', authoringText('Lodariq authoring'));
  panelElement.innerHTML = `<slot name="authoring-frame"></slot>`;
  shadow.appendChild(panelElement);

  const iframe = options.adoptedIframe ?? document.createElement('iframe');
  iframe.slot = 'authoring-frame';
  iframe.title = authoringText('Lodariq authoring');
  if (!options.adoptedIframe) {
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.setAttribute('src', iframeSrc);
  }
  host.appendChild(iframe);

  overlayShell = createOverlayShell(host, shadow, iframe, {
    onAddStep: () => sendShellStepCommand('add'),
    onInsertStepBefore: (stepId) => sendShellStepCommand('insert-before', stepId),
    onDeleteStep: (stepId) => sendShellStepCommand('remove', stepId),
    onDuplicateStep: (stepId) => sendShellStepCommand('duplicate', stepId),
    onClose: () => close(),
    onExitPreview: () => leaveInteractivePreview(),
    onMoveStep: (stepId, direction) =>
      sendShellStepCommand(direction === 'up' ? 'move-up' : 'move-down', stepId),
    onCloseOperations: () => closeOperations(),
    onOpenOperations: (tab?: string) => openOperations(tab),
    onPlacementCommit: (blockId, placement, align) =>
      commitOverlayPlacement(blockId, placement, align),
    onAnchorOffsetCommit: (blockId, offsetPx) =>
      commitOverlayPlacement(blockId, undefined, undefined, offsetPx),
    onPopupSizeCommit: (widthPx, heightPx) => commitOverlayPopupSize(widthPx, heightPx),
    onRetarget: () => sendShellStepCommand('retarget', currentHeaderStepId ?? undefined),
    onSelectTarget: () => sendShellStepCommand('select-target', currentHeaderStepId ?? undefined),
    onTargetStateChange: (state) =>
      publishTargetRingState(host.ownerDocument, previewOwnerId, state),
    onSelectStep: (stepId) => selectOverlayStep(stepId),
    onSelectStepAdditive: (stepId, mode) =>
      sendShellStepCommand(mode === 'range' ? 'select-range' : 'select-add', stepId),
    onBrowsingChange: (browsing) =>
      recordAuthoringDiagnostic(browsing ? 'chrome.collapsed' : 'chrome.restored'),
    onStartPreview: () => startOverlayPreview(),
    onEditPreviewStep: () => editPreviewingStep(),
    onPreviewStep: (direction) => stepPreview(direction),
    onToggleAllPanels: (hidden) =>
      recordAuthoringDiagnostic(hidden ? 'chrome.collapsed' : 'chrome.restored'),
    onRetrySave: () => void flushAutoSave().catch(() => {}),
    onAskLodariq: (prompt) => sendChromeAction('ask-lodariq', { prompt }),
    onSwitchExperience: (experienceType) => {
      // The host asked for the change, so the pill shows it immediately; the
      // frame's next document refresh is still the authority and will correct
      // this if the type turns out to be unavailable.
      overlayShell?.setPillState({ experienceType });
      sendChromeAction('switch-experience', { experienceType });
    },
    onEnvironmentChange: (environment) => setAuthoringEnvironment(environment),
    onToggleRecording: () => sendChromeAction('toggle-recording'),
    onCanvasZoom: (direction) =>
      sendChromeAction(
        direction === 'in'
          ? 'canvas-zoom-in'
          : direction === 'out'
            ? 'canvas-zoom-out'
            : 'canvas-zoom-reset',
      ),
    onRestart: () => sendChromeAction('restart'),
  });
  stopPresence =
    options.presence?.subscribe((next) => {
      currentPresence = next;
      overlayShell?.setPresence(next);
    }) ?? null;
  overlayShell.setDocument(previewDocument);
  overlayShell.setActiveStepId(currentHeaderStepId);
  registerBuiltInExperiences();
  overlayShell.setPillState({
    environment: AUTHORING_ENVIRONMENT_LABELS[session.environment],
    experienceType: previewDocument?.type ?? 'tour',
    // Printed from the registry rather than a hardcoded list, so a build that
    // registers a type gets the row and a build that does not never offers it.
    // The registry knows more types than the product ships; the creator catalog
    // is the shipped set, so the menu and the launcher always agree.
    experienceTypes: listExperienceDefinitions()
      .filter((definition) =>
        CREATOR_ENABLED_EXPERIENCE_TYPES.some((entry) => entry.id === definition.type),
      )
      .map((definition) => ({
        type: definition.type,
        label: EXPERIENCE_TYPE_LABELS[definition.type] ?? definition.type,
      })),
    environments: AUTHORING_SELECTABLE_ENVIRONMENTS,
  });
  overlayShell.setPresentation('overlay');
  /**
   * The panel says what it is, once, on the surface it just took over. Nothing
   * else on the page explains that the product is now editable, and a creator who
   * has to guess that will not find the inspector or Operations at all.
   */
  host.ownerDocument.defaultView?.setTimeout(() => {
    overlayShell?.notify(
      authoringText(
        'Lodariq is open on your product. Drag what you can see, open the inspector for what you selected, open Operations for the whole thing.',
      ),
      {
        durationMs: COACH_TIP_MS,
        action: { label: authoringText('Show me'), onSelect: () => openOperations() },
      },
    );
  }, COACH_TIP_DELAY_MS);
  const syncPanelStepStatus = (): void => {
    const steps = tourStepsOf(previewDocument);
    if (!steps.length) return;
    const currentIndex = steps.findIndex((step) => step.id === currentHeaderStepId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    currentHeaderStepId = steps[safeIndex]?.id ?? null;
    overlayShell?.setActiveStepId(currentHeaderStepId);
  };
  syncPanelStepStatus();

  const destroyPanel = (): void => {
    if (pendingSaveBeforeClose) {
      clearTimeout(pendingSaveBeforeClose.timer);
      pendingSaveBeforeClose.resolve();
      pendingSaveBeforeClose = null;
    }
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (targetEvidenceUpdateTimer) {
      clearTimeout(targetEvidenceUpdateTimer);
      targetEvidenceUpdateTimer = null;
    }
    for (const pending of pendingIframeSaveRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Lodariq hosted draft save was canceled'));
    }
    pendingIframeSaveRequests.clear();
    if (pendingHostedSessionClose) {
      clearTimeout(pendingHostedSessionClose.timer);
      pendingHostedSessionClose.reject(new Error('Lodariq hosted session close was canceled'));
      pendingHostedSessionClose = null;
    }
    pendingTargetEvidenceUpdate = null;
    pendingTargetPickCorrelationId = null;
    authoringTargetOverrides.clear();
    picker?.cancel();
    picker = null;
    productStylePicker?.cancel();
    productStylePicker = null;
    pendingPresentationAnchorPick = null;
    presentationAnchorPicker?.cancel();
    presentationAnchorPicker = null;
    stopPresence?.();
    stopPresence = null;
    currentPresence = null;
    overlayShell?.destroy();
    overlayShell = null;
    stopPanelChrome?.();
    stopPanelChrome = null;
    stopLifecycleObserver?.();
    stopLifecycleObserver = null;
    inlinePreviewEditor?.destroy();
    inlinePreviewEditor = null;
    iframe.removeEventListener('load', connectIframe);
    window.removeEventListener('message', receiveHostedSessionLifecycle);
    bridge?.stop();
    bridge = null;
    preview?.stopPreview?.(previewOwnerId);
    clearTargetReveal();
    host.remove();
    setAuthoringPanelOpenState(false);
    if (options.persistenceOwner === 'iframe') dispatchHostedCreatorPanelState('closed');
    if (activePanel === panel) {
      activePanel = null;
      activePanelHost = null;
      activePanelSessionKey = null;
    }
    if (!closeNotified) {
      closeNotified = true;
      options.onClose?.();
    }
  };

  const close = (): void => {
    if (options.persistenceOwner !== 'iframe') {
      destroyPanel();
      return;
    }
    void discardAndCloseIframeOwned().catch(() => {});
  };

  const saveAndClose = (): Promise<void> => {
    if (options.persistenceOwner === 'iframe') return saveAndCloseIframeOwned();
    if (!bridge || !host.isConnected) {
      destroyPanel();
      return Promise.resolve();
    }
    if (pendingSaveBeforeClose) {
      if (pendingAutoSave && !autoSaveTimer && !closeDrainPromise) {
        autoSaveRetryCount = 0;
        void persistBeforeClose(null);
      }
      return new Promise((resolve) => {
        const previousResolve = pendingSaveBeforeClose?.resolve;
        if (pendingSaveBeforeClose) {
          pendingSaveBeforeClose.resolve = () => {
            previousResolve?.();
            resolve();
          };
        }
      });
    }

    const requestCorrelationId = createBridgeCorrelationId('authoring_save_request');
    return new Promise((resolve) => {
      pendingSaveBeforeClose = {
        requestCorrelationId,
        resolve,
        timer: setTimeout(() => {
          if (pendingSaveBeforeClose?.requestCorrelationId !== requestCorrelationId) return;
          void persistBeforeClose(previewDocument);
        }, 2_000),
      };
      try {
        bridge?.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: requestCorrelationId,
          type: 'authoring.save.request',
        });
      } catch {
        void persistBeforeClose(previewDocument);
      }
    });
  };

  const captureRestoreState = (): AuthoringPanelRestoreState => ({
    focusedElement: activePanelFocusElement(shadow),
    geometry: { height: 0, left: 0, top: 0, width: 0 },
  });

  const minimize = (): void => {
    if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) return;
    if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) return;
    minimizedRestoreState = captureRestoreState();
    host.setAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE, 'true');
    overlayShell?.setPresentation('collapsed');
    setAuthoringTriggerPanelState('minimized');
    if (options.persistenceOwner === 'iframe') dispatchHostedCreatorPanelState('minimized');
    recordAuthoringDiagnostic('chrome.collapsed');
  };

  /** `replayPreview: false` when the caller selects a step itself — that replays. */
  const restore = (restoreOptions: { replayPreview?: boolean } = {}): void => {
    if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) {
      if (pendingPresentationAnchorPick) {
        cancelActivePresentationAnchorPick();
      } else if (pendingTargetPickCorrelationId) {
        cancelActiveTargetPick();
      } else {
        restorePanelAfterTargetPicking(
          host,
          presentationAnchorRestoreState ?? targetPickingRestoreState,
        );
        presentationAnchorRestoreState = null;
        targetPickingRestoreState = null;
      }
    }
    if (!host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) {
      setAuthoringTriggerPanelState('open');
      return;
    }

    const restoreState = minimizedRestoreState;
    host.removeAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE);
    host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
    overlayShell?.setPresentation('overlay');
    if (restoreState) schedulePanelFocusRestore(restoreState.focusedElement, null);
    minimizedRestoreState = null;
    setAuthoringTriggerPanelState('open');
    if (options.persistenceOwner === 'iframe') dispatchHostedCreatorPanelState('open');
    recordAuthoringDiagnostic('chrome.restored');
    if (preview && previewDocument && restoreOptions.replayPreview !== false) {
      void playPreviewDocument({ stepId: pendingInlinePreviewStepId() });
    }
  };

  const panel: LocalAuthoringPanel = {
    close,
    destroy: destroyPanel,
    isMinimized: () => host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE),
    minimize,
    restore,
    saveAndClose,
  };

  const togglePanelFromLauncher = (): void => {
    if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) {
      restore();
      return;
    }
    if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) restore();
    else minimize();
  };
  window.addEventListener(LOCAL_AUTHORING_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
  if (options.persistenceOwner === 'iframe') {
    window.addEventListener('message', receiveHostedSessionLifecycle);
    window.addEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
  }
  stopPanelChrome = () => {
    window.removeEventListener(LOCAL_AUTHORING_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
    window.removeEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
  };
  const mountInlinePreviewEditor = (): void => {
    if (!preview || inlinePreviewEditor) return;
    inlinePreviewEditor = createInlinePreviewEditor({
      document,
      previewOwnerId,
      onCommit: ({ blockId, content }) => {
        const activeBridge = bridge;
        if (!activeBridge) throw new Error('Lodariq authoring bridge is not connected');
        return activeBridge.sendWithAck(
          {
            protocol: BRIDGE_PROTOCOL_VERSION,
            sessionId: session.sessionId,
            documentId: session.documentId,
            correlationId: createBridgeCorrelationId('authoring_inline_content_commit'),
            type: AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
            blockId,
            content,
          },
          { timeoutMs: 2_000 },
        );
      },
      resolveControlContext: (bodyBlockId) =>
        previewDocument ? inlinePreviewControlContext(previewDocument, bodyBlockId) : null,
      onControlCommit: (operation: AuthoringInlineControlOperation) => {
        const activeBridge = bridge;
        if (!activeBridge) throw new Error('Lodariq authoring bridge is not connected');
        return activeBridge.sendWithAck(
          {
            protocol: BRIDGE_PROTOCOL_VERSION,
            sessionId: session.sessionId,
            documentId: session.documentId,
            correlationId: createBridgeCorrelationId('authoring_inline_control_commit'),
            type: AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
            operation,
          },
          { timeoutMs: 2_000 },
        );
      },
      onCommitError: (error) => preview.onPreviewError?.(error),
    });
  };
  const connectIframe = (): void => {
    if (!iframe.contentWindow) return;
    inlinePreviewEditor?.destroy();
    inlinePreviewEditor = null;
    stopLifecycleObserver?.();
    stopLifecycleObserver = null;
    bridge?.stop();
    bridge = new AuthoringBridge(iframe.contentWindow, {
      allowedOrigins: [iframeOrigin],
      targetOrigin: iframeOrigin,
      expectedSessionId: session.sessionId,
      expectedDocumentId: session.documentId,
      onMessage: (message) => {
        if (message.type === AUTHORING_SHELL_PRESENTATION_TYPE) {
          if (message.presentation === 'operations') {
            host.removeAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE);
            overlayShell?.setPresentation('operations');
          } else if (
            message.presentation === 'overlay' &&
            overlayShell?.presentation() === 'operations'
          ) {
            overlayShell.setPresentation('overlay');
          }
          return;
        }
        if (message.type === AUTHORING_PANEL_LAYOUT_REQUEST_TYPE) {
          return;
        }
        if (message.type === AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE) {
          queueMicrotask(() => void saveAndClose().catch(() => {}));
          return;
        }
        if (message.type === 'authoring.save.result') {
          const pendingIframeSave = pendingIframeSaveRequests.get(message.requestCorrelationId);
          if (pendingIframeSave) {
            pendingIframeSaveRequests.delete(message.requestCorrelationId);
            clearTimeout(pendingIframeSave.timer);
            const persistedDocument = message.document ? structuredClone(message.document) : null;
            if (persistedDocument) previewDocument = persistedDocument;
            pendingIframeSave.resolve(persistedDocument);
            return;
          }
          if (
            pendingSaveBeforeClose &&
            message.requestCorrelationId === pendingSaveBeforeClose.requestCorrelationId
          ) {
            clearTimeout(pendingSaveBeforeClose.timer);
            const documentToSave = message.document ?? previewDocument;
            void persistBeforeClose(documentToSave);
            return;
          }
          if (
            releaseServices &&
            options.onSave &&
            message.document?.id === session.documentId &&
            message.document.workspaceId === session.workspaceId
          ) {
            return Promise.resolve(options.onSave(structuredClone(message.document))).then(
              () => undefined,
            );
          }
          return;
        }
        if (message.type === AUTHORING_OPERATIONS_REQUEST_TYPE) {
          return respondToOperationsRequest(message.requestId, message.method, message.args ?? []);
        }
        if (message.type === AUTHORING_RELEASE_STATE_REQUEST_TYPE) {
          return respondToReleaseStateRequest(message.correlationId);
        }
        if (message.type === AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToReleaseRecoveryStateRequest(
              message.correlationId,
              message.environmentId,
            ),
          );
        }
        if (message.type === AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToReleaseRecoveryRequest(
              message.correlationId,
              message.environmentId,
              message.request,
            ),
          );
        }
        if (message.type === AUTHORING_PUBLISH_STAGING_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToPublishStagingRequest(message.correlationId, message.request),
          );
        }
        if (message.type === STYLE_SAMPLE_START_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToStyleSampleRequest(message.correlationId, message.request),
          );
        }
        if (message.type === AUTHORING_BROWSER_VERIFY_REQUEST_TYPE) {
          return respondToBrowserVerificationRequest(
            message.correlationId,
            message.expectedContentHash,
          );
        }
        if (message.type === AUTHORING_LOCALE_LAYOUT_QA_REQUEST_TYPE) {
          return respondToLocaleLayoutQaRequest(
            message.correlationId,
            message.expectedDocumentRevision,
          );
        }
        if (message.type === AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToStyleSourceSaveRequest(message.correlationId, message.proposal),
          );
        }
        if (message.type === AUTHORING_BRAND_DRIFT_CHECK_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToBrandDriftCheckRequest(message.correlationId, message.request),
          );
        }
        if (message.type === AUTHORING_BRAND_THEME_ACKNOWLEDGE_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToBrandThemeAcknowledgementRequest(
              message.correlationId,
              message.request,
            ),
          );
        }
        if (message.type === AUTHORING_BRAND_DRIFT_PREVIEW_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.playBrandDriftRuntimePreview(message.mode),
          );
        }
        if (message.type === AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToVerificationSubmissionRequest(message.correlationId, message.request),
          );
        }
        if (message.type === AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToProductionPromotionRequest(message.correlationId, message.request),
          );
        }
        if (message.type === AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE) {
          return hostOptionalPanelServices.then((services) =>
            services.respondToProductionApprovalRequest(
              message.correlationId,
              message.operationId,
              message.decision,
              message.reason,
            ),
          );
        }
        if (message.type === AUTHORING_THEME_PREVIEW_APPLY_TYPE) {
          if (!preview || !options.initialTheme) {
            throw new Error('Lodariq mutable Brand preview is unavailable');
          }
          if (!previewThemeMatchesSession(message.previewTheme, options.initialTheme)) {
            throw new Error('Lodariq mutable Brand preview does not match this session');
          }
          if (message.previewTheme.version !== message.draftRevision) {
            throw new Error('Lodariq mutable Brand preview revision is inconsistent');
          }
          if (message.draftRevision < previewThemeRevision) return;
          if (
            message.draftRevision === previewThemeRevision &&
            previewTheme?.contentHash !== message.previewTheme.contentHash
          ) {
            throw new Error('Lodariq mutable Brand preview revision conflicts');
          }
          const changed = previewTheme?.contentHash !== message.previewTheme.contentHash;
          void hostOptionalPanelServices.then((services) =>
            services.clearBrandDriftRuntimePreview(),
          );
          previewTheme = structuredClone(message.previewTheme);
          previewThemeRevision = message.draftRevision;
          if (changed && (previewPending || previewPresented)) {
            return playPreviewDocument({
              stepId: pendingInlinePreviewStepId(),
              rejectOnFailure: true,
            });
          }
          return;
        }
        if (message.type === AUTHORING_SHELL_NOTICE_TYPE) {
          overlayShell?.notify(message.message, { kind: message.kind ?? 'neutral' });
          return;
        }
        if (message.type === AUTHORING_COLLABORATION_STATE_TYPE) {
          const peers = message.peers.map((peer) => ({
            creatorId: peer.participantId,
            name: peer.name,
            stepId: peer.stepId,
            selection: peer.selection,
            sameCreator: peer.sameCreator,
            lastSeenAt: Date.parse(peer.lastSeenAt),
          }));
          const knownPeerIds = new Set(peers.map((peer) => peer.creatorId));
          const stepLocks = message.locks.map((lock) => {
            // One lock per step, so the step is the key when the holder has
            // no live presence session to be addressed by.
            const creatorId = lock.holderParticipantId ?? `lock:${lock.stepId}`;
            if (creatorId !== message.selfParticipantId && !knownPeerIds.has(creatorId)) {
              peers.push({
                creatorId,
                name: lock.holderName,
                stepId: lock.stepId,
                selection: null,
                sameCreator: false,
                lastSeenAt: Date.now(),
              });
              knownPeerIds.add(creatorId);
            }
            const lastEditAt =
              Date.parse(lock.expiresAt) - EXPERIENCE_STEP_LOCK_TTL_SECONDS * 1_000;
            return {
              stepId: lock.stepId,
              creatorId,
              acquiredAt: lastEditAt,
              lastEditAt,
            };
          });
          currentPresence = {
            selfId: message.selfParticipantId,
            peers,
            stepLocks,
            documentLock: null,
          };
          overlayShell?.setPresence(currentPresence);
          if (message.draftChanged && !collaborationConflictNotified) {
            collaborationConflictNotified = true;
            overlayShell?.notify(
              authoringText(
                'The draft changed in another authoring session. Review before saving.',
              ),
              { kind: 'warning' },
            );
          }
          if (!message.draftChanged) collaborationConflictNotified = false;
          return;
        }
        if (message.type === AUTHORING_SHELL_MENU_STATE_TYPE) {
          // Handles are host chrome and always paint above the frame; they stand
          // down so an in-frame menu is not opened underneath them.
          host.toggleAttribute(AUTHORING_FRAME_MENU_OPEN_ATTRIBUTE, message.open);
          return;
        }
        if (message.type === AUTHORING_SHELL_SELECTION_TYPE) {
          overlayShell?.setSelectedStepIds(message.stepIds);
          return;
        }
        if (message.type === AUTHORING_SHELL_CAPABILITIES_TYPE) {
          overlayShell?.setAssistAvailable(message.assist);
          return;
        }
        if (message.type === AUTHORING_SHELL_PALETTE_OPEN_TYPE) {
          overlayShell?.openCommandPalette();
          return;
        }
        if (message.type === 'authoring.preview.request') {
          previewContentLocale = message.locale ?? previewContentLocale;
          if (message.mode === 'step' || message.mode === 'approach') {
            pendingInlineFocusBlockId = message.stepId;
            currentHeaderStepId = message.stepId;
            syncPanelStepStatus();
          } else {
            overlayShell?.setPresentation('previewing');
          }
          return playPreviewDocument({
            stepId: message.mode === 'full' ? message.initialStepId : message.stepId,
            rejectOnFailure: true,
            interactive: message.mode === 'full',
            accessibilityMode: message.mode === 'full' ? message.accessibilityMode : undefined,
            simulationContext: message.mode === 'full' ? message.simulationContext : undefined,
            approachReplay: message.mode === 'approach',
            goToStepPage: message.mode !== 'approach',
          });
        }
        if (message.type === 'preview.patch') {
          return queuePreview(
            message.blockId,
            message.patch.ops,
            message.locale,
            message.transaction,
          );
        }
        if (message.type === 'presentation.anchor.pick.canceled') {
          if (!presentationAnchorHostMessageMatches(message, pendingPresentationAnchorPick)) return;
          pendingPresentationAnchorPick = null;
          if (presentationAnchorPicker) {
            const activePicker = presentationAnchorPicker;
            presentationAnchorPicker = null;
            activePicker.cancel();
          }
          restorePanelAfterTargetPicking(host, presentationAnchorRestoreState);
          presentationAnchorRestoreState = null;
          restorePreviewAfterTargetPicking();
          return;
        }
        if (message.type === 'target.pick.canceled') {
          pendingTargetPickCorrelationId = null;
          if (picker) {
            const activePicker = picker;
            picker = null;
            activePicker.cancel();
          }
          restorePanelAfterTargetPicking(host, targetPickingRestoreState);
          targetPickingRestoreState = null;
          restorePreviewAfterTargetPicking();
          if (pendingInlineFocusBlockId === message.blockId) pendingInlineFocusBlockId = null;
          return;
        }
        if (message.type === 'target.inspect.request') {
          void handleTargetInspect(message);
          return;
        }
        if (message.type === 'presentation.anchor.pick.start') {
          void handlePresentationAnchorPickStart(message);
          return;
        }
        if (message.type !== 'target.pick.start') return;
        void handleTargetPickStart(message);
      },
      maxMessageBytesByType: RELEASE_RECOVERY_BRIDGE_MESSAGE_BYTE_LIMITS,
    });
    bridge.start();
    mountInlinePreviewEditor();
    if (options.initialDocument) {
      bridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_init'),
        type: 'authoring.init',
        workspaceId: session.workspaceId,
        environment: session.environment,
        document: structuredClone(options.initialDocument),
        ...(options.initialTheme ? { theme: structuredClone(options.initialTheme) } : {}),
        prefersDark: window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
        prefersReducedMotion:
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        deliveryCapabilities: CURRENT_AUTHORING_DELIVERY_CAPABILITY_METADATA,
        ...(releaseServices
          ? {
              releaseStateCapability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
              ...(publishToStaging
                ? {
                    stagingPublicationCapability: AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
                  }
                : {}),
              ...(saveStyleSource
                ? {
                    productStyleSamplingCapability:
                      AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
                  }
                : {}),
              ...(checkBrandDrift
                ? {
                    brandDriftCheckCapability: AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
                  }
                : {}),
              ...(acknowledgeBrandTheme
                ? {
                    brandThemeAcknowledgementCapability:
                      AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
                  }
                : {}),
              ...(submitStagingVerification && preview?.loadExactPublishedArtifact
                ? {
                    stagingVerificationCapability: AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
                  }
                : {}),
              ...(promoteProduction
                ? {
                    productionPromotionCapability:
                      AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
                  }
                : {}),
              ...(approveProduction
                ? {
                    productionApprovalCapability: AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
                  }
                : {}),
            }
          : {}),
      });
    }
    sendSaveStateUpdate();
    stopLifecycleObserver = startPageLifecycleObserver(bridge, session, {
      ...(options.getTargetRoutePatternId
        ? { getRoutePatternId: options.getTargetRoutePatternId }
        : {}),
      ...(options.getTargetStateId ? { getStateId: options.getTargetStateId } : {}),
    });
    if (options.autoPreview) {
      const steps = tourStepsOf(previewDocument);
      const restored = options.initialPreviewStepId;
      const startStepId =
        restored && steps.some((step) => step.id === restored) ? restored : steps[0]?.id;
      pendingInlineFocusBlockId = startStepId ?? null;
      if (startStepId) {
        void playPreviewDocument({
          stepId: startStepId,
          ...(options.initialPreviewInteractive ? { interactive: true } : {}),
        });
      }
    }
  };

  async function respondToReleaseStateRequest(requestCorrelationId: string): Promise<void> {
    const activeBridge = bridge;
    const release = releaseServices;
    if (!activeBridge || !release) return;
    try {
      const releaseState = await release.getReleaseState();
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_release_state_result'),
        type: AUTHORING_RELEASE_STATE_RESULT_TYPE,
        requestCorrelationId,
        result: { ok: true, releaseState },
      });
    } catch {
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_release_state_result'),
        type: AUTHORING_RELEASE_STATE_RESULT_TYPE,
        requestCorrelationId,
        result: {
          ok: false,
          code: 'release_state_failed',
          message: authoringText('Staging release state could not be loaded'),
        },
      });
    }
  }

  async function resolveProductStyleElement(
    request: Extract<BridgeMessage, { type: typeof STYLE_SAMPLE_START_TYPE }>['request'],
  ): Promise<Element | null> {
    if (request.scope === 'selected-target') {
      const target = previewDocument?.targets.find(
        (candidate) => candidate.id === request.targetId,
      );
      if (target) {
        const resolution = resolveTarget(target);
        if (resolution.state === 'found' && resolution.element) return resolution.element;
      }
    }

    // A stale or missing current target should not strand the creator in an
    // error state. Fall back to the same one-click visual source picker used
    // when no step target exists; the sampled element is never saved as a
    // selector or interaction target.
    const restoreState = captureRestoreState();
    const previousVisibility = host.style.visibility;
    host.style.visibility = 'hidden';
    try {
      return await new Promise<Element | null>((resolve) => {
        productStylePicker?.cancel();
        productStylePicker = startProductStylePicker({
          root: document,
          onPick: (element) => {
            productStylePicker = null;
            resolve(element);
          },
          onCancel: () => {
            productStylePicker = null;
            resolve(null);
          },
        });
      });
    } finally {
      host.style.visibility = previousVisibility;
      schedulePanelFocusRestore(restoreState.focusedElement, null);
    }
  }

  async function respondToBrowserVerificationRequest(
    requestCorrelationId: string,
    expectedContentHash: string,
  ): Promise<void> {
    const activeBridge = bridge;
    const loadExactPublishedArtifact = preview?.loadExactPublishedArtifact;
    if (!activeBridge) return;
    if (!preview || !loadExactPublishedArtifact) {
      sendHostOperationFailure(
        activeBridge,
        requestCorrelationId,
        AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
        'verification_unavailable',
        authoringText('Exact staging verification is unavailable on this page.'),
      );
      return;
    }

    const restoreState = captureRestoreState();
    const previousVisibility = host.style.visibility;
    const resumeDraftPreview = previewPresented;
    const verificationOwnerId = createBridgeCorrelationId('staging_verification_owner');
    host.style.visibility = 'hidden';
    preview.stopPreview?.(previewOwnerId);
    try {
      const compiled = await loadExactPublishedArtifact(expectedContentHash);
      const report = await runPublicationBrowserVerification({
        compiled,
        expectedContentHash,
        previewOwnerId: verificationOwnerId,
        playExactArtifact: () => preview.playPreview(compiled, { ownerId: verificationOwnerId }),
        stopExactArtifact: () => preview.stopPreview?.(verificationOwnerId),
      });
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_browser_verify_result'),
        type: AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
        requestCorrelationId,
        result: { ok: true, report },
      });
    } catch {
      sendHostOperationFailure(
        activeBridge,
        requestCorrelationId,
        AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
        'verification_failed',
        authoringText('The exact staging artifact could not be verified.'),
      );
    } finally {
      host.style.visibility = previousVisibility;
      schedulePanelFocusRestore(restoreState.focusedElement, null);
      if (resumeDraftPreview) void playPreviewDocument({ stepId: pendingInlinePreviewStepId() });
    }
  }

  async function respondToLocaleLayoutQaRequest(
    requestCorrelationId: string,
    expectedDocumentRevision: number,
  ): Promise<void> {
    const activeBridge = bridge;
    const document = previewDocument;
    if (!activeBridge) return;
    if (!preview || !document) {
      sendHostOperationFailure(
        activeBridge,
        requestCorrelationId,
        AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
        'locale_layout_unavailable',
        authoringText('Live language layout checking is unavailable on this page.'),
      );
      return;
    }
    if (latestPreviewTransactionRevision !== expectedDocumentRevision) {
      sendHostOperationFailure(
        activeBridge,
        requestCorrelationId,
        AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
        'locale_layout_stale',
        authoringText('The draft changed before live language layouts could be checked.'),
      );
      return;
    }

    const restoreState = captureRestoreState();
    const previousVisibility = host.style.visibility;
    const resumeDraftPreview = previewPresented;
    const ownerIdPrefix = createBridgeCorrelationId('locale_layout_qa_owner');
    host.style.visibility = 'hidden';
    preview.stopPreview?.(previewOwnerId);
    try {
      const compiled = await preview.compilePreview(
        structuredClone(document),
        previewTheme ? structuredClone(previewTheme) : undefined,
      );
      const { runLocaleLayoutVerification } = await import('../bridge/locale-layout-verifier');
      const report = await runLocaleLayoutVerification({
        compiled,
        documentRevision: expectedDocumentRevision,
        ownerIdPrefix,
        playPreview: (options) => preview.playPreview(compiled, options),
        stopPreview: (ownerId) => preview.stopPreview?.(ownerId),
      });
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_locale_layout_qa_result'),
        type: AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
        requestCorrelationId,
        result: { ok: true, report },
      });
    } catch {
      sendHostOperationFailure(
        activeBridge,
        requestCorrelationId,
        AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
        'locale_layout_failed',
        authoringText('Live language layouts could not be checked on this page.'),
      );
    } finally {
      host.style.visibility = previousVisibility;
      schedulePanelFocusRestore(restoreState.focusedElement, null);
      if (resumeDraftPreview) void playPreviewDocument({ stepId: pendingInlinePreviewStepId() });
    }
  }

  function sendHostOperationFailure(
    activeBridge: AuthoringBridge,
    requestCorrelationId: string,
    type:
      typeof AUTHORING_BROWSER_VERIFY_RESULT_TYPE | typeof AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
    code: string,
    message: string,
  ): void {
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_host_operation_result'),
      type,
      requestCorrelationId,
      result: { ok: false, code, message },
    });
  }
  iframe.addEventListener('load', connectIframe);

  document.body.appendChild(host);
  setAuthoringPanelOpenState(true);
  activePanel = panel;
  activePanelHost = host;
  activePanelSessionKey = sessionKey;
  if (options.persistenceOwner === 'iframe') dispatchHostedCreatorPanelState('open');
  if (options.adoptedIframe) connectIframe();

  function queuePreview(
    blockId: string,
    ops: PreviewPatchOperation[],
    locale?: string,
    transaction?: PreviewTransactionMetadata,
  ): Promise<void> | void {
    const current = previewDocument ?? preview?.loadDocument(session.documentId) ?? null;
    if (!current) return;
    if (transaction && transaction.revision <= latestPreviewTransactionRevision) {
      sendPreviewTransactionResult(transaction, 'applied');
      return;
    }
    if (
      transaction &&
      transaction.transactionId !== latestPreviewTransactionId &&
      transaction.baseRevision !== latestPreviewTransactionRevision
    ) {
      sendPreviewTransactionResult(transaction, 'conflict', current);
      return;
    }

    const affectedStepId = findContainingTourStepId(current.blocks, blockId);
    const protectedStepIds = ops.some((operation) => operation.op === 'replaceDocument')
      ? tourStepsOf(current).map((block) => block.id)
      : affectedStepId
        ? [affectedStepId]
        : currentHeaderStepId
          ? [currentHeaderStepId]
          : [];
    const blockingEditability = currentPresence
      ? protectedStepIds
          .map((stepId) => stepEditability(currentPresence!, stepId, Date.now()))
          .find((editability) => !editability.editable)
      : undefined;
    if (blockingEditability && !blockingEditability.editable) {
      const message =
        blockingEditability.reason === 'document'
          ? authoringText('A teammate is changing the whole experience. Try again in a moment.')
          : authoringText('{name} is editing this step, so your copy stays read-only.', {
              name: blockingEditability.holder?.name ?? authoringText('A teammate'),
            });
      overlayShell?.notify(message);
      if (transaction) sendPreviewTransactionResult(transaction, 'conflict', current);
      return;
    }
    if (ops.some((operation) => operation.op === 'replaceDocument')) {
      authoringTargetOverrides.clear();
    } else if (
      affectedStepId &&
      ops.some((operation) => operation.op === 'removeBlock' || operation.op === 'removeTarget')
    ) {
      authoringTargetOverrides.delete(affectedStepId);
    }
    previewDocument = applyPreviewPatch(current, blockId, ops, locale);
    overlayShell?.setDocument(previewDocument);
    if (transaction) {
      latestPreviewTransactionRevision = transaction.revision;
      latestPreviewTransactionId = transaction.transactionId;
      sendPreviewTransactionResult(transaction, 'applied');
    }
    syncPanelStepStatus();
    scheduleAutoSave(previewDocument, transaction);
    const persistence = ops.some((operation) => operation.op === 'removeTarget')
      ? flushAutoSave()
      : undefined;
    if (!preview) return persistence;
    if (ops.every((operation) => operation.op === 'updateTargetEvidence')) return persistence;
    const contentOnlyPatch = ops.every(
      (operation) => operation.op === 'updateContent' || operation.op === 'updateContentRuns',
    );
    if (contentOnlyPatch && inlinePreviewEditor?.isEditingBlock(blockId)) return persistence;
    const stepId = findContainingTourStepId(previewDocument.blocks, blockId);
    if (pendingTargetPickCorrelationId || suspendedPreview) {
      suspendedPreview = stepId ? { stepId } : (suspendedPreview ?? {});
      return persistence;
    }
    scheduleQueuedPreviewReplay({ stepId });
    return persistence;
  }

  function queueTargetEvidenceUpdate(
    blockId: string,
    captureCorrelationId: string,
    fingerprint: ElementFingerprint,
    identity: TargetIdentityV2,
  ): void {
    pendingTargetEvidenceUpdate = {
      blockId,
      captureCorrelationId,
      fingerprint: structuredClone(fingerprint),
      identity: structuredClone(identity),
    };
    if (targetEvidenceUpdateTimer) clearTimeout(targetEvidenceUpdateTimer);
    targetEvidenceUpdateTimer = setTimeout(() => {
      targetEvidenceUpdateTimer = null;
      const update = pendingTargetEvidenceUpdate;
      pendingTargetEvidenceUpdate = null;
      const activeBridge = bridge;
      if (!update || !activeBridge || !host.isConnected) return;
      void activeBridge
        .sendWithAck(
          {
            protocol: BRIDGE_PROTOCOL_VERSION,
            sessionId: session.sessionId,
            documentId: session.documentId,
            correlationId: createBridgeCorrelationId('target_evidence_update'),
            type: 'target.evidence.update',
            blockId: update.blockId,
            captureCorrelationId: update.captureCorrelationId,
            fingerprint: update.fingerprint,
            identity: update.identity,
          },
          { timeoutMs: 2_000 },
        )
        .catch(() => {});
    }, 650);
  }

  function sendShellStepCommand(command: AuthoringShellStepCommand, stepId?: string): void {
    const activeBridge = bridge;
    if (!activeBridge) return;
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_shell_step'),
      type: AUTHORING_SHELL_STEP_COMMAND_TYPE,
      command,
      ...(stepId ? { stepId } : {}),
    });
  }

  function openOperations(tab?: string): void {
    host.removeAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE);
    overlayShell?.setPresentation('operations');
    const activeBridge = bridge;
    if (!activeBridge) return;
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_open_operations'),
      type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
      action: 'open-operations',
      // A menu row that names a section should land on it, not on the hub's
      // default tab and leave the creator to find it again.
      ...(tab ? { tab } : {}),
    });
  }

  /**
   * The pill menu's non-Operations rows (§3.3). Each is a real frame command —
   * a menu that prints a capability the build cannot perform is worse than a
   * short menu, so nothing here is decorative.
   */
  function sendChromeAction(
    action:
      | 'switch-experience'
      | 'toggle-recording'
      | 'canvas-zoom-in'
      | 'canvas-zoom-out'
      | 'canvas-zoom-reset'
      | 'restart'
      | 'ask-lodariq',
    extra: { experienceType?: string; prompt?: string } = {},
  ): void {
    const activeBridge = bridge;
    if (!activeBridge) return;
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId(`authoring_${action.replace(/-/gu, '_')}`),
      type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
      action,
      ...extra,
    });
  }

  /**
   * The environment chip (§3.3). A session is opened against one environment, so
   * this changes what preview and the Operations numbers are read against — it
   * does not silently re-point publishing, which stays the session's own.
   */
  function setAuthoringEnvironment(environment: string): void {
    if (environment === AUTHORING_ENVIRONMENT_LABELS[session.environment]) return;
    overlayShell?.setPillState({ environment });
    overlayShell?.notify(AUTHORING_PANEL_LABELS.environmentSwitched(environment));
  }

  /**
   * Runs one Operations call on the host, where the bearer lives, and returns the
   * result to the frame. Failures come back as a creator-facing reason so a
   * section can say why it is empty instead of spinning.
   */
  async function respondToOperationsRequest(
    requestId: string,
    method: string,
    args: readonly unknown[],
  ): Promise<void> {
    const activeBridge = bridge;
    if (!activeBridge) return;
    const envelope = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_operations_result'),
      type: AUTHORING_OPERATIONS_RESULT_TYPE,
      requestId,
    } as const;

    const services = options.operations;
    const call = services?.[method as keyof AuthoringOperationsServices] as
      ((...callArgs: readonly unknown[]) => Promise<unknown>) | undefined;
    if (!call) {
      activeBridge.send({
        ...envelope,
        error: AUTHORING_PANEL_LABELS.operationsUnavailable,
      });
      return;
    }

    try {
      const result = await call.apply(services, [...args]);
      activeBridge.send({ ...envelope, ...(result === undefined ? {} : { result }) });
    } catch (error) {
      activeBridge.send({
        ...envelope,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function closeOperations(): void {
    const activeBridge = bridge;
    if (!activeBridge) return;
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_close_operations'),
      type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
      action: 'close-operations',
    });
  }

  function commitOverlayPlacement(
    blockId: string,
    placement?: OverlayPlacement,
    align?: AnchorAlign,
    offsetPx?: number,
  ): void {
    const activeBridge = bridge;
    if (!activeBridge) return;
    const side = placement ?? currentPlacementOf(blockId) ?? 'bottom';
    const operation: AuthoringInlineControlOperation = {
      kind: 'setPlacement',
      blockId,
      placement: side,
      ...(align ? { align } : {}),
      ...(offsetPx === undefined ? {} : { offsetPx }),
    };
    void activeBridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_overlay_placement'),
          type: AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
          operation,
        },
        { timeoutMs: 2_000 },
      )
      .catch(() => {});
  }

  /** The side already on the block, so an offset-only commit does not reset it. */
  function currentPlacementOf(blockId: string): OverlayPlacement | null {
    for (const step of tourStepsOf(previewDocument)) {
      const tooltip = tooltipOfStep(step);
      if (tooltip?.id !== blockId) continue;
      const placement = tooltip.props.placement;
      return placement === 'top' ||
        placement === 'right' ||
        placement === 'bottom' ||
        placement === 'left'
        ? placement
        : null;
    }
    return null;
  }

  /** Each axis is sent only when the dragged edge drove it (§3.4 rule 4). */
  function commitOverlayPopupSize(widthPx: number | null, heightPx: number | null): void {
    const activeBridge = bridge;
    const step = tourStepsOf(previewDocument).find((item) => item.id === currentHeaderStepId);
    const tooltipId = step ? tooltipOfStep(step)?.id : undefined;
    if (!activeBridge || !tooltipId || (widthPx === null && heightPx === null)) return;
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_overlay_popup_size'),
      type: AUTHORING_SHELL_POPUP_SIZE_COMMIT_TYPE,
      blockId: tooltipId,
      ...(widthPx === null ? {} : { widthPx }),
      ...(heightPx === null ? {} : { heightPx }),
    });
  }

  function selectOverlayStep(stepId: string): void {
    currentHeaderStepId = stepId;
    overlayShell?.setActiveStepId(stepId);
    overlayShell?.setPresentation('overlay');
    sendShellStepCommand('select', stepId);
    void playPreviewDocument({ stepId, goToStepPage: true });
  }

  /** The pill's `Preview` button (§4.7): the runtime renders, every authoring pixel goes. */
  function startOverlayPreview(): void {
    overlayShell?.setPresentation('previewing');
    host.setAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE, 'true');
    void playPreviewDocument({
      stepId: currentHeaderStepId ?? pendingInlinePreviewStepId(),
      rejectOnFailure: true,
      interactive: true,
    }).catch((error: unknown) => {
      // The usual cause is a step whose target is not on this page. Saying so is
      // the difference between "preview is broken" and "go to the right screen".
      overlayShell?.notify(previewFailureMessage(error), { kind: 'warning' });
    });
  }

  /** The preview bar's arrows (§4.7): replay from the step either side of this one. */
  function stepPreview(direction: 'previous' | 'next'): void {
    const steps = tourStepsOf(previewDocument);
    const showing = previewPathStepIds[previewPathStepIds.length - 1] ?? currentHeaderStepId;
    const index = steps.findIndex((step) => step.id === showing);
    const next = steps[index + (direction === 'next' ? 1 : -1)];
    if (index < 0 || !next) return;
    void playPreviewDocument({ stepId: next.id, rejectOnFailure: true, interactive: true }).catch(
      (error: unknown) => {
        overlayShell?.notify(previewFailureMessage(error), { kind: 'warning' });
      },
    );
  }

  function followRuntimePreviewStep(stepId: string): void {
    if (stepId === currentHeaderStepId) return;
    currentHeaderStepId = stepId;
    overlayShell?.setActiveStepId(stepId);
  }

  function leaveInteractivePreview(): void {
    const showingStepId =
      previewPathStepIds[previewPathStepIds.length - 1] ?? currentHeaderStepId ?? null;
    stopOwnedPreview();
    host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
    restore({ replayPreview: !showingStepId });
    if (showingStepId) selectOverlayStep(showingStepId);
  }

  /** `Edit this step` on the preview bar: select what is showing, keep preview state. */
  function editPreviewingStep(): void {
    const runtimeStepId = previewPathStepIds[previewPathStepIds.length - 1] ?? currentHeaderStepId;
    host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
    if (runtimeStepId) selectOverlayStep(runtimeStepId);
    else overlayShell?.setPresentation('overlay');
  }

  interface PreviewPlaybackRequest {
    readonly stepId?: string;
    readonly rejectOnFailure?: boolean;
    readonly interactive?: boolean;
    readonly accessibilityMode?: AuthoringAccessibilityPreviewMode;
    readonly simulationContext?: AuthoringFlowSimulationContext;
    readonly approachReplay?: boolean;
    readonly goToStepPage?: boolean;
  }

  function playPreviewDocument(request: PreviewPlaybackRequest = {}): Promise<void> {
    // An explicit replay answers whatever a patch had queued, so the queue goes.
    cancelQueuedPreviewReplay();
    lastPreviewReplayAt = Date.now();
    const {
      stepId,
      rejectOnFailure = false,
      interactive = false,
      accessibilityMode,
      simulationContext,
      approachReplay = false,
      goToStepPage = interactive,
    } = request;
    if (!preview || !previewDocument) {
      return rejectOnFailure
        ? Promise.reject(new Error('Lodariq preview runtime is unavailable'))
        : Promise.resolve();
    }
    if (stepId && tourStepsOf(previewDocument).some((block) => block.id === stepId)) {
      currentHeaderStepId = stepId;
      syncPanelStepStatus();
    }
    if (interactive) {
      host.setAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE, 'true');
      host.setAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE, 'true');
      overlayShell?.setPresentation('previewing');
      setAuthoringTriggerPanelState('minimized');
    } else {
      host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
      if (overlayShell?.presentation() !== 'operations') {
        overlayShell?.setPresentation('overlay');
      }
    }
    syncPanelStepStatus();
    const requestId = ++previewRequestId;
    previewPending = true;
    return preview
      .compilePreview(
        structuredClone(previewDocument),
        previewTheme ? structuredClone(previewTheme) : undefined,
      )
      .then(async (compiled) => {
        if (requestId !== previewRequestId || !host.isConnected) return;
        if (compiled.steps.length === 0) {
          stopOwnedPreview();
          previewPending = false;
          previewPresented = false;
          return;
        }
        const previewStepId = stepId ?? compiled.steps[0]?.id;
        // A step lives on one screen. Asking for it from another is a request to
        // go there — a tour cannot start off its first page, and a step selected
        // from the filmstrip cannot be edited against a target that is not here.
        if (goToStepPage) {
          const destination = stepPageDestination(compiled, previewStepId);
          if (destination) {
            const outcome = await goToPreviewPage(destination);
            if (requestId !== previewRequestId || !host.isConnected) return;
            if (outcome.kind === 'unreachable') {
              overlayShell?.notify(
                authoringText('This step is on {page}. Open that page, then preview.', {
                  page: outcome.destination,
                }),
                { kind: 'warning' },
              );
              // Selecting still renders: needs-context beats an empty canvas.
              if (interactive) throw new PreviewPageUnreachableError(outcome.destination);
            }
          }
        }
        previewPathStepIds = previewStepId ? [previewStepId] : [];
        const selectedElement = previewStepId
          ? authoringTargetOverrides.get(previewStepId)
          : undefined;
        if (previewStepId && selectedElement && !selectedElement.isConnected) {
          authoringTargetOverrides.delete(previewStepId);
        }
        const runtimeInteractive = interactive || approachReplay;
        const previewOptions: LocalAuthoringPreviewOptions = {
          ownerId: previewOwnerId,
          locale: previewContentLocale,
          ...(runtimeInteractive ? { interactive: true } : {}),
          ...(accessibilityMode ? { accessibilityMode } : {}),
          ...(simulationContext?.identifyTraits || simulationContext?.documentState
            ? {
                flowConditionContext: {
                  ...(simulationContext.identifyTraits
                    ? { identifyTraits: simulationContext.identifyTraits }
                    : {}),
                  ...(simulationContext.documentState
                    ? { documentState: simulationContext.documentState }
                    : {}),
                },
              }
            : {}),
          ...(simulationContext?.adaptive ? { adaptiveContext: simulationContext.adaptive } : {}),
          ...(interactive
            ? {
                /*
                 * The record must already name the step the visitor advanced TO
                 * before their click finishes: a step that advances on the
                 * customer's own element may be a real navigation, and the page
                 * unloads before `onStepChange` fires. Left stale, the resume
                 * replays the step the preview STARTED on and — because a
                 * restored interactive preview goes to its step's page — drags
                 * the creator back to the screen they just left. Mirrors
                 * delivery's `tracked-tour-player`, which writes on both hooks.
                 */
                onBeforeStepChange: (_index: number, runtimeStepId: string) => {
                  if (requestId !== previewRequestId) return;
                  writeDraftPreviewResume(session.workspaceId, {
                    sessionId: session.sessionId,
                    documentId: session.documentId,
                    stepId: runtimeStepId,
                    interactive: runtimeInteractive,
                  });
                },
                onStepChange: (index: number, runtimeStepId: string) => {
                  if (requestId !== previewRequestId) return;
                  writeDraftPreviewResume(session.workspaceId, {
                    sessionId: session.sessionId,
                    documentId: session.documentId,
                    stepId: runtimeStepId,
                    interactive: runtimeInteractive,
                  });
                  if (previewPathStepIds[previewPathStepIds.length - 1] !== runtimeStepId) {
                    previewPathStepIds.push(runtimeStepId);
                  }
                  // Audit #6: progress follows the runtime, not the editor selection.
                  overlayShell?.setRuntimeStepId(runtimeStepId);
                  followRuntimePreviewStep(runtimeStepId);
                  recordAuthoringDiagnostic('preview.step-changed', {
                    stepId: runtimeStepId,
                    count: index,
                  });
                  syncPanelStepStatus();
                },
                onComplete: () => completeInteractivePreview('completed', requestId),
                onDismiss: () => completeInteractivePreview('dismissed', requestId),
                onSkip: () => completeInteractivePreview('skipped', requestId),
                onChoreographyStageChange: (runtimeStepId, update) => {
                  if (requestId !== previewRequestId) return;
                  const eventName = choreographyDiagnosticName(update.status);
                  if (eventName) {
                    recordAuthoringDiagnostic(eventName, {
                      stepId: runtimeStepId,
                      durationMs: Math.max(0, Math.round(update.elapsedMs)),
                      count: update.stageIndex,
                      state: update.stage,
                    });
                  }
                  syncPanelStepStatus();
                },
                onChoreographyRecovery: (runtimeStepId, update) => {
                  if (requestId !== previewRequestId) return;
                  recordAuthoringDiagnostic(`choreography.${update.status}`, {
                    stepId: runtimeStepId,
                    count: update.retryCount,
                  });
                },
                onBranchChoice: (runtimeStepId, ruleIndex) => {
                  if (requestId === previewRequestId) {
                    recordAuthoringDiagnostic('preview.branch-chosen', {
                      stepId: runtimeStepId,
                      ...(ruleIndex === null ? { reason: 'fallback' } : { count: ruleIndex }),
                    });
                    syncPanelStepStatus();
                  }
                },
                onAdaptiveSkip: (runtimeStepId, decision) => {
                  if (requestId !== previewRequestId) return;
                  overlayShell?.notify(adaptiveSkipPreviewMessage(runtimeStepId, decision), {
                    kind: 'neutral',
                  });
                },
              }
            : {}),
          getAuthoringProtectedSurfaces: () => authoringProtectedSurfaces(),
          onAuthoringSurfaceChange: (rect: ProtectedSurfaceRect | null) => {
            overlayShell?.setCardRect(rect);
            if (interactive) avoidInteractivePreviewSurface(rect, requestId);
          },
          ...(stepId ? { stepId } : {}),
          ...(previewStepId && selectedElement?.isConnected
            ? {
                authoringTargetOverride: {
                  stepId: previewStepId,
                  element: selectedElement,
                },
              }
            : {}),
        };
        return preview.playPreview(compiled, previewOptions).then(() => {
          if (requestId !== previewRequestId || !host.isConnected) return;
          previewPending = false;
          previewPresented = true;
          // Recorded where the creator actually is, not where the request asked
          // to go: a preview that never presented is not a place to come back to.
          if (previewStepId) {
            writeDraftPreviewResume(session.workspaceId, {
              sessionId: session.sessionId,
              documentId: session.documentId,
              stepId: previewStepId,
              interactive: runtimeInteractive,
            });
          }
          if (interactive) {
            inlinePreviewEditor?.destroy();
            inlinePreviewEditor = null;
          } else {
            mountInlinePreviewEditor();
            inlinePreviewEditor?.refresh();
            focusPendingInlineEditor(stepId);
          }
        });
      })
      .catch((error: unknown) => {
        if (requestId !== previewRequestId) return;
        previewPending = false;
        previewPresented = false;
        if (interactive) {
          /*
           * Undo everything the attempt did. Interactive preview minimizes the
           * panel and switches the shell to `previewing` so the tour has the page
           * to itself; leaving either in place after a failure takes the whole
           * authoring surface away with no explanation, which is much worse than
           * the preview simply not starting.
           */
          host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
          host.removeAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE);
          setAuthoringTriggerPanelState('open');
          overlayShell?.setPresentation('overlay');
          syncPanelStepStatus();
        }
        preview.onPreviewError?.(error);
        if (rejectOnFailure) throw error;
      });
  }

  function completeInteractivePreview(
    state: 'completed' | 'dismissed' | 'skipped',
    requestId: number,
  ): void {
    if (requestId !== previewRequestId) return;
    previewPending = false;
    previewPresented = false;
    recordAuthoringDiagnostic(state === 'completed' ? 'preview.completed' : 'preview.exited', {
      state,
    });
    syncPanelStepStatus();
    // Deferred: the renderer stops itself right after calling this.
    queueMicrotask(() => {
      if (requestId !== previewRequestId || !host.isConnected) return;
      leaveInteractivePreview();
    });
  }

  function authoringProtectedSurfaces(): ProtectedSurfaceRect[] {
    const surfaces: ProtectedSurfaceRect[] = [];
    for (const element of panelElement.querySelectorAll<HTMLElement>(
      '[data-lodariq-filmstrip], [data-lodariq-pulses], [data-lodariq-compass], [data-lodariq-exit-preview]',
    )) {
      if (!element.isConnected) continue;
      surfaces.push(domRectAsProtectedSurface(element.getBoundingClientRect(), 3));
    }
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-lodariq-authoring-control="true"]',
    )) {
      if (element === host || !element.isConnected) continue;
      surfaces.push(domRectAsProtectedSurface(element.getBoundingClientRect(), 3));
    }
    return surfaces;
  }

  function avoidInteractivePreviewSurface(
    rect: ProtectedSurfaceRect | null,
    requestId: number,
  ): void {
    if (requestId !== previewRequestId) return;
    overlayShell?.setCardRect(rect);
  }

  function recordAuthoringDiagnostic(
    name: AuthoringDiagnosticEventName,
    attributes?: AuthoringDiagnosticAttributes,
  ): void {
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_diagnostic'),
      type: 'authoring.diagnostic.record',
      name,
      ...(attributes ? { attributes } : {}),
    });
  }

  function pendingInlinePreviewStepId(): string | undefined {
    return resolvePreviewStepId(previewDocument, pendingInlineFocusBlockId, currentHeaderStepId);
  }

  function suspendPreviewForTargetPicking(stepId?: string): void {
    if (!preview || suspendedPreview || (!previewPending && !previewPresented)) return;
    suspendedPreview = stepId ? { stepId } : {};
    stopOwnedPreview();
  }

  function restorePreviewAfterTargetPicking(): void {
    const suspended = suspendedPreview;
    suspendedPreview = null;
    overlayShell?.setPresentation('overlay');
    if (!suspended || !host.isConnected) return;
    void playPreviewDocument({ stepId: suspended.stepId });
  }

  function scheduleQueuedPreviewReplay(request: PreviewPlaybackRequest): void {
    queuedPreviewReplay = request;
    if (queuedPreviewReplayTimer !== null) return;
    const wait = Math.max(0, PREVIEW_REPLAY_FLOOR_MS - (Date.now() - lastPreviewReplayAt));
    if (wait === 0) {
      runQueuedPreviewReplay();
      return;
    }
    queuedPreviewReplayTimer = setTimeout(runQueuedPreviewReplay, wait);
  }

  function runQueuedPreviewReplay(): void {
    queuedPreviewReplayTimer = null;
    const next = queuedPreviewReplay;
    queuedPreviewReplay = null;
    if (!next || !host.isConnected) return;
    lastPreviewReplayAt = Date.now();
    void playPreviewDocument(next);
  }

  function cancelQueuedPreviewReplay(): void {
    if (queuedPreviewReplayTimer !== null) clearTimeout(queuedPreviewReplayTimer);
    queuedPreviewReplayTimer = null;
    queuedPreviewReplay = null;
  }

  function stopOwnedPreview(): void {
    cancelQueuedPreviewReplay();
    previewRequestId += 1;
    previewPending = false;
    previewPresented = false;
    clearDraftPreviewResume(session.workspaceId);
    previewPathStepIds = [];
    overlayShell?.setRuntimeStepId(null);
    host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
    preview?.stopPreview?.(previewOwnerId);
    inlinePreviewEditor?.refresh();
  }

  function focusPendingInlineEditor(stepId?: string): void {
    const pendingBlockId = pendingInlineFocusBlockId;
    if (!pendingBlockId || !previewDocument) return;
    const pendingStepId = findContainingTourStepId(previewDocument.blocks, pendingBlockId);
    if (stepId && pendingStepId !== stepId) return;
    pendingInlineFocusBlockId = null;
    queueMicrotask(() => inlinePreviewEditor?.focusPrimary());
  }

  function scheduleAutoSave(
    document: LodariqDocument,
    transaction?: PreviewTransactionMetadata,
  ): void {
    if (options.persistenceOwner === 'host' && !options.onSave) {
      setSaveState('saved', AUTHORING_PANEL_LABELS.draftSaved);
      return;
    }
    pendingAutoSave = {
      document: structuredClone(document),
      generation: ++autoSaveGeneration,
      ...(transaction ? { transaction: structuredClone(transaction) } : {}),
    };
    autoSaveRetryCount = 0;
    setSaveState('saving', AUTHORING_PANEL_LABELS.savingDraft);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      void flushAutoSave().catch(() => {});
    }, AUTHORING_AUTOSAVE_DEBOUNCE_MS);
  }

  function flushAutoSave(): Promise<void> {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (!pendingAutoSave) return autoSaveSequence;
    if (options.persistenceOwner === 'host' && !options.onSave) return autoSaveSequence;

    const save = pendingAutoSave;
    pendingAutoSave = null;
    setSaveState('saving', AUTHORING_PANEL_LABELS.savingDraft);
    const persist = (): Promise<unknown> => {
      if (options.persistenceOwner === 'iframe') {
        return requestIframeSave('authoring_autosave_request');
      }
      return Promise.resolve(options.onSave?.(structuredClone(save.document)));
    };
    const saveAttempt = autoSaveSequence
      .catch(() => {})
      .then(persist)
      .then(() => {
        autoSaveRetryCount = 0;
        persistedAutoSaveGeneration = Math.max(persistedAutoSaveGeneration, save.generation);
        if (save.transaction) sendPreviewTransactionResult(save.transaction, 'persisted');
        if (!pendingAutoSave && persistedAutoSaveGeneration >= autoSaveGeneration) {
          setSaveState('saved', AUTHORING_PANEL_LABELS.draftSaved);
        }
        if (pendingSaveBeforeClose) void persistBeforeClose(null);
      })
      .catch((error: unknown) => {
        if (save.generation === autoSaveGeneration) {
          pendingAutoSave ??= {
            document: structuredClone(save.document),
            generation: save.generation,
            ...(save.transaction ? { transaction: structuredClone(save.transaction) } : {}),
          };
        }
        const reportableError =
          options.persistenceOwner === 'iframe'
            ? new Error('Lodariq hosted draft could not be saved')
            : error;
        dispatchAuthoringSaveError(reportableError);
        if (
          pendingAutoSave &&
          host.isConnected &&
          autoSaveRetryCount < AUTHORING_AUTOSAVE_MAX_RETRIES
        ) {
          if (save.transaction) sendPreviewTransactionResult(save.transaction, 'retrying');
          setSaveState('error', 'Save failed · retrying');
          autoSaveRetryCount += 1;
          autoSaveTimer = setTimeout(() => {
            autoSaveTimer = null;
            void flushAutoSave().catch(() => {});
          }, AUTHORING_AUTOSAVE_RETRY_MS);
        } else {
          setSaveState('error', 'Save failed · select Save & exit to retry');
        }
        throw reportableError;
      });
    autoSaveSequence = saveAttempt.catch(() => {});
    return saveAttempt;
  }

  function sendPreviewTransactionResult(
    transaction: PreviewTransactionMetadata,
    state: 'applied' | 'persisted' | 'retrying' | 'conflict',
    authoritativeDocument?: LodariqDocument,
  ): void {
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('preview_transaction_result'),
      type: 'preview.transaction.result',
      transactionId: transaction.transactionId,
      revision: transaction.revision,
      state,
      ...(state === 'conflict'
        ? {
            authoritativeRevision: latestPreviewTransactionRevision,
            ...(authoritativeDocument
              ? { authoritativeDocument: structuredClone(authoritativeDocument) }
              : {}),
          }
        : {}),
    });
  }

  function requestIframeSave(prefix: string): Promise<LodariqDocument | null> {
    const activeBridge = bridge;
    if (!activeBridge || !host.isConnected) {
      return Promise.reject(new Error('Lodariq hosted editor is not connected'));
    }
    const requestCorrelationId = createBridgeCorrelationId(prefix);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingIframeSaveRequests.delete(requestCorrelationId);
        reject(new Error('Lodariq hosted draft save timed out'));
      }, AUTHORING_SAVE_REQUEST_TIMEOUT_MS);
      pendingIframeSaveRequests.set(requestCorrelationId, { reject, resolve, timer });
      try {
        activeBridge.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: requestCorrelationId,
          type: 'authoring.save.request',
        });
      } catch {
        clearTimeout(timer);
        pendingIframeSaveRequests.delete(requestCorrelationId);
        reject(new Error('Lodariq hosted draft save could not start'));
      }
    });
  }

  function saveAndCloseIframeOwned(): Promise<void> {
    if (iframeOwnedClosePromise) return iframeOwnedClosePromise;
    if (!bridge || !host.isConnected) {
      return Promise.reject(new Error('Lodariq hosted editor is not connected'));
    }

    setSaveState('saving', AUTHORING_PANEL_LABELS.savingDraft);
    iframeOwnedClosePromise = flushAutoSave()
      .then(() => autoSaveSequence)
      .then(() => requestIframeSave('authoring_save_before_close'))
      .then(() => requestHostedSessionClose('save-and-exit'))
      .then(() => {
        setSaveState('saved', AUTHORING_PANEL_LABELS.draftSaved);
        destroyPanel();
      })
      .catch(() => {
        const error = new Error('Lodariq hosted draft could not be saved before closing');
        if (host.isConnected) {
          setSaveState('error', 'Save failed · select Save & exit to retry');
          dispatchAuthoringSaveError(error);
        }
        throw error;
      })
      .finally(() => {
        iframeOwnedClosePromise = null;
      });
    return iframeOwnedClosePromise;
  }

  function discardAndCloseIframeOwned(): Promise<void> {
    if (iframeOwnedDiscardPromise) return iframeOwnedDiscardPromise;
    if (!host.isConnected || !iframe.contentWindow) {
      return Promise.reject(new Error('Lodariq hosted editor is not connected'));
    }
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    pendingAutoSave = null;
    setSaveState('saving', AUTHORING_PANEL_LABELS.discardingDraft);
    iframeOwnedDiscardPromise = requestHostedSessionClose('discard')
      .then(destroyPanel)
      .catch(() => {
        const error = new Error('Lodariq hosted session could not be revoked');
        if (host.isConnected) {
          setSaveState('error', 'Could not close · try again');
          dispatchAuthoringSaveError(error);
        }
        throw error;
      })
      .finally(() => {
        iframeOwnedDiscardPromise = null;
      });
    return iframeOwnedDiscardPromise;
  }

  function requestHostedSessionClose(mode: HostedAuthoringSessionCloseMode): Promise<void> {
    if (pendingHostedSessionClose) {
      return Promise.reject(new Error('Lodariq hosted session close is already in progress'));
    }
    const editorWindow = iframe.contentWindow;
    if (!editorWindow || !host.isConnected) {
      return Promise.reject(new Error('Lodariq hosted editor is not connected'));
    }
    const requestId = createBridgeCorrelationId('hosted_session_close');
    const request = validate(HostedAuthoringSessionCloseRequestMessage, {
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
      requestId,
      sessionId: session.sessionId,
      documentId: session.documentId,
      mode,
    });
    if (!request.valid) {
      return Promise.reject(new Error('Lodariq hosted session close request is invalid'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingHostedSessionClose?.requestId !== requestId) return;
        pendingHostedSessionClose = null;
        reject(new Error('Lodariq hosted session close timed out'));
      }, HOSTED_SESSION_CLOSE_TIMEOUT_MS);
      pendingHostedSessionClose = { reject, requestId, resolve, timer };
      try {
        editorWindow.postMessage(request.value, iframeOrigin);
      } catch {
        clearTimeout(timer);
        pendingHostedSessionClose = null;
        reject(new Error('Lodariq hosted session close could not start'));
      }
    });
  }

  function receiveHostedSessionLifecycle(event: MessageEvent): void {
    const editorWindow = iframe.contentWindow;
    if (!editorWindow || event.source !== editorWindow || event.origin !== iframeOrigin) return;
    const result = validate(HostedAuthoringSessionCloseResultMessage, event.data);
    if (
      !result.valid ||
      result.value.type !== HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE ||
      result.value.sessionId !== session.sessionId ||
      result.value.documentId !== session.documentId
    ) {
      return;
    }
    const pending = pendingHostedSessionClose;
    if (!pending || pending.requestId !== result.value.requestId) return;
    pendingHostedSessionClose = null;
    clearTimeout(pending.timer);
    if (result.value.ok) {
      pending.resolve();
      return;
    }
    pending.reject(
      new Error(
        result.value.retryable
          ? 'Lodariq hosted session close can be retried'
          : 'Lodariq hosted session close was rejected',
      ),
    );
  }

  async function persistBeforeClose(document: LodariqDocument | null): Promise<void> {
    if (!pendingSaveBeforeClose) return;
    if (document) {
      previewDocument = structuredClone(document);
      if (options.onSave) {
        pendingAutoSave = {
          document: structuredClone(document),
          generation: ++autoSaveGeneration,
        };
        setSaveState('saving', AUTHORING_PANEL_LABELS.savingDraft);
      }
    }
    clearTimeout(pendingSaveBeforeClose.timer);
    if (closeDrainPromise) return closeDrainPromise;

    closeDrainPromise = drainBeforeClose().finally(() => {
      closeDrainPromise = null;
    });
    return closeDrainPromise;
  }

  async function drainBeforeClose(): Promise<void> {
    while (pendingSaveBeforeClose && host.isConnected) {
      try {
        await flushAutoSave();
      } catch {
        return;
      }
      if (pendingAutoSave) continue;
      if (persistedAutoSaveGeneration < autoSaveGeneration) continue;
      destroyPanel();
    }
  }

  function setSaveState(state: AuthoringSaveState, label: string): void {
    if (state === currentSaveState && label === currentSaveStateLabel) return;
    currentSaveState = state;
    currentSaveStateLabel = label;
    overlayShell?.setPillState({ save: PILL_SAVE_STATE_BY_SAVE_STATE[state] });
    sendSaveStateUpdate();
  }

  function sendSaveStateUpdate(): void {
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_save_state'),
      type: AUTHORING_SAVE_STATE_UPDATE_TYPE,
      state: currentSaveState,
      label: currentSaveStateLabel,
    });
  }

  async function handleTargetPickStart(
    message: Extract<BridgeMessage, { type: 'target.pick.start' }>,
  ): Promise<void> {
    cancelActivePresentationAnchorPick();
    cancelActiveTargetPick();
    if (targetEvidenceUpdateTimer) {
      clearTimeout(targetEvidenceUpdateTimer);
      targetEvidenceUpdateTimer = null;
    }
    pendingTargetEvidenceUpdate = null;
    pendingTargetPickCorrelationId = message.correlationId;
    pendingInlineFocusBlockId = message.blockId;
    const pickedStepId = previewDocument
      ? findContainingTourStepId(previewDocument.blocks, message.blockId)
      : undefined;
    suspendPreviewForTargetPicking(pickedStepId);
    targetPickingRestoreState ??= captureRestoreState();
    setPanelTargetPicking(host, true);
    overlayShell?.setPresentation('picking');

    try {
      const [{ normalizeTargetStateId, startTargetPicker }, { resolve, resolveTargetIdentity }] =
        await Promise.all([
          import('../bridge/target-picker'),
          import('@lodariq/sdk-runtime/resolver'),
        ]);
      if (pendingTargetPickCorrelationId !== message.correlationId || !host.isConnected) {
        return;
      }

      let suggestedResolution: ResolutionResult | null = null;
      if (message.identity) {
        suggestedResolution = resolveTargetIdentity(message.identity);
      } else if (message.fingerprint) {
        suggestedResolution = resolve(message.fingerprint);
      }
      const suggestedTarget =
        suggestedResolution?.state === 'found' ? suggestedResolution.element : null;
      const stateId = normalizeTargetStateId(options.getTargetStateId?.());

      picker = startTargetPicker({
        ...(message.identity ? { initialIdentity: message.identity } : {}),
        ...(message.requiredAction ? { requiredAction: message.requiredAction } : {}),
        ...(stateId ? { stateId } : {}),
        ...(suggestedTarget ? { initialTarget: suggestedTarget } : {}),
        onPick: ({ element, fingerprint, identity, selection }) => {
          if (pendingTargetPickCorrelationId !== message.correlationId) return;
          pendingTargetPickCorrelationId = null;
          picker = null;
          if (pickedStepId) authoringTargetOverrides.set(pickedStepId, element);
          // Tell the shell where the chosen element is. Re-resolving by identity
          // can fail on a freshly picked or ambiguous target, and the chrome must
          // still be placed clear of the thing the creator just pointed at.
          overlayShell?.setTargetRect(domRectAsProtectedSurface(element.getBoundingClientRect()));
          restorePanelAfterTargetPicking(host, targetPickingRestoreState, false);
          targetPickingRestoreState = null;
          const activeBridge = bridge;
          if (!activeBridge) {
            if (pickedStepId) authoringTargetOverrides.delete(pickedStepId);
            pendingInlineFocusBlockId = null;
            restorePreviewAfterTargetPicking();
            return;
          }
          void activeBridge
            .sendWithAck(
              {
                protocol: BRIDGE_PROTOCOL_VERSION,
                sessionId: session.sessionId,
                documentId: session.documentId,
                correlationId: createBridgeCorrelationId('target_pick_result'),
                type: 'target.pick.result',
                blockId: message.blockId,
                fingerprint,
                identity,
                ...(selection ? { selection } : {}),
                captureCorrelationId: message.correlationId,
              },
              { timeoutMs: 2000 },
            )
            .then(() => restorePreviewAfterTargetPicking())
            .catch(() => {
              if (pickedStepId) authoringTargetOverrides.delete(pickedStepId);
              if (pendingInlineFocusBlockId === message.blockId) {
                pendingInlineFocusBlockId = null;
              }
              restorePreviewAfterTargetPicking();
            });
        },
        onEvidenceUpdate: ({ fingerprint, identity }) => {
          queueTargetEvidenceUpdate(message.blockId, message.correlationId, fingerprint, identity);
        },
        onCancel: () => finishTargetPickCancellation(message),
      });
    } catch {
      finishTargetPickCancellation(message);
    }
  }

  async function handlePresentationAnchorPickStart(
    message: Extract<BridgeMessage, { type: 'presentation.anchor.pick.start' }>,
  ): Promise<void> {
    cancelActiveTargetPick();
    cancelActivePresentationAnchorPick();
    pendingPresentationAnchorPick = {
      blockId: message.blockId,
      targetId: message.targetId,
      requestCorrelationId: message.correlationId,
    };
    suspendPreviewForTargetPicking(
      previewDocument
        ? findContainingTourStepId(previewDocument.blocks, message.blockId)
        : undefined,
    );
    presentationAnchorRestoreState ??= captureRestoreState();
    setPanelTargetPicking(host, true);
    overlayShell?.setPresentation('picking');

    try {
      const [{ startPresentationAnchorPicker }, { resolveTarget }] = await Promise.all([
        import('../bridge/presentation-anchor-picker'),
        import('@lodariq/sdk-runtime/resolver'),
      ]);
      if (
        pendingPresentationAnchorPick?.requestCorrelationId !== message.correlationId ||
        !host.isConnected
      ) {
        return;
      }
      const target = previewDocument?.targets.find((item) => item.id === message.targetId);
      const result = target ? resolveTarget(target) : null;
      if (result?.state !== 'found' || !result.element) {
        finishPresentationAnchorCancellation(message);
        return;
      }

      const current =
        message.current &&
        isPresentationAnchor(message.current) &&
        message.current.kind !== 'element-bounds'
          ? message.current
          : undefined;
      const nextPresentationAnchorPicker = startPresentationAnchorPicker({
        owner: result.element,
        ...(current ? { current } : {}),
        onPick: (presentationAnchor) => {
          if (pendingPresentationAnchorPick?.requestCorrelationId !== message.correlationId) return;
          if (!isPresentationAnchor(presentationAnchor)) {
            finishPresentationAnchorCancellation(message);
            return;
          }
          const latestTarget = previewDocument?.targets.find(
            (item) => item.id === message.targetId,
          );
          const confirmed = latestTarget ? resolveTarget(latestTarget) : null;
          if (confirmed?.state !== 'found' || confirmed.element !== result.element) {
            finishPresentationAnchorCancellation(message);
            return;
          }
          pendingPresentationAnchorPick = null;
          presentationAnchorPicker = null;
          restorePanelAfterTargetPicking(host, presentationAnchorRestoreState);
          presentationAnchorRestoreState = null;
          restorePreviewAfterTargetPicking();
          void bridge
            ?.sendWithAck(
              {
                protocol: BRIDGE_PROTOCOL_VERSION,
                sessionId: session.sessionId,
                documentId: session.documentId,
                correlationId: createBridgeCorrelationId('presentation_anchor_pick_result'),
                type: 'presentation.anchor.pick.result',
                requestCorrelationId: message.correlationId,
                blockId: message.blockId,
                targetId: message.targetId,
                presentationAnchor,
              },
              { timeoutMs: 2_000 },
            )
            .catch(() => {});
        },
        onCancel: () => finishPresentationAnchorCancellation(message),
      });
      if (pendingPresentationAnchorPick?.requestCorrelationId === message.correlationId) {
        presentationAnchorPicker = nextPresentationAnchorPicker;
      } else {
        nextPresentationAnchorPicker.cancel();
      }
    } catch {
      finishPresentationAnchorCancellation(message);
    }
  }

  function cancelActivePresentationAnchorPick(): void {
    const pending = pendingPresentationAnchorPick;
    pendingPresentationAnchorPick = null;
    const activePicker = presentationAnchorPicker;
    presentationAnchorPicker = null;
    activePicker?.cancel();
    if (!pending) return;
    restorePanelAfterTargetPicking(host, presentationAnchorRestoreState);
    presentationAnchorRestoreState = null;
    restorePreviewAfterTargetPicking();
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('presentation_anchor_pick_canceled'),
      type: 'presentation.anchor.pick.canceled',
      requestCorrelationId: pending.requestCorrelationId,
      blockId: pending.blockId,
      targetId: pending.targetId,
    });
  }

  function cancelActiveTargetPick(): void {
    const requestCorrelationId = pendingTargetPickCorrelationId;
    const blockId = requestCorrelationId ? pendingInlineFocusBlockId : null;
    pendingTargetPickCorrelationId = null;
    const activePicker = picker;
    picker = null;
    activePicker?.cancel();
    if (!requestCorrelationId) return;
    if (targetEvidenceUpdateTimer) {
      clearTimeout(targetEvidenceUpdateTimer);
      targetEvidenceUpdateTimer = null;
    }
    pendingTargetEvidenceUpdate = null;
    restorePanelAfterTargetPicking(host, targetPickingRestoreState);
    targetPickingRestoreState = null;
    restorePreviewAfterTargetPicking();
    pendingInlineFocusBlockId = null;
    if (!blockId) return;
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('target_pick_canceled'),
      type: 'target.pick.canceled',
      blockId,
    });
  }

  function finishPresentationAnchorCancellation(
    message: Extract<BridgeMessage, { type: 'presentation.anchor.pick.start' }>,
  ): void {
    if (pendingPresentationAnchorPick?.requestCorrelationId !== message.correlationId) return;
    pendingPresentationAnchorPick = null;
    presentationAnchorPicker = null;
    restorePanelAfterTargetPicking(host, presentationAnchorRestoreState);
    presentationAnchorRestoreState = null;
    restorePreviewAfterTargetPicking();
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('presentation_anchor_pick_canceled'),
      type: 'presentation.anchor.pick.canceled',
      requestCorrelationId: message.correlationId,
      blockId: message.blockId,
      targetId: message.targetId,
    });
  }

  function finishTargetPickCancellation(
    message: Extract<BridgeMessage, { type: 'target.pick.start' }>,
  ): void {
    if (pendingTargetPickCorrelationId !== message.correlationId) return;
    pendingTargetPickCorrelationId = null;
    picker = null;
    restorePanelAfterTargetPicking(host, targetPickingRestoreState);
    targetPickingRestoreState = null;
    restorePreviewAfterTargetPicking();
    if (pendingInlineFocusBlockId === message.blockId) pendingInlineFocusBlockId = null;
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('target_pick_canceled'),
      type: 'target.pick.canceled',
      blockId: message.blockId,
    });
  }

  async function handleTargetInspect(
    message: Extract<BridgeMessage, { type: 'target.inspect.request' }>,
  ): Promise<void> {
    const requestBridge = bridge;
    if (!requestBridge) return;
    const diagnostic = await inspectTarget(
      message.fingerprint,
      message.action,
      message.targetId,
      message.identity,
    );
    if (bridge !== requestBridge || !host.isConnected) return;
    void requestBridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('target_inspect_result'),
          type: 'target.inspect.result',
          requestCorrelationId: message.correlationId,
          blockId: message.blockId,
          targetId: message.targetId,
          action: message.action,
          diagnostic,
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {});
  }

  return panel;
}

function authoringSessionKey(session: AuthoringSession): string {
  return [session.workspaceId, session.environment, session.documentId, session.sessionId].join(
    ':',
  );
}

function choreographyDiagnosticName(
  status: ChoreographyStageUpdate['status'],
): AuthoringDiagnosticEventName | null {
  const names: Partial<Record<ChoreographyStageUpdate['status'], AuthoringDiagnosticEventName>> = {
    started: 'choreography.stage-started',
    completed: 'choreography.stage-satisfied',
    timed_out: 'choreography.stage-timed-out',
  };
  return names[status] ?? null;
}

function previewThemeMatchesSession(
  candidate: BrandThemeSnapshot,
  initial: BrandThemeSnapshot,
): boolean {
  return (
    candidate.themeId === initial.themeId &&
    candidate.schemaVersion === initial.schemaVersion &&
    candidate.contractVersion === initial.contractVersion
  );
}

/** Long enough to read a sentence; it is the only thing that explains the mode. */
const COACH_TIP_MS = 9_000;
/** After the chrome has settled, so it does not land mid-paint. */
const COACH_TIP_DELAY_MS = 700;

/** Names the common cause rather than printing an exception at the creator. */
function previewFailureMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  return name === 'TourPresentationUnavailableError' &&
    message.includes('target could not be resolved')
    ? authoringText('Preview stopped: this step points at something that is not on this page.')
    : authoringText('Preview could not start.');
}

function adaptiveSkipPreviewMessage(stepId: string, decision: AdaptiveStepDecision): string {
  return authoringText('Adaptive preview skipped {stepId}: {eventName} happened {count} times.', {
    stepId,
    eventName: decision.eventName ?? authoringText('the declared event'),
    count: decision.occurrences,
  });
}

function dispatchHostedCreatorPanelState(state: HostedCreatorPanelState): void {
  window.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_STATE_EVENT, { detail: state }));
}

function presentationAnchorHostMessageMatches(
  message: Extract<BridgeMessage, { type: 'presentation.anchor.pick.canceled' }>,
  pending: {
    blockId: string;
    targetId: string;
    requestCorrelationId: string;
  } | null,
): boolean {
  return Boolean(
    pending &&
    pending.requestCorrelationId === message.requestCorrelationId &&
    pending.blockId === message.blockId &&
    pending.targetId === message.targetId,
  );
}

export async function saveAndCloseActiveLocalAuthoringPanel(): Promise<void> {
  await activePanel?.saveAndClose();
}

function dispatchAuthoringSaveError(error: unknown): void {
  window.dispatchEvent(
    new CustomEvent('lodariq:authoring-save-error', {
      detail: { error },
    }),
  );
}
