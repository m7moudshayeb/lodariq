import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  type AuthIdentityRecord,
  type AuthSecurityEventRecord,
  type CompleteIdentityOnboardingInput,
  type NormalizedAuthIdentifier,
  type PasswordAuthenticationRecord,
  type ConsumeEmailVerificationChallengeInput,
  type CreateIdentityAccountInput,
  type IdentityOnboardingCompletion,
  type IdentityOnboardingStateRecord,
  type LinkAuthIdentityInput,
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  type ResolvedEmailVerificationChallenge,
  type PasswordCredentialRecord,
  type RequestEmailVerificationChallengeInput,
  type RegisterIdentityAccountInput,
  type EmailVerificationChallengeRequestResult,
  type SetAuthUsernameInput,
  type SetAuthUsernameResult,
  type UsernameRecord,
  type UnlinkAuthIdentityInput,
  type UnlinkAuthIdentityResult,
  type UserRecord,
  isAuthEmailTokenKeyId,
  isValidAuthIdentityRecord,
  isValidIdentityRegistrationInput,
  isValidAuthSessionRecord,
  validateAuthUsername,
} from '../repository';
import {
  authIdentities,
  authSecurityEvents,
  authSessions,
  authOutbox,
  environments,
  emailVerificationChallenges,
  identityOnboardingStates,
  passwordCredentials,
  passkeyCredentials,
  userEmails,
  usernames,
  users,
  workspaceAuthPolicies,
  workspaces,
  workspaceMemberships,
} from '../schema';
import {
  runWithAuthEmailLookupScope,
  runWithAuthUserScope,
  LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING,
  LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING,
  LODARIQ_AUTH_IDENTIFIER_NORMALIZED_SETTING,
  LODARIQ_AUTH_IDENTITY_ISSUER_SETTING,
  LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING,
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_AUTH_RECOVERY_MUTATION_AT_SETTING,
  LODARIQ_EMAIL_VERIFICATION_HASH_SETTING,
  LODARIQ_EMAIL_VERIFICATION_ID_SETTING,
} from '../scoped-transaction';
import { EmailVerificationAtomicWriteRejected } from './types';
import {
  passwordCredentialValues,
  authSessionValues,
  environmentValues,
  toPasswordCredentialRecord,
  toAuthIdentityRecord,
  toAuthSecurityEventRecord,
  toIdentityOnboardingStateRecord,
  toUsernameRecord,
  toUserRecord,
  isUniqueConstraintViolation,
} from './helpers';
import { DrizzleRepositoryDocumentHelpers } from './document-helpers';
import { MAX_ACTIVE_WORKSPACES_PER_USER } from '../domains/tenant-administration';
import type { LodariqTransaction } from './types';

class IdentityOnboardingCompletionConflict extends Error {}

