import { validate } from '@lodariq/schema';
import { describe, expect, it } from 'vitest';
import {
  EnvironmentPolicyDecision,
  EnvironmentPolicyReleaseEvaluationRequest,
  FIXTURE_WORKSPACE_ENVIRONMENT_POLICY_IDS,
  WorkspaceEnvironmentPolicy,
  WorkspaceEnvironmentPolicyIds,
  canAuthorInEnvironment,
  createDefaultWorkspaceEnvironmentPolicy,
  evaluateEnvironmentReleasePolicy,
  validateWorkspaceEnvironmentPolicy,
  type EnvironmentPolicyReleaseAction,
  type WorkspaceEnvironmentPolicy as WorkspaceEnvironmentPolicyValue,
  type WorkspaceEnvironmentPolicyRow,
} from '../../../schema/src/environment-policy';

const WORKSPACE_ID = 'wk_environment_policy';

function createPolicy(): WorkspaceEnvironmentPolicyValue {
  return structuredClone(
    createDefaultWorkspaceEnvironmentPolicy(WORKSPACE_ID, FIXTURE_WORKSPACE_ENVIRONMENT_POLICY_IDS),
  );
}

function environment(
  policy: WorkspaceEnvironmentPolicyValue,
  kind: WorkspaceEnvironmentPolicyRow['kind'],
): WorkspaceEnvironmentPolicyRow {
  const row = policy.environments.find((candidate) => candidate.kind === kind);
  if (!row) throw new Error(`Missing ${kind} policy fixture`);
  return row;
}

function releaseDecision(
  row: WorkspaceEnvironmentPolicyRow,
  action: EnvironmentPolicyReleaseAction,
  overrides: {
    actorRole?: 'owner' | 'admin' | 'member' | 'viewer';
    actorUserId?: string;
    sourceEnvironmentId?: string;
    sourceVerified?: boolean;
    sourceVerifiedByUserId?: string;
    approvedByUserIds?: string[];
  } = {},
) {
  const { sourceEnvironmentId, ...commonOverrides } = overrides;
  const identity = {
    environment: row,
    actorRole: 'admin',
    actorUserId: 'user_publisher',
    ...commonOverrides,
  } as const;
  if (action === 'promote') {
    return evaluateEnvironmentReleasePolicy({
      ...identity,
      action,
      sourceEnvironmentId:
        sourceEnvironmentId ?? row.promotionSourceEnvironmentId ?? 'env_unconfigured',
    });
  }
  return evaluateEnvironmentReleasePolicy({ ...identity, action });
}

function sourceIssueCodes(policy: WorkspaceEnvironmentPolicyValue): string[] {
  return validateWorkspaceEnvironmentPolicy(policy)
    .issues.map((issue) => issue.code)
    .filter((code) => code.startsWith('promotion_source_'));
}

