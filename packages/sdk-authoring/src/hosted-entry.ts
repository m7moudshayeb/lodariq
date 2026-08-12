import {
  AuthoringActivationGrantContext,
  AuthoringDocumentIntent,
  HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE,
  HOSTED_AUTHORING_BROWSE_CLOSE_REQUEST_TYPE,
  HOSTED_AUTHORING_BROWSE_CLOSE_RESULT_TYPE,
  HOSTED_AUTHORING_BROWSE_READY_TYPE,
  HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  HOSTED_AUTHORING_EDITOR_READY_TYPE,
  HOSTED_AUTHORING_SESSION_FAILED_TYPE,
  HOSTED_AUTHORING_SESSION_READY_TYPE,
  HOSTED_CREATOR_REGISTRATION_PROPERTY,
  HOSTED_CREATOR_PANEL_STATE_EVENT,
  HOSTED_CREATOR_PANEL_TOGGLE_EVENT,
  HostedAuthoringEditorReadyMessage,
  HostedAuthoringBrowseCloseRequestMessage,
  HostedAuthoringBrowseCloseResultMessage,
  HostedAuthoringBrowseReadyMessage,
  HostedAuthoringSessionFailedMessage,
  HostedAuthoringSessionReadyMessage,
  LODARIQ_API_ORIGIN,
  LODARIQ_EDITOR_ORIGIN,
  LODARIQ_STAGING_API_ORIGIN,
  validate,
  type AuthoringActivationGrantContext as AuthoringActivationGrantContextValue,
  type AuthoringDocumentIntent as AuthoringDocumentIntentValue,
  type AuthoringPageContext as AuthoringPageContextValue,
  type BrandThemeSnapshot,
  type CompiledDocument,
  type HostedAuthoringActivationHandoffMessage as HostedAuthoringActivationHandoffMessageValue,
  type HostedAuthoringEditorReadyMessage as HostedAuthoringEditorReadyMessageValue,
  type HostedAuthoringSessionReadyMessage as HostedAuthoringSessionReadyMessageValue,
  type HostedCreatorPanelState,
} from '@lodariq/schema';
import { isSupportedLocale, type SupportedLocale } from '@lodariq/i18n';
import { AUTHORING_LOCALE_QUERY_PARAMETER } from '@lodariq/schema/authoring-entry-runtime';
import { authoringText, configureAuthoringLocalePreference, currentAuthoringLocale } from './i18n';
import type { LodariqBrowserApi } from '@lodariq/sdk-runtime/lodariq-loader';
import type { TourPlayer } from '@lodariq/sdk-runtime/renderers/tour';
import { adoptHostedAuthoringPanel, type LocalAuthoringPreviewServices } from './authoring';
import { mountHostedBrowseShell, type HostedBrowseShell } from './hosted-browse-shell';

const HOSTED_EDITOR_URL = `${LODARIQ_EDITOR_ORIGIN}/authoring.html`;
const HOSTED_EDITOR_SANDBOX = 'allow-scripts allow-same-origin';
const HOSTED_SESSION_TIMEOUT_MS = 30_000;
const HOSTED_BROWSE_CLOSE_TIMEOUT_MS = 1_500;
const ACTIVATION_GRANT_MIN_LENGTH = 32;
const ACTIVATION_GRANT_MAX_LENGTH = 2_048;
const TRUSTED_API_ORIGINS = new Set<string>([LODARIQ_API_ORIGIN, LODARIQ_STAGING_API_ORIGIN]);

export interface HostedCreatorActivation {
  activationGrant: string;
  context: AuthoringActivationGrantContextValue;
  apiOrigin: string;
  /** Dashboard UI locale captured by the exact-source activation popup. */
  uiLocale?: SupportedLocale;
  documentIntent?: AuthoringDocumentIntentValue;
  /** Memory-only host callback; its return value is bounded at target-pick time. */
  getTargetStateId?: () => string | undefined;
}

export interface HostedCreatorModule {
  activateLodariqAuthoring(input: HostedCreatorActivation): Promise<void>;
}

interface HostedCreatorRegistrationWindow extends Window {
  [HOSTED_CREATOR_REGISTRATION_PROPERTY]?: (module: unknown) => void;
}

