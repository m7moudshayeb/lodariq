/**
 * Retention for `analytics_events` (H12).
 *
 * The table has no delete path — `entitlements.analyticsRetentionDays` was only
 * ever a read filter — and it is the largest in the system. A bounded DELETE
 * sweep like the webhook one would work, but on this table it would spend the
 * rest of its life fighting its own bloat, so retention here is
 * `drop partition`: constant time, no vacuum debt, no lock on live ingestion.
 *
 * Every function is a no-op until `0041` partitions the table, so this ships
 * safely ahead of that migration.
 */

/** Thirteen months keeps a full year plus the month in progress for comparisons. */
export const ANALYTICS_EVENT_RETENTION_MONTHS = 13;

/** How far ahead partitions are pre-created so ingestion never hits the default. */
export const ANALYTICS_EVENT_PARTITION_MONTHS_AHEAD = 3;

export interface AnalyticsPartitionMaintenanceInput {
  now: string;
  retentionMonths?: number;
  monthsAhead?: number;
}

export interface AnalyticsPartitionMaintenanceResult {
  created: string[];
  dropped: string[];
}

/** `analytics_events_YYYY_MM`, the name `0041` gives each monthly partition. */
export function analyticsPartitionName(month: Date): string {
  const year = month.getUTCFullYear();
  const monthNumber = `${month.getUTCMonth() + 1}`.padStart(2, '0');
  return `analytics_events_${year}_${monthNumber}`;
}

export function startOfUtcMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function addUtcMonths(at: Date, months: number): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, 1));
}

/** Months that should exist, from the current one through `monthsAhead`. */
export function upcomingPartitionMonths(now: Date, monthsAhead: number): Date[] {
  const first = startOfUtcMonth(now);
  return Array.from({ length: monthsAhead + 1 }, (_, offset) => addUtcMonths(first, offset));
}

/**
 * The exclusive upper bound below which a partition is entirely expired.
 *
 * A partition is dropped only when its whole range is older than this, so the
 * month a cutoff falls inside is kept rather than truncated.
 */
export function retentionCutoffMonth(now: Date, retentionMonths: number): Date {
  return addUtcMonths(startOfUtcMonth(now), -retentionMonths);
}
