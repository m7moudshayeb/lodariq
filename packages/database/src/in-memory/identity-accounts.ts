import {
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  normalizeWorkspaceEnvironments,
} from '../domains/environments';
import {
  type ConsumeEmailVerificationChallengeInput,
  type ConsumeSetPasswordChallengeInput,
  type CreateIdentityAccountInput,
  type PasswordCredentialRecord,
  type RequestSetPasswordChallengeInput,
  type ResolvedEmailVerificationChallenge,
  type ResolvedSetPasswordChallenge,
  type UserRecord,
} from '../domains/identity';
import {
  clone,
  hashIdentityEmailLookup,
  normalizeIdentityEmail,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryRecoverySnapshots } from './recovery-snapshots';

export class InMemoryRepositoryIdentityAccounts extends InMemoryRepositoryRecoverySnapshots {
  async checkReadiness(): Promise<void> {
    // Construction is the readiness boundary for this dependency-free adapter.
  }

  async findPasswordCredentialByEmail(
    emailNormalized: string,
    emailLookupHash: string,
  ): Promise<PasswordCredentialRecord | null> {
    const credential = this.passwordCredentials.get(emailNormalized);
    if (!credential || credential.emailLookupHash !== emailLookupHash) return null;
    return clone(credential);
  }

  async getIdentityUser(userId: string): Promise<UserRecord | null> {
    const user = this.users.get(userId);
    return user ? clone(user) : null;
  }

  async createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch (error) {
      if (error instanceof WorkspaceEnvironmentPolicyInvalidError) return false;
      throw error;
    }
    if (
      this.users.has(input.user.id) ||
      [...this.users.values()].some(
        (user) => normalizeIdentityEmail(user.email) === input.credential.emailNormalized,
      ) ||
      this.workspaces.has(input.workspace.id) ||
      this.passwordCredentials.has(input.credential.emailNormalized) ||
      [...this.passwordCredentials.values()].some(
        (credential) => credential.emailLookupHash === input.credential.emailLookupHash,
      ) ||
      (input.session ? this.identitySessions.has(input.session.tokenHash) : false) ||
      this.emailVerificationChallenges.has(input.emailVerificationChallenge.id) ||
      [...this.emailVerificationChallenges.values()].some(
        (challenge) => challenge.tokenHash === input.emailVerificationChallenge.tokenHash,
      ) ||
      this.authOutbox.has(input.outboxMessage.id) ||
      input.membership.userId !== input.user.id ||
      input.membership.workspaceId !== input.workspace.id ||
      (input.session
        ? input.session.userId !== input.user.id ||
          input.session.activeWorkspaceId !== input.workspace.id
        : false) ||
      input.emailVerificationChallenge.userId !== input.user.id ||
      input.outboxMessage.userId !== input.user.id ||
      input.outboxMessage.payload.challengeId !== input.emailVerificationChallenge.id ||
      input.environments.some(
        (environment) =>
          environment.workspaceId !== input.workspace.id ||
          this.environments.has(this.key(environment.workspaceId, environment.id)),
      )
    ) {
      return false;
    }

