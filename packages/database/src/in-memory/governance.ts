import { WEBHOOK_DELIVERY_PAGE_LIMIT, WEBHOOK_DELIVERY_PAGE_MAX } from '../domains/governance';
import {
  isSafeWebhookEndpointUrl,
  canTransitionDataResidencyMigration,
  dataResidencyRouteKey,
  type WorkspaceDataResidencyState,
  validateGovernanceCapabilityProfileGrant,
  type ControlPlaneRole,
} from '@lodariq/schema';
import {
  assertDataResidencyEvidence,
  DATA_RESIDENCY_LEASE_MS,
  DATA_RESIDENCY_MAX_PHASE_ATTEMPTS,
  DATA_RESIDENCY_WORKER_ACTOR_ID,
  compareDataResidencyEvidence,
  dataResidencyEvidenceMatches,
  type ClaimDataResidencyMigrationsInput,
  type CompleteDataResidencyMigrationPhaseInput,
  type DataResidencyMigrationEvidenceRecord,
  type LeasedDataResidencyMigration,
  type RetryDataResidencyMigrationPhaseInput,
} from '../domains/data-residency';
import type {
  AssignGovernanceCapabilityProfileInput,
  AssignWorkspaceGovernanceCapabilityProfileInput,
  CompleteWebhookDeliveryInput,
  CreateGovernanceCapabilityProfileInput,
  CreateWebhookEndpointInput,
  DeleteGovernanceCapabilityProfileInput,
  DisableWebhookEndpointInput,
  EnqueueWebhookEventInput,
  FailWebhookDeliveryInput,
  GovernanceCapabilityProfileAssignmentRecord,
  GovernanceCapabilityProfileRecord,
  GovernanceMutationResult,
  LeasedWebhookDelivery,
  RemoveGovernanceCapabilityProfileAssignmentInput,
  RemoveWorkspaceGovernanceCapabilityProfileAssignmentInput,
  ReplayWebhookDeliveryInput,
  RequestDataResidencyMigrationInput,
  TransitionDataResidencyMigrationInput,
  ResolvedGovernanceCapabilityProfile,
  WorkspaceGovernanceCapabilityProfileAssignmentRecord,
  UpdateGovernanceCapabilityProfileInput,
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
  DataResidencyMigrationRecord,
} from '../domains/governance';
import type { TenantReadResult } from '../domains/tenant-administration';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryDeliveryOrchestration } from './delivery-orchestration';

