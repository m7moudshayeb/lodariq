import {
  COMMERCIAL_PLAN_ENTITLEMENTS,
  commercialFeatureEnabled,
  type CommercialEntitlementOverrides,
  type CommercialEntitlements,
  type CommercialFeatureId,
  type CommercialPlanId,
  type CommercialUsageMetric,
  type WorkspaceCommercialUsage,
} from '@lodariq/schema';

export interface WorkspaceSubscriptionRecord {
  workspaceId: string;
  planId: CommercialPlanId;
  planVersion: string;
  status: 'active' | 'past_due' | 'canceled';
  entitlementOverrides: CommercialEntitlementOverrides;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceEntitlementSnapshotRecord {
  id: string;
  workspaceId: string;
  subscriptionRevision: number;
  planId: CommercialPlanId;
  planVersion: string;
  entitlements: CommercialEntitlements;
  entitlementHash: string;
  reason: 'migration' | 'workspace_created' | 'plan_changed' | 'override_changed';
  changeActorId: string;
  effectiveFrom: string;
  createdAt: string;
}

export interface WorkspaceUsageLedgerRecord {
  id: string;
  workspaceId: string;
  environmentId: string | null;
  scopeKey: string;
  metric: CommercialUsageMetric;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  dedupeKeyHash: string;
  occurredAt: string;
  createdAt: string;
}

export interface AiCreditLedgerRecord {
  id: string;
  workspaceId: string;
  operationId: string;
  provider: string;
  meterVersion: string;
  usageUnit: 'tokens' | 'characters' | 'seconds' | 'images';
  inputUnits: number;
  outputUnits: number;
  providerCostMicros: number;
  creditsDebited: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface ChangeWorkspaceSubscriptionInput {
  workspaceId: string;
  planId: CommercialPlanId;
  entitlementOverrides?: CommercialEntitlementOverrides;
  expectedRevision: number;
  changeActorId: string;
  changedAt: string;
}

export interface RecordWorkspaceUsageInput {
  workspaceId: string;
  environmentId?: string;
  metric: CommercialUsageMetric;
  quantity: number;
  /** Caller-owned identity; only its digest is persisted. */
  dedupeKey: string;
  occurredAt: string;
}

export interface DebitAiCreditsInput {
  workspaceId: string;
  operationId: string;
  provider: string;
  meterVersion: string;
  usageUnit: AiCreditLedgerRecord['usageUnit'];
  inputUnits: number;
  outputUnits: number;
  providerCostMicros: number;
  credits: number;
  occurredAt: string;
}

export interface ConsumeThemeGenerationRunInput {
  workspaceId: string;
  operationId: string;
  occurredAt: string;
}

const AI_OPERATION_ID_PATTERN = /^aiop_[A-Za-z0-9_-]{20,}$/u;

export interface CommercialEntitlementRepository {
  readWorkspaceEntitlementSnapshot(
    workspaceId: string,
  ): Promise<WorkspaceEntitlementSnapshotRecord>;
  readWorkspaceCommercialUsage(workspaceId: string): Promise<WorkspaceCommercialUsage>;
  changeWorkspaceSubscription(
    input: ChangeWorkspaceSubscriptionInput,
  ): Promise<WorkspaceEntitlementSnapshotRecord | null>;
  recordWorkspaceUsage(input: RecordWorkspaceUsageInput): Promise<boolean>;
  debitAiCredits(input: DebitAiCreditsInput): Promise<AiCreditLedgerRecord>;
  consumeThemeGenerationRun(input: ConsumeThemeGenerationRunInput): Promise<boolean>;
}

export type CommercialLimitKey =
  | CommercialUsageMetric
  | 'asset-bytes'
  | 'adoption-success-events'
  | 'analytics-export-jobs'
  | 'feature';

export class CommercialEntitlementError extends Error {
  readonly code = 'commercial_entitlement_exceeded';

  constructor(
    readonly limitKey: CommercialLimitKey,
    readonly used: number,
    readonly limit: number,
    readonly feature?: CommercialFeatureId,
  ) {
    super(
      feature
        ? `${feature} is not included in this workspace plan`
        : `${limitKey} limit reached (${used}/${limit})`,
    );
    this.name = 'CommercialEntitlementError';
  }
}

export function analyticsExportLimitForSnapshot(
  snapshot: Pick<WorkspaceEntitlementSnapshotRecord, 'planId' | 'entitlements'>,
): number | null {
  const value = (snapshot.entitlements as Partial<CommercialEntitlements>).analyticsExportsPerMonth;
  if (value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
    return value;
  }
  return COMMERCIAL_PLAN_ENTITLEMENTS[snapshot.planId].analyticsExportsPerMonth;
}

export function calendarMonthPeriod(at: string | Date): { start: Date; end: Date } {
  const date = typeof at === 'string' ? new Date(at) : at;
  if (!Number.isFinite(date.getTime())) throw new Error('A valid usage timestamp is required');
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

export function assertWithinCommercialLimit(
  limitKey: CommercialLimitKey,
  used: number,
  limit: number | null,
): void {
  if (limit !== null && used > limit) {
    throw new CommercialEntitlementError(limitKey, used, limit);
  }
}

export function assertCommercialFeature(
  entitlements: Pick<CommercialEntitlements, 'features'>,
  feature: CommercialFeatureId,
): void {
  if (!commercialFeatureEnabled(entitlements, feature)) {
    throw new CommercialEntitlementError('feature', 0, 0, feature);
  }
}

export function assertValidAiCreditDebit(input: DebitAiCreditsInput): void {
  if (
    !AI_OPERATION_ID_PATTERN.test(input.operationId) ||
    !input.provider.trim() ||
    input.provider.length > 80 ||
    !input.meterVersion.trim() ||
    input.meterVersion.length > 80 ||
    !Number.isInteger(input.inputUnits) ||
    !Number.isInteger(input.outputUnits) ||
    !Number.isInteger(input.providerCostMicros) ||
    !Number.isInteger(input.credits) ||
    input.inputUnits < 0 ||
    input.outputUnits < 0 ||
    input.providerCostMicros < 0 ||
    input.credits <= 0
  ) {
    throw new Error('AI usage must be bounded, non-negative, and debit at least one credit');
  }
  calendarMonthPeriod(input.occurredAt);
}