export class DrizzleRepositoryIdentityAccounts extends DrizzleRepositoryDocumentHelpers {
  protected async lockAndHasWorkspaceCapacity(
    tx: LodariqTransaction,
    userId: string,
  ): Promise<boolean> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`workspace-quota:${userId}`}, 0))`,
    );
    const [row] = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.role, 'owner'),
          isNull(workspaces.deletedAt),
        ),
      );
    return Number(row?.count ?? 0) < MAX_ACTIVE_WORKSPACES_PER_USER;
  }

  async readDatabaseTime(): Promise<string> {
    const result = await this.database.execute<{ database_time: string }>(
      sql`select clock_timestamp()::text as database_time`,
    );
    const row = result.rows[0];
    const parsed = row ? new Date(row.database_time) : null;
    if (!parsed || !Number.isFinite(parsed.getTime())) {
      throw new Error('Database clock returned invalid time');
    }
    return parsed.toISOString();
  }

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

  async findPasswordAuthenticationByIdentifier(
    identifier: NormalizedAuthIdentifier,
    emailLookupHash: string | null,
  ): Promise<PasswordAuthenticationRecord | null> {
    return this.database.transaction(async (tx) => {
      let userId: string | null = null;
      if (identifier.kind === 'email') {
        if (!emailLookupHash) return null;
        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${emailLookupHash}, true)`,
        );
        const [credential] = await tx
          .select({ userId: passwordCredentials.userId })
          .from(passwordCredentials)
          .where(
            and(
              eq(passwordCredentials.emailNormalized, identifier.value),
              eq(passwordCredentials.emailLookupHash, emailLookupHash),
            ),
          )
          .limit(1);
        userId = credential?.userId ?? null;
      } else {
        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_IDENTIFIER_NORMALIZED_SETTING}, ${identifier.value}, true)`,
        );
        const [username] = await tx
          .select({ userId: usernames.userId })
          .from(usernames)
          .where(eq(usernames.normalizedUsername, identifier.value))
          .limit(1);
        userId = username?.userId ?? null;
      }
      if (!userId) return null;
      await tx.execute(sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${userId}, true)`);
      const [credential] = await tx
        .select()
        .from(passwordCredentials)
        .where(eq(passwordCredentials.userId, userId))
        .limit(1);
      const [identity] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.userId, userId),
            eq(authIdentities.kind, 'password'),
            isNull(authIdentities.disabledAt),
          ),
        )
        .limit(1);
      return credential && identity
        ? {
            credential: toPasswordCredentialRecord(credential),
            identity: toAuthIdentityRecord(identity),
          }
        : null;
    });
  }

  async findPasswordAuthenticationByUserId(
    userId: string,
  ): Promise<PasswordAuthenticationRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const [credential] = await tx
        .select()
        .from(passwordCredentials)
        .where(eq(passwordCredentials.userId, userId))
        .limit(1);
      const [identity] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.userId, userId),
            eq(authIdentities.kind, 'password'),
            isNull(authIdentities.disabledAt),
          ),
        )
        .limit(1);
      return credential && identity
        ? {
            credential: toPasswordCredentialRecord(credential),
            identity: toAuthIdentityRecord(identity),
          }
        : null;
    });
  }

  async findAuthIdentityByProviderSubject(
    issuer: string,
    subject: string,
  ): Promise<AuthIdentityRecord | null> {
    if (!issuer.trim() || !subject.trim()) return null;
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select
          set_config(${LODARIQ_AUTH_IDENTITY_ISSUER_SETTING}, ${issuer}, true),
          set_config(${LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING}, ${subject}, true)`,
      );
      const [identity] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.issuer, issuer),
            eq(authIdentities.subject, subject),
            isNull(authIdentities.disabledAt),
          ),
        )
        .limit(1);
      return identity ? toAuthIdentityRecord(identity) : null;
    });
  }

  async listAuthIdentities(userId: string): Promise<AuthIdentityRecord[]> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const identities = await tx
        .select()
        .from(authIdentities)
        .where(and(eq(authIdentities.userId, userId), isNull(authIdentities.disabledAt)))
        .orderBy(asc(authIdentities.createdAt), asc(authIdentities.id));
      return identities.map(toAuthIdentityRecord);
    });
  }

  async createAuthIdentity(identity: AuthIdentityRecord): Promise<boolean> {
    if (!isValidAuthIdentityRecord(identity)) return false;
    try {
      return await runWithAuthUserScope(this.database, identity.userId, async (tx) => {
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, identity.userId))
          .limit(1);
        if (!user) return false;
        const [created] = await tx
          .insert(authIdentities)
          .values({
            id: identity.id,
            userId: identity.userId,
            kind: identity.kind,
            issuer: identity.issuer,
            subject: identity.subject,
            providerTenantId: identity.providerTenantId,
            createdAt: new Date(identity.createdAt),
            lastAuthenticatedAt: identity.lastAuthenticatedAt
              ? new Date(identity.lastAuthenticatedAt)
              : null,
            disabledAt: identity.disabledAt ? new Date(identity.disabledAt) : null,
          })
          .returning({ id: authIdentities.id });
        return Boolean(created);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async linkAuthIdentity(input: LinkAuthIdentityInput): Promise<boolean> {
    if (
      input.actorUserId !== input.identity.userId ||
      input.identity.disabledAt ||
      !isValidAuthIdentityRecord(input.identity) ||
      !Number.isFinite(Date.parse(input.occurredAt))
    ) {
      return false;
    }
    try {
      return await runWithAuthUserScope(this.database, input.identity.userId, async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${'identity-link:' + input.identity.userId}, 0))`,
        );
        const [existing] = await tx
          .select()
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.issuer, input.identity.issuer),
              eq(authIdentities.subject, input.identity.subject),
            ),
          )
          .limit(1)
          .for('update');
        let identityId = input.identity.id;
        if (existing) {
          if (
            !existing.disabledAt ||
            existing.userId !== input.identity.userId ||
            existing.id !== input.identity.id ||
            existing.kind !== input.identity.kind ||
            existing.providerTenantId !== input.identity.providerTenantId
          ) {
            return false;
          }
          const reactivated = await tx
            .update(authIdentities)
            .set({ disabledAt: null })
            .where(
              and(
                eq(authIdentities.id, existing.id),
                eq(authIdentities.userId, input.identity.userId),
              ),
            )
            .returning({ id: authIdentities.id });
          if (reactivated.length !== 1) return false;
          identityId = existing.id;
        } else {
          const inserted = await tx
            .insert(authIdentities)
            .values({
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
            })
            .returning({ id: authIdentities.id });
          if (inserted.length !== 1) return false;
        }
        await tx.insert(authSecurityEvents).values({
          id: input.eventId,
          userId: input.identity.userId,
          actorUserId: input.actorUserId,
          eventType: 'identity_linked',
          identityId,
          authorization: input.authorization,
          occurredAt: new Date(input.occurredAt),
        });
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async unlinkAuthIdentity(input: UnlinkAuthIdentityInput): Promise<UnlinkAuthIdentityResult> {
    if (input.actorUserId !== input.userId || !Number.isFinite(Date.parse(input.occurredAt))) {
      return 'conflict';
    }
    try {
      return await runWithAuthUserScope(this.database, input.userId, async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${'identity-unlink:' + input.userId}, 0))`,
        );
        const identities = await tx
          .select()
          .from(authIdentities)
          .where(and(eq(authIdentities.userId, input.userId), isNull(authIdentities.disabledAt)))
          .orderBy(asc(authIdentities.createdAt), asc(authIdentities.id))
          .for('update');
        const target = identities.find((identity) => identity.id === input.identityId);
        if (!target) return 'not_found';
        const occurredAt = new Date(input.occurredAt);
        if (identities.length <= 1) {
          await tx.insert(authSecurityEvents).values({
            id: input.eventId,
            userId: input.userId,
            actorUserId: input.actorUserId,
            eventType: 'identity_unlink_rejected_final_method',
            identityId: input.identityId,
            authorization: input.authorization,
            occurredAt,
          });
          return 'final_method';
        }
        const disabled = await tx
          .update(authIdentities)
          .set({ disabledAt: occurredAt })
          .where(
            and(
              eq(authIdentities.id, input.identityId),
              eq(authIdentities.userId, input.userId),
              isNull(authIdentities.disabledAt),
            ),
          )
          .returning({ id: authIdentities.id });
        if (disabled.length !== 1) return 'conflict';
        await tx
          .delete(passkeyCredentials)
          .where(eq(passkeyCredentials.identityId, input.identityId));
        await tx
          .update(authSessions)
          .set({ revokedAt: occurredAt })
          .where(and(eq(authSessions.userId, input.userId), isNull(authSessions.revokedAt)));
        await tx.insert(authSecurityEvents).values({
          id: input.eventId,
          userId: input.userId,
          actorUserId: input.actorUserId,
          eventType: 'identity_unlinked',
          identityId: input.identityId,
          authorization: input.authorization,
          occurredAt,
        });
        return 'unlinked';
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return 'conflict';
      throw error;
    }
  }

  async listAuthSecurityEvents(userId: string): Promise<AuthSecurityEventRecord[]> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const events = await tx
        .select()
        .from(authSecurityEvents)
        .where(eq(authSecurityEvents.userId, userId))
        .orderBy(asc(authSecurityEvents.occurredAt), asc(authSecurityEvents.id));
      return events.map(toAuthSecurityEventRecord);
    });
  }

  async getAuthUsername(userId: string): Promise<UsernameRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const [username] = await tx
        .select()
        .from(usernames)
        .where(eq(usernames.userId, userId))
        .limit(1);
      return username ? toUsernameRecord(username) : null;
    });
  }

  async setAuthUsername(input: SetAuthUsernameInput): Promise<SetAuthUsernameResult> {
    const validated = validateAuthUsername(input.displayUsername);
    const changedAt = new Date(input.changedAt);
    const minimumPreviousChangeAt = new Date(input.minimumPreviousChangeAt);
    if (
      !validated.valid ||
      validated.normalizedUsername !== input.normalizedUsername ||
      !Number.isFinite(changedAt.getTime()) ||
      !Number.isFinite(minimumPreviousChangeAt.getTime()) ||
      minimumPreviousChangeAt > changedAt
    ) {
      return { status: 'invalid_input' };
    }
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.userId}, true),
            set_config(${LODARIQ_AUTH_IDENTIFIER_NORMALIZED_SETTING}, ${input.normalizedUsername}, true)`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${'username-user:' + input.userId}, 0))`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${'username-value:' + input.normalizedUsername}, 0))`,
        );
        const [credential] = await tx
          .select({ passwordHash: passwordCredentials.passwordHash })
          .from(passwordCredentials)
          .where(eq(passwordCredentials.userId, input.userId))
          .limit(1);
        const [user] = await tx
          .select({ emailVerifiedAt: users.emailVerifiedAt })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (!user?.emailVerifiedAt || credential?.passwordHash !== input.expectedPasswordHash) {
          return { status: 'credential_changed' as const };
        }
        const [current] = await tx
          .select()
          .from(usernames)
          .where(eq(usernames.userId, input.userId))
          .limit(1);
        if (
          current?.normalizedUsername === input.normalizedUsername &&
          current.displayUsername === input.displayUsername
        ) {
          return { status: 'updated' as const, username: toUsernameRecord(current) };
        }
        if (current && current.updatedAt > minimumPreviousChangeAt) {
          return { status: 'rate_limited' as const };
        }
        const [conflict] = await tx
          .select({ userId: usernames.userId })
          .from(usernames)
          .where(eq(usernames.normalizedUsername, input.normalizedUsername))
          .limit(1);
        if (conflict && conflict.userId !== input.userId) {
          return { status: 'conflict' as const };
        }
        const [saved] = current
          ? await tx
              .update(usernames)
              .set({
                normalizedUsername: input.normalizedUsername,
                displayUsername: input.displayUsername,
                updatedAt: changedAt,
              })
              .where(eq(usernames.userId, input.userId))
              .returning()
          : await tx
              .insert(usernames)
              .values({
                id: input.usernameId,
                userId: input.userId,
                normalizedUsername: input.normalizedUsername,
                displayUsername: input.displayUsername,
                createdAt: changedAt,
                updatedAt: changedAt,
              })
              .returning();
        return saved
          ? { status: 'updated' as const, username: toUsernameRecord(saved) }
          : { status: 'conflict' as const };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async getIdentityUser(userId: string): Promise<UserRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);
      return row ? toUserRecord(row) : null;
    });
  }

  async createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean> {
    if (
      !isAuthEmailTokenKeyId(input.emailVerificationChallenge.keyId) ||
      input.outboxMessage.payload.keyId !== input.emailVerificationChallenge.keyId ||
      input.userEmail.userId !== input.user.id ||
      input.userEmail.normalizedEmail !== input.credential.emailNormalized ||
      !input.userEmail.isPrimary ||
      input.passwordIdentity.userId !== input.user.id ||
      input.passwordIdentity.kind !== 'password' ||
      input.passwordIdentity.issuer !== 'https://lodariq.io' ||
      input.passwordIdentity.providerTenantId !== null ||
      (input.session ? !isValidAuthSessionRecord(input.session) : false) ||
      (input.session?.identityId !== undefined &&
        input.session.identityId !== input.passwordIdentity.id)
    ) {
      return false;
    }
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
        await tx.insert(userEmails).values({
          id: input.userEmail.id,
          userId: input.userEmail.userId,
          normalizedEmail: input.userEmail.normalizedEmail,
          isPrimary: input.userEmail.isPrimary,
          verifiedAt: input.userEmail.verifiedAt ? new Date(input.userEmail.verifiedAt) : null,
          createdAt: new Date(input.userEmail.createdAt),
          updatedAt: new Date(input.userEmail.updatedAt),
        });
        await tx.insert(authIdentities).values({
          id: input.passwordIdentity.id,
          userId: input.passwordIdentity.userId,
          kind: input.passwordIdentity.kind,
          issuer: input.passwordIdentity.issuer,
          subject: input.passwordIdentity.subject,
          providerTenantId: input.passwordIdentity.providerTenantId,
          createdAt: new Date(input.passwordIdentity.createdAt),
          lastAuthenticatedAt: input.passwordIdentity.lastAuthenticatedAt
            ? new Date(input.passwordIdentity.lastAuthenticatedAt)
            : null,
          disabledAt: null,
        });
        await tx.insert(passwordCredentials).values(passwordCredentialValues(input.credential));
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
        await tx.insert(emailVerificationChallenges).values({
          id: input.emailVerificationChallenge.id,
          userId: input.emailVerificationChallenge.userId,
          keyId: input.emailVerificationChallenge.keyId,
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

  async registerIdentityAccount(input: RegisterIdentityAccountInput): Promise<boolean> {
    const createdAt = Date.parse(input.onboarding.createdAt);
    if (
      !isValidIdentityRegistrationInput(input) ||
      !isAuthEmailTokenKeyId(input.emailVerificationChallenge.keyId) ||
      input.outboxMessage.payload.keyId !== input.emailVerificationChallenge.keyId ||
      input.userEmail.userId !== input.user.id ||
      input.userEmail.normalizedEmail !== input.credential.emailNormalized ||
      !input.userEmail.isPrimary ||
      input.passwordIdentity.userId !== input.user.id ||
      input.passwordIdentity.kind !== 'password' ||
      input.passwordIdentity.issuer !== 'https://lodariq.io' ||
      input.passwordIdentity.providerTenantId !== null ||
      input.onboarding.userId !== input.user.id ||
      input.onboarding.intent !== 'create_workspace' ||
      input.onboarding.status !== 'pending_identity' ||
      !input.onboarding.targetWorkspaceId ||
      !input.onboarding.targetWorkspaceName?.trim() ||
      input.onboarding.completedWorkspaceId !== null ||
      !Number.isFinite(createdAt) ||
      Date.parse(input.onboarding.expiresAt) <= createdAt
    ) {
      return false;
    }
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.user.id}, true),
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${input.credential.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${input.credential.emailLookupHash}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${input.emailVerificationChallenge.id}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${input.emailVerificationChallenge.tokenHash}, true)`,
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
          emailVerifiedAt: null,
          createdAt: new Date(input.user.createdAt),
        });
        await tx.insert(userEmails).values({
          id: input.userEmail.id,
          userId: input.userEmail.userId,
          normalizedEmail: input.userEmail.normalizedEmail,
          isPrimary: true,
          verifiedAt: null,
          createdAt: new Date(input.userEmail.createdAt),
          updatedAt: new Date(input.userEmail.updatedAt),
        });
        await tx.insert(authIdentities).values({
          id: input.passwordIdentity.id,
          userId: input.passwordIdentity.userId,
          kind: 'password',
          issuer: input.passwordIdentity.issuer,
          subject: input.passwordIdentity.subject,
          providerTenantId: null,
          createdAt: new Date(input.passwordIdentity.createdAt),
          lastAuthenticatedAt: null,
          disabledAt: null,
        });
        await tx.insert(passwordCredentials).values(passwordCredentialValues(input.credential));
        await tx.insert(identityOnboardingStates).values({
          id: input.onboarding.id,
          userId: input.onboarding.userId,
          intent: input.onboarding.intent,
          status: input.onboarding.status,
          targetWorkspaceId: input.onboarding.targetWorkspaceId,
          targetWorkspaceName: input.onboarding.targetWorkspaceName,
          invitationId: input.onboarding.invitationId,
          requestedWorkspaceId: input.onboarding.requestedWorkspaceId,
          completedWorkspaceId: null,
          version: input.onboarding.version,
          expiresAt: new Date(input.onboarding.expiresAt),
          createdAt: new Date(input.onboarding.createdAt),
          updatedAt: new Date(input.onboarding.updatedAt),
        });
        await tx.insert(emailVerificationChallenges).values({
          id: input.emailVerificationChallenge.id,
          userId: input.emailVerificationChallenge.userId,
          keyId: input.emailVerificationChallenge.keyId,
          tokenHash: input.emailVerificationChallenge.tokenHash,
          expiresAt: new Date(input.emailVerificationChallenge.expiresAt),
          usedAt: null,
          createdAt: new Date(input.emailVerificationChallenge.createdAt),
        });
        await tx.insert(authOutbox).values({
          id: input.outboxMessage.id,
          type: input.outboxMessage.type,
          userId: input.outboxMessage.userId,
          recipientEmail: input.outboxMessage.recipientEmail,
          payload: input.outboxMessage.payload,
          availableAt: new Date(input.outboxMessage.availableAt),
          processedAt: null,
          attempts: input.outboxMessage.attempts,
          leaseVersion: input.outboxMessage.leaseVersion ?? 0,
          lastError: null,
          terminalAt: null,
          createdAt: new Date(input.outboxMessage.createdAt),
        });
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async getCurrentIdentityOnboarding(
    userId: string,
  ): Promise<IdentityOnboardingStateRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const [onboarding] = await tx
        .select()
        .from(identityOnboardingStates)
        .where(eq(identityOnboardingStates.userId, userId))
        .orderBy(desc(identityOnboardingStates.updatedAt), desc(identityOnboardingStates.id))
        .limit(1);
      return onboarding ? toIdentityOnboardingStateRecord(onboarding) : null;
    });
  }

  async completeIdentityOnboarding(
    input: CompleteIdentityOnboardingInput,
  ): Promise<IdentityOnboardingCompletion | null> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.targetWorkspaceId, input.environments);
    } catch (error) {
      if (error instanceof WorkspaceEnvironmentPolicyInvalidError) return null;
      throw error;
    }
    try {
      return await this.database.transaction(async (tx) => {
        const completedAt = new Date(input.completedAt);
        if (!Number.isFinite(completedAt.getTime())) return null;
        await tx.execute(
          sql`select
          set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.userId}, true),
          set_config('lodariq.workspace_id', ${input.targetWorkspaceId}, true)`,
        );
        const [onboarding] = await tx
          .select()
          .from(identityOnboardingStates)
          .where(
            and(
              eq(identityOnboardingStates.id, input.onboardingId),
              eq(identityOnboardingStates.userId, input.userId),
            ),
          )
          .limit(1)
          .for('update');
        if (!onboarding || onboarding.targetWorkspaceId !== input.targetWorkspaceId) return null;
        if (onboarding.status === 'completed' && onboarding.completedWorkspaceId) {
          const [workspace] = await tx
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, onboarding.completedWorkspaceId))
            .limit(1);
          return workspace
            ? {
                onboarding: toIdentityOnboardingStateRecord(onboarding),
                workspace: {
                  id: workspace.id,
                  name: workspace.name,
                  role: 'owner',
                  createdAt: workspace.createdAt.toISOString(),
                },
              }
            : null;
        }
        const [user] = await tx
          .select({ emailVerifiedAt: users.emailVerifiedAt })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (
          !user?.emailVerifiedAt ||
          onboarding.intent !== 'create_workspace' ||
          (onboarding.status !== 'pending_identity' &&
            onboarding.status !== 'pending_destination') ||
          (onboarding.status === 'pending_identity' && onboarding.expiresAt <= completedAt) ||
          !onboarding.targetWorkspaceName
        ) {
          return null;
        }
        if (!(await this.lockAndHasWorkspaceCapacity(tx, input.userId))) return null;
        const [existingWorkspace] = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, input.targetWorkspaceId))
          .limit(1);
        if (existingWorkspace) return null;
        await tx.insert(workspaces).values({
          id: input.targetWorkspaceId,
          name: onboarding.targetWorkspaceName,
          createdAt: completedAt,
          updatedAt: completedAt,
        });
        await tx.insert(workspaceAuthPolicies).values({
          workspaceId: input.targetWorkspaceId,
          ssoRequired: false,
          minimumAssurance: 'aal1',
          passwordAllowed: true,
          createdAt: completedAt,
          updatedAt: completedAt,
        });
        await tx.insert(workspaceMemberships).values({
          workspaceId: input.targetWorkspaceId,
          userId: input.userId,
          role: 'owner',
          createdAt: completedAt,
        });
        await tx.insert(environments).values(input.environments.map(environmentValues));
        const [completed] = await tx
          .update(identityOnboardingStates)
          .set({
            status: 'completed',
            completedWorkspaceId: input.targetWorkspaceId,
            version: onboarding.version + 1,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(identityOnboardingStates.id, onboarding.id),
              eq(identityOnboardingStates.userId, input.userId),
              eq(identityOnboardingStates.status, onboarding.status),
            ),
          )
          .returning();
        if (!completed) throw new IdentityOnboardingCompletionConflict();
        return {
          onboarding: toIdentityOnboardingStateRecord(completed),
          workspace: {
            id: input.targetWorkspaceId,
            name: onboarding.targetWorkspaceName,
            role: 'owner',
            createdAt: input.completedAt,
          },
        };
      });
    } catch (error) {
      if (error instanceof IdentityOnboardingCompletionConflict) return null;
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

        const verifiedEmails = await tx
          .update(userEmails)
          .set({ verifiedAt: usedAt, updatedAt: usedAt })
          .where(
            and(
              eq(userEmails.userId, user.id),
              eq(userEmails.normalizedEmail, emailNormalized),
              eq(userEmails.isPrimary, true),
              isNull(userEmails.verifiedAt),
            ),
          )
          .returning({ id: userEmails.id });
        if (verifiedEmails.length !== 1) throw new EmailVerificationAtomicWriteRejected();

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

  async requestEmailVerificationChallenge(
    input: RequestEmailVerificationChallengeInput,
  ): Promise<EmailVerificationChallengeRequestResult> {
    const now = new Date(input.now);
    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isFinite(input.cooldownMs) ||
      input.cooldownMs < 0 ||
      input.challenge.usedAt !== null ||
      !isAuthEmailTokenKeyId(input.challenge.keyId) ||
      input.outboxMessage.type !== 'email_verification' ||
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
            set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${input.challenge.id}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${input.challenge.tokenHash}, true),
            set_config(${LODARIQ_AUTH_RECOVERY_MUTATION_AT_SETTING}, ${input.now}, true)`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.emailLookupHash}, 0))`,
        );
        const [credential] = await tx
          .select({ userId: passwordCredentials.userId })
          .from(passwordCredentials)
          .where(
            and(
              eq(passwordCredentials.emailNormalized, input.emailNormalized),
              eq(passwordCredentials.emailLookupHash, input.emailLookupHash),
            ),
          )
          .limit(1);
        if (!credential) return { status: 'no_match' as const };

        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${credential.userId}, true)`,
        );
        const [user] = await tx
          .select({ emailVerifiedAt: users.emailVerifiedAt })
          .from(users)
          .where(eq(users.id, credential.userId))
          .limit(1);
        if (!user) return { status: 'no_match' as const };
        if (user.emailVerifiedAt) return { status: 'already_verified' as const };

        const [latestChallenge] = await tx
          .select({ createdAt: emailVerificationChallenges.createdAt })
          .from(emailVerificationChallenges)
          .where(
            and(
              eq(emailVerificationChallenges.userId, credential.userId),
              isNull(emailVerificationChallenges.usedAt),
            ),
          )
          .orderBy(desc(emailVerificationChallenges.createdAt))
          .limit(1)
          .for('update');
        if (
          latestChallenge &&
          latestChallenge.createdAt.getTime() > now.getTime() - input.cooldownMs
        ) {
          return { status: 'cooldown' as const };
        }

        await tx
          .update(emailVerificationChallenges)
          .set({ usedAt: now })
          .where(
            and(
              eq(emailVerificationChallenges.userId, credential.userId),
              isNull(emailVerificationChallenges.usedAt),
            ),
          );
        await tx
          .update(authOutbox)
          .set({ terminalAt: now, lastError: 'superseded' })
          .where(
            and(
              eq(authOutbox.userId, credential.userId),
              isNull(authOutbox.processedAt),
              isNull(authOutbox.terminalAt),
            ),
          );
        await tx.insert(emailVerificationChallenges).values({
          id: input.challenge.id,
          userId: credential.userId,
          keyId: input.challenge.keyId,
          tokenHash: input.challenge.tokenHash,
          expiresAt: new Date(input.challenge.expiresAt),
          usedAt: null,
          createdAt: new Date(input.challenge.createdAt),
        });
        await tx.insert(authOutbox).values({
          id: input.outboxMessage.id,
          type: input.outboxMessage.type,
          userId: credential.userId,
          recipientEmail: input.emailNormalized,
          payload: input.outboxMessage.payload,
          availableAt: new Date(input.outboxMessage.availableAt),
          processedAt: null,
          attempts: input.outboxMessage.attempts,
          leaseVersion: input.outboxMessage.leaseVersion ?? 0,
          lastError: null,
          terminalAt: null,
          createdAt: new Date(input.outboxMessage.createdAt),
        });
        return { status: 'queued' as const };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'persistence_conflict' };
      throw error;
    }
  }
}
