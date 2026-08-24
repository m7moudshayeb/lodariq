import { describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_MUTATION_RETRY_DELAYS_MS,
  createAuthoringMutationQueue,
} from '../../../../../../packages/sdk-authoring/src/authoring/mutations/queue';
import {
  AuthoringMutationConflictError,
  type AuthoringMutationCommand,
  type AuthoringMutationConflict,
  type AuthoringMutationQueueStatus,
} from '../../../../../../packages/sdk-authoring/src/authoring/mutations/types';

/**
 * Deterministic clock. Every delay the queue asks for is recorded and tests
 * advance it explicitly, so nothing here depends on wall-clock timing.
 */
function createClock() {
  const scheduled: { delayMs: number; run: () => void; cancelled: boolean }[] = [];
  return {
    scheduled,
    schedule: (delayMs: number, run: () => void) => {
      const entry = { delayMs, run, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    /** Fires every pending, uncancelled callback once. */
    flush: () => {
      const due = scheduled.filter((entry) => !entry.cancelled);
      scheduled.length = 0;
      for (const entry of due) entry.run();
    },
  };
}

/** The transport promise chain is several microtasks deep; drain all of them. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
}

/** One clock tick plus its promise fallout — the unit every retry test counts in. */
async function tick(clock: ReturnType<typeof createClock>): Promise<void> {
  clock.flush();
  await settle();
}

interface Change {
  value: string;
}

function harness(behaviour: (batchIndex: number) => Promise<void> = () => Promise.resolve()) {
  const clock = createClock();
  const sent: AuthoringMutationCommand<Change>[][] = [];
  const statuses: AuthoringMutationQueueStatus[] = [];
  const queue = createAuthoringMutationQueue<Change>({
    debounceMs: 10,
    schedule: clock.schedule,
    onStatusChange: (status) => statuses.push(status),
    transport: (batch) => {
      const index = sent.length;
      sent.push([...batch]);
      return behaviour(index);
    },
  });
  return { clock, queue, sent, statuses };
}

const change = (path: string, label: string, value: string) => ({
  path,
  label,
  payload: { value },
});
const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];
const rejecting = (): Promise<void> => Promise.reject(new Error('offline'));

/** Exhaust the whole backoff ladder plus the attempt that trips `retry`. */
async function exhaustRetries(clock: ReturnType<typeof createClock>): Promise<void> {
  for (let attempt = 0; attempt <= AUTHORING_MUTATION_RETRY_DELAYS_MS.length; attempt += 1) {
    await tick(clock);
  }
}

describe('authoring mutation queue — sequencing', () => {
  it('assigns a monotonic sequence per command', () => {
    const { queue } = harness();
    expect(queue.enqueue(change('a', 'Background', '1')).sequence).toBe(1);
    expect(queue.enqueue(change('b', 'Border', '2')).sequence).toBe(2);
    expect(queue.enqueue(change('a', 'Background', '3')).sequence).toBe(3);
  });

  it('reports saved only when nothing is queued or in flight', async () => {
    const { clock, queue } = harness();
    expect(queue.status().state).toBe('saved');
    queue.enqueue(change('a', 'Background', '1'));
    expect(queue.status()).toEqual({ state: 'saving', pending: 1 });
    const drained = queue.drain();
    await tick(clock);
    await drained;
    expect(queue.status()).toEqual({ state: 'saved', pending: 0 });
  });
});

describe('authoring mutation queue — coalescing by path', () => {
  it('collapses repeated writes to one property to the last value', async () => {
    const { clock, queue, sent } = harness();
    queue.enqueue(change('appearance.background', 'Background', 'red'));
    queue.enqueue(change('appearance.background', 'Background', 'green'));
    queue.enqueue(change('appearance.background', 'Background', 'blue'));
    expect(queue.pendingCommands()).toHaveLength(1);
    await queue.drain();
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]?.[0]?.payload.value).toBe('blue');
    expect(clock.scheduled.some((entry) => !entry.cancelled)).toBe(false);
  });

  it('keeps writes to different properties — the audit #1 regression', async () => {
    const { queue, sent } = harness();
    queue.enqueue(change('appearance.background', 'Background', 'red'));
    queue.enqueue(change('appearance.text', 'Text colour', 'white'));
    queue.enqueue(change('appearance.background', 'Background', 'blue'));
    queue.enqueue(change('appearance.border', 'Border colour', 'grey'));
    await queue.drain();
    expect(sent[0]?.map((command) => [command.path, command.payload.value])).toEqual([
      ['appearance.background', 'blue'],
      ['appearance.text', 'white'],
      ['appearance.border', 'grey'],
    ]);
  });

  it('holds one write in flight and coalesces everything behind it', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { clock, queue, sent } = harness((index) => (index === 0 ? gate : Promise.resolve()));

    queue.enqueue(change('a', 'Background', '1'));
    await tick(clock);
    expect(sent).toHaveLength(1);

    queue.enqueue(change('a', 'Background', '2'));
    queue.enqueue(change('a', 'Background', '3'));
    queue.enqueue(change('b', 'Border', 'x'));
    expect(sent).toHaveLength(1);
    expect(queue.pendingCommands()).toHaveLength(2);

    release();
    await settle();
    await tick(clock);

    expect(sent).toHaveLength(2);
    expect(sent[1]?.map((command) => command.payload.value)).toEqual(['3', 'x']);
    expect(queue.status()).toEqual({ state: 'saved', pending: 0 });
  });
});

