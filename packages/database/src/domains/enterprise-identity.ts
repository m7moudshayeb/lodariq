import type {
  AuthAssuranceLevel,
  EnterpriseBreakGlassStatus,
  EnterpriseConnectionStatus,
  EnterpriseDomainStatus,
  EnterpriseIdentityProvider,
  EnterpriseManagedRole,
  EnterpriseProvisioningMode,
  EnterpriseScimStatus,
  EnterpriseAuditEventType,
  EnterpriseValidationTarget,
  SsoProtocol,
} from '@lodariq/schema';
import type {
  AuthIdentityRecord,
  AuthSessionRecord,
  UserEmailRecord,
  UserRecord,
} from './identity';

export interface EnterpriseSsoConnectionRecord {
  id: string;
  workspaceId: string;
  provider: EnterpriseIdentityProvider;
  protocol: SsoProtocol;
  issuer: string;
  clientId: string;
  provisioningMode: EnterpriseProvisioningMode;
  status: EnterpriseConnectionStatus;
  validatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseValidationEvidenceRecord {
  id: string;
  connectionId: string;
  workspaceId: string;
  target: EnterpriseValidationTarget;
  protocol: SsoProtocol;
  evidenceReference: string;
  validatedBy: string;
  validatedAt: string;
  revokedAt: string | null;
}

export interface EnterpriseVerifiedDomainRecord {
  id: string;
  workspaceId: string;
  connectionId: string;
  domain: string;
  status: EnterpriseDomainStatus;
  verificationTokenHash: string;
  verificationRecordName: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseGroupRoleMappingRecord {
  id: string;
  workspaceId: string;
  connectionId: string;
  groupId: string;
  role: EnterpriseManagedRole;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseScimConnectionRecord {
  id: string;
  workspaceId: string;
  connectionId: string;
  tokenHash: string;
  tokenPrefix: string;
  status: EnterpriseScimStatus;
  createdByUserId: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedEnterpriseScimConnectionRecord
  extends EnterpriseScimConnectionRecord {
  issuer: string;
}

export interface EnterprisePrincipalRecord {
  id: string;
  workspaceId: string;
  connectionId: string;
  userId: string;
  externalId: string;
  issuer: string;
  subject: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deprovisionedAt: string | null;
}

export interface EnterpriseScimUserRecord {
  id: string;
  externalId: string;
  userName: string;
  active: boolean;
  displayName: string | null;
}

export interface EnterpriseAuditEventRecord {
  id: string;
  workspaceId: string;
  actorUserId: string | null;
  eventType: EnterpriseAuditEventType;
  connectionId: string | null;
  targetUserId: string | null;
  correlationId: string;
  metadata: Record<string, string | boolean | number | null>;
  occurredAt: string;
}

export interface EnterpriseBreakGlassRecord {
  id: string;
  workspaceId: string;
  requestedByUserId: string;
  approvedByUserId: string | null;
  status: EnterpriseBreakGlassStatus;
  reason: string;
  expiresAt: string;
  approvedAt: string | null;
  consumedAt: string | null;
  createdAt: string;
}

export interface EnterpriseSsoDiscoveryRecord {
  connectionId: string;
  protocol: SsoProtocol;
  provider: EnterpriseIdentityProvider;
}

export interface EnterpriseWorkspaceConfigurationRecord {
  policy: {
    workspaceId: string;
    ssoRequired: boolean;
    minimumAssurance: AuthAssuranceLevel;
    passwordAllowed: boolean;
  };
  connections: EnterpriseSsoConnectionRecord[];
  domains: EnterpriseVerifiedDomainRecord[];
  groupRoleMappings: EnterpriseGroupRoleMappingRecord[];
  scimConnections: EnterpriseScimConnectionRecord[];
}

export interface CreateEnterpriseSsoConnectionInput {
  connection: EnterpriseSsoConnectionRecord;
  actorUserId: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface DisableEnterpriseSsoConnectionInput {
  workspaceId: string;
  connectionId: string;
  actorUserId: string;
  disabledAt: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface CreateEnterpriseDomainInput {
  domain: EnterpriseVerifiedDomainRecord;
  actorUserId: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface RecordEnterpriseValidationEvidenceInput {
  evidence: EnterpriseValidationEvidenceRecord;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface VerifyEnterpriseDomainInput {
  workspaceId: string;
  domainId: string;
  actorUserId: string;
  verificationTokenHash: string;
  verifiedAt: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface UpdateWorkspaceEnterprisePolicyInput {
  workspaceId: string;
  actorUserId: string;
  ssoRequired: boolean;
  minimumAssurance: AuthAssuranceLevel;
  passwordAllowed: boolean;
  updatedAt: string;
  auditEvent: EnterpriseAuditEventRecord;
  breakGlassRequestId: string | null;
  breakGlassAuditEvent: EnterpriseAuditEventRecord | null;
}

export interface UpsertEnterpriseGroupRoleMappingInput {
  mapping: EnterpriseGroupRoleMappingRecord;
  actorUserId: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface CreateEnterpriseScimConnectionInput {
  connection: EnterpriseScimConnectionRecord;
  actorUserId: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface DisableEnterpriseScimConnectionInput {
  workspaceId: string;
  scimConnectionId: string;
  actorUserId: string;
  disabledAt: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface FindEnterpriseScimUserInput {
  scimConnectionId: string;
  scimTokenHash: string;
  principalId?: string;
  emailNormalized?: string;
}

export interface ProvisionEnterpriseScimUserInput {
  scimConnectionId: string;
  scimTokenHash: string;
  user: UserRecord;
  email: UserEmailRecord;
  principal: EnterprisePrincipalRecord;
  role: EnterpriseManagedRole;
  groupIds: string[];
  occurredAt: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface UpdateEnterpriseScimUserInput {
  scimConnectionId: string;
  scimTokenHash: string;
  principalId: string;
  displayName?: string;
  active?: boolean;
  occurredAt: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface BindEnterpriseIdentityInput {
  connectionId: string;
  externalId: string;
  identity: AuthIdentityRecord;
  authenticatedAt: string;
}

export interface AuthenticateEnterpriseSsoInput {
  connectionId: string;
  externalId: string;
  issuer: string;
  subject: string;
  emailNormalized: string;
  emailVerified: boolean;
  displayName: string | null;
  groupIds: string[];
  occurredAt: string;
  candidateUser: UserRecord;
  candidateEmail: UserEmailRecord;
  candidateIdentity: AuthIdentityRecord;
  candidatePrincipal: EnterprisePrincipalRecord;
  candidateSession: AuthSessionRecord;
  auditEvent: EnterpriseAuditEventRecord;
}

export type AuthenticateEnterpriseSsoResult =
  | { status: 'authenticated'; userId: string; session: AuthSessionRecord; created: boolean }
  | {
      status:
        | 'conflict'
        | 'invalid_connection'
        | 'invitation_required'
        | 'unverified_email'
        | 'deprovisioned';
    };

export interface CreateEnterpriseBreakGlassInput {
  request: EnterpriseBreakGlassRecord;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface ApproveEnterpriseBreakGlassInput {
  workspaceId: string;
  requestId: string;
  approverUserId: string;
  approvedAt: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export interface ConsumeEnterpriseBreakGlassInput {
  workspaceId: string;
  requestId: string;
  actorUserId: string;
  consumedAt: string;
  auditEvent: EnterpriseAuditEventRecord;
}

export type EnterpriseMutationResult =
  | 'completed'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'invalid_input'
  | 'validation_required';

export type EnterpriseReadResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'not_found' | 'forbidden' };

export type EnterpriseScimProvisionResult =
  | { status: 'created'; principal: EnterprisePrincipalRecord }
  | { status: 'conflict' | 'invalid_connection' | 'invalid_input' };

export interface EnterpriseIdentityRepository {
  discoverEnterpriseSso(domain: string): Promise<EnterpriseSsoDiscoveryRecord | null>;
  getEnterpriseSsoConnectionForAuthorization(
    connectionId: string,
  ): Promise<EnterpriseSsoConnectionRecord | null>;
  listEnterpriseSsoConnections(
    workspaceId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseSsoConnectionRecord[]>>;
  getEnterpriseWorkspaceConfiguration(
    workspaceId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseWorkspaceConfigurationRecord>>;
  createEnterpriseSsoConnection(
    input: CreateEnterpriseSsoConnectionInput,
  ): Promise<EnterpriseMutationResult>;
  disableEnterpriseSsoConnection(
    input: DisableEnterpriseSsoConnectionInput,
  ): Promise<EnterpriseMutationResult>;
  /** Deployment-operator path; never exposed as a workspace-owner API mutation. */
  recordEnterpriseValidationEvidence(
    input: RecordEnterpriseValidationEvidenceInput,
  ): Promise<EnterpriseMutationResult>;
  createEnterpriseDomain(input: CreateEnterpriseDomainInput): Promise<EnterpriseMutationResult>;
  getEnterpriseDomainForVerification(
    workspaceId: string,
    domainId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseVerifiedDomainRecord>>;
  verifyEnterpriseDomain(input: VerifyEnterpriseDomainInput): Promise<EnterpriseMutationResult>;
  updateWorkspaceEnterprisePolicy(
    input: UpdateWorkspaceEnterprisePolicyInput,
  ): Promise<EnterpriseMutationResult>;
  upsertEnterpriseGroupRoleMapping(
    input: UpsertEnterpriseGroupRoleMappingInput,
  ): Promise<EnterpriseMutationResult>;
  createEnterpriseScimConnection(
    input: CreateEnterpriseScimConnectionInput,
  ): Promise<EnterpriseMutationResult>;
  disableEnterpriseScimConnection(
    input: DisableEnterpriseScimConnectionInput,
  ): Promise<EnterpriseMutationResult>;
  resolveEnterpriseScimConnection(
    tokenHash: string,
    usedAt: string,
  ): Promise<ResolvedEnterpriseScimConnectionRecord | null>;
  findEnterpriseScimUser(
    input: FindEnterpriseScimUserInput,
  ): Promise<EnterpriseScimUserRecord | null>;
  provisionEnterpriseScimUser(
    input: ProvisionEnterpriseScimUserInput,
  ): Promise<EnterpriseScimProvisionResult>;
  updateEnterpriseScimUser(
    input: UpdateEnterpriseScimUserInput,
  ): Promise<EnterpriseMutationResult>;
  bindEnterpriseIdentity(input: BindEnterpriseIdentityInput): Promise<EnterpriseMutationResult>;
  authenticateEnterpriseSso(
    input: AuthenticateEnterpriseSsoInput,
  ): Promise<AuthenticateEnterpriseSsoResult>;
  identitySatisfiesWorkspaceSso(
    workspaceId: string,
    identityId: string | null,
  ): Promise<boolean>;
  createEnterpriseBreakGlass(
    input: CreateEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult>;
  approveEnterpriseBreakGlass(
    input: ApproveEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult>;
  consumeEnterpriseBreakGlass(
    input: ConsumeEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult>;
  listEnterpriseAuditEvents(
    workspaceId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseAuditEventRecord[]>>;
}
