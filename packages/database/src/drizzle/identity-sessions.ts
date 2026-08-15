import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import {
  type AuthLifecycleCleanupInput,
  type AuthLifecycleCleanupResult,
  type AuthSessionRecord,
  type CreateCredentialBoundAuthSessionInput,
  type CreateIdentityWorkspaceInput,
  type IdentityWorkspaceRecord,
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  type RotateAuthSessionInput,
  type WorkspaceMembershipRecord,
  type WorkspaceAuthPolicyRecord,
  isValidAuthSessionRecord,
  normalizeAuthLifecycleCleanupInput,
} from '../repository';
import {
  authIdentities,
  accountEmailChangeChallenges,
  accountEmailChangeOutbox,
  authOutbox,
  authRateLimits,
  authSessions,
  documents,
  emailVerificationChallenges,
  environments,
  passwordCredentials,
  publicSdkInstallations,
  setPasswordChallenges,
  setPasswordOutbox,
  themes,
  users,
  workspaces,
  workspaceMemberships,
  workspaceInvitations,
  workspaceInvitationOutbox,
  workspaceAuthPolicies,
} from '../schema';
import {
  runWithAuthSessionLookupScope,
  runWithAuthMaintenanceScope,
  runWithAuthUserScope,
  LODARIQ_AUTH_USER_ID_SETTING,
} from '../scoped-transaction';
import {
  authSessionValues,
  environmentValues,
  toAuthSessionRecord,
  hasIdentityMembership,
  identityWorkspaceRole,
  isUniqueConstraintViolation,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryIdentityOutbox } from './identity-outbox';

