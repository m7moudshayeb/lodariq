import { createHash, randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import type {
  ControlPlaneRepository,
  EnterpriseAuditEventRecord,
  EnterpriseMutationResult,
  EnterpriseScimUserRecord,
} from '@lodariq/database';
import {
  BreakGlassApprovalRequest,
  BreakGlassParams,
  CreateBreakGlassRequest,
  CreateEnterpriseDomainRequest,
  CreateEnterpriseSsoConnectionRequest,
  CreateScimTokenRequest,
  EnterpriseConnectionParams,
  EnterpriseDomainParams,
  EnterpriseDomainVerificationRequest,
  EnterpriseOidcBeginRequest,
  EnterpriseOidcCallbackRequest,
  EnterpriseSsoDiscoveryRequest,
  EnterpriseScimConnectionParams,
  EnterpriseWorkspaceParams,
  ScimCreateUserRequest,
  ScimPatchUserRequest,
  ScimReplaceUserRequest,
  ScimUserListQuery,
  UpdateWorkspaceAuthPolicyRequest,
  UpsertEnterpriseGroupRoleMappingRequest,
  type BreakGlassParams as BreakGlassRouteParams,
  type CreateBreakGlassRequest as CreateBreakGlassBody,
  type CreateEnterpriseDomainRequest as CreateDomainBody,
  type CreateEnterpriseSsoConnectionRequest as CreateConnectionBody,
  type CreateScimTokenRequest as CreateScimTokenBody,
  type EnterpriseConnectionParams as ConnectionRouteParams,
  type EnterpriseScimConnectionParams as ScimConnectionRouteParams,
  type EnterpriseDomainParams as DomainRouteParams,
  type EnterpriseSsoDiscoveryRequest as DiscoveryBody,
  type EnterpriseOidcBeginRequest as EnterpriseOidcBeginBody,
  type EnterpriseOidcCallbackRequest as EnterpriseOidcCallbackBody,
  type EnterpriseWorkspaceParams as WorkspaceRouteParams,
  type ScimCreateUserRequest as ScimCreateBody,
  type ScimPatchUserRequest as ScimPatchBody,
  type ScimReplaceUserRequest as ScimReplaceBody,
  type ScimUserListQuery as ScimListQuery,
  type UpdateWorkspaceAuthPolicyRequest as UpdatePolicyBody,
  type UpsertEnterpriseGroupRoleMappingRequest as GroupMappingBody,
} from '@lodariq/schema';
import { Type, type Static } from '@sinclair/typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  assuranceAtLeast,
  createAuthCorrelationId,
  createOidcProofMaterial,
  createOwnedAuthSession,
  describeAuthDevice,
  EnterpriseOidcProvider,
  hashAuthRateBucket,
  isRecentAuthentication,
  matchesSha256,
  normalizeAuthEmail,
  openOidcProof,
  sealOidcProof,
  serializeAuthSessionCookie,
  sha256Hex,
  type EnterpriseOidcConfiguration,
  workspaceSessionPolicyFailure,
} from '../auth';
import type { ObservabilitySink } from '../observability';
import {
  requireCredentialGateway,
  requireOwnedSession,
  requireTrustedMutationOrigin,
} from './auth';

const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const BREAK_GLASS_TTL_MS = 15 * 60 * 1_000;
const ENTERPRISE_MUTATION_RATE_POLICY = Object.freeze({
  windowMs: 60 * 60 * 1_000,
  maxAttempts: 60,
  blockMs: 60 * 60 * 1_000,
});
const ENTERPRISE_AUDIT_METADATA_KEYS = new Set([
  'active',
  'domainId',
  'mappingId',
  'minimumAssurance',
  'passwordAllowed',
  'principalId',
  'protocol',
  'provider',
  'provisioningMode',
  'reasonLength',
  'requestId',
  'role',
  'scimConnectionId',
  'ssoRequired',
  'usedBreakGlass',
]);

const ScimUserParams = Type.Object(
  {
    id: Type.String({
      minLength: 24,
      maxLength: 128,
      pattern: '^ssoprincipal_[A-Za-z0-9_-]{16,}$',
    }),
  },
  { additionalProperties: false },
);
type ScimUserRouteParams = Static<typeof ScimUserParams>;

export interface EnterpriseDomainVerificationCapability {
  verifyTxtRecord(recordName: string, expectedValue: string): Promise<boolean>;
}

export interface RegisterEnterpriseIdentityRoutesOptions {
  repository: ControlPlaneRepository;
  observability: ObservabilitySink;
  domainVerification?: EnterpriseDomainVerificationCapability;
  oidcConfiguration?: EnterpriseOidcConfiguration | null;
  clock?: () => Date;
}

