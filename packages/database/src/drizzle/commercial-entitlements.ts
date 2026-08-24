import { createHash, randomUUID } from 'node:crypto';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNull,
  lt,
  lte,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import {
  COMMERCIAL_PLAN_LABELS,
  COMMERCIAL_PLAN_VERSION,
  commercialUsageValue,
  documentLocaleCount,
  resolveCommercialEntitlements,
  type WorkspaceCommercialUsage,
} from '@lodariq/schema';
import {
  BILLING_CONTRACT_VERSION,
  BILLING_METER_VERSION,
  type BillingInvoice,
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
  BILLING_METER_LEASE_MS,
  billingMeterRetryDelayMs,
  BILLING_METER_MAX_ATTEMPTS,
  BillingProviderEventConflictError,
  assertBillingPeriod,
  assertNormalizedBillingProviderEvent,
  billingMeterItemsHash,
  billingMeterItemsMatch,
  normalizedBillingMeterItems,
  toPublicBillingMeterBatch,
  type BillingAccountRecord,
  type BillingMeterBatchRecord,
  type ClaimBillingMeterBatchesInput,
  type CompleteBillingMeterBatchInput,
  type CreateBillingMeterBatchInput,
  type FailBillingMeterBatchInput,
  type IngestBillingProviderEventResult,
  type NormalizedBillingProviderEvent,
} from '../domains/commercial-billing';
import {
  aiCreditLedger,
  analyticsExportJobs,
  billingInvoices,
  billingMeterBatches,
  billingProviderEvents,
  documents,
  documentDeployments,
  effectiveEntitlementSnapshots,
  environments,
  workspaceApplications,
  workspaceBillingAccounts,
  workspaceMemberships,
  workspaceSubscriptions,
  workspaceUsageLedger,
} from '../schema';
import { runWithBillingWorkerScope } from '../scoped-transaction';
import { toIsoString } from './helpers';
import { entitlementHash } from './state';
import { DrizzleRepositoryExperienceMeasurement } from './experience-measurement';
import type { LodariqTransaction } from './types';

export class DrizzleRepositoryCommercialEntitlements extends DrizzleRepositoryExperienceMeasurement {
  async readWorkspaceEntitlementSnapshot(
    workspaceId: string,
  ): Promise<WorkspaceEntitlementSnapshotRecord> {
    return this.scoped(workspaceId, (tx) => this.resolveWorkspaceEntitlements(tx, workspaceId));
  }

