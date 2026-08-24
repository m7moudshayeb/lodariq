import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  CommercialEntitlementOverrides,
  CommercialEntitlements,
  CommercialPlanId,
  CommercialUsageMetric,
} from '@lodariq/schema';
import type {
  BillingInvoiceStatus,
  BillingMeterBatchStatus,
  BillingMeterItem,
} from '@lodariq/schema/commercial-billing';
import { environments } from './environments';
import { workspaces } from './identity';
import { timestamps } from './shared';

export const workspaceSubscriptions = pgTable(
  'workspace_subscriptions',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    planId: text('plan_id').$type<CommercialPlanId>().notNull(),
    planVersion: text('plan_version').notNull(),
    status: text('status').notNull(),
    entitlementOverrides: jsonb('entitlement_overrides_json')
      .$type<CommercialEntitlementOverrides>()
      .notNull()
      .default({}),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check(
      'workspace_subscriptions_plan_check',
      sql`${table.planId} in ('free','starter','growth','scale','business','enterprise')`,
    ),
    check(
      'workspace_subscriptions_status_check',
      sql`${table.status} in ('active','past_due','canceled')`,
    ),
    check('workspace_subscriptions_revision_check', sql`${table.revision} >= 1`),
    check(
      'workspace_subscriptions_period_check',
      sql`${table.currentPeriodEnd} > ${table.currentPeriodStart}`,
    ),
    check(
      'workspace_subscriptions_overrides_check',
      sql`jsonb_typeof(${table.entitlementOverrides}) = 'object'`,
    ),
  ],
);

export const effectiveEntitlementSnapshots = pgTable(
  'effective_entitlement_snapshots',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    subscriptionRevision: integer('subscription_revision').notNull(),
    planId: text('plan_id').$type<CommercialPlanId>().notNull(),
    planVersion: text('plan_version').notNull(),
    entitlements: jsonb('entitlements_json').$type<CommercialEntitlements>().notNull(),
    entitlementHash: text('entitlement_hash').notNull(),
    reason: text('reason').notNull(),
    changeActorId: text('change_actor_id').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('effective_entitlement_snapshots_workspace_revision_idx').on(
      table.workspaceId,
      table.subscriptionRevision,
    ),
    index('effective_entitlement_snapshots_workspace_time_idx').on(
      table.workspaceId,
      table.effectiveFrom,
    ),
    check(
      'effective_entitlement_snapshots_revision_check',
      sql`${table.subscriptionRevision} >= 1`,
    ),
    check(
      'effective_entitlement_snapshots_hash_check',
      sql`${table.entitlementHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'effective_entitlement_snapshots_reason_check',
      sql`${table.reason} in ('migration','workspace_created','plan_changed','override_changed')`,
    ),
    check(
      'effective_entitlement_snapshots_json_check',
      sql`jsonb_typeof(${table.entitlements}) = 'object'`,
    ),
  ],
);

export const workspaceUsageLedger = pgTable(
  'workspace_usage_ledger',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id'),
    scopeKey: text('scope_key').notNull(),
    metric: text('metric').$type<CommercialUsageMetric>().notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    dedupeKeyHash: text('dedupe_key_hash').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_usage_ledger_dedupe_idx').on(
      table.workspaceId,
      table.scopeKey,
      table.metric,
      table.periodStart,
      table.dedupeKeyHash,
    ),
    index('workspace_usage_ledger_totals_idx').on(
      table.workspaceId,
      table.metric,
      table.periodStart,
    ),
    index('workspace_usage_ledger_environment_idx').on(
      table.workspaceId,
      table.environmentId,
      table.periodStart,
    ),
    foreignKey({
      name: 'workspace_usage_ledger_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    check(
      'workspace_usage_ledger_metric_check',
      sql`${table.metric} in ('engaged-users','live-experiences','creator-seats','applications','locales','environments','ai-credits','theme-generation-runs')`,
    ),
    check('workspace_usage_ledger_quantity_check', sql`${table.quantity} > 0`),
    check('workspace_usage_ledger_period_check', sql`${table.periodEnd} > ${table.periodStart}`),
    check(
      'workspace_usage_ledger_hash_check',
      sql`${table.dedupeKeyHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
  ],
);

export const aiCreditLedger = pgTable(
  'ai_credit_ledger',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    operationId: text('operation_id').notNull(),
    provider: text('provider').notNull(),
    meterVersion: text('meter_version').notNull(),
    usageUnit: text('usage_unit').notNull(),
    inputUnits: integer('input_units').notNull(),
    outputUnits: integer('output_units').notNull(),
    providerCostMicros: bigint('provider_cost_micros', { mode: 'number' }).notNull(),
    creditsDebited: integer('credits_debited').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_credit_ledger_workspace_operation_idx').on(
      table.workspaceId,
      table.operationId,
    ),
    index('ai_credit_ledger_period_idx').on(table.workspaceId, table.periodStart),
    check(
      'ai_credit_ledger_operation_check',
      sql`${table.operationId} ~ '^aiop_[A-Za-z0-9_-]{20,}$'`,
    ),
    check('ai_credit_ledger_provider_check', sql`char_length(${table.provider}) between 1 and 80`),
    check(
      'ai_credit_ledger_meter_version_check',
      sql`char_length(${table.meterVersion}) between 1 and 80`,
    ),
    check(
      'ai_credit_ledger_unit_check',
      sql`${table.usageUnit} in ('tokens','characters','seconds','images')`,
    ),
    check(
      'ai_credit_ledger_usage_check',
      sql`${table.inputUnits} >= 0 and ${table.outputUnits} >= 0 and ${table.providerCostMicros} >= 0 and ${table.creditsDebited} > 0`,
    ),
    check('ai_credit_ledger_period_check', sql`${table.periodEnd} > ${table.periodStart}`),
  ],
);