describe('authoring mutation queue — failure handling', () => {
  it('retries on the backoff ladder before asking the creator', async () => {
    const { clock, queue, sent } = harness((index) =>
      index < 2 ? rejecting() : Promise.resolve(),
    );
    queue.enqueue(change('appearance.border', 'Border colour', 'grey'));
    await tick(clock);

    expect(queue.status().state).toBe('saving');
    expect(clock.scheduled[0]?.delayMs).toBe(AUTHORING_MUTATION_RETRY_DELAYS_MS[0]);
    await tick(clock);
    expect(clock.scheduled[0]?.delayMs).toBe(AUTHORING_MUTATION_RETRY_DELAYS_MS[1]);
    await tick(clock);

    expect(sent).toHaveLength(3);
    expect(queue.status()).toEqual({ state: 'saved', pending: 0 });
  });

  it('names the property that failed rather than reporting a generic failure', async () => {
    const { clock, queue, statuses } = harness(rejecting);
    queue.enqueue(change('appearance.border', 'Border colour', 'grey'));
    await exhaustRetries(clock);

    const status = queue.status();
    expect(status.state).toBe('retry');
    expect(status.failure?.label).toBe('Border colour');
    expect(status.failure?.attempts).toBe(AUTHORING_MUTATION_RETRY_DELAYS_MS.length + 1);
    expect(last(statuses)?.state).toBe('retry');
  });

  it('never drops failed work — it stays queued for Retry', async () => {
    let failing = true;
    const { clock, queue, sent } = harness(() => (failing ? rejecting() : Promise.resolve()));
    queue.enqueue(change('appearance.border', 'Border colour', 'grey'));
    await exhaustRetries(clock);
    expect(queue.pendingCommands().map((command) => command.path)).toEqual(['appearance.border']);

    failing = false;
    queue.retryNow();
    await tick(clock);
    expect(last(sent)?.[0]?.path).toBe('appearance.border');
    expect(queue.status()).toEqual({ state: 'saved', pending: 0 });
  });

  it('does not let a retried write overwrite a newer edit to the same property', async () => {
    let failFirst = true;
    const { clock, queue, sent } = harness(() => {
      if (failFirst) {
        failFirst = false;
        return rejecting();
      }
      return Promise.resolve();
    });
    queue.enqueue(change('appearance.background', 'Background', 'red'));
    clock.flush();
    queue.enqueue(change('appearance.background', 'Background', 'blue'));
    await settle();
    await tick(clock);
    expect(last(sent)?.[0]?.payload.value).toBe('blue');
    expect(queue.status()).toEqual({ state: 'saved', pending: 0 });
  });

  it('rejects drain when retries are exhausted, naming the property', async () => {
    const { clock, queue } = harness(rejecting);
    queue.enqueue(change('appearance.border', 'Border colour', 'grey'));
    const settled = queue.drain().catch((error: unknown) => error);
    await exhaustRetries(clock);
    await expect(settled).resolves.toBeInstanceOf(Error);
    expect(queue.status().failure?.label).toBe('Border colour');
  });
});

describe('authoring mutation queue — lifecycle', () => {
  it('stops scheduling and rejects waiters once disposed', async () => {
    const { clock, queue } = harness(() => new Promise<void>(() => {}));
    queue.enqueue(change('a', 'Background', '1'));
    const drained = queue.drain().catch((error: unknown) => error);
    queue.dispose();
    await expect(drained).resolves.toBeInstanceOf(Error);
    const before = clock.scheduled.length;
    queue.enqueue(change('b', 'Border', '2'));
    queue.retryNow();
    expect(clock.scheduled.length).toBe(before);
  });

  it('emits a status change only when the status actually changes', () => {
    const onStatusChange = vi.fn();
    const clock = createClock();
    const queue = createAuthoringMutationQueue<Change>({
      debounceMs: 10,
      schedule: clock.schedule,
      onStatusChange,
      transport: () => Promise.resolve(),
    });
    queue.enqueue(change('a', 'Background', '1'));
    queue.enqueue(change('a', 'Background', '2'));
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });
});

