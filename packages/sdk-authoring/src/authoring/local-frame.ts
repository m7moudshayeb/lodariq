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

import type * as LocalAuthoringFrameApp from './local-frame-app';

type LocalAuthoringFrameModule = typeof LocalAuthoringFrameApp;

let frameModule: Promise<LocalAuthoringFrameModule> | null = null;

function loadFrameModule(): Promise<LocalAuthoringFrameModule> {
  frameModule ??= import('./local-frame-app').catch((error: unknown) => {
    // A prewarm that lost the network must not poison the mount behind it, so
    // the rejected promise is dropped rather than cached.
    frameModule = null;
    throw error;
  });
  return frameModule;
}

/**
 * Begins downloading the React workspace without mounting it.
 *
 * The workspace is the largest single asset a creator fetches, and it used to
 * be requested only after the bridge handshake and session resolution had both
 * completed — so the biggest download started last, behind two round trips it
 * does not depend on. Calling this as soon as the frame document knows it is an
 * authoring surface overlaps that download with the handshake instead.
 *
 * Safe to call repeatedly; safe to call and never mount.
 */
export function prewarmLocalAuthoringFrame(): void {
  void loadFrameModule().catch(() => {
    // Prewarming is an optimisation. The mount reports the real failure.
  });
}

/** Loads the React authoring workspace only after a creator frame is mounted. */
export async function mountLocalAuthoringFrame(options: LocalAuthoringFrameOptions): Promise<void> {
  const { mountLocalAuthoringReactFrame } = await loadFrameModule();
  mountLocalAuthoringReactFrame(options);
}
