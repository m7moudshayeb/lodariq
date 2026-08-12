import { describe, expect, it } from 'vitest';
import {
  authoringReleaseTruth,
  canApproveAndPromote,
  deriveAuthoringReleasePresentation,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/release-presentation';
import type { AuthoringReleaseWorkflowState } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-types';
import type { AuthoringReleaseViewState } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/types';

const readyRelease: AuthoringReleaseViewState = {
  status: 'ready',
  reason: 'ready',
  expectedGeneration: 3,
  findings: [],
};

describe('Slice 3 authoring release presentation', () => {
  it('derives one contextual action without an environment picker', () => {
    expect(
      deriveAuthoringReleasePresentation({
        blockerCount: 0,
        release: readyRelease,
        workflow: null,
      }),
    ).toMatchObject({ action: 'publish-staging', actionLabel: 'Publish to staging' });

    const staged = workflow({ verification: 'not-run' });
    expect(
      deriveAuthoringReleasePresentation({
        blockerCount: 0,
        release: { ...readyRelease, status: 'current', reason: 'current' },
        workflow: staged,
      }),
    ).toMatchObject({ action: 'verify-staging', actionLabel: 'Verify on staging' });

    const verified = workflow({ verification: 'passed' });
    expect(
      deriveAuthoringReleasePresentation({
        blockerCount: 0,
        release: { ...readyRelease, status: 'current', reason: 'current' },
        workflow: verified,
      }),
    ).toMatchObject({
      action: 'promote-production',
      actionLabel: 'Promote to production',
    });
  });

  it('requires deliberate approval without changing the verified artifact', () => {
    const state = workflow({ verification: 'passed', approval: 'required' });
    const presentation = deriveAuthoringReleasePresentation({
      blockerCount: 0,
      release: { ...readyRelease, status: 'current', reason: 'current' },
      workflow: state,
    });

    expect(presentation.action).toBe('request-approval');
    expect(presentation.detail).toContain('artifact stays unchanged');
  });

  it('offers explicit approval only to an authorized approver with a pending operation', () => {
    const requested = workflow({ verification: 'passed', approval: 'requested' });

    expect(
      canApproveAndPromote({
        ...requested,
        canApprove: true,
        approvalOperationId: 'operation_release_1',
      }),
    ).toBe(true);
    expect(canApproveAndPromote({ ...requested, canApprove: false })).toBe(false);
    expect(canApproveAndPromote({ ...requested, canApprove: true })).toBe(false);
    expect(
      canApproveAndPromote({
        ...requested,
        approval: 'required',
        canApprove: true,
        approvalOperationId: 'operation_release_1',
      }),
    ).toBe(false);

    const presentation = deriveAuthoringReleasePresentation({
      blockerCount: 0,
      release: { ...readyRelease, status: 'current', reason: 'current' },
      workflow: {
        ...requested,
        canApprove: true,
        approvalOperationId: 'operation_release_1',
      },
    });
    expect(presentation).toMatchObject({
      action: 'approve-production',
      actionLabel: 'Approve & promote',
    });
  });

  it('reports production live only when it matches the current draft', () => {
    const state = workflow({ verification: 'passed', productionMatches: true });
    const presentation = deriveAuthoringReleasePresentation({
      blockerCount: 0,
      release: { ...readyRelease, status: 'current', reason: 'current' },
      workflow: state,
    });

    expect(presentation).toMatchObject({ action: 'none', title: 'Live in production' });
    expect(authoringReleaseTruth(state, readyRelease)).toBe(
      'Draft v13 · Staging v12 verified · Production v12',
    );
  });
});

function workflow({
  verification,
  approval = 'not-required',
  productionMatches = false,
}: {
  verification: 'not-run' | 'passed';
  approval?: AuthoringReleaseWorkflowState['approval'];
  productionMatches?: boolean;
}): AuthoringReleaseWorkflowState {
  return {
    draft: { version: 13, contentHash: 'sha256-current', dirty: false },
    staging: {
      version: 12,
      artifactId: 'artifact_staging_12',
      contentHash: 'sha256-current',
      verification: { state: verification, checks: [] },
    },
    production: productionMatches
      ? {
          version: 12,
          artifactId: 'artifact_staging_12',
          contentHash: 'sha256-current',
        }
      : null,
    canVerify: true,
    canPromote: true,
    approval,
  };
}
