import { Type, type Static } from '@sinclair/typebox';
import {
  CONTROL_PLANE_ROLES,
  ControlPlaneRole,
  type ControlPlaneRole as Role,
} from './control-plane';

export const GOVERNANCE_CAPABILITY_PROFILE_SCHEMA_VERSION = '1' as const;

/**
 * Closed human-authorization capabilities. These are intentionally distinct
 * from renderer/compiler delivery capabilities and commercial entitlements.
 */
export const GOVERNANCE_CAPABILITIES = [
  'authoring:read',
  'authoring:write',
  'product-style:sample',
  'release:publish',
  'release:verify',
  'release:approve',
  'release:promote',
  'release:schedule',
  'release:rollback',
  'release:unpublish',
  'release-policy:manage',
  'audit:export',
  'webhooks:manage',
  'residency:manage',
] as const;
export type GovernanceCapability = (typeof GOVERNANCE_CAPABILITIES)[number];

export const ENVIRONMENT_GOVERNANCE_CAPABILITIES = [
  'authoring:read',
  'authoring:write',
  'product-style:sample',
  'release:publish',
  'release:verify',
  'release:approve',
  'release:promote',
  'release:schedule',
  'release:rollback',
  'release:unpublish',
  'release-policy:manage',
] as const satisfies readonly GovernanceCapability[];
export type EnvironmentGovernanceCapability = (typeof ENVIRONMENT_GOVERNANCE_CAPABILITIES)[number];

export const WORKSPACE_GOVERNANCE_CAPABILITIES = [
  'audit:export',
  'webhooks:manage',
  'residency:manage',
] as const satisfies readonly GovernanceCapability[];
export type WorkspaceGovernanceCapability = (typeof WORKSPACE_GOVERNANCE_CAPABILITIES)[number];

const MEMBER_CAPABILITIES = [
  'authoring:read',
  'authoring:write',
  'product-style:sample',
  'release:publish',
  'release:verify',
  'release:schedule',
] as const satisfies readonly GovernanceCapability[];

const ADMIN_CAPABILITIES = GOVERNANCE_CAPABILITIES;

/** A profile may narrow its fixed base role, never expand it. */
export const GOVERNANCE_CAPABILITIES_BY_BASE_ROLE = {
  viewer: [],
  member: MEMBER_CAPABILITIES,
  admin: ADMIN_CAPABILITIES,
  owner: ADMIN_CAPABILITIES,
} as const satisfies Readonly<Record<Role, readonly GovernanceCapability[]>>;

const PRODUCTION_ENVIRONMENT_CAPABILITIES = [
  'release:approve',
  'release:promote',
  'release:schedule',
  'release:rollback',
  'release:unpublish',
  'release-policy:manage',
] as const satisfies readonly EnvironmentGovernanceCapability[];

/** Safe defaults preserve the current three-environment behavior. */
export const DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES = {
  development: [
    'authoring:read',
    'authoring:write',
    'product-style:sample',
    'release:publish',
    'release:schedule',
    'release:rollback',
    'release:unpublish',
    'release-policy:manage',
  ],
  staging: ENVIRONMENT_GOVERNANCE_CAPABILITIES,
  production: PRODUCTION_ENVIRONMENT_CAPABILITIES,
} as const satisfies Readonly<
  Record<'development' | 'staging' | 'production', readonly EnvironmentGovernanceCapability[]>
>;

function capabilityVariants() {
  return GOVERNANCE_CAPABILITIES.map((capability) => Type.Literal(capability));
}

function environmentCapabilityVariants() {
  return ENVIRONMENT_GOVERNANCE_CAPABILITIES.map((capability) => Type.Literal(capability));
}

const GovernanceId = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
});
const Timestamp = Type.String({ minLength: 20, maxLength: 40, format: 'date-time' });

export const GovernanceCapability = Type.Union(capabilityVariants(), {
  $id: 'GovernanceCapability',
});

export const EnvironmentGovernanceCapability = Type.Union(environmentCapabilityVariants(), {
  $id: 'EnvironmentGovernanceCapability',
});

export const EnvironmentGovernanceCapabilitySet = Type.Array(EnvironmentGovernanceCapability, {
  minItems: 1,
  maxItems: ENVIRONMENT_GOVERNANCE_CAPABILITIES.length,
  uniqueItems: true,
});
export type EnvironmentGovernanceCapabilitySet = Static<typeof EnvironmentGovernanceCapabilitySet>;

export const GovernanceCapabilityProfile = Type.Object(
  {
    schemaVersion: Type.Literal(GOVERNANCE_CAPABILITY_PROFILE_SCHEMA_VERSION),
    id: GovernanceId,
    workspaceId: GovernanceId,
    name: Type.String({ minLength: 1, maxLength: 120, pattern: '^\\S(?:[\\s\\S]*\\S)?$' }),
    baseRole: Type.Ref(ControlPlaneRole),
    capabilities: Type.Array(Type.Ref(GovernanceCapability), {
      maxItems: GOVERNANCE_CAPABILITIES.length,
      uniqueItems: true,
    }),
    revision: Type.Integer({ minimum: 1 }),
    createdByUserId: GovernanceId,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'GovernanceCapabilityProfile', additionalProperties: false },
);
export type GovernanceCapabilityProfile = Static<typeof GovernanceCapabilityProfile>;

