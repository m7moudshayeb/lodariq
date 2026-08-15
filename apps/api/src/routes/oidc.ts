import { randomUUID } from 'node:crypto';
import {
  IdentityProviderBeginRequest,
  IdentityProviderCallbackInput,
  LODARIQ_APP_ORIGIN,
  createDefaultWorkspaceEnvironmentPolicy,
  type AuthSessionSnapshot,
  type IdentityProviderBeginRequest as BeginRequest,
  type IdentityProviderCallbackInput as CallbackInput,
  type OidcProviderId,
  type VerifiedExternalIdentity,
} from '@lodariq/schema';
import {
  type AuthIdentityRecord,
  type AuthSessionRecord,
  type ControlPlaneRepository,
  type IdentityWorkspaceRecord,
  type OidcAuthorizationAttemptRecord,
  type UserRecord,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AUTH_CORRELATION_HEADER,
  AuthError,
  authenticateCredentialGateway,
  authenticateOwnedSession,
  createAuthCorrelationId,
  createOidcProofMaterial,
  createOwnedAuthSession,
  describeAuthDevice,
  hashAuthRateBucket,
  isRecentAuthentication,
  matchesSha256,
  normalizeAuthEmail,
  openOidcProof,
  sealOidcProof,
  serializeAuthSessionCookie,
  sha256Hex,
  type OidcConfiguration,
} from '../auth';
import type { ObservabilitySink } from '../observability';

const OIDC_ATTEMPT_TTL_MS = 10 * 60 * 1_000;
const OIDC_BEGIN_RATE_WINDOW_MS = 15 * 60 * 1_000;

const OidcProviderParams = Type.Object(
  { provider: Type.Union([Type.Literal('google'), Type.Literal('microsoft')]) },
  { additionalProperties: false },
);

export interface RegisterOidcRoutesOptions {
  repository: ControlPlaneRepository;
  configuration: OidcConfiguration | null;
  observability: ObservabilitySink;
  clock?: () => Date;
}

