import { compileDocument } from '@lodariq/compiler';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import {
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringDocumentPayload,
  AuthoringDocumentSessionResult,
  AuthoringResourceLibrary,
  AuthoringMediaAssetResource,
  AuthoringTranslationResult as AuthoringTranslationResultSchema,
  AuthoringProductMatchApplyResult as AuthoringProductMatchApplyResultSchema,
  AuthoringStagingReleaseState as AuthoringStagingReleaseStateSchema,
  AuthoringStagingVerificationResult as AuthoringStagingVerificationResultSchema,
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage,
  HOSTED_AUTHORING_BROWSE_CLOSE_REQUEST_TYPE,
  HOSTED_AUTHORING_BROWSE_CLOSE_RESULT_TYPE,
  HOSTED_AUTHORING_BROWSE_READY_TYPE,
  HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  HOSTED_AUTHORING_EDITOR_READY_TYPE,
  HOSTED_AUTHORING_SESSION_FAILED_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
  HOSTED_AUTHORING_SESSION_READY_TYPE,
  HostedAuthoringActivationHandoffMessage,
  HostedAuthoringBrowseCloseRequestMessage,
  HostedAuthoringPreSessionMessage,
  HostedAuthoringSessionCloseRequestMessage,
  HostedAuthoringSessionCloseResultMessage,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LODARIQ_EDITOR_ORIGIN,
  LodariqDocument,
  ProductStyleProposal as ProductStyleProposalSchema,
  ProductionPromotionResult as ProductionPromotionResultSchema,
  ReleaseApproval as ReleaseApprovalSchema,
  ReleaseRecoveryResult as ReleaseRecoveryResultSchema,
  ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseSchema,
  BASIC_VISUAL_PREFLIGHT_ISSUE_CODES,
  QueryAuthoringDocumentsResult,
  RENDERER_CONTRACT_VERSION,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  basicVisualPreflightIssueLabel,
  releaseRecoveryStateMatchesScope,
  validate,
  type AuthoringDocumentIntent,
  type AuthoringDocumentQueryScope,
  type AuthoringPageDocumentSummary,
  type AuthoringProductMatchApplyResult,
  type AuthoringBrandDriftCheckResult,
  type AuthoringBrandThemeAcknowledgementRequest,
  type AuthoringBrandThemeAcknowledgementResult,
  type AuthoringSessionContext,
  type AuthoringTranslationResult,
  type AuthoringResourceLibrary as AuthoringResourceLibraryValue,
  type AuthoringMediaAssetKind,
  type AuthoringMediaAssetResource as AuthoringMediaAssetResourceValue,
  type BasicVisualPreflightIssueCode,
  type BrandThemeSnapshot,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type BridgeMessage as BridgeMessageType,
  type HostedAuthoringActivationHandoffMessage as HostedAuthoringActivationHandoffMessageType,
  type HostedAuthoringBrowseCloseRequestMessage as HostedAuthoringBrowseCloseRequestMessageType,
  type HostedAuthoringPreSessionMessage as HostedAuthoringPreSessionMessageType,
  type HostedAuthoringSessionCloseRequestMessage as HostedAuthoringSessionCloseRequestMessageType,
  type HostedAuthoringSessionCloseResultMessage as HostedAuthoringSessionCloseResultMessageType,
  type ProductStyleProposal,
  type BrandDriftCheckRequest,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  createDirectAuthoringHostServices,
  requestAuthoringBrandDrift,
  requestAuthoringBrandThemeAcknowledgement,
  brandMatchProposalForFrame,
  brandWorkspaceStateFromTheme,
  mountLocalAuthoringFrame,
  productionArtifactForFrame,
  releaseWorkflowFromState,
  verificationForFrame,
  type AuthoringReleaseFinding,
  type AuthoringProductionApprovalRequest,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingReleaseState,
  type DirectAuthoringHostFrameServices,
  type DirectAuthoringHostServiceHandle,
  type LocalAuthoringFrameServices,
} from '@lodariq/sdk-authoring/authoring-frame';
import { HostedAuthoringApiClient } from './authoring-api-client';
import { authoringText } from '@lodariq/sdk-authoring/i18n';
import { initialWorkspaceFromDocumentIntent } from './authoring-initial-workspace';

type AuthoringInitMessage = Extract<BridgeMessageType, { type: 'authoring.init' }>;
type ExactArtifactPromotionRequest = Parameters<
  NonNullable<LocalAuthoringFrameServices['promoteExactArtifact']>
>[0];
type ReleasePipeline = NonNullable<AuthoringStagingReleaseState['pipeline']>;

interface HostedReadyChallenge {
  readyRequestId: string;
  state: string;
}

interface HostedEditorSession {
  apiOrigin: string;
  context: AuthoringSessionContext;
  document: LodariqDocument;
  documentIntent: AuthoringDocumentIntent;
  theme: BrandThemeSnapshot;
  resources: AuthoringResourceLibraryValue;
  documentUpdatedAt: string;
}

interface ScopedAuthoringDocument {
  document: LodariqDocument;
  theme: BrandThemeSnapshot;
  documentUpdatedAt: string;
}

type HostedFailureCode =
  | 'activation-invalid'
  | 'activation-expired'
  | 'activation-replayed'
  | 'origin-mismatch'
  | 'session-unavailable'
  | 'document-unavailable'
  | 'protocol-error';

class HostedEditorFailure extends Error {
  constructor(
    readonly code: HostedFailureCode,
    readonly retryable: boolean,
  ) {
    super('Hosted authoring request failed');
  }
}

const root = getAuthoringRoot();
const BASIC_VISUAL_PREFLIGHT_ISSUE_CODE_SET = new Set<string>(BASIC_VISUAL_PREFLIGHT_ISSUE_CODES);
const trustedParentOrigin = readTrustedParentOrigin();
const readyChallenge = trustedParentOrigin ? createReadyChallenge() : null;

let mounted = false;
let mounting = false;
let activationHandoffConsumed = false;
let hostedActivationHandoff: HostedAuthoringActivationHandoffMessageType | null = null;
let hostedEditorSession: HostedEditorSession | null = null;
let activeHostedSession: Pick<HostedEditorSession, 'apiOrigin' | 'context'> | null = null;
let hostedAuthoringSessionToken: string | null = null;
let hostedApiClient: HostedAuthoringApiClient | null = null;
let browseReadyAnnounced = false;
let sessionSelectionInProgress = false;
let directAuthoringHostServices: DirectAuthoringHostServiceHandle | null = null;

window.addEventListener('message', handleParentMessage);
window.addEventListener('pagehide', stopListening, { once: true });
announceEditorReady();

function handleParentMessage(event: MessageEvent): void {
  if (event.source !== window.parent) return;
  if (!trustedParentOrigin || event.origin !== trustedParentOrigin) return;

  const browseClose = validate(HostedAuthoringBrowseCloseRequestMessage, event.data);
  if (browseClose.valid && browseClose.value.type === HOSTED_AUTHORING_BROWSE_CLOSE_REQUEST_TYPE) {
    void acceptBrowseCloseRequest(browseClose.value);
    return;
  }

  const sessionClose = validate(HostedAuthoringSessionCloseRequestMessage, event.data);
  if (
    sessionClose.valid &&
    sessionClose.value.type === HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE
  ) {
    void acceptSessionCloseRequest(sessionClose.value);
    return;
  }

  if (mounted || mounting) return;

  const handoff = validate(HostedAuthoringActivationHandoffMessage, event.data);
  if (handoff.valid) {
    acceptActivationHandoff(handoff.value);
    return;
  }

  const init = validate(BridgeMessage, event.data);
  if (!init.valid || init.value.type !== 'authoring.init') return;
  void acceptAuthoringInit(init.value, event.origin);
}

function acceptActivationHandoff(message: HostedAuthoringActivationHandoffMessageType): void {
  if (!readyChallenge || activationHandoffConsumed) return;
  if (
    message.readyRequestId !== readyChallenge.readyRequestId ||
    message.state !== readyChallenge.state
  ) {
    return;
  }
  if (message.customerOrigin !== trustedParentOrigin) return;

  activationHandoffConsumed = true;
  hostedActivationHandoff = message;
  hostedApiClient = new HostedAuthoringApiClient(message.apiOrigin);
  if (message.documentIntent) {
    void establishHostedEditorSession(message, message.documentIntent, 'page', true);
    return;
  }
  void enterHostedDocumentBrowser(message);
}

async function enterHostedDocumentBrowser(
  handoff: HostedAuthoringActivationHandoffMessageType,
  scope: AuthoringDocumentQueryScope = 'page',
): Promise<void> {
  renderHostedBrowserLoading(scope);
  try {
    const result = await queryHostedDocuments(handoff, scope);
    renderHostedDocumentBrowser(handoff, result);
  } catch {
    renderHostedBrowserQueryError(handoff, scope);
  } finally {
    announceBrowseReady(handoff);
  }
}

async function queryHostedDocuments(
  handoff: HostedAuthoringActivationHandoffMessageType,
  scope: AuthoringDocumentQueryScope,
): Promise<ReturnType<typeof requireDocumentQueryResult>> {
  let response: Response;
  try {
    response = await requireHostedApiClient(handoff.apiOrigin).request(
      '/v1/authoring/documents/query',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        activationGrant: handoff.activationGrant,
        body: JSON.stringify({
          installationId: handoff.installationId,
          customerOrigin: handoff.customerOrigin,
          pageContext: handoff.pageContext,
          scope,
        }),
      },
    );
  } catch {
    throw new HostedEditorFailure('document-unavailable', true);
  }
  if (!response.ok) {
    throw new HostedEditorFailure('document-unavailable', response.status >= 500);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HostedEditorFailure('protocol-error', false);
  }
  return requireDocumentQueryResult(payload, scope, handoff);
}