interface ValidatedHostedActivation {
  activationGrant: string;
  apiOrigin: typeof LODARIQ_API_ORIGIN | typeof LODARIQ_STAGING_API_ORIGIN;
  context: AuthoringActivationGrantContextValue;
  uiLocale: SupportedLocale;
  documentIntent?: AuthoringDocumentIntentValue;
  getTargetStateId?: () => string | undefined;
  pageContext: AuthoringPageContextValue;
}

let hostedEditorActive = false;

const hostedPreviewRuntime = import('./hosted-preview-runtime');
void hostedPreviewRuntime.catch(() => undefined);

/**
 * Programmatic creator entry invoked only by the integrity-loaded activation
 * client. It never discovers credentials from markup, URLs, browser storage,
 * other tabs, or global events.
 */
export function activateLodariqAuthoring(input: HostedCreatorActivation): Promise<void> {
  if (hostedEditorActive) {
    input.activationGrant = '';
    return Promise.reject(new Error('Lodariq authoring activation is already in progress'));
  }

  const activation = requireHostedActivation(input);
  // Remove the caller-owned object reference immediately. This module retains
  // one local copy only until the exact editor handoff succeeds or fails.
  input.activationGrant = '';
  hostedEditorActive = true;
  if (activation.uiLocale !== currentAuthoringLocale()) {
    return configureAuthoringLocalePreference(activation.uiLocale).then(
      () =>
        openHostedEditor(activation, () => {
          hostedEditorActive = false;
        }),
      (error: unknown) => {
        activation.activationGrant = '';
        hostedEditorActive = false;
        throw error;
      },
    );
  }
  return openHostedEditor(activation, () => {
    hostedEditorActive = false;
  });
}

