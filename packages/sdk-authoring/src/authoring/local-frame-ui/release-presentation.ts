import type {
  AuthoringReleaseWorkflowState,
  AuthoringVerificationState,
} from '../local-frame-types';
import type { AuthoringReleaseViewState } from './types';
import { authoringText } from '../../i18n';

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
      authoringText('Checking release truth'),
      authoringText('Confirming the saved draft.'),
      'busy',
      truth,
    );
  }
  if (release.status === 'publishing') {
    return presentation(
      'none',
      authoringText('Publishing to staging'),
      authoringText('Your authoring session stays open.'),
      'busy',
      truth,
    );
  }
  if (release.status === 'unavailable') {
    const notAuthorized = release.reason === 'not_authorized';
    return presentation(
      'none',
      notAuthorized ? authoringText('Release access unavailable') : authoringText('Local preview'),
      notAuthorized
        ? authoringText('Your workspace role does not include release actions.')
        : authoringText('Open this experience on an authenticated staging origin to release it.'),
      'neutral',
      truth,
    );
  }
  if (release.status === 'error') {
    return presentation(
      'retry',
      authoringText('Release truth could not be refreshed'),
      authoringText('Your draft is safe. Try the release check again.'),
      'danger',
      truth,
    );
  }
  if (blockerCount > 0 || release.status === 'blocked') {
    return presentation(
      'review-blockers',
      blockerCount > 0
        ? authoringText('{count} to fix before release', { count: blockerCount })
        : authoringText('Release needs attention'),
      release.reason === 'open_in_staging'
        ? authoringText('Open this exact page on the configured staging origin.')
        : authoringText('Review the first blocking check without leaving the product page.'),
      'warning',
      truth,
    );
  }

  if (workflow && productionMatchesCurrentDraft(workflow)) {
    return presentation(
      'none',
      authoringText('Live in production'),
      authoringText('Production points to the exact verified staged artifact.'),
      'success',
      truth,
    );
  }

  if (workflow && stagingMatchesCurrentDraft(workflow)) {
    const verification = workflow.staging!.verification;
    if (verification.state === 'running') {
      return presentation(
        'none',
        authoringText('Verifying on staging'),
        authoringText('Running the exact published artifact on this page.'),
        'busy',
        truth,
      );
    }
    if (verification.state === 'passed') {
      if (canApproveAndPromote(workflow)) {
        return presentation(
          'approve-production',
          authoringText('Approval ready for you'),
          authoringText('Approve and promote the exact verified artifact with no rebuild.'),
          'warning',
          truth,
        );
      }
      if (workflow.approval === 'requested') {
        return presentation(
          'none',
          authoringText('Approval requested'),
          authoringText('The verified artifact stays unchanged while approval is collected.'),
          'warning',
          truth,
        );
      }
      if (workflow.approval === 'required') {
        return presentation(
          'request-approval',
          authoringText('Approval required'),
          authoringText('The verified artifact stays unchanged while approval is collected.'),
          'warning',
          truth,
        );
      }
      if (workflow.canPromote) {
        return presentation(
          'promote-production',
          authoringText('Ready for production'),
          authoringText('Promote the exact staged artifact with no rebuild.'),
          'ready',
          truth,
        );
      }
      return presentation(
        'none',
        authoringText('Staging verified'),
        authoringText('A workspace releaser can promote this exact artifact.'),
        'success',
        truth,
      );
    }
    if (workflow.canVerify) {
      return presentation(
        'verify-staging',
        verification.state === 'failed'
          ? authoringText('Verification needs attention')
          : authoringText('Ready to verify'),
        authoringText('Verify the exact staged artifact on this page.'),
        verification.state === 'failed' ? 'warning' : 'ready',
        truth,
      );
    }
    return presentation(
      'none',
      authoringText('Current in staging'),
      authoringText('Exact browser verification is unavailable in this session.'),
      'neutral',
      truth,
    );
  }

  if (release.status === 'current') {
    return presentation(
      workflow?.canVerify ? 'verify-staging' : 'none',
      authoringText('Current in staging'),
      workflow?.canVerify
        ? authoringText('Verify the exact staged artifact on this page.')
        : authoringText('Exact browser verification is not connected yet.'),
      'ready',
      truth,
    );
  }

  return presentation(
    'publish-staging',
    authoringText('Ready for staging'),
    authoringText('Publish the saved draft without choosing an environment.'),
    'ready',
    truth,
  );
}

export function authoringReleaseTruth(
  workflow: AuthoringReleaseWorkflowState | null,
  release: AuthoringReleaseViewState,
): string {
  const draft = stageLabel(authoringText('Draft'), workflow?.draft.version);
  let staging = authoringText('Staging not published');
  if (workflow?.staging) {
    staging = `${stageLabel(authoringText('Staging'), workflow.staging.version)} ${verificationLabel(
      workflow.staging.verification.state,
    )}`;
  } else if (release.status === 'current') {
    staging = authoringText('Staging current');
  }
  const production = workflow?.production
    ? stageLabel(authoringText('Production'), workflow.production.version)
    : authoringText('Production not published');
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
  'review-blockers': authoringText('Review blockers'),
  'publish-staging': authoringText('Publish to staging'),
  'verify-staging': authoringText('Verify on staging'),
  'promote-production': authoringText('Promote to production'),
  'request-approval': authoringText('Request approval'),
  'approve-production': authoringText('Approve & promote'),
  retry: authoringText('Try again'),
};

function stageLabel(label: string, version: number | undefined): string {
  return typeof version === 'number' ? `${label} v${version}` : label;
}

function verificationLabel(state: AuthoringVerificationState): string {
  if (state === 'passed') return authoringText('verified');
  if (state === 'running') return authoringText('verifying');
  if (state === 'failed') return authoringText('needs review');
  return authoringText('unverified');
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