function requireDocumentQueryResult(
  payload: unknown,
  scope: AuthoringDocumentQueryScope,
  handoff: HostedAuthoringActivationHandoffMessageType,
) {
  const result = validate(QueryAuthoringDocumentsResult, payload);
  if (
    !result.valid ||
    result.value.scope !== scope ||
    result.value.pageContext.pathname !== handoff.pageContext.pathname
  ) {
    throw new HostedEditorFailure('protocol-error', false);
  }
  return result.value;
}

function renderHostedDocumentBrowser(
  handoff: HostedAuthoringActivationHandoffMessageType,
  result: ReturnType<typeof requireDocumentQueryResult>,
): void {
  const view = createHostedBrowserView();
  const title = document.createElement('h1');
  title.textContent =
    result.scope === 'page'
      ? authoringText('Experiences on this page')
      : authoringText('All experiences');
  const intro = document.createElement('p');
  intro.className = 'browse-intro';
  intro.textContent =
    result.scope === 'page'
      ? authoringText('Open an existing tour or start one here.')
      : authoringText('Choose a tour from this workspace.');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = authoringText('Search experiences');
  search.setAttribute('aria-label', authoringText('Search experiences'));
  const count = document.createElement('p');
  count.className = 'browse-count';
  const list = document.createElement('div');
  list.className = 'browse-list';

  const renderRows = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    const documents = result.documents.filter((summary) =>
      documentSummarySearchText(summary).includes(query),
    );
    count.textContent =
      documents.length === 1
        ? authoringText('{count} experience', { count: documents.length })
        : authoringText('{count} experiences', { count: documents.length });
    list.replaceChildren();
    if (documents.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'browse-empty';
      const emptyTitle = document.createElement('strong');
      emptyTitle.textContent = query
        ? authoringText('No matching experiences')
        : authoringText('Nothing authored here yet');
      const emptyCopy = document.createElement('span');
      emptyCopy.textContent = query
        ? authoringText('Try a different search.')
        : authoringText('Start a tour without leaving this page.');
      empty.append(emptyTitle, emptyCopy);
      list.appendChild(empty);
      return;
    }
    for (const summary of documents) {
      list.appendChild(
        createHostedDocumentRow(summary, () => {
          void establishHostedEditorSession(
            handoff,
            { kind: 'existing', documentId: summary.id },
            result.scope,
            false,
          );
        }),
      );
    }
  };

  search.addEventListener('input', renderRows);
  const toolbar = document.createElement('div');
  toolbar.className = 'browse-toolbar';
  toolbar.append(search, count);
  view.content.append(title, intro, toolbar, list);

  const startTour = createBrowserButton(authoringText('Start Tour'), 'primary');
  startTour.addEventListener('click', () => {
    void establishHostedEditorSession(
      handoff,
      { kind: 'new-draft', documentType: 'tour' },
      'page',
      false,
    );
  });
  view.footer.appendChild(startTour);
  if (result.scope === 'page') {
    const browseAll = createBrowserButton(authoringText('Browse all workspace'), 'secondary');
    browseAll.addEventListener('click', () => {
      void enterHostedDocumentBrowser(handoff, 'workspace');
    });
    view.footer.prepend(browseAll);
  }
  root.replaceChildren(view.style, view.shell);
  root.setAttribute('data-state', 'browse');
  renderRows();
  queueMicrotask(() => search.focus());
}

function createHostedDocumentRow(
  summary: AuthoringPageDocumentSummary,
  onSelect: () => void,
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'browse-row';
  const heading = document.createElement('span');
  heading.className = 'browse-row-heading';
  const title = document.createElement('strong');
  title.textContent = summary.title || authoringText('Untitled tour');
  const type = document.createElement('span');
  type.textContent = authoringText('Tour');
  heading.append(title, type);
  const meta = document.createElement('span');
  meta.className = 'browse-row-meta';
  const status = document.createElement('span');
  status.textContent = documentStatusLabel(summary.status);
  const release = document.createElement('span');
  release.textContent = releaseTruthLabel(summary);
  meta.append(status, release);
  row.append(heading, meta);
  row.addEventListener('click', onSelect);
  return row;
}

