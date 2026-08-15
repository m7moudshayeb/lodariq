import { randomBytes, randomUUID } from 'node:crypto';
import {
  CreateWorkspaceRequest,
  LODARIQ_APP_ORIGIN,
  PasswordRecoveryRequest,
  ResendEmailVerificationRequest,
  SelectWorkspaceParams,
  SetPasswordRequest,
  SetUsernameRequest,
  SignInRequest,
  SignUpRequest,
  AUTH_VERIFICATION_RESEND_COOLDOWN_MS,
  VerifyEmailRequest,
  createDefaultWorkspaceEnvironmentPolicy,
  type AuthOnboardingSnapshot,
  type AuthSessionSnapshot,
  type CreateWorkspaceRequest as CreateWorkspaceRequestType,
  type PasswordRecoveryRequest as PasswordRecoveryRequestType,
  type ResendEmailVerificationRequest as ResendEmailVerificationRequestType,
  type SelectWorkspaceParams as SelectWorkspaceParamsType,
  type SetPasswordRequest as SetPasswordRequestType,
  type SetUsernameRequest as SetUsernameRequestType,
  type SignInRequest as SignInRequestType,
  type SignUpRequest as SignUpRequestType,
  type VerifyEmailRequest as VerifyEmailRequestType,
} from '@lodariq/schema';
import {
  normalizeAuthIdentifier,
  validateAuthUsername,
  type AuthSessionRecord,
  type ControlPlaneRepository,
  type IdentityWorkspaceRecord,
  type IdentityOnboardingStateRecord,
  type PasswordAuthenticationRecord,
  type UserRecord,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthError,
  AUTH_CORRELATION_HEADER,
  AUTH_OBSERVABILITY_EVENTS,
  authenticateCredentialGateway,
  authenticateOwnedSession,
  createEmailVerificationToken,
  createAuthCorrelationId,
  createPasswordResetToken,
  createOwnedAuthSession,
  describeAuthDevice,
  EMAIL_VERIFICATION_TTL_MS,
  hashAuthEmailLookup,
  hashAuthRateBucket,
  hashAuthSessionToken,
  hashEmailVerificationToken,
  hashPasswordResetToken,
  hashOwnedPassword,
  isPasswordRecoveryEnabled,
  isPublicSignupEnabled,
  isRecentAuthentication,
  workspaceSessionPolicyFailure,
  normalizeAuthEmail,
  PASSWORD_RESET_TTL_MS,
  readEmailVerificationConfiguration,
  readAuthSessionToken,
  serializeAuthSessionCookie,
  serializeExpiredAuthSessionCookie,
  PasswordHashAdmissionError,
  PasswordHashAdmissionGate,
  verifyOwnedPassword,
  emitAuthRecoveryEvent,
  type EmailVerificationDeliveryCapability,
  type PasswordHashAdmissionGateLike,
} from '../auth';
import type { ObservabilitySink } from '../observability';

export interface RegisterAuthRoutesOptions {
  repository: ControlPlaneRepository;
  emailVerificationDelivery?: EmailVerificationDeliveryCapability;
  passwordHashAdmissionGate?: PasswordHashAdmissionGateLike;
  observability: ObservabilitySink;
  clock?: () => Date;
}

const AUTH_RATE_POLICIES = {
  'sign-in': {
    bucketPurpose: 'sign-in',
    persistedScope: 'sign-in',
    windowMs: 15 * 60 * 1_000,
    emailMaxAttempts: 8,
    sourceMaxAttempts: 120,
    blockMs: 15 * 60 * 1_000,
  },
  'sign-up': {
    bucketPurpose: 'sign-up',
    persistedScope: 'sign-up',
    windowMs: 60 * 60 * 1_000,
    emailMaxAttempts: 3,
    sourceMaxAttempts: 30,
    blockMs: 60 * 60 * 1_000,
  },
  'password-recovery-request': {
    bucketPurpose: 'password-recovery-request',
    persistedScope: 'sign-in',
    windowMs: 60 * 60 * 1_000,
    emailMaxAttempts: 3,
    sourceMaxAttempts: 20,
    blockMs: 60 * 60 * 1_000,
  },
  'verification-resend': {
    bucketPurpose: 'verification-resend',
    persistedScope: 'sign-up',
    windowMs: 60 * 60 * 1_000,
    emailMaxAttempts: 3,
    sourceMaxAttempts: 30,
    blockMs: 60 * 60 * 1_000,
  },
  'password-recovery-complete': {
    bucketPurpose: 'password-recovery-complete',
    persistedScope: 'sign-in',
    windowMs: 15 * 60 * 1_000,
    challengeMaxAttempts: 5,
    sourceMaxAttempts: 30,
    blockMs: 15 * 60 * 1_000,
  },
  'username-change': {
    bucketPurpose: 'username-change',
    persistedScope: 'sign-in',
    windowMs: 24 * 60 * 60 * 1_000,
    userMaxAttempts: 5,
    sourceMaxAttempts: 30,
    blockMs: 24 * 60 * 60 * 1_000,
  },
} as const;

