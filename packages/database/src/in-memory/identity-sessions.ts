import {
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  normalizeWorkspaceEnvironments,
} from '../domains/environments';
import {
  type AcknowledgeAuthEmailRowInput,
  type AuthOutboxRecord,
  type AuthDeliveryStatusRecord,
  type AuthEmailPurpose,
  type AuthLifecycleCleanupInput,
  type AuthLifecycleCleanupResult,
  type AuthRateLimitResult,
  type AuthSessionRecord,
  type ClaimDueAuthEmailRowsInput,
  type ClaimedAuthEmailOutboxRow,
  type ConsumeAuthRateLimitInput,
  type CreateCredentialBoundAuthSessionInput,
  type CreateIdentityWorkspaceInput,
  type IdentityWorkspaceRecord,
  type RetryAuthEmailRowInput,
  type RotateAuthSessionInput,
  type SetPasswordOutboxRecord,
  type WorkspaceInvitationOutboxRecord,
  type WorkspaceMembershipRecord,
  type WorkspaceAuthPolicyRecord,
  isValidAuthSessionRecord,
  normalizeAuthEmailClaimInput,
  sanitizeAuthEmailFailureCode,
  normalizeAuthLifecycleCleanupInput,
} from '../domains/identity';
import {
  clone,
  compareInMemoryAuthEmailRows,
  identityWorkspaceRole,
  isCurrentAuthEmailLease,
  isValidAuthEmailLeaseMutation,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryIdentityAccounts } from './identity-accounts';
import type { AccountEmailChangeOutboxRecord } from '../domains/account-management';

