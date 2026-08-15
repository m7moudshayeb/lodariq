import { Type, type Static } from '@sinclair/typebox';
import { AuthAssuranceLevel, SsoProtocol } from './auth';
import { ControlPlaneRole } from './control-plane';

export const ENTERPRISE_IDENTITY_PROVIDERS = ['okta', 'entra', 'other'] as const;
export const ENTERPRISE_PROVISIONING_MODES = ['invitation_only', 'jit'] as const;
export const ENTERPRISE_DOMAIN_STATUSES = ['pending', 'verified', 'disabled'] as const;
export const ENTERPRISE_CONNECTION_STATUSES = [
  'draft',
  'validation_required',
  'active',
  'disabled',
] as const;
export const ENTERPRISE_SCIM_STATUSES = ['active', 'disabled'] as const;
export const ENTERPRISE_VALIDATION_TARGETS = ['okta', 'entra'] as const;
export const ENTERPRISE_BREAK_GLASS_STATUSES = [
  'pending_approval',
  'approved',
  'consumed',
  'expired',
  'rejected',
] as const;
export const ENTERPRISE_MANAGED_ROLES = ['admin', 'member', 'viewer'] as const;
export const ENTERPRISE_AUDIT_EVENT_TYPES = [
  'sso_connection_created',
  'sso_connection_validated',
  'sso_connection_disabled',
  'workspace_auth_policy_updated',
  'domain_verification_started',
  'domain_verified',
  'group_role_mapping_updated',
  'scim_token_created',
  'scim_token_disabled',
  'scim_user_provisioned',
  'scim_user_updated',
  'scim_user_deprovisioned',
  'enterprise_sso_authenticated',
  'enterprise_sso_user_provisioned',
  'break_glass_requested',
  'break_glass_approved',
  'break_glass_consumed',
] as const;

export type EnterpriseIdentityProvider = (typeof ENTERPRISE_IDENTITY_PROVIDERS)[number];
export type EnterpriseProvisioningMode = (typeof ENTERPRISE_PROVISIONING_MODES)[number];
export type EnterpriseDomainStatus = (typeof ENTERPRISE_DOMAIN_STATUSES)[number];
export type EnterpriseConnectionStatus = (typeof ENTERPRISE_CONNECTION_STATUSES)[number];
export type EnterpriseScimStatus = (typeof ENTERPRISE_SCIM_STATUSES)[number];
export type EnterpriseValidationTarget = (typeof ENTERPRISE_VALIDATION_TARGETS)[number];
export type EnterpriseBreakGlassStatus = (typeof ENTERPRISE_BREAK_GLASS_STATUSES)[number];
export type EnterpriseManagedRole = (typeof ENTERPRISE_MANAGED_ROLES)[number];
export type EnterpriseAuditEventType = (typeof ENTERPRISE_AUDIT_EVENT_TYPES)[number];

const WorkspaceId = Type.String({ minLength: 1, maxLength: 256 });
const UserId = Type.String({ minLength: 1, maxLength: 256 });
const SsoConnectionId = Type.String({
  minLength: 24,
  maxLength: 128,
  pattern: '^sso_[A-Za-z0-9_-]{20,}$',
});
const EnterpriseDomainId = Type.String({
  minLength: 27,
  maxLength: 128,
  pattern: '^ssodomain_[A-Za-z0-9_-]{16,}$',
});
const BreakGlassId = Type.String({
  minLength: 27,
  maxLength: 128,
  pattern: '^breakglass_[A-Za-z0-9_-]{16,}$',
});
const Timestamp = Type.String({ minLength: 20, maxLength: 40, format: 'date-time' });
const HttpsUrl = Type.String({ minLength: 8, maxLength: 2048, pattern: '^https://' });
const DnsDomain = Type.String({
  minLength: 3,
  maxLength: 253,
  pattern: '^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$',
});
const Email = Type.String({
  minLength: 3,
  maxLength: 320,
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
});
const EnterpriseProvider = Type.Union(
  ENTERPRISE_IDENTITY_PROVIDERS.map((provider) => Type.Literal(provider)),
);
const ProvisioningMode = Type.Union(
  ENTERPRISE_PROVISIONING_MODES.map((mode) => Type.Literal(mode)),
);
const ConnectionStatus = Type.Union(
  ENTERPRISE_CONNECTION_STATUSES.map((status) => Type.Literal(status)),
);
const ManagedRole = Type.Union(ENTERPRISE_MANAGED_ROLES.map((role) => Type.Literal(role)));

