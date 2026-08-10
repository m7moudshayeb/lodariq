import {
  AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
  AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE,
  AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE,
  AUTHORING_PUBLISH_STAGING_RESULT_TYPE,
  AUTHORING_PROMOTE_PRODUCTION_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
  AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
  AUTHORING_SUBMIT_VERIFICATION_RESULT_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  STYLE_SAMPLE_CANCELED_TYPE,
  STYLE_SAMPLE_RESULT_TYPE,
  releaseRecoveryStateMatchesScope,
  type AuthoringBrandDriftCheckResult,
  type AuthoringBrandThemeAcknowledgementRequest,
  type AuthoringBrandThemeAcknowledgementResult,
  type AuthoringProductMatchApplyResult,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type BrandDriftCheckRequest,
  type BridgeMessage,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type ReleaseRecoveryFailureCode,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
  type STYLE_SAMPLE_START_TYPE,
} from '@lodariq/schema';
import { readRegisteredBrandTokensForAuthoring } from '@lodariq/sdk-runtime/brand-token-registry';
import { createBridgeCorrelationId, type AuthoringBridge } from '../bridge/transport';
import { sampleProductStyles } from '../bridge/product-style-sampler';
import {
  BrandDriftRuntimePreviewSession,
  type BrandDriftRuntimePreviewMode,
  type BrandDriftRuntimePreviewServices,
} from './brand-drift-runtime-preview';

type AuthoringStyleSourceSaveResult = AuthoringProductMatchApplyResult & {
  sourceId: string;
  sourceHash: string;
};

export interface AuthoringHostOptionalPanelServiceOptions {
  session: {
    sessionId: string;
    workspaceId: string;
    documentId: string;
  };
  getActiveBridge: () => AuthoringBridge | null;
  getReleaseRecoveryState?: (environmentId: string) => Promise<ReleaseRecoveryStateResponse>;
  recoverRelease?: (
    environmentId: string,
    request: ReleaseRecoveryRequest,
  ) => Promise<ReleaseRecoveryResult>;
  canRollbackRelease: boolean;
  canUnpublishRelease: boolean;
  checkBrandDrift?: (request: BrandDriftCheckRequest) => Promise<AuthoringBrandDriftCheckResult>;
  acknowledgeBrandTheme?: (
    request: AuthoringBrandThemeAcknowledgementRequest,
  ) => Promise<AuthoringBrandThemeAcknowledgementResult>;
  brandDriftRuntimePreview: BrandDriftRuntimePreviewServices;
  adoptDocument: (document: LodariqDocument) => void;
  publishToStaging?: (
    request: AuthoringStagingPublicationRequest,
  ) => Promise<AuthoringStagingPublicationResult>;
  saveStyleSource?: (proposal: ProductStyleProposal) => Promise<AuthoringStyleSourceSaveResult>;
  submitStagingVerification?: (
    request: AuthoringStagingVerificationRequest,
  ) => Promise<AuthoringStagingVerificationResult>;
  promoteProduction?: (request: ProductionPromotionRequest) => Promise<ProductionPromotionResult>;
  approveProduction?: (
    operationId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) => Promise<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }>;
  documentRoot: Document;
  resolveProductStyleElement: (
    request: Extract<BridgeMessage, { type: typeof STYLE_SAMPLE_START_TYPE }>['request'],
  ) => Promise<Element | null>;
}

export interface AuthoringHostOptionalPanelServices {
  respondToReleaseRecoveryStateRequest: (
    requestCorrelationId: string,
    environmentId: string,
  ) => Promise<void>;
  respondToReleaseRecoveryRequest: (
    requestCorrelationId: string,
    environmentId: string,
    request: ReleaseRecoveryRequest,
  ) => Promise<void>;
  respondToBrandDriftCheckRequest: (
    requestCorrelationId: string,
    request: BrandDriftCheckRequest,
  ) => Promise<void>;
  respondToBrandThemeAcknowledgementRequest: (
    requestCorrelationId: string,
    request: AuthoringBrandThemeAcknowledgementRequest,
  ) => Promise<void>;
  respondToPublishStagingRequest: (
    requestCorrelationId: string,
    request: AuthoringStagingPublicationRequest,
  ) => Promise<void>;
  respondToStyleSourceSaveRequest: (
    requestCorrelationId: string,
    proposal: ProductStyleProposal,
  ) => Promise<void>;
  respondToVerificationSubmissionRequest: (
    requestCorrelationId: string,
    request: AuthoringStagingVerificationRequest,
  ) => Promise<void>;
  respondToProductionPromotionRequest: (
    requestCorrelationId: string,
    request: ProductionPromotionRequest,
  ) => Promise<void>;
  respondToProductionApprovalRequest: (
    requestCorrelationId: string,
    operationId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) => Promise<void>;
  clearBrandDriftRuntimePreview: () => void;
  playBrandDriftRuntimePreview: (mode: BrandDriftRuntimePreviewMode | 'restore') => Promise<void>;
  respondToStyleSampleRequest: (
    requestCorrelationId: string,
    request: Extract<BridgeMessage, { type: typeof STYLE_SAMPLE_START_TYPE }>['request'],
  ) => Promise<void>;
}

