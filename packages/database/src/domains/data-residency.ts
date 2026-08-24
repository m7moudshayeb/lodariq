import type {
  DataResidencyMigration,
  DataResidencyMigrationStatus,
  DataResidencyRegion,
} from '@lodariq/schema';
import type { RepositoryMutationResult } from './mutation-result';

export const DATA_RESIDENCY_WORKER_ACTOR_ID = 'system:residency-worker';
export const DATA_RESIDENCY_MAX_PHASE_ATTEMPTS = 5;
export const DATA_RESIDENCY_LEASE_MS = 2 * 60 * 1_000;

export const DATA_RESIDENCY_EVIDENCE_PHASES = ['copy', 'verify', 'cutover'] as const;
export type DataResidencyEvidencePhase = (typeof DATA_RESIDENCY_EVIDENCE_PHASES)[number];

export interface DataResidencyMigrationExecutionRecord {
  workspaceId: string;
  migrationId: string;
  attemptCount: number;
  availableAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastErrorCode?: string;
}

export interface DataResidencyMigrationEvidenceRecord {
  id: string;
  workspaceId: string;
  migrationId: string;
  phase: DataResidencyEvidencePhase;
  providerOperationId: string;
  sourceDigest: string;
  targetDigest: string;
  recordCount: number;
  occurredAt: string;
}

export interface LeasedDataResidencyMigration {
  migration: DataResidencyMigration;
  execution: DataResidencyMigrationExecutionRecord;
}

export interface ClaimDataResidencyMigrationsInput {
  workerId: string;
  now: string;
  limit: number;
}

export interface CompleteDataResidencyMigrationPhaseInput {
  workspaceId: string;
  migrationId: string;
  workerId: string;
  expectedStatus: DataResidencyMigrationStatus;
  nextStatus: DataResidencyMigrationStatus;
  completedAt: string;
  historyId: string;
  auditEventId: string;
  failureCode?: string;
  evidence?: DataResidencyMigrationEvidenceRecord;
}

export interface RetryDataResidencyMigrationPhaseInput {
  workspaceId: string;
  migrationId: string;
  workerId: string;
  expectedStatus: DataResidencyMigrationStatus;
  failedAt: string;
  nextAvailableAt: string;
  errorCode: string;
  historyId: string;
  auditEventId: string;
}

export interface DataResidencyExecutionRepository {
  claimDataResidencyMigrations(
    input: ClaimDataResidencyMigrationsInput,
  ): Promise<LeasedDataResidencyMigration[]>;
  completeDataResidencyMigrationPhase(
    input: CompleteDataResidencyMigrationPhaseInput,
  ): Promise<RepositoryMutationResult<DataResidencyMigration>>;
  retryDataResidencyMigrationPhase(
    input: RetryDataResidencyMigrationPhaseInput,
  ): Promise<RepositoryMutationResult<DataResidencyMigration>>;
  listDataResidencyMigrationEvidence(
    workspaceId: string,
    migrationId: string,
  ): Promise<DataResidencyMigrationEvidenceRecord[]>;
  resolveWorkspaceDataRoute(workspaceId: string): Promise<{
    workspaceId: string;
    region: DataResidencyRegion;
    routeKey: string;
    generation: number;
  }>;
}

export function assertDataResidencyEvidence(
  evidence: DataResidencyMigrationEvidenceRecord,
): void {
  if (
    !evidence.id.startsWith('drproof_') ||
    !evidence.workspaceId.trim() ||
    !evidence.migrationId.trim() ||
    !DATA_RESIDENCY_EVIDENCE_PHASES.includes(evidence.phase) ||
    !boundedProviderOperationId(evidence.providerOperationId) ||
    !isContentDigest(evidence.sourceDigest) ||
    !isContentDigest(evidence.targetDigest) ||
    !Number.isSafeInteger(evidence.recordCount) ||
    evidence.recordCount < 0 ||
    !Number.isFinite(Date.parse(evidence.occurredAt))
  ) {
    throw new Error('Data residency migration evidence is invalid');
  }
}

export function dataResidencyEvidenceMatches(
  left: DataResidencyMigrationEvidenceRecord,
  right: DataResidencyMigrationEvidenceRecord,
): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.migrationId === right.migrationId &&
    left.phase === right.phase &&
    left.providerOperationId === right.providerOperationId &&
    left.sourceDigest === right.sourceDigest &&
    left.targetDigest === right.targetDigest &&
    left.recordCount === right.recordCount
  );
}

export function dataResidencyEvidencePhaseForStatus(
  status: DataResidencyMigrationStatus,
): DataResidencyEvidencePhase | null {
  if (status === 'copying') return 'copy';
  if (status === 'verifying') return 'verify';
  if (status === 'cutover-ready') return 'cutover';
  return null;
}

export function compareDataResidencyEvidence(
  left: DataResidencyMigrationEvidenceRecord,
  right: DataResidencyMigrationEvidenceRecord,
): number {
  const timestampOrder = left.occurredAt.localeCompare(right.occurredAt);
  if (timestampOrder !== 0) return timestampOrder;
  return DATA_RESIDENCY_EVIDENCE_PHASES.indexOf(left.phase) -
    DATA_RESIDENCY_EVIDENCE_PHASES.indexOf(right.phase);
}

function isContentDigest(value: string): boolean {
  return /^sha256-[0-9a-f]{64}$/u.test(value);
}

function boundedProviderOperationId(value: string): boolean {
  const length = value.trim().length;
  return length > 0 && length <= 256;
}