export const EnterpriseWorkspaceParams = Type.Object(
  { workspaceId: WorkspaceId },
  { $id: 'EnterpriseWorkspaceParams', additionalProperties: false },
);
export type EnterpriseWorkspaceParams = Static<typeof EnterpriseWorkspaceParams>;

export const EnterpriseConnectionParams = Type.Object(
  { workspaceId: WorkspaceId, connectionId: SsoConnectionId },
  { $id: 'EnterpriseConnectionParams', additionalProperties: false },
);
export type EnterpriseConnectionParams = Static<typeof EnterpriseConnectionParams>;

export const EnterpriseScimConnectionParams = Type.Object(
  {
    workspaceId: WorkspaceId,
    scimConnectionId: Type.String({
      minLength: 24,
      maxLength: 128,
      pattern: '^scim_[A-Za-z0-9_-]{16,}$',
    }),
  },
  { $id: 'EnterpriseScimConnectionParams', additionalProperties: false },
);
export type EnterpriseScimConnectionParams = Static<typeof EnterpriseScimConnectionParams>;

export const CreateEnterpriseSsoConnectionRequest = Type.Object(
  {
    provider: EnterpriseProvider,
    protocol: Type.Ref(SsoProtocol),
    issuer: HttpsUrl,
    clientId: Type.String({ minLength: 1, maxLength: 512 }),
    provisioningMode: ProvisioningMode,
  },
  { $id: 'CreateEnterpriseSsoConnectionRequest', additionalProperties: false },
);
export type CreateEnterpriseSsoConnectionRequest = Static<
  typeof CreateEnterpriseSsoConnectionRequest
>;

export const EnterpriseSsoConnection = Type.Object(
  {
    id: SsoConnectionId,
    workspaceId: WorkspaceId,
    provider: EnterpriseProvider,
    protocol: Type.Ref(SsoProtocol),
    issuer: HttpsUrl,
    clientId: Type.String({ minLength: 1, maxLength: 512 }),
    provisioningMode: ProvisioningMode,
    status: ConnectionStatus,
    validatedAt: Type.Union([Timestamp, Type.Null()]),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'EnterpriseSsoConnection', additionalProperties: false },
);
export type EnterpriseSsoConnection = Static<typeof EnterpriseSsoConnection>;

export const EnterpriseSsoConnectionList = Type.Object(
  { connections: Type.Array(Type.Ref(EnterpriseSsoConnection), { maxItems: 100 }) },
  { $id: 'EnterpriseSsoConnectionList', additionalProperties: false },
);
export type EnterpriseSsoConnectionList = Static<typeof EnterpriseSsoConnectionList>;

export const CreateEnterpriseDomainRequest = Type.Object(
  { domain: DnsDomain, connectionId: SsoConnectionId },
  { $id: 'CreateEnterpriseDomainRequest', additionalProperties: false },
);
export type CreateEnterpriseDomainRequest = Static<typeof CreateEnterpriseDomainRequest>;