export function createAuthoringHostOptionalPanelServices(
  options: AuthoringHostOptionalPanelServiceOptions,
): AuthoringHostOptionalPanelServices {
  const { session } = options;
  const brandDriftRuntimePreview = new BrandDriftRuntimePreviewSession(
    options.brandDriftRuntimePreview,
  );

  return {
    respondToReleaseRecoveryStateRequest: async (requestCorrelationId, environmentId) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge) return;
      if (!options.getReleaseRecoveryState) {
        sendReleaseRecoveryStateFailure(
          activeBridge,
          session,
          requestCorrelationId,
          'capability_denied',
          RELEASE_RECOVERY_FAILURE_MESSAGES.capability_denied,
        );
        return;
      }
      try {
        const state = await options.getReleaseRecoveryState(environmentId);
        if (
          !releaseRecoveryStateMatchesScope(state, {
            workspaceId: session.workspaceId,
            environmentId,
            documentId: session.documentId,
          })
        ) {
          throw new Error('Release recovery state scope mismatch');
        }
        activeBridge.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_release_recovery_state_result'),
          type: AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
          requestCorrelationId,
          result: { ok: true, state: structuredClone(state) },
        });
      } catch {
        sendReleaseRecoveryStateFailure(
          activeBridge,
          session,
          requestCorrelationId,
          'release_recovery_state_failed',
          'Release recovery state could not be loaded',
        );
      }
    },
    respondToReleaseRecoveryRequest: async (requestCorrelationId, environmentId, request) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge) return;
      const actionAllowed =
        request.action === 'rollback' ? options.canRollbackRelease : options.canUnpublishRelease;
      if (!options.recoverRelease || !actionAllowed) {
        sendReleaseRecoveryResult(
          activeBridge,
          session,
          requestCorrelationId,
          releaseRecoveryFailure(request.action, 'capability_denied'),
        );
        return;
      }
      let result: ReleaseRecoveryResult;
      try {
        result = await options.recoverRelease(environmentId, structuredClone(request));
        if (result.action !== request.action) {
          throw new Error('Release recovery response action mismatch');
        }
      } catch {
        result = releaseRecoveryFailure(request.action, 'internal_error');
      }
      sendReleaseRecoveryResult(activeBridge, session, requestCorrelationId, result);
    },
    respondToBrandDriftCheckRequest: async (requestCorrelationId, request) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge || !options.checkBrandDrift) return;
      try {
        await brandDriftRuntimePreview.restore();
        const result = await options.checkBrandDrift(request);
        await brandDriftRuntimePreview.replaceRuntimePreview(result.runtimePreview);
        activeBridge.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_brand_drift_check_result'),
          type: AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE,
          requestCorrelationId,
          result: { ok: true, brandDrift: result },
        });
      } catch {
        sendHostOperationFailure(
          activeBridge,
          session,
          AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE,
          requestCorrelationId,
          'brand_drift_check_failed',
          'Brand drift could not be checked.',
        );
      }
    },
    respondToBrandThemeAcknowledgementRequest: async (requestCorrelationId, request) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge || !options.acknowledgeBrandTheme) return;
      try {
        await brandDriftRuntimePreview.restore();
        const result = await options.acknowledgeBrandTheme(request);
        options.adoptDocument(structuredClone(result.document));
        brandDriftRuntimePreview.clear();
        activeBridge.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_brand_theme_acknowledge_result'),
          type: AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE,
          requestCorrelationId,
          result: { ok: true, acknowledgement: result },
        });
      } catch {
        sendHostOperationFailure(
          activeBridge,
          session,
          AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE,
          requestCorrelationId,
          'brand_theme_acknowledgement_failed',
          'The reviewed Brand version could not be acknowledged.',
        );
      }
    },
    respondToPublishStagingRequest: async (requestCorrelationId, request) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge || !options.publishToStaging) return;
      let result: AuthoringStagingPublicationResult;
      try {
        result = await options.publishToStaging(request);
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
    },
    respondToStyleSourceSaveRequest: async (requestCorrelationId, proposal) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge || !options.saveStyleSource) return;
      try {
        const result = await options.saveStyleSource(proposal);
        const { sourceId, sourceHash, ...productMatch } = result;
        activeBridge.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('authoring_style_source_save_result'),
          type: AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
          requestCorrelationId,
          result: { ok: true, sourceId, sourceHash, productMatch },
        });
      } catch {
        sendHostOperationFailure(
          activeBridge,
          session,
          AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
          requestCorrelationId,
          'style_source_save_failed',
          'The Brand proposal could not be saved.',
        );
      }
    },
    respondToVerificationSubmissionRequest: async (requestCorrelationId, request) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge || !options.submitStagingVerification) return;
      let result: AuthoringStagingVerificationResult;
      try {
        result = await options.submitStagingVerification(request);
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
    },
    respondToProductionPromotionRequest: async (requestCorrelationId, request) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge || !options.promoteProduction) return;
      let result: ProductionPromotionResult;
      try {
        result = await options.promoteProduction(request);
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
    },
    respondToProductionApprovalRequest: async (
      requestCorrelationId,
      operationId,
      decision,
      reason,
    ) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge || !options.approveProduction) return;
      try {
        const result = await options.approveProduction(operationId, decision, reason);
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
          session,
          AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE,
          requestCorrelationId,
          'approval_failed',
          'The production decision could not be saved.',
        );
      }
    },
    clearBrandDriftRuntimePreview: () => brandDriftRuntimePreview.clear(),
    playBrandDriftRuntimePreview: (mode) =>
      mode === 'restore'
        ? brandDriftRuntimePreview.restore()
        : brandDriftRuntimePreview.preview(mode),
    respondToStyleSampleRequest: async (requestCorrelationId, request) => {
      const activeBridge = options.getActiveBridge();
      if (!activeBridge) return;
      try {
        const selectedElement = await options.resolveProductStyleElement(request);
        if (!selectedElement) {
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
        const proposal = await sampleProductStyles({
          document: options.documentRoot,
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
      } catch {
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
    },
  };
}

function releaseRecoveryFailure(
  action: ReleaseRecoveryRequest['action'],
  code: ReleaseRecoveryFailureCode,
): Extract<ReleaseRecoveryResult, { ok: false }> {
  return {
    ok: false,
    action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
  } as Extract<ReleaseRecoveryResult, { ok: false }>;
}

function sendReleaseRecoveryStateFailure(
  activeBridge: AuthoringBridge,
  session: AuthoringHostOptionalPanelServiceOptions['session'],
  requestCorrelationId: string,
  code: string,
  message: string,
): void {
  activeBridge.send({
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId: session.sessionId,
    documentId: session.documentId,
    correlationId: createBridgeCorrelationId('authoring_release_recovery_state_result'),
    type: AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
    requestCorrelationId,
    result: { ok: false, code, message },
  });
}

function sendReleaseRecoveryResult(
  activeBridge: AuthoringBridge,
  session: AuthoringHostOptionalPanelServiceOptions['session'],
  requestCorrelationId: string,
  result: ReleaseRecoveryResult,
): void {
  activeBridge.send({
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId: session.sessionId,
    documentId: session.documentId,
    correlationId: createBridgeCorrelationId('authoring_release_recovery_result'),
    type: AUTHORING_RELEASE_RECOVERY_RESULT_TYPE,
    requestCorrelationId,
    result: structuredClone(result),
  });
}

function sendHostOperationFailure(
  activeBridge: AuthoringBridge,
  session: AuthoringHostOptionalPanelServiceOptions['session'],
  type:
    | typeof AUTHORING_APPROVE_PRODUCTION_RESULT_TYPE
    | typeof AUTHORING_BRAND_DRIFT_CHECK_RESULT_TYPE
    | typeof AUTHORING_BRAND_THEME_ACKNOWLEDGE_RESULT_TYPE
    | typeof AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
  requestCorrelationId: string,
  code: string,
  message: string,
): void {
  activeBridge.send({
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId: session.sessionId,
    documentId: session.documentId,
    correlationId: createBridgeCorrelationId('authoring_host_operation_result'),
    type,
    requestCorrelationId,
    result: { ok: false, code, message },
  });
}

function productionOperationFailure(message: string): ProductionPromotionResult {
  return {
    ok: false,
    state: 'failed',
    code: 'internal_error',
    message,
  };
}