function openHostedEditor(
  activation: ValidatedHostedActivation,
  onFlowClosed: () => void,
): Promise<void> {
  const iframe = createHostedEditorIframe(document);
  let activationGrant = activation.activationGrant;
  // Drop it from the otherwise non-secret activation object as well.
  activation.activationGrant = '';

  return new Promise((resolve, reject) => {
    let binding: HostedAuthoringEditorReadyMessageValue | null = null;
    let browseShell: HostedBrowseShell | null = null;
    let handoffRequestId = '';
    let handoffSent = false;
    let flowEnded = false;
    let readySettled = false;
    let browseCloseRequestId = '';
    let browseCloseTimer: number | null = null;

    const settleReady = (): void => {
      if (readySettled) return;
      readySettled = true;
      resolve();
    };

    const cleanup = (removeIframe: boolean): void => {
      window.removeEventListener('message', receive);
      window.removeEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, toggleBrowseShell);
      window.clearTimeout(timeout);
      if (browseCloseTimer !== null) window.clearTimeout(browseCloseTimer);
      activationGrant = '';
      if (removeIframe) {
        browseShell?.destroy();
        browseShell = null;
        iframe.remove();
      }
    };

    const fail = (): void => {
      if (flowEnded) return;
      flowEnded = true;
      cleanup(true);
      dispatchHostedPanelState('closed');
      onFlowClosed();
      if (!readySettled) {
        readySettled = true;
        reject(new Error('Lodariq hosted authoring could not start'));
      }
    };

    const finishBrowseClose = (): void => {
      if (flowEnded) return;
      flowEnded = true;
      cleanup(true);
      dispatchHostedPanelState('closed');
      onFlowClosed();
    };

    const requestBrowseClose = (): void => {
      if (flowEnded || !binding || browseCloseRequestId) return;
      const editorWindow = iframe.contentWindow;
      if (!editorWindow) {
        finishBrowseClose();
        return;
      }
      browseShell?.setClosing(true);
      browseCloseRequestId = createSecureRequestId(window.crypto);
      const closeRequest = validate(HostedAuthoringBrowseCloseRequestMessage, {
        protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
        type: HOSTED_AUTHORING_BROWSE_CLOSE_REQUEST_TYPE,
        requestId: browseCloseRequestId,
        readyRequestId: binding.readyRequestId,
        handoffRequestId,
        state: binding.state,
      });
      if (!closeRequest.valid) {
        finishBrowseClose();
        return;
      }
      try {
        editorWindow.postMessage(closeRequest.value, LODARIQ_EDITOR_ORIGIN);
      } catch {
        finishBrowseClose();
        return;
      }
      browseCloseTimer = window.setTimeout(finishBrowseClose, HOSTED_BROWSE_CLOSE_TIMEOUT_MS);
    };

    const toggleBrowseShell = (): void => {
      if (!browseShell || flowEnded) return;
      dispatchHostedPanelState(browseShell.toggleMinimized() ? 'minimized' : 'browsing');
    };

    const complete = async (message: HostedAuthoringSessionReadyMessageValue): Promise<void> => {
      if (flowEnded || !hostedSessionMatchesActivation(message, activation)) return;
      flowEnded = true;
      cleanup(false);
      browseShell?.releaseIframe();
      browseShell = null;
      revealHostedEditorIframe(iframe);
      try {
        adoptHostedAuthoringPanel(
          {
            sessionId: message.context.sessionId,
            documentId: message.context.documentId,
            workspaceId: message.context.workspaceId,
            environment: message.context.environment,
          },
          {
            iframe,
            initialDocument: structuredClone(message.document),
            initialTheme: structuredClone(message.theme),
            onClose: onFlowClosed,
            preview: createHostedPreviewServices(message, activation),
            ...(activation.getTargetStateId
              ? { getTargetStateId: activation.getTargetStateId }
              : {}),
          },
        );
        settleReady();
      } catch {
        iframe.remove();
        dispatchHostedPanelState('closed');
        onFlowClosed();
        if (!readySettled) {
          readySettled = true;
          reject(new Error('Lodariq hosted authoring could not start'));
        }
      }
    };

    const receive = (event: MessageEvent): void => {
      const editorWindow = iframe.contentWindow;
      if (
        flowEnded ||
        !editorWindow ||
        event.source !== editorWindow ||
        event.origin !== LODARIQ_EDITOR_ORIGIN
      ) {
        return;
      }

      if (!handoffSent) {
        const ready = validate(HostedAuthoringEditorReadyMessage, event.data);
        if (!ready.valid || ready.value.type !== HOSTED_AUTHORING_EDITOR_READY_TYPE) return;
        binding = ready.value;
        handoffSent = true;
        try {
          handoffRequestId = createSecureRequestId(window.crypto);
          const handoff: HostedAuthoringActivationHandoffMessageValue = {
            protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
            type: HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE,
            readyRequestId: binding.readyRequestId,
            handoffRequestId,
            state: binding.state,
            editorOrigin: LODARIQ_EDITOR_ORIGIN,
            apiOrigin: activation.apiOrigin,
            customerOrigin: activation.context.customerOrigin,
            installationId: activation.context.installationId,
            pageContext: structuredClone(activation.pageContext),
            ...(activation.documentIntent
              ? { documentIntent: structuredClone(activation.documentIntent) }
              : {}),
            activationGrant,
          };
          editorWindow.postMessage(handoff, LODARIQ_EDITOR_ORIGIN);
        } catch {
          fail();
          return;
        } finally {
          // This is the only host-side credential reference owned here.
          activationGrant = '';
        }
        return;
      }

      if (!binding) return;
      const browseReady = validate(HostedAuthoringBrowseReadyMessage, event.data);
      if (
        browseReady.valid &&
        browseReady.value.type === HOSTED_AUTHORING_BROWSE_READY_TYPE &&
        !activation.documentIntent &&
        messageMatchesBinding(browseReady.value, binding, handoffRequestId)
      ) {
        window.clearTimeout(timeout);
        revealHostedEditorIframe(iframe);
        browseShell ??= mountHostedBrowseShell({ iframe, onRequestClose: requestBrowseClose });
        window.addEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, toggleBrowseShell);
        dispatchHostedPanelState('browsing');
        settleReady();
        return;
      }

      const browseClosed = validate(HostedAuthoringBrowseCloseResultMessage, event.data);
      if (
        browseClosed.valid &&
        browseClosed.value.type === HOSTED_AUTHORING_BROWSE_CLOSE_RESULT_TYPE &&
        browseClosed.value.requestId === browseCloseRequestId &&
        messageMatchesBinding(browseClosed.value, binding, handoffRequestId)
      ) {
        finishBrowseClose();
        return;
      }

      const ready = validate(HostedAuthoringSessionReadyMessage, event.data);
      if (ready.valid && ready.value.type === HOSTED_AUTHORING_SESSION_READY_TYPE) {
        if (!messageMatchesBinding(ready.value, binding, handoffRequestId)) return;
        void complete(ready.value);
        return;
      }

      const failed = validate(HostedAuthoringSessionFailedMessage, event.data);
      if (
        failed.valid &&
        failed.value.type === HOSTED_AUTHORING_SESSION_FAILED_TYPE &&
        messageMatchesBinding(failed.value, binding, handoffRequestId) &&
        failed.value.customerOrigin === activation.context.customerOrigin
      ) {
        fail();
      }
    };

    window.addEventListener('message', receive);
    const timeout = window.setTimeout(fail, HOSTED_SESSION_TIMEOUT_MS);
    document.body.appendChild(iframe);
  });
}

