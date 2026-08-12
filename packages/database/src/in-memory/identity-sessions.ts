import {
  WorkspaceEnvironmentPolicyInvalidError,
  assertValidWorkspaceEnvironmentPolicy,
  normalizeWorkspaceEnvironments,
} from '../domains/environments';
import {
  type AcknowledgeAuthEmailRowInput,
  type AuthOutboxRecord,
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
  type WorkspaceMembershipRecord,
  normalizeAuthEmailClaimInput,
  sanitizeAuthEmailFailureCode,
} from '../domains/identity';
import {
  clone,
  compareInMemoryAuthEmailRows,
  identityWorkspaceRole,
  isCurrentAuthEmailLease,
  isValidAuthEmailLeaseMutation,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryIdentityAccounts } from './identity-accounts';

export class InMemoryRepositoryIdentitySessions extends InMemoryRepositoryIdentityAccounts {
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
          attempt: claimed.attempts,
          leaseVersion: claimed.leaseVersion,
        };
      }
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
        attempt: claimed.attempts,
        leaseVersion: claimed.leaseVersion,
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
    const record = this.setPasswordOutbox.get(input.id);
    if (!isCurrentAuthEmailLease(record, input.leaseVersion, processedAtMs)) return false;
    this.setPasswordOutbox.set(input.id, { ...record, processedAt: input.processedAt });
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
    if (!this.users.has(session.userId) || this.identitySessions.has(session.tokenHash)) {
      throw new Error('Unable to create auth session');
    }
    if (
      session.activeWorkspaceId &&
      !this.workspaceMemberships.has(this.key(session.activeWorkspaceId, session.userId))
    ) {
      throw new Error('Auth session active workspace requires membership');
    }
    this.identitySessions.set(session.tokenHash, clone(session));
    return clone(session);
  }

  async createCredentialBoundAuthSession(
    input: CreateCredentialBoundAuthSessionInput,
  ): Promise<AuthSessionRecord | null> {
    const credential = [...this.passwordCredentials.values()].find(
      (candidate) => candidate.userId === input.session.userId,
    );
    const user = this.users.get(input.session.userId);
    if (
      !credential ||
      credential.algorithm !== 'argon2id-v1' ||
      credential.passwordHash !== input.expectedPasswordHash ||
      !user?.emailVerifiedAt
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
    const current = this.identitySessions.get(input.currentTokenHash);
    if (
      !current ||
      current.revokedAt ||
      current.userId !== input.nextSession.userId ||
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
        return workspace && role
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
      input.environments.some(
        (environment) =>
          environment.workspaceId !== input.workspace.id ||
          this.environments.has(this.key(environment.workspaceId, environment.id)),
      )
    ) {
      return false;
    }
    this.workspaces.set(input.workspace.id, clone(input.workspace));
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
    return direct ? clone(direct) : null;
  }
}