const USERNAME_CHANGE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1_000;
const IDENTITY_ONBOARDING_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function registerAuthRoutes(
  fastify: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): void {
  const passwordHashAdmissionGate =
    options.passwordHashAdmissionGate ?? new PasswordHashAdmissionGate();
  fastify.addHook('onRequest', async (_request, reply) => {
    setPrivateResponseHeaders(reply);
  });

  fastify.post('/v1/auth/sign-up', { schema: { body: SignUpRequest } }, async (request, reply) => {
    setPrivateResponseHeaders(reply);
    if (!requireTrustedMutationOrigin(request, reply)) return;
    const credentialSource = requireCredentialGateway(request, reply);
    if (!credentialSource) return;
    const body = request.body as SignUpRequestType;
    const email = normalizeAuthEmail(body.email);
    const name = body.name.trim();
    const workspaceName = body.workspaceName.trim();
    if (!name || !workspaceName) return invalidInput(reply);
    if (!isPublicSignupEnabled()) return signupUnavailable(reply);
    const verification = readEmailVerificationConfiguration(
      process.env,
      options.emailVerificationDelivery,
    );
    if (!verification.available) return signupUnavailable(reply);
    if (
      !(await enforceEmailAuthRateLimits(
        options.repository,
        reply,
        'sign-up',
        email,
        credentialSource,
      ))
    ) {
      return;
    }

    const now = readAuthClock(options.clock);
    const createdAt = now.toISOString();
    const userId = createId('usr');
    const userEmailId = createId('email');
    const passwordIdentityId = createId('ident');
    const workspaceId = createId('wk');
    const onboardingId = createId('onboard');
    const challengeId = createId('verify');
    const outboxId = createId('outbox');
    const verificationPath = `/verify-email?challenge=${encodeURIComponent(challengeId)}`;
    const verificationToken = createEmailVerificationToken(challengeId, verification.secret);
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS).toISOString();
    const credentialResult = await runBoundedPasswordHash(
      passwordHashAdmissionGate,
      request,
      reply,
      () => hashOwnedPassword(userId, email, createPendingSignupSecret(), now),
    );
    if (!credentialResult) return;
    const credential = credentialResult.value;
    const user: UserRecord = {
      id: userId,
      legacyIdentityId: null,
      email,
      name,
      emailVerifiedAt: null,
      createdAt,
    };
    const created = await options.repository.registerIdentityAccount({
      user,
      userEmail: {
        id: userEmailId,
        userId,
        normalizedEmail: email,
        isPrimary: true,
        verifiedAt: null,
        createdAt,
        updatedAt: createdAt,
      },
      passwordIdentity: {
        id: passwordIdentityId,
        userId,
        kind: 'password',
        issuer: 'https://lodariq.io',
        subject: `user:${userId}`,
        providerTenantId: null,
        createdAt,
        lastAuthenticatedAt: null,
      },
      credential,
      onboarding: {
        id: onboardingId,
        userId,
        intent: 'create_workspace',
        status: 'pending_identity',
        targetWorkspaceId: workspaceId,
        targetWorkspaceName: workspaceName,
        invitationId: null,
        requestedWorkspaceId: null,
        completedWorkspaceId: null,
        version: 1,
        expiresAt: new Date(now.getTime() + IDENTITY_ONBOARDING_TTL_MS).toISOString(),
        createdAt,
        updatedAt: createdAt,
      },
      emailVerificationChallenge: {
        id: challengeId,
        userId,
        keyId: verification.keyId,
        tokenHash: hashEmailVerificationToken(verificationToken),
        expiresAt,
        usedAt: null,
        createdAt,
      },
      outboxMessage: {
        id: outboxId,
        type: 'email_verification',
        userId,
        recipientEmail: email,
        payload: {
          challengeId,
          verificationPath,
          keyId: verification.keyId,
        },
        availableAt: createdAt,
        processedAt: null,
        attempts: 0,
        lastError: null,
        createdAt,
      },
    });
    const replacement = created
      ? null
      : await options.repository.requestEmailVerificationChallenge({
          emailNormalized: email,
          emailLookupHash: hashAuthEmailLookup(email),
          now: createdAt,
          cooldownMs: AUTH_VERIFICATION_RESEND_COOLDOWN_MS,
          challenge: {
            id: challengeId,
            keyId: verification.keyId,
            tokenHash: hashEmailVerificationToken(verificationToken),
            expiresAt,
            usedAt: null,
            createdAt,
          },
          outboxMessage: {
            id: outboxId,
            type: 'email_verification',
            payload: { challengeId, verificationPath, keyId: verification.keyId },
            availableAt: createdAt,
            processedAt: null,
            attempts: 0,
            lastError: null,
            createdAt,
          },
        });
    const challengePersisted = created || replacement?.status === 'queued';
    options.observability.emit({
      name: 'auth.signup.completed',
      timestamp: readAuthClock(options.clock).toISOString(),
      attributes: {
        challengeId,
        outcome: created ? 'created' : (replacement?.status ?? 'persistence_conflict'),
      },
    });
    return reply.code(202).send({
      status: 'verification_required',
      ...(challengePersisted && verification.exposeDevelopmentToken
        ? { challengeId, expiresAt, verificationToken }
        : {}),
    });
  });

  fastify.post(
    '/v1/auth/resend-verification',
    { schema: { body: ResendEmailVerificationRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const verification = readEmailVerificationConfiguration(
        process.env,
        options.emailVerificationDelivery,
      );
      if (!verification.available) return signupUnavailable(reply);

      const email = normalizeAuthEmail((request.body as ResendEmailVerificationRequestType).email);
      if (
        !(await enforceEmailAuthRateLimits(
          options.repository,
          reply,
          'verification-resend',
          email,
          credentialSource,
        ))
      ) {
        return;
      }

      const now = readAuthClock(options.clock);
      const createdAt = now.toISOString();
      const challengeId = createId('verify');
      const outboxId = createId('outbox');
      const correlationId = createAuthCorrelationId();
      reply.header(AUTH_CORRELATION_HEADER, correlationId);
      const verificationToken = createEmailVerificationToken(challengeId, verification.secret);
      const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS).toISOString();
      const result = await options.repository.requestEmailVerificationChallenge({
        emailNormalized: email,
        emailLookupHash: hashAuthEmailLookup(email),
        now: createdAt,
        cooldownMs: AUTH_VERIFICATION_RESEND_COOLDOWN_MS,
        challenge: {
          id: challengeId,
          keyId: verification.keyId,
          tokenHash: hashEmailVerificationToken(verificationToken),
          expiresAt,
          usedAt: null,
          createdAt,
        },
        outboxMessage: {
          id: outboxId,
          type: 'email_verification',
          payload: {
            challengeId,
            verificationPath: `/verify-email?challenge=${encodeURIComponent(challengeId)}`,
            keyId: verification.keyId,
          },
          availableAt: createdAt,
          processedAt: null,
          attempts: 0,
          lastError: null,
          createdAt,
        },
      });
      options.observability.emit({
        name: 'auth.verification.resend.completed',
        timestamp: readAuthClock(options.clock).toISOString(),
        correlationId,
        attributes: { challengeId, outboxId, outcome: result.status },
      });

      return reply.code(202).send({
        status: 'accepted',
        ...(result.status === 'queued' && verification.exposeDevelopmentToken
          ? { challengeId, expiresAt, verificationToken }
          : {}),
      });
    },
  );

  fastify.post(
    '/v1/auth/verify-email',
    { schema: { body: VerifyEmailRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      if (!requireCredentialGateway(request, reply)) return;
      const body = request.body as VerifyEmailRequestType;
      const tokenHash = hashEmailVerificationToken(body.token);
      const now = readAuthClock(options.clock);
      const resolved = await options.repository.resolveEmailVerificationChallenge(
        body.challengeId,
        tokenHash,
        now.toISOString(),
      );
      if (!resolved) return invalidVerificationLink(reply);

      const credentialResult = await runBoundedPasswordHash(
        passwordHashAdmissionGate,
        request,
        reply,
        () => hashOwnedPassword(resolved.userId, resolved.emailNormalized, body.password, now),
      );
      if (!credentialResult) return;
      const credential = credentialResult.value;
      const user = await options.repository.consumeEmailVerificationChallenge({
        challengeId: body.challengeId,
        tokenHash,
        usedAt: now.toISOString(),
        credential: credentialMaterial(credential),
      });
      if (!user) return invalidVerificationLink(reply);

      if (
        !(await ensureIdentityOnboardingComplete(options.repository, user.id, now.toISOString()))
      ) {
        return onboardingUnavailable(reply);
      }

      const workspaces = await options.repository.listIdentityWorkspaces(user.id);
      const authentication = await options.repository.findPasswordAuthenticationByUserId(user.id);
      if (!authentication) return staleSession(reply);
      const createdSession = await createCredentialBoundSession(
        options.repository,
        user.id,
        workspaces,
        authentication,
        'standard',
        describeAuthDevice(request.headers['user-agent']),
      );
      if (!createdSession) return staleSession(reply);
      setSessionCookie(reply, createdSession.rawToken, createdSession.record);
      return createSessionSnapshot(user, createdSession.record.activeWorkspaceId, workspaces);
    },
  );

  fastify.post(
    '/v1/auth/password-recovery',
    { schema: { body: PasswordRecoveryRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      if (!isPasswordRecoveryEnabled()) return passwordRecoveryUnavailable(reply);
      const delivery = readEmailVerificationConfiguration(
        process.env,
        options.emailVerificationDelivery,
      );
      if (!delivery.available) return passwordRecoveryUnavailable(reply);

      const email = normalizeAuthEmail((request.body as PasswordRecoveryRequestType).email);
      if (
        !(await enforceEmailAuthRateLimits(
          options.repository,
          reply,
          'password-recovery-request',
          email,
          credentialSource,
        ))
      ) {
        return;
      }

      const now = readAuthClock(options.clock);
      const createdAt = now.toISOString();
      const challengeId = createId('reset');
      const outboxId = createId('outbox');
      const correlationId = createAuthCorrelationId();
      reply.header(AUTH_CORRELATION_HEADER, correlationId);
      const resetToken = createPasswordResetToken(challengeId, delivery.secret);
      const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString();
      emitAuthRecoveryEvent(options.observability, {
        name: AUTH_OBSERVABILITY_EVENTS.recoveryRequested,
        correlationId,
        observedAt: now,
        attributes: { challengeId, outboxId },
      });
      const requestResult = await options.repository.requestSetPasswordChallenge({
        emailNormalized: email,
        emailLookupHash: hashAuthEmailLookup(email),
        challenge: {
          id: challengeId,
          keyId: delivery.keyId,
          tokenHash: hashPasswordResetToken(resetToken),
          emailNormalized: email,
          emailLookupHash: hashAuthEmailLookup(email),
          expiresAt,
          usedAt: null,
          createdAt,
        },
        outboxMessage: {
          id: outboxId,
          type: 'set_password',
          payload: {
            purpose: 'set_password',
            challengeId,
            resetPath: `/reset-password?challenge=${encodeURIComponent(challengeId)}`,
            keyId: delivery.keyId,
          },
          availableAt: createdAt,
          processedAt: null,
          attempts: 0,
          lastError: null,
          createdAt,
        },
      });
      if (requestResult.status === 'queued') {
        emitAuthRecoveryEvent(options.observability, {
          name: AUTH_OBSERVABILITY_EVENTS.recoveryChallengePersisted,
          correlationId,
          observedAt: readAuthClock(options.clock),
          attributes: { challengeId, outboxId },
        });
      }
      emitAuthRecoveryEvent(options.observability, {
        name: AUTH_OBSERVABILITY_EVENTS.recoveryRequestCompleted,
        correlationId,
        observedAt: readAuthClock(options.clock),
        attributes: {
          challengeId,
          outboxId,
          outcome: requestResult.status,
        },
      });

      return reply.code(202).send({
        status: 'accepted',
        ...(delivery.exposeDevelopmentToken ? { challengeId, expiresAt, resetToken } : {}),
      });
    },
  );

  fastify.post(
    '/v1/auth/set-password',
    { schema: { body: SetPasswordRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const body = request.body as SetPasswordRequestType;
      if (
        !(await enforceChallengeAuthRateLimits(
          options.repository,
          reply,
          body.challengeId,
          credentialSource,
        ))
      ) {
        return;
      }

      const tokenHash = hashPasswordResetToken(body.token);
      const now = readAuthClock(options.clock);
      const usedAt = now.toISOString();
      const correlationId = createAuthCorrelationId();
      reply.header(AUTH_CORRELATION_HEADER, correlationId);
      const resolved = await options.repository.resolveSetPasswordChallenge(
        body.challengeId,
        tokenHash,
        usedAt,
      );
      emitAuthRecoveryEvent(options.observability, {
        name: AUTH_OBSERVABILITY_EVENTS.recoveryChallengeResolved,
        correlationId,
        observedAt: now,
        attributes: {
          challengeId: body.challengeId,
          outcome: resolved ? 'resolved' : 'rejected',
        },
      });
      if (!resolved) return invalidPasswordLink(reply);

      const credentialResult = await runBoundedPasswordHash(
        passwordHashAdmissionGate,
        request,
        reply,
        () => hashOwnedPassword(resolved.userId, resolved.emailNormalized, body.password, now),
      );
      if (!credentialResult) return;
      const credential = credentialMaterial(credentialResult.value);
      const user = await options.repository.consumeSetPasswordChallenge({
        challengeId: body.challengeId,
        tokenHash,
        usedAt,
        credential,
        passwordIdentity: {
          id: createId('ident'),
          userId: resolved.userId,
          kind: 'password',
          issuer: 'https://lodariq.io',
          subject: `user:${resolved.userId}`,
          providerTenantId: null,
          createdAt: usedAt,
          lastAuthenticatedAt: null,
        },
      });
      if (!user) return invalidPasswordLink(reply);
      emitAuthRecoveryEvent(options.observability, {
        name: AUTH_OBSERVABILITY_EVENTS.recoveryChallengeConsumed,
        correlationId,
        observedAt: readAuthClock(options.clock),
        attributes: { challengeId: body.challengeId },
      });

      if (!(await ensureIdentityOnboardingComplete(options.repository, user.id, usedAt))) {
        return onboardingUnavailable(reply);
      }

      const workspaces = await options.repository.listIdentityWorkspaces(user.id);
      const authentication = await options.repository.findPasswordAuthenticationByUserId(user.id);
      if (!authentication) return staleSession(reply);
      const createdSession = await createCredentialBoundSession(
        options.repository,
        user.id,
        workspaces,
        authentication,
        'standard',
        describeAuthDevice(request.headers['user-agent']),
      );
      if (!createdSession) return staleSession(reply);
      setSessionCookie(reply, createdSession.rawToken, createdSession.record);
      return {
        status: 'password_updated',
        session: createSessionSnapshot(user, createdSession.record.activeWorkspaceId, workspaces),
      };
    },
  );

  fastify.post('/v1/auth/sign-in', { schema: { body: SignInRequest } }, async (request, reply) => {
    setPrivateResponseHeaders(reply);
    if (!requireTrustedMutationOrigin(request, reply)) return;
    const credentialSource = requireCredentialGateway(request, reply);
    if (!credentialSource) return;
    const body = request.body as SignInRequestType;
    const identifier = normalizeAuthIdentifier(body.identifier);
    if (!identifier) return invalidCredentials(reply);
    if (
      !(await enforceIdentifierAuthRateLimits(
        options.repository,
        reply,
        identifier.value,
        credentialSource,
      ))
    ) {
      return;
    }
    const authentication = await options.repository.findPasswordAuthenticationByIdentifier(
      identifier,
      identifier.kind === 'email' ? hashAuthEmailLookup(identifier.value) : null,
    );
    const passwordResult = await runBoundedPasswordHash(
      passwordHashAdmissionGate,
      request,
      reply,
      () => verifyOwnedPassword(body.password, authentication?.credential ?? null),
    );
    if (!passwordResult) return;
    const validPassword = passwordResult.value;
    if (!authentication || !validPassword) return invalidCredentials(reply);

    const user = await options.repository.getIdentityUser(authentication.credential.userId);
    if (!user?.emailVerifiedAt) return invalidCredentials(reply);
    if (
      !(await ensureIdentityOnboardingComplete(
        options.repository,
        user.id,
        readAuthClock(options.clock).toISOString(),
      ))
    ) {
      return onboardingUnavailable(reply);
    }
    const workspaces = await options.repository.listIdentityWorkspaces(user.id);
    const createdSession = await createCredentialBoundSession(
      options.repository,
      user.id,
      workspaces,
      authentication,
      body.rememberMe ? 'remembered' : 'standard',
      describeAuthDevice(request.headers['user-agent']),
    );
    if (!createdSession) return invalidCredentials(reply);
    setSessionCookie(reply, createdSession.rawToken, createdSession.record);
    return createSessionSnapshot(user, createdSession.record.activeWorkspaceId, workspaces);
  });

  fastify.get('/v1/auth/username', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const username = await options.repository.getAuthUsername(authenticated.session.userId);
    return { username: username?.displayUsername ?? null };
  });

  fastify.get('/v1/auth/onboarding', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const onboarding = await options.repository.getCurrentIdentityOnboarding(
      authenticated.session.userId,
    );
    return onboarding ? toAuthOnboardingSnapshot(onboarding) : null;
  });

  fastify.put(
    '/v1/auth/username',
    { schema: { body: SetUsernameRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readAuthClock(options.clock);
      if (!isRecentAuthentication(authenticated.session.authenticatedAt, now)) {
        return reply.code(403).send({
          error: 'recent_authentication_required',
          message: 'Sign in again before changing your username',
        });
      }
      if (
        !(await enforceUsernameChangeRateLimits(
          options.repository,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const body = request.body as SetUsernameRequestType;
      const username = validateAuthUsername(body.username);
      if (!username.valid) {
        return reply.code(400).send({
          error: `username_${username.reason}`,
          message: 'Choose a different username',
        });
      }
      const authentication = await options.repository.findPasswordAuthenticationByUserId(
        authenticated.session.userId,
      );
      const passwordResult = await runBoundedPasswordHash(
        passwordHashAdmissionGate,
        request,
        reply,
        () => verifyOwnedPassword(body.password, authentication?.credential ?? null),
      );
      if (!passwordResult) return;
      if (!authentication || !passwordResult.value) return invalidCredentials(reply);
      const result = await options.repository.setAuthUsername({
        userId: authenticated.session.userId,
        normalizedUsername: username.normalizedUsername,
        displayUsername: username.displayUsername,
        expectedPasswordHash: authentication.credential.passwordHash,
        changedAt: now.toISOString(),
        minimumPreviousChangeAt: new Date(
          now.getTime() - USERNAME_CHANGE_INTERVAL_MS,
        ).toISOString(),
        usernameId: createId('uname'),
      });
      if (result.status === 'conflict') {
        return reply.code(409).send({
          error: 'username_unavailable',
          message: 'Choose a different username',
        });
      }
      if (result.status === 'rate_limited') {
        reply.header('retry-after', String(USERNAME_CHANGE_INTERVAL_MS / 1_000));
        return reply.code(429).send({
          error: 'username_change_limited',
          message: 'A username can be changed only once every 30 days',
        });
      }
      if (result.status !== 'updated' || !result.username) return staleSession(reply);
      options.observability.emit({
        name: 'auth.username.changed',
        timestamp: now.toISOString(),
        attributes: { userId: authenticated.session.userId },
      });
      return { username: result.username.displayUsername };
    },
  );

  fastify.post('/v1/auth/sign-out', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    if (!requireTrustedMutationOrigin(request, reply)) return;
    const rawToken = readAuthSessionToken(request);
    if (rawToken) {
      await options.repository.revokeAuthSession(
        hashAuthSessionToken(rawToken),
        new Date().toISOString(),
      );
    }
    reply.header('set-cookie', serializeExpiredAuthSessionCookie());
    return reply.code(204).send();
  });

  fastify.get('/v1/auth/session', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    return loadSessionSnapshot(options.repository, authenticated.session, authenticated.user);
  });

  fastify.get('/v1/workspaces', async (request, reply) => {
    setPrivateResponseHeaders(reply);
    const authenticated = await requireOwnedSession(options.repository, request, reply);
    if (!authenticated) return;
    const workspaces = await options.repository.listIdentityWorkspaces(
      authenticated.session.userId,
    );
    return {
      activeWorkspaceId: validActiveWorkspaceId(
        authenticated.session.activeWorkspaceId,
        workspaces,
      ),
      workspaces: toWorkspaceSummaries(workspaces),
    };
  });

  fastify.post(
    '/v1/workspaces',
    { schema: { body: CreateWorkspaceRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const name = (request.body as CreateWorkspaceRequestType).name.trim();
      if (!name) return invalidInput(reply);

      const workspaceId = createId('wk');
      const createdAt = new Date().toISOString();
      const created = await options.repository.createIdentityWorkspace({
        userId: authenticated.session.userId,
        workspace: { id: workspaceId, name, createdAt, updatedAt: createdAt },
        membership: {
          workspaceId,
          userId: authenticated.session.userId,
          role: 'owner',
          createdAt,
        },
        environments: createWorkspaceEnvironments(workspaceId, createdAt),
      });
      if (!created) {
        return reply.code(409).send({
          error: 'workspace_conflict',
          message: 'Unable to create workspace',
        });
      }

      const rotated = await rotateSession(
        options.repository,
        authenticated.tokenHash,
        authenticated.session,
        workspaceId,
      );
      if (!rotated) return staleSession(reply);
      setSessionCookie(reply, rotated.rawToken, rotated.record);
      return reply
        .code(201)
        .send(await loadSessionSnapshot(options.repository, rotated.record, authenticated.user));
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/select',
    { schema: { params: SelectWorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { workspaceId } = request.params as SelectWorkspaceParamsType;
      const workspaces = await options.repository.listIdentityWorkspaces(
        authenticated.session.userId,
      );
      if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
        return reply.code(404).send({
          error: 'workspace_not_found',
          message: 'Workspace was not found for this account',
        });
      }
      const policy = await options.repository.getWorkspaceAuthPolicy(workspaceId);
      if (!policy) {
        return reply.code(403).send({
          error: 'workspace_auth_policy_unavailable',
          message: 'Workspace authentication policy could not be verified',
        });
      }
      const workspaceSsoIdentitySatisfied = policy.ssoRequired
        ? await options.repository.identitySatisfiesWorkspaceSso(
            workspaceId,
            authenticated.session.identityId,
          )
        : false;
      const policyFailure = workspaceSessionPolicyFailure(
        authenticated.session,
        policy,
        workspaceSsoIdentitySatisfied,
      );
      if (policyFailure) return sendWorkspaceSessionPolicyFailure(reply, policyFailure);

      const rotated = await rotateSession(
        options.repository,
        authenticated.tokenHash,
        authenticated.session,
        workspaceId,
      );
      if (!rotated) return staleSession(reply);
      setSessionCookie(reply, rotated.rawToken, rotated.record);
      return loadSessionSnapshot(options.repository, rotated.record, authenticated.user);
    },
  );
}

export async function runBoundedPasswordHash<T>(
  gate: PasswordHashAdmissionGateLike,
  request: FastifyRequest,
  reply: FastifyReply,
  operation: () => Promise<T>,
): Promise<{ value: T } | null> {
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  request.raw.once('aborted', abort);
  try {
    const value = await gate.run(operation, abortController.signal);
    if (abortController.signal.aborted || request.raw.aborted || reply.raw.destroyed) return null;
    return { value };
  } catch (error) {
    if (!(error instanceof PasswordHashAdmissionError)) throw error;
    if (error.reason === 'aborted' || request.raw.aborted || reply.raw.destroyed) return null;
    reply.header('retry-after', '2');
    await reply.code(503).send({
      error: 'credential_service_busy',
      message: 'Credential service is busy; try again shortly',
    });
    return null;
  } finally {
    request.raw.off('aborted', abort);
  }
}

export async function requireOwnedSession(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const authenticated = await authenticateOwnedSession(repository, request);
    return authenticated;
  } catch (error) {
    if (error instanceof AuthError) {
      reply.header('set-cookie', serializeExpiredAuthSessionCookie());
      await reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
      return null;
    }
    throw error;
  }
}

async function loadSessionSnapshot(
  repository: ControlPlaneRepository,
  session: AuthSessionRecord,
  user: UserRecord,
): Promise<AuthSessionSnapshot> {
  const workspaces = await repository.listIdentityWorkspaces(session.userId);
  return createSessionSnapshot(
    user,
    validActiveWorkspaceId(session.activeWorkspaceId, workspaces),
    workspaces,
  );
}

async function rotateSession(
  repository: ControlPlaneRepository,
  currentTokenHash: string,
  current: AuthSessionRecord,
  activeWorkspaceId: string,
) {
  const next = createOwnedAuthSession(current.userId, activeWorkspaceId, {
    absoluteExpiresAt: current.absoluteExpiresAt,
    identityId: current.identityId,
    authenticationMethod: current.authenticationMethod,
    assuranceLevel: current.assuranceLevel,
    authenticatedAt: current.authenticatedAt,
    durationPolicy: current.durationPolicy,
    deviceLabel: current.deviceLabel,
  });
  const rotated = await repository.rotateAuthSession({
    currentTokenHash,
    nextSession: next.record,
  });
  return rotated ? { rawToken: next.rawToken, record: rotated } : null;
}

async function createCredentialBoundSession(
  repository: ControlPlaneRepository,
  userId: string,
  workspaces: IdentityWorkspaceRecord[],
  authentication: PasswordAuthenticationRecord,
  durationPolicy: 'standard' | 'remembered',
  deviceLabel: string,
) {
  const candidate = createOwnedAuthSession(userId, workspaces[0]?.id ?? null, {
    identityId: authentication.identity.id,
    authenticationMethod: 'password',
    assuranceLevel: 'aal1',
    durationPolicy,
    deviceLabel,
  });
  const record = await repository.createCredentialBoundAuthSession({
    session: candidate.record,
    expectedPasswordHash: authentication.credential.passwordHash,
  });
  return record ? { rawToken: candidate.rawToken, record } : null;
}

function createSessionSnapshot(
  user: UserRecord,
  activeWorkspaceId: string | null,
  workspaces: IdentityWorkspaceRecord[],
): AuthSessionSnapshot {
  return {
    user: { id: user.id, email: user.email, name: user.name ?? null },
    activeWorkspaceId,
    workspaces: toWorkspaceSummaries(workspaces),
  };
}

async function ensureIdentityOnboardingComplete(
  repository: ControlPlaneRepository,
  userId: string,
  completedAt: string,
): Promise<boolean> {
  const onboarding = await repository.getCurrentIdentityOnboarding(userId);
  if (!onboarding || onboarding.status === 'completed') return true;
  if (
    onboarding.status === 'cancelled' ||
    onboarding.intent !== 'create_workspace' ||
    !onboarding.targetWorkspaceId ||
    (onboarding.status === 'pending_identity' && onboarding.expiresAt <= completedAt)
  ) {
    return false;
  }
  const completed = await repository.completeIdentityOnboarding({
    onboardingId: onboarding.id,
    userId,
    targetWorkspaceId: onboarding.targetWorkspaceId,
    environments: createWorkspaceEnvironments(onboarding.targetWorkspaceId, completedAt),
    completedAt,
  });
  return Boolean(completed);
}

function toAuthOnboardingSnapshot(
  onboarding: IdentityOnboardingStateRecord,
): AuthOnboardingSnapshot {
  return {
    id: onboarding.id,
    intent: onboarding.intent,
    status: onboarding.status,
    targetWorkspaceId: onboarding.targetWorkspaceId,
    invitationId: onboarding.invitationId,
    completedWorkspaceId: onboarding.completedWorkspaceId,
    expiresAt: onboarding.expiresAt,
  };
}

function toWorkspaceSummaries(workspaces: IdentityWorkspaceRecord[]) {
  return workspaces.map(({ id, name, role }) => ({ id, name, role }));
}

function validActiveWorkspaceId(
  activeWorkspaceId: string | null,
  workspaces: IdentityWorkspaceRecord[],
): string | null {
  return activeWorkspaceId && workspaces.some(({ id }) => id === activeWorkspaceId)
    ? activeWorkspaceId
    : null;
}

function createWorkspaceEnvironments(
  workspaceId: string,
  timestamp: string,
): WorkspaceEnvironment[] {
  const ids = {
    development: createId('env'),
    staging: createId('env'),
    production: createId('env'),
  };
  return createDefaultWorkspaceEnvironmentPolicy(workspaceId, ids).environments.map(
    (environment) => ({
      id: environment.id,
      workspaceId: environment.workspaceId,
      kind: environment.kind,
      name: environment.displayName,
      originAllowlist: [...environment.allowedOrigins],
      requiredApprovalCount: environment.releasePolicy.requiredApprovalCount,
      enabled: environment.enabled,
      pipelinePosition: environment.pipelinePosition,
      authoringEnabled: environment.authoringEnabled,
      ...(environment.promotionSourceEnvironmentId
        ? { promotionSourceEnvironmentId: environment.promotionSourceEnvironmentId }
        : {}),
      releasePolicy: environment.releasePolicy,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
}

function credentialMaterial(credential: Awaited<ReturnType<typeof hashOwnedPassword>>) {
  return {
    algorithm: credential.algorithm,
    passwordHash: credential.passwordHash,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

function setSessionCookie(reply: FastifyReply, rawToken: string, session: AuthSessionRecord): void {
  reply.header(
    'set-cookie',
    serializeAuthSessionCookie(rawToken, {
      ...(session.durationPolicy === 'remembered' ? { expiresAt: session.absoluteExpiresAt } : {}),
    }),
  );
}

function setPrivateResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}

async function enforceEmailAuthRateLimits(
  repository: ControlPlaneRepository,
  reply: FastifyReply,
  scope: 'sign-in' | 'sign-up' | 'verification-resend' | 'password-recovery-request',
  email: string,
  source: string,
): Promise<boolean> {
  const policy = AUTH_RATE_POLICIES[scope];
  return enforceAuthRateDimensions(
    repository,
    reply,
    policy,
    source,
    'email',
    email,
    policy.emailMaxAttempts,
  );
}

async function enforceIdentifierAuthRateLimits(
  repository: ControlPlaneRepository,
  reply: FastifyReply,
  identifier: string,
  source: string,
): Promise<boolean> {
  const policy = AUTH_RATE_POLICIES['sign-in'];
  return enforceAuthRateDimensions(
    repository,
    reply,
    policy,
    source,
    'identifier',
    identifier,
    policy.emailMaxAttempts,
  );
}

async function enforceUsernameChangeRateLimits(
  repository: ControlPlaneRepository,
  reply: FastifyReply,
  userId: string,
  source: string,
): Promise<boolean> {
  const policy = AUTH_RATE_POLICIES['username-change'];
  return enforceAuthRateDimensions(
    repository,
    reply,
    policy,
    source,
    'user',
    userId,
    policy.userMaxAttempts,
  );
}

async function enforceChallengeAuthRateLimits(
  repository: ControlPlaneRepository,
  reply: FastifyReply,
  challengeId: string,
  source: string,
): Promise<boolean> {
  const policy = AUTH_RATE_POLICIES['password-recovery-complete'];
  return enforceAuthRateDimensions(
    repository,
    reply,
    policy,
    source,
    'challenge',
    challengeId,
    policy.challengeMaxAttempts,
  );
}

async function enforceAuthRateDimensions(
  repository: ControlPlaneRepository,
  reply: FastifyReply,
  policy: (typeof AUTH_RATE_POLICIES)[keyof typeof AUTH_RATE_POLICIES],
  source: string,
  identityDimension: 'challenge' | 'email' | 'identifier' | 'user',
  identityValue: string,
  identityMaxAttempts: number,
): Promise<boolean> {
  const now = new Date().toISOString();
  const sourceResult = await repository.consumeAuthRateLimit({
    bucketHash: hashAuthRateBucket(policy.bucketPurpose, 'source', source),
    scope: policy.persistedScope,
    now,
    windowMs: policy.windowMs,
    maxAttempts: policy.sourceMaxAttempts,
    blockMs: policy.blockMs,
  });
  await repository.pruneAuthRateLimits(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
    32,
  );
  if (!sourceResult.allowed) {
    return sendRateLimitResponse(reply, sourceResult.retryAfterSeconds);
  }

  const identityResult = await repository.consumeAuthRateLimit({
    bucketHash: hashAuthRateBucket(policy.bucketPurpose, identityDimension, identityValue),
    scope: policy.persistedScope,
    now,
    windowMs: policy.windowMs,
    maxAttempts: identityMaxAttempts,
    blockMs: policy.blockMs,
  });
  if (identityResult.allowed) return true;
  return sendRateLimitResponse(reply, identityResult.retryAfterSeconds);
}

async function sendRateLimitResponse(
  reply: FastifyReply,
  retryAfterSeconds: number,
): Promise<false> {
  reply.header('retry-after', String(Math.max(retryAfterSeconds, 1)));
  await reply.code(429).send({
    error: 'rate_limited',
    message: 'Too many attempts; try again later',
  });
  return false;
}

export function requireCredentialGateway(
  request: FastifyRequest,
  reply: FastifyReply,
): string | null {
  try {
    return authenticateCredentialGateway(request);
  } catch (error) {
    if (error instanceof AuthError) {
      void reply.code(error.statusCode).send({
        error: 'credential_request_rejected',
        message: error.message,
      });
      return null;
    }
    throw error;
  }
}

export function requireTrustedMutationOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const originHeader = readRequestHeader(request, 'origin');
  const fetchSite = readRequestHeader(request, 'sec-fetch-site');
  if (!originHeader) {
    // Server-to-server/BFF calls do not carry Fetch Metadata. Browser mutation
    // requests must prove their exact first-party origin.
    if (!fetchSite) return true;
    void reply.code(403).send({ error: 'origin_forbidden', message: 'Trusted origin required' });
    return false;
  }

  let exactOrigin: string;
  try {
    exactOrigin = new URL(originHeader).origin;
  } catch {
    void reply.code(403).send({ error: 'origin_forbidden', message: 'Trusted origin required' });
    return false;
  }
  if (exactOrigin !== originHeader || !trustedMutationOrigins().has(exactOrigin)) {
    void reply.code(403).send({ error: 'origin_forbidden', message: 'Trusted origin required' });
    return false;
  }
  reply.header('access-control-allow-origin', exactOrigin);
  reply.header('access-control-allow-credentials', 'true');
  reply.header('vary', 'Origin');
  return true;
}

function trustedMutationOrigins(): Set<string> {
  const configured = process.env.LODARIQ_AUTH_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = new Set([LODARIQ_APP_ORIGIN, ...(configured ?? [])]);
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3002');
    origins.add('http://127.0.0.1:3002');
  }
  return origins;
}

function readRequestHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function createId(
  prefix:
    | 'usr'
    | 'wk'
    | 'env'
    | 'verify'
    | 'reset'
    | 'outbox'
    | 'email'
    | 'ident'
    | 'uname'
    | 'onboard'
    | 'authevt',
): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function createPendingSignupSecret(): string {
  // This is never a user credential. It keeps an unverified account unusable
  // until the email owner atomically replaces it with their chosen password.
  return randomBytes(32).toString('base64url');
}

function readAuthClock(clock: (() => Date) | undefined): Date {
  const value = clock?.() ?? new Date();
  if (!Number.isFinite(value.getTime()))
    throw new Error('Authentication clock returned invalid time');
  return value;
}

function invalidPasswordLink(reply: FastifyReply) {
  return reply.code(400).send({
    error: 'password_reset_invalid',
    message: 'Password link is invalid or expired',
  });
}

function invalidVerificationLink(reply: FastifyReply) {
  return reply.code(400).send({
    error: 'verification_invalid',
    message: 'Verification link is invalid or expired',
  });
}

function onboardingUnavailable(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'onboarding_incomplete',
    message: 'Account setup could not be completed; sign in again to resume',
  });
}

function invalidCredentials(reply: FastifyReply) {
  return reply.code(401).send({
    error: 'invalid_credentials',
    message: 'Email, username, or password is incorrect',
  });
}

function invalidInput(reply: FastifyReply) {
  return reply
    .code(400)
    .send({ error: 'invalid_input', message: 'Required values cannot be blank' });
}

function signupUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: 'signup_unavailable',
    message: 'Account creation is temporarily unavailable',
  });
}

function passwordRecoveryUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: 'password_recovery_unavailable',
    message: 'Password recovery is temporarily unavailable',
  });
}

function staleSession(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'session_changed',
    message: 'Your session changed; refresh and try again',
  });
}

function sendWorkspaceSessionPolicyFailure(
  reply: FastifyReply,
  failure: 'minimum_assurance_required' | 'password_not_allowed' | 'enterprise_sso_required',
) {
  let message = 'Enterprise sign-in is required for this workspace';
  if (failure === 'minimum_assurance_required') {
    message = 'A stronger authentication method is required for this workspace';
  } else if (failure === 'password_not_allowed') {
    message = 'Password authentication is not allowed for this workspace';
  }
  return reply.code(403).send({ error: failure, message });
}
