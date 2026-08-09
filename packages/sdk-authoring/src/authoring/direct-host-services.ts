import {
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
  BRIDGE_PROTOCOL_VERSION,
  STYLE_SAMPLE_CANCELED_TYPE,
  STYLE_SAMPLE_RESULT_TYPE,
  STYLE_SAMPLE_START_TYPE,
  type AuthoringApproveProductionResultMessage,
  type AuthoringBrowserVerifyResultMessage,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingReleaseState,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type AuthoringPublishStagingResultMessage,
  type AuthoringPromoteProductionResultMessage,
  type AuthoringReleaseStateResultMessage,
  type AuthoringStyleSourceSaveResultMessage,
  type AuthoringSubmitVerificationResultMessage,
  type BrowserVerificationReport,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type StyleSampleCanceledMessage,
  type StyleSampleResultMessage,
} from '@lodariq/schema';
import { AuthoringBridge, createBridgeCorrelationId } from '../bridge/transport';
import type { LocalAuthoringFrameServices } from './local-frame-types';

const DIRECT_HOST_REQUEST_TIMEOUT_MS = 5_000;
const DIRECT_HOST_BROWSER_VERIFICATION_TIMEOUT_MS = 30_000;
const DIRECT_HOST_STYLE_SELECTION_TIMEOUT_MS = 5 * 60_000;

export interface DirectAuthoringHostServiceOptions {
  peerWindow: Window;
  allowedOrigins: string[];
  targetOrigin: string;
  sessionId: string;
  documentId: string;
  publishToStaging: boolean;
  sampleProductStyle?: boolean;
  saveStyleSource?: boolean;
  verifyBrowserPublication?: boolean;
  submitStagingVerification?: boolean;
  promoteProduction?: boolean;
  approveProduction?: boolean;
}

export interface DirectAuthoringHostFrameServices extends Required<
  Pick<LocalAuthoringFrameServices, 'getReleaseState' | 'persistDocument'>
> {
  publishToStaging?: LocalAuthoringFrameServices['publishToStaging'];
  sampleProductStyle?: (request: {
    scope: 'page' | 'selected-target';
    targetId?: string;
  }) => Promise<ProductStyleProposal>;
  saveStyleSource?: (
    proposal: ProductStyleProposal,
  ) => Promise<{ sourceId: string; sourceHash: string }>;
  verifyBrowserPublication?: (
    publicationId: string,
    expectedContentHash: string,
  ) => Promise<BrowserVerificationReport>;
  submitStagingVerification?: (
    request: AuthoringStagingVerificationRequest,
  ) => Promise<AuthoringStagingVerificationResult>;
  promoteProduction?: (request: ProductionPromotionRequest) => Promise<ProductionPromotionResult>;
  approveProduction?: (
    operationId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) => Promise<{
    approval: ReleaseApproval;
    promotion: ProductionPromotionResult;
  }>;
}

export interface DirectAuthoringHostServiceHandle {
  services: DirectAuthoringHostFrameServices;
  stop: () => void;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createDirectAuthoringHostServices(
  options: DirectAuthoringHostServiceOptions,
): DirectAuthoringHostServiceHandle {
  const releaseStateRequests = new Map<string, PendingRequest<AuthoringStagingReleaseState>>();
  const publicationRequests = new Map<string, PendingRequest<AuthoringStagingPublicationResult>>();
  const styleSampleRequests = new Map<string, PendingRequest<ProductStyleProposal>>();
  const styleSourceRequests = new Map<
    string,
    PendingRequest<{ sourceId: string; sourceHash: string }>
  >();
  const browserVerificationRequests = new Map<string, PendingRequest<BrowserVerificationReport>>();
  const verificationSubmissionRequests = new Map<
    string,
    PendingRequest<AuthoringStagingVerificationResult>
  >();
  const promotionRequests = new Map<string, PendingRequest<ProductionPromotionResult>>();
  const approvalRequests = new Map<
    string,
    PendingRequest<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }>
  >();

  const bridge = new AuthoringBridge(options.peerWindow, {
    allowedOrigins: options.allowedOrigins,
    targetOrigin: options.targetOrigin,
    expectedSessionId: options.sessionId,
    expectedDocumentId: options.documentId,
    autoAck: false,
    onMessage: (message) => {
      if (message.type === AUTHORING_RELEASE_STATE_RESULT_TYPE) {
        settleReleaseStateRequest(releaseStateRequests, message);
        return;
      }
      if (message.type === AUTHORING_PUBLISH_STAGING_RESULT_TYPE) {
        settlePublicationRequest(publicationRequests, message);
        return;
      }
      if (message.type === STYLE_SAMPLE_RESULT_TYPE) {
        settleStyleSampleRequest(styleSampleRequests, message);
        return;
      }
      if (message.type === STYLE_SAMPLE_CANCELED_TYPE) {
        settleStyleSampleCanceledRequest(styleSampleRequests, message);
        return;
      }
      if (message.type === AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE) {
        settleStyleSourceRequest(styleSourceRequests, message);
        return;
      }
      if (message.type === AUTHORING_BROWSER_VERIFY_RESULT_TYPE) {
        settleBrowserVerificationRequest(browserVerificationRequests, message);
        return;
      }
      if (message.type === AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE) {
        settleVerificationSubmissionRequest(verificationSubmissionRequests, message);
        return;
      }
      if (message.type === AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE) {
        settlePromotionRequest(promotionRequests, message);
        return;
      }
      if (message.type === AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE) {
        settleApprovalRequest(approvalRequests, message);
      }
    },
  });
  bridge.start();