export function registerEnterpriseIdentityRoutes(
  fastify: FastifyInstance,
  options: RegisterEnterpriseIdentityRoutesOptions,
): void {
  const domainVerification = options.domainVerification ?? dnsDomainVerification;
  const enterpriseOidc = options.oidcConfiguration
    ? new EnterpriseOidcProvider(options.oidcConfiguration)
    : null;

  fastify.post(
    '/v1/auth/enterprise/oidc/begin',
    { schema: { body: EnterpriseOidcBeginRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const source = requireCredentialGateway(request, reply);
      if (!source) return;
      const body = request.body as EnterpriseOidcBeginBody;
      const connection = await options.repository.getEnterpriseSsoConnectionForAuthorization(
        body.connectionId,
      );
      if (
        !connection ||
        connection.protocol !== 'oidc' ||
        !enterpriseOidc ||
        !options.oidcConfiguration
      ) {
        return enterpriseSsoUnavailable(reply);
      }
      const now = readClock(options.clock);
      const rate = await options.repository.consumeAuthRateLimit({
        bucketHash: hashAuthRateBucket('enterprise-discovery', 'source', `oidc:${source}`),
        scope: 'sign-in',
        now: now.toISOString(),
        windowMs: ENTERPRISE_MUTATION_RATE_POLICY.windowMs,
        maxAttempts: 30,
        blockMs: ENTERPRISE_MUTATION_RATE_POLICY.blockMs,
      });
      if (!rate.allowed) return sendRateLimited(reply, rate.retryAfterSeconds);
      const proof = createOidcProofMaterial();
      const attemptId = createId('oidcattempt');
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1_000).toISOString();
      const created = await options.repository.createOidcAuthorizationAttempt({
        id: attemptId,
        providerId: connection.id,
        action: 'sign_in',
        userId: null,
        stateHash: proof.stateHash,
        encryptedVerifier: sealOidcProof(
          { verifier: proof.verifier, nonce: proof.nonce },
          options.oidcConfiguration.stateSecret,
          attemptId,
          connection.id,
        ),
        nonceHash: proof.nonceHash,
        returnTo: body.returnTo,
        workspaceName: null,
        durationPolicy: 'standard',
        expiresAt,
        consumedAt: null,
        createdAt: now.toISOString(),
      });
      if (!created) return enterpriseSsoUnavailable(reply);
      const authorizationUrl = await enterpriseOidc.begin(connection, {
        state: proof.state,
        nonce: proof.nonce,
        codeChallenge: proof.codeChallenge,
      });
      return { authorizationUrl: authorizationUrl.toString(), expiresAt };
    },
  );

  fastify.delete(
    '/v1/workspaces/:workspaceId/enterprise/sso-connections/:connectionId',
    { schema: { params: EnterpriseConnectionParams } },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId, connectionId } = request.params as ConnectionRouteParams;
      const disabledAt = context.now.toISOString();
      const result = await options.repository.disableEnterpriseSsoConnection({
        workspaceId,
        connectionId,
        actorUserId: context.userId,
        disabledAt,
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'sso_connection_disabled',
          connectionId,
          occurredAt: disabledAt,
          metadata: {},
        }),
      });
      return result === 'completed' ? reply.code(204).send() : sendMutationFailure(reply, result);
    },
  );

  fastify.post(
    '/v1/auth/enterprise/oidc/callback',
    { schema: { body: EnterpriseOidcCallbackRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      if (!requireCredentialGateway(request, reply)) return;
      const correlationId = createAuthCorrelationId();
      reply.header('x-lodariq-auth-correlation-id', correlationId);
      const body = request.body as EnterpriseOidcCallbackBody;
      const now = readClock(options.clock);
      const stateHash = sha256Hex(body.state);
      const attempt = await options.repository.getOidcAuthorizationAttempt(
        stateHash,
        now.toISOString(),
      );
      if (!attempt || !attempt.providerId.startsWith('sso_')) {
        return invalidEnterpriseCallback(reply);
      }
      if (
        !(await options.repository.consumeOidcAuthorizationAttempt(
          attempt.id,
          stateHash,
          now.toISOString(),
        ))
      ) {
        return invalidEnterpriseCallback(reply);
      }
      if ('error' in body) return invalidEnterpriseCallback(reply);
      const connection = await options.repository.getEnterpriseSsoConnectionForAuthorization(
        attempt.providerId,
      );
      if (
        !connection ||
        connection.protocol !== 'oidc' ||
        !enterpriseOidc ||
        !options.oidcConfiguration
      ) {
        return invalidEnterpriseCallback(reply);
      }
      try {
        const proof = openOidcProof(
          attempt.encryptedVerifier,
          options.oidcConfiguration.stateSecret,
          attempt.id,
          connection.id,
        );
        if (!matchesSha256(proof.nonce, attempt.nonceHash)) {
          return invalidEnterpriseCallback(reply);
        }
        const external = await enterpriseOidc.verifyCallback(connection, {
          code: body.code,
          codeVerifier: proof.verifier,
          expectedNonce: proof.nonce,
        });
        const policy = await options.repository.getWorkspaceAuthPolicy(connection.workspaceId);
        if (!policy || !assuranceAtLeast(external.assuranceLevel, policy.minimumAssurance)) {
          return reply.code(403).send({
            error: 'minimum_assurance_required',
            message: 'The identity provider did not satisfy this workspace assurance policy',
          });
        }
        const emailNormalized = normalizeAuthEmail(external.email);
        const timestamp = now.toISOString();
        const userId = createId('usr');
        const identityId = createId('ident');
        const candidate = createOwnedAuthSession(userId, connection.workspaceId, {
          now,
          identityId,
          authenticationMethod: 'oidc',
          assuranceLevel: external.assuranceLevel,
          durationPolicy: 'managed',
          deviceLabel: describeAuthDevice(readSingleHeader(request, 'user-agent') ?? undefined),
        });
        const result = await options.repository.authenticateEnterpriseSso({
          connectionId: connection.id,
          externalId: external.externalId,
          issuer: external.issuer,
          subject: external.subject,
          emailNormalized,
          emailVerified: external.emailVerified,
          displayName: external.name,
          groupIds: external.groupIds,
          occurredAt: timestamp,
          candidateUser: {
            id: userId,
            legacyIdentityId: null,
            email: emailNormalized,
            name: external.name,
            emailVerifiedAt: timestamp,
            deletedAt: null,
            retentionExpiresAt: null,
            createdAt: timestamp,
          },
          candidateEmail: {
            id: createId('email'),
            userId,
            normalizedEmail: emailNormalized,
            isPrimary: true,
            verifiedAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          candidateIdentity: {
            id: identityId,
            userId,
            kind: 'oidc',
            issuer: external.issuer,
            subject: external.subject,
            providerTenantId: external.providerTenantId,
            createdAt: timestamp,
            lastAuthenticatedAt: timestamp,
            disabledAt: null,
          },
          candidatePrincipal: {
            id: createId('ssoprincipal'),
            workspaceId: connection.workspaceId,
            connectionId: connection.id,
            userId,
            externalId: external.externalId,
            issuer: external.issuer,
            subject: external.subject,
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            deprovisionedAt: null,
          },
          candidateSession: candidate.record,
          auditEvent: auditEvent(request, {
            workspaceId: connection.workspaceId,
            actorUserId: null,
            eventType: 'enterprise_sso_authenticated',
            connectionId: connection.id,
            occurredAt: timestamp,
            metadata: { provider: connection.provider },
          }),
        });
        if (result.status !== 'authenticated') {
          return reply.code(403).send({
            error: 'enterprise_access_denied',
            message: 'Enterprise access has not been provisioned for this account',
          });
        }
        reply.header('set-cookie', serializeAuthSessionCookie(candidate.rawToken));
        emitMutation(
          options.observability,
          request,
          connection.workspaceId,
          result.userId,
          'authenticated',
          'auth.enterprise_oidc.completed',
        );
        return { status: 'authenticated', returnTo: attempt.returnTo };
      } catch {
        return invalidEnterpriseCallback(reply);
      }
    },
  );

  fastify.delete(
    '/v1/workspaces/:workspaceId/enterprise/scim-tokens/:scimConnectionId',
    { schema: { params: EnterpriseScimConnectionParams } },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId, scimConnectionId } = request.params as ScimConnectionRouteParams;
      const disabledAt = context.now.toISOString();
      const result = await options.repository.disableEnterpriseScimConnection({
        workspaceId,
        scimConnectionId,
        actorUserId: context.userId,
        disabledAt,
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'scim_token_disabled',
          connectionId: null,
          occurredAt: disabledAt,
          metadata: { scimConnectionId },
        }),
      });
      return result === 'completed' ? reply.code(204).send() : sendMutationFailure(reply, result);
    },
  );

  fastify.post(
    '/v1/auth/sso/discover',
    { schema: { body: EnterpriseSsoDiscoveryRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const body = request.body as DiscoveryBody;
      const domain = normalizedEmailDomain(body.email);
      if (!domain) return { available: false };
      const allowed = await options.repository.consumeAuthRateLimit({
        bucketHash: hashAuthRateBucket('enterprise-discovery', 'source', credentialSource),
        scope: 'sign-in',
        now: readClock(options.clock).toISOString(),
        windowMs: ENTERPRISE_MUTATION_RATE_POLICY.windowMs,
        maxAttempts: ENTERPRISE_MUTATION_RATE_POLICY.maxAttempts,
        blockMs: ENTERPRISE_MUTATION_RATE_POLICY.blockMs,
      });
      if (!allowed.allowed) return sendRateLimited(reply, allowed.retryAfterSeconds);
      const discovered = await options.repository.discoverEnterpriseSso(domain);
      // The response is deliberately independent of account existence. It only
      // describes verified company-domain routing metadata.
      return discovered ? { available: true, ...discovered } : { available: false };
    },
  );

  fastify.get(
    '/v1/workspaces/:workspaceId/enterprise/configuration',
    { schema: { params: EnterpriseWorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const result = await options.repository.getEnterpriseWorkspaceConfiguration(
        workspaceId,
        authenticated.session.userId,
      );
      if (result.status !== 'ok') return sendReadFailure(reply, result.status);
      return {
        policy: result.value.policy,
        connections: result.value.connections,
        domains: result.value.domains.map(
          ({ verificationTokenHash: _secret, ...domain }) => domain,
        ),
        groupRoleMappings: result.value.groupRoleMappings,
        scimConnections: result.value.scimConnections.map(
          ({
            tokenHash: _secret,
            workspaceId: _workspaceId,
            createdByUserId: _actor,
            updatedAt: _updated,
            ...connection
          }) => connection,
        ),
      };
    },
  );

  fastify.get(
    '/v1/workspaces/:workspaceId/enterprise/sso-connections',
    { schema: { params: EnterpriseWorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const result = await options.repository.listEnterpriseSsoConnections(
        workspaceId,
        authenticated.session.userId,
      );
      if (result.status !== 'ok') return sendReadFailure(reply, result.status);
      return { connections: result.value };
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/enterprise/sso-connections',
    { schema: { params: EnterpriseWorkspaceParams, body: CreateEnterpriseSsoConnectionRequest } },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const body = request.body as CreateConnectionBody;
      const now = context.now.toISOString();
      const id = createId('sso');
      const result = await options.repository.createEnterpriseSsoConnection({
        actorUserId: context.userId,
        connection: {
          id,
          workspaceId,
          provider: body.provider,
          protocol: body.protocol,
          issuer: canonicalIssuer(body.issuer),
          clientId: body.clientId.trim(),
          provisioningMode: body.provisioningMode,
          status: 'validation_required',
          validatedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'sso_connection_created',
          connectionId: id,
          occurredAt: now,
          metadata: {
            provider: body.provider,
            protocol: body.protocol,
            provisioningMode: body.provisioningMode,
          },
        }),
      });
      emitMutation(
        options.observability,
        request,
        workspaceId,
        context.userId,
        result,
        'enterprise.sso.create',
      );
      if (result !== 'completed') return sendMutationFailure(reply, result);
      return reply.code(201).send({
        id,
        workspaceId,
        provider: body.provider,
        protocol: body.protocol,
        issuer: canonicalIssuer(body.issuer),
        clientId: body.clientId.trim(),
        provisioningMode: body.provisioningMode,
        status: 'validation_required',
        validatedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/enterprise/domains',
    { schema: { params: EnterpriseWorkspaceParams, body: CreateEnterpriseDomainRequest } },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const body = request.body as CreateDomainBody;
      const domain = normalizeDomain(body.domain);
      if (!domain)
        return reply
          .code(400)
          .send({ error: 'invalid_domain', message: 'Company domain is invalid' });
      const now = context.now.toISOString();
      const id = createId('ssodomain');
      const token = randomBytes(32).toString('base64url');
      const verificationRecordName = `_lodariq.${domain}`;
      const verificationRecordValue = `lodariq-domain-verification=${token}`;
      const result = await options.repository.createEnterpriseDomain({
        actorUserId: context.userId,
        domain: {
          id,
          workspaceId,
          connectionId: body.connectionId,
          domain,
          status: 'pending',
          verificationTokenHash: sha256(token),
          verificationRecordName,
          verifiedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'domain_verification_started',
          connectionId: body.connectionId,
          occurredAt: now,
          metadata: { domainId: id },
        }),
      });
      if (result !== 'completed') return sendMutationFailure(reply, result);
      // The raw proof is returned once and is never persisted or logged.
      return reply.code(201).send({
        id,
        workspaceId,
        connectionId: body.connectionId,
        domain,
        status: 'pending',
        verificationRecordName,
        verificationRecordValue,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/enterprise/domains/:domainId/verify',
    {
      schema: {
        params: EnterpriseDomainParams,
        body: EnterpriseDomainVerificationRequest,
      },
    },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId, domainId } = request.params as DomainRouteParams;
      // The caller repeats only the one-time DNS value. The domain and record
      // name come from the pending server-owned row, so a proof published on a
      // different caller-controlled domain cannot verify this record.
      const rawProof = readSingleHeader(request, 'x-lodariq-domain-verification');
      if (!rawProof) {
        return reply
          .code(400)
          .send({ error: 'invalid_domain_proof', message: 'DNS verification proof is required' });
      }
      const pending = await options.repository.getEnterpriseDomainForVerification(
        workspaceId,
        domainId,
        context.userId,
      );
      if (pending.status !== 'ok') return sendReadFailure(reply, pending.status);
      const recordName = pending.value.verificationRecordName;
      const expectedValue = `lodariq-domain-verification=${rawProof}`;
      if (!(await domainVerification.verifyTxtRecord(recordName, expectedValue))) {
        return reply
          .code(409)
          .send({ error: 'domain_not_verified', message: 'Expected DNS TXT record was not found' });
      }
      const now = context.now.toISOString();
      const result = await options.repository.verifyEnterpriseDomain({
        workspaceId,
        domainId,
        actorUserId: context.userId,
        verificationTokenHash: sha256(rawProof),
        verifiedAt: now,
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'domain_verified',
          connectionId: null,
          occurredAt: now,
          metadata: { domainId },
        }),
      });
      return result === 'completed' ? reply.code(204).send() : sendMutationFailure(reply, result);
    },
  );

  fastify.put(
    '/v1/workspaces/:workspaceId/enterprise/auth-policy',
    { schema: { params: EnterpriseWorkspaceParams, body: UpdateWorkspaceAuthPolicyRequest } },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const body = request.body as UpdatePolicyBody;
      if (body.minimumAssurance === 'aal3') {
        return reply.code(400).send({
          error: 'unsupported_assurance_level',
          message: 'AAL3 policy is unavailable until a supported AAL3 authenticator is deployed',
        });
      }
      const current = await options.repository.getWorkspaceAuthPolicy(workspaceId);
      if (!current)
        return reply
          .code(404)
          .send({ error: 'workspace_not_found', message: 'Workspace not found' });
      const ssoSatisfied = current.ssoRequired
        ? await options.repository.identitySatisfiesWorkspaceSso(workspaceId, context.identityId)
        : false;
      const policyFailure = workspaceSessionPolicyFailure(context.session, current, ssoSatisfied);
      const breakGlassRequestId = policyFailure
        ? (readSingleHeader(request, 'x-lodariq-break-glass-request-id') ?? null)
        : null;
      if (policyFailure && !breakGlassRequestId) {
        return reply.code(403).send({
          error: 'break_glass_required',
          message: 'An approved, single-use break-glass request is required',
        });
      }
      const now = context.now.toISOString();
      const result = await options.repository.updateWorkspaceEnterprisePolicy({
        workspaceId,
        actorUserId: context.userId,
        ssoRequired: body.ssoRequired,
        minimumAssurance: body.minimumAssurance,
        passwordAllowed: body.passwordAllowed,
        updatedAt: now,
        breakGlassRequestId,
        breakGlassAuditEvent: breakGlassRequestId
          ? auditEvent(request, {
              workspaceId,
              actorUserId: context.userId,
              eventType: 'break_glass_consumed',
              connectionId: null,
              occurredAt: now,
              metadata: { requestId: breakGlassRequestId },
            })
          : null,
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'workspace_auth_policy_updated',
          connectionId: null,
          occurredAt: now,
          metadata: {
            ssoRequired: body.ssoRequired,
            minimumAssurance: body.minimumAssurance,
            passwordAllowed: body.passwordAllowed,
            usedBreakGlass: Boolean(breakGlassRequestId),
          },
        }),
      });
      return result === 'completed' ? reply.code(204).send() : sendMutationFailure(reply, result);
    },
  );

  fastify.put(
    '/v1/workspaces/:workspaceId/enterprise/sso-connections/:connectionId/group-role-mappings',
    {
      schema: { params: EnterpriseConnectionParams, body: UpsertEnterpriseGroupRoleMappingRequest },
    },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId, connectionId } = request.params as ConnectionRouteParams;
      const body = request.body as GroupMappingBody;
      const now = context.now.toISOString();
      const mappingId = createId('ssogroup');
      const result = await options.repository.upsertEnterpriseGroupRoleMapping({
        actorUserId: context.userId,
        mapping: {
          id: mappingId,
          workspaceId,
          connectionId,
          groupId: body.groupId,
          role: body.role,
          createdAt: now,
          updatedAt: now,
        },
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'group_role_mapping_updated',
          connectionId,
          occurredAt: now,
          metadata: { mappingId, role: body.role },
        }),
      });
      if (result !== 'completed') return sendMutationFailure(reply, result);
      return reply.code(200).send({
        id: mappingId,
        workspaceId,
        connectionId,
        groupId: body.groupId,
        role: body.role,
        createdAt: now,
        updatedAt: now,
      });
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/enterprise/scim-tokens',
    { schema: { params: EnterpriseWorkspaceParams, body: CreateScimTokenRequest } },
    async (request, reply) => {
      const context = await requireEnterpriseAdminMutation(options, request, reply);
      if (!context) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const body = request.body as CreateScimTokenBody;
      const id = createId('scim');
      const token = `lq_scim_${randomBytes(32).toString('base64url')}`;
      const now = context.now.toISOString();
      const result = await options.repository.createEnterpriseScimConnection({
        actorUserId: context.userId,
        connection: {
          id,
          workspaceId,
          connectionId: body.connectionId,
          tokenHash: sha256(token),
          tokenPrefix: token.slice(0, 16),
          status: 'active',
          createdByUserId: context.userId,
          lastUsedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'scim_token_created',
          connectionId: body.connectionId,
          occurredAt: now,
          metadata: { scimConnectionId: id },
        }),
      });
      if (result !== 'completed') return sendMutationFailure(reply, result);
      return reply.code(201).send({ id, token, createdAt: now });
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/enterprise/break-glass',
    { schema: { params: EnterpriseWorkspaceParams, body: CreateBreakGlassRequest } },
    async (request, reply) => {
      const context = await requireBreakGlassMutation(options, request, reply);
      if (!context) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const body = request.body as CreateBreakGlassBody;
      const createdAt = context.now.toISOString();
      const id = createId('breakglass');
      const result = await options.repository.createEnterpriseBreakGlass({
        request: {
          id,
          workspaceId,
          requestedByUserId: context.userId,
          approvedByUserId: null,
          status: 'pending_approval',
          reason: body.reason.trim(),
          expiresAt: new Date(context.now.getTime() + BREAK_GLASS_TTL_MS).toISOString(),
          approvedAt: null,
          consumedAt: null,
          createdAt,
        },
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'break_glass_requested',
          connectionId: null,
          occurredAt: createdAt,
          metadata: { reasonLength: body.reason.trim().length },
        }),
      });
      if (result !== 'completed') return sendMutationFailure(reply, result);
      return reply.code(201).send({
        id,
        workspaceId,
        requestedByUserId: context.userId,
        approvedByUserId: null,
        status: 'pending_approval',
        reason: body.reason.trim(),
        expiresAt: new Date(context.now.getTime() + BREAK_GLASS_TTL_MS).toISOString(),
        approvedAt: null,
        consumedAt: null,
        createdAt,
      });
    },
  );

  fastify.get(
    '/v1/workspaces/:workspaceId/enterprise/audit-events',
    { schema: { params: EnterpriseWorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const result = await options.repository.listEnterpriseAuditEvents(
        workspaceId,
        authenticated.session.userId,
      );
      if (result.status !== 'ok') return sendReadFailure(reply, result.status);
      return { events: result.value };
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/enterprise/break-glass/:requestId/approve',
    { schema: { params: BreakGlassParams, body: BreakGlassApprovalRequest } },
    async (request, reply) => {
      const context = await requireBreakGlassMutation(options, request, reply);
      if (!context) return;
      const { workspaceId, requestId } = request.params as BreakGlassRouteParams;
      const now = context.now.toISOString();
      const result = await options.repository.approveEnterpriseBreakGlass({
        workspaceId,
        requestId,
        approverUserId: context.userId,
        approvedAt: now,
        auditEvent: auditEvent(request, {
          workspaceId,
          actorUserId: context.userId,
          eventType: 'break_glass_approved',
          connectionId: null,
          occurredAt: now,
          metadata: { requestId },
        }),
      });
      return result === 'completed' ? reply.code(204).send() : sendMutationFailure(reply, result);
    },
  );

  fastify.get('/v1/scim/ServiceProviderConfig', async (_request, reply) => {
    reply.type('application/scim+json');
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 1 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer Token', primary: true }],
    };
  });

  fastify.get(
    '/v1/scim/Users',
    { schema: { querystring: ScimUserListQuery } },
    async (request, reply) => {
      const scim = await authenticateScim(options.repository, request, reply, options.clock);
      if (!scim) return;
      const query = request.query as ScimListQuery;
      const match = /^userName\s+eq\s+"([^"\\]{3,320})"$/iu.exec(query.filter);
      if (!match || !normalizeScimEmail(match[1] ?? '')) {
        return scimError(reply, 400, 'invalidFilter', 'Only an exact userName filter is supported');
      }
      const user = await options.repository.findEnterpriseScimUser({
        scimConnectionId: scim.id,
        scimTokenHash: scim.tokenHash,
        emailNormalized: normalizeScimEmail(match[1] ?? '')!,
      });
      const resources = user ? [toScimUser(user)] : [];
      reply.type('application/scim+json');
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: resources.length,
        startIndex: 1,
        itemsPerPage: resources.length,
        Resources: resources,
      };
    },
  );

  fastify.get(
    '/v1/scim/Users/:id',
    { schema: { params: ScimUserParams } },
    async (request, reply) => {
      const scim = await authenticateScim(options.repository, request, reply, options.clock);
      if (!scim) return;
      const { id } = request.params as ScimUserRouteParams;
      const user = await options.repository.findEnterpriseScimUser({
        scimConnectionId: scim.id,
        scimTokenHash: scim.tokenHash,
        principalId: id,
      });
      if (!user) return scimError(reply, 404, undefined, 'SCIM user not found');
      reply.type('application/scim+json');
      return toScimUser(user);
    },
  );

  fastify.post(
    '/v1/scim/Users',
    { schema: { body: ScimCreateUserRequest } },
    async (request, reply) => {
      const scim = await authenticateScim(options.repository, request, reply, options.clock);
      if (!scim) return;
      const body = request.body as ScimCreateBody;
      if (body.active === false) {
        return scimError(reply, 400, 'invalidValue', 'New SCIM users must be active');
      }
      const normalizedEmail = body.userName.trim().toLowerCase();
      if (
        body.emails?.length &&
        !body.emails.some((email) => normalizeScimEmail(email.value) === normalizedEmail)
      ) {
        return scimError(reply, 400, 'invalidValue', 'userName must match a supplied email');
      }
      const displayName = scimDisplayName(body);
      const now = readClock(options.clock).toISOString();
      const userId = createId('user');
      const principalId = createId('ssoprincipal');
      const result = await options.repository.provisionEnterpriseScimUser({
        scimConnectionId: scim.id,
        scimTokenHash: scim.tokenHash,
        user: {
          id: userId,
          legacyIdentityId: null,
          email: normalizedEmail,
          name: displayName,
          emailVerifiedAt: now,
          deletedAt: null,
          retentionExpiresAt: null,
          createdAt: now,
        },
        email: {
          id: createId('email'),
          userId,
          normalizedEmail,
          isPrimary: true,
          verifiedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        principal: {
          id: principalId,
          workspaceId: scim.workspaceId,
          connectionId: scim.connectionId,
          userId,
          externalId: body.externalId,
          issuer: scim.issuer,
          subject: null,
          active: true,
          createdAt: now,
          updatedAt: now,
          deprovisionedAt: null,
        },
        role: 'viewer',
        groupIds: body.groups?.map((group) => group.value) ?? [],
        occurredAt: now,
        auditEvent: auditEvent(request, {
          workspaceId: scim.workspaceId,
          actorUserId: null,
          eventType: 'scim_user_provisioned',
          connectionId: scim.connectionId,
          targetUserId: userId,
          occurredAt: now,
          metadata: { principalId },
        }),
      });
      if (result.status === 'conflict')
        return scimError(reply, 409, 'uniqueness', 'User requires administrator reconciliation');
      if (result.status !== 'created')
        return scimError(reply, 400, 'invalidValue', 'SCIM user could not be provisioned');
      reply.type('application/scim+json').header('location', `/v1/scim/Users/${principalId}`);
      return reply.code(201).send({
        schemas: [SCIM_USER_SCHEMA],
        id: principalId,
        externalId: body.externalId,
        userName: normalizedEmail,
        active: true,
        ...(displayName ? { displayName } : {}),
      });
    },
  );

  fastify.put(
    '/v1/scim/Users/:id',
    { schema: { params: ScimUserParams, body: ScimReplaceUserRequest } },
    async (request, reply) => {
      const scim = await authenticateScim(options.repository, request, reply, options.clock);
      if (!scim) return;
      const { id } = request.params as ScimUserRouteParams;
      const body = request.body as ScimReplaceBody;
      const existing = await options.repository.findEnterpriseScimUser({
        scimConnectionId: scim.id,
        scimTokenHash: scim.tokenHash,
        principalId: id,
      });
      if (!existing) return scimError(reply, 404, undefined, 'SCIM user not found');
      const userName = normalizeScimEmail(body.userName);
      if (!userName || userName !== existing.userName || body.externalId !== existing.externalId) {
        return scimError(
          reply,
          409,
          'mutability',
          'userName and externalId require administrator reconciliation',
        );
      }
      const displayName = scimDisplayName(body);
      const now = readClock(options.clock).toISOString();
      const result = await options.repository.updateEnterpriseScimUser({
        scimConnectionId: scim.id,
        scimTokenHash: scim.tokenHash,
        principalId: id,
        active: body.active,
        ...(displayName ? { displayName } : {}),
        occurredAt: now,
        auditEvent: auditEvent(request, {
          workspaceId: scim.workspaceId,
          actorUserId: null,
          eventType: body.active ? 'scim_user_updated' : 'scim_user_deprovisioned',
          connectionId: scim.connectionId,
          targetUserId: null,
          occurredAt: now,
          metadata: { principalId: id, active: body.active },
        }),
      });
      if (result !== 'completed') {
        return scimError(reply, 409, 'mutability', 'SCIM user could not be replaced');
      }
      reply.type('application/scim+json');
      return toScimUser({
        ...existing,
        active: body.active,
        displayName: displayName ?? existing.displayName,
      });
    },
  );

  fastify.patch(
    '/v1/scim/Users/:id',
    { schema: { params: ScimUserParams, body: ScimPatchUserRequest } },
    async (request, reply) => {
      const scim = await authenticateScim(options.repository, request, reply, options.clock);
      if (!scim) return;
      const { id } = request.params as ScimUserRouteParams;
      const body = request.body as ScimPatchBody;
      const activeOperation = body.Operations.find((operation) => operation.path === 'active');
      const nameOperation = body.Operations.find((operation) => operation.path === 'displayName');
      const activeValue = activeOperation ? parseScimBoolean(activeOperation.value) : undefined;
      if (activeOperation && activeValue === null) {
        return scimError(reply, 400, 'invalidValue', 'active must be boolean');
      }
      if (nameOperation && typeof nameOperation.value !== 'string') {
        return scimError(reply, 400, 'invalidValue', 'displayName must be a string');
      }
      const now = readClock(options.clock).toISOString();
      const deprovision = activeValue === false;
      const result = await options.repository.updateEnterpriseScimUser({
        scimConnectionId: scim.id,
        scimTokenHash: scim.tokenHash,
        principalId: id,
        ...(nameOperation && typeof nameOperation.value === 'string'
          ? { displayName: nameOperation.value.trim() }
          : {}),
        ...(typeof activeValue === 'boolean' ? { active: activeValue } : {}),
        occurredAt: now,
        auditEvent: auditEvent(request, {
          workspaceId: scim.workspaceId,
          actorUserId: null,
          eventType: deprovision ? 'scim_user_deprovisioned' : 'scim_user_updated',
          connectionId: scim.connectionId,
          occurredAt: now,
          metadata: { principalId: id, active: activeValue ?? null },
        }),
      });
      if (result === 'not_found') return scimError(reply, 404, undefined, 'SCIM user not found');
      if (result !== 'completed')
        return scimError(reply, 409, 'mutability', 'SCIM update requires administrator review');
      return reply.code(204).send();
    },
  );
}

