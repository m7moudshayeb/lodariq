import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  type AuthSessionRecord,
  type CreateCredentialBoundAuthSessionInput,
  type CreateIdentityWorkspaceInput,
  type IdentityWorkspaceRecord,
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  type RotateAuthSessionInput,
  type WorkspaceMembershipRecord,
} from '../repository';
import {
  authSessions,
  environments,
  passwordCredentials,
  users,
  workspaces,
  workspaceMemberships,
} from '../schema';
import {
  runWithAuthSessionLookupScope,
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
  async createAuthSession(session: AuthSessionRecord): Promise<AuthSessionRecord> {
    return runWithAuthUserScope(this.database, session.userId, async (tx) => {
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
    if (input.session.revokedAt !== null) return null;
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
      if (
        !credential ||
        credential.algorithm !== 'argon2id-v1' ||
        credential.passwordHash !== input.expectedPasswordHash
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
      if (!current || current.userId !== input.nextSession.userId) return null;
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
        .where(eq(workspaceMemberships.userId, userId))
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
      await this.database.transaction(async (tx) => {
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
        await tx.insert(workspaces).values({
          id: input.workspace.id,
          name: input.workspace.name,
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
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select({
          workspaceId: workspaceMemberships.workspaceId,
          userId: workspaceMemberships.userId,
          role: workspaceMemberships.role,
          createdAt: workspaceMemberships.createdAt,
        })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.userId, userId),
          ),
        )
        .limit(1);

      return row ? { ...row, createdAt: toIsoString(row.createdAt) } : null;
    });
  }
}
