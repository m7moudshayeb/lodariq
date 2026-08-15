import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  type ConsumeSetPasswordChallengeInput,
  type RequestSetPasswordChallengeInput,
  type ResolvedSetPasswordChallenge,
  type SetPasswordChallengeRequestResult,
  type UserRecord,
  isAuthEmailTokenKeyId,
} from '../repository';
import {
  authIdentities,
  authSessions,
  authOutbox,
  emailVerificationChallenges,
  identityOnboardingStates,
  passwordCredentials,
  setPasswordChallenges,
  setPasswordOutbox,
  userEmails,
  users,
} from '../schema';
import {
  runWithSetPasswordChallengeLookupScope,
  LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING,
  LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING,
  LODARIQ_AUTH_RECOVERY_MUTATION_AT_SETTING,
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING,
  LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING,
} from '../scoped-transaction';
import { SetPasswordAtomicWriteRejected } from './types';
import { toUserRecord, isUniqueConstraintViolation } from './helpers';
import { DrizzleRepositoryIdentityAccounts } from './identity-accounts';

export class DrizzleRepositoryIdentityPassword extends DrizzleRepositoryIdentityAccounts {
  async requestSetPasswordChallenge(
    input: RequestSetPasswordChallengeInput,
  ): Promise<SetPasswordChallengeRequestResult> {
    if (
      input.emailNormalized !== input.emailNormalized.trim().toLowerCase() ||
      input.challenge.emailNormalized !== input.emailNormalized ||
      input.challenge.emailLookupHash !== input.emailLookupHash ||
      input.challenge.usedAt !== null ||
      !isAuthEmailTokenKeyId(input.challenge.keyId) ||
      input.outboxMessage.type !== 'set_password' ||
      input.outboxMessage.payload.purpose !== 'set_password' ||
      input.outboxMessage.payload.challengeId !== input.challenge.id ||
      input.outboxMessage.payload.keyId !== input.challenge.keyId
    ) {
      return { status: 'invalid_input' };
    }

    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${input.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${input.emailLookupHash}, true),
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING}, ${input.challenge.id}, true),
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING}, ${input.challenge.tokenHash}, true)`,
        );
        // Serialize replacement for one normalized address without requiring a
        // pre-challenge UPDATE policy on the users table.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.emailLookupHash}, 0))`,
        );
        const matchingUsers = await tx
          .select()
          .from(users)
          .where(sql`lower(btrim(${users.email})) = ${input.emailNormalized}`)
          .limit(2);
        if (matchingUsers.length === 0) return { status: 'no_match' };
        if (matchingUsers.length > 1) return { status: 'ambiguous_match' };
        const [user] = matchingUsers;
        if (!user) return { status: 'no_match' };

        const createdAt = new Date(input.challenge.createdAt);
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${user.id}, true),
            set_config(${LODARIQ_AUTH_RECOVERY_MUTATION_AT_SETTING}, ${createdAt.toISOString()}, true)`,
        );
        await tx
          .update(setPasswordOutbox)
          .set({ terminalAt: createdAt, lastError: 'superseded' })
          .where(
            and(
              eq(setPasswordOutbox.userId, user.id),
              isNull(setPasswordOutbox.processedAt),
              isNull(setPasswordOutbox.terminalAt),
            ),
          );
        await tx
          .update(setPasswordChallenges)
          .set({ usedAt: createdAt })
          .where(
            and(eq(setPasswordChallenges.userId, user.id), isNull(setPasswordChallenges.usedAt)),
          );
        await tx.insert(setPasswordChallenges).values({
          id: input.challenge.id,
          userId: user.id,
          keyId: input.challenge.keyId,
          tokenHash: input.challenge.tokenHash,
          emailNormalized: input.challenge.emailNormalized,
          emailLookupHash: input.challenge.emailLookupHash,
          expiresAt: new Date(input.challenge.expiresAt),
          usedAt: null,
          createdAt,
        });
        await tx.insert(setPasswordOutbox).values({
          id: input.outboxMessage.id,
          type: input.outboxMessage.type,
          userId: user.id,
          recipientEmail: input.emailNormalized,
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
        return { status: 'queued' };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'persistence_conflict' };
      throw error;
    }
  }

  async resolveSetPasswordChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedSetPasswordChallenge | null> {
    return runWithSetPasswordChallengeLookupScope(
      this.database,
      challengeId,
      tokenHash,
      async (tx) => {
        const [challenge] = await tx
          .select()
          .from(setPasswordChallenges)
          .where(
            and(
              eq(setPasswordChallenges.id, challengeId),
              eq(setPasswordChallenges.tokenHash, tokenHash),
              isNull(setPasswordChallenges.usedAt),
              sql`${setPasswordChallenges.expiresAt} > ${new Date(now)}`,
            ),
          )
          .limit(1);
        return challenge
          ? { userId: challenge.userId, emailNormalized: challenge.emailNormalized }
          : null;
      },
    );
  }

  async consumeSetPasswordChallenge(
    input: ConsumeSetPasswordChallengeInput,
  ): Promise<UserRecord | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const usedAt = new Date(input.usedAt);
        if (
          input.passwordIdentity.kind !== 'password' ||
          input.passwordIdentity.issuer !== 'https://lodariq.io' ||
          input.passwordIdentity.providerTenantId !== null
        ) {
          return null;
        }
        await tx.execute(
          sql`select
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING}, ${input.challengeId}, true),
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING}, ${input.tokenHash}, true)`,
        );
        const [challenge] = await tx
          .select()
          .from(setPasswordChallenges)
          .where(
            and(
              eq(setPasswordChallenges.id, input.challengeId),
              eq(setPasswordChallenges.tokenHash, input.tokenHash),
              isNull(setPasswordChallenges.usedAt),
              sql`${setPasswordChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .limit(1);
        if (!challenge) return null;

        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${challenge.userId}, true),
            set_config(${LODARIQ_AUTH_RECOVERY_MUTATION_AT_SETTING}, ${usedAt.toISOString()}, true),
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${challenge.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${challenge.emailLookupHash}, true)`,
        );
        const [user] = await tx
          .select()
          .from(users)
          .where(
            and(
              eq(users.id, challenge.userId),
              isNull(users.deletedAt),
              sql`lower(btrim(${users.email})) = ${challenge.emailNormalized}`,
            ),
          )
          .limit(1);
        if (!user) return null;
        if (
          input.passwordIdentity.userId !== user.id ||
          input.passwordIdentity.subject !== `user:${user.id}`
        ) {
          return null;
        }

        const [emailRecord] = await tx
          .select({ id: userEmails.id })
          .from(userEmails)
          .where(
            and(
              eq(userEmails.userId, user.id),
              eq(userEmails.normalizedEmail, challenge.emailNormalized),
              eq(userEmails.isPrimary, true),
            ),
          )
          .limit(1);
        if (!emailRecord) return null;

        const consumed = await tx
          .update(setPasswordChallenges)
          .set({ usedAt })
          .where(
            and(
              eq(setPasswordChallenges.id, input.challengeId),
              eq(setPasswordChallenges.tokenHash, input.tokenHash),
              isNull(setPasswordChallenges.usedAt),
              sql`${setPasswordChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .returning({ userId: setPasswordChallenges.userId });
        if (consumed.length !== 1) return null;

        await tx
          .insert(passwordCredentials)
          .values({
            userId: user.id,
            emailNormalized: challenge.emailNormalized,
            emailLookupHash: challenge.emailLookupHash,
            algorithm: input.credential.algorithm,
            passwordHash: input.credential.passwordHash,
            createdAt: new Date(input.credential.createdAt),
            updatedAt: new Date(input.credential.updatedAt),
          })
          .onConflictDoUpdate({
            target: passwordCredentials.userId,
            set: {
              emailNormalized: challenge.emailNormalized,
              emailLookupHash: challenge.emailLookupHash,
              algorithm: input.credential.algorithm,
              passwordHash: input.credential.passwordHash,
              updatedAt: new Date(input.credential.updatedAt),
            },
          });

        const [existingPasswordIdentity] = await tx
          .select({ id: authIdentities.id })
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.userId, user.id),
              eq(authIdentities.kind, 'password'),
              isNull(authIdentities.disabledAt),
            ),
          )
          .limit(1);
        if (!existingPasswordIdentity) {
          await tx.insert(authIdentities).values({
            id: input.passwordIdentity.id,
            userId: input.passwordIdentity.userId,
            kind: input.passwordIdentity.kind,
            issuer: input.passwordIdentity.issuer,
            subject: input.passwordIdentity.subject,
            providerTenantId: input.passwordIdentity.providerTenantId,
            createdAt: new Date(input.passwordIdentity.createdAt),
            lastAuthenticatedAt: null,
            disabledAt: null,
          });
        }

        const [verified] = await tx
          .update(users)
          .set({
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${usedAt})`,
          })
          .where(eq(users.id, user.id))
          .returning();
        if (!verified) throw new SetPasswordAtomicWriteRejected();

        const verifiedEmails = await tx
          .update(userEmails)
          .set({
            verifiedAt: sql`coalesce(${userEmails.verifiedAt}, ${usedAt})`,
            updatedAt: usedAt,
          })
          .where(eq(userEmails.id, emailRecord.id))
          .returning({ id: userEmails.id });
        if (verifiedEmails.length !== 1) throw new SetPasswordAtomicWriteRejected();

        await tx
          .update(identityOnboardingStates)
          .set({
            status: 'pending_destination',
            updatedAt: usedAt,
            version: sql`${identityOnboardingStates.version} + 1`,
          })
          .where(
            and(
              eq(identityOnboardingStates.userId, user.id),
              eq(identityOnboardingStates.status, 'pending_identity'),
            ),
          );

        await tx
          .update(authSessions)
          .set({ revokedAt: usedAt })
          .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
        await tx
          .update(emailVerificationChallenges)
          .set({ usedAt })
          .where(
            and(
              eq(emailVerificationChallenges.userId, user.id),
              isNull(emailVerificationChallenges.usedAt),
            ),
          );
        await tx
          .update(setPasswordChallenges)
          .set({ usedAt })
          .where(
            and(eq(setPasswordChallenges.userId, user.id), isNull(setPasswordChallenges.usedAt)),
          );
        await tx
          .update(authOutbox)
          .set({ terminalAt: usedAt, lastError: 'challenge_consumed' })
          .where(
            and(
              eq(authOutbox.userId, user.id),
              isNull(authOutbox.processedAt),
              isNull(authOutbox.terminalAt),
            ),
          );
        await tx
          .update(setPasswordOutbox)
          .set({ terminalAt: usedAt, lastError: 'challenge_consumed' })
          .where(
            and(
              eq(setPasswordOutbox.userId, user.id),
              isNull(setPasswordOutbox.processedAt),
              isNull(setPasswordOutbox.terminalAt),
            ),
          );
        return toUserRecord(verified);
      });
    } catch (error) {
      if (error instanceof SetPasswordAtomicWriteRejected || isUniqueConstraintViolation(error)) {
        return null;
      }
      throw error;
    }
  }
}
