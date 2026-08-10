import { randomBytes, randomUUID } from 'node:crypto';
import {
  CreateWorkspaceRequest,
  LODARIQ_APP_ORIGIN,
  PasswordRecoveryRequest,
  SelectWorkspaceParams,
  SetPasswordRequest,
  SignInRequest,
  SignUpRequest,
  VerifyEmailRequest,
  createDefaultWorkspaceEnvironmentPolicy,
  type AuthSessionSnapshot,
  type CreateWorkspaceRequest as CreateWorkspaceRequestType,
  type PasswordRecoveryRequest as PasswordRecoveryRequestType,
  type SelectWorkspaceParams as SelectWorkspaceParamsType,
  type SetPasswordRequest as SetPasswordRequestType,
  type SignInRequest as SignInRequestType,
  type SignUpRequest as SignUpRequestType,
  type VerifyEmailRequest as VerifyEmailRequestType,
} from '@lodariq/schema';
import type {
  AuthSessionRecord,
  ControlPlaneRepository,
  IdentityWorkspaceRecord,
  UserRecord,
  WorkspaceEnvironment,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthError,
  authenticateCredentialGateway,
  authenticateOwnedSession,
  createEmailVerificationToken,
  createPasswordResetToken,
  createOwnedAuthSession,
  EMAIL_VERIFICATION_TTL_MS,
  hashAuthEmailLookup,
  hashAuthRateBucket,
  hashAuthSessionToken,
  hashEmailVerificationToken,
  hashPasswordResetToken,
  hashOwnedPassword,
  isPasswordRecoveryEnabled,
  isPublicSignupEnabled,
  normalizeAuthEmail,
  PASSWORD_RESET_TTL_MS,
  readEmailVerificationConfiguration,
  readAuthSessionToken,
  serializeAuthSessionCookie,
  serializeExpiredAuthSessionCookie,
  PasswordHashAdmissionError,
  PasswordHashAdmissionGate,
  verifyOwnedPassword,
  type EmailVerificationDeliveryCapability,
  type PasswordHashAdmissionGateLike,
} from '../auth';

