import { Type, type Static } from '@sinclair/typebox';
import { CONTROL_PLANE_ROLES } from './control-plane';

export const ENVIRONMENT_POLICY_SCHEMA_VERSION = '1' as const;

export const ENVIRONMENT_POLICY_KINDS = ['development', 'staging', 'production'] as const;

export const ENVIRONMENT_POLICY_ACTIONS = [
  'direct-publish',
  'promote',
  'rollback',
  'unpublish',
] as const;

export const ENVIRONMENT_POLICY_VALIDATION_CODES = [
  'contract_invalid',
  'workspace_mismatch',
  'environment_id_duplicate',
  'environment_kind_missing',
  'environment_kind_duplicate',
  'pipeline_position_duplicate',
  'pipeline_position_invalid',
  'production_authoring_forbidden',
  'production_publisher_role_forbidden',
  'origin_invalid',
  'production_https_required',
  'http_localhost_only',
  'promotion_source_missing',
  'promotion_source_self',
  'promotion_source_workspace_mismatch',
  'promotion_source_disabled',
  'promotion_source_not_earlier',
  'promotion_source_kind_forbidden',
] as const;

export const ENVIRONMENT_POLICY_DECISION_CODES = [
  'allowed',
  'environment_disabled',
  'direct_publish_forbidden',
  'promotion_source_required',
  'promotion_source_mismatch',
  'role_forbidden',
  'source_verification_required',
  'approval_required',
  'separation_of_duties_required',
] as const;

export const ENVIRONMENT_POLICY_DECISION_MESSAGES = {
  allowed: 'The release action is allowed by the environment policy',
  environment_disabled: 'The release environment is disabled',
  direct_publish_forbidden: 'Direct publishing is disabled for this environment',
  promotion_source_required: 'This environment does not have a promotion source',
  promotion_source_mismatch: 'The release source does not match the configured environment',
  role_forbidden: 'The current workspace role cannot perform this release action',
  source_verification_required: 'Verified source release evidence is required',
  approval_required: 'The configured release approval is required',
  separation_of_duties_required: 'A required release decision must come from another actor',
} as const satisfies Record<(typeof ENVIRONMENT_POLICY_DECISION_CODES)[number], string>;

const ENVIRONMENT_POLICY_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$';
const ENVIRONMENT_POLICY_ID_REGEX = new RegExp(ENVIRONMENT_POLICY_ID_PATTERN, 'u');
const ENVIRONMENT_POLICY_MAX_ORIGINS = 100;

export function isEnvironmentPolicyId(value: unknown): value is string {
  return typeof value === 'string' && ENVIRONMENT_POLICY_ID_REGEX.test(value);
}

function environmentKindVariants() {
  return [
    Type.Literal(ENVIRONMENT_POLICY_KINDS[0]),
    Type.Literal(ENVIRONMENT_POLICY_KINDS[1]),
    Type.Literal(ENVIRONMENT_POLICY_KINDS[2]),
  ];
}

function environmentPolicyRoleVariants() {
  return [
    Type.Literal(CONTROL_PLANE_ROLES.owner),
    Type.Literal(CONTROL_PLANE_ROLES.admin),
    Type.Literal(CONTROL_PLANE_ROLES.member),
    Type.Literal(CONTROL_PLANE_ROLES.viewer),
  ];
}

function environmentPublisherRoleVariants() {
  return [
    Type.Literal(CONTROL_PLANE_ROLES.owner),
    Type.Literal(CONTROL_PLANE_ROLES.admin),
    Type.Literal(CONTROL_PLANE_ROLES.member),
  ];
}

function environmentRecoveryRoleVariants() {
  return [Type.Literal(CONTROL_PLANE_ROLES.owner), Type.Literal(CONTROL_PLANE_ROLES.admin)];
}

function releaseActionVariants() {
  return [
    Type.Literal(ENVIRONMENT_POLICY_ACTIONS[0]),
    Type.Literal(ENVIRONMENT_POLICY_ACTIONS[1]),
    Type.Literal(ENVIRONMENT_POLICY_ACTIONS[2]),
    Type.Literal(ENVIRONMENT_POLICY_ACTIONS[3]),
  ];
}

function validationCodeVariants() {
  return ENVIRONMENT_POLICY_VALIDATION_CODES.map((code) => Type.Literal(code));
}