/**
 * Keeps preview compilation on the creator-only browser path, then delegates
 * rendering to the same SDK runtime/player used by customer-facing delivery.
 * The approved theme remains inside this session-scoped closure.
 */
function createHostedPreviewServices(
  message: HostedAuthoringSessionReadyMessageValue,
  activation: Pick<ValidatedHostedActivation, 'apiOrigin' | 'context'>,
): LocalAuthoringPreviewServices {
  const initialDocument = structuredClone(message.document);
  const approvedTheme = structuredClone(message.theme);
  let currentPreviewTheme = structuredClone(approvedTheme);
  let fallbackPreviewOwnerId: string | null = null;
  let fallbackPreviewPlayer: TourPlayer | null = null;

  return {
    loadDocument: (documentId) =>
      documentId === initialDocument.id ? structuredClone(initialDocument) : null,
    compilePreview: (document, themeOverride) => {
      const requestedTheme = structuredClone(themeOverride ?? approvedTheme);
      if (!previewThemeMatchesApprovedScope(requestedTheme, approvedTheme)) {
        throw new Error('Lodariq hosted preview theme does not match the authoring session');
      }
      currentPreviewTheme = requestedTheme;
      return hostedPreviewRuntime.then(({ compilePreview }) =>
        compilePreview(document, requestedTheme),
      );
    },
    loadExactPublishedArtifact: (expectedContentHash) =>
      hostedPreviewRuntime.then(({ loadExactPublishedArtifact }) =>
        loadExactPublishedArtifact({
          url: hostedPublishedDocumentUrl(activation.apiOrigin, message.context),
          documentId: message.context.documentId,
          expectedContentHash,
          expectedThemeVersionId: message.context.themeVersionId,
          headers: { 'x-lodariq-installation-id': activation.context.installationId },
        }),
      ),
    playPreview: async (compiled, options) => {
      const requestedOwnerId = options.ownerId.trim();
      if (!requestedOwnerId) throw new Error('Lodariq hosted preview owner is required');
      if (
        !compiledPreviewMatchesSession(compiled, currentPreviewTheme, message) &&
        !compiledPreviewMatchesSession(compiled, approvedTheme, message)
      ) {
        throw new Error('Lodariq hosted preview contract does not match the authoring session');
      }
      const installedRuntime = readInstalledPreviewRuntime();
      if (installedRuntime) {
        fallbackPreviewPlayer?.stop();
        fallbackPreviewPlayer = null;
        fallbackPreviewOwnerId = null;
        await installedRuntime.playAuthoringPreview(compiled, {
          ownerId: requestedOwnerId,
          ...(options.locale ? { locale: options.locale } : {}),
          ...(options.interactive ? { interactive: true } : {}),
          ...(options.stepId ? { initialStepId: options.stepId } : {}),
          ...(options.authoringTargetOverride
            ? { authoringTargetOverride: options.authoringTargetOverride }
            : {}),
        });
        return;
      }

      fallbackPreviewPlayer?.stop();
      const { TourPlayer } = await hostedPreviewRuntime;
      const player = new TourPlayer(compiled, {
        authoringPreviewOwnerId: requestedOwnerId,
        ...(options.locale ? { locale: options.locale } : {}),
        ...(options.interactive ? { authoringPreviewInteractive: true } : {}),
        ...(options.stepId ? { initialStepId: options.stepId } : {}),
        ...(options.authoringTargetOverride
          ? { authoringTargetOverride: options.authoringTargetOverride }
          : {}),
      });
      fallbackPreviewPlayer = player;
      fallbackPreviewOwnerId = requestedOwnerId;
      player.start();
      try {
        await player.waitUntilReady();
      } catch (error) {
        if (fallbackPreviewPlayer === player) {
          fallbackPreviewPlayer = null;
          fallbackPreviewOwnerId = null;
        }
        player.stop();
        throw error;
      }
    },
    stopPreview: (ownerId) => {
      readInstalledPreviewRuntime()?.stopAuthoringPreview(ownerId);
      if (fallbackPreviewOwnerId !== ownerId) return;
      fallbackPreviewPlayer?.stop();
      fallbackPreviewPlayer = null;
      fallbackPreviewOwnerId = null;
    },
  };
}

