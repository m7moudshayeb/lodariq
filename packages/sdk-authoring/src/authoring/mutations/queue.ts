/**
 * Transactional mutation queue (§8.1). Four rules:
 *   1. Monotonic sequence per command, so order is a fact rather than a race.
 *   2. Exactly one in-flight write per document; commands queue behind it.
 *   3. Coalesce by path while queued — last-writer-wins per property, never
 *      per document, so a background and a border change both survive.
 *   4. Backoff, then a named `Retry`. Failed work stays queued until it lands.
 *
 * `schedule` is injected so the queue is deterministic under test.
 */
import { AuthoringMutationConflictError } from './types';
import type {
  AuthoringMutationCommand,
  AuthoringMutationFailure,
  AuthoringMutationInput,
  AuthoringMutationQueue,
  AuthoringMutationQueueOptions,
  AuthoringMutationQueueStatus,
} from './types';

/** Transport optimisation, mirroring the canonical-change debounce. */
export const AUTHORING_MUTATION_DEBOUNCE_MS = 300;
/** Backoff ladder. Its length is the retry budget before the creator is asked. */
export const AUTHORING_MUTATION_RETRY_DELAYS_MS = [400, 1_200, 3_000] as const;

interface DrainWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

function defaultSchedule(delayMs: number, run: () => void): () => void {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
}

export function createAuthoringMutationQueue<TPayload>(
  options: AuthoringMutationQueueOptions<TPayload>,
): AuthoringMutationQueue<TPayload> {
  const debounceMs = options.debounceMs ?? AUTHORING_MUTATION_DEBOUNCE_MS;
  const retryDelaysMs = options.retryDelaysMs ?? AUTHORING_MUTATION_RETRY_DELAYS_MS;
  const schedule = options.schedule ?? defaultSchedule;

  /** Insertion-ordered by path. Re-setting a path keeps its original slot. */
  const queued = new Map<string, AuthoringMutationCommand<TPayload>>();
  const waiters: DrainWaiter[] = [];
  let inFlight: readonly AuthoringMutationCommand<TPayload>[] | null = null;
  let cancelScheduled: (() => void) | null = null;
  let sequence = 0;
  let attempts = 0;
  let failure: AuthoringMutationFailure | null = null;
  let disposed = false;
  let held = false;
  let lastStatus: AuthoringMutationQueueStatus | null = null;

  function pendingCount(): number {
    return queued.size + (inFlight?.length ?? 0);
  }

  function status(): AuthoringMutationQueueStatus {
    if (held) return { state: 'held', pending: pendingCount() };
    if (failure) return { state: 'retry', pending: pendingCount(), failure };
    const pending = pendingCount();
    return { state: pending === 0 ? 'saved' : 'saving', pending };
  }

  function emitStatus(): void {
    const next = status();
    if (
      lastStatus &&
      lastStatus.state === next.state &&
      lastStatus.pending === next.pending &&
      lastStatus.failure?.path === next.failure?.path &&
      lastStatus.failure?.attempts === next.failure?.attempts
    ) {
      return;
    }
    lastStatus = next;
    options.onStatusChange?.(next);
  }

  function settleWaiters(error: Error | null): void {
    const pending = waiters.splice(0, waiters.length);
    for (const waiter of pending) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  }

  function scheduleDrain(delayMs: number): void {
    if (disposed || held || cancelScheduled || inFlight || queued.size === 0) return;
    cancelScheduled = schedule(delayMs, () => {
      cancelScheduled = null;
      drainNow();
    });
  }

  function drainNow(): void {
    if (disposed || held || inFlight || queued.size === 0) return;
    const batch = [...queued.values()];
    queued.clear();
    inFlight = batch;
    emitStatus();
    void options
      .transport(batch)
      .then(() => settleBatch(batch, null))
      .catch((error: unknown) => settleBatch(batch, error));
  }

  function settleBatch(
    batch: readonly AuthoringMutationCommand<TPayload>[],
    error: unknown,
  ): void {
    inFlight = null;
    if (disposed) return;
    if (!error) {
      attempts = 0;
      failure = null;
      emitStatus();
      if (queued.size > 0) scheduleDrain(0);
      else settleWaiters(null);
      return;
    }

    /**
     * A lost compare-and-swap is not a transport failure. Retrying it would
     * overwrite the other creator, so the command is dropped from the queue and the
     * conflict goes to the creator to resolve (§15.3).
     */
    if (error instanceof AuthoringMutationConflictError) {
      const conflicted = new Set(error.conflicts.map((conflict) => conflict.path));
      requeue(batch.filter((command) => !conflicted.has(command.path)));
      attempts = 0;
      failure = null;
      options.onConflict?.(error.conflicts);
      emitStatus();
      if (queued.size > 0) scheduleDrain(0);
      else settleWaiters(null);
      return;
    }

    requeue(batch);
    attempts += 1;
    const backoff = retryDelaysMs[attempts - 1];
    if (backoff != null) {
      failure = null;
      emitStatus();
      scheduleDrain(backoff);
      return;
    }
    failure = describeFailure(error, attempts);
    emitStatus();
    settleWaiters(new Error(failure.reason));
  }

  /**
   * Failed work goes back to the head of the queue, but never over the top of a
   * newer write to the same property: the creator's most recent intent wins.
   */
  function requeue(batch: readonly AuthoringMutationCommand<TPayload>[]): void {
    const newer = [...queued.entries()];
    queued.clear();
    for (const command of batch) {
      if (!newer.some(([path]) => path === command.path)) queued.set(command.path, command);
    }
    for (const [path, command] of newer) queued.set(path, command);
  }

  function describeFailure(error: unknown, attemptCount: number): AuthoringMutationFailure {
    const oldest = [...queued.values()][0];
    return {
      path: oldest?.path ?? 'unknown',
      label: oldest?.label ?? 'This change',
      attempts: attemptCount,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    enqueue: (input: AuthoringMutationInput<TPayload>) => {
      sequence += 1;
      const command: AuthoringMutationCommand<TPayload> = { ...input, sequence };
      queued.set(command.path, command);
      // A fresh edit clears the asked-for-help state: the creator has moved on
      // and the queue is trying again anyway.
      if (failure) {
        failure = null;
        attempts = 0;
      }
      emitStatus();
      scheduleDrain(debounceMs);
      return command;
    },
    retryNow: () => {
      if (disposed) return;
      failure = null;
      attempts = 0;
      emitStatus();
      scheduleDrain(0);
    },
    hold: () => {
      if (disposed || held) return;
      held = true;
      cancelScheduled?.();
      cancelScheduled = null;
      emitStatus();
    },
    resume: () => {
      if (disposed || !held) return;
      held = false;
      attempts = 0;
      failure = null;
      emitStatus();
      scheduleDrain(0);
    },
    drain: () =>
      new Promise<void>((resolve, reject) => {
        if (pendingCount() === 0 && !failure) {
          resolve();
          return;
        }
        waiters.push({ resolve, reject });
        cancelScheduled?.();
        cancelScheduled = null;
        drainNow();
      }),
    status,
    pendingCommands: () => [...queued.values()],
    dispose: () => {
      disposed = true;
      cancelScheduled?.();
      cancelScheduled = null;
      settleWaiters(new Error('Lodariq authoring mutation queue was disposed'));
    },
  };
}
