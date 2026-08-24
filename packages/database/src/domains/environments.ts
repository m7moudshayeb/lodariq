import {
  ENVIRONMENT_PIPELINE_POSITION_BY_KIND,
  EnvironmentReleasePolicy as EnvironmentReleasePolicySchema,
  WorkspaceEnvironmentPolicy as WorkspaceEnvironmentPolicySchema,
  createDefaultEnvironmentReleasePolicy,
  defaultEnvironmentGovernanceCapabilities,
  validate,
  validateWorkspaceEnvironmentPolicy,
  type Environment,
  type EnvironmentPolicyValidationIssue,
  type EnvironmentReleasePolicy,
  type EnvironmentGovernanceCapability,
  type WorkspaceEnvironmentPolicy,
  type WorkspaceEnvironmentPolicyRow,
} from '@lodariq/schema';

/*
 * Keep repository contracts structural and schema-backed. Release routes may
 * evolve, but every pointer mutation must carry the same canonical guard.
 */

export interface WorkspaceEnvironment {
  id: string;
  workspaceId: string;
  kind: Environment;
  name: string;
  originAllowlist: string[];
  /** Defaults to zero for pre-policy seeds and persisted rows. */
  requiredApprovalCount?: 0 | 1;
  /** Additive policy fields. Legacy fixtures are normalized to safe defaults. */
  enabled?: boolean;
  pipelinePosition?: number;
  authoringEnabled?: boolean;
  promotionSourceEnvironmentId?: string;
  releasePolicy?: EnvironmentReleasePolicy;
  /** Explicit upper bound for human authority in this environment. */
  governanceCapabilities?: EnvironmentGovernanceCapability[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateEnvironmentReleasePolicyInput {
  workspaceId: string;
  environmentId: string;
  requiredApprovalCount: 0 | 1;
  expectedUpdatedAt: string;
  actorUserId: string;
}

export interface UpdateWorkspaceEnvironmentPolicyInput {
  workspaceId: string;
  environmentId: string;
  name: string;
  originAllowlist: string[];
  enabled: boolean;
  pipelinePosition: 0 | 1 | 2;
  authoringEnabled: boolean;
  promotionSourceEnvironmentId?: string;
  releasePolicy: EnvironmentReleasePolicy;
  governanceCapabilities?: EnvironmentGovernanceCapability[];
  expectedUpdatedAt: string;
  actorUserId: string;
}

export const ENVIRONMENT_RELEASE_POLICY_CHANGED_ERROR_CODE =
  'environment_release_policy_changed' as const;

export class EnvironmentReleasePolicyChangedError extends Error {
  readonly code = ENVIRONMENT_RELEASE_POLICY_CHANGED_ERROR_CODE;

  constructor(
    readonly expectedUpdatedAt: string,
    readonly actualUpdatedAt: string,
  ) {
    super('environment release policy changed before this update');
    this.name = 'EnvironmentReleasePolicyChangedError';
  }
}

export const WORKSPACE_ENVIRONMENT_POLICY_INVALID_ERROR_CODE =
  'workspace_environment_policy_invalid' as const;

export class WorkspaceEnvironmentPolicyInvalidError extends Error {
  readonly code = WORKSPACE_ENVIRONMENT_POLICY_INVALID_ERROR_CODE;

  constructor(readonly issues: EnvironmentPolicyValidationIssue[]) {
    super('workspace environment policy is invalid');
    this.name = 'WorkspaceEnvironmentPolicyInvalidError';
  }
}

export class EnvironmentPolicyMutationForbiddenError extends Error {
  readonly code = 'environment_policy_forbidden' as const;

  constructor(
    readonly decisionCode:
      | 'environment_disabled'
      | 'direct_publish_forbidden'
      | 'promotion_source_mismatch'
      | 'role_forbidden'
      | 'separation_of_duties_required',
  ) {
    super('the current environment policy forbids this release mutation');
    this.name = 'EnvironmentPolicyMutationForbiddenError';
  }
}

export type NormalizedWorkspaceEnvironment = WorkspaceEnvironment & {
  requiredApprovalCount: 0 | 1;
  enabled: boolean;
  pipelinePosition: 0 | 1 | 2;
  authoringEnabled: boolean;
  releasePolicy: EnvironmentReleasePolicy;
  governanceCapabilities: EnvironmentGovernanceCapability[];
};

/**
 * Compatibility adapter for legacy fixtures and the additive persisted fields.
 * Production rows always resolve to the real opaque staging ID in this workspace.
 */
export function normalizeWorkspaceEnvironments(
  environments: readonly WorkspaceEnvironment[],
): NormalizedWorkspaceEnvironment[] {
  const stagingIds = environments
    .filter((environment) => environment.kind === 'staging')
    .map((environment) => environment.id)
    .sort();
  const defaultPromotionSourceEnvironmentId = stagingIds.length === 1 ? stagingIds[0] : undefined;

  return environments
    .map((environment): NormalizedWorkspaceEnvironment => {
      const defaultReleasePolicy = createDefaultEnvironmentReleasePolicy(environment.kind);
      if (
        environment.requiredApprovalCount !== undefined &&
        environment.releasePolicy !== undefined &&
        environment.requiredApprovalCount !== environment.releasePolicy.requiredApprovalCount
      ) {
        throw new WorkspaceEnvironmentPolicyInvalidError([
          {
            code: 'contract_invalid',
            field: 'requiredApprovalCount',
            environmentId: environment.id,
          },
        ]);
      }
      const requiredApprovalCount = normalizeEnvironmentApprovalCount(
        environment.requiredApprovalCount ?? environment.releasePolicy?.requiredApprovalCount ?? 0,
        environment.id,
      );
      const releasePolicyCandidate = environment.releasePolicy
        ? clone(environment.releasePolicy)
        : { ...defaultReleasePolicy, requiredApprovalCount };
      const releasePolicyValidation = validate(
        EnvironmentReleasePolicySchema,
        releasePolicyCandidate,
      );
      if (!releasePolicyValidation.valid) {
        throw new WorkspaceEnvironmentPolicyInvalidError([
          { code: 'contract_invalid', field: 'releasePolicy', environmentId: environment.id },
        ]);
      }
      const releasePolicy = releasePolicyValidation.value;
      const originAllowlist = normalizeEnvironmentOriginAllowlist(
        environment.originAllowlist,
        environment.kind,
        environment.id,
      );
      const promotionSourceEnvironmentId =
        environment.promotionSourceEnvironmentId ??
        (environment.kind === 'production' ? defaultPromotionSourceEnvironmentId : undefined);

      return {
        ...clone(environment),
        originAllowlist,
        requiredApprovalCount,
        enabled: environment.enabled ?? true,
        pipelinePosition: normalizeEnvironmentPipelinePosition(
          environment.pipelinePosition,
          environment.kind,
          environment.id,
        ),
        authoringEnabled: environment.authoringEnabled ?? environment.kind !== 'production',
        ...(promotionSourceEnvironmentId ? { promotionSourceEnvironmentId } : {}),
        releasePolicy,
        governanceCapabilities:
          environment.governanceCapabilities ??
          defaultEnvironmentGovernanceCapabilities(environment.kind),
      };
    })
    .sort(compareWorkspaceEnvironmentsByPipeline);
}

export function toWorkspaceEnvironmentPolicyRow(
  environment: WorkspaceEnvironment,
): WorkspaceEnvironmentPolicyRow {
  const normalized = normalizeWorkspaceEnvironments([environment])[0];
  if (!normalized) throw new Error('environment policy row is unavailable');
  return {
    id: normalized.id,
    workspaceId: normalized.workspaceId,
    kind: normalized.kind,
    displayName: normalized.name,
    enabled: normalized.enabled,
    pipelinePosition: normalized.pipelinePosition,
    allowedOrigins: [...normalized.originAllowlist],
    authoringEnabled: normalized.authoringEnabled,
    governanceCapabilities: [...normalized.governanceCapabilities],
    ...(normalized.promotionSourceEnvironmentId
      ? { promotionSourceEnvironmentId: normalized.promotionSourceEnvironmentId }
      : {}),
    releasePolicy: clone(normalized.releasePolicy),
  };
}

export function toWorkspaceEnvironmentPolicy(
  workspaceId: string,
  environments: readonly WorkspaceEnvironment[],
): WorkspaceEnvironmentPolicy {
  const normalized = normalizeWorkspaceEnvironments(environments);
  return {
    schemaVersion: '1',
    workspaceId,
    environments: normalized.map((environment) => ({
      id: environment.id,
      workspaceId: environment.workspaceId,
      kind: environment.kind,
      displayName: environment.name,
      enabled: environment.enabled,
      pipelinePosition: environment.pipelinePosition,
      allowedOrigins: [...environment.originAllowlist],
      authoringEnabled: environment.authoringEnabled,
      governanceCapabilities: [...environment.governanceCapabilities],
      ...(environment.promotionSourceEnvironmentId
        ? { promotionSourceEnvironmentId: environment.promotionSourceEnvironmentId }
        : {}),
      releasePolicy: clone(environment.releasePolicy),
    })),
  };
}

export function assertValidWorkspaceEnvironmentPolicy(
  workspaceId: string,
  environments: readonly WorkspaceEnvironment[],
): WorkspaceEnvironmentPolicy {
  const policy = toWorkspaceEnvironmentPolicy(workspaceId, environments);
  const contract = validate(WorkspaceEnvironmentPolicySchema, policy);
  if (!contract.valid) {
    throw new WorkspaceEnvironmentPolicyInvalidError([
      { code: 'contract_invalid', field: 'policy' },
    ]);
  }
  const result = validateWorkspaceEnvironmentPolicy(contract.value);
  if (!result.valid) throw new WorkspaceEnvironmentPolicyInvalidError(result.issues);
  return contract.value;
}

export function assertEnvironmentPolicyMutationAllowed(
  environment: WorkspaceEnvironment,
  input: {
    action: 'direct-publish' | 'promote';
    expectedUpdatedAt: string;
    sourceEnvironmentId?: string;
  },
): NormalizedWorkspaceEnvironment {
  const normalized = assertEnvironmentPolicySnapshot(environment, input.expectedUpdatedAt);
  if (!normalized.enabled) {
    throw new EnvironmentPolicyMutationForbiddenError('environment_disabled');
  }
  if (input.action === 'direct-publish' && !normalized.releasePolicy.allowDirectPublish) {
    throw new EnvironmentPolicyMutationForbiddenError('direct_publish_forbidden');
  }
  if (
    input.action === 'promote' &&
    (!input.sourceEnvironmentId ||
      normalized.promotionSourceEnvironmentId !== input.sourceEnvironmentId)
  ) {
    throw new EnvironmentPolicyMutationForbiddenError('promotion_source_mismatch');
  }
  return normalized;
}

export function assertEnvironmentPolicySnapshot(
  environment: WorkspaceEnvironment,
  expectedUpdatedAtInput: string,
): NormalizedWorkspaceEnvironment {
  const normalized = normalizeWorkspaceEnvironments([environment])[0];
  if (!normalized) throw new Error('environment policy row is unavailable');
  const expectedUpdatedAt = normalizeIsoTimestamp(
    expectedUpdatedAtInput,
    'environment policy expectedUpdatedAt',
  );
  if (normalized.updatedAt !== expectedUpdatedAt) {
    throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, normalized.updatedAt);
  }
  return normalized;
}

function normalizeEnvironmentApprovalCount(value: number, environmentId: string): 0 | 1 {
  if (value === 0 || value === 1) return value;
  throw new WorkspaceEnvironmentPolicyInvalidError([
    { code: 'contract_invalid', field: 'requiredApprovalCount', environmentId },
  ]);
}

function normalizeEnvironmentPipelinePosition(
  value: number | undefined,
  kind: WorkspaceEnvironment['kind'],
  environmentId: string,
): 0 | 1 | 2 {
  if (value === undefined) return ENVIRONMENT_PIPELINE_POSITION_BY_KIND[kind];
  if (value === 0 || value === 1 || value === 2) return value;
  throw new WorkspaceEnvironmentPolicyInvalidError([
    { code: 'contract_invalid', field: 'pipelinePosition', environmentId },
  ]);
}

function compareWorkspaceEnvironmentsByPipeline(
  left: NormalizedWorkspaceEnvironment,
  right: NormalizedWorkspaceEnvironment,
): number {
  const pipelineDifference = left.pipelinePosition - right.pipelinePosition;
  return pipelineDifference || left.id.localeCompare(right.id);
}

export function normalizeExactOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isOriginOnly = parsed.pathname === '/' && !parsed.search && !parsed.hash;
    const hasCredentials = Boolean(parsed.username || parsed.password);
    if (!isHttp || !isOriginOnly || hasCredentials || parsed.origin === 'null') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function normalizeEnvironmentOriginAllowlist(
  value: unknown,
  kind: Environment,
  environmentId: string,
): string[] {
  const invalid = (): never => {
    throw new WorkspaceEnvironmentPolicyInvalidError([
      { code: 'origin_invalid', field: 'originAllowlist', environmentId },
    ]);
  };
  if (!Array.isArray(value) || value.length > 100) return invalid();
  const origins: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (
      typeof candidate !== 'string' ||
      candidate.length < 1 ||
      candidate.length > 2048 ||
      normalizeExactOrigin(candidate) !== candidate ||
      seen.has(candidate)
    ) {
      return invalid();
    }
    const parsed = new URL(candidate);
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '[::1]');
    if (kind === 'production' && parsed.protocol !== 'https:') return invalid();
    if (parsed.protocol === 'http:' && !isLocalHttp) return invalid();
    origins.push(candidate);
    seen.add(candidate);
  }
  return origins;
}

export function normalizeIsoTimestamp(value: string, label: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
