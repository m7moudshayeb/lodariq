import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  BeginPasskeyAuthenticationRequest,
  BeginPasskeyRegistrationRequest,
  CompletePasskeyAuthenticationRequest,
  CompletePasskeyRegistrationRequest,
  ConfirmRecoveryCodesRequest,
  GenerateRecoveryCodesRequest,
  RecoveryCodeSignInRequest,
  type AuthSessionSnapshot,
  type BeginPasskeyAuthenticationRequest as BeginPasskeyAuthenticationRequestType,
  type BeginPasskeyRegistrationRequest as BeginPasskeyRegistrationRequestType,
  type CompletePasskeyAuthenticationRequest as CompletePasskeyAuthenticationRequestType,
  type CompletePasskeyRegistrationRequest as CompletePasskeyRegistrationRequestType,
} from '@lodariq/schema';
import {
  LODARIQ_IDENTITY_ISSUER,
  normalizeAuthIdentifier,
  type AccountSecurityEventRecord,
  type ControlPlaneRepository,
  type IdentityWorkspaceRecord,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  authenticateOwnedSession,
  AuthError,
  createOwnedAuthSession,
  createRecoveryCodes,
  describeAuthDevice,
  hashAuthEmailLookup,
  hashAuthRateBucket,
  hashRecoveryCode,
  hashWebAuthnChallenge,
  isRecentAuthentication,
  serializeAuthSessionCookie,
  type WebAuthnConfiguration,
  verifyOwnedPassword,
} from '../auth';
import type { ObservabilitySink } from '../observability';
import { requireCredentialGateway, requireTrustedMutationOrigin } from './auth';

const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1_000;

export interface RegisterAssuranceRoutesOptions {
  repository: ControlPlaneRepository;
  observability: ObservabilitySink;
  configuration: WebAuthnConfiguration | null;
  clock?: () => Date;
}

