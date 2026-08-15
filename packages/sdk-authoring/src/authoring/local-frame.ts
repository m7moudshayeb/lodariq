import type { LocalAuthoringFrameOptions } from './local-frame-types';

export { AUTHORING_STAGING_RELEASE_STATES } from './local-frame-types';

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
} from './local-frame-types';

/** Loads the React authoring workspace only after a creator frame is mounted. */
export async function mountLocalAuthoringFrame(options: LocalAuthoringFrameOptions): Promise<void> {
  const { mountLocalAuthoringReactFrame } = await import('./local-frame-app');
  mountLocalAuthoringReactFrame(options);
}