  async readWorkspaceCommercialUsage(workspaceId: string): Promise<WorkspaceCommercialUsage> {
    return this.scoped(workspaceId, async (tx) => {
      const snapshot = await this.resolveWorkspaceEntitlements(tx, workspaceId);
      const period = calendarMonthPeriod(new Date());
      const [
        engaged,
        live,
        seats,
        applications,
        environmentCount,
        aiCredits,
        themeGenerationRuns,
        analyticsExports,
        canonicalDocuments,
      ] = await Promise.all([
        tx
          .select({ used: sum(workspaceUsageLedger.quantity) })
          .from(workspaceUsageLedger)
          .where(
            and(
              eq(workspaceUsageLedger.workspaceId, workspaceId),
              eq(workspaceUsageLedger.metric, 'engaged-users'),
              eq(workspaceUsageLedger.periodStart, period.start),
            ),
          ),
        tx
          .select({ used: countDistinct(documentDeployments.documentId) })
          .from(documentDeployments)
          .where(
            and(
              eq(documentDeployments.workspaceId, workspaceId),
              eq(documentDeployments.state, 'active'),
            ),
          ),
        tx
          .select({ used: count() })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, workspaceId),
              sql`${workspaceMemberships.role} in ('member','admin','owner')`,
            ),
          ),
        tx
          .select({ used: count() })
          .from(workspaceApplications)
          .where(eq(workspaceApplications.workspaceId, workspaceId)),
        tx
          .select({ used: count() })
          .from(environments)
          .where(
            and(
              eq(environments.workspaceId, workspaceId),
              eq(environments.enabled, true),
              sql`jsonb_array_length(${environments.originAllowlist}) > 0`,
            ),
          ),
        tx
          .select({ used: sum(aiCreditLedger.creditsDebited) })
          .from(aiCreditLedger)
          .where(
            and(
              eq(aiCreditLedger.workspaceId, workspaceId),
              gte(aiCreditLedger.createdAt, period.start),
              lt(aiCreditLedger.createdAt, period.end),
            ),
          ),
        tx
          .select({ used: sum(workspaceUsageLedger.quantity) })
          .from(workspaceUsageLedger)
          .where(
            and(
              eq(workspaceUsageLedger.workspaceId, workspaceId),
              eq(workspaceUsageLedger.metric, 'theme-generation-runs'),
              eq(workspaceUsageLedger.periodStart, period.start),
            ),
          ),
        tx
          .select({ used: count() })
          .from(analyticsExportJobs)
          .where(
            and(
              eq(analyticsExportJobs.workspaceId, workspaceId),
              gte(analyticsExportJobs.createdAt, period.start),
              lt(analyticsExportJobs.createdAt, period.end),
            ),
          ),
        tx
          .select({ canonical: documents.canonical })
          .from(documents)
          .where(eq(documents.workspaceId, workspaceId)),
      ]);
      const used = {
        engaged: Number(engaged[0]?.used ?? 0),
        live: Number(live[0]?.used ?? 0),
        seats: Number(seats[0]?.used ?? 0),
        applications: Number(applications[0]?.used ?? 0),
        environments: Number(environmentCount[0]?.used ?? 0),
        aiCredits: Number(aiCredits[0]?.used ?? 0),
        themeGenerationRuns: Number(themeGenerationRuns[0]?.used ?? 0),
        analyticsExports: Number(analyticsExports[0]?.used ?? 0),
        locales: canonicalDocuments.reduce(
          (maximum, row) => Math.max(maximum, documentLocaleCount(row.canonical)),
          0,
        ),
      };
      const limits = snapshot.entitlements;
      return {
        planId: snapshot.planId,
        planVersion: COMMERCIAL_PLAN_VERSION,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        engagedUsers: commercialUsageValue(used.engaged, limits.engagedUsersPerMonth, 'soft'),
        liveExperiences: commercialUsageValue(used.live, limits.liveExperiences, 'hard'),
        creatorSeats: commercialUsageValue(used.seats, limits.creatorSeats, 'hard'),
        applications: commercialUsageValue(used.applications, limits.applications, 'hard'),
        locales: commercialUsageValue(used.locales, limits.locales, 'hard'),
        environments: commercialUsageValue(used.environments, limits.environments, 'hard'),
        aiCredits: commercialUsageValue(used.aiCredits, limits.aiCreditsPerMonth, 'hard'),
        themeGenerationRuns: commercialUsageValue(
          used.themeGenerationRuns,
          limits.themeGenerationRuns,
          'hard',
        ),
        analyticsExports: commercialUsageValue(
          used.analyticsExports,
          analyticsExportLimitForSnapshot(snapshot),
          'hard',
        ),
        assetBytes: limits.assetBytes,
        analyticsRetentionDays: limits.analyticsRetentionDays,
        versionRetentionDays: limits.versionRetentionDays,
        removeBadge: limits.removeBadge,
        features: [...limits.features],
      };
    });
  }

  async changeWorkspaceSubscription(
    input: ChangeWorkspaceSubscriptionInput,
  ): Promise<WorkspaceEntitlementSnapshotRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      await this.resolveWorkspaceEntitlements(tx, input.workspaceId);
      const [current] = await tx
        .select()
        .from(workspaceSubscriptions)
        .where(eq(workspaceSubscriptions.workspaceId, input.workspaceId))
        .limit(1)
        .for('update');
      if (!current || current.revision !== input.expectedRevision) return null;
      const changedAt = new Date(input.changedAt);
      const revision = current.revision + 1;
      const overrides = input.entitlementOverrides ?? {};
      const [subscription] = await tx
        .update(workspaceSubscriptions)
        .set({
          planId: input.planId,
          planVersion: COMMERCIAL_PLAN_VERSION,
          entitlementOverrides: overrides,
          revision,
          updatedAt: changedAt,
        })
        .where(
          and(
            eq(workspaceSubscriptions.workspaceId, input.workspaceId),
            eq(workspaceSubscriptions.revision, input.expectedRevision),
          ),
        )
        .returning();
      if (!subscription) return null;
      const entitlements = resolveCommercialEntitlements(input.planId, overrides);
      const [snapshot] = await tx
        .insert(effectiveEntitlementSnapshots)
        .values({
          id: `entsnap_${randomUUID()}`,
          workspaceId: input.workspaceId,
          subscriptionRevision: revision,
          planId: input.planId,
          planVersion: COMMERCIAL_PLAN_VERSION,
          entitlements,
          entitlementHash: entitlementHash(entitlements),
          reason: current.planId === input.planId ? 'override_changed' : 'plan_changed',
          changeActorId: input.changeActorId,
          effectiveFrom: changedAt,
          createdAt: changedAt,
        })
        .returning();
      return snapshot ? toEntitlementSnapshot(snapshot) : null;
    });
  }

  async recordWorkspaceUsage(input: RecordWorkspaceUsageInput): Promise<boolean> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0 || !input.dedupeKey) {
      throw new Error('Usage quantity and dedupe key are required');
    }
    return this.scoped(input.workspaceId, async (tx) => {
      await this.resolveWorkspaceEntitlements(tx, input.workspaceId);
      const occurredAt = new Date(input.occurredAt);
      const period = calendarMonthPeriod(occurredAt);
      const scopeKey = input.environmentId ?? 'workspace';
      const [created] = await tx
        .insert(workspaceUsageLedger)
        .values({
          id: `usage_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId ?? null,
          scopeKey,
          metric: input.metric,
          periodStart: period.start,
          periodEnd: period.end,
          quantity: input.quantity,
          dedupeKeyHash: usageDedupeHash(input.workspaceId, scopeKey, input.dedupeKey),
          occurredAt,
          createdAt: new Date(),
        })
        .onConflictDoNothing({
          target: [
            workspaceUsageLedger.workspaceId,
            workspaceUsageLedger.scopeKey,
            workspaceUsageLedger.metric,
            workspaceUsageLedger.periodStart,
            workspaceUsageLedger.dedupeKeyHash,
          ],
        })
        .returning({ id: workspaceUsageLedger.id });
      return Boolean(created);
    });
  }

  async debitAiCredits(input: DebitAiCreditsInput): Promise<AiCreditLedgerRecord> {
    assertValidAiCreditDebit(input);
    return this.scoped(input.workspaceId, async (tx) => {
      const snapshot = await this.resolveWorkspaceEntitlements(tx, input.workspaceId);
      const [existing] = await tx
        .select()
        .from(aiCreditLedger)
        .where(
          and(
            eq(aiCreditLedger.workspaceId, input.workspaceId),
            eq(aiCreditLedger.operationId, input.operationId),
          ),
        )
        .limit(1);
      if (existing) {
        if (!aiDebitMatches(existing, input)) throw new Error('AI operation usage conflict');
        return toAiCreditRecord(existing);
      }

      const occurredAt = new Date(input.occurredAt);
      const period = calendarMonthPeriod(occurredAt);
      const [total] = await tx
        .select({ used: sum(aiCreditLedger.creditsDebited) })
        .from(aiCreditLedger)
        .where(
          and(
            eq(aiCreditLedger.workspaceId, input.workspaceId),
            gte(aiCreditLedger.createdAt, period.start),
            lt(aiCreditLedger.createdAt, period.end),
          ),
        );
      const used = Number(total?.used ?? 0);
      const limit = snapshot.entitlements.aiCreditsPerMonth;
      if (limit !== null && used + input.credits > limit) {
        throw new CommercialEntitlementError('ai-credits', used, limit);
      }
      const [created] = await tx
        .insert(aiCreditLedger)
        .values({
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
          periodStart: period.start,
          periodEnd: period.end,
          createdAt: occurredAt,
        })
        .returning();
      if (!created) throw new Error('Unable to record AI credit usage');
      return toAiCreditRecord(created);
    });
  }

  async consumeThemeGenerationRun(input: ConsumeThemeGenerationRunInput): Promise<boolean> {
    if (!input.operationId.trim() || input.operationId.length > 200) {
      throw new Error('Theme generation operation id is required');
    }
    return this.scoped(input.workspaceId, async (tx) => {
      const snapshot = await this.resolveWorkspaceEntitlements(tx, input.workspaceId);
      const occurredAt = new Date(input.occurredAt);
      const period = calendarMonthPeriod(occurredAt);
      const dedupeKeyHash = usageDedupeHash(input.workspaceId, 'workspace', input.operationId);
      const [existing] = await tx
        .select({ id: workspaceUsageLedger.id })
        .from(workspaceUsageLedger)
        .where(
          and(
            eq(workspaceUsageLedger.workspaceId, input.workspaceId),
            eq(workspaceUsageLedger.scopeKey, 'workspace'),
            eq(workspaceUsageLedger.metric, 'theme-generation-runs'),
            eq(workspaceUsageLedger.periodStart, period.start),
            eq(workspaceUsageLedger.dedupeKeyHash, dedupeKeyHash),
          ),
        )
        .limit(1);
      if (existing) return false;
      assertCommercialFeature(snapshot.entitlements, 'theme-generation');
      const [total] = await tx
        .select({ used: sum(workspaceUsageLedger.quantity) })
        .from(workspaceUsageLedger)
        .where(
          and(
            eq(workspaceUsageLedger.workspaceId, input.workspaceId),
            eq(workspaceUsageLedger.metric, 'theme-generation-runs'),
            eq(workspaceUsageLedger.periodStart, period.start),
          ),
        );
      const used = Number(total?.used ?? 0);
      const limit = snapshot.entitlements.themeGenerationRuns;
      if (limit !== null && used + 1 > limit) {
        throw new CommercialEntitlementError('theme-generation-runs', used, limit);
      }
      const [created] = await tx
        .insert(workspaceUsageLedger)
        .values({
          id: `usage_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: null,
          scopeKey: 'workspace',
          metric: 'theme-generation-runs',
          periodStart: period.start,
          periodEnd: period.end,
          quantity: 1,
          dedupeKeyHash,
          occurredAt,
          createdAt: new Date(),
        })
        .returning({ id: workspaceUsageLedger.id });
      return Boolean(created);
    });
  }

  async readBillingAccount(workspaceId: string): Promise<BillingAccountRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [account] = await tx
        .select()
        .from(workspaceBillingAccounts)
        .where(eq(workspaceBillingAccounts.workspaceId, workspaceId))
        .limit(1);
      if (!account) return null;
      return {
        workspaceId: account.workspaceId,
        provider: account.provider,
        providerCustomerId: account.providerCustomerId,
        ...(account.providerSubscriptionId
          ? { providerSubscriptionId: account.providerSubscriptionId }
          : {}),
        syncedThrough: account.syncedThrough.toISOString(),
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      };
    });
  }

  async readWorkspaceBillingOverview(workspaceId: string): Promise<BillingOverview> {
    const [details, usage] = await Promise.all([
      this.scoped(workspaceId, async (tx) => {
        const entitlement = await this.resolveWorkspaceEntitlements(tx, workspaceId);
        const [subscription] = await tx
          .select()
          .from(workspaceSubscriptions)
          .where(eq(workspaceSubscriptions.workspaceId, workspaceId))
          .limit(1);
        if (!subscription) throw new Error('Workspace subscription could not be resolved');
        const [account, invoiceRows, batchRows] = await Promise.all([
          tx
            .select({ workspaceId: workspaceBillingAccounts.workspaceId })
            .from(workspaceBillingAccounts)
            .where(eq(workspaceBillingAccounts.workspaceId, workspaceId))
            .limit(1),
          tx
            .select()
            .from(billingInvoices)
            .where(eq(billingInvoices.workspaceId, workspaceId))
            .orderBy(desc(billingInvoices.issuedAt))
            .limit(24),
          tx
            .select()
            .from(billingMeterBatches)
            .where(eq(billingMeterBatches.workspaceId, workspaceId))
            .orderBy(desc(billingMeterBatches.periodEnd))
            .limit(24),
        ]);
        return {
          entitlement,
          subscription,
          managedByProvider: account.length > 0,
          invoices: invoiceRows.map(toPublicInvoice),
          metering: batchRows.map((row) => toPublicBillingMeterBatch(toBillingMeterBatch(row))),
        };
      }),
      this.readWorkspaceCommercialUsage(workspaceId),
    ]);
    return {
      contractVersion: BILLING_CONTRACT_VERSION,
      subscription: {
        workspaceId,
        planId: details.subscription.planId,
        planLabel: COMMERCIAL_PLAN_LABELS[details.subscription.planId],
        planVersion: details.subscription.planVersion,
        status: details.subscription.status as BillingOverview['subscription']['status'],
        currentPeriodStart: toIsoString(details.subscription.currentPeriodStart),
        currentPeriodEnd: toIsoString(details.subscription.currentPeriodEnd),
        revision: details.subscription.revision,
        managedByProvider: details.managedByProvider,
      },
      entitlements: structuredClone(details.entitlement.entitlements),
      usage,
      invoices: details.invoices,
      metering: details.metering,
    };
  }

  async ingestBillingProviderEvent(
    input: NormalizedBillingProviderEvent,
  ): Promise<IngestBillingProviderEventResult> {
    assertNormalizedBillingProviderEvent(input);
    const status = await this.scoped(input.workspaceId, async (tx) => {
      await this.resolveWorkspaceEntitlements(tx, input.workspaceId);
      const [existingEvent] = await tx
        .select()
        .from(billingProviderEvents)
        .where(
          and(
            eq(billingProviderEvents.provider, input.provider),
            eq(billingProviderEvents.providerEventId, input.providerEventId),
          ),
        )
        .limit(1);
      /*
       * This select is RLS-scoped, so it can only ever see this workspace's own
       * rows: a same-id event belonging to another tenant is invisible here and
       * is refused by the insert below, where `onConflictDoNothing` returns no
       * row against the global unique index. Only the payload can differ.
       */
      if (existingEvent) {
        if (existingEvent.payloadHash !== input.payloadHash) {
          throw new BillingProviderEventConflictError();
        }
        return 'duplicate' as const;
      }
      const [createdEvent] = await tx
        .insert(billingProviderEvents)
        .values({
          id: `billevt_${randomUUID()}`,
          workspaceId: input.workspaceId,
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          payloadHash: input.payloadHash,
          providerCreatedAt: new Date(input.providerCreatedAt),
          processedAt: new Date(input.processedAt),
        })
        .onConflictDoNothing({
          target: [billingProviderEvents.provider, billingProviderEvents.providerEventId],
        })
        .returning({ id: billingProviderEvents.id });
      if (!createdEvent) throw new BillingProviderEventConflictError();

      const [account] = await tx
        .select()
        .from(workspaceBillingAccounts)
        .where(eq(workspaceBillingAccounts.workspaceId, input.workspaceId))
        .limit(1)
        .for('update');
      if (
        account &&
        (account.provider !== input.provider ||
          account.providerCustomerId !== input.providerCustomerId)
      ) {
        throw new Error('Workspace billing provider identity conflict');
      }
      await applyBillingInvoice(tx, input);
      const stale = Boolean(
        account && Date.parse(input.providerCreatedAt) < account.syncedThrough.getTime(),
      );
      if (stale) return 'stale' as const;

      await applyBillingSubscription(tx, input);
      await tx
        .insert(workspaceBillingAccounts)
        .values({
          workspaceId: input.workspaceId,
          provider: input.provider,
          providerCustomerId: input.providerCustomerId,
          providerSubscriptionId: input.providerSubscriptionId ?? null,
          syncedThrough: new Date(input.providerCreatedAt),
          createdAt: new Date(input.processedAt),
          updatedAt: new Date(input.processedAt),
        })
        .onConflictDoUpdate({
          target: workspaceBillingAccounts.workspaceId,
          set: {
            providerSubscriptionId: input.providerSubscriptionId ?? null,
            syncedThrough: new Date(input.providerCreatedAt),
            updatedAt: new Date(input.processedAt),
          },
        });
      return 'applied' as const;
    });
    if (status === 'duplicate') return { status };
    const meteringBatch = input.closedMeteringPeriod
      ? await this.createBillingMeterBatch({
          workspaceId: input.workspaceId,
          provider: input.provider,
          periodStart: input.closedMeteringPeriod.start,
          periodEnd: input.closedMeteringPeriod.end,
          createdAt: input.processedAt,
        })
      : undefined;
    return { status, ...(meteringBatch ? { meteringBatch } : {}) };
  }

  async createBillingMeterBatch(
    input: CreateBillingMeterBatchInput,
  ): Promise<BillingMeterBatchRecord> {
    assertBillingPeriod(input.periodStart, input.periodEnd);
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    return this.scoped(input.workspaceId, async (tx) => {
      await this.resolveWorkspaceEntitlements(tx, input.workspaceId);
      const [usageRows, creditRows] = await Promise.all([
        tx
          .select({
            metric: workspaceUsageLedger.metric,
            quantity: sum(workspaceUsageLedger.quantity),
          })
          .from(workspaceUsageLedger)
          .where(
            and(
              eq(workspaceUsageLedger.workspaceId, input.workspaceId),
              gte(workspaceUsageLedger.occurredAt, periodStart),
              lt(workspaceUsageLedger.occurredAt, periodEnd),
            ),
          )
          .groupBy(workspaceUsageLedger.metric),
        tx
          .select({ quantity: sum(aiCreditLedger.creditsDebited) })
          .from(aiCreditLedger)
          .where(
            and(
              eq(aiCreditLedger.workspaceId, input.workspaceId),
              gte(aiCreditLedger.createdAt, periodStart),
              lt(aiCreditLedger.createdAt, periodEnd),
            ),
          ),
      ]);
      const items = normalizedBillingMeterItems([
        ...usageRows.map((row) => ({ metric: row.metric, quantity: Number(row.quantity ?? 0) })),
        { metric: 'engaged-users', quantity: 0 },
        { metric: 'ai-credits', quantity: Number(creditRows[0]?.quantity ?? 0) },
      ]);
      const [created] = await tx
        .insert(billingMeterBatches)
        .values({
          id: `billbatch_${randomUUID()}`,
          workspaceId: input.workspaceId,
          provider: input.provider,
          meterVersion: BILLING_METER_VERSION,
          periodStart,
          periodEnd,
          items,
          itemsHash: billingMeterItemsHash(items),
          status: 'pending',
          attemptCount: 0,
          nextAttemptAt: new Date(input.createdAt),
          createdAt: new Date(input.createdAt),
          updatedAt: new Date(input.createdAt),
        })
        .onConflictDoNothing({
          target: [
            billingMeterBatches.workspaceId,
            billingMeterBatches.provider,
            billingMeterBatches.meterVersion,
            billingMeterBatches.periodStart,
            billingMeterBatches.periodEnd,
          ],
        })
        .returning();
      if (created) return toBillingMeterBatch(created);
      const [existing] = await tx
        .select()
        .from(billingMeterBatches)
        .where(
          and(
            eq(billingMeterBatches.workspaceId, input.workspaceId),
            eq(billingMeterBatches.provider, input.provider),
            eq(billingMeterBatches.meterVersion, BILLING_METER_VERSION),
            eq(billingMeterBatches.periodStart, periodStart),
            eq(billingMeterBatches.periodEnd, periodEnd),
          ),
        )
        .limit(1);
      if (!existing) throw new Error('Billing meter batch could not be resolved');
      return toBillingMeterBatch(existing);
    });
  }

  async claimBillingMeterBatches(
    input: ClaimBillingMeterBatchesInput,
  ): Promise<BillingMeterBatchRecord[]> {
    const now = new Date(input.now);
    const limit = Math.max(1, Math.min(input.limit, 25));
    return runWithBillingWorkerScope(this.database, async (tx) => {
      const rows = await tx
        .select()
        .from(billingMeterBatches)
        .where(
          and(
            or(eq(billingMeterBatches.status, 'pending'), eq(billingMeterBatches.status, 'failed')),
            lt(billingMeterBatches.attemptCount, BILLING_METER_MAX_ATTEMPTS),
            lte(billingMeterBatches.nextAttemptAt, now),
            or(
              isNull(billingMeterBatches.leaseExpiresAt),
              lte(billingMeterBatches.leaseExpiresAt, now),
            ),
          ),
        )
        .orderBy(asc(billingMeterBatches.nextAttemptAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      const claimed: BillingMeterBatchRecord[] = [];
      for (const row of rows) {
        const [updated] = await tx
          .update(billingMeterBatches)
          .set({
            status: 'submitting',
            attemptCount: row.attemptCount + 1,
            leaseWorkerId: input.workerId,
            leaseExpiresAt: new Date(now.getTime() + BILLING_METER_LEASE_MS),
            errorCode: null,
            updatedAt: now,
          })
          .where(eq(billingMeterBatches.id, row.id))
          .returning();
        if (updated) claimed.push(toBillingMeterBatch(updated));
      }
      return claimed;
    });
  }

  async completeBillingMeterBatch(
    input: CompleteBillingMeterBatchInput,
  ): Promise<BillingMeterBatchRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(billingMeterBatches)
        .where(
          and(
            eq(billingMeterBatches.workspaceId, input.workspaceId),
            eq(billingMeterBatches.id, input.batchId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current || current.status !== 'submitting' || current.leaseWorkerId !== input.workerId) {
        return null;
      }
      const reconciled = billingMeterItemsMatch(current.items, input.reportedItems);
      const completedAt = new Date(input.completedAt);
      const [updated] = await tx
        .update(billingMeterBatches)
        .set({
          status: reconciled ? 'reconciled' : 'failed',
          providerSubmissionId: input.providerSubmissionId,
          errorCode: reconciled ? null : 'quantity_mismatch',
          attemptCount: reconciled ? current.attemptCount : BILLING_METER_MAX_ATTEMPTS,
          leaseWorkerId: null,
          leaseExpiresAt: null,
          reconciledAt: reconciled ? completedAt : null,
          nextAttemptAt: completedAt,
          updatedAt: completedAt,
        })
        .where(eq(billingMeterBatches.id, current.id))
        .returning();
      return updated ? toBillingMeterBatch(updated) : null;
    });
  }

  async resetBillingMeterBatch(input: {
    workspaceId: string;
    batchId: string;
    actorUserId: string;
    resetAt: string;
  }): Promise<BillingMeterBatchRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const resetAt = new Date(input.resetAt);
      const [updated] = await tx
        .update(billingMeterBatches)
        .set({
          status: 'pending',
          errorCode: null,
          attemptCount: 0,
          leaseWorkerId: null,
          leaseExpiresAt: null,
          nextAttemptAt: resetAt,
          updatedAt: resetAt,
        })
        .where(
          and(
            eq(billingMeterBatches.workspaceId, input.workspaceId),
            eq(billingMeterBatches.id, input.batchId),
            eq(billingMeterBatches.status, 'failed'),
          ),
        )
        .returning();
      return updated ? toBillingMeterBatch(updated) : null;
    });
  }

  async failBillingMeterBatch(
    input: FailBillingMeterBatchInput,
  ): Promise<BillingMeterBatchRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(billingMeterBatches)
        .where(
          and(
            eq(billingMeterBatches.workspaceId, input.workspaceId),
            eq(billingMeterBatches.id, input.batchId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current || current.status !== 'submitting' || current.leaseWorkerId !== input.workerId) {
        return null;
      }
      const failedAt = new Date(input.failedAt);
      const retryDelayMs = billingMeterRetryDelayMs(current.id, current.attemptCount);
      const [updated] = await tx
        .update(billingMeterBatches)
        .set({
          status: 'failed',
          errorCode: input.errorCode,
          leaseWorkerId: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(failedAt.getTime() + retryDelayMs),
          updatedAt: failedAt,
        })
        .where(eq(billingMeterBatches.id, current.id))
        .returning();
      return updated ? toBillingMeterBatch(updated) : null;
    });
  }
}