function decisionCodeVariants() {
  return ENVIRONMENT_POLICY_DECISION_CODES.map((code) => Type.Literal(code));
}

const EnvironmentPolicyId = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: ENVIRONMENT_POLICY_ID_PATTERN,
});

/** Existing opaque IDs for the one fixed row of each environment kind. */
export const WorkspaceEnvironmentPolicyIds = Type.Object(
  {
    development: EnvironmentPolicyId,
    staging: EnvironmentPolicyId,
    production: EnvironmentPolicyId,
  },
  { $id: 'WorkspaceEnvironmentPolicyIds', additionalProperties: false },
);
export type WorkspaceEnvironmentPolicyIds = Static<typeof WorkspaceEnvironmentPolicyIds>;

/** Explicit test/fixture convenience; production callers must pass their persisted IDs. */
export const FIXTURE_WORKSPACE_ENVIRONMENT_POLICY_IDS = {
  development: 'env_development',
  staging: 'env_staging',
  production: 'env_production',
} as const satisfies WorkspaceEnvironmentPolicyIds;

const EnvironmentPublisherRoles = Type.Array(Type.Union(environmentPublisherRoleVariants()), {
  minItems: 1,
  maxItems: 3,
  uniqueItems: true,
});

const EnvironmentRecoveryRoles = Type.Array(Type.Union(environmentRecoveryRoleVariants()), {
  minItems: 1,
  maxItems: 2,
  uniqueItems: true,
});

/** A bounded basic separation gate; multi-approver workflows remain out of scope. */
export const EnvironmentSeparationOfDutiesPolicy = Type.Object(
  {
    requireSeparateVerifier: Type.Boolean(),
    requireSeparateApprover: Type.Boolean(),
  },
  { $id: 'EnvironmentSeparationOfDutiesPolicy', additionalProperties: false },
);
export type EnvironmentSeparationOfDutiesPolicy = Static<
  typeof EnvironmentSeparationOfDutiesPolicy
>;

/** Release authority for one fixed workspace environment. */
export const EnvironmentReleasePolicy = Type.Object(
  {
    allowDirectPublish: Type.Boolean(),
    requireSourceVerification: Type.Boolean(),
    requiredApprovalCount: Type.Union([Type.Literal(0), Type.Literal(1)]),
    publisherRoles: EnvironmentPublisherRoles,
    rollbackRoles: EnvironmentRecoveryRoles,
    unpublishRoles: EnvironmentRecoveryRoles,
    separationOfDuties: EnvironmentSeparationOfDutiesPolicy,
  },
  { $id: 'EnvironmentReleasePolicy', additionalProperties: false },
);
export type EnvironmentReleasePolicy = Static<typeof EnvironmentReleasePolicy>;

/** One canonical development, staging, or production row. */
export const WorkspaceEnvironmentPolicyRow = Type.Object(
  {
    id: EnvironmentPolicyId,
    workspaceId: EnvironmentPolicyId,
    kind: Type.Union(environmentKindVariants()),
    displayName: Type.String({ minLength: 1, maxLength: 120, pattern: '^\\S(?:[\\s\\S]*\\S)?$' }),
    enabled: Type.Boolean(),
    pipelinePosition: Type.Integer({ minimum: 0, maximum: 2 }),
    allowedOrigins: Type.Array(Type.String({ minLength: 1, maxLength: 2048 }), {
      maxItems: ENVIRONMENT_POLICY_MAX_ORIGINS,
      uniqueItems: true,
    }),
    authoringEnabled: Type.Boolean(),
    promotionSourceEnvironmentId: Type.Optional(EnvironmentPolicyId),
    releasePolicy: EnvironmentReleasePolicy,
  },
  { $id: 'WorkspaceEnvironmentPolicyRow', additionalProperties: false },
);
export type WorkspaceEnvironmentPolicyRow = Static<typeof WorkspaceEnvironmentPolicyRow>;

/** Exactly one fixed environment row for every first-release security tier. */
export const WorkspaceEnvironmentPolicy = Type.Object(
  {
    schemaVersion: Type.Literal(ENVIRONMENT_POLICY_SCHEMA_VERSION),
    workspaceId: EnvironmentPolicyId,
    environments: Type.Array(WorkspaceEnvironmentPolicyRow, {
      minItems: ENVIRONMENT_POLICY_KINDS.length,
      maxItems: ENVIRONMENT_POLICY_KINDS.length,
    }),
  },
  { $id: 'WorkspaceEnvironmentPolicy', additionalProperties: false },
);
export type WorkspaceEnvironmentPolicy = Static<typeof WorkspaceEnvironmentPolicy>;

