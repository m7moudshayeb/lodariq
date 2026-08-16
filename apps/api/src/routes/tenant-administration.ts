import { randomBytes } from 'node:crypto';
import type { ControlPlaneRepository, TenantMutationResult } from '@lodariq/database';
import { WORKSPACE_DELETION_RETENTION_MS } from '@lodariq/database';
import {
  AcceptWorkspaceInvitationRequest,
  CreateWorkspaceInvitationRequest,
  TransferWorkspaceOwnershipRequest,
  UpdateWorkspaceMemberRoleRequest,
  WorkspaceInvitationParams,
  WorkspaceMemberParams,
  WorkspaceParams,
  type AcceptWorkspaceInvitationRequest as AcceptInvitationBody,
  type CreateWorkspaceInvitationRequest as CreateInvitationBody,
  type TransferWorkspaceOwnershipRequest as TransferOwnershipBody,
  type UpdateWorkspaceMemberRoleRequest as UpdateMemberBody,
  type WorkspaceInvitationParams as InvitationParams,
  type WorkspaceMemberParams as MemberParams,
  type WorkspaceParams as WorkspaceRouteParams,
} from '@lodariq/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  createWorkspaceInvitationToken,
  hashAuthEmailLookup,
  hashAuthRateBucket,
  hashWorkspaceInvitationToken,
  normalizeAuthEmail,
  readEmailVerificationConfiguration,
  serializeExpiredAuthSessionCookie,
  WORKSPACE_INVITATION_TTL_MS,
  isRecentAuthentication,
} from '../auth';
import type { EmailVerificationDeliveryCapability } from '../auth';
import type { ObservabilitySink } from '../observability';
import {
  requireCredentialGateway,
  requireOwnedSession,
  requireTrustedMutationOrigin,
} from './auth';

export interface RegisterTenantAdministrationRoutesOptions {
  repository: ControlPlaneRepository;
  observability: ObservabilitySink;
  emailVerificationDelivery?: EmailVerificationDeliveryCapability;
  clock?: () => Date;
}

const TENANT_MUTATION_RATE_POLICY = Object.freeze({
  windowMs: 60 * 60 * 1_000,
  userMaxAttempts: 100,
  sourceMaxAttempts: 300,
  blockMs: 60 * 60 * 1_000,
});