export class InMemoryRepositoryIdentitySessions extends InMemoryRepositoryIdentityAccounts {
  async cleanupAuthLifecycle(
    input: AuthLifecycleCleanupInput,
  ): Promise<AuthLifecycleCleanupResult> {
    const normalized = normalizeAuthLifecycleCleanupInput(input);
    if (!normalized) throw new Error('Invalid auth lifecycle cleanup input');

    const verificationChallenges = deleteOldestMatching(
      this.emailVerificationChallenges,
      normalized.limit,
      (record) =>
        record.expiresAt < normalized.challengeBefore ||
        (record.usedAt !== null && record.usedAt < normalized.challengeBefore),
      (record) => record.createdAt,
    );
    const setPasswordChallenges = deleteOldestMatching(
      this.setPasswordChallenges,
      normalized.limit,
      (record) =>
        record.expiresAt < normalized.challengeBefore ||
        (record.usedAt !== null && record.usedAt < normalized.challengeBefore),
      (record) => record.createdAt,
    );
    const sessions = deleteOldestMatching(
      this.identitySessions,
      normalized.limit,
      (record) =>
        record.idleExpiresAt < normalized.sessionBefore ||
        record.absoluteExpiresAt < normalized.sessionBefore ||
        (record.revokedAt !== null && record.revokedAt < normalized.sessionBefore),
      (record) => record.createdAt,
    );
    const verificationOutboxRows = deleteOldestMatching(
      this.authOutbox,
      normalized.limit,
      (record) => isRetainedOutboxExpired(record, normalized.outboxBefore),
      (record) => record.createdAt,
    );
    const setPasswordOutboxRows = deleteOldestMatching(
      this.setPasswordOutbox,
      normalized.limit,
      (record) => isRetainedOutboxExpired(record, normalized.outboxBefore),
      (record) => record.createdAt,
    );
    const workspaceInvitationOutboxRows = deleteOldestMatching(
      this.workspaceInvitationOutbox,
      normalized.limit,
      (record) => isRetainedOutboxExpired(record, normalized.outboxBefore),
      (record) => record.createdAt,
    );
    const accountEmailChangeChallenges = deleteOldestMatching(
      this.accountEmailChangeChallenges,
      normalized.limit,
      (record) =>
        record.expiresAt < normalized.challengeBefore ||
        (record.consumedAt !== null && record.consumedAt < normalized.challengeBefore) ||
        (record.revokedAt !== null && record.revokedAt < normalized.challengeBefore),
      (record) => record.createdAt,
    );
    const accountEmailChangeOutboxRows = deleteOldestMatching(
      this.accountEmailChangeOutbox,
      normalized.limit,
      (record) => isRetainedOutboxExpired(record, normalized.outboxBefore),
      (record) => record.createdAt,
    );
    const rateLimitBuckets = deleteOldestMatching(
      this.authRateLimits,
      normalized.limit,
      (record) => (record.blockedUntil ?? record.windowStartedAt) < normalized.rateLimitBefore,
      (record) => record.windowStartedAt,
    );

    const abandonedUserIds = [...this.users.values()]
      .filter((user) => {
        if (user.emailVerifiedAt || user.createdAt >= normalized.abandonedUnverifiedBefore) {
          return false;
        }
        const hasLiveSession = [...this.identitySessions.values()].some(
          (session) =>
            session.userId === user.id &&
            session.revokedAt === null &&
            session.idleExpiresAt > normalized.now &&
            session.absoluteExpiresAt > normalized.now,
        );
        if (hasLiveSession) return false;
        const memberships = [...this.workspaceMemberships.values()].filter(
          (membership) => membership.userId === user.id,
        );
        return memberships.every((membership) =>
          this.isDisposableSignupWorkspace(membership.workspaceId, user.id, normalized.now),
        );
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, normalized.limit)
      .map(({ id }) => id);

    const emptyWorkspaceIds = new Set<string>();
    for (const membership of this.workspaceMemberships.values()) {
      if (abandonedUserIds.includes(membership.userId)) {
        emptyWorkspaceIds.add(membership.workspaceId);
      }
    }
    for (const workspaceId of emptyWorkspaceIds) this.deleteDisposableWorkspace(workspaceId);
    for (const userId of abandonedUserIds) this.deleteAbandonedUser(userId);

    const deletedAccountIds = [...this.users.values()]
      .filter(
        (user) =>
          user.deletedAt !== null &&
          user.deletedAt !== undefined &&
          user.retentionExpiresAt !== null &&
          user.retentionExpiresAt !== undefined &&
          user.retentionExpiresAt < normalized.now,
      )
      .sort((left, right) =>
        (left.retentionExpiresAt ?? '').localeCompare(right.retentionExpiresAt ?? ''),
      )
      .slice(0, normalized.limit)
      .map(({ id }) => id);
    for (const userId of deletedAccountIds) this.deleteAbandonedUser(userId);

    return {
      deletedAccounts: deletedAccountIds.length,
      abandonedUsers: abandonedUserIds.length,
      emptyWorkspaces: emptyWorkspaceIds.size,
      verificationChallenges,
      setPasswordChallenges,
      sessions,
      rateLimitBuckets,
      verificationOutboxRows,
      setPasswordOutboxRows,
      workspaceInvitationOutboxRows,
      accountEmailChangeChallenges,
      accountEmailChangeOutboxRows,
    };
  }

  private isDisposableSignupWorkspace(workspaceId: string, userId: string, now: string): boolean {
    const hasOtherMember = [...this.workspaceMemberships.values()].some(
      (membership) => membership.workspaceId === workspaceId && membership.userId !== userId,
    );
    if (hasOtherMember) return false;
    const hasDocument = [...this.documents.values()].some(
      (record) => record.document.workspaceId === workspaceId,
    );
    const hasInstallation = [...this.publicSdkInstallations.values()].some(
      (record) => record.workspaceId === workspaceId,
    );
    const hasTheme = [...this.themes.values()].some((record) => record.workspaceId === workspaceId);
    const hasPendingInvitation = [...this.workspaceInvitations.values()].some(
      (record) =>
        record.workspaceId === workspaceId &&
        record.acceptedAt === null &&
        record.revokedAt === null &&
        record.expiresAt > now,
    );
    return !hasDocument && !hasInstallation && !hasTheme && !hasPendingInvitation;
  }

  private deleteDisposableWorkspace(workspaceId: string): void {
    this.workspaces.delete(workspaceId);
    this.workspaceAuthPolicies.delete(workspaceId);
    for (const [key, connection] of this.ssoConnections) {
      if (connection.workspaceId === workspaceId) this.ssoConnections.delete(key);
    }
    for (const [key, membership] of this.workspaceMemberships) {
      if (membership.workspaceId === workspaceId) this.workspaceMemberships.delete(key);
    }
    for (const [key, invitation] of this.workspaceInvitations) {
      if (invitation.workspaceId === workspaceId) this.workspaceInvitations.delete(key);
    }
    for (const [key, message] of this.workspaceInvitationOutbox) {
      if (message.workspaceId === workspaceId) this.workspaceInvitationOutbox.delete(key);
    }
    for (const [key, environment] of this.environments) {
      if (environment.workspaceId === workspaceId) this.environments.delete(key);
    }
  }

  private deleteAbandonedUser(userId: string): void {
    this.users.delete(userId);
    for (const [key, email] of this.userEmails) {
      if (email.userId === userId) this.userEmails.delete(key);
    }
    for (const [key, username] of this.usernames) {
      if (username.userId === userId) this.usernames.delete(key);
    }
    for (const [key, identity] of this.authIdentities) {
      if (identity.userId === userId) this.authIdentities.delete(key);
    }
    for (const [key, challenge] of this.webAuthnChallenges) {
      if (challenge.userId === userId) this.webAuthnChallenges.delete(key);
    }
    for (const [key, credential] of this.passkeyCredentials) {
      if (credential.userId === userId) this.passkeyCredentials.delete(key);
    }
    for (const [key, set] of this.recoveryCodeSets) {
      if (set.userId === userId) this.recoveryCodeSets.delete(key);
    }
    for (const [key, code] of this.recoveryCodes) {
      if (code.userId === userId) this.recoveryCodes.delete(key);
    }
    for (const [key, event] of this.authSecurityEvents) {
      if (event.userId === userId || event.actorUserId === userId) {
        this.authSecurityEvents.delete(key);
      }
    }
    for (const [key, onboarding] of this.identityOnboardingStates) {
      if (onboarding.userId === userId) this.identityOnboardingStates.delete(key);
    }
    for (const [key, attempt] of this.oidcAuthorizationAttempts) {
      if (attempt.userId === userId) this.oidcAuthorizationAttempts.delete(key);
    }
    for (const [key, credential] of this.passwordCredentials) {
      if (credential.userId === userId) this.passwordCredentials.delete(key);
    }
    for (const [key, session] of this.identitySessions) {
      if (session.userId === userId) this.identitySessions.delete(key);
    }
    for (const [key, challenge] of this.emailVerificationChallenges) {
      if (challenge.userId === userId) this.emailVerificationChallenges.delete(key);
    }
    for (const [key, challenge] of this.setPasswordChallenges) {
      if (challenge.userId === userId) this.setPasswordChallenges.delete(key);
    }
    for (const [key, row] of this.authOutbox) {
      if (row.userId === userId) this.authOutbox.delete(key);
    }
    for (const [key, row] of this.setPasswordOutbox) {
      if (row.userId === userId) this.setPasswordOutbox.delete(key);
    }
    for (const [key, row] of this.accountEmailChangeChallenges) {
      if (row.userId === userId) this.accountEmailChangeChallenges.delete(key);
    }
    for (const [key, row] of this.accountEmailChangeOutbox) {
      if (row.userId === userId) this.accountEmailChangeOutbox.delete(key);
    }
    for (const [key, event] of this.accountSecurityEvents) {
      if (event.userId === userId || event.actorUserId === userId) {
        this.accountSecurityEvents.delete(key);
      }
    }
    for (const [key, membership] of this.workspaceMemberships) {
      if (membership.userId === userId) this.workspaceMemberships.delete(key);
    }
  }

  async getAuthDeliveryStatus(
    purpose: AuthEmailPurpose,
    outboxId: string,
  ): Promise<AuthDeliveryStatusRecord | null> {
    const record = this.authEmailOutboxRecord(purpose, outboxId);
    if (!record) return null;
    let state: AuthDeliveryStatusRecord['state'] = 'queued';
    if (record.processedAt) state = 'provider_accepted';
    else if (record.terminalAt) state = 'terminal';
    else if (record.attempts > 0) state = 'retry_scheduled';
    return {
      outboxId: record.id,
      challengeId:
        record.type === 'workspace_invitation'
          ? record.payload.invitationId
          : record.type === 'account_email_change'
            ? record.challengeId
            : record.payload.challengeId,
      keyId: record.type === 'account_email_change' ? record.keyId : record.payload.keyId,
      purpose,
      state,
      attempts: record.attempts,
      lastFailureCode: record.lastError,
      createdAt: record.createdAt,
      nextAttemptAt: state === 'queued' || state === 'retry_scheduled' ? record.availableAt : null,
      providerAcceptedAt: record.processedAt,
      terminalAt: record.terminalAt ?? null,
    };
  }

  async claimDue(input: ClaimDueAuthEmailRowsInput): Promise<readonly ClaimedAuthEmailOutboxRow[]> {
    const normalized = normalizeAuthEmailClaimInput(input);
    if (!normalized) return [];
    const dueRows = [
      ...[...this.authOutbox.values()].map((record) => ({
        purpose: 'email_verification' as const,
        record,
      })),
      ...[...this.setPasswordOutbox.values()].map((record) => ({
        purpose: 'set_password' as const,
        record,
      })),
      ...[...this.workspaceInvitationOutbox.values()].map((record) => ({
        purpose: 'workspace_invitation' as const,
        record,
      })),
      ...[...this.accountEmailChangeOutbox.values()]
        .filter((record) => record.proof === 'current_email')
        .map((record) => ({ purpose: 'account_email_change_current' as const, record })),
      ...[...this.accountEmailChangeOutbox.values()]
        .filter((record) => record.proof === 'new_email')
        .map((record) => ({ purpose: 'account_email_change_new' as const, record })),
    ]
      .filter(({ record }) => {
        const leaseVersion = record.leaseVersion ?? 0;
        return (
          record.processedAt === null &&
          (record.terminalAt ?? null) === null &&
          record.attempts < 20 &&
          leaseVersion < 2_147_483_647 &&
          Date.parse(record.availableAt) <= Date.parse(normalized.now)
        );
      })
      .sort((left, right) => compareInMemoryAuthEmailRows(left, right))
      .slice(0, normalized.limit);

    return dueRows.map((row) => {
      if (row.purpose === 'email_verification') {
        const claimed: AuthOutboxRecord & { leaseVersion: number } = {
          ...row.record,
          attempts: row.record.attempts + 1,
          leaseVersion: (row.record.leaseVersion ?? 0) + 1,
          availableAt: normalized.leaseExpiresAt,
        };
        this.authOutbox.set(claimed.id, claimed);
        return {
          id: claimed.id,
          recipientEmail: claimed.recipientEmail,
          purpose: row.purpose,
          challengeId: claimed.payload.challengeId,
          keyId: claimed.payload.keyId,
          attempt: claimed.attempts,
          leaseVersion: claimed.leaseVersion,
          createdAt: claimed.createdAt,
        };
      }
      if (row.purpose === 'set_password') {
        const claimed: SetPasswordOutboxRecord & { leaseVersion: number } = {
          ...row.record,
          attempts: row.record.attempts + 1,
          leaseVersion: (row.record.leaseVersion ?? 0) + 1,
          availableAt: normalized.leaseExpiresAt,
        };
        this.setPasswordOutbox.set(claimed.id, claimed);
        return {
          id: claimed.id,
          recipientEmail: claimed.recipientEmail,
          purpose: row.purpose,
          challengeId: claimed.payload.challengeId,
          keyId: claimed.payload.keyId,
          attempt: claimed.attempts,
          leaseVersion: claimed.leaseVersion,
          createdAt: claimed.createdAt,
        };
      }
      if (
        row.purpose === 'account_email_change_current' ||
        row.purpose === 'account_email_change_new'
      ) {
        const claimed: AccountEmailChangeOutboxRecord & { leaseVersion: number } = {
          ...row.record,
          attempts: row.record.attempts + 1,
          leaseVersion: row.record.leaseVersion + 1,
          availableAt: normalized.leaseExpiresAt,
        };
        this.accountEmailChangeOutbox.set(claimed.id, claimed);
        return {
          id: claimed.id,
          recipientEmail: claimed.recipientEmail,
          purpose: row.purpose,
          challengeId: claimed.challengeId,
          keyId: claimed.keyId,
          attempt: claimed.attempts,
          leaseVersion: claimed.leaseVersion,
          createdAt: claimed.createdAt,
        };
      }
      const claimed: WorkspaceInvitationOutboxRecord & { leaseVersion: number } = {
        ...row.record,
        attempts: row.record.attempts + 1,
        leaseVersion: (row.record.leaseVersion ?? 0) + 1,
        availableAt: normalized.leaseExpiresAt,
      };
      this.workspaceInvitationOutbox.set(claimed.id, claimed);
      return {
        id: claimed.id,
        recipientEmail: claimed.recipientEmail,
        purpose: row.purpose,
        challengeId: claimed.payload.invitationId,
        keyId: claimed.payload.keyId,
        attempt: claimed.attempts,
        leaseVersion: claimed.leaseVersion,
        createdAt: claimed.createdAt,
      };
    });
  }

  async acknowledge(input: AcknowledgeAuthEmailRowInput): Promise<boolean> {
    const processedAtMs = Date.parse(input.processedAt);
    if (!isValidAuthEmailLeaseMutation(input, processedAtMs)) return false;
    if (input.purpose === 'email_verification') {
      const record = this.authOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion, processedAtMs)) return false;
      this.authOutbox.set(input.id, { ...record, processedAt: input.processedAt });
      return true;
    }
    if (input.purpose === 'set_password') {
      const record = this.setPasswordOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion, processedAtMs)) return false;
      this.setPasswordOutbox.set(input.id, { ...record, processedAt: input.processedAt });
      return true;
    }
    if (
      input.purpose === 'account_email_change_current' ||
      input.purpose === 'account_email_change_new'
    ) {
      const record = this.accountEmailChangeOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion, processedAtMs)) return false;
      this.accountEmailChangeOutbox.set(input.id, {
        ...record,
        processedAt: input.processedAt,
      });
      return true;
    }
    const record = this.workspaceInvitationOutbox.get(input.id);
    if (!isCurrentAuthEmailLease(record, input.leaseVersion, processedAtMs)) return false;
    this.workspaceInvitationOutbox.set(input.id, {
      ...record,
      processedAt: input.processedAt,
    });
    return true;
  }

  async retry(input: RetryAuthEmailRowInput): Promise<boolean> {
    const availableAtMs = input.availableAt ? Date.parse(input.availableAt) : null;
    if (
      !isValidAuthEmailLeaseMutation(input) ||
      input.terminal !== (input.availableAt === null) ||
      (availableAtMs !== null && !Number.isFinite(availableAtMs))
    ) {
      return false;
    }
    const failureCode = sanitizeAuthEmailFailureCode(input.failureCode);
    if (input.purpose === 'email_verification') {
      const record = this.authOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion)) return false;
      this.authOutbox.set(input.id, {
        ...record,
        leaseVersion: input.leaseVersion + 1,
        lastError: failureCode,
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
        terminalAt: input.terminal ? new Date().toISOString() : null,
      });
      return true;
    }
    if (input.purpose === 'set_password') {
      const record = this.setPasswordOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion)) return false;
      this.setPasswordOutbox.set(input.id, {
        ...record,
        leaseVersion: input.leaseVersion + 1,
        lastError: failureCode,
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
        terminalAt: input.terminal ? new Date().toISOString() : null,
      });
      return true;
    }
    if (
      input.purpose === 'account_email_change_current' ||
      input.purpose === 'account_email_change_new'
    ) {
      const record = this.accountEmailChangeOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion)) return false;
      this.accountEmailChangeOutbox.set(input.id, {
        ...record,
        leaseVersion: input.leaseVersion + 1,
        lastError: failureCode,
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
        terminalAt: input.terminal ? new Date().toISOString() : null,
      });
      return true;
    }
    const record = this.workspaceInvitationOutbox.get(input.id);
    if (!isCurrentAuthEmailLease(record, input.leaseVersion)) return false;
    this.workspaceInvitationOutbox.set(input.id, {
      ...record,
      leaseVersion: input.leaseVersion + 1,
      lastError: failureCode,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
      terminalAt: input.terminal ? new Date().toISOString() : null,
    });
    return true;
  }

  private authEmailOutboxRecord(
    purpose: AuthEmailPurpose,
    outboxId: string,
  ):
    | AuthOutboxRecord
    | SetPasswordOutboxRecord
    | WorkspaceInvitationOutboxRecord
    | AccountEmailChangeOutboxRecord
    | undefined {
    if (purpose === 'email_verification') return this.authOutbox.get(outboxId);
    if (purpose === 'set_password') return this.setPasswordOutbox.get(outboxId);
    if (purpose === 'account_email_change_current' || purpose === 'account_email_change_new') {
      const record = this.accountEmailChangeOutbox.get(outboxId);
      const expectedProof =
        purpose === 'account_email_change_current' ? 'current_email' : 'new_email';
      return record?.proof === expectedProof ? record : undefined;
    }
    return this.workspaceInvitationOutbox.get(outboxId);
  }

  async consumeAuthRateLimit(input: ConsumeAuthRateLimitInput): Promise<AuthRateLimitResult> {
    const current = this.authRateLimits.get(input.bucketHash);
    const nowMs = Date.parse(input.now);
    if (current?.blockedUntil && Date.parse(current.blockedUntil) > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((Date.parse(current.blockedUntil) - nowMs) / 1_000),
        ),
      };
    }
    const windowExpired = !current || Date.parse(current.windowStartedAt) + input.windowMs <= nowMs;
    const attempts = windowExpired ? 1 : current.attempts + 1;
    const blockedUntil =
      attempts > input.maxAttempts ? new Date(nowMs + input.blockMs).toISOString() : null;
    this.authRateLimits.set(input.bucketHash, {
      windowStartedAt: windowExpired ? input.now : current.windowStartedAt,
      attempts,
      blockedUntil,
    });
    return {
      allowed: blockedUntil === null,
      retryAfterSeconds: blockedUntil ? Math.max(1, Math.ceil(input.blockMs / 1_000)) : 0,
    };
  }

  async pruneAuthRateLimits(before: string, limit: number): Promise<number> {
    const candidates = [...this.authRateLimits.entries()]
      .filter(([, record]) => {
        const lastRelevantAt = record.blockedUntil ?? record.windowStartedAt;
        return lastRelevantAt < before;
      })
      .sort(([, left], [, right]) => left.windowStartedAt.localeCompare(right.windowStartedAt))
      .slice(0, Math.max(0, Math.min(limit, 100)));
    for (const [bucketHash] of candidates) this.authRateLimits.delete(bucketHash);
    return candidates.length;
  }

  async createAuthSession(session: AuthSessionRecord): Promise<AuthSessionRecord> {
    if (!isValidAuthSessionRecord(session)) throw new Error('Invalid auth session');
    if (!this.users.has(session.userId) || this.identitySessions.has(session.tokenHash)) {
      throw new Error('Unable to create auth session');
    }
    if (
      (session.identityId &&
        ![...this.authIdentities.values()].some(
          (identity) =>
            identity.id === session.identityId &&
            identity.userId === session.userId &&
            !identity.disabledAt,
        )) ||
      (session.activeWorkspaceId &&
        !this.workspaceMemberships.has(this.key(session.activeWorkspaceId, session.userId)))
    ) {
      throw new Error('Auth session active workspace requires membership');
    }
    this.identitySessions.set(session.tokenHash, clone(session));
    return clone(session);
  }

  async createCredentialBoundAuthSession(
    input: CreateCredentialBoundAuthSessionInput,
  ): Promise<AuthSessionRecord | null> {
    if (input.session.revokedAt !== null || !isValidAuthSessionRecord(input.session)) return null;
    const credential = [...this.passwordCredentials.values()].find(
      (candidate) => candidate.userId === input.session.userId,
    );
    const user = this.users.get(input.session.userId);
    if (
      !credential ||
      credential.algorithm !== 'argon2id-v1' ||
      credential.passwordHash !== input.expectedPasswordHash ||
      !user?.emailVerifiedAt ||
      !input.session.identityId ||
      ![...this.authIdentities.values()].some(
        (identity) =>
          identity.id === input.session.identityId &&
          identity.userId === input.session.userId &&
          identity.kind === 'password' &&
          !identity.disabledAt,
      )
    ) {
      return null;
    }
    if (
      input.session.activeWorkspaceId &&
      !this.workspaceMemberships.has(
        this.key(input.session.activeWorkspaceId, input.session.userId),
      )
    ) {
      return null;
    }
    const identity = this.authIdentities.get(input.session.identityId);
    if (!identity) return null;
    this.authIdentities.set(identity.id, {
      ...identity,
      lastAuthenticatedAt: input.session.authenticatedAt,
    });
    return this.createAuthSession(input.session);
  }

  async resolveAuthSession(tokenHash: string, now: string): Promise<AuthSessionRecord | null> {
    const session = this.identitySessions.get(tokenHash);
    if (
      !session ||
      session.revokedAt ||
      session.idleExpiresAt <= now ||
      session.absoluteExpiresAt <= now
    ) {
      return null;
    }
    return clone(session);
  }

  async touchAuthSession(
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): Promise<AuthSessionRecord | null> {
    const session = await this.resolveAuthSession(tokenHash, now);
    if (!session) return null;
    const next = {
      ...session,
      lastSeenAt: now,
      idleExpiresAt:
        idleExpiresAt < session.absoluteExpiresAt ? idleExpiresAt : session.absoluteExpiresAt,
    };
    this.identitySessions.set(tokenHash, next);
    return clone(next);
  }

  async rotateAuthSession(input: RotateAuthSessionInput): Promise<AuthSessionRecord | null> {
    if (!isValidAuthSessionRecord(input.nextSession)) return null;
    const current = this.identitySessions.get(input.currentTokenHash);
    if (
      !current ||
      current.revokedAt ||
      current.userId !== input.nextSession.userId ||
      current.identityId !== input.nextSession.identityId ||
      current.authenticationMethod !== input.nextSession.authenticationMethod ||
      current.assuranceLevel !== input.nextSession.assuranceLevel ||
      current.authenticatedAt !== input.nextSession.authenticatedAt ||
      current.durationPolicy !== input.nextSession.durationPolicy ||
      current.idleExpiresAt <= input.nextSession.createdAt ||
      current.absoluteExpiresAt <= input.nextSession.createdAt
    ) {
      return null;
    }
    if (
      input.nextSession.activeWorkspaceId &&
      !this.workspaceMemberships.has(
        this.key(input.nextSession.activeWorkspaceId, input.nextSession.userId),
      )
    ) {
      return null;
    }
    const revokedAt = input.nextSession.createdAt;
    this.identitySessions.set(input.currentTokenHash, { ...current, revokedAt });
    this.identitySessions.set(input.nextSession.tokenHash, clone(input.nextSession));
    return clone(input.nextSession);
  }

  async revokeAuthSession(tokenHash: string, revokedAt: string): Promise<boolean> {
    const session = this.identitySessions.get(tokenHash);
    if (!session || session.revokedAt) return false;
    this.identitySessions.set(tokenHash, { ...session, revokedAt });
    return true;
  }

  async listIdentityWorkspaces(userId: string): Promise<IdentityWorkspaceRecord[]> {
    return [...this.workspaceMemberships.values()]
      .filter((membership) => membership.userId === userId)
      .flatMap((membership) => {
        const workspace = this.workspaces.get(membership.workspaceId);
        const role = identityWorkspaceRole(membership.role);
        return workspace && !workspace.deletedAt && role
          ? [
              {
                id: workspace.id,
                name: workspace.name,
                role,
                createdAt: workspace.createdAt,
              },
            ]
          : [];
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createIdentityWorkspace(input: CreateIdentityWorkspaceInput): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch (error) {
      if (error instanceof WorkspaceEnvironmentPolicyInvalidError) return false;
      throw error;
    }
    if (
      !this.users.has(input.userId) ||
      this.workspaces.has(input.workspace.id) ||
      input.membership.userId !== input.userId ||
      input.membership.workspaceId !== input.workspace.id ||
      input.membership.role !== 'owner' ||
      !this.hasWorkspaceCapacity(input.userId) ||
      input.environments.some(
        (environment) =>
          environment.workspaceId !== input.workspace.id ||
          this.environments.has(this.key(environment.workspaceId, environment.id)),
      )
    ) {
      return false;
    }
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
    this.workspaceMemberships.set(
      this.key(input.membership.workspaceId, input.membership.userId),
      clone(input.membership),
    );
    for (const environment of normalizeWorkspaceEnvironments(input.environments)) {
      this.environments.set(this.key(environment.workspaceId, environment.id), clone(environment));
    }
    return true;
  }

  async resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null> {
    const direct = this.workspaceMemberships.get(this.key(workspaceId, userId));
    if (!direct) return null;
    const workspace = this.workspaces.get(workspaceId);
    return workspace?.deletedAt ? null : clone(direct);
  }

  async getWorkspaceAuthPolicy(workspaceId: string): Promise<WorkspaceAuthPolicyRecord | null> {
    const policy = this.workspaceAuthPolicies.get(workspaceId);
    if (policy) return clone(policy);
    // ponytail: in-memory seeds often omit the SQL backfill row. Default matches
    // 0007_provider_neutral_identity.sql. Drizzle stays fail-closed on a missing row.
    const workspace = this.workspaces.get(workspaceId);
    return {
      workspaceId,
      ssoRequired: false,
      minimumAssurance: 'aal1',
      passwordAllowed: true,
      createdAt: workspace?.createdAt ?? '1970-01-01T00:00:00.000Z',
      updatedAt: workspace?.updatedAt ?? '1970-01-01T00:00:00.000Z',
    };
  }
}

function deleteOldestMatching<T>(
  map: Map<string, T>,
  limit: number,
  predicate: (record: T) => boolean,
  timestamp: (record: T) => string,
): number {
  const keys = [...map.entries()]
    .filter(([, record]) => predicate(record))
    .sort(([, left], [, right]) => timestamp(left).localeCompare(timestamp(right)))
    .slice(0, limit)
    .map(([key]) => key);
  for (const key of keys) map.delete(key);
  return keys.length;
}

function isRetainedOutboxExpired(
  record: { processedAt: string | null; terminalAt?: string | null },
  before: string,
): boolean {
  if (record.processedAt !== null && record.processedAt < before) return true;
  const terminalAt = record.terminalAt ?? null;
  return terminalAt !== null && terminalAt < before;
}
