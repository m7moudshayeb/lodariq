import type {
  AuthoringActivationGrantContext,
  AuthoringAuthorizationContext,
  AuthoringAuthorizationResult,
  AuthoringCodeExchangeResult,
  AuthoringDocumentIntent,
  CreatorModuleDescriptor,
  NonProductionPublicSdkBootstrapContext,
} from '@lodariq/schema';
import {
  AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER,
  AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE,
  AUTHORING_LAUNCHER_SHORTCUT,
} from '@lodariq/schema/authoring-entry-runtime';
import {
  HOSTED_CREATOR_PANEL_STATE_EVENT,
  HOSTED_CREATOR_PANEL_TOGGLE_EVENT,
  HOSTED_CREATOR_REGISTRATION_PROPERTY,
  type HostedCreatorPanelState,
} from '@lodariq/schema/hosted-creator';
import {
  Eye,
  EyeOff,
  List,
  Plus,
  createElement as createLucideElement,
  type IconNode,
} from 'lucide';

const ACTIVATION_PROTOCOL = 'lodariq.authoring.activation.v1';
const BOOTSTRAP_GRANT_HEADER = 'x-lodariq-bootstrap-grant';
const PKCE_CHALLENGE_METHOD = 'S256';
const AUTHORING_ORIGINS_BY_API = {
  'https://api.lodariq.io': {
    app: 'https://app.lodariq.io',
    creator: 'https://cdn.lodariq.io',
    editor: 'https://editor.lodariq.io',
  },
  'https://staging-api.lodariq.io': {
    app: 'https://staging-app.lodariq.io',
    creator: 'https://staging-cdn.lodariq.io',
    editor: 'https://staging-editor.lodariq.io',
  },
} as const;
const CREATOR_CDN_ORIGINS: ReadonlySet<string> = new Set(
  Object.values(AUTHORING_ORIGINS_BY_API).map(({ creator }) => creator),
);
const API_ORIGINS: ReadonlySet<string> = new Set(Object.keys(AUTHORING_ORIGINS_BY_API));
const AUTHORIZATION_RESULT_TYPE = 'authoring.authorization.result';
const AUTHORIZATION_REQUEST_TYPE = 'authoring.activation.request';
const ACTIVATION_TIMEOUT_MS = 2 * 60 * 1_000;
const CREATOR_MODULE_TIMEOUT_MS = 15_000;
const POPUP_PING_INTERVAL_MS = 400;
const OPAQUE_VALUE_MIN_LENGTH = 32;
const LAUNCHER_VISIBILITY_STORAGE_KEY = 'lodariq.authoring.launcher.visibility.v1';
const LAUNCHER_VISIBLE_STORAGE_VALUE = 'visible';
const CREATOR_CONTENT_ADDRESS = /\/sha256-([0-9a-f]{64})(?:\/|$)/u;
const SUBRESOURCE_INTEGRITY = /^sha256-[A-Za-z0-9+/]+={0,2}$/u;

const ACTIVATION_CAPABILITIES = ['documents:create', 'documents:list', 'documents:select'] as const;
const NEW_TOUR_DOCUMENT_INTENT = { kind: 'new-draft', documentType: 'tour' } as const;

const LAUNCHER_ICONS = {
  eye: Eye,
  'eye-off': EyeOff,
  list: List,
  plus: Plus,
} as const satisfies Readonly<Record<string, IconNode>>;
type LauncherIconName = keyof typeof LAUNCHER_ICONS;

const LAUNCHER_ACTIONS = [
  { icon: 'plus', id: 'new-experience', label: 'New experience' },
  { icon: 'list', id: 'experiences-on-page', label: 'Experiences on this page' },
  { icon: 'eye', id: 'preview-as-user', label: 'Preview as user' },
  { icon: 'eye-off', id: 'hide-launcher', label: 'Hide Lodariq' },
] as const satisfies ReadonlyArray<{
  icon: LauncherIconName;
  id: string;
  label: string;
}>;
type LauncherActionId = (typeof LAUNCHER_ACTIONS)[number]['id'];

const ACTIVE_AUTHORING_ACTION_COPY: Partial<Record<LauncherActionId, string>> = {
  'new-experience': 'New experience — close current authoring first',
  'experiences-on-page': 'Browse experiences — close current authoring first',
};

const LAUNCHER_COPY = {
  actionsLabel: 'Lodariq actions',
  minimizeAuthoring: 'Minimize Lodariq authoring',
  newExperienceDescription: 'Choose an experience type to start.',
  newExperienceTitle: 'New experience',
  restoreAuthoring: 'Restore Lodariq authoring',
  tourDescription: 'Guide people through a sequence of steps.',
  tourLabel: 'Tour',
} as const;

const LAUNCHER_STATE_COPY = {
  idle: { label: 'Open Lodariq actions', status: '' },
  opening: { label: 'Connecting to Lodariq', status: 'Connecting…' },
  blocked: { label: 'Open Lodariq actions', status: 'Allow the popup, then retry' },
  error: { label: 'Open Lodariq actions', status: 'Could not connect. Try again' },
  previewing: { label: 'Starting Lodariq preview', status: 'Starting preview…' },
  'preview-error': { label: 'Open Lodariq actions', status: 'Preview could not start' },
  'preview-unavailable': {
    label: 'Open Lodariq actions',
    status: 'No published experience is available to preview',
  },
  'authoring-conflict': {
    label: 'Open Lodariq actions',
    status: 'Close current authoring before opening another experience',
  },
  active: { label: 'Open Lodariq actions', status: 'Authoring open' },
} as const;

const DRAG_THRESHOLD = 4;
const KEYBOARD_MOVE_DISTANCE = 16;
const KEYBOARD_MOVE_DISTANCE_LARGE = 48;
const LAUNCHER_SIZE = 58;
const LAUNCHER_MARGIN = 18;
const MOBILE_LAUNCHER_MARGIN = 16;
const MOBILE_VIEWPORT_WIDTH = 600;
const PALETTE_ESTIMATED_HEIGHT =
  LAUNCHER_ACTIONS.length * 44 + (LAUNCHER_ACTIONS.length - 1) * 8 + 12;
const TYPE_SURFACE_WIDTH = 256;
const TYPE_SURFACE_GAP = 12;
let launcherIdSequence = 0;

export type PublicAuthoringLauncherState = keyof typeof LAUNCHER_STATE_COPY;

export interface HostedCreatorActivation {
  activationGrant: string;
  context: AuthoringActivationGrantContext;
  apiOrigin: string;
  documentIntent?: AuthoringDocumentIntent;
  /** Memory-only host callback; the authoring picker bounds its opaque return value per capture. */
  getTargetStateId?: () => string | undefined;
}

export interface HostedCreatorModule {
  activateLodariqAuthoring(input: HostedCreatorActivation): Promise<void> | void;
}