export function registerOidcRoutes(
  fastify: FastifyInstance,
  options: RegisterOidcRoutesOptions,
): void {
  fastify.get('/v1/auth/oidc/providers', async (_request, reply) => {
    privateResponse(reply);
    return {
      providers: [...(options.configuration?.providers.values() ?? [])].map((provider) => ({
        id: provider.providerId,
        label: provider.label,
      })),
    };
  });

  fastify.post(
    '/v1/auth/oidc/:provider/begin',
    { schema: { params: OidcProviderParams, body: IdentityProviderBeginRequest } },
    async (request, reply) => {
      privateResponse(reply);
      if (!trustedMutationOrigin(request, reply)) return;
      const source = credentialSource(request, reply);
      if (!source) return;
      const { provider: providerId } = request.params as { provider: OidcProviderId };
      const body = request.body as BeginRequest;
      const configuration = options.configuration;
      const provider = configuration?.providers.get(providerId);
      if (!provider || !configuration || body.provider !== providerId) return providerUnavailable(reply);
      if (
        (body.action === 'sign_up' && !body.workspaceName?.trim()) ||
        (body.action !== 'sign_up' && body.workspaceName !== undefined)
      ) {
        return reply.code(400).send({ error: 'invalid_input', message: 'Invalid request' });
      }
      const now = readClock(options.clock);
      const rate = await options.repository.consumeAuthRateLimit({
        bucketHash: hashAuthRateBucket('sign-in', 'source', `oidc:${source}`),
        scope: body.action === 'sign_up' ? 'sign-up' : 'sign-in',
        now: now.toISOString(),
        windowMs: OIDC_BEGIN_RATE_WINDOW_MS,
        maxAttempts: 30,
        blockMs: OIDC_BEGIN_RATE_WINDOW_MS,
      });
      if (!rate.allowed) {
        reply.header('retry-after', String(rate.retryAfterSeconds));
        return reply.code(429).send({ error: 'rate_limited', message: 'Try again later' });
      }

      let userId: string | null = null;
      if (body.action === 'link') {
        try {
          const authenticated = await authenticateOwnedSession(options.repository, request);
          if (!isRecentAuthentication(authenticated.session.authenticatedAt, now)) {
            return reply
              .code(403)
              .send({ error: 'recent_authentication_required', message: 'Sign in again to continue' });
          }
          userId = authenticated.session.userId;
        } catch (error) {
          if (error instanceof AuthError) {
            return reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
          }
          throw error;
        }
      }

      const proof = createOidcProofMaterial();
      const attemptId = createId('oidcattempt');
      const expiresAt = new Date(now.getTime() + OIDC_ATTEMPT_TTL_MS).toISOString();
      const attempt: OidcAuthorizationAttemptRecord = {
        id: attemptId,
        providerId,
        action: body.action,
        userId,
        stateHash: proof.stateHash,
        encryptedVerifier: sealOidcProof(
          { verifier: proof.verifier, nonce: proof.nonce },
          configuration.stateSecret,
          attemptId,
          providerId,
        ),
        nonceHash: proof.nonceHash,
        returnTo: body.returnTo,
        workspaceName: body.action === 'sign_up' ? body.workspaceName!.trim() : null,
        durationPolicy: body.rememberMe ? 'remembered' : 'standard',
        expiresAt,
        consumedAt: null,
        createdAt: now.toISOString(),
      };
      if (!(await options.repository.createOidcAuthorizationAttempt(attempt))) {
        return reply.code(503).send({ error: 'oidc_unavailable', message: 'Sign-in is unavailable' });
      }
      const authorizationUrl = provider.begin({
        state: proof.state,
        nonce: proof.nonce,
        codeChallenge: proof.codeChallenge,
      });
      return { authorizationUrl: authorizationUrl.toString(), expiresAt };
    },
  );

  fastify.post(
    '/v1/auth/oidc/:provider/callback',
    { schema: { params: OidcProviderParams, body: IdentityProviderCallbackInput } },
    async (request, reply) => {
      privateResponse(reply);
      if (!trustedMutationOrigin(request, reply)) return;
      if (!credentialSource(request, reply)) return;
      const correlationId = createAuthCorrelationId();
      reply.header(AUTH_CORRELATION_HEADER, correlationId);
      const { provider: providerId } = request.params as { provider: OidcProviderId };
      const configuration = options.configuration;
      const provider = configuration?.providers.get(providerId);
      if (!provider || !configuration) return providerUnavailable(reply);
      const body = request.body as CallbackInput;
      const now = readClock(options.clock);
      const stateHash = sha256Hex(body.state);
      const attempt = await options.repository.getOidcAuthorizationAttempt(
        stateHash,
        now.toISOString(),
      );
      if (!attempt || attempt.providerId !== providerId) return invalidCallback(reply);
      if (
        !(await options.repository.consumeOidcAuthorizationAttempt(
          attempt.id,
          stateHash,
          now.toISOString(),
        ))
      ) {
        return invalidCallback(reply);
      }
      if ('error' in body) {
        emitResult(options.observability, correlationId, providerId, 'cancelled', now);
        return reply.code(400).send({ error: 'oidc_cancelled', message: 'Sign-in was cancelled' });
      }

      try {
        const proof = openOidcProof(
          attempt.encryptedVerifier,
          configuration.stateSecret,
          attempt.id,
          providerId,
        );
        if (!matchesSha256(proof.nonce, attempt.nonceHash)) return invalidCallback(reply);
        const external = await provider.verifyCallback({
          code: body.code,
          codeVerifier: proof.verifier,
          expectedNonce: proof.nonce,
        });
        const existing = await options.repository.findAuthIdentityByProviderSubject(
          external.issuer,
          external.subject,
        );

        if (attempt.action === 'link') {
          if (!attempt.userId) return invalidCallback(reply);
          if (existing && existing.userId !== attempt.userId) return identityConflict(reply);
          if (!existing) {
            const identity = externalIdentityRecord(attempt.userId, external, now);
            const linked = await options.repository.linkAuthIdentity({
              identity,
              actorUserId: attempt.userId,
              authorization: 'authenticated_session',
              eventId: createId('authevt'),
              occurredAt: now.toISOString(),
            });
            if (!linked) return identityConflict(reply);
          }
          emitResult(options.observability, correlationId, providerId, 'linked', now, attempt.userId);
          return { status: 'linked', returnTo: attempt.returnTo };
        }

        let authenticated = null;
        if (existing) {
          authenticated = await signInExistingIdentity(
            options.repository,
            request,
            existing,
            attempt,
            now,
          );
        } else if (attempt.action === 'sign_up') {
          authenticated = await registerExternalAccount(
            options.repository,
            request,
            external,
            attempt,
            now,
          );
        }
        if (!authenticated) {
          return reply.code(existing ? 409 : 401).send({
            error: existing ? 'identity_conflict' : 'account_not_found',
            message: existing ? 'Identity could not be authenticated' : 'Create an account first',
          });
        }
        setSessionCookie(reply, authenticated.rawToken, authenticated.session);
        emitResult(
          options.observability,
          correlationId,
          providerId,
          'authenticated',
          now,
          authenticated.session.userId,
        );
        return {
          status: 'authenticated',
          returnTo: attempt.returnTo,
          session: authenticated.snapshot,
        };
      } catch {
        emitResult(options.observability, correlationId, providerId, 'failed', now);
        return invalidCallback(reply);
      }
    },
  );
}

