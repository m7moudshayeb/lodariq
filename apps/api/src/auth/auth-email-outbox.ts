import { createHash } from 'node:crypto';
import type { ObservabilitySink } from '../observability';
import {
  formatEmailVerificationUrl,
  formatAccountEmailChangeUrl,
  formatPasswordResetUrl,
  formatWorkspaceInvitationUrl,
} from './email-verification';
import {
  createEmailVerificationToken,
  createAccountEmailChangeToken,
  createPasswordResetToken,
  createWorkspaceInvitationToken,
} from './owned-auth-crypto';

export const AUTH_EMAIL_DELIVERY_MODES = ['disabled', 'resend'] as const;
export const AUTH_EMAIL_OBSERVABILITY_EVENTS = Object.freeze({
  outboxClaimed: 'auth.email.outbox_claimed',
  providerAccepted: 'auth.email.provider_accepted',
  leaseStale: 'auth.email.lease_stale',
  retryScheduled: 'auth.email.delivery_retry_scheduled',
  deliveryTerminal: 'auth.email.delivery_terminal',
});
export const AUTH_EMAIL_ENV = Object.freeze({
  mode: 'LODARIQ_EMAIL_DELIVERY_MODE',
  appBaseUrl: 'LODARIQ_APP_BASE_URL',
  from: 'LODARIQ_AUTH_EMAIL_FROM',
  resendApiKey: 'RESEND_API_KEY',
  tokenSecret: 'LODARIQ_AUTH_EMAIL_TOKEN_SECRET',
  tokenKeys: 'LODARIQ_AUTH_EMAIL_TOKEN_KEYS',
  activeTokenKeyId: 'LODARIQ_AUTH_EMAIL_TOKEN_ACTIVE_KEY_ID',
});

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 25;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_LEASE_DURATION_MS = 2 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RETRY_JITTER_RATIO = 0.2;
const DEFAULT_RESEND_TIMEOUT_MS = 10_000;
const MAX_RESEND_TIMEOUT_MS = 60_000;
const OUTBOX_ID_PATTERN = /^outbox_[A-Za-z0-9_-]{20,200}$/u;
const VERIFICATION_CHALLENGE_ID_PATTERN = /^verify_[A-Za-z0-9_-]{20,249}$/u;
const SET_PASSWORD_CHALLENGE_ID_PATTERN = /^reset_[A-Za-z0-9_-]{20,250}$/u;
const WORKSPACE_INVITATION_ID_PATTERN = /^invite_[A-Za-z0-9_-]{20,249}$/u;
const ACCOUNT_EMAIL_CHANGE_ID_PATTERN = /^emailchange_[A-Za-z0-9_-]{20,249}$/u;
const EMAIL_ADDRESS_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;

export type AuthEmailDeliveryMode = (typeof AUTH_EMAIL_DELIVERY_MODES)[number];
export type AuthEmailPurpose =
  | 'email_verification'
  | 'set_password'
  | 'workspace_invitation'
  | 'account_email_change_current'
  | 'account_email_change_new';

export interface DisabledAuthEmailDeliveryConfig {
  mode: 'disabled';
}

export interface ResendAuthEmailDeliveryConfig {
  mode: 'resend';
  appBaseUrl: string;
  from: string;
  apiKey: string;
  activeTokenKeyId: string;
  tokenKeys: Readonly<Record<string, string>>;
}

export type AuthEmailDeliveryConfig =
  DisabledAuthEmailDeliveryConfig | ResendAuthEmailDeliveryConfig;

/**
 * A queue implementation must atomically lease due rows, increment `attempt`,
 * and return the new lease version. Mutations use that version as a CAS guard
 * so a stale worker cannot acknowledge or reschedule a newer lease.
 */
export interface ClaimedAuthEmailOutboxRow {
  id: string;
  recipientEmail: string;
  purpose: AuthEmailPurpose;
  challengeId: string;
  keyId: string;
  attempt: number;
  leaseVersion: number;
  createdAt: string;
}

export interface ClaimDueAuthEmailRowsInput {
  now: string;
  limit: number;
  leaseDurationMs: number;
}

export interface AcknowledgeAuthEmailRowInput {
  id: string;
  purpose: AuthEmailPurpose;
  leaseVersion: number;
  processedAt: string;
}

