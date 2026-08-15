import {
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  normalizeWorkspaceEnvironments,
} from '../domains/environments';
import {
  type AuthIdentityRecord,
  type AuthSecurityEventRecord,
  type CompleteIdentityOnboardingInput,
  type ConsumeEmailVerificationChallengeInput,
  type ConsumeSetPasswordChallengeInput,
  type CreateIdentityAccountInput,
  type IdentityOnboardingCompletion,
  type IdentityOnboardingStateRecord,
  type LinkAuthIdentityInput,
  type NormalizedAuthIdentifier,
  type PasswordAuthenticationRecord,
  type PasswordCredentialRecord,
  type RequestEmailVerificationChallengeInput,
  type RegisterIdentityAccountInput,
  type RequestSetPasswordChallengeInput,
  type ResolvedEmailVerificationChallenge,
  type ResolvedSetPasswordChallenge,
  type EmailVerificationChallengeRequestResult,
  type SetPasswordChallengeRequestResult,
  type SetAuthUsernameInput,
  type SetAuthUsernameResult,
  type UsernameRecord,
  type UnlinkAuthIdentityInput,
  type UnlinkAuthIdentityResult,
  type UserRecord,
  isAuthEmailTokenKeyId,
  isValidAuthSessionRecord,
  isValidAuthIdentityRecord,
  isValidIdentityRegistrationInput,
  validateAuthUsername,
} from '../domains/identity';
import {
  clone,
  hashIdentityEmailLookup,
  normalizeIdentityEmail,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryRecoverySnapshots } from './recovery-snapshots';
import { MAX_ACTIVE_WORKSPACES_PER_USER } from '../domains/tenant-administration';

export class InMemoryRepositoryIdentityAccounts extends InMemoryRepositoryRecoverySnapshots {
  protected hasWorkspaceCapacity(userId: string): boolean {
    const activeOwnedWorkspaceCount = [...this.workspaceMemberships.values()].filter(
      (membership) =>
        membership.userId === userId &&
        membership.role === 'owner' &&
        !this.workspaces.get(membership.workspaceId)?.deletedAt,
    ).length;
    return activeOwnedWorkspaceCount < MAX_ACTIVE_WORKSPACES_PER_USER;
  }

  async readDatabaseTime(): Promise<string> {
    return new Date().toISOString();
  }

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

  async findPasswordAuthenticationByIdentifier(
    identifier: NormalizedAuthIdentifier,
    emailLookupHash: string | null,
  ): Promise<PasswordAuthenticationRecord | null> {
    const credential =
      identifier.kind === 'email'
        ? this.passwordCredentials.get(identifier.value)
        : (() => {
            const username = this.usernames.get(identifier.value);
            return username
              ? [...this.passwordCredentials.values()].find(
                  (candidate) => candidate.userId === username.userId,
                )
              : undefined;
          })();
    if (
      !credential ||
      (identifier.kind === 'email' && credential.emailLookupHash !== emailLookupHash)
    ) {
      return null;
    }
    const identity = this.findPasswordIdentity(credential.userId);
    return identity ? { credential: clone(credential), identity: clone(identity) } : null;
  }

  async findPasswordAuthenticationByUserId(
    userId: string,
  ): Promise<PasswordAuthenticationRecord | null> {
    const credential = [...this.passwordCredentials.values()].find(
      (candidate) => candidate.userId === userId,
    );
    const identity = this.findPasswordIdentity(userId);
    return credential && identity
      ? { credential: clone(credential), identity: clone(identity) }
      : null;
  }

  async findAuthIdentityByProviderSubject(
    issuer: string,
    subject: string,
  ): Promise<AuthIdentityRecord | null> {
    const identity = [...this.authIdentities.values()].find(
      (candidate) =>
        candidate.issuer === issuer && candidate.subject === subject && !candidate.disabledAt,
    );
    return identity ? clone(identity) : null;
  }

