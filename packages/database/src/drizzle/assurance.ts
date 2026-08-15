import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AccountSecurityEventRecord } from '../domains/account-management';
import { validAccountSecurityEvent } from '../domains/account-management';
import {
  type CompletePasskeyAuthenticationInput,
  type CompletePasskeyRegistrationInput,
  type ConsumeRecoveryCodeInput,
  type CreateRecoveryCodeSetInput,
  type PasskeyCredentialRecord,
  type RecoveryCodeStatusRecord,
  type WebAuthnChallengeRecord,
  validPasskeyCredential,
  validWebAuthnChallenge,
} from '../domains/assurance';
import {
  isValidAuthSessionRecord,
  type AuthSessionRecord,
  type NormalizedAuthIdentifier,
} from '../domains/identity';
import {
  accountSecurityEvents,
  authIdentities,
  authSessions,
  passkeyCredentials,
  recoveryCodes,
  recoveryCodeSets,
  users,
  usernames,
  webauthnChallenges,
} from '../schema';
import {
  LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING,
  LODARIQ_AUTH_IDENTIFIER_NORMALIZED_SETTING,
  LODARIQ_AUTH_SESSION_HASH_SETTING,
  LODARIQ_AUTH_USER_ID_SETTING,
  runWithAuthUserScope,
} from '../scoped-transaction';
import { authSessionValues, isUniqueConstraintViolation, toIsoString } from './helpers';
import { DrizzleRepositoryAccountManagement } from './account-management';
import type { LodariqTransaction } from './types';

const WEBAUTHN_CHALLENGE_SETTING = 'lodariq.webauthn_challenge_id';
const WEBAUTHN_CREDENTIAL_SETTING = 'lodariq.webauthn_credential_id';
const RECOVERY_CODE_HASH_SETTING = 'lodariq.recovery_code_hash';

class AssuranceAtomicWriteRejected extends Error {}

