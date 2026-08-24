import type {
  AuthenticateEnterpriseSsoInput,
  AuthenticateEnterpriseSsoResult,
  EnterpriseAuditEventRecord,
  EnterpriseIdentityRepository,
  EnterpriseMutationResult,
  EnterpriseReadResult,
  EnterpriseScimProvisionResult,
  EnterpriseSsoConnectionRecord,
  EnterpriseVerifiedDomainRecord,
  ApproveEnterpriseBreakGlassInput,
  BindEnterpriseIdentityInput,
  ConsumeEnterpriseBreakGlassInput,
  CreateEnterpriseBreakGlassInput,
  CreateEnterpriseDomainInput,
  CreateEnterpriseScimConnectionInput,
  CreateEnterpriseSsoConnectionInput,
  DisableEnterpriseScimConnectionInput,
  DisableEnterpriseSsoConnectionInput,
  FindEnterpriseScimUserInput,
  ProvisionEnterpriseScimUserInput,
  RecordEnterpriseValidationEvidenceInput,
  UpdateEnterpriseScimUserInput,
  UpdateWorkspaceEnterprisePolicyInput,
  UpsertEnterpriseGroupRoleMappingInput,
  VerifyEnterpriseDomainInput,
} from '../domains/enterprise-identity';
import { isValidAuthIdentityRecord, isValidAuthSessionRecord } from '../domains/identity';
import { clone } from '../domains/in-memory-helpers';
import { assertCommercialFeature } from '../domains/commercial-entitlements';
import { InMemoryRepositoryOidc } from './oidc';

