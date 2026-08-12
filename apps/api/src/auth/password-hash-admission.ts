export interface PasswordHashAdmissionGateOptions {
  maxActive?: number;
  maxQueued?: number;
  queueTimeoutMs?: number;
}

export const PASSWORD_HASH_ADMISSION_ENV = {
  maxActive: 'LODARIQ_PASSWORD_HASH_MAX_ACTIVE',
  maxQueued: 'LODARIQ_PASSWORD_HASH_MAX_QUEUED',
  queueTimeoutMs: 'LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS',
} as const;

export const PASSWORD_HASH_ADMISSION_LIMITS = Object.freeze({
  maxActive: { default: 1, minimum: 1, maximum: 4 },
  maxQueued: { default: 8, minimum: 0, maximum: 100 },
  queueTimeoutMs: { default: 2_000, minimum: 100, maximum: 30_000 },
});

export type PasswordHashAdmissionFailure = 'queue_full' | 'timeout' | 'aborted';

export class PasswordHashAdmissionError extends Error {
  constructor(readonly reason: PasswordHashAdmissionFailure) {
    super(`Password-hash admission ${reason}`);
    this.name = 'PasswordHashAdmissionError';
  }
}

export interface PasswordHashAdmissionGateLike {
  run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

interface QueuedAdmission {
  resolve: (release: () => void) => void;
  reject: (error: PasswordHashAdmissionError) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PasswordHashAdmissionGate implements PasswordHashAdmissionGateLike {
  private readonly maxActive: number;
  private readonly maxQueued: number;
  private readonly queueTimeoutMs: number;
  private active = 0;
  private readonly queue: QueuedAdmission[] = [];

  constructor(options: PasswordHashAdmissionGateOptions = {}) {
    this.maxActive = boundedPositiveInteger(
      options.maxActive,
      PASSWORD_HASH_ADMISSION_LIMITS.maxActive.default,
      PASSWORD_HASH_ADMISSION_LIMITS.maxActive.maximum,
    );
    this.maxQueued = boundedNonNegativeInteger(
      options.maxQueued,
      PASSWORD_HASH_ADMISSION_LIMITS.maxQueued.default,
      PASSWORD_HASH_ADMISSION_LIMITS.maxQueued.maximum,
    );
    this.queueTimeoutMs = boundedPositiveInteger(
      options.queueTimeoutMs,
      PASSWORD_HASH_ADMISSION_LIMITS.queueTimeoutMs.default,
      PASSWORD_HASH_ADMISSION_LIMITS.queueTimeoutMs.maximum,
    );
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new PasswordHashAdmissionError('aborted'));
    if (this.active < this.maxActive) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }
    if (this.queue.length >= this.maxQueued) {
      return Promise.reject(new PasswordHashAdmissionError('queue_full'));
    }

    return new Promise((resolve, reject) => {
      const queued: QueuedAdmission = {
        resolve,
        reject,
        signal,
        timeout: setTimeout(() => this.rejectQueued(queued, 'timeout'), this.queueTimeoutMs),
      };
      if (signal) {
        queued.onAbort = () => this.rejectQueued(queued, 'aborted');
        signal.addEventListener('abort', queued.onAbort, { once: true });
      }
      this.queue.push(queued);
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.admitNext();
    };
  }

  private admitNext(): void {
    while (this.active < this.maxActive) {
      const queued = this.queue.shift();
      if (!queued) return;
      this.cleanupQueued(queued);
      if (queued.signal?.aborted) {
        queued.reject(new PasswordHashAdmissionError('aborted'));
        continue;
      }
      this.active += 1;
      queued.resolve(this.createRelease());
    }
  }

  private rejectQueued(queued: QueuedAdmission, reason: PasswordHashAdmissionFailure): void {
    const index = this.queue.indexOf(queued);
    if (index === -1) return;
    this.queue.splice(index, 1);
    this.cleanupQueued(queued);
    queued.reject(new PasswordHashAdmissionError(reason));
  }

  private cleanupQueued(queued: QueuedAdmission): void {
    clearTimeout(queued.timeout);
    if (queued.signal && queued.onAbort) {
      queued.signal.removeEventListener('abort', queued.onAbort);
    }
  }
}

export function createPasswordHashAdmissionGateFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PasswordHashAdmissionGate {
  return new PasswordHashAdmissionGate({
    maxActive: readOptionalInteger(
      env,
      PASSWORD_HASH_ADMISSION_ENV.maxActive,
      PASSWORD_HASH_ADMISSION_LIMITS.maxActive.minimum,
      PASSWORD_HASH_ADMISSION_LIMITS.maxActive.maximum,
    ),
    maxQueued: readOptionalInteger(
      env,
      PASSWORD_HASH_ADMISSION_ENV.maxQueued,
      PASSWORD_HASH_ADMISSION_LIMITS.maxQueued.minimum,
      PASSWORD_HASH_ADMISSION_LIMITS.maxQueued.maximum,
    ),
    queueTimeoutMs: readOptionalInteger(
      env,
      PASSWORD_HASH_ADMISSION_ENV.queueTimeoutMs,
      PASSWORD_HASH_ADMISSION_LIMITS.queueTimeoutMs.minimum,
      PASSWORD_HASH_ADMISSION_LIMITS.queueTimeoutMs.maximum,
    ),
  });
}

function readOptionalInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return value !== undefined && Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

function boundedNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= maximum
    ? value
    : fallback;
}