async function requireEnterpriseAdminMutation(
  options: RegisterEnterpriseIdentityRoutesOptions,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  setPrivateResponseHeaders(reply);
  if (!requireTrustedMutationOrigin(request, reply)) return null;
  const source = requireCredentialGateway(request, reply);
  if (!source) return null;
  const authenticated = await requireOwnedSession(options.repository, request, reply);
  if (!authenticated) return null;
  const now = readClock(options.clock);
  if (!isRecentAuthentication(authenticated.session.authenticatedAt, now)) {
    await reply
      .code(403)
      .send({
        error: 'recent_authentication_required',
        message: 'Sign in again before changing enterprise identity settings',
      });
    return null;
  }
  if (!assuranceAtLeast(authenticated.session.assuranceLevel, 'aal2')) {
    await reply
      .code(403)
      .send({
        error: 'minimum_assurance_required',
        message: 'A passkey or equivalent step-up is required',
      });
    return null;
  }
  const allowed = await options.repository.consumeAuthRateLimit({
    bucketHash: hashAuthRateBucket('enterprise-mutation', 'user', authenticated.session.userId),
    scope: 'sign-in',
    now: now.toISOString(),
    windowMs: ENTERPRISE_MUTATION_RATE_POLICY.windowMs,
    maxAttempts: ENTERPRISE_MUTATION_RATE_POLICY.maxAttempts,
    blockMs: ENTERPRISE_MUTATION_RATE_POLICY.blockMs,
  });
  if (!allowed.allowed) {
    sendRateLimited(reply, allowed.retryAfterSeconds);
    return null;
  }
  return {
    userId: authenticated.session.userId,
    identityId: authenticated.session.identityId,
    session: authenticated.session,
    now,
  };
}