export class InMemoryRepositoryEnterpriseIdentity
  extends InMemoryRepositoryOidc
  implements EnterpriseIdentityRepository
{
  async discoverEnterpriseSso(domain: string) {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) return null;
    const verifiedDomain = [...this.enterpriseVerifiedDomains.values()].find(
      (candidate) => candidate.domain === normalizedDomain && candidate.status === 'verified',
    );
    if (!verifiedDomain) return null;
    const connection = this.enterpriseSsoConnections.get(verifiedDomain.connectionId);
    if (!isActiveValidatedConnection(connection, this.enterpriseValidationEvidence)) return null;
    return {
      connectionId: connection.id,
      protocol: connection.protocol,
      provider: connection.provider,
    };
  }

  async getEnterpriseSsoConnectionForAuthorization(connectionId: string) {
    const connection = this.enterpriseSsoConnections.get(connectionId);
    return isActiveValidatedConnection(connection, this.enterpriseValidationEvidence)
      ? clone(connection)
      : null;
  }

  async listEnterpriseSsoConnections(
    workspaceId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseSsoConnectionRecord[]>> {
    if (!this.hasEnterpriseAdminRole(workspaceId, actorUserId)) return { status: 'forbidden' };
    const value = [...this.enterpriseSsoConnections.values()]
      .filter((connection) => connection.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return { status: 'ok', value: clone(value) };
  }

  async getEnterpriseWorkspaceConfiguration(workspaceId: string, actorUserId: string) {
    if (!this.hasEnterpriseAdminRole(workspaceId, actorUserId))
      return { status: 'forbidden' as const };
    const policy = this.workspaceAuthPolicies.get(workspaceId);
    if (!policy) return { status: 'not_found' as const };
    return {
      status: 'ok' as const,
      value: clone({
        policy: {
          workspaceId,
          ssoRequired: policy.ssoRequired,
          minimumAssurance: policy.minimumAssurance,
          passwordAllowed: policy.passwordAllowed,
        },
        connections: [...this.enterpriseSsoConnections.values()].filter(
          (connection) => connection.workspaceId === workspaceId,
        ),
        domains: [...this.enterpriseVerifiedDomains.values()].filter(
          (domain) => domain.workspaceId === workspaceId,
        ),
        groupRoleMappings: [...this.enterpriseGroupRoleMappings.values()].filter(
          (mapping) => mapping.workspaceId === workspaceId,
        ),
        scimConnections: [...this.enterpriseScimConnections.values()].filter(
          (connection) => connection.workspaceId === workspaceId,
        ),
      }),
    };
  }

  async createEnterpriseSsoConnection(
    input: CreateEnterpriseSsoConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    const connection = input.connection;
    if (!this.hasEnterpriseOwnerRole(connection.workspaceId, input.actorUserId)) {
      return 'forbidden';
    }
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(connection.workspaceId).entitlements,
      'sso',
    );
    if (
      !validEnterpriseConnection(connection) ||
      input.auditEvent.workspaceId !== connection.workspaceId ||
      input.auditEvent.connectionId !== connection.id
    ) {
      return 'forbidden';
    }
    if (
      this.enterpriseSsoConnections.has(connection.id) ||
      [...this.enterpriseSsoConnections.values()].some(
        (candidate) =>
          candidate.workspaceId === connection.workspaceId &&
          candidate.protocol === connection.protocol &&
          candidate.issuer === connection.issuer,
      )
    ) {
      return 'conflict';
    }
    this.enterpriseSsoConnections.set(connection.id, clone(connection));
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async disableEnterpriseSsoConnection(
    input: DisableEnterpriseSsoConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    if (!this.hasEnterpriseOwnerRole(input.workspaceId, input.actorUserId)) return 'forbidden';
    const connection = this.enterpriseSsoConnections.get(input.connectionId);
    if (!connection || connection.workspaceId !== input.workspaceId) return 'not_found';
    if (connection.status === 'disabled') return 'conflict';
    this.enterpriseSsoConnections.set(connection.id, {
      ...connection,
      status: 'disabled',
      updatedAt: input.disabledAt,
    });
    for (const [evidenceId, evidence] of this.enterpriseValidationEvidence) {
      if (evidence.connectionId === connection.id && evidence.revokedAt === null) {
        this.enterpriseValidationEvidence.set(evidenceId, {
          ...evidence,
          revokedAt: input.disabledAt,
        });
      }
    }
    for (const [domainId, domain] of this.enterpriseVerifiedDomains) {
      if (domain.connectionId === connection.id && domain.status !== 'disabled') {
        this.enterpriseVerifiedDomains.set(domainId, {
          ...domain,
          status: 'disabled',
          updatedAt: input.disabledAt,
        });
      }
    }
    for (const [scimId, scim] of this.enterpriseScimConnections) {
      if (scim.connectionId === connection.id && scim.status === 'active') {
        this.enterpriseScimConnections.set(scimId, {
          ...scim,
          status: 'disabled',
          updatedAt: input.disabledAt,
        });
      }
    }
    for (const principal of this.enterprisePrincipals.values()) {
      if (principal.connectionId === connection.id) {
        this.revokeEnterpriseAccess(input.workspaceId, principal.userId, input.disabledAt);
      }
    }
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async recordEnterpriseValidationEvidence(
    input: RecordEnterpriseValidationEvidenceInput,
  ): Promise<EnterpriseMutationResult> {
    const evidence = input.evidence;
    const connection = this.enterpriseSsoConnections.get(evidence.connectionId);
    if (
      !connection ||
      connection.workspaceId !== evidence.workspaceId ||
      connection.provider !== evidence.target ||
      connection.protocol !== evidence.protocol ||
      evidence.protocol !== 'oidc' ||
      connection.status === 'disabled' ||
      evidence.revokedAt !== null ||
      evidence.evidenceReference.length < 8 ||
      evidence.validatedBy.length < 3
    ) {
      return 'invalid_input';
    }
    if (
      this.enterpriseValidationEvidence.has(evidence.id) ||
      [...this.enterpriseValidationEvidence.values()].some(
        (candidate) =>
          candidate.connectionId === evidence.connectionId &&
          candidate.target === evidence.target &&
          candidate.protocol === evidence.protocol,
      )
    ) {
      return 'conflict';
    }
    this.enterpriseValidationEvidence.set(evidence.id, clone(evidence));
    this.enterpriseSsoConnections.set(connection.id, {
      ...connection,
      status: 'active',
      validatedAt: evidence.validatedAt,
      updatedAt: evidence.validatedAt,
    });
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async createEnterpriseDomain(
    input: CreateEnterpriseDomainInput,
  ): Promise<EnterpriseMutationResult> {
    const record = input.domain;
    if (!this.hasEnterpriseOwnerRole(record.workspaceId, input.actorUserId)) return 'forbidden';
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(record.workspaceId).entitlements,
      'sso',
    );
    const connection = this.enterpriseSsoConnections.get(record.connectionId);
    if (
      !connection ||
      connection.workspaceId !== record.workspaceId ||
      normalizeDomain(record.domain) !== record.domain ||
      !/^[0-9a-f]{64}$/u.test(record.verificationTokenHash) ||
      record.status !== 'pending' ||
      record.verifiedAt !== null
    ) {
      return 'invalid_input';
    }
    if (
      this.enterpriseVerifiedDomains.has(record.id) ||
      [...this.enterpriseVerifiedDomains.values()].some(
        (candidate) => candidate.domain === record.domain,
      )
    ) {
      return 'conflict';
    }
    this.enterpriseVerifiedDomains.set(record.id, clone(record));
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async verifyEnterpriseDomain(
    input: VerifyEnterpriseDomainInput,
  ): Promise<EnterpriseMutationResult> {
    if (!this.hasEnterpriseOwnerRole(input.workspaceId, input.actorUserId)) return 'forbidden';
    const domain = this.enterpriseVerifiedDomains.get(input.domainId);
    if (!domain || domain.workspaceId !== input.workspaceId) return 'not_found';
    if (
      domain.status !== 'pending' ||
      domain.verificationTokenHash !== input.verificationTokenHash ||
      !Number.isFinite(Date.parse(input.verifiedAt))
    ) {
      return 'conflict';
    }
    this.enterpriseVerifiedDomains.set(domain.id, {
      ...domain,
      status: 'verified',
      verifiedAt: input.verifiedAt,
      updatedAt: input.verifiedAt,
    });
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async getEnterpriseDomainForVerification(
    workspaceId: string,
    domainId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseVerifiedDomainRecord>> {
    if (!this.hasEnterpriseOwnerRole(workspaceId, actorUserId)) return { status: 'forbidden' };
    const domain = this.enterpriseVerifiedDomains.get(domainId);
    if (!domain || domain.workspaceId !== workspaceId || domain.status !== 'pending') {
      return { status: 'not_found' };
    }
    return { status: 'ok', value: clone(domain) };
  }

  async updateWorkspaceEnterprisePolicy(
    input: UpdateWorkspaceEnterprisePolicyInput,
  ): Promise<EnterpriseMutationResult> {
    if (input.minimumAssurance === 'aal3') return 'invalid_input';
    if (!this.hasEnterpriseOwnerRole(input.workspaceId, input.actorUserId)) return 'forbidden';
    if (input.ssoRequired) {
      assertCommercialFeature(
        this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
        'sso',
      );
    }
    const current = this.workspaceAuthPolicies.get(input.workspaceId);
    if (!current) return 'not_found';
    if (!input.passwordAllowed && !input.ssoRequired) return 'invalid_input';
    if (input.breakGlassRequestId) {
      const request = this.enterpriseBreakGlassRequests.get(input.breakGlassRequestId);
      if (
        !request ||
        request.workspaceId !== input.workspaceId ||
        request.requestedByUserId !== input.actorUserId ||
        request.status !== 'approved' ||
        request.expiresAt <= input.updatedAt ||
        !input.breakGlassAuditEvent
      ) {
        return 'forbidden';
      }
      this.enterpriseBreakGlassRequests.set(request.id, {
        ...request,
        status: 'consumed',
        consumedAt: input.updatedAt,
      });
      this.enterpriseAuditEvents.set(
        input.breakGlassAuditEvent.id,
        clone(input.breakGlassAuditEvent),
      );
    } else if (input.breakGlassAuditEvent) {
      return 'invalid_input';
    }
    if (
      input.ssoRequired &&
      ![...this.enterpriseSsoConnections.values()].some(
        (connection) =>
          connection.workspaceId === input.workspaceId &&
          isActiveValidatedConnection(connection, this.enterpriseValidationEvidence),
      )
    ) {
      return 'validation_required';
    }
    this.workspaceAuthPolicies.set(input.workspaceId, {
      ...current,
      ssoRequired: input.ssoRequired,
      minimumAssurance: input.minimumAssurance,
      passwordAllowed: input.passwordAllowed,
      updatedAt: input.updatedAt,
    });
    for (const [grantId, grant] of this.authoringActivationGrants) {
      if (grant.workspaceId === input.workspaceId && grant.revokedAt === null) {
        this.authoringActivationGrants.set(grantId, { ...grant, revokedAt: input.updatedAt });
      }
    }
    for (const [key, session] of this.authoringSessions) {
      if (session.workspaceId === input.workspaceId && !session.revokedAt) {
        this.authoringSessions.set(key, { ...session, revokedAt: input.updatedAt });
      }
    }
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async upsertEnterpriseGroupRoleMapping(
    input: UpsertEnterpriseGroupRoleMappingInput,
  ): Promise<EnterpriseMutationResult> {
    const mapping = input.mapping;
    if (!this.hasEnterpriseOwnerRole(mapping.workspaceId, input.actorUserId)) return 'forbidden';
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(mapping.workspaceId).entitlements,
      'sso',
    );
    const connection = this.enterpriseSsoConnections.get(mapping.connectionId);
    if (
      !connection ||
      connection.workspaceId !== mapping.workspaceId ||
      !['admin', 'member', 'viewer'].includes(mapping.role) ||
      !mapping.groupId.trim()
    ) {
      return 'invalid_input';
    }
    const previous = [...this.enterpriseGroupRoleMappings.values()].find(
      (candidate) =>
        candidate.connectionId === mapping.connectionId && candidate.groupId === mapping.groupId,
    );
    if (previous && previous.id !== mapping.id)
      this.enterpriseGroupRoleMappings.delete(previous.id);
    this.enterpriseGroupRoleMappings.set(mapping.id, clone(mapping));
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async createEnterpriseScimConnection(
    input: CreateEnterpriseScimConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    const scim = input.connection;
    if (!this.hasEnterpriseOwnerRole(scim.workspaceId, input.actorUserId)) return 'forbidden';
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(scim.workspaceId).entitlements,
      'scim',
    );
    const sso = this.enterpriseSsoConnections.get(scim.connectionId);
    if (
      !isActiveValidatedConnection(sso, this.enterpriseValidationEvidence) ||
      sso.workspaceId !== scim.workspaceId ||
      !/^[0-9a-f]{64}$/u.test(scim.tokenHash)
    ) {
      return 'validation_required';
    }
    if (
      this.enterpriseScimConnections.has(scim.id) ||
      [...this.enterpriseScimConnections.values()].some(
        (candidate) => candidate.tokenHash === scim.tokenHash,
      )
    ) {
      return 'conflict';
    }
    this.enterpriseScimConnections.set(scim.id, clone(scim));
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async disableEnterpriseScimConnection(
    input: DisableEnterpriseScimConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    if (!this.hasEnterpriseOwnerRole(input.workspaceId, input.actorUserId)) return 'forbidden';
    const scim = this.enterpriseScimConnections.get(input.scimConnectionId);
    if (!scim || scim.workspaceId !== input.workspaceId) return 'not_found';
    if (scim.status === 'disabled') return 'conflict';
    this.enterpriseScimConnections.set(scim.id, {
      ...scim,
      status: 'disabled',
      updatedAt: input.disabledAt,
    });
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async resolveEnterpriseScimConnection(tokenHash: string, usedAt: string) {
    const found = [...this.enterpriseScimConnections.values()].find(
      (connection) => connection.tokenHash === tokenHash && connection.status === 'active',
    );
    if (!found) return null;
    const sso = this.enterpriseSsoConnections.get(found.connectionId);
    if (!isActiveValidatedConnection(sso, this.enterpriseValidationEvidence)) return null;
    const updated = { ...found, lastUsedAt: usedAt, updatedAt: usedAt };
    this.enterpriseScimConnections.set(found.id, updated);
    return clone({ ...updated, issuer: sso.issuer });
  }

  async findEnterpriseScimUser(input: FindEnterpriseScimUserInput) {
    const scim = this.enterpriseScimConnections.get(input.scimConnectionId);
    const sso = scim ? this.enterpriseSsoConnections.get(scim.connectionId) : undefined;
    if (
      !scim ||
      scim.tokenHash !== input.scimTokenHash ||
      scim.status !== 'active' ||
      !isActiveValidatedConnection(sso, this.enterpriseValidationEvidence)
    ) {
      return null;
    }
    let principal = input.principalId
      ? this.enterprisePrincipals.get(input.principalId)
      : undefined;
    if (!principal && input.emailNormalized) {
      const email = this.userEmails.get(input.emailNormalized);
      principal = email
        ? [...this.enterprisePrincipals.values()].find(
            (candidate) =>
              candidate.connectionId === scim.connectionId && candidate.userId === email.userId,
          )
        : undefined;
    }
    if (!principal || principal.connectionId !== scim.connectionId) return null;
    const email = [...this.userEmails.values()].find(
      (candidate) => candidate.userId === principal.userId && candidate.isPrimary,
    );
    const user = this.users.get(principal.userId);
    if (!email || !user) return null;
    return clone({
      id: principal.id,
      externalId: principal.externalId,
      userName: email.normalizedEmail,
      active: principal.active,
      displayName: user.name ?? null,
    });
  }

  async provisionEnterpriseScimUser(
    input: ProvisionEnterpriseScimUserInput,
  ): Promise<EnterpriseScimProvisionResult> {
    const scim = this.enterpriseScimConnections.get(input.scimConnectionId);
    const sso = scim ? this.enterpriseSsoConnections.get(scim.connectionId) : undefined;
    if (
      !scim ||
      scim.tokenHash !== input.scimTokenHash ||
      scim.status !== 'active' ||
      !isActiveValidatedConnection(sso, this.enterpriseValidationEvidence)
    ) {
      return { status: 'invalid_connection' };
    }
    if (
      input.principal.connectionId !== scim.connectionId ||
      input.principal.workspaceId !== scim.workspaceId ||
      input.principal.userId !== input.user.id ||
      input.email.userId !== input.user.id ||
      input.email.normalizedEmail !== input.user.email ||
      !input.email.isPrimary ||
      !input.email.verifiedAt ||
      !input.principal.active ||
      !['admin', 'member', 'viewer'].includes(input.role)
    ) {
      return { status: 'invalid_input' };
    }
    const mappedRole = strongestMappedRole(
      input.groupIds,
      [...this.enterpriseGroupRoleMappings.values()].filter(
        (mapping) => mapping.connectionId === scim.connectionId,
      ),
    );
    const provisionedRole = mappedRole ?? input.role;
    if (provisionedRole !== 'viewer') {
      this.assertCreatorSeatAvailable(scim.workspaceId);
    }
    if (
      this.users.has(input.user.id) ||
      this.userEmails.has(input.email.normalizedEmail) ||
      [...this.enterprisePrincipals.values()].some(
        (principal) =>
          principal.connectionId === input.principal.connectionId &&
          principal.externalId === input.principal.externalId,
      )
    ) {
      // Explicit administrator reconciliation is required for a pre-existing
      // email. SCIM never becomes an email-based account-linking path.
      return { status: 'conflict' };
    }
    this.users.set(input.user.id, clone(input.user));
    this.userEmails.set(input.email.normalizedEmail, clone(input.email));
    this.workspaceMemberships.set(this.key(scim.workspaceId, input.user.id), {
      workspaceId: scim.workspaceId,
      userId: input.user.id,
      role: provisionedRole,
      createdAt: input.occurredAt,
    });
    this.enterprisePrincipals.set(input.principal.id, clone(input.principal));
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return { status: 'created', principal: clone(input.principal) };
  }

  async updateEnterpriseScimUser(
    input: UpdateEnterpriseScimUserInput,
  ): Promise<EnterpriseMutationResult> {
    const scim = this.enterpriseScimConnections.get(input.scimConnectionId);
    const principal = this.enterprisePrincipals.get(input.principalId);
    if (
      !scim ||
      scim.tokenHash !== input.scimTokenHash ||
      scim.status !== 'active' ||
      !principal ||
      principal.connectionId !== scim.connectionId ||
      principal.workspaceId !== scim.workspaceId
    ) {
      return 'not_found';
    }
    const user = this.users.get(principal.userId);
    if (!user) return 'not_found';
    if (input.displayName !== undefined) {
      this.users.set(user.id, { ...user, name: input.displayName });
    }
    if (input.active === false && principal.active) {
      this.enterprisePrincipals.set(principal.id, {
        ...principal,
        active: false,
        deprovisionedAt: input.occurredAt,
        updatedAt: input.occurredAt,
      });
      this.workspaceMemberships.delete(this.key(principal.workspaceId, principal.userId));
      this.revokeEnterpriseAccess(principal.workspaceId, principal.userId, input.occurredAt);
    } else if (input.active === true && !principal.active) {
      // Reactivation is a provisioning decision, not a PATCH toggle. It must be
      // reviewed so a stale IdP account cannot silently restore membership.
      return 'conflict';
    }
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async bindEnterpriseIdentity(
    input: BindEnterpriseIdentityInput,
  ): Promise<EnterpriseMutationResult> {
    const connection = this.enterpriseSsoConnections.get(input.connectionId);
    const principal = [...this.enterprisePrincipals.values()].find(
      (candidate) =>
        candidate.connectionId === input.connectionId && candidate.externalId === input.externalId,
    );
    if (
      !isActiveValidatedConnection(connection, this.enterpriseValidationEvidence) ||
      !principal?.active ||
      principal.userId !== input.identity.userId ||
      connection.issuer !== input.identity.issuer ||
      input.identity.kind !== connection.protocol ||
      input.identity.subject.length < 1
    ) {
      return 'invalid_input';
    }
    if (
      this.authIdentities.has(input.identity.id) ||
      [...this.authIdentities.values()].some(
        (identity) =>
          identity.issuer === input.identity.issuer && identity.subject === input.identity.subject,
      )
    ) {
      return 'conflict';
    }
    this.authIdentities.set(input.identity.id, clone(input.identity));
    this.enterprisePrincipals.set(principal.id, {
      ...principal,
      subject: input.identity.subject,
      updatedAt: input.authenticatedAt,
    });
    return 'completed';
  }

  async authenticateEnterpriseSso(
    input: AuthenticateEnterpriseSsoInput,
  ): Promise<AuthenticateEnterpriseSsoResult> {
    const connection = this.enterpriseSsoConnections.get(input.connectionId);
    if (
      !isActiveValidatedConnection(connection, this.enterpriseValidationEvidence) ||
      connection.protocol !== 'oidc' ||
      connection.issuer !== input.issuer ||
      input.candidateIdentity.kind !== 'oidc' ||
      input.candidateIdentity.issuer !== input.issuer ||
      input.candidateIdentity.subject !== input.subject ||
      !isValidAuthIdentityRecord(input.candidateIdentity)
    ) {
      return { status: 'invalid_connection' };
    }

    const exactIdentity = [...this.authIdentities.values()].find(
      (identity) => identity.issuer === input.issuer && identity.subject === input.subject,
    );
    const principal = [...this.enterprisePrincipals.values()].find(
      (candidate) =>
        candidate.connectionId === connection.id &&
        (candidate.externalId === input.externalId || candidate.subject === input.subject),
    );
    if (principal) {
      if (!principal.active) return { status: 'deprovisioned' };
      if (exactIdentity && exactIdentity.userId !== principal.userId) return { status: 'conflict' };
      const membershipKey = this.key(connection.workspaceId, principal.userId);
      const membership = this.workspaceMemberships.get(membershipKey);
      if (!membership) return { status: 'deprovisioned' };
      const mappedRole = strongestMappedRole(
        input.groupIds,
        [...this.enterpriseGroupRoleMappings.values()].filter(
          (mapping) => mapping.connectionId === connection.id,
        ),
      );
      const managedRole = membership.role === 'owner' ? null : (mappedRole ?? 'viewer');
      const identity = exactIdentity ?? {
        ...input.candidateIdentity,
        userId: principal.userId,
      };
      if (!exactIdentity) {
        if (this.authIdentities.has(identity.id)) return { status: 'conflict' };
        this.authIdentities.set(identity.id, clone(identity));
      }
      const session = enterpriseSessionForUser(
        input.candidateSession,
        principal.userId,
        identity.id,
        connection.workspaceId,
      );
      if (!isValidAuthSessionRecord(session) || this.identitySessions.has(session.tokenHash)) {
        return { status: 'conflict' };
      }
      if (managedRole) {
        this.workspaceMemberships.set(membershipKey, { ...membership, role: managedRole });
      }
      this.enterprisePrincipals.set(principal.id, {
        ...principal,
        subject: input.subject,
        updatedAt: input.occurredAt,
      });
      this.authIdentities.set(identity.id, {
        ...identity,
        lastAuthenticatedAt: input.occurredAt,
      });
      this.identitySessions.set(session.tokenHash, clone(session));
      this.rememberEnterpriseAuthenticationEvent(input, principal.userId, false);
      return {
        status: 'authenticated',
        userId: principal.userId,
        session: clone(session),
        created: false,
      };
    }

    // A provider identity already linked outside this enterprise connection may
    // not acquire workspace access through email or a second linkage path.
    if (exactIdentity) return { status: 'conflict' };
    if (!input.emailVerified) return { status: 'unverified_email' };
    const domain = normalizeDomain(
      input.emailNormalized.slice(input.emailNormalized.lastIndexOf('@') + 1),
    );
    const verifiedDomain = [...this.enterpriseVerifiedDomains.values()].find(
      (candidate) =>
        candidate.connectionId === connection.id &&
        candidate.domain === domain &&
        candidate.status === 'verified',
    );
    if (!verifiedDomain) return { status: 'unverified_email' };
    if (
      this.userEmails.has(input.emailNormalized) ||
      [...this.users.values()].some(
        (user) => user.email.trim().toLowerCase() === input.emailNormalized,
      )
    ) {
      return { status: 'conflict' };
    }

    const invitation = [...this.workspaceInvitations.values()].find(
      (candidate) =>
        candidate.workspaceId === connection.workspaceId &&
        candidate.emailNormalized === input.emailNormalized &&
        candidate.acceptedAt === null &&
        candidate.revokedAt === null &&
        candidate.expiresAt > input.occurredAt,
    );
    if (connection.provisioningMode === 'invitation_only' && !invitation) {
      return { status: 'invitation_required' };
    }
    const mappedRole = strongestMappedRole(
      input.groupIds,
      [...this.enterpriseGroupRoleMappings.values()].filter(
        (mapping) => mapping.connectionId === connection.id,
      ),
    );
    const role = invitation?.role ?? mappedRole ?? 'viewer';
    if (
      input.candidateUser.id !== input.candidateEmail.userId ||
      input.candidateUser.id !== input.candidateIdentity.userId ||
      input.candidateUser.id !== input.candidatePrincipal.userId ||
      input.candidateUser.id !== input.candidateSession.userId ||
      input.candidateEmail.normalizedEmail !== input.emailNormalized ||
      input.candidatePrincipal.workspaceId !== connection.workspaceId ||
      input.candidatePrincipal.connectionId !== connection.id ||
      input.candidatePrincipal.externalId !== input.externalId ||
      input.candidatePrincipal.issuer !== input.issuer ||
      input.candidatePrincipal.subject !== input.subject ||
      !input.candidatePrincipal.active ||
      !input.candidateEmail.isPrimary ||
      !input.candidateEmail.verifiedAt
    ) {
      return { status: 'conflict' };
    }
    if (role !== 'viewer') {
      this.assertCreatorSeatAvailable(connection.workspaceId);
    }
    const session = enterpriseSessionForUser(
      input.candidateSession,
      input.candidateUser.id,
      input.candidateIdentity.id,
      connection.workspaceId,
    );
    if (!isValidAuthSessionRecord(session) || this.identitySessions.has(session.tokenHash)) {
      return { status: 'conflict' };
    }
    this.users.set(input.candidateUser.id, clone(input.candidateUser));
    this.userEmails.set(input.emailNormalized, clone(input.candidateEmail));
    this.authIdentities.set(input.candidateIdentity.id, clone(input.candidateIdentity));
    this.enterprisePrincipals.set(input.candidatePrincipal.id, clone(input.candidatePrincipal));
    this.workspaceMemberships.set(this.key(connection.workspaceId, input.candidateUser.id), {
      workspaceId: connection.workspaceId,
      userId: input.candidateUser.id,
      role,
      createdAt: input.occurredAt,
    });
    if (invitation) {
      this.workspaceInvitations.set(invitation.id, { ...invitation, acceptedAt: input.occurredAt });
    }
    this.identitySessions.set(session.tokenHash, clone(session));
    this.rememberEnterpriseAuthenticationEvent(input, input.candidateUser.id, true);
    return {
      status: 'authenticated',
      userId: input.candidateUser.id,
      session: clone(session),
      created: true,
    };
  }

  async identitySatisfiesWorkspaceSso(
    workspaceId: string,
    identityId: string | null,
  ): Promise<boolean> {
    if (!identityId) return false;
    const identity = this.authIdentities.get(identityId);
    if (!identity || identity.disabledAt) return false;
    const principal = [...this.enterprisePrincipals.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.userId === identity.userId &&
        candidate.subject === identity.subject &&
        candidate.issuer === identity.issuer &&
        candidate.active,
    );
    if (!principal) return false;
    return isActiveValidatedConnection(
      this.enterpriseSsoConnections.get(principal.connectionId),
      this.enterpriseValidationEvidence,
    );
  }

  async createEnterpriseBreakGlass(
    input: CreateEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult> {
    const request = input.request;
    if (!this.hasEnterpriseOwnerRole(request.workspaceId, request.requestedByUserId)) {
      return 'forbidden';
    }
    if (
      request.status !== 'pending_approval' ||
      request.approvedByUserId !== null ||
      request.approvedAt !== null ||
      request.consumedAt !== null ||
      request.reason.trim().length < 20 ||
      request.expiresAt <= request.createdAt
    ) {
      return 'invalid_input';
    }
    this.enterpriseBreakGlassRequests.set(request.id, clone(request));
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async approveEnterpriseBreakGlass(
    input: ApproveEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult> {
    if (!this.hasEnterpriseOwnerRole(input.workspaceId, input.approverUserId)) return 'forbidden';
    const request = this.enterpriseBreakGlassRequests.get(input.requestId);
    if (!request || request.workspaceId !== input.workspaceId) return 'not_found';
    if (
      request.status !== 'pending_approval' ||
      request.requestedByUserId === input.approverUserId ||
      request.expiresAt <= input.approvedAt
    ) {
      return 'conflict';
    }
    this.enterpriseBreakGlassRequests.set(request.id, {
      ...request,
      approvedByUserId: input.approverUserId,
      approvedAt: input.approvedAt,
      status: 'approved',
    });
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async consumeEnterpriseBreakGlass(
    input: ConsumeEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult> {
    const request = this.enterpriseBreakGlassRequests.get(input.requestId);
    if (!request || request.workspaceId !== input.workspaceId) return 'not_found';
    if (
      request.status !== 'approved' ||
      request.requestedByUserId !== input.actorUserId ||
      request.expiresAt <= input.consumedAt
    ) {
      return 'conflict';
    }
    this.enterpriseBreakGlassRequests.set(request.id, {
      ...request,
      status: 'consumed',
      consumedAt: input.consumedAt,
    });
    this.enterpriseAuditEvents.set(input.auditEvent.id, clone(input.auditEvent));
    return 'completed';
  }

  async listEnterpriseAuditEvents(
    workspaceId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseAuditEventRecord[]>> {
    if (!this.hasEnterpriseAdminRole(workspaceId, actorUserId)) return { status: 'forbidden' };
    const value = [...this.enterpriseAuditEvents.values()]
      .filter((event) => event.workspaceId === workspaceId)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return { status: 'ok', value: clone(value) };
  }

  private hasEnterpriseOwnerRole(workspaceId: string, userId: string): boolean {
    return this.workspaceMemberships.get(this.key(workspaceId, userId))?.role === 'owner';
  }

  private hasEnterpriseAdminRole(workspaceId: string, userId: string): boolean {
    const role = this.workspaceMemberships.get(this.key(workspaceId, userId))?.role;
    return role === 'owner' || role === 'admin';
  }

  private revokeEnterpriseAccess(workspaceId: string, userId: string, revokedAt: string): void {
    for (const [hash, session] of this.identitySessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.identitySessions.set(hash, { ...session, revokedAt });
      }
    }
    for (const [grantId, grant] of this.authoringActivationGrants) {
      if (
        grant.workspaceId === workspaceId &&
        grant.creatorId === userId &&
        grant.revokedAt === null
      ) {
        this.authoringActivationGrants.set(grantId, { ...grant, revokedAt });
      }
    }
    for (const [key, session] of this.authoringSessions) {
      if (
        session.workspaceId === workspaceId &&
        session.createdByUserId === userId &&
        !session.revokedAt
      ) {
        this.authoringSessions.set(key, { ...session, revokedAt });
      }
    }
  }

  private rememberEnterpriseAuthenticationEvent(
    input: AuthenticateEnterpriseSsoInput,
    userId: string,
    created: boolean,
  ): void {
    this.enterpriseAuditEvents.set(input.auditEvent.id, {
      ...clone(input.auditEvent),
      targetUserId: userId,
      eventType: created ? 'enterprise_sso_user_provisioned' : 'enterprise_sso_authenticated',
      metadata: { ...input.auditEvent.metadata, created },
    });
  }
}

function enterpriseSessionForUser(
  candidate: AuthenticateEnterpriseSsoInput['candidateSession'],
  userId: string,
  identityId: string,
  workspaceId: string,
) {
  return {
    ...candidate,
    userId,
    identityId,
    activeWorkspaceId: workspaceId,
    authenticationMethod: 'oidc' as const,
    durationPolicy: 'managed' as const,
  };
}

function normalizeDomain(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\.$/u, '');
  if (
    normalized.length < 3 ||
    normalized.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function validEnterpriseConnection(connection: EnterpriseSsoConnectionRecord): boolean {
  let issuer: URL;
  try {
    issuer = new URL(connection.issuer);
  } catch {
    return false;
  }
  return (
    /^sso_[A-Za-z0-9_-]{20,}$/u.test(connection.id) &&
    issuer.protocol === 'https:' &&
    !issuer.username &&
    !issuer.password &&
    connection.clientId.length >= 1 &&
    connection.clientId.length <= 512 &&
    connection.status !== 'active' &&
    connection.validatedAt === null
  );
}

function isActiveValidatedConnection(
  connection: EnterpriseSsoConnectionRecord | undefined,
  evidence: ReadonlyMap<string, { connectionId: string; revokedAt: string | null }>,
): connection is EnterpriseSsoConnectionRecord {
  return Boolean(
    connection?.status === 'active' &&
    connection.validatedAt &&
    [...evidence.values()].some(
      (record) => record.connectionId === connection.id && record.revokedAt === null,
    ),
  );
}

function strongestMappedRole(
  groupIds: readonly string[],
  mappings: ReadonlyArray<{ groupId: string; role: 'admin' | 'member' | 'viewer' }>,
): 'admin' | 'member' | 'viewer' | null {
  const rank = { viewer: 0, member: 1, admin: 2 } as const;
  let selected: 'admin' | 'member' | 'viewer' | null = null;
  for (const mapping of mappings) {
    if (!groupIds.includes(mapping.groupId)) continue;
    if (!selected || rank[mapping.role] > rank[selected]) selected = mapping.role;
  }
  return selected;
}
