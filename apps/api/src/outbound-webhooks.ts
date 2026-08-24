import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { canonicalJson } from '@lodariq/compiler';
import { isPubliclyRoutableAddress, isSafeWebhookEndpointUrl } from '@lodariq/schema';
import {
  WEBHOOK_DELIVERY_RETENTION_DAYS,
  type ControlPlaneRepository,
  type LeasedWebhookDelivery,
} from '@lodariq/database';
import {
  Agent,
  buildConnector,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from 'undici';

const WEBHOOK_TIMEOUT_MS = 10_000;
/** Round trips either side of the request, which the timeout does not bound. */
const WEBHOOK_DELIVERY_SLACK_MS = 2_000;
const WEBHOOK_DELIVERY_BUDGET_MS = WEBHOOK_TIMEOUT_MS + WEBHOOK_DELIVERY_SLACK_MS;

export interface OutboundWebhookWorker {
  start(): void;
  runOnce(): Promise<number>;
  stop(): Promise<void>;
}

export interface OutboundWebhookWorkerOptions {
  repository: ControlPlaneRepository;
  signingKey: string;
  fetchImplementation?: typeof fetch;
  /** Injected like `fetch`, so the SSRF guard is exercised without a resolver. */
  lookupImplementation?: (
    hostname: string,
  ) => Promise<readonly { address: string; family?: number }[]>;
  clock?: () => Date;
  intervalMs?: number;
  workerId?: string;
  batchSize?: number;
}

export function createOutboundWebhookWorker(
  options: OutboundWebhookWorkerOptions,
): OutboundWebhookWorker {
  assertWebhookSigningKey(options.signingKey);
  const intervalMs = Math.max(250, options.intervalMs ?? 5_000);
  const workerId = options.workerId ?? `webhook_${randomUUID()}`;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 10, 100));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let active: Promise<number> | null = null;

  const runOnce = async (): Promise<number> => {
    const now = options.clock?.() ?? new Date();
    /*
     * The lease has to cover the whole batch, not one delivery. It was a flat
     * 30s while the batch was awaited serially at up to 10s each, so a full
     * batch outlived its own lease, a second worker re-leased the tail, and the
     * customer received it twice. Each delivery is hard-bounded by the abort
     * timeout, so the batch's worst case is arithmetic rather than a guess.
     */
    const leaseMs = batchSize * WEBHOOK_DELIVERY_BUDGET_MS;
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const deliveries = await options.repository.leaseWebhookDeliveries(
      workerId,
      now.toISOString(),
      leaseExpiresAt.toISOString(),
      batchSize,
    );
    for (const delivery of deliveries) {
      // Belt as well as braces: if this process was descheduled long enough to
      // eat the margin, the rest of the batch is left for the next lease rather
      // than delivered against one that has already lapsed.
      const remainingMs = leaseExpiresAt.getTime() - (options.clock?.() ?? new Date()).getTime();
      if (remainingMs < WEBHOOK_DELIVERY_BUDGET_MS) break;
      await deliverWebhook(options, delivery, now);
    }
    // After delivery, never before it: retention is housekeeping and has no
    // business sitting between a lease and the request it was taken for.
    await pruneFinishedDeliveries(options, now);
    return deliveries.length;
  };
  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
    timer.unref?.();
  };
  const run = (): void => {
    if (stopped || active) return;
    active = runOnce()
      .catch(() => 0)
      .finally(() => {
        active = null;
        schedule();
      });
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      run();
    },
    runOnce,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await active;
    },
  };
}

export function deriveWebhookSigningSecret(
  rootSigningKey: string,
  endpointId: string,
  secretVersion: number,
): string {
  assertWebhookSigningKey(rootSigningKey);
  const digest = createHmac('sha256', rootSigningKey)
    .update(`lodariq-webhook-secret:v${secretVersion}:${endpointId}`)
    .digest('base64url');
  return `whsec_${digest}`;
}

