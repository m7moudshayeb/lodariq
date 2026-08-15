import { randomBytes } from 'node:crypto';
import type { ControlPlaneRepository } from '@lodariq/database';
import {
  AuthIdentityParams,
  AuthSessionParams,
  ChangePasswordRequest,
  DeleteAccountRequest,
  StartEmailChangeRequest,
  UnlinkAuthIdentityRequest,
  VerifyEmailChangeRequest,
  type AuthIdentityParams as AuthIdentityRouteParams,
  type AuthSessionParams as AuthSessionRouteParams,
  type ChangePasswordRequest as ChangePasswordBody,
  type DeleteAccountRequest as DeleteAccountBody,
  type StartEmailChangeRequest as StartEmailChangeBody,
  type UnlinkAuthIdentityRequest as UnlinkIdentityBody,
  type VerifyEmailChangeRequest as VerifyEmailChangeBody,
} from '@lodariq/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  createAccountEmailChangeToken,
  createOwnedAuthSession,
  hashAccountEmailChangeToken,
  hashAuthEmailLookup,
  hashOwnedPassword,
  normalizeAuthEmail,
  readEmailVerificationConfiguration,
  serializeAuthSessionCookie,
  serializeExpiredAuthSessionCookie,
  verifyOwnedPassword,
  isRecentAuthentication,
  type EmailVerificationDeliveryCapability,
  type PasswordHashAdmissionGateLike,
} from '../auth';
import type { ObservabilitySink } from '../observability';
import {
  requireCredentialGateway,
  requireOwnedSession,
  requireTrustedMutationOrigin,
  runBoundedPasswordHash,
} from './auth';

export interface RegisterAccountManagementRoutesOptions {
  repository: ControlPlaneRepository;
  observability: ObservabilitySink;
  emailVerificationDelivery?: EmailVerificationDeliveryCapability;
  passwordHashAdmissionGate: PasswordHashAdmissionGateLike;
  clock?: () => Date;
}

