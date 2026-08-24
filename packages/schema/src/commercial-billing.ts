import { Type, type Static } from '@sinclair/typebox';
import {
  COMMERCIAL_PLAN_LABELS,
  COMMERCIAL_PLAN_VERSION,
  CommercialEntitlements,
  CommercialPlanId,
  CommercialUsageMetric,
  WorkspaceCommercialUsage,
} from './commercial-entitlements';

export const BILLING_CONTRACT_VERSION = '2026-08-22.1' as const;
export const BILLING_METER_VERSION = '2026-08-22.1' as const;

export const BILLING_SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled'] as const;
export const BillingSubscriptionStatus = Type.Union(
  BILLING_SUBSCRIPTION_STATUSES.map((status) => Type.Literal(status)),
  { $id: 'BillingSubscriptionStatus' },
);
export type BillingSubscriptionStatus = Static<typeof BillingSubscriptionStatus>;

export const BILLING_INVOICE_STATUSES = ['draft', 'open', 'paid', 'void', 'uncollectible'] as const;
export const BillingInvoiceStatus = Type.Union(
  BILLING_INVOICE_STATUSES.map((status) => Type.Literal(status)),
  { $id: 'BillingInvoiceStatus' },
);
export type BillingInvoiceStatus = Static<typeof BillingInvoiceStatus>;

export const BILLING_METER_BATCH_STATUSES = [
  'pending',
  'submitting',
  'reconciled',
  'failed',
  'dead',
] as const;
export const BillingMeterBatchStatus = Type.Union(
  BILLING_METER_BATCH_STATUSES.map((status) => Type.Literal(status)),
  { $id: 'BillingMeterBatchStatus' },
);
export type BillingMeterBatchStatus = Static<typeof BillingMeterBatchStatus>;

export const BillingSubscription = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    planId: Type.Ref(CommercialPlanId),
    planLabel: Type.Union(
      Object.values(COMMERCIAL_PLAN_LABELS).map((label) => Type.Literal(label)),
    ),
    planVersion: Type.String({ minLength: 1, maxLength: 80 }),
    status: Type.Ref(BillingSubscriptionStatus),
    currentPeriodStart: Type.String({ format: 'date-time' }),
    currentPeriodEnd: Type.String({ format: 'date-time' }),
    revision: Type.Integer({ minimum: 1 }),
    managedByProvider: Type.Boolean(),
  },
  { $id: 'BillingSubscription', additionalProperties: false },
);
export type BillingSubscription = Static<typeof BillingSubscription>;

export const BillingInvoice = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    status: Type.Ref(BillingInvoiceStatus),
    currency: Type.String({ pattern: '^[a-z]{3}$' }),
    amountDueMinor: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    amountPaidMinor: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    issuedAt: Type.String({ format: 'date-time' }),
    dueAt: Type.Optional(Type.String({ format: 'date-time' })),
    paidAt: Type.Optional(Type.String({ format: 'date-time' })),
    hostedInvoiceUrl: Type.Optional(Type.String({ format: 'uri', maxLength: 2_048 })),
  },
  { $id: 'BillingInvoice', additionalProperties: false },
);
export type BillingInvoice = Static<typeof BillingInvoice>;

export const BillingMeterItem = Type.Object(
  {
    metric: Type.Ref(CommercialUsageMetric),
    quantity: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  },
  { $id: 'BillingMeterItem', additionalProperties: false },
);
export type BillingMeterItem = Static<typeof BillingMeterItem>;

export const BillingMeterBatch = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    meterVersion: Type.Literal(BILLING_METER_VERSION),
    periodStart: Type.String({ format: 'date-time' }),
    periodEnd: Type.String({ format: 'date-time' }),
    items: Type.Array(Type.Ref(BillingMeterItem), { maxItems: 16 }),
    status: Type.Ref(BillingMeterBatchStatus),
    attemptCount: Type.Integer({ minimum: 0, maximum: 20 }),
    providerSubmissionId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    errorCode: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    createdAt: Type.String({ format: 'date-time' }),
    reconciledAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { $id: 'BillingMeterBatch', additionalProperties: false },
);
export type BillingMeterBatch = Static<typeof BillingMeterBatch>;

export const BillingOverview = Type.Object(
  {
    contractVersion: Type.Literal(BILLING_CONTRACT_VERSION),
    subscription: Type.Ref(BillingSubscription),
    entitlements: CommercialEntitlements,
    usage: WorkspaceCommercialUsage,
    invoices: Type.Array(Type.Ref(BillingInvoice), { maxItems: 24 }),
    metering: Type.Array(Type.Ref(BillingMeterBatch), { maxItems: 24 }),
  },
  { $id: 'BillingOverview', additionalProperties: false },
);
export type BillingOverview = Static<typeof BillingOverview>;

export const CreateBillingCheckoutSessionRequest = Type.Object(
  {
    planId: Type.Ref(CommercialPlanId),
    expectedSubscriptionRevision: Type.Integer({ minimum: 1 }),
    returnUrl: Type.String({ format: 'uri', maxLength: 2_048 }),
  },
  { $id: 'CreateBillingCheckoutSessionRequest', additionalProperties: false },
);
export type CreateBillingCheckoutSessionRequest = Static<
  typeof CreateBillingCheckoutSessionRequest
>;

export const CreateBillingPortalSessionRequest = Type.Object(
  { returnUrl: Type.String({ format: 'uri', maxLength: 2_048 }) },
  { $id: 'CreateBillingPortalSessionRequest', additionalProperties: false },
);
export type CreateBillingPortalSessionRequest = Static<typeof CreateBillingPortalSessionRequest>;

export const BillingRedirectSession = Type.Object(
  {
    url: Type.String({ format: 'uri', maxLength: 2_048 }),
    expiresAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'BillingRedirectSession', additionalProperties: false },
);
export type BillingRedirectSession = Static<typeof BillingRedirectSession>;

export const BillingProviderEventResult = Type.Object(
  {
    accepted: Type.Boolean(),
    duplicate: Type.Boolean(),
  },
  { $id: 'BillingProviderEventResult', additionalProperties: false },
);
export type BillingProviderEventResult = Static<typeof BillingProviderEventResult>;

export const COMMERCIAL_BILLING_REFERENCE_SCHEMAS = [
  BillingSubscriptionStatus,
  BillingInvoiceStatus,
  BillingMeterBatchStatus,
  BillingSubscription,
  BillingInvoice,
  BillingMeterItem,
  BillingMeterBatch,
] as const;

export const COMMERCIAL_BILLING_SCHEMAS = [
  BillingOverview,
  CreateBillingCheckoutSessionRequest,
  CreateBillingPortalSessionRequest,
  BillingRedirectSession,
  BillingProviderEventResult,
] as const;

/** Current plan snapshots emitted by this contract. */
export const BILLING_CURRENT_PLAN_VERSION = COMMERCIAL_PLAN_VERSION;
