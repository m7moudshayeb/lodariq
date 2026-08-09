import {
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
  AUTHORING_PANEL_MODE_OPEN_TYPE,
  AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE,
  AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
  AUTHORING_BROWSER_VERIFY_REQUEST_TYPE,
  AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
  AUTHORING_PUBLISH_STAGING_REQUEST_TYPE,
  AUTHORING_PUBLISH_STAGING_RESULT_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE,
  AUTHORING_RELEASE_STATE_REQUEST_TYPE,
  AUTHORING_RELEASE_STATE_RESULT_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE,
  AUTHORING_SESSION_CAPABILITIES,
  HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
  HOSTED_CREATOR_PANEL_STATE_EVENT,
  HOSTED_CREATOR_PANEL_TOGGLE_EVENT,
  DEFAULT_EXPERIENCE_APPEARANCE,
  STYLE_SAMPLE_CANCELED_TYPE,
  STYLE_SAMPLE_RESULT_TYPE,
  STYLE_SAMPLE_START_TYPE,
  HostedAuthoringSessionCloseRequestMessage,
  HostedAuthoringSessionCloseResultMessage,
  isPresentationAnchor,
  LODARIQ_EDITOR_ORIGIN,
  TARGET_VIEWPORT_BREAKPOINTS,
  validate,
  type AuthoringInlineControlOperation,
  type AuthoringPanelLayoutMode,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingReleaseState,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type BlockActionProps,
  type BrandThemeSnapshot,
  type BridgeMessage,
  type CompiledDocument,
  type NewCompiledDocument,
  type ElementFingerprint,
  type ExperienceAppearance,
  type PreviewPatchOperation,
  type ResolverDiagnostic,
  type LodariqBlock,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type TargetInspectAction,
  type TargetIdentityV2,
  type TargetViewportClass,
  type HostedAuthoringSessionCloseMode,
  type HostedCreatorPanelState,
} from '@lodariq/schema';
import type { ResolutionResult } from '@lodariq/sdk-runtime/resolver';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { readRegisteredBrandTokensForAuthoring } from '@lodariq/sdk-runtime/brand-token-registry';
import type { InlinePreviewControlContext, InlinePreviewEditor } from './inline-preview-editor';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import {
  Check,
  Ellipsis,
  GripVertical,
  Maximize2,
  Minus,
  Palette,
  X,
  createElement as createLucideElement,
  type IconNode,
} from 'lucide';
import {
  AuthoringBridge,
  BRIDGE_PROTOCOL_VERSION,
  createBridgeCorrelationId,
} from '../bridge/transport';
import type { TargetPicker } from '../bridge/target-picker';
import type { PresentationAnchorPicker } from '../bridge/presentation-anchor-picker';
import { startProductStylePicker, type ProductStylePicker } from '../bridge/product-style-picker';
import { sampleProductStyles } from '../bridge/product-style-sampler';
import { runPublicationBrowserVerification } from '../bridge/publication-verifier';
import {
  attachTargetToBlocks,
  blocksReferenceTarget,
  insertBlockInsideTourStep,
  insertTopLevelBlock,
  moveTopLevelBlock,
  moveStepChildBlock,
  renumberTourSteps,
  removeStepChildBlock,
  removeTopLevelBlock,
  reorderStepChildBlock,
  reorderTopLevelBlock,
  removeTargetFromBlocks,
  setBlockAction,
  setBlockPlacement,
  setBlockPresentationAnchor,
  setBlockTextStyle,
  transformBlocks,
  updateBlockContent,
} from './document-ops';
import { createInlinePreviewEditor } from './inline-preview-editor';
import { LOCAL_AUTHORING_PANEL_TOGGLE_EVENT } from './constants';
import {
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_STATUS_TOKENS,
  CREATOR_CHROME_TOKENS,
} from '../creator-chrome-tokens';