export const workspaceBillingAccounts = pgTable(
  'workspace_billing_accounts',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerCustomerId: text('provider_customer_id').notNull(),
    providerSubscriptionId: text('provider_subscription_id'),
    syncedThrough: timestamp('synced_through', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('workspace_billing_accounts_provider_customer_idx').on(
      table.provider,
      table.providerCustomerId,
    ),
    uniqueIndex('workspace_billing_accounts_provider_subscription_idx')
      .on(table.provider, table.providerSubscriptionId)
      .where(sql`${table.providerSubscriptionId} is not null`),
    check(
      'workspace_billing_accounts_provider_check',
      sql`char_length(${table.provider}) between 1 and 80`,
    ),
    check(
      'workspace_billing_accounts_customer_check',
      sql`char_length(${table.providerCustomerId}) between 1 and 256`,
    ),
  ],
);

export const billingProviderEvents = pgTable(
  'billing_provider_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    payloadHash: text('payload_hash').notNull(),
    providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('billing_provider_events_provider_event_idx').on(
      table.provider,
      table.providerEventId,
    ),
    index('billing_provider_events_workspace_time_idx').on(
      table.workspaceId,
      table.providerCreatedAt,
    ),
    check(
      'billing_provider_events_hash_check',
      sql`${table.payloadHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
  ],
);

export const billingInvoices = pgTable(
  'billing_invoices',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerInvoiceId: text('provider_invoice_id').notNull(),
    status: text('status').$type<BillingInvoiceStatus>().notNull(),
    currency: text('currency').notNull(),
    amountDueMinor: bigint('amount_due_minor', { mode: 'number' }).notNull(),
    amountPaidMinor: bigint('amount_paid_minor', { mode: 'number' }).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    hostedInvoiceUrl: text('hosted_invoice_url'),
    providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('billing_invoices_provider_invoice_idx').on(
      table.provider,
      table.providerInvoiceId,
    ),
    index('billing_invoices_workspace_issued_idx').on(table.workspaceId, table.issuedAt),
    check(
      'billing_invoices_status_check',
      sql`${table.status} in ('draft','open','paid','void','uncollectible')`,
    ),
    check('billing_invoices_currency_check', sql`${table.currency} ~ '^[a-z]{3}$'`),
    check(
      'billing_invoices_amount_check',
      sql`${table.amountDueMinor} >= 0 and ${table.amountPaidMinor} >= 0`,
    ),
  ],
);

export const billingMeterBatches = pgTable(
  'billing_meter_batches',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    meterVersion: text('meter_version').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    items: jsonb('items_json').$type<BillingMeterItem[]>().notNull(),
    itemsHash: text('items_hash').notNull(),
    status: text('status').$type<BillingMeterBatchStatus>().notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    leaseWorkerId: text('lease_worker_id'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    providerSubmissionId: text('provider_submission_id'),
    errorCode: text('error_code'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('billing_meter_batches_period_idx').on(
      table.workspaceId,
      table.provider,
      table.meterVersion,
      table.periodStart,
      table.periodEnd,
    ),
    index('billing_meter_batches_claim_idx').on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    check(
      'billing_meter_batches_status_check',
      sql`${table.status} in ('pending','submitting','reconciled','failed','dead')`,
    ),
    check('billing_meter_batches_period_check', sql`${table.periodEnd} > ${table.periodStart}`),
    check('billing_meter_batches_items_check', sql`jsonb_typeof(${table.items}) = 'array'`),
    check('billing_meter_batches_hash_check', sql`${table.itemsHash} ~ '^sha256-[0-9a-f]{64}$'`),
    check('billing_meter_batches_attempt_check', sql`${table.attemptCount} between 0 and 20`),
    check(
      'billing_meter_batches_lease_check',
      sql`(${table.leaseWorkerId} is null) = (${table.leaseExpiresAt} is null)`,
    ),
  ],
);