export class DrizzleRepositoryAssurance extends DrizzleRepositoryAccountManagement {
  async createWebAuthnChallenge(challenge: WebAuthnChallengeRecord): Promise<boolean> {
    if (!validWebAuthnChallenge(challenge)) return false;
    try {
      if (challenge.userId) {
        return runWithAuthUserScope(this.database, challenge.userId, async (tx) => {
          await tx.insert(webauthnChallenges).values(challengeValues(challenge));
          return true;
        });
      }
      return this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config(${WEBAUTHN_CHALLENGE_SETTING}, ${challenge.id}, true)`,
        );
        await tx.insert(webauthnChallenges).values(challengeValues(challenge));
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async getWebAuthnChallenge(
    challengeId: string,
    now: string,
  ): Promise<WebAuthnChallengeRecord | null> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${WEBAUTHN_CHALLENGE_SETTING}, ${challengeId}, true)`);
      const rows = await tx
        .select()
        .from(webauthnChallenges)
        .where(
          and(
            eq(webauthnChallenges.id, challengeId),
            isNull(webauthnChallenges.consumedAt),
            gt(webauthnChallenges.expiresAt, new Date(now)),
          ),
        )
        .limit(1);
      return rows[0] ? toWebAuthnChallenge(rows[0]) : null;
    });
  }

  async completePasskeyRegistration(input: CompletePasskeyRegistrationInput): Promise<boolean> {
    if (
      !validPasskeyCredential(input.credential) ||
      input.credential.userId !== input.userId ||
      input.identity.userId !== input.userId ||
      input.credential.identityId !== input.identity.id ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'passkey_registered'
    ) {
      return false;
    }
    try {
      return await runWithAuthUserScope(this.database, input.userId, async (tx) => {
        const consumed = await tx
          .update(webauthnChallenges)
          .set({ consumedAt: new Date(input.consumedAt) })
          .where(
            and(
              eq(webauthnChallenges.id, input.challengeId),
              eq(webauthnChallenges.userId, input.userId),
              eq(webauthnChallenges.purpose, 'passkey_registration'),
              eq(webauthnChallenges.challengeHash, input.challengeHash),
              isNull(webauthnChallenges.consumedAt),
              gt(webauthnChallenges.expiresAt, new Date(input.consumedAt)),
            ),
          )
          .returning({ id: webauthnChallenges.id });
        if (consumed.length !== 1) return false;
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
        await tx.insert(passkeyCredentials).values(passkeyValues(input.credential));
        await insertSecurityEvent(tx, input.event);
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async findPasskeyCredential(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config(${WEBAUTHN_CREDENTIAL_SETTING}, ${credentialId}, true)`,
      );
      const credentials = await tx
        .select()
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.credentialId, credentialId))
        .limit(1);
      const credential = credentials[0];
      if (!credential) return null;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${credential.userId}, true)`,
      );
      const [identity] = await tx
        .select({ id: authIdentities.id })
        .from(authIdentities)
        .innerJoin(users, and(eq(users.id, authIdentities.userId), isNull(users.deletedAt)))
        .where(and(eq(authIdentities.id, credential.identityId), isNull(authIdentities.disabledAt)))
        .limit(1);
      return identity ? toPasskeyCredential(credential) : null;
    });
  }

  async listPasskeyCredentials(userId: string): Promise<PasskeyCredentialRecord[]> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const rows = await tx
        .select({ credential: passkeyCredentials })
        .from(passkeyCredentials)
        .innerJoin(
          authIdentities,
          and(
            eq(authIdentities.id, passkeyCredentials.identityId),
            isNull(authIdentities.disabledAt),
          ),
        )
        .where(eq(passkeyCredentials.userId, userId))
        .orderBy(desc(passkeyCredentials.createdAt));
      return rows.map(({ credential }) => toPasskeyCredential(credential));
    });
  }

  async completePasskeyAuthentication(
    input: CompletePasskeyAuthenticationInput,
  ): Promise<AuthSessionRecord | null> {
    if (
      !isValidAuthSessionRecord(input.nextSession) ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'passkey_authenticated'
    ) {
      return null;
    }
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(sql`select
        set_config(${WEBAUTHN_CHALLENGE_SETTING}, ${input.challengeId}, true),
        set_config(${WEBAUTHN_CREDENTIAL_SETTING}, ${input.credentialId}, true)`);
        const credentials = await tx
          .select()
          .from(passkeyCredentials)
          .where(eq(passkeyCredentials.credentialId, input.credentialId))
          .limit(1);
        const credential = credentials[0];
        if (!credential || credential.userId !== input.nextSession.userId) return null;
        const counterAdvanced =
          input.expectedCounter === 0
            ? input.nextCounter >= 0
            : input.nextCounter > input.expectedCounter;
        if (credential.counter !== input.expectedCounter || !counterAdvanced) return null;
        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${credential.userId}, true)`,
        );
        const [identity] = await tx
          .select({ id: authIdentities.id })
          .from(authIdentities)
          .innerJoin(users, and(eq(users.id, authIdentities.userId), isNull(users.deletedAt)))
          .where(
            and(
              eq(authIdentities.id, credential.identityId),
              isNull(authIdentities.disabledAt),
            ),
          )
          .limit(1);
        if (!identity) return null;
        const consumed = await tx
          .update(webauthnChallenges)
          .set({ consumedAt: new Date(input.authenticatedAt) })
          .where(
            and(
              eq(webauthnChallenges.id, input.challengeId),
              eq(webauthnChallenges.challengeHash, input.challengeHash),
              isNull(webauthnChallenges.consumedAt),
              gt(webauthnChallenges.expiresAt, new Date(input.authenticatedAt)),
              sql`${webauthnChallenges.purpose} in ('passkey_authentication', 'passkey_step_up')`,
              sql`(${webauthnChallenges.userId} is null or ${webauthnChallenges.userId} = ${credential.userId})`,
            ),
          )
          .returning({ id: webauthnChallenges.id });
        if (consumed.length !== 1) return null;
        const updatedCredential = await tx
          .update(passkeyCredentials)
          .set({ counter: input.nextCounter, lastUsedAt: new Date(input.authenticatedAt) })
          .where(
            and(
              eq(passkeyCredentials.credentialId, input.credentialId),
              eq(passkeyCredentials.counter, input.expectedCounter),
            ),
          )
          .returning({ id: passkeyCredentials.id });
        if (updatedCredential.length !== 1) throw new AssuranceAtomicWriteRejected();
        await tx
          .update(authIdentities)
          .set({ lastAuthenticatedAt: new Date(input.authenticatedAt) })
          .where(eq(authIdentities.id, credential.identityId));
        if (input.currentSessionTokenHash) {
          await tx.execute(
            sql`select set_config(${LODARIQ_AUTH_SESSION_HASH_SETTING}, ${input.currentSessionTokenHash}, true)`,
          );
          const revoked = await tx
            .update(authSessions)
            .set({ revokedAt: new Date(input.authenticatedAt) })
            .where(
              and(
                eq(authSessions.tokenHash, input.currentSessionTokenHash),
                eq(authSessions.userId, credential.userId),
                isNull(authSessions.revokedAt),
              ),
            )
            .returning({ id: authSessions.id });
          if (revoked.length !== 1) throw new AssuranceAtomicWriteRejected();
        }
        await tx.insert(authSessions).values(authSessionValues(input.nextSession));
        await insertSecurityEvent(tx, input.event);
        return input.nextSession;
      });
    } catch (error) {
      if (error instanceof AssuranceAtomicWriteRejected) return null;
      throw error;
    }
  }

  async findIdentityUserByIdentifier(
    identifier: NormalizedAuthIdentifier,
    _emailLookupHash: string | null,
  ): Promise<{ id: string } | null> {
    return this.database.transaction(async (tx) => {
      if (identifier.kind === 'email') {
        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${identifier.value}, true)`,
        );
        const matches = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              sql`lower(btrim(${users.email})) = ${identifier.value}`,
              isNull(users.deletedAt),
              sql`${users.emailVerifiedAt} is not null`,
            ),
          );
        return matches.length === 1 ? matches[0]! : null;
      }
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_IDENTIFIER_NORMALIZED_SETTING}, ${identifier.value}, true)`,
      );
      const matches = await tx
        .select({ userId: usernames.userId })
        .from(usernames)
        .where(eq(usernames.normalizedUsername, identifier.value));
      if (matches.length !== 1) return null;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${matches[0]!.userId}, true)`,
      );
      const rows = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, matches[0]!.userId),
            isNull(users.deletedAt),
            sql`${users.emailVerifiedAt} is not null`,
          ),
        );
      return rows[0] ?? null;
    });
  }

  async createRecoveryCodeSet(input: CreateRecoveryCodeSetInput): Promise<boolean> {
    if (
      input.codes.length !== 10 ||
      input.codes.some(
        (code) =>
          code.userId !== input.set.userId ||
          code.setId !== input.set.id ||
          !/^[0-9a-f]{64}$/u.test(code.codeHash),
      ) ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'recovery_codes_generated'
    ) {
      return false;
    }
    try {
      return await runWithAuthUserScope(this.database, input.set.userId, async (tx) => {
        await tx
          .update(recoveryCodeSets)
          .set({ revokedAt: new Date(input.set.createdAt) })
          .where(
            and(eq(recoveryCodeSets.userId, input.set.userId), isNull(recoveryCodeSets.revokedAt)),
          );
        await tx.insert(recoveryCodeSets).values({
          id: input.set.id,
          userId: input.set.userId,
          confirmedAt: null,
          revokedAt: null,
          createdAt: new Date(input.set.createdAt),
        });
        await tx.insert(recoveryCodes).values(
          input.codes.map((code) => ({
            id: code.id,
            setId: code.setId,
            userId: code.userId,
            codeHash: code.codeHash,
            usedAt: null,
            createdAt: new Date(code.createdAt),
          })),
        );
        await insertSecurityEvent(tx, input.event);
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async getRecoveryCodeStatus(userId: string): Promise<RecoveryCodeStatusRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const sets = await tx
        .select()
        .from(recoveryCodeSets)
        .where(and(eq(recoveryCodeSets.userId, userId), isNull(recoveryCodeSets.revokedAt)))
        .orderBy(desc(recoveryCodeSets.createdAt))
        .limit(1);
      const set = sets[0];
      if (!set) return null;
      const codes = await tx
        .select({ id: recoveryCodes.id })
        .from(recoveryCodes)
        .where(and(eq(recoveryCodes.setId, set.id), isNull(recoveryCodes.usedAt)));
      return {
        setId: set.id,
        confirmed: set.confirmedAt !== null,
        remaining: codes.length,
        createdAt: toIsoString(set.createdAt),
      };
    });
  }

  async confirmRecoveryCodeSet(
    userId: string,
    setId: string,
    codeHash: string,
    confirmedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean> {
    if (!validAccountSecurityEvent(event) || event.eventType !== 'recovery_codes_confirmed') {
      return false;
    }
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const matching = await tx
        .select({ id: recoveryCodes.id })
        .from(recoveryCodes)
        .where(
          and(
            eq(recoveryCodes.userId, userId),
            eq(recoveryCodes.setId, setId),
            eq(recoveryCodes.codeHash, codeHash),
            isNull(recoveryCodes.usedAt),
          ),
        )
        .limit(1);
      if (!matching[0]) return false;
      const updated = await tx
        .update(recoveryCodeSets)
        .set({ confirmedAt: new Date(confirmedAt) })
        .where(
          and(
            eq(recoveryCodeSets.id, setId),
            eq(recoveryCodeSets.userId, userId),
            isNull(recoveryCodeSets.confirmedAt),
            isNull(recoveryCodeSets.revokedAt),
          ),
        )
        .returning({ id: recoveryCodeSets.id });
      if (updated.length !== 1) return false;
      await insertSecurityEvent(tx, event);
      return true;
    });
  }

  async consumeRecoveryCode(
    input: ConsumeRecoveryCodeInput,
  ): Promise<AuthSessionRecord | null> {
    if (
      input.session.userId !== input.userId ||
      !isValidAuthSessionRecord(input.session) ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'recovery_code_used'
    ) {
      return null;
    }
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config(${RECOVERY_CODE_HASH_SETTING}, ${input.codeHash}, true)`,
      );
      const codes = await tx
        .select()
        .from(recoveryCodes)
        .where(and(eq(recoveryCodes.codeHash, input.codeHash), isNull(recoveryCodes.usedAt)))
        .limit(1);
      const code = codes[0];
      if (!code || code.userId !== input.userId) return null;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.userId}, true)`,
      );
      const sets = await tx
        .select({ id: recoveryCodeSets.id })
        .from(recoveryCodeSets)
        .where(
          and(
            eq(recoveryCodeSets.id, code.setId),
            eq(recoveryCodeSets.userId, input.userId),
            sql`${recoveryCodeSets.confirmedAt} is not null`,
            isNull(recoveryCodeSets.revokedAt),
          ),
        );
      if (!sets[0]) return null;
      const used = await tx
        .update(recoveryCodes)
        .set({ usedAt: new Date(input.usedAt) })
        .where(and(eq(recoveryCodes.id, code.id), isNull(recoveryCodes.usedAt)))
        .returning({ id: recoveryCodes.id });
      if (used.length !== 1) return null;
      await tx.insert(authSessions).values(authSessionValues(input.session));
      await insertSecurityEvent(tx, input.event);
      return input.session;
    });
  }

  async revokeRecoveryCodeSet(
    userId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean> {
    if (!validAccountSecurityEvent(event) || event.eventType !== 'recovery_codes_revoked') {
      return false;
    }
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const updated = await tx
        .update(recoveryCodeSets)
        .set({ revokedAt: new Date(revokedAt) })
        .where(and(eq(recoveryCodeSets.userId, userId), isNull(recoveryCodeSets.revokedAt)))
        .returning({ id: recoveryCodeSets.id });
      if (updated.length !== 1) return false;
      await insertSecurityEvent(tx, event);
      return true;
    });
  }
}