export function registerAssuranceRoutes(
  fastify: FastifyInstance,
  options: RegisterAssuranceRoutesOptions,
): void {
  fastify.get('/v1/auth/passkeys', async (request, reply) => {
    setPrivateHeaders(reply);
    const authenticated = await requireSession(options.repository, request, reply);
    if (!authenticated) return;
    const passkeys = await options.repository.listPasskeyCredentials(authenticated.session.userId);
    return {
      passkeys: passkeys.map((passkey) => ({
        id: passkey.id,
        identityId: passkey.identityId,
        name: passkey.name,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt,
      })),
    };
  });

  fastify.post(
    '/v1/auth/passkeys/registration/options',
    { schema: { body: BeginPasskeyRegistrationRequest } },
    async (request, reply) => {
      setPrivateHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const configuration = requireWebAuthn(options.configuration, reply);
      if (!configuration) return;
      const authenticated = await requireSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readClock(options.clock);
      if (!requireRecent(reply, authenticated.session.authenticatedAt, now)) return;
      const body = request.body as BeginPasskeyRegistrationRequestType;
      const existing = await options.repository.listPasskeyCredentials(
        authenticated.session.userId,
      );
      const registration = await generateRegistrationOptions({
        rpName: configuration.rpName,
        rpID: configuration.rpId,
        userID: new TextEncoder().encode(authenticated.session.userId),
        userName: authenticated.user.email,
        userDisplayName: authenticated.user.name ?? authenticated.user.email,
        attestationType: 'none',
        excludeCredentials: existing.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports as never,
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'required',
        },
        supportedAlgorithmIDs: [-7, -257],
      });
      const challengeId = id('authchal');
      const createdAt = now.toISOString();
      const created = await options.repository.createWebAuthnChallenge({
        id: challengeId,
        purpose: 'passkey_registration',
        userId: authenticated.session.userId,
        challengeHash: hashWebAuthnChallenge(registration.challenge),
        rpId: configuration.rpId,
        origin: configuration.origin,
        expiresAt: new Date(now.getTime() + WEBAUTHN_CHALLENGE_TTL_MS).toISOString(),
        consumedAt: null,
        createdAt,
      });
      if (!created) return assuranceUnavailable(reply);
      return { challengeId, name: body.name.trim(), options: registration };
    },
  );

  fastify.post(
    '/v1/auth/passkeys/registration/verify',
    { schema: { body: CompletePasskeyRegistrationRequest } },
    async (request, reply) => {
      setPrivateHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const configuration = requireWebAuthn(options.configuration, reply);
      if (!configuration) return;
      const authenticated = await requireSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readClock(options.clock);
      if (!requireRecent(reply, authenticated.session.authenticatedAt, now)) return;
      const body = request.body as CompletePasskeyRegistrationRequestType;
      const challenge = await options.repository.getWebAuthnChallenge(
        body.challengeId,
        now.toISOString(),
      );
      if (
        !challenge ||
        challenge.purpose !== 'passkey_registration' ||
        challenge.userId !== authenticated.session.userId ||
        challenge.rpId !== configuration.rpId ||
        challenge.origin !== configuration.origin
      ) {
        return invalidPasskey(reply);
      }
      try {
        const verification = await verifyRegistrationResponse({
          response: body.response as unknown as RegistrationResponseJSON,
          expectedChallenge: (candidate) =>
            hashWebAuthnChallenge(candidate) === challenge.challengeHash,
          expectedOrigin: challenge.origin,
          expectedRPID: challenge.rpId,
          requireUserPresence: true,
          requireUserVerification: true,
          supportedAlgorithmIDs: [-7, -257],
        });
        if (!verification.verified || !verification.registrationInfo) {
          return invalidPasskey(reply);
        }
        const credential = verification.registrationInfo.credential;
        const credentialId = credential.id;
        const identityId = id('ident');
        const event = securityEvent(
          'passkey_registered',
          authenticated.session.userId,
          identityId,
          now,
        );
        const completed = await options.repository.completePasskeyRegistration({
          challengeId: body.challengeId,
          challengeHash: challenge.challengeHash,
          userId: authenticated.session.userId,
          consumedAt: now.toISOString(),
          identity: {
            id: identityId,
            userId: authenticated.session.userId,
            kind: 'passkey',
            issuer: LODARIQ_IDENTITY_ISSUER,
            subject: credentialId,
            providerTenantId: null,
            createdAt: now.toISOString(),
            lastAuthenticatedAt: null,
            disabledAt: null,
          },
          credential: {
            id: id('passkey'),
            userId: authenticated.session.userId,
            identityId,
            credentialId,
            publicKey: Uint8Array.from(credential.publicKey),
            counter: credential.counter,
            transports: (body.response.response.transports ?? []).map(String),
            deviceType: verification.registrationInfo.credentialDeviceType,
            backedUp: verification.registrationInfo.credentialBackedUp,
            aaguid: verification.registrationInfo.aaguid,
            name: body.name.trim(),
            createdAt: now.toISOString(),
            lastUsedAt: null,
          },
          event,
        });
        if (!completed) return invalidPasskey(reply);
        emit(options, 'auth.passkey.registered', authenticated.session.userId, {
          credentialId: event.targetId,
        });
        return reply.code(201).send({ status: 'registered' });
      } catch {
        return invalidPasskey(reply);
      }
    },
  );

  fastify.post(
    '/v1/auth/passkeys/authentication/options',
    { schema: { body: BeginPasskeyAuthenticationRequest } },
    async (request, reply) => {
      setPrivateHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const source = requireCredentialGateway(request, reply);
      if (!source) return;
      const configuration = requireWebAuthn(options.configuration, reply);
      if (!configuration) return;
      const body = request.body as BeginPasskeyAuthenticationRequestType;
      const now = readClock(options.clock);
      const authenticated =
        body.purpose === 'step_up'
          ? await requireSession(options.repository, request, reply)
          : null;
      if (body.purpose === 'step_up' && !authenticated) return;
      if (!(await enforceAssuranceRateLimit(options.repository, reply, source, 'begin', now)))
        return;
      const credentials = authenticated
        ? await options.repository.listPasskeyCredentials(authenticated.session.userId)
        : [];
      if (authenticated && credentials.length === 0) return invalidPasskey(reply);
      const authentication = await generateAuthenticationOptions({
        rpID: configuration.rpId,
        userVerification: 'required',
        allowCredentials: credentials.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports as never,
        })),
      });
      const challengeId = id('authchal');
      const created = await options.repository.createWebAuthnChallenge({
        id: challengeId,
        purpose: body.purpose === 'step_up' ? 'passkey_step_up' : 'passkey_authentication',
        userId: authenticated?.session.userId ?? null,
        challengeHash: hashWebAuthnChallenge(authentication.challenge),
        rpId: configuration.rpId,
        origin: configuration.origin,
        expiresAt: new Date(now.getTime() + WEBAUTHN_CHALLENGE_TTL_MS).toISOString(),
        consumedAt: null,
        createdAt: now.toISOString(),
      });
      if (!created) return assuranceUnavailable(reply);
      return { challengeId, options: authentication };
    },
  );

  fastify.post(
    '/v1/auth/passkeys/authentication/verify',
    { schema: { body: CompletePasskeyAuthenticationRequest } },
    async (request, reply) => {
      setPrivateHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const source = requireCredentialGateway(request, reply);
      if (!source) return;
      const configuration = requireWebAuthn(options.configuration, reply);
      if (!configuration) return;
      const body = request.body as CompletePasskeyAuthenticationRequestType;
      const now = readClock(options.clock);
      if (
        !(await enforceAssuranceRateLimit(options.repository, reply, source, body.challengeId, now))
      ) {
        return;
      }
      const current =
        body.purpose === 'step_up'
          ? await requireSession(options.repository, request, reply)
          : null;
      if (body.purpose === 'step_up' && !current) return;
      const [challenge, credential] = await Promise.all([
        options.repository.getWebAuthnChallenge(body.challengeId, now.toISOString()),
        options.repository.findPasskeyCredential(body.response.id),
      ]);
      const expectedPurpose =
        body.purpose === 'step_up' ? 'passkey_step_up' : 'passkey_authentication';
      if (
        !challenge ||
        !credential ||
        challenge.purpose !== expectedPurpose ||
        challenge.rpId !== configuration.rpId ||
        challenge.origin !== configuration.origin ||
        (current && current.session.userId !== credential.userId)
      ) {
        return invalidPasskey(reply);
      }
      try {
        const verification = await verifyAuthenticationResponse({
          response: body.response as unknown as AuthenticationResponseJSON,
          expectedChallenge: (candidate) =>
            hashWebAuthnChallenge(candidate) === challenge.challengeHash,
          expectedOrigin: challenge.origin,
          expectedRPID: challenge.rpId,
          credential: {
            id: credential.credentialId,
            publicKey: Uint8Array.from(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports as never,
          },
          requireUserVerification: true,
        });
        if (!verification.verified || !verification.authenticationInfo.userVerified) {
          return invalidPasskey(reply);
        }
        const workspaces = await options.repository.listIdentityWorkspaces(credential.userId);
        const durationPolicy =
          current?.session.durationPolicy ?? (body.rememberMe ? 'remembered' : 'standard');
        const candidate = createOwnedAuthSession(
          credential.userId,
          current?.session.activeWorkspaceId ?? workspaces[0]?.id ?? null,
          {
            identityId: credential.identityId,
            authenticationMethod: 'passkey',
            assuranceLevel: 'aal2',
            authenticatedAt: now.toISOString(),
            durationPolicy,
            deviceLabel: describeAuthDevice(request.headers['user-agent']),
          },
        );
        const event = securityEvent('passkey_authenticated', credential.userId, credential.id, now);
        const session = await options.repository.completePasskeyAuthentication({
          challengeId: challenge.id,
          challengeHash: challenge.challengeHash,
          credentialId: credential.credentialId,
          expectedCounter: credential.counter,
          nextCounter: verification.authenticationInfo.newCounter,
          authenticatedAt: now.toISOString(),
          nextSession: candidate.record,
          currentSessionTokenHash: current?.tokenHash ?? null,
          event,
        });
        if (!session) return invalidPasskey(reply);
        setSessionCookie(
          reply,
          candidate.rawToken,
          session.durationPolicy,
          session.absoluteExpiresAt,
        );
        const user = await options.repository.getIdentityUser(credential.userId);
        if (!user) return invalidPasskey(reply);
        emit(options, 'auth.passkey.authenticated', credential.userId, {
          purpose: body.purpose,
        });
        return sessionSnapshot(user, session.activeWorkspaceId, workspaces);
      } catch {
        return invalidPasskey(reply);
      }
    },
  );

  registerRecoveryCodeRoutes(fastify, options);
}