export interface RegisterAuthRoutesOptions {
  repository: ControlPlaneRepository;
  emailVerificationDelivery?: EmailVerificationDeliveryCapability;
  passwordHashAdmissionGate?: PasswordHashAdmissionGateLike;
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
  'password-recovery-complete': {
    bucketPurpose: 'password-recovery-complete',
    persistedScope: 'sign-in',
    windowMs: 15 * 60 * 1_000,
    challengeMaxAttempts: 5,
    sourceMaxAttempts: 30,
    blockMs: 15 * 60 * 1_000,
  },
} as const;

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

    const now = new Date();
    const createdAt = now.toISOString();
    const userId = createId('usr');
    const workspaceId = createId('wk');
    const challengeId = createId('verify');
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
    const created = await options.repository.createIdentityAccount({
      user,
      credential,
      workspace: {
        id: workspaceId,
        name: workspaceName,
        createdAt,
        updatedAt: createdAt,
      },
      membership: { workspaceId, userId, role: 'owner', createdAt },
      environments: createWorkspaceEnvironments(workspaceId, createdAt),
      emailVerificationChallenge: {
        id: challengeId,
        userId,
        tokenHash: hashEmailVerificationToken(verificationToken),
        expiresAt,
        usedAt: null,
        createdAt,
      },
      outboxMessage: {
        id: createId('outbox'),
        type: 'email_verification',
        userId,
        recipientEmail: email,
        payload: {
          challengeId,
          verificationPath: `/verify-email?challenge=${encodeURIComponent(challengeId)}`,
        },
        availableAt: createdAt,
        processedAt: null,
        attempts: 0,
        lastError: null,
        createdAt,
      },
    });
    // Duplicate accounts receive the same accepted response shape so public
    // sign-up cannot be used to enumerate registered email addresses.
    void created;
    return reply.code(202).send({
      status: 'verification_required',
      challengeId,
      expiresAt,
      ...(verification.exposeDevelopmentToken ? { verificationToken } : {}),
    });
  });

  fastify.post(
    '/v1/auth/verify-email',
    { schema: { body: VerifyEmailRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      if (!requireCredentialGateway(request, reply)) return;
      const body = request.body as VerifyEmailRequestType;
      const tokenHash = hashEmailVerificationToken(body.token);
      const now = new Date();
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

      const workspaces = await options.repository.listIdentityWorkspaces(user.id);
      const createdSession = await createCredentialBoundSession(
        options.repository,
        user.id,
        workspaces,
        credential.passwordHash,
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

      const now = new Date();
      const createdAt = now.toISOString();
      const challengeId = createId('reset');
      const resetToken = createPasswordResetToken(challengeId, delivery.secret);
      const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString();
      await options.repository.requestSetPasswordChallenge({
        emailNormalized: email,
        emailLookupHash: hashAuthEmailLookup(email),
        challenge: {
          id: challengeId,
          tokenHash: hashPasswordResetToken(resetToken),
          emailNormalized: email,
          emailLookupHash: hashAuthEmailLookup(email),
          expiresAt,
          usedAt: null,
          createdAt,
        },
        outboxMessage: {
          id: createId('outbox'),
          type: 'set_password',
          payload: {
            purpose: 'set_password',
            challengeId,
            resetPath: `/reset-password?challenge=${encodeURIComponent(challengeId)}`,
          },
          availableAt: createdAt,
          processedAt: null,
          attempts: 0,
          lastError: null,
          createdAt,
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
      const now = new Date();
      const usedAt = now.toISOString();
      const resolved = await options.repository.resolveSetPasswordChallenge(
        body.challengeId,
        tokenHash,
        usedAt,
      );
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
      });
      if (!user) return invalidPasswordLink(reply);

      const workspaces = await options.repository.listIdentityWorkspaces(user.id);
      const createdSession = await createCredentialBoundSession(
        options.repository,
        user.id,
        workspaces,
        credential.passwordHash,
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
    const email = normalizeAuthEmail(body.email);
    if (
      !(await enforceEmailAuthRateLimits(
        options.repository,
        reply,
        'sign-in',
        email,
        credentialSource,
      ))
    ) {
      return;
    }
    const credential = await options.repository.findPasswordCredentialByEmail(
      email,
      hashAuthEmailLookup(email),
    );
    const passwordResult = await runBoundedPasswordHash(
      passwordHashAdmissionGate,
      request,
      reply,
      () => verifyOwnedPassword(body.password, credential),
    );
    if (!passwordResult) return;
    const validPassword = passwordResult.value;
    if (!credential || !validPassword) return invalidCredentials(reply);

    const user = await options.repository.getIdentityUser(credential.userId);
    if (!user?.emailVerifiedAt) return invalidCredentials(reply);
    const workspaces = await options.repository.listIdentityWorkspaces(user.id);
    const createdSession = await createCredentialBoundSession(
      options.repository,
      user.id,
      workspaces,
      credential.passwordHash,
    );
    if (!createdSession) return invalidCredentials(reply);
    setSessionCookie(reply, createdSession.rawToken, createdSession.record);
    return createSessionSnapshot(user, createdSession.record.activeWorkspaceId, workspaces);
  });

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

async function runBoundedPasswordHash<T>(
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

async function requireOwnedSession(
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
  expectedPasswordHash: string,
) {
  const candidate = createOwnedAuthSession(userId, workspaces[0]?.id ?? null);
  const record = await repository.createCredentialBoundAuthSession({
    session: candidate.record,
    expectedPasswordHash,
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
    serializeAuthSessionCookie(rawToken, { expiresAt: session.absoluteExpiresAt }),
  );
}

function setPrivateResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}

async function enforceEmailAuthRateLimits(
  repository: ControlPlaneRepository,
  reply: FastifyReply,
  scope: 'sign-in' | 'sign-up' | 'password-recovery-request',
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
  identityDimension: 'challenge' | 'email',
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

function requireCredentialGateway(request: FastifyRequest, reply: FastifyReply): string | null {
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

function requireTrustedMutationOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
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

function createId(prefix: 'usr' | 'wk' | 'env' | 'verify' | 'reset' | 'outbox'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function createPendingSignupSecret(): string {
  // This is never a user credential. It keeps an unverified account unusable
  // until the email owner atomically replaces it with their chosen password.
  return randomBytes(32).toString('base64url');
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

function invalidCredentials(reply: FastifyReply) {
  return reply.code(401).send({
    error: 'invalid_credentials',
    message: 'Email or password is incorrect',
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