export const EnterpriseDomain = Type.Object(
  {
    id: EnterpriseDomainId,
    workspaceId: WorkspaceId,
    connectionId: SsoConnectionId,
    domain: DnsDomain,
    status: Type.Union(ENTERPRISE_DOMAIN_STATUSES.map((status) => Type.Literal(status))),
    verificationRecordName: Type.String({
      minLength: 12,
      maxLength: 262,
      pattern: '^_lodariq\\.',
    }),
    verificationRecordValue: Type.Optional(
      Type.String({ minLength: 32, maxLength: 256, pattern: '^lodariq-domain-verification=' }),
    ),
    verifiedAt: Type.Union([Timestamp, Type.Null()]),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'EnterpriseDomain', additionalProperties: false },
);
export type EnterpriseDomain = Static<typeof EnterpriseDomain>;

export const EnterpriseDomainVerificationRequest = Type.Object(
  {},
  { $id: 'EnterpriseDomainVerificationRequest', additionalProperties: false },
);
export type EnterpriseDomainVerificationRequest = Static<
  typeof EnterpriseDomainVerificationRequest
>;

export const EnterpriseDomainParams = Type.Object(
  { workspaceId: WorkspaceId, domainId: EnterpriseDomainId },
  { $id: 'EnterpriseDomainParams', additionalProperties: false },
);
export type EnterpriseDomainParams = Static<typeof EnterpriseDomainParams>;

export const EnterpriseSsoDiscoveryRequest = Type.Object(
  { email: Email },
  { $id: 'EnterpriseSsoDiscoveryRequest', additionalProperties: false },
);
export type EnterpriseSsoDiscoveryRequest = Static<typeof EnterpriseSsoDiscoveryRequest>;

export const EnterpriseSsoDiscoveryResult = Type.Object(
  {
    available: Type.Boolean(),
    connectionId: Type.Optional(SsoConnectionId),
    protocol: Type.Optional(Type.Ref(SsoProtocol)),
    provider: Type.Optional(EnterpriseProvider),
  },
  { $id: 'EnterpriseSsoDiscoveryResult', additionalProperties: false },
);
export type EnterpriseSsoDiscoveryResult = Static<typeof EnterpriseSsoDiscoveryResult>;

export const EnterpriseOidcBeginRequest = Type.Object(
  {
    connectionId: SsoConnectionId,
    returnTo: Type.String({
      minLength: 1,
      maxLength: 2048,
      pattern: '^/(?!/)',
    }),
    rememberMe: Type.Optional(Type.Boolean()),
  },
  { $id: 'EnterpriseOidcBeginRequest', additionalProperties: false },
);
export type EnterpriseOidcBeginRequest = Static<typeof EnterpriseOidcBeginRequest>;

export const EnterpriseOidcBeginResult = Type.Object(
  { authorizationUrl: HttpsUrl, expiresAt: Timestamp },
  { $id: 'EnterpriseOidcBeginResult', additionalProperties: false },
);
export type EnterpriseOidcBeginResult = Static<typeof EnterpriseOidcBeginResult>;

const EnterpriseOidcCallbackSuccess = Type.Object(
  {
    state: Type.String({ minLength: 43, maxLength: 256, pattern: '^[A-Za-z0-9_-]+$' }),
    code: Type.String({ minLength: 1, maxLength: 4096 }),
  },
  { additionalProperties: false },
);
const EnterpriseOidcCallbackFailure = Type.Object(
  {
    state: Type.String({ minLength: 43, maxLength: 256, pattern: '^[A-Za-z0-9_-]+$' }),
    error: Type.String({ minLength: 1, maxLength: 256 }),
    errorDescription: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
  },
  { additionalProperties: false },
);
export const EnterpriseOidcCallbackRequest = Type.Union(
  [EnterpriseOidcCallbackSuccess, EnterpriseOidcCallbackFailure],
  { $id: 'EnterpriseOidcCallbackRequest' },
);
export type EnterpriseOidcCallbackRequest = Static<typeof EnterpriseOidcCallbackRequest>;