export const EnvironmentPolicyValidationIssue = Type.Object(
  {
    code: Type.Union(validationCodeVariants()),
    field: Type.String({ minLength: 1, maxLength: 64 }),
    environmentId: Type.Optional(EnvironmentPolicyId),
  },
  { $id: 'EnvironmentPolicyValidationIssue', additionalProperties: false },
);
export type EnvironmentPolicyValidationIssue = Static<typeof EnvironmentPolicyValidationIssue>;

export const EnvironmentPolicyValidationResult = Type.Object(
  {
    valid: Type.Boolean(),
    issues: Type.Array(EnvironmentPolicyValidationIssue),
  },
  { $id: 'EnvironmentPolicyValidationResult', additionalProperties: false },
);
export type EnvironmentPolicyValidationResult = Static<typeof EnvironmentPolicyValidationResult>;

export const EnvironmentPolicyReleaseAction = Type.Union(releaseActionVariants(), {
  $id: 'EnvironmentPolicyReleaseAction',
});
export type EnvironmentPolicyReleaseAction = Static<typeof EnvironmentPolicyReleaseAction>;

const EnvironmentPolicyReleaseEvaluationIdentity = {
  environment: WorkspaceEnvironmentPolicyRow,
  actorRole: Type.Union(environmentPolicyRoleVariants()),
  actorUserId: EnvironmentPolicyId,
} as const;

const EnvironmentPolicyReleaseEvidence = {
  sourceVerified: Type.Optional(Type.Boolean()),
  sourceVerifiedByUserId: Type.Optional(EnvironmentPolicyId),
  approvedByUserIds: Type.Optional(
    Type.Array(EnvironmentPolicyId, { maxItems: 1, uniqueItems: true }),
  ),
} as const;