function registerRecoveryCodeRoutes(
  fastify: FastifyInstance,
  options: RegisterAssuranceRoutesOptions,
): void {
  fastify.get('/v1/auth/recovery-codes', async (request, reply) => {
    setPrivateHeaders(reply);
    const authenticated = await requireSession(options.repository, request, reply);
    if (!authenticated) return;
    return options.repository.getRecoveryCodeStatus(authenticated.session.userId);
  });

  fastify.post(
    '/v1/auth/recovery-codes',
    { schema: { body: GenerateRecoveryCodesRequest } },
    async (request, reply) => {
      setPrivateHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const authenticated = await requireSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readClock(options.clock);
      if (!requireRecent(reply, authenticated.session.authenticatedAt, now)) return;
      const body = request.body as { currentPassword?: string };
      if (authenticated.session.authenticationMethod === 'password') {
        const password = await options.repository.findPasswordAuthenticationByUserId(
          authenticated.session.userId,
        );
        if (
          !body.currentPassword ||
          !(await verifyOwnedPassword(body.currentPassword, password?.credential ?? null))
        ) {
          return invalidCredentials(reply);
        }
      }
      const rawCodes = createRecoveryCodes();
      const setId = id('recoveryset');
      const createdAt = now.toISOString();
      const event = securityEvent(
        'recovery_codes_generated',
        authenticated.session.userId,
        setId,
        now,
      );
      const created = await options.repository.createRecoveryCodeSet({
        set: {
          id: setId,
          userId: authenticated.session.userId,
          confirmedAt: null,
          revokedAt: null,
          createdAt,
        },
        codes: rawCodes.map((code) => ({
          id: id('recoverycode'),
          setId,
          userId: authenticated.session.userId,
          codeHash: hashRecoveryCode(code)!,
          usedAt: null,
          createdAt,
        })),
        event,
      });
      if (!created) return assuranceUnavailable(reply);
      emit(options, 'auth.recovery_codes.generated', authenticated.session.userId);
      return reply.code(201).send({ setId, codes: rawCodes });
    },
  );

  fastify.post(
    '/v1/auth/recovery-codes/confirm',
    { schema: { body: ConfirmRecoveryCodesRequest } },
    async (request, reply) => {
      setPrivateHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const authenticated = await requireSession(options.repository, request, reply);
      if (!authenticated) return;
      const now = readClock(options.clock);
      if (!requireRecent(reply, authenticated.session.authenticatedAt, now)) return;
      const body = request.body as { setId: string; code: string };
      const codeHash = hashRecoveryCode(body.code);
      if (!codeHash) return invalidRecoveryCode(reply);
      const event = securityEvent(
        'recovery_codes_confirmed',
        authenticated.session.userId,
        body.setId,
        now,
      );
      const confirmed = await options.repository.confirmRecoveryCodeSet(
        authenticated.session.userId,
        body.setId,
        codeHash,
        now.toISOString(),
        event,
      );
      if (!confirmed) return invalidRecoveryCode(reply);
      emit(options, 'auth.recovery_codes.confirmed', authenticated.session.userId);
      return reply.code(204).send();
    },
  );

  fastify.delete('/v1/auth/recovery-codes', async (request, reply) => {
    setPrivateHeaders(reply);
    if (!requireTrustedMutationOrigin(request, reply)) return;
    const authenticated = await requireSession(options.repository, request, reply);
    if (!authenticated) return;
    const now = readClock(options.clock);
    if (!requireRecent(reply, authenticated.session.authenticatedAt, now)) return;
    const event = securityEvent(
      'recovery_codes_revoked',
      authenticated.session.userId,
      authenticated.session.userId,
      now,
    );
    const revoked = await options.repository.revokeRecoveryCodeSet(
      authenticated.session.userId,
      now.toISOString(),
      event,
    );
    if (!revoked)
      return reply.code(404).send({ error: 'not_found', message: 'No active recovery codes' });
    emit(options, 'auth.recovery_codes.revoked', authenticated.session.userId);
    return reply.code(204).send();
  });

  fastify.post(
    '/v1/auth/recovery-code/sign-in',
    { schema: { body: RecoveryCodeSignInRequest } },
    async (request, reply) => {
      setPrivateHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const source = requireCredentialGateway(request, reply);
      if (!source) return;
      const body = request.body as { identifier: string; code: string; rememberMe?: boolean };
      const identifier = normalizeAuthIdentifier(body.identifier);
      const codeHash = hashRecoveryCode(body.code);
      const now = readClock(options.clock);
      if (!identifier || !codeHash) return invalidRecoveryCode(reply);
      if (
        !(await enforceAssuranceRateLimit(options.repository, reply, source, identifier.value, now))
      ) {
        return;
      }
      const user = await options.repository.findIdentityUserByIdentifier(
        identifier,
        identifier.kind === 'email' ? hashAuthEmailLookup(identifier.value) : null,
      );
      if (!user) return invalidRecoveryCode(reply);
      const workspaces = await options.repository.listIdentityWorkspaces(user.id);
      const candidate = createOwnedAuthSession(user.id, workspaces[0]?.id ?? null, {
        authenticationMethod: 'recovery',
        assuranceLevel: 'aal1',
        durationPolicy: body.rememberMe ? 'remembered' : 'standard',
        deviceLabel: describeAuthDevice(request.headers['user-agent']),
        now,
      });
      const event = securityEvent('recovery_code_used', user.id, null, now);
      const session = await options.repository.consumeRecoveryCode({
        userId: user.id,
        codeHash,
        usedAt: now.toISOString(),
        session: candidate.record,
        event,
      });
      if (!session) return invalidRecoveryCode(reply);
      const identityUser = await options.repository.getIdentityUser(user.id);
      if (!identityUser) return invalidRecoveryCode(reply);
      setSessionCookie(
        reply,
        candidate.rawToken,
        session.durationPolicy,
        session.absoluteExpiresAt,
      );
      emit(options, 'auth.recovery_code.used', user.id);
      return sessionSnapshot(identityUser, session.activeWorkspaceId, workspaces);
    },
  );
}