export const EnterpriseOidcCallbackResult = Type.Object(
  {
    status: Type.Literal('authenticated'),
    returnTo: Type.String({ minLength: 1, maxLength: 2048, pattern: '^/(?!/)' }),
  },
  { $id: 'EnterpriseOidcCallbackResult', additionalProperties: false },
);
export type EnterpriseOidcCallbackResult = Static<typeof EnterpriseOidcCallbackResult>;

export const UpdateWorkspaceAuthPolicyRequest = Type.Object(
  {
    ssoRequired: Type.Boolean(),
    minimumAssurance: Type.Ref(AuthAssuranceLevel),
    passwordAllowed: Type.Boolean(),
  },
  { $id: 'UpdateWorkspaceAuthPolicyRequest', additionalProperties: false },
);
export type UpdateWorkspaceAuthPolicyRequest = Static<typeof UpdateWorkspaceAuthPolicyRequest>;

export const WorkspaceAuthPolicy = Type.Object(
  {
    workspaceId: WorkspaceId,
    ssoRequired: Type.Boolean(),
    minimumAssurance: Type.Ref(AuthAssuranceLevel),
    passwordAllowed: Type.Boolean(),
  },
  { $id: 'WorkspaceAuthPolicy', additionalProperties: false },
);
export type WorkspaceAuthPolicy = Static<typeof WorkspaceAuthPolicy>;

export const UpsertEnterpriseGroupRoleMappingRequest = Type.Object(
  {
    groupId: Type.String({ minLength: 1, maxLength: 512 }),
    role: ManagedRole,
  },
  { $id: 'UpsertEnterpriseGroupRoleMappingRequest', additionalProperties: false },
);
export type UpsertEnterpriseGroupRoleMappingRequest = Static<
  typeof UpsertEnterpriseGroupRoleMappingRequest
>;

export const EnterpriseGroupRoleMapping = Type.Object(
  {
    id: Type.String({ minLength: 24, maxLength: 128, pattern: '^ssogroup_[A-Za-z0-9_-]{16,}$' }),
    workspaceId: WorkspaceId,
    connectionId: SsoConnectionId,
    groupId: Type.String({ minLength: 1, maxLength: 512 }),
    role: ManagedRole,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'EnterpriseGroupRoleMapping', additionalProperties: false },
);
export type EnterpriseGroupRoleMapping = Static<typeof EnterpriseGroupRoleMapping>;

export const CreateScimTokenRequest = Type.Object(
  { connectionId: SsoConnectionId },
  { $id: 'CreateScimTokenRequest', additionalProperties: false },
);
export type CreateScimTokenRequest = Static<typeof CreateScimTokenRequest>;

export const CreateScimTokenResult = Type.Object(
  {
    id: Type.String({ minLength: 24, maxLength: 128, pattern: '^scim_[A-Za-z0-9_-]{16,}$' }),
    token: Type.String({ minLength: 48, maxLength: 256, pattern: '^lq_scim_[A-Za-z0-9_-]{32,}$' }),
    createdAt: Timestamp,
  },
  { $id: 'CreateScimTokenResult', additionalProperties: false },
);
export type CreateScimTokenResult = Static<typeof CreateScimTokenResult>;

export const EnterpriseScimConnectionSummary = Type.Object(
  {
    id: Type.String({ minLength: 24, maxLength: 128, pattern: '^scim_[A-Za-z0-9_-]{16,}$' }),
    connectionId: SsoConnectionId,
    tokenPrefix: Type.String({ minLength: 8, maxLength: 24 }),
    status: Type.Union(ENTERPRISE_SCIM_STATUSES.map((status) => Type.Literal(status))),
    lastUsedAt: Type.Union([Timestamp, Type.Null()]),
    createdAt: Timestamp,
  },
  { $id: 'EnterpriseScimConnectionSummary', additionalProperties: false },
);
export type EnterpriseScimConnectionSummary = Static<typeof EnterpriseScimConnectionSummary>;