export interface RetryAuthEmailRowInput {
  id: string;
  purpose: AuthEmailPurpose;
  leaseVersion: number;
  failureCode: string;
  /** Null marks a permanent or attempt-exhausted delivery failure. */
  availableAt: string | null;
  terminal: boolean;
}

export interface AuthEmailOutboxQueue {
  claimDue(input: ClaimDueAuthEmailRowsInput): Promise<readonly ClaimedAuthEmailOutboxRow[]>;
  acknowledge(input: AcknowledgeAuthEmailRowInput): Promise<boolean>;
  retry(input: RetryAuthEmailRowInput): Promise<boolean>;
}

export interface AuthEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendAuthEmailInput {
  outboxId: string;
  message: AuthEmailMessage;
  signal: AbortSignal;
}

export interface AuthEmailSender {
  send(input: SendAuthEmailInput): Promise<void>;
}

export interface AuthEmailCycleResult {
  claimed: number;
  acknowledged: number;
  retried: number;
  terminal: number;
  stale: number;
}

export interface AuthEmailOutboxWorkerOptions {
  queue: AuthEmailOutboxQueue;
  sender: AuthEmailSender;
  appBaseUrl: string;
  /** Backward-compatible single-key input for tests and isolated development. */
  tokenSecret?: string;
  tokenKeys?: Readonly<Record<string, string>>;
  batchSize?: number;
  pollIntervalMs?: number;
  leaseDurationMs?: number;
  maxAttempts?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  retryJitterRatio?: number;
  clock?: () => Date;
  random?: () => number;
  observability?: ObservabilitySink;
}

export interface ResendAuthEmailSenderOptions {
  apiKey: string;
  from: string;
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
}

