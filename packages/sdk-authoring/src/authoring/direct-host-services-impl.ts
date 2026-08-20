import {
  AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
  AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
  AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE,
  AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE,
  AUTHORING_PUBLISH_STAGING_RESULT_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
  AUTHORING_RELEASE_STATE_REQUEST_TYPE,
  AUTHORING_RELEASE_STATE_RESULT_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  STYLE_SAMPLE_CANCELED_TYPE,
  STYLE_SAMPLE_RESULT_TYPE,
  type AuthoringBrandDriftCheckResult,
  type AuthoringBrandThemeAcknowledgementRequest,
  type AuthoringBrandThemeAcknowledgementResult,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingReleaseState,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type AuthoringReleaseStateResultMessage,
  type BrowserVerificationReport,
  type BrandDriftCheckRequest,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type ReleaseRecoveryRequest,
  AUTHORING_OPERATIONS_REQUEST_TYPE,
  AUTHORING_OPERATIONS_RESULT_TYPE,
  type AuthoringOperationsResultMessage,
} from '@lodariq/schema';
import { createBridgeOperationsServices } from './operations/operations-bridge';
import {
  AuthoringBridge,
  RELEASE_RECOVERY_BRIDGE_MESSAGE_BYTE_LIMITS,
  createBridgeCorrelationId,
} from '../bridge/transport';
import type { LocalAuthoringFrameServices } from './local-frame-types';
import type { AuthoringStyleSourceSaveResult } from './index';
import type { DirectAuthoringHostServiceOptions } from './direct-host-service-types';
import {
  createDirectAuthoringOptionalPanelServices,
  type DirectAuthoringOptionalPanelServices,
} from './direct-host-optional-panel-services';

const DIRECT_HOST_REQUEST_TIMEOUT_MS = 5_000;
const DIRECT_OPTIONAL_PANEL_RESULT_TYPES = new Set<string>([
  AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_RESULT_TYPE,
  STYLE_SAMPLE_RESULT_TYPE,
  STYLE_SAMPLE_CANCELED_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
  AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE,
  AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE,
  AUTHORING_PUBLISH_STAGING_RESULT_TYPE,
  AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE,
  AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
]);

export interface DirectAuthoringHostFrameServices extends Required<
  Pick<LocalAuthoringFrameServices, 'getReleaseState' | 'persistDocument'>