describe('holding the queue when a session lapses (§15.4)', () => {
  it('keeps everything queued and drains nothing until re-activation', async () => {
    const clock = createClock();
    const transport = vi.fn(async () => undefined);
    const queue = createAuthoringMutationQueue({ transport, schedule: clock.schedule });

    queue.enqueue({ path: 'step:a/style.surface', label: 'Background colour', payload: 1 });
    queue.hold();
    await tick(clock);

    expect(transport).not.toHaveBeenCalled();
    expect(queue.status().state).toBe('held');
    // The work is not lost — it is exactly where the creator left it.
    expect(queue.status().pending).toBe(1);
    expect(queue.pendingCommands().map((command) => command.path)).toEqual([
      'step:a/style.surface',
    ]);

    queue.resume();
    await tick(clock);

    expect(transport).toHaveBeenCalledOnce();
    expect(queue.status().state).toBe('saved');
    queue.dispose();
  });

  it('still accepts edits while held, and coalesces them as usual', async () => {
    const clock = createClock();
    const sent: AuthoringMutationCommand<number>[][] = [];
    const transport = vi.fn(async (batch: readonly AuthoringMutationCommand<number>[]) => {
      sent.push([...batch]);
    });
    const queue = createAuthoringMutationQueue({ transport, schedule: clock.schedule });

    queue.hold();
    queue.enqueue({ path: 'step:a/style.surface', label: 'Background colour', payload: 1 });
    queue.enqueue({ path: 'step:a/style.surface', label: 'Background colour', payload: 2 });
    await tick(clock);
    expect(transport).not.toHaveBeenCalled();

    queue.resume();
    await tick(clock);

    expect(sent[0]).toHaveLength(1);
    expect(sent[0]?.[0]?.payload).toBe(2);
    queue.dispose();
  });
});

describe('a write that lost compare-and-swap (§15.3)', () => {
  const conflict: AuthoringMutationConflict = {
    path: 'step:a/style.surface',
    label: 'Background colour',
    baseVersion: 4,
    actualVersion: 5,
    byCreatorName: 'Dina Haddad',
  };

  it('drops the conflicting command instead of retrying it over someone else', async () => {
    const clock = createClock();
    const onConflict = vi.fn();
    const transport = vi.fn(async () => {
      throw new AuthoringMutationConflictError([conflict]);
    });
    const queue = createAuthoringMutationQueue({ transport, schedule: clock.schedule, onConflict });

    queue.enqueue({ path: conflict.path, label: conflict.label, payload: 1 });
    await tick(clock);

    expect(onConflict).toHaveBeenCalledWith([conflict]);
    // Not retried, and not queued: retrying is exactly the overwrite we refuse.
    expect(transport).toHaveBeenCalledOnce();
    expect(queue.pendingCommands()).toEqual([]);
    expect(queue.status().state).toBe('saved');
    queue.dispose();
  });

  it('keeps the other properties in the same batch moving', async () => {
    const clock = createClock();
    const seen: AuthoringMutationCommand<number>[][] = [];
    let call = 0;
    const transport = vi.fn(async (batch: readonly AuthoringMutationCommand<number>[]) => {
      seen.push([...batch]);
      call += 1;
      if (call === 1) throw new AuthoringMutationConflictError([conflict]);
    });
    const queue = createAuthoringMutationQueue({ transport, schedule: clock.schedule });

    queue.enqueue({ path: conflict.path, label: conflict.label, payload: 1 });
    queue.enqueue({ path: 'step:a/style.border', label: 'Border colour', payload: 2 });
    await tick(clock);
    await tick(clock);

    expect(seen[1]?.map((command) => command.path)).toEqual(['step:a/style.border']);
    queue.dispose();
  });

  it('does not spend the retry budget on a conflict', async () => {
    const clock = createClock();
    const transport = vi.fn(async () => {
      throw new AuthoringMutationConflictError([conflict]);
    });
    const queue = createAuthoringMutationQueue({ transport, schedule: clock.schedule });

    queue.enqueue({ path: conflict.path, label: conflict.label, payload: 1 });
    await tick(clock);
    // A transport failure would have scheduled a backoff; a conflict is not one.
    expect(clock.scheduled.filter((entry) => !entry.cancelled)).toHaveLength(0);
    expect(queue.status().failure).toBeUndefined();
    queue.dispose();
  });
});