  return {
    services: {
      persistDocument: (document) => persistDocument(bridge, options, document),
      getReleaseState: () => requestReleaseState(bridge, options, releaseStateRequests),
      ...(options.publishToStaging
        ? {
            publishToStaging: (request: AuthoringStagingPublicationRequest) =>
              requestStagingPublication(bridge, options, publicationRequests, request),
          }
        : {}),
      ...(options.sampleProductStyle
        ? {
            sampleProductStyle: (request: {
              scope: 'page' | 'selected-target';
              targetId?: string;
            }) => requestProductStyleSample(bridge, options, styleSampleRequests, request),
          }
        : {}),
      ...(options.saveStyleSource
        ? {
            saveStyleSource: (proposal: ProductStyleProposal) =>
              requestStyleSourceSave(bridge, options, styleSourceRequests, proposal),
          }
        : {}),
      ...(options.verifyBrowserPublication
        ? {
            verifyBrowserPublication: (publicationId: string, expectedContentHash: string) =>
              requestBrowserVerification(
                bridge,
                options,
                browserVerificationRequests,
                publicationId,
                expectedContentHash,
              ),
          }
        : {}),
      ...(options.submitStagingVerification
        ? {
            submitStagingVerification: (request: AuthoringStagingVerificationRequest) =>
              requestVerificationSubmission(
                bridge,
                options,
                verificationSubmissionRequests,
                request,
              ),
          }
        : {}),
      ...(options.promoteProduction
        ? {
            promoteProduction: (request: ProductionPromotionRequest) =>
              requestProductionPromotion(bridge, options, promotionRequests, request),
          }
        : {}),
      ...(options.approveProduction
        ? {
            approveProduction: (
              operationId: string,
              decision: 'approved' | 'rejected',
              reason?: string,
            ) =>
              requestProductionApproval(
                bridge,
                options,
                approvalRequests,
                operationId,
                decision,
                reason,
              ),
          }
        : {}),
    },
    stop: () => {
      bridge.stop();
      rejectPendingRequests(releaseStateRequests);
      rejectPendingRequests(publicationRequests);
      rejectPendingRequests(styleSampleRequests);
      rejectPendingRequests(styleSourceRequests);
      rejectPendingRequests(browserVerificationRequests);
      rejectPendingRequests(verificationSubmissionRequests);
      rejectPendingRequests(promotionRequests);
      rejectPendingRequests(approvalRequests);
    },
  };
}

function persistDocument(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  document: LodariqDocument,
): Promise<void> {
  const correlationId = createBridgeCorrelationId('authoring_persist_document');
  return bridge.sendWithAck(
    {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: 'authoring.save.result',
      requestCorrelationId: correlationId,
      document: structuredClone(document),
    },
    { timeoutMs: DIRECT_HOST_REQUEST_TIMEOUT_MS },
  );
}

