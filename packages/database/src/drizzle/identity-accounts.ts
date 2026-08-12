import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  type ConsumeEmailVerificationChallengeInput,
  type CreateIdentityAccountInput,
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  type ResolvedEmailVerificationChallenge,
  type PasswordCredentialRecord,
  type UserRecord,
} from '../repository';
import {
  authSessions,
  authOutbox,
  environments,
  emailVerificationChallenges,
  passwordCredentials,
  users,
  workspaces,
  workspaceMemberships,
} from '../schema';
import {
  runWithAuthEmailLookupScope,
  runWithAuthUserScope,
  LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING,
  LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING,
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_EMAIL_VERIFICATION_HASH_SETTING,
  LODARIQ_EMAIL_VERIFICATION_ID_SETTING,
} from '../scoped-transaction';
import { EmailVerificationAtomicWriteRejected } from './types';
import {
  passwordCredentialValues,
  authSessionValues,
  environmentValues,
  toPasswordCredentialRecord,
  toUserRecord,
  isUniqueConstraintViolation,
} from './helpers';
import { DrizzleRepositoryDocumentHelpers } from './document-helpers';

export class DrizzleRepositoryIdentityAccounts extends DrizzleRepositoryDocumentHelpers {
  async checkReadiness(): Promise<void> {
    await this.database.execute(sql`select 1`);
  }

  async findPasswordCredentialByEmail(
    emailNormalized: string,
    emailLookupHash: string,
  ): Promise<PasswordCredentialRecord | null> {
    return runWithAuthEmailLookupScope(this.database, emailLookupHash, async (tx) => {
      const [row] = await tx
        .select()
        .from(passwordCredentials)
        .where(
          and(
            eq(passwordCredentials.emailNormalized, emailNormalized),
            eq(passwordCredentials.emailLookupHash, emailLookupHash),
          ),
        )
        .limit(1);
      return row ? toPasswordCredentialRecord(row) : null;
    });
  }