describe('workspace environment policy contracts', () => {
  it('creates exactly one safe fixed row per tier while preserving current release defaults', () => {
    const policy = createPolicy();
    const development = environment(policy, 'development');
    const staging = environment(policy, 'staging');
    const production = environment(policy, 'production');

    expect(validate(WorkspaceEnvironmentPolicy, policy).valid).toBe(true);
    expect(validateWorkspaceEnvironmentPolicy(policy)).toEqual({ valid: true, issues: [] });
    expect(policy.environments.map((row) => [row.kind, row.pipelinePosition])).toEqual([
      ['development', 0],
      ['staging', 1],
      ['production', 2],
    ]);
    expect(policy.environments.every((row) => row.enabled)).toBe(true);

    expect(development.authoringEnabled).toBe(true);
    expect(staging.authoringEnabled).toBe(true);
    expect(production.authoringEnabled).toBe(false);
    expect(canAuthorInEnvironment(development)).toBe(true);
    expect(canAuthorInEnvironment(staging)).toBe(true);
    expect(canAuthorInEnvironment(production)).toBe(false);

    for (const row of [development, staging]) {
      expect(row.releasePolicy).toMatchObject({
        allowDirectPublish: true,
        requireSourceVerification: false,
        requiredApprovalCount: 0,
        publisherRoles: ['owner', 'admin', 'member'],
        rollbackRoles: ['owner', 'admin'],
        unpublishRoles: ['owner', 'admin'],
        separationOfDuties: {
          requireSeparateVerifier: false,
          requireSeparateApprover: false,
        },
      });
    }
    expect(production).toMatchObject({
      promotionSourceEnvironmentId: 'env_staging',
      releasePolicy: {
        allowDirectPublish: false,
        requireSourceVerification: true,
        requiredApprovalCount: 0,
        publisherRoles: ['owner', 'admin'],
        rollbackRoles: ['owner', 'admin'],
        unpublishRoles: ['owner', 'admin'],
        separationOfDuties: {
          requireSeparateVerifier: false,
          requireSeparateApprover: false,
        },
      },
    });
  });

  it('binds defaults to the persisted opaque environment ids supplied by the workspace', () => {
    const opaqueIds = {
      development: 'env_019fe7e1-004b-7998-8fef-2e82b2fe9011',
      staging: 'env_019fe7e1-004b-7998-8fef-2e82b2fe9022',
      production: 'env_019fe7e1-004b-7998-8fef-2e82b2fe9033',
    } as const;
    const policy = createDefaultWorkspaceEnvironmentPolicy(WORKSPACE_ID, opaqueIds);

    expect(validate(WorkspaceEnvironmentPolicyIds, opaqueIds).valid).toBe(true);
    expect(policy.environments.map((row) => row.id)).toEqual([
      opaqueIds.development,
      opaqueIds.staging,
      opaqueIds.production,
    ]);
    expect(environment(policy, 'production').promotionSourceEnvironmentId).toBe(opaqueIds.staging);
    expect(validateWorkspaceEnvironmentPolicy(policy)).toEqual({ valid: true, issues: [] });
  });

  it('keeps every persisted policy layer closed and bounded', () => {
    const policy = createPolicy();
    const staging = environment(policy, 'staging');

    expect(validate(WorkspaceEnvironmentPolicy, { ...policy, unexpected: true }).valid).toBe(false);
    expect(
      validate(WorkspaceEnvironmentPolicy, {
        ...policy,
        environments: [
          { ...policy.environments[0], unexpected: true },
          ...policy.environments.slice(1),
        ],
      }).valid,
    ).toBe(false);
    expect(
      validate(WorkspaceEnvironmentPolicy, {
        ...policy,
        environments: policy.environments.map((row) =>
          row.kind === 'staging'
            ? { ...row, releasePolicy: { ...row.releasePolicy, unexpected: true } }
            : row,
        ),
      }).valid,
    ).toBe(false);
    expect(
      validate(WorkspaceEnvironmentPolicy, {
        ...policy,
        environments: policy.environments.map((row) =>
          row.kind === 'staging'
            ? {
                ...row,
                releasePolicy: {
                  ...row.releasePolicy,
                  separationOfDuties: {
                    ...row.releasePolicy.separationOfDuties,
                    unexpected: true,
                  },
                },
              }
            : row,
        ),
      }).valid,
    ).toBe(false);
    expect(
      validate(WorkspaceEnvironmentPolicy, {
        ...policy,
        environments: policy.environments.map((row) =>
          row.kind === 'staging'
            ? { ...row, releasePolicy: { ...row.releasePolicy, requiredApprovalCount: 2 } }
            : row,
        ),
      }).valid,
    ).toBe(false);
    expect(
      validate(WorkspaceEnvironmentPolicy, {
        ...policy,
        environments: [...policy.environments, structuredClone(staging)],
      }).valid,
    ).toBe(false);
    expect(
      validate(EnvironmentPolicyReleaseEvaluationRequest, {
        environment: staging,
        action: 'direct-publish',
        actorRole: 'member',
        actorUserId: 'user_member',
        unexpected: true,
      }).valid,
    ).toBe(false);
    for (const action of ['direct-publish', 'rollback', 'unpublish'] as const) {
      expect(
        validate(EnvironmentPolicyReleaseEvaluationRequest, {
          environment: staging,
          action,
          actorRole: 'member',
          actorUserId: 'user_member',
          sourceEnvironmentId: 'env_development',
        }).valid,
      ).toBe(false);
    }
    expect(
      validate(EnvironmentPolicyReleaseEvaluationRequest, {
        environment: environment(policy, 'production'),
        action: 'promote',
        actorRole: 'admin',
        actorUserId: 'user_admin',
      }).valid,
    ).toBe(false);
    expect(
      validate(EnvironmentPolicyReleaseEvaluationRequest, {
        environment: environment(policy, 'production'),
        action: 'promote',
        actorRole: 'admin',
        actorUserId: 'user_admin',
        sourceEnvironmentId: staging.id,
      }).valid,
    ).toBe(true);
  });

  it('excludes viewers from publishing and members/viewers from recovery policy roles', () => {
    const policy = createPolicy();

    const viewerPublisher = {
      ...policy,
      environments: policy.environments.map((row) => ({
        ...row,
        releasePolicy: { ...row.releasePolicy, publisherRoles: ['viewer'] },
      })),
    };
    expect(validate(WorkspaceEnvironmentPolicy, viewerPublisher).valid).toBe(false);

    const memberRecovery = {
      ...policy,
      environments: policy.environments.map((row) => ({
        ...row,
        releasePolicy: { ...row.releasePolicy, rollbackRoles: ['member'] },
      })),
    };
    expect(validate(WorkspaceEnvironmentPolicy, memberRecovery).valid).toBe(false);
  });

  it('rejects member publisher authority on production and evaluates that invalid policy closed', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');
    production.releasePolicy.publisherRoles = ['owner', 'admin', 'member'];

    expect(validate(WorkspaceEnvironmentPolicy, policy).valid).toBe(true);
    expect(validateWorkspaceEnvironmentPolicy(policy).issues).toContainEqual({
      code: 'production_publisher_role_forbidden',
      field: 'releasePolicy.publisherRoles',
      environmentId: production.id,
    });
    expect(
      releaseDecision(production, 'promote', {
        actorRole: 'admin',
        sourceVerified: true,
      }),
    ).toMatchObject({ allowed: false, code: 'role_forbidden' });
  });

  it('reports duplicate kinds and positions deterministically', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');
    production.kind = 'staging';
    production.pipelinePosition = 1;
    delete production.promotionSourceEnvironmentId;

    expect(validateWorkspaceEnvironmentPolicy(policy)).toEqual({
      valid: false,
      issues: [
        { code: 'environment_kind_duplicate', field: 'kind', environmentId: 'env_staging' },
        { code: 'environment_kind_missing', field: 'kind' },
        {
          code: 'pipeline_position_duplicate',
          field: 'pipelinePosition',
          environmentId: 'env_staging',
        },
      ],
    });
  });

  it('rejects duplicate stable environment ids', () => {
    const policy = createPolicy();
    environment(policy, 'production').id = 'env_staging';

    expect(validateWorkspaceEnvironmentPolicy(policy).issues).toContainEqual({
      code: 'environment_id_duplicate',
      field: 'id',
      environmentId: 'env_staging',
    });
  });

  it('rejects a unique but noncanonical pipeline position for every fixed kind', () => {
    const policy = createPolicy();
    environment(policy, 'development').pipelinePosition = 2;
    environment(policy, 'production').pipelinePosition = 0;

    expect(validateWorkspaceEnvironmentPolicy(policy).issues).toEqual(
      expect.arrayContaining([
        {
          code: 'pipeline_position_invalid',
          field: 'pipelinePosition',
          environmentId: 'env_development',
        },
        {
          code: 'pipeline_position_invalid',
          field: 'pipelinePosition',
          environmentId: 'env_production',
        },
      ]),
    );
  });

  it('forces production authoring off in validation and evaluation', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');
    production.authoringEnabled = true;

    expect(validateWorkspaceEnvironmentPolicy(policy).issues).toContainEqual({
      code: 'production_authoring_forbidden',
      field: 'authoringEnabled',
      environmentId: 'env_production',
    });
    expect(canAuthorInEnvironment(production)).toBe(false);

    const staging = environment(policy, 'staging');
    staging.enabled = false;
    expect(canAuthorInEnvironment(staging)).toBe(false);
  });
});

