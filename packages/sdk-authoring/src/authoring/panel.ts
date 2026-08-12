import {
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
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
  type AuthoringSaveState,
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
import type { ResolutionResult } from '@lodariq/sdk-runtime/resolver';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import type { InlinePreviewEditor } from './inline-preview-editor';
import { ZoomIn } from 'lucide';
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
import { createAuthoringDomCombobox, type AuthoringDomCombobox } from './dom-combobox';
import { createPanelStyles } from './panel-styles';
import { clearTargetReveal, inspectTarget, startPageLifecycleObserver } from './page-context';
import { applyPreviewPatch, inlinePreviewControlContext } from './preview-document';
import {
  AUTHORING_AUTOSAVE_DEBOUNCE_MS,
  AUTHORING_AUTOSAVE_MAX_RETRIES,
  AUTHORING_AUTOSAVE_RETRY_MS,
  AUTHORING_COLLAPSED_PANEL_HEIGHT,
  AUTHORING_PANEL_HEADER_HEIGHT,
  AUTHORING_PANEL_LABELS,
  AUTHORING_PANEL_LAYOUT_OPTIONS,
  AUTHORING_PANEL_ZOOM_OPTIONS,
  AUTHORING_SAVE_REQUEST_TIMEOUT_MS,
  DEFAULT_AUTHORING_PANEL_HEIGHT,
  DEFAULT_AUTHORING_PANEL_LAYOUT,
  DEFAULT_AUTHORING_PANEL_WIDTH,
  DEFAULT_AUTHORING_PANEL_ZOOM,
  HOSTED_SESSION_CLOSE_TIMEOUT_MS,
  type AuthoringPanelLayoutChoice,
  type AuthoringPanelRestoreState,
  type AuthoringPanelZoomValue,
} from './panel-config';
import {
  activePanelFocusElement,
  applyAuthoringPanelLayout,
  applyClampedAuthoringPanelGeometry,
  attachPanelDrag,
  attachPanelResize,
  authoringPanelLayoutMode,
  panelZoomValue,
  positionInitialAuthoringPanel,
  readAuthoringPanelGeometry,
  restorePanelAfterTargetPicking,
  schedulePanelFocusRestore,
  setAuthoringPanelIcon,
  setAuthoringPanelOpenState,
  setAuthoringTriggerPanelState,
  setMinimizeButtonState,
  setPanelTargetPicking,
  startPanelViewportSync,
} from './panel-geometry';
import { LOCAL_AUTHORING_PANEL_TOGGLE_EVENT } from './constants';
import { findContainingTourStepId, resolvePreviewStepId } from './preview-step-state';
import {
  AUTHORING_PANEL_LAYOUT_ATTRIBUTE,
  AUTHORING_PANEL_MINIMIZED_ATTRIBUTE,
  AUTHORING_TARGET_PICKING_ATTRIBUTE,
} from './panel-attributes';

/**
 * Authoring shell (PRD §9.4).
 *
 * Loaded ONLY for authenticated creators entering authoring mode. Owns the
 * floating toolbar, element picker handoff, and the sandboxed iframe editor
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
  autoPreview?: boolean;
  preview?: LocalAuthoringPreviewServices;
  onClose?: () => void;
}

export interface LocalAuthoringPreviewOptions {
  /** Exact owner used to mark and isolate this panel's creator preview. */
  ownerId: string;
  /** Full-tour preview mode enables the experience's real step controls. */
  interactive?: boolean;
  stepId?: string;
  /** Exact live selection for immediate creator preview; never persisted. */
  authoringTargetOverride?: { stepId: string; element: Element };
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
    url.search !== '' ||
    url.hash !== '' ||
    iframe.referrerPolicy !== 'origin' ||
    sandboxTokens.size !== 2 ||
    !sandboxTokens.has('allow-scripts') ||
    !sandboxTokens.has('allow-same-origin')
  ) {
    throw new Error('Lodariq hosted editor iframe is invalid');
  }
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
        'Another Lodariq draft is already open. Save and exit before opening a different experience.',
      );
    } else {
      currentPanel.restore();
      return currentPanel;
    }
  }

  const host = document.createElement('lodariq-authoring-panel');
  host.setAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE, DEFAULT_AUTHORING_PANEL_LAYOUT);
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
  let previewPending = false;
  let previewPresented = false;
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
  let stopPanelViewportSync: (() => void) | null = null;
  let stopPanelDrag: (() => void) | null = null;
  let stopPanelResize: (() => void) | null = null;
  let stopPanelChrome: (() => void) | null = null;
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
  const pendingIframeSaveRequests = new Map<string, PendingIframeSaveRequest>();

  shadow.appendChild(
    createPanelStyles({
      defaultHeight: DEFAULT_AUTHORING_PANEL_HEIGHT,
      defaultWidth: DEFAULT_AUTHORING_PANEL_WIDTH,
      headerHeight: AUTHORING_PANEL_HEADER_HEIGHT,
    }),
  );
  const panelElement = document.createElement('section');
  panelElement.className = 'panel';
  panelElement.setAttribute('role', 'dialog');
  panelElement.setAttribute('aria-label', 'Lodariq authoring');
  panelElement.innerHTML = `
    <header class="authoring-bar">
      <div
        class="panel-drag-handle"
        role="button"
        tabindex="0"
        aria-label="${AUTHORING_PANEL_LABELS.movePanel}"
        title="Drag to move the authoring panel"
      >
        <span class="panel-drag-grip" data-panel-icon="drag" aria-hidden="true"></span>
        <span class="target-picking-label">${AUTHORING_PANEL_LABELS.selectTarget}</span>
      </div>
      <span class="panel-heading">
        <span class="panel-title-cluster">
          <input
            class="panel-document-title"
            data-panel-document-title
            aria-label="Experience title"
            value="${escapeAuthoringText(previewDocument?.title ?? 'Untitled experience')}"
          />
          <span class="panel-step-status" data-panel-step-status></span>
        </span>
      </span>
      <div class="authoring-bar-actions">
        <div data-panel-zoom-control></div>
        <div data-panel-layout-control></div>
        <button
          type="button"
          class="header-action"
          data-panel-action="minimize"
          data-tooltip="${AUTHORING_PANEL_LABELS.minimize}"
          aria-label="${AUTHORING_PANEL_LABELS.minimize}"
          title="${AUTHORING_PANEL_LABELS.minimize}"
        >
          <span class="header-action-icon" data-panel-icon="minimize" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="header-action"
          data-panel-action="close-panel"
          data-tooltip="${AUTHORING_PANEL_LABELS.close}"
          aria-label="${AUTHORING_PANEL_LABELS.close}"
          title="${AUTHORING_PANEL_LABELS.close}"
        >
          <span class="header-action-icon" data-panel-icon="close" aria-hidden="true"></span>
        </button>
      </div>
    </header>
    <div class="panel-surface">
      <slot name="authoring-frame"></slot>
    </div>
    <button
      type="button"
      class="panel-resize-handle"
      data-panel-action="resize"
      aria-label="Resize Lodariq authoring panel. Use arrow keys to resize it."
      title="Drag to resize the authoring panel"
    >
      <svg class="panel-resize-icon" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M3.5 15.5 15.5 3.5M8.5 15.5l7-7M13.5 15.5l2-2"></path>
      </svg>
    </button>
  `;
  shadow.appendChild(panelElement);

  const iframe = options.adoptedIframe ?? document.createElement('iframe');
  iframe.slot = 'authoring-frame';
  iframe.title = 'Lodariq authoring';
  if (!options.adoptedIframe) {
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.setAttribute('src', iframeSrc);
  }
  host.appendChild(iframe);

  const panelCloseButton = shadow.querySelector<HTMLButtonElement>(
    '[data-panel-action="close-panel"]',
  );
  const panelCloseIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="close"]');
  const panelDragIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="drag"]');
  const minimizeButton = shadow.querySelector<HTMLButtonElement>('[data-panel-action="minimize"]');
  const minimizeIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="minimize"]');
  const panelLayoutControlSlot = shadow.querySelector<HTMLElement>('[data-panel-layout-control]');
  const panelZoomControlSlot = shadow.querySelector<HTMLElement>('[data-panel-zoom-control]');
  const panelDragHandle = shadow.querySelector<HTMLElement>('.panel-drag-handle');
  const panelDragSurface = shadow.querySelector<HTMLElement>('.authoring-bar');
  const panelResizeHandle = shadow.querySelector<HTMLButtonElement>('.panel-resize-handle');
  const panelDocumentTitle = shadow.querySelector<HTMLInputElement>('[data-panel-document-title]');
  const panelStepStatus = shadow.querySelector<HTMLElement>('[data-panel-step-status]');

  setAuthoringPanelIcon(panelCloseIcon, 'close');
  setAuthoringPanelIcon(panelDragIcon, 'drag');
  setMinimizeButtonState(minimizeButton, minimizeIcon, false);

  const syncPanelStepStatus = (): void => {
    if (!panelStepStatus) return;
    const steps = previewDocument?.blocks.filter((block) => block.type === 'tourStep') ?? [];
    if (!steps.length) {
      panelStepStatus.textContent = 'No steps';
      return;
    }
    const currentIndex = steps.findIndex((step) => step.id === currentHeaderStepId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    currentHeaderStepId = steps[safeIndex]?.id ?? null;
    panelStepStatus.textContent = `Step ${safeIndex + 1} of ${steps.length}`;
  };

  syncPanelStepStatus();

  let panelLayoutControl: AuthoringDomCombobox<AuthoringPanelLayoutChoice> | null = null;
  const syncPanelLayoutControl = (): void => {
    const rawLayout = host.getAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE);
    const activeLayout: AuthoringPanelLayoutChoice =
      rawLayout === 'custom'
        ? 'custom'
        : (authoringPanelLayoutMode(rawLayout ?? undefined) ?? 'standard');
    panelLayoutControl?.setValue(activeLayout);
    const selectedOption = AUTHORING_PANEL_LAYOUT_OPTIONS.find(
      (option) => option.value === activeLayout,
    );
    const trigger = panelLayoutControl?.element.querySelector<HTMLButtonElement>(
      '[data-panel-action="layout"]',
    );
    if (trigger && selectedOption) {
      trigger.setAttribute('aria-label', `Workspace width: ${selectedOption.label}`);
      trigger.title = `Workspace width: ${selectedOption.label}`;
    }
  };
  if (panelLayoutControlSlot) {
    panelLayoutControl = createAuthoringDomCombobox<AuthoringPanelLayoutChoice>({
      document,
      initialValue: DEFAULT_AUTHORING_PANEL_LAYOUT,
      items: AUTHORING_PANEL_LAYOUT_OPTIONS,
      label: 'Workspace width',
      omitSelectedOption: true,
      showSelectionIndicator: false,
      controlIdPrefix: 'lodariq-panel-layout',
      classNames: {
        root: 'panel-layout-combobox',
        trigger: 'panel-layout-trigger',
        triggerIcon: 'panel-layout-trigger-icon',
        value: 'panel-layout-value',
        chevron: 'panel-layout-chevron',
        listbox: 'panel-layout-listbox',
        option: 'panel-layout-option',
        optionIcon: 'panel-layout-option-icon',
        check: 'panel-layout-check',
      },
      onChange: (value) => {
        const mode = authoringPanelLayoutMode(value);
        if (!mode) return;
        applyAuthoringPanelLayout(host, mode);
        syncPanelLayoutControl();
      },
    });
    const trigger =
      panelLayoutControl.element.querySelector<HTMLButtonElement>('.panel-layout-trigger');
    trigger?.setAttribute('data-panel-action', 'layout');
    for (const option of panelLayoutControl.element.querySelectorAll<HTMLButtonElement>(
      '.panel-layout-option',
    )) {
      const mode = authoringPanelLayoutMode(option.dataset['value']);
      if (mode) option.dataset['panelLayout'] = mode;
    }
    panelLayoutControlSlot.replaceWith(panelLayoutControl.element);
    syncPanelLayoutControl();
  }

  const applyPanelZoom = (value: AuthoringPanelZoomValue): void => {
    const zoom = Number(value) / 100;
    iframe.style.transform = `scale(${zoom})`;
    iframe.style.transformOrigin = 'top left';
    iframe.style.width = `${100 / zoom}%`;
    iframe.style.height = `${100 / zoom}%`;
    iframe.dataset['lodariqEditorZoom'] = value;
  };
  let panelZoomControl: AuthoringDomCombobox<AuthoringPanelZoomValue> | null = null;
  if (panelZoomControlSlot) {
    panelZoomControl = createAuthoringDomCombobox<AuthoringPanelZoomValue>({
      document,
      initialValue: DEFAULT_AUTHORING_PANEL_ZOOM,
      items: AUTHORING_PANEL_ZOOM_OPTIONS,
      label: 'Canvas zoom',
      omitSelectedOption: true,
      showSelectionIndicator: false,
      triggerIcon: ZoomIn,
      controlIdPrefix: 'lodariq-panel-zoom',
      classNames: {
        root: 'panel-zoom-combobox',
        trigger: 'panel-zoom-trigger',
        triggerIcon: 'panel-zoom-trigger-icon',
        value: 'panel-zoom-value',
        chevron: 'panel-zoom-chevron',
        listbox: 'panel-zoom-listbox',
        option: 'panel-zoom-option',
        optionIcon: 'panel-zoom-option-icon',
        check: 'panel-zoom-check',
      },
      onChange: (value) => {
        applyPanelZoom(value);
        const trigger = panelZoomControl?.element.querySelector<HTMLButtonElement>(
          '[data-panel-action="zoom"]',
        );
        if (trigger) {
          trigger.setAttribute('aria-label', `Canvas zoom: ${value}%`);
          trigger.title = `Canvas zoom: ${value}%`;
        }
      },
    });
    const trigger =
      panelZoomControl.element.querySelector<HTMLButtonElement>('.panel-zoom-trigger');
    trigger?.setAttribute('data-panel-action', 'zoom');
    if (trigger) {
      trigger.setAttribute('aria-label', 'Canvas zoom: 100%');
      trigger.title = 'Canvas zoom: 100%';
    }
    for (const option of panelZoomControl.element.querySelectorAll<HTMLButtonElement>(
      '.panel-zoom-option',
    )) {
      const value = panelZoomValue(option.dataset['value']);
      if (value) option.dataset['panelZoom'] = value;
    }
    panelZoomControlSlot.replaceWith(panelZoomControl.element);
  }
  applyPanelZoom(DEFAULT_AUTHORING_PANEL_ZOOM);

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
    stopPanelDrag?.();
    stopPanelDrag = null;
    stopPanelResize?.();
    stopPanelResize = null;
    stopPanelViewportSync?.();
    stopPanelViewportSync = null;
    stopPanelChrome?.();
    stopPanelChrome = null;
    panelLayoutControl?.cleanup();
    panelLayoutControl = null;
    panelZoomControl?.cleanup();
    panelZoomControl = null;
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
    geometry: readAuthoringPanelGeometry(host),
  });

  const minimize = (): void => {
    if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) return;
    if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) return;
    panelLayoutControl?.close();
    panelZoomControl?.close();
    minimizedRestoreState = captureRestoreState();
    host.setAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE, 'true');
    const minimizedGeometry = {
      ...minimizedRestoreState.geometry,
      height: AUTHORING_COLLAPSED_PANEL_HEIGHT,
    };
    applyClampedAuthoringPanelGeometry(host, minimizedGeometry, 'minimized');
    setMinimizeButtonState(minimizeButton, minimizeIcon, true);
    setAuthoringTriggerPanelState('minimized');
    if (options.persistenceOwner === 'iframe') dispatchHostedCreatorPanelState('minimized');
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
    if (restoreState) {
      applyClampedAuthoringPanelGeometry(host, restoreState.geometry, 'open');
      schedulePanelFocusRestore(restoreState.focusedElement, panelDragHandle);
    } else {
      positionInitialAuthoringPanel(host);
    }
    minimizedRestoreState = null;
    setMinimizeButtonState(minimizeButton, minimizeIcon, false);
    setAuthoringTriggerPanelState('open');
    if (options.persistenceOwner === 'iframe') dispatchHostedCreatorPanelState('open');
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

  const commitPanelDocumentTitle = (): void => {
    if (!panelDocumentTitle) return;
    const currentTitle = previewDocument?.title ?? 'Untitled experience';
    const title = panelDocumentTitle.value.trim() || 'Untitled experience';
    panelDocumentTitle.value = title;
    if (title === currentTitle) return;
    const activeBridge = bridge;
    if (!activeBridge) {
      panelDocumentTitle.value = currentTitle;
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
          operation: { kind: 'setDocumentTitle', title },
        },
        { timeoutMs: 2_000 },
      )
      .catch((error) => {
        panelDocumentTitle.value = previewDocument?.title ?? currentTitle;
        setSaveState('error', 'Title could not be saved');
        preview?.onPreviewError?.(error);
      });
  };
  panelDocumentTitle?.addEventListener('blur', commitPanelDocumentTitle);
  panelDocumentTitle?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      panelDocumentTitle.blur();
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    panelDocumentTitle.value = previewDocument?.title ?? 'Untitled experience';
    panelDocumentTitle.blur();
  });

  panelCloseButton?.addEventListener('click', close);
  minimizeButton?.addEventListener('click', () => {
    if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) restore();
    else minimize();
  });
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
  stopPanelDrag = attachPanelDrag(host, panelDragSurface, panelDragHandle);
  stopPanelResize = attachPanelResize(host, panelResizeHandle, syncPanelLayoutControl);
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
        if (message.type === AUTHORING_PANEL_LAYOUT_REQUEST_TYPE) {
          applyAuthoringPanelLayout(host, message.mode);
          syncPanelLayoutControl();
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
          if (message.mode === 'step') {
            pendingInlineFocusBlockId = message.stepId;
            currentHeaderStepId = message.stepId;
            syncPanelStepStatus();
          } else {
            minimize();
          }
          return playPreviewDocument(
            message.mode === 'step' ? message.stepId : undefined,
            true,
            message.mode === 'full',
          );
        }
        if (message.type === 'preview.patch') {
          return queuePreview(message.blockId, message.patch.ops);
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
    stopLifecycleObserver = startPageLifecycleObserver(bridge, session);
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
          message: 'Staging release state could not be loaded',
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
      applyClampedAuthoringPanelGeometry(host, restoreState.geometry, 'open');
      schedulePanelFocusRestore(restoreState.focusedElement, panelDragHandle);
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
        'Exact staging verification is unavailable on this page.',
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
        'The exact staging artifact could not be verified.',
      );
    } finally {
      host.style.visibility = previousVisibility;
      applyClampedAuthoringPanelGeometry(host, restoreState.geometry, 'open');
      schedulePanelFocusRestore(restoreState.focusedElement, panelDragHandle);
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
  positionInitialAuthoringPanel(host);
  stopPanelViewportSync = startPanelViewportSync(host);
  activePanel = panel;
  activePanelHost = host;
  activePanelSessionKey = sessionKey;
  if (options.persistenceOwner === 'iframe') dispatchHostedCreatorPanelState('open');
  if (options.adoptedIframe) connectIframe();

  function queuePreview(blockId: string, ops: PreviewPatchOperation[]): Promise<void> | void {
    const current = previewDocument ?? preview?.loadDocument(session.documentId) ?? null;
    if (!current) return;

    const affectedStepId = findContainingTourStepId(current.blocks, blockId);
    if (ops.some((operation) => operation.op === 'replaceDocument')) {
      authoringTargetOverrides.clear();
    } else if (
      affectedStepId &&
      ops.some((operation) => operation.op === 'removeBlock' || operation.op === 'removeTarget')
    ) {
      authoringTargetOverrides.delete(affectedStepId);
    }
    previewDocument = applyPreviewPatch(current, blockId, ops);
    syncPanelStepStatus();
    scheduleAutoSave(previewDocument);
    const persistence = ops.some((operation) => operation.op === 'removeTarget')
      ? flushAutoSave()
      : undefined;
    if (panelDocumentTitle && panelDocumentTitle !== shadow.activeElement) {
      panelDocumentTitle.value = previewDocument.title;
    }
    if (!preview) return persistence;
    if (ops.every((operation) => operation.op === 'updateTargetEvidence')) return persistence;
    const contentOnlyPatch = ops.every((operation) => operation.op === 'updateContent');
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

  function playPreviewDocument(
    stepId?: string,
    rejectOnFailure = false,
    interactive = false,
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
        const selectedElement = previewStepId
          ? authoringTargetOverrides.get(previewStepId)
          : undefined;
        if (previewStepId && selectedElement && !selectedElement.isConnected) {
          authoringTargetOverrides.delete(previewStepId);
        }
        const previewOptions: LocalAuthoringPreviewOptions = {
          ownerId: previewOwnerId,
          ...(interactive ? { interactive: true } : {}),
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
        preview.onPreviewError?.(error);
        if (rejectOnFailure) throw error;
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
    if (!suspended || !host.isConnected) return;
    void playPreviewDocument(suspended.stepId);
  }

  function stopOwnedPreview(): void {
    previewRequestId += 1;
    previewPending = false;
    previewPresented = false;
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

  function scheduleAutoSave(document: LodariqDocument): void {
    if (options.persistenceOwner === 'host' && !options.onSave) {
      setSaveState('saved', AUTHORING_PANEL_LABELS.draftSaved);
      return;
    }
    pendingAutoSave = {
      document: structuredClone(document),
      generation: ++autoSaveGeneration,
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

function escapeAuthoringText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}
