import type {
  AnalyticsWarehouseDeliveryBatch,
  AnalyticsWarehouseDestinationRecord,
} from '@lodariq/database';
import type { AnalyticsWarehouseDestination } from '@lodariq/schema/analytics-warehouse';

export interface AnalyticsWarehouseDeliveryResult {
  providerBatchId: string;
  acceptedEventCount: number;
  batchHash: string;
}

export interface AnalyticsWarehouseProvider {
  id: string;
  /** Implementations must replay the same result when the idempotency key is reused. */
  deliver(input: {
    destination: AnalyticsWarehouseDestination;
    credentialReference: string;
    idempotencyKey: string;
    batch: AnalyticsWarehouseDeliveryBatch;
  }): Promise<AnalyticsWarehouseDeliveryResult>;
}

export function assertAnalyticsWarehouseProvider(provider: AnalyticsWarehouseProvider): void {
  if (!/^[a-z][a-z0-9-]{0,79}$/u.test(provider.id)) {
    throw new Error('Analytics warehouse provider id is invalid');
  }
}

export function warehouseProviderForDestination(
  providers: ReadonlyMap<string, AnalyticsWarehouseProvider>,
  destination: Pick<AnalyticsWarehouseDestinationRecord, 'provider'>,
): AnalyticsWarehouseProvider | null {
  return providers.get(destination.provider) ?? null;
}