  async listAuthIdentities(userId: string): Promise<AuthIdentityRecord[]> {
    return [...this.authIdentities.values()]
      .filter((identity) => identity.userId === userId && !identity.disabledAt)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  async createAuthIdentity(identity: AuthIdentityRecord): Promise<boolean> {
    if (
      !this.users.has(identity.userId) ||
      !isValidAuthIdentityRecord(identity) ||
      this.authIdentities.has(identity.id) ||
      [...this.authIdentities.values()].some(
        (candidate) =>
          candidate.issuer === identity.issuer && candidate.subject === identity.subject,
      )
    ) {
      return false;
    }
    this.authIdentities.set(identity.id, clone(identity));
    return true;
  }

  async linkAuthIdentity(input: LinkAuthIdentityInput): Promise<boolean> {
    if (
      input.actorUserId !== input.identity.userId ||
      input.identity.disabledAt ||
      !this.users.has(input.identity.userId) ||
      !isValidAuthIdentityRecord(input.identity) ||
      !Number.isFinite(Date.parse(input.occurredAt)) ||
      !/^authevt_[A-Za-z0-9_-]{20,}$/u.test(input.eventId) ||
      this.authSecurityEvents.has(input.eventId)
    ) {
      return false;
    }
    const existing = [...this.authIdentities.values()].find(
      (identity) =>
        identity.issuer === input.identity.issuer && identity.subject === input.identity.subject,
    );
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
      identityId = existing.id;
      this.authIdentities.set(existing.id, { ...existing, disabledAt: null });
    } else {
      if (this.authIdentities.has(input.identity.id)) return false;
      this.authIdentities.set(input.identity.id, clone(input.identity));
    }
    this.authSecurityEvents.set(input.eventId, {
      id: input.eventId,
      userId: input.identity.userId,
      actorUserId: input.actorUserId,
      eventType: 'identity_linked',
      identityId,
      authorization: input.authorization,
      occurredAt: input.occurredAt,
    });
    return true;
  }

  async unlinkAuthIdentity(input: UnlinkAuthIdentityInput): Promise<UnlinkAuthIdentityResult> {
    if (
      input.actorUserId !== input.userId ||
      !Number.isFinite(Date.parse(input.occurredAt)) ||
      !/^authevt_[A-Za-z0-9_-]{20,}$/u.test(input.eventId) ||
      this.authSecurityEvents.has(input.eventId)
    ) {
      return 'conflict';
    }
    const identities = [...this.authIdentities.values()].filter(
      (identity) => identity.userId === input.userId && !identity.disabledAt,
    );
    const target = identities.find((identity) => identity.id === input.identityId);
    if (!target) return 'not_found';
    const event: AuthSecurityEventRecord = {
      id: input.eventId,
      userId: input.userId,
      actorUserId: input.actorUserId,
      eventType:
        identities.length <= 1 ? 'identity_unlink_rejected_final_method' : 'identity_unlinked',
      identityId: input.identityId,
      authorization: input.authorization,
      occurredAt: input.occurredAt,
    };
    this.authSecurityEvents.set(event.id, event);
    if (identities.length <= 1) return 'final_method';
    this.authIdentities.set(target.id, { ...target, disabledAt: input.occurredAt });
    for (const [credentialId, credential] of this.passkeyCredentials) {
      if (credential.identityId === target.id) this.passkeyCredentials.delete(credentialId);
    }
    for (const [tokenHash, session] of this.identitySessions) {
      if (session.userId === input.userId && session.revokedAt === null) {
        this.identitySessions.set(tokenHash, { ...session, revokedAt: input.occurredAt });
      }
    }
    return 'unlinked';
  }