function hostedPublishedDocumentUrl(
  apiOrigin: string,
  context: HostedAuthoringSessionReadyMessageValue['context'],
): string {
  const path = [
    '/v1/sdk/workspaces',
    encodeURIComponent(context.workspaceId),
    'environments',
    encodeURIComponent(context.environmentId),
    'documents',
    encodeURIComponent(context.documentId),
  ].join('/');
  return new URL(path, apiOrigin).toString();
}

type InstalledPreviewRuntime = Required<
  Pick<LodariqBrowserApi, 'playAuthoringPreview' | 'stopAuthoringPreview'>
>;

function readInstalledPreviewRuntime(): InstalledPreviewRuntime | null {
  const runtime = window.Lodariq;
  if (!runtime?.playAuthoringPreview || !runtime.stopAuthoringPreview) return null;
  return {
    playAuthoringPreview: runtime.playAuthoringPreview.bind(runtime),
    stopAuthoringPreview: runtime.stopAuthoringPreview.bind(runtime),
  };
}

function compiledPreviewMatchesSession(
  compiled: CompiledDocument,
  expectedTheme: HostedAuthoringSessionReadyMessageValue['theme'],
  message: HostedAuthoringSessionReadyMessageValue,
): boolean {
  if (!('theme' in compiled) || !('rendererContractVersion' in compiled)) return false;
  return (
    compiled.documentId === message.context.documentId &&
    compiled.compilerVersion === message.context.compilerVersion &&
    compiled.rendererContractVersion === message.context.rendererContractVersion &&
    compiled.theme.contractVersion === message.context.themeContractVersion &&
    compiled.theme.themeVersionId === expectedTheme.themeVersionId &&
    compiled.theme.contentHash === expectedTheme.contentHash
  );
}

function previewThemeMatchesApprovedScope(
  candidate: BrandThemeSnapshot,
  approved: BrandThemeSnapshot,
): boolean {
  return (
    candidate.themeId === approved.themeId &&
    candidate.schemaVersion === approved.schemaVersion &&
    candidate.contractVersion === approved.contractVersion
  );
}

function requireHostedActivation(input: unknown): ValidatedHostedActivation {
  if (
    !exactRecordWithOptional(
      input,
      ['activationGrant', 'apiOrigin', 'context'],
      ['documentIntent', 'getTargetStateId', 'uiLocale'],
    )
  ) {
    throw new Error('Lodariq hosted authoring activation is invalid');
  }
  const activationGrant = input['activationGrant'];
  const apiOrigin = input['apiOrigin'];
  const context = validate(AuthoringActivationGrantContext, input['context']);
  const suppliedIntent = input['documentIntent'];
  const getTargetStateId = input['getTargetStateId'];
  const uiLocale = input['uiLocale'];
  const documentIntent =
    suppliedIntent === undefined ? null : validate(AuthoringDocumentIntent, suppliedIntent);
  if (
    typeof activationGrant !== 'string' ||
    activationGrant.length < ACTIVATION_GRANT_MIN_LENGTH ||
    activationGrant.length > ACTIVATION_GRANT_MAX_LENGTH ||
    typeof apiOrigin !== 'string' ||
    (uiLocale !== undefined && !isSupportedLocale(uiLocale)) ||
    (getTargetStateId !== undefined && typeof getTargetStateId !== 'function') ||
    !TRUSTED_API_ORIGINS.has(apiOrigin) ||
    !context.valid ||
    (documentIntent !== null && !documentIntent.valid) ||
    context.value.customerOrigin !== window.location.origin ||
    context.value.editorOrigin !== LODARIQ_EDITOR_ORIGIN ||
    (context.value.environment !== 'development' && context.value.environment !== 'staging') ||
    !isFutureTimestamp(context.value.expiresAt) ||
    (context.value.documentIntent &&
      documentIntent?.valid &&
      !sameDocumentIntent(context.value.documentIntent, documentIntent.value))
  ) {
    throw new Error('Lodariq hosted authoring activation is invalid');
  }
  return {
    activationGrant,
    apiOrigin: apiOrigin as ValidatedHostedActivation['apiOrigin'],
    context: structuredClone(context.value),
    uiLocale: isSupportedLocale(uiLocale) ? uiLocale : currentAuthoringLocale(),
    pageContext: readAuthoringPageContext(window.location),
    ...(typeof getTargetStateId === 'function'
      ? { getTargetStateId: getTargetStateId as () => string | undefined }
      : {}),
    ...((documentIntent?.valid ? documentIntent.value : context.value.documentIntent)
      ? {
          documentIntent: structuredClone(
            documentIntent?.valid ? documentIntent.value : context.value.documentIntent!,
          ),
        }
      : {}),
  };
}