async function requireSession(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    return await authenticateOwnedSession(repository, request);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    void reply.code(401).send({ error: 'unauthorized', message: 'Sign in to continue' });
    return null;
  }
}

function requireWebAuthn(
  configuration: WebAuthnConfiguration | null,
  reply: FastifyReply,
): WebAuthnConfiguration | null {
  if (configuration) return configuration;
  void reply.code(503).send({ error: 'passkeys_disabled', message: 'Passkeys are unavailable' });
  return null;
}

function requireRecent(reply: FastifyReply, authenticatedAt: string, now: Date): boolean {
  if (isRecentAuthentication(authenticatedAt, now)) return true;
  void reply.code(403).send({
    error: 'recent_authentication_required',
    message: 'Sign in again before changing authentication methods',
  });
  return false;
}

async function enforceAssuranceRateLimit(
  repository: ControlPlaneRepository,
  reply: FastifyReply,
  source: string,
  dimension: string,
  now: Date,
): Promise<boolean> {
  for (const [kind, value, maxAttempts] of [
    ['source', source, 60],
    ['challenge', dimension, 10],
  ] as const) {
    const result = await repository.consumeAuthRateLimit({
      bucketHash: hashAuthRateBucket('sign-in', kind, value),
      scope: 'sign-in',
      now: now.toISOString(),
      windowMs: 15 * 60 * 1_000,
      maxAttempts,
      blockMs: 15 * 60 * 1_000,
    });
    if (!result.allowed) {
      reply.header('retry-after', String(Math.max(1, result.retryAfterSeconds)));
      await reply
        .code(429)
        .send({ error: 'rate_limited', message: 'Too many attempts; try again later' });
      return false;
    }
  }
  return true;
}