    this.users.set(input.user.id, clone(input.user));
    this.workspaces.set(input.workspace.id, clone(input.workspace));
    this.passwordCredentials.set(input.credential.emailNormalized, clone(input.credential));
    this.workspaceMemberships.set(
      this.key(input.membership.workspaceId, input.membership.userId),
      clone(input.membership),
    );
    for (const environment of normalizeWorkspaceEnvironments(input.environments)) {
      this.environments.set(this.key(environment.workspaceId, environment.id), clone(environment));
    }
    this.emailVerificationChallenges.set(
      input.emailVerificationChallenge.id,
      clone(input.emailVerificationChallenge),
    );
    this.authOutbox.set(input.outboxMessage.id, clone(input.outboxMessage));
    if (input.session) this.identitySessions.set(input.session.tokenHash, clone(input.session));
    return true;
  }

  async resolveEmailVerificationChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedEmailVerificationChallenge | null> {
    const challenge = this.emailVerificationChallenges.get(challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== tokenHash ||
      challenge.usedAt ||
      challenge.expiresAt <= now
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || user.emailVerifiedAt) return null;
    return {
      userId: user.id,
      emailNormalized: normalizeIdentityEmail(user.email),
    };
  }

  async consumeEmailVerificationChallenge(
    input: ConsumeEmailVerificationChallengeInput,
  ): Promise<UserRecord | null> {
    const challenge = this.emailVerificationChallenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== input.tokenHash ||
      challenge.usedAt ||
      challenge.expiresAt <= input.usedAt
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || user.emailVerifiedAt) return null;
    const emailNormalized = normalizeIdentityEmail(user.email);
    const pendingCredential = [...this.passwordCredentials.values()].find(
      (credential) => credential.userId === user.id,
    );
    if (
      !pendingCredential ||
      pendingCredential.emailNormalized !== emailNormalized ||
      pendingCredential.emailLookupHash !== hashIdentityEmailLookup(emailNormalized)
    ) {
      return null;
    }

    const replacementCredential: PasswordCredentialRecord = {
      ...clone(input.credential),
      userId: user.id,
      emailNormalized,
      emailLookupHash: pendingCredential.emailLookupHash,
      createdAt: pendingCredential.createdAt,
    };
    this.emailVerificationChallenges.set(challenge.id, { ...challenge, usedAt: input.usedAt });
    this.passwordCredentials.set(emailNormalized, replacementCredential);
    const verifiedUser = { ...user, emailVerifiedAt: input.usedAt };
    this.users.set(user.id, verifiedUser);
    for (const [tokenHash, session] of this.identitySessions) {
      if (session.userId === user.id && session.revokedAt === null) {
        this.identitySessions.set(tokenHash, { ...session, revokedAt: input.usedAt });
      }
    }
    return clone(verifiedUser);
  }

  async requestSetPasswordChallenge(input: RequestSetPasswordChallengeInput): Promise<boolean> {
    if (
      input.emailNormalized !== normalizeIdentityEmail(input.emailNormalized) ||
      input.challenge.emailNormalized !== input.emailNormalized ||
      input.challenge.emailLookupHash !== input.emailLookupHash ||
      input.challenge.usedAt !== null ||
      input.outboxMessage.type !== 'set_password' ||
      input.outboxMessage.payload.purpose !== 'set_password' ||
      input.outboxMessage.payload.challengeId !== input.challenge.id ||
      this.setPasswordChallenges.has(input.challenge.id) ||
      [...this.setPasswordChallenges.values()].some(
        (challenge) => challenge.tokenHash === input.challenge.tokenHash,
      ) ||
      this.setPasswordOutbox.has(input.outboxMessage.id)
    ) {
      return false;
    }

    const matchingUsers = [...this.users.values()].filter(
      (user) => normalizeIdentityEmail(user.email) === input.emailNormalized,
    );
    // Legacy identities may contain duplicate normalized addresses. Never pick
    // one arbitrarily: a recovery request for anything but one exact match is a
    // generic no-op at the HTTP boundary.
    if (matchingUsers.length !== 1) return false;
    const [user] = matchingUsers;
    if (!user) return false;

    for (const [messageId, message] of this.setPasswordOutbox) {
      if (
        message.userId === user.id &&
        message.processedAt === null &&
        (message.terminalAt ?? null) === null
      ) {
        this.setPasswordOutbox.set(messageId, {
          ...message,
          terminalAt: input.challenge.createdAt,
          lastError: 'superseded',
        });
      }
    }
    for (const [challengeId, challenge] of this.setPasswordChallenges) {
      if (challenge.userId === user.id && challenge.usedAt === null) {
        this.setPasswordChallenges.set(challengeId, {
          ...challenge,
          usedAt: input.challenge.createdAt,
        });
      }
    }
    this.setPasswordChallenges.set(input.challenge.id, {
      ...clone(input.challenge),
      userId: user.id,
    });
    this.setPasswordOutbox.set(input.outboxMessage.id, {
      ...clone(input.outboxMessage),
      userId: user.id,
      recipientEmail: input.emailNormalized,
    });
    return true;
  }

  async resolveSetPasswordChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedSetPasswordChallenge | null> {
    const challenge = this.setPasswordChallenges.get(challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== tokenHash ||
      challenge.usedAt !== null ||
      Date.parse(challenge.expiresAt) <= Date.parse(now)
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || normalizeIdentityEmail(user.email) !== challenge.emailNormalized) return null;
    return { userId: user.id, emailNormalized: challenge.emailNormalized };
  }

  async consumeSetPasswordChallenge(
    input: ConsumeSetPasswordChallengeInput,
  ): Promise<UserRecord | null> {
    const challenge = this.setPasswordChallenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== input.tokenHash ||
      challenge.usedAt !== null ||
      Date.parse(challenge.expiresAt) <= Date.parse(input.usedAt)
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || normalizeIdentityEmail(user.email) !== challenge.emailNormalized) return null;

    const conflictingCredential = this.passwordCredentials.get(challenge.emailNormalized);
    const conflictingLookup = [...this.passwordCredentials.values()].find(
      (credential) => credential.emailLookupHash === challenge.emailLookupHash,
    );
    if (
      (conflictingCredential && conflictingCredential.userId !== user.id) ||
      (conflictingLookup && conflictingLookup.userId !== user.id)
    ) {
      return null;
    }

    const previousCredential = [...this.passwordCredentials.values()].find(
      (credential) => credential.userId === user.id,
    );
    const nextCredential: PasswordCredentialRecord = {
      ...clone(input.credential),
      userId: user.id,
      emailNormalized: challenge.emailNormalized,
      emailLookupHash: challenge.emailLookupHash,
      createdAt: previousCredential?.createdAt ?? input.credential.createdAt,
    };

    if (previousCredential) {
      this.passwordCredentials.delete(previousCredential.emailNormalized);
    }
    this.passwordCredentials.set(nextCredential.emailNormalized, nextCredential);

    const verifiedUser: UserRecord = {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt ?? input.usedAt,
    };
    this.users.set(user.id, verifiedUser);

    for (const [tokenHash, session] of this.identitySessions) {
      if (session.userId === user.id && session.revokedAt === null) {
        this.identitySessions.set(tokenHash, { ...session, revokedAt: input.usedAt });
      }
    }
    for (const [challengeId, emailChallenge] of this.emailVerificationChallenges) {
      if (emailChallenge.userId === user.id && emailChallenge.usedAt === null) {
        this.emailVerificationChallenges.set(challengeId, {
          ...emailChallenge,
          usedAt: input.usedAt,
        });
      }
    }
    for (const [challengeId, passwordChallenge] of this.setPasswordChallenges) {
      if (passwordChallenge.userId === user.id && passwordChallenge.usedAt === null) {
        this.setPasswordChallenges.set(challengeId, {
          ...passwordChallenge,
          usedAt: input.usedAt,
        });
      }
    }
    for (const [messageId, message] of this.authOutbox) {
      if (
        message.userId === user.id &&
        message.processedAt === null &&
        (message.terminalAt ?? null) === null
      ) {
        this.authOutbox.set(messageId, {
          ...message,
          terminalAt: input.usedAt,
          lastError: 'challenge_consumed',
        });
      }
    }
    for (const [messageId, message] of this.setPasswordOutbox) {
      if (
        message.userId === user.id &&
        message.processedAt === null &&
        (message.terminalAt ?? null) === null
      ) {
        this.setPasswordOutbox.set(messageId, {
          ...message,
          terminalAt: input.usedAt,
          lastError: 'challenge_consumed',
        });
      }
    }
    return clone(verifiedUser);
  }
}
