import type {
  AuthoringReleaseWorkflowState,
  AuthoringVerificationState,
} from '../local-frame-types';
import type { AuthoringReleaseViewState } from './types';

export const AUTHORING_RELEASE_ACTIONS = [
  'none',
  'review-blockers',
  'publish-staging',
  'verify-staging',
  'promote-production',
  'request-approval',
  'approve-production',
  'retry',
] as const;
export type AuthoringReleaseAction = (typeof AUTHORING_RELEASE_ACTIONS)[number];

export interface AuthoringReleasePresentation {
  action: AuthoringReleaseAction;
  actionLabel: string | null;
  detail: string;
  title: string;
  tone: 'neutral' | 'ready' | 'success' | 'warning' | 'danger' | 'busy';
  truth: string;
}

export function canApproveAndPromote(workflow: AuthoringReleaseWorkflowState | null): boolean {
  return Boolean(
    workflow?.approval === 'requested' && workflow.canApprove && workflow.approvalOperationId,
  );
}

export function deriveAuthoringReleasePresentation({
  blockerCount,
  release,
  workflow,
}: {
  blockerCount: number;
  release: AuthoringReleaseViewState;
  workflow: AuthoringReleaseWorkflowState | null;
}): AuthoringReleasePresentation {
  const truth = authoringReleaseTruth(workflow, release);

  if (release.status === 'checking') {
    return presentation(
      'none',
      'Checking release truth',
      'Confirming the saved draft.',
      'busy',
      truth,
    );
  }
  if (release.status === 'publishing') {
    return presentation(
      'none',
      'Publishing to staging',
      'Your authoring session stays open.',
      'busy',
      truth,
    );
  }
  if (release.status === 'unavailable') {
    const notAuthorized = release.reason === 'not_authorized';
    return presentation(
      'none',
      notAuthorized ? 'Release access unavailable' : 'Local preview',
      notAuthorized
        ? 'Your workspace role does not include release actions.'
        : 'Open this experience on an authenticated staging origin to release it.',
      'neutral',
      truth,
    );
  }
  if (release.status === 'error') {
    return presentation(
      'retry',
      'Release truth could not be refreshed',
      'Your draft is safe. Try the release check again.',
      'danger',
      truth,
    );
  }
  if (blockerCount > 0 || release.status === 'blocked') {
    return presentation(
      'review-blockers',
      blockerCount > 0 ? `${blockerCount} to fix before release` : 'Release needs attention',
      release.reason === 'open_in_staging'
        ? 'Open this exact page on the configured staging origin.'
        : 'Review the first blocking check without leaving the product page.',
      'warning',
      truth,
    );
  }

  if (workflow && productionMatchesCurrentDraft(workflow)) {
    return presentation(
      'none',
      'Live in production',
      'Production points to the exact verified staged artifact.',
      'success',
      truth,
    );
  }

  if (workflow && stagingMatchesCurrentDraft(workflow)) {
    const verification = workflow.staging!.verification;
    if (verification.state === 'running') {
      return presentation(
        'none',
        'Verifying on staging',
        'Running the exact published artifact on this page.',
        'busy',
        truth,
      );
    }
    if (verification.state === 'passed') {
      if (canApproveAndPromote(workflow)) {
        return presentation(
          'approve-production',
          'Approval ready for you',
          'Approve and promote the exact verified artifact with no rebuild.',
          'warning',
          truth,
        );
      }
      if (workflow.approval === 'requested') {
        return presentation(
          'none',
          'Approval requested',
          'The verified artifact stays unchanged while approval is collected.',
          'warning',
          truth,
        );
      }
      if (workflow.approval === 'required') {
        return presentation(
          'request-approval',
          'Approval required',
          'The verified artifact stays unchanged while approval is collected.',
          'warning',
          truth,
        );
      }
      if (workflow.canPromote) {
        return presentation(
          'promote-production',
          'Ready for production',
          'Promote the exact staged artifact with no rebuild.',
          'ready',
          truth,
        );
      }
      return presentation(
        'none',
        'Staging verified',
        'A workspace releaser can promote this exact artifact.',
        'success',
        truth,
      );
    }
    if (workflow.canVerify) {
      return presentation(
        'verify-staging',
        verification.state === 'failed' ? 'Verification needs attention' : 'Ready to verify',
        'Verify the exact staged artifact on this page.',
        verification.state === 'failed' ? 'warning' : 'ready',
        truth,
      );
    }
    return presentation(
      'none',
      'Current in staging',
      'Exact browser verification is unavailable in this session.',
      'neutral',
      truth,
    );
  }

  if (release.status === 'current') {
    return presentation(
      workflow?.canVerify ? 'verify-staging' : 'none',
      'Current in staging',
      workflow?.canVerify
        ? 'Verify the exact staged artifact on this page.'
        : 'Exact browser verification is not connected yet.',
      'ready',
      truth,
    );
  }

  return presentation(
    'publish-staging',
    'Ready for staging',
    'Publish the saved draft without choosing an environment.',
    'ready',
    truth,
  );
}

export function authoringReleaseTruth(
  workflow: AuthoringReleaseWorkflowState | null,
  release: AuthoringReleaseViewState,
): string {
  const draft = stageLabel('Draft', workflow?.draft.version);
  let staging = 'Staging not published';
  if (workflow?.staging) {
    staging = `${stageLabel('Staging', workflow.staging.version)} ${verificationLabel(
      workflow.staging.verification.state,
    )}`;
  } else if (release.status === 'current') {
    staging = 'Staging current';
  }
  const production = workflow?.production
    ? stageLabel('Production', workflow.production.version)
    : 'Production not published';
  return `${draft} · ${staging} · ${production}`;
}

function presentation(
  action: AuthoringReleaseAction,
  title: string,
  detail: string,
  tone: AuthoringReleasePresentation['tone'],
  truth: string,
): AuthoringReleasePresentation {
  return {
    action,
    actionLabel: RELEASE_ACTION_LABELS[action],
    detail,
    title,
    tone,
    truth,
  };
}

const RELEASE_ACTION_LABELS: Record<AuthoringReleaseAction, string | null> = {
  none: null,
  'review-blockers': 'Review blockers',
  'publish-staging': 'Publish to staging',
  'verify-staging': 'Verify on staging',
  'promote-production': 'Promote to production',
  'request-approval': 'Request approval',
  'approve-production': 'Approve & promote',
  retry: 'Try again',
};

function stageLabel(label: string, version: number | undefined): string {
  return typeof version === 'number' ? `${label} v${version}` : label;
}

function verificationLabel(state: AuthoringVerificationState): string {
  if (state === 'passed') return 'verified';
  if (state === 'running') return 'verifying';
  if (state === 'failed') return 'needs review';
  return 'unverified';
}

function stagingMatchesCurrentDraft(workflow: AuthoringReleaseWorkflowState): boolean {
  if (!workflow.staging || workflow.draft.dirty) return false;
  return Boolean(
    workflow.draft.contentHash && workflow.staging.contentHash === workflow.draft.contentHash,
  );
}

function productionMatchesCurrentDraft(workflow: AuthoringReleaseWorkflowState): boolean {
  if (!workflow.production || !workflow.staging || workflow.draft.dirty) return false;
  return Boolean(
    workflow.draft.contentHash &&
    workflow.production.contentHash === workflow.draft.contentHash &&
    workflow.production.artifactId === workflow.staging.artifactId,
  );
}
