import {
  isValidAuthIdentityRecord,
  isValidAuthSessionRecord,
  type AuthSessionRecord,
} from '../domains/identity';
import type {
  CreateExternalIdentitySessionInput,
  OidcAuthorizationAttemptRecord,
  RegisterExternalIdentityAccountInput,
} from '../domains/oidc';
import { validOidcAuthorizationAttempt } from '../domains/oidc';
import { clone } from '../domains/in-memory-helpers';
import {
  assertValidWorkspaceEnvironmentPolicy,
  normalizeWorkspaceEnvironments,
} from '../domains/environments';
import { InMemoryRepositoryAssurance } from './assurance';

export class InMemoryRepositoryOidc extends InMemoryRepositoryAssurance {
  async createOidcAuthorizationAttempt(attempt: OidcAuthorizationAttemptRecord): Promise<boolean> {
    if (
      !validOidcAuthorizationAttempt(attempt) ||
      this.oidcAuthorizationAttempts.has(attempt.id) ||
      [...this.oidcAuthorizationAttempts.values()].some(
        (candidate) => candidate.stateHash === attempt.stateHash,
      )
    ) {
      return false;
    }
    this.oidcAuthorizationAttempts.set(attempt.id, clone(attempt));
    return true;
  }

  async getOidcAuthorizationAttempt(
    stateHash: string,
    now: string,
  ): Promise<OidcAuthorizationAttemptRecord | null> {
    const attempt = [...this.oidcAuthorizationAttempts.values()].find(
      (candidate) => candidate.stateHash === stateHash,
    );
    if (!attempt || attempt.consumedAt || attempt.expiresAt <= now) return null;
    return clone(attempt);
  }

  async consumeOidcAuthorizationAttempt(
    attemptId: string,
    stateHash: string,
    consumedAt: string,
  ): Promise<boolean> {
    const attempt = this.oidcAuthorizationAttempts.get(attemptId);
    if (
      !attempt ||
      attempt.stateHash !== stateHash ||
      attempt.consumedAt !== null ||
      attempt.expiresAt <= consumedAt
    ) {
      return false;
    }
    this.oidcAuthorizationAttempts.set(attemptId, { ...attempt, consumedAt });
    return true;
  }

  async registerExternalIdentityAccount(
    input: RegisterExternalIdentityAccountInput,
  ): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch {
      return false;
    }
    const normalizedEmail = input.userEmail.normalizedEmail;
    if (
      !input.user.emailVerifiedAt ||
      !input.userEmail.verifiedAt ||
      !input.userEmail.isPrimary ||
      input.userEmail.userId !== input.user.id ||
      input.identity.userId !== input.user.id ||
      input.identity.kind !== 'oidc' ||
      !isValidAuthIdentityRecord(input.identity) ||
      input.session.userId !== input.user.id ||
      input.session.identityId !== input.identity.id ||
      input.session.authenticationMethod !== 'oidc' ||
      input.session.activeWorkspaceId !== input.workspace.id ||
      !isValidAuthSessionRecord(input.session) ||
      input.onboarding.userId !== input.user.id ||
      input.onboarding.status !== 'completed' ||
      input.onboarding.completedWorkspaceId !== input.workspace.id ||
      input.workspace.id !== input.membership.workspaceId ||
      input.membership.userId !== input.user.id ||
      input.membership.role !== 'owner' ||
      this.users.has(input.user.id) ||
      this.userEmails.has(normalizedEmail) ||
      [...this.users.values()].some(
        (user) => user.email.trim().toLowerCase() === normalizedEmail,
      ) ||
      this.authIdentities.has(input.identity.id) ||
      [...this.authIdentities.values()].some(
        (identity) =>
          identity.issuer === input.identity.issuer && identity.subject === input.identity.subject,
      ) ||
      this.identityOnboardingStates.has(input.onboarding.id) ||
      this.workspaces.has(input.workspace.id) ||
      this.identitySessions.has(input.session.tokenHash)
    ) {
      return false;
    }
    this.users.set(input.user.id, clone(input.user));
    this.userEmails.set(normalizedEmail, clone(input.userEmail));
    this.authIdentities.set(input.identity.id, clone(input.identity));
    this.identityOnboardingStates.set(input.onboarding.id, clone(input.onboarding));
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
    this.identitySessions.set(input.session.tokenHash, clone(input.session));
    return true;
  }

  async createExternalIdentitySession(
    input: CreateExternalIdentitySessionInput,
  ): Promise<AuthSessionRecord | null> {
    const identity = this.authIdentities.get(input.identityId);
    const user = identity ? this.users.get(identity.userId) : null;
    if (
      !identity ||
      identity.kind !== 'oidc' ||
      identity.disabledAt ||
      identity.issuer !== input.issuer ||
      identity.subject !== input.subject ||
      !user ||
      user.deletedAt ||
      input.session.userId !== identity.userId ||
      input.session.identityId !== identity.id ||
      input.session.authenticationMethod !== 'oidc' ||
      input.session.authenticatedAt !== input.authenticatedAt ||
      !isValidAuthSessionRecord(input.session) ||
      this.identitySessions.has(input.session.tokenHash)
    ) {
      return null;
    }
    this.authIdentities.set(identity.id, {
      ...identity,
      lastAuthenticatedAt: input.authenticatedAt,
    });
    this.identitySessions.set(input.session.tokenHash, clone(input.session));
    return clone(input.session);
  }
}
