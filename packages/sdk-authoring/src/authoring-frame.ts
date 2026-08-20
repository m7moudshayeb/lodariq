/**
 * Dedicated editor-origin authoring frame surface.
 *
 * The compatibility `lodariq-authoring` entry continues to export these same
 * bindings. This narrower entry lets editor.lodariq.io avoid treating the
 * customer-page host surface as part of its application entry graph.
 */
export {
  AUTHORING_STAGING_RELEASE_STATES,
  mountLocalAuthoringFrame,
} from './authoring/local-frame';
export { AUTHORING_TYPOGRAPHY_CSS_PROPERTIES } from './creator-chrome-tokens';
export type {
  AuthoringMediaUploadOptions,
  AuthoringBrandMatchProposal,
  AuthoringExactArtifactPromotionRequest,
  AuthoringExactArtifactPromotionResult,
  AuthoringProductionApprovalRequest,
  AuthoringReleaseFinding,
  AuthoringStagingPublicationRequest,
  AuthoringStagingPublicationResult,
  AuthoringStagingReleaseState,
  AuthoringStagingReleaseStateName,
  LocalAuthoringFrameMetricEvent,
  LocalAuthoringFrameMetricName,
  LocalAuthoringInitialWorkspace,
  LocalAuthoringFrameOptions,
  LocalAuthoringFrameServices,
} from './authoring/local-frame';
export { createDirectAuthoringHostServices } from './authoring/direct-host-services';
export type {
  DirectAuthoringHostFrameServices,
  DirectAuthoringHostServiceHandle,
  DirectAuthoringHostServiceOptions,
} from './authoring/direct-host-services';
export {
  brandMatchProposalForFrame,
  brandWorkspaceStateFromTheme,
  productionArtifactForFrame,
  releaseWorkflowFromState,
  verificationForFrame,
} from './authoring/workflow-adapters';
export type { ReleaseWorkflowCapabilities } from './authoring/workflow-adapters';
export {
  AuthoringBrandDriftRequestError,
  requestAuthoringBrandDrift,
  requestAuthoringBrandThemeAcknowledgement,
} from './authoring/brand-drift-client';
export type {
  AuthoringBrandDriftRequestOptions,
  AuthoringBrandThemeAcknowledgementOptions,
} from './authoring/brand-drift-client';
export { AuthoringBrandDriftController } from './authoring/brand-drift-controller';
export type {
  AuthoringBrandDriftControllerServices,
  AuthoringBrandDriftControllerSnapshot,
} from './authoring/brand-drift-controller';
export {
  createAuthoringBrandDriftViewModel,
  withAuthoringBrandDriftRuntimePreview,
} from './authoring/brand-drift-model';
export type {
  AuthoringBrandAcknowledgementViewModel,
  AuthoringBrandDriftAffectedExperienceItem,
  AuthoringBrandDriftConsequenceItem,
  AuthoringBrandDriftRoleItem,
  AuthoringBrandDriftSourceItem,
  AuthoringBrandDriftViewModel,
} from './authoring/brand-drift-model';
export {
  AUTHORING_RELEASE_RECOVERY_PREPARATION_FAILURES,
  authoringReleaseRecoveryReasonFailure,
  createAuthoringReleaseRecoveryIntent,
  createAuthoringReleaseRecoveryViewModel,
  prepareAuthoringReleaseRecoveryRequest,
} from './authoring/release-recovery-model';
export type {
  AuthoringReleaseHistoryItem,
  AuthoringReleaseRecoveryAction,
  AuthoringReleaseRecoveryGuard,
  AuthoringReleaseRecoveryInput,
  AuthoringReleaseRecoveryIntent,
  AuthoringReleaseRecoveryPreparationFailure,
  AuthoringReleaseRecoveryRequestIdentity,
  AuthoringReleaseRecoveryRequestPreparation,
  AuthoringReleaseRecoveryScope,
  AuthoringReleaseRecoveryViewModel,
  AuthoringRollbackAvailability,
  AuthoringRollbackIntent,
  AuthoringRollbackTarget,
  AuthoringUnpublishIntent,
  PrepareAuthoringReleaseRecoveryRequestInput,
} from './authoring/release-recovery-model';
export {
  ReleaseHistoryPanel,
  ReleaseRecoveryConfirmation,
} from './authoring/local-frame-ui/components/release-recovery';
export type {
  ReleaseHistoryPanelProps,
  ReleaseRecoveryConfirmationProps,
} from './authoring/local-frame-ui/components/release-recovery';
