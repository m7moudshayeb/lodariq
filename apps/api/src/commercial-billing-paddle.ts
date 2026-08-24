import { createHmac, timingSafeEqual } from 'node:crypto';
import { createHash } from 'node:crypto';
import {
  COMMERCIAL_PLAN_IDS,
  COMMERCIAL_USAGE_METRICS,
  type CommercialPlanId,
  type CommercialUsageMetric,
} from '@lodariq/schema';
import type { BillingMeterItem, BillingRedirectSession } from '@lodariq/schema/commercial-billing';
import type { NormalizedBillingProviderEvent } from '@lodariq/database';
import {
  BillingProviderVerificationError,
  type BillingCheckoutSessionInput,
  type BillingPortalSessionInput,
  type BillingUsageSubmissionInput,
  type BillingUsageSubmissionResult,
  type BillingWebhookInput,
  type CommercialBillingProvider,
} from './commercial-billing';

const PADDLE_PROVIDER_ID = 'paddle';
const DEFAULT_API_BASE_URL = 'https://api.paddle.com';
const SANDBOX_API_BASE_URL = 'https://sandbox-api.paddle.com';
const REQUEST_TIMEOUT_MS = 15_000;

/*
 * Paddle's own SDKs reject events older than five seconds. That is tight for a
 * queued redelivery, so it is configurable — but the default matches Paddle so
 * a deployment that never sets it behaves the way their docs describe.
 */
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 5;

/** Redirect URLs Paddle returns are short-lived; the contract needs an expiry. */
const REDIRECT_SESSION_TTL_MS = 60 * 60 * 1_000;

/**
 * A metered rate as Paddle needs it for a non-catalog line item.
 *
 * Catalog `price_id` would keep the rate in Paddle, but Paddle supports no
 * idempotency key anywhere and a catalog item carries nowhere to write one.
 * A non-catalog price does — `price.custom_data` — so the rate moves into
 * deployment config to buy a replay check that actually works.
 */
export interface PaddleUsageRate {
  productId: string;
  unitAmountMinor: number;
  currencyCode: string;
}

export interface PaddleBillingProviderOptions {
  apiKey: string;
  webhookSecret: string;
  apiBaseUrl?: string;
  /** Plan id to Paddle catalog price id. `free` never needs one. */
  planPriceIds: Readonly<Partial<Record<CommercialPlanId, string>>>;
  /** Usage metric to its Paddle product and rate. A metric with no rate is not billed. */
  usageRates: Readonly<Partial<Record<CommercialUsageMetric, PaddleUsageRate>>>;
  signatureToleranceSeconds?: number;
  fetchImplementation?: typeof fetch;
  clock?: () => Date;
}

/**
 * Paddle Billing adapter (ADR 0031).
 *
 * Fail-closed: returns `undefined` unless the provider is selected *and* both
 * credentials are present, so a half-configured deployment answers 503 rather
 * than starting to take money through a client it cannot verify.
 */
export function createPaddleBillingProviderFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): CommercialBillingProvider | undefined {
  if (environment.LODARIQ_BILLING_PROVIDER?.trim() !== PADDLE_PROVIDER_ID) return undefined;
  const apiKey = environment.LODARIQ_PADDLE_API_KEY?.trim();
  const webhookSecret = environment.LODARIQ_PADDLE_WEBHOOK_SECRET?.trim();
  if (!apiKey || !webhookSecret) return undefined;
  return createPaddleBillingProvider({
    apiKey,
    webhookSecret,
    apiBaseUrl: readApiBaseUrl(environment),
    planPriceIds: readPlanPriceIds(environment),
    usageRates: readUsageRates(environment),
    ...readSignatureTolerance(environment),
    fetchImplementation,
  });
}