function createHostedBrowserView(): {
  content: HTMLElement;
  footer: HTMLElement;
  shell: HTMLElement;
  style: HTMLStyleElement;
} {
  const style = createNonceStyleElement(document, '');
  style.textContent = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { background: #fffdf8; margin: 0; min-height: 100%; }
    body { color: #173b35; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #authoring { height: 100vh; min-height: 100vh; }
    .browse-shell { display: grid; grid-template-rows: minmax(0, 1fr) auto; height: 100%; }
    .browse-content { overflow: auto; padding: 24px 22px 14px; }
    h1 { font-family: Georgia, "Times New Roman", serif; font-size: 25px; letter-spacing: -.025em; line-height: 1.08; margin: 0; }
    .browse-intro { color: #6d7974; font-size: 13px; line-height: 1.5; margin: 8px 0 20px; }
    .browse-toolbar { display: grid; gap: 8px; margin-bottom: 12px; }
    input { background: #fff; border: 1px solid #d8ddd7; border-radius: 12px; color: #173b35; font: inherit; height: 44px; padding: 0 13px; width: 100%; }
    input:focus { border-color: #5b7c72; box-shadow: 0 0 0 3px rgba(49, 96, 83, .12); outline: none; }
    .browse-count { color: #88918d; font-size: 11px; margin: 0 2px; }
    .browse-list { display: grid; gap: 8px; }
    .browse-row { background: #fff; border: 1px solid #e3e5df; border-radius: 14px; color: inherit; cursor: pointer; display: grid; gap: 9px; padding: 13px 14px; text-align: left; width: 100%; }
    .browse-row:hover { border-color: #9eafa7; box-shadow: 0 7px 20px rgba(23, 59, 53, .08); transform: translateY(-1px); }
    .browse-row:focus-visible, .browse-footer button:focus-visible { outline: 2px solid #37675b; outline-offset: 2px; }
    .browse-row-heading, .browse-row-meta { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
    .browse-row-heading strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .browse-row-heading span { background: #edf2ef; border-radius: 999px; color: #46645c; font-size: 10px; padding: 4px 7px; }
    .browse-row-meta { color: #7c8782; font-size: 10px; }
    .browse-empty { align-items: center; border: 1px dashed #cfd7d1; border-radius: 16px; display: flex; flex-direction: column; gap: 6px; padding: 30px 18px; text-align: center; }
    .browse-empty strong { font-family: Georgia, "Times New Roman", serif; font-size: 17px; }
    .browse-empty span { color: #7c8782; font-size: 12px; }
    .browse-footer { background: rgba(255, 253, 248, .96); border-top: 1px solid #e5e6e0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); padding: 13px 16px 16px; }
    .browse-footer button { border-radius: 12px; cursor: pointer; font: 700 12px/1 Inter, ui-sans-serif, system-ui, sans-serif; min-height: 44px; padding: 0 12px; }
    .browse-primary { background: #173b35; border: 1px solid #173b35; color: #fffdf8; }
    .browse-secondary { background: #fff; border: 1px solid #d4dad5; color: #294c44; }
    .browse-loading { align-items: center; display: flex; height: 100%; justify-content: center; padding: 28px; text-align: center; }
    .browse-loading div { display: grid; gap: 7px; }
    .browse-loading strong { font-family: Georgia, "Times New Roman", serif; font-size: 20px; }
    .browse-loading span { color: #7c8782; font-size: 12px; }
    [data-browse-busy="true"] button, [data-browse-busy="true"] input { pointer-events: none; opacity: .58; }
  `;
  const shell = document.createElement('main');
  shell.className = 'browse-shell';
  const content = document.createElement('section');
  content.className = 'browse-content';
  const footer = document.createElement('footer');
  footer.className = 'browse-footer';
  shell.append(content, footer);
  return { content, footer, shell, style };
}

function createBrowserButton(label: string, tone: 'primary' | 'secondary'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `browse-${tone}`;
  button.textContent = label;
  return button;
}

function renderHostedBrowserLoading(scope: AuthoringDocumentQueryScope): void {
  const view = createHostedBrowserView();
  const loading = document.createElement('div');
  loading.className = 'browse-loading';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent =
    scope === 'page'
      ? authoringText('Finding experiences on this page')
      : authoringText('Loading workspace');
  const detail = document.createElement('span');
  detail.textContent = authoringText('One moment…');
  copy.append(title, detail);
  loading.appendChild(copy);
  view.shell.replaceChildren(loading);
  root.replaceChildren(view.style, view.shell);
  root.setAttribute('data-state', 'loading');
}

function renderHostedBrowserQueryError(
  handoff: HostedAuthoringActivationHandoffMessageType,
  scope: AuthoringDocumentQueryScope,
): void {
  const view = createHostedBrowserView();
  const title = document.createElement('h1');
  title.textContent = authoringText('Experiences could not load');
  const detail = document.createElement('p');
  detail.className = 'browse-intro';
  detail.textContent = authoringText('Your page is still available. Retry without leaving it.');
  const retry = createBrowserButton(authoringText('Try again'), 'primary');
  retry.addEventListener('click', () => void enterHostedDocumentBrowser(handoff, scope));
  const startTour = createBrowserButton(authoringText('Start Tour'), 'secondary');
  startTour.addEventListener('click', () => {
    void establishHostedEditorSession(
      handoff,
      { kind: 'new-draft', documentType: 'tour' },
      'page',
      false,
    );
  });
  view.content.append(title, detail);
  view.footer.append(retry, startTour);
  root.replaceChildren(view.style, view.shell);
  root.setAttribute('data-state', 'error');
}

function renderHostedBrowserError(message: string): void {
  const view = createHostedBrowserView();
  const title = document.createElement('h1');
  title.textContent = authoringText('Experience could not open');
  const detail = document.createElement('p');
  detail.className = 'browse-intro';
  detail.textContent = message;
  view.content.append(title, detail);
  view.footer.remove();
  root.replaceChildren(view.style, view.shell);
  root.setAttribute('data-state', 'error');
}

function setHostedBrowserBusy(busy: boolean): void {
  root.toggleAttribute('data-browse-busy', busy);
}

function announceBrowseReady(handoff: HostedAuthoringActivationHandoffMessageType): void {
  if (browseReadyAnnounced) return;
  browseReadyAnnounced = true;
  postHostedMessage({
    protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
    type: HOSTED_AUTHORING_BROWSE_READY_TYPE,
    readyRequestId: handoff.readyRequestId,
    handoffRequestId: handoff.handoffRequestId,
    state: handoff.state,
  });
}

function documentSummarySearchText(summary: AuthoringPageDocumentSummary): string {
  return [
    summary.title,
    summary.type,
    summary.status,
    ...summary.releases.map((item) => item.environment),
  ]
    .join(' ')
    .toLocaleLowerCase();
}

function documentStatusLabel(status: AuthoringPageDocumentSummary['status']): string {
  const labels: Record<AuthoringPageDocumentSummary['status'], string> = {
    approved: authoringText('Approved'),
    archived: authoringText('Archived'),
    draft: authoringText('Draft'),
    live: authoringText('Live'),
    review: authoringText('In review'),
  };
  return labels[status];
}

function releaseTruthLabel(summary: AuthoringPageDocumentSummary): string {
  if (summary.releases.length === 0) return authoringText('Not released');
  const environments = [
    ...new Set(summary.releases.map((release) => authoringText(release.environment))),
  ];
  return authoringText('Released to {environments}', { environments: environments.join(', ') });
}

async function acceptBrowseCloseRequest(
  message: HostedAuthoringBrowseCloseRequestMessageType,
): Promise<void> {
  const handoff = hostedActivationHandoff;
  if (
    !handoff ||
    hostedAuthoringSessionToken ||
    message.readyRequestId !== handoff.readyRequestId ||
    message.handoffRequestId !== handoff.handoffRequestId ||
    message.state !== handoff.state
  ) {
    return;
  }
  await revokeHostedActivation(handoff, true);
  postHostedMessage({
    protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
    type: HOSTED_AUTHORING_BROWSE_CLOSE_RESULT_TYPE,
    requestId: message.requestId,
    readyRequestId: message.readyRequestId,
    handoffRequestId: message.handoffRequestId,
    state: message.state,
  });
}

async function revokeHostedActivation(
  handoff: HostedAuthoringActivationHandoffMessageType,
  keepalive: boolean,
): Promise<void> {
  const activationGrant = handoff.activationGrant;
  handoff.activationGrant = '';
  hostedActivationHandoff = null;
  if (!activationGrant) return;
  try {
    await requireHostedApiClient(handoff.apiOrigin).request('/v1/authoring/activation/revoke', {
      method: 'POST',
      keepalive,
      headers: {
        'content-type': 'application/json',
      },
      activationGrant,
      body: JSON.stringify({
        installationId: handoff.installationId,
        customerOrigin: handoff.customerOrigin,
      }),
    });
  } catch {
    // Revocation is best-effort; the short-lived grant still leaves iframe memory here.
  }
}

async function acceptSessionCloseRequest(
  message: HostedAuthoringSessionCloseRequestMessageType,
): Promise<void> {
  const session = activeHostedSession;
  if (
    !session ||
    message.sessionId !== session.context.sessionId ||
    message.documentId !== session.context.documentId
  ) {
    return;
  }
  const result = await revokeHostedSession(session.apiOrigin, session.context);
  postHostedSessionLifecycleMessage({
    protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
    type: HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
    requestId: message.requestId,
    sessionId: message.sessionId,
    documentId: message.documentId,
    ok: result.ok,
    retryable: result.retryable,
  });
}

async function revokeHostedSession(
  apiOrigin: string,
  context: AuthoringSessionContext,
  keepalive = false,
): Promise<{ ok: boolean; retryable: boolean }> {
  const token = hostedAuthoringSessionToken;
  if (!token) return { ok: false, retryable: false };
  let response: Response;
  try {
    response = await requireHostedApiClient(apiOrigin).request(
      `/v1/authoring/sessions/${encodeURIComponent(context.sessionId)}/revoke`,
      {
        method: 'POST',
        keepalive,
        useSession: true,
      },
    );
  } catch {
    return { ok: false, retryable: true };
  }
  if (!(response instanceof Response)) return { ok: false, retryable: true };
  if (!response.ok) return { ok: false, retryable: response.status >= 500 };
  hostedAuthoringSessionToken = null;
  hostedApiClient?.clearSession();
  activeHostedSession = null;
  return { ok: true, retryable: false };
}

function postHostedSessionLifecycleMessage(
  message: HostedAuthoringSessionCloseResultMessageType,
): void {
  if (!trustedParentOrigin) return;
  const result = validate(HostedAuthoringSessionCloseResultMessage, message);
  if (!result.valid) return;
  window.parent.postMessage(result.value, trustedParentOrigin);
}

async function establishHostedEditorSession(
  handoff: HostedAuthoringActivationHandoffMessageType,
  documentIntent: AuthoringDocumentIntent,
  selectionScope: AuthoringDocumentQueryScope,
  reportFailureToHost: boolean,
): Promise<void> {
  if (sessionSelectionInProgress) return;
  sessionSelectionInProgress = true;
  setHostedBrowserBusy(true);
  try {
    const session = await createAuthoringDocumentSession(handoff, documentIntent, selectionScope);
    hostedAuthoringSessionToken = session.authoringSessionToken;
    requireHostedApiClient(handoff.apiOrigin).setSessionToken(session.authoringSessionToken);
    hostedActivationHandoff = null;
    activeHostedSession = {
      apiOrigin: handoff.apiOrigin,
      context: structuredClone(session.context),
    };
    const [loaded, resources] = await Promise.all([
      loadAuthoringDocument(handoff.apiOrigin, session.context),
      loadHostedAuthoringResources(handoff.apiOrigin),
    ]);
    hostedEditorSession = {
      apiOrigin: handoff.apiOrigin,
      context: structuredClone(session.context),
      document: structuredClone(loaded.document),
      documentIntent: structuredClone(documentIntent),
      theme: structuredClone(loaded.theme),
      resources: structuredClone(resources),
      documentUpdatedAt: loaded.documentUpdatedAt,
    };
    postHostedMessage({
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_SESSION_READY_TYPE,
      readyRequestId: handoff.readyRequestId,
      handoffRequestId: handoff.handoffRequestId,
      state: handoff.state,
      context: structuredClone(session.context),
      document: structuredClone(loaded.document),
      theme: structuredClone(loaded.theme),
    });
    root.setAttribute('data-state', 'ready');
    root.textContent = authoringText('Authoring session ready.');
  } catch (error) {
    const failedSession = activeHostedSession;
    if (failedSession && hostedAuthoringSessionToken) {
      void revokeHostedSession(failedSession.apiOrigin, failedSession.context, true);
    }
    hostedAuthoringSessionToken = null;
    hostedApiClient?.clearSession();
    hostedEditorSession = null;
    activeHostedSession = null;
    const failure = normalizeHostedEditorFailure(error);
    if (reportFailureToHost) {
      postHostedMessage({
        protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
        type: HOSTED_AUTHORING_SESSION_FAILED_TYPE,
        readyRequestId: handoff.readyRequestId,
        handoffRequestId: handoff.handoffRequestId,
        state: handoff.state,
        customerOrigin: handoff.customerOrigin,
        code: failure.code,
        retryable: failure.retryable,
      });
      root.setAttribute('data-state', 'error');
      root.textContent = authoringText('Lodariq authoring could not start.');
    } else {
      renderHostedBrowserError(
        authoringText('That experience could not be opened. Close Lodariq and launch it again.'),
      );
    }
  } finally {
    sessionSelectionInProgress = false;
    setHostedBrowserBusy(false);
  }
}

async function createAuthoringDocumentSession(
  handoff: HostedAuthoringActivationHandoffMessageType,
  documentIntent: AuthoringDocumentIntent,
  selectionScope: AuthoringDocumentQueryScope,
): Promise<{ authoringSessionToken: string; context: AuthoringSessionContext }> {
  const activationGrant = handoff.activationGrant;
  handoff.activationGrant = '';
  let response: Response;
  try {
    response = await requireHostedApiClient(handoff.apiOrigin).request('/v1/authoring/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      activationGrant,
      body: JSON.stringify({
        installationId: handoff.installationId,
        customerOrigin: handoff.customerOrigin,
        pageContext: handoff.pageContext,
        selectionScope,
        documentIntent,
      }),
    });
  } catch {
    throw new HostedEditorFailure('session-unavailable', true);
  }

  if (!response.ok) throw sessionResponseFailure(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HostedEditorFailure('protocol-error', false);
  }
  const result = validate(AuthoringDocumentSessionResult, payload);
  if (
    !result.valid ||
    !sessionContextMatchesHandoff(result.value.context, handoff, documentIntent)
  ) {
    throw new HostedEditorFailure('protocol-error', false);
  }
  if (!hasRequiredEditorCapabilities(result.value.context)) {
    throw new HostedEditorFailure('protocol-error', false);
  }
  if (!isFutureTimestamp(result.value.context.expiresAt)) {
    throw new HostedEditorFailure('activation-expired', false);
  }
  return result.value;
}

async function loadAuthoringDocument(
  apiOrigin: string,
  context: AuthoringSessionContext,
): Promise<ScopedAuthoringDocument> {
  let response: Response;
  try {
    response = await requireHostedApiClient(apiOrigin).request('/v1/authoring/document', {
      method: 'GET',
      useSession: true,
    });
  } catch {
    throw new HostedEditorFailure('document-unavailable', true);
  }
  if (!response.ok) {
    throw new HostedEditorFailure('document-unavailable', response.status >= 500);
  }

  return readScopedDocumentPayload(response, context);
}

async function loadHostedAuthoringResources(
  apiOrigin: string,
): Promise<AuthoringResourceLibraryValue> {
  let response: Response;
  try {
    response = await requireHostedApiClient(apiOrigin).request('/v1/authoring/resources', {
      method: 'GET',
      useSession: true,
    });
  } catch {
    throw new HostedEditorFailure('document-unavailable', true);
  }
  if (!response.ok) {
    throw new HostedEditorFailure('document-unavailable', response.status >= 500);
  }
  const payload: unknown = await response.json();
  const result = validate(AuthoringResourceLibrary, payload);
  if (!result.valid) throw new HostedEditorFailure('protocol-error', false);
  return structuredClone(result.value);
}

async function saveHostedAuthoringResources(
  apiOrigin: string,
  resources: Pick<AuthoringResourceLibraryValue, 'recipes' | 'checkpoints'>,
): Promise<AuthoringResourceLibraryValue> {
  const response = await requireHostedApiClient(apiOrigin).request('/v1/authoring/resources', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    useSession: true,
    body: JSON.stringify(resources),
  });
  if (!response.ok) throw new Error(authoringText('Draft could not be saved'));
  const payload: unknown = await response.json();
  const result = validate(AuthoringResourceLibrary, payload);
  if (!result.valid) throw new Error(authoringText('Draft could not be saved'));
  return structuredClone(result.value);
}

async function uploadHostedMediaAsset(
  apiOrigin: string,
  kind: AuthoringMediaAssetKind,
  file: File,
  options: { onProgress?: (progress: number) => void; savedToLibrary: boolean },
): Promise<AuthoringMediaAssetResourceValue> {
  const contentType = file.type || (kind === 'captions' ? 'text/vtt' : '');
  const contentBase64 = bytesToBase64(await readFileBytesWithProgress(file, options.onProgress));
  options.onProgress?.(88);
  const response = await requireHostedApiClient(apiOrigin).request('/v1/authoring/media-assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    useSession: true,
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType,
      contentBase64,
      savedToLibrary: options.savedToLibrary,
    }),
  });
  options.onProgress?.(96);
  if (!response.ok) throw new Error(authoringText('Draft could not be saved'));
  const payload: unknown = await response.json();
  const result = validate(AuthoringMediaAssetResource, payload);
  if (!result.valid) throw new Error(authoringText('Draft could not be saved'));
  options.onProgress?.(100);
  return structuredClone(result.value);
}

async function readFileBytesWithProgress(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array> {
  onProgress?.(0);
  if (typeof file.stream !== 'function') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    onProgress?.(80);
    return bytes;
  }
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(chunk.value);
    loadedBytes += chunk.value.byteLength;
    const fraction = file.size > 0 ? loadedBytes / file.size : 1;
    onProgress?.(Math.min(80, Math.round(fraction * 80)));
  }
  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function loadHostedMediaAssetPreview(
  apiOrigin: string,
  asset: AuthoringMediaAssetResourceValue,
): Promise<Blob> {
  const response = await requireHostedApiClient(apiOrigin).request(asset.downloadPath, {
    method: 'GET',
    useSession: true,
  });
  if (!response.ok) throw new Error(authoringText('Media asset is unavailable'));
  const blob = await response.blob();
  if (blob.size !== asset.byteLength || blob.type !== asset.contentType) {
    throw new Error(authoringText('Media asset is unavailable'));
  }
  return blob;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return btoa(chunks.join(''));
}

async function persistHostedDocument(
  apiOrigin: string,
  context: AuthoringSessionContext,
  document: LodariqDocument,
  expectedDocumentUpdatedAt: string,
): Promise<ScopedAuthoringDocument> {
  if (!documentMatchesSession(document, context)) {
    throw new Error(authoringText('Authoring document scope mismatch'));
  }
  let response: Response;
  try {
    response = await requireHostedApiClient(apiOrigin).request('/v1/authoring/document', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      useSession: true,
      body: JSON.stringify({ document, expectedDocumentUpdatedAt }),
    });
  } catch {
    throw new Error(authoringText('Authoring document persistence failed'));
  }
  if (!response.ok) throw new Error(authoringText('Authoring document persistence failed'));
  try {
    return await readScopedDocumentPayload(response, context);
  } catch {
    throw new Error(authoringText('Authoring document persistence failed'));
  }
}

async function translateHostedDocument(
  apiOrigin: string,
  context: AuthoringSessionContext,
  document: LodariqDocument,
  targetLocale: string,
): Promise<AuthoringTranslationResult> {
  if (!documentMatchesSession(document, context)) {
    throw new Error(authoringText('Authoring document scope mismatch'));
  }
  let response: Response;
  try {
    response = await requireHostedApiClient(apiOrigin).request(
      '/v1/authoring/document/translation',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        useSession: true,
        body: JSON.stringify({ document, targetLocale, mode: 'missing' }),
      },
    );
  } catch {
    throw new Error(authoringText('Translation failed. Try again.'));
  }
  if (!response.ok) throw new Error(authoringText('Translation failed. Try again.'));
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(authoringText('Translation failed. Try again.'));
  }
  const result = validate(AuthoringTranslationResultSchema, payload);
  if (
    !result.valid ||
    !documentMatchesSession(result.value.document, context) ||
    result.value.targetLocale !== targetLocale
  ) {
    throw new Error(authoringText('Translation failed. Try again.'));
  }
  return structuredClone(result.value);
}

async function loadHostedReleaseState(
  apiOrigin: string,
  context: AuthoringSessionContext,
): Promise<AuthoringStagingReleaseState> {
  const response = await fetchHostedReleaseRequest(
    new URL('/v1/authoring/release-state', apiOrigin),
    { method: 'GET' },
  );
  if (!response.ok) throw new Error(authoringText('Authoring release state failed'));
  const payload = await readJsonObject(response);
  return requireHostedReleaseState(payload, context);
}

async function loadHostedReleaseRecoveryState(
  apiOrigin: string,
  context: AuthoringSessionContext,
  environmentId: string,
): Promise<ReleaseRecoveryStateResponse> {
  const response = await fetchHostedReleaseRequest(
    hostedReleaseRecoveryUrl(apiOrigin, environmentId),
    { method: 'GET' },
  );
  if (!response.ok) throw new Error(authoringText('Authoring release recovery state failed'));
  const payload = await response.json().catch(() => null);
  const validation = validate(ReleaseRecoveryStateResponseSchema, payload);
  const expectedScope = {
    workspaceId: context.workspaceId,
    environmentId,
    documentId: context.documentId,
  };
  if (!validation.valid || !releaseRecoveryStateMatchesScope(validation.value, expectedScope)) {
    throw new Error(authoringText('Authoring release recovery state scope mismatch'));
  }
  return structuredClone(validation.value);
}

async function recoverHostedRelease(
  apiOrigin: string,
  _context: AuthoringSessionContext,
  environmentId: string,
  request: ReleaseRecoveryRequest,
): Promise<ReleaseRecoveryResult> {
  const response = await fetchHostedReleaseRequest(
    hostedReleaseRecoveryUrl(apiOrigin, environmentId),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  const payload = await response.json().catch(() => null);
  const validation = validate(ReleaseRecoveryResultSchema, payload);
  if (!validation.valid || validation.value.action !== request.action) {
    throw new Error(authoringText('Authoring release recovery response is invalid'));
  }
  return structuredClone(validation.value);
}

function hostedReleaseRecoveryUrl(apiOrigin: string, environmentId: string): URL {
  return new URL(
    `/v1/authoring/environments/${encodeURIComponent(environmentId)}/release-recovery`,
    apiOrigin,
  );
}

function releaseRecoveryCapabilityDenied(
  action: ReleaseRecoveryRequest['action'],
): Extract<ReleaseRecoveryResult, { ok: false }> {
  return {
    ok: false,
    action,
    state: 'failed',
    replayed: false,
    code: 'capability_denied',
    message: RELEASE_RECOVERY_FAILURE_MESSAGES.capability_denied,
  } as Extract<ReleaseRecoveryResult, { ok: false }>;
}

async function publishHostedTourToStaging(
  apiOrigin: string,
  context: AuthoringSessionContext,
  request: AuthoringStagingPublicationRequest,
): Promise<AuthoringStagingPublicationResult> {
  const response = await fetchHostedReleaseRequest(
    new URL('/v1/authoring/publications', apiOrigin),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': request.idempotencyKey,
        'x-lodariq-correlation-id': request.correlationId,
      },
      body: JSON.stringify({
        expectedGeneration: request.expectedGeneration,
        expectedArtifactId: request.expectedArtifactId,
        expectedContentHash: request.expectedContentHash,
      }),
    },
  );
  const payload = await readJsonObject(response);
  const findings = releaseFindingsFromPayload(payload);
  if (!response.ok) {
    const expectedGeneration = nonNegativeInteger(payload['expectedGeneration']);
    const actualGeneration = nonNegativeInteger(payload['actualGeneration']);
    const code = boundedString(payload['error'], 'release_failed');
    const message = boundedString(payload['message'], authoringText('Staging release failed'));
    const errorFindings =
      findings.length > 0 ? findings : [{ code, severity: 'blocker' as const, label: message }];
    return {
      ok: false,
      code,
      message,
      ...(expectedGeneration !== null ? { expectedGeneration } : {}),
      ...(actualGeneration !== null ? { actualGeneration } : {}),
      findings: errorFindings,
    };
  }

  const deployment = objectValue(payload['deployment']);
  const generation = deployment ? positiveInteger(deployment['generation']) : null;
  if (
    !deployment ||
    generation === null ||
    deployment['documentId'] !== context.documentId ||
    deployment['environmentId'] !== context.environmentId
  ) {
    throw new Error(authoringText('Authoring release response scope mismatch'));
  }
  return {
    ok: true,
    replayed: payload['replayed'] === true,
    generation,
    findings,
  };
}

async function saveHostedStyleSource(
  apiOrigin: string,
  context: AuthoringSessionContext,
  expectedThemeId: string,
  proposal: ProductStyleProposal,
): Promise<AuthoringProductMatchApplyResult> {
  const proposalValidation = validate(ProductStyleProposalSchema, proposal);
  if (!proposalValidation.valid) throw new Error(authoringText('Brand proposal is invalid'));
  const response = await fetchHostedReleaseRequest(
    new URL('/v1/authoring/style-sources', apiOrigin),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposal: proposalValidation.value }),
    },
  );
  if (!response.ok) throw new Error(authoringText('Brand proposal could not be saved'));
  const payload = await readJsonObject(response);
  const normalized = validate(AuthoringProductMatchApplyResultSchema, payload['productMatch']);
  if (!normalized.valid || normalized.value.previewTheme.themeId !== expectedThemeId) {
    throw new Error(authoringText('Brand proposal response is invalid'));
  }
  const persistedSources = Array.isArray(payload['sources']) ? payload['sources'] : [];
  if (
    persistedSources.length !== normalized.value.sources.length ||
    normalized.value.sources.some((receipt) => {
      const source = persistedSources
        .map((value) => objectValue(value))
        .find((value) => value?.['id'] === receipt.sourceId);
      return (
        source?.['workspaceId'] !== context.workspaceId ||
        source?.['environmentId'] !== context.environmentId ||
        source?.['sourceHash'] !== receipt.sourceHash
      );
    })
  ) {
    throw new Error(authoringText('Brand proposal response scope is invalid'));
  }
  return structuredClone(normalized.value);
}

async function checkHostedBrandDrift(
  apiOrigin: string,
  context: AuthoringSessionContext,
  theme: BrandThemeSnapshot,
  request: BrandDriftCheckRequest,
): Promise<AuthoringBrandDriftCheckResult> {
  return requestAuthoringBrandDrift({
    request,
    expectedDocumentId: context.documentId,
    expectedThemeId: theme.themeId,
    expectedThemeVersionId: theme.themeVersionId,
    fetchAuthorized: (body) =>
      fetchHostedReleaseRequest(new URL('/v1/authoring/brand-drift', apiOrigin), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
  });
}

async function acknowledgeHostedBrandTheme(
  apiOrigin: string,
  context: AuthoringSessionContext,
  theme: BrandThemeSnapshot,
  request: AuthoringBrandThemeAcknowledgementRequest,
): Promise<AuthoringBrandThemeAcknowledgementResult> {
  return requestAuthoringBrandThemeAcknowledgement({
    request,
    expectedWorkspaceId: context.workspaceId,
    expectedDocumentId: context.documentId,
    expectedThemeId: theme.themeId,
    fetchAuthorized: (body) =>
      fetchHostedReleaseRequest(new URL('/v1/authoring/brand-theme-acknowledgement', apiOrigin), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
  });
}

async function submitHostedStagingVerification(
  apiOrigin: string,
  context: AuthoringSessionContext,
  request: AuthoringStagingVerificationRequest,
): Promise<AuthoringStagingVerificationResult> {
  const response = await fetchHostedReleaseRequest(
    new URL('/v1/authoring/verifications', apiOrigin),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  const payload = await response.json().catch(() => null);
  const validation = validate(AuthoringStagingVerificationResultSchema, payload);
  if (!validation.valid) throw new Error(authoringText('Staging verification response is invalid'));
  if (
    validation.value.ok &&
    (validation.value.verification.workspaceId !== context.workspaceId ||
      validation.value.verification.environmentId !== context.environmentId ||
      validation.value.verification.documentId !== context.documentId ||
      validation.value.verification.publicationId !== request.publicationId)
  ) {
    throw new Error(authoringText('Staging verification response scope mismatch'));
  }
  return structuredClone(validation.value);
}

async function promoteHostedProduction(
  apiOrigin: string,
  _context: AuthoringSessionContext,
  request: ProductionPromotionRequest,
): Promise<ProductionPromotionResult> {
  const response = await fetchHostedReleaseRequest(new URL('/v1/authoring/promotions', apiOrigin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null);
  const validation = validate(ProductionPromotionResultSchema, payload);
  if (!validation.valid) throw new Error(authoringText('Production promotion response is invalid'));
  return structuredClone(validation.value);
}

async function approveHostedProduction(
  apiOrigin: string,
  context: AuthoringSessionContext,
  operationId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }> {
  const operationPath = `/v1/authoring/release-operations/${encodeURIComponent(operationId)}/approvals`;
  const response = await fetchHostedReleaseRequest(new URL(operationPath, apiOrigin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
  });
  if (!response.ok) throw new Error(authoringText('Production approval failed'));
  const payload = await readJsonObject(response);
  const approval = validate(ReleaseApprovalSchema, payload['approval']);
  const promotion = validate(ProductionPromotionResultSchema, payload['promotion']);
  if (
    !approval.valid ||
    !promotion.valid ||
    approval.value.workspaceId !== context.workspaceId ||
    approval.value.releaseOperationId !== operationId ||
    approval.value.decision !== decision
  ) {
    throw new Error(authoringText('Production approval response scope mismatch'));
  }
  return {
    approval: structuredClone(approval.value),
    promotion: structuredClone(promotion.value),
  };
}

function requireCurrentStagingArtifact(
  state: AuthoringStagingReleaseState,
  expectedArtifactId: string,
  expectedContentHash: string,
  expectedPublicationId?: string,
): {
  publicationId: string;
  artifactId: string;
  contentHash: string;
} {
  const staging = state.pipeline?.staging;
  if (
    !staging?.publicationId ||
    !staging.compiledArtifactId ||
    !staging.contentHash ||
    staging.compiledArtifactId !== expectedArtifactId ||
    staging.contentHash !== expectedContentHash ||
    (expectedPublicationId !== undefined && staging.publicationId !== expectedPublicationId)
  ) {
    throw new Error(authoringText('The active staging artifact changed; refresh release truth.'));
  }
  return {
    publicationId: staging.publicationId,
    artifactId: staging.compiledArtifactId,
    contentHash: staging.contentHash,
  };
}

function createExactPromotionRequest(
  state: AuthoringStagingReleaseState,
  request: ExactArtifactPromotionRequest,
  guards: Map<string, Pick<ProductionPromotionRequest, 'idempotencyKey' | 'correlationId'>>,
): ProductionPromotionRequest {
  const staging = requireCurrentStagingArtifact(
    state,
    request.artifactId,
    request.contentHash,
    request.sourcePublicationId,
  );
  const production = requireCurrentProductionTarget(state, request);
  const guardKey = [staging.publicationId, production.environmentId, production.generation].join(
    ':',
  );
  let guard = guards.get(guardKey);
  if (!guard) {
    const random = window.crypto.randomUUID();
    guard = {
      idempotencyKey: `promotion:${random}`,
      correlationId: `promotion:${random}`,
    };
    guards.set(guardKey, guard);
  }
  return {
    sourcePublicationId: staging.publicationId,
    productionEnvironmentId: production.environmentId,
    expectedGeneration: production.generation,
    idempotencyKey: guard.idempotencyKey,
    correlationId: guard.correlationId,
  };
}

function requireCurrentProductionTarget(
  state: AuthoringStagingReleaseState,
  request: ExactArtifactPromotionRequest,
): ReleasePipeline['production'] {
  const production = state.pipeline?.production;
  if (!production) throw new Error(authoringText('Production environment is not configured.'));
  if (
    (request.productionEnvironmentId !== undefined &&
      request.productionEnvironmentId !== production.environmentId) ||
    (request.expectedGeneration !== undefined &&
      request.expectedGeneration !== production.generation) ||
    (request.expectedProductionArtifactId !== undefined &&
      request.expectedProductionArtifactId !== production.compiledArtifactId)
  ) {
    throw new Error(authoringText('Production release truth changed; review it before promoting.'));
  }
  return production;
}

function requirePendingApproval(state: AuthoringStagingReleaseState, operationId: string): void {
  const pipeline = state.pipeline;
  if (
    !pipeline ||
    pipeline.state !== 'awaiting_approval' ||
    pipeline.approvals.operationId !== operationId ||
    pipeline.approvals.requiredCount === 0 ||
    pipeline.approvals.approvedCount >= pipeline.approvals.requiredCount ||
    pipeline.approvals.rejected
  ) {
    throw new Error(authoringText('Production approval truth changed; refresh before approving.'));
  }
}

async function fetchHostedReleaseRequest(
  url: URL,
  init: Pick<RequestInit, 'body' | 'headers' | 'method'>,
): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    return await requireHostedApiClient(url.origin).request(url, {
      ...init,
      headers,
      useSession: true,
    });
  } catch {
    throw new Error(authoringText('Authoring release request failed'));
  }
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(authoringText('Authoring release response was not JSON'));
  }
  const object = objectValue(payload);
  if (!object) throw new Error(authoringText('Authoring release response was invalid'));
  return object;
}

function requireHostedReleaseState(
  payload: Record<string, unknown>,
  context: AuthoringSessionContext,
): AuthoringStagingReleaseState {
  // Hosted Slice 2 responses carried an editor-only visual report beside the
  // release state. Keep that one compatibility field out of the canonical
  // contract; every other unexpected property is still rejected by the schema.
  const candidate = { ...payload };
  delete candidate['visualCheck'];
  const result = validate(AuthoringStagingReleaseStateSchema, candidate);
  if (
    !result.valid ||
    result.value.environment !== context.environment ||
    result.value.environmentId !== context.environmentId ||
    result.value.documentId !== context.documentId
  ) {
    throw new Error(authoringText('Authoring release state scope mismatch'));
  }
  return structuredClone(result.value);
}

function releaseFindingsFromPayload(payload: Record<string, unknown>): AuthoringReleaseFinding[] {
  const candidates: unknown[] = [];
  if (Array.isArray(payload['findings'])) candidates.push(...payload['findings']);
  if (Array.isArray(payload['issues'])) candidates.push(...payload['issues']);
  const visualCheck = objectValue(payload['visualCheck']);
  const visualReport = visualCheck ? objectValue(visualCheck['report']) : null;
  if (visualReport && Array.isArray(visualReport['issues'])) {
    candidates.push(...visualReport['issues']);
  }

  const findings: AuthoringReleaseFinding[] = [];
  for (const candidate of candidates.slice(0, 32)) {
    const finding = normalizeReleaseFinding(candidate);
    if (finding) findings.push(finding);
  }
  return findings;
}

function normalizeReleaseFinding(value: unknown): AuthoringReleaseFinding | null {
  const item = objectValue(value);
  if (!item) return null;
  const code = boundedString(item['code'], 'release_check');
  const severity = item['severity'] === 'warning' ? 'warning' : 'blocker';
  const visualCode = BASIC_VISUAL_PREFLIGHT_ISSUE_CODE_SET.has(code)
    ? (code as BasicVisualPreflightIssueCode)
    : null;
  const fallbackLabel = boundedString(
    item['label'] ?? item['message'],
    authoringText('Release check'),
  );
  return {
    code,
    severity,
    label: visualCode ? basicVisualPreflightIssueLabel(visualCode) : fallbackLabel,
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  return value.trim().slice(0, 240);
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

async function readScopedDocumentPayload(
  response: Response,
  context: AuthoringSessionContext,
): Promise<ScopedAuthoringDocument> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HostedEditorFailure('protocol-error', false);
  }
  const result = validate(AuthoringDocumentPayload, payload);
  if (
    !result.valid ||
    !documentMatchesSession(result.value.document, context) ||
    !themeMatchesSession(result.value.theme, context)
  ) {
    throw new HostedEditorFailure('protocol-error', false);
  }
  return {
    document: result.value.document,
    theme: result.value.theme,
    documentUpdatedAt: result.value.documentUpdatedAt,
  };
}

async function acceptAuthoringInit(
  message: AuthoringInitMessage,
  parentOrigin: string,
): Promise<void> {
  if (message.protocol !== BRIDGE_PROTOCOL_VERSION) return;

  let baseDocument = message.document;
  const session = hostedEditorSession;
  if (session) {
    if (!initMatchesHostedSession(message, session)) return;
    baseDocument = structuredClone(session.document);
  } else if (activationHandoffConsumed) {
    return;
  }

  const previousRootState = root.getAttribute('data-state');
  const previousRootText = root.textContent;
  mounting = true;
  try {
    directAuthoringHostServices?.stop();
    const canUseHostServices = Boolean(
      session ||
      message.releaseStateCapability === AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
    );
    directAuthoringHostServices = canUseHostServices
      ? createDirectAuthoringHostServices({
          peerWindow: window.parent,
          allowedOrigins: [parentOrigin],
          targetOrigin: parentOrigin,
          sessionId: message.sessionId,
          workspaceId: message.workspaceId,
          documentId: message.documentId,
          publishToStaging:
            !session &&
            message.stagingPublicationCapability === AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
          readReleaseRecovery: session
            ? session.context.capabilities.includes(
                AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
              )
            : message.releaseStateCapability === AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
          rollbackRelease: session
            ? session.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE)
            : message.releaseStateCapability === AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
          unpublishRelease: session
            ? session.context.capabilities.includes(
                AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
              )
            : message.releaseStateCapability === AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
          sampleProductStyle: session
            ? session.context.capabilities.includes(
                AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
              )
            : message.productStyleSamplingCapability ===
              AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
          saveStyleSource:
            !session &&
            message.productStyleSamplingCapability ===
              AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
          checkBrandDrift:
            !session &&
            message.brandDriftCheckCapability ===
              AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
          acknowledgeBrandTheme:
            !session &&
            message.brandThemeAcknowledgementCapability ===
              AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
          verifyBrowserPublication: session
            ? session.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING)
            : message.stagingVerificationCapability ===
              AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
          submitStagingVerification:
            !session &&
            message.stagingVerificationCapability === AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
          promoteProduction:
            !session &&
            message.productionPromotionCapability ===
              AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
          approveProduction:
            !session &&
            message.productionApprovalCapability ===
              AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
        })
      : null;
    const services = createHostedEditorServices(
      session,
      baseDocument,
      directAuthoringHostServices?.services,
      session ? undefined : message.theme,
    );
    const deliveryCapabilities =
      session?.context.deliveryCapabilities ?? message.deliveryCapabilities;
    root.removeAttribute('data-state');
    root.textContent = '';

    const initialWorkspace = initialWorkspaceFromDocumentIntent(session?.documentIntent);
    await mountLocalAuthoringFrame({
      root,
      baseDocument,
      ...(initialWorkspace ? { initialWorkspace } : {}),
      frameMode: 'panel',
      sessionId: message.sessionId,
      peerWindow: window.parent,
      allowedOrigins: [parentOrigin],
      targetOrigin: parentOrigin,
      services,
      ...(deliveryCapabilities ? { deliveryCapabilities } : {}),
    });
    mounted = true;
    window.__lodariqEditorMounted = true;
    hostedEditorSession = null;
  } catch {
    directAuthoringHostServices?.stop();
    directAuthoringHostServices = null;
    if (previousRootState === null) {
      root.removeAttribute('data-state');
    } else {
      root.setAttribute('data-state', previousRootState);
    }
    root.textContent = previousRootText;
  } finally {
    mounting = false;
  }
}

function createHostedEditorServices(
  hostedSession: HostedEditorSession | null,
  baseDocument: LodariqDocument,
  directHostServices?: DirectAuthoringHostFrameServices,
  directTheme?: BrandThemeSnapshot,
): LocalAuthoringFrameServices {
  const initialDocument = structuredClone(baseDocument);
  let currentDocument = structuredClone(initialDocument);
  let currentTheme = structuredClone(
    hostedSession?.theme ?? directTheme ?? LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  );
  let currentDraftRevision = 0;
  let currentDocumentUpdatedAt = hostedSession?.documentUpdatedAt ?? '';
  let currentAuthoringResources: AuthoringResourceLibraryValue = structuredClone(
    hostedSession?.resources ?? { recipes: [], checkpoints: [], assets: [] },
  );
  const canReadReleaseState = Boolean(
    hostedSession?.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE),
  );
  const canReadReleaseRecovery = hostedSession
    ? hostedSession.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE)
    : Boolean(directHostServices?.getReleaseRecoveryState);
  const canRollbackRelease = hostedSession
    ? hostedSession.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE)
    : Boolean(directHostServices?.recoverRelease);
  const canUnpublishRelease = hostedSession
    ? hostedSession.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE)
    : Boolean(directHostServices?.recoverRelease);
  const canPublishToStaging = Boolean(
    hostedSession?.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING),
  );
  const canSampleProductStyle = hostedSession
    ? hostedSession.context.capabilities.includes(
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
      )
    : Boolean(directHostServices?.sampleProductStyle && directHostServices.saveStyleSource);
  const canCheckBrandDrift = hostedSession
    ? hostedSession.context.capabilities.includes(
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
      )
    : Boolean(directHostServices?.checkBrandDrift);
  const canAcknowledgeBrandTheme = hostedSession
    ? hostedSession.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT)
    : Boolean(directHostServices?.acknowledgeBrandTheme);
  const canVerifyStaging = hostedSession
    ? hostedSession.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING)
    : Boolean(
        directHostServices?.verifyBrowserPublication &&
        directHostServices.submitStagingVerification,
      );
  const canPromoteProduction = hostedSession
    ? hostedSession.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION)
    : Boolean(directHostServices?.promoteProduction);
  const canApproveProduction = hostedSession
    ? hostedSession.context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION)
    : Boolean(directHostServices?.approveProduction);
  const releaseStateSource = hostedSession
    ? () => loadHostedReleaseState(hostedSession.apiOrigin, hostedSession.context)
    : directHostServices?.getReleaseState;
  const loadReleaseState = releaseStateSource
    ? createCoalescedReleaseStateLoader(releaseStateSource)
    : undefined;
  const loadReleaseRecoveryState = hostedSession
    ? (environmentId: string) =>
        loadHostedReleaseRecoveryState(
          hostedSession.apiOrigin,
          hostedSession.context,
          environmentId,
        )
    : directHostServices?.getReleaseRecoveryState;
  const recoverRelease = hostedSession
    ? (environmentId: string, request: ReleaseRecoveryRequest) => {
        const allowed = request.action === 'rollback' ? canRollbackRelease : canUnpublishRelease;
        return allowed
          ? recoverHostedRelease(
              hostedSession.apiOrigin,
              hostedSession.context,
              environmentId,
              request,
            )
          : Promise.resolve(releaseRecoveryCapabilityDenied(request.action));
      }
    : directHostServices?.recoverRelease;
  const saveStyleSource:
    ((proposal: ProductStyleProposal) => Promise<AuthoringProductMatchApplyResult>) | undefined =
    hostedSession
      ? (proposal: ProductStyleProposal) =>
          saveHostedStyleSource(
            hostedSession.apiOrigin,
            hostedSession.context,
            currentTheme.themeId,
            proposal,
          )
      : (directHostServices?.saveStyleSource as
          | ((proposal: ProductStyleProposal) => Promise<AuthoringProductMatchApplyResult>)
          | undefined);
  const submitVerification = hostedSession
    ? (request: AuthoringStagingVerificationRequest) =>
        submitHostedStagingVerification(hostedSession.apiOrigin, hostedSession.context, request)
    : directHostServices?.submitStagingVerification;
  const promoteProduction = hostedSession
    ? (request: ProductionPromotionRequest) =>
        promoteHostedProduction(hostedSession.apiOrigin, hostedSession.context, request)
    : directHostServices?.promoteProduction;
  const approveProduction = hostedSession
    ? (operationId: string, decision: 'approved' | 'rejected', reason?: string) =>
        approveHostedProduction(
          hostedSession.apiOrigin,
          hostedSession.context,
          operationId,
          decision,
          reason,
        )
    : directHostServices?.approveProduction;
  const promotionGuards = new Map<
    string,
    Pick<ProductionPromotionRequest, 'idempotencyKey' | 'correlationId'>
  >();
  return {
    loadDocument: (documentId) =>
      currentDocument.id === documentId ? structuredClone(currentDocument) : null,
    saveDocument: (document) => {
      currentDocument = structuredClone(document);
    },
    loadStepStyleRecipes: () => structuredClone(currentAuthoringResources.recipes),
    loadDraftCheckpoints: () => structuredClone(currentAuthoringResources.checkpoints),
    loadMediaAssets: () => structuredClone(currentAuthoringResources.assets),
    ...(hostedSession
      ? {
          saveAuthoringResources: async (recipes, checkpoints) => {
            currentAuthoringResources = await saveHostedAuthoringResources(
              hostedSession.apiOrigin,
              {
                recipes: [...recipes].map((recipe) => structuredClone(recipe)),
                checkpoints: [...checkpoints].map((checkpoint) => structuredClone(checkpoint)),
              },
            );
          },
          uploadMediaAsset: async (
            kind: AuthoringMediaAssetKind,
            file: File,
            options: { onProgress?: (progress: number) => void; savedToLibrary: boolean },
          ) => {
            const asset = await uploadHostedMediaAsset(
              hostedSession.apiOrigin,
              kind,
              file,
              options,
            );
            currentAuthoringResources = {
              ...currentAuthoringResources,
              assets: [
                asset,
                ...currentAuthoringResources.assets.filter(
                  (candidate) => candidate.id !== asset.id,
                ),
              ],
            };
            return asset;
          },
          loadMediaAssetPreview: (asset: AuthoringMediaAssetResourceValue) =>
            loadHostedMediaAssetPreview(hostedSession.apiOrigin, asset),
          ...(hostedSession.context.translation?.state === 'available'
            ? {
                translateDocument: (
                  request: Parameters<
                    NonNullable<LocalAuthoringFrameServices['translateDocument']>
                  >[0],
                ) =>
                  translateHostedDocument(
                    hostedSession.apiOrigin,
                    hostedSession.context,
                    request.document,
                    request.targetLocale,
                  ),
              }
            : {}),
          persistDocument: async (document: LodariqDocument) => {
            const persisted = await persistHostedDocument(
              hostedSession.apiOrigin,
              hostedSession.context,
              document,
              currentDocumentUpdatedAt,
            );
            currentDocument = structuredClone(persisted.document);
            currentTheme = structuredClone(persisted.theme);
            currentDocumentUpdatedAt = persisted.documentUpdatedAt;
          },
        }
      : {}),
    ...(hostedSession && canReadReleaseState && loadReleaseState
      ? {
          getReleaseState: loadReleaseState,
        }
      : {}),
    ...(hostedSession && canPublishToStaging
      ? {
          publishToStaging: (request: AuthoringStagingPublicationRequest) =>
            publishHostedTourToStaging(hostedSession.apiOrigin, hostedSession.context, request),
        }
      : {}),
    ...(canReadReleaseRecovery && loadReleaseRecoveryState
      ? { getReleaseRecoveryState: loadReleaseRecoveryState }
      : {}),
    ...((canRollbackRelease || canUnpublishRelease) && recoverRelease ? { recoverRelease } : {}),
    getBrandWorkflowState: async () => brandWorkspaceStateFromTheme(currentTheme),
    ...(canSampleProductStyle && directHostServices?.sampleProductStyle
      ? {
          sampleBrandStyle: async (request) => {
            const proposal = await directHostServices.sampleProductStyle!({
              scope:
                request.strategy === 'current-target' && request.targetId
                  ? 'selected-target'
                  : 'page',
              ...(request.targetId ? { targetId: request.targetId } : {}),
            });
            return brandMatchProposalForFrame(proposal, currentTheme);
          },
        }
      : {}),
    ...(canSampleProductStyle
      ? {
          prepareBrandMatchProposal: (proposal: ProductStyleProposal) =>
            brandMatchProposalForFrame(proposal, currentTheme),
        }
      : {}),
    ...(canCheckBrandDrift
      ? {
          checkBrandDrift: (request: BrandDriftCheckRequest) => {
            if (hostedSession) {
              return checkHostedBrandDrift(
                hostedSession.apiOrigin,
                hostedSession.context,
                currentTheme,
                request,
              );
            }
            if (!directHostServices?.checkBrandDrift) {
              throw new Error(authoringText('Brand drift checking is unavailable'));
            }
            return directHostServices.checkBrandDrift(request);
          },
        }
      : {}),
    ...(canAcknowledgeBrandTheme
      ? {
          acknowledgeBrandTheme: async (request: AuthoringBrandThemeAcknowledgementRequest) => {
            let acknowledgement: AuthoringBrandThemeAcknowledgementResult;
            if (hostedSession) {
              acknowledgement = await acknowledgeHostedBrandTheme(
                hostedSession.apiOrigin,
                hostedSession.context,
                currentTheme,
                request,
              );
              hostedSession.context = {
                ...hostedSession.context,
                themeVersionId: acknowledgement.theme.themeVersionId,
              };
              if (activeHostedSession?.context.sessionId === hostedSession.context.sessionId) {
                activeHostedSession = {
                  ...activeHostedSession,
                  context: hostedSession.context,
                };
              }
            } else {
              const acknowledge = directHostServices?.acknowledgeBrandTheme;
              if (!acknowledge) {
                throw new Error(authoringText('Brand acknowledgement is unavailable'));
              }
              acknowledgement = await acknowledge(request);
            }
            currentDocument = structuredClone(acknowledgement.document);
            currentTheme = structuredClone(acknowledgement.theme);
            return structuredClone(acknowledgement);
          },
        }
      : {}),
    ...(canSampleProductStyle && saveStyleSource
      ? {
          applyBrandMatch: async (proposal) => {
            const persisted = await saveStyleSource(structuredClone(proposal.evidence));
            return {
              brand: brandWorkspaceStateFromTheme(persisted.previewTheme, proposal.evidence),
              savedAs: persisted.draftChanged ? ('draft' as const) : ('unchanged' as const),
              persisted,
            };
          },
          adoptBrandPreviewTheme: (persisted: AuthoringProductMatchApplyResult) => {
            if (persisted.previewTheme.themeId !== currentTheme.themeId) return false;
            if (persisted.draftRevision < currentDraftRevision) return false;
            if (
              persisted.draftRevision === currentDraftRevision &&
              currentDraftRevision > 0 &&
              persisted.previewTheme.contentHash !== currentTheme.contentHash
            ) {
              return false;
            }
            currentDraftRevision = persisted.draftRevision;
            currentTheme = structuredClone(persisted.previewTheme);
            return true;
          },
        }
      : {}),
    ...(loadReleaseState
      ? {
          getReleaseWorkflowState: async () =>
            releaseWorkflowFromState(await loadReleaseState(), {
              canVerify: canVerifyStaging,
              canPromote: canPromoteProduction,
              canApprove: canApproveProduction,
            }),
        }
      : {}),
    ...(canVerifyStaging &&
    loadReleaseState &&
    directHostServices?.verifyBrowserPublication &&
    submitVerification
      ? {
          verifyStagingRelease: async (request) => {
            const state = await loadReleaseState();
            const staging = requireCurrentStagingArtifact(
              state,
              request.artifactId,
              request.contentHash,
              request.publicationId,
            );
            const report = await directHostServices.verifyBrowserPublication!(
              staging.publicationId,
              staging.contentHash,
            );
            const result = await submitVerification({
              publicationId: staging.publicationId,
              report,
            });
            if (!result.ok) throw new Error(result.message);
            return { verification: verificationForFrame(result.verification) };
          },
        }
      : {}),
    ...(canPromoteProduction && loadReleaseState && promoteProduction
      ? {
          promoteExactArtifact: async (request) => {
            const state = await loadReleaseState();
            const promotionRequest = createExactPromotionRequest(state, request, promotionGuards);
            const result = await promoteProduction(promotionRequest);
            if (!result.ok || result.state !== 'completed') {
              throw new Error(
                result.ok
                  ? authoringText('Production approval is still required.')
                  : result.message,
              );
            }
            if (
              result.compiledArtifactId !== request.artifactId ||
              result.contentHash !== request.contentHash
            ) {
              throw new Error(
                authoringText('Production did not receive the exact staged artifact.'),
              );
            }
            return {
              production: productionArtifactForFrame(
                result,
                promotionRequest.productionEnvironmentId,
              ),
              replayed: result.replayed,
            };
          },
          requestPromotionApproval: async (request) => {
            const state = await loadReleaseState();
            const promotionRequest = createExactPromotionRequest(state, request, promotionGuards);
            const result = await promoteProduction(promotionRequest);
            if (!result.ok) throw new Error(result.message);
            if (
              result.state === 'completed' &&
              (result.compiledArtifactId !== request.artifactId ||
                result.contentHash !== request.contentHash)
            ) {
              throw new Error(
                authoringText('Production did not receive the exact staged artifact.'),
              );
            }
            return {
              approval:
                result.state === 'completed' ? ('approved' as const) : ('requested' as const),
              operationId: result.releaseOperationId,
            };
          },
        }
      : {}),
    ...(canApproveProduction && loadReleaseState && approveProduction
      ? {
          approveAndPromoteExactArtifact: async (request: AuthoringProductionApprovalRequest) => {
            const state = await loadReleaseState();
            requireCurrentStagingArtifact(
              state,
              request.artifactId,
              request.contentHash,
              request.sourcePublicationId,
            );
            requirePendingApproval(state, request.operationId);
            const production = requireCurrentProductionTarget(state, request);
            const result = await approveProduction(request.operationId, 'approved');
            const approval = result.approval;
            const promoted = result.promotion;
            if (
              approval.workspaceId !== currentDocument.workspaceId ||
              approval.releaseOperationId !== request.operationId ||
              approval.decision !== 'approved' ||
              !promoted.ok ||
              promoted.state !== 'completed' ||
              promoted.releaseOperationId !== request.operationId ||
              promoted.compiledArtifactId !== request.artifactId ||
              promoted.contentHash !== request.contentHash
            ) {
              throw new Error(
                authoringText('Production approval did not preserve the exact staged artifact.'),
              );
            }
            return {
              production: productionArtifactForFrame(promoted, production.environmentId),
              replayed: promoted.replayed,
            };
          },
        }
      : {}),
    ...(hostedSession && !canReadReleaseState
      ? { releaseUnavailableReason: 'not-authorized' as const }
      : {}),
    ...(!hostedSession && directHostServices
      ? {
          ...directHostServices,
          persistDocumentOnSaveRequest: false,
        }
      : {}),
    ...(!hostedSession && !directHostServices
      ? { releaseUnavailableReason: 'not-authorized' as const }
      : {}),
    exportDocument: (document) => JSON.stringify(document, null, 2),
    importDocument: (json) => {
      const parsed = JSON.parse(json) as unknown;
      const result = validate(LodariqDocument, parsed);
      if (!result.valid) {
        throw new Error(authoringText('Imported document is not valid Lodariq block JSON'));
      }
      return result.value;
    },
    resetDocuments: () => {
      currentDocument = structuredClone(initialDocument);
    },
    compilePreview: (document) =>
      compileDocument({
        document,
        theme: currentTheme,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }),
    recordMetric: () => {},
    getMetricsSummary: () => ({}),
    exportMetricsReport: () => JSON.stringify({ sessions: [] }),
  };
}

function createCoalescedReleaseStateLoader(
  load: () => Promise<AuthoringStagingReleaseState>,
): () => Promise<AuthoringStagingReleaseState> {
  let pending: Promise<AuthoringStagingReleaseState> | null = null;
  return async () => {
    const request = pending ?? load();
    pending = request;
    try {
      return structuredClone(await request);
    } finally {
      if (pending === request) pending = null;
    }
  };
}

function announceEditorReady(): void {
  if (!readyChallenge || !trustedParentOrigin) {
    root.setAttribute('data-state', 'error');
    root.textContent = authoringText('Lodariq authoring could not start.');
    return;
  }
  postHostedMessage({
    protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
    type: HOSTED_AUTHORING_EDITOR_READY_TYPE,
    readyRequestId: readyChallenge.readyRequestId,
    state: readyChallenge.state,
    editorOrigin: LODARIQ_EDITOR_ORIGIN,
  });
}

function postHostedMessage(message: HostedAuthoringPreSessionMessageType): void {
  if (!trustedParentOrigin) return;
  const result = validate(HostedAuthoringPreSessionMessage, message);
  if (!result.valid) return;
  window.parent.postMessage(result.value, trustedParentOrigin);
}

function sessionContextMatchesHandoff(
  context: AuthoringSessionContext,
  handoff: HostedAuthoringActivationHandoffMessageType,
  documentIntent: AuthoringDocumentIntent,
): boolean {
  if (
    context.customerOrigin !== handoff.customerOrigin ||
    context.editorOrigin !== LODARIQ_EDITOR_ORIGIN
  ) {
    return false;
  }
  if (documentIntent.kind === 'existing') {
    return context.documentId === documentIntent.documentId;
  }
  return true;
}

function hasRequiredEditorCapabilities(context: AuthoringSessionContext): boolean {
  return (
    context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT) &&
    context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT) &&
    context.capabilities.includes(AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT)
  );
}

function initMatchesHostedSession(
  message: AuthoringInitMessage,
  session: HostedEditorSession,
): boolean {
  const context = session.context;
  return (
    message.sessionId === context.sessionId &&
    message.documentId === context.documentId &&
    message.workspaceId === context.workspaceId &&
    message.environment === context.environment &&
    documentMatchesSession(message.document, context)
  );
}

function documentMatchesSession(
  document: LodariqDocument,
  context: AuthoringSessionContext,
): boolean {
  return document.id === context.documentId && document.workspaceId === context.workspaceId;
}

function themeMatchesSession(theme: BrandThemeSnapshot, context: AuthoringSessionContext): boolean {
  return (
    theme.contractVersion === context.themeContractVersion &&
    theme.themeVersionId === context.themeVersionId
  );
}

function requireHostedApiClient(apiOrigin: string): HostedAuthoringApiClient {
  if (!hostedApiClient || !hostedApiClient.matchesOrigin(apiOrigin)) {
    throw new HostedEditorFailure('origin-mismatch', false);
  }
  return hostedApiClient;
}

function sessionResponseFailure(status: number): HostedEditorFailure {
  if (status === 409) return new HostedEditorFailure('activation-replayed', false);
  if (status === 410) return new HostedEditorFailure('activation-expired', false);
  if (status === 401 || status === 403) {
    return new HostedEditorFailure('activation-invalid', false);
  }
  return new HostedEditorFailure('session-unavailable', status >= 500);
}

function normalizeHostedEditorFailure(error: unknown): HostedEditorFailure {
  return error instanceof HostedEditorFailure
    ? error
    : new HostedEditorFailure('protocol-error', false);
}

function isFutureTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function createReadyChallenge(): HostedReadyChallenge | null {
  try {
    return {
      readyRequestId: `ready_${randomHex(16)}`,
      state: randomHex(32),
    };
  } catch {
    return null;
  }
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function readTrustedParentOrigin(): string | null {
  const candidate = document.referrer.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin === 'null' ? null : url.origin;
  } catch {
    return null;
  }
}

function stopListening(): void {
  window.removeEventListener('message', handleParentMessage);
  directAuthoringHostServices?.stop();
  directAuthoringHostServices = null;
  const handoff = hostedActivationHandoff;
  const activeSession = activeHostedSession;
  if (activeSession && hostedAuthoringSessionToken) {
    void revokeHostedSession(activeSession.apiOrigin, activeSession.context, true);
  } else if (handoff?.activationGrant) {
    void revokeHostedActivation(handoff, true);
  }
  hostedAuthoringSessionToken = null;
  hostedApiClient?.dispose();
  hostedApiClient = null;
  hostedEditorSession = null;
  activeHostedSession = null;
}

function getAuthoringRoot(): HTMLElement {
  const element = document.getElementById('authoring');
  if (!element) throw new Error('#authoring not found');
  return element;
}

declare global {
  interface Window {
    __lodariqEditorMounted?: boolean;
  }
}

window.__lodariqEditorMounted = mounted;