export interface PublicAuthoringActivationOptions {
  documentIntent?: AuthoringDocumentIntent;
  /** Reads the host application's current opaque state only when a target pick begins. */
  getTargetStateId?: () => string | undefined;
  fetchFn?: typeof fetch;
  crypto?: Crypto;
  hostWindow?: Window;
  loadCreatorModule?: (descriptor: CreatorModuleDescriptor) => Promise<HostedCreatorModule>;
  refreshContext?: () => Promise<NonProductionPublicSdkBootstrapContext>;
  timeoutMs?: number;
  onStateChange?: (state: PublicAuthoringLauncherState) => void;
  onPreview?: () => Promise<void> | void;
  /** The public launcher is hidden unless a shortcut or dashboard entry intent reveals it. */
  initiallyVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export interface PublicAuthoringLauncher {
  readonly element: HTMLElement;
  activate(documentIntent?: AuthoringDocumentIntent): Promise<void>;
  destroy(): void;
  getState(): PublicAuthoringLauncherState;
  hide(): void;
  isVisible(): boolean;
  show(): void;
  toggleVisibility(): void;
}

interface PkcePair {
  state: string;
  verifier: string;
  challenge: string;
}

/**
 * Runs the exact-origin popup + PKCE exchange. Every credential stays inside
 * this call and the activation grant is handed directly to the lazy module.
 */
export async function activatePublicAuthoring(
  initialContext: NonProductionPublicSdkBootstrapContext,
  options: PublicAuthoringActivationOptions = {},
): Promise<void> {
  const hostWindow = options.hostWindow ?? window;
  const customerOrigin = hostWindow.location.origin;
  const initialAuthoring = availableAuthoring(initialContext, customerOrigin);
  if (!initialAuthoring) {
    throw new Error('Lodariq authoring is unavailable');
  }

  // This must be the first browser-affecting action so it remains inside the
  // creator's click/tap call stack. No async work happens before window.open.
  const popup = hostWindow.open(
    initialAuthoring.activationUrl,
    'lodariq-authoring-activation',
    'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes',
  );
  if (!popup) {
    options.onStateChange?.('blocked');
    throw new ActivationFailure('blocked');
  }

  options.onStateChange?.('opening');
  let activationGrant = '';
  try {
    const [context, pkce] = await Promise.all([
      options.refreshContext ? options.refreshContext() : Promise.resolve(initialContext),
      createPkcePair(options.crypto ?? hostWindow.crypto),
    ]);
    const authoring = availableAuthoring(context, customerOrigin);
    if (
      !authoring ||
      context.installationId !== initialContext.installationId ||
      context.environmentId !== initialContext.environmentId
    ) {
      throw new Error('Lodariq authoring is unavailable');
    }

    const fetchFn = options.fetchFn ?? fetch;
    const authorization = await createAuthorizationRequest(
      context,
      pkce,
      options.documentIntent,
      fetchFn,
    );
    const result = await waitForAuthorizationResult({
      hostWindow,
      popup,
      appOrigin: authoring.appOrigin,
      authorization,
      state: pkce.state,
      timeoutMs: options.timeoutMs ?? ACTIVATION_TIMEOUT_MS,
    });
    const exchanged = await exchangeAuthorizationCode(
      context,
      pkce,
      result,
      options.documentIntent,
      fetchFn,
    );
    activationGrant = exchanged.activationGrant;
    const loadCreatorModule =
      options.loadCreatorModule ??
      ((descriptor: CreatorModuleDescriptor) => loadHostedCreatorModule(descriptor, hostWindow));
    const creator = await loadCreatorModule(exchanged.creatorModule);
    if (!creator || typeof creator.activateLodariqAuthoring !== 'function') {
      throw new Error('Lodariq creator module is invalid');
    }

    const documentIntent = options.documentIntent ?? exchanged.context.documentIntent;
    const creatorInput: HostedCreatorActivation = {
      activationGrant,
      context: exchanged.context,
      apiOrigin: requireTrustedApiOrigin(authoring.exchangeUrl),
      ...(documentIntent ? { documentIntent } : {}),
      ...(options.getTargetStateId ? { getTargetStateId: options.getTargetStateId } : {}),
    };
    let creatorActivation: Promise<void> | void;
    try {
      creatorActivation = creator.activateLodariqAuthoring(creatorInput);
    } finally {
      activationGrant = '';
      creatorInput.activationGrant = '';
    }
    await creatorActivation;
    options.onStateChange?.('active');
  } catch (error) {
    options.onStateChange?.(error instanceof ActivationFailure ? error.state : 'error');
    throw normalizeActivationError(error);
  } finally {
    // Explicitly drop the short-lived values after exchange/handoff. They were
    // never written to a URL, DOM attribute, storage, custom event, or log.
    activationGrant = '';
    try {
      if (!popup.closed) popup.close();
    } catch {
      /* Cross-origin popup cleanup is best-effort. */
    }
  }
}

/** Renders only a compact visible control; there is no page-wide hit-test layer. */
export function createPublicAuthoringLauncher(
  context: NonProductionPublicSdkBootstrapContext,
  options: PublicAuthoringActivationOptions = {},
): PublicAuthoringLauncher {
  const hostWindow = options.hostWindow ?? window;
  const hostDocument = hostWindow.document;
  const initiallyVisible = options.initiallyVisible ?? resolveInitialLauncherVisibility(hostWindow);
  const host = hostDocument.createElement('div');
  host.setAttribute('data-lodariq-launcher', '');
  host.style.cssText = [
    'position:fixed',
    'z-index:2147483000',
    `display:${initiallyVisible ? 'block' : 'none'}`,
    'width:max-content',
    'height:max-content',
    'pointer-events:none',
  ].join(';');

  const root = host.attachShadow({ mode: 'open' });
  const style = hostDocument.createElement('style');
  style.textContent = launcherStyles;
  const shell = hostDocument.createElement('div');
  shell.className = 'shell';
  shell.dataset['pinned'] = 'false';
  shell.dataset['surfaceOpen'] = 'false';
  shell.dataset['dismissed'] = 'false';

  const launcherId = createLauncherId();
  const palette = hostDocument.createElement('div');
  palette.className = 'palette';
  palette.id = `lodariq-public-launcher-palette-${launcherId}`;
  palette.setAttribute('role', 'toolbar');
  palette.setAttribute('aria-label', LAUNCHER_COPY.actionsLabel);
  palette.setAttribute('aria-orientation', 'vertical');

  const button = hostDocument.createElement('button');
  button.type = 'button';
  button.className = 'launcher';
  button.setAttribute('aria-controls', palette.id);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute(
    'aria-keyshortcuts',
    'ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Escape',
  );
  const mark = hostDocument.createElement('span');
  mark.className = 'mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'LQ';
  button.appendChild(mark);

  const status = hostDocument.createElement('span');
  status.className = 'status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const typeSurface = hostDocument.createElement('div');
  typeSurface.className = 'type-surface';
  typeSurface.id = `lodariq-public-launcher-surface-${launcherId}`;
  typeSurface.setAttribute('role', 'dialog');
  typeSurface.setAttribute('aria-modal', 'false');
  typeSurface.hidden = true;
  const typeHeading = hostDocument.createElement('strong');
  typeHeading.className = 'type-heading';
  typeHeading.id = `lodariq-public-launcher-surface-title-${launcherId}`;
  typeHeading.textContent = LAUNCHER_COPY.newExperienceTitle;
  typeSurface.setAttribute('aria-labelledby', typeHeading.id);
  const typeDescription = hostDocument.createElement('span');
  typeDescription.className = 'type-description';
  typeDescription.textContent = LAUNCHER_COPY.newExperienceDescription;
  const tourButton = hostDocument.createElement('button');
  tourButton.type = 'button';
  tourButton.className = 'type-option';
  tourButton.dataset['experienceType'] = 'tour';
  const tourCopy = hostDocument.createElement('span');
  tourCopy.className = 'type-option-copy';
  const tourLabel = hostDocument.createElement('strong');
  tourLabel.textContent = LAUNCHER_COPY.tourLabel;
  const tourDescription = hostDocument.createElement('span');
  tourDescription.textContent = LAUNCHER_COPY.tourDescription;
  const tourArrow = hostDocument.createElement('span');
  tourArrow.className = 'type-option-arrow';
  tourArrow.setAttribute('aria-hidden', 'true');
  tourArrow.textContent = '→';
  tourCopy.append(tourLabel, tourDescription);
  tourButton.append(tourCopy, tourArrow);
  typeSurface.append(typeHeading, typeDescription, tourButton);

  const actionButtons = new Map<LauncherActionId, HTMLButtonElement>();
  const actionTooltips = new Map<LauncherActionId, HTMLElement>();
  for (const action of LAUNCHER_ACTIONS) {
    const wrapper = hostDocument.createElement('span');
    wrapper.className = 'action-wrap';
    const actionButton = hostDocument.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'action';
    actionButton.dataset['launcherAction'] = action.id;
    actionButton.setAttribute('aria-label', action.label);
    actionButton.appendChild(createLauncherIcon(hostDocument, action.icon));
    const tooltip = hostDocument.createElement('span');
    tooltip.className = 'tooltip';
    tooltip.id = `lodariq-public-launcher-tooltip-${launcherId}-${action.id}`;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = action.label;
    actionButton.setAttribute('aria-describedby', tooltip.id);
    if (action.id === 'new-experience') {
      actionButton.setAttribute('aria-controls', typeSurface.id);
      actionButton.setAttribute('aria-expanded', 'false');
      actionButton.setAttribute('aria-haspopup', 'dialog');
    }
    wrapper.append(actionButton, tooltip);
    palette.appendChild(wrapper);
    actionButtons.set(action.id, actionButton);
    actionTooltips.set(action.id, tooltip);
  }

  const safeAreaProbe = hostDocument.createElement('span');
  safeAreaProbe.className = 'safe-area-probe';
  safeAreaProbe.setAttribute('aria-hidden', 'true');
  shell.append(button, palette, typeSurface, status, safeAreaProbe);
  root.append(style, shell);
  hostDocument.body.append(host);

  let state: PublicAuthoringLauncherState = 'idle';
  let panelState: HostedCreatorPanelState = 'closed';
  let destroyed = false;
  let manuallyPlaced = false;
  let suppressClickAfterDrag = false;
  let suppressFocusReveal = false;
  let drag: LauncherDrag | null = null;

  const isVisible = (): boolean => host.style.display !== 'none';
  const setVisible = (visible: boolean): void => {
    if (destroyed || visible === isVisible()) return;
    if (!visible) dismiss(false);
    host.style.display = visible ? 'block' : 'none';
    storeLauncherVisibility(hostWindow, visible);
    options.onVisibilityChange?.(visible);
    if (visible) button.focus({ preventScroll: true });
  };
  const show = (): void => setVisible(true);
  const hide = (): void => setVisible(false);
  const toggleVisibility = (): void => setVisible(!isVisible());

  const setState = (next: PublicAuthoringLauncherState, notify = true): void => {
    if (destroyed) return;
    state = next;
    const copy = LAUNCHER_STATE_COPY[next];
    const busy = next === 'opening' || next === 'previewing';
    host.setAttribute('data-state', next);
    button.setAttribute('aria-label', launcherCenterLabel(panelState, copy.label));
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    status.textContent = copy.status;
    status.toggleAttribute('hidden', !copy.status);
    if (notify) options.onStateChange?.(next);
  };
  setState('idle', false);

  const setPinned = (pinned: boolean): void => {
    shell.dataset['pinned'] = String(pinned);
    button.setAttribute('aria-expanded', String(pinned));
    if (pinned) shell.dataset['dismissed'] = 'false';
  };

  const closeTypeSurface = (): void => {
    shell.dataset['surfaceOpen'] = 'false';
    typeSurface.hidden = true;
    actionButtons.get('new-experience')?.setAttribute('aria-expanded', 'false');
  };

  const dismiss = (restoreFocus: boolean): void => {
    setPinned(false);
    closeTypeSurface();
    shell.dataset['dismissed'] = 'true';
    if (!restoreFocus) return;
    suppressFocusReveal = true;
    button.focus();
    queueMicrotask(() => {
      suppressFocusReveal = false;
    });
  };

  const openTypeSurface = (): void => {
    setPinned(true);
    shell.dataset['dismissed'] = 'false';
    shell.dataset['surfaceOpen'] = 'true';
    typeSurface.hidden = false;
    actionButtons.get('new-experience')?.setAttribute('aria-expanded', 'true');
    tourButton.focus();
  };

  const syncActionCopy = (): void => {
    const panelIsActive = panelState !== 'closed';
    for (const action of LAUNCHER_ACTIONS) {
      const activeCopy = panelIsActive ? ACTIVE_AUTHORING_ACTION_COPY[action.id] : undefined;
      const copy = activeCopy ?? action.label;
      actionButtons.get(action.id)?.setAttribute('aria-label', copy);
      const tooltip = actionTooltips.get(action.id);
      if (tooltip) tooltip.textContent = copy;
    }
  };

  const keepCurrentAuthoringOpen = (): boolean => {
    if (panelState === 'closed') return false;
    closeTypeSurface();
    setPinned(true);
    setState('authoring-conflict');
    if (panelState === 'minimized') {
      hostWindow.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_TOGGLE_EVENT));
    }
    return true;
  };

  const activate = async (
    documentIntent?: AuthoringDocumentIntent,
    inheritConfiguredIntent = true,
  ): Promise<void> => {
    if (destroyed || state === 'opening' || state === 'previewing') return;
    if (keepCurrentAuthoringOpen()) return;
    const effectiveDocumentIntent =
      documentIntent ?? (inheritConfiguredIntent ? options.documentIntent : undefined);
    try {
      await activatePublicAuthoring(context, {
        ...options,
        documentIntent: effectiveDocumentIntent,
        hostWindow,
        onStateChange: setState,
      });
    } catch {
      // The visible, retryable launcher state is the error boundary. Raw
      // response bodies and credential-bearing values are intentionally hidden.
    }
  };

  const actionHandlers: Record<LauncherActionId, () => Promise<void> | void> = {
    'new-experience': () => {
      if (!keepCurrentAuthoringOpen()) openTypeSurface();
    },
    'experiences-on-page': () => {
      if (keepCurrentAuthoringOpen()) return;
      closeTypeSurface();
      setPinned(true);
      return activate(undefined, false);
    },
    'preview-as-user': async () => {
      closeTypeSurface();
      setPinned(true);
      if (!options.onPreview) {
        setState('preview-unavailable');
        return;
      }
      setState('previewing');
      try {
        await options.onPreview();
        setState(panelState === 'closed' ? 'idle' : 'active');
      } catch {
        setState('preview-error');
      }
    },
    'hide-launcher': hide,
  };

  const runAction = (actionId: LauncherActionId, actionButton: HTMLButtonElement): void => {
    if (actionButton.getAttribute('aria-busy') === 'true') return;
    actionButton.setAttribute('aria-busy', 'true');
    const actionResult = actionHandlers[actionId]();
    if (actionResult instanceof Promise) {
      void actionResult.finally(() => actionButton.removeAttribute('aria-busy'));
      return;
    }
    actionButton.removeAttribute('aria-busy');
  };

  const handleLauncherClick = (): void => {
    if (suppressClickAfterDrag) {
      suppressClickAfterDrag = false;
      return;
    }
    if (panelState !== 'closed') {
      dismiss(false);
      hostWindow.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_TOGGLE_EVENT));
      return;
    }
    if (shell.dataset['pinned'] === 'true' || shell.dataset['surfaceOpen'] === 'true') {
      dismiss(false);
      return;
    }
    shell.dataset['dismissed'] = 'false';
    setPinned(true);
  };

  const handleLauncherFocus = (): void => {
    if (!suppressFocusReveal) shell.dataset['dismissed'] = 'false';
  };

  const handleMouseEnter = (): void => {
    if (shell.dataset['surfaceOpen'] !== 'true') shell.dataset['dismissed'] = 'false';
  };

  const handleOutsidePointerDown = (event: PointerEvent): void => {
    if (event.composedPath().includes(host)) return;
    if (shell.dataset['pinned'] !== 'true' && shell.dataset['surfaceOpen'] !== 'true') return;
    dismiss(false);
  };

  const handlePanelState = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !isHostedCreatorPanelState(event.detail)) return;
    panelState = event.detail;
    syncActionCopy();
    if (panelState === 'closed' && (state === 'active' || state === 'authoring-conflict')) {
      setState('idle');
      return;
    }
    if (panelState !== 'closed' && state !== 'authoring-conflict') {
      setState('active');
      return;
    }
    button.setAttribute(
      'aria-label',
      launcherCenterLabel(panelState, LAUNCHER_STATE_COPY[state].label),
    );
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isLauncherVisibilityShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      toggleVisibility();
      return;
    }
    if (event.key !== 'Escape') return;
    const launcherHasFocus = root.activeElement !== null;
    if (
      shell.dataset['pinned'] !== 'true' &&
      shell.dataset['surfaceOpen'] !== 'true' &&
      !launcherHasFocus
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dismiss(launcherHasFocus);
  };

  const handleLauncherKeyDown = (event: KeyboardEvent): void => {
    const offset = launcherKeyboardOffset(event.key);
    if (!offset) return;
    event.preventDefault();
    manuallyPlaced = true;
    const rect = host.getBoundingClientRect();
    const distance = event.shiftKey ? KEYBOARD_MOVE_DISTANCE_LARGE : KEYBOARD_MOVE_DISTANCE;
    placeLauncher(
      host,
      shell,
      safeAreaProbe,
      hostWindow,
      rect.left + offset.x * distance,
      rect.top + offset.y * distance,
    );
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < DRAG_THRESHOLD) return;
    drag.moved = true;
    event.preventDefault();
    manuallyPlaced = true;
    shell.dataset['dragging'] = 'true';
    placeLauncher(
      host,
      shell,
      safeAreaProbe,
      hostWindow,
      event.clientX - drag.offsetX,
      event.clientY - drag.offsetY,
    );
  };

  const finishPointerDrag = (event: PointerEvent): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    try {
      button.releasePointerCapture?.(event.pointerId);
    } catch {
      /* A cancelled pointer may have already released capture. */
    }
    hostWindow.removeEventListener('pointermove', handlePointerMove);
    hostWindow.removeEventListener('pointerup', finishPointerDrag);
    hostWindow.removeEventListener('pointercancel', finishPointerDrag);
    delete shell.dataset['dragging'];
    if (drag.moved) suppressClickAfterDrag = true;
    drag = null;
  };

  const startPointerDrag = (event: PointerEvent): void => {
    if (drag || event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch {
      /* Pointer capture can be unavailable in older embedded browsers. */
    }
    hostWindow.addEventListener('pointermove', handlePointerMove);
    hostWindow.addEventListener('pointerup', finishPointerDrag);
    hostWindow.addEventListener('pointercancel', finishPointerDrag);
  };

  const syncPlacement = (): void => {
    if (destroyed || shell.dataset['dragging'] === 'true') return;
    if (!manuallyPlaced) {
      placeLauncherAtDefault(host, shell, safeAreaProbe, hostWindow);
      return;
    }
    const rect = host.getBoundingClientRect();
    placeLauncher(host, shell, safeAreaProbe, hostWindow, rect.left, rect.top);
  };

  for (const [actionId, actionButton] of actionButtons) {
    actionButton.addEventListener('click', () => runAction(actionId, actionButton));
  }
  tourButton.addEventListener('click', () => {
    if (tourButton.getAttribute('aria-busy') === 'true') return;
    tourButton.setAttribute('aria-busy', 'true');
    closeTypeSurface();
    setPinned(true);
    actionButtons.get('new-experience')?.focus();
    void activate(NEW_TOUR_DOCUMENT_INTENT).finally(() => {
      tourButton.removeAttribute('aria-busy');
    });
  });
  button.addEventListener('click', handleLauncherClick);
  button.addEventListener('focus', handleLauncherFocus);
  button.addEventListener('keydown', handleLauncherKeyDown);
  button.addEventListener('pointerdown', startPointerDrag);
  shell.addEventListener('mouseenter', handleMouseEnter);
  hostDocument.addEventListener('keydown', handleKeyDown, true);
  hostDocument.addEventListener('pointerdown', handleOutsidePointerDown, true);
  hostWindow.addEventListener(HOSTED_CREATOR_PANEL_STATE_EVENT, handlePanelState);
  hostWindow.addEventListener('resize', syncPlacement);
  hostWindow.visualViewport?.addEventListener('resize', syncPlacement);
  hostWindow.visualViewport?.addEventListener('scroll', syncPlacement);
  syncPlacement();

  return {
    element: host,
    activate,
    destroy: () => {
      destroyed = true;
      hostWindow.removeEventListener('pointermove', handlePointerMove);
      hostWindow.removeEventListener('pointerup', finishPointerDrag);
      hostWindow.removeEventListener('pointercancel', finishPointerDrag);
      hostWindow.removeEventListener('resize', syncPlacement);
      hostWindow.visualViewport?.removeEventListener('resize', syncPlacement);
      hostWindow.visualViewport?.removeEventListener('scroll', syncPlacement);
      hostDocument.removeEventListener('keydown', handleKeyDown, true);
      hostDocument.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      hostWindow.removeEventListener(HOSTED_CREATOR_PANEL_STATE_EVENT, handlePanelState);
      host.remove();
    },
    getState: () => state,
    hide,
    isVisible,
    show,
    toggleVisibility,
  };
}