interface DeliveryFailure {
  code: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export class AuthEmailDeliveryError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(code: string, options: { retryable: boolean; retryAfterMs?: number }) {
    super('Auth email delivery failed');
    this.name = 'AuthEmailDeliveryError';
    this.code = code;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class AuthEmailOutboxWorker {
  readonly #queue: AuthEmailOutboxQueue;
  readonly #sender: AuthEmailSender;
  readonly #appBaseUrl: string;
  readonly #tokenKeys: Readonly<Record<string, string>>;
  readonly #batchSize: number;
  readonly #pollIntervalMs: number;
  readonly #leaseDurationMs: number;
  readonly #maxAttempts: number;
  readonly #baseRetryDelayMs: number;
  readonly #maxRetryDelayMs: number;
  readonly #retryJitterRatio: number;
  readonly #clock: () => Date;
  readonly #random: () => number;
  readonly #observability: ObservabilitySink | undefined;
  #running = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #activeCycle: Promise<AuthEmailCycleResult> | null = null;
  #activeAbortController: AbortController | null = null;

  constructor(options: AuthEmailOutboxWorkerOptions) {
    this.#queue = options.queue;
    this.#sender = options.sender;
    this.#appBaseUrl = normalizeAppBaseUrl(options.appBaseUrl, 'appBaseUrl');
    this.#tokenKeys = normalizeTokenKeyring(
      options.tokenKeys ?? { legacy: requireTokenSecret(options.tokenSecret ?? '', 'tokenSecret') },
      'tokenKeys',
    );
    this.#batchSize = boundedInteger(
      options.batchSize ?? DEFAULT_BATCH_SIZE,
      'batchSize',
      1,
      MAX_BATCH_SIZE,
    );
    this.#pollIntervalMs = boundedInteger(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      'pollIntervalMs',
      100,
      60_000,
    );
    this.#leaseDurationMs = boundedInteger(
      options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
      'leaseDurationMs',
      5_000,
      5 * 60_000,
    );
    this.#maxAttempts = boundedInteger(
      options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      'maxAttempts',
      1,
      20,
    );
    this.#baseRetryDelayMs = boundedInteger(
      options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS,
      'baseRetryDelayMs',
      100,
      60 * 60_000,
    );
    this.#maxRetryDelayMs = boundedInteger(
      options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      'maxRetryDelayMs',
      this.#baseRetryDelayMs,
      24 * 60 * 60_000,
    );
    this.#retryJitterRatio = boundedNumber(
      options.retryJitterRatio ?? DEFAULT_RETRY_JITTER_RATIO,
      'retryJitterRatio',
      0,
      0.5,
    );
    this.#clock = options.clock ?? (() => new Date());
    this.#random = options.random ?? Math.random;
    this.#observability = options.observability;
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    if (!this.#activeCycle) this.#schedule(0);
  }

  async stop(): Promise<void> {
    this.#running = false;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#activeAbortController?.abort();
    await this.#activeCycle?.catch(() => undefined);
  }

  runOnce(): Promise<AuthEmailCycleResult> {
    if (this.#activeCycle) return this.#activeCycle;

    const abortController = new AbortController();
    this.#activeAbortController = abortController;
    const cycle = this.#processDueBatch(abortController.signal);
    this.#activeCycle = cycle;
    const finishCycle = (): void => {
      if (this.#activeCycle === cycle) {
        this.#activeCycle = null;
        this.#activeAbortController = null;
      }
      if (this.#running && !this.#timer) this.#schedule(this.#pollIntervalMs);
    };
    void cycle.then(finishCycle, finishCycle);
    return cycle;
  }

  #schedule(delayMs: number): void {
    if (!this.#running || this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.runOnce().catch(() => undefined);
    }, delayMs);
  }

  async #processDueBatch(signal: AbortSignal): Promise<AuthEmailCycleResult> {
    const cycleTime = validClockDate(this.#clock());
    const claimedRows = await this.#queue.claimDue({
      now: cycleTime.toISOString(),
      limit: this.#batchSize,
      leaseDurationMs: this.#leaseDurationMs,
    });
    const rows = claimedRows.slice(0, this.#batchSize);
    const result: AuthEmailCycleResult = {
      claimed: rows.length,
      acknowledged: 0,
      retried: 0,
      terminal: 0,
      stale: 0,
    };

    for (const row of rows) {
      if (signal.aborted) break;
      this.#emitDeliveryEvent(AUTH_EMAIL_OBSERVABILITY_EVENTS.outboxClaimed, row, {
        queueAgeMs: outboxAgeMs(row, cycleTime),
      });
      const failure = validateClaim(row);
      if (failure) {
        await this.#recordFailure(row, failure, result);
        continue;
      }
      const tokenSecret = this.#tokenKeys[row.keyId];
      if (!tokenSecret) {
        await this.#recordFailure(row, { code: 'token_key_unavailable', retryable: false }, result);
        continue;
      }

      try {
        await this.#sender.send({
          outboxId: row.id,
          message: createAuthEmailMessage(row, this.#appBaseUrl, tokenSecret),
          signal,
        });
      } catch (error) {
        await this.#recordFailure(row, sanitizeDeliveryFailure(error), result);
        continue;
      }

      const acknowledged = await this.#queue.acknowledge({
        id: row.id,
        purpose: row.purpose,
        leaseVersion: row.leaseVersion,
        processedAt: validClockDate(this.#clock()).toISOString(),
      });
      if (acknowledged) {
        result.acknowledged += 1;
        this.#emitDeliveryEvent(AUTH_EMAIL_OBSERVABILITY_EVENTS.providerAccepted, row, {
          queueAgeMs: outboxAgeMs(row, cycleTime),
        });
      } else {
        result.stale += 1;
        this.#emitDeliveryEvent(AUTH_EMAIL_OBSERVABILITY_EVENTS.leaseStale, row);
      }
    }

    return result;
  }

  async #recordFailure(
    row: ClaimedAuthEmailOutboxRow,
    failure: DeliveryFailure,
    result: AuthEmailCycleResult,
  ): Promise<void> {
    const terminal = !failure.retryable || row.attempt >= this.#maxAttempts;
    const failureTime = validClockDate(this.#clock());
    const availableAt = terminal
      ? null
      : new Date(
          failureTime.getTime() +
            retryDelayMs(row.attempt, failure.retryAfterMs, {
              baseDelayMs: this.#baseRetryDelayMs,
              maxDelayMs: this.#maxRetryDelayMs,
              jitterRatio: this.#retryJitterRatio,
              random: this.#random,
            }),
        ).toISOString();
    const updated = await this.#queue.retry({
      id: row.id,
      purpose: row.purpose,
      leaseVersion: row.leaseVersion,
      failureCode: failure.code,
      availableAt,
      terminal,
    });
    if (!updated) {
      result.stale += 1;
      this.#emitDeliveryEvent(AUTH_EMAIL_OBSERVABILITY_EVENTS.leaseStale, row, {
        failureCode: failure.code,
      });
      return;
    }
    if (terminal) {
      result.terminal += 1;
      this.#emitDeliveryEvent(AUTH_EMAIL_OBSERVABILITY_EVENTS.deliveryTerminal, row, {
        failureCode: failure.code,
        queueAgeMs: outboxAgeMs(row, failureTime),
      });
    } else {
      result.retried += 1;
      this.#emitDeliveryEvent(AUTH_EMAIL_OBSERVABILITY_EVENTS.retryScheduled, row, {
        failureCode: failure.code,
        queueAgeMs: outboxAgeMs(row, failureTime),
        nextAttemptAt: availableAt,
      });
    }
  }

  #emitDeliveryEvent(
    name: string,
    row: ClaimedAuthEmailOutboxRow,
    attributes: Record<string, unknown> = {},
  ): void {
    this.#observability?.emit({
      name,
      timestamp: validClockDate(this.#clock()).toISOString(),
      correlationId: row.id,
      attributes: {
        outboxId: row.id,
        challengeId: row.challengeId,
        purpose: row.purpose,
        attempt: row.attempt,
        ...attributes,
      },
    });
  }
}