describe('environment policy origin validation', () => {
  it('accepts canonical HTTPS origins and localhost HTTP only outside production', () => {
    const policy = createPolicy();
    environment(policy, 'development').allowedOrigins = [
      'http://localhost:5175',
      'http://127.0.0.1:5175',
    ];
    environment(policy, 'staging').allowedOrigins = [
      'http://[::1]:4173',
      'https://staging.example.com',
    ];
    environment(policy, 'production').allowedOrigins = ['https://app.example.com'];

    expect(validateWorkspaceEnvironmentPolicy(policy)).toEqual({ valid: true, issues: [] });
  });

  it.each([
    ['production', 'http://localhost:3000', 'production_https_required'],
    ['staging', 'http://staging.example.com', 'http_localhost_only'],
    ['development', 'https://*.example.com', 'origin_invalid'],
    ['staging', 'https://user:password@example.com', 'origin_invalid'],
    ['staging', 'https://staging.example.com/path', 'origin_invalid'],
    ['staging', 'https://staging.example.com?preview=1', 'origin_invalid'],
    ['staging', 'https://staging.example.com#preview', 'origin_invalid'],
    ['staging', 'https://staging.example.com/', 'origin_invalid'],
  ] as const)('rejects %s origin %s with %s', (kind, origin, expectedCode) => {
    const policy = createPolicy();
    const row = environment(policy, kind);
    row.allowedOrigins = [origin];

    expect(validateWorkspaceEnvironmentPolicy(policy).issues).toContainEqual({
      code: expectedCode,
      field: 'allowedOrigins',
      environmentId: row.id,
    });
  });
});

