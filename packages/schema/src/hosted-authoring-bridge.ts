import { Type, type Static } from '@sinclair/typebox';
import { BrandThemeSnapshot } from './brand';
import { LodariqDocument } from './document';
import {
  AuthoringDocumentIntent,
  AuthoringPageContext,
  AuthoringSessionContext,
  LODARIQ_API_ORIGIN,
  LODARIQ_EDITOR_ORIGIN,
  LODARIQ_STAGING_API_ORIGIN,
  LODARIQ_STAGING_EDITOR_ORIGIN,
  PublicSdkInstallationId,
} from './sdk';

/**
 * Pre-session customer-page host <-> hosted editor protocol.
 *
 * The editor generates the ready request and state. The host must accept an
 * editor-ready tuple once and echo it in one activation handoff to the exact
 * editor window/origin. The editor then owns the resulting session bearer in
 * memory and returns only non-secret context, the canonical document, and its
 * approved semantic theme snapshot.
 */
export const HOSTED_AUTHORING_BRIDGE_PROTOCOL = 'lodariq.hosted-authoring.v1' as const;
export const HOSTED_AUTHORING_EDITOR_READY_TYPE = 'hosted-authoring.editor.ready' as const;
export const HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE =
  'hosted-authoring.activation.handoff' as const;
export const HOSTED_AUTHORING_SESSION_READY_TYPE = 'hosted-authoring.session.ready' as const;
export const HOSTED_AUTHORING_SESSION_FAILED_TYPE = 'hosted-authoring.session.failed' as const;
export const HOSTED_AUTHORING_BROWSE_READY_TYPE = 'hosted-authoring.browse.ready' as const;
export const HOSTED_AUTHORING_BROWSE_CLOSE_REQUEST_TYPE =
  'hosted-authoring.browse.close.request' as const;
export const HOSTED_AUTHORING_BROWSE_CLOSE_RESULT_TYPE =
  'hosted-authoring.browse.close.result' as const;
export const HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE =
  'hosted-authoring.session.close.request' as const;
export const HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE =
  'hosted-authoring.session.close.result' as const;

const HOSTED_AUTHORING_REQUEST_ID_OPTIONS = {
  minLength: 1,
  maxLength: 256,
  pattern: '^[A-Za-z0-9._~-]+$',
} as const;
const HOSTED_AUTHORING_STATE_OPTIONS = {
  minLength: 32,
  maxLength: 256,
  pattern: '^[A-Za-z0-9._~-]+$',
} as const;
const HOSTED_AUTHORING_ACTIVATION_GRANT_OPTIONS = {
  minLength: 32,
  maxLength: 2_048,
} as const;
const EXACT_CUSTOMER_ORIGIN_OPTIONS = {
  minLength: 8,
  maxLength: 2_048,
  pattern: '^https?://[^\\s/?#@]+$',
} as const;

export const HostedAuthoringSessionFailureCode = Type.Union(
  [
    Type.Literal('activation-invalid'),
    Type.Literal('activation-expired'),
    Type.Literal('activation-replayed'),
    Type.Literal('origin-mismatch'),
    Type.Literal('session-unavailable'),
    Type.Literal('document-unavailable'),
    Type.Literal('protocol-error'),
  ],
  { $id: 'HostedAuthoringSessionFailureCode' },
);
export type HostedAuthoringSessionFailureCode = Static<typeof HostedAuthoringSessionFailureCode>;

/** Editor -> host challenge. Event source and origin still require exact runtime checks. */
export const HostedAuthoringEditorReadyMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_EDITOR_READY_TYPE),
    readyRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    state: Type.String(HOSTED_AUTHORING_STATE_OPTIONS),
    editorOrigin: Type.Union([
      Type.Literal(LODARIQ_EDITOR_ORIGIN),
      Type.Literal(LODARIQ_STAGING_EDITOR_ORIGIN),
    ]),
  },
  { $id: 'HostedAuthoringEditorReadyMessage', additionalProperties: false },
);
export type HostedAuthoringEditorReadyMessage = Static<typeof HostedAuthoringEditorReadyMessage>;

/**
 * Host -> editor single-use activation handoff.
 *
 * Implementations must consume the readyRequestId + handoffRequestId + state
 * tuple at most once and send this value only to the matching editor window at
 * LODARIQ_EDITOR_ORIGIN.
 */
export const HostedAuthoringActivationHandoffMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE),
    readyRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    handoffRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    state: Type.String(HOSTED_AUTHORING_STATE_OPTIONS),
    editorOrigin: Type.Union([
      Type.Literal(LODARIQ_EDITOR_ORIGIN),
      Type.Literal(LODARIQ_STAGING_EDITOR_ORIGIN),
    ]),
    apiOrigin: Type.Union([
      Type.Literal(LODARIQ_API_ORIGIN),
      Type.Literal(LODARIQ_STAGING_API_ORIGIN),
    ]),
    customerOrigin: Type.String(EXACT_CUSTOMER_ORIGIN_OPTIONS),
    installationId: Type.Ref(PublicSdkInstallationId),
    pageContext: AuthoringPageContext,
    documentIntent: Type.Optional(Type.Ref(AuthoringDocumentIntent)),
    activationGrant: Type.String(HOSTED_AUTHORING_ACTIVATION_GRANT_OPTIONS),
  },
  { $id: 'HostedAuthoringActivationHandoffMessage', additionalProperties: false },
);
export type HostedAuthoringActivationHandoffMessage = Static<
  typeof HostedAuthoringActivationHandoffMessage
>;