export const EnvironmentPolicyReleaseEvaluationRequest = Type.Union(
  [
    Type.Object(
      {
        ...EnvironmentPolicyReleaseEvaluationIdentity,
        ...EnvironmentPolicyReleaseEvidence,
        action: Type.Literal('direct-publish'),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...EnvironmentPolicyReleaseEvaluationIdentity,
        ...EnvironmentPolicyReleaseEvidence,
        action: Type.Literal('promote'),
        sourceEnvironmentId: EnvironmentPolicyId,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...EnvironmentPolicyReleaseEvaluationIdentity,
        action: Type.Literal('rollback'),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...EnvironmentPolicyReleaseEvaluationIdentity,
        action: Type.Literal('unpublish'),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'EnvironmentPolicyReleaseEvaluationRequest' },
);
export type EnvironmentPolicyReleaseEvaluationRequest = Static<
  typeof EnvironmentPolicyReleaseEvaluationRequest
>;

export const EnvironmentPolicyDecision = Type.Object(
  {
    allowed: Type.Boolean(),
    code: Type.Union(decisionCodeVariants()),
    message: Type.String({ minLength: 1, maxLength: 160 }),
  },
  { $id: 'EnvironmentPolicyDecision', additionalProperties: false },
);
export type EnvironmentPolicyDecision = Static<typeof EnvironmentPolicyDecision>;

const NON_PRODUCTION_PUBLISHER_ROLES = [
  CONTROL_PLANE_ROLES.owner,
  CONTROL_PLANE_ROLES.admin,
  CONTROL_PLANE_ROLES.member,
] as const;

const PRODUCTION_RELEASE_ROLES = [CONTROL_PLANE_ROLES.owner, CONTROL_PLANE_ROLES.admin] as const;

const RECOVERY_ROLES = [CONTROL_PLANE_ROLES.owner, CONTROL_PLANE_ROLES.admin] as const;

export const ENVIRONMENT_PIPELINE_POSITION_BY_KIND = {
  development: 0,
  staging: 1,
  production: 2,
} as const satisfies Record<(typeof ENVIRONMENT_POLICY_KINDS)[number], 0 | 1 | 2>;

/** One fresh release-policy value using the compatibility-preserving defaults. */
export function createDefaultEnvironmentReleasePolicy(
  kind: WorkspaceEnvironmentPolicyRow['kind'],
): EnvironmentReleasePolicy {
  const production = kind === 'production';
  return {
    allowDirectPublish: !production,
    requireSourceVerification: production,
    requiredApprovalCount: 0,
    publisherRoles: production
      ? [...PRODUCTION_RELEASE_ROLES]
      : [...NON_PRODUCTION_PUBLISHER_ROLES],
    rollbackRoles: [...RECOVERY_ROLES],
    unpublishRoles: [...RECOVERY_ROLES],
    separationOfDuties: {
      requireSeparateVerifier: false,
      requireSeparateApprover: false,
    },
  };
}

/**
 * Safe first-release defaults. Existing non-production member publishing stays
 * enabled, production remains promotion-only, and the optional approval/SoD
 * gates stay off until a workspace explicitly enables them.
 */
export function createDefaultWorkspaceEnvironmentPolicy(
  workspaceId: string,
  environmentIds: WorkspaceEnvironmentPolicyIds,
): WorkspaceEnvironmentPolicy {
  return {
    schemaVersion: ENVIRONMENT_POLICY_SCHEMA_VERSION,
    workspaceId,
    environments: [
      {
        id: environmentIds.development,
        workspaceId,
        kind: 'development',
        displayName: 'Development',
        enabled: true,
        pipelinePosition: ENVIRONMENT_PIPELINE_POSITION_BY_KIND.development,
        allowedOrigins: [],
        authoringEnabled: true,
        releasePolicy: createDefaultEnvironmentReleasePolicy('development'),
      },
      {
        id: environmentIds.staging,
        workspaceId,
        kind: 'staging',
        displayName: 'Staging',
        enabled: true,
        pipelinePosition: ENVIRONMENT_PIPELINE_POSITION_BY_KIND.staging,
        allowedOrigins: [],
        authoringEnabled: true,
        releasePolicy: createDefaultEnvironmentReleasePolicy('staging'),
      },
      {
        id: environmentIds.production,
        workspaceId,
        kind: 'production',
        displayName: 'Production',
        enabled: true,
        pipelinePosition: ENVIRONMENT_PIPELINE_POSITION_BY_KIND.production,
        allowedOrigins: [],
        authoringEnabled: false,
        promotionSourceEnvironmentId: environmentIds.staging,
        releasePolicy: createDefaultEnvironmentReleasePolicy('production'),
      },
    ],
  };
}

/** Deterministic cross-row policy validation with no persistence or side effects. */
export function validateWorkspaceEnvironmentPolicy(
  policy: WorkspaceEnvironmentPolicy,
): EnvironmentPolicyValidationResult {
  const rows = [...policy.environments].sort(compareEnvironmentRows);
  const issues: EnvironmentPolicyValidationIssue[] = [];

  for (const row of rows) {
    if (row.workspaceId !== policy.workspaceId) {
      issues.push(issue('workspace_mismatch', 'workspaceId', row.id));
    }
  }

  collectDuplicateIdIssues(rows, issues);
  collectKindIssues(rows, issues);
  collectPositionIssues(rows, issues);

  for (const row of rows) {
    if (row.kind === 'production' && row.authoringEnabled) {
      issues.push(issue('production_authoring_forbidden', 'authoringEnabled', row.id));
    }
    if (
      row.kind === 'production' &&
      row.releasePolicy.publisherRoles.includes(CONTROL_PLANE_ROLES.member)
    ) {
      issues.push(
        issue('production_publisher_role_forbidden', 'releasePolicy.publisherRoles', row.id),
      );
    }
    collectOriginIssues(row, issues);
  }

  collectPromotionSourceIssues(rows, issues);

  return { valid: issues.length === 0, issues };
}

/** Production is never authorable, even if an unvalidated object says otherwise. */
export function canAuthorInEnvironment(environment: WorkspaceEnvironmentPolicyRow): boolean {
  return environment.enabled && environment.kind !== 'production' && environment.authoringEnabled;
}

/** Pure, fail-closed action policy evaluation for publish, promotion, and recovery. */
export function evaluateEnvironmentReleasePolicy(
  request: EnvironmentPolicyReleaseEvaluationRequest,
): EnvironmentPolicyDecision {
  if (!request.environment.enabled) return decision('environment_disabled');

  if (
    request.action === 'direct-publish' &&
    !request.environment.releasePolicy.allowDirectPublish
  ) {
    return decision('direct_publish_forbidden');
  }
  if (request.action === 'promote') {
    const configuredSourceId = request.environment.promotionSourceEnvironmentId;
    if (!configuredSourceId) return decision('promotion_source_required');
    if (request.sourceEnvironmentId !== configuredSourceId) {
      return decision('promotion_source_mismatch');
    }
  }
  if (
    (request.action === 'direct-publish' || request.action === 'promote') &&
    request.environment.kind === 'production' &&
    request.environment.releasePolicy.publisherRoles.includes(CONTROL_PLANE_ROLES.member)
  ) {
    return decision('role_forbidden');
  }
  if (
    (request.action === 'direct-publish' || request.action === 'promote') &&
    request.actorRole === CONTROL_PLANE_ROLES.viewer
  ) {
    return decision('role_forbidden');
  }
  if (
    (request.action === 'rollback' || request.action === 'unpublish') &&
    request.actorRole !== CONTROL_PLANE_ROLES.owner &&
    request.actorRole !== CONTROL_PLANE_ROLES.admin
  ) {
    return decision('role_forbidden');
  }

  const roles = rolesForAction(request.environment.releasePolicy, request.action);
  if (!roles.includes(request.actorRole)) return decision('role_forbidden');

  if (request.action === 'direct-publish' || request.action === 'promote') {
    const evidenceDecision = evaluateReleaseEvidence(request);
    if (evidenceDecision) return evidenceDecision;
  }

  return decision('allowed');
}

function collectDuplicateIdIssues(
  rows: readonly WorkspaceEnvironmentPolicyRow[],
  issues: EnvironmentPolicyValidationIssue[],
): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) {
      issues.push(issue('environment_id_duplicate', 'id', row.id));
    }
    ids.add(row.id);
  }
}

