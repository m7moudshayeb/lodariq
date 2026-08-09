import { describe, expect, it } from 'vitest';
import {
  AUTHORING_SESSION_CAPABILITIES,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE,
  HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  HOSTED_AUTHORING_BROWSE_READY_TYPE,
  HOSTED_AUTHORING_EDITOR_READY_TYPE,
  HOSTED_AUTHORING_SESSION_FAILED_TYPE,
  HOSTED_AUTHORING_SESSION_READY_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
  HostedAuthoringActivationHandoffMessage,
  HostedAuthoringEditorReadyMessage,
  HostedAuthoringBrowseReadyMessage,
  HostedAuthoringPreSessionMessage,
  HostedAuthoringSessionFailedMessage,
  HostedAuthoringSessionReadyMessage,
  HostedAuthoringSessionCloseRequestMessage,
  HostedAuthoringSessionCloseResultMessage,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LODARIQ_EDITOR_ORIGIN,
  RENDERER_CONTRACT_VERSION,
  validate,
} from '@lodariq/schema';
import tourDocument from '@lodariq/schema/fixtures/tour.linear.v1.json';

const READY_REQUEST_ID = 'editor_ready_123';
const HANDOFF_REQUEST_ID = 'activation_handoff_123';
const STATE = 'editor-state-'.padEnd(48, 's');
const CUSTOMER_ORIGIN = 'https://staging.customer.example';
const INSTALLATION_ID = 'ins_pub_application_1234';
const ACTIVATION_GRANT = 'activation-grant-'.padEnd(48, 'a');

const binding = {
  protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  readyRequestId: READY_REQUEST_ID,
  handoffRequestId: HANDOFF_REQUEST_ID,
  state: STATE,
};

const editorReady = {
  protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  type: HOSTED_AUTHORING_EDITOR_READY_TYPE,
  readyRequestId: READY_REQUEST_ID,
  state: STATE,
  editorOrigin: LODARIQ_EDITOR_ORIGIN,
};

const activationHandoff = {
  ...binding,
  type: HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE,
  editorOrigin: LODARIQ_EDITOR_ORIGIN,
  apiOrigin: 'https://api.lodariq.com',
  customerOrigin: CUSTOMER_ORIGIN,
  installationId: INSTALLATION_ID,
  pageContext: { pathname: '/products' },
  documentIntent: { kind: 'existing' as const, documentId: tourDocument.id },
  activationGrant: ACTIVATION_GRANT,
};

const sessionContext = {
  sessionId: 'authoring_session_123',
  correlationId: 'authoring_correlation_123',
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
  themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
  workspaceId: tourDocument.workspaceId,
  environmentId: 'environment_staging_123',
  environment: 'staging' as const,
  documentId: tourDocument.id,
  customerOrigin: CUSTOMER_ORIGIN,
  editorOrigin: LODARIQ_EDITOR_ORIGIN,
  creatorId: 'creator_123',
  capabilities: [
    AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
    AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
    AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT,
    AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET,
  ],
  expiresAt: '2026-08-07T12:05:00.000Z',
};

const sessionReady = {
  ...binding,
  type: HOSTED_AUTHORING_SESSION_READY_TYPE,
  context: sessionContext,
  document: tourDocument,
  theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
};

const sessionFailed = {
  ...binding,
  type: HOSTED_AUTHORING_SESSION_FAILED_TYPE,
  customerOrigin: CUSTOMER_ORIGIN,
  code: 'activation-replayed' as const,
  retryable: false,
};

