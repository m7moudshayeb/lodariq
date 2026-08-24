import type { CommercialPlanId } from '@lodariq/schema';
import type { BillingMeterItem, BillingRedirectSession } from '@lodariq/schema/commercial-billing';
import type { BillingMeterBatchRecord, NormalizedBillingProviderEvent } from '@lodariq/database';

export interface BillingWebhookInput {
  provider: string;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  payload: unknown;
  /**
   * The exact bytes the provider signed.
   *
   * An HMAC is over a byte string, not over a parsed object: re-serializing
   * `payload` changes key order and whitespace, so the digest never matches.
   * An adapter forced to re-serialize either fails every event or is made
   * lenient — and a lenient signature check on an unauthenticated endpoint
   * accepts forged billing facts.
   */
  rawPayload: Uint8Array;
  receivedAt: string;
}

export interface BillingCheckoutSessionInput {
  workspaceId: string;
  userId: string;
  planId: CommercialPlanId;
  expectedSubscriptionRevision: number;
  returnUrl: string;
}

export interface BillingPortalSessionInput {
  workspaceId: string;
  userId: string;
  returnUrl: string;
  /**
   * The provider's own customer id. Every portal API authenticates the link
   * against it, and an adapter cannot derive it from `workspaceId` — the
   * mapping lives in `workspace_billing_accounts`, which providers cannot read.
   */
  providerCustomerId: string;
  providerSubscriptionId?: string;
}

export interface BillingUsageSubmissionInput {
  batch: BillingMeterBatchRecord;
  /**
   * Replay-stable, like the warehouse and residency providers already take. A
   * hung call outlives the batch lease, a second pod claims the same batch, and
   * without this the same usage is reported — and charged — twice.
   */
  idempotencyKey: string;
  /** Aborts before the lease expires, so a hung provider cannot cause the race. */
  signal: AbortSignal;
  /** Usage is billed against the provider's subscription, not the workspace. */
  providerCustomerId: string;
  providerSubscriptionId?: string;
}

export interface BillingUsageSubmissionResult {
  submissionId: string;
  /** Provider's authoritative echo/readback used for reconciliation. */
  reportedItems: readonly BillingMeterItem[];
}

/**
 * Provider boundary for billing. The adapter owns signature verification and
 * translates vendor payloads into Lodariq's versioned, provider-neutral facts.
 */
export interface CommercialBillingProvider {
  readonly id: string;
  verifyWebhook(input: BillingWebhookInput): Promise<NormalizedBillingProviderEvent>;
  createCheckoutSession(input: BillingCheckoutSessionInput): Promise<BillingRedirectSession>;
  createPortalSession(input: BillingPortalSessionInput): Promise<BillingRedirectSession>;
  submitUsage(input: BillingUsageSubmissionInput): Promise<BillingUsageSubmissionResult>;
}

export class BillingProviderVerificationError extends Error {
  readonly code = 'billing_provider_verification_failed';

  constructor() {
    super('Billing provider event could not be verified');
    this.name = 'BillingProviderVerificationError';
  }
}

export function assertBillingProviderId(provider: CommercialBillingProvider): void {
  if (!/^[a-z][a-z0-9-]{0,79}$/u.test(provider.id)) {
    throw new Error('Billing provider id must be a bounded lowercase identifier');
  }
}