function createHostedEditorIframe(ownerDocument: Document): HTMLIFrameElement {
  const iframe = ownerDocument.createElement('iframe');
  const editorUrl = new URL(HOSTED_EDITOR_URL);
  editorUrl.searchParams.set(AUTHORING_LOCALE_QUERY_PARAMETER, currentAuthoringLocale());
  iframe.src = editorUrl.toString();
  iframe.title = authoringText('Lodariq authoring');
  // The static editor uses the origin-only referrer to bind its parent before
  // the closed postMessage handshake; no customer path or credential crosses.
  iframe.referrerPolicy = 'origin';
  iframe.setAttribute('sandbox', HOSTED_EDITOR_SANDBOX);
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    border: '0',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    position: 'fixed',
    width: '1px',
  });
  return iframe;
}

function revealHostedEditorIframe(iframe: HTMLIFrameElement): void {
  iframe.removeAttribute('aria-hidden');
  iframe.removeAttribute('style');
}

function hostedSessionMatchesActivation(
  message: HostedAuthoringSessionReadyMessageValue,
  activation: Omit<ValidatedHostedActivation, 'activationGrant'>,
): boolean {
  const { context, document } = message;
  return (
    context.workspaceId === activation.context.workspaceId &&
    context.environmentId === activation.context.environmentId &&
    context.environment === activation.context.environment &&
    context.customerOrigin === activation.context.customerOrigin &&
    context.editorOrigin === LODARIQ_EDITOR_ORIGIN &&
    context.creatorId === activation.context.creatorId &&
    context.documentId === document.id &&
    document.workspaceId === context.workspaceId &&
    message.theme.contractVersion === context.themeContractVersion &&
    message.theme.themeVersionId === context.themeVersionId &&
    isFutureTimestamp(context.expiresAt) &&
    (!activation.documentIntent ||
      documentMatchesIntent(document.id, document.type, activation.documentIntent))
  );
}

function messageMatchesBinding(
  message: { readyRequestId: string; handoffRequestId: string; state: string },
  binding: HostedAuthoringEditorReadyMessageValue,
  handoffRequestId: string,
): boolean {
  return (
    message.readyRequestId === binding.readyRequestId &&
    message.handoffRequestId === handoffRequestId &&
    message.state === binding.state
  );
}

function documentMatchesIntent(
  documentId: string,
  documentType: string,
  intent: AuthoringDocumentIntentValue,
): boolean {
  if (intent.kind === 'existing') return documentId === intent.documentId;
  return documentType === intent.documentType;
}

function sameDocumentIntent(
  left: AuthoringDocumentIntentValue,
  right: AuthoringDocumentIntentValue,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'existing' && right.kind === 'existing') {
    return left.documentId === right.documentId;
  }
  return left.kind === 'new-draft' && right.kind === 'new-draft';
}

function createSecureRequestId(cryptoApi: Crypto): string {
  const bytes = new Uint8Array(18);
  cryptoApi.getRandomValues(bytes);
  return `handoff_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function isFutureTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function readAuthoringPageContext(location: Location): AuthoringPageContextValue {
  const pathname = location.pathname || '/';
  const normalized = `/${pathname.replace(/^\/+/, '')}`;
  return { pathname: normalized || '/' };
}

function dispatchHostedPanelState(state: HostedCreatorPanelState): void {
  window.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_STATE_EVENT, { detail: state }));
}

function exactRecordWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  return requiredKeys.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}

const hostedCreatorModule: HostedCreatorModule = Object.freeze({
  activateLodariqAuthoring,
});

if (typeof window !== 'undefined') {
  const registrationWindow = window as HostedCreatorRegistrationWindow;
  const register = registrationWindow[HOSTED_CREATOR_REGISTRATION_PROPERTY];
  if (typeof register === 'function') register(hostedCreatorModule);
}