/**
 * Editor -> host successful completion. The editor retains the document-scoped
 * authoring-session bearer in iframe memory; this shape deliberately cannot
 * carry it across the bridge.
 */
export const HostedAuthoringSessionReadyMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_SESSION_READY_TYPE),
    readyRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    handoffRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    state: Type.String(HOSTED_AUTHORING_STATE_OPTIONS),
    context: Type.Ref(AuthoringSessionContext),
    document: Type.Ref(LodariqDocument),
    /** Exact approved snapshot used by browser preview and server compilation. */
    theme: Type.Ref(BrandThemeSnapshot),
  },
  { $id: 'HostedAuthoringSessionReadyMessage', additionalProperties: false },
);
export type HostedAuthoringSessionReadyMessage = Static<typeof HostedAuthoringSessionReadyMessage>;

/** Editor -> host deterministic, credential-free terminal failure. */
export const HostedAuthoringSessionFailedMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_SESSION_FAILED_TYPE),
    readyRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    handoffRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    state: Type.String(HOSTED_AUTHORING_STATE_OPTIONS),
    customerOrigin: Type.String(EXACT_CUSTOMER_ORIGIN_OPTIONS),
    code: Type.Ref(HostedAuthoringSessionFailureCode),
    retryable: Type.Boolean(),
  },
  { $id: 'HostedAuthoringSessionFailedMessage', additionalProperties: false },
);
export type HostedAuthoringSessionFailedMessage = Static<
  typeof HostedAuthoringSessionFailedMessage
>;

/** Editor -> host signal that the credential-owning iframe has rendered browse UI. */
export const HostedAuthoringBrowseReadyMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_BROWSE_READY_TYPE),
    readyRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    handoffRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    state: Type.String(HOSTED_AUTHORING_STATE_OPTIONS),
  },
  { $id: 'HostedAuthoringBrowseReadyMessage', additionalProperties: false },
);
export type HostedAuthoringBrowseReadyMessage = Static<typeof HostedAuthoringBrowseReadyMessage>;

/** Host -> editor request to revoke an unused activation grant before browse closes. */
export const HostedAuthoringBrowseCloseRequestMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_BROWSE_CLOSE_REQUEST_TYPE),
    requestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    readyRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    handoffRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    state: Type.String(HOSTED_AUTHORING_STATE_OPTIONS),
  },
  { $id: 'HostedAuthoringBrowseCloseRequestMessage', additionalProperties: false },
);
export type HostedAuthoringBrowseCloseRequestMessage = Static<
  typeof HostedAuthoringBrowseCloseRequestMessage
>;

/** Editor -> host completion for the best-effort pre-session revocation. */
export const HostedAuthoringBrowseCloseResultMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_BROWSE_CLOSE_RESULT_TYPE),
    requestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    readyRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    handoffRequestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    state: Type.String(HOSTED_AUTHORING_STATE_OPTIONS),
  },
  { $id: 'HostedAuthoringBrowseCloseResultMessage', additionalProperties: false },
);
export type HostedAuthoringBrowseCloseResultMessage = Static<
  typeof HostedAuthoringBrowseCloseResultMessage
>;

export const HostedAuthoringSessionCloseMode = Type.Union(
  [Type.Literal('discard'), Type.Literal('save-and-exit')],
  { $id: 'HostedAuthoringSessionCloseMode' },
);
export type HostedAuthoringSessionCloseMode = Static<typeof HostedAuthoringSessionCloseMode>;

/** Host -> editor request to revoke the in-memory document session. */
export const HostedAuthoringSessionCloseRequestMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE),
    requestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    sessionId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    documentId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    mode: HostedAuthoringSessionCloseMode,
  },
  { $id: 'HostedAuthoringSessionCloseRequestMessage', additionalProperties: false },
);
export type HostedAuthoringSessionCloseRequestMessage = Static<
  typeof HostedAuthoringSessionCloseRequestMessage
>;

/** Editor -> host credential-free session revocation result. */
export const HostedAuthoringSessionCloseResultMessage = Type.Object(
  {
    protocol: Type.Literal(HOSTED_AUTHORING_BRIDGE_PROTOCOL),
    type: Type.Literal(HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE),
    requestId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    sessionId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    documentId: Type.String(HOSTED_AUTHORING_REQUEST_ID_OPTIONS),
    ok: Type.Boolean(),
    retryable: Type.Boolean(),
  },
  { $id: 'HostedAuthoringSessionCloseResultMessage', additionalProperties: false },
);
export type HostedAuthoringSessionCloseResultMessage = Static<
  typeof HostedAuthoringSessionCloseResultMessage
>;

export const HostedAuthoringPreSessionMessage = Type.Union(
  [
    HostedAuthoringEditorReadyMessage,
    HostedAuthoringActivationHandoffMessage,
    HostedAuthoringBrowseReadyMessage,
    HostedAuthoringBrowseCloseRequestMessage,
    HostedAuthoringBrowseCloseResultMessage,
    HostedAuthoringSessionReadyMessage,
    HostedAuthoringSessionFailedMessage,
  ],
  { $id: 'HostedAuthoringPreSessionMessage' },
);
export type HostedAuthoringPreSessionMessage = Static<typeof HostedAuthoringPreSessionMessage>;

export const HostedAuthoringSessionLifecycleMessage = Type.Union(
  [HostedAuthoringSessionCloseRequestMessage, HostedAuthoringSessionCloseResultMessage],
  { $id: 'HostedAuthoringSessionLifecycleMessage' },
);
export type HostedAuthoringSessionLifecycleMessage = Static<
  typeof HostedAuthoringSessionLifecycleMessage
>;
