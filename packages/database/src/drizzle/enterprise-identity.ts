import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  AuthenticateEnterpriseSsoInput,
  AuthenticateEnterpriseSsoResult,
  ApproveEnterpriseBreakGlassInput,
  BindEnterpriseIdentityInput,
  ConsumeEnterpriseBreakGlassInput,
  CreateEnterpriseBreakGlassInput,
  CreateEnterpriseDomainInput,
  CreateEnterpriseScimConnectionInput,
  CreateEnterpriseSsoConnectionInput,
  DisableEnterpriseScimConnectionInput,
  DisableEnterpriseSsoConnectionInput,
  EnterpriseAuditEventRecord,
  EnterpriseIdentityRepository,
  EnterpriseMutationResult,
  EnterpriseReadResult,
  EnterpriseScimProvisionResult,
  EnterpriseSsoConnectionRecord,
  EnterpriseVerifiedDomainRecord,
  FindEnterpriseScimUserInput,
  ProvisionEnterpriseScimUserInput,
  RecordEnterpriseValidationEvidenceInput,
  UpdateEnterpriseScimUserInput,
  UpdateWorkspaceEnterprisePolicyInput,
  UpsertEnterpriseGroupRoleMappingInput,
  VerifyEnterpriseDomainInput,
} from '../domains/enterprise-identity';
import {
  authIdentities,
  authSessions,
  authoringActivationGrants,
  authoringSessions,
  enterpriseAuditEvents,
  enterpriseBreakGlassRequests,
  enterprisePrincipals,
  enterpriseScimConnections,
  enterpriseValidationEvidence,
  ssoConnections,
  ssoGroupRoleMappings,
  userEmails,
  users,
  workspaceAuthPolicies,
  workspaceInvitations,
  workspaceMemberships,
  workspaceVerifiedDomains,
} from '../schema';
import {
  LODARIQ_AUTH_IDENTITY_ISSUER_SETTING,
  LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING,
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_WORKSPACE_ID_SETTING,
  runWithTenantActorScope,
} from '../scoped-transaction';
import {
  authSessionValues,
  isUniqueConstraintViolation,
  toAuthSessionRecord,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryOidc } from './oidc';
import type { LodariqTransaction } from './types';

const ENTERPRISE_DOMAIN_SETTING = 'lodariq.enterprise_domain';
const ENTERPRISE_SCIM_TOKEN_HASH_SETTING = 'lodariq.enterprise_scim_token_hash';
const ENTERPRISE_IDENTITY_ID_SETTING = 'lodariq.enterprise_identity_id';
const ENTERPRISE_VALIDATION_WORKER_SETTING = 'lodariq.enterprise_validation_worker';
const ENTERPRISE_CONNECTION_ID_SETTING = 'lodariq.enterprise_connection_id';