interface LauncherDrag {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

interface ViewportBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface SafeAreaInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function createLauncherIcon(document: Document, iconName: LauncherIconName): SVGElement {
  const icon = createLucideElement(LAUNCHER_ICONS[iconName], {
    'aria-hidden': 'true',
    focusable: 'false',
    height: '20',
    width: '20',
  });
  return icon.ownerDocument === document ? icon : (document.importNode(icon, true) as SVGElement);
}

function createLauncherId(): string {
  launcherIdSequence += 1;
  return launcherIdSequence.toString(36);
}

function isHostedCreatorPanelState(value: unknown): value is HostedCreatorPanelState {
  return value === 'closed' || value === 'browsing' || value === 'open' || value === 'minimized';
}

function launcherCenterLabel(panelState: HostedCreatorPanelState, fallback: string): string {
  if (panelState === 'open' || panelState === 'browsing') return LAUNCHER_COPY.minimizeAuthoring;
  return panelState === 'minimized' ? LAUNCHER_COPY.restoreAuthoring : fallback;
}

function launcherKeyboardOffset(key: string): { x: number; y: number } | null {
  const offsets: Partial<Record<string, { x: number; y: number }>> = {
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
  };
  return offsets[key] ?? null;
}

function isLauncherVisibilityShortcut(event: KeyboardEvent): boolean {
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  return (
    !event.altKey &&
    !event.isComposing &&
    !event.repeat &&
    hasPrimaryModifier === AUTHORING_LAUNCHER_SHORTCUT.primaryModifier &&
    event.shiftKey === AUTHORING_LAUNCHER_SHORTCUT.shiftKey &&
    event.key.toLowerCase() === AUTHORING_LAUNCHER_SHORTCUT.key
  );
}

function resolveInitialLauncherVisibility(ownerWindow: Window): boolean {
  if (consumeDashboardLauncherEntryIntent(ownerWindow)) {
    storeLauncherVisibility(ownerWindow, true);
    return true;
  }
  try {
    return (
      ownerWindow.sessionStorage.getItem(LAUNCHER_VISIBILITY_STORAGE_KEY) ===
      LAUNCHER_VISIBLE_STORAGE_VALUE
    );
  } catch {
    return false;
  }
}

function consumeDashboardLauncherEntryIntent(ownerWindow: Window): boolean {
  let url: URL;
  try {
    url = new URL(ownerWindow.location.href);
  } catch {
    return false;
  }
  if (
    url.searchParams.get(AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER) !==
    AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE
  ) {
    return false;
  }
  url.searchParams.delete(AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER);
  try {
    ownerWindow.history.replaceState(
      ownerWindow.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    /* The non-secret entry intent remains safe if the host blocks history replacement. */
  }
  return true;
}

function storeLauncherVisibility(ownerWindow: Window, visible: boolean): void {
  try {
    if (visible) {
      ownerWindow.sessionStorage.setItem(
        LAUNCHER_VISIBILITY_STORAGE_KEY,
        LAUNCHER_VISIBLE_STORAGE_VALUE,
      );
      return;
    }
    ownerWindow.sessionStorage.removeItem(LAUNCHER_VISIBILITY_STORAGE_KEY);
  } catch {
    /* UI preference persistence is optional and never stores activation credentials. */
  }
}

function placeLauncherAtDefault(
  host: HTMLElement,
  shell: HTMLElement,
  safeAreaProbe: HTMLElement,
  ownerWindow: Window,
): void {
  const viewport = visibleViewportBounds(ownerWindow);
  const safeArea = readSafeAreaInsets(ownerWindow, safeAreaProbe);
  const margin = launcherViewportMargin(viewport.width);
  placeLauncher(
    host,
    shell,
    safeAreaProbe,
    ownerWindow,
    viewport.right - safeArea.right - LAUNCHER_SIZE - margin,
    viewport.bottom - safeArea.bottom - LAUNCHER_SIZE - margin,
  );
}

function placeLauncher(
  host: HTMLElement,
  shell: HTMLElement,
  safeAreaProbe: HTMLElement,
  ownerWindow: Window,
  left: number,
  top: number,
): void {
  const viewport = visibleViewportBounds(ownerWindow);
  const safeArea = readSafeAreaInsets(ownerWindow, safeAreaProbe);
  const margin = launcherViewportMargin(viewport.width);
  const minimumLeft = viewport.left + safeArea.left + margin;
  const minimumTop = viewport.top + safeArea.top + margin;
  const maximumLeft = Math.max(
    minimumLeft,
    viewport.right - safeArea.right - LAUNCHER_SIZE - margin,
  );
  const maximumTop = Math.max(
    minimumTop,
    viewport.bottom - safeArea.bottom - LAUNCHER_SIZE - margin,
  );
  const nextLeft = clamp(left, minimumLeft, maximumLeft);
  const nextTop = clamp(top, minimumTop, maximumTop);
  host.style.left = `${nextLeft}px`;
  host.style.top = `${nextTop}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  syncLauncherFlyoutPlacement(shell, nextLeft, nextTop, viewport, safeArea, margin);
}

function syncLauncherFlyoutPlacement(
  shell: HTMLElement,
  left: number,
  top: number,
  viewport: ViewportBounds,
  safeArea: SafeAreaInsets,
  margin: number,
): void {
  const topBoundary = viewport.top + safeArea.top + margin;
  const leftBoundary = viewport.left + safeArea.left + margin;
  shell.dataset['paletteBelow'] = String(top - PALETTE_ESTIMATED_HEIGHT < topBoundary);
  shell.dataset['alignLeft'] = String(left - TYPE_SURFACE_WIDTH - TYPE_SURFACE_GAP < leftBoundary);
}

function visibleViewportBounds(ownerWindow: Window): ViewportBounds {
  const viewport = ownerWindow.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? ownerWindow.innerWidth;
  const height = viewport?.height ?? ownerWindow.innerHeight;
  return {
    bottom: top + height,
    left,
    right: left + width,
    top,
    width,
  };
}

function readSafeAreaInsets(ownerWindow: Window, probe: HTMLElement): SafeAreaInsets {
  const computed = ownerWindow.getComputedStyle(probe);
  return {
    bottom: cssPixelValue(computed.paddingBottom),
    left: cssPixelValue(computed.paddingLeft),
    right: cssPixelValue(computed.paddingRight),
    top: cssPixelValue(computed.paddingTop),
  };
}

function cssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function launcherViewportMargin(viewportWidth: number): number {
  return viewportWidth <= MOBILE_VIEWPORT_WIDTH ? MOBILE_LAUNCHER_MARGIN : LAUNCHER_MARGIN;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

async function createPkcePair(cryptoApi: Crypto): Promise<PkcePair> {
  if (!cryptoApi?.getRandomValues || !cryptoApi.subtle) {
    throw new Error('Lodariq secure browser APIs are unavailable');
  }
  const state = randomBase64Url(cryptoApi, 32);
  const verifier = randomBase64Url(cryptoApi, 48);
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { state, verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}

async function createAuthorizationRequest(
  context: NonProductionPublicSdkBootstrapContext,
  pkce: PkcePair,
  documentIntent: AuthoringDocumentIntent | undefined,
  fetchFn: typeof fetch,
): Promise<AuthoringAuthorizationContext> {
  const authoring = context.authoring;
  if (authoring.state !== 'available') throw new Error('Lodariq authoring is unavailable');
  const response = await safeFetch(fetchFn, authoring.authorizationRequestUrl, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'content-type': 'application/json',
      [BOOTSTRAP_GRANT_HEADER]: authoring.bootstrapGrant,
    },
    body: JSON.stringify({
      installationId: context.installationId,
      customerOrigin: context.customerOrigin,
      state: pkce.state,
      codeChallenge: pkce.challenge,
      codeChallengeMethod: PKCE_CHALLENGE_METHOD,
      requestedCapabilities: ACTIVATION_CAPABILITIES,
      ...(documentIntent ? { documentIntent } : {}),
    }),
  });
  const value = await readJson(response, 'Lodariq authorization request failed');
  if (!isAuthorizationContext(value, context, pkce, documentIntent)) {
    throw new Error('Lodariq authorization response is invalid');
  }
  return value;
}

async function exchangeAuthorizationCode(
  context: NonProductionPublicSdkBootstrapContext,
  pkce: PkcePair,
  result: AuthoringAuthorizationResult,
  documentIntent: AuthoringDocumentIntent | undefined,
  fetchFn: typeof fetch,
): Promise<AuthoringCodeExchangeResult> {
  const authoring = context.authoring;
  if (authoring.state !== 'available') throw new Error('Lodariq authoring is unavailable');
  const response = await safeFetch(fetchFn, authoring.exchangeUrl, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'content-type': 'application/json',
      [BOOTSTRAP_GRANT_HEADER]: authoring.bootstrapGrant,
    },
    body: JSON.stringify({
      installationId: context.installationId,
      customerOrigin: context.customerOrigin,
      requestId: result.requestId,
      state: pkce.state,
      authorizationCode: result.authorizationCode,
      codeVerifier: pkce.verifier,
    }),
  });
  const value = await readJson(response, 'Lodariq authoring exchange failed');
  if (!isExchangeResult(value, context, result.requestId, documentIntent)) {
    throw new Error('Lodariq authoring exchange response is invalid');
  }
  return value;
}

function waitForAuthorizationResult(input: {
  hostWindow: Window;
  popup: Window;
  appOrigin: string;
  authorization: AuthoringAuthorizationContext;
  state: string;
  timeoutMs: number;
}): Promise<AuthoringAuthorizationResult> {
  const { hostWindow, popup, appOrigin, authorization, state, timeoutMs } = input;
  return new Promise((resolve, reject) => {
    let settled = false;
    const requestMessage = {
      protocol: ACTIVATION_PROTOCOL,
      type: AUTHORIZATION_REQUEST_TYPE,
      requestId: authorization.requestId,
      state,
    } as const;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      hostWindow.removeEventListener('message', receive);
      hostWindow.clearInterval(pingTimer);
      hostWindow.clearTimeout(timeoutTimer);
      callback();
    };
    const receive = (event: MessageEvent<unknown>): void => {
      if (event.source !== popup || event.origin !== appOrigin) return;
      const result = event.data;
      if (!isAuthorizationResult(result, authorization.requestId, state)) return;
      finish(() => resolve(result));
    };
    const ping = (): void => {
      try {
        if (popup.closed) {
          finish(() => reject(new ActivationFailure('error')));
          return;
        }
        popup.postMessage(requestMessage, appOrigin);
      } catch {
        /* A navigating cross-origin popup may reject a ping; the next one retries. */
      }
    };
    hostWindow.addEventListener('message', receive);
    const pingTimer = hostWindow.setInterval(ping, POPUP_PING_INTERVAL_MS);
    const timeoutTimer = hostWindow.setTimeout(
      () => finish(() => reject(new ActivationFailure('error'))),
      timeoutMs,
    );
    ping();
  });
}

export async function loadHostedCreatorModule(
  descriptor: CreatorModuleDescriptor,
  hostWindow: Window = window,
): Promise<HostedCreatorModule> {
  if (!isCreatorModuleDescriptor(descriptor)) {
    throw new Error('Lodariq creator module descriptor is invalid');
  }

  const moduleKey = hostedCreatorModuleKey(descriptor);
  const cachedModule = hostedCreatorModulesByWindow.get(hostWindow)?.get(moduleKey);
  if (cachedModule) return cachedModule;

  const registrationWindow = hostWindow as HostedCreatorRegistrationWindow;
  if (registrationWindow[HOSTED_CREATOR_REGISTRATION_PROPERTY]) {
    throw new Error('Lodariq creator module is already loading');
  }

  return new Promise((resolve, reject) => {
    const script = hostWindow.document.createElement('script');
    let candidate: HostedCreatorModule | null = null;
    let settled = false;
    const finish = (result: HostedCreatorModule | null): void => {
      if (settled) return;
      settled = true;
      hostWindow.clearTimeout(timeout);
      delete registrationWindow[HOSTED_CREATOR_REGISTRATION_PROPERTY];
      script.remove();
      if (!result) {
        reject(new Error('Lodariq creator module could not be loaded'));
        return;
      }
      const windowCache =
        hostedCreatorModulesByWindow.get(hostWindow) ?? new Map<string, HostedCreatorModule>();
      windowCache.set(moduleKey, result);
      hostedCreatorModulesByWindow.set(hostWindow, windowCache);
      resolve(result);
    };

    registrationWindow[HOSTED_CREATOR_REGISTRATION_PROPERTY] = (value: unknown): void => {
      if (!isHostedCreatorModule(value)) {
        finish(null);
        return;
      }
      candidate = value;
    };
    script.type = 'module';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.integrity = descriptor.integrity;
    script.src = descriptor.url;
    script.setAttribute('data-lodariq-creator-module', '');
    script.addEventListener('load', () => finish(candidate), { once: true });
    script.addEventListener('error', () => finish(null), { once: true });
    const timeout = hostWindow.setTimeout(() => finish(null), CREATOR_MODULE_TIMEOUT_MS);
    hostWindow.document.head.append(script);
  });
}

interface HostedCreatorRegistrationWindow extends Window {
  [HOSTED_CREATOR_REGISTRATION_PROPERTY]?: (module: unknown) => void;
}

const hostedCreatorModulesByWindow = new WeakMap<Window, Map<string, HostedCreatorModule>>();

function hostedCreatorModuleKey(descriptor: CreatorModuleDescriptor): string {
  return `${descriptor.url}\n${descriptor.version}\n${descriptor.integrity}`;
}

function isHostedCreatorModule(value: unknown): value is HostedCreatorModule {
  return (
    exactRecord(value, ['activateLodariqAuthoring']) &&
    typeof value['activateLodariqAuthoring'] === 'function'
  );
}

function availableAuthoring(
  context: NonProductionPublicSdkBootstrapContext,
  customerOrigin: string,
): Extract<NonProductionPublicSdkBootstrapContext['authoring'], { state: 'available' }> | null {
  if (
    (context.environment !== 'development' && context.environment !== 'staging') ||
    context.customerOrigin !== customerOrigin ||
    context.authoring.state !== 'available'
  ) {
    return null;
  }
  const apiOrigin = new URL(context.authoring.exchangeUrl).origin;
  const origins = authoringOriginsForApi(apiOrigin);
  if (
    !origins ||
    context.authoring.appOrigin !== origins.app ||
    context.authoring.activationUrl !== `${origins.app}/authoring/activate` ||
    !isCanonicalApiEndpoint(
      context.authoring.authorizationRequestUrl,
      '/v1/sdk/authoring/authorization-requests',
    ) ||
    !isCanonicalApiEndpoint(context.authoring.exchangeUrl, '/v1/sdk/authoring/exchange') ||
    new URL(context.authoring.authorizationRequestUrl).origin !==
      new URL(context.authoring.exchangeUrl).origin
  ) {
    return null;
  }
  return context.authoring;
}

function isAuthorizationContext(
  value: unknown,
  context: NonProductionPublicSdkBootstrapContext,
  pkce: PkcePair,
  documentIntent: AuthoringDocumentIntent | undefined,
): value is AuthoringAuthorizationContext {
  const keys = [
    'requestId',
    'installationId',
    'workspaceId',
    'environmentId',
    'environment',
    'customerOrigin',
    'state',
    'codeChallenge',
    'codeChallengeMethod',
    'requestedCapabilities',
    ...(documentIntent ? ['documentIntent'] : []),
    'expiresAt',
  ];
  if (!exactRecord(value, keys)) return false;
  return (
    nonEmpty(value['requestId']) &&
    nonEmpty(value['workspaceId']) &&
    value['installationId'] === context.installationId &&
    value['environmentId'] === context.environmentId &&
    value['environment'] === context.environment &&
    value['customerOrigin'] === context.customerOrigin &&
    value['state'] === pkce.state &&
    value['codeChallenge'] === pkce.challenge &&
    value['codeChallengeMethod'] === PKCE_CHALLENGE_METHOD &&
    isCapabilitySet(value['requestedCapabilities']) &&
    sameDocumentIntent(value['documentIntent'], documentIntent) &&
    isFutureDate(value['expiresAt'])
  );
}

function isAuthorizationResult(
  value: unknown,
  requestId: string,
  state: string,
): value is AuthoringAuthorizationResult {
  const keys = ['protocol', 'type', 'requestId', 'state', 'authorizationCode', 'expiresAt'];
  return (
    exactRecord(value, keys) &&
    value['protocol'] === ACTIVATION_PROTOCOL &&
    value['type'] === AUTHORIZATION_RESULT_TYPE &&
    value['requestId'] === requestId &&
    value['state'] === state &&
    opaque(value['authorizationCode']) &&
    isFutureDate(value['expiresAt'])
  );
}

function isExchangeResult(
  value: unknown,
  context: NonProductionPublicSdkBootstrapContext,
  requestId: string,
  documentIntent: AuthoringDocumentIntent | undefined,
): value is AuthoringCodeExchangeResult {
  if (!exactRecord(value, ['activationGrant', 'context', 'creatorModule'])) return false;
  if (context.authoring.state !== 'available') return false;
  const origins = authoringOriginsForApi(new URL(context.authoring.exchangeUrl).origin);
  if (
    !origins ||
    !opaque(value['activationGrant']) ||
    !isCreatorModuleDescriptor(value['creatorModule'], origins.creator)
  ) {
    return false;
  }
  const grant = value['context'];
  const grantKeys = [
    'grantId',
    'requestId',
    'installationId',
    'workspaceId',
    'environmentId',
    'environment',
    'customerOrigin',
    'editorOrigin',
    'creatorId',
    'capabilities',
    'expiresAt',
    ...(documentIntent ? ['documentIntent'] : []),
  ];
  return (
    exactRecord(grant, grantKeys) &&
    nonEmpty(grant['grantId']) &&
    grant['requestId'] === requestId &&
    grant['installationId'] === context.installationId &&
    nonEmpty(grant['workspaceId']) &&
    grant['environmentId'] === context.environmentId &&
    grant['environment'] === context.environment &&
    grant['customerOrigin'] === context.customerOrigin &&
    grant['editorOrigin'] === origins.editor &&
    nonEmpty(grant['creatorId']) &&
    isCapabilitySet(grant['capabilities']) &&
    sameDocumentIntent(grant['documentIntent'], documentIntent) &&
    isFutureDate(grant['expiresAt'])
  );
}

function isCreatorModuleDescriptor(
  value: unknown,
  expectedOrigin?: string,
): value is CreatorModuleDescriptor {
  if (!exactRecord(value, ['url', 'version', 'integrity'])) return false;
  if (!nonEmpty(value['version']) || !SUBRESOURCE_INTEGRITY.test(String(value['integrity']))) {
    return false;
  }
  try {
    const url = new URL(String(value['url']));
    const contentAddress = CREATOR_CONTENT_ADDRESS.exec(url.pathname)?.[1];
    return (
      (expectedOrigin ? url.origin === expectedOrigin : CREATOR_CDN_ORIGINS.has(url.origin)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      Boolean(contentAddress) &&
      contentAddress === integrityDigestHex(String(value['integrity']))
    );
  } catch {
    return false;
  }
}

function authoringOriginsForApi(
  apiOrigin: string,
): (typeof AUTHORING_ORIGINS_BY_API)[keyof typeof AUTHORING_ORIGINS_BY_API] | null {
  return AUTHORING_ORIGINS_BY_API[apiOrigin as keyof typeof AUTHORING_ORIGINS_BY_API] ?? null;
}

function isCapabilitySet(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === ACTIVATION_CAPABILITIES.length &&
    ACTIVATION_CAPABILITIES.every((capability) => value.includes(capability))
  );
}

function sameDocumentIntent(
  value: unknown,
  expected: AuthoringDocumentIntent | undefined,
): boolean {
  if (!expected) return value === undefined;
  if (expected.kind === 'new-draft') {
    return (
      exactRecord(value, ['kind', 'documentType']) &&
      value['kind'] === 'new-draft' &&
      value['documentType'] === 'tour'
    );
  }
  return (
    exactRecord(value, ['kind', 'documentId']) &&
    value['kind'] === 'existing' &&
    nonEmpty(value['documentId']) &&
    value['documentId'] === expected.documentId
  );
}

function isCanonicalApiEndpoint(value: string, pathname: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === pathname
    );
  } catch {
    return false;
  }
}

function requireTrustedApiOrigin(endpoint: string): string {
  const origin = new URL(endpoint).origin;
  if (!API_ORIGINS.has(origin)) {
    throw new Error('Lodariq authoring API origin is invalid');
  }
  return origin;
}

function integrityDigestHex(integrity: string): string | null {
  try {
    const bytes = atob(integrity.slice('sha256-'.length));
    if (bytes.length !== 32) return null;
    return [...bytes].map((byte) => byte.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function safeFetch(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, init);
  } catch {
    throw new Error('Lodariq authoring request failed');
  }
}

async function readJson(response: Response, message: string): Promise<unknown> {
  if (!response.ok) throw new Error(message);
  try {
    return await response.json();
  } catch {
    throw new Error(message);
  }
}

function randomBase64Url(cryptoApi: Crypto, byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function opaque(value: unknown): value is string {
  return typeof value === 'string' && value.length >= OPAQUE_VALUE_MIN_LENGTH;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFutureDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).every((key) => keys.includes(key)) &&
    keys.every((key) => key in value)
  );
}

class ActivationFailure extends Error {
  constructor(readonly state: 'blocked' | 'error') {
    super('Lodariq authoring could not be opened');
  }
}

function normalizeActivationError(error: unknown): Error {
  if (error instanceof ActivationFailure) return error;
  return new Error('Lodariq authoring activation failed');
}

const launcherStyles = `
  :host {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  button { font: inherit; }
  .shell {
    position: relative;
    width: ${LAUNCHER_SIZE}px;
    height: ${LAUNCHER_SIZE}px;
    color: #123b34;
    isolation: isolate;
    pointer-events: auto;
  }
  .launcher {
    position: relative;
    z-index: 4;
    display: grid;
    width: ${LAUNCHER_SIZE}px;
    min-width: 44px;
    height: ${LAUNCHER_SIZE}px;
    min-height: 44px;
    place-items: center;
    border: 1px solid rgba(255,255,255,.62);
    border-radius: 999px;
    padding: 0;
    background:
      radial-gradient(circle at 30% 20%, rgba(255,255,255,.3), transparent 42%),
      linear-gradient(145deg, rgba(14,105,86,.96), rgba(7,67,56,.97));
    color: #fffdf8;
    box-shadow:
      0 20px 50px rgba(8,49,42,.3),
      inset 0 1px 0 rgba(255,255,255,.3),
      0 0 0 5px rgba(255,255,255,.78),
      0 0 0 9px rgba(13,105,86,.12);
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-backdrop-filter: blur(18px) saturate(1.14);
    backdrop-filter: blur(18px) saturate(1.14);
    transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease, opacity 140ms ease;
  }
  .launcher:hover {
    background:
      radial-gradient(circle at 30% 20%, rgba(255,255,255,.34), transparent 42%),
      linear-gradient(145deg, rgba(13,121,98,.98), rgba(7,76,63,.98));
    box-shadow:
      0 24px 56px rgba(8,49,42,.34),
      inset 0 1px 0 rgba(255,255,255,.34),
      0 0 0 5px rgba(255,255,255,.84),
      0 0 0 9px rgba(13,105,86,.18);
    transform: translateY(-1px);
  }
  .launcher:focus-visible,
  .action:focus-visible,
  .type-option:focus-visible {
    outline: 3px solid rgba(55,107,255,.72);
    outline-offset: 3px;
  }
  .launcher:disabled { cursor: wait; opacity: .76; }
  .shell[data-dragging='true'] .launcher { cursor: grabbing; transform: none; transition: none; }
  .mark {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid rgba(255,255,255,.24);
    border-radius: 999px;
    background: rgba(255,255,255,.08);
    font-size: 12px;
    font-weight: 790;
    letter-spacing: -.04em;
  }
  .palette {
    position: absolute;
    right: 7px;
    bottom: ${LAUNCHER_SIZE + 12}px;
    z-index: 2;
    display: grid;
    width: 44px;
    gap: 8px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px) scale(.98);
    transform-origin: bottom right;
    visibility: hidden;
    transition: opacity 130ms ease, transform 130ms ease, visibility 0s linear 130ms;
  }
  .palette::after {
    position: absolute;
    right: 0;
    bottom: -12px;
    width: 44px;
    height: 12px;
    content: '';
  }
  .shell[data-palette-below='true'] .palette {
    top: ${LAUNCHER_SIZE + 12}px;
    bottom: auto;
    transform-origin: top right;
  }
  .shell[data-palette-below='true'] .palette::after { top: -12px; bottom: auto; }
  .shell[data-align-left='true'] .palette {
    right: auto;
    left: 7px;
    transform-origin: bottom left;
  }
  .shell[data-align-left='true'][data-palette-below='true'] .palette { transform-origin: top left; }
  .shell:hover .palette,
  .shell:focus-within .palette,
  .shell[data-pinned='true'] .palette {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0) scale(1);
    visibility: visible;
    transition-delay: 0s;
  }
  .shell[data-dismissed='true'] .palette,
  .shell[data-dragging='true'] .palette {
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px) scale(.98);
    visibility: hidden;
  }
  .action-wrap {
    position: relative;
    display: block;
    width: 44px;
    height: 44px;
  }
  .action {
    display: grid;
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    place-items: center;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 14px;
    padding: 0;
    background: rgba(8,51,43,.94);
    color: #fffdf8;
    box-shadow: 0 12px 30px rgba(12,33,28,.22), inset 0 1px 0 rgba(255,255,255,.14);
    cursor: pointer;
    -webkit-backdrop-filter: blur(16px) saturate(1.1);
    backdrop-filter: blur(16px) saturate(1.1);
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  .action:hover {
    border-color: rgba(255,255,255,.3);
    background: rgba(7,86,72,.98);
    color: #fffdf8;
    transform: translateX(-2px);
  }
  .shell[data-align-left='true'] .action:hover { transform: translateX(2px); }
  .action[aria-busy='true'], .type-option[aria-busy='true'] { cursor: progress; opacity: .72; }
  .action svg { display: block; width: 20px; height: 20px; }
  .tooltip {
    position: absolute;
    top: 50%;
    right: calc(100% + 10px);
    z-index: 8;
    width: max-content;
    max-width: min(230px, calc(100vw - 96px));
    border: 1px solid rgba(12,33,28,.12);
    border-radius: 9px;
    padding: 7px 9px;
    background: rgba(255,255,255,.97);
    color: #163b34;
    box-shadow: 0 10px 28px rgba(12,33,28,.15);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.2;
    opacity: 0;
    pointer-events: none;
    transform: translate(4px,-50%);
    visibility: hidden;
    white-space: nowrap;
    transition: opacity 100ms ease, transform 100ms ease, visibility 0s linear 100ms;
  }
  .action-wrap:hover .tooltip,
  .action-wrap:focus-within .tooltip {
    opacity: 1;
    transform: translate(0,-50%);
    visibility: visible;
    transition-delay: 0s;
  }
  .shell[data-align-left='true'] .tooltip {
    right: auto;
    left: calc(100% + 10px);
    transform: translate(-4px,-50%);
  }
  .shell[data-align-left='true'] .action-wrap:hover .tooltip,
  .shell[data-align-left='true'] .action-wrap:focus-within .tooltip { transform: translate(0,-50%); }
  .type-surface {
    position: absolute;
    right: ${LAUNCHER_SIZE + TYPE_SURFACE_GAP}px;
    bottom: 0;
    z-index: 6;
    display: grid;
    width: min(${TYPE_SURFACE_WIDTH}px, calc(100vw - 92px));
    gap: 4px;
    border: 1px solid rgba(12,33,28,.13);
    border-radius: 18px;
    padding: 14px;
    background: rgba(255,255,255,.96);
    color: #153a33;
    box-shadow: 0 24px 60px rgba(12,33,28,.2), inset 0 1px 0 rgba(255,255,255,.82);
    -webkit-backdrop-filter: blur(20px) saturate(1.08);
    backdrop-filter: blur(20px) saturate(1.08);
  }
  .type-surface[hidden] { display: none; }
  .shell[data-align-left='true'] .type-surface { right: auto; left: ${LAUNCHER_SIZE + TYPE_SURFACE_GAP}px; }
  .shell[data-palette-below='true'] .type-surface { top: 0; bottom: auto; }
  .type-heading { font-size: 14px; font-weight: 740; line-height: 1.25; }
  .type-description { color: #61756f; font-size: 12px; font-weight: 520; line-height: 1.4; }
  .type-option {
    display: grid;
    width: 100%;
    min-height: 56px;
    grid-template-columns: minmax(0,1fr) auto;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    border: 1px solid rgba(11,102,85,.16);
    border-radius: 12px;
    padding: 10px 11px;
    background: #f1f7f4;
    color: #123b34;
    cursor: pointer;
    text-align: left;
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  .type-option:hover { border-color: rgba(11,102,85,.36); background: #e7f2ed; transform: translateY(-1px); }
  .type-option-copy { display: grid; gap: 2px; min-width: 0; }
  .type-option-copy strong { font-size: 13px; font-weight: 700; line-height: 1.25; }
  .type-option-copy span { color: #61756f; font-size: 11px; font-weight: 520; line-height: 1.35; }
  .type-option-arrow { color: #0b6655; font-size: 18px; font-weight: 650; }
  .status {
    position: absolute;
    right: ${LAUNCHER_SIZE + TYPE_SURFACE_GAP}px;
    bottom: 8px;
    z-index: 5;
    width: max-content;
    max-width: min(280px, calc(100vw - 96px));
    border: 1px solid rgba(255,255,255,.7);
    border-radius: 999px;
    padding: 9px 12px;
    background: rgba(17,54,47,.93);
    color: #fffdf7;
    box-shadow: 0 14px 42px rgba(7,31,27,.22);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    backdrop-filter: blur(16px) saturate(1.15);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.25;
  }
  .status[hidden] { display: none; }
  .shell[data-align-left='true'] .status { right: auto; left: ${LAUNCHER_SIZE + TYPE_SURFACE_GAP}px; }
  .safe-area-probe {
    position: fixed;
    width: 0;
    height: 0;
    padding-top: env(safe-area-inset-top, 0px);
    padding-right: env(safe-area-inset-right, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    padding-left: env(safe-area-inset-left, 0px);
    visibility: hidden;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .launcher, .palette, .action, .tooltip, .type-option { transition: none; }
  }
`;
