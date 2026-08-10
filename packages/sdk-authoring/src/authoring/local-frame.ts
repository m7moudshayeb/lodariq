import { mountLocalAuthoringReactFrame } from './local-frame-app';
import type { LocalAuthoringFrameOptions } from './local-frame-types';

export { AUTHORING_STAGING_RELEASE_STATES } from './local-frame-types';

export type {
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
  LocalAuthoringFrameOptions,
  LocalAuthoringFrameServices,
} from './local-frame-types';

export function mountLocalAuthoringFrame(options: LocalAuthoringFrameOptions): void {
  mountLocalAuthoringReactFrame(options);
}
