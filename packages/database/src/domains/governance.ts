import type {
  ControlPlaneRole,
  GovernanceCapability,
  GovernanceCapabilityProfile,
  GovernanceCapabilityProfileAssignment,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEventEnvelope,
  DataResidencyMigration,
  DataResidencyMigrationStatus,
  DataResidencyRegion,
  WorkspaceDataPlacement,
  WorkspaceDataResidencyState,
  WorkspaceGovernanceCapabilityProfileAssignment,
} from '@lodariq/schema';
import type { TenantReadResult } from './tenant-administration';
import type { DataResidencyExecutionRepository } from './data-residency';
import type { RepositoryMutationResult } from './mutation-result';

export type GovernanceCapabilityProfileRecord = GovernanceCapabilityProfile;
export type GovernanceCapabilityProfileAssignmentRecord = GovernanceCapabilityProfileAssignment;
export type WorkspaceGovernanceCapabilityProfileAssignmentRecord =
  WorkspaceGovernanceCapabilityProfileAssignment;
export type WebhookEndpointRecord = WebhookEndpoint;
export type WebhookEventRecord = WebhookEventEnvelope;
export type WebhookDeliveryRecord = WebhookDelivery;

/**
 * A page, not the table. This returned up to 10,000 full rows, every one of
 * them carrying a response body and error text, on a route an operator opens
 * to glance at recent deliveries.
 */
/**
 * How long a finished delivery is kept.
 *
 * `entitlements.analyticsRetentionDays` was only ever a read filter, and none
 * of the high-volume tables had a delete at all — a workspace on 30-day
 * retention still stored every row forever and paid for the index bloat. This
 * is the first of those to be swept, because a succeeded or dead delivery has
 * no reader after the operator has looked at it.
 */
export const WEBHOOK_DELIVERY_RETENTION_DAYS = 30;

export const WEBHOOK_DELIVERY_PAGE_LIMIT = 100;
export const WEBHOOK_DELIVERY_PAGE_MAX = 500;
export type WorkspaceDataPlacementRecord = WorkspaceDataPlacement;
export type DataResidencyMigrationRecord = DataResidencyMigration;

export interface CreateGovernanceCapabilityProfileInput {
  profile: GovernanceCapabilityProfileRecord;
  actorUserId: string;
  auditEventId: string;
}

export interface UpdateGovernanceCapabilityProfileInput {
  workspaceId: string;
  profileId: string;
  name: string;
  capabilities: GovernanceCapability[];
  expectedRevision: number;
  actorUserId: string;
  updatedAt: string;
  auditEventId: string;
}