async function applyBillingSubscription(
  tx: LodariqTransaction,
  input: NormalizedBillingProviderEvent,
): Promise<void> {
  if (!input.subscription) return;
  const [current] = await tx
    .select()
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.workspaceId, input.workspaceId))
    .limit(1)
    .for('update');
  if (!current) throw new Error('Workspace subscription could not be resolved');
  const changedAt = new Date(input.processedAt);
  if (current.planId === input.subscription.planId) {
    await tx
      .update(workspaceSubscriptions)
      .set({
        status: input.subscription.status,
        currentPeriodStart: new Date(input.subscription.currentPeriodStart),
        currentPeriodEnd: new Date(input.subscription.currentPeriodEnd),
        updatedAt: changedAt,
      })
      .where(eq(workspaceSubscriptions.workspaceId, input.workspaceId));
    return;
  }
  const revision = current.revision + 1;
  await tx
    .update(workspaceSubscriptions)
    .set({
      planId: input.subscription.planId,
      planVersion: COMMERCIAL_PLAN_VERSION,
      status: input.subscription.status,
      currentPeriodStart: new Date(input.subscription.currentPeriodStart),
      currentPeriodEnd: new Date(input.subscription.currentPeriodEnd),
      revision,
      updatedAt: changedAt,
    })
    .where(eq(workspaceSubscriptions.workspaceId, input.workspaceId));
  const entitlements = resolveCommercialEntitlements(
    input.subscription.planId,
    current.entitlementOverrides,
  );
  await tx.insert(effectiveEntitlementSnapshots).values({
    id: `entsnap_${randomUUID()}`,
    workspaceId: input.workspaceId,
    subscriptionRevision: revision,
    planId: input.subscription.planId,
    planVersion: COMMERCIAL_PLAN_VERSION,
    entitlements,
    entitlementHash: entitlementHash(entitlements),
    reason: 'plan_changed',
    changeActorId: `system:billing:${input.provider}`,
    effectiveFrom: changedAt,
    createdAt: changedAt,
  });
}

