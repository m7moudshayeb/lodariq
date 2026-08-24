import { createHash, randomUUID } from 'node:crypto';
import {
  COMMERCIAL_PLAN_LABELS,
  COMMERCIAL_PLAN_VERSION,
  commercialUsageValue,
  documentLocaleCount,
  type WorkspaceCommercialUsage,
} from '@lodariq/schema';
import {
  BILLING_CONTRACT_VERSION,
  BILLING_METER_VERSION,
  type BillingMeterItem,
  type BillingOverview,
} from '@lodariq/schema/commercial-billing';
import {
  type AiCreditLedgerRecord,
  CommercialEntitlementError,
  type ChangeWorkspaceSubscriptionInput,
  type ConsumeThemeGenerationRunInput,
  type DebitAiCreditsInput,
  type RecordWorkspaceUsageInput,
  type WorkspaceEntitlementSnapshotRecord,
  analyticsExportLimitForSnapshot,
  assertCommercialFeature,
  assertValidAiCreditDebit,
  calendarMonthPeriod,
} from '../domains/commercial-entitlements';
import {
  BILLING_METER_MAX_ATTEMPTS,
  billingMeterRetryDelayMs,
  BillingProviderEventConflictError,
  assertBillingPeriod,
  assertNormalizedBillingProviderEvent,
  billingMeterItemsHash,
  billingMeterItemsMatch,
  normalizedBillingMeterItems,
  toPublicBillingMeterBatch,
  type BillingAccountRecord,
  type BillingInvoiceRecord,
  type BillingMeterBatchRecord,
  type ClaimBillingMeterBatchesInput,
  type CompleteBillingMeterBatchInput,
  type CreateBillingMeterBatchInput,
  type FailBillingMeterBatchInput,
  type IngestBillingProviderEventResult,
  type NormalizedBillingProviderEvent,
} from '../domains/commercial-billing';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryExperienceMeasurement } from './experience-measurement';

export class InMemoryRepositoryCommercialEntitlements extends InMemoryRepositoryExperienceMeasurement {
  async readWorkspaceEntitlementSnapshot(
    workspaceId: string,
  ): Promise<WorkspaceEntitlementSnapshotRecord> {
    return clone(this.resolveWorkspaceEntitlements(workspaceId));
  }

