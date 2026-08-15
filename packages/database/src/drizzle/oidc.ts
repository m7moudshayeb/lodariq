import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  isValidAuthIdentityRecord,
  isValidAuthSessionRecord,
  type AuthSessionRecord,
} from '../domains/identity';
import { assertValidWorkspaceEnvironmentPolicy } from '../domains/environments';
import type {
  CreateExternalIdentitySessionInput,
  OidcAuthorizationAttemptRecord,
  RegisterExternalIdentityAccountInput,
} from '../domains/oidc';
import { validOidcAuthorizationAttempt } from '../domains/oidc';
import {
  authIdentities,
  authSessions,
  environments,
  identityOnboardingStates,
  oidcAuthorizationAttempts,
  userEmails,
  users,
  workspaceAuthPolicies,
  workspaceMemberships,
  workspaces,
} from '../schema';
import {
  LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING,
  LODARIQ_AUTH_IDENTITY_ISSUER_SETTING,
  LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING,
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_OIDC_STATE_HASH_SETTING,
} from '../scoped-transaction';
import {
  authSessionValues,
  environmentValues,
  isUniqueConstraintViolation,
  toAuthSessionRecord,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryAssurance } from './assurance';

export class DrizzleRepositoryOidc extends DrizzleRepositoryAssurance {
  async createOidcAuthorizationAttempt(attempt: OidcAuthorizationAttemptRecord): Promise<boolean> {
    if (!validOidcAuthorizationAttempt(attempt)) return false;
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_OIDC_STATE_HASH_SETTING}, ${attempt.stateHash}, true),
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${attempt.userId ?? ''}, true)`,
        );
        await tx.insert(oidcAuthorizationAttempts).values(attemptValues(attempt));
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async getOidcAuthorizationAttempt(
    stateHash: string,
    now: string,
  ): Promise<OidcAuthorizationAttemptRecord | null> {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config(${LODARIQ_OIDC_STATE_HASH_SETTING}, ${stateHash}, true)`,
      );
      const [row] = await tx
        .select()
        .from(oidcAuthorizationAttempts)
        .where(
          and(
            eq(oidcAuthorizationAttempts.stateHash, stateHash),
            isNull(oidcAuthorizationAttempts.consumedAt),
            gt(oidcAuthorizationAttempts.expiresAt, new Date(now)),
          ),
        )
        .limit(1);
      return row ? toOidcAuthorizationAttempt(row) : null;
    });
  }

  async consumeOidcAuthorizationAttempt(
    attemptId: string,
    stateHash: string,
    consumedAt: string,
  ): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config(${LODARIQ_OIDC_STATE_HASH_SETTING}, ${stateHash}, true)`,
      );
      const consumed = await tx
        .update(oidcAuthorizationAttempts)
        .set({ consumedAt: new Date(consumedAt) })
        .where(
          and(
            eq(oidcAuthorizationAttempts.id, attemptId),
            eq(oidcAuthorizationAttempts.stateHash, stateHash),
            isNull(oidcAuthorizationAttempts.consumedAt),
            gt(oidcAuthorizationAttempts.expiresAt, new Date(consumedAt)),
          ),
        )
        .returning({ id: oidcAuthorizationAttempts.id });
      return consumed.length === 1;
    });
  }

  async registerExternalIdentityAccount(
    input: RegisterExternalIdentityAccountInput,
  ): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch {
      return false;
    }
    if (
      !input.user.emailVerifiedAt ||
      !input.userEmail.verifiedAt ||
      !input.userEmail.isPrimary ||
      input.userEmail.userId !== input.user.id ||
      input.identity.userId !== input.user.id ||
      input.identity.kind !== 'oidc' ||
      !isValidAuthIdentityRecord(input.identity) ||
      input.session.userId !== input.user.id ||
      input.session.identityId !== input.identity.id ||
      input.session.authenticationMethod !== 'oidc' ||
      input.session.activeWorkspaceId !== input.workspace.id ||
      !isValidAuthSessionRecord(input.session) ||
      input.onboarding.userId !== input.user.id ||
      input.onboarding.status !== 'completed' ||
      input.onboarding.completedWorkspaceId !== input.workspace.id ||
      input.membership.userId !== input.user.id ||
      input.membership.workspaceId !== input.workspace.id ||
      input.membership.role !== 'owner'
    ) {
      return false;
    }
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.user.id}, true),
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${input.userEmail.normalizedEmail}, true),
            set_config(${LODARIQ_AUTH_IDENTITY_ISSUER_SETTING}, ${input.identity.issuer}, true),
            set_config(${LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING}, ${input.identity.subject}, true),
            set_config('lodariq.workspace_id', ${input.workspace.id}, true)`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.userEmail.normalizedEmail}, 0))`,
        );
        const [emailCollision] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(btrim(${users.email})) = ${input.userEmail.normalizedEmail}`)
          .limit(1);
        if (emailCollision) return false;
        await tx.insert(users).values({
          id: input.user.id,
          legacyIdentityId: input.user.legacyIdentityId,
          email: input.user.email,
          name: input.user.name ?? null,
          emailVerifiedAt: new Date(input.user.emailVerifiedAt!),
          createdAt: new Date(input.user.createdAt),
        });
        await tx.insert(userEmails).values({
          id: input.userEmail.id,
          userId: input.userEmail.userId,
          normalizedEmail: input.userEmail.normalizedEmail,
          isPrimary: true,
          verifiedAt: new Date(input.userEmail.verifiedAt!),
          createdAt: new Date(input.userEmail.createdAt),
          updatedAt: new Date(input.userEmail.updatedAt),
        });
        await tx.insert(authIdentities).values({
          id: input.identity.id,
          userId: input.identity.userId,
          kind: input.identity.kind,
          issuer: input.identity.issuer,
          subject: input.identity.subject,
          providerTenantId: input.identity.providerTenantId,
          createdAt: new Date(input.identity.createdAt),
          lastAuthenticatedAt: input.identity.lastAuthenticatedAt
            ? new Date(input.identity.lastAuthenticatedAt)
            : null,
          disabledAt: null,
        });
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
        await tx.insert(identityOnboardingStates).values({
          id: input.onboarding.id,
          userId: input.onboarding.userId,
          intent: input.onboarding.intent,
          status: input.onboarding.status,
          targetWorkspaceId: input.onboarding.targetWorkspaceId,
          targetWorkspaceName: input.onboarding.targetWorkspaceName,
          invitationId: input.onboarding.invitationId,
          requestedWorkspaceId: input.onboarding.requestedWorkspaceId,
          completedWorkspaceId: input.onboarding.completedWorkspaceId,
          version: input.onboarding.version,
          expiresAt: new Date(input.onboarding.expiresAt),
          createdAt: new Date(input.onboarding.createdAt),
          updatedAt: new Date(input.onboarding.updatedAt),
        });
        await tx.insert(authSessions).values(authSessionValues(input.session));
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async createExternalIdentitySession(
    input: CreateExternalIdentitySessionInput,
  ): Promise<AuthSessionRecord | null> {
    if (
      input.session.identityId !== input.identityId ||
      input.session.authenticationMethod !== 'oidc' ||
      input.session.authenticatedAt !== input.authenticatedAt ||
      !isValidAuthSessionRecord(input.session)
    ) {
      return null;
    }
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_IDENTITY_ISSUER_SETTING}, ${input.issuer}, true),
            set_config(${LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING}, ${input.subject}, true)`,
        );
        const [row] = await tx
          .select({ identity: authIdentities, user: users })
          .from(authIdentities)
          .innerJoin(users, and(eq(users.id, authIdentities.userId), isNull(users.deletedAt)))
          .where(
            and(
              eq(authIdentities.id, input.identityId),
              eq(authIdentities.issuer, input.issuer),
              eq(authIdentities.subject, input.subject),
              eq(authIdentities.kind, 'oidc'),
              isNull(authIdentities.disabledAt),
            ),
          )
          .limit(1);
        if (!row || row.identity.userId !== input.session.userId) return null;
        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${row.identity.userId}, true)`,
        );
        const [created] = await tx
          .insert(authSessions)
          .values(authSessionValues(input.session))
          .returning();
        await tx
          .update(authIdentities)
          .set({ lastAuthenticatedAt: new Date(input.authenticatedAt) })
          .where(eq(authIdentities.id, input.identityId));
        return created ? toAuthSessionRecord(created) : null;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return null;
      throw error;
    }
  }
}

