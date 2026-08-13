import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthEmailDeliveryError,
  AuthEmailOutboxWorker,
  authEmailIdempotencyKey,
  createResendAuthEmailSender,
  readAuthEmailDeliveryEnvironment,
  type AcknowledgeAuthEmailRowInput,
  type AuthEmailOutboxQueue,
  type ClaimedAuthEmailOutboxRow,
  type ClaimDueAuthEmailRowsInput,
  type RetryAuthEmailRowInput,
  type SendAuthEmailInput,
} from '@lodariq/api';

const NOW = new Date('2026-08-07T12:00:00.000Z');
const TOKEN_SECRET = 'auth-email-token-secret-at-least-32-bytes';
const RESEND_API_KEY = 're_auth_email_delivery_test_key';
const VERIFY_ROW: ClaimedAuthEmailOutboxRow = {
  id: 'outbox_verify_abcdefghijklmnopqrst',
  recipientEmail: 'creator@example.com',
  purpose: 'email_verification',
  challengeId: 'verify_abcdefghijklmnopqrstuvwxyz123456',
  attempt: 1,
  leaseVersion: 7,
};
const RESET_ROW: ClaimedAuthEmailOutboxRow = {
  id: 'outbox_reset_abcdefghijklmnopqrstuv',
  recipientEmail: 'legacy@example.com',
  purpose: 'set_password',
  challengeId: 'reset_abcdefghijklmnopqrstuvwxyz1234567',
  attempt: 1,
  leaseVersion: 11,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('@lodariq/api auth email outbox', () => {
  it('strictly reads disabled or complete Resend delivery configuration', () => {
    expect(readAuthEmailDeliveryEnvironment({ LODARIQ_EMAIL_DELIVERY_MODE: 'disabled' })).toEqual({
      mode: 'disabled',
    });

    expect(
      readAuthEmailDeliveryEnvironment({
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'https://app.lodariq.io/',
        LODARIQ_AUTH_EMAIL_FROM: 'Lodariq <auth@lodariq.io>',
        RESEND_API_KEY,
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: TOKEN_SECRET,
      }),
    ).toEqual({
      mode: 'resend',
      appBaseUrl: 'https://app.lodariq.io',
      from: 'Lodariq <auth@lodariq.io>',
      apiKey: RESEND_API_KEY,
      tokenSecret: TOKEN_SECRET,
    });

    expect(
      readAuthEmailDeliveryEnvironment({
        NODE_ENV: 'development',
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'http://localhost:3000',
        LODARIQ_AUTH_EMAIL_FROM: 'Lodariq Dev <auth@example.test>',
        RESEND_API_KEY,
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: TOKEN_SECRET,
      }),
    ).toMatchObject({ mode: 'resend', appBaseUrl: 'http://localhost:3000' });

    expect(() =>
      readAuthEmailDeliveryEnvironment({
        NODE_ENV: 'production',
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'http://localhost:3000',
        LODARIQ_AUTH_EMAIL_FROM: 'Lodariq <auth@lodariq.io>',
        RESEND_API_KEY,
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: TOKEN_SECRET,
      }),
    ).toThrow(/HTTPS origin/u);

    expect(() => readAuthEmailDeliveryEnvironment({})).toThrow(
      /LODARIQ_EMAIL_DELIVERY_MODE is required/u,
    );
    expect(() => readAuthEmailDeliveryEnvironment({ LODARIQ_EMAIL_DELIVERY_MODE: 'smtp' })).toThrow(
      /must be "disabled" or "resend"/u,
    );
    expect(() =>
      readAuthEmailDeliveryEnvironment({
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'http://app.lodariq.io',
        LODARIQ_AUTH_EMAIL_FROM: 'Lodariq <auth@lodariq.io>',
        RESEND_API_KEY,
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: TOKEN_SECRET,
      }),
    ).toThrow(/absolute HTTPS origin/u);
    expect(() =>
      readAuthEmailDeliveryEnvironment({
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'https://app.lodariq.io/path',
        LODARIQ_AUTH_EMAIL_FROM: 'Lodariq <auth@lodariq.io>',
        RESEND_API_KEY,
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: TOKEN_SECRET,
      }),
    ).toThrow(/absolute HTTPS origin/u);
    expect(() =>
      readAuthEmailDeliveryEnvironment({
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'https://app.lodariq.io',
        LODARIQ_AUTH_EMAIL_FROM: 'not-an-email',
        RESEND_API_KEY,
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: TOKEN_SECRET,
      }),
    ).toThrow(/valid sender address/u);
    expect(() =>
      readAuthEmailDeliveryEnvironment({
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'https://app.lodariq.io',
        LODARIQ_AUTH_EMAIL_FROM: 'auth@lodariq.io',
        RESEND_API_KEY,
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: 'too-short',
      }),
    ).toThrow(/between 32 and 256 bytes/u);
  });

  it('derives purpose-specific links in memory and persists only lease-safe outcomes', async () => {
    const queue = new FakeAuthEmailQueue([VERIFY_ROW, RESET_ROW]);
    const sends: SendAuthEmailInput[] = [];
    const worker = createWorker(queue, {
      async send(input) {
        sends.push(input);
      },
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 2,
      acknowledged: 2,
      retried: 0,
      terminal: 0,
      stale: 0,
    });

    expect(queue.claims).toEqual([
      {
        now: NOW.toISOString(),
        limit: 5,
        leaseDurationMs: 120_000,
      },
    ]);
    expect(queue.acknowledgements).toEqual([
      {
        id: VERIFY_ROW.id,
        purpose: VERIFY_ROW.purpose,
        leaseVersion: VERIFY_ROW.leaseVersion,
        processedAt: NOW.toISOString(),
      },
      {
        id: RESET_ROW.id,
        purpose: RESET_ROW.purpose,
        leaseVersion: RESET_ROW.leaseVersion,
        processedAt: NOW.toISOString(),
      },
    ]);
    expect(queue.retries).toEqual([]);

    const verifyMessage = sends[0]?.message;
    const resetMessage = sends[1]?.message;
    expect(verifyMessage?.subject).toBe('Verify your Lodariq email');
    expect(resetMessage?.subject).toBe('Set or reset your Lodariq password');

    const verifyUrl = messageUrl(verifyMessage?.text);
    const resetUrl = messageUrl(resetMessage?.text);
    expect(verifyUrl.pathname).toBe('/verify-email');
    expect(verifyUrl.searchParams.get('challenge')).toBe(VERIFY_ROW.challengeId);
    expect(verifyUrl.hash).toMatch(/^#token=lq_verify_[A-Za-z0-9_-]{43}$/u);
    expect(resetUrl.pathname).toBe('/reset-password');
    expect(resetUrl.searchParams.get('challenge')).toBe(RESET_ROW.challengeId);
    expect(resetUrl.hash).toMatch(/^#token=lq_reset_[A-Za-z0-9_-]{43}$/u);

    expect(JSON.stringify(sends)).not.toContain(TOKEN_SECRET);
    expect(JSON.stringify(queue.acknowledgements)).not.toMatch(/lq_(?:verify|reset)_/u);
    expect(JSON.stringify(queue.retries)).not.toMatch(/lq_(?:verify|reset)_/u);
  });

  it('retries transient failures with bounded exponential backoff and terminates exhausted rows', async () => {
    const transientRow = { ...VERIFY_ROW, attempt: 3, leaseVersion: 8 };
    const exhaustedRow = { ...RESET_ROW, attempt: 4, leaseVersion: 12 };
    const queue = new FakeAuthEmailQueue([transientRow, exhaustedRow]);
    const worker = createWorker(
      queue,
      {
        async send() {
          throw new AuthEmailDeliveryError('resend_http_503', { retryable: true });
        },
      },
      {
        maxAttempts: 4,
        baseRetryDelayMs: 1_000,
        retryJitterRatio: 0,
      },
    );

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 2,
      acknowledged: 0,
      retried: 1,
      terminal: 1,
      stale: 0,
    });
    expect(queue.retries).toEqual([
      {
        id: transientRow.id,
        purpose: transientRow.purpose,
        leaseVersion: transientRow.leaseVersion,
        failureCode: 'resend_http_503',
        availableAt: '2026-08-07T12:00:04.000Z',
        terminal: false,
      },
      {
        id: exhaustedRow.id,
        purpose: exhaustedRow.purpose,
        leaseVersion: exhaustedRow.leaseVersion,
        failureCode: 'resend_http_503',
        availableAt: null,
        terminal: true,
      },
    ]);
    expect(JSON.stringify(queue.retries)).not.toContain(TOKEN_SECRET);
    expect(JSON.stringify(queue.retries)).not.toMatch(/lq_(?:verify|reset)_/u);
  });

  it('rejects a challenge whose prefix does not match its outbox purpose', async () => {
    const queue = new FakeAuthEmailQueue([
      {
        ...RESET_ROW,
        challengeId: VERIFY_ROW.challengeId,
      },
    ]);
    const send = vi.fn(async (_input: SendAuthEmailInput) => undefined);
    const worker = createWorker(queue, { send });

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      acknowledged: 0,
      retried: 0,
      terminal: 1,
      stale: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(queue.retries).toEqual([
      {
        id: RESET_ROW.id,
        purpose: RESET_ROW.purpose,
        leaseVersion: RESET_ROW.leaseVersion,
        failureCode: 'invalid_outbox_claim',
        availableAt: null,
        terminal: true,
      },
    ]);
  });

  it('reduces arbitrary sender failures to a non-secret persisted code', async () => {
    const queue = new FakeAuthEmailQueue([VERIFY_ROW]);
    const worker = createWorker(queue, {
      async send() {
        throw new Error(`private transport detail ${TOKEN_SECRET}`);
      },
    });

    await expect(worker.runOnce()).resolves.toMatchObject({ retried: 1 });
    expect(queue.retries[0]).toMatchObject({
      failureCode: 'auth_email_sender_error',
      terminal: false,
    });
    expect(JSON.stringify(queue.retries)).not.toContain(TOKEN_SECRET);
  });

  it('sends the exact Resend fetch contract with a stable, bounded idempotency key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ id: 'resend_message_123' }),
    );
    const sender = createResendAuthEmailSender({
      apiKey: RESEND_API_KEY,
      from: 'Lodariq <auth@lodariq.io>',
      fetch,
    });
    const message = {
      to: 'creator@example.com',
      subject: 'Verify your Lodariq email',
      html: '<p>Private verification message</p>',
      text: 'Private verification message',
    };

    await sender.send({
      outboxId: VERIFY_ROW.id,
      message,
      signal: new AbortController().signal,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [input, init] = fetch.mock.calls[0] ?? [];
    expect(String(input)).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${RESEND_API_KEY}`);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toBe(authEmailIdempotencyKey(VERIFY_ROW.id));
    expect(headers.get('idempotency-key')?.length).toBeLessThanOrEqual(256);
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Lodariq <auth@lodariq.io>',
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    expect(String(init?.body)).not.toContain(RESEND_API_KEY);
  });

  it('classifies Resend throttling as retryable without exposing response or API secrets', async () => {
    const sender = createResendAuthEmailSender({
      apiKey: RESEND_API_KEY,
      from: 'auth@lodariq.io',
      fetch: vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          { name: 'rate_limit_exceeded', message: `private ${RESEND_API_KEY}` },
          { status: 429, headers: { 'retry-after': '7' } },
        ),
      ),
    });

    const failure = await sender
      .send({
        outboxId: VERIFY_ROW.id,
        message: {
          to: 'creator@example.com',
          subject: 'Verify',
          html: '<p>Verify</p>',
          text: 'Verify',
        },
        signal: new AbortController().signal,
      })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      code: 'resend_http_429',
      retryable: true,
      retryAfterMs: 7_000,
      message: 'Auth email delivery failed',
    });
    expect(String(failure)).not.toContain(RESEND_API_KEY);
  });

  it('classifies a forbidden sender without retaining the provider response', async () => {
    const privateProviderMessage = 'The dev.lodariq.io domain is not verified';
    const sender = createResendAuthEmailSender({
      apiKey: RESEND_API_KEY,
      from: 'auth@dev.lodariq.io',
      fetch: vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          { name: 'validation_error', message: privateProviderMessage },
          { status: 403 },
        ),
      ),
    });

    const failure = await sender
      .send({
        outboxId: VERIFY_ROW.id,
        message: {
          to: 'creator@example.com',
          subject: 'Verify',
          html: '<p>Verify</p>',
          text: 'Verify',
        },
        signal: new AbortController().signal,
      })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      code: 'resend_domain_not_verified',
      retryable: false,
      message: 'Auth email delivery failed',
    });
    expect(String(failure)).not.toContain(privateProviderMessage);
  });

  it('starts once, polls at the configured bound, and stops without leaving a timer', async () => {
    vi.useFakeTimers();
    const queue = new FakeAuthEmailQueue([]);
    const worker = createWorker(queue, { async send() {} }, { pollIntervalMs: 100 });

    worker.start();
    worker.start();
    expect(worker.running).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.claims).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(queue.claims).toHaveLength(2);

    await worker.stop();
    expect(worker.running).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queue.claims).toHaveLength(2);
    await expect(worker.stop()).resolves.toBeUndefined();
  });

  it('aborts an in-flight send and records a safe retry before stop resolves', async () => {
    const queue = new FakeAuthEmailQueue([VERIFY_ROW]);
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const worker = createWorker(queue, {
      send(input) {
        markStarted?.();
        return new Promise<void>((_resolve, reject) => {
          const abort = (): void =>
            reject(new AuthEmailDeliveryError('resend_aborted', { retryable: true }));
          if (input.signal.aborted) abort();
          else input.signal.addEventListener('abort', abort, { once: true });
        });
      },
    });

    worker.start();
    await started;
    await worker.stop();

    expect(worker.running).toBe(false);
    expect(queue.retries).toEqual([
      expect.objectContaining({
        id: VERIFY_ROW.id,
        failureCode: 'resend_aborted',
        terminal: false,
      }),
    ]);
  });
});

class FakeAuthEmailQueue implements AuthEmailOutboxQueue {
  readonly claims: ClaimDueAuthEmailRowsInput[] = [];
  readonly acknowledgements: AcknowledgeAuthEmailRowInput[] = [];
  readonly retries: RetryAuthEmailRowInput[] = [];
  #rows: readonly ClaimedAuthEmailOutboxRow[];

  constructor(rows: readonly ClaimedAuthEmailOutboxRow[]) {
    this.#rows = rows;
  }

  async claimDue(input: ClaimDueAuthEmailRowsInput) {
    this.claims.push(input);
    const rows = this.#rows;
    this.#rows = [];
    return rows;
  }

  async acknowledge(input: AcknowledgeAuthEmailRowInput) {
    this.acknowledgements.push(input);
    return true;
  }

  async retry(input: RetryAuthEmailRowInput) {
    this.retries.push(input);
    return true;
  }
}

function createWorker(
  queue: AuthEmailOutboxQueue,
  sender: { send(input: SendAuthEmailInput): Promise<void> },
  options: Partial<ConstructorParameters<typeof AuthEmailOutboxWorker>[0]> = {},
): AuthEmailOutboxWorker {
  return new AuthEmailOutboxWorker({
    queue,
    sender,
    appBaseUrl: 'https://app.lodariq.io',
    tokenSecret: TOKEN_SECRET,
    clock: () => new Date(NOW),
    random: () => 0.5,
    ...options,
  });
}

function messageUrl(text: string | undefined): URL {
  const value = text?.split('\n').find((line) => line.startsWith('https://'));
  if (!value) throw new Error('Expected an HTTPS URL in the email message');
  return new URL(value);
}
