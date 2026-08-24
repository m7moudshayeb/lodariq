import {
  AUTHORING_APPROVE_PRODUCTION_REQUEST_TYPE,
  AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
  AUTHORING_BROWSER_VERIFY_REQUEST_TYPE,
  AUTHORING_BROWSER_VERIFY_RESULT_TYPE,
  AUTHORING_LOCALE_LAYOUT_QA_REQUEST_TYPE,
  AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
  AUTHORING_BRAND_DRIFT_CHECK_REQUEST_TYPE,
  AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE,
  AUTHORING_BRAND_THEME_ACKNOWLEDGE_REQUEST_TYPE,
  AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE,
  AUTHORING_PUBLISH_STAGING_REQUEST_TYPE,
  AUTHORING_PUBLISH_STAGING_RESULT_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_REQUEST_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE,
  AUTHORING_RELEASE_RECOVERY_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_REQUEST_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_REQUEST_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  STYLE_SAMPLE_CANCELED_TYPE,
  STYLE_SAMPLE_RESULT_TYPE,
  STYLE_SAMPLE_START_TYPE,
  releaseRecoveryStateMatchesScope,
  type AuthoringApproveProductionResultMessage,
  type AuthoringBrowserVerifyResultMessage,
  type AuthoringLocaleLayoutQaResultMessage,
  type AuthoringBrandDriftCheckResult,
  type AuthoringBrandDriftCheckResultMessage,
  type AuthoringBrandThemeAcknowledgementRequest,
  type AuthoringBrandThemeAcknowledgementResult,
  type AuthoringBrandThemeAcknowledgeResultMessage,
  type AuthoringReleaseRecoveryResultMessage,
  type AuthoringReleaseRecoveryStateResultMessage,
  type AuthoringPublishStagingResultMessage,
  type AuthoringPromoteProductionResultMessage,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type AuthoringStyleSourceSaveResultMessage,
  type AuthoringSubmitVerificationResultMessage,
  type BrowserVerificationReport,
  type LocaleLayoutQaReport,
  type BrandDriftCheckRequest,
  type BridgeMessage,
  type ProductStyleProposal,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type ReleaseRecoveryReadScope,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
  type StyleSampleCanceledMessage,
  type StyleSampleResultMessage,
} from '@lodariq/schema';
import { createBridgeCorrelationId, type AuthoringBridge } from '../bridge/transport';
import type { AuthoringStyleSourceSaveResult } from './index';
import type { DirectAuthoringHostServiceOptions } from './direct-host-service-types';

const DIRECT_HOST_REQUEST_TIMEOUT_MS = 5_000;
const DIRECT_HOST_BROWSER_VERIFICATION_TIMEOUT_MS = 30_000;
const DIRECT_HOST_LOCALE_LAYOUT_QA_TIMEOUT_MS = 2 * 60_000;
const DIRECT_HOST_STYLE_SELECTION_TIMEOUT_MS = 5 * 60_000;

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  expectedRecoveryScope?: ReleaseRecoveryReadScope;
  expectedRecoveryAction?: ReleaseRecoveryRequest['action'];
}

export interface DirectAuthoringOptionalPanelServices {
  publishToStaging: (
    request: AuthoringStagingPublicationRequest,
  ) => Promise<AuthoringStagingPublicationResult>;
  getReleaseRecoveryState: (environmentId: string) => Promise<ReleaseRecoveryStateResponse>;
  recoverRelease: (
    environmentId: string,
    request: ReleaseRecoveryRequest,
  ) => Promise<ReleaseRecoveryResult>;
  sampleProductStyle: (request: {
    scope: 'page' | 'selected-target';
    targetId?: string;
  }) => Promise<ProductStyleProposal>;
  saveStyleSource: (proposal: ProductStyleProposal) => Promise<AuthoringStyleSourceSaveResult>;
  checkBrandDrift: (request: BrandDriftCheckRequest) => Promise<AuthoringBrandDriftCheckResult>;
  acknowledgeBrandTheme: (
    request: AuthoringBrandThemeAcknowledgementRequest,
  ) => Promise<AuthoringBrandThemeAcknowledgementResult>;
  verifyBrowserPublication: (
    publicationId: string,
    expectedContentHash: string,
  ) => Promise<BrowserVerificationReport>;
  runLocaleLayoutQa: (expectedDocumentRevision: number) => Promise<LocaleLayoutQaReport>;
  submitStagingVerification: (
    request: AuthoringStagingVerificationRequest,
  ) => Promise<AuthoringStagingVerificationResult>;
  promoteProduction: (request: ProductionPromotionRequest) => Promise<ProductionPromotionResult>;
  approveProduction: (
    operationId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) => Promise<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }>;
  receive: (message: BridgeMessage) => void;
  stop: () => void;
}