function outboxAgeMs(row: ClaimedAuthEmailOutboxRow, observedAt: Date): number {
  const createdAt = Date.parse(row.createdAt);
  if (!Number.isFinite(createdAt)) return 0;
  return Math.max(0, observedAt.getTime() - createdAt);
}

export function createResendAuthEmailSender(
  options: ResendAuthEmailSenderOptions,
): AuthEmailSender {
  const apiKey = requireResendApiKey(options.apiKey, 'apiKey');
  const from = requireFromAddress(options.from, 'from');
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== 'function') {
    throw new Error('A fetch implementation is required for Resend delivery');
  }
  const requestTimeoutMs = boundedInteger(
    options.requestTimeoutMs ?? DEFAULT_RESEND_TIMEOUT_MS,
    'requestTimeoutMs',
    1_000,
    MAX_RESEND_TIMEOUT_MS,
  );

  return {
    async send(input) {
      if (!OUTBOX_ID_PATTERN.test(input.outboxId)) {
        throw new AuthEmailDeliveryError('invalid_outbox_id', { retryable: false });
      }
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);
      const abortFromCaller = (): void => controller.abort();
      if (input.signal.aborted) controller.abort();
      else input.signal.addEventListener('abort', abortFromCaller, { once: true });

      try {
        const response = await fetchImplementation(RESEND_EMAILS_ENDPOINT, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': authEmailIdempotencyKey(input.outboxId),
            'user-agent': 'lodariq-auth-email/1.0',
          },
          body: JSON.stringify({
            from,
            to: input.message.to,
            subject: input.message.subject,
            html: input.message.html,
            text: input.message.text,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw await resendHttpError(response);
        }
      } catch (error) {
        if (error instanceof AuthEmailDeliveryError) throw error;
        if (timedOut) {
          throw new AuthEmailDeliveryError('resend_timeout', { retryable: true });
        }
        if (input.signal.aborted) {
          throw new AuthEmailDeliveryError('resend_aborted', { retryable: true });
        }
        throw new AuthEmailDeliveryError('resend_network_error', { retryable: true });
      } finally {
        clearTimeout(timeout);
        input.signal.removeEventListener('abort', abortFromCaller);
      }
    },
  };
}

export function readAuthEmailDeliveryEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): AuthEmailDeliveryConfig {
  const mode = requireEnvironmentValue(environment, AUTH_EMAIL_ENV.mode);
  if (mode === 'disabled') return { mode };
  if (mode !== 'resend') {
    throw new Error(`${AUTH_EMAIL_ENV.mode} must be "disabled" or "resend"`);
  }

  const tokenKeyring = readTokenKeyringEnvironment(environment);
  return {
    mode,
    appBaseUrl: normalizeAppBaseUrl(
      requireEnvironmentValue(environment, AUTH_EMAIL_ENV.appBaseUrl),
      AUTH_EMAIL_ENV.appBaseUrl,
      environment,
    ),
    from: requireFromAddress(
      requireEnvironmentValue(environment, AUTH_EMAIL_ENV.from),
      AUTH_EMAIL_ENV.from,
    ),
    apiKey: requireResendApiKey(
      requireEnvironmentValue(environment, AUTH_EMAIL_ENV.resendApiKey),
      AUTH_EMAIL_ENV.resendApiKey,
    ),
    activeTokenKeyId: tokenKeyring.activeKeyId,
    tokenKeys: tokenKeyring.keys,
  };
}