function attemptValues(attempt: OidcAuthorizationAttemptRecord) {
  return {
    id: attempt.id,
    providerId: attempt.providerId,
    action: attempt.action,
    userId: attempt.userId,
    stateHash: attempt.stateHash,
    encryptedVerifier: attempt.encryptedVerifier,
    nonceHash: attempt.nonceHash,
    returnTo: attempt.returnTo,
    workspaceName: attempt.workspaceName,
    durationPolicy: attempt.durationPolicy,
    expiresAt: new Date(attempt.expiresAt),
    consumedAt: attempt.consumedAt ? new Date(attempt.consumedAt) : null,
    createdAt: new Date(attempt.createdAt),
  };
}

function toOidcAuthorizationAttempt(
  row: typeof oidcAuthorizationAttempts.$inferSelect,
): OidcAuthorizationAttemptRecord {
  return {
    id: row.id,
    providerId: row.providerId,
    action: row.action as OidcAuthorizationAttemptRecord['action'],
    userId: row.userId,
    stateHash: row.stateHash,
    encryptedVerifier: row.encryptedVerifier,
    nonceHash: row.nonceHash,
    returnTo: row.returnTo,
    workspaceName: row.workspaceName,
    durationPolicy: row.durationPolicy as OidcAuthorizationAttemptRecord['durationPolicy'],
    expiresAt: toIsoString(row.expiresAt),
    consumedAt: row.consumedAt ? toIsoString(row.consumedAt) : null,
    createdAt: toIsoString(row.createdAt),
  };
}