export function createDirectAuthoringOptionalPanelServices(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
): DirectAuthoringOptionalPanelServices {
  const releaseRecoveryStateRequests = new Map<
    string,
    PendingRequest<ReleaseRecoveryStateResponse>
  >();
  const releaseRecoveryRequests = new Map<string, PendingRequest<ReleaseRecoveryResult>>();
  const publicationRequests = new Map<string, PendingRequest<AuthoringStagingPublicationResult>>();
  const styleSampleRequests = new Map<string, PendingRequest<ProductStyleProposal>>();
  const styleSourceRequests = new Map<string, PendingRequest<AuthoringStyleSourceSaveResult>>();
  const brandDriftRequests = new Map<string, PendingRequest<AuthoringBrandDriftCheckResult>>();
  const brandAcknowledgementRequests = new Map<
    string,
    PendingRequest<AuthoringBrandThemeAcknowledgementResult>
  >();
  const browserVerificationRequests = new Map<string, PendingRequest<BrowserVerificationReport>>();
  const localeLayoutQaRequests = new Map<string, PendingRequest<LocaleLayoutQaReport>>();
  const verificationSubmissionRequests = new Map<
    string,
    PendingRequest<AuthoringStagingVerificationResult>
  >();
  const promotionRequests = new Map<string, PendingRequest<ProductionPromotionResult>>();
  const approvalRequests = new Map<
    string,
    PendingRequest<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }>
  >();
  let stopped = false;

  return {
    publishToStaging: (request) => {
      if (stopped) return stoppedRequest();
      return requestStagingPublication(bridge, options, publicationRequests, request);
    },
    getReleaseRecoveryState: (environmentId) => {
      if (stopped) return stoppedRequest();
      return requestReleaseRecoveryState(
        bridge,
        options,
        releaseRecoveryStateRequests,
        environmentId,
      );
    },
    recoverRelease: (environmentId, request) => {
      if (stopped) return stoppedRequest();
      return requestReleaseRecovery(
        bridge,
        options,
        releaseRecoveryRequests,
        environmentId,
        request,
      );
    },
    sampleProductStyle: (request) => {
      if (stopped) return stoppedRequest();
      return requestProductStyleSample(bridge, options, styleSampleRequests, request);
    },
    saveStyleSource: (proposal) => {
      if (stopped) return stoppedRequest();
      return requestStyleSourceSave(bridge, options, styleSourceRequests, proposal);
    },
    checkBrandDrift: (request) => {
      if (stopped) return stoppedRequest();
      return requestBrandDriftCheck(bridge, options, brandDriftRequests, request);
    },
    acknowledgeBrandTheme: (request) => {
      if (stopped) return stoppedRequest();
      return requestBrandThemeAcknowledgement(
        bridge,
        options,
        brandAcknowledgementRequests,
        request,
      );
    },
    verifyBrowserPublication: (publicationId, expectedContentHash) => {
      if (stopped) return stoppedRequest();
      return requestBrowserVerification(
        bridge,
        options,
        browserVerificationRequests,
        publicationId,
        expectedContentHash,
      );
    },
    runLocaleLayoutQa: (expectedDocumentRevision) => {
      if (stopped) return stoppedRequest();
      return requestLocaleLayoutQa(
        bridge,
        options,
        localeLayoutQaRequests,
        expectedDocumentRevision,
      );
    },
    submitStagingVerification: (request) => {
      if (stopped) return stoppedRequest();
      return requestVerificationSubmission(
        bridge,
        options,
        verificationSubmissionRequests,
        request,
      );
    },
    promoteProduction: (request) => {
      if (stopped) return stoppedRequest();
      return requestProductionPromotion(bridge, options, promotionRequests, request);
    },
    approveProduction: (operationId, decision, reason) => {
      if (stopped) return stoppedRequest();
      return requestProductionApproval(
        bridge,
        options,
        approvalRequests,
        operationId,
        decision,
        reason,
      );
    },
    receive: (message) => {
      if (stopped) return;
      if (message.type === AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE) {
        settleReleaseRecoveryStateRequest(releaseRecoveryStateRequests, message);
        return;
      }
      if (message.type === AUTHORING_RELEASE_RECOVERY_RESULT_TYPE) {
        settleReleaseRecoveryRequest(releaseRecoveryRequests, message);
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
      if (message.type === AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE) {
        settleBrandDriftRequest(brandDriftRequests, message);
        return;
      }
      if (message.type === AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE) {
        settleBrandAcknowledgementRequest(brandAcknowledgementRequests, message);
        return;
      }
      if (message.type === AUTHORING_BROWSER_VERIFY_RESULT_TYPE) {
        settleBrowserVerificationRequest(browserVerificationRequests, message);
        return;
      }
      if (message.type === AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE) {
        settleLocaleLayoutQaRequest(localeLayoutQaRequests, message);
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
    stop: () => {
      if (stopped) return;
      stopped = true;
      rejectPendingRequests(releaseRecoveryStateRequests);
      rejectPendingRequests(releaseRecoveryRequests);
      rejectPendingRequests(publicationRequests);
      rejectPendingRequests(styleSampleRequests);
      rejectPendingRequests(styleSourceRequests);
      rejectPendingRequests(brandDriftRequests);
      rejectPendingRequests(brandAcknowledgementRequests);
      rejectPendingRequests(browserVerificationRequests);
      rejectPendingRequests(localeLayoutQaRequests);
      rejectPendingRequests(verificationSubmissionRequests);
      rejectPendingRequests(promotionRequests);
      rejectPendingRequests(approvalRequests);
    },
  };
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

function requestReleaseRecoveryState(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<ReleaseRecoveryStateResponse>>,
  environmentId: string,
): Promise<ReleaseRecoveryStateResponse> {
  const correlationId = createBridgeCorrelationId('authoring_release_recovery_state_request');
  const pending = createPendingRequest(correlationId, requests, DIRECT_HOST_REQUEST_TIMEOUT_MS, {
    expectedRecoveryScope: {
      workspaceId: options.workspaceId,
      environmentId,
      documentId: options.documentId,
    },
  });
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE,
      environmentId,
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestReleaseRecovery(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<ReleaseRecoveryResult>>,
  environmentId: string,
  request: ReleaseRecoveryRequest,
): Promise<ReleaseRecoveryResult> {
  if (!releaseRecoveryActionAllowed(options, request.action)) {
    return Promise.resolve({
      ok: false,
      action: request.action,
      state: 'failed',
      replayed: false,
      code: 'capability_denied',
      message: RELEASE_RECOVERY_FAILURE_MESSAGES.capability_denied,
    });
  }

  const correlationId = createBridgeCorrelationId('authoring_release_recovery_request');
  const pending = createPendingRequest(correlationId, requests, DIRECT_HOST_REQUEST_TIMEOUT_MS, {
    expectedRecoveryAction: request.action,
  });
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE,
      environmentId,
      request: structuredClone(request),
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function releaseRecoveryActionAllowed(
  options: DirectAuthoringHostServiceOptions,
  action: ReleaseRecoveryRequest['action'],
): boolean {
  return action === 'rollback'
    ? options.rollbackRelease === true
    : options.unpublishRelease === true;
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
  requests: Map<string, PendingRequest<AuthoringStyleSourceSaveResult>>,
  proposal: ProductStyleProposal,
): Promise<AuthoringStyleSourceSaveResult> {
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

function requestBrandDriftCheck(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<AuthoringBrandDriftCheckResult>>,
  request: BrandDriftCheckRequest,
): Promise<AuthoringBrandDriftCheckResult> {
  const correlationId = createBridgeCorrelationId('authoring_brand_drift_check_request');
  const pending = createPendingRequest(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_BRAND_DRIFT_CHECK_REQUEST_TYPE,
      request: structuredClone(request),
    });
  } catch (error) {
    rejectRequest(correlationId, requests, asError(error));
  }
  return pending;
}

function requestBrandThemeAcknowledgement(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<AuthoringBrandThemeAcknowledgementResult>>,
  request: AuthoringBrandThemeAcknowledgementRequest,
): Promise<AuthoringBrandThemeAcknowledgementResult> {
  const correlationId = createBridgeCorrelationId('authoring_brand_theme_acknowledge_request');
  const pending = createPendingRequest(correlationId, requests);
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_BRAND_THEME_ACKNOWLEDGE_REQUEST_TYPE,
      request: structuredClone(request),
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

function requestLocaleLayoutQa(
  bridge: AuthoringBridge,
  options: DirectAuthoringHostServiceOptions,
  requests: Map<string, PendingRequest<LocaleLayoutQaReport>>,
  expectedDocumentRevision: number,
): Promise<LocaleLayoutQaReport> {
  const correlationId = createBridgeCorrelationId('authoring_locale_layout_qa_request');
  const pending = createPendingRequest(
    correlationId,
    requests,
    DIRECT_HOST_LOCALE_LAYOUT_QA_TIMEOUT_MS,
  );
  try {
    bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: options.sessionId,
      documentId: options.documentId,
      correlationId,
      type: AUTHORING_LOCALE_LAYOUT_QA_REQUEST_TYPE,
      expectedDocumentRevision,
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
  metadata: Pick<PendingRequest<T>, 'expectedRecoveryAction' | 'expectedRecoveryScope'> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(correlationId);
      reject(new Error('Lodariq authoring host request timed out'));
    }, timeoutMs);
    requests.set(correlationId, { resolve, reject, timer, ...metadata });
  });
}

function settleReleaseRecoveryStateRequest(
  requests: Map<string, PendingRequest<ReleaseRecoveryStateResponse>>,
  message: AuthoringReleaseRecoveryStateResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (!message.result.ok) {
    pending.reject(new Error(message.result.message));
    return;
  }
  if (
    !pending.expectedRecoveryScope ||
    !releaseRecoveryStateMatchesScope(message.result.state, pending.expectedRecoveryScope)
  ) {
    pending.reject(new Error('Lodariq release recovery state scope mismatch'));
    return;
  }
  pending.resolve(structuredClone(message.result.state));
}

function settlePublicationRequest(
  requests: Map<string, PendingRequest<AuthoringStagingPublicationResult>>,
  message: AuthoringPublishStagingResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  pending.resolve(structuredClone(message.result));
}

function settleReleaseRecoveryRequest(
  requests: Map<string, PendingRequest<ReleaseRecoveryResult>>,
  message: AuthoringReleaseRecoveryResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (!pending.expectedRecoveryAction || message.result.action !== pending.expectedRecoveryAction) {
    pending.reject(new Error('Lodariq release recovery response action mismatch'));
    return;
  }
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
  requests: Map<string, PendingRequest<AuthoringStyleSourceSaveResult>>,
  message: AuthoringStyleSourceSaveResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve({
      ...structuredClone(message.result.productMatch),
      sourceId: message.result.sourceId,
      sourceHash: message.result.sourceHash,
    });
    return;
  }
  pending.reject(new Error(message.result.message));
}

function settleBrandDriftRequest(
  requests: Map<string, PendingRequest<AuthoringBrandDriftCheckResult>>,
  message: AuthoringBrandDriftCheckResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve(structuredClone(message.result.brandDrift));
    return;
  }
  pending.reject(new Error(message.result.message));
}

function settleBrandAcknowledgementRequest(
  requests: Map<string, PendingRequest<AuthoringBrandThemeAcknowledgementResult>>,
  message: AuthoringBrandThemeAcknowledgeResultMessage,
): void {
  const pending = takePendingRequest(message.requestCorrelationId, requests);
  if (!pending) return;
  if (message.result.ok) {
    pending.resolve(structuredClone(message.result.acknowledgement));
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

function settleLocaleLayoutQaRequest(
  requests: Map<string, PendingRequest<LocaleLayoutQaReport>>,
  message: AuthoringLocaleLayoutQaResultMessage,
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

function stoppedRequest<T>(): Promise<T> {
  return Promise.reject(new Error('Lodariq authoring host services stopped'));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Lodariq authoring host request failed');
}