describe('hosted authoring pre-session bridge', () => {
  it('accepts an exact-editor ready challenge and rejects loose envelopes', () => {
    expect(validate(HostedAuthoringEditorReadyMessage, editorReady).valid).toBe(true);
    expect(validate(HostedAuthoringPreSessionMessage, editorReady).valid).toBe(true);

    expect(
      validate(HostedAuthoringEditorReadyMessage, {
        ...editorReady,
        editorOrigin: 'https://app.lodariq.com',
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringEditorReadyMessage, { ...editorReady, state: 'short' }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringEditorReadyMessage, { ...editorReady, unexpected: true }).valid,
    ).toBe(false);
  });

  it('binds the one-time activation handoff to ready, handoff, state, and exact origins', () => {
    expect(validate(HostedAuthoringActivationHandoffMessage, activationHandoff).valid).toBe(true);
    expect(validate(HostedAuthoringPreSessionMessage, activationHandoff).valid).toBe(true);

    for (const customerOrigin of [
      'https://staging.customer.example/path',
      'https://staging.customer.example?environment=production',
      'https://user@staging.customer.example',
    ]) {
      expect(
        validate(HostedAuthoringActivationHandoffMessage, {
          ...activationHandoff,
          customerOrigin,
        }).valid,
      ).toBe(false);
    }

    expect(
      validate(HostedAuthoringActivationHandoffMessage, {
        ...activationHandoff,
        readyRequestId: '',
      }).valid,
    ).toBe(false);
    const browseHandoff = { ...activationHandoff };
    delete (browseHandoff as { documentIntent?: unknown }).documentIntent;
    expect(validate(HostedAuthoringActivationHandoffMessage, browseHandoff).valid).toBe(true);
    expect(
      validate(HostedAuthoringActivationHandoffMessage, {
        ...browseHandoff,
        pageContext: { pathname: '/products?secret=true' },
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringActivationHandoffMessage, {
        ...activationHandoff,
        documentIntent: {
          ...activationHandoff.documentIntent,
          environmentId: 'environment_other',
        },
      }).valid,
    ).toBe(false);
  });

  it('keeps browse-ready and session-close coordination credential-free', () => {
    const browseReady = {
      ...binding,
      type: HOSTED_AUTHORING_BROWSE_READY_TYPE,
    };
    expect(validate(HostedAuthoringBrowseReadyMessage, browseReady).valid).toBe(true);
    expect(validate(HostedAuthoringPreSessionMessage, browseReady).valid).toBe(true);

    const closeRequest = {
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
      requestId: 'close_request_123',
      sessionId: sessionContext.sessionId,
      documentId: sessionContext.documentId,
      mode: 'discard',
    };
    expect(validate(HostedAuthoringSessionCloseRequestMessage, closeRequest).valid).toBe(true);
    expect(
      validate(HostedAuthoringSessionCloseResultMessage, {
        ...closeRequest,
        type: HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
        ok: true,
        retryable: false,
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringSessionCloseResultMessage, {
        protocol: closeRequest.protocol,
        type: HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
        requestId: closeRequest.requestId,
        sessionId: closeRequest.sessionId,
        documentId: closeRequest.documentId,
        ok: true,
        retryable: false,
      }).valid,
    ).toBe(true);
  });

  it('returns canonical document context without allowing the session bearer across the bridge', () => {
    expect(validate(HostedAuthoringSessionReadyMessage, sessionReady).valid).toBe(true);
    expect(validate(HostedAuthoringPreSessionMessage, sessionReady).valid).toBe(true);

    expect(
      validate(HostedAuthoringSessionReadyMessage, {
        ...sessionReady,
        authoringSessionToken: 'authoring-session-'.padEnd(48, 's'),
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringSessionReadyMessage, {
        ...sessionReady,
        context: {
          ...sessionReady.context,
          authoringSessionToken: 'authoring-session-'.padEnd(48, 's'),
        },
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringSessionReadyMessage, {
        ...sessionReady,
        document: { ...tourDocument, rawHtml: '<script />' },
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringSessionReadyMessage, {
        ...sessionReady,
        theme: { ...LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1, css: '.tooltip { color: red }' },
      }).valid,
    ).toBe(false);
  });

  it('uses closed deterministic failure codes with the same one-use binding', () => {
    expect(validate(HostedAuthoringSessionFailedMessage, sessionFailed).valid).toBe(true);
    expect(validate(HostedAuthoringPreSessionMessage, sessionFailed).valid).toBe(true);

    expect(
      validate(HostedAuthoringSessionFailedMessage, {
        ...sessionFailed,
        code: 'server-error',
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringSessionFailedMessage, {
        ...sessionFailed,
        message: 'raw upstream error',
      }).valid,
    ).toBe(false);
    expect(
      validate(HostedAuthoringSessionFailedMessage, {
        ...sessionFailed,
        handoffRequestId: '',
      }).valid,
    ).toBe(false);
  });
});