function securityEvent(
  eventType: AccountSecurityEventRecord['eventType'],
  userId: string,
  targetId: string | null,
  now: Date,
): AccountSecurityEventRecord {
  return {
    id: id('acctevt'),
    userId,
    actorUserId: userId,
    eventType,
    targetId,
    occurredAt: now.toISOString(),
  };
}

function sessionSnapshot(
  user: { id: string; email: string; name?: string | null },
  activeWorkspaceId: string | null,
  workspaces: IdentityWorkspaceRecord[],
): AuthSessionSnapshot {
  return {
    user: { id: user.id, email: user.email, name: user.name ?? null },
    activeWorkspaceId,
    workspaces: workspaces.map(({ id: workspaceId, name, role }) => ({
      id: workspaceId,
      name,
      role: role as AuthSessionSnapshot['workspaces'][number]['role'],
    })),
  };
}

function setSessionCookie(
  reply: FastifyReply,
  token: string,
  durationPolicy: 'standard' | 'remembered' | 'managed',
  absoluteExpiresAt: string,
): void {
  reply.header(
    'set-cookie',
    serializeAuthSessionCookie(token, {
      ...(durationPolicy === 'remembered' ? { expiresAt: absoluteExpiresAt } : {}),
    }),
  );
}

function invalidPasskey(reply: FastifyReply) {
  return reply.code(400).send({
    error: 'passkey_invalid',
    message: 'The passkey response is invalid, expired, or already used',
  });
}

function invalidRecoveryCode(reply: FastifyReply) {
  return reply.code(401).send({
    error: 'invalid_credentials',
    message: 'The identifier or recovery code is incorrect',
  });
}

function invalidCredentials(reply: FastifyReply) {
  return reply.code(401).send({
    error: 'invalid_credentials',
    message: 'Current credentials could not be verified',
  });
}

function assuranceUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: 'assurance_unavailable',
    message: 'Authentication security could not be updated',
  });
}

function id(prefix: 'acctevt' | 'authchal' | 'ident' | 'passkey' | 'recoverycode' | 'recoveryset') {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

function readClock(clock: (() => Date) | undefined): Date {
  const now = clock?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Assurance clock is invalid');
  return now;
}

function setPrivateHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}

function emit(
  options: RegisterAssuranceRoutesOptions,
  name: string,
  userId: string,
  attributes?: Record<string, unknown>,
): void {
  options.observability.emit({
    name,
    timestamp: readClock(options.clock).toISOString(),
    userId,
    ...(attributes ? { attributes } : {}),
  });
}