export const EnterpriseWorkspaceConfiguration = Type.Object(
  {
    policy: Type.Ref(WorkspaceAuthPolicy),
    connections: Type.Array(Type.Ref(EnterpriseSsoConnection), { maxItems: 100 }),
    domains: Type.Array(Type.Ref(EnterpriseDomain), { maxItems: 100 }),
    groupRoleMappings: Type.Array(Type.Ref(EnterpriseGroupRoleMapping), { maxItems: 1000 }),
    scimConnections: Type.Array(Type.Ref(EnterpriseScimConnectionSummary), { maxItems: 100 }),
  },
  { $id: 'EnterpriseWorkspaceConfiguration', additionalProperties: false },
);
export type EnterpriseWorkspaceConfiguration = Static<typeof EnterpriseWorkspaceConfiguration>;

export const ScimUser = Type.Object(
  {
    schemas: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }),
    id: Type.String({ minLength: 1, maxLength: 256 }),
    externalId: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    userName: Email,
    active: Type.Boolean(),
    displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  { $id: 'ScimUser', additionalProperties: false },
);
export type ScimUser = Static<typeof ScimUser>;

export const ScimUserListQuery = Type.Object(
  {
    filter: Type.String({ minLength: 10, maxLength: 512 }),
    startIndex: Type.Optional(Type.Integer({ minimum: 1, maximum: 1 })),
    count: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  },
  { $id: 'ScimUserListQuery', additionalProperties: false },
);
export type ScimUserListQuery = Static<typeof ScimUserListQuery>;

export const ScimUserListResponse = Type.Object(
  {
    schemas: Type.Tuple([Type.Literal('urn:ietf:params:scim:api:messages:2.0:ListResponse')]),
    totalResults: Type.Integer({ minimum: 0, maximum: 1 }),
    startIndex: Type.Integer({ minimum: 1, maximum: 1 }),
    itemsPerPage: Type.Integer({ minimum: 0, maximum: 1 }),
    Resources: Type.Array(Type.Ref(ScimUser), { maxItems: 1 }),
  },
  { $id: 'ScimUserListResponse', additionalProperties: false },
);
export type ScimUserListResponse = Static<typeof ScimUserListResponse>;

export const ScimCreateUserRequest = Type.Object(
  {
    schemas: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }),
    externalId: Type.String({ minLength: 1, maxLength: 512 }),
    userName: Email,
    active: Type.Optional(Type.Boolean()),
    displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    name: Type.Optional(
      Type.Object(
        {
          formatted: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          givenName: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
          familyName: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
        },
        { additionalProperties: false },
      ),
    ),
    emails: Type.Optional(
      Type.Array(
        Type.Object(
          {
            value: Email,
            type: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
            primary: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false },
        ),
        { minItems: 1, maxItems: 10 },
      ),
    ),
    groups: Type.Optional(
      Type.Array(
        Type.Object(
          { value: Type.String({ minLength: 1, maxLength: 512 }) },
          { additionalProperties: false },
        ),
        { maxItems: 100 },
      ),
    ),
  },
  { $id: 'ScimCreateUserRequest', additionalProperties: false },
);
export type ScimCreateUserRequest = Static<typeof ScimCreateUserRequest>;

export const ScimReplaceUserRequest = Type.Object(
  {
    schemas: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }),
    externalId: Type.String({ minLength: 1, maxLength: 512 }),
    userName: Email,
    active: Type.Boolean(),
    displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    name: Type.Optional(
      Type.Object(
        { formatted: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })) },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'ScimReplaceUserRequest', additionalProperties: false },
);
export type ScimReplaceUserRequest = Static<typeof ScimReplaceUserRequest>;

export const ScimPatchUserRequest = Type.Object(
  {
    schemas: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }),
    Operations: Type.Array(
      Type.Object(
        {
          op: Type.Union([Type.Literal('replace'), Type.Literal('Replace')]),
          path: Type.Union([Type.Literal('active'), Type.Literal('displayName')]),
          value: Type.Union([Type.Boolean(), Type.String({ minLength: 1, maxLength: 120 })]),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 20 },
    ),
  },
  { $id: 'ScimPatchUserRequest', additionalProperties: false },
);
export type ScimPatchUserRequest = Static<typeof ScimPatchUserRequest>;