async function requireBreakGlassMutation(
  options: RegisterEnterpriseIdentityRoutesOptions,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const context = await requireEnterpriseAdminMutation(options, request, reply);
  if (!context) return null;
  if (context.session.authenticationMethod === 'password') {
    await reply.code(403).send({
      error: 'break_glass_strong_method_required',
      message: 'Break-glass recovery cannot be authorized by a password session',
    });
    return null;
  }
  return context;
}

async function authenticateScim(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  clock: (() => Date) | undefined,
) {
  reply.header('cache-control', 'no-store').header('pragma', 'no-cache');
  const authorization = readSingleHeader(request, 'authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 512) {
    await scimError(reply, 401, undefined, 'Missing SCIM bearer token');
    return null;
  }
  const rawToken = authorization.slice('Bearer '.length);
  if (!/^lq_scim_[A-Za-z0-9_-]{32,}$/u.test(rawToken)) {
    await scimError(reply, 401, undefined, 'Invalid SCIM bearer token');
    return null;
  }
  const connection = await repository.resolveEnterpriseScimConnection(
    sha256(rawToken),
    readClock(clock).toISOString(),
  );
  if (!connection) {
    await scimError(reply, 401, undefined, 'Invalid SCIM bearer token');
    return null;
  }
  return connection;
}

