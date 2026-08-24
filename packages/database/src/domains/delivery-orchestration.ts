import type {
  DataCatalogObservation,
  DeliveryTransitionHistoryEntry,
  DeploymentSchedule,
  WorkspaceDataCatalog,
} from '@lodariq/schema';

export interface PersistedDeploymentSchedule extends DeploymentSchedule {
  idempotencyKey: string;
  requestHash: string;
}

export interface PersistedDeliveryScheduleJob {
  id: string;
  workspaceId: string;
  scheduleId: string;
  environmentId: string;
  documentId: string;
  publicationId: string;
  transition: 'start' | 'end';
  status: 'pending' | 'leased' | 'completed' | 'failed' | 'cancelled';
  expectedGeneration: number | null;
  availableAt: string;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseVersion: number;
  leasedUntil: string | null;
  resultGeneration: number | null;
  errorCode: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface CreateDeploymentScheduleInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  publicationId: string;
  startAt: string;
  endAt?: string;
  expectedGeneration: number;
  idempotencyKey: string;
  requestHash: string;
  actorUserId: string;
}

export interface CancelDeploymentScheduleInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  scheduleId: string;
  expectedRevision: number;
  actorUserId: string;
}

export interface ObserveWorkspaceDataCatalogInput {
  workspaceId: string;
  environmentId: string;
  observations: readonly DataCatalogObservation[];
}

export interface RunDueDeliveryScheduleJobsInput {
  workerId: string;
  now: string;
  limit?: number;
  leaseMs?: number;
}

export interface DeliveryScheduleJobResult {
  jobId: string;
  scheduleId: string;
  transition: PersistedDeliveryScheduleJob['transition'];
  outcome: 'applied' | 'conflict' | 'retrying' | 'failed';
  generation: number | null;
  reasonCode?: string;
}

export interface DeliveryOrchestrationRepository {
  createDeploymentSchedule(
    input: CreateDeploymentScheduleInput,
  ): Promise<PersistedDeploymentSchedule>;
  cancelDeploymentSchedule(
    input: CancelDeploymentScheduleInput,
  ): Promise<PersistedDeploymentSchedule | null>;
  listDeploymentSchedules(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDeploymentSchedule[]>;
  listDeliveryTransitionHistory(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<DeliveryTransitionHistoryEntry[]>;
  runDueDeliveryScheduleJobs(
    input: RunDueDeliveryScheduleJobsInput,
  ): Promise<DeliveryScheduleJobResult[]>;
  observeWorkspaceDataCatalog(
    input: ObserveWorkspaceDataCatalogInput,
  ): Promise<WorkspaceDataCatalog>;
  readWorkspaceDataCatalog(workspaceId: string): Promise<WorkspaceDataCatalog>;
}

export class DeploymentScheduleConflictError extends Error {
  readonly code = 'deployment_schedule_conflict' as const;

  constructor(message: string) {
    super(message);
    this.name = 'DeploymentScheduleConflictError';
  }
}

export function normalizeDeploymentScheduleTimes(
  startAt: string,
  endAt?: string,
): { startAt: string; endAt?: string } {
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) throw new Error('schedule startAt is invalid');
  const normalizedStart = start.toISOString();
  if (!endAt) return { startAt: normalizedStart };
  const end = new Date(endAt);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
    throw new Error('schedule endAt must be after startAt');
  }
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1_000) {
    throw new Error('schedule window cannot exceed 366 days');
  }
  return { startAt: normalizedStart, endAt: end.toISOString() };
}

export function toDeploymentSchedule(record: PersistedDeploymentSchedule): DeploymentSchedule {
  const { idempotencyKey: _idempotencyKey, requestHash: _requestHash, ...schedule } = record;
  return schedule;
}