export const CreateBreakGlassRequest = Type.Object(
  { reason: Type.String({ minLength: 20, maxLength: 1000 }) },
  { $id: 'CreateBreakGlassRequest', additionalProperties: false },
);
export type CreateBreakGlassRequest = Static<typeof CreateBreakGlassRequest>;

export const BreakGlassApprovalRequest = Type.Object(
  {},
  { $id: 'BreakGlassApprovalRequest', additionalProperties: false },
);
export type BreakGlassApprovalRequest = Static<typeof BreakGlassApprovalRequest>;

export const BreakGlassParams = Type.Object(
  { workspaceId: WorkspaceId, requestId: BreakGlassId },
  { $id: 'BreakGlassParams', additionalProperties: false },
);
export type BreakGlassParams = Static<typeof BreakGlassParams>;

export const EnterpriseBreakGlassRecord = Type.Object(
  {
    id: BreakGlassId,
    workspaceId: WorkspaceId,
    requestedByUserId: UserId,
    approvedByUserId: Type.Union([UserId, Type.Null()]),
    status: Type.Union(
      ENTERPRISE_BREAK_GLASS_STATUSES.map((status) => Type.Literal(status)),
    ),
    reason: Type.String({ minLength: 20, maxLength: 1000 }),
    expiresAt: Timestamp,
    approvedAt: Type.Union([Timestamp, Type.Null()]),
    consumedAt: Type.Union([Timestamp, Type.Null()]),
    createdAt: Timestamp,
  },
  { $id: 'EnterpriseBreakGlassRecord', additionalProperties: false },
);
export type EnterpriseBreakGlassRecord = Static<typeof EnterpriseBreakGlassRecord>;

export const EnterpriseAuditEvent = Type.Object(
  {
    id: Type.String({ minLength: 23, maxLength: 128, pattern: '^ssoevt_[A-Za-z0-9_-]{16,}$' }),
    workspaceId: WorkspaceId,
    actorUserId: Type.Union([UserId, Type.Null()]),
    eventType: Type.Union(
      ENTERPRISE_AUDIT_EVENT_TYPES.map((eventType) => Type.Literal(eventType)),
    ),
    connectionId: Type.Union([SsoConnectionId, Type.Null()]),
    targetUserId: Type.Union([UserId, Type.Null()]),
    correlationId: Type.String({
      minLength: 8,
      maxLength: 128,
      pattern: '^[A-Za-z0-9_-]+$',
    }),
    metadata: Type.Record(
      Type.String({ minLength: 1, maxLength: 128 }),
      Type.Union([Type.String({ maxLength: 512 }), Type.Boolean(), Type.Number(), Type.Null()]),
      { maxProperties: 32 },
    ),
    occurredAt: Timestamp,
  },
  { $id: 'EnterpriseAuditEvent', additionalProperties: false },
);
export type EnterpriseAuditEvent = Static<typeof EnterpriseAuditEvent>;

export const EnterpriseAuditEventList = Type.Object(
  { events: Type.Array(Type.Ref(EnterpriseAuditEvent), { maxItems: 1000 }) },
  { $id: 'EnterpriseAuditEventList', additionalProperties: false },
);
export type EnterpriseAuditEventList = Static<typeof EnterpriseAuditEventList>;

// Re-exporting this reference here makes generated API documentation explicit that
// owner is never assignable by an IdP group or SCIM payload.
export const EnterpriseManagedControlPlaneRole = Type.Intersect(
  [Type.Ref(ControlPlaneRole), ManagedRole],
  { $id: 'EnterpriseManagedControlPlaneRole' },
);