async function signInExistingIdentity(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  identity: AuthIdentityRecord,
  attempt: OidcAuthorizationAttemptRecord,
  now: Date,
) {
  if (identity.disabledAt) return null;
  const user = await repository.getIdentityUser(identity.userId);
  if (!user?.emailVerifiedAt) return null;
  const workspaces = await repository.listIdentityWorkspaces(user.id);
  const candidate = createOwnedAuthSession(user.id, workspaces[0]?.id ?? null, {
    now,
    identityId: identity.id,
    authenticationMethod: 'oidc',
    assuranceLevel: 'aal1',
    durationPolicy: attempt.durationPolicy,
    deviceLabel: describeAuthDevice(header(request, 'user-agent')),
  });
  const session = await repository.createExternalIdentitySession({
    identityId: identity.id,
    issuer: identity.issuer,
    subject: identity.subject,
    authenticatedAt: candidate.record.authenticatedAt,
    session: candidate.record,
  });
  return session
    ? { rawToken: candidate.rawToken, session, snapshot: await snapshot(repository, user, session.activeWorkspaceId, workspaces) }
    : null;
}

async function registerExternalAccount(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  external: VerifiedExternalIdentity,
  attempt: OidcAuthorizationAttemptRecord,
  now: Date,
) {
  if (!external.email || external.emailVerified !== true || !attempt.workspaceName) return null;
  const email = normalizeAuthEmail(external.email);
  const timestamp = now.toISOString();
  const userId = createId('usr');
  const workspaceId = createId('wk');
  const identity = externalIdentityRecord(userId, external, now);
  const candidate = createOwnedAuthSession(userId, workspaceId, {
    now,
    identityId: identity.id,
    authenticationMethod: 'oidc',
    assuranceLevel: 'aal1',
    durationPolicy: attempt.durationPolicy,
    deviceLabel: describeAuthDevice(header(request, 'user-agent')),
  });
  const user: UserRecord = {
    id: userId,
    legacyIdentityId: null,
    email,
    name: external.name ?? null,
    emailVerifiedAt: timestamp,
    deletedAt: null,
    retentionExpiresAt: null,
    createdAt: timestamp,
  };
  const environments = createWorkspaceEnvironments(workspaceId, timestamp);
  const created = await repository.registerExternalIdentityAccount({
    user,
    userEmail: {
      id: createId('email'),
      userId,
      normalizedEmail: email,
      isPrimary: true,
      verifiedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    identity,
    onboarding: {
      id: createId('onboard'),
      userId,
      intent: 'create_workspace',
      status: 'completed',
      targetWorkspaceId: workspaceId,
      targetWorkspaceName: attempt.workspaceName,
      invitationId: null,
      requestedWorkspaceId: null,
      completedWorkspaceId: workspaceId,
      version: 1,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    workspace: { id: workspaceId, name: attempt.workspaceName, createdAt: timestamp, updatedAt: timestamp },
    membership: { workspaceId, userId, role: 'owner', createdAt: timestamp },
    environments,
    session: candidate.record,
  });
  const workspaces: IdentityWorkspaceRecord[] = created
    ? [{ id: workspaceId, name: attempt.workspaceName, role: 'owner', createdAt: timestamp }]
    : [];
  return created
    ? { rawToken: candidate.rawToken, session: candidate.record, snapshot: await snapshot(repository, user, workspaceId, workspaces) }
    : null;
}

function externalIdentityRecord(
  userId: string,
  external: VerifiedExternalIdentity,
  now: Date,
): AuthIdentityRecord {
  return {
    id: createId('ident'),
    userId,
    kind: 'oidc',
    issuer: external.issuer,
    subject: external.subject,
    providerTenantId: external.providerTenantId,
    createdAt: now.toISOString(),
    lastAuthenticatedAt: now.toISOString(),
    disabledAt: null,
  };
}

async function snapshot(
  repository: ControlPlaneRepository,
  user: UserRecord,
  activeWorkspaceId: string | null,
  workspaces: IdentityWorkspaceRecord[],
): Promise<AuthSessionSnapshot> {
  const username = await repository.getAuthUsername(user.id);
  return {
    user: { id: user.id, email: user.email, name: user.name ?? null, username: username?.displayUsername ?? null },
    activeWorkspaceId,
    workspaces: workspaces.map(({ id, name, role }) => ({ id, name, role })),
  };
}

function createWorkspaceEnvironments(workspaceId: string, timestamp: string): WorkspaceEnvironment[] {
  const ids = { development: createId('env'), staging: createId('env'), production: createId('env') };
  return createDefaultWorkspaceEnvironmentPolicy(workspaceId, ids).environments.map((environment) => ({
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
  }));
}

function trustedMutationOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
  const origin = header(request, 'origin');
  const fetchSite = header(request, 'sec-fetch-site');
  if (!origin) {
    if (!fetchSite) return true;
    void reply.code(403).send({ error: 'forbidden_origin', message: 'Request origin is not allowed' });
    return false;
  }
  const configured = process.env.LODARIQ_AUTH_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const allowed = new Set([LODARIQ_APP_ORIGIN, ...configured]);
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3002');
    allowed.add('http://127.0.0.1:3002');
  }
  if (!origin || !allowed.has(origin)) {
    void reply.code(403).send({ error: 'forbidden_origin', message: 'Request origin is not allowed' });
    return false;
  }
  reply.header('access-control-allow-origin', origin);
  reply.header('access-control-allow-credentials', 'true');
  reply.header('vary', 'Origin');
  return true;
}