const EMAIL_CHANGE_TTL_MS = 30 * 60 * 1_000;
const ACCOUNT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export function registerAccountManagementRoutes(
  fastify: FastifyInstance,
  options: RegisterAccountManagementRoutesOptions,
): void {
  const emailDelivery = readEmailVerificationConfiguration(
    process.env,
    options.emailVerificationDelivery,
  );

  fastify.get('/v1/auth/sessions', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const sessions = await options.repository.listAccountSessions(
      authenticated.session.userId,
      readAccountClock(options.clock).toISOString(),
    );
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        deviceLabel: session.deviceLabel,
        authenticationMethod: session.authenticationMethod,
        assuranceLevel: session.assuranceLevel,
        durationPolicy: session.durationPolicy,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.absoluteExpiresAt,
        current: session.id === authenticated.session.id,
      })),
    };
  });

  fastify.delete(
    '/v1/auth/sessions/:sessionId',
    { schema: { params: AuthSessionParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { sessionId } = request.params as AuthSessionRouteParams;
      const revokedAt = readAccountClock(options.clock).toISOString();
      const event = accountEvent(
        'session_revoked',
        authenticated.session.userId,
        sessionId,
        revokedAt,
      );
      const revoked = await options.repository.revokeAccountSession(
        authenticated.session.userId,
        sessionId,
        revokedAt,
        event,
      );
      if (!revoked) {
        return reply.code(404).send({ error: 'session_not_found', message: 'Session not found' });
      }
      emitAccountEvent(options, 'auth.account.session_revoked', authenticated.session.userId, {
        sessionId,
      });
      if (sessionId === authenticated.session.id) {
        reply.header('set-cookie', serializeExpiredAuthSessionCookie());
      }
      return reply.code(204).send();
    },
  );

  fastify.post('/v1/auth/sign-out-everywhere', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    if (!requireTrustedMutationOrigin(request, reply)) return;
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const now = readAccountClock(options.clock).toISOString();
    const event = accountEvent(
      'sessions_revoked_all',
      authenticated.session.userId,
      authenticated.session.id,
      now,
    );
    const revokedSessions = await options.repository.revokeAllAccountSessions(
      authenticated.session.userId,
      now,
      event,
    );
    reply.header('set-cookie', serializeExpiredAuthSessionCookie());
    emitAccountEvent(options, 'auth.account.sessions_revoked_all', authenticated.session.userId, {
      revokedSessions,
    });
    return reply.code(204).send();
  });

  fastify.post(
    '/v1/auth/change-password',
    { schema: { body: ChangePasswordRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      if (!requireCredentialGateway(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readAccountClock(options.clock);
      if (!requireRecentAuthentication(reply, authenticated.session.authenticatedAt, now)) return;
      const body = request.body as ChangePasswordBody;
      const authentication = await options.repository.findPasswordAuthenticationByUserId(
        authenticated.session.userId,
      );
      const passwordResult = await runBoundedPasswordHash(
        options.passwordHashAdmissionGate,
        request,
        reply,
        async () => {
          const verified = await verifyOwnedPassword(
            body.currentPassword,
            authentication?.credential ?? null,
          );
          if (!verified || !authentication) return null;
          return hashOwnedPassword(
            authenticated.session.userId,
            authentication.credential.emailNormalized,
            body.newPassword,
            now,
          );
        },
      );
      if (!passwordResult) return;
      if (!passwordResult.value || !authentication) return invalidCredentials(reply);
      const next = createOwnedAuthSession(
        authenticated.session.userId,
        authenticated.session.activeWorkspaceId,
        {
          now,
          identityId: authenticated.session.identityId,
          authenticationMethod: 'password',
          assuranceLevel: authenticated.session.assuranceLevel,
          authenticatedAt: now.toISOString(),
          durationPolicy: authenticated.session.durationPolicy,
          deviceLabel: authenticated.session.deviceLabel,
        },
      );
      const result = await options.repository.changeAccountPassword({
        userId: authenticated.session.userId,
        currentSessionId: authenticated.session.id,
        expectedPasswordHash: authentication.credential.passwordHash,
        credential: {
          algorithm: passwordResult.value.algorithm,
          passwordHash: passwordResult.value.passwordHash,
          createdAt: passwordResult.value.createdAt,
          updatedAt: passwordResult.value.updatedAt,
        },
        nextSession: next.record,
        eventId: createAccountId('acctevt'),
        changedAt: now.toISOString(),
      });
      if (result.status !== 'changed') return staleCredential(reply);
      reply.header(
        'set-cookie',
        serializeAuthSessionCookie(next.rawToken, {
          ...(result.session.durationPolicy === 'remembered'
            ? { expiresAt: result.session.absoluteExpiresAt }
            : {}),
        }),
      );
      emitAccountEvent(options, 'auth.account.password_changed', authenticated.session.userId);
      return reply.code(204).send();
    },
  );

  fastify.get('/v1/auth/email-change', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const change = await options.repository.getAccountEmailChange(
      authenticated.session.userId,
      readAccountClock(options.clock).toISOString(),
    );
    return change ? emailChangeSnapshot(change) : null;
  });

  fastify.post(
    '/v1/auth/email-change',
    { schema: { body: StartEmailChangeRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      if (!requireCredentialGateway(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readAccountClock(options.clock);
      if (!requireRecentAuthentication(reply, authenticated.session.authenticatedAt, now)) return;
      if (!emailDelivery.available) {
        return reply.code(503).send({
          error: 'email_delivery_unavailable',
          message: 'Email delivery is unavailable',
        });
      }
      const body = request.body as StartEmailChangeBody;
      const newEmail = normalizeAuthEmail(body.newEmail);
      const authentication = await options.repository.findPasswordAuthenticationByUserId(
        authenticated.session.userId,
      );
      const verified = await runBoundedPasswordHash(
        options.passwordHashAdmissionGate,
        request,
        reply,
        () => verifyOwnedPassword(body.currentPassword, authentication?.credential ?? null),
      );
      if (!verified) return;
      if (!verified.value || !authentication) return invalidCredentials(reply);
      const challengeId = createAccountId('emailchange');
      const currentToken = createAccountEmailChangeToken(
        challengeId,
        'current_email',
        emailDelivery.secret,
      );
      const newToken = createAccountEmailChangeToken(
        challengeId,
        'new_email',
        emailDelivery.secret,
      );
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString();
      const result = await options.repository.beginAccountEmailChange({
        challenge: {
          id: challengeId,
          userId: authenticated.session.userId,
          currentEmailNormalized: authentication.credential.emailNormalized,
          newEmailNormalized: newEmail,
          newEmailLookupHash: hashAuthEmailLookup(newEmail),
          currentTokenHash: hashAccountEmailChangeToken(currentToken),
          newTokenHash: hashAccountEmailChangeToken(newToken),
          keyId: emailDelivery.keyId,
          currentVerifiedAt: null,
          newVerifiedAt: null,
          expiresAt,
          consumedAt: null,
          revokedAt: null,
          createdAt,
        },
        outbox: [
          accountEmailOutbox(
            challengeId,
            authenticated.session.userId,
            authentication.credential.emailNormalized,
            'current_email',
            emailDelivery.keyId,
            createdAt,
          ),
          accountEmailOutbox(
            challengeId,
            authenticated.session.userId,
            newEmail,
            'new_email',
            emailDelivery.keyId,
            createdAt,
          ),
        ],
        expectedPasswordHash: authentication.credential.passwordHash,
        event: accountEvent(
          'email_change_started',
          authenticated.session.userId,
          challengeId,
          createdAt,
        ),
      });
      if (result.status === 'email_conflict') {
        return reply.code(409).send({
          error: 'email_unavailable',
          message: 'This email address cannot be used',
        });
      }
      if (result.status !== 'queued') return staleCredential(reply);
      emitAccountEvent(options, 'auth.account.email_change_started', authenticated.session.userId, {
        challengeId,
      });
      return reply.code(202).send(emailChangeSnapshot(result.challenge));
    },
  );

  fastify.post(
    '/v1/auth/email-change/verify',
    { schema: { body: VerifyEmailChangeRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const body = request.body as VerifyEmailChangeBody;
      const now = readAccountClock(options.clock).toISOString();
      const result = await options.repository.verifyAccountEmailChange({
        userId: authenticated.session.userId,
        currentSessionId: authenticated.session.id,
        challengeId: body.challengeId,
        proof: body.proof,
        tokenHash: hashAccountEmailChangeToken(body.token),
        verifiedAt: now,
        eventId: createAccountId('acctevt'),
        completionEventId: createAccountId('acctevt'),
      });
      if (result.status === 'invalid_or_expired') {
        return reply.code(400).send({
          error: 'email_change_invalid_or_expired',
          message: 'This email-change link is invalid or expired',
        });
      }
      if (result.status === 'email_conflict') {
        return reply.code(409).send({
          error: 'email_unavailable',
          message: 'This email address cannot be used',
        });
      }
      emitAccountEvent(
        options,
        'auth.account.email_change_verified',
        authenticated.session.userId,
        {
          challengeId: body.challengeId,
          proof: body.proof,
          outcome: result.status,
        },
      );
      if (result.status === 'completed') return { status: 'completed', email: result.email };
      if (result.status === 'proof_recorded') {
        return { status: 'proof_recorded', change: emailChangeSnapshot(result.challenge) };
      }
      return reply.code(409).send({
        error: 'email_change_conflict',
        message: 'The email change could not be completed',
      });
    },
  );

  fastify.get('/v1/auth/identities', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const identities = await options.repository.listAuthIdentities(authenticated.session.userId);
    return {
      identities: identities
        .filter((identity) => !identity.disabledAt)
        .map(
          ({ subject: _subject, userId: _userId, disabledAt: _disabledAt, ...identity }) =>
            identity,
        ),
    };
  });

  fastify.delete(
    '/v1/auth/identities/:identityId',
    { schema: { params: AuthIdentityParams, body: UnlinkAuthIdentityRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readAccountClock(options.clock);
      if (!requireRecentAuthentication(reply, authenticated.session.authenticatedAt, now)) return;
      const { identityId } = request.params as AuthIdentityRouteParams;
      const body = request.body as UnlinkIdentityBody;
      const identities = await options.repository.listAuthIdentities(authenticated.session.userId);
      const identity = identities.find(
        (candidate) => candidate.id === identityId && !candidate.disabledAt,
      );
      if (!identity) {
        return reply.code(404).send({ error: 'identity_not_found', message: 'Method not found' });
      }
      if (identity.kind === 'password') {
        const authentication = await options.repository.findPasswordAuthenticationByUserId(
          authenticated.session.userId,
        );
        const verified = await runBoundedPasswordHash(
          options.passwordHashAdmissionGate,
          request,
          reply,
          () => verifyOwnedPassword(body.currentPassword ?? '', authentication?.credential ?? null),
        );
        if (!verified) return;
        if (!verified.value) return invalidCredentials(reply);
      }
      const result = await options.repository.unlinkAuthIdentity({
        userId: authenticated.session.userId,
        identityId,
        actorUserId: authenticated.session.userId,
        authorization: 'authenticated_session',
        eventId: createAccountId('authevt'),
        occurredAt: now.toISOString(),
      });
      if (result === 'final_method') {
        return reply.code(409).send({
          error: 'final_authentication_method',
          message: 'Add another sign-in method before removing this one',
        });
      }
      if (result !== 'unlinked') {
        return reply.code(409).send({
          error: 'identity_unlink_conflict',
          message: 'The sign-in method could not be removed',
        });
      }
      reply.header('set-cookie', serializeExpiredAuthSessionCookie());
      return reply.code(204).send();
    },
  );

  fastify.get('/v1/auth/account-export', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const exported = await options.repository.exportAccount(authenticated.session.userId);
    if (!exported) return reply.code(404).send({ error: 'account_not_found' });
    return { generatedAt: readAccountClock(options.clock).toISOString(), ...exported };
  });

  fastify.delete(
    '/v1/auth/account',
    { schema: { body: DeleteAccountRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      if (!requireCredentialGateway(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readAccountClock(options.clock);
      if (!requireRecentAuthentication(reply, authenticated.session.authenticatedAt, now)) return;
      const body = request.body as DeleteAccountBody;
      const authentication = await options.repository.findPasswordAuthenticationByUserId(
        authenticated.session.userId,
      );
      const verified = await runBoundedPasswordHash(
        options.passwordHashAdmissionGate,
        request,
        reply,
        () => verifyOwnedPassword(body.currentPassword, authentication?.credential ?? null),
      );
      if (!verified) return;
      if (!verified.value || !authentication) return invalidCredentials(reply);
      const deletedAt = now.toISOString();
      const retentionExpiresAt = new Date(now.getTime() + ACCOUNT_RETENTION_MS).toISOString();
      const result = await options.repository.scheduleAccountDeletion({
        userId: authenticated.session.userId,
        currentSessionId: authenticated.session.id,
        expectedPasswordHash: authentication.credential.passwordHash,
        deletedAt,
        retentionExpiresAt,
        event: accountEvent(
          'account_deletion_scheduled',
          authenticated.session.userId,
          authenticated.session.id,
          deletedAt,
        ),
      });
      if (result.status === 'final_owner') {
        return reply.code(409).send({
          error: 'final_workspace_owner',
          message: 'Transfer or delete workspaces you solely own before deleting your account',
        });
      }
      if (result.status !== 'scheduled') return staleCredential(reply);
      reply.header('set-cookie', serializeExpiredAuthSessionCookie());
      return reply.code(202).send(result.deletion);
    },
  );
}

function accountEmailOutbox(
  challengeId: string,
  userId: string,
  recipientEmail: string,
  proof: 'current_email' | 'new_email',
  keyId: string,
  createdAt: string,
) {
  return {
    id: createAccountId('outbox'),
    type: 'account_email_change' as const,
    userId,
    challengeId,
    recipientEmail,
    proof,
    keyId,
    changePath: '/account/email-change',
    availableAt: createdAt,
    processedAt: null,
    attempts: 0,
    leaseVersion: 0,
    lastError: null,
    terminalAt: null,
    createdAt,
  };
}

function emailChangeSnapshot(change: {
  id: string;
  newEmailNormalized: string;
  currentVerifiedAt: string | null;
  newVerifiedAt: string | null;
  expiresAt: string;
}) {
  return {
    id: change.id,
    newEmail: change.newEmailNormalized,
    currentEmailVerified: change.currentVerifiedAt !== null,
    newEmailVerified: change.newVerifiedAt !== null,
    expiresAt: change.expiresAt,
  };
}

function requireRecentAuthentication(
  reply: FastifyReply,
  authenticatedAt: string,
  now: Date,
): boolean {
  if (isRecentAuthentication(authenticatedAt, now)) return true;
  void reply.code(403).send({
    error: 'recent_authentication_required',
    message: 'Sign in again before changing account security settings',
  });
  return false;
}

function invalidCredentials(reply: FastifyReply) {
  return reply.code(401).send({
    error: 'invalid_credentials',
    message: 'Current credentials could not be verified',
  });
}

function staleCredential(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'credential_changed',
    message: 'Account security changed in another session; sign in again',
  });
}

function createAccountId(prefix: 'acctevt' | 'authevt' | 'emailchange' | 'outbox'): string {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

function accountEvent(
  eventType:
    | 'email_change_started'
    | 'session_revoked'
    | 'sessions_revoked_all'
    | 'account_deletion_scheduled',
  userId: string,
  targetId: string,
  occurredAt: string,
) {
  return {
    id: createAccountId('acctevt'),
    userId,
    actorUserId: userId,
    eventType,
    targetId,
    occurredAt,
  } as const;
}

function emitAccountEvent(
  options: RegisterAccountManagementRoutesOptions,
  name: string,
  userId: string,
  attributes: Record<string, unknown> = {},
): void {
  options.observability.emit({
    name,
    timestamp: readAccountClock(options.clock).toISOString(),
    userId,
    attributes,
  });
}

function readAccountClock(clock: (() => Date) | undefined): Date {
  const now = clock?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Account clock is invalid');
  return now;
}

function setPrivateResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}
