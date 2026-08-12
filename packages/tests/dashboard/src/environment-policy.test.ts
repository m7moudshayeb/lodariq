import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultEnvironmentReleasePolicy } from '@lodariq/schema';

const mocks = vi.hoisted(() => ({
  assertDashboardWorkspaceScope: vi.fn(),
  loadControlPlaneContext: vi.fn(async () => ({
    userId: 'user_a',
    workspaceId: 'wk_a',
    role: 'owner',
  })),
  revalidatePath: vi.fn(),
  updateWorkspaceEnvironmentPolicy: vi.fn(),
}));

vi.mock('../../../../apps/dashboard/src/lib/revalidation', () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock('../../../../apps/dashboard/src/lib/api', () => ({
  assertDashboardWorkspaceScope: mocks.assertDashboardWorkspaceScope,
  loadControlPlaneContext: mocks.loadControlPlaneContext,
  approveWorkspaceTheme: vi.fn(),
  createEnvironmentToken: vi.fn(),
  createPublicSdkInstallation: vi.fn(),
  createWorkspaceTheme: vi.fn(),
  loadDocumentDebug: vi.fn(),
  loadPublicSdkInstallations: vi.fn(),
  loadWorkspaceEnvironments: vi.fn(),
  loadWorkspaceTheme: vi.fn(),
  revokeEnvironmentToken: vi.fn(),
  revokePublicSdkInstallation: vi.fn(),
  setDefaultWorkspaceTheme: vi.fn(),
  setDocumentThemeBinding: vi.fn(),
  syncPublicSdkInstallationOrigins: vi.fn(),
  updateEnvironmentReleasePolicy: vi.fn(),
  updateWorkspaceEnvironmentPolicy: mocks.updateWorkspaceEnvironmentPolicy,
  updateWorkspaceThemeDraft: vi.fn(),
  DashboardApiError: class DashboardApiError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'DashboardApiError';
      this.statusCode = statusCode;
    }
  },
}));

import { updateWorkspaceEnvironmentPolicyAction } from '../../../../apps/dashboard/src/app/actions';
import { DashboardApiError } from '../../../../apps/dashboard/src/lib/api';

const STAGING_POLICY = createDefaultEnvironmentReleasePolicy('staging');
const UPDATED_ENVIRONMENT = {
  id: 'env.staging:opaque',
  workspaceId: 'wk_a',
  kind: 'staging' as const,
  name: 'Staging',
  originAllowlist: ['https://staging.customer.example'],
  enabled: true,
  pipelinePosition: 1,
  authoringEnabled: true,
  requiredApprovalCount: STAGING_POLICY.requiredApprovalCount,
  releasePolicy: STAGING_POLICY,
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:01:00.000Z',
};

describe('@lodariq/dashboard environment policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits the complete guarded policy and revalidates after success', async () => {
    mocks.updateWorkspaceEnvironmentPolicy.mockResolvedValue({
      environment: UPDATED_ENVIRONMENT,
    });
    const input = {
      environmentId: UPDATED_ENVIRONMENT.id,
      name: UPDATED_ENVIRONMENT.name,
      originAllowlist: UPDATED_ENVIRONMENT.originAllowlist,
      enabled: true,
      pipelinePosition: 1 as const,
      authoringEnabled: true,
      releasePolicy: STAGING_POLICY,
      expectedUpdatedAt: '2026-08-09T00:00:00.000Z',
    };

    await expect(updateWorkspaceEnvironmentPolicyAction(input)).resolves.toEqual({
      status: 'success',
      message: 'Environment policy updated.',
      environment: UPDATED_ENVIRONMENT,
    });
    expect(mocks.updateWorkspaceEnvironmentPolicy).toHaveBeenCalledWith(input);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('rejects an invalid closed policy before calling the control plane', async () => {
    const result = await updateWorkspaceEnvironmentPolicyAction({
      environmentId: UPDATED_ENVIRONMENT.id,
      name: UPDATED_ENVIRONMENT.name,
      originAllowlist: UPDATED_ENVIRONMENT.originAllowlist,
      enabled: true,
      pipelinePosition: 1 as const,
      authoringEnabled: true,
      releasePolicy: { ...STAGING_POLICY, publisherRoles: [] },
      expectedUpdatedAt: '2026-08-09T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'error',
      error: 'The environment policy is invalid.',
    });
    expect(mocks.updateWorkspaceEnvironmentPolicy).not.toHaveBeenCalled();
  });

  it('surfaces policy/CAS conflicts without widening or retrying the submitted authority', async () => {
    mocks.updateWorkspaceEnvironmentPolicy.mockRejectedValue(
      new DashboardApiError(409, 'environment_policy_forbidden'),
    );
    const result = await updateWorkspaceEnvironmentPolicyAction({
      environmentId: UPDATED_ENVIRONMENT.id,
      name: UPDATED_ENVIRONMENT.name,
      originAllowlist: UPDATED_ENVIRONMENT.originAllowlist,
      enabled: true,
      pipelinePosition: 1,
      authoringEnabled: true,
      releasePolicy: STAGING_POLICY,
      expectedUpdatedAt: '2026-08-09T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'error',
      error:
        'The environment policy changed or conflicts with the release pipeline. Refresh and try again.',
    });
    expect(mocks.updateWorkspaceEnvironmentPolicy).toHaveBeenCalledOnce();
  });

  it('keeps production constraints, staging-only promotion sources, and approvals visible in the editor', () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../apps/dashboard/src/components/environment-policy-editor.tsx',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(source).toContain("candidate.kind === 'staging'");
    expect(source).toContain('label={_(COPY.requireApproval)}');
    expect(source).toContain("current.kind === 'production' ? false : submitted.authoringEnabled");
    expect(source).toContain(
      "current.kind === 'production' ? false : releasePolicy.allowDirectPublish",
    );
    expect(source).toContain(
      "current.kind === 'production' ? true : releasePolicy.requireSourceVerification",
    );
    expect(source).toContain('Policy changes never publish or recompile an artifact.');

    const actions = readFileSync(
      fileURLToPath(new URL('../../../../apps/dashboard/src/app/actions.ts', import.meta.url)),
      'utf8',
    );
    expect(actions).toContain('if (environment.enabled === false) return [];');
    expect(actions).toContain(
      "environment.kind !== 'production' && environment.authoringEnabled !== false",
    );
  });
});
