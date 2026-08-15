import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type {
  AccountEmailChangeRecord,
  AccountExportRecord,
  AccountManagementRepository,
  AccountSecurityEventRecord,
  AccountSessionRecord,
  BeginAccountEmailChangeInput,
  BeginAccountEmailChangeResult,
  ChangeAccountPasswordInput,
  ChangeAccountPasswordResult,
  ScheduleAccountDeletionInput,
  ScheduleAccountDeletionResult,
  VerifyAccountEmailChangeInput,
  VerifyAccountEmailChangeResult,
} from '../domains/account-management';
import {
  toEmailExport,
  toIdentitySummary,
  validAccountEmailChange,
  validAccountSecurityEvent,
} from '../domains/account-management';
import {
  accountEmailChangeChallenges,
  accountEmailChangeOutbox,
  accountSecurityEvents,
  authIdentities,
  authSessions,
  passwordCredentials,
  recoveryCodeSets,
  setPasswordChallenges,
  setPasswordOutbox,
  userEmails,
  usernames,
  users,
} from '../schema';
import { runWithAuthUserScope } from '../scoped-transaction';
import {
  authSessionValues,
  isUniqueConstraintViolation,
  toAuthSessionRecord,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryTenantAdministration } from './tenant-administration';
import type { LodariqTransaction } from './types';

