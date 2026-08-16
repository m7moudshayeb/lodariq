import type {
  AccountEmailChangeRecord,
  AccountExportRecord,
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
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryTenantAdministration } from './tenant-administration';

export class InMemoryRepositoryAccountManagement extends InMemoryRepositoryTenantAdministration {
  async listAccountSessions(userId: string, now: string): Promise<AccountSessionRecord[]> {
    return [...this.identitySessions.values()]
      .filter(
        (session) =>
          session.userId === userId &&
          session.revokedAt === null &&
          session.idleExpiresAt > now &&
          session.absoluteExpiresAt > now,
      )
      .sort(
        (left, right) =>
          right.lastSeenAt.localeCompare(left.lastSeenAt) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .map((session) => ({
        id: session.id,
        userId: session.userId,
        deviceLabel: session.deviceLabel ?? 'Unknown device',
        authenticationMethod: session.authenticationMethod,
        assuranceLevel: session.assuranceLevel,
        durationPolicy: session.durationPolicy,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
      }));
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
    const entry = [...this.identitySessions.entries()].find(
      ([, session]) =>
        session.userId === userId && session.id === sessionId && session.revokedAt === null,
    );
    if (!entry) return false;
    this.identitySessions.set(entry[0], { ...entry[1], revokedAt });
    this.appendAccountSecurityEvent(event);
    return true;
  }

  async revokeAllAccountSessions(
    userId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<number> {
    if (!validAccountSecurityEvent(event) || event.eventType !== 'sessions_revoked_all') return 0;
    let revoked = 0;
    for (const [key, session] of this.identitySessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.identitySessions.set(key, { ...session, revokedAt });
        revoked += 1;
      }
    }
    this.appendAccountSecurityEvent(event);
    return revoked;
  }

  async changeAccountPassword(
    input: ChangeAccountPasswordInput,
  ): Promise<ChangeAccountPasswordResult> {
    const credentialEntry = [...this.passwordCredentials.entries()].find(
      ([, credential]) => credential.userId === input.userId,
    );
    if (
      !credentialEntry ||
      input.nextSession.userId !== input.userId ||
      input.nextSession.revokedAt !== null
    ) {
      return { status: 'invalid_input' };
    }
    if (credentialEntry[1].passwordHash !== input.expectedPasswordHash) {
      return { status: 'credential_changed' };
    }
    this.passwordCredentials.set(credentialEntry[0], {
      ...credentialEntry[1],
      ...clone(input.credential),
    });
    for (const [key, challenge] of this.setPasswordChallenges) {
      if (challenge.userId === input.userId && challenge.usedAt === null) {
        this.setPasswordChallenges.set(key, { ...challenge, usedAt: input.changedAt });
      }
    }
    for (const [key, challenge] of this.accountEmailChangeChallenges) {
      if (
        challenge.userId === input.userId &&
        challenge.consumedAt === null &&
        challenge.revokedAt === null
      ) {
        this.accountEmailChangeChallenges.set(key, {
          ...challenge,
          revokedAt: input.changedAt,
        });
      }
    }
    for (const [key, message] of this.accountEmailChangeOutbox) {
      if (
        message.userId === input.userId &&
        message.processedAt === null &&
        message.terminalAt === null
      ) {
        this.accountEmailChangeOutbox.set(key, {
          ...message,
          terminalAt: input.changedAt,
          lastError: 'credential_changed',
        });
      }
    }
    for (const [key, message] of this.setPasswordOutbox) {
      if (
        message.userId === input.userId &&
        message.processedAt === null &&
        message.terminalAt === null
      ) {
        this.setPasswordOutbox.set(key, {
          ...message,
          terminalAt: input.changedAt,
          lastError: 'credential_changed',
        });
      }
    }
    for (const [key, session] of this.identitySessions) {
      if (session.userId === input.userId && session.revokedAt === null) {
        this.identitySessions.set(key, { ...session, revokedAt: input.changedAt });
      }
    }
    for (const [key, set] of this.recoveryCodeSets) {
      if (set.userId === input.userId && set.revokedAt === null) {
        this.recoveryCodeSets.set(key, { ...set, revokedAt: input.changedAt });
      }
    }
    this.identitySessions.set(input.nextSession.tokenHash, clone(input.nextSession));
    this.appendAccountSecurityEvent({
      id: input.eventId,
      userId: input.userId,
      actorUserId: input.userId,
      eventType: 'password_changed',
      targetId: input.nextSession.id,
      occurredAt: input.changedAt,
    });
    return { status: 'changed', session: clone(input.nextSession) };
  }

  async getAccountEmailChange(
    userId: string,
    now: string,
  ): Promise<AccountEmailChangeRecord | null> {
    const change = [...this.accountEmailChangeChallenges.values()]
      .filter(
        (candidate) =>
          candidate.userId === userId &&
          candidate.consumedAt === null &&
          candidate.revokedAt === null &&
          candidate.expiresAt > now,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return change ? clone(change) : null;
  }

  async beginAccountEmailChange(
    input: BeginAccountEmailChangeInput,
  ): Promise<BeginAccountEmailChangeResult> {
    if (!validAccountEmailChange(input.challenge) || !validAccountSecurityEvent(input.event)) {
      return { status: 'invalid_input' };
    }
    const credential = [...this.passwordCredentials.values()].find(
      (candidate) => candidate.userId === input.challenge.userId,
    );
    if (credential?.passwordHash !== input.expectedPasswordHash) {
      return { status: 'credential_changed' };
    }
    if (this.userEmails.has(input.challenge.newEmailNormalized)) {
      return { status: 'email_conflict' };
    }
    for (const [key, challenge] of this.accountEmailChangeChallenges) {
      if (
        challenge.userId === input.challenge.userId &&
        challenge.consumedAt === null &&
        challenge.revokedAt === null
      ) {
        this.accountEmailChangeChallenges.set(key, {
          ...challenge,
          revokedAt: input.challenge.createdAt,
        });
      }
    }
    for (const [key, message] of this.accountEmailChangeOutbox) {
      if (
        message.userId === input.challenge.userId &&
        message.processedAt === null &&
        message.terminalAt === null
      ) {
        this.accountEmailChangeOutbox.set(key, {
          ...message,
          terminalAt: input.challenge.createdAt,
          lastError: 'superseded',
        });
      }
    }
    this.accountEmailChangeChallenges.set(input.challenge.id, clone(input.challenge));
    for (const message of input.outbox) {
      this.accountEmailChangeOutbox.set(message.id, clone(message));
    }
    this.appendAccountSecurityEvent(input.event);
    return { status: 'queued', challenge: clone(input.challenge) };
  }

  async verifyAccountEmailChange(
    input: VerifyAccountEmailChangeInput,
  ): Promise<VerifyAccountEmailChangeResult> {
    const change = this.accountEmailChangeChallenges.get(input.challengeId);
    if (
      !change ||
      change.userId !== input.userId ||
      change.consumedAt !== null ||
      change.revokedAt !== null ||
      change.expiresAt <= input.verifiedAt ||
      (input.proof === 'current_email' ? change.currentTokenHash : change.newTokenHash) !==
        input.tokenHash ||
      (input.proof === 'current_email'
        ? change.currentVerifiedAt !== null
        : change.newVerifiedAt !== null)
    ) {
      return { status: 'invalid_or_expired' };
    }
    const next: AccountEmailChangeRecord = {
      ...change,
      currentVerifiedAt:
        input.proof === 'current_email' ? input.verifiedAt : change.currentVerifiedAt,
      newVerifiedAt: input.proof === 'new_email' ? input.verifiedAt : change.newVerifiedAt,
    };
    this.appendAccountSecurityEvent({
      id: input.eventId,
      userId: input.userId,
      actorUserId: input.userId,
      eventType:
        input.proof === 'current_email'
          ? 'email_change_current_verified'
          : 'email_change_new_verified',
      targetId: change.id,
      occurredAt: input.verifiedAt,
    });
    if (!next.currentVerifiedAt || !next.newVerifiedAt) {
      this.accountEmailChangeChallenges.set(next.id, next);
      return { status: 'proof_recorded', challenge: clone(next) };
    }
    if (this.userEmails.has(next.newEmailNormalized)) return { status: 'email_conflict' };
    const currentEmail = this.userEmails.get(next.currentEmailNormalized);
    const user = this.users.get(input.userId);
    const credential = this.passwordCredentials.get(next.currentEmailNormalized);
    if (!currentEmail || !user || !credential) return { status: 'invalid_or_expired' };
    this.userEmails.delete(next.currentEmailNormalized);
    this.userEmails.set(next.newEmailNormalized, {
      ...currentEmail,
      normalizedEmail: next.newEmailNormalized,
      verifiedAt: input.verifiedAt,
      updatedAt: input.verifiedAt,
    });
    this.users.set(input.userId, {
      ...user,
      email: next.newEmailNormalized,
      emailVerifiedAt: input.verifiedAt,
    });
    this.passwordCredentials.delete(next.currentEmailNormalized);
    this.passwordCredentials.set(next.newEmailNormalized, {
      ...credential,
      emailNormalized: next.newEmailNormalized,
      emailLookupHash: next.newEmailLookupHash,
      updatedAt: input.verifiedAt,
    });
    for (const [key, challenge] of this.setPasswordChallenges) {
      if (challenge.userId === input.userId && challenge.usedAt === null) {
        this.setPasswordChallenges.set(key, { ...challenge, usedAt: input.verifiedAt });
      }
    }
    for (const [key, message] of this.setPasswordOutbox) {
      if (
        message.userId === input.userId &&
        message.processedAt === null &&
        message.terminalAt === null
      ) {
        this.setPasswordOutbox.set(key, {
          ...message,
          terminalAt: input.verifiedAt,
          lastError: 'email_changed',
        });
      }
    }
    for (const [key, message] of this.accountEmailChangeOutbox) {
      if (
        message.challengeId === next.id &&
        message.processedAt === null &&
        message.terminalAt === null
      ) {
        this.accountEmailChangeOutbox.set(key, {
          ...message,
          terminalAt: input.verifiedAt,
          lastError: 'email_changed',
        });
      }
    }
    for (const [key, session] of this.identitySessions) {
      if (
        session.userId === input.userId &&
        session.id !== input.currentSessionId &&
        session.revokedAt === null
      ) {
        this.identitySessions.set(key, { ...session, revokedAt: input.verifiedAt });
      }
    }
    this.accountEmailChangeChallenges.set(next.id, { ...next, consumedAt: input.verifiedAt });
    this.appendAccountSecurityEvent({
      id: input.completionEventId,
      userId: input.userId,
      actorUserId: input.userId,
      eventType: 'email_changed',
      targetId: change.id,
      occurredAt: input.verifiedAt,
    });
    return { status: 'completed', email: next.newEmailNormalized };
  }

  async scheduleAccountDeletion(
    input: ScheduleAccountDeletionInput,
  ): Promise<ScheduleAccountDeletionResult> {
    const user = this.users.get(input.userId);
    const credential = [...this.passwordCredentials.values()].find(
      (candidate) => candidate.userId === input.userId,
    );
    if (!user || user.deletedAt) return { status: 'conflict' };
    if (credential?.passwordHash !== input.expectedPasswordHash) {
      return { status: 'credential_changed' };
    }
    const ownsFinalWorkspace = [...this.workspaceMemberships.values()].some(
      (membership) =>
        membership.userId === input.userId &&
        membership.role === 'owner' &&
        ![...this.workspaceMemberships.values()].some(
          (other) =>
            other.workspaceId === membership.workspaceId &&
            other.userId !== input.userId &&
            other.role === 'owner',
        ),
    );
    if (ownsFinalWorkspace) return { status: 'final_owner' };
    this.users.set(input.userId, {
      ...user,
      deletedAt: input.deletedAt,
      retentionExpiresAt: input.retentionExpiresAt,
    });
    for (const [key, session] of this.identitySessions) {
      if (session.userId === input.userId && session.revokedAt === null) {
        this.identitySessions.set(key, { ...session, revokedAt: input.deletedAt });
      }
    }
    for (const [key, challenge] of this.setPasswordChallenges) {
      if (challenge.userId === input.userId && challenge.usedAt === null) {
        this.setPasswordChallenges.set(key, { ...challenge, usedAt: input.deletedAt });
      }
    }
    for (const [key, message] of this.setPasswordOutbox) {
      if (
        message.userId === input.userId &&
        message.processedAt === null &&
        message.terminalAt === null
      ) {
        this.setPasswordOutbox.set(key, {
          ...message,
          terminalAt: input.deletedAt,
          lastError: 'account_deleted',
        });
      }
    }
    for (const [key, challenge] of this.accountEmailChangeChallenges) {
      if (
        challenge.userId === input.userId &&
        challenge.consumedAt === null &&
        challenge.revokedAt === null
      ) {
        this.accountEmailChangeChallenges.set(key, { ...challenge, revokedAt: input.deletedAt });
      }
    }
    for (const [key, message] of this.accountEmailChangeOutbox) {
      if (
        message.userId === input.userId &&
        message.processedAt === null &&
        message.terminalAt === null
      ) {
        this.accountEmailChangeOutbox.set(key, {
          ...message,
          terminalAt: input.deletedAt,
          lastError: 'account_deleted',
        });
      }
    }
    for (const [key, grant] of this.authoringActivationGrants) {
      if (grant.creatorId === input.userId && !grant.revokedAt) {
        this.authoringActivationGrants.set(key, { ...grant, revokedAt: input.deletedAt });
      }
    }
    for (const [key, session] of this.authoringSessions) {
      if (session.createdByUserId === input.userId && !session.revokedAt) {
        this.authoringSessions.set(key, { ...session, revokedAt: input.deletedAt });
      }
    }
    this.appendAccountSecurityEvent(input.event);
    return {
      status: 'scheduled',
      deletion: {
        deletedAt: input.deletedAt,
        retentionExpiresAt: input.retentionExpiresAt,
      },
    };
  }

  async exportAccount(userId: string): Promise<AccountExportRecord | null> {
    const user = this.users.get(userId);
    if (!user || user.deletedAt) return null;
    const username = [...this.usernames.values()].find((candidate) => candidate.userId === userId);
    return {
      profile: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        username: username?.displayUsername ?? null,
      },
      emails: [...this.userEmails.values()]
        .filter((email) => email.userId === userId)
        .map(toEmailExport),
      identities: [...this.authIdentities.values()]
        .filter((identity) => identity.userId === userId)
        .map(toIdentitySummary),
      workspaces: (await this.listIdentityWorkspaces(userId)).map(({ id, name, role }) => ({
        id,
        name,
        role,
      })),
    };
  }

  async listAccountSecurityEvents(userId: string): Promise<AccountSecurityEventRecord[]> {
    return [...this.accountSecurityEvents.values()]
      .filter((event) => event.userId === userId)
      .sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
      )
      .map(clone);
  }

  private appendAccountSecurityEvent(event: AccountSecurityEventRecord): void {
    if (!validAccountSecurityEvent(event) || this.accountSecurityEvents.has(event.id)) {
      throw new Error('Account security event is invalid or already exists');
    }
    this.accountSecurityEvents.set(event.id, clone(event));
  }
}