function collectKindIssues(
  rows: readonly WorkspaceEnvironmentPolicyRow[],
  issues: EnvironmentPolicyValidationIssue[],
): void {
  for (const kind of ENVIRONMENT_POLICY_KINDS) {
    const matches = rows.filter((row) => row.kind === kind);
    if (matches.length === 0) {
      issues.push(issue('environment_kind_missing', 'kind'));
    } else if (matches.length > 1) {
      issues.push(issue('environment_kind_duplicate', 'kind', matches[1]?.id));
    }
  }
}

function collectPositionIssues(
  rows: readonly WorkspaceEnvironmentPolicyRow[],
  issues: EnvironmentPolicyValidationIssue[],
): void {
  const positions = new Set<number>();
  for (const row of rows) {
    if (row.pipelinePosition !== ENVIRONMENT_PIPELINE_POSITION_BY_KIND[row.kind]) {
      issues.push(issue('pipeline_position_invalid', 'pipelinePosition', row.id));
    }
    if (positions.has(row.pipelinePosition)) {
      issues.push(issue('pipeline_position_duplicate', 'pipelinePosition', row.id));
    }
    positions.add(row.pipelinePosition);
  }
}

function collectOriginIssues(
  row: WorkspaceEnvironmentPolicyRow,
  issues: EnvironmentPolicyValidationIssue[],
): void {
  const origins = [...row.allowedOrigins].sort();
  for (const origin of origins) {
    const code = validateAllowedOrigin(row.kind, origin);
    if (code) issues.push(issue(code, 'allowedOrigins', row.id));
  }
}

function validateAllowedOrigin(
  kind: WorkspaceEnvironmentPolicyRow['kind'],
  origin: string,
): Extract<
  (typeof ENVIRONMENT_POLICY_VALIDATION_CODES)[number],
  'origin_invalid' | 'production_https_required' | 'http_localhost_only'