export interface AuthEmailTokenKeyring {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
}

export function readTokenKeyringEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): AuthEmailTokenKeyring {
  const serializedKeys = environment[AUTH_EMAIL_ENV.tokenKeys]?.trim();
  if (!serializedKeys) {
    const legacySecret = requireTokenSecret(
      requireEnvironmentValue(environment, AUTH_EMAIL_ENV.tokenSecret),
      AUTH_EMAIL_ENV.tokenSecret,
    );
    return { activeKeyId: 'legacy', keys: Object.freeze({ legacy: legacySecret }) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys);
  } catch {
    throw new Error(`${AUTH_EMAIL_ENV.tokenKeys} must be a JSON object`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${AUTH_EMAIL_ENV.tokenKeys} must be a JSON object`);
  }
  const keys = normalizeTokenKeyring(parsed as Record<string, unknown>, AUTH_EMAIL_ENV.tokenKeys);
  const activeKeyId = requireTokenKeyId(
    requireEnvironmentValue(environment, AUTH_EMAIL_ENV.activeTokenKeyId),
    AUTH_EMAIL_ENV.activeTokenKeyId,
  );
  requireTokenKey(keys, activeKeyId);
  return { activeKeyId, keys };
}

export function authEmailIdempotencyKey(outboxId: string): string {
  if (!OUTBOX_ID_PATTERN.test(outboxId)) throw new Error('Invalid auth email outbox ID');
  const digest = createHash('sha256').update(outboxId, 'utf8').digest('base64url');
  return `lodariq-auth-email/${digest}`;
}

function createAuthEmailMessage(
  row: ClaimedAuthEmailOutboxRow,
  appBaseUrl: string,
  tokenSecret: string,
): AuthEmailMessage {
  if (row.purpose === 'email_verification') {
    const url = formatEmailVerificationUrl(
      appBaseUrl,
      row.challengeId,
      createEmailVerificationToken(row.challengeId, tokenSecret),
    );
    return messageFromTemplate(
      row.recipientEmail,
      'Verify your Lodariq email',
      'Verify your email',
      'Confirm this email address, then choose the password for your Lodariq account. This link expires in 24 hours and works once.',
      url,
    );
  }

  if (row.purpose === 'workspace_invitation') {
    const url = formatWorkspaceInvitationUrl(
      appBaseUrl,
      row.challengeId,
      createWorkspaceInvitationToken(row.challengeId, tokenSecret),
    );
    return messageFromTemplate(
      row.recipientEmail,
      'You have been invited to a Lodariq workspace',
      'Accept your workspace invitation',
      'Sign in with this verified email address to join the workspace. This private link expires in 7 days and works once.',
      url,
    );
  }

  if (
    row.purpose === 'account_email_change_current' ||
    row.purpose === 'account_email_change_new'
  ) {
    const proof =
      row.purpose === 'account_email_change_current' ? 'current_email' : 'new_email';
    const url = formatAccountEmailChangeUrl(
      appBaseUrl,
      row.challengeId,
      proof,
      createAccountEmailChangeToken(row.challengeId, proof, tokenSecret),
    );
    const currentProof = proof === 'current_email';
    return messageFromTemplate(
      row.recipientEmail,
      currentProof ? 'Confirm your current Lodariq email' : 'Verify your new Lodariq email',
      currentProof ? 'Confirm your current email' : 'Verify your new email',
      currentProof
        ? 'Confirm that you requested this email-address change. The change completes only after both addresses are verified.'
        : 'Verify this new address. The change completes only after your current address is also confirmed.',
      url,
    );
  }

  const url = formatPasswordResetUrl(
    appBaseUrl,
    row.challengeId,
    createPasswordResetToken(row.challengeId, tokenSecret),
  );
  return messageFromTemplate(
    row.recipientEmail,
    'Set or reset your Lodariq password',
    'Set your password',
    'Use this private link to set a new password for your Lodariq account. This link expires in 30 minutes and works once. Requesting another link invalidates this one.',
    url,
  );
}

const TOKEN_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;

function requireTokenKeyId(value: string, name: string): string {
  const keyId = value.trim();
  if (!TOKEN_KEY_ID_PATTERN.test(keyId)) {
    throw new Error(`${name} must be a lowercase token key id`);
  }
  return keyId;
}

function normalizeTokenKeyring(
  input: Readonly<Record<string, unknown>>,
  name: string,
): Readonly<Record<string, string>> {
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > 8) {
    throw new Error(`${name} must contain between one and eight keys`);
  }
  const keys: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [rawKeyId, rawSecret] of entries) {
    const keyId = requireTokenKeyId(rawKeyId, `${name} key`);
    if (typeof rawSecret !== 'string') throw new Error(`${name}.${keyId} must be a string`);
    keys[keyId] = requireTokenSecret(rawSecret, `${name}.${keyId}`);
  }
  return Object.freeze(keys);
}

function requireTokenKey(keys: Readonly<Record<string, string>>, keyId: string): string {
  const secret = keys[keyId];
  if (!secret) throw new AuthEmailDeliveryError('token_key_unavailable', { retryable: false });
  return secret;
}

function messageFromTemplate(
  to: string,
  subject: string,
  heading: string,
  description: string,
  url: string,
): AuthEmailMessage {
  const safeUrl = escapeHtml(url);
  return {
    to,
    subject,
    html: [
      '<!doctype html><html><body>',
      `<h1>${escapeHtml(heading)}</h1>`,
      `<p>${escapeHtml(description)}</p>`,
      `<p><a href="${safeUrl}">${escapeHtml(heading)}</a></p>`,
      '<p>If you did not request this, you can safely ignore this email.</p>',
      '</body></html>',
    ].join(''),
    text: `${heading}\n\n${description}\n\n${url}\n\nIf you did not request this, you can safely ignore this email.`,
  };
}

function validateClaim(row: ClaimedAuthEmailOutboxRow): DeliveryFailure | null {
  const validChallengeId =
    (row.purpose === 'email_verification' &&
      VERIFICATION_CHALLENGE_ID_PATTERN.test(row.challengeId)) ||
    (row.purpose === 'set_password' && SET_PASSWORD_CHALLENGE_ID_PATTERN.test(row.challengeId));
  const validResourceId =
    validChallengeId ||
    (row.purpose === 'workspace_invitation' &&
      WORKSPACE_INVITATION_ID_PATTERN.test(row.challengeId)) ||
    ((row.purpose === 'account_email_change_current' ||
      row.purpose === 'account_email_change_new') &&
      ACCOUNT_EMAIL_CHANGE_ID_PATTERN.test(row.challengeId));
  if (
    !OUTBOX_ID_PATTERN.test(row.id) ||
    !isEmailAddress(row.recipientEmail) ||
    !validResourceId ||
    !TOKEN_KEY_ID_PATTERN.test(row.keyId) ||
    !Number.isSafeInteger(row.attempt) ||
    row.attempt < 1 ||
    row.attempt > 20 ||
    !Number.isSafeInteger(row.leaseVersion) ||
    row.leaseVersion < 1 ||
    !Number.isFinite(Date.parse(row.createdAt))
  ) {
    return { code: 'invalid_outbox_claim', retryable: false };
  }
  return null;
}

function sanitizeDeliveryFailure(error: unknown): DeliveryFailure {
  if (isAuthEmailDeliveryError(error)) {
    return {
      code: safeFailureCode(error.code),
      retryable: error.retryable,
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
    };
  }
  return { code: 'auth_email_sender_error', retryable: true };
}

function isAuthEmailDeliveryError(error: unknown): error is AuthEmailDeliveryError {
  if (error instanceof AuthEmailDeliveryError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<AuthEmailDeliveryError>;
  return (
    candidate.name === 'AuthEmailDeliveryError' &&
    typeof candidate.code === 'string' &&
    typeof candidate.retryable === 'boolean'
  );
}

async function resendHttpError(response: Response): Promise<AuthEmailDeliveryError> {
  const retryable =
    response.status === 408 ||
    response.status === 409 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500;
  const retryAfterMs = retryable
    ? parseRetryAfterMs(response.headers.get('retry-after'))
    : undefined;
  const code = retryable ? `resend_http_${response.status}` : await safeResendFailureCode(response);
  return new AuthEmailDeliveryError(code, {
    retryable,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

async function safeResendFailureCode(response: Response): Promise<string> {
  if (response.status !== 403) return `resend_http_${response.status}`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return 'resend_http_403';
  }
  if (!body || typeof body !== 'object') return 'resend_http_403';
  const record = body as Record<string, unknown>;
  const type = typeof record.name === 'string' ? record.name : record.type;
  if (type === 'invalid_api_key') return 'resend_invalid_api_key';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  if (message.includes('only send testing emails')) return 'resend_test_recipient_restricted';
  if (message.includes('domain') && message.includes('not verified')) {
    return 'resend_domain_not_verified';
  }
  if (message.includes('api key') || message.includes('sender') || message.includes('from')) {
    return 'resend_sender_forbidden';
  }
  return 'resend_http_403';
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds * 1_000), DEFAULT_MAX_RETRY_DELAY_MS);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return Math.min(Math.max(0, date.getTime() - Date.now()), DEFAULT_MAX_RETRY_DELAY_MS);
}

function retryDelayMs(
  attempt: number,
  retryAfterMs: number | undefined,
  options: {
    baseDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
    random: () => number;
  },
): number {
  const exponent = Math.min(Math.max(0, attempt - 1), 30);
  const exponentialDelay = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** exponent);
  const randomValue = boundedNumber(options.random(), 'random()', 0, 1);
  const jitterFactor = 1 - options.jitterRatio + 2 * options.jitterRatio * randomValue;
  const jitteredDelay = Math.round(exponentialDelay * jitterFactor);
  return Math.min(options.maxDelayMs, Math.max(jitteredDelay, retryAfterMs ?? 0));
}

function requireEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeAppBaseUrl(
  value: string,
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS origin or a development loopback origin`);
  }
  const production = environment.NODE_ENV === 'production';
  const httpsOrigin = url.protocol === 'https:';
  const developmentLoopback =
    !production &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1');
  if (
    (!httpsOrigin && !developmentLoopback) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an absolute HTTPS origin or a development loopback origin`);
  }
  return url.origin;
}

function requireFromAddress(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 320 || /[\r\n]/u.test(trimmed)) {
    throw new Error(`${name} must be a valid sender address`);
  }
  const friendlyAddress = /^(?:[^<>]{1,200})<([^<>]+)>$/u.exec(trimmed);
  const address = friendlyAddress?.[1]?.trim() ?? trimmed;
  if (!isEmailAddress(address)) throw new Error(`${name} must be a valid sender address`);
  return trimmed;
}

function requireResendApiKey(value: string, name: string): string {
  const trimmed = value.trim();
  if (!/^re_[A-Za-z0-9_-]{8,253}$/u.test(trimmed)) {
    throw new Error(`${name} must be a valid Resend API key`);
  }
  return trimmed;
}

function requireTokenSecret(value: string, name: string): string {
  const trimmed = value.trim();
  if (Buffer.byteLength(trimmed, 'utf8') < 32 || Buffer.byteLength(trimmed, 'utf8') > 256) {
    throw new Error(`${name} must contain between 32 and 256 bytes`);
  }
  return trimmed;
}

function isEmailAddress(value: string): boolean {
  return value.length >= 3 && value.length <= 320 && EMAIL_ADDRESS_PATTERN.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function safeFailureCode(value: string): string {
  if (/^resend_http_[1-5][0-9]{2}$/u.test(value)) return value;
  if (
    value === 'resend_invalid_api_key' ||
    value === 'resend_test_recipient_restricted' ||
    value === 'resend_domain_not_verified' ||
    value === 'resend_sender_forbidden'
  ) {
    return value;
  }
  if (
    value === 'auth_email_sender_error' ||
    value === 'invalid_outbox_claim' ||
    value === 'invalid_outbox_id' ||
    value === 'resend_aborted' ||
    value === 'resend_network_error' ||
    value === 'resend_timeout'
  ) {
    return value;
  }
  return 'auth_email_sender_error';
}

function validClockDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error('clock() must return a valid Date');
  return value;
}

function boundedInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedNumber(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}