export class InMemoryRepositoryGovernance extends InMemoryRepositoryDeliveryOrchestration {
  async listGovernanceCapabilityProfiles(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<GovernanceCapabilityProfileRecord[]>> {
    const actorRole = this.membershipRole(workspaceId, actorUserId);
    if (!canManageGovernance(actorRole)) return { status: 'forbidden' };
    return {
      status: 'ok',
      value: [...this.governanceCapabilityProfiles.values()]
        .filter((profile) => profile.workspaceId === workspaceId)
        .sort(
          (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        )
        .map(clone),
    };
  }

  async createGovernanceCapabilityProfile(
    input: CreateGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileRecord>> {
    if (!canManageGovernance(this.membershipRole(input.profile.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    if (
      !validateGovernanceCapabilityProfileGrant(input.profile.baseRole, input.profile.capabilities)
    ) {
      return { status: 'invalid_capabilities' };
    }
    const duplicate = [...this.governanceCapabilityProfiles.values()].some(
      (profile) =>
        profile.workspaceId === input.profile.workspaceId &&
        profile.name.toLocaleLowerCase() === input.profile.name.toLocaleLowerCase(),
    );
    if (
      duplicate ||
      this.governanceCapabilityProfiles.has(
        this.profileKey(input.profile.workspaceId, input.profile.id),
      ) ||
      this.tenantAuditEvents.has(input.auditEventId)
    ) {
      return { status: 'conflict' };
    }
    const profile = clone(input.profile);
    this.governanceCapabilityProfiles.set(
      this.profileKey(profile.workspaceId, profile.id),
      profile,
    );
    this.appendGovernanceAudit(input.auditEventId, {
      workspaceId: profile.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'capability_profile_created',
      resourceId: profile.id,
      occurredAt: profile.createdAt,
    });
    return { status: 'completed', value: clone(profile) };
  }

  async updateGovernanceCapabilityProfile(
    input: UpdateGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileRecord>> {
    if (!canManageGovernance(this.membershipRole(input.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const key = this.profileKey(input.workspaceId, input.profileId);
    const current = this.governanceCapabilityProfiles.get(key);
    if (!current) return { status: 'not_found' };
    if (
      current.revision !== input.expectedRevision ||
      this.tenantAuditEvents.has(input.auditEventId)
    ) {
      return { status: 'conflict' };
    }
    if (!validateGovernanceCapabilityProfileGrant(current.baseRole, input.capabilities)) {
      return { status: 'invalid_capabilities' };
    }
    const nameConflict = [...this.governanceCapabilityProfiles.values()].some(
      (profile) =>
        profile.workspaceId === input.workspaceId &&
        profile.id !== current.id &&
        profile.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
    );
    if (nameConflict) return { status: 'conflict' };
    const updated = {
      ...current,
      name: input.name,
      capabilities: [...input.capabilities],
      revision: current.revision + 1,
      updatedAt: input.updatedAt,
    };
    this.governanceCapabilityProfiles.set(key, updated);
    this.appendGovernanceAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'capability_profile_updated',
      resourceId: current.id,
      occurredAt: input.updatedAt,
    });
    return { status: 'completed', value: clone(updated) };
  }

  async deleteGovernanceCapabilityProfile(
    input: DeleteGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult> {
    if (!canManageGovernance(this.membershipRole(input.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const key = this.profileKey(input.workspaceId, input.profileId);
    if (!this.governanceCapabilityProfiles.has(key)) return { status: 'not_found' };
    const assigned = [...this.governanceCapabilityProfileAssignments.values()].some(
      (assignment) =>
        assignment.workspaceId === input.workspaceId && assignment.profileId === input.profileId,
    );
    const workspaceAssigned = [
      ...this.workspaceGovernanceCapabilityProfileAssignments.values(),
    ].some(
      (assignment) =>
        assignment.workspaceId === input.workspaceId && assignment.profileId === input.profileId,
    );
    if (assigned || workspaceAssigned || this.tenantAuditEvents.has(input.auditEventId)) {
      return { status: 'conflict' };
    }
    this.governanceCapabilityProfiles.delete(key);
    this.appendGovernanceAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'capability_profile_deleted',
      resourceId: input.profileId,
      occurredAt: input.occurredAt,
    });
    return { status: 'completed', value: undefined as never };
  }

  async assignGovernanceCapabilityProfile(
    input: AssignGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileAssignmentRecord>> {
    const assignment = input.assignment;
    if (!canManageGovernance(this.membershipRole(assignment.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const profile = this.governanceCapabilityProfiles.get(
      this.profileKey(assignment.workspaceId, assignment.profileId),
    );
    const targetRole = this.membershipRole(assignment.workspaceId, assignment.userId);
    const environment = this.environments.get(
      this.key(assignment.workspaceId, assignment.environmentId),
    );
    if (!profile || !targetRole || !environment) return { status: 'not_found' };
    if (profile.baseRole !== targetRole) return { status: 'base_role_mismatch' };
    const key = this.assignmentKey(
      assignment.workspaceId,
      assignment.environmentId,
      assignment.userId,
    );
    const current = this.governanceCapabilityProfileAssignments.get(key);
    if (current) {
      if (current.profileId === assignment.profileId) {
        return { status: 'completed', value: clone(current) };
      }
      return { status: 'conflict' };
    }
    if (this.tenantAuditEvents.has(input.auditEventId)) return { status: 'conflict' };
    this.governanceCapabilityProfileAssignments.set(key, clone(assignment));
    this.appendGovernanceAudit(input.auditEventId, {
      workspaceId: assignment.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'capability_profile_assigned',
      targetUserId: assignment.userId,
      environmentId: assignment.environmentId,
      resourceId: assignment.profileId,
      occurredAt: assignment.assignedAt,
    });
    return { status: 'completed', value: clone(assignment) };
  }

  async removeGovernanceCapabilityProfileAssignment(
    input: RemoveGovernanceCapabilityProfileAssignmentInput,
  ): Promise<GovernanceMutationResult> {
    if (!canManageGovernance(this.membershipRole(input.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const key = this.assignmentKey(input.workspaceId, input.environmentId, input.userId);
    const current = this.governanceCapabilityProfileAssignments.get(key);
    if (!current) return { status: 'not_found' };
    if (this.tenantAuditEvents.has(input.auditEventId)) return { status: 'conflict' };
    this.governanceCapabilityProfileAssignments.delete(key);
    this.appendGovernanceAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'capability_profile_unassigned',
      targetUserId: input.userId,
      environmentId: input.environmentId,
      resourceId: current.profileId,
      occurredAt: input.occurredAt,
    });
    return { status: 'completed', value: undefined as never };
  }

  async resolveGovernanceCapabilityProfile(
    workspaceId: string,
    environmentId: string,
    userId: string,
  ): Promise<ResolvedGovernanceCapabilityProfile | null> {
    const membershipRole = this.membershipRole(workspaceId, userId);
    if (!membershipRole) return null;
    const assignment = this.governanceCapabilityProfileAssignments.get(
      this.assignmentKey(workspaceId, environmentId, userId),
    );
    if (!assignment) return { membershipRole, profile: null };
    const profile = this.governanceCapabilityProfiles.get(
      this.profileKey(workspaceId, assignment.profileId),
    );
    return { membershipRole, profile: profile ? clone(profile) : null };
  }

  async assignWorkspaceGovernanceCapabilityProfile(
    input: AssignWorkspaceGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<WorkspaceGovernanceCapabilityProfileAssignmentRecord>> {
    const assignment = input.assignment;
    if (!canManageGovernance(this.membershipRole(assignment.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const profile = this.governanceCapabilityProfiles.get(
      this.profileKey(assignment.workspaceId, assignment.profileId),
    );
    const targetRole = this.membershipRole(assignment.workspaceId, assignment.userId);
    if (!profile || !targetRole) return { status: 'not_found' };
    if (profile.baseRole !== targetRole) return { status: 'base_role_mismatch' };
    const key = this.key(assignment.workspaceId, assignment.userId);
    const current = this.workspaceGovernanceCapabilityProfileAssignments.get(key);
    if (current) {
      if (current.profileId === assignment.profileId) {
        return { status: 'completed', value: clone(current) };
      }
      return { status: 'conflict' };
    }
    if (this.tenantAuditEvents.has(input.auditEventId)) return { status: 'conflict' };
    this.workspaceGovernanceCapabilityProfileAssignments.set(key, clone(assignment));
    this.appendGovernanceAudit(input.auditEventId, {
      workspaceId: assignment.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'capability_profile_assigned',
      targetUserId: assignment.userId,
      resourceId: assignment.profileId,
      occurredAt: assignment.assignedAt,
    });
    return { status: 'completed', value: clone(assignment) };
  }

  async removeWorkspaceGovernanceCapabilityProfileAssignment(
    input: RemoveWorkspaceGovernanceCapabilityProfileAssignmentInput,
  ): Promise<GovernanceMutationResult> {
    if (!canManageGovernance(this.membershipRole(input.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const key = this.key(input.workspaceId, input.userId);
    const current = this.workspaceGovernanceCapabilityProfileAssignments.get(key);
    if (!current) return { status: 'not_found' };
    if (this.tenantAuditEvents.has(input.auditEventId)) return { status: 'conflict' };
    this.workspaceGovernanceCapabilityProfileAssignments.delete(key);
    this.appendGovernanceAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'capability_profile_unassigned',
      targetUserId: input.userId,
      resourceId: current.profileId,
      occurredAt: input.occurredAt,
    });
    return { status: 'completed', value: undefined as never };
  }

  async resolveWorkspaceGovernanceCapabilityProfile(
    workspaceId: string,
    userId: string,
  ): Promise<ResolvedGovernanceCapabilityProfile | null> {
    const membershipRole = this.membershipRole(workspaceId, userId);
    if (!membershipRole) return null;
    const assignment = this.workspaceGovernanceCapabilityProfileAssignments.get(
      this.key(workspaceId, userId),
    );
    if (!assignment) return { membershipRole, profile: null };
    const profile = this.governanceCapabilityProfiles.get(
      this.profileKey(workspaceId, assignment.profileId),
    );
    return { membershipRole, profile: profile ? clone(profile) : null };
  }

  async listWebhookEndpoints(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WebhookEndpointRecord[]>> {
    if (!canManageGovernance(this.membershipRole(workspaceId, actorUserId))) {
      return { status: 'forbidden' };
    }
    return {
      status: 'ok',
      value: [...this.webhookEndpoints.values()]
        .filter((endpoint) => endpoint.workspaceId === workspaceId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((endpoint) => clone(endpoint)),
    };
  }

  async createWebhookEndpoint(
    input: CreateWebhookEndpointInput,
  ): Promise<GovernanceMutationResult<WebhookEndpointRecord>> {
    const endpoint = input.endpoint;
    if (!canManageGovernance(this.membershipRole(endpoint.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    if (!isSafeWebhookEndpointUrl(endpoint.url)) return { status: 'invalid_capabilities' };
    const key = this.key(endpoint.workspaceId, endpoint.id);
    if (this.webhookEndpoints.has(key) || this.tenantAuditEvents.has(input.auditEventId)) {
      return { status: 'conflict' };
    }
    this.webhookEndpoints.set(key, clone(endpoint));
    this.appendPlatformAudit(input.auditEventId, {
      workspaceId: endpoint.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'webhook_endpoint_created',
      resourceId: endpoint.id,
      occurredAt: endpoint.createdAt,
    });
    return { status: 'completed', value: clone(endpoint) };
  }

  async disableWebhookEndpoint(
    input: DisableWebhookEndpointInput,
  ): Promise<GovernanceMutationResult<WebhookEndpointRecord>> {
    if (!canManageGovernance(this.membershipRole(input.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const key = this.key(input.workspaceId, input.endpointId);
    const current = this.webhookEndpoints.get(key);
    if (!current) return { status: 'not_found' };
    if (this.tenantAuditEvents.has(input.auditEventId)) return { status: 'conflict' };
    const updated = { ...current, enabled: false, updatedAt: input.occurredAt };
    this.webhookEndpoints.set(key, updated);
    for (const [deliveryKey, delivery] of this.webhookDeliveries) {
      if (
        delivery.workspaceId === input.workspaceId &&
        delivery.endpointId === input.endpointId &&
        delivery.status === 'pending'
      ) {
        this.webhookDeliveries.set(deliveryKey, {
          ...delivery,
          status: 'dead',
          lastErrorCode: 'endpoint_disabled',
          updatedAt: input.occurredAt,
        });
      }
    }
    this.appendPlatformAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'webhook_endpoint_disabled',
      resourceId: input.endpointId,
      occurredAt: input.occurredAt,
    });
    return { status: 'completed', value: clone(updated) };
  }

  async pruneWebhookDeliveries(before: string, limit: number): Promise<number> {
    const bounded = Math.max(1, Math.min(limit, 5_000));
    const doomed = [...this.webhookDeliveries.values()]
      .filter(
        (delivery) =>
          (delivery.status === 'succeeded' || delivery.status === 'dead') &&
          delivery.updatedAt <= before,
      )
      .slice(0, bounded);
    for (const delivery of doomed) {
      this.webhookDeliveries.delete(this.key(delivery.workspaceId, delivery.id));
    }
    return doomed.length;
  }

  async enqueueWebhookEvent(input: EnqueueWebhookEventInput): Promise<WebhookDeliveryRecord[]> {
    const eventKey = this.key(input.event.workspaceId, input.event.id);
    if (this.webhookEvents.has(eventKey)) {
      return [...this.webhookDeliveries.values()]
        .filter(
          (delivery) =>
            delivery.workspaceId === input.event.workspaceId && delivery.eventId === input.event.id,
        )
        .map(publicDelivery);
    }
    this.webhookEvents.set(eventKey, clone(input.event));
    const deliveries: WebhookDeliveryRecord[] = [];
    for (const endpoint of this.webhookEndpoints.values()) {
      if (
        endpoint.workspaceId !== input.event.workspaceId ||
        !endpoint.enabled ||
        !endpoint.eventTypes.includes(input.event.type)
      ) {
        continue;
      }
      const now = input.event.occurredAt;
      const delivery: WebhookDeliveryRecord & {
        leaseOwner: string | null;
        leasedUntil: string | null;
      } = {
        id: input.deliveryIdForEndpoint(endpoint.id),
        workspaceId: input.event.workspaceId,
        endpointId: endpoint.id,
        eventId: input.event.id,
        status: 'pending',
        attempts: 0,
        availableAt: now,
        lastResponseStatus: null,
        lastErrorCode: null,
        deliveredAt: null,
        createdAt: now,
        updatedAt: now,
        leaseOwner: null,
        leasedUntil: null,
      };
      this.webhookDeliveries.set(this.key(delivery.workspaceId, delivery.id), delivery);
      deliveries.push(publicDelivery(delivery));
    }
    return deliveries;
  }

  async leaseWebhookDeliveries(
    workerId: string,
    now: string,
    leaseExpiresAt: string,
    limit: number,
  ): Promise<LeasedWebhookDelivery[]> {
    const candidates = [...this.webhookDeliveries.values()]
      .filter((delivery) => {
        const expiredLease =
          delivery.status === 'delivering' &&
          delivery.leasedUntil !== null &&
          delivery.leasedUntil <= now;
        /*
         * Deliberately not filtered on the endpoint being enabled, which is
         * what drizzle does too: a row whose endpoint has gone away has to be
         * *selected* before it can be finished. Filtering it out here left it
         * pending at the head of the queue for good.
         */
        return (delivery.status === 'pending' || expiredLease) && delivery.availableAt <= now;
      })
      .sort(
        (left, right) =>
          left.availableAt.localeCompare(right.availableAt) || left.id.localeCompare(right.id),
      )
      .slice(0, Math.max(0, Math.min(limit, 100)));
    return candidates.flatMap((delivery) => {
      const endpoint = this.webhookEndpoints.get(
        this.key(delivery.workspaceId, delivery.endpointId),
      );
      const event = this.webhookEvents.get(this.key(delivery.workspaceId, delivery.eventId));
      // Mirrors drizzle: an endpoint that is gone or switched off has no
      // delivery left in it, so the row is finished rather than passed over on
      // every lease while still sorting to the head of the queue.
      if (!endpoint?.enabled || !event) {
        this.webhookDeliveries.set(this.key(delivery.workspaceId, delivery.id), {
          ...delivery,
          status: 'dead' as const,
          leaseOwner: null,
          leasedUntil: null,
          lastErrorCode: endpoint?.enabled ? 'event_unavailable' : 'endpoint_unavailable',
          updatedAt: now,
        });
        return [];
      }
      const leased = {
        ...delivery,
        status: 'delivering' as const,
        attempts: Math.min(8, delivery.attempts + 1),
        leaseOwner: workerId,
        leasedUntil: leaseExpiresAt,
        updatedAt: now,
      };
      this.webhookDeliveries.set(this.key(leased.workspaceId, leased.id), leased);
      return [
        {
          delivery: publicDelivery(leased),
          endpoint: clone(endpoint),
          event: clone(event),
          leaseOwner: workerId,
        },
      ];
    });
  }

  async completeWebhookDelivery(input: CompleteWebhookDeliveryInput): Promise<boolean> {
    const key = this.key(input.workspaceId, input.deliveryId);
    const current = this.webhookDeliveries.get(key);
    if (!current || current.status !== 'delivering' || current.leaseOwner !== input.leaseOwner) {
      return false;
    }
    this.webhookDeliveries.set(key, {
      ...current,
      status: 'succeeded',
      lastResponseStatus: input.responseStatus,
      lastErrorCode: null,
      deliveredAt: input.completedAt,
      leaseOwner: null,
      leasedUntil: null,
      updatedAt: input.completedAt,
    });
    return true;
  }

  async failWebhookDelivery(
    input: FailWebhookDeliveryInput,
  ): Promise<WebhookDeliveryRecord | null> {
    const key = this.key(input.workspaceId, input.deliveryId);
    const current = this.webhookDeliveries.get(key);
    if (!current || current.status !== 'delivering' || current.leaseOwner !== input.leaseOwner) {
      return null;
    }
    const dead = current.attempts >= 8;
    const updated = {
      ...current,
      status: dead ? ('dead' as const) : ('pending' as const),
      availableAt: dead ? current.availableAt : input.nextAvailableAt,
      lastResponseStatus: input.responseStatus,
      lastErrorCode: input.errorCode,
      leaseOwner: null,
      leasedUntil: null,
      updatedAt: input.failedAt,
    };
    this.webhookDeliveries.set(key, updated);
    return publicDelivery(updated);
  }

  async listWebhookDeliveries(
    workspaceId: string,
    actorUserId: string,
    page?: { limit?: number; before?: string },
  ): Promise<TenantReadResult<WebhookDeliveryRecord[]>> {
    if (!canManageGovernance(this.membershipRole(workspaceId, actorUserId))) {
      return { status: 'forbidden' };
    }
    const limit = Math.max(
      1,
      Math.min(page?.limit ?? WEBHOOK_DELIVERY_PAGE_LIMIT, WEBHOOK_DELIVERY_PAGE_MAX),
    );
    const before = page?.before?.trim();
    return {
      status: 'ok',
      value: [...this.webhookDeliveries.values()]
        .filter((delivery) => delivery.workspaceId === workspaceId)
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        )
        .filter((delivery) => !before || delivery.id < before)
        .slice(0, limit)
        .map(publicDelivery),
    };
  }

  async replayWebhookDelivery(
    input: ReplayWebhookDeliveryInput,
  ): Promise<GovernanceMutationResult> {
    if (!canManageGovernance(this.membershipRole(input.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const key = this.key(input.workspaceId, input.deliveryId);
    const current = this.webhookDeliveries.get(key);
    if (!current) return { status: 'not_found' };
    if (current.status !== 'dead' || this.tenantAuditEvents.has(input.auditEventId)) {
      return { status: 'conflict' };
    }
    this.webhookDeliveries.set(key, {
      ...current,
      status: 'pending',
      attempts: 0,
      availableAt: input.replayedAt,
      lastResponseStatus: null,
      lastErrorCode: null,
      deliveredAt: null,
      leaseOwner: null,
      leasedUntil: null,
      updatedAt: input.replayedAt,
    });
    this.appendPlatformAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'webhook_delivery_replayed',
      resourceId: input.deliveryId,
      occurredAt: input.replayedAt,
    });
    return { status: 'completed', value: undefined as never };
  }

  async getWorkspaceDataResidencyState(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WorkspaceDataResidencyState>> {
    if (!canManageGovernance(this.membershipRole(workspaceId, actorUserId))) {
      return { status: 'forbidden' };
    }
    const placement = this.workspaceDataPlacements.get(workspaceId) ?? {
      workspaceId,
      region: 'us' as const,
      generation: 0,
      activeMigrationId: null,
      updatedAt: new Date(0).toISOString(),
    };
    const migration = placement.activeMigrationId
      ? (this.dataResidencyMigrations.get(this.key(workspaceId, placement.activeMigrationId)) ??
        null)
      : null;
    return { status: 'ok', value: { placement: clone(placement), migration: clone(migration) } };
  }

  async requestDataResidencyMigration(
    input: RequestDataResidencyMigrationInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    if (!canManageGovernance(this.membershipRole(input.workspaceId, input.actorUserId))) {
      return { status: 'forbidden' };
    }
    const replay = [...this.dataResidencyMigrations.values()].find(
      (migration) =>
        migration.workspaceId === input.workspaceId &&
        migration.idempotencyKey === input.idempotencyKey,
    );
    if (replay) {
      return replay.targetRegion === input.targetRegion &&
        replay.expectedPlacementGeneration === input.expectedPlacementGeneration
        ? { status: 'completed', value: clone(replay) }
        : { status: 'conflict' };
    }
    const nowPlacement = this.workspaceDataPlacements.get(input.workspaceId) ?? {
      workspaceId: input.workspaceId,
      region: 'us' as const,
      generation: 0,
      activeMigrationId: null,
      updatedAt: input.requestedAt,
    };
    if (
      nowPlacement.generation !== input.expectedPlacementGeneration ||
      nowPlacement.activeMigrationId ||
      nowPlacement.region === input.targetRegion ||
      this.tenantAuditEvents.has(input.auditEventId)
    ) {
      return { status: 'conflict' };
    }
    const migration: DataResidencyMigrationRecord = {
      id: input.migrationId,
      workspaceId: input.workspaceId,
      sourceRegion: nowPlacement.region,
      targetRegion: input.targetRegion,
      status: 'requested',
      expectedPlacementGeneration: input.expectedPlacementGeneration,
      idempotencyKey: input.idempotencyKey,
      requestedByUserId: input.actorUserId,
      failureCode: null,
      createdAt: input.requestedAt,
      updatedAt: input.requestedAt,
    };
    this.dataResidencyMigrations.set(this.key(input.workspaceId, input.migrationId), migration);
    this.dataResidencyMigrationExecutions.set(
      this.key(input.workspaceId, input.migrationId),
      {
        workspaceId: input.workspaceId,
        migrationId: input.migrationId,
        attemptCount: 0,
        availableAt: input.requestedAt,
      },
    );
    this.workspaceDataPlacements.set(input.workspaceId, {
      ...nowPlacement,
      activeMigrationId: input.migrationId,
      updatedAt: input.requestedAt,
    });
    this.dataResidencyMigrationHistory.set(input.historyId, {
      id: input.historyId,
      workspaceId: input.workspaceId,
      migrationId: input.migrationId,
      previousStatus: null,
      nextStatus: 'requested',
      actorId: input.actorUserId,
      failureCode: null,
      occurredAt: input.requestedAt,
    });
    this.appendResidencyAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'residency_migration_requested',
      resourceId: input.migrationId,
      occurredAt: input.requestedAt,
    });
    return { status: 'completed', value: clone(migration) };
  }

  async transitionDataResidencyMigration(
    input: TransitionDataResidencyMigrationInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    const key = this.key(input.workspaceId, input.migrationId);
    const current = this.dataResidencyMigrations.get(key);
    if (!current) return { status: 'not_found' };
    if (
      input.actorId !== 'system:residency-worker' &&
      !canManageGovernance(this.membershipRole(input.workspaceId, input.actorId))
    ) {
      return { status: 'forbidden' };
    }
    if (current.status === input.nextStatus) {
      return { status: 'completed', value: clone(current) };
    }
    if (
      current.status !== input.expectedStatus ||
      !canTransitionDataResidencyMigration(current.status, input.nextStatus) ||
      this.dataResidencyMigrationHistory.has(input.historyId) ||
      this.tenantAuditEvents.has(input.auditEventId)
    ) {
      return { status: 'conflict' };
    }
    const failureCode =
      input.nextStatus === 'failed' ? (input.failureCode ?? 'migration_failed') : null;
    const updated = {
      ...current,
      status: input.nextStatus,
      failureCode,
      updatedAt: input.transitionedAt,
    };
    const placement = this.workspaceDataPlacements.get(input.workspaceId);
    if (!placement || placement.activeMigrationId !== current.id) return { status: 'conflict' };
    if (input.nextStatus === 'completed') {
      this.workspaceDataPlacements.set(input.workspaceId, {
        ...placement,
        region: current.targetRegion,
        generation: placement.generation + 1,
        activeMigrationId: null,
        updatedAt: input.transitionedAt,
      });
    } else if (input.nextStatus === 'failed' || input.nextStatus === 'cancelled') {
      this.workspaceDataPlacements.set(input.workspaceId, {
        ...placement,
        activeMigrationId: null,
        updatedAt: input.transitionedAt,
      });
    }
    this.dataResidencyMigrations.set(key, updated);
    this.dataResidencyMigrationExecutions.set(key, {
      workspaceId: input.workspaceId,
      migrationId: input.migrationId,
      attemptCount: 0,
      availableAt: input.transitionedAt,
    });
    this.dataResidencyMigrationHistory.set(input.historyId, {
      id: input.historyId,
      workspaceId: input.workspaceId,
      migrationId: input.migrationId,
      previousStatus: current.status,
      nextStatus: input.nextStatus,
      actorId: input.actorId,
      failureCode,
      occurredAt: input.transitionedAt,
    });
    this.appendResidencyAudit(input.auditEventId, {
      workspaceId: input.workspaceId,
      actorUserId:
        input.actorId === 'system:residency-worker' ? current.requestedByUserId : input.actorId,
      eventType: 'residency_migration_transitioned',
      resourceId: input.migrationId,
      occurredAt: input.transitionedAt,
    });
    return { status: 'completed', value: clone(updated) };
  }

  async claimDataResidencyMigrations(
    input: ClaimDataResidencyMigrationsInput,
  ): Promise<LeasedDataResidencyMigration[]> {
    const now = Date.parse(input.now);
    const activeStatuses = new Set(['requested', 'copying', 'verifying', 'cutover-ready']);
    const candidates = [...this.dataResidencyMigrations.values()]
      .map((migration) => {
        const key = this.key(migration.workspaceId, migration.id);
        const execution = this.dataResidencyMigrationExecutions.get(key) ?? {
          workspaceId: migration.workspaceId,
          migrationId: migration.id,
          attemptCount: 0,
          availableAt: migration.updatedAt,
        };
        return { migration, execution };
      })
      .filter(
        ({ migration, execution }) =>
          activeStatuses.has(migration.status) &&
          execution.attemptCount < DATA_RESIDENCY_MAX_PHASE_ATTEMPTS &&
          Date.parse(execution.availableAt) <= now &&
          (!execution.leaseExpiresAt || Date.parse(execution.leaseExpiresAt) <= now),
      )
      .sort(
        (left, right) =>
          left.execution.availableAt.localeCompare(right.execution.availableAt) ||
          left.migration.id.localeCompare(right.migration.id),
      )
      .slice(0, Math.max(1, Math.min(input.limit, 25)));
    const leaseExpiresAt = new Date(now + DATA_RESIDENCY_LEASE_MS).toISOString();
    for (const candidate of candidates) {
      const key = this.key(candidate.migration.workspaceId, candidate.migration.id);
      const execution = {
        ...candidate.execution,
        attemptCount: candidate.execution.attemptCount + 1,
        leaseOwner: input.workerId,
        leaseExpiresAt,
        lastErrorCode: undefined,
      };
      this.dataResidencyMigrationExecutions.set(key, execution);
      candidate.execution = execution;
    }
    return clone(candidates);
  }

  async completeDataResidencyMigrationPhase(
    input: CompleteDataResidencyMigrationPhaseInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    const key = this.key(input.workspaceId, input.migrationId);
    const current = this.dataResidencyMigrations.get(key);
    const execution = this.dataResidencyMigrationExecutions.get(key);
    if (!current) return { status: 'not_found' };
    if (
      current.status !== input.expectedStatus ||
      execution?.leaseOwner !== input.workerId ||
      !canTransitionDataResidencyMigration(current.status, input.nextStatus)
    ) {
      return { status: 'conflict' };
    }
    if (input.evidence) {
      assertDataResidencyEvidence(input.evidence);
      if (
        input.evidence.workspaceId !== input.workspaceId ||
        input.evidence.migrationId !== input.migrationId
      ) {
        return { status: 'conflict' };
      }
      const evidenceKey = this.key(input.workspaceId, input.migrationId, input.evidence.phase);
      const existing = this.dataResidencyMigrationEvidence.get(evidenceKey);
      if (existing && !dataResidencyEvidenceMatches(existing, input.evidence)) {
        return { status: 'conflict' };
      }
    }
    const result = await this.transitionDataResidencyMigration({
      workspaceId: input.workspaceId,
      migrationId: input.migrationId,
      historyId: input.historyId,
      expectedStatus: input.expectedStatus,
      nextStatus: input.nextStatus,
      transitionedAt: input.completedAt,
      actorId: DATA_RESIDENCY_WORKER_ACTOR_ID,
      ...(input.failureCode ? { failureCode: input.failureCode } : {}),
      auditEventId: input.auditEventId,
    });
    if (result.status === 'completed' && input.evidence) {
      this.dataResidencyMigrationEvidence.set(
        this.key(input.workspaceId, input.migrationId, input.evidence.phase),
        clone(input.evidence),
      );
    }
    return result;
  }

  async retryDataResidencyMigrationPhase(
    input: RetryDataResidencyMigrationPhaseInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    const key = this.key(input.workspaceId, input.migrationId);
    const migration = this.dataResidencyMigrations.get(key);
    const execution = this.dataResidencyMigrationExecutions.get(key);
    if (!migration) return { status: 'not_found' };
    if (migration.status !== input.expectedStatus || execution?.leaseOwner !== input.workerId) {
      return { status: 'conflict' };
    }
    if (execution.attemptCount >= DATA_RESIDENCY_MAX_PHASE_ATTEMPTS) {
      return this.transitionDataResidencyMigration({
        workspaceId: input.workspaceId,
        migrationId: input.migrationId,
        historyId: input.historyId,
        expectedStatus: input.expectedStatus,
        nextStatus: 'failed',
        transitionedAt: input.failedAt,
        actorId: DATA_RESIDENCY_WORKER_ACTOR_ID,
        failureCode: input.errorCode,
        auditEventId: input.auditEventId,
      });
    }
    this.dataResidencyMigrationExecutions.set(key, {
      ...execution,
      availableAt: input.nextAvailableAt,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: input.errorCode,
    });
    return { status: 'completed', value: clone(migration) };
  }

  async listDataResidencyMigrationEvidence(
    workspaceId: string,
    migrationId: string,
  ): Promise<DataResidencyMigrationEvidenceRecord[]> {
    return [...this.dataResidencyMigrationEvidence.values()]
      .filter(
        (evidence) =>
          evidence.workspaceId === workspaceId && evidence.migrationId === migrationId,
      )
      .sort(compareDataResidencyEvidence)
      .map(clone);
  }

  async resolveWorkspaceDataRoute(workspaceId: string) {
    const placement = this.workspaceDataPlacements.get(workspaceId) ?? {
      workspaceId,
      region: 'us' as const,
      generation: 0,
      activeMigrationId: null,
      updatedAt: new Date(0).toISOString(),
    };
    return {
      workspaceId,
      region: placement.region,
      routeKey: dataResidencyRouteKey(placement.region),
      generation: placement.generation,
    };
  }

  private membershipRole(workspaceId: string, userId: string): ControlPlaneRole | null {
    const role = this.workspaceMemberships.get(this.key(workspaceId, userId))?.role;
    return role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer'
      ? role
      : null;
  }

  private profileKey(workspaceId: string, profileId: string): string {
    return this.key(workspaceId, profileId);
  }

  private assignmentKey(workspaceId: string, environmentId: string, userId: string): string {
    return this.key(workspaceId, environmentId, userId);
  }

  private appendGovernanceAudit(
    id: string,
    input: {
      workspaceId: string;
      actorUserId: string;
      eventType:
        | 'capability_profile_created'
        | 'capability_profile_updated'
        | 'capability_profile_deleted'
        | 'capability_profile_assigned'
        | 'capability_profile_unassigned';
      targetUserId?: string;
      environmentId?: string;
      resourceId?: string;
      occurredAt: string;
    },
  ): void {
    this.platformGovernanceAuditEventIds.add(id);
    this.tenantAuditEvents.set(id, {
      id,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      targetUserId: input.targetUserId ?? null,
      invitationId: null,
      previousRole: null,
      nextRole: null,
      environmentId: input.environmentId ?? null,
      resourceId: input.resourceId ?? null,
      occurredAt: input.occurredAt,
    });
  }

  private appendPlatformAudit(
    id: string,
    input: {
      workspaceId: string;
      actorUserId: string;
      eventType:
        'webhook_endpoint_created' | 'webhook_endpoint_disabled' | 'webhook_delivery_replayed';
      resourceId: string;
      occurredAt: string;
    },
  ): void {
    this.platformGovernanceAuditEventIds.add(id);
    this.tenantAuditEvents.set(id, {
      id,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      targetUserId: null,
      invitationId: null,
      previousRole: null,
      nextRole: null,
      environmentId: null,
      resourceId: input.resourceId,
      occurredAt: input.occurredAt,
    });
  }

  private appendResidencyAudit(
    id: string,
    input: {
      workspaceId: string;
      actorUserId: string;
      eventType: 'residency_migration_requested' | 'residency_migration_transitioned';
      resourceId: string;
      occurredAt: string;
    },
  ): void {
    this.platformGovernanceAuditEventIds.add(id);
    this.tenantAuditEvents.set(id, {
      id,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      targetUserId: null,
      invitationId: null,
      previousRole: null,
      nextRole: null,
      environmentId: null,
      resourceId: input.resourceId,
      occurredAt: input.occurredAt,
    });
  }
}

function publicDelivery(
  delivery: WebhookDeliveryRecord & { leaseOwner?: string | null; leasedUntil?: string | null },
): WebhookDeliveryRecord {
  const { leaseOwner: _leaseOwner, leasedUntil: _leasedUntil, ...result } = delivery;
  return clone(result);
}

function canManageGovernance(role: ControlPlaneRole | null): boolean {
  return role === 'owner' || role === 'admin';
}