async function applyBillingInvoice(
  tx: LodariqTransaction,
  input: NormalizedBillingProviderEvent,
): Promise<void> {
  const invoice = input.invoice;
  if (!invoice) return;
  const [existing] = await tx
    .select()
    .from(billingInvoices)
    .where(
      and(
        eq(billingInvoices.provider, input.provider),
        eq(billingInvoices.providerInvoiceId, invoice.providerInvoiceId),
      ),
    )
    .limit(1)
    .for('update');
  if (existing && existing.providerUpdatedAt.getTime() > Date.parse(invoice.providerUpdatedAt)) {
    return;
  }
  const values = {
    workspaceId: input.workspaceId,
    provider: input.provider,
    providerInvoiceId: invoice.providerInvoiceId,
    status: invoice.status,
    currency: invoice.currency,
    amountDueMinor: invoice.amountDueMinor,
    amountPaidMinor: invoice.amountPaidMinor,
    issuedAt: new Date(invoice.issuedAt),
    dueAt: invoice.dueAt ? new Date(invoice.dueAt) : null,
    paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl ?? null,
    providerUpdatedAt: new Date(invoice.providerUpdatedAt),
  };
  if (existing) {
    if (existing.workspaceId !== input.workspaceId) {
      throw new Error('Billing invoice workspace conflict');
    }
    await tx.update(billingInvoices).set(values).where(eq(billingInvoices.id, existing.id));
    return;
  }
  await tx.insert(billingInvoices).values({ id: invoice.id, ...values });
}