const dnsDomainVerification: EnterpriseDomainVerificationCapability = {
  async verifyTxtRecord(recordName, expectedValue) {
    try {
      const records = await resolveTxt(recordName);
      return records.some((parts) => parts.join('') === expectedValue);
    } catch {
      return false;
    }
  },
};

function auditEvent(
  request: FastifyRequest,
  input: Omit<EnterpriseAuditEventRecord, 'id' | 'correlationId' | 'targetUserId'> & {
    targetUserId?: string | null;
  },
): EnterpriseAuditEventRecord {
  assertSafeEnterpriseAuditMetadata(input.metadata);
  return {
    id: createId('ssoevt'),
    correlationId: String(request.id)
      .replace(/[^A-Za-z0-9_-]/gu, '_')
      .padEnd(8, '_')
      .slice(0, 128),
    targetUserId: input.targetUserId ?? null,
    ...input,
  };
}

function assertSafeEnterpriseAuditMetadata(metadata: EnterpriseAuditEventRecord['metadata']): void {
  for (const key of Object.keys(metadata)) {
    if (!ENTERPRISE_AUDIT_METADATA_KEYS.has(key)) {
      throw new Error(`Enterprise audit metadata key is not allowlisted: ${key}`);
    }
  }
}

function emitMutation(
  sink: ObservabilitySink,
  request: FastifyRequest,
  workspaceId: string,
  userId: string,
  outcome: string,
  name: string,
): void {
  sink.emit({
    name,
    timestamp: new Date().toISOString(),
    correlationId: String(request.id),
    workspaceId,
    userId,
    attributes: { outcome },
  });
}