export function createPaddleBillingProvider(
  options: PaddleBillingProviderOptions,
): CommercialBillingProvider {
  const fetcher = options.fetchImplementation ?? fetch;
  const clock = options.clock ?? (() => new Date());
  const baseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/u, '');
  const toleranceSeconds =
    options.signatureToleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS;

  const request = async (
    path: string,
    init: { method: string; body?: unknown; signal?: AbortSignal },
  ): Promise<Record<string, unknown>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    timeout.unref?.();
    const abortUpstream = () => controller.abort();
    init.signal?.addEventListener('abort', abortUpstream, { once: true });
    try {
      const response = await fetcher(`${baseUrl}${path}`, {
        method: init.method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
          'user-agent': 'lodariq-billing/1.0',
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      if (!response.ok) {
        // The body can carry customer identifiers, so only the status travels.
        throw new Error(`paddle_http_${response.status}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } finally {
      init.signal?.removeEventListener('abort', abortUpstream);
      clearTimeout(timeout);
    }
  };

  return {
    id: PADDLE_PROVIDER_ID,

    async verifyWebhook(input: BillingWebhookInput): Promise<NormalizedBillingProviderEvent> {
      const signature = parsePaddleSignature(input.headers['paddle-signature']);
      if (!signature) throw new BillingProviderVerificationError();
      if (!signatureMatches(signature, input.rawPayload, options.webhookSecret)) {
        throw new BillingProviderVerificationError();
      }
      const skewSeconds = Math.abs(clock().getTime() / 1_000 - signature.timestamp);
      if (skewSeconds > toleranceSeconds) throw new BillingProviderVerificationError();
      return normalizePaddleEvent(input, signature.timestamp);
    },

    async createCheckoutSession(
      input: BillingCheckoutSessionInput,
    ): Promise<BillingRedirectSession> {
      const priceId = options.planPriceIds[input.planId];
      if (!priceId) throw new Error(`paddle_price_not_configured_${input.planId}`);
      const payload = await request('/transactions', {
        method: 'POST',
        body: {
          items: [{ price_id: priceId, quantity: 1 }],
          checkout: { url: input.returnUrl },
          /*
           * Paddle echoes this back on every event for the resulting
           * subscription, which is how a verified event finds its workspace.
           */
          custom_data: {
            lodariq_workspace_id: input.workspaceId,
            lodariq_user_id: input.userId,
            lodariq_expected_subscription_revision: String(input.expectedSubscriptionRevision),
          },
        },
      });
      const url = readString(readObject(readObject(payload, 'data'), 'checkout'), 'url');
      if (!url) throw new Error('paddle_checkout_url_missing');
      return { url, expiresAt: expiryFrom(clock()) };
    },

    async createPortalSession(input: BillingPortalSessionInput): Promise<BillingRedirectSession> {
      const payload = await request(
        `/customers/${encodeURIComponent(input.providerCustomerId)}/portal-sessions`,
        {
          method: 'POST',
          body: input.providerSubscriptionId
            ? { subscription_ids: [input.providerSubscriptionId] }
            : {},
        },
      );
      const urls = readObject(readObject(payload, 'data'), 'urls');
      const url = readString(readObject(urls, 'general'), 'overview');
      if (!url) throw new Error('paddle_portal_url_missing');
      return { url, expiresAt: expiryFrom(clock()) };
    },

    async submitUsage(input: BillingUsageSubmissionInput): Promise<BillingUsageSubmissionResult> {
      const subscriptionId = input.providerSubscriptionId;
      if (!subscriptionId) throw new Error('paddle_subscription_required_for_usage');
      const items = billableItems(input.batch.items, options.usageRates);
      if (items.length === 0) {
        // Nothing configured as billable. Complete the batch rather than retry forever.
        return {
          submissionId: `${PADDLE_PROVIDER_ID}:noop:${usageMarker(input.idempotencyKey)}`,
          reportedItems: [],
        };
      }

      /*
       * Paddle supports no idempotency key on any endpoint; their guidance is to
       * read back before retrying. A hung call whose lease expired is exactly the
       * case this interface warns about, so look for our marker before charging.
       */
      const marker = usageMarker(input.idempotencyKey);
      const existing = await findChargedTransaction(request, subscriptionId, marker, input.signal);
      if (existing) {
        return { submissionId: existing, reportedItems: reportedItemsFor(input.batch.items, items) };
      }

      await request(`/subscriptions/${encodeURIComponent(subscriptionId)}/charge`, {
        method: 'POST',
        signal: input.signal,
        body: {
          /*
           * Bills on the next renewal rather than immediately, so a duplicate is
           * still visible on an open transaction instead of an already-taken
           * payment.
           */
          effective_from: 'next_billing_period',
          items: items.map((item) => ({
            quantity: item.quantity,
            price: {
              product_id: item.rate.productId,
              description: usageLineDescription(item.metric, input.batch),
              unit_price: {
                amount: String(item.rate.unitAmountMinor),
                currency_code: item.rate.currencyCode,
              },
              custom_data: { lodariq_usage_marker: marker },
            },
          })),
        },
      });

      /*
       * The charge response deliberately omits the billed items, so the
       * transaction id comes from the same read the replay check uses.
       */
      const submissionId =
        (await findChargedTransaction(request, subscriptionId, marker, input.signal)) ??
        `${PADDLE_PROVIDER_ID}:${marker}`;
      return { submissionId, reportedItems: reportedItemsFor(input.batch.items, items) };
    },
  };
}

interface BillablePaddleItem {
  metric: CommercialUsageMetric;
  rate: PaddleUsageRate;
  quantity: number;
}

function billableItems(
  items: readonly BillingMeterItem[],
  usageRates: Readonly<Partial<Record<CommercialUsageMetric, PaddleUsageRate>>>,
): BillablePaddleItem[] {
  const billable: BillablePaddleItem[] = [];
  for (const item of items) {
    const rate = usageRates[item.metric];
    // Paddle rejects a zero quantity, and a zero-usage metric costs nothing.
    if (!rate || item.quantity <= 0) continue;
    billable.push({ metric: item.metric, rate, quantity: item.quantity });
  }
  return billable;
}

/** Customer-visible: names the metric and the closed period, never an internal id. */
function usageLineDescription(
  metric: CommercialUsageMetric,
  batch: { periodStart: string; periodEnd: string },
): string {
  const start = batch.periodStart.slice(0, 10);
  const end = batch.periodEnd.slice(0, 10);
  return `Metered usage: ${metric} (${start} to ${end})`;
}

/** Echo only what was actually submitted, so reconciliation compares like with like. */
function reportedItemsFor(
  items: readonly BillingMeterItem[],
  billable: readonly BillablePaddleItem[],
): BillingMeterItem[] {
  const submitted = new Set(billable.map((item) => item.metric));
  return items.filter((item) => submitted.has(item.metric)).map((item) => ({ ...item }));
}

function usageMarker(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32);
}

/**
 * Looks for a transaction already carrying this batch's marker.
 *
 * Best effort by design: if the listing shape ever changes, this returns null
 * and the caller charges. That is the same risk Paddle's own retry guidance
 * carries, and it is bounded by the batch lease.
 */
async function findChargedTransaction(
  request: (
    path: string,
    init: { method: string; body?: unknown; signal?: AbortSignal },
  ) => Promise<Record<string, unknown>>,
  subscriptionId: string,
  marker: string,
  signal: AbortSignal,
): Promise<string | null> {
  const payload = await request(
    `/transactions?subscription_id=${encodeURIComponent(subscriptionId)}&per_page=50`,
    { method: 'GET', signal },
  );
  const data = payload.data;
  if (!Array.isArray(data)) return null;
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (!carriesMarker(record, marker)) continue;
    const id = record.id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/**
 * The marker is written to `price.custom_data` on each charged line item.
 * Transaction-level `custom_data` is checked too, because Paddle sets it on
 * transactions created through checkout and it costs nothing to look.
 */
function carriesMarker(transaction: Record<string, unknown>, marker: string): boolean {
  if (readString(readObject(transaction, 'custom_data'), 'lodariq_usage_marker') === marker) {
    return true;
  }
  const items = transaction.items;
  if (!Array.isArray(items)) return false;
  return items.some((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const price = readObject(item as Record<string, unknown>, 'price');
    return readString(readObject(price, 'custom_data'), 'lodariq_usage_marker') === marker;
  });
}

interface PaddleSignature {
  timestamp: number;
  digest: string;
}

/** `ts=1671552777;h1=<hex>` — anything else is not a Paddle signature. */
function parsePaddleSignature(
  header: string | readonly string[] | undefined,
): PaddleSignature | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') return null;
  let timestamp: number | null = null;
  let digest: string | null = null;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 'ts' && /^\d{1,15}$/u.test(value)) timestamp = Number(value);
    if (key === 'h1' && /^[0-9a-f]{64}$/u.test(value)) digest = value;
  }
  return timestamp !== null && digest !== null ? { timestamp, digest } : null;
}

function signatureMatches(
  signature: PaddleSignature,
  rawPayload: Uint8Array,
  secret: string,
): boolean {
  /*
   * `ts:rawBody` over the exact received bytes. Re-serializing the parsed body
   * changes key order and whitespace, and the digest never matches.
   */
  const expected = createHmac('sha256', secret)
    .update(`${signature.timestamp}:`)
    .update(rawPayload)
    .digest();
  const actual = Buffer.from(signature.digest, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizePaddleEvent(
  input: BillingWebhookInput,
  signedAtSeconds: number,
): NormalizedBillingProviderEvent {
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  const data = readObject(payload, 'data');
  const custom = readObject(data, 'custom_data');
  const workspaceId = readString(custom, 'lodariq_workspace_id');
  if (!workspaceId) throw new BillingProviderVerificationError();

  const eventType = readString(payload, 'event_type') ?? '';
  const providerEventId = readString(payload, 'event_id');
  const providerCustomerId = readString(data, 'customer_id');
  if (!providerEventId || !providerCustomerId) throw new BillingProviderVerificationError();

  const providerCreatedAt =
    readString(payload, 'occurred_at') ?? new Date(signedAtSeconds * 1_000).toISOString();
  const subscription = subscriptionFacts(eventType, data);
  const invoice = invoiceFacts(eventType, data);

  return {
    workspaceId,
    provider: PADDLE_PROVIDER_ID,
    providerEventId,
    eventType,
    payloadHash: `sha256-${createHash('sha256').update(input.rawPayload).digest('hex')}`,
    providerCreatedAt,
    providerCustomerId,
    ...(subscriptionIdFor(eventType, data)
      ? { providerSubscriptionId: subscriptionIdFor(eventType, data) as string }
      : {}),
    ...(subscription ? { subscription } : {}),
    ...(invoice ? { invoice } : {}),
    processedAt: input.receivedAt,
  };
}

function subscriptionIdFor(eventType: string, data: Record<string, unknown>): string | undefined {
  if (eventType.startsWith('subscription.')) return readString(data, 'id') ?? undefined;
  return readString(data, 'subscription_id') ?? undefined;
}

function subscriptionFacts(
  eventType: string,
  data: Record<string, unknown>,
): NormalizedBillingProviderEvent['subscription'] {
  if (!eventType.startsWith('subscription.')) return undefined;
  const planId = readString(readObject(data, 'custom_data'), 'lodariq_plan_id');
  const status = mapSubscriptionStatus(readString(data, 'status'));
  const period = readObject(data, 'current_billing_period');
  const start = readString(period, 'starts_at');
  const end = readString(period, 'ends_at');
  if (!planId || !isPlanId(planId) || !status || !start || !end) return undefined;
  return { planId, status, currentPeriodStart: start, currentPeriodEnd: end };
}

function mapSubscriptionStatus(
  status: string | null,
): 'active' | 'past_due' | 'canceled' | undefined {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    // A paused subscription grants nothing, which is what `canceled` means here.
    case 'canceled':
    case 'paused':
      return 'canceled';
    default:
      return undefined;
  }
}

function invoiceFacts(
  eventType: string,
  data: Record<string, unknown>,
): NormalizedBillingProviderEvent['invoice'] {
  if (!eventType.startsWith('transaction.')) return undefined;
  const id = readString(data, 'id');
  const details = readObject(data, 'details');
  const totals = readObject(details, 'totals');
  const currency = readString(data, 'currency_code');
  const total = readMinorAmount(totals, 'total');
  if (!id || !currency || total === null) return undefined;
  const paid = eventType === 'transaction.completed';
  const billedAt = readString(data, 'billed_at') ?? readString(data, 'created_at');
  return {
    id,
    providerInvoiceId: id,
    status: paid ? 'paid' : 'open',
    currency: currency.toLowerCase(),
    amountDueMinor: total,
    amountPaidMinor: paid ? total : 0,
    issuedAt: billedAt ?? new Date(0).toISOString(),
    ...(paid && billedAt ? { paidAt: billedAt } : {}),
    providerUpdatedAt: readString(data, 'updated_at') ?? billedAt ?? new Date(0).toISOString(),
  };
}

function readApiBaseUrl(environment: NodeJS.ProcessEnv): string {
  const configured = environment.LODARIQ_PADDLE_API_BASE_URL?.trim();
  if (configured) return configured;
  return environment.LODARIQ_PADDLE_SANDBOX?.trim() === '1'
    ? SANDBOX_API_BASE_URL
    : DEFAULT_API_BASE_URL;
}

function readSignatureTolerance(
  environment: NodeJS.ProcessEnv,
): { signatureToleranceSeconds?: number } {
  const raw = environment.LODARIQ_PADDLE_SIGNATURE_TOLERANCE_SECONDS?.trim();
  if (!raw || !/^\d{1,4}$/u.test(raw)) return {};
  return { signatureToleranceSeconds: Number(raw) };
}

function readPlanPriceIds(
  environment: NodeJS.ProcessEnv,
): Partial<Record<CommercialPlanId, string>> {
  const mapping: Partial<Record<CommercialPlanId, string>> = {};
  for (const plan of COMMERCIAL_PLAN_IDS) {
    const value = environment[`LODARIQ_PADDLE_PRICE_${envSuffix(plan)}`]?.trim();
    if (value) mapping[plan] = value;
  }
  return mapping;
}

/** `LODARIQ_PADDLE_USAGE_RATE_<METRIC>` as `<product_id>:<minor amount>:<currency>`. */
function readUsageRates(
  environment: NodeJS.ProcessEnv,
): Partial<Record<CommercialUsageMetric, PaddleUsageRate>> {
  const mapping: Partial<Record<CommercialUsageMetric, PaddleUsageRate>> = {};
  for (const metric of COMMERCIAL_USAGE_METRICS) {
    const raw = environment[`LODARIQ_PADDLE_USAGE_RATE_${envSuffix(metric)}`]?.trim();
    const rate = raw ? parseUsageRate(raw) : null;
    if (rate) mapping[metric] = rate;
  }
  return mapping;
}

function parseUsageRate(raw: string): PaddleUsageRate | null {
  const [productId, amount, currencyCode] = raw.split(':');
  if (!productId || !amount || !currencyCode) return null;
  if (!/^\d{1,15}$/u.test(amount) || !/^[A-Z]{3}$/u.test(currencyCode)) return null;
  return { productId, unitAmountMinor: Number(amount), currencyCode };
}

function envSuffix(value: string): string {
  return value.replace(/-/gu, '_').toUpperCase();
}

function isPlanId(value: string): value is CommercialPlanId {
  return (COMMERCIAL_PLAN_IDS as readonly string[]).includes(value);
}

function expiryFrom(now: Date): string {
  return new Date(now.getTime() + REDIRECT_SESSION_TTL_MS).toISOString();
}

function readObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Paddle sends minor units as decimal strings. */
function readMinorAmount(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^\d{1,15}$/u.test(value)) return null;
  return Number(value);
}