function challengeValues(record: WebAuthnChallengeRecord) {
  return {
    id: record.id,
    purpose: record.purpose,
    userId: record.userId,
    challengeHash: record.challengeHash,
    rpId: record.rpId,
    origin: record.origin,
    expiresAt: new Date(record.expiresAt),
    consumedAt: null,
    createdAt: new Date(record.createdAt),
  };
}

function passkeyValues(record: PasskeyCredentialRecord) {
  return {
    id: record.id,
    userId: record.userId,
    identityId: record.identityId,
    credentialId: record.credentialId,
    publicKey: Buffer.from(record.publicKey).toString('base64url'),
    counter: record.counter,
    transports: record.transports,
    deviceType: record.deviceType,
    backedUp: record.backedUp,
    aaguid: record.aaguid,
    name: record.name,
    lastUsedAt: record.lastUsedAt ? new Date(record.lastUsedAt) : null,
    createdAt: new Date(record.createdAt),
  };
}

function toWebAuthnChallenge(row: typeof webauthnChallenges.$inferSelect): WebAuthnChallengeRecord {
  return {
    id: row.id,
    purpose: row.purpose as WebAuthnChallengeRecord['purpose'],
    userId: row.userId,
    challengeHash: row.challengeHash,
    rpId: row.rpId,
    origin: row.origin,
    expiresAt: toIsoString(row.expiresAt),
    consumedAt: row.consumedAt ? toIsoString(row.consumedAt) : null,
    createdAt: toIsoString(row.createdAt),
  };
}

function toPasskeyCredential(row: typeof passkeyCredentials.$inferSelect): PasskeyCredentialRecord {
  return {
    id: row.id,
    userId: row.userId,
    identityId: row.identityId,
    credentialId: row.credentialId,
    publicKey: Buffer.from(row.publicKey, 'base64url'),
    counter: row.counter,
    transports: row.transports,
    deviceType: row.deviceType as PasskeyCredentialRecord['deviceType'],
    backedUp: row.backedUp,
    aaguid: row.aaguid,
    name: row.name,
    createdAt: toIsoString(row.createdAt),
    lastUsedAt: row.lastUsedAt ? toIsoString(row.lastUsedAt) : null,
  };
}

async function insertSecurityEvent(
  tx: LodariqTransaction,
  event: AccountSecurityEventRecord,
): Promise<void> {
  await tx.insert(accountSecurityEvents).values({
    id: event.id,
    userId: event.userId,
    actorUserId: event.actorUserId,
    eventType: event.eventType,
    targetId: event.targetId,
    occurredAt: new Date(event.occurredAt),
  });
}