describe('environment promotion pipeline validation', () => {
  it('accepts only the enabled staging row as the production promotion source', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');
    production.promotionSourceEnvironmentId = 'env_staging';

    expect(sourceIssueCodes(policy)).toEqual([]);

    production.promotionSourceEnvironmentId = 'env_development';
    expect(sourceIssueCodes(policy)).toEqual(['promotion_source_kind_forbidden']);
  });

  it('rejects missing, self, cross-workspace, disabled, and later promotion sources', () => {
    const unconfigured = createPolicy();
    delete environment(unconfigured, 'production').promotionSourceEnvironmentId;
    expect(sourceIssueCodes(unconfigured)).toEqual(['promotion_source_missing']);

    const missing = createPolicy();
    environment(missing, 'production').promotionSourceEnvironmentId = 'env_missing';
    expect(sourceIssueCodes(missing)).toEqual(['promotion_source_missing']);

    const self = createPolicy();
    environment(self, 'production').promotionSourceEnvironmentId = 'env_production';
    expect(sourceIssueCodes(self)).toEqual(['promotion_source_self']);

    const crossWorkspace = createPolicy();
    environment(crossWorkspace, 'staging').workspaceId = 'wk_other';
    expect(sourceIssueCodes(crossWorkspace)).toEqual(['promotion_source_workspace_mismatch']);

    const disabled = createPolicy();
    environment(disabled, 'staging').enabled = false;
    expect(sourceIssueCodes(disabled)).toEqual(['promotion_source_disabled']);

    const disabledPipeline = createPolicy();
    environment(disabledPipeline, 'production').enabled = false;
    environment(disabledPipeline, 'staging').enabled = false;
    expect(sourceIssueCodes(disabledPipeline)).toEqual([]);

    const later = createPolicy();
    environment(later, 'staging').promotionSourceEnvironmentId = 'env_production';
    expect(sourceIssueCodes(later)).toEqual(['promotion_source_kind_forbidden']);
  });
});