function toBillingMeterBatch(
  row: typeof billingMeterBatches.$inferSelect,
): BillingMeterBatchRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    meterVersion: BILLING_METER_VERSION,
    periodStart: toIsoString(row.periodStart),
    periodEnd: toIsoString(row.periodEnd),
    items: structuredClone(row.items),
    itemsHash: row.itemsHash,
    status: row.status,
    attemptCount: row.attemptCount,
    nextAttemptAt: toIsoString(row.nextAttemptAt),
    ...(row.leaseWorkerId ? { leaseWorkerId: row.leaseWorkerId } : {}),
    ...(row.leaseExpiresAt ? { leaseExpiresAt: toIsoString(row.leaseExpiresAt) } : {}),
    ...(row.providerSubmissionId ? { providerSubmissionId: row.providerSubmissionId } : {}),
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.reconciledAt ? { reconciledAt: toIsoString(row.reconciledAt) } : {}),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toPublicInvoice(row: typeof billingInvoices.$inferSelect): BillingInvoice {
  return {
    id: row.id,
    status: row.status,
    currency: row.currency,
    amountDueMinor: row.amountDueMinor,
    amountPaidMinor: row.amountPaidMinor,
    issuedAt: toIsoString(row.issuedAt),
    ...(row.dueAt ? { dueAt: toIsoString(row.dueAt) } : {}),
    ...(row.paidAt ? { paidAt: toIsoString(row.paidAt) } : {}),
    ...(row.hostedInvoiceUrl ? { hostedInvoiceUrl: row.hostedInvoiceUrl } : {}),
  };
}