> | null {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return 'origin_invalid';
  }

  if (
    origin.includes('*') ||
    parsed.origin !== origin ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== '/' ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    return 'origin_invalid';
  }

  if (kind === 'production' && parsed.protocol !== 'https:') {
    return 'production_https_required';
  }
  if (parsed.protocol === 'https:') return null;
  if (parsed.protocol === 'http:' && kind !== 'production' && isLocalhost(parsed.hostname)) {
    return null;
  }
  if (parsed.protocol === 'http:') return 'http_localhost_only';
  return 'origin_invalid';
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function collectPromotionSourceIssues(
  rows: readonly WorkspaceEnvironmentPolicyRow[],
  issues: EnvironmentPolicyValidationIssue[],
): void {
  for (const row of rows) {
    const sourceId = row.promotionSourceEnvironmentId;
    if (!sourceId) {
      if (row.kind === 'production') {
        issues.push(issue('promotion_source_missing', 'promotionSourceEnvironmentId', row.id));
      }
      continue;
    }
    if (row.kind !== 'production') {
      issues.push(issue('promotion_source_kind_forbidden', 'promotionSourceEnvironmentId', row.id));
      continue;
    }
    if (sourceId === row.id) {
      issues.push(issue('promotion_source_self', 'promotionSourceEnvironmentId', row.id));
      continue;
    }

    const source = rows.find((candidate) => candidate.id === sourceId);
    if (!source) {
      issues.push(issue('promotion_source_missing', 'promotionSourceEnvironmentId', row.id));
      continue;
    }
    if (source.workspaceId !== row.workspaceId) {
      issues.push(
        issue('promotion_source_workspace_mismatch', 'promotionSourceEnvironmentId', row.id),
      );
    }
    if (source.kind !== 'staging') {
      issues.push(issue('promotion_source_kind_forbidden', 'promotionSourceEnvironmentId', row.id));
    }
    if (row.enabled && !source.enabled) {
      issues.push(issue('promotion_source_disabled', 'promotionSourceEnvironmentId', row.id));
    }
    if (source.pipelinePosition >= row.pipelinePosition) {
      issues.push(issue('promotion_source_not_earlier', 'promotionSourceEnvironmentId', row.id));
    }
  }
}

function rolesForAction(
  policy: EnvironmentReleasePolicy,
  action: EnvironmentPolicyReleaseAction,
): readonly (typeof CONTROL_PLANE_ROLES)[keyof typeof CONTROL_PLANE_ROLES][] {
  const rolesByAction = {
    'direct-publish': policy.publisherRoles,
    promote: policy.publisherRoles,
    rollback: policy.rollbackRoles,
    unpublish: policy.unpublishRoles,
  } as const;
  return rolesByAction[action];
}

function evaluateReleaseEvidence(
  request: Extract<
    EnvironmentPolicyReleaseEvaluationRequest,
    { action: 'direct-publish' | 'promote' }
  >,
): EnvironmentPolicyDecision | null {
  const policy = request.environment.releasePolicy;
  if (policy.requireSourceVerification && request.sourceVerified !== true) {
    return decision('source_verification_required');
  }
  if (
    policy.requireSourceVerification &&
    policy.separationOfDuties.requireSeparateVerifier &&
    (!request.sourceVerifiedByUserId || request.sourceVerifiedByUserId === request.actorUserId)
  ) {
    return decision('separation_of_duties_required');
  }

  const approvals = new Set(request.approvedByUserIds ?? []);
  if (approvals.size < policy.requiredApprovalCount) return decision('approval_required');
  if (
    policy.requiredApprovalCount > 0 &&
    policy.separationOfDuties.requireSeparateApprover &&
    approvals.has(request.actorUserId)
  ) {
    return decision('separation_of_duties_required');
  }
  return null;
}

function decision(
  code: (typeof ENVIRONMENT_POLICY_DECISION_CODES)[number],
): EnvironmentPolicyDecision {
  return {
    allowed: code === 'allowed',
    code,
    message: ENVIRONMENT_POLICY_DECISION_MESSAGES[code],
  };
}

function issue(
  code: (typeof ENVIRONMENT_POLICY_VALIDATION_CODES)[number],
  field: string,
  environmentId?: string,
): EnvironmentPolicyValidationIssue {
  return {
    code,
    field,
    ...(environmentId ? { environmentId } : {}),
  };
}

function compareEnvironmentRows(
  left: WorkspaceEnvironmentPolicyRow,
  right: WorkspaceEnvironmentPolicyRow,
): number {
  const positionDifference = left.pipelinePosition - right.pipelinePosition;
  if (positionDifference !== 0) return positionDifference;
  const kindDifference = left.kind.localeCompare(right.kind);
  if (kindDifference !== 0) return kindDifference;
  return left.id.localeCompare(right.id);
}