export function registerTenantAdministrationRoutes(
  fastify: FastifyInstance,
  options: RegisterTenantAdministrationRoutesOptions,
): void {
  const invitationDelivery = readEmailVerificationConfiguration(
    process.env,
    options.emailVerificationDelivery,
  );
  fastify.get(
    '/v1/workspaces/:workspaceId/members',
    { schema: { params: WorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const result = await options.repository.listWorkspaceMembers(
        workspaceId,
        authenticated.session.userId,
      );
      if (result.status !== 'ok') return sendTenantReadFailure(reply, result.status);
      return {
        members: result.value.map(({ workspaceId: _workspaceId, ...member }) => member),
      };
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/invitations',
    { schema: { params: WorkspaceParams, body: CreateWorkspaceInvitationRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const body = request.body as CreateInvitationBody;
      const now = readTenantClock(options.clock);
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + WORKSPACE_INVITATION_TTL_MS).toISOString();
      const invitationId = createTenantId('invite');
      const eventId = createTenantId('tenevt');
      if (!invitationDelivery.available) {
        return reply.code(503).send({
          error: 'invitation_delivery_unavailable',
          message: 'Workspace invitation delivery is temporarily unavailable',
        });
      }
      const invitationToken = createWorkspaceInvitationToken(
        invitationId,
        invitationDelivery.secret,
      );
      const emailNormalized = normalizeAuthEmail(body.email);
      const result = await options.repository.createWorkspaceInvitation({
        invitation: {
          id: invitationId,
          workspaceId,
          emailNormalized,
          emailLookupHash: hashAuthEmailLookup(emailNormalized),
          tokenHash: hashWorkspaceInvitationToken(invitationToken),
          role: body.role,
          invitedByUserId: authenticated.session.userId,
          expiresAt,
          acceptedAt: null,
          revokedAt: null,
          createdAt,
        },
        outbox: {
          id: createTenantId('outbox'),
          keyId: invitationDelivery.keyId,
          acceptancePath: '/accept-invitation',
        },
        eventId,
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.invitation.create',
        timestamp: createdAt,
        workspaceId,
        userId: authenticated.session.userId,
        attributes: { outcome: result.status, role: body.role, invitationId },
      });
      if (result.status !== 'created') return sendCreateInvitationFailure(reply, result.status);
      return reply.code(201).send({
        id: invitationId,
        workspaceId,
        role: body.role,
        expiresAt,
        ...(invitationDelivery.exposeDevelopmentToken ? { invitationToken } : {}),
      });
    },
  );

  fastify.get(
    '/v1/workspaces/:workspaceId/invitations',
    { schema: { params: WorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const now = readTenantClock(options.clock).toISOString();
      const result = await options.repository.listWorkspaceInvitations(
        workspaceId,
        authenticated.session.userId,
        now,
      );
      if (result.status !== 'ok') return sendTenantReadFailure(reply, result.status);
      return {
        invitations: result.value.map(({ workspaceId: _workspaceId, ...invitation }) => invitation),
      };
    },
  );

  fastify.delete(
    '/v1/workspaces/:workspaceId/invitations/:invitationId',
    { schema: { params: WorkspaceInvitationParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const { workspaceId, invitationId } = request.params as InvitationParams;
      const now = readTenantClock(options.clock).toISOString();
      const result = await options.repository.revokeWorkspaceInvitation({
        workspaceId,
        invitationId,
        actorUserId: authenticated.session.userId,
        revokedAt: now,
        eventId: createTenantId('tenevt'),
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.invitation.revoke',
        timestamp: now,
        workspaceId,
        userId: authenticated.session.userId,
        attributes: { outcome: result, invitationId },
      });
      return sendTenantMutationResult(reply, result);
    },
  );

  fastify.post(
    '/v1/workspace-invitations/accept',
    { schema: { body: AcceptWorkspaceInvitationRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const body = request.body as AcceptInvitationBody;
      const now = readTenantClock(options.clock).toISOString();
      const result = await options.repository.acceptWorkspaceInvitation({
        invitationId: body.invitationId,
        tokenHash: hashWorkspaceInvitationToken(body.token),
        userId: authenticated.session.userId,
        acceptedAt: now,
        eventId: createTenantId('tenevt'),
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.invitation.accept',
        timestamp: now,
        userId: authenticated.session.userId,
        ...(result.status === 'accepted' ? { workspaceId: result.workspaceId } : {}),
        attributes: { outcome: result.status, invitationId: body.invitationId },
      });
      if (result.status === 'accepted') {
        return reply.code(200).send({ workspaceId: result.workspaceId, role: result.role });
      }
      if (result.status === 'membership_conflict') {
        return reply.code(409).send({
          error: 'workspace_membership_conflict',
          message: 'This account already belongs to the workspace',
        });
      }
      return reply.code(400).send({
        error: 'invitation_invalid_or_expired',
        message: 'This invitation is invalid, expired, or does not match your verified email',
      });
    },
  );

  fastify.patch(
    '/v1/workspaces/:workspaceId/members/:userId',
    { schema: { params: WorkspaceMemberParams, body: UpdateWorkspaceMemberRoleRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const { workspaceId, userId } = request.params as MemberParams;
      const body = request.body as UpdateMemberBody;
      const now = readTenantClock(options.clock).toISOString();
      const result = await options.repository.updateWorkspaceMemberRole({
        workspaceId,
        targetUserId: userId,
        actorUserId: authenticated.session.userId,
        nextRole: body.role,
        changedAt: now,
        eventId: createTenantId('tenevt'),
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.membership.role_change',
        timestamp: now,
        workspaceId,
        userId: authenticated.session.userId,
        attributes: { outcome: result, targetUserId: userId, nextRole: body.role },
      });
      return sendTenantMutationResult(reply, result);
    },
  );

  fastify.delete(
    '/v1/workspaces/:workspaceId/members/:userId',
    { schema: { params: WorkspaceMemberParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const { workspaceId, userId } = request.params as MemberParams;
      const now = readTenantClock(options.clock).toISOString();
      const result = await options.repository.removeWorkspaceMember({
        workspaceId,
        targetUserId: userId,
        actorUserId: authenticated.session.userId,
        removedAt: now,
        eventId: createTenantId('tenevt'),
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.membership.remove',
        timestamp: now,
        workspaceId,
        userId: authenticated.session.userId,
        attributes: { outcome: result, targetUserId: userId },
      });
      if (result === 'completed' && userId === authenticated.session.userId) {
        expireSessionCookie(reply);
      }
      return sendTenantMutationResult(reply, result);
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/ownership-transfer',
    { schema: { params: WorkspaceParams, body: TransferWorkspaceOwnershipRequest } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const recentNow = readTenantClock(options.clock);
      if (
        !requireRecentTenantAuthentication(reply, authenticated.session.authenticatedAt, recentNow)
      ) {
        return;
      }
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const body = request.body as TransferOwnershipBody;
      const now = recentNow.toISOString();
      const result = await options.repository.transferWorkspaceOwnership({
        workspaceId,
        actorUserId: authenticated.session.userId,
        targetUserId: body.targetUserId,
        transferredAt: now,
        eventId: createTenantId('tenevt'),
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.ownership.transfer',
        timestamp: now,
        workspaceId,
        userId: authenticated.session.userId,
        attributes: { outcome: result, targetUserId: body.targetUserId },
      });
      if (result === 'completed') expireSessionCookie(reply);
      return sendTenantMutationResult(reply, result);
    },
  );

  fastify.delete(
    '/v1/workspaces/:workspaceId',
    { schema: { params: WorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const recentNow = readTenantClock(options.clock);
      if (
        !requireRecentTenantAuthentication(reply, authenticated.session.authenticatedAt, recentNow)
      ) {
        return;
      }
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const now = recentNow;
      const changedAt = now.toISOString();
      const result = await options.repository.scheduleWorkspaceDeletion({
        workspaceId,
        actorUserId: authenticated.session.userId,
        changedAt,
        retentionExpiresAt: new Date(now.getTime() + WORKSPACE_DELETION_RETENTION_MS).toISOString(),
        eventId: createTenantId('tenevt'),
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.workspace.deletion_schedule',
        timestamp: changedAt,
        workspaceId,
        userId: authenticated.session.userId,
        attributes: { outcome: result.status },
      });
      if (result.status === 'completed') {
        expireSessionCookie(reply);
        return reply.code(202).send(result.deletion);
      }
      return sendScheduleDeletionFailure(reply, result.status);
    },
  );

  fastify.post(
    '/v1/workspaces/:workspaceId/deletion/cancel',
    { schema: { params: WorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      if (!requireTrustedMutationOrigin(request, reply)) return;
      const credentialSource = requireCredentialGateway(request, reply);
      if (!credentialSource) return;
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      if (
        !(await enforceTenantMutationRateLimit(
          options,
          reply,
          authenticated.session.userId,
          credentialSource,
        ))
      ) {
        return;
      }
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const now = readTenantClock(options.clock).toISOString();
      const result = await options.repository.cancelWorkspaceDeletion({
        workspaceId,
        actorUserId: authenticated.session.userId,
        changedAt: now,
        eventId: createTenantId('tenevt'),
      });
      emitTenantMutation(options.observability, {
        name: 'tenant.workspace.deletion_cancel',
        timestamp: now,
        workspaceId,
        userId: authenticated.session.userId,
        attributes: { outcome: result },
      });
      return sendTenantMutationResult(reply, result);
    },
  );

  fastify.get(
    '/v1/workspaces/:workspaceId/audit-events',
    { schema: { params: WorkspaceParams } },
    async (request, reply) => {
      setPrivateResponseHeaders(reply);
      const authenticated = await requireOwnedSession(options.repository, request, reply);
      if (!authenticated) return;
      const { workspaceId } = request.params as WorkspaceRouteParams;
      const result = await options.repository.listTenantAuditEvents(
        workspaceId,
        authenticated.session.userId,
      );
      if (result.status !== 'ok') return sendTenantReadFailure(reply, result.status);
      return { events: result.value };
    },
  );
}

async function enforceTenantMutationRateLimit(
  options: RegisterTenantAdministrationRoutesOptions,
  reply: FastifyReply,
  userId: string,
  source: string,
): Promise<boolean> {
  const now = readTenantClock(options.clock).toISOString();
  const sourceResult = await options.repository.consumeAuthRateLimit({
    bucketHash: hashAuthRateBucket('tenant-mutation', 'source', source),
    scope: 'sign-in',
    now,
    windowMs: TENANT_MUTATION_RATE_POLICY.windowMs,
    maxAttempts: TENANT_MUTATION_RATE_POLICY.sourceMaxAttempts,
    blockMs: TENANT_MUTATION_RATE_POLICY.blockMs,
  });
  if (!sourceResult.allowed) return sendRateLimitFailure(reply, sourceResult.retryAfterSeconds);
  const userResult = await options.repository.consumeAuthRateLimit({
    bucketHash: hashAuthRateBucket('tenant-mutation', 'user', userId),
    scope: 'sign-in',
    now,
    windowMs: TENANT_MUTATION_RATE_POLICY.windowMs,
    maxAttempts: TENANT_MUTATION_RATE_POLICY.userMaxAttempts,
    blockMs: TENANT_MUTATION_RATE_POLICY.blockMs,
  });
  return userResult.allowed ? true : sendRateLimitFailure(reply, userResult.retryAfterSeconds);
}

function sendRateLimitFailure(reply: FastifyReply, retryAfterSeconds: number): false {
  reply.header('retry-after', String(Math.max(retryAfterSeconds, 1)));
  void reply
    .code(429)
    .send({ error: 'rate_limited', message: 'Too many attempts; try again later' });
  return false;
}

function sendTenantReadFailure(reply: FastifyReply, status: 'forbidden' | 'not_found') {
  if (status === 'not_found') {
    return reply.code(404).send({ error: 'workspace_not_found', message: 'Workspace not found' });
  }
  return reply.code(403).send({ error: 'forbidden', message: 'Workspace permission required' });
}

function sendCreateInvitationFailure(
  reply: FastifyReply,
  status: 'forbidden' | 'not_found' | 'conflict' | 'invalid_input',
) {
  if (status === 'conflict') {
    return reply.code(409).send({
      error: 'workspace_invitation_conflict',
      message: 'An active invitation or membership already exists',
    });
  }
  if (status === 'invalid_input') {
    return reply.code(400).send({ error: 'invalid_input', message: 'Invitation input is invalid' });
  }
  return sendTenantReadFailure(reply, status);
}

function sendTenantMutationResult(reply: FastifyReply, result: TenantMutationResult) {
  if (result === 'completed') return reply.code(204).send();
  if (result === 'not_found') {
    return reply
      .code(404)
      .send({ error: 'tenant_resource_not_found', message: 'Resource not found' });
  }
  if (result === 'forbidden') {
    return reply.code(403).send({ error: 'forbidden', message: 'Workspace permission required' });
  }
  if (result === 'final_owner') {
    return reply.code(409).send({
      error: 'final_owner_required',
      message: 'Transfer ownership before removing or demoting the final owner',
    });
  }
  return reply.code(409).send({
    error: 'tenant_mutation_conflict',
    message: 'The workspace changed; refresh and try again',
  });
}

function sendScheduleDeletionFailure(
  reply: FastifyReply,
  status: 'forbidden' | 'not_found' | 'conflict',
) {
  if (status === 'conflict') {
    return reply.code(409).send({
      error: 'workspace_deletion_conflict',
      message: 'Workspace deletion is already scheduled or could not be scheduled',
    });
  }
  return sendTenantReadFailure(reply, status);
}

function createTenantId(prefix: 'invite' | 'outbox' | 'tenevt'): string {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

function readTenantClock(clock: (() => Date) | undefined): Date {
  const value = clock?.() ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new Error('Tenant administration clock is invalid');
  return value;
}

function setPrivateResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}

function expireSessionCookie(reply: FastifyReply): void {
  reply.header('set-cookie', serializeExpiredAuthSessionCookie());
}

function requireRecentTenantAuthentication(
  reply: FastifyReply,
  authenticatedAt: string,
  now: Date,
): boolean {
  if (isRecentAuthentication(authenticatedAt, now)) return true;
  void reply.code(403).send({
    error: 'recent_authentication_required',
    message: 'Sign in again before changing this workspace security setting',
  });
  return false;
}

function emitTenantMutation(
  sink: ObservabilitySink,
  event: Parameters<ObservabilitySink['emit']>[0],
): void {
  sink.emit(event);
}
