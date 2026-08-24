import type {
  DataResidencyEvidencePhase,
  DataResidencyMigrationEvidenceRecord,
} from '@lodariq/database';
import type { DataResidencyMigration, DataResidencyRegion } from '@lodariq/schema';

export interface DataResidencyProviderOperationInput {
  migration: DataResidencyMigration;
  sourceRouteKey: string;
  targetRouteKey: string;
  /** Providers must treat this key as single-use and replay the same completed operation. */
  idempotencyKey: string;
}

export interface DataResidencyProviderOperationResult {
  providerOperationId: string;
  sourceDigest: string;
  targetDigest: string;
  recordCount: number;
}

/**
 * Provider-neutral boundary for value-free regional copy evidence. Implementations own storage
 * credentials and must never return tenant records, URLs, selectors, or raw document content.
 */
export interface DataResidencyProvider {
  id: string;
  copy(input: DataResidencyProviderOperationInput): Promise<DataResidencyProviderOperationResult>;
  verify(input: DataResidencyProviderOperationInput): Promise<DataResidencyProviderOperationResult>;
  cutover(input: DataResidencyProviderOperationInput): Promise<DataResidencyProviderOperationResult>;
}

export function normalizedDataResidencyEvidence(input: {
  id: string;
  workspaceId: string;
  migrationId: string;
  phase: DataResidencyEvidencePhase;
  result: DataResidencyProviderOperationResult;
  occurredAt: string;
}): DataResidencyMigrationEvidenceRecord {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    migrationId: input.migrationId,
    phase: input.phase,
    providerOperationId: input.result.providerOperationId,
    sourceDigest: input.result.sourceDigest,
    targetDigest: input.result.targetDigest,
    recordCount: input.result.recordCount,
    occurredAt: input.occurredAt,
  };
}

export function regionRouteKey(region: DataResidencyRegion): string {
  return `primary-${region}`;
}
