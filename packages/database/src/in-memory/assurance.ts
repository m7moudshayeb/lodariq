import { isValidAuthSessionRecord, type AuthSessionRecord } from '../domains/identity';
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
import type { AccountSecurityEventRecord } from '../domains/account-management';
import type { NormalizedAuthIdentifier } from '../domains/identity';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryAccountManagement } from './account-management';

export class InMemoryRepositoryAssurance extends InMemoryRepositoryAccountManagement {
  async createWebAuthnChallenge(challenge: WebAuthnChallengeRecord): Promise<boolean> {
    if (!validWebAuthnChallenge(challenge) || this.webAuthnChallenges.has(challenge.id)) {
      return false;
    }
    this.webAuthnChallenges.set(challenge.id, clone(challenge));
    return true;
  }

  async getWebAuthnChallenge(
    challengeId: string,
    now: string,
  ): Promise<WebAuthnChallengeRecord | null> {
    const challenge = this.webAuthnChallenges.get(challengeId);
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) return null;
    return clone(challenge);
  }

  async completePasskeyRegistration(input: CompletePasskeyRegistrationInput): Promise<boolean> {
    const challenge = this.webAuthnChallenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.purpose !== 'passkey_registration' ||
      challenge.userId !== input.userId ||
      challenge.challengeHash !== input.challengeHash ||
      challenge.consumedAt !== null ||
      challenge.expiresAt <= input.consumedAt ||
      input.credential.userId !== input.userId ||
      input.identity.userId !== input.userId ||
      input.credential.identityId !== input.identity.id ||
      !validPasskeyCredential(input.credential) ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'passkey_registered' ||
      [...this.passkeyCredentials.values()].some(
        (credential) => credential.credentialId === input.credential.credentialId,
      ) ||
      this.authIdentities.has(input.identity.id)
    ) {
      return false;
    }
    this.webAuthnChallenges.set(challenge.id, { ...challenge, consumedAt: input.consumedAt });
    this.authIdentities.set(input.identity.id, clone(input.identity));
    this.passkeyCredentials.set(input.credential.id, clone(input.credential));
    this.recordEvent(input.event);
    return true;
  }

  async findPasskeyCredential(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    const credential = [...this.passkeyCredentials.values()].find(
      (candidate) => candidate.credentialId === credentialId,
    );
    if (!credential) return null;
    const identity = this.authIdentities.get(credential.identityId);
    const user = this.users.get(credential.userId);
    return identity?.disabledAt || !user || user.deletedAt ? null : clone(credential);
  }

  async listPasskeyCredentials(userId: string): Promise<PasskeyCredentialRecord[]> {
    return [...this.passkeyCredentials.values()]
      .filter((credential) => credential.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async completePasskeyAuthentication(
    input: CompletePasskeyAuthenticationInput,
  ): Promise<AuthSessionRecord | null> {
    const challenge = this.webAuthnChallenges.get(input.challengeId);
    const credentialEntry = [...this.passkeyCredentials.entries()].find(
      ([, candidate]) => candidate.credentialId === input.credentialId,
    );
    const credential = credentialEntry?.[1];
    const counterAdvanced =
      input.expectedCounter === 0
        ? input.nextCounter >= 0
        : input.nextCounter > input.expectedCounter;
    if (
      !challenge ||
      !credentialEntry ||
      !credential ||
      !['passkey_authentication', 'passkey_step_up'].includes(challenge.purpose) ||
      challenge.challengeHash !== input.challengeHash ||
      challenge.consumedAt !== null ||
      challenge.expiresAt <= input.authenticatedAt ||
      (challenge.userId !== null && challenge.userId !== credential.userId) ||
      credential.counter !== input.expectedCounter ||
      !counterAdvanced ||
      input.nextSession.userId !== credential.userId ||
      !isValidAuthSessionRecord(input.nextSession) ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'passkey_authenticated'
    ) {
      return null;
    }
    let currentSessionKey: string | null = null;
    if (input.currentSessionTokenHash) {
      const current = [...this.identitySessions.entries()].find(
        ([, session]) =>
          session.tokenHash === input.currentSessionTokenHash &&
          session.userId === credential.userId &&
          session.revokedAt === null,
      );
      if (!current) return null;
      currentSessionKey = current[0];
    }
    this.webAuthnChallenges.set(challenge.id, {
      ...challenge,
      consumedAt: input.authenticatedAt,
    });
    this.passkeyCredentials.set(credentialEntry[0], {
      ...credential,
      counter: input.nextCounter,
      lastUsedAt: input.authenticatedAt,
    });
    const identity = this.authIdentities.get(credential.identityId);
    if (identity) {
      this.authIdentities.set(identity.id, {
        ...identity,
        lastAuthenticatedAt: input.authenticatedAt,
      });
    }
    if (currentSessionKey) {
      const current = this.identitySessions.get(currentSessionKey)!;
      this.identitySessions.set(currentSessionKey, {
        ...current,
        revokedAt: input.authenticatedAt,
      });
    }
    this.identitySessions.set(input.nextSession.tokenHash, clone(input.nextSession));
    this.recordEvent(input.event);
    return clone(input.nextSession);
  }

  async findIdentityUserByIdentifier(
    identifier: NormalizedAuthIdentifier,
    emailLookupHash: string | null,
  ): Promise<{ id: string } | null> {
    let userId: string | undefined;
    if (identifier.kind === 'email' && emailLookupHash) {
      userId = [...this.passwordCredentials.values()].find(
        (credential) => credential.emailLookupHash === emailLookupHash,
      )?.userId;
      userId ??= [...this.userEmails.values()].find(
        (email) => email.normalizedEmail === identifier.value && email.verifiedAt,
      )?.userId;
    } else if (identifier.kind === 'username') {
      userId = [...this.usernames.values()].find(
        (username) => username.normalizedUsername === identifier.value,
      )?.userId;
    }
    if (!userId) return null;
    const user = this.users.get(userId);
    return user?.emailVerifiedAt && !user.deletedAt ? { id: user.id } : null;
  }

  async createRecoveryCodeSet(input: CreateRecoveryCodeSetInput): Promise<boolean> {
    if (
      !/^recoveryset_[A-Za-z0-9_-]{20,}$/u.test(input.set.id) ||
      input.codes.length !== 10 ||
      input.codes.some(
        (code) =>
          code.userId !== input.set.userId ||
          code.setId !== input.set.id ||
          !/^recoverycode_[A-Za-z0-9_-]{20,}$/u.test(code.id) ||
          !/^[0-9a-f]{64}$/u.test(code.codeHash),
      ) ||
      new Set(input.codes.map(({ codeHash }) => codeHash)).size !== input.codes.length ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'recovery_codes_generated'
    ) {
      return false;
    }
    for (const [key, set] of this.recoveryCodeSets) {
      if (set.userId === input.set.userId && set.revokedAt === null) {
        this.recoveryCodeSets.set(key, { ...set, revokedAt: input.set.createdAt });
      }
    }
    this.recoveryCodeSets.set(input.set.id, clone(input.set));
    for (const code of input.codes) this.recoveryCodes.set(code.id, clone(code));
    this.recordEvent(input.event);
    return true;
  }

  async getRecoveryCodeStatus(userId: string): Promise<RecoveryCodeStatusRecord | null> {
    const set = [...this.recoveryCodeSets.values()]
      .filter((candidate) => candidate.userId === userId && candidate.revokedAt === null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!set) return null;
    return {
      setId: set.id,
      confirmed: set.confirmedAt !== null,
      remaining: [...this.recoveryCodes.values()].filter(
        (code) => code.setId === set.id && code.usedAt === null,
      ).length,
      createdAt: set.createdAt,
    };
  }

  async confirmRecoveryCodeSet(
    userId: string,
    setId: string,
    codeHash: string,
    confirmedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean> {
    const set = this.recoveryCodeSets.get(setId);
    const code = [...this.recoveryCodes.values()].find(
      (candidate) => candidate.setId === setId && candidate.codeHash === codeHash,
    );
    if (
      !set ||
      !code ||
      set.userId !== userId ||
      set.confirmedAt !== null ||
      set.revokedAt !== null ||
      !validAccountSecurityEvent(event) ||
      event.eventType !== 'recovery_codes_confirmed'
    ) {
      return false;
    }
    this.recoveryCodeSets.set(set.id, { ...set, confirmedAt });
    this.recordEvent(event);
    return true;
  }

  async consumeRecoveryCode(
    input: ConsumeRecoveryCodeInput,
  ): Promise<AuthSessionRecord | null> {
    const codeEntry = [...this.recoveryCodes.entries()].find(
      ([, code]) =>
        code.userId === input.userId && code.codeHash === input.codeHash && code.usedAt === null,
    );
    const set = codeEntry ? this.recoveryCodeSets.get(codeEntry[1].setId) : null;
    if (
      !codeEntry ||
      !set ||
      !set.confirmedAt ||
      set.revokedAt ||
      input.session.userId !== input.userId ||
      !isValidAuthSessionRecord(input.session) ||
      !validAccountSecurityEvent(input.event) ||
      input.event.eventType !== 'recovery_code_used'
    ) {
      return null;
    }
    this.recoveryCodes.set(codeEntry[0], { ...codeEntry[1], usedAt: input.usedAt });
    this.identitySessions.set(input.session.tokenHash, clone(input.session));
    this.recordEvent(input.event);
    return clone(input.session);
  }

  async revokeRecoveryCodeSet(
    userId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean> {
    const setEntry = [...this.recoveryCodeSets.entries()].find(
      ([, set]) => set.userId === userId && set.revokedAt === null,
    );
    if (
      !setEntry ||
      !validAccountSecurityEvent(event) ||
      event.eventType !== 'recovery_codes_revoked'
    ) {
      return false;
    }
    this.recoveryCodeSets.set(setEntry[0], { ...setEntry[1], revokedAt });
    this.recordEvent(event);
    return true;
  }

  private recordEvent(event: AccountSecurityEventRecord): void {
    this.accountSecurityEvents.set(event.id, clone(event));
  }
}