export interface DeleteGovernanceCapabilityProfileInput {
  workspaceId: string;
  profileId: string;
  actorUserId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface AssignGovernanceCapabilityProfileInput {
  assignment: GovernanceCapabilityProfileAssignmentRecord;
  actorUserId: string;
  auditEventId: string;
}

export interface RemoveGovernanceCapabilityProfileAssignmentInput {
  workspaceId: string;
  environmentId: string;
  userId: string;
  actorUserId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface AssignWorkspaceGovernanceCapabilityProfileInput {
  assignment: WorkspaceGovernanceCapabilityProfileAssignmentRecord;
  actorUserId: string;
  auditEventId: string;
}

export interface RemoveWorkspaceGovernanceCapabilityProfileAssignmentInput {
  workspaceId: string;
  userId: string;
  actorUserId: string;
  occurredAt: string;
  auditEventId: string;
}

export type GovernanceMutationResult<T = never> = RepositoryMutationResult<T>;

export interface ResolvedGovernanceCapabilityProfile {
  membershipRole: ControlPlaneRole;
  profile: GovernanceCapabilityProfileRecord | null;
}

export interface CreateWebhookEndpointInput {
  endpoint: WebhookEndpointRecord;
  actorUserId: string;
  auditEventId: string;
}

export interface DisableWebhookEndpointInput {
  workspaceId: string;
  endpointId: string;
  actorUserId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface EnqueueWebhookEventInput {
  event: WebhookEventRecord;
  deliveryIdForEndpoint(endpointId: string): string;
}

export interface LeasedWebhookDelivery {
  delivery: WebhookDeliveryRecord;
  endpoint: WebhookEndpointRecord;
  event: WebhookEventRecord;
  leaseOwner: string;
}

export interface CompleteWebhookDeliveryInput {
  workspaceId: string;
  deliveryId: string;
  leaseOwner: string;
  completedAt: string;
  responseStatus: number;
}

export interface FailWebhookDeliveryInput {
  workspaceId: string;
  deliveryId: string;
  leaseOwner: string;
  failedAt: string;
  responseStatus: number | null;
  errorCode: string;
  nextAvailableAt: string;
}

export interface ReplayWebhookDeliveryInput {
  workspaceId: string;
  deliveryId: string;
  actorUserId: string;
  replayedAt: string;
  auditEventId: string;
}

export interface RequestDataResidencyMigrationInput {
  migrationId: string;
  historyId: string;
  workspaceId: string;
  targetRegion: DataResidencyRegion;
  expectedPlacementGeneration: number;
  idempotencyKey: string;
  actorUserId: string;
  requestedAt: string;
  auditEventId: string;
}

export interface TransitionDataResidencyMigrationInput {
  workspaceId: string;
  migrationId: string;
  historyId: string;
  expectedStatus: DataResidencyMigrationStatus;
  nextStatus: DataResidencyMigrationStatus;
  transitionedAt: string;
  actorId: string;
  failureCode?: string;
  auditEventId: string;
}

export interface GovernanceRepository extends DataResidencyExecutionRepository {
  listGovernanceCapabilityProfiles(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<GovernanceCapabilityProfileRecord[]>>;
  createGovernanceCapabilityProfile(
    input: CreateGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileRecord>>;
  updateGovernanceCapabilityProfile(
    input: UpdateGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileRecord>>;
  deleteGovernanceCapabilityProfile(
    input: DeleteGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult>;
  assignGovernanceCapabilityProfile(
    input: AssignGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileAssignmentRecord>>;
  removeGovernanceCapabilityProfileAssignment(
    input: RemoveGovernanceCapabilityProfileAssignmentInput,
  ): Promise<GovernanceMutationResult>;
  assignWorkspaceGovernanceCapabilityProfile(
    input: AssignWorkspaceGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<WorkspaceGovernanceCapabilityProfileAssignmentRecord>>;
  removeWorkspaceGovernanceCapabilityProfileAssignment(
    input: RemoveWorkspaceGovernanceCapabilityProfileAssignmentInput,
  ): Promise<GovernanceMutationResult>;
  resolveGovernanceCapabilityProfile(
    workspaceId: string,
    environmentId: string,
    userId: string,
  ): Promise<ResolvedGovernanceCapabilityProfile | null>;
  resolveWorkspaceGovernanceCapabilityProfile(
    workspaceId: string,
    userId: string,
  ): Promise<ResolvedGovernanceCapabilityProfile | null>;
  listWebhookEndpoints(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WebhookEndpointRecord[]>>;
  createWebhookEndpoint(
    input: CreateWebhookEndpointInput,
  ): Promise<GovernanceMutationResult<WebhookEndpointRecord>>;
  disableWebhookEndpoint(
    input: DisableWebhookEndpointInput,
  ): Promise<GovernanceMutationResult<WebhookEndpointRecord>>;

  enqueueWebhookEvent(input: EnqueueWebhookEventInput): Promise<WebhookDeliveryRecord[]>;
  /** Deletes finished deliveries past retention, bounded per call. Returns the count. */
  pruneWebhookDeliveries(before: string, limit: number): Promise<number>;
  leaseWebhookDeliveries(
    workerId: string,
    now: string,
    leaseExpiresAt: string,
    limit: number,
  ): Promise<LeasedWebhookDelivery[]>;
  completeWebhookDelivery(input: CompleteWebhookDeliveryInput): Promise<boolean>;
  failWebhookDelivery(input: FailWebhookDeliveryInput): Promise<WebhookDeliveryRecord | null>;
  listWebhookDeliveries(
    workspaceId: string,
    actorUserId: string,
    /** Bounded page. Absent means the default, never "everything". */
    page?: { limit?: number; before?: string },
  ): Promise<TenantReadResult<WebhookDeliveryRecord[]>>;
  replayWebhookDelivery(input: ReplayWebhookDeliveryInput): Promise<GovernanceMutationResult>;
  getWorkspaceDataResidencyState(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WorkspaceDataResidencyState>>;
  requestDataResidencyMigration(
    input: RequestDataResidencyMigrationInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>>;
  transitionDataResidencyMigration(
    input: TransitionDataResidencyMigrationInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>>;
}