function sendMutationFailure(reply: FastifyReply, result: EnterpriseMutationResult) {
  if (result === 'forbidden')
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Workspace owner permission is required' });
  if (result === 'not_found')
    return reply
      .code(404)
      .send({ error: 'not_found', message: 'Enterprise identity resource not found' });
  if (result === 'validation_required')
    return reply
      .code(409)
      .send({
        error: 'validation_required',
        message: 'Real-tenant validation evidence is required before activation',
      });
  if (result === 'invalid_input')
    return reply
      .code(400)
      .send({ error: 'invalid_input', message: 'Enterprise identity input is invalid' });
  return reply
    .code(409)
    .send({
      error: 'enterprise_identity_conflict',
      message: 'Enterprise identity state changed; refresh and retry',
    });
}

function sendReadFailure(reply: FastifyReply, result: 'forbidden' | 'not_found') {
  return result === 'not_found'
    ? reply
        .code(404)
        .send({ error: 'not_found', message: 'Enterprise identity resource not found' })
    : reply
        .code(403)
        .send({ error: 'forbidden', message: 'Workspace administrator permission is required' });
}

function sendRateLimited(reply: FastifyReply, retryAfterSeconds: number) {
  reply.header('retry-after', String(Math.max(1, retryAfterSeconds)));
  return reply
    .code(429)
    .send({ error: 'rate_limited', message: 'Too many attempts; try again later' });
}