/**
 * Authoring shell (PRD §9.4).
 *
 * Loaded ONLY for authenticated creators entering authoring mode. Owns the
 * floating toolbar, element picker handoff, and the sandboxed iframe editor
 * served from a dedicated Lodariq origin (editor.lodariq.com, PRD §12.5).
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
  autoPreview?: boolean;
  preview?: LocalAuthoringPreviewServices;
  release?: LocalAuthoringReleaseServices;
  onSave?: (document: LodariqDocument) => Promise<void> | void;
}

export interface LocalAuthoringReleaseServices {
  releaseStateCapability: typeof AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE;
  getReleaseState: () => Promise<AuthoringStagingReleaseState>;
  stagingPublicationCapability?: typeof AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING;
  publishToStaging?: (
    request: AuthoringStagingPublicationRequest,
  ) => Promise<AuthoringStagingPublicationResult>;
  productStyleSamplingCapability?: typeof AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE;
  saveStyleSource?: (
    proposal: ProductStyleProposal,
  ) => Promise<{ sourceId: string; sourceHash: string }>;
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
  compilePreview: (doc: LodariqDocument) => Promise<CompiledDocument>;
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
const AUTHORING_PANEL_OPEN_ATTRIBUTE = 'data-lodariq-authoring-panel-open';
const AUTHORING_HOST_LAYER_STYLE_ID = 'lodariq-authoring-host-layer-style';
const LOCAL_AUTHORING_TRIGGER_SELECTOR = '[data-lodariq-authoring-trigger="true"]';
const AUTHORING_TARGET_PICKING_ATTRIBUTE = 'data-lodariq-target-picking';
const AUTHORING_PANEL_MINIMIZED_ATTRIBUTE = 'data-lodariq-panel-minimized';
const AUTHORING_PANEL_LAYOUT_ATTRIBUTE = 'data-lodariq-panel-layout';
const HOSTED_AUTHORING_IFRAME_PATH = '/authoring.html';
const AUTHORING_PANEL_LAYOUTS = {
  compact: { width: 320, height: 520 },
  standard: { width: 700, height: 620 },
  focus: { width: 860, height: 780 },
} as const satisfies Readonly<Record<AuthoringPanelLayoutMode, AuthoringPanelSize>>;
const AUTHORING_PANEL_LAYOUT_VALUES = new Set<string>(Object.keys(AUTHORING_PANEL_LAYOUTS));
const DEFAULT_AUTHORING_PANEL_LAYOUT: AuthoringPanelLayoutMode = 'standard';
const DEFAULT_AUTHORING_PANEL_WIDTH = AUTHORING_PANEL_LAYOUTS.standard.width;
const TARGET_PICKING_PANEL_WIDTH = 300;
const MIN_AUTHORING_PANEL_WIDTH = 320;
const DEFAULT_AUTHORING_PANEL_HEIGHT = AUTHORING_PANEL_LAYOUTS.standard.height;
const COMPACT_AUTHORING_PANEL_HEIGHT = 480;
const MIN_AUTHORING_PANEL_HEIGHT = 320;
const SMALL_VIEWPORT_PANEL_HEIGHT = 260;
const COMPACT_AUTHORING_PANEL_VIEWPORT_RATIO = 0.72;
const AUTHORING_PANEL_HEADER_HEIGHT = 50;
const AUTHORING_COLLAPSED_PANEL_HEIGHT = 44;
const AUTHORING_PAGE_REVEAL_GUTTER = 72;
const AUTHORING_PANEL_DRAG_THRESHOLD = 4;
const AUTHORING_AUTOSAVE_DEBOUNCE_MS = 650;
const AUTHORING_AUTOSAVE_RETRY_MS = 1_200;
const AUTHORING_AUTOSAVE_MAX_RETRIES = 2;
const AUTHORING_SAVE_REQUEST_TIMEOUT_MS = 5_000;
const HOSTED_SESSION_CLOSE_TIMEOUT_MS = 5_000;
const AUTHORING_PANEL_LABELS = {
  appearance: 'Experience appearance',
  close: 'Close authoring',
  draftSaved: 'Draft saved',
  minimize: 'Minimize authoring panel',
  movePanel: 'Move Lodariq authoring panel. Use arrow keys to reposition it.',
  options: 'Experience menu',
  preview: 'Preview experience',
  restore: 'Restore authoring panel',
  saveAndExit: 'Save & exit',
  savingDraft: 'Saving draft…',
  discardingDraft: 'Closing authoring…',
  selectExactArea: 'Choose an exact area · Esc to cancel',
  selectTarget: 'Select an element · Esc to cancel',
} as const;

class ProductStyleSelectionCanceledError extends Error {
  constructor() {
    super('Product style selection was canceled');
    this.name = 'ProductStyleSelectionCanceledError';
  }
}

type AppearanceOptionKey = keyof ExperienceAppearance;

const AUTHORING_APPEARANCE_OPTION_GROUPS = [
  {
    key: 'preset',
    label: 'Style',
    options: [
      { label: 'Default', value: 'default' },
      { label: 'Accent', value: 'accent' },
      { label: 'Inverse', value: 'inverse' },
      { label: 'Success', value: 'success' },
      { label: 'Warning', value: 'warning' },
      { label: 'Minimal', value: 'minimal' },
    ],
  },
  {
    key: 'density',
    label: 'Density',
    options: [
      { label: 'Comfortable', value: 'comfortable' },
      { label: 'Compact', value: 'compact' },
    ],
  },
  {
    key: 'width',
    label: 'Width',
    options: [
      { label: 'Narrow', value: 'narrow' },
      { label: 'Standard', value: 'standard' },
      { label: 'Wide', value: 'wide' },
    ],
  },
  {
    key: 'colorMode',
    label: 'Mode',
    options: [
      { label: 'System', value: 'system' },
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ],
  },
] as const satisfies ReadonlyArray<{
  key: AppearanceOptionKey;
  label: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}>;
const AUTHORING_PANEL_KEYBOARD_OFFSETS: Readonly<
  Partial<Record<KeyboardEvent['key'], { x: number; y: number }>>
> = {
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
};

interface AuthoringPanelGeometry {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface AuthoringPanelSize {
  height: number;
  width: number;
}

interface AuthoringPanelRestoreState {
  focusedElement: HTMLElement | null;
  geometry: AuthoringPanelGeometry;
}

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

const AUTHORING_PANEL_ICONS = {
  appearance: Palette,
  check: Check,
  close: X,
  drag: GripVertical,
  maximize: Maximize2,
  minimize: Minus,
  options: Ellipsis,
  resize: Maximize2,
} as const satisfies Readonly<Record<string, IconNode>>;
type AuthoringPanelIcon = keyof typeof AUTHORING_PANEL_ICONS;

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
    initialDocument: options.initialDocument,
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
  const saveStyleSource =
    releaseServices?.productStyleSamplingCapability ===
    AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE
      ? releaseServices.saveStyleSource
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
  const pendingIframeSaveRequests = new Map<string, PendingIframeSaveRequest>();

  shadow.appendChild(createPanelStyles());
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
          <select
            class="panel-zoom"
            aria-label="Editor zoom"
            title="Zoom editor content without changing the panel size"
          >
            <option value="50">50%</option>
            <option value="62">62%</option>
            <option value="75">75%</option>
            <option value="100" selected>100%</option>
          </select>
        </span>
        <span class="save-state" role="status" aria-live="polite">
          <span class="save-state-icon" data-panel-icon="saved" aria-hidden="true"></span>
          <span data-save-state-label>${AUTHORING_PANEL_LABELS.draftSaved}</span>
        </span>
      </span>
      <div class="authoring-bar-actions">
        <button
          type="button"
          class="header-action secondary-header-action"
          data-panel-action="appearance"
          data-tooltip="${AUTHORING_PANEL_LABELS.appearance}"
          aria-label="${AUTHORING_PANEL_LABELS.appearance}"
          aria-expanded="false"
          aria-controls="lodariq-appearance-sheet"
          title="${AUTHORING_PANEL_LABELS.appearance}"
        >
          <span class="header-action-icon" data-panel-icon="appearance" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="header-action"
          data-panel-action="options"
          data-tooltip="${AUTHORING_PANEL_LABELS.options}"
          aria-label="${AUTHORING_PANEL_LABELS.options}"
          aria-expanded="false"
          aria-haspopup="menu"
          title="${AUTHORING_PANEL_LABELS.options}"
        >
          <span class="header-action-icon" data-panel-icon="options" aria-hidden="true"></span>
        </button>
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
        <div class="panel-options-menu" role="menu" hidden>
          <button type="button" role="menuitem" data-panel-action="appearance-menu">
            ${AUTHORING_PANEL_LABELS.appearance}
          </button>
          <button type="button" role="menuitemradio" data-panel-layout="compact">
            Compact workspace
          </button>
          <button type="button" role="menuitemradio" data-panel-layout="standard">
            Standard workspace
          </button>
          <button type="button" role="menuitemradio" data-panel-layout="focus">
            Focus workspace
          </button>
          ${
            preview
              ? `<button type="button" role="menuitem" data-panel-action="preview">${AUTHORING_PANEL_LABELS.preview}</button>`
              : ''
          }
          <button type="button" role="menuitem" data-panel-action="close">
            ${AUTHORING_PANEL_LABELS.saveAndExit}
          </button>
        </div>
      </div>
    </header>
    ${renderAppearanceSheet()}
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
      <span class="panel-resize-icon" data-panel-icon="resize" aria-hidden="true"></span>
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

  const saveAndExitButton = shadow.querySelector<HTMLButtonElement>('[data-panel-action="close"]');
  const panelCloseButton = shadow.querySelector<HTMLButtonElement>(
    '[data-panel-action="close-panel"]',
  );
  const panelCloseIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="close"]');
  const panelDragIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="drag"]');
  const panelSavedIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="saved"]');
  const previewButton = shadow.querySelector<HTMLButtonElement>('[data-panel-action="preview"]');
  const appearanceButton = shadow.querySelector<HTMLButtonElement>(
    '[data-panel-action="appearance"]',
  );
  const appearanceMenuButton = shadow.querySelector<HTMLButtonElement>(
    '[data-panel-action="appearance-menu"]',
  );
  const appearanceIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="appearance"]');
  const appearanceSheet = shadow.querySelector<HTMLElement>('[data-appearance-sheet]');
  const minimizeButton = shadow.querySelector<HTMLButtonElement>('[data-panel-action="minimize"]');
  const minimizeIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="minimize"]');
  const optionsButton = shadow.querySelector<HTMLButtonElement>('[data-panel-action="options"]');
  const optionsIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="options"]');
  const optionsMenu = shadow.querySelector<HTMLElement>('.panel-options-menu');
  const panelDragHandle = shadow.querySelector<HTMLElement>('.panel-drag-handle');
  const panelDragSurface = shadow.querySelector<HTMLElement>('.authoring-bar');
  const panelZoom = shadow.querySelector<HTMLSelectElement>('.panel-zoom');
  const panelResizeHandle = shadow.querySelector<HTMLButtonElement>('.panel-resize-handle');
  const panelResizeIcon = shadow.querySelector<HTMLElement>('[data-panel-icon="resize"]');
  const panelLayoutButtons = [...shadow.querySelectorAll<HTMLButtonElement>('[data-panel-layout]')];
  const panelDocumentTitle = shadow.querySelector<HTMLInputElement>('[data-panel-document-title]');
  const saveState = shadow.querySelector<HTMLElement>('.save-state');
  const saveStateLabel = shadow.querySelector<HTMLElement>('[data-save-state-label]');

  setAuthoringPanelIcon(optionsIcon, 'options');
  setAuthoringPanelIcon(appearanceIcon, 'appearance');
  setAuthoringPanelIcon(panelCloseIcon, 'close');
  setAuthoringPanelIcon(panelDragIcon, 'drag');
  setAuthoringPanelIcon(panelSavedIcon, 'check');
  setAuthoringPanelIcon(panelResizeIcon, 'resize');
  setMinimizeButtonState(minimizeButton, minimizeIcon, false);

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

  const closeOptionsMenu = (): void => {
    if (!optionsMenu || !optionsButton) return;
    optionsMenu.hidden = true;
    optionsButton.setAttribute('aria-expanded', 'false');
  };

  let pendingAppearance = resolvedDocumentAppearance(previewDocument);
  syncAppearanceControls(appearanceSheet, pendingAppearance);

  const closeAppearanceSheet = (): void => {
    if (!appearanceSheet || !appearanceButton) return;
    appearanceSheet.hidden = true;
    appearanceButton.setAttribute('aria-expanded', 'false');
  };

  const commitAppearanceOption = (button: HTMLButtonElement): void => {
    const key = button.dataset['appearanceKey'];
    const value = button.dataset['appearanceValue'];
    if (!isAppearanceOption(key, value)) return;
    const next = { ...pendingAppearance, [key]: value } as ExperienceAppearance;
    if (next[key] === pendingAppearance[key]) return;
    const previous = pendingAppearance;
    pendingAppearance = next;
    syncAppearanceControls(appearanceSheet, next);
    const activeBridge = bridge;
    if (!activeBridge) {
      pendingAppearance = previous;
      syncAppearanceControls(appearanceSheet, previous);
      return;
    }
    setSaveState('saving', AUTHORING_PANEL_LABELS.savingDraft);
    void activeBridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_appearance_commit'),
          type: AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
          operation: { kind: 'setAppearance', appearance: structuredClone(next) },
        },
        { timeoutMs: 2_000 },
      )
      .catch((error) => {
        pendingAppearance = resolvedDocumentAppearance(previewDocument);
        syncAppearanceControls(appearanceSheet, pendingAppearance);
        setSaveState('error', 'Appearance could not be saved');
        preview?.onPreviewError?.(error);
      });
  };

  const captureRestoreState = (): AuthoringPanelRestoreState => ({
    focusedElement: activePanelFocusElement(shadow),
    geometry: readAuthoringPanelGeometry(host),
  });

  const minimize = (): void => {
    if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) return;
    if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) return;
    closeOptionsMenu();
    closeAppearanceSheet();
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
    if (preview && previewDocument)
      void playPreviewDocument(pendingInlineFocusBlockId ?? undefined);
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

  saveAndExitButton?.addEventListener('click', () => {
    closeOptionsMenu();
    void saveAndClose().catch(() => {});
  });
  panelCloseButton?.addEventListener('click', () => {
    closeOptionsMenu();
    close();
  });
  previewButton?.addEventListener('click', () => {
    closeOptionsMenu();
    minimize();
    void playPreviewDocument(undefined, false, true);
  });
  const syncPanelLayoutButtons = (): void => {
    const activeLayout = host.getAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE);
    for (const button of panelLayoutButtons) {
      const selected = button.dataset['panelLayout'] === activeLayout;
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };
  const applyPanelZoom = (): void => {
    const zoomPercent = Number.parseInt(panelZoom?.value ?? '100', 10);
    const zoom = Number.isFinite(zoomPercent) ? clamp(zoomPercent / 100, 0.5, 1) : 1;
    iframe.style.transform = `scale(${zoom})`;
    iframe.style.transformOrigin = 'top left';
    iframe.style.width = `${100 / zoom}%`;
    iframe.style.height = `${100 / zoom}%`;
    iframe.dataset['lodariqEditorZoom'] = String(Math.round(zoom * 100));
  };
  panelZoom?.addEventListener('change', applyPanelZoom);
  applyPanelZoom();
  for (const button of panelLayoutButtons) {
    button.addEventListener('click', () => {
      const mode = authoringPanelLayoutMode(button.dataset['panelLayout']);
      if (!mode) return;
      applyAuthoringPanelLayout(host, mode);
      syncPanelLayoutButtons();
      closeOptionsMenu();
      optionsButton?.focus();
    });
  }
  syncPanelLayoutButtons();
  const openAppearanceMode = (): void => {
    closeOptionsMenu();
    closeAppearanceSheet();
    bridge?.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_open_appearance'),
      type: AUTHORING_PANEL_MODE_OPEN_TYPE,
      mode: 'appearance',
    });
  };
  appearanceButton?.addEventListener('click', openAppearanceMode);
  appearanceMenuButton?.addEventListener('click', openAppearanceMode);
  appearanceSheet?.addEventListener('click', (event) => {
    const target = event.target;
    const button =
      target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-appearance-key][data-appearance-value]')
        : null;
    if (button) commitAppearanceOption(button);
  });
  minimizeButton?.addEventListener('click', () => {
    if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) restore();
    else minimize();
  });
  optionsButton?.addEventListener('click', () => {
    if (!optionsMenu || !optionsButton) return;
    const willOpen = optionsMenu.hidden;
    if (willOpen) closeAppearanceSheet();
    optionsMenu.hidden = !willOpen;
    optionsButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) optionsMenu.querySelector<HTMLElement>('button')?.focus();
  });
  const closeMenuOnEscape = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Escape') return;
    if (!appearanceSheet?.hidden) {
      event.preventDefault();
      closeAppearanceSheet();
      appearanceButton?.focus();
      return;
    }
    if (optionsMenu?.hidden) return;
    event.preventDefault();
    closeOptionsMenu();
    optionsButton?.focus();
  };
  const closeMenuOutsidePanel = (event: Event): void => {
    if (event.composedPath().includes(host)) return;
    closeOptionsMenu();
    closeAppearanceSheet();
  };
  const togglePanelFromLauncher = (): void => {
    if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) {
      restore();
      return;
    }
    if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) restore();
    else minimize();
  };
  shadow.addEventListener('keydown', closeMenuOnEscape);
  document.addEventListener('pointerdown', closeMenuOutsidePanel, true);
  window.addEventListener(LOCAL_AUTHORING_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
  if (options.persistenceOwner === 'iframe') {
    window.addEventListener('message', receiveHostedSessionLifecycle);
    window.addEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
  }
  stopPanelChrome = () => {
    shadow.removeEventListener('keydown', closeMenuOnEscape);
    document.removeEventListener('pointerdown', closeMenuOutsidePanel, true);
    window.removeEventListener(LOCAL_AUTHORING_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
    window.removeEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, togglePanelFromLauncher);
  };
  stopPanelDrag = attachPanelDrag(host, panelDragSurface, panelDragHandle);
  stopPanelResize = attachPanelResize(host, panelResizeHandle, syncPanelLayoutButtons);
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
          syncPanelLayoutButtons();
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
        if (message.type === AUTHORING_PUBLISH_STAGING_REQUEST_TYPE) {
          return respondToPublishStagingRequest(message.correlationId, message.request);
        }
        if (message.type === STYLE_SAMPLE_START_TYPE) {
          return respondToStyleSampleRequest(message.correlationId, message.request);
        }
        if (message.type === AUTHORING_BROWSER_VERIFY_REQUEST_TYPE) {
          return respondToBrowserVerificationRequest(
            message.correlationId,
            message.expectedContentHash,
          );
        }
        if (message.type === AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE) {
          return respondToStyleSourceSaveRequest(message.correlationId, message.proposal);
        }
        if (message.type === AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE) {
          return respondToVerificationSubmissionRequest(message.correlationId, message.request);
        }
        if (message.type === AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE) {
          return respondToProductionPromotionRequest(message.correlationId, message.request);
        }
        if (message.type === AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE) {
          return respondToProductionApprovalRequest(
            message.correlationId,
            message.operationId,
            message.decision,
            message.reason,
          );
        }
        if (message.type === 'authoring.preview.request') {
          if (message.mode === 'step') {
            pendingInlineFocusBlockId = message.stepId;
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
    stopLifecycleObserver = startPageLifecycleObserver(bridge, session);
    if (options.autoPreview) {
      const firstStepId = previewDocument?.blocks.find((block) => block.type === 'tourStep')?.id;
      pendingInlineFocusBlockId = firstStepId ?? null;
      void playPreviewDocument(firstStepId);
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

  async function respondToPublishStagingRequest(
    requestCorrelationId: string,
    request: AuthoringStagingPublicationRequest,
  ): Promise<void> {
    const activeBridge = bridge;
    const release = releaseServices;
    if (!activeBridge || !release || !publishToStaging) return;
    let result: AuthoringStagingPublicationResult;
    try {
      result = await publishToStaging(request);
    } catch {
      result = {
        ok: false,
        code: 'release_request_failed',
        message: 'Staging release could not be completed',
        findings: [
          {
            code: 'release_request_failed',
            severity: 'blocker',
            label: 'Staging release could not be completed',
          },
        ],
      };
    }
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_publish_staging_result'),
      type: AUTHORING_PUBLISH_STAGING_RESULT_TYPE,
      requestCorrelationId,
      result,
    });
  }

  async function respondToStyleSampleRequest(
    requestCorrelationId: string,
    request: Extract<BridgeMessage, { type: typeof STYLE_SAMPLE_START_TYPE }>['request'],
  ): Promise<void> {
    const activeBridge = bridge;
    if (!activeBridge) return;
    try {
      const selectedElement = await resolveProductStyleElement(request);
      const proposal = await sampleProductStyles({
        document,
        selectedElement,
        registeredTokens: readRegisteredBrandTokensForAuthoring(),
        proposalId: createBridgeCorrelationId('brand_proposal'),
      });
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_style_sample_result'),
        type: STYLE_SAMPLE_RESULT_TYPE,
        requestCorrelationId,
        result: { ok: true, proposal },
      });
    } catch (error) {
      if (error instanceof ProductStyleSelectionCanceledError) {
        activeBridge.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_style_sample_canceled'),
          type: STYLE_SAMPLE_CANCELED_TYPE,
          requestCorrelationId,
          reason: 'creator_canceled',
        });
        return;
      }
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_style_sample_result'),
        type: STYLE_SAMPLE_RESULT_TYPE,
        requestCorrelationId,
        result: {
          ok: false,
          code: 'no_selected_element',
          message: 'Choose one visible product element to match.',
        },
      });
    }
  }

  async function resolveProductStyleElement(
    request: Extract<BridgeMessage, { type: typeof STYLE_SAMPLE_START_TYPE }>['request'],
  ): Promise<Element> {
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
      return await new Promise<Element>((resolve, reject) => {
        productStylePicker?.cancel();
        productStylePicker = startProductStylePicker({
          root: document,
          onPick: (element) => {
            productStylePicker = null;
            resolve(element);
          },
          onCancel: () => {
            productStylePicker = null;
            reject(new ProductStyleSelectionCanceledError());
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
        AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
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
        AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
        requestCorrelationId,
        'verification_failed',
        'The exact staging artifact could not be verified.',
      );
    } finally {
      host.style.visibility = previousVisibility;
      applyClampedAuthoringPanelGeometry(host, restoreState.geometry, 'open');
      schedulePanelFocusRestore(restoreState.focusedElement, panelDragHandle);
      if (resumeDraftPreview) void playPreviewDocument(pendingInlineFocusBlockId ?? undefined);
    }
  }

  async function respondToStyleSourceSaveRequest(
    requestCorrelationId: string,
    proposal: ProductStyleProposal,
  ): Promise<void> {
    const activeBridge = bridge;
    if (!activeBridge || !saveStyleSource) return;
    try {
      const result = await saveStyleSource(proposal);
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_style_source_save_result'),
        type: AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
        requestCorrelationId,
        result: { ok: true, ...result },
      });
    } catch {
      sendHostOperationFailure(
        activeBridge,
        AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
        requestCorrelationId,
        'style_source_save_failed',
        'The Brand proposal could not be saved.',
      );
    }
  }

  async function respondToVerificationSubmissionRequest(
    requestCorrelationId: string,
    request: AuthoringStagingVerificationRequest,
  ): Promise<void> {
    const activeBridge = bridge;
    if (!activeBridge || !submitStagingVerification) return;
    let result: AuthoringStagingVerificationResult;
    try {
      result = await submitStagingVerification(request);
    } catch {
      result = {
        ok: false,
        code: 'internal_error',
        message: 'Staging verification could not be saved.',
      };
    }
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_submit_verification_result'),
      type: AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE,
      requestCorrelationId,
      result,
    });
  }

  async function respondToProductionPromotionRequest(
    requestCorrelationId: string,
    request: ProductionPromotionRequest,
  ): Promise<void> {
    const activeBridge = bridge;
    if (!activeBridge || !promoteProduction) return;
    let result: ProductionPromotionResult;
    try {
      result = await promoteProduction(request);
    } catch {
      result = productionOperationFailure('Production promotion failed.');
    }
    activeBridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_promote_production_result'),
      type: AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE,
      requestCorrelationId,
      result,
    });
  }

  async function respondToProductionApprovalRequest(
    requestCorrelationId: string,
    operationId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<void> {
    const activeBridge = bridge;
    if (!activeBridge || !approveProduction) return;
    try {
      const result = await approveProduction(operationId, decision, reason);
      activeBridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_approve_production_result'),
        type: AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
        requestCorrelationId,
        result: { ok: true, ...result },
      });
    } catch {
      sendHostOperationFailure(
        activeBridge,
        AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
        requestCorrelationId,
        'approval_failed',
        'The production decision could not be saved.',
      );
    }
  }

  function sendHostOperationFailure(
    activeBridge: AuthoringBridge,
    type:
      | typeof AUTHORING_BROWSER_VERIFY_RESULT_TYPE
      | typeof AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE
      | typeof AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
    requestCorrelationId: string,
    code: string,
    message: string,
  ): void {
    const envelope = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('authoring_host_operation_result'),
      requestCorrelationId,
      result: { ok: false, code, message },
    } as const;
    if (type === AUTHORING_BROWSER_VERIFY_RESULT_TYPE) {
      activeBridge.send({ ...envelope, type: AUTHORING_BROWSER_VERIFY_RESULT_TYPE });
      return;
    }
    if (type === AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE) {
      activeBridge.send({ ...envelope, type: AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE });
      return;
    }
    activeBridge.send({ ...envelope, type: AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE });
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
    if (ops.some((operation) => operation.op === 'setAppearance')) {
      pendingAppearance = resolvedDocumentAppearance(previewDocument);
      syncAppearanceControls(appearanceSheet, pendingAppearance);
    }
    scheduleAutoSave(previewDocument);
    const persistence = ops.some((operation) => operation.op === 'removeTarget')
      ? flushAutoSave()
      : undefined;
    if (panelDocumentTitle && panelDocumentTitle !== shadow.activeElement) {
      panelDocumentTitle.value = previewDocument.title;
    }
    if (!preview) return persistence;
    if (ops.every((operation) => operation.op === 'updateTargetEvidence')) return persistence;
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
    const requestId = ++previewRequestId;
    previewPending = true;
    return preview
      .compilePreview(structuredClone(previewDocument))
      .then((compiled) => {
        if (requestId !== previewRequestId || !host.isConnected) return;
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

  function setSaveState(state: 'error' | 'saved' | 'saving', label: string): void {
    if (saveState) saveState.dataset['state'] = state;
    if (saveStateLabel) saveStateLabel.textContent = label;
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
      const [{ startTargetPicker }, { resolve, resolveTargetIdentity }] = await Promise.all([
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

      picker = startTargetPicker({
        ...(message.identity ? { initialIdentity: message.identity } : {}),
        ...(message.requiredAction ? { requiredAction: message.requiredAction } : {}),
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

type AuthoringPanelGeometryMode = 'minimized' | 'open' | 'target-picking';

function startPanelViewportSync(host: HTMLElement): () => void {
  let previousViewportWasCompact = visibleViewportBounds(window).width <= 600;
  let desktopGeometry: AuthoringPanelGeometry | null = previousViewportWasCompact
    ? null
    : readAuthoringPanelGeometry(host);
  const sync = (): void => {
    const viewport = visibleViewportBounds(window);
    const viewportIsCompact = viewport.width <= 600;
    const mode = authoringPanelGeometryMode(host);
    if (!previousViewportWasCompact && viewportIsCompact && mode === 'open') {
      desktopGeometry = readAuthoringPanelGeometry(host);
    }
    let geometry = readAuthoringPanelGeometry(host);
    if (previousViewportWasCompact && !viewportIsCompact && mode === 'open') {
      const layout = currentAuthoringPanelLayout(host);
      geometry = layout
        ? { ...geometry, ...AUTHORING_PANEL_LAYOUTS[layout] }
        : (desktopGeometry ?? geometry);
    }
    applyClampedAuthoringPanelGeometry(host, geometry, mode);
    previousViewportWasCompact = viewportIsCompact;
  };
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  scheduleAnimationFrame(sync);

  return () => {
    window.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('scroll', sync);
  };
}

function positionInitialAuthoringPanel(host: HTMLElement): void {
  const viewport = visibleViewportBounds(window);
  const margin = authoringPanelMargin(viewport.width);
  const layout = currentAuthoringPanelLayout(host) ?? DEFAULT_AUTHORING_PANEL_LAYOUT;
  const width = authoringPanelWidth(viewport, margin, false, layout);
  const top = clamp(
    viewport.top + (viewport.width <= 600 ? 72 : 76),
    viewport.top + margin,
    viewport.bottom - authoringPanelMinimumHeight(viewport.height, margin) - margin,
  );
  const height = authoringPanelHeight(viewport, top, margin, layout);
  applyClampedAuthoringPanelGeometry(
    host,
    {
      height,
      left: viewport.left + (viewport.width - width) / 2,
      top,
      width,
    },
    'open',
  );
}

function positionTargetPickingPanel(host: HTMLElement): void {
  const viewport = visibleViewportBounds(window);
  const margin = authoringPanelMargin(viewport.width);
  const width = authoringPanelWidth(viewport, margin, true);
  applyClampedAuthoringPanelGeometry(
    host,
    {
      height: AUTHORING_COLLAPSED_PANEL_HEIGHT,
      left: viewport.left + (viewport.width - width) / 2,
      top: viewport.bottom - AUTHORING_COLLAPSED_PANEL_HEIGHT - margin,
      width,
    },
    'target-picking',
  );
}

function authoringPanelMargin(viewportWidth: number): number {
  return viewportWidth <= 600 ? 12 : 18;
}

function authoringPanelLayoutMode(value: string | undefined): AuthoringPanelLayoutMode | null {
  return value && AUTHORING_PANEL_LAYOUT_VALUES.has(value)
    ? (value as AuthoringPanelLayoutMode)
    : null;
}

function currentAuthoringPanelLayout(host: HTMLElement): AuthoringPanelLayoutMode | null {
  return authoringPanelLayoutMode(host.getAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE) ?? undefined);
}

function applyAuthoringPanelLayout(host: HTMLElement, layout: AuthoringPanelLayoutMode): void {
  const geometry = readAuthoringPanelGeometry(host);
  const size = AUTHORING_PANEL_LAYOUTS[layout];
  host.setAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE, layout);
  applyClampedAuthoringPanelGeometry(
    host,
    { ...geometry, height: size.height, width: size.width },
    authoringPanelGeometryMode(host),
  );
}

function authoringPanelWidth(
  viewport: ReturnType<typeof visibleViewportBounds>,
  margin: number,
  targetPicking: boolean,
  layout: AuthoringPanelLayoutMode = DEFAULT_AUTHORING_PANEL_LAYOUT,
): number {
  const horizontalReserve =
    viewport.width <= 600 || targetPicking
      ? margin * 2
      : Math.max(margin * 2, AUTHORING_PAGE_REVEAL_GUTTER);
  const availableWidth = Math.max(0, viewport.width - horizontalReserve);
  let preferredWidth: number = AUTHORING_PANEL_LAYOUTS[layout].width;
  if (viewport.width <= 600) preferredWidth = AUTHORING_PANEL_LAYOUTS.compact.width;
  if (targetPicking) preferredWidth = TARGET_PICKING_PANEL_WIDTH;
  return Math.min(Math.max(MIN_AUTHORING_PANEL_WIDTH, preferredWidth), availableWidth);
}

function authoringPanelMinimumHeight(viewportHeight: number, margin: number): number {
  return Math.min(
    MIN_AUTHORING_PANEL_HEIGHT,
    Math.max(SMALL_VIEWPORT_PANEL_HEIGHT, viewportHeight - margin * 2),
  );
}

function authoringPanelGeometryMode(host: HTMLElement): AuthoringPanelGeometryMode {
  if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) return 'target-picking';
  if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) return 'minimized';
  return 'open';
}

function readAuthoringPanelGeometry(host: HTMLElement): AuthoringPanelGeometry {
  const rect = host.getBoundingClientRect();
  return {
    height: rect.height || pixelStyleValue(host.style.height) || DEFAULT_AUTHORING_PANEL_HEIGHT,
    left: rect.left || pixelStyleValue(host.style.left),
    top: rect.top || pixelStyleValue(host.style.top),
    width: rect.width || pixelStyleValue(host.style.width) || DEFAULT_AUTHORING_PANEL_WIDTH,
  };
}

function pixelStyleValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyClampedAuthoringPanelGeometry(
  host: HTMLElement,
  geometry: AuthoringPanelGeometry,
  mode: AuthoringPanelGeometryMode,
): void {
  const viewport = visibleViewportBounds(window);
  const margin = authoringPanelMargin(viewport.width);
  const horizontalReserve =
    viewport.width <= 600 || mode === 'target-picking'
      ? margin * 2
      : Math.max(margin * 2, AUTHORING_PAGE_REVEAL_GUTTER);
  const availableWidth = Math.max(0, viewport.width - horizontalReserve);
  const availableHeight = Math.max(AUTHORING_COLLAPSED_PANEL_HEIGHT, viewport.height - margin * 2);
  let preferredWidth = Math.min(
    Math.max(MIN_AUTHORING_PANEL_WIDTH, geometry.width),
    availableWidth,
  );
  if (mode === 'target-picking') {
    preferredWidth = authoringPanelWidth(viewport, margin, true);
  } else if (viewport.width <= 600) {
    preferredWidth = authoringPanelWidth(viewport, margin, false);
  }
  let preferredHeight = AUTHORING_COLLAPSED_PANEL_HEIGHT;
  if (mode === 'open') {
    preferredHeight =
      viewport.width <= 600
        ? authoringPanelHeight(viewport, geometry.top, margin, 'compact')
        : Math.min(
            Math.max(authoringPanelMinimumHeight(viewport.height, margin), geometry.height),
            availableHeight,
          );
  }
  const minLeft = viewport.left + margin;
  const maxLeft = Math.max(minLeft, viewport.right - preferredWidth - margin);
  const minTop = viewport.top + margin;
  const maxTop = Math.max(minTop, viewport.bottom - preferredHeight - margin);

  host.style.left = `${clamp(geometry.left, minLeft, maxLeft)}px`;
  host.style.top = `${clamp(geometry.top, minTop, maxTop)}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  host.style.width = `${preferredWidth}px`;
  host.style.height = `${preferredHeight}px`;
}

function authoringPanelHeight(
  viewport: ReturnType<typeof visibleViewportBounds>,
  top: number,
  margin: number,
  layout: AuthoringPanelLayoutMode = DEFAULT_AUTHORING_PANEL_LAYOUT,
): number {
  const availableHeight = Math.max(SMALL_VIEWPORT_PANEL_HEIGHT, viewport.bottom - top - margin);
  const preferredHeight =
    viewport.width <= 600
      ? Math.min(
          COMPACT_AUTHORING_PANEL_HEIGHT,
          Math.max(
            SMALL_VIEWPORT_PANEL_HEIGHT,
            viewport.height * COMPACT_AUTHORING_PANEL_VIEWPORT_RATIO,
          ),
        )
      : AUTHORING_PANEL_LAYOUTS[layout].height;
  return Math.min(preferredHeight, availableHeight);
}

function attachPanelDrag(
  host: HTMLElement,
  panelDragSurface: HTMLElement | null,
  keyboardHandle: HTMLElement | null,
): () => void {
  if (!panelDragSurface) return () => {};
  let drag: {
    pointerId: number | 'mouse';
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null = null;
  let dragShield: HTMLElement | null = null;

  const move = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < AUTHORING_PANEL_DRAG_THRESHOLD) return;
    drag.moved = true;
    dragShield ??= createAuthoringDragShield(host.ownerDocument);
    panelDragSurface.dataset['lodariqAuthoringDragging'] = 'true';
    event.preventDefault();
    moveAuthoringPanel(host, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  };

  const start = (event: MouseEvent | PointerEvent): void => {
    if (drag || event.button !== 0) return;
    if ((event.target as Element | null)?.closest('button, input, textarea, select')) return;
    const rect = host.getBoundingClientRect();
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = 'pointerId' in event ? event.pointerId : 'mouse';
    drag = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };

    if (pointerId === 'mouse') {
      ownerWindow.addEventListener('mousemove', move, true);
      ownerWindow.addEventListener('mouseup', finish, true);
      return;
    }

    panelDragSurface.setPointerCapture?.(pointerId);
    ownerWindow.addEventListener('pointermove', move, true);
    ownerWindow.addEventListener('pointerup', finish, true);
    ownerWindow.addEventListener('pointercancel', finish, true);
  };

  const finish = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = drag.pointerId;
    if (pointerId === 'mouse') {
      ownerWindow.removeEventListener('mousemove', move, true);
      ownerWindow.removeEventListener('mouseup', finish, true);
    } else {
      panelDragSurface.releasePointerCapture?.(pointerId);
      ownerWindow.removeEventListener('pointermove', move, true);
      ownerWindow.removeEventListener('pointerup', finish, true);
      ownerWindow.removeEventListener('pointercancel', finish, true);
    }
    dragShield?.remove();
    dragShield = null;
    delete panelDragSurface.dataset['lodariqAuthoringDragging'];
    drag = null;
  };

  const moveWithKeyboard = (event: KeyboardEvent): void => {
    if ((event.target as Element | null)?.matches('input, textarea, select')) return;
    const offset = AUTHORING_PANEL_KEYBOARD_OFFSETS[event.key];
    if (!offset) return;
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const distance = event.shiftKey ? 48 : 16;
    moveAuthoringPanel(host, rect.left + offset.x * distance, rect.top + offset.y * distance);
  };

  panelDragSurface.addEventListener('pointerdown', start);
  panelDragSurface.addEventListener('mousedown', start);
  keyboardHandle?.addEventListener('keydown', moveWithKeyboard);

  return () => {
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    ownerWindow.removeEventListener('mousemove', move, true);
    ownerWindow.removeEventListener('mouseup', finish, true);
    ownerWindow.removeEventListener('pointermove', move, true);
    ownerWindow.removeEventListener('pointerup', finish, true);
    ownerWindow.removeEventListener('pointercancel', finish, true);
    panelDragSurface.removeEventListener('pointerdown', start);
    panelDragSurface.removeEventListener('mousedown', start);
    keyboardHandle?.removeEventListener('keydown', moveWithKeyboard);
    dragShield?.remove();
    dragShield = null;
    delete panelDragSurface.dataset['lodariqAuthoringDragging'];
    drag = null;
  };
}

function attachPanelResize(
  host: HTMLElement,
  resizeHandle: HTMLButtonElement | null,
  onResize: () => void,
): () => void {
  if (!resizeHandle) return () => {};
  let resize: {
    pointerId: number | 'mouse';
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
  } | null = null;
  let resizeShield: HTMLElement | null = null;

  const applyResize = (width: number, height: number): void => {
    host.setAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE, 'custom');
    const geometry = readAuthoringPanelGeometry(host);
    applyClampedAuthoringPanelGeometry(
      host,
      { ...geometry, height, width },
      authoringPanelGeometryMode(host),
    );
    onResize();
  };

  const move = (event: MouseEvent | PointerEvent): void => {
    if (!resize) return;
    if ('pointerId' in event && resize.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && resize.pointerId !== 'mouse') return;
    event.preventDefault();
    resizeShield ??= createAuthoringDragShield(host.ownerDocument, 'nwse-resize');
    resizeHandle.dataset['lodariqAuthoringResizing'] = 'true';
    applyResize(
      resize.startWidth + event.clientX - resize.startX,
      resize.startHeight + event.clientY - resize.startY,
    );
  };

  const finish = (event: MouseEvent | PointerEvent): void => {
    if (!resize) return;
    if ('pointerId' in event && resize.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && resize.pointerId !== 'mouse') return;
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = resize.pointerId;
    if (pointerId === 'mouse') {
      ownerWindow.removeEventListener('mousemove', move, true);
      ownerWindow.removeEventListener('mouseup', finish, true);
    } else {
      resizeHandle.releasePointerCapture?.(pointerId);
      ownerWindow.removeEventListener('pointermove', move, true);
      ownerWindow.removeEventListener('pointerup', finish, true);
      ownerWindow.removeEventListener('pointercancel', finish, true);
    }
    resizeShield?.remove();
    resizeShield = null;
    delete resizeHandle.dataset['lodariqAuthoringResizing'];
    resize = null;
  };

  const start = (event: MouseEvent | PointerEvent): void => {
    if (resize || event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = 'pointerId' in event ? event.pointerId : 'mouse';
    resize = {
      pointerId,
      startHeight: rect.height,
      startWidth: rect.width,
      startX: event.clientX,
      startY: event.clientY,
    };
    if (pointerId === 'mouse') {
      ownerWindow.addEventListener('mousemove', move, true);
      ownerWindow.addEventListener('mouseup', finish, true);
      return;
    }
    resizeHandle.setPointerCapture?.(pointerId);
    ownerWindow.addEventListener('pointermove', move, true);
    ownerWindow.addEventListener('pointerup', finish, true);
    ownerWindow.addEventListener('pointercancel', finish, true);
  };

  const resizeWithKeyboard = (event: KeyboardEvent): void => {
    const offset = AUTHORING_PANEL_KEYBOARD_OFFSETS[event.key];
    if (!offset) return;
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const distance = event.shiftKey ? 40 : 8;
    applyResize(rect.width + offset.x * distance, rect.height + offset.y * distance);
  };

  resizeHandle.addEventListener('pointerdown', start);
  resizeHandle.addEventListener('mousedown', start);
  resizeHandle.addEventListener('keydown', resizeWithKeyboard);

  return () => {
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    ownerWindow.removeEventListener('mousemove', move, true);
    ownerWindow.removeEventListener('mouseup', finish, true);
    ownerWindow.removeEventListener('pointermove', move, true);
    ownerWindow.removeEventListener('pointerup', finish, true);
    ownerWindow.removeEventListener('pointercancel', finish, true);
    resizeHandle.removeEventListener('pointerdown', start);
    resizeHandle.removeEventListener('mousedown', start);
    resizeHandle.removeEventListener('keydown', resizeWithKeyboard);
    resizeShield?.remove();
    resizeShield = null;
    delete resizeHandle.dataset['lodariqAuthoringResizing'];
    resize = null;
  };
}

function createAuthoringDragShield(doc: Document, cursor = 'grabbing'): HTMLElement {
  const shield = doc.createElement('div');
  shield.dataset['lodariqAuthoringDragShield'] = 'true';
  shield.setAttribute('aria-hidden', 'true');
  Object.assign(shield.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor,
    pointerEvents: 'auto',
    userSelect: 'none',
    background: 'transparent',
  });
  doc.body.appendChild(shield);
  return shield;
}

function moveAuthoringPanel(host: HTMLElement, left: number, top: number): void {
  const geometry = readAuthoringPanelGeometry(host);
  applyClampedAuthoringPanelGeometry(
    host,
    { ...geometry, left, top },
    authoringPanelGeometryMode(host),
  );
}

function setPanelTargetPicking(host: HTMLElement, active: boolean, label?: string): void {
  const targetPickingLabel = host.shadowRoot?.querySelector<HTMLElement>('.target-picking-label');
  if (active) {
    host.setAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE, 'true');
    if (targetPickingLabel) {
      targetPickingLabel.textContent = label ?? AUTHORING_PANEL_LABELS.selectTarget;
    }
    positionTargetPickingPanel(host);
  } else {
    host.removeAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE);
    if (targetPickingLabel) targetPickingLabel.textContent = AUTHORING_PANEL_LABELS.selectTarget;
  }
}

function restorePanelAfterTargetPicking(
  host: HTMLElement,
  restoreState: AuthoringPanelRestoreState | null,
  restoreFocus = true,
): void {
  host.removeAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE);
  const targetPickingLabel = host.shadowRoot?.querySelector<HTMLElement>('.target-picking-label');
  if (targetPickingLabel) targetPickingLabel.textContent = AUTHORING_PANEL_LABELS.selectTarget;
  if (!restoreState) {
    positionInitialAuthoringPanel(host);
    return;
  }
  applyClampedAuthoringPanelGeometry(host, restoreState.geometry, 'open');
  if (restoreFocus) schedulePanelFocusRestore(restoreState.focusedElement, null);
}

function activePanelFocusElement(shadow: ShadowRoot): HTMLElement | null {
  const shadowActiveElement = shadow.activeElement;
  if (shadowActiveElement instanceof HTMLElement) return shadowActiveElement;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function schedulePanelFocusRestore(
  focusedElement: HTMLElement | null,
  fallback: HTMLElement | null,
): void {
  scheduleAnimationFrame(() => {
    const focusTarget = focusedElement?.isConnected ? focusedElement : fallback;
    focusTarget?.focus({ preventScroll: true });
  });
}

function setMinimizeButtonState(
  button: HTMLButtonElement | null,
  iconContainer: HTMLElement | null,
  minimized: boolean,
): void {
  if (!button) return;
  const actionLabel = minimized ? AUTHORING_PANEL_LABELS.restore : AUTHORING_PANEL_LABELS.minimize;
  button.setAttribute('aria-label', actionLabel);
  button.dataset['tooltip'] = actionLabel;
  button.setAttribute('title', actionLabel);
  setAuthoringPanelIcon(iconContainer, minimized ? 'maximize' : 'minimize');
}

function setAuthoringPanelIcon(container: HTMLElement | null, icon: AuthoringPanelIcon): void {
  if (!container) return;
  const svg = createLucideElement(AUTHORING_PANEL_ICONS[icon], {
    'aria-hidden': 'true',
    focusable: 'false',
    height: '18',
    width: '18',
  });
  const ownedSvg =
    svg.ownerDocument === container.ownerDocument
      ? svg
      : (container.ownerDocument.importNode(svg, true) as SVGElement);
  container.replaceChildren(ownedSvg);
}

function visibleViewportBounds(ownerWindow: Window): {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
} {
  const viewport = ownerWindow.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? ownerWindow.innerWidth;
  const height = viewport?.height ?? ownerWindow.innerHeight;
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

function setAuthoringPanelOpenState(open: boolean): void {
  if (open) {
    ensureAuthoringHostLayerStyles(document);
    document.documentElement.setAttribute(AUTHORING_PANEL_OPEN_ATTRIBUTE, 'true');
  } else {
    document.documentElement.removeAttribute(AUTHORING_PANEL_OPEN_ATTRIBUTE);
  }
  setAuthoringTriggerPanelState(open ? 'open' : 'closed');
}

function setAuthoringTriggerPanelState(state: 'closed' | 'minimized' | 'open'): void {
  document
    .querySelectorAll<HTMLButtonElement>(LOCAL_AUTHORING_TRIGGER_SELECTOR)
    .forEach((button) => {
      const defaultAriaLabel =
        button.dataset['lodariqDefaultAriaLabel'] ??
        button.getAttribute('aria-label') ??
        'Open Lodariq actions';
      button.dataset['lodariqDefaultAriaLabel'] = defaultAriaLabel;
      button.dataset['lodariqAuthoringPanelExpanded'] = state === 'open' ? 'true' : 'false';
      button.setAttribute('aria-expanded', 'false');

      const launcher = button.closest<HTMLElement>('[data-lodariq-creator-launcher="true"]');
      if (state === 'closed') {
        button.setAttribute('aria-label', defaultAriaLabel);
        button.setAttribute('title', defaultAriaLabel);
        if (launcher) delete launcher.dataset['lodariqAuthoringPanelState'];
        return;
      }

      const actionLabel =
        state === 'open' ? 'Minimize Lodariq authoring' : 'Restore Lodariq authoring';
      button.setAttribute('aria-label', actionLabel);
      button.setAttribute('title', actionLabel);
      if (launcher) launcher.dataset['lodariqAuthoringPanelState'] = state;
    });
}

function ensureAuthoringHostLayerStyles(doc: Document): void {
  if (doc.getElementById(AUTHORING_HOST_LAYER_STYLE_ID)) return;
  const style = createNonceStyleElement(
    doc,
    `
    :root[${AUTHORING_PANEL_OPEN_ATTRIBUTE}="true"] lodariq-tour {
      --lodariq-tour-z-index: 2147483644;
    }
  `,
  );
  style.id = AUTHORING_HOST_LAYER_STYLE_ID;
  doc.head.appendChild(style);
}

function dispatchAuthoringSaveError(error: unknown): void {
  window.dispatchEvent(
    new CustomEvent('lodariq:authoring-save-error', {
      detail: { error },
    }),
  );
}

function startPageLifecycleObserver(
  bridge: AuthoringBridge,
  session: Pick<AuthoringSession, 'sessionId' | 'documentId'>,
): () => void {
  let disposed = false;
  let scheduled = false;
  let ackPending = false;
  let dirtyWhileAckPending = false;
  let lastSent = '';

  const schedule = (): void => {
    if (disposed) return;
    if (ackPending) {
      dirtyWhileAckPending = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    scheduleAnimationFrame(flush);
  };

  const flush = (): void => {
    scheduled = false;
    if (disposed) return;

    const snapshot = currentLifecycleSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSent) return;
    lastSent = serialized;
    ackPending = true;
    dirtyWhileAckPending = false;

    const message: BridgeMessage = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('page_lifecycle_update'),
      type: 'page.lifecycle.update',
      route: snapshot.route,
      scrollState: snapshot.scrollState,
      ...(snapshot.locale ? { locale: snapshot.locale } : {}),
      viewportClass: snapshot.viewportClass,
    };

    void bridge
      .sendWithAck(message, { timeoutMs: 1000 })
      .catch(() => {})
      .finally(() => {
        ackPending = false;
        if (dirtyWhileAckPending) schedule();
      });
  };

  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  document.addEventListener('visibilitychange', schedule);
  const restoreHistoryObservation = observeHistoryState(schedule);

  schedule();

  return () => {
    disposed = true;
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('popstate', schedule);
    window.removeEventListener('hashchange', schedule);
    document.removeEventListener('visibilitychange', schedule);
    restoreHistoryObservation();
  };
}

function currentLifecycleSnapshot(): {
  route: string;
  scrollState: { x: number; y: number };
  locale?: string;
  viewportClass: TargetViewportClass;
} {
  const locale = canonicalAuthoringLocale(
    document.documentElement.lang || window.navigator.language,
  );
  return {
    route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    scrollState: {
      x: window.scrollX,
      y: window.scrollY,
    },
    ...(locale ? { locale } : {}),
    viewportClass: authoringViewportClass(window.innerWidth),
  };
}

function canonicalAuthoringLocale(value: string): string | null {
  const candidate = value.trim().replace(/_/g, '-');
  if (!candidate) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

function authoringViewportClass(width: number): TargetViewportClass {
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.mobileMaxWidth) return 'mobile';
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.tabletMaxWidth) return 'tablet';
  return 'desktop';
}

function observeHistoryState(onChange: () => void): () => void {
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const wrap = <T extends History['pushState'] | History['replaceState']>(original: T): T =>
    function wrappedHistoryState(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      original.call(this, data, unused, url);
      onChange();
    } as T;

  const wrappedPushState = wrap(originalPushState);
  const wrappedReplaceState = wrap(originalReplaceState);
  window.history.pushState = wrappedPushState;
  window.history.replaceState = wrappedReplaceState;

  return () => {
    if (window.history.pushState === wrappedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === wrappedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
  };
}

function scheduleAnimationFrame(callback: () => void): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  window.setTimeout(callback, 16);
}

async function inspectTarget(
  fingerprint: ElementFingerprint,
  action: TargetInspectAction,
  targetId?: string,
  identity?: TargetIdentityV2,
): Promise<ResolverDiagnostic> {
  let result: ResolutionResult;
  try {
    const { resolve, resolveTarget } = await import('@lodariq/sdk-runtime/resolver');
    result =
      identity && targetId
        ? resolveTarget({ id: targetId, fingerprint, identity })
        : resolve(fingerprint);
  } catch {
    return {
      state: 'missing',
      confidence: 0,
      candidateCount: 0,
      resolutionMethod: 'none',
      reasonCode: 'no_candidates',
      evidenceFamilies: [],
      runnerUpConfidence: null,
      currentLocale: null,
      viewportClass: authoringViewportClass(window.innerWidth),
      observedAt: new Date().toISOString(),
      message: 'Anchor check could not load on this page',
    };
  }
  if (action === 'view' && result.element) revealTarget(result.element);
  return {
    state: result.state,
    confidence: result.confidence,
    candidateCount: result.candidateCount,
    resolutionMethod: result.resolutionMethod,
    reasonCode: result.reasonCode,
    evidenceFamilies: result.evidenceFamilies,
    runnerUpConfidence: result.runnerUpConfidence,
    currentLocale: result.currentLocale,
    viewportClass: authoringViewportClass(window.innerWidth),
    observedAt: new Date().toISOString(),
    message: targetInspectMessage(action, result),
  };
}

function targetInspectMessage(
  action: TargetInspectAction,
  result: Pick<ResolverDiagnostic, 'state' | 'reasonCode'>,
): string {
  const state = result.state;
  if (state === 'found') {
    if (action === 'view') return 'Anchor highlighted on the page';
    if (action === 'test') return 'Anchor placement check passed';
    return 'Anchor verified on this page state';
  }
  if (state === 'needs_review') {
    return result.reasonCode === 'evidence_drift'
      ? 'Anchor evidence has drifted'
      : 'Anchor needs verification';
  }
  if (state === 'ambiguous') return 'Anchor needs a more specific selection';
  return 'Anchor needs attention on this page';
}

function revealTarget(element: Element): void {
  clearTargetReveal();
  if ('scrollIntoView' in element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  const doc = element.ownerDocument;
  const rect = element.getBoundingClientRect();
  const marker = doc.createElement('div');
  marker.dataset['lodariqBridge'] = 'target-reveal';
  marker.setAttribute('aria-hidden', 'true');
  Object.assign(marker.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: '2147483645',
    pointerEvents: 'none',
    border: `2px solid ${CREATOR_CHROME_TOKENS.focus}`,
    borderRadius: '6px',
    boxShadow: '0 0 0 5px rgba(61, 232, 176, 0.2)',
  });
  doc.body.appendChild(marker);
  window.setTimeout(() => marker.remove(), 1200);
}

function clearTargetReveal(): void {
  document
    .querySelectorAll('[data-lodariq-bridge="target-reveal"]')
    .forEach((marker) => marker.remove());
}

function applyPreviewPatch(
  document: LodariqDocument,
  blockId: string,
  ops: PreviewPatchOperation[],
): LodariqDocument {
  let next = structuredClone(document);
  for (const op of ops) {
    if (op.op === 'setDocumentTitle') {
      next = { ...next, title: op.title.trim() || 'Untitled experience' };
    }
    if (op.op === 'setAppearance') {
      next = { ...next, appearance: structuredClone(op.appearance) };
    }
    if (op.op === 'insertBlock') {
      const inserted = op.anchorBlockId
        ? insertTopLevelBlock(
            next.blocks,
            op.anchorBlockId,
            structuredClone(op.block),
            op.position ?? 'after',
          )
        : [...next.blocks, structuredClone(op.block)];
      if (inserted) next = { ...next, blocks: renumberTourSteps(inserted) };
    }
    if (op.op === 'insertBlocks') {
      next = {
        ...next,
        blocks: renumberTourSteps([...next.blocks, ...structuredClone(op.blocks)]),
      };
    }
    if (op.op === 'insertStepContent') {
      const blocks = insertBlockInsideTourStep(
        next.blocks,
        op.stepBlockId,
        structuredClone(op.block),
        op.index,
      );
      if (blocks) next = { ...next, blocks };
    }
    if (op.op === 'updateContent') {
      next = { ...next, blocks: updateBlockContent(next.blocks, blockId, op.content) };
    }
    if (op.op === 'setTextStyle') {
      next = { ...next, blocks: setBlockTextStyle(next.blocks, blockId, op.textStyle) };
    }
    if (op.op === 'moveBlock') {
      const blocks = moveTopLevelBlock(next.blocks, blockId, op.direction);
      if (blocks) next = { ...next, blocks: renumberTourSteps(blocks) };
    }
    if (op.op === 'moveStepContent') {
      const blocks = moveStepChildBlock(next.blocks, op.stepBlockId, blockId, op.direction);
      if (blocks) next = { ...next, blocks };
    }
    if (op.op === 'reorderBlock') {
      const blocks = reorderTopLevelBlock(
        next.blocks,
        blockId,
        op.beforeBlockId,
        op.position ?? 'before',
      );
      if (blocks) next = { ...next, blocks: renumberTourSteps(blocks) };
    }
    if (op.op === 'reorderStepContent') {
      const blocks = reorderStepChildBlock(
        next.blocks,
        op.stepBlockId,
        blockId,
        op.targetChildBlockId,
        op.position ?? 'before',
      );
      if (blocks) next = { ...next, blocks };
    }
    if (op.op === 'removeBlock') {
      const blocks = op.stepBlockId
        ? removeStepChildBlock(next.blocks, op.stepBlockId, blockId)
        : removeTopLevelBlock(next.blocks, blockId);
      if (blocks) {
        next = {
          ...next,
          targets: next.targets.filter((target) => blocksReferenceTarget(blocks, target.id)),
          blocks: renumberTourSteps(blocks),
        };
      }
    }
    if (op.op === 'transformBlock') {
      next = { ...next, blocks: transformBlocks(next.blocks, blockId, op.type) };
    }
    if (op.op === 'setAction') {
      next = { ...next, blocks: setBlockAction(next.blocks, blockId, op.action ?? null) };
    }
    if (op.op === 'setPlacement') {
      next = { ...next, blocks: setBlockPlacement(next.blocks, blockId, op.placement) };
    }
    if (op.op === 'setPresentationAnchor') {
      const presentationAnchor = op.presentationAnchor;
      if (!presentationAnchor || isPresentationAnchor(presentationAnchor)) {
        next = {
          ...next,
          blocks: setBlockPresentationAnchor(next.blocks, blockId, presentationAnchor),
        };
      }
    }
    if (op.op === 'attachTarget') {
      const previousTarget = next.targets.find((target) => target.id === op.targetId);
      const label =
        op.identity?.display.authorLabel ??
        op.fingerprint.accessibleName ??
        op.fingerprint.stableAttributes['data-lodariq-id'] ??
        op.fingerprint.tagName;
      next = {
        ...next,
        targets: [
          ...next.targets.filter((target) => target.id !== op.targetId),
          {
            id: op.targetId,
            fingerprint: structuredClone(op.fingerprint),
            ...(previousTarget?.lifecycle
              ? { lifecycle: structuredClone(previousTarget.lifecycle) }
              : {}),
            ...(op.identity
              ? {
                  identity: {
                    ...structuredClone(op.identity),
                    targetId: op.targetId,
                  },
                }
              : {}),
          },
        ],
        blocks: attachTargetToBlocks(next.blocks, blockId, op.targetId, label),
      };
    }
    if (op.op === 'updateTargetEvidence') {
      next = {
        ...next,
        targets: next.targets.map((target) =>
          target.id === op.targetId
            ? {
                ...target,
                fingerprint: structuredClone(op.fingerprint),
                identity: {
                  ...structuredClone(op.identity),
                  targetId: op.targetId,
                },
              }
            : target,
        ),
      };
    }
    if (op.op === 'removeTarget') {
      const blocks = removeTargetFromBlocks(next.blocks, blockId, op.targetId);
      next = {
        ...next,
        targets: blocksReferenceTarget(blocks, op.targetId)
          ? next.targets
          : next.targets.filter((target) => target.id !== op.targetId),
        blocks,
      };
    }
    if (op.op === 'setTargetLifecycle') {
      next = {
        ...next,
        targets: next.targets.map((target) => {
          if (target.id !== op.targetId) return target;
          const lifecycle = op.lifecycle ? structuredClone(op.lifecycle) : undefined;
          return lifecycle ? { ...target, lifecycle } : { ...target, lifecycle: undefined };
        }),
      };
    }
    if (op.op === 'replaceDocument') {
      next = structuredClone(op.document);
    }
  }
  return next;
}

function findContainingTourStepId(
  blocks: LodariqBlock[],
  blockId: string,
  currentStepId?: string,
): string | undefined {
  for (const block of blocks) {
    const stepId = block.type === 'tourStep' ? block.id : currentStepId;
    if (block.id === blockId) return stepId;
    const childStepId = findContainingTourStepId(block.children, blockId, stepId);
    if (childStepId) return childStepId;
  }
  return undefined;
}

function inlinePreviewControlContext(
  document: LodariqDocument,
  bodyBlockId: string,
): InlinePreviewControlContext | null {
  const stepId = findContainingTourStepId(document.blocks, bodyBlockId);
  const step = document.blocks.find((block) => block.id === stepId && block.type === 'tourStep');
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  if (!step || !tooltip) return null;
  const actionBlock = firstInlineActionBlock(tooltip.children);
  const actionType = inlineActionType(actionBlock?.props.action?.type);
  return {
    stepId: step.id,
    tooltipBlockId: tooltip.id,
    placement: tooltip.props.placement ?? 'bottom',
    ...(actionBlock && actionType ? { actionBlockId: actionBlock.id, actionType } : {}),
  };
}

function firstInlineActionBlock(blocks: LodariqBlock[]): LodariqBlock | null {
  for (const block of blocks) {
    if (block.type === 'button' || block.type === 'link') return block;
    const childAction = firstInlineActionBlock(block.children);
    if (childAction) return childAction;
  }
  return null;
}

function inlineActionType(
  value: BlockActionProps['type'] | undefined,
): InlinePreviewControlContext['actionType'] | undefined {
  if (
    value === 'next' ||
    value === 'back' ||
    value === 'complete' ||
    value === 'dismiss' ||
    value === 'clickTarget'
  ) {
    return value;
  }
  return undefined;
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

function renderAppearanceSheet(): string {
  const groups = AUTHORING_APPEARANCE_OPTION_GROUPS.map((group) => {
    const options = group.options
      .map(
        (option) => `
          <button
            type="button"
            role="radio"
            aria-checked="false"
            data-appearance-key="${group.key}"
            data-appearance-value="${option.value}"
          >${option.label}</button>`,
      )
      .join('');
    return `
      <fieldset class="appearance-group" data-appearance-group="${group.key}">
        <legend>${group.label}</legend>
        <div class="appearance-options">${options}</div>
      </fieldset>`;
  }).join('');
  return `
    <section
      id="lodariq-appearance-sheet"
      class="appearance-sheet"
      data-appearance-sheet
      aria-label="Experience appearance"
      hidden
    >
      <header>
        <span>
          <strong>Appearance</strong>
          <small>Safe choices, applied in the live preview</small>
        </span>
      </header>
      ${groups}
    </section>`;
}

function resolvedDocumentAppearance(document: LodariqDocument | null): ExperienceAppearance {
  return structuredClone(document?.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE);
}

function syncAppearanceControls(sheet: HTMLElement | null, appearance: ExperienceAppearance): void {
  if (!sheet) return;
  for (const button of sheet.querySelectorAll<HTMLButtonElement>(
    '[data-appearance-key][data-appearance-value]',
  )) {
    const key = button.dataset['appearanceKey'];
    const value = button.dataset['appearanceValue'];
    const selected = isAppearanceOption(key, value) && appearance[key] === value;
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
    button.dataset['selected'] = selected ? 'true' : 'false';
  }
}

function isAppearanceOption(
  key: string | undefined,
  value: string | undefined,
): key is AppearanceOptionKey {
  if (!key || !value) return false;
  const group = AUTHORING_APPEARANCE_OPTION_GROUPS.find((candidate) => candidate.key === key);
  return Boolean(group?.options.some((option) => option.value === value));
}

function createPanelStyles(): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    :host {
      position: fixed;
      top: 76px;
      right: 18px;
      bottom: auto;
      display: block;
      width: min(700px, calc(100vw - 72px));
      height: min(620px, calc(100dvh - 94px));
      max-width: calc(100vw - 72px);
      max-height: calc(100dvh - 36px);
      min-height: min(320px, calc(100dvh - 100px));
      z-index: 2147483646;
      pointer-events: auto;
      font-family: ${CREATOR_CHROME_FONT_STACK};
      box-sizing: border-box;
      color-scheme: light;
    }

    .panel {
      position: relative;
      display: grid;
      grid-template-rows: ${AUTHORING_PANEL_HEADER_HEIGHT}px minmax(0, 1fr);
      width: 100%;
      height: 100%;
      border-radius: 14px;
      background: #ffffff;
      box-shadow:
        0 24px 60px rgba(15, 36, 31, 0.18),
        0 6px 18px rgba(15, 36, 31, 0.12),
        0 0 0 1px rgba(15, 76, 64, 0.08) inset;
      isolation: isolate;
    }

    .authoring-bar {
      position: relative;
      z-index: 3;
      display: flex;
      min-width: 0;
      height: ${AUTHORING_PANEL_HEADER_HEIGHT}px;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      border: 1px solid #0a4f43;
      border-bottom-color: #0a4f43;
      border-radius: 13px 13px 0 0;
      background: #003f35;
      color: #ffffff;
      cursor: grab;
      padding: 0 12px 0 0;
      box-sizing: border-box;
      touch-action: none;
      user-select: none;
    }

    .authoring-bar[data-lodariq-authoring-dragging="true"] {
      cursor: grabbing;
    }

    .authoring-bar button,
    .authoring-bar input,
    .authoring-bar select {
      cursor: pointer;
      touch-action: auto;
      user-select: auto;
    }

    .authoring-bar input {
      cursor: text;
    }

    .panel-surface {
      position: relative;
      z-index: 2;
      min-width: 0;
      min-height: 0;
      width: 100%;
      height: 100%;
      border: 1px solid #d8dfe1;
      border-top: 0;
      border-radius: 0 0 13px 13px;
      background: #ffffff;
      overflow: hidden;
      box-sizing: border-box;
    }

    .panel-drag-handle {
      display: flex;
      width: 30px;
      min-width: 30px;
      height: 100%;
      flex: 0 0 30px;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: 13px 0 0 0;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }

    .panel-drag-handle[data-lodariq-authoring-dragging="true"] {
      cursor: grabbing;
    }

    .panel-drag-handle:focus-visible {
      outline: 3px solid color-mix(in srgb, ${CREATOR_CHROME_TOKENS.focus} 82%, transparent);
      outline-offset: -4px;
    }

    .panel-drag-grip {
      display: grid;
      width: 20px;
      height: 28px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.72);
      opacity: 0.82;
    }

    .panel-drag-handle:hover .panel-drag-grip {
      background: rgba(255, 255, 255, 0.07);
      color: #ffffff;
      opacity: 1;
    }

    .panel-heading {
      display: flex;
      min-width: 0;
      flex: 1 1 auto;
      align-items: center;
      gap: 10px;
    }

    .panel-title-cluster {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 18px;
    }

    .panel-document-title {
      display: block;
      min-width: 0;
      width: min(154px, 26vw);
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: 7px;
      background: transparent;
      color: #ffffff;
      font-family: inherit;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.25;
      margin: 0;
      outline: 0;
      padding: 2px 4px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-document-title:hover,
    .panel-document-title:focus {
      border-color: rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.07);
    }

    .panel-zoom {
      width: 72px;
      height: 30px;
      border: 1px solid rgba(255, 255, 255, 0.42);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      font: inherit;
      font-size: 12px;
      font-weight: 650;
      padding: 0 9px;
    }

    .panel-zoom option {
      color: #162033;
    }

    .panel-document-title:focus-visible {
      outline: 2px solid ${CREATOR_CHROME_TOKENS.focus};
      outline-offset: 1px;
    }

    .target-picking-label {
      display: none;
      overflow: hidden;
      color: ${CREATOR_CHROME_TOKENS.ink};
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .authoring-bar-actions {
      position: relative;
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 2px;
    }

    .save-state {
      display: none;
      align-items: center;
      gap: 4px;
      color: ${CREATOR_CHROME_TOKENS.muted};
      font-size: 11px;
      font-weight: 550;
      line-height: 1.25;
      white-space: nowrap;
    }

    .save-state-icon,
    .save-state-icon svg {
      display: block;
      width: 12px;
      height: 12px;
    }

    .save-state[data-state="saving"] {
      color: ${CREATOR_CHROME_TOKENS.muted};
    }

    .save-state[data-state="error"] {
      color: ${CREATOR_CHROME_STATUS_TOKENS.danger};
    }

    .header-action {
      position: relative;
      display: grid;
      width: 32px;
      height: 32px;
      min-height: 32px;
      place-items: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: rgba(255, 255, 255, 0.82);
      font: inherit;
      cursor: pointer;
    }

    .header-action:hover,
    .header-action:focus-visible {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.07);
      color: #ffffff;
    }

    .secondary-header-action {
      display: none;
    }

    .header-action::after {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 7;
      max-width: 180px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 8px;
      background: ${CREATOR_CHROME_TOKENS.surface};
      color: ${CREATOR_CHROME_TOKENS.ink};
      content: attr(data-tooltip);
      font-size: 11px;
      font-weight: 650;
      line-height: 1.2;
      opacity: 0;
      padding: 7px 9px;
      pointer-events: none;
      transform: translateY(-2px);
      transition: opacity 120ms ease, transform 120ms ease;
      white-space: nowrap;
    }

    .header-action:hover::after,
    .header-action:focus-visible::after {
      opacity: 1;
      transform: translateY(0);
    }

    .header-action-icon,
    .header-action-icon svg {
      display: block;
      width: 18px;
      height: 18px;
    }

    .panel-options-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 5;
      display: grid;
      width: 184px;
      gap: 2px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 12px;
      background: ${CREATOR_CHROME_TOKENS.surface};
      padding: 6px;
      box-shadow:
        0 18px 46px rgba(0, 0, 0, 0.42),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    }

    .panel-options-menu[hidden] {
      display: none;
    }

    .panel-options-menu button {
      min-height: 40px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 10px;
      text-align: left;
    }

    .panel-options-menu button:hover {
      background: rgba(255, 255, 255, 0.07);
      color: ${CREATOR_CHROME_TOKENS.action};
    }

    .panel-options-menu button[role="menuitemradio"][aria-checked="true"] {
      background: rgba(255, 255, 255, 0.07);
      color: ${CREATOR_CHROME_TOKENS.action};
    }

    .panel-resize-handle {
      position: absolute;
      right: 2px;
      bottom: 2px;
      z-index: 5;
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: #65716d;
      cursor: nwse-resize;
      touch-action: none;
    }

    .panel-resize-handle:hover,
    .panel-resize-handle:focus-visible,
    .panel-resize-handle[data-lodariq-authoring-resizing="true"] {
      border-color: rgba(255, 255, 255, 0.12);
      background: #f4f7f6;
      color: #003f35;
    }

    .panel-resize-icon,
    .panel-resize-icon svg {
      display: block;
      width: 16px;
      height: 16px;
    }

    .appearance-sheet {
      position: absolute;
      top: 52px;
      right: 8px;
      z-index: 6;
      display: grid;
      width: min(296px, calc(100% - 16px));
      gap: 14px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 12px;
      background: ${CREATOR_CHROME_TOKENS.surface};
      color: ${CREATOR_CHROME_TOKENS.ink};
      padding: 16px;
      box-shadow:
        0 22px 54px rgba(0, 0, 0, 0.44),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      box-sizing: border-box;
    }

    .appearance-sheet[hidden] {
      display: none;
    }

    .appearance-sheet > header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .appearance-sheet > header span {
      display: grid;
      gap: 3px;
    }

    .appearance-sheet > header strong {
      font-family: inherit;
      font-size: 15px;
      font-weight: 640;
      letter-spacing: -0.01em;
    }

    .appearance-sheet > header small {
      color: ${CREATOR_CHROME_TOKENS.muted};
      font-size: 11px;
      line-height: 1.35;
    }

    .appearance-group {
      display: grid;
      min-width: 0;
      gap: 7px;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .appearance-group legend {
      color: ${CREATOR_CHROME_TOKENS.muted};
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      padding: 0;
    }

    .appearance-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(62px, 1fr));
      gap: 6px;
    }

    .appearance-options button {
      min-height: 36px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 8px;
      background: ${CREATOR_CHROME_TOKENS.canvas};
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      padding: 7px 8px;
    }

    .appearance-options button:hover {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.05);
    }

    .appearance-options button[data-selected="true"] {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      background: rgba(61, 232, 176, 0.1);
      box-shadow: 0 0 0 1px ${CREATOR_CHROME_TOKENS.action} inset;
      color: ${CREATOR_CHROME_TOKENS.action};
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }

    button:focus-visible {
      outline: 3px solid color-mix(in srgb, ${CREATOR_CHROME_TOKENS.focus} 76%, transparent);
      outline-offset: 2px;
    }

    slot[name="authoring-frame"] {
      display: block;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    ::slotted(iframe[slot="authoring-frame"]) {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #ffffff;
      pointer-events: auto;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) {
      width: min(300px, calc(100vw - 24px));
      height: 44px;
      max-height: 44px;
      min-height: 44px;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel {
      grid-template-rows: 44px;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .authoring-bar {
      height: 44px;
      border-bottom-color: ${CREATOR_CHROME_TOKENS.border};
      border-radius: 999px;
      padding-right: 0;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-drag-handle {
      width: auto;
      min-width: 0;
      flex: 1 1 auto;
      justify-content: center;
      border-radius: 999px;
      padding: 0 14px;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-drag-grip,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-heading,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .authoring-bar-actions,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .appearance-sheet,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-resize-handle,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-surface {
      display: none;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .target-picking-label {
      display: inline;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) {
      height: 44px;
      max-height: 44px;
      min-height: 44px;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .panel {
      grid-template-rows: 44px;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .authoring-bar {
      height: 44px;
      border-bottom-color: ${CREATOR_CHROME_TOKENS.border};
      border-radius: 999px;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .panel-surface {
      display: none;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .appearance-sheet {
      display: none;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .panel-resize-handle {
      display: none;
    }

    @media (max-width: 600px) {
      :host {
        top: 72px;
        right: 12px;
        width: min(320px, calc(100vw - 24px));
        height: min(480px, 72dvh);
        max-height: calc(100dvh - 94px);
        min-height: min(260px, calc(100dvh - 94px));
        max-width: calc(100vw - 24px);
      }

      .authoring-bar {
        padding-right: 5px;
      }

      .panel-drag-grip {
        display: none;
      }

      .panel-resize-handle {
        display: none;
      }

    }
  `,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function productionOperationFailure(message: string): ProductionPromotionResult {
  return {
    ok: false,
    state: 'failed',
    code: 'internal_error',
    message,
  };
}