function usageDedupeHash(workspaceId: string, scopeKey: string, value: string): string {
  return `sha256-${createHash('sha256')
    .update(`${workspaceId}\0${scopeKey}\0${value}`)
    .digest('hex')}`;
}

function toEntitlementSnapshot(
  row: typeof effectiveEntitlementSnapshots.$inferSelect,
): WorkspaceEntitlementSnapshotRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    subscriptionRevision: row.subscriptionRevision,
    planId: row.planId,
    planVersion: row.planVersion,
    entitlements: structuredClone(row.entitlements),
    entitlementHash: row.entitlementHash,
    reason: row.reason as WorkspaceEntitlementSnapshotRecord['reason'],
    changeActorId: row.changeActorId,
    effectiveFrom: toIsoString(row.effectiveFrom),
    createdAt: toIsoString(row.createdAt),
  };
}

function toAiCreditRecord(row: typeof aiCreditLedger.$inferSelect): AiCreditLedgerRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    operationId: row.operationId,
    provider: row.provider,
    meterVersion: row.meterVersion,
    usageUnit: row.usageUnit as AiCreditLedgerRecord['usageUnit'],
    inputUnits: row.inputUnits,
    outputUnits: row.outputUnits,
    providerCostMicros: row.providerCostMicros,
    creditsDebited: row.creditsDebited,
    periodStart: toIsoString(row.periodStart),
    periodEnd: toIsoString(row.periodEnd),
    createdAt: toIsoString(row.createdAt),
  };
}

function aiDebitMatches(
  row: typeof aiCreditLedger.$inferSelect,
  input: DebitAiCreditsInput,
): boolean {
  return (
    row.provider === input.provider &&
    row.meterVersion === input.meterVersion &&
    row.usageUnit === input.usageUnit &&
    row.inputUnits === input.inputUnits &&
    row.outputUnits === input.outputUnits &&
    row.providerCostMicros === input.providerCostMicros &&
    row.creditsDebited === input.credits
  );
}