function enterpriseSsoUnavailable(reply: FastifyReply) {
  return reply.code(404).send({
    error: 'enterprise_sso_unavailable',
    message: 'Enterprise sign-in is unavailable',
  });
}

function invalidEnterpriseCallback(reply: FastifyReply) {
  return reply.code(400).send({
    error: 'invalid_enterprise_oidc_callback',
    message: 'Enterprise sign-in could not be completed',
  });
}

function scimError(
  reply: FastifyReply,
  status: number,
  scimType: string | undefined,
  detail: string,
) {
  reply.type('application/scim+json');
  return reply.code(status).send({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: String(status),
    ...(scimType ? { scimType } : {}),
    detail,
  });
}

function readSingleHeader(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedEmailDomain(email: string): string | null {
  const separator = email.lastIndexOf('@');
  return separator > 0 ? normalizeDomain(email.slice(separator + 1)) : null;
}

function normalizeDomain(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\.$/u, '');
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(normalized)
    ? normalized
    : null;
}

function normalizeScimEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : null;
}

function scimDisplayName(input: {
  displayName?: string;
  name?: { formatted?: string; givenName?: string; familyName?: string };
}): string | null {
  const explicit = input.displayName?.trim() || input.name?.formatted?.trim();
  if (explicit) return explicit.slice(0, 120);
  const composed = [input.name?.givenName?.trim(), input.name?.familyName?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  return composed ? composed.slice(0, 120) : null;
}

function parseScimBoolean(value: boolean | string): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return null;
}

function toScimUser(user: EnterpriseScimUserRecord) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.externalId,
    userName: user.userName,
    active: user.active,
    ...(user.displayName ? { displayName: user.displayName } : {}),
  };
}

function canonicalIssuer(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/u, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

function readClock(clock: (() => Date) | undefined): Date {
  const value = clock?.() ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new Error('Enterprise identity clock is invalid');
  return value;
}

function setPrivateResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}