export function createWebhookSignature(
  signingSecret: string,
  timestampSeconds: number,
  body: string,
): string {
  const signature = createHmac('sha256', signingSecret)
    .update(`${timestampSeconds}.${body}`)
    .digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}

export function verifyWebhookSignature(
  signingSecret: string,
  signatureHeader: string,
  body: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  const parsed = /^t=(\d+),v1=([0-9a-f]{64})$/u.exec(signatureHeader);
  if (!parsed) return false;
  const timestamp = Number(parsed[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }
  const expected = createWebhookSignature(signingSecret, timestamp, body).slice(-64);
  const actual = parsed[2]!;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

async function deliverWebhook(
  options: OutboundWebhookWorkerOptions,
  leased: LeasedWebhookDelivery,
  leasedAt: Date,
): Promise<void> {
  const body = canonicalJson(leased.event);
  const timestampSeconds = Math.floor(leasedAt.getTime() / 1_000);
  const secret = deriveWebhookSigningSecret(
    options.signingKey,
    leased.endpoint.id,
    leased.endpoint.secretVersion,
  );
  /*
   * The stored URL was checked when the endpoint was created and never again,
   * so an endpoint whose host moved — or whose check predates a tightening of
   * the rules — was re-fetched unquestioned on every delivery. Re-ask both
   * questions here: the syntactic one, and the one only DNS can answer.
   */
  const resolution = await resolveSafeWebhookEndpoint(
    leased.endpoint.url,
    options.lookupImplementation ?? ((hostname) => lookup(hostname, { all: true })),
  );
  if (resolution.reason) {
    await failDelivery(
      options.repository,
      leased,
      (options.clock?.() ?? new Date()).toISOString(),
      null,
      resolution.reason,
    );
    return;
  }
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), WEBHOOK_TIMEOUT_MS);
  timeout.unref?.();
  const requestInit: RequestInit = {
    method: 'POST',
    redirect: 'manual',
    signal: abort.signal,
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Lodariq-Webhooks/1',
      'x-lodariq-delivery-id': leased.delivery.id,
      'x-lodariq-event-id': leased.event.id,
      'x-lodariq-event-type': leased.event.type,
      'x-lodariq-signature': createWebhookSignature(secret, timestampSeconds, body),
    },
    body,
  };
  /*
   * Structural, not `Response`. undici ships its own `Response` type, and the
   * two are only assignable to each other in packages whose `lib` happens to
   * line up — `apps/api` typechecked while `packages/tests` did not. Naming the
   * two members actually read here keeps both sides honest.
   */
  let response: { status: number; body?: { cancel(): Promise<void> } | null } | undefined;
  let dispatcher: Agent | undefined;
  try {
    if (options.fetchImplementation) {
      response = await options.fetchImplementation(leased.endpoint.url, requestInit);
    } else {
      dispatcher = createPinnedWebhookAgent(leased.endpoint.url, resolution.address);
      response = await undiciFetch(leased.endpoint.url, {
        method: requestInit.method,
        redirect: requestInit.redirect,
        signal: requestInit.signal,
        headers: requestInit.headers,
        body: requestInit.body,
        dispatcher,
      } as UndiciRequestInit);
    }
    const completedAt = (options.clock?.() ?? new Date()).toISOString();
    if (response.status >= 200 && response.status < 300) {
      await options.repository.completeWebhookDelivery({
        workspaceId: leased.delivery.workspaceId,
        deliveryId: leased.delivery.id,
        leaseOwner: leased.leaseOwner,
        completedAt,
        responseStatus: response.status,
      });
      return;
    }
    await failDelivery(
      options.repository,
      leased,
      completedAt,
      response.status,
      response.status >= 300 && response.status < 400 ? 'redirect_forbidden' : 'http_error',
    );
  } catch (error) {
    const failedAt = (options.clock?.() ?? new Date()).toISOString();
    const errorCode =
      error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network_error';
    await failDelivery(options.repository, leased, failedAt, null, errorCode);
  } finally {
    clearTimeout(timeout);
    const responseBody = response?.body;
    if (responseBody) await responseBody.cancel().catch(() => undefined);
    await dispatcher?.close().catch(() => undefined);
  }
}