export const GovernanceCapabilityProfileList = Type.Object(
  { profiles: Type.Array(Type.Ref(GovernanceCapabilityProfile), { maxItems: 1_000 }) },
  { $id: 'GovernanceCapabilityProfileList', additionalProperties: false },
);
export type GovernanceCapabilityProfileList = Static<typeof GovernanceCapabilityProfileList>;

export const CreateGovernanceCapabilityProfileRequest = Type.Object(
  {
    name: GovernanceCapabilityProfile.properties.name,
    baseRole: Type.Ref(ControlPlaneRole),
    capabilities: GovernanceCapabilityProfile.properties.capabilities,
  },
  { $id: 'CreateGovernanceCapabilityProfileRequest', additionalProperties: false },
);
export type CreateGovernanceCapabilityProfileRequest = Static<
  typeof CreateGovernanceCapabilityProfileRequest
>;

export const UpdateGovernanceCapabilityProfileRequest = Type.Object(
  {
    name: GovernanceCapabilityProfile.properties.name,
    capabilities: GovernanceCapabilityProfile.properties.capabilities,
    expectedRevision: Type.Integer({ minimum: 1 }),
  },
  { $id: 'UpdateGovernanceCapabilityProfileRequest', additionalProperties: false },
);
export type UpdateGovernanceCapabilityProfileRequest = Static<
  typeof UpdateGovernanceCapabilityProfileRequest
>;

export const GovernanceCapabilityProfileAssignment = Type.Object(
  {
    workspaceId: GovernanceId,
    environmentId: GovernanceId,
    userId: GovernanceId,
    profileId: GovernanceId,
    assignedByUserId: GovernanceId,
    assignedAt: Timestamp,
  },
  { $id: 'GovernanceCapabilityProfileAssignment', additionalProperties: false },
);
export type GovernanceCapabilityProfileAssignment = Static<
  typeof GovernanceCapabilityProfileAssignment
>;

export const WorkspaceGovernanceCapabilityProfileAssignment = Type.Object(
  {
    workspaceId: GovernanceId,
    userId: GovernanceId,
    profileId: GovernanceId,
    assignedByUserId: GovernanceId,
    assignedAt: Timestamp,
  },
  { $id: 'WorkspaceGovernanceCapabilityProfileAssignment', additionalProperties: false },
);
export type WorkspaceGovernanceCapabilityProfileAssignment = Static<
  typeof WorkspaceGovernanceCapabilityProfileAssignment
>;

export const AssignGovernanceCapabilityProfileRequest = Type.Object(
  { profileId: GovernanceId },
  { $id: 'AssignGovernanceCapabilityProfileRequest', additionalProperties: false },
);
export type AssignGovernanceCapabilityProfileRequest = Static<
  typeof AssignGovernanceCapabilityProfileRequest
>;

export interface ResolveGovernanceCapabilitiesInput {
  role: Role;
  environmentCapabilities: readonly EnvironmentGovernanceCapability[];
  profile?: Pick<GovernanceCapabilityProfile, 'baseRole' | 'capabilities'> | null;
}

/**
 * Effective environment authority is the intersection of three independent
 * ceilings: the fixed base role, the optional narrowing profile, and the
 * environment. A mismatched or invalid profile fails closed.
 */
export function resolveEnvironmentGovernanceCapabilities(
  input: ResolveGovernanceCapabilitiesInput,
): EnvironmentGovernanceCapability[] {
  if (input.role === CONTROL_PLANE_ROLES.viewer) return [];
  const environment = new Set<GovernanceCapability>(input.environmentCapabilities);
  const base = GOVERNANCE_CAPABILITIES_BY_BASE_ROLE[input.role];
  const profile = input.profile;
  if (profile && profile.baseRole !== input.role) return [];
  const grants: readonly GovernanceCapability[] = profile ? profile.capabilities : base;
  const baseSet = new Set<GovernanceCapability>(base);
  return ENVIRONMENT_GOVERNANCE_CAPABILITIES.filter(
    (capability) =>
      baseSet.has(capability) && grants.includes(capability) && environment.has(capability),
  );
}

export function resolveWorkspaceGovernanceCapabilities(
  role: Role,
  profile?: Pick<GovernanceCapabilityProfile, 'baseRole' | 'capabilities'> | null,
): WorkspaceGovernanceCapability[] {
  if (role === CONTROL_PLANE_ROLES.viewer) return [];
  const base: readonly GovernanceCapability[] = GOVERNANCE_CAPABILITIES_BY_BASE_ROLE[role];
  if (profile && profile.baseRole !== role) return [];
  const grants: readonly GovernanceCapability[] = profile ? profile.capabilities : base;
  return WORKSPACE_GOVERNANCE_CAPABILITIES.filter(
    (capability) => base.includes(capability) && grants.includes(capability),
  );
}

export function validateGovernanceCapabilityProfileGrant(
  baseRole: Role,
  capabilities: readonly GovernanceCapability[],
): boolean {
  const allowed: readonly GovernanceCapability[] = GOVERNANCE_CAPABILITIES_BY_BASE_ROLE[baseRole];
  return (
    new Set(capabilities).size === capabilities.length &&
    capabilities.every((capability) => allowed.includes(capability))
  );
}

export function defaultEnvironmentGovernanceCapabilities(
  kind: keyof typeof DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES,
): EnvironmentGovernanceCapability[] {
  return [...DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES[kind]];
}