describe('environment release policy evaluation', () => {
  it('preserves member publishing outside production and explicit production authority', () => {
    const policy = createPolicy();
    const staging = environment(policy, 'staging');
    const production = environment(policy, 'production');

    expect(
      releaseDecision(staging, 'direct-publish', {
        actorRole: 'member',
        actorUserId: 'user_member',
      }),
    ).toMatchObject({ allowed: true, code: 'allowed' });
    expect(
      releaseDecision(staging, 'direct-publish', {
        actorRole: 'viewer',
        actorUserId: 'user_viewer',
      }),
    ).toMatchObject({ allowed: false, code: 'role_forbidden' });
    expect(
      releaseDecision(production, 'promote', {
        actorRole: 'member',
        actorUserId: 'user_member',
        sourceVerified: true,
      }),
    ).toMatchObject({ allowed: false, code: 'role_forbidden' });
    expect(
      releaseDecision(production, 'promote', {
        sourceVerified: true,
      }),
    ).toMatchObject({ allowed: true, code: 'allowed' });
    expect(releaseDecision(production, 'direct-publish')).toMatchObject({
      allowed: false,
      code: 'direct_publish_forbidden',
    });
  });

  it('uses explicit rollback and unpublish role lists and fails closed when disabled', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');

    for (const action of ['rollback', 'unpublish'] as const) {
      expect(releaseDecision(production, action)).toMatchObject({
        allowed: true,
        code: 'allowed',
      });
      expect(
        releaseDecision(production, action, {
          actorRole: 'member',
          actorUserId: 'user_member',
        }),
      ).toMatchObject({ allowed: false, code: 'role_forbidden' });
    }

    production.enabled = false;
    expect(releaseDecision(production, 'rollback')).toMatchObject({
      allowed: false,
      code: 'environment_disabled',
    });
  });

  it('requires a configured source for promotion', () => {
    const policy = createPolicy();
    const staging = environment(policy, 'staging');

    expect(releaseDecision(staging, 'promote')).toMatchObject({
      allowed: false,
      code: 'promotion_source_required',
    });
  });

  it('requires the actual promotion source to exactly match the configured source id', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');

    expect(
      releaseDecision(production, 'promote', {
        sourceEnvironmentId: 'env_development',
        sourceVerified: true,
      }),
    ).toEqual({
      allowed: false,
      code: 'promotion_source_mismatch',
      message: 'The release source does not match the configured environment',
    });
    expect(
      releaseDecision(production, 'promote', {
        sourceEnvironmentId: 'env_staging',
        sourceVerified: true,
      }),
    ).toMatchObject({ allowed: true, code: 'allowed' });
  });

  it('enforces source verification, one approval, and basic separation of duties', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');
    production.releasePolicy.requiredApprovalCount = 1;
    production.releasePolicy.separationOfDuties = {
      requireSeparateVerifier: true,
      requireSeparateApprover: true,
    };

    expect(releaseDecision(production, 'promote')).toMatchObject({
      allowed: false,
      code: 'source_verification_required',
    });
    expect(
      releaseDecision(production, 'promote', {
        sourceVerified: true,
        sourceVerifiedByUserId: 'user_publisher',
        approvedByUserIds: ['user_approver'],
      }),
    ).toMatchObject({ allowed: false, code: 'separation_of_duties_required' });
    expect(
      releaseDecision(production, 'promote', {
        sourceVerified: true,
        sourceVerifiedByUserId: 'user_verifier',
      }),
    ).toMatchObject({ allowed: false, code: 'approval_required' });
    expect(
      releaseDecision(production, 'promote', {
        sourceVerified: true,
        sourceVerifiedByUserId: 'user_verifier',
        approvedByUserIds: ['user_publisher'],
      }),
    ).toMatchObject({ allowed: false, code: 'separation_of_duties_required' });

    const allowed = releaseDecision(production, 'promote', {
      sourceVerified: true,
      sourceVerifiedByUserId: 'user_verifier',
      approvedByUserIds: ['user_approver'],
    });
    expect(allowed).toEqual({
      allowed: true,
      code: 'allowed',
      message: 'The release action is allowed by the environment policy',
    });
    expect(validate(EnvironmentPolicyDecision, allowed).valid).toBe(true);
  });

  it('does not mutate policy inputs while producing deterministic decisions', () => {
    const policy = createPolicy();
    const production = environment(policy, 'production');
    const before = structuredClone(policy);

    const first = releaseDecision(production, 'promote', { sourceVerified: true });
    const second = releaseDecision(production, 'promote', { sourceVerified: true });

    expect(first).toEqual(second);
    expect(policy).toEqual(before);
  });
});