  async getIdentityUser(userId: string): Promise<UserRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const [row] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      return row ? toUserRecord(row) : null;
    });
  }

  async createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch (error) {
      if (error instanceof WorkspaceEnvironmentPolicyInvalidError) return false;
      throw error;
    }
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.user.id}, true),
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${input.credential.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${input.credential.emailLookupHash}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${input.emailVerificationChallenge.id}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${input.emailVerificationChallenge.tokenHash}, true),
            set_config('lodariq.workspace_id', ${input.workspace.id}, true)`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.credential.emailLookupHash}, 0))`,
        );
        const [existingIdentity] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(btrim(${users.email})) = ${input.credential.emailNormalized}`)
          .limit(1);
        if (existingIdentity) return false;
        await tx.insert(users).values({
          id: input.user.id,
          legacyIdentityId: input.user.legacyIdentityId,
          email: input.user.email,
          name: input.user.name ?? null,
          emailVerifiedAt: input.user.emailVerifiedAt ? new Date(input.user.emailVerifiedAt) : null,
          createdAt: new Date(input.user.createdAt),
        });
        await tx.insert(passwordCredentials).values(passwordCredentialValues(input.credential));
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
        await tx.insert(emailVerificationChallenges).values({
          id: input.emailVerificationChallenge.id,
          userId: input.emailVerificationChallenge.userId,
          tokenHash: input.emailVerificationChallenge.tokenHash,
          expiresAt: new Date(input.emailVerificationChallenge.expiresAt),
          usedAt: input.emailVerificationChallenge.usedAt
            ? new Date(input.emailVerificationChallenge.usedAt)
            : null,
          createdAt: new Date(input.emailVerificationChallenge.createdAt),
        });
        await tx.insert(authOutbox).values({
          id: input.outboxMessage.id,
          type: input.outboxMessage.type,
          userId: input.outboxMessage.userId,
          recipientEmail: input.outboxMessage.recipientEmail,
          payload: input.outboxMessage.payload,
          availableAt: new Date(input.outboxMessage.availableAt),
          processedAt: input.outboxMessage.processedAt
            ? new Date(input.outboxMessage.processedAt)
            : null,
          attempts: input.outboxMessage.attempts,
          leaseVersion: input.outboxMessage.leaseVersion ?? 0,
          lastError: input.outboxMessage.lastError,
          terminalAt: input.outboxMessage.terminalAt
            ? new Date(input.outboxMessage.terminalAt)
            : null,
          createdAt: new Date(input.outboxMessage.createdAt),
        });
        if (input.session) {
          await tx.insert(authSessions).values(authSessionValues(input.session));
        }
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async resolveEmailVerificationChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedEmailVerificationChallenge | null> {
    return this.database.transaction(async (tx) => {
      const timestamp = new Date(now);
      await tx.execute(
        sql`select
          set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${challengeId}, true),
          set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${tokenHash}, true)`,
      );
      const [challenge] = await tx
        .select()
        .from(emailVerificationChallenges)
        .where(
          and(
            eq(emailVerificationChallenges.id, challengeId),
            eq(emailVerificationChallenges.tokenHash, tokenHash),
            isNull(emailVerificationChallenges.usedAt),
            sql`${emailVerificationChallenges.expiresAt} > ${timestamp}`,
          ),
        )
        .limit(1);
      if (!challenge) return null;

      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${challenge.userId}, true)`,
      );
      const [user] = await tx
        .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(and(eq(users.id, challenge.userId), isNull(users.emailVerifiedAt)))
        .limit(1);
      return user ? { userId: user.id, emailNormalized: user.email.trim().toLowerCase() } : null;
    });
  }

  async consumeEmailVerificationChallenge(
    input: ConsumeEmailVerificationChallengeInput,
  ): Promise<UserRecord | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const usedAt = new Date(input.usedAt);
        await tx.execute(
          sql`select
            set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${input.challengeId}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${input.tokenHash}, true)`,
        );
        const [challenge] = await tx
          .select()
          .from(emailVerificationChallenges)
          .where(
            and(
              eq(emailVerificationChallenges.id, input.challengeId),
              eq(emailVerificationChallenges.tokenHash, input.tokenHash),
              isNull(emailVerificationChallenges.usedAt),
              sql`${emailVerificationChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .limit(1);
        if (!challenge) return null;

        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${challenge.userId}, true)`,
        );
        const [user] = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, challenge.userId), isNull(users.emailVerifiedAt)))
          .limit(1);
        if (!user) return null;
        const emailNormalized = user.email.trim().toLowerCase();
        const [pendingCredential] = await tx
          .select()
          .from(passwordCredentials)
          .where(
            and(
              eq(passwordCredentials.userId, user.id),
              eq(passwordCredentials.emailNormalized, emailNormalized),
            ),
          )
          .limit(1)
          .for('update');
        if (!pendingCredential) return null;

        const consumed = await tx
          .update(emailVerificationChallenges)
          .set({ usedAt })
          .where(
            and(
              eq(emailVerificationChallenges.id, challenge.id),
              eq(emailVerificationChallenges.tokenHash, input.tokenHash),
              isNull(emailVerificationChallenges.usedAt),
              sql`${emailVerificationChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .returning({ userId: emailVerificationChallenges.userId });
        if (consumed.length !== 1) return null;

        const [replacedCredential] = await tx
          .update(passwordCredentials)
          .set({
            algorithm: input.credential.algorithm,
            passwordHash: input.credential.passwordHash,
            updatedAt: new Date(input.credential.updatedAt),
          })
          .where(
            and(
              eq(passwordCredentials.userId, user.id),
              eq(passwordCredentials.emailNormalized, emailNormalized),
              eq(passwordCredentials.emailLookupHash, pendingCredential.emailLookupHash),
            ),
          )
          .returning({ userId: passwordCredentials.userId });
        if (!replacedCredential) throw new EmailVerificationAtomicWriteRejected();

        const [verified] = await tx
          .update(users)
          .set({ emailVerifiedAt: usedAt })
          .where(and(eq(users.id, challenge.userId), isNull(users.emailVerifiedAt)))
          .returning();
        if (!verified) throw new EmailVerificationAtomicWriteRejected();

        await tx
          .update(authSessions)
          .set({ revokedAt: usedAt })
          .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
        return toUserRecord(verified);
      });
    } catch (error) {
      if (
        error instanceof EmailVerificationAtomicWriteRejected ||
        isUniqueConstraintViolation(error)
      ) {
        return null;
      }
      throw error;
    }
  }
}