> {
  /** §4.7 — always present: the host answers, or says the session cannot. */
  operations: LocalAuthoringFrameServices['operations'];
  publishToStaging?: LocalAuthoringFrameServices['publishToStaging'];
  getReleaseRecoveryState?: LocalAuthoringFrameServices['getReleaseRecoveryState'];
  recoverRelease?: LocalAuthoringFrameServices['recoverRelease'];
  sampleProductStyle?: (request: {
    scope: 'page' | 'selected-target';
    targetId?: string;
  }) => Promise<ProductStyleProposal>;
  saveStyleSource?: (proposal: ProductStyleProposal) => Promise<AuthoringStyleSourceSaveResult>;
  checkBrandDrift?: (request: BrandDriftCheckRequest) => Promise<AuthoringBrandDriftCheckResult>;
  acknowledgeBrandTheme?: (
    request: AuthoringBrandThemeAcknowledgementRequest,
  ) => Promise<AuthoringBrandThemeAcknowledgementResult>;
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

export function createDirectAuthoringHostServicesImplementation(
  options: DirectAuthoringHostServiceOptions,
): DirectAuthoringHostServiceHandle {
  const releaseStateRequests = new Map<string, PendingRequest<AuthoringStagingReleaseState>>();
  let optionalPanelServices: DirectAuthoringOptionalPanelServices | undefined;
  const operationsListeners = new Set<(message: AuthoringOperationsResultMessage) => void>();

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
      if (message.type === AUTHORING_OPERATIONS_RESULT_TYPE) {
        for (const listener of operationsListeners) listener(message);
        return;
      }
      if (isOptionalPanelResultMessage(message.type)) {
        optionalPanelServices?.receive(message);
      }
    },
    maxMessageBytesByType: RELEASE_RECOVERY_BRIDGE_MESSAGE_BYTE_LIMITS,
  });
  bridge.start();
  if (hasOptionalPanelServices(options)) {
    optionalPanelServices = createDirectAuthoringOptionalPanelServices(bridge, options);
  }

  // The frame's Operations calls become bridge requests; the host owns the URL
  // and the bearer, and answers with normalized data.
  const operations = createBridgeOperationsServices({
    send: (requestId, method, args) => {
      bridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: options.sessionId,
        documentId: options.documentId,
        correlationId: createBridgeCorrelationId('authoring_operations_request'),
        type: AUTHORING_OPERATIONS_REQUEST_TYPE,
        requestId,
        method,
        ...(args.length ? { args: [...args] } : {}),
      });
    },
    subscribe: (listener) => {
      operationsListeners.add(listener);
      return () => operationsListeners.delete(listener);
    },
  });

  return {
    services: {
      operations,
      persistDocument: (document) => persistDocument(bridge, options, document),
      getReleaseState: () => requestReleaseState(bridge, options, releaseStateRequests),
      ...(options.readReleaseRecovery
        ? {
            getReleaseRecoveryState: (environmentId: string) =>
              optionalPanelServices!.getReleaseRecoveryState(environmentId),
          }
        : {}),
      ...(options.rollbackRelease || options.unpublishRelease
        ? {
            recoverRelease: (environmentId: string, request: ReleaseRecoveryRequest) =>
              optionalPanelServices!.recoverRelease(environmentId, request),
          }
        : {}),
      ...(options.publishToStaging
        ? {
            publishToStaging: (request: AuthoringStagingPublicationRequest) =>
              optionalPanelServices!.publishToStaging(request),
          }
        : {}),
      ...(options.sampleProductStyle
        ? {
            sampleProductStyle: (request: {
              scope: 'page' | 'selected-target';
              targetId?: string;
            }) => optionalPanelServices!.sampleProductStyle(request),
          }
        : {}),
      ...(options.saveStyleSource
        ? {
            saveStyleSource: (proposal: ProductStyleProposal) =>
              optionalPanelServices!.saveStyleSource(proposal),
          }
        : {}),
      ...(options.checkBrandDrift
        ? {
            checkBrandDrift: (request: BrandDriftCheckRequest) =>
              optionalPanelServices!.checkBrandDrift(request),
          }
        : {}),
      ...(options.acknowledgeBrandTheme
        ? {
            acknowledgeBrandTheme: (request: AuthoringBrandThemeAcknowledgementRequest) =>
              optionalPanelServices!.acknowledgeBrandTheme(request),
          }
        : {}),
      ...(options.verifyBrowserPublication
        ? {
            verifyBrowserPublication: (publicationId: string, expectedContentHash: string) =>
              optionalPanelServices!.verifyBrowserPublication(publicationId, expectedContentHash),
          }
        : {}),
      ...(options.submitStagingVerification
        ? {
            submitStagingVerification: (request: AuthoringStagingVerificationRequest) =>
              optionalPanelServices!.submitStagingVerification(request),
          }
        : {}),
      ...(options.promoteProduction
        ? {
            promoteProduction: (request: ProductionPromotionRequest) =>
              optionalPanelServices!.promoteProduction(request),
          }
        : {}),
      ...(options.approveProduction
        ? {
            approveProduction: (
              operationId: string,
              decision: 'approved' | 'rejected',
              reason?: string,
            ) => optionalPanelServices!.approveProduction(operationId, decision, reason),
          }
        : {}),
    },
    stop: () => {
      bridge.stop();
      optionalPanelServices?.stop();
      rejectPendingRequests(releaseStateRequests);
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

function isOptionalPanelResultMessage(type: string): boolean {
  return DIRECT_OPTIONAL_PANEL_RESULT_TYPES.has(type);
}

function hasOptionalPanelServices(options: DirectAuthoringHostServiceOptions): boolean {
  return Boolean(
    options.readReleaseRecovery ||
    options.rollbackRelease ||
    options.unpublishRelease ||
    options.sampleProductStyle ||
    options.saveStyleSource ||
    options.checkBrandDrift ||
    options.acknowledgeBrandTheme ||
    options.publishToStaging ||
    options.verifyBrowserPublication ||
    options.submitStagingVerification ||
    options.promoteProduction ||
    options.approveProduction,
  );
}