export class DrizzleRepositoryAccountManagement
  extends DrizzleRepositoryTenantAdministration
  implements AccountManagementRepository
{
  async listAccountSessions(userId: string, now: string): Promise<AccountSessionRecord[]> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const timestamp = new Date(now);
      const rows = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.userId, userId),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${timestamp}`,
            sql`${authSessions.absoluteExpiresAt} > ${timestamp}`,
          ),
        )
        .orderBy(desc(authSessions.lastSeenAt), desc(authSessions.createdAt));
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        deviceLabel: row.deviceLabel,
        authenticationMethod:
          row.authenticationMethod as AccountSessionRecord['authenticationMethod'],
        assuranceLevel: row.assuranceLevel as AccountSessionRecord['assuranceLevel'],
        durationPolicy: row.durationPolicy as AccountSessionRecord['durationPolicy'],
        createdAt: toIsoString(row.createdAt),
        lastSeenAt: toIsoString(row.lastSeenAt),
        absoluteExpiresAt: toIsoString(row.absoluteExpiresAt),
      }));
    });
  }

  async revokeAccountSession(
    userId: string,
    sessionId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean> {
    if (
      !validAccountSecurityEvent(event) ||
      event.eventType !== 'session_revoked' ||
      event.targetId !== sessionId
    ) {
      return false;
    }
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const updated = await tx
        .update(authSessions)
        .set({ revokedAt: new Date(revokedAt) })
        .where(
          and(
            eq(authSessions.userId, userId),
            eq(authSessions.id, sessionId),
            isNull(authSessions.revokedAt),
          ),
        )
        .returning({ id: authSessions.id });
      if (updated.length !== 1) return false;
      await this.insertAccountSecurityEvent(tx, event);
      return true;
    });
  }

  async revokeAllAccountSessions(
    userId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<number> {
    if (!validAccountSecurityEvent(event) || event.eventType !== 'sessions_revoked_all') return 0;
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const updated = await tx
        .update(authSessions)
        .set({ revokedAt: new Date(revokedAt) })
        .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      await this.insertAccountSecurityEvent(tx, event);
      return updated.length;
    });
  }

  async changeAccountPassword(
    input: ChangeAccountPasswordInput,
  ): Promise<ChangeAccountPasswordResult> {
    if (
      !validAccountSecurityEvent({
        id: input.eventId,
        userId: input.userId,
        actorUserId: input.userId,
        eventType: 'password_changed',
        targetId: input.currentSessionId,
        occurredAt: input.changedAt,
      }) ||
      input.nextSession.userId !== input.userId ||
      input.nextSession.revokedAt !== null
    ) {
      return { status: 'invalid_input' };
    }
    return runWithAuthUserScope(this.database, input.userId, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${'account-password:' + input.userId}, 0))`,
      );
      const changedAt = new Date(input.changedAt);
      const updated = await tx
        .update(passwordCredentials)
        .set({
          algorithm: input.credential.algorithm,
          passwordHash: input.credential.passwordHash,
          updatedAt: new Date(input.credential.updatedAt),
        })
        .where(
          and(
            eq(passwordCredentials.userId, input.userId),
            eq(passwordCredentials.passwordHash, input.expectedPasswordHash),
          ),
        )
        .returning({ userId: passwordCredentials.userId });
      if (updated.length !== 1) return { status: 'credential_changed' };
      await tx
        .update(setPasswordChallenges)
        .set({ usedAt: changedAt })
        .where(
          and(eq(setPasswordChallenges.userId, input.userId), isNull(setPasswordChallenges.usedAt)),
        );
      await tx
        .update(setPasswordOutbox)
        .set({ terminalAt: changedAt, lastError: 'credential_changed' })
        .where(
          and(
            eq(setPasswordOutbox.userId, input.userId),
            isNull(setPasswordOutbox.processedAt),
            isNull(setPasswordOutbox.terminalAt),
          ),
        );
      await tx
        .update(accountEmailChangeChallenges)
        .set({ revokedAt: changedAt })
        .where(
          and(
            eq(accountEmailChangeChallenges.userId, input.userId),
            isNull(accountEmailChangeChallenges.consumedAt),
            isNull(accountEmailChangeChallenges.revokedAt),
          ),
        );
      await tx
        .update(accountEmailChangeOutbox)
        .set({ terminalAt: changedAt, lastError: 'credential_changed' })
        .where(
          and(
            eq(accountEmailChangeOutbox.userId, input.userId),
            isNull(accountEmailChangeOutbox.processedAt),
            isNull(accountEmailChangeOutbox.terminalAt),
          ),
        );
      await tx
        .update(authSessions)
        .set({ revokedAt: changedAt })
        .where(and(eq(authSessions.userId, input.userId), isNull(authSessions.revokedAt)));
      await tx
        .update(recoveryCodeSets)
        .set({ revokedAt: changedAt })
        .where(and(eq(recoveryCodeSets.userId, input.userId), isNull(recoveryCodeSets.revokedAt)));
      const [created] = await tx
        .insert(authSessions)
        .values(authSessionValues(input.nextSession))
        .returning();
      if (!created) throw new Error('Password change session was not created');
      await this.insertAccountSecurityEvent(tx, {
        id: input.eventId,
        userId: input.userId,
        actorUserId: input.userId,
        eventType: 'password_changed',
        targetId: created.id,
        occurredAt: input.changedAt,
      });
      return { status: 'changed', session: toAuthSessionRecord(created) };
    });
  }

  async getAccountEmailChange(
    userId: string,
    now: string,
  ): Promise<AccountEmailChangeRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(accountEmailChangeChallenges)
        .where(
          and(
            eq(accountEmailChangeChallenges.userId, userId),
            isNull(accountEmailChangeChallenges.consumedAt),
            isNull(accountEmailChangeChallenges.revokedAt),
            sql`${accountEmailChangeChallenges.expiresAt} > ${new Date(now)}`,
          ),
        )
        .orderBy(desc(accountEmailChangeChallenges.createdAt))
        .limit(1);
      return row ? toAccountEmailChange(row) : null;
    });
  }

  async beginAccountEmailChange(
    input: BeginAccountEmailChangeInput,
  ): Promise<BeginAccountEmailChangeResult> {
    if (
      !validAccountEmailChange(input.challenge) ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'email_change_started' ||
      input.outbox.some(
        (row) =>
          row.userId !== input.challenge.userId ||
          row.challengeId !== input.challenge.id ||
          row.keyId !== input.challenge.keyId ||
          row.changePath !== '/account/email-change',
      ) ||
      new Set(input.outbox.map(({ proof }) => proof)).size !== 2
    ) {
      return { status: 'invalid_input' };
    }
    try {
      return await runWithAuthUserScope(this.database, input.challenge.userId, async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${'account-email:' + input.challenge.userId}, 0))`,
        );
        const [credential] = await tx
          .select({ passwordHash: passwordCredentials.passwordHash })
          .from(passwordCredentials)
          .where(eq(passwordCredentials.userId, input.challenge.userId))
          .limit(1);
        if (credential?.passwordHash !== input.expectedPasswordHash) {
          return { status: 'credential_changed' };
        }
        const [conflict] = await tx
          .select({ id: userEmails.id })
          .from(userEmails)
          .where(eq(userEmails.normalizedEmail, input.challenge.newEmailNormalized))
          .limit(1);
        if (conflict) return { status: 'email_conflict' };
        const now = new Date(input.challenge.createdAt);
        const prior = await tx
          .update(accountEmailChangeChallenges)
          .set({ revokedAt: now })
          .where(
            and(
              eq(accountEmailChangeChallenges.userId, input.challenge.userId),
              isNull(accountEmailChangeChallenges.consumedAt),
              isNull(accountEmailChangeChallenges.revokedAt),
            ),
          )
          .returning({ id: accountEmailChangeChallenges.id });
        if (prior.length) {
          await tx
            .update(accountEmailChangeOutbox)
            .set({ terminalAt: now, lastError: 'superseded' })
            .where(
              and(
                eq(accountEmailChangeOutbox.userId, input.challenge.userId),
                isNull(accountEmailChangeOutbox.processedAt),
                isNull(accountEmailChangeOutbox.terminalAt),
              ),
            );
        }
        await tx.insert(accountEmailChangeChallenges).values({
          id: input.challenge.id,
          userId: input.challenge.userId,
          currentEmailNormalized: input.challenge.currentEmailNormalized,
          newEmailNormalized: input.challenge.newEmailNormalized,
          newEmailLookupHash: input.challenge.newEmailLookupHash,
          currentTokenHash: input.challenge.currentTokenHash,
          newTokenHash: input.challenge.newTokenHash,
          keyId: input.challenge.keyId,
          currentVerifiedAt: null,
          newVerifiedAt: null,
          expiresAt: new Date(input.challenge.expiresAt),
          consumedAt: null,
          revokedAt: null,
          createdAt: now,
        });
        await tx.insert(accountEmailChangeOutbox).values(
          input.outbox.map((row) => ({
            id: row.id,
            type: row.type,
            userId: row.userId,
            challengeId: row.challengeId,
            recipientEmail: row.recipientEmail,
            payload: {
              purpose: 'account_email_change' as const,
              challengeId: row.challengeId,
              proof: row.proof,
              changePath: row.changePath,
              keyId: row.keyId,
            },
            availableAt: new Date(row.availableAt),
            processedAt: null,
            attempts: 0,
            leaseVersion: 0,
            lastError: null,
            terminalAt: null,
            createdAt: now,
          })),
        );
        await this.insertAccountSecurityEvent(tx, input.event);
        return { status: 'queued', challenge: input.challenge };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'email_conflict' };
      throw error;
    }
  }

  async verifyAccountEmailChange(
    input: VerifyAccountEmailChangeInput,
  ): Promise<VerifyAccountEmailChangeResult> {
    if (!/^[0-9a-f]{64}$/u.test(input.tokenHash)) return { status: 'invalid_or_expired' };
    try {
      return await runWithAuthUserScope(this.database, input.userId, async (tx) => {
        const verifiedAt = new Date(input.verifiedAt);
        const [row] = await tx
          .select()
          .from(accountEmailChangeChallenges)
          .where(
            and(
              eq(accountEmailChangeChallenges.id, input.challengeId),
              eq(accountEmailChangeChallenges.userId, input.userId),
              isNull(accountEmailChangeChallenges.consumedAt),
              isNull(accountEmailChangeChallenges.revokedAt),
              sql`${accountEmailChangeChallenges.expiresAt} > ${verifiedAt}`,
            ),
          )
          .limit(1)
          .for('update');
        if (!row) return { status: 'invalid_or_expired' };
        const expectedHash =
          input.proof === 'current_email' ? row.currentTokenHash : row.newTokenHash;
        if (expectedHash !== input.tokenHash) return { status: 'invalid_or_expired' };
        if (
          (input.proof === 'current_email' && row.currentVerifiedAt) ||
          (input.proof === 'new_email' && row.newVerifiedAt)
        ) {
          return { status: 'invalid_or_expired' };
        }
        const currentVerifiedAt =
          input.proof === 'current_email' ? verifiedAt : row.currentVerifiedAt;
        const newVerifiedAt = input.proof === 'new_email' ? verifiedAt : row.newVerifiedAt;
        await tx
          .update(accountEmailChangeChallenges)
          .set({ currentVerifiedAt, newVerifiedAt })
          .where(eq(accountEmailChangeChallenges.id, row.id));
        await this.insertAccountSecurityEvent(tx, {
          id: input.eventId,
          userId: input.userId,
          actorUserId: input.userId,
          eventType:
            input.proof === 'current_email'
              ? 'email_change_current_verified'
              : 'email_change_new_verified',
          targetId: row.id,
          occurredAt: input.verifiedAt,
        });
        if (!currentVerifiedAt || !newVerifiedAt) {
          return {
            status: 'proof_recorded',
            challenge: toAccountEmailChange({ ...row, currentVerifiedAt, newVerifiedAt }),
          };
        }
        const [conflict] = await tx
          .select({ id: userEmails.id })
          .from(userEmails)
          .where(eq(userEmails.normalizedEmail, row.newEmailNormalized))
          .limit(1);
        if (conflict) return { status: 'email_conflict' };
        await tx
          .update(userEmails)
          .set({
            normalizedEmail: row.newEmailNormalized,
            verifiedAt,
            updatedAt: verifiedAt,
          })
          .where(and(eq(userEmails.userId, input.userId), eq(userEmails.isPrimary, true)));
        await tx
          .update(users)
          .set({ email: row.newEmailNormalized, emailVerifiedAt: verifiedAt })
          .where(eq(users.id, input.userId));
        await tx
          .update(passwordCredentials)
          .set({
            emailNormalized: row.newEmailNormalized,
            emailLookupHash: row.newEmailLookupHash,
            updatedAt: verifiedAt,
          })
          .where(eq(passwordCredentials.userId, input.userId));
        await tx
          .update(setPasswordChallenges)
          .set({ usedAt: verifiedAt })
          .where(
            and(
              eq(setPasswordChallenges.userId, input.userId),
              isNull(setPasswordChallenges.usedAt),
            ),
          );
        await tx
          .update(setPasswordOutbox)
          .set({ terminalAt: verifiedAt, lastError: 'email_changed' })
          .where(
            and(
              eq(setPasswordOutbox.userId, input.userId),
              isNull(setPasswordOutbox.processedAt),
              isNull(setPasswordOutbox.terminalAt),
            ),
          );
        await tx
          .update(accountEmailChangeOutbox)
          .set({ terminalAt: verifiedAt, lastError: 'email_changed' })
          .where(
            and(
              eq(accountEmailChangeOutbox.challengeId, row.id),
              isNull(accountEmailChangeOutbox.processedAt),
              isNull(accountEmailChangeOutbox.terminalAt),
            ),
          );
        await tx
          .update(authSessions)
          .set({ revokedAt: verifiedAt })
          .where(
            and(
              eq(authSessions.userId, input.userId),
              ne(authSessions.id, input.currentSessionId),
              isNull(authSessions.revokedAt),
            ),
          );
        await tx
          .update(accountEmailChangeChallenges)
          .set({ consumedAt: verifiedAt })
          .where(eq(accountEmailChangeChallenges.id, row.id));
        await this.insertAccountSecurityEvent(tx, {
          id: input.completionEventId,
          userId: input.userId,
          actorUserId: input.userId,
          eventType: 'email_changed',
          targetId: row.id,
          occurredAt: input.verifiedAt,
        });
        return { status: 'completed', email: row.newEmailNormalized };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'email_conflict' };
      throw error;
    }
  }

  async scheduleAccountDeletion(
    input: ScheduleAccountDeletionInput,
  ): Promise<ScheduleAccountDeletionResult> {
    if (!validAccountSecurityEvent(input.event)) return { status: 'conflict' };
    return runWithAuthUserScope(this.database, input.userId, async (tx) => {
      const [credential] = await tx
        .select({ passwordHash: passwordCredentials.passwordHash })
        .from(passwordCredentials)
        .where(eq(passwordCredentials.userId, input.userId))
        .limit(1);
      if (credential?.passwordHash !== input.expectedPasswordHash) {
        return { status: 'credential_changed' };
      }
      const result = await tx.execute<{ outcome: string }>(
        sql`select public.lodariq_schedule_account_deletion(
          ${input.userId},
          ${new Date(input.deletedAt)},
          ${new Date(input.retentionExpiresAt)}
        ) as outcome`,
      );
      const outcome = result.rows[0]?.outcome;
      if (outcome === 'final_owner') return { status: 'final_owner' };
      if (outcome !== 'scheduled') return { status: 'conflict' };
      await this.insertAccountSecurityEvent(tx, input.event);
      return {
        status: 'scheduled',
        deletion: {
          deletedAt: input.deletedAt,
          retentionExpiresAt: input.retentionExpiresAt,
        },
      };
    });
  }

  async exportAccount(userId: string): Promise<AccountExportRecord | null> {
    const base = await runWithAuthUserScope(this.database, userId, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.deletedAt) return null;
      const [emails, identities, username] = await Promise.all([
        tx
          .select()
          .from(userEmails)
          .where(eq(userEmails.userId, userId))
          .orderBy(desc(userEmails.isPrimary), asc(userEmails.createdAt)),
        tx
          .select()
          .from(authIdentities)
          .where(eq(authIdentities.userId, userId))
          .orderBy(asc(authIdentities.createdAt)),
        tx.select().from(usernames).where(eq(usernames.userId, userId)).limit(1),
      ]);
      return {
        profile: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: username[0]?.displayUsername ?? null,
        },
        emails: emails.map((email) =>
          toEmailExport({
            id: email.id,
            userId: email.userId,
            normalizedEmail: email.normalizedEmail,
            isPrimary: email.isPrimary,
            verifiedAt: email.verifiedAt ? toIsoString(email.verifiedAt) : null,
            createdAt: toIsoString(email.createdAt),
            updatedAt: toIsoString(email.updatedAt),
          }),
        ),
        identities: identities.map((identity) =>
          toIdentitySummary({
            id: identity.id,
            userId: identity.userId,
            kind: identity.kind as typeof identity.kind &
              ('password' | 'passkey' | 'oidc' | 'saml'),
            issuer: identity.issuer,
            subject: identity.subject,
            providerTenantId: identity.providerTenantId,
            createdAt: toIsoString(identity.createdAt),
            lastAuthenticatedAt: identity.lastAuthenticatedAt
              ? toIsoString(identity.lastAuthenticatedAt)
              : null,
            disabledAt: identity.disabledAt ? toIsoString(identity.disabledAt) : null,
          }),
        ),
      };
    });
    if (!base) return null;
    const workspaces = await this.listIdentityWorkspaces(userId);
    return {
      ...base,
      workspaces: workspaces.map(({ id, name, role }) => ({ id, name, role })),
    };
  }

  async listAccountSecurityEvents(userId: string): Promise<AccountSecurityEventRecord[]> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(accountSecurityEvents)
        .where(eq(accountSecurityEvents.userId, userId))
        .orderBy(desc(accountSecurityEvents.occurredAt), desc(accountSecurityEvents.id));
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        actorUserId: row.actorUserId,
        eventType: row.eventType as AccountSecurityEventRecord['eventType'],
        targetId: row.targetId,
        occurredAt: toIsoString(row.occurredAt),
      }));
    });
  }

  private async insertAccountSecurityEvent(
    tx: LodariqTransaction,
    event: AccountSecurityEventRecord,
  ): Promise<void> {
    if (!validAccountSecurityEvent(event)) throw new Error('Invalid account security event');
    await tx.insert(accountSecurityEvents).values({
      id: event.id,
      userId: event.userId,
      actorUserId: event.actorUserId,
      eventType: event.eventType,
      targetId: event.targetId,
      occurredAt: new Date(event.occurredAt),
    });
  }
}

function toAccountEmailChange(
  row: typeof accountEmailChangeChallenges.$inferSelect,
): AccountEmailChangeRecord {
  return {
    id: row.id,
    userId: row.userId,
    currentEmailNormalized: row.currentEmailNormalized,
    newEmailNormalized: row.newEmailNormalized,
    newEmailLookupHash: row.newEmailLookupHash,
    currentTokenHash: row.currentTokenHash,
    newTokenHash: row.newTokenHash,
    keyId: row.keyId,
    currentVerifiedAt: row.currentVerifiedAt ? toIsoString(row.currentVerifiedAt) : null,
    newVerifiedAt: row.newVerifiedAt ? toIsoString(row.newVerifiedAt) : null,
    expiresAt: toIsoString(row.expiresAt),
    consumedAt: row.consumedAt ? toIsoString(row.consumedAt) : null,
    revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
    createdAt: toIsoString(row.createdAt),
  };
}