  async listAuthSecurityEvents(userId: string): Promise<AuthSecurityEventRecord[]> {
    return [...this.authSecurityEvents.values()]
      .filter((event) => event.userId === userId)
      .sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
      )
      .map(clone);
  }

  async getAuthUsername(userId: string): Promise<UsernameRecord | null> {
    const username = [...this.usernames.values()].find((candidate) => candidate.userId === userId);
    return username ? clone(username) : null;
  }

  async setAuthUsername(input: SetAuthUsernameInput): Promise<SetAuthUsernameResult> {
    const validated = validateAuthUsername(input.displayUsername);
    if (
      !validated.valid ||
      validated.normalizedUsername !== input.normalizedUsername ||
      !Number.isFinite(Date.parse(input.changedAt)) ||
      !Number.isFinite(Date.parse(input.minimumPreviousChangeAt)) ||
      input.minimumPreviousChangeAt > input.changedAt
    ) {
      return { status: 'invalid_input' };
    }
    const user = this.users.get(input.userId);
    const credential = [...this.passwordCredentials.values()].find(
      (candidate) => candidate.userId === input.userId,
    );
    if (!user?.emailVerifiedAt || credential?.passwordHash !== input.expectedPasswordHash) {
      return { status: 'credential_changed' };
    }
    const current = [...this.usernames.values()].find(
      (candidate) => candidate.userId === input.userId,
    );
    if (
      current &&
      current.normalizedUsername === input.normalizedUsername &&
      current.displayUsername === input.displayUsername
    ) {
      return { status: 'updated', username: clone(current) };
    }
    if (current && current.updatedAt > input.minimumPreviousChangeAt) {
      return { status: 'rate_limited' };
    }
    const conflict = this.usernames.get(input.normalizedUsername);
    if (conflict && conflict.userId !== input.userId) return { status: 'conflict' };
    if (!current && [...this.usernames.values()].some(({ id }) => id === input.usernameId)) {
      return { status: 'conflict' };
    }
    if (current) this.usernames.delete(current.normalizedUsername);
    const username: UsernameRecord = {
      id: current?.id ?? input.usernameId,
      userId: input.userId,
      normalizedUsername: input.normalizedUsername,
      displayUsername: input.displayUsername,
      createdAt: current?.createdAt ?? input.changedAt,
      updatedAt: input.changedAt,
    };
    this.usernames.set(username.normalizedUsername, username);
    return { status: 'updated', username: clone(username) };
  }

  async getIdentityUser(userId: string): Promise<UserRecord | null> {
    const user = this.users.get(userId);
    return user && !user.deletedAt ? clone(user) : null;
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
      !isAuthEmailTokenKeyId(input.emailVerificationChallenge.keyId) ||
      [...this.emailVerificationChallenges.values()].some(
        (challenge) => challenge.tokenHash === input.emailVerificationChallenge.tokenHash,
      ) ||
      this.authOutbox.has(input.outboxMessage.id) ||
      this.userEmails.has(input.userEmail.normalizedEmail) ||
      this.authIdentities.has(input.passwordIdentity.id) ||
      [...this.authIdentities.values()].some(
        (identity) =>
          identity.issuer === input.passwordIdentity.issuer &&
          identity.subject === input.passwordIdentity.subject,
      ) ||
      input.userEmail.userId !== input.user.id ||
      input.userEmail.normalizedEmail !== input.credential.emailNormalized ||
      !input.userEmail.isPrimary ||
      input.passwordIdentity.userId !== input.user.id ||
      input.passwordIdentity.kind !== 'password' ||
      input.passwordIdentity.issuer !== 'https://lodariq.io' ||
      input.passwordIdentity.providerTenantId !== null ||
      (input.session ? !isValidAuthSessionRecord(input.session) : false) ||
      input.outboxMessage.payload.keyId !== input.emailVerificationChallenge.keyId ||
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
    this.userEmails.set(input.userEmail.normalizedEmail, clone(input.userEmail));
    this.authIdentities.set(input.passwordIdentity.id, clone(input.passwordIdentity));
    this.workspaces.set(input.workspace.id, {
      ...clone(input.workspace),
      deletedAt: null,
      retentionExpiresAt: null,
    });
    this.workspaceAuthPolicies.set(input.workspace.id, {
      workspaceId: input.workspace.id,
      ssoRequired: false,
      minimumAssurance: 'aal1',
      passwordAllowed: true,
      createdAt: input.workspace.createdAt,
      updatedAt: input.workspace.updatedAt,
    });
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

  async registerIdentityAccount(input: RegisterIdentityAccountInput): Promise<boolean> {
    const createdAt = Date.parse(input.onboarding.createdAt);
    if (
      !isValidIdentityRegistrationInput(input) ||
      this.users.has(input.user.id) ||
      [...this.users.values()].some(
        (user) => normalizeIdentityEmail(user.email) === input.credential.emailNormalized,
      ) ||
      this.passwordCredentials.has(input.credential.emailNormalized) ||
      [...this.passwordCredentials.values()].some(
        (credential) => credential.emailLookupHash === input.credential.emailLookupHash,
      ) ||
      this.userEmails.has(input.userEmail.normalizedEmail) ||
      this.authIdentities.has(input.passwordIdentity.id) ||
      this.identityOnboardingStates.has(input.onboarding.id) ||
      [...this.identityOnboardingStates.values()].some(
        (state) =>
          state.userId === input.user.id &&
          (state.status === 'pending_identity' || state.status === 'pending_destination'),
      ) ||
      this.emailVerificationChallenges.has(input.emailVerificationChallenge.id) ||
      this.authOutbox.has(input.outboxMessage.id) ||
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
    this.users.set(input.user.id, clone(input.user));
    this.userEmails.set(input.userEmail.normalizedEmail, clone(input.userEmail));
    this.authIdentities.set(input.passwordIdentity.id, clone(input.passwordIdentity));
    this.passwordCredentials.set(input.credential.emailNormalized, clone(input.credential));
    this.identityOnboardingStates.set(input.onboarding.id, clone(input.onboarding));
    this.emailVerificationChallenges.set(
      input.emailVerificationChallenge.id,
      clone(input.emailVerificationChallenge),
    );
    this.authOutbox.set(input.outboxMessage.id, clone(input.outboxMessage));
    return true;
  }

  async getCurrentIdentityOnboarding(
    userId: string,
  ): Promise<IdentityOnboardingStateRecord | null> {
    const onboarding = [...this.identityOnboardingStates.values()]
      .filter((state) => state.userId === userId)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
      )[0];
    return onboarding ? clone(onboarding) : null;
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
    const onboarding = this.identityOnboardingStates.get(input.onboardingId);
    if (!onboarding || onboarding.userId !== input.userId) return null;
    if (onboarding.status === 'completed' && onboarding.completedWorkspaceId) {
      const workspace = this.workspaces.get(onboarding.completedWorkspaceId);
      return workspace
        ? {
            onboarding: clone(onboarding),
            workspace: {
              id: workspace.id,
              name: workspace.name,
              role: 'owner',
              createdAt: workspace.createdAt,
            },
          }
        : null;
    }
    const user = this.users.get(input.userId);
    if (
      !user?.emailVerifiedAt ||
      onboarding.intent !== 'create_workspace' ||
      (onboarding.status !== 'pending_identity' && onboarding.status !== 'pending_destination') ||
      onboarding.targetWorkspaceId !== input.targetWorkspaceId ||
      !onboarding.targetWorkspaceName ||
      (onboarding.status === 'pending_identity' && onboarding.expiresAt <= input.completedAt) ||
      this.workspaces.has(input.targetWorkspaceId) ||
      input.environments.some((environment) =>
        this.environments.has(this.key(environment.workspaceId, environment.id)),
      ) ||
      !this.hasWorkspaceCapacity(input.userId)
    ) {
      return null;
    }
    const workspace = {
      id: input.targetWorkspaceId,
      name: onboarding.targetWorkspaceName,
      createdAt: input.completedAt,
      updatedAt: input.completedAt,
      deletedAt: null,
      retentionExpiresAt: null,
    };
    this.workspaces.set(workspace.id, workspace);
    this.workspaceAuthPolicies.set(workspace.id, {
      workspaceId: workspace.id,
      ssoRequired: false,
      minimumAssurance: 'aal1',
      passwordAllowed: true,
      createdAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    this.workspaceMemberships.set(this.key(workspace.id, input.userId), {
      workspaceId: workspace.id,
      userId: input.userId,
      role: 'owner',
      createdAt: input.completedAt,
    });
    for (const environment of normalizeWorkspaceEnvironments(input.environments)) {
      this.environments.set(this.key(environment.workspaceId, environment.id), clone(environment));
    }
    const completed: IdentityOnboardingStateRecord = {
      ...onboarding,
      status: 'completed',
      completedWorkspaceId: workspace.id,
      version: onboarding.version + 1,
      updatedAt: input.completedAt,
    };
    this.identityOnboardingStates.set(completed.id, completed);
    return {
      onboarding: clone(completed),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        role: 'owner',
        createdAt: workspace.createdAt,
      },
    };
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
    const emailRecord = this.userEmails.get(emailNormalized);
    if (emailRecord?.userId === user.id) {
      this.userEmails.set(emailNormalized, {
        ...emailRecord,
        verifiedAt: input.usedAt,
        updatedAt: input.usedAt,
      });
    }
    for (const [onboardingId, onboarding] of this.identityOnboardingStates) {
      if (onboarding.userId === user.id && onboarding.status === 'pending_identity') {
        this.identityOnboardingStates.set(onboardingId, {
          ...onboarding,
          status: 'pending_destination',
          version: onboarding.version + 1,
          updatedAt: input.usedAt,
        });
      }
    }
    for (const [tokenHash, session] of this.identitySessions) {
      if (session.userId === user.id && session.revokedAt === null) {
        this.identitySessions.set(tokenHash, { ...session, revokedAt: input.usedAt });
      }
    }
    return clone(verifiedUser);
  }

  private findPasswordIdentity(userId: string): AuthIdentityRecord | null {
    return (
      [...this.authIdentities.values()].find(
        (identity) =>
          identity.userId === userId && identity.kind === 'password' && !identity.disabledAt,
      ) ?? null
    );
  }

  async requestEmailVerificationChallenge(
    input: RequestEmailVerificationChallengeInput,
  ): Promise<EmailVerificationChallengeRequestResult> {
    const nowMs = Date.parse(input.now);
    if (
      !Number.isFinite(nowMs) ||
      !Number.isFinite(input.cooldownMs) ||
      input.cooldownMs < 0 ||
      input.emailNormalized !== normalizeIdentityEmail(input.emailNormalized) ||
      input.challenge.usedAt !== null ||
      !isAuthEmailTokenKeyId(input.challenge.keyId) ||
      input.outboxMessage.type !== 'email_verification' ||
      input.outboxMessage.payload.challengeId !== input.challenge.id ||
      input.outboxMessage.payload.keyId !== input.challenge.keyId ||
      this.emailVerificationChallenges.has(input.challenge.id) ||
      [...this.emailVerificationChallenges.values()].some(
        (challenge) => challenge.tokenHash === input.challenge.tokenHash,
      ) ||
      this.authOutbox.has(input.outboxMessage.id)
    ) {
      return { status: 'invalid_input' };
    }

    const credential = this.passwordCredentials.get(input.emailNormalized);
    if (!credential || credential.emailLookupHash !== input.emailLookupHash) {
      return { status: 'no_match' };
    }
    const user = this.users.get(credential.userId);
    if (!user) return { status: 'no_match' };
    if (user.emailVerifiedAt) return { status: 'already_verified' };

    const activeChallenges = [...this.emailVerificationChallenges.values()].filter(
      (challenge) => challenge.userId === user.id && challenge.usedAt === null,
    );
    const newestCreatedAt = Math.max(
      ...activeChallenges.map((challenge) => Date.parse(challenge.createdAt)),
      Number.NEGATIVE_INFINITY,
    );
    if (newestCreatedAt > nowMs - input.cooldownMs) return { status: 'cooldown' };

    for (const [challengeId, challenge] of this.emailVerificationChallenges) {
      if (challenge.userId === user.id && challenge.usedAt === null) {
        this.emailVerificationChallenges.set(challengeId, { ...challenge, usedAt: input.now });
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
          terminalAt: input.now,
          lastError: 'superseded',
        });
      }
    }
    this.emailVerificationChallenges.set(input.challenge.id, {
      ...clone(input.challenge),
      userId: user.id,
    });
    this.authOutbox.set(input.outboxMessage.id, {
      ...clone(input.outboxMessage),
      userId: user.id,
      recipientEmail: input.emailNormalized,
    });
    return { status: 'queued' };
  }

  async requestSetPasswordChallenge(
    input: RequestSetPasswordChallengeInput,
  ): Promise<SetPasswordChallengeRequestResult> {
    if (
      input.emailNormalized !== normalizeIdentityEmail(input.emailNormalized) ||
      input.challenge.emailNormalized !== input.emailNormalized ||
      input.challenge.emailLookupHash !== input.emailLookupHash ||
      input.challenge.usedAt !== null ||
      !isAuthEmailTokenKeyId(input.challenge.keyId) ||
      input.outboxMessage.type !== 'set_password' ||
      input.outboxMessage.payload.purpose !== 'set_password' ||
      input.outboxMessage.payload.challengeId !== input.challenge.id ||
      input.outboxMessage.payload.keyId !== input.challenge.keyId ||
      this.setPasswordChallenges.has(input.challenge.id) ||
      [...this.setPasswordChallenges.values()].some(
        (challenge) => challenge.tokenHash === input.challenge.tokenHash,
      ) ||
      this.setPasswordOutbox.has(input.outboxMessage.id)
    ) {
      return { status: 'invalid_input' };
    }

    const matchingUsers = [...this.users.values()].filter(
      (user) => normalizeIdentityEmail(user.email) === input.emailNormalized,
    );
    // Legacy identities may contain duplicate normalized addresses. Never pick
    // one arbitrarily: a recovery request for anything but one exact match is a
    // generic no-op at the HTTP boundary.
    if (matchingUsers.length === 0) return { status: 'no_match' };
    if (matchingUsers.length > 1) return { status: 'ambiguous_match' };
    const [user] = matchingUsers;
    if (!user) return { status: 'no_match' };

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
    return { status: 'queued' };
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
    if (
      user?.deletedAt ||
      !user ||
      normalizeIdentityEmail(user.email) !== challenge.emailNormalized
    ) {
      return null;
    }
    const emailRecord = this.userEmails.get(challenge.emailNormalized);
    if (!emailRecord || emailRecord.userId !== user.id || !emailRecord.isPrimary) {
      return null;
    }
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
    if (
      user?.deletedAt ||
      !user ||
      normalizeIdentityEmail(user.email) !== challenge.emailNormalized
    ) {
      return null;
    }
    if (
      input.passwordIdentity.userId !== user.id ||
      input.passwordIdentity.kind !== 'password' ||
      input.passwordIdentity.issuer !== 'https://lodariq.io' ||
      input.passwordIdentity.subject !== `user:${user.id}` ||
      input.passwordIdentity.providerTenantId !== null
    ) {
      return null;
    }
    const existingIdentity = this.findPasswordIdentity(user.id);
    const emailRecord = this.userEmails.get(challenge.emailNormalized);
    const identityConflict = [...this.authIdentities.values()].some(
      (identity) =>
        identity.userId !== user.id &&
        identity.issuer === input.passwordIdentity.issuer &&
        identity.subject === input.passwordIdentity.subject,
    );
    if (
      !emailRecord ||
      emailRecord.userId !== user.id ||
      !emailRecord.isPrimary ||
      (!existingIdentity &&
        (identityConflict || this.authIdentities.has(input.passwordIdentity.id)))
    ) {
      return null;
    }

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
    if (!existingIdentity) {
      this.authIdentities.set(input.passwordIdentity.id, clone(input.passwordIdentity));
    }

    const verifiedUser: UserRecord = {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt ?? input.usedAt,
    };
    this.users.set(user.id, verifiedUser);
    this.userEmails.set(challenge.emailNormalized, {
      ...emailRecord,
      verifiedAt: emailRecord.verifiedAt ?? input.usedAt,
      updatedAt: input.usedAt,
    });

    for (const [onboardingId, onboarding] of this.identityOnboardingStates) {
      if (onboarding.userId === user.id && onboarding.status === 'pending_identity') {
        this.identityOnboardingStates.set(onboardingId, {
          ...onboarding,
          status: 'pending_destination',
          version: onboarding.version + 1,
          updatedAt: input.usedAt,
        });
      }
    }

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