async function failDelivery(
  repository: ControlPlaneRepository,
  leased: LeasedWebhookDelivery,
  failedAt: string,
  responseStatus: number | null,
  errorCode: string,
): Promise<void> {
  const failedAtMs = Date.parse(failedAt);
  const delayMs = retryDelayMs(leased.delivery.id, leased.delivery.attempts);
  await repository.failWebhookDelivery({
    workspaceId: leased.delivery.workspaceId,
    deliveryId: leased.delivery.id,
    leaseOwner: leased.leaseOwner,
    failedAt,
    responseStatus,
    errorCode,
    nextAvailableAt: new Date(failedAtMs + delayMs).toISOString(),
  });
}

export function retryDelayMs(deliveryId: string, attempts: number): number {
  const base = Math.min(15 * 60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
  const jitterSeed = createHmac('sha256', 'lodariq-webhook-jitter')
    .update(`${deliveryId}:${attempts}`)
    .digest()
    .readUInt16BE(0);
  return base + Math.floor((base * 0.2 * jitterSeed) / 65_535);
}

function assertWebhookSigningKey(value: string): void {
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('Outbound webhook signing key must contain at least 32 bytes');
  }
}


/**
 * The validated address is returned alongside the refusal reason so the actual
 * socket can be pinned to the address that passed the public-address check.
 *
 * DNS is asked at delivery time because the answer changes: an endpoint
 * registered on a public address can be re-pointed at link-local space before
 * the worker fires. This narrows that window to the gap between the lookup and
 * the connect — the undici connector below closes that gap.
 */
async function resolveSafeWebhookEndpoint(
  url: string,
  resolve: (
    hostname: string,
  ) => Promise<readonly { address: string; family?: number }[]>,
): Promise<{ reason: string | null; address: { address: string; family: number } }> {
  if (!isSafeWebhookEndpointUrl(url)) {
    return { reason: 'endpoint_forbidden', address: { address: '', family: 0 } };
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { reason: 'endpoint_forbidden', address: { address: '', family: 0 } };
  }
  const literal = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  // A literal address was already judged by the syntactic check.
  if (/^[\d.]+$/u.test(literal) || literal.includes(':')) {
    return { reason: null, address: { address: literal, family: isIP(literal) } };
  }
  try {
    const addresses = await resolve(hostname);
    if (addresses.length === 0) {
      return { reason: 'endpoint_unresolvable', address: { address: '', family: 0 } };
    }
    if (!addresses.every((entry) => isPubliclyRoutableAddress(entry.address))) {
      return { reason: 'endpoint_forbidden', address: { address: '', family: 0 } };
    }
    const first = addresses[0]!;
    return {
      reason: null,
      address: { address: first.address, family: first.family ?? isIP(first.address) },
    };
  } catch {
    return { reason: 'endpoint_unresolvable', address: { address: '', family: 0 } };
  }
}

function createPinnedWebhookAgent(url: string, address: { address: string; family: number }): Agent {
  const hostname = new URL(url).hostname.replace(/^\[|\]$/gu, '');
  const connector = buildConnector({});
  return new Agent({
    connections: 1,
    connect(options, callback) {
      connector(
        {
          ...options,
          hostname: address.address,
          ...(options.protocol === 'https:' ? { servername: hostname } : {}),
        },
        callback,
      );
    },
  });
}


/**
 * Retention, on the tick that already runs.
 *
 * A separate process for one bounded delete is more moving parts than the
 * problem deserves, and this one is naturally rate-limited: it removes at most
 * one batch per tick, so a table that has never been swept drains steadily
 * instead of in a single statement that locks out delivery.
 */
async function pruneFinishedDeliveries(
  options: OutboundWebhookWorkerOptions,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - WEBHOOK_DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  try {
    await options.repository.pruneWebhookDeliveries(cutoff.toISOString(), 500);
  } catch {
    /* Retention must never stop delivery; the next tick tries again. */
  }
}