export class DrizzleRepositoryIdentitySessions extends DrizzleRepositoryIdentityOutbox {
  async cleanupAuthLifecycle(
    input: AuthLifecycleCleanupInput,
  ): Promise<AuthLifecycleCleanupResult> {
    const normalized = normalizeAuthLifecycleCleanupInput(input);
    if (!normalized) throw new Error('Invalid auth lifecycle cleanup input');
    return runWithAuthMaintenanceScope(this.database, async (tx) => {
      const now = new Date(normalized.now);
      const challengeBefore = new Date(normalized.challengeBefore);
      const sessionBefore = new Date(normalized.sessionBefore);
      const outboxBefore = new Date(normalized.outboxBefore);
      const rateLimitBefore = new Date(normalized.rateLimitBefore);

      const accountEmailChallengeIds = await tx
        .select({ id: accountEmailChangeChallenges.id })
        .from(accountEmailChangeChallenges)
        .where(
          or(
            lt(accountEmailChangeChallenges.expiresAt, challengeBefore),
            and(
              isNotNull(accountEmailChangeChallenges.consumedAt),
              lt(accountEmailChangeChallenges.consumedAt, challengeBefore),
            ),
            and(
              isNotNull(accountEmailChangeChallenges.revokedAt),
              lt(accountEmailChangeChallenges.revokedAt, challengeBefore),
            ),
          ),
        )
        .orderBy(asc(accountEmailChangeChallenges.createdAt))
        .limit(normalized.limit);
      const deletedAccountEmailChallenges = accountEmailChallengeIds.length
        ? await tx
            .delete(accountEmailChangeChallenges)
            .where(
              inArray(
                accountEmailChangeChallenges.id,
                accountEmailChallengeIds.map(({ id }) => id),
              ),
            )
            .returning({ id: accountEmailChangeChallenges.id })
        : [];

      const verificationChallengeIds = await tx
        .select({ id: emailVerificationChallenges.id })
        .from(emailVerificationChallenges)
        .where(
          or(
            lt(emailVerificationChallenges.expiresAt, challengeBefore),
            and(
              isNotNull(emailVerificationChallenges.usedAt),
              lt(emailVerificationChallenges.usedAt, challengeBefore),
            ),
          ),
        )
        .orderBy(asc(emailVerificationChallenges.createdAt))
        .limit(normalized.limit);
      const deletedVerificationChallenges = verificationChallengeIds.length
        ? await tx
            .delete(emailVerificationChallenges)
            .where(
              inArray(
                emailVerificationChallenges.id,
                verificationChallengeIds.map(({ id }) => id),
              ),
            )
            .returning({ id: emailVerificationChallenges.id })
        : [];

      const passwordChallengeIds = await tx
        .select({ id: setPasswordChallenges.id })
        .from(setPasswordChallenges)
        .where(
          or(
            lt(setPasswordChallenges.expiresAt, challengeBefore),
            and(
              isNotNull(setPasswordChallenges.usedAt),
              lt(setPasswordChallenges.usedAt, challengeBefore),
            ),
          ),
        )
        .orderBy(asc(setPasswordChallenges.createdAt))
        .limit(normalized.limit);
      const deletedPasswordChallenges = passwordChallengeIds.length
        ? await tx
            .delete(setPasswordChallenges)
            .where(
              inArray(
                setPasswordChallenges.id,
                passwordChallengeIds.map(({ id }) => id),
              ),
            )
            .returning({ id: setPasswordChallenges.id })
        : [];

      const sessionIds = await tx
        .select({ id: authSessions.id })
        .from(authSessions)
        .where(
          or(
            lt(authSessions.idleExpiresAt, sessionBefore),
            lt(authSessions.absoluteExpiresAt, sessionBefore),
            and(isNotNull(authSessions.revokedAt), lt(authSessions.revokedAt, sessionBefore)),
          ),
        )
        .orderBy(asc(authSessions.createdAt))
        .limit(normalized.limit);
      const deletedSessions = sessionIds.length
        ? await tx
            .delete(authSessions)
            .where(
              inArray(
                authSessions.id,
                sessionIds.map(({ id }) => id),
              ),
            )
            .returning({ id: authSessions.id })
        : [];

      const verificationOutboxIds = await tx
        .select({ id: authOutbox.id })
        .from(authOutbox)
        .where(
          or(
            and(isNotNull(authOutbox.processedAt), lt(authOutbox.processedAt, outboxBefore)),
            and(isNotNull(authOutbox.terminalAt), lt(authOutbox.terminalAt, outboxBefore)),
          ),
        )
        .orderBy(asc(authOutbox.createdAt))
        .limit(normalized.limit);
      const deletedVerificationOutboxRows = verificationOutboxIds.length
        ? await tx
            .delete(authOutbox)
            .where(
              inArray(
                authOutbox.id,
                verificationOutboxIds.map(({ id }) => id),
              ),
            )
            .returning({ id: authOutbox.id })
        : [];

      const passwordOutboxIds = await tx
        .select({ id: setPasswordOutbox.id })
        .from(setPasswordOutbox)
        .where(
          or(
            and(
              isNotNull(setPasswordOutbox.processedAt),
              lt(setPasswordOutbox.processedAt, outboxBefore),
            ),
            and(
              isNotNull(setPasswordOutbox.terminalAt),
              lt(setPasswordOutbox.terminalAt, outboxBefore),
            ),
          ),
        )
        .orderBy(asc(setPasswordOutbox.createdAt))
        .limit(normalized.limit);
      const deletedPasswordOutboxRows = passwordOutboxIds.length
        ? await tx
            .delete(setPasswordOutbox)
            .where(
              inArray(
                setPasswordOutbox.id,
                passwordOutboxIds.map(({ id }) => id),
              ),
            )
            .returning({ id: setPasswordOutbox.id })
        : [];

      const invitationOutboxIds = await tx
        .select({ id: workspaceInvitationOutbox.id })
        .from(workspaceInvitationOutbox)
        .where(
          or(
            and(
              isNotNull(workspaceInvitationOutbox.processedAt),
              lt(workspaceInvitationOutbox.processedAt, outboxBefore),
            ),
            and(
              isNotNull(workspaceInvitationOutbox.terminalAt),
              lt(workspaceInvitationOutbox.terminalAt, outboxBefore),
            ),
          ),
        )
        .orderBy(asc(workspaceInvitationOutbox.createdAt))
        .limit(normalized.limit);
      const deletedInvitationOutboxRows = invitationOutboxIds.length
        ? await tx
            .delete(workspaceInvitationOutbox)
            .where(
              inArray(
                workspaceInvitationOutbox.id,
                invitationOutboxIds.map(({ id }) => id),
              ),
            )
            .returning({ id: workspaceInvitationOutbox.id })
        : [];

      const accountEmailOutboxIds = await tx
        .select({ id: accountEmailChangeOutbox.id })
        .from(accountEmailChangeOutbox)
        .where(
          or(
            and(
              isNotNull(accountEmailChangeOutbox.processedAt),
              lt(accountEmailChangeOutbox.processedAt, outboxBefore),
            ),
            and(
              isNotNull(accountEmailChangeOutbox.terminalAt),
              lt(accountEmailChangeOutbox.terminalAt, outboxBefore),
            ),
          ),
        )
        .orderBy(asc(accountEmailChangeOutbox.createdAt))
        .limit(normalized.limit);
      const deletedAccountEmailOutboxRows = accountEmailOutboxIds.length
        ? await tx
            .delete(accountEmailChangeOutbox)
            .where(
              inArray(
                accountEmailChangeOutbox.id,
                accountEmailOutboxIds.map(({ id }) => id),
              ),
            )
            .returning({ id: accountEmailChangeOutbox.id })
        : [];

      const rateBucketIds = await tx
        .select({ id: authRateLimits.bucketHash })
        .from(authRateLimits)
        .where(lt(authRateLimits.updatedAt, rateLimitBefore))
        .orderBy(asc(authRateLimits.updatedAt))
        .limit(normalized.limit);
      const deletedRateLimitBuckets = rateBucketIds.length
        ? await tx
            .delete(authRateLimits)
            .where(
              inArray(
                authRateLimits.bucketHash,
                rateBucketIds.map(({ id }) => id),
              ),
            )
            .returning({ id: authRateLimits.bucketHash })
        : [];

      const abandoned = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            isNull(users.emailVerifiedAt),
            lt(users.createdAt, new Date(normalized.abandonedUnverifiedBefore)),
            sql`not exists (
              select 1 from ${authSessions} active_session
              where active_session.user_id = ${users.id}
                and active_session.revoked_at is null
                and active_session.idle_expires_at > ${now}
                and active_session.absolute_expires_at > ${now}
            )`,
            sql`not exists (
              select 1 from ${workspaceMemberships} own_membership
              where own_membership.user_id = ${users.id}
                and (
                  exists (
                    select 1 from ${workspaceMemberships} other_membership
                    where other_membership.workspace_id = own_membership.workspace_id
                      and other_membership.user_id <> ${users.id}
                  )
                  or exists (select 1 from ${documents} d where d.workspace_id = own_membership.workspace_id)
                  or exists (select 1 from ${publicSdkInstallations} i where i.workspace_id = own_membership.workspace_id)
                  or exists (select 1 from ${themes} t where t.workspace_id = own_membership.workspace_id)
                  or exists (
                    select 1 from ${workspaceInvitations} invitation
                    where invitation.workspace_id = own_membership.workspace_id
                      and invitation.accepted_at is null
                      and invitation.revoked_at is null
                      and invitation.expires_at > ${now}
                  )
                )
            )`,
          ),
        )
        .orderBy(asc(users.createdAt))
        .limit(normalized.limit);

      const abandonedUserIds = abandoned.map(({ id }) => id);
      const retainedAccountIds = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            isNotNull(users.deletedAt),
            isNotNull(users.retentionExpiresAt),
            lt(users.retentionExpiresAt, now),
          ),
        )
        .orderBy(asc(users.retentionExpiresAt))
        .limit(normalized.limit);
      const deletedAccounts = retainedAccountIds.length
        ? await tx
            .delete(users)
            .where(
              inArray(
                users.id,
                retainedAccountIds.map(({ id }) => id),
              ),
            )
            .returning({ id: users.id })
        : [];
      let emptyWorkspaces = 0;
      let abandonedUsers = 0;
      if (abandonedUserIds.length) {
        const ownedWorkspaceRows = await tx
          .select({ id: workspaceMemberships.workspaceId })
          .from(workspaceMemberships)
          .where(inArray(workspaceMemberships.userId, abandonedUserIds));
        const ownedWorkspaceIds = [...new Set(ownedWorkspaceRows.map(({ id }) => id))];
        if (ownedWorkspaceIds.length) {
          const deletedWorkspaces = await tx
            .delete(workspaces)
            .where(inArray(workspaces.id, ownedWorkspaceIds))
            .returning({ id: workspaces.id });
          emptyWorkspaces = deletedWorkspaces.length;
        }
        const deletedUsers = await tx
          .delete(users)
          .where(inArray(users.id, abandonedUserIds))
          .returning({ id: users.id });
        abandonedUsers = deletedUsers.length;
      }

      return {
        deletedAccounts: deletedAccounts.length,
        abandonedUsers,
        emptyWorkspaces,
        verificationChallenges: deletedVerificationChallenges.length,
        setPasswordChallenges: deletedPasswordChallenges.length,
        sessions: deletedSessions.length,
        rateLimitBuckets: deletedRateLimitBuckets.length,
        verificationOutboxRows: deletedVerificationOutboxRows.length,
        setPasswordOutboxRows: deletedPasswordOutboxRows.length,
        workspaceInvitationOutboxRows: deletedInvitationOutboxRows.length,
        accountEmailChangeChallenges: deletedAccountEmailChallenges.length,
        accountEmailChangeOutboxRows: deletedAccountEmailOutboxRows.length,
      };
    });
  }

  async createAuthSession(session: AuthSessionRecord): Promise<AuthSessionRecord> {
    if (!isValidAuthSessionRecord(session)) throw new Error('Invalid auth session');
    return runWithAuthUserScope(this.database, session.userId, async (tx) => {
      if (session.identityId) {
        const [identity] = await tx
          .select({ id: authIdentities.id })
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.id, session.identityId),
              eq(authIdentities.userId, session.userId),
              isNull(authIdentities.disabledAt),
            ),
          )
          .limit(1);
        if (!identity) throw new Error('Auth session identity does not belong to user');
      }
      if (
        session.activeWorkspaceId &&
        !(await hasIdentityMembership(tx, session.userId, session.activeWorkspaceId))
      ) {
        throw new Error('Auth session active workspace requires membership');
      }
      const [created] = await tx
        .insert(authSessions)
        .values(authSessionValues(session))
        .returning();
      if (!created) throw new Error('Unable to create auth session');
      return toAuthSessionRecord(created);
    });
  }

  async createCredentialBoundAuthSession(
    input: CreateCredentialBoundAuthSessionInput,
  ): Promise<AuthSessionRecord | null> {
    if (input.session.revokedAt !== null || !isValidAuthSessionRecord(input.session)) return null;
    return runWithAuthUserScope(this.database, input.session.userId, async (tx) => {
      const [credential] = await tx
        .select({
          algorithm: passwordCredentials.algorithm,
          passwordHash: passwordCredentials.passwordHash,
        })
        .from(passwordCredentials)
        .where(eq(passwordCredentials.userId, input.session.userId))
        .limit(1)
        .for('update');
      const [identity] = input.session.identityId
        ? await tx
            .select({ id: authIdentities.id })
            .from(authIdentities)
            .where(
              and(
                eq(authIdentities.id, input.session.identityId),
                eq(authIdentities.userId, input.session.userId),
                eq(authIdentities.kind, 'password'),
                isNull(authIdentities.disabledAt),
              ),
            )
            .limit(1)
        : [];
      if (
        !credential ||
        credential.algorithm !== 'argon2id-v1' ||
        credential.passwordHash !== input.expectedPasswordHash ||
        !identity
      ) {
        return null;
      }

      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.session.userId), isNotNull(users.emailVerifiedAt)))
        .limit(1);
      if (!user) return null;
      if (
        input.session.activeWorkspaceId &&
        !(await hasIdentityMembership(tx, input.session.userId, input.session.activeWorkspaceId))
      ) {
        return null;
      }

      const authenticatedIdentity = await tx
        .update(authIdentities)
        .set({ lastAuthenticatedAt: new Date(input.session.authenticatedAt) })
        .where(
          and(eq(authIdentities.id, identity.id), eq(authIdentities.userId, input.session.userId)),
        )
        .returning({ id: authIdentities.id });
      if (authenticatedIdentity.length !== 1) return null;

      const [created] = await tx
        .insert(authSessions)
        .values(authSessionValues(input.session))
        .returning();
      return created ? toAuthSessionRecord(created) : null;
    });
  }

  async resolveAuthSession(tokenHash: string, now: string): Promise<AuthSessionRecord | null> {
    return runWithAuthSessionLookupScope(this.database, tokenHash, async (tx) => {
      const timestamp = new Date(now);
      const [row] = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, tokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${timestamp}`,
            sql`${authSessions.absoluteExpiresAt} > ${timestamp}`,
          ),
        )
        .limit(1);
      return row ? toAuthSessionRecord(row) : null;
    });
  }

  async touchAuthSession(
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): Promise<AuthSessionRecord | null> {
    return runWithAuthSessionLookupScope(this.database, tokenHash, async (tx) => {
      const timestamp = new Date(now);
      const [current] = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, tokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${timestamp}`,
            sql`${authSessions.absoluteExpiresAt} > ${timestamp}`,
          ),
        )
        .limit(1);
      if (!current) return null;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${current.userId}, true)`,
      );
      const nextIdle = new Date(
        Math.min(new Date(idleExpiresAt).getTime(), current.absoluteExpiresAt.getTime()),
      );
      const [updated] = await tx
        .update(authSessions)
        .set({ lastSeenAt: timestamp, idleExpiresAt: nextIdle })
        .where(and(eq(authSessions.id, current.id), isNull(authSessions.revokedAt)))
        .returning();
      return updated ? toAuthSessionRecord(updated) : null;
    });
  }

  async rotateAuthSession(input: RotateAuthSessionInput): Promise<AuthSessionRecord | null> {
    if (!isValidAuthSessionRecord(input.nextSession)) return null;
    return runWithAuthSessionLookupScope(this.database, input.currentTokenHash, async (tx) => {
      const now = new Date(input.nextSession.createdAt);
      const [current] = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, input.currentTokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${now}`,
            sql`${authSessions.absoluteExpiresAt} > ${now}`,
          ),
        )
        .limit(1);
      if (
        !current ||
        current.userId !== input.nextSession.userId ||
        current.identityId !== input.nextSession.identityId ||
        current.authenticationMethod !== input.nextSession.authenticationMethod ||
        current.assuranceLevel !== input.nextSession.assuranceLevel ||
        toIsoString(current.authenticatedAt) !== input.nextSession.authenticatedAt ||
        current.durationPolicy !== input.nextSession.durationPolicy
      ) {
        return null;
      }
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${current.userId}, true)`,
      );
      if (
        input.nextSession.activeWorkspaceId &&
        !(await hasIdentityMembership(tx, current.userId, input.nextSession.activeWorkspaceId))
      ) {
        return null;
      }
      const revoked = await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(authSessions.id, current.id),
            eq(authSessions.tokenHash, input.currentTokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${now}`,
            sql`${authSessions.absoluteExpiresAt} > ${now}`,
          ),
        )
        .returning({ id: authSessions.id });
      // Compare-and-swap: only the request that revokes the live source row may
      // mint its replacement. A concurrent loser returns without inserting.
      if (revoked.length !== 1) return null;
      const [created] = await tx
        .insert(authSessions)
        .values(authSessionValues(input.nextSession))
        .returning();
      return created ? toAuthSessionRecord(created) : null;
    });
  }

  async revokeAuthSession(tokenHash: string, revokedAt: string): Promise<boolean> {
    return runWithAuthSessionLookupScope(this.database, tokenHash, async (tx) => {
      const [current] = await tx
        .select({ id: authSessions.id, userId: authSessions.userId })
        .from(authSessions)
        .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)))
        .limit(1);
      if (!current) return false;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${current.userId}, true)`,
      );
      const updated = await tx
        .update(authSessions)
        .set({ revokedAt: new Date(revokedAt) })
        .where(and(eq(authSessions.id, current.id), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      return updated.length === 1;
    });
  }

  async listIdentityWorkspaces(userId: string): Promise<IdentityWorkspaceRecord[]> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const rows = await tx
        .select({
          id: workspaces.id,
          name: workspaces.name,
          role: workspaceMemberships.role,
          createdAt: workspaces.createdAt,
        })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(and(eq(workspaceMemberships.userId, userId), isNull(workspaces.deletedAt)))
        .orderBy(asc(workspaces.createdAt));
      return rows.flatMap((row) => {
        const role = identityWorkspaceRole(row.role);
        return role
          ? [{ id: row.id, name: row.name, role, createdAt: toIsoString(row.createdAt) }]
          : [];
      });
    });
  }

  async createIdentityWorkspace(input: CreateIdentityWorkspaceInput): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch (error) {
      if (error instanceof WorkspaceEnvironmentPolicyInvalidError) return false;
      throw error;
    }
    try {
      const created = await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.userId}, true),
            set_config('lodariq.workspace_id', ${input.workspace.id}, true)`,
        );
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, input.userId));
        if (!user) throw new Error('Identity user not found');
        if (
          input.membership.role !== 'owner' ||
          input.membership.userId !== input.userId ||
          input.membership.workspaceId !== input.workspace.id ||
          !(await this.lockAndHasWorkspaceCapacity(tx, input.userId))
        ) {
          return false;
        }
        await tx.insert(workspaces).values({
          id: input.workspace.id,
          name: input.workspace.name,
          createdAt: new Date(input.workspace.createdAt),
          updatedAt: new Date(input.workspace.updatedAt),
        });
        await tx.insert(workspaceAuthPolicies).values({
          workspaceId: input.workspace.id,
          ssoRequired: false,
          minimumAssurance: 'aal1',
          passwordAllowed: true,
          createdAt: new Date(input.workspace.createdAt),
          updatedAt: new Date(input.workspace.updatedAt),
        });
        await tx.insert(workspaceMemberships).values({
          workspaceId: input.membership.workspaceId,
          userId: input.membership.userId,
          role: input.membership.role,
          createdAt: new Date(input.membership.createdAt),
        });
        await tx.insert(environments).values(input.environments.map(environmentValues));
        return true;
      });
      return created;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null> {
    return this.actorScoped(workspaceId, userId, async (tx) => {
      const [row] = await tx
        .select({
          workspaceId: workspaceMemberships.workspaceId,
          userId: workspaceMemberships.userId,
          role: workspaceMemberships.role,
          createdAt: workspaceMemberships.createdAt,
        })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.userId, userId),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1);

      return row ? { ...row, createdAt: toIsoString(row.createdAt) } : null;
    });
  }

  async getWorkspaceAuthPolicy(workspaceId: string): Promise<WorkspaceAuthPolicyRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [policy] = await tx
        .select()
        .from(workspaceAuthPolicies)
        .where(eq(workspaceAuthPolicies.workspaceId, workspaceId))
        .limit(1);
      return policy
        ? {
            workspaceId: policy.workspaceId,
            ssoRequired: policy.ssoRequired,
            minimumAssurance:
              policy.minimumAssurance as WorkspaceAuthPolicyRecord['minimumAssurance'],
            passwordAllowed: policy.passwordAllowed,
            createdAt: toIsoString(policy.createdAt),
            updatedAt: toIsoString(policy.updatedAt),
          }
        : null;
    });
  }
}
