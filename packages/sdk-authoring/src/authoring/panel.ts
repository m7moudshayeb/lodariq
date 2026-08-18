import {
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
  AUTHORING_CHROME_ACTION_REQUEST_TYPE,
  AUTHORING_SHELL_PRESENTATION_TYPE,
  AUTHORING_SHELL_STEP_COMMAND_TYPE,
  AUTHORING_SHELL_POPUP_SIZE_COMMIT_TYPE,
  AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
  AUTHORING_SAVE_STATE_UPDATE_TYPE,
  AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE,
  AUTHORING_BROWSER_VERIFY_REQUEST_TYPE,
  AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
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
  type AuthoringInlineControlOperation,
  type AuthoringShellStepCommand,
  type AuthoringAccessibilityPreviewMode,
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
} from '@lodariq/schema';
import { applyAuthoringLocale, authoringText, currentAuthoringLocale } from '../i18n';
import { AUTHORING_LOCALE_QUERY_PARAMETER } from '@lodariq/schema/authoring-entry-runtime';
import type { ResolutionResult } from '@lodariq/sdk-runtime/resolver';
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
import type { OverlayShell } from './overlay/types';
import { tooltipOfStep, tourStepsOf } from './overlay/filmstrip';
import type { OverlayPlacement } from './canvas/edge-resize';
import {
  AUTHORING_AUTOSAVE_DEBOUNCE_MS,
  AUTHORING_AUTOSAVE_MAX_RETRIES,
  AUTHORING_AUTOSAVE_RETRY_MS,
  AUTHORING_PANEL_LABELS,
  AUTHORING_SAVE_REQUEST_TIMEOUT_MS,
  HOSTED_SESSION_CLOSE_TIMEOUT_MS,
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
import { LOCAL_AUTHORING_PANEL_TOGGLE_EVENT } from './constants';
import { findContainingTourStepId, resolvePreviewStepId } from './preview-step-state';
import {
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
  preview?: LocalAuthoringPreviewServices;
  release?: LocalAuthoringReleaseServices;
  onSave?: (document: LodariqDocument) => Promise<void> | void;
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
  /** Exact live selection for immediate creator preview; never persisted. */
  authoringTargetOverride?: { stepId: string; element: Element };
  onStepChange?: (index: number, stepId: string) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  onSkip?: () => void;
  onChoreographyStageChange?: (stepId: string, update: ChoreographyStageUpdate) => void;
  onChoreographyRecovery?: (stepId: string, update: ChoreographyRecoveryUpdate) => void;
  onBranchChoice?: (stepId: string, ruleIndex: number | null, destination: string) => void;
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
            await playPreviewDocument(pendingInlinePreviewStepId(), true);
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
  let currentHeaderStepId =
    previewDocument?.blocks.find((block) => block.type === 'tourStep')?.id ?? null;
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
    onClose: () => close(),
    onCollapse: () => collapseOverlayEditor(),
    onExitPreview: () => {
      stopOwnedPreview();
      host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
      restore();
    },
    onMoveStep: (stepId, direction) =>
      sendShellStepCommand(direction === 'up' ? 'move-up' : 'move-down', stepId),
    onCloseOperations: () => closeOperations(),
    onOpenOperations: () => openOperations(),
    onPlacementCommit: (blockId, placement) => commitOverlayPlacement(blockId, placement),
    onPopupSizeCommit: (widthPx, heightPx) => commitOverlayPopupSize(widthPx, heightPx),
    onRetarget: () => sendShellStepCommand('retarget', currentHeaderStepId ?? undefined),
    onSelectStep: (stepId) => selectOverlayStep(stepId),
    onTitleCommit: (title) => commitOverlayTitle(title),
  });
  overlayShell.setDocument(previewDocument, previewDocument?.title ?? authoringText('Untitled experience'));
  overlayShell.setActiveStepId(currentHeaderStepId);
  overlayShell.setPresentation('overlay');
  const panelDocumentTitle = shadow.querySelector<HTMLInputElement>('[data-panel-document-title]');

  const syncPanelStepStatus = (): void => {
    const steps = previewDocument?.blocks.filter((block) => block.type === 'tourStep') ?? [];
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

  const restore = (): void => {
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
    if (preview && previewDocument) {
      void playPreviewDocument(pendingInlinePreviewStepId());
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
            return playPreviewDocument(pendingInlinePreviewStepId(), true);
          }
          return;
        }
        if (message.type === 'authoring.preview.request') {
          previewContentLocale = message.locale ?? previewContentLocale;
          if (message.mode === 'step') {
            pendingInlineFocusBlockId = message.stepId;
            currentHeaderStepId = message.stepId;
            syncPanelStepStatus();
          } else {
            host.setAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE, 'true');
            overlayShell?.setPresentation('previewing');
            setAuthoringTriggerPanelState('minimized');
          }
          return playPreviewDocument(
            message.mode === 'step' ? message.stepId : message.initialStepId,
            true,
            message.mode === 'full',
            message.mode === 'full' ? message.accessibilityMode : undefined,
            message.mode === 'full' ? message.simulationContext : undefined,
          );
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
      const firstStepId = previewDocument?.blocks.find((block) => block.type === 'tourStep')?.id;
      pendingInlineFocusBlockId = firstStepId ?? null;
      if (firstStepId) void playPreviewDocument(firstStepId);
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
        'verification_failed',
        authoringText('The exact staging artifact could not be verified.'),
      );
    } finally {
      host.style.visibility = previousVisibility;
      schedulePanelFocusRestore(restoreState.focusedElement, null);
      if (resumeDraftPreview) void playPreviewDocument(pendingInlinePreviewStepId());
    }
  }

  function sendHostOperationFailure(
    activeBridge: AuthoringBridge,
    requestCorrelationId: string,
    code: string,
    message: string,
  ): void {
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_host_operation_result'),
      type: AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
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
    if (ops.some((operation) => operation.op === 'replaceDocument')) {
      authoringTargetOverrides.clear();
    } else if (
      affectedStepId &&
      ops.some((operation) => operation.op === 'removeBlock' || operation.op === 'removeTarget')
    ) {
      authoringTargetOverrides.delete(affectedStepId);
    }
    previewDocument = applyPreviewPatch(current, blockId, ops, locale);
    overlayShell?.setDocument(previewDocument, previewDocument.title);
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
    if (panelDocumentTitle && panelDocumentTitle !== shadow.activeElement) {
      panelDocumentTitle.value = previewDocument.title;
    }
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
    void playPreviewDocument(stepId);
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

  function collapseOverlayEditor(): void {
    overlayShell?.setPresentation('collapsed');
    sendShellStepCommand('collapse', currentHeaderStepId ?? undefined);
  }

  function openOperations(): void {
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
    });
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

  function commitOverlayPlacement(blockId: string, placement: OverlayPlacement): void {
    const activeBridge = bridge;
    if (!activeBridge) return;
    const operation: AuthoringInlineControlOperation = {
      kind: 'setPlacement',
      blockId,
      placement,
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

  function commitOverlayPopupSize(widthPx: number, heightPx: number): void {
    const activeBridge = bridge;
    const step = tourStepsOf(previewDocument).find((item) => item.id === currentHeaderStepId);
    const tooltipId = step ? tooltipOfStep(step)?.id : undefined;
    if (!activeBridge || !tooltipId) return;
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_overlay_popup_size'),
      type: AUTHORING_SHELL_POPUP_SIZE_COMMIT_TYPE,
      blockId: tooltipId,
      widthPx,
      heightPx,
    });
  }

  function selectOverlayStep(stepId: string): void {
    currentHeaderStepId = stepId;
    overlayShell?.setActiveStepId(stepId);
    overlayShell?.setPresentation('overlay');
    sendShellStepCommand('select', stepId);
    void playPreviewDocument(stepId);
  }

  function commitOverlayTitle(title: string): void {
    const currentTitle = previewDocument?.title ?? 'Untitled experience';
    const next = title.trim() || 'Untitled experience';
    if (panelDocumentTitle) panelDocumentTitle.value = next;
    if (next === currentTitle) return;
    const activeBridge = bridge;
    if (!activeBridge) {
      if (panelDocumentTitle) panelDocumentTitle.value = currentTitle;
      return;
    }
    setSaveState('saving', AUTHORING_PANEL_LABELS.savingDraft);
    void activeBridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_document_title_commit'),
          type: AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
          operation: { kind: 'setDocumentTitle', title: next },
        },
        { timeoutMs: 2_000 },
      )
      .catch((error) => {
        if (panelDocumentTitle) {
          panelDocumentTitle.value = previewDocument?.title ?? currentTitle;
        }
        setSaveState('error', 'Title could not be saved');
        preview?.onPreviewError?.(error);
      });
  }

  function playPreviewDocument(
    stepId?: string,
    rejectOnFailure = false,
    interactive = false,
    accessibilityMode?: AuthoringAccessibilityPreviewMode,
    flowConditionContext?: LocalAuthoringPreviewOptions['flowConditionContext'],
  ): Promise<void> {
    if (!preview || !previewDocument) {
      return rejectOnFailure
        ? Promise.reject(new Error('Lodariq preview runtime is unavailable'))
        : Promise.resolve();
    }
    if (
      stepId &&
      previewDocument.blocks.some((block) => block.type === 'tourStep' && block.id === stepId)
    ) {
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
      .then((compiled) => {
        if (requestId !== previewRequestId || !host.isConnected) return;
        if (compiled.steps.length === 0) {
          stopOwnedPreview();
          previewPending = false;
          previewPresented = false;
          return;
        }
        const previewStepId = stepId ?? compiled.steps[0]?.id;
        previewPathStepIds = previewStepId ? [previewStepId] : [];
        const selectedElement = previewStepId
          ? authoringTargetOverrides.get(previewStepId)
          : undefined;
        if (previewStepId && selectedElement && !selectedElement.isConnected) {
          authoringTargetOverrides.delete(previewStepId);
        }
        const previewOptions: LocalAuthoringPreviewOptions = {
          ownerId: previewOwnerId,
          locale: previewContentLocale,
          ...(interactive ? { interactive: true } : {}),
          ...(accessibilityMode ? { accessibilityMode } : {}),
          ...(flowConditionContext ? { flowConditionContext } : {}),
          ...(interactive
            ? {
                onStepChange: (index: number, runtimeStepId: string) => {
                  if (requestId !== previewRequestId) return;
                  if (previewPathStepIds[previewPathStepIds.length - 1] !== runtimeStepId) {
                    previewPathStepIds.push(runtimeStepId);
                  }
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
          host.removeAttribute(AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE);
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
    void playPreviewDocument(suspended.stepId);
  }

  function stopOwnedPreview(): void {
    previewRequestId += 1;
    previewPending = false;
    previewPresented = false;
    previewPathStepIds = [];
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
        onPick: ({ element, fingerprint, identity }) => {
          if (pendingTargetPickCorrelationId !== message.correlationId) return;
          pendingTargetPickCorrelationId = null;
          picker = null;
          if (pickedStepId) authoringTargetOverrides.set(pickedStepId, element);
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
    setPanelTargetPicking(host, true, AUTHORING_PANEL_LABELS.selectExactArea);
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