  async readWorkspaceCommercialUsage(workspaceId: string): Promise<WorkspaceCommercialUsage> {
    const snapshot = this.resolveWorkspaceEntitlements(workspaceId);
    const period = calendarMonthPeriod(new Date());
    const periodStart = period.start.toISOString();
    const periodEnd = period.end.toISOString();
    const engagedUsers = [...this.workspaceUsageLedger.values()]
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.metric === 'engaged-users' &&
          entry.periodStart === periodStart,
      )
      .reduce((total, entry) => total + entry.quantity, 0);
    const liveExperiences = new Set(
      [...this.documentDeployments.values()]
        .filter((entry) => entry.workspaceId === workspaceId && entry.state === 'active')
        .map((entry) => entry.documentId),
    ).size;
    const creatorSeats = [...this.workspaceMemberships.values()].filter(
      (entry) => entry.workspaceId === workspaceId && entry.role !== 'viewer',
    ).length;
    const applications = [...this.workspaceApplications.values()].filter(
      (entry) => entry.workspaceId === workspaceId,
    ).length;
    const environments = [...this.environments.values()].filter(
      (entry) =>
        entry.workspaceId === workspaceId &&
        entry.enabled !== false &&
        entry.originAllowlist.length > 0,
    ).length;
    const locales = [...this.documents.values()]
      .filter((entry) => entry.document.workspaceId === workspaceId)
      .reduce((maximum, entry) => Math.max(maximum, documentLocaleCount(entry.document)), 0);
    const aiCredits = [...this.aiCreditLedger.values()]
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.createdAt >= periodStart &&
          entry.createdAt < periodEnd,
      )
      .reduce((total, entry) => total + entry.creditsDebited, 0);
    const themeGenerationRuns = [...this.workspaceUsageLedger.values()]
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.metric === 'theme-generation-runs' &&
          entry.periodStart === periodStart,
      )
      .reduce((total, entry) => total + entry.quantity, 0);
    const analyticsExports = [...this.analyticsExportJobs.values()].filter(
      (job) =>
        job.workspaceId === workspaceId &&
        job.createdAt >= periodStart &&
        job.createdAt < periodEnd,
    ).length;
    const limits = snapshot.entitlements;
    return {
      planId: snapshot.planId,
      planVersion: COMMERCIAL_PLAN_VERSION,
      periodStart,
      periodEnd,
      engagedUsers: commercialUsageValue(engagedUsers, limits.engagedUsersPerMonth, 'soft'),
      liveExperiences: commercialUsageValue(liveExperiences, limits.liveExperiences, 'hard'),
      creatorSeats: commercialUsageValue(creatorSeats, limits.creatorSeats, 'hard'),
      applications: commercialUsageValue(applications, limits.applications, 'hard'),
      locales: commercialUsageValue(locales, limits.locales, 'hard'),
      environments: commercialUsageValue(environments, limits.environments, 'hard'),
      aiCredits: commercialUsageValue(aiCredits, limits.aiCreditsPerMonth, 'hard'),
      themeGenerationRuns: commercialUsageValue(
        themeGenerationRuns,
        limits.themeGenerationRuns,
        'hard',
      ),
      analyticsExports: commercialUsageValue(
        analyticsExports,
        analyticsExportLimitForSnapshot(snapshot),
        'hard',
      ),
      assetBytes: limits.assetBytes,
      analyticsRetentionDays: limits.analyticsRetentionDays,
      versionRetentionDays: limits.versionRetentionDays,
      removeBadge: limits.removeBadge,
      features: [...limits.features],
    };
  }

  async changeWorkspaceSubscription(
    input: ChangeWorkspaceSubscriptionInput,
  ): Promise<WorkspaceEntitlementSnapshotRecord | null> {
    this.resolveWorkspaceEntitlements(input.workspaceId);
    const current = this.workspaceSubscriptions.get(input.workspaceId);
    if (!current || current.revision !== input.expectedRevision) return null;
    const next = {
      ...current,
      planId: input.planId,
      planVersion: COMMERCIAL_PLAN_VERSION,
      entitlementOverrides: clone(input.entitlementOverrides ?? {}),
      revision: current.revision + 1,
      updatedAt: input.changedAt,
    };
    this.workspaceSubscriptions.set(input.workspaceId, next);
    const snapshot = this.resolveWorkspaceEntitlements(input.workspaceId);
    const reason = current.planId === input.planId ? 'override_changed' : 'plan_changed';
    const snapshots = this.effectiveEntitlementSnapshots.get(input.workspaceId) ?? [];
    const index = snapshots.findIndex((entry) => entry.id === snapshot.id);
    snapshot.reason = reason;
    snapshot.changeActorId = input.changeActorId;
    if (index >= 0) snapshots[index] = clone(snapshot);
    return clone(snapshot);
  }

  async recordWorkspaceUsage(input: RecordWorkspaceUsageInput): Promise<boolean> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0 || !input.dedupeKey) {
      throw new Error('Usage quantity and dedupe key are required');
    }
    this.resolveWorkspaceEntitlements(input.workspaceId);
    const occurredAt = new Date(input.occurredAt);
    const period = calendarMonthPeriod(occurredAt);
    const scopeKey = input.environmentId ?? 'workspace';
    const dedupeKeyHash = usageDedupeHash(input.workspaceId, scopeKey, input.dedupeKey);
    const key = this.key(
      input.workspaceId,
      scopeKey,
      input.metric,
      period.start.toISOString(),
      dedupeKeyHash,
    );
    if (this.workspaceUsageLedger.has(key)) return false;
    this.workspaceUsageLedger.set(key, {
      id: `usage_${randomUUID()}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId ?? null,
      scopeKey,
      metric: input.metric,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      quantity: input.quantity,
      dedupeKeyHash,
      occurredAt: occurredAt.toISOString(),
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  async debitAiCredits(input: DebitAiCreditsInput): Promise<AiCreditLedgerRecord> {
    assertValidAiCreditDebit(input);
    const key = this.key(input.workspaceId, input.operationId);
    const existing = this.aiCreditLedger.get(key);
    if (existing) {
      if (!aiDebitMatches(existing, input)) throw new Error('AI operation usage conflict');
      return clone(existing);
    }
    const snapshot = this.resolveWorkspaceEntitlements(input.workspaceId);
    const period = calendarMonthPeriod(input.occurredAt);
    const used = [...this.aiCreditLedger.values()]
      .filter(
        (entry) =>
          entry.workspaceId === input.workspaceId &&
          entry.createdAt >= period.start.toISOString() &&
          entry.createdAt < period.end.toISOString(),
      )
      .reduce((total, entry) => total + entry.creditsDebited, 0);
    const limit = snapshot.entitlements.aiCreditsPerMonth;
    if (limit !== null && used + input.credits > limit) {
      throw new CommercialEntitlementError('ai-credits', used, limit);
    }
    const record: AiCreditLedgerRecord = {
      id: `aicredit_${randomUUID()}`,
      workspaceId: input.workspaceId,
      operationId: input.operationId,
      provider: input.provider,
      meterVersion: input.meterVersion,
      usageUnit: input.usageUnit,
      inputUnits: input.inputUnits,
      outputUnits: input.outputUnits,
      providerCostMicros: input.providerCostMicros,
      creditsDebited: input.credits,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      createdAt: new Date(input.occurredAt).toISOString(),
    };
    this.aiCreditLedger.set(key, record);
    return clone(record);
  }

  async consumeThemeGenerationRun(input: ConsumeThemeGenerationRunInput): Promise<boolean> {
    if (!input.operationId.trim() || input.operationId.length > 200) {
      throw new Error('Theme generation operation id is required');
    }
    const period = calendarMonthPeriod(input.occurredAt);
    const dedupeKeyHash = usageDedupeHash(input.workspaceId, 'workspace', input.operationId);
    const key = this.key(
      input.workspaceId,
      'workspace',
      'theme-generation-runs',
      period.start.toISOString(),
      dedupeKeyHash,
    );
    if (this.workspaceUsageLedger.has(key)) return false;
    const snapshot = this.resolveWorkspaceEntitlements(input.workspaceId);
    assertCommercialFeature(snapshot.entitlements, 'theme-generation');
    const used = [...this.workspaceUsageLedger.values()]
      .filter(
        (entry) =>
          entry.workspaceId === input.workspaceId &&
          entry.metric === 'theme-generation-runs' &&
          entry.periodStart === period.start.toISOString(),
      )
      .reduce((total, entry) => total + entry.quantity, 0);
    const limit = snapshot.entitlements.themeGenerationRuns;
    if (limit !== null && used + 1 > limit) {
      throw new CommercialEntitlementError('theme-generation-runs', used, limit);
    }
    this.workspaceUsageLedger.set(key, {
      id: `usage_${randomUUID()}`,
      workspaceId: input.workspaceId,
      environmentId: null,
      scopeKey: 'workspace',
      metric: 'theme-generation-runs',
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      quantity: 1,
      dedupeKeyHash,
      occurredAt: new Date(input.occurredAt).toISOString(),
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  async readBillingAccount(workspaceId: string): Promise<BillingAccountRecord | null> {
    const account = this.workspaceBillingAccounts.get(workspaceId);
    return account ? clone(account) : null;
  }

  async readWorkspaceBillingOverview(workspaceId: string): Promise<BillingOverview> {
    const entitlement = this.resolveWorkspaceEntitlements(workspaceId);
    const subscription = this.workspaceSubscriptions.get(workspaceId);
    if (!subscription) throw new Error('Workspace subscription could not be resolved');
    const usage = await this.readWorkspaceCommercialUsage(workspaceId);
    const invoices = [...this.billingInvoices.values()]
      .filter((invoice) => invoice.workspaceId === workspaceId)
      .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt))
      .slice(0, 24)
      .map((invoice) => toPublicInvoice(invoice));
    const metering = [...this.billingMeterBatches.values()]
      .filter((batch) => batch.workspaceId === workspaceId)
      .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd))
      .slice(0, 24)
      .map(toPublicBillingMeterBatch);
    return {
      contractVersion: BILLING_CONTRACT_VERSION,
      subscription: {
        workspaceId,
        planId: subscription.planId,
        planLabel: COMMERCIAL_PLAN_LABELS[subscription.planId],
        planVersion: subscription.planVersion,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        revision: subscription.revision,
        managedByProvider: this.workspaceBillingAccounts.has(workspaceId),
      },
      entitlements: clone(entitlement.entitlements),
      usage,
      invoices,
      metering,
    };
  }

  async ingestBillingProviderEvent(
    input: NormalizedBillingProviderEvent,
  ): Promise<IngestBillingProviderEventResult> {
    assertNormalizedBillingProviderEvent(input);
    const eventKey = this.key(input.provider, input.providerEventId);
    // Unlike drizzle's, this map has no row-level security, so it stands in for
    // the global unique index as well as the workspace's own view of it.
    const existingEvent = this.billingProviderEvents.get(eventKey);
    if (existingEvent) {
      if (
        existingEvent.payloadHash !== input.payloadHash ||
        existingEvent.workspaceId !== input.workspaceId
      ) {
        throw new BillingProviderEventConflictError();
      }
      return { status: 'duplicate' };
    }

    this.resolveWorkspaceEntitlements(input.workspaceId);
    const existingAccount = this.workspaceBillingAccounts.get(input.workspaceId);
    if (
      existingAccount &&
      (existingAccount.provider !== input.provider ||
        existingAccount.providerCustomerId !== input.providerCustomerId)
    ) {
      throw new Error('Workspace billing provider identity conflict');
    }

    this.billingProviderEvents.set(eventKey, {
      id: `billevt_${randomUUID()}`,
      workspaceId: input.workspaceId,
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payloadHash: input.payloadHash,
      providerCreatedAt: input.providerCreatedAt,
      processedAt: input.processedAt,
    });

    if (input.invoice) this.applyBillingInvoice(input);
    const stale = Boolean(
      existingAccount && input.providerCreatedAt < existingAccount.syncedThrough,
    );
    if (!stale) this.applyBillingSubscription(input, existingAccount?.createdAt);
    const meteringBatch = input.closedMeteringPeriod
      ? await this.createBillingMeterBatch({
          workspaceId: input.workspaceId,
          provider: input.provider,
          periodStart: input.closedMeteringPeriod.start,
          periodEnd: input.closedMeteringPeriod.end,
          createdAt: input.processedAt,
        })
      : undefined;
    return { status: stale ? 'stale' : 'applied', ...(meteringBatch ? { meteringBatch } : {}) };
  }

  async createBillingMeterBatch(
    input: CreateBillingMeterBatchInput,
  ): Promise<BillingMeterBatchRecord> {
    assertBillingPeriod(input.periodStart, input.periodEnd);
    const existing = [...this.billingMeterBatches.values()].find(
      (batch) =>
        batch.workspaceId === input.workspaceId &&
        batch.provider === input.provider &&
        batch.periodStart === input.periodStart &&
        batch.periodEnd === input.periodEnd,
    );
    if (existing) return clone(existing);
    this.resolveWorkspaceEntitlements(input.workspaceId);
    const items = billingItemsForPeriod(
      [...this.workspaceUsageLedger.values()].filter(
        (entry) =>
          entry.workspaceId === input.workspaceId &&
          entry.occurredAt >= input.periodStart &&
          entry.occurredAt < input.periodEnd,
      ),
      [...this.aiCreditLedger.values()].filter(
        (entry) =>
          entry.workspaceId === input.workspaceId &&
          entry.createdAt >= input.periodStart &&
          entry.createdAt < input.periodEnd,
      ),
    );
    const record: BillingMeterBatchRecord = {
      id: `billbatch_${randomUUID()}`,
      workspaceId: input.workspaceId,
      provider: input.provider,
      meterVersion: BILLING_METER_VERSION,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      items,
      itemsHash: billingMeterItemsHash(items),
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: input.createdAt,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.billingMeterBatches.set(record.id, record);
    return clone(record);
  }

  async claimBillingMeterBatches(
    input: ClaimBillingMeterBatchesInput,
  ): Promise<BillingMeterBatchRecord[]> {
    const now = Date.parse(input.now);
    const limit = Math.max(1, Math.min(input.limit, 25));
    const claimed = [...this.billingMeterBatches.values()]
      .filter(
        (batch) =>
          (batch.status === 'pending' || batch.status === 'failed') &&
          batch.attemptCount < BILLING_METER_MAX_ATTEMPTS &&
          Date.parse(batch.nextAttemptAt) <= now &&
          (!batch.leaseExpiresAt || Date.parse(batch.leaseExpiresAt) <= now),
      )
      .sort((left, right) => left.nextAttemptAt.localeCompare(right.nextAttemptAt))
      .slice(0, limit);
    const leaseExpiresAt = new Date(now + 2 * 60 * 1_000).toISOString();
    for (const batch of claimed) {
      Object.assign(batch, {
        status: 'submitting' as const,
        attemptCount: batch.attemptCount + 1,
        leaseWorkerId: input.workerId,
        leaseExpiresAt,
        errorCode: undefined,
        updatedAt: input.now,
      });
    }
    return clone(claimed);
  }

  async completeBillingMeterBatch(
    input: CompleteBillingMeterBatchInput,
  ): Promise<BillingMeterBatchRecord | null> {
    const batch = this.billingMeterBatches.get(input.batchId);
    if (
      !batch ||
      batch.workspaceId !== input.workspaceId ||
      batch.status !== 'submitting' ||
      batch.leaseWorkerId !== input.workerId
    ) {
      return null;
    }
    const reconciled = billingMeterItemsMatch(batch.items, input.reportedItems);
    Object.assign(batch, {
      status: reconciled ? ('reconciled' as const) : ('failed' as const),
      providerSubmissionId: input.providerSubmissionId,
      errorCode: reconciled ? undefined : 'quantity_mismatch',
      attemptCount: reconciled ? batch.attemptCount : BILLING_METER_MAX_ATTEMPTS,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      reconciledAt: reconciled ? input.completedAt : undefined,
      nextAttemptAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    return clone(batch);
  }

  async resetBillingMeterBatch(input: {
    workspaceId: string;
    batchId: string;
    actorUserId: string;
    resetAt: string;
  }): Promise<BillingMeterBatchRecord | null> {
    const batch = this.billingMeterBatches.get(input.batchId);
    if (!batch || batch.workspaceId !== input.workspaceId || batch.status !== 'failed') return null;
    const {
      leaseWorkerId: _worker,
      leaseExpiresAt: _expires,
      errorCode: _error,
      ...rest
    } = batch;
    const reset = {
      ...rest,
      status: 'pending' as const,
      attemptCount: 0,
      nextAttemptAt: input.resetAt,
      updatedAt: input.resetAt,
    };
    this.billingMeterBatches.set(batch.id, reset);
    return clone(reset);
  }

  async failBillingMeterBatch(
    input: FailBillingMeterBatchInput,
  ): Promise<BillingMeterBatchRecord | null> {
    const batch = this.billingMeterBatches.get(input.batchId);
    if (
      !batch ||
      batch.workspaceId !== input.workspaceId ||
      batch.status !== 'submitting' ||
      batch.leaseWorkerId !== input.workerId
    ) {
      return null;
    }
    const retryDelayMs = billingMeterRetryDelayMs(batch.id, batch.attemptCount);
    Object.assign(batch, {
      status: 'failed' as const,
      errorCode: input.errorCode,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: new Date(Date.parse(input.failedAt) + retryDelayMs).toISOString(),
      updatedAt: input.failedAt,
    });
    return clone(batch);
  }

  private applyBillingSubscription(
    input: NormalizedBillingProviderEvent,
    accountCreatedAt?: string,
  ): void {
    const current = this.workspaceSubscriptions.get(input.workspaceId);
    if (!current) throw new Error('Workspace subscription could not be resolved');
    if (input.subscription) {
      const planChanged = input.subscription.planId !== current.planId;
      if (planChanged) {
        const revision = current.revision + 1;
        this.workspaceSubscriptions.set(input.workspaceId, {
          ...current,
          planId: input.subscription.planId,
          planVersion: COMMERCIAL_PLAN_VERSION,
          status: input.subscription.status,
          currentPeriodStart: input.subscription.currentPeriodStart,
          currentPeriodEnd: input.subscription.currentPeriodEnd,
          revision,
          updatedAt: input.processedAt,
        });
        const snapshot = this.resolveWorkspaceEntitlements(input.workspaceId);
        snapshot.reason = 'plan_changed';
        snapshot.changeActorId = `system:billing:${input.provider}`;
        const snapshots = this.effectiveEntitlementSnapshots.get(input.workspaceId) ?? [];
        const index = snapshots.findIndex((candidate) => candidate.id === snapshot.id);
        if (index >= 0) snapshots[index] = snapshot;
      } else {
        this.workspaceSubscriptions.set(input.workspaceId, {
          ...current,
          status: input.subscription.status,
          currentPeriodStart: input.subscription.currentPeriodStart,
          currentPeriodEnd: input.subscription.currentPeriodEnd,
          updatedAt: input.processedAt,
        });
      }
    }
    this.workspaceBillingAccounts.set(input.workspaceId, {
      workspaceId: input.workspaceId,
      provider: input.provider,
      providerCustomerId: input.providerCustomerId,
      ...(input.providerSubscriptionId
        ? { providerSubscriptionId: input.providerSubscriptionId }
        : {}),
      syncedThrough: input.providerCreatedAt,
      createdAt: accountCreatedAt ?? input.processedAt,
      updatedAt: input.processedAt,
    });
  }

  private applyBillingInvoice(input: NormalizedBillingProviderEvent): void {
    const invoice = input.invoice;
    if (!invoice) return;
    const key = this.key(input.workspaceId, invoice.id);
    const existing = this.billingInvoices.get(key);
    if (existing && existing.providerUpdatedAt > invoice.providerUpdatedAt) return;
    this.billingInvoices.set(key, {
      ...clone(invoice),
      workspaceId: input.workspaceId,
      provider: input.provider,
    });
  }
}

function billingItemsForPeriod(
  usage: readonly { metric: BillingMeterItem['metric']; quantity: number }[],
  credits: readonly { creditsDebited: number }[],
): BillingMeterItem[] {
  const items: BillingMeterItem[] = usage.map((entry) => ({
    metric: entry.metric,
    quantity: entry.quantity,
  }));
  items.push(
    { metric: 'engaged-users', quantity: 0 },
    {
      metric: 'ai-credits',
      quantity: credits.reduce((total, entry) => total + entry.creditsDebited, 0),
    },
  );
  return normalizedBillingMeterItems(items);
}

function toPublicInvoice(invoice: BillingInvoiceRecord) {
  return {
    id: invoice.id,
    status: invoice.status,
    currency: invoice.currency,
    amountDueMinor: invoice.amountDueMinor,
    amountPaidMinor: invoice.amountPaidMinor,
    issuedAt: invoice.issuedAt,
    ...(invoice.dueAt ? { dueAt: invoice.dueAt } : {}),
    ...(invoice.paidAt ? { paidAt: invoice.paidAt } : {}),
    ...(invoice.hostedInvoiceUrl ? { hostedInvoiceUrl: invoice.hostedInvoiceUrl } : {}),
  };
}

function usageDedupeHash(workspaceId: string, scopeKey: string, value: string): string {
  return `sha256-${createHash('sha256')
    .update(`${workspaceId}\0${scopeKey}\0${value}`)
    .digest('hex')}`;
}

function aiDebitMatches(record: AiCreditLedgerRecord, input: DebitAiCreditsInput): boolean {
  return (
    record.provider === input.provider &&
    record.meterVersion === input.meterVersion &&
    record.usageUnit === input.usageUnit &&
    record.inputUnits === input.inputUnits &&
    record.outputUnits === input.outputUnits &&
    record.providerCostMicros === input.providerCostMicros &&
    record.creditsDebited === input.credits
  );
}