function requestReleaseState(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<AuthoringStagingReleaseState>>,
): Promise<AuthoringStagingReleaseState> {
  const correlationId = createBridgeCorrelationId('authoring_release_state_request');
  const pending = createPendingRequest<AuthoringStagingReleaseState>(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_RELEASE_STATE_REQUEST_TYPE,
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestStagingPublication(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<AuthoringStagingPublicationResult>>,
  request: AuthoringStagingPublicationRequest,
): Promise<AuthoringStagingPublicationResult> {
  const correlationId = createBridgeCorrelationId('authoring_publish_staging_request');
  const pending = createPendingRequest<AuthoringStagingPublicationResult>(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_PUBLISH_STAGING_REQUEST_TYPE,
      request: structuredClone(request),
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestProductStyleSample(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<ProductStyleProposal>>,
  request: { scope: 'page' | 'selected-target'; targetId?: string },
): Promise<ProductStyleProposal> {
  const correlationId = createBridgeCorrelationId('authoring_style_sample_request');
  const pending = createPendingRequest(
    correlationId,
    requests,
    DIRECT_HOST_STYLE_SELECTION_TIMEOUT_MS,
  );
  const normalizedRequest =
    request.scope === 'selected-target' && request.targetId
      ? { scope: 'selected-target' as const, targetId: request.targetId }
      : { scope: 'page' as const };
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: STYLE_SAMPLE_START_TYPE,
      request: normalizedRequest,
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestStyleSourceSave(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<{ sourceId: string; sourceHash: string }>>,
  proposal: ProductStyleProposal,
): Promise<{ sourceId: string; sourceHash: string }> {
  const correlationId = createBridgeCorrelationId('authoring_style_source_save_request');
  const pending = createPendingRequest(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE,
      proposal: structuredClone(proposal),
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestBrowserVerification(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<BrowserVerificationReport>>,
  publicationId: string,
  expectedContentHash: string,
): Promise<BrowserVerificationReport> {
  const correlationId = createBridgeCorrelationId('authoring_browser_verify_request');
  const pending = createPendingRequest(
    correlationId,
    requests,
    DIRECT_HOST_BROWSER_VERIFICATION_TIMEOUT_MS,
  );
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_BROWSER_VERIFY_REQUEST_TYPE,
      publicationId,
      expectedContentHash,
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestVerificationSubmission(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<AuthoringStagingVerificationResult>>,
  request: AuthoringStagingVerificationRequest,
): Promise<AuthoringStagingVerificationResult> {
  const correlationId = createBridgeCorrelationId('authoring_submit_verification_request');
  const pending = createPendingRequest(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE,
      request: structuredClone(request),
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestProductionPromotion(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<ProductionPromotionResult>>,
  request: ProductionPromotionRequest,
): Promise<ProductionPromotionResult> {
  const correlationId = createBridgeCorrelationId('authoring_promote_production_request');
  const pending = createPendingRequest(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE,
      request: structuredClone(request),
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestProductionApproval(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<
    string,
    PendingRequest<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }>
  >,
  operationId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }> {
  const correlationId = createBridgeCorrelationId('authoring_approve_production_request');
  const pending = createPendingRequest(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE,
      operationId,
      decision,
      ...(reason ? { reason } : {}),
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function createPendingRequest<T>(
  correlationId: string,
  requests: Map<string, PendingRequest<T>>,
  timeoutMs = DIRECT_HOST_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(correlationId);
      reject(new Error('Lodariq authoring host request timed out'));
    }, timeoutMs);
    requests.set(correlationId, { resolve, reject, timer });
  });
}

function settleReleaseStateRequest(
  requests: Map<string, PendingRequest<AuthoringStagingReleaseState>>,
  message: AuthoringReleaseStateResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve(structuredClone(message.result.releaseState));
    return;
  }
  pending.reject(new Error(message.result.message));
}

function settlePublicationRequest(
  requests: Map<string, PendingRequest<AuthoringStagingPublicationResult>>,
  message: AuthoringPublishStagingResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  pending.resolve(structuredClone(message.result));
}

function settleStyleSampleRequest(
  requests: Map<string, PendingRequest<ProductStyleProposal>>,
  message: StyleSampleResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve(structuredClone(message.result.proposal));
    return;
  }
  pending.reject(new Error(message.result.message));
}

function settleStyleSampleCanceledRequest(
  requests: Map<string, PendingRequest<ProductStyleProposal>>,
  message: StyleSampleCanceledMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  pending?.reject(new Error('Product style selection was canceled'));
}

function settleStyleSourceRequest(
  requests: Map<string, PendingRequest<{ sourceId: string; sourceHash: string }>>,
  message: AuthoringStyleSourceSaveResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve({
      sourceId: message.result.sourceId,
      sourceHash: message.result.sourceHash,
    });
    return;
  }
  pending.reject(new Error(message.result.message));
}

function settleBrowserVerificationRequest(
  requests: Map<string, PendingRequest<BrowserVerificationReport>>,
  message: AuthoringBrowserVerifyResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve(structuredClone(message.result.report));
    return;
  }
  pending.reject(new Error(message.result.message));
}

function settleVerificationSubmissionRequest(
  requests: Map<string, PendingRequest<AuthoringStagingVerificationResult>>,
  message: AuthoringSubmitVerificationResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  pending?.resolve(structuredClone(message.result));
}

function settlePromotionRequest(
  requests: Map<string, PendingRequest<ProductionPromotionResult>>,
  message: AuthoringPromoteProductionResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  pending?.resolve(structuredClone(message.result));
}

function settleApprovalRequest(
  requests: Map<
    string,
    PendingRequest<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }>
  >,
  message: AuthoringApproveProductionResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve({
      approval: structuredClone(message.result.approval),
      promotion: structuredClone(message.result.promotion),
    });
    return;
  }
  pending.reject(new Error(message.result.message));
}

function takePendingRequest<T>(
  correlationId: string,
  requests: Map<string, PendingRequest<T>>,
): PendingRequest<T> | null {
  const pending = requests.get(correlationId);
  if (!pending) return null;
  clearTimeout(pending.timer);
  requests.delete(correlationId);
  return pending;
}

function rejectRequest<T>(
  correlationId: string,
  requests: Map<string, PendingRequest<T>>,
  error: Error,
): void {
  const pending = takePendingRequest(correlationId, requests);
  pending?.reject(error);
}

function rejectPendingRequests<T>(requests: Map<string, PendingRequest<T>>): void {
  for (const [correlationId, pending] of requests) {
    clearTimeout(pending.timer);
    requests.delete(correlationId);
    pending.reject(new Error('Lodariq authoring host services stopped'));
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Lodariq authoring host request failed');
}