function credentialSource(request: FastifyRequest, reply: FastifyReply): string | null {
  try {
    return authenticateCredentialGateway(request);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    void reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
    return null;
  }
}

function privateResponse(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}

function setSessionCookie(
  reply: FastifyReply,
  rawToken: string,
  session: AuthSessionRecord,
): void {
  reply.header(
    'set-cookie',
    serializeAuthSessionCookie(rawToken, {
      ...(session.durationPolicy === 'remembered' ? { expiresAt: session.absoluteExpiresAt } : {}),
    }),
  );
}

function providerUnavailable(reply: FastifyReply) {
  return reply.code(404).send({ error: 'provider_unavailable', message: 'Identity provider is unavailable' });
}

function invalidCallback(reply: FastifyReply) {
  return reply.code(400).send({ error: 'invalid_oidc_callback', message: 'Sign-in could not be completed' });
}

function identityConflict(reply: FastifyReply) {
  return reply.code(409).send({ error: 'identity_conflict', message: 'This identity is already linked' });
}

function emitResult(
  sink: ObservabilitySink,
  correlationId: string,
  providerId: OidcProviderId,
  result: 'authenticated' | 'cancelled' | 'failed' | 'linked',
  now: Date,
  userId?: string,
): void {
  sink.emit({
    name: 'auth.oidc.completed',
    timestamp: now.toISOString(),
    correlationId,
    userId,
    attributes: { providerId, result },
  });
}

function readClock(clock: (() => Date) | undefined): Date {
  const now = clock?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Authentication clock returned invalid time');
  return now;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function createId(
  prefix: 'usr' | 'wk' | 'env' | 'email' | 'ident' | 'onboard' | 'authevt' | 'oidcattempt',
): string {
  return `${prefix}_${randomUUID().replace(/-/gu, '')}`;
}