export class DrizzleRepositoryEnterpriseIdentity
  extends DrizzleRepositoryOidc
  implements EnterpriseIdentityRepository
{
  async discoverEnterpriseSso(domain: string) {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${ENTERPRISE_DOMAIN_SETTING}, ${domain}, true)`);
      const [row] = await tx
        .select({
          connectionId: ssoConnections.id,
          protocol: ssoConnections.protocol,
          provider: ssoConnections.provider,
        })
        .from(workspaceVerifiedDomains)
        .innerJoin(ssoConnections, eq(ssoConnections.id, workspaceVerifiedDomains.connectionId))
        .innerJoin(
          enterpriseValidationEvidence,
          and(
            eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
            isNull(enterpriseValidationEvidence.revokedAt),
          ),
        )
        .where(
          and(
            eq(workspaceVerifiedDomains.domain, domain),
            eq(workspaceVerifiedDomains.status, 'verified'),
            eq(ssoConnections.status, 'verified'),
          ),
        )
        .limit(1);
      return row
        ? {
            connectionId: row.connectionId,
            protocol: row.protocol as EnterpriseSsoConnectionRecord['protocol'],
            provider: row.provider as EnterpriseSsoConnectionRecord['provider'],
          }
        : null;
    });
  }

  async getEnterpriseSsoConnectionForAuthorization(connectionId: string) {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config(${ENTERPRISE_CONNECTION_ID_SETTING}, ${connectionId}, true)`,
      );
      const [row] = await tx
        .select({ connection: ssoConnections })
        .from(ssoConnections)
        .innerJoin(
          enterpriseValidationEvidence,
          and(
            eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
            isNull(enterpriseValidationEvidence.revokedAt),
          ),
        )
        .where(
          and(eq(ssoConnections.id, connectionId), eq(ssoConnections.status, 'verified')),
        )
        .limit(1);
      return row ? toEnterpriseSsoConnection(row.connection) : null;
    });
  }

  async listEnterpriseSsoConnections(
    workspaceId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseSsoConnectionRecord[]>> {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, async (tx) => {
      if (!(await hasRole(tx, workspaceId, actorUserId, ['admin', 'owner']))) {
        return { status: 'forbidden' };
      }
      const rows = await tx
        .select()
        .from(ssoConnections)
        .where(eq(ssoConnections.workspaceId, workspaceId))
        .orderBy(asc(ssoConnections.createdAt));
      return { status: 'ok', value: rows.map(toEnterpriseSsoConnection) };
    });
  }

  async getEnterpriseWorkspaceConfiguration(workspaceId: string, actorUserId: string) {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, async (tx) => {
      if (!(await hasRole(tx, workspaceId, actorUserId, ['admin', 'owner']))) {
        return { status: 'forbidden' as const };
      }
      const [policy, connections, domains, mappings, scim] = await Promise.all([
        tx
          .select()
          .from(workspaceAuthPolicies)
          .where(eq(workspaceAuthPolicies.workspaceId, workspaceId))
          .limit(1),
        tx
          .select()
          .from(ssoConnections)
          .where(eq(ssoConnections.workspaceId, workspaceId))
          .orderBy(asc(ssoConnections.createdAt)),
        tx
          .select()
          .from(workspaceVerifiedDomains)
          .where(eq(workspaceVerifiedDomains.workspaceId, workspaceId))
          .orderBy(asc(workspaceVerifiedDomains.createdAt)),
        tx
          .select()
          .from(ssoGroupRoleMappings)
          .where(eq(ssoGroupRoleMappings.workspaceId, workspaceId))
          .orderBy(asc(ssoGroupRoleMappings.createdAt)),
        tx
          .select()
          .from(enterpriseScimConnections)
          .where(eq(enterpriseScimConnections.workspaceId, workspaceId))
          .orderBy(asc(enterpriseScimConnections.createdAt)),
      ]);
      const current = policy[0];
      if (!current) return { status: 'not_found' as const };
      return {
        status: 'ok' as const,
        value: {
          policy: {
            workspaceId,
            ssoRequired: current.ssoRequired,
            minimumAssurance: current.minimumAssurance as 'aal1' | 'aal2' | 'aal3',
            passwordAllowed: current.passwordAllowed,
          },
          connections: connections.map(toEnterpriseSsoConnection),
          domains: domains.map((domain) => ({
            id: domain.id,
            workspaceId: domain.workspaceId,
            connectionId: domain.connectionId,
            domain: domain.domain,
            status: domain.status as 'pending' | 'verified' | 'disabled',
            verificationTokenHash: domain.verificationTokenHash,
            verificationRecordName: domain.verificationRecordName,
            verifiedAt: domain.verifiedAt ? toIsoString(domain.verifiedAt) : null,
            createdAt: toIsoString(domain.createdAt),
            updatedAt: toIsoString(domain.updatedAt),
          })),
          groupRoleMappings: mappings.map((mapping) => ({
            id: mapping.id,
            workspaceId: mapping.workspaceId,
            connectionId: mapping.connectionId,
            groupId: mapping.groupId,
            role: mapping.role as 'admin' | 'member' | 'viewer',
            createdAt: toIsoString(mapping.createdAt),
            updatedAt: toIsoString(mapping.updatedAt),
          })),
          scimConnections: scim.map(toScimConnection),
        },
      };
    });
  }

  async createEnterpriseSsoConnection(
    input: CreateEnterpriseSsoConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    try {
      return await runWithTenantActorScope(
        this.database,
        input.connection.workspaceId,
        input.actorUserId,
        async (tx) => {
          if (!(await hasRole(tx, input.connection.workspaceId, input.actorUserId, ['owner']))) {
            return 'forbidden';
          }
          if (
            input.connection.status === 'active' ||
            input.connection.validatedAt !== null ||
            input.auditEvent.workspaceId !== input.connection.workspaceId ||
            input.auditEvent.connectionId !== input.connection.id
          ) {
            return 'invalid_input';
          }
          await tx.insert(ssoConnections).values(connectionValues(input.connection));
          await insertEnterpriseAuditEvent(tx, input.auditEvent);
          return 'completed';
        },
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return 'conflict';
      throw error;
    }
  }

  async disableEnterpriseSsoConnection(
    input: DisableEnterpriseSsoConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        if (!(await hasRole(tx, input.workspaceId, input.actorUserId, ['owner']))) {
          return 'forbidden';
        }
        await tx.execute(
          sql`select set_config(${ENTERPRISE_CONNECTION_ID_SETTING}, ${input.connectionId}, true)`,
        );
        const disabledAt = new Date(input.disabledAt);
        const [disabled] = await tx
          .update(ssoConnections)
          .set({ status: 'disabled', updatedAt: disabledAt })
          .where(
            and(
              eq(ssoConnections.id, input.connectionId),
              eq(ssoConnections.workspaceId, input.workspaceId),
              sql`${ssoConnections.status} <> 'disabled'`,
            ),
          )
          .returning({ id: ssoConnections.id });
        if (!disabled) return 'not_found';
        await tx
          .update(workspaceVerifiedDomains)
          .set({ status: 'disabled', updatedAt: disabledAt })
          .where(eq(workspaceVerifiedDomains.connectionId, input.connectionId));
        await tx
          .update(enterpriseScimConnections)
          .set({ status: 'disabled', updatedAt: disabledAt })
          .where(eq(enterpriseScimConnections.connectionId, input.connectionId));
        const principals = await tx
          .select({ userId: enterprisePrincipals.userId })
          .from(enterprisePrincipals)
          .where(eq(enterprisePrincipals.connectionId, input.connectionId));
        const userIds = principals.map((principal) => principal.userId);
        if (userIds.length) {
          await tx
            .update(authSessions)
            .set({ revokedAt: disabledAt })
            .where(
              and(
                inArray(authSessions.userId, userIds),
                isNull(authSessions.revokedAt),
              ),
            );
          await tx
            .update(authoringActivationGrants)
            .set({ revokedAt: disabledAt })
            .where(
              and(
                eq(authoringActivationGrants.workspaceId, input.workspaceId),
                inArray(authoringActivationGrants.creatorId, userIds),
                isNull(authoringActivationGrants.revokedAt),
              ),
            );
          await tx
            .update(authoringSessions)
            .set({ revokedAt: disabledAt })
            .where(
              and(
                eq(authoringSessions.workspaceId, input.workspaceId),
                inArray(authoringSessions.createdByUserId, userIds),
                isNull(authoringSessions.revokedAt),
              ),
            );
        }
        await insertEnterpriseAuditEvent(tx, input.auditEvent);
        return 'completed';
      },
    );
  }

  async recordEnterpriseValidationEvidence(
    input: RecordEnterpriseValidationEvidenceInput,
  ): Promise<EnterpriseMutationResult> {
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_WORKSPACE_ID_SETTING}, ${input.evidence.workspaceId}, true),
            set_config(${ENTERPRISE_VALIDATION_WORKER_SETTING}, 'true', true)`,
        );
        const [connection] = await tx
          .select()
          .from(ssoConnections)
          .where(
            and(
              eq(ssoConnections.id, input.evidence.connectionId),
              eq(ssoConnections.workspaceId, input.evidence.workspaceId),
            ),
          )
          .limit(1);
        if (
          !connection ||
          connection.provider !== input.evidence.target ||
          connection.protocol !== input.evidence.protocol ||
          input.evidence.protocol !== 'oidc' ||
          connection.status === 'disabled' ||
          input.evidence.revokedAt !== null
        ) {
          return 'invalid_input';
        }
        await tx.insert(enterpriseValidationEvidence).values({
          id: input.evidence.id,
          connectionId: input.evidence.connectionId,
          workspaceId: input.evidence.workspaceId,
          target: input.evidence.target,
          protocol: input.evidence.protocol,
          evidenceReference: input.evidence.evidenceReference,
          validatedBy: input.evidence.validatedBy,
          validatedAt: new Date(input.evidence.validatedAt),
          revokedAt: null,
        });
        await tx
          .update(ssoConnections)
          .set({
            status: 'verified',
            validatedAt: new Date(input.evidence.validatedAt),
            updatedAt: new Date(input.evidence.validatedAt),
          })
          .where(eq(ssoConnections.id, input.evidence.connectionId));
        await insertEnterpriseAuditEvent(tx, input.auditEvent);
        return 'completed';
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return 'conflict';
      throw error;
    }
  }

  async createEnterpriseDomain(
    input: CreateEnterpriseDomainInput,
  ): Promise<EnterpriseMutationResult> {
    try {
      return await runWithTenantActorScope(
        this.database,
        input.domain.workspaceId,
        input.actorUserId,
        async (tx) => {
          if (!(await hasRole(tx, input.domain.workspaceId, input.actorUserId, ['owner']))) {
            return 'forbidden';
          }
          const [connection] = await tx
            .select({ workspaceId: ssoConnections.workspaceId })
            .from(ssoConnections)
            .where(eq(ssoConnections.id, input.domain.connectionId))
            .limit(1);
          if (
            connection?.workspaceId !== input.domain.workspaceId ||
            input.domain.status !== 'pending' ||
            input.domain.verifiedAt !== null
          ) {
            return 'invalid_input';
          }
          await tx.insert(workspaceVerifiedDomains).values({
            id: input.domain.id,
            workspaceId: input.domain.workspaceId,
            connectionId: input.domain.connectionId,
            domain: input.domain.domain,
            status: input.domain.status,
            verificationTokenHash: input.domain.verificationTokenHash,
            verificationRecordName: input.domain.verificationRecordName,
            verifiedAt: null,
            createdAt: new Date(input.domain.createdAt),
            updatedAt: new Date(input.domain.updatedAt),
          });
          await insertEnterpriseAuditEvent(tx, input.auditEvent);
          return 'completed';
        },
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return 'conflict';
      throw error;
    }
  }

  async verifyEnterpriseDomain(
    input: VerifyEnterpriseDomainInput,
  ): Promise<EnterpriseMutationResult> {
    return runWithTenantActorScope(this.database, input.workspaceId, input.actorUserId, async (tx) => {
      if (!(await hasRole(tx, input.workspaceId, input.actorUserId, ['owner']))) return 'forbidden';
      const [updated] = await tx
        .update(workspaceVerifiedDomains)
        .set({ status: 'verified', verifiedAt: new Date(input.verifiedAt), updatedAt: new Date(input.verifiedAt) })
        .where(
          and(
            eq(workspaceVerifiedDomains.id, input.domainId),
            eq(workspaceVerifiedDomains.workspaceId, input.workspaceId),
            eq(workspaceVerifiedDomains.status, 'pending'),
            eq(workspaceVerifiedDomains.verificationTokenHash, input.verificationTokenHash),
          ),
        )
        .returning({ id: workspaceVerifiedDomains.id });
      if (!updated) return 'conflict';
      await insertEnterpriseAuditEvent(tx, input.auditEvent);
      return 'completed';
    });
  }

  async getEnterpriseDomainForVerification(
    workspaceId: string,
    domainId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseVerifiedDomainRecord>> {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, async (tx) => {
      if (!(await hasRole(tx, workspaceId, actorUserId, ['owner']))) {
        return { status: 'forbidden' };
      }
      const [domain] = await tx
        .select()
        .from(workspaceVerifiedDomains)
        .where(
          and(
            eq(workspaceVerifiedDomains.id, domainId),
            eq(workspaceVerifiedDomains.workspaceId, workspaceId),
            eq(workspaceVerifiedDomains.status, 'pending'),
          ),
        )
        .limit(1);
      if (!domain) return { status: 'not_found' };
      return {
        status: 'ok',
        value: {
          id: domain.id,
          workspaceId: domain.workspaceId,
          connectionId: domain.connectionId,
          domain: domain.domain,
          status: domain.status as EnterpriseVerifiedDomainRecord['status'],
          verificationTokenHash: domain.verificationTokenHash,
          verificationRecordName: domain.verificationRecordName,
          verifiedAt: domain.verifiedAt ? toIsoString(domain.verifiedAt) : null,
          createdAt: toIsoString(domain.createdAt),
          updatedAt: toIsoString(domain.updatedAt),
        },
      };
    });
  }

  async updateWorkspaceEnterprisePolicy(
    input: UpdateWorkspaceEnterprisePolicyInput,
  ): Promise<EnterpriseMutationResult> {
    if (input.minimumAssurance === 'aal3') return 'invalid_input';
    return runWithTenantActorScope(this.database, input.workspaceId, input.actorUserId, async (tx) => {
      if (!(await hasRole(tx, input.workspaceId, input.actorUserId, ['owner']))) return 'forbidden';
      if (!input.passwordAllowed && !input.ssoRequired) return 'invalid_input';
      if (input.breakGlassRequestId) {
        if (!input.breakGlassAuditEvent) return 'invalid_input';
        const [consumed] = await tx
          .update(enterpriseBreakGlassRequests)
          .set({ status: 'consumed', consumedAt: new Date(input.updatedAt) })
          .where(
            and(
              eq(enterpriseBreakGlassRequests.id, input.breakGlassRequestId),
              eq(enterpriseBreakGlassRequests.workspaceId, input.workspaceId),
              eq(enterpriseBreakGlassRequests.requestedByUserId, input.actorUserId),
              eq(enterpriseBreakGlassRequests.status, 'approved'),
              sql`${enterpriseBreakGlassRequests.expiresAt} > ${new Date(input.updatedAt)}`,
            ),
          )
          .returning({ id: enterpriseBreakGlassRequests.id });
        if (!consumed) return 'forbidden';
        await insertEnterpriseAuditEvent(tx, input.breakGlassAuditEvent);
      } else if (input.breakGlassAuditEvent) {
        return 'invalid_input';
      }
      if (input.ssoRequired && !(await hasValidatedConnection(tx, input.workspaceId))) {
        return 'validation_required';
      }
      const [updated] = await tx
        .update(workspaceAuthPolicies)
        .set({
          ssoRequired: input.ssoRequired,
          minimumAssurance: input.minimumAssurance,
          passwordAllowed: input.passwordAllowed,
          updatedAt: new Date(input.updatedAt),
        })
        .where(eq(workspaceAuthPolicies.workspaceId, input.workspaceId))
        .returning({ workspaceId: workspaceAuthPolicies.workspaceId });
      if (!updated) return 'not_found';
      const revokedAt = new Date(input.updatedAt);
      await tx
        .update(authoringActivationGrants)
        .set({ revokedAt })
        .where(
          and(
            eq(authoringActivationGrants.workspaceId, input.workspaceId),
            isNull(authoringActivationGrants.revokedAt),
          ),
        );
      await tx
        .update(authoringSessions)
        .set({ revokedAt })
        .where(
          and(
            eq(authoringSessions.workspaceId, input.workspaceId),
            isNull(authoringSessions.revokedAt),
          ),
        );
      await insertEnterpriseAuditEvent(tx, input.auditEvent);
      return 'completed';
    });
  }

  async upsertEnterpriseGroupRoleMapping(
    input: UpsertEnterpriseGroupRoleMappingInput,
  ): Promise<EnterpriseMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.mapping.workspaceId,
      input.actorUserId,
      async (tx) => {
        if (!(await hasRole(tx, input.mapping.workspaceId, input.actorUserId, ['owner']))) {
          return 'forbidden';
        }
        const [connection] = await tx
          .select({ workspaceId: ssoConnections.workspaceId })
          .from(ssoConnections)
          .where(eq(ssoConnections.id, input.mapping.connectionId))
          .limit(1);
        if (connection?.workspaceId !== input.mapping.workspaceId) return 'invalid_input';
        await tx
          .insert(ssoGroupRoleMappings)
          .values({
            id: input.mapping.id,
            workspaceId: input.mapping.workspaceId,
            connectionId: input.mapping.connectionId,
            groupId: input.mapping.groupId,
            role: input.mapping.role,
            createdAt: new Date(input.mapping.createdAt),
            updatedAt: new Date(input.mapping.updatedAt),
          })
          .onConflictDoUpdate({
            target: [ssoGroupRoleMappings.connectionId, ssoGroupRoleMappings.groupId],
            set: {
              role: input.mapping.role,
              updatedAt: new Date(input.mapping.updatedAt),
            },
          });
        await insertEnterpriseAuditEvent(tx, input.auditEvent);
        return 'completed';
      },
    );
  }

  async createEnterpriseScimConnection(
    input: CreateEnterpriseScimConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    try {
      return await runWithTenantActorScope(
        this.database,
        input.connection.workspaceId,
        input.actorUserId,
        async (tx) => {
          if (!(await hasRole(tx, input.connection.workspaceId, input.actorUserId, ['owner']))) {
            return 'forbidden';
          }
          if (!(await hasValidatedConnection(tx, input.connection.workspaceId, input.connection.connectionId))) {
            return 'validation_required';
          }
          await tx.insert(enterpriseScimConnections).values({
            id: input.connection.id,
            workspaceId: input.connection.workspaceId,
            connectionId: input.connection.connectionId,
            tokenHash: input.connection.tokenHash,
            tokenPrefix: input.connection.tokenPrefix,
            status: input.connection.status,
            createdByUserId: input.connection.createdByUserId,
            lastUsedAt: null,
            createdAt: new Date(input.connection.createdAt),
            updatedAt: new Date(input.connection.updatedAt),
          });
          await insertEnterpriseAuditEvent(tx, input.auditEvent);
          return 'completed';
        },
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return 'conflict';
      throw error;
    }
  }

  async disableEnterpriseScimConnection(
    input: DisableEnterpriseScimConnectionInput,
  ): Promise<EnterpriseMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        if (!(await hasRole(tx, input.workspaceId, input.actorUserId, ['owner']))) {
          return 'forbidden';
        }
        const [disabled] = await tx
          .update(enterpriseScimConnections)
          .set({ status: 'disabled', updatedAt: new Date(input.disabledAt) })
          .where(
            and(
              eq(enterpriseScimConnections.id, input.scimConnectionId),
              eq(enterpriseScimConnections.workspaceId, input.workspaceId),
              eq(enterpriseScimConnections.status, 'active'),
            ),
          )
          .returning({ id: enterpriseScimConnections.id });
        if (!disabled) return 'not_found';
        await insertEnterpriseAuditEvent(tx, input.auditEvent);
        return 'completed';
      },
    );
  }

  async resolveEnterpriseScimConnection(tokenHash: string, usedAt: string) {
    return this.database.transaction(async (tx) => {
      if (!(await bindScimAuthorizationScope(tx, tokenHash))) return null;
      const [row] = await tx
        .select({ scim: enterpriseScimConnections, issuer: ssoConnections.issuer })
        .from(enterpriseScimConnections)
        .innerJoin(ssoConnections, eq(ssoConnections.id, enterpriseScimConnections.connectionId))
        .innerJoin(
          enterpriseValidationEvidence,
          and(
            eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
            isNull(enterpriseValidationEvidence.revokedAt),
          ),
        )
        .where(
          and(
            eq(enterpriseScimConnections.tokenHash, tokenHash),
            eq(enterpriseScimConnections.status, 'active'),
            eq(ssoConnections.status, 'verified'),
          ),
        )
        .limit(1);
      if (!row) return null;
      const [updated] = await tx
        .update(enterpriseScimConnections)
        .set({ lastUsedAt: new Date(usedAt), updatedAt: new Date(usedAt) })
        .where(eq(enterpriseScimConnections.id, row.scim.id))
        .returning();
      return updated ? { ...toScimConnection(updated), issuer: row.issuer } : null;
    });
  }

  async findEnterpriseScimUser(input: FindEnterpriseScimUserInput) {
    return this.database.transaction(async (tx) => {
      await setScimScope(tx, input.scimTokenHash);
      const scim = await resolveActiveScim(tx, input.scimConnectionId, input.scimTokenHash);
      if (!scim) return null;
      const conditions = [eq(enterprisePrincipals.connectionId, scim.connectionId)];
      if (input.principalId) conditions.push(eq(enterprisePrincipals.id, input.principalId));
      if (input.emailNormalized) conditions.push(eq(userEmails.normalizedEmail, input.emailNormalized));
      const [row] = await tx
        .select({
          principal: enterprisePrincipals,
          email: userEmails.normalizedEmail,
          displayName: users.name,
        })
        .from(enterprisePrincipals)
        .innerJoin(users, eq(users.id, enterprisePrincipals.userId))
        .innerJoin(
          userEmails,
          and(eq(userEmails.userId, users.id), eq(userEmails.isPrimary, true)),
        )
        .where(and(...conditions))
        .limit(1);
      return row
        ? {
            id: row.principal.id,
            externalId: row.principal.externalId,
            userName: row.email,
            active: row.principal.active,
            displayName: row.displayName,
          }
        : null;
    });
  }

  async provisionEnterpriseScimUser(
    input: ProvisionEnterpriseScimUserInput,
  ): Promise<EnterpriseScimProvisionResult> {
    try {
      return await this.database.transaction(async (tx) => {
        await setScimScope(tx, input.scimTokenHash);
        const scim = await resolveActiveScim(tx, input.scimConnectionId, input.scimTokenHash);
        if (!scim || scim.workspaceId !== input.principal.workspaceId) {
          return { status: 'invalid_connection' };
        }
        if (
          input.principal.connectionId !== scim.connectionId ||
          input.principal.userId !== input.user.id ||
          input.email.userId !== input.user.id ||
          input.email.normalizedEmail !== input.user.email ||
          !input.email.isPrimary ||
          !input.email.verifiedAt ||
          !input.principal.active
        ) {
          return { status: 'invalid_input' };
        }
        const role = (await mappedScimRole(tx, scim.connectionId, input.groupIds)) ?? input.role;
        await tx.insert(users).values({
          id: input.user.id,
          legacyIdentityId: null,
          email: input.user.email,
          name: input.user.name ?? null,
          emailVerifiedAt: new Date(input.email.verifiedAt),
          createdAt: new Date(input.user.createdAt),
        });
        await tx.insert(userEmails).values({
          id: input.email.id,
          userId: input.email.userId,
          normalizedEmail: input.email.normalizedEmail,
          isPrimary: true,
          verifiedAt: new Date(input.email.verifiedAt),
          createdAt: new Date(input.email.createdAt),
          updatedAt: new Date(input.email.updatedAt),
        });
        await tx.insert(workspaceMemberships).values({
          workspaceId: scim.workspaceId,
          userId: input.user.id,
          role,
          createdAt: new Date(input.occurredAt),
        });
        await tx.insert(enterprisePrincipals).values(principalValues(input.principal));
        await insertEnterpriseAuditEvent(tx, input.auditEvent);
        return { status: 'created', principal: input.principal };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async updateEnterpriseScimUser(
    input: UpdateEnterpriseScimUserInput,
  ): Promise<EnterpriseMutationResult> {
    return this.database.transaction(async (tx) => {
      await setScimScope(tx, input.scimTokenHash);
      const scim = await resolveActiveScim(tx, input.scimConnectionId, input.scimTokenHash);
      if (!scim) return 'not_found';
      const [principal] = await tx
        .select()
        .from(enterprisePrincipals)
        .where(
          and(
            eq(enterprisePrincipals.id, input.principalId),
            eq(enterprisePrincipals.connectionId, scim.connectionId),
            eq(enterprisePrincipals.workspaceId, scim.workspaceId),
          ),
        )
        .limit(1);
      if (!principal) return 'not_found';
      if (input.active === true && !principal.active) return 'conflict';
      if (input.displayName !== undefined) {
        await tx.update(users).set({ name: input.displayName }).where(eq(users.id, principal.userId));
      }
      if (input.active === false && principal.active) {
        const revokedAt = new Date(input.occurredAt);
        await tx
          .update(enterprisePrincipals)
          .set({ active: false, deprovisionedAt: revokedAt, updatedAt: revokedAt })
          .where(eq(enterprisePrincipals.id, principal.id));
        await tx
          .delete(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, principal.workspaceId),
              eq(workspaceMemberships.userId, principal.userId),
            ),
          );
        await tx
          .update(authSessions)
          .set({ revokedAt })
          .where(and(eq(authSessions.userId, principal.userId), isNull(authSessions.revokedAt)));
        await tx
          .update(authoringActivationGrants)
          .set({ revokedAt })
          .where(
            and(
              eq(authoringActivationGrants.workspaceId, principal.workspaceId),
              eq(authoringActivationGrants.creatorId, principal.userId),
              isNull(authoringActivationGrants.revokedAt),
            ),
          );
        await tx
          .update(authoringSessions)
          .set({ revokedAt })
          .where(
            and(
              eq(authoringSessions.workspaceId, principal.workspaceId),
              eq(authoringSessions.createdByUserId, principal.userId),
              isNull(authoringSessions.revokedAt),
            ),
          );
      }
      await insertEnterpriseAuditEvent(tx, input.auditEvent);
      return 'completed';
    });
  }

  async bindEnterpriseIdentity(input: BindEnterpriseIdentityInput): Promise<EnterpriseMutationResult> {
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.identity.userId}, true),
            set_config(${LODARIQ_AUTH_IDENTITY_ISSUER_SETTING}, ${input.identity.issuer}, true),
            set_config(${LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING}, ${input.identity.subject}, true)`,
        );
        const [row] = await tx
          .select({ principal: enterprisePrincipals, connection: ssoConnections })
          .from(enterprisePrincipals)
          .innerJoin(ssoConnections, eq(ssoConnections.id, enterprisePrincipals.connectionId))
          .innerJoin(
            enterpriseValidationEvidence,
            and(
              eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
              isNull(enterpriseValidationEvidence.revokedAt),
            ),
          )
          .where(
            and(
              eq(enterprisePrincipals.connectionId, input.connectionId),
              eq(enterprisePrincipals.externalId, input.externalId),
              eq(enterprisePrincipals.active, true),
              eq(ssoConnections.status, 'verified'),
            ),
          )
          .limit(1);
        if (
          !row ||
          row.principal.userId !== input.identity.userId ||
          row.connection.issuer !== input.identity.issuer ||
          row.connection.protocol !== input.identity.kind
        ) {
          return 'invalid_input';
        }
        await tx.insert(authIdentities).values({
          id: input.identity.id,
          userId: input.identity.userId,
          kind: input.identity.kind,
          issuer: input.identity.issuer,
          subject: input.identity.subject,
          providerTenantId: input.identity.providerTenantId,
          createdAt: new Date(input.identity.createdAt),
          lastAuthenticatedAt: new Date(input.authenticatedAt),
          disabledAt: null,
        });
        await tx
          .update(enterprisePrincipals)
          .set({ subject: input.identity.subject, updatedAt: new Date(input.authenticatedAt) })
          .where(eq(enterprisePrincipals.id, row.principal.id));
        return 'completed';
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return 'conflict';
      throw error;
    }
  }

  async authenticateEnterpriseSso(
    input: AuthenticateEnterpriseSsoInput,
  ): Promise<AuthenticateEnterpriseSsoResult> {
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${ENTERPRISE_CONNECTION_ID_SETTING}, ${input.connectionId}, true),
            set_config(${LODARIQ_AUTH_IDENTITY_ISSUER_SETTING}, ${input.issuer}, true),
            set_config(${LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING}, ${input.subject}, true),
            set_config('lodariq.auth_email_normalized', ${input.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.candidateUser.id}, true)`,
        );
        const [resolvedConnection] = await tx
          .select({ connection: ssoConnections })
          .from(ssoConnections)
          .innerJoin(
            enterpriseValidationEvidence,
            and(
              eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
              isNull(enterpriseValidationEvidence.revokedAt),
            ),
          )
          .where(
            and(
              eq(ssoConnections.id, input.connectionId),
              eq(ssoConnections.status, 'verified'),
              eq(ssoConnections.protocol, 'oidc'),
            ),
          )
          .limit(1);
        const connection = resolvedConnection?.connection;
        if (!connection || connection.issuer !== input.issuer) {
          return { status: 'invalid_connection' };
        }
        const [identity] = await tx
          .select()
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.issuer, input.issuer),
              eq(authIdentities.subject, input.subject),
            ),
          )
          .limit(1);
        const [resolvedPrincipal] = await tx
          .select()
          .from(enterprisePrincipals)
          .where(
            and(
              eq(enterprisePrincipals.connectionId, input.connectionId),
              sql`(${enterprisePrincipals.externalId} = ${input.externalId} or ${enterprisePrincipals.subject} = ${input.subject})`,
            ),
          )
          .limit(1);

        if (resolvedPrincipal) {
          if (!resolvedPrincipal.active) return { status: 'deprovisioned' };
          if (identity && identity.userId !== resolvedPrincipal.userId) {
            return { status: 'conflict' };
          }
          await tx.execute(
            sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${resolvedPrincipal.userId}, true)`,
          );
          const [membership] = await tx
            .select()
            .from(workspaceMemberships)
            .where(
              and(
                eq(workspaceMemberships.workspaceId, connection.workspaceId),
                eq(workspaceMemberships.userId, resolvedPrincipal.userId),
              ),
            )
            .limit(1)
            .for('update');
          if (!membership) return { status: 'deprovisioned' };
          if (membership.role !== 'owner') {
            const mappedRole = await mappedScimRole(tx, connection.id, input.groupIds);
            const managedRole = mappedRole ?? 'viewer';
            if (membership.role !== managedRole) {
              await tx
                .update(workspaceMemberships)
                .set({ role: managedRole })
                .where(
                  and(
                    eq(workspaceMemberships.workspaceId, connection.workspaceId),
                    eq(workspaceMemberships.userId, resolvedPrincipal.userId),
                  ),
                );
            }
          }
          let identityId = identity?.id;
          if (!identityId) {
            identityId = input.candidateIdentity.id;
            await tx.insert(authIdentities).values({
              id: identityId,
              userId: resolvedPrincipal.userId,
              kind: 'oidc',
              issuer: input.issuer,
              subject: input.subject,
              providerTenantId: input.candidateIdentity.providerTenantId,
              createdAt: new Date(input.occurredAt),
              lastAuthenticatedAt: new Date(input.occurredAt),
              disabledAt: null,
            });
          } else {
            await tx
              .update(authIdentities)
              .set({ lastAuthenticatedAt: new Date(input.occurredAt) })
              .where(eq(authIdentities.id, identityId));
          }
          await tx
            .update(enterprisePrincipals)
            .set({ subject: input.subject, updatedAt: new Date(input.occurredAt) })
            .where(eq(enterprisePrincipals.id, resolvedPrincipal.id));
          const session = enterpriseSessionForDatabase(
            input.candidateSession,
            resolvedPrincipal.userId,
            identityId,
            connection.workspaceId,
          );
          const [createdSession] = await tx
            .insert(authSessions)
            .values(authSessionValues(session))
            .returning();
          await insertEnterpriseAuditEvent(tx, {
            ...input.auditEvent,
            workspaceId: connection.workspaceId,
            targetUserId: resolvedPrincipal.userId,
            eventType: 'enterprise_sso_authenticated',
            metadata: { ...input.auditEvent.metadata, created: false },
          });
          return createdSession
            ? {
                status: 'authenticated',
                userId: resolvedPrincipal.userId,
                session: toAuthSessionRecord(createdSession),
                created: false,
              }
            : { status: 'conflict' };
        }

        if (identity) return { status: 'conflict' };
        if (!input.emailVerified) return { status: 'unverified_email' };
        const emailDomain = input.emailNormalized.slice(input.emailNormalized.lastIndexOf('@') + 1);
        const [verifiedDomain] = await tx
          .select({ id: workspaceVerifiedDomains.id })
          .from(workspaceVerifiedDomains)
          .where(
            and(
              eq(workspaceVerifiedDomains.connectionId, connection.id),
              eq(workspaceVerifiedDomains.domain, emailDomain),
              eq(workspaceVerifiedDomains.status, 'verified'),
            ),
          )
          .limit(1);
        if (!verifiedDomain) return { status: 'unverified_email' };
        const [emailCollision] = await tx
          .select({ id: userEmails.id })
          .from(userEmails)
          .where(eq(userEmails.normalizedEmail, input.emailNormalized))
          .limit(1);
        if (emailCollision) return { status: 'conflict' };

        const [invitation] = await tx
          .select()
          .from(workspaceInvitations)
          .where(
            and(
              eq(workspaceInvitations.workspaceId, connection.workspaceId),
              eq(workspaceInvitations.emailNormalized, input.emailNormalized),
              isNull(workspaceInvitations.acceptedAt),
              isNull(workspaceInvitations.revokedAt),
              sql`${workspaceInvitations.expiresAt} > ${new Date(input.occurredAt)}`,
            ),
          )
          .limit(1)
          .for('update');
        if (connection.provisioningMode === 'invitation_only' && !invitation) {
          return { status: 'invitation_required' };
        }
        const mappedRole = await mappedScimRole(tx, connection.id, input.groupIds);
        const role = invitation?.role ?? mappedRole ?? 'viewer';
        if (
          input.candidateUser.id !== input.candidateEmail.userId ||
          input.candidateUser.id !== input.candidateIdentity.userId ||
          input.candidateUser.id !== input.candidatePrincipal.userId ||
          input.candidateUser.id !== input.candidateSession.userId ||
          input.candidatePrincipal.workspaceId !== connection.workspaceId ||
          input.candidatePrincipal.connectionId !== connection.id ||
          input.candidatePrincipal.externalId !== input.externalId ||
          input.candidatePrincipal.issuer !== input.issuer ||
          input.candidatePrincipal.subject !== input.subject ||
          input.candidateEmail.normalizedEmail !== input.emailNormalized
        ) {
          return { status: 'conflict' };
        }
        await tx.insert(users).values({
          id: input.candidateUser.id,
          legacyIdentityId: null,
          email: input.emailNormalized,
          name: input.displayName,
          emailVerifiedAt: new Date(input.occurredAt),
          createdAt: new Date(input.occurredAt),
        });
        await tx.insert(userEmails).values({
          id: input.candidateEmail.id,
          userId: input.candidateUser.id,
          normalizedEmail: input.emailNormalized,
          isPrimary: true,
          verifiedAt: new Date(input.occurredAt),
          createdAt: new Date(input.occurredAt),
          updatedAt: new Date(input.occurredAt),
        });
        await tx.insert(authIdentities).values({
          id: input.candidateIdentity.id,
          userId: input.candidateUser.id,
          kind: 'oidc',
          issuer: input.issuer,
          subject: input.subject,
          providerTenantId: input.candidateIdentity.providerTenantId,
          createdAt: new Date(input.occurredAt),
          lastAuthenticatedAt: new Date(input.occurredAt),
          disabledAt: null,
        });
        await tx.insert(enterprisePrincipals).values(principalValues(input.candidatePrincipal));
        await tx.insert(workspaceMemberships).values({
          workspaceId: connection.workspaceId,
          userId: input.candidateUser.id,
          role,
          createdAt: new Date(input.occurredAt),
        });
        if (invitation) {
          await tx
            .update(workspaceInvitations)
            .set({ acceptedAt: new Date(input.occurredAt) })
            .where(eq(workspaceInvitations.id, invitation.id));
        }
        const session = enterpriseSessionForDatabase(
          input.candidateSession,
          input.candidateUser.id,
          input.candidateIdentity.id,
          connection.workspaceId,
        );
        const [createdSession] = await tx
          .insert(authSessions)
          .values(authSessionValues(session))
          .returning();
        await insertEnterpriseAuditEvent(tx, {
          ...input.auditEvent,
          workspaceId: connection.workspaceId,
          targetUserId: input.candidateUser.id,
          eventType: 'enterprise_sso_user_provisioned',
          metadata: { ...input.auditEvent.metadata, created: true, provisioningMode: connection.provisioningMode },
        });
        return createdSession
          ? {
              status: 'authenticated',
              userId: input.candidateUser.id,
              session: toAuthSessionRecord(createdSession),
              created: true,
            }
          : { status: 'conflict' };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async identitySatisfiesWorkspaceSso(
    workspaceId: string,
    identityId: string | null,
  ): Promise<boolean> {
    if (!identityId) return false;
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select
          set_config(${LODARIQ_WORKSPACE_ID_SETTING}, ${workspaceId}, true),
          set_config(${ENTERPRISE_IDENTITY_ID_SETTING}, ${identityId}, true)`,
      );
      const [row] = await tx
        .select({ id: enterprisePrincipals.id })
        .from(enterprisePrincipals)
        .innerJoin(
          authIdentities,
          and(
            eq(authIdentities.userId, enterprisePrincipals.userId),
            eq(authIdentities.issuer, enterprisePrincipals.issuer),
            eq(authIdentities.subject, enterprisePrincipals.subject),
          ),
        )
        .innerJoin(ssoConnections, eq(ssoConnections.id, enterprisePrincipals.connectionId))
        .innerJoin(
          enterpriseValidationEvidence,
          and(
            eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
            isNull(enterpriseValidationEvidence.revokedAt),
          ),
        )
        .where(
          and(
            eq(enterprisePrincipals.workspaceId, workspaceId),
            eq(enterprisePrincipals.active, true),
            eq(authIdentities.id, identityId),
            isNull(authIdentities.disabledAt),
            eq(ssoConnections.status, 'verified'),
          ),
        )
        .limit(1);
      return Boolean(row);
    });
  }

  async createEnterpriseBreakGlass(
    input: CreateEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.request.workspaceId,
      input.request.requestedByUserId,
      async (tx) => {
        if (!(await hasRole(tx, input.request.workspaceId, input.request.requestedByUserId, ['owner']))) {
          return 'forbidden';
        }
        await tx.insert(enterpriseBreakGlassRequests).values({
          id: input.request.id,
          workspaceId: input.request.workspaceId,
          requestedByUserId: input.request.requestedByUserId,
          approvedByUserId: null,
          status: 'pending_approval',
          reason: input.request.reason,
          expiresAt: new Date(input.request.expiresAt),
          approvedAt: null,
          consumedAt: null,
          createdAt: new Date(input.request.createdAt),
        });
        await insertEnterpriseAuditEvent(tx, input.auditEvent);
        return 'completed';
      },
    );
  }

  async approveEnterpriseBreakGlass(
    input: ApproveEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult> {
    return runWithTenantActorScope(this.database, input.workspaceId, input.approverUserId, async (tx) => {
      if (!(await hasRole(tx, input.workspaceId, input.approverUserId, ['owner']))) return 'forbidden';
      const [updated] = await tx
        .update(enterpriseBreakGlassRequests)
        .set({
          approvedByUserId: input.approverUserId,
          approvedAt: new Date(input.approvedAt),
          status: 'approved',
        })
        .where(
          and(
            eq(enterpriseBreakGlassRequests.id, input.requestId),
            eq(enterpriseBreakGlassRequests.workspaceId, input.workspaceId),
            eq(enterpriseBreakGlassRequests.status, 'pending_approval'),
            sql`${enterpriseBreakGlassRequests.requestedByUserId} <> ${input.approverUserId}`,
            sql`${enterpriseBreakGlassRequests.expiresAt} > ${new Date(input.approvedAt)}`,
          ),
        )
        .returning({ id: enterpriseBreakGlassRequests.id });
      if (!updated) return 'conflict';
      await insertEnterpriseAuditEvent(tx, input.auditEvent);
      return 'completed';
    });
  }

  async consumeEnterpriseBreakGlass(
    input: ConsumeEnterpriseBreakGlassInput,
  ): Promise<EnterpriseMutationResult> {
    return runWithTenantActorScope(this.database, input.workspaceId, input.actorUserId, async (tx) => {
      const [updated] = await tx
        .update(enterpriseBreakGlassRequests)
        .set({ status: 'consumed', consumedAt: new Date(input.consumedAt) })
        .where(
          and(
            eq(enterpriseBreakGlassRequests.id, input.requestId),
            eq(enterpriseBreakGlassRequests.workspaceId, input.workspaceId),
            eq(enterpriseBreakGlassRequests.requestedByUserId, input.actorUserId),
            eq(enterpriseBreakGlassRequests.status, 'approved'),
            sql`${enterpriseBreakGlassRequests.expiresAt} > ${new Date(input.consumedAt)}`,
          ),
        )
        .returning({ id: enterpriseBreakGlassRequests.id });
      if (!updated) return 'conflict';
      await insertEnterpriseAuditEvent(tx, input.auditEvent);
      return 'completed';
    });
  }

  async listEnterpriseAuditEvents(
    workspaceId: string,
    actorUserId: string,
  ): Promise<EnterpriseReadResult<EnterpriseAuditEventRecord[]>> {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, async (tx) => {
      if (!(await hasRole(tx, workspaceId, actorUserId, ['admin', 'owner']))) {
        return { status: 'forbidden' };
      }
      const rows = await tx
        .select()
        .from(enterpriseAuditEvents)
        .where(eq(enterpriseAuditEvents.workspaceId, workspaceId))
        .orderBy(desc(enterpriseAuditEvents.occurredAt));
      return {
        status: 'ok',
        value: rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          actorUserId: row.actorUserId,
          eventType: row.eventType as EnterpriseAuditEventRecord['eventType'],
          connectionId: row.connectionId,
          targetUserId: row.targetUserId,
          correlationId: row.correlationId,
          metadata: row.metadata,
          occurredAt: toIsoString(row.occurredAt),
        })),
      };
    });
  }
}

async function setScimScope(tx: LodariqTransaction, tokenHash: string): Promise<void> {
  await tx.execute(
    sql`select set_config(${ENTERPRISE_SCIM_TOKEN_HASH_SETTING}, ${tokenHash}, true)`,
  );
}

async function bindScimAuthorizationScope(
  tx: LodariqTransaction,
  tokenHash: string,
): Promise<{ workspaceId: string; connectionId: string } | null> {
  await setScimScope(tx, tokenHash);
  const [scim] = await tx
    .select({
      workspaceId: enterpriseScimConnections.workspaceId,
      connectionId: enterpriseScimConnections.connectionId,
    })
    .from(enterpriseScimConnections)
    .where(
      and(
        eq(enterpriseScimConnections.tokenHash, tokenHash),
        eq(enterpriseScimConnections.status, 'active'),
      ),
    )
    .limit(1);
  if (!scim) return null;
  await tx.execute(
    sql`select
      set_config(${LODARIQ_WORKSPACE_ID_SETTING}, ${scim.workspaceId}, true),
      set_config(${ENTERPRISE_CONNECTION_ID_SETTING}, ${scim.connectionId}, true)`,
  );
  return scim;
}

async function hasRole(
  tx: LodariqTransaction,
  workspaceId: string,
  userId: string,
  roles: readonly string[],
): Promise<boolean> {
  const [membership] = await tx
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(membership && roles.includes(membership.role));
}

async function hasValidatedConnection(
  tx: LodariqTransaction,
  workspaceId: string,
  connectionId?: string,
): Promise<boolean> {
  const clauses = [
    eq(ssoConnections.workspaceId, workspaceId),
    eq(ssoConnections.status, 'verified'),
    isNull(enterpriseValidationEvidence.revokedAt),
  ];
  if (connectionId) clauses.push(eq(ssoConnections.id, connectionId));
  const [row] = await tx
    .select({ id: ssoConnections.id })
    .from(ssoConnections)
    .innerJoin(
      enterpriseValidationEvidence,
      eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
    )
    .where(and(...clauses))
    .limit(1);
  return Boolean(row);
}

async function resolveActiveScim(
  tx: LodariqTransaction,
  connectionId: string,
  tokenHash: string,
) {
  if (!(await bindScimAuthorizationScope(tx, tokenHash))) return null;
  const [row] = await tx
    .select({ scim: enterpriseScimConnections })
    .from(enterpriseScimConnections)
    .innerJoin(ssoConnections, eq(ssoConnections.id, enterpriseScimConnections.connectionId))
    .innerJoin(
      enterpriseValidationEvidence,
      and(
        eq(enterpriseValidationEvidence.connectionId, ssoConnections.id),
        isNull(enterpriseValidationEvidence.revokedAt),
      ),
    )
    .where(
      and(
        eq(enterpriseScimConnections.id, connectionId),
        eq(enterpriseScimConnections.tokenHash, tokenHash),
        eq(enterpriseScimConnections.status, 'active'),
        eq(ssoConnections.status, 'verified'),
      ),
    )
    .limit(1);
  return row?.scim ?? null;
}

async function mappedScimRole(
  tx: LodariqTransaction,
  connectionId: string,
  groupIds: readonly string[],
): Promise<'admin' | 'member' | 'viewer' | null> {
  if (groupIds.length === 0) return null;
  const rows = await tx
    .select({ groupId: ssoGroupRoleMappings.groupId, role: ssoGroupRoleMappings.role })
    .from(ssoGroupRoleMappings)
    .where(eq(ssoGroupRoleMappings.connectionId, connectionId));
  const rank = { viewer: 0, member: 1, admin: 2 } as const;
  let role: 'admin' | 'member' | 'viewer' | null = null;
  for (const row of rows) {
    if (!groupIds.includes(row.groupId) || !isManagedRole(row.role)) continue;
    if (!role || rank[row.role] > rank[role]) role = row.role;
  }
  return role;
}

function isManagedRole(value: string): value is 'admin' | 'member' | 'viewer' {
  return value === 'admin' || value === 'member' || value === 'viewer';
}

async function insertEnterpriseAuditEvent(
  tx: LodariqTransaction,
  event: EnterpriseAuditEventRecord,
): Promise<void> {
  await tx.insert(enterpriseAuditEvents).values({
    id: event.id,
    workspaceId: event.workspaceId,
    actorUserId: event.actorUserId,
    eventType: event.eventType,
    connectionId: event.connectionId,
    targetUserId: event.targetUserId,
    correlationId: event.correlationId,
    metadata: event.metadata,
    occurredAt: new Date(event.occurredAt),
  });
}

function connectionValues(connection: EnterpriseSsoConnectionRecord) {
  return {
    id: connection.id,
    workspaceId: connection.workspaceId,
    provider: connection.provider,
    protocol: connection.protocol,
    issuer: connection.issuer,
    clientId: connection.clientId,
    provisioningMode: connection.provisioningMode,
    status:
      connection.status === 'validation_required'
        ? 'draft'
        : connection.status === 'active'
          ? 'verified'
          : connection.status,
    validatedAt: connection.validatedAt ? new Date(connection.validatedAt) : null,
    createdAt: new Date(connection.createdAt),
    updatedAt: new Date(connection.updatedAt),
  };
}

function toEnterpriseSsoConnection(
  row: typeof ssoConnections.$inferSelect,
): EnterpriseSsoConnectionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider as EnterpriseSsoConnectionRecord['provider'],
    protocol: row.protocol as EnterpriseSsoConnectionRecord['protocol'],
    issuer: row.issuer,
    clientId: row.clientId,
    provisioningMode: row.provisioningMode as EnterpriseSsoConnectionRecord['provisioningMode'],
    status:
      row.status === 'verified'
        ? 'active'
        : row.status === 'draft'
          ? 'validation_required'
          : (row.status as EnterpriseSsoConnectionRecord['status']),
    validatedAt: row.validatedAt ? toIsoString(row.validatedAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toScimConnection(row: typeof enterpriseScimConnections.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    connectionId: row.connectionId,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    status: row.status as 'active' | 'disabled',
    createdByUserId: row.createdByUserId,
    lastUsedAt: row.lastUsedAt ? toIsoString(row.lastUsedAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function principalValues(principal: ProvisionEnterpriseScimUserInput['principal']) {
  return {
    id: principal.id,
    workspaceId: principal.workspaceId,
    connectionId: principal.connectionId,
    userId: principal.userId,
    externalId: principal.externalId,
    issuer: principal.issuer,
    subject: principal.subject,
    active: principal.active,
    deprovisionedAt: principal.deprovisionedAt ? new Date(principal.deprovisionedAt) : null,
    createdAt: new Date(principal.createdAt),
    updatedAt: new Date(principal.updatedAt),
  };
}

function enterpriseSessionForDatabase(
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
