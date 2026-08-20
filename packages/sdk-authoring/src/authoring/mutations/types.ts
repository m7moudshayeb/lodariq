/**
 * Transactional mutation queue contract (§8.1). Audit #1: rapid colour changes
 * acknowledged every click but overwrote one another while pending, because
 * debounce was carrying correctness. Here, each edit is a command with a path,
 * a label and a sequence; writes serialise; queued commands coalesce per path.
 */

/** An edit, addressed by the property it changes. */
export interface AuthoringMutationCommand<TPayload> {
  /** Identity of the property written, e.g. `step:abc/appearance.background`. Same path coalesces; different paths never do. */
  readonly path: string;
  /** Creator-facing property name, used verbatim when a write fails. Required, never generic. */
  readonly label: string;
  /** Monotonic, assigned by the queue. Never reused, never reordered. */
  readonly sequence: number;
  readonly payload: TPayload;
}

/** What the caller supplies; the queue assigns the sequence. */
export type AuthoringMutationInput<TPayload> = Omit<
  AuthoringMutationCommand<TPayload>,
  'sequence'
>;

/**
 * Sends one coalesced batch; resolving means persisted, rejecting keeps it
 * queued. A batch rather than one call per command because ADR-0015 requires
 * semantic batched bridge messages.
 */
export type AuthoringMutationTransport<TPayload> = (
  batch: readonly AuthoringMutationCommand<TPayload>[],
) => Promise<void>;

export type AuthoringMutationQueueState =
  /** Nothing queued, nothing in flight. */
  | 'saved'
  /** A write is in flight, or one is scheduled. */
  | 'saving'
  /**
   * The session lapsed or the transport is unreachable. Work stays queued and
   * nothing drains until `resume()` — silent expiry mid-edit is data loss wearing a
   * permissions costume (§15.4).
   */
  | 'held'
  /** Retries are exhausted. The work is still queued; the creator must act. */
  | 'retry';

export interface AuthoringMutationFailure {
  readonly path: string;
  /** Named so the creator sees "Border colour didn't save", never "Save failed". */
  readonly label: string;
  readonly attempts: number;
  readonly reason: string;
}

export interface AuthoringMutationQueueStatus {
  readonly state: AuthoringMutationQueueState;
  /** Commands queued plus commands in flight. Zero exactly when state is `saved`. */
  readonly pending: number;
  /** Present only in `retry`. */
  readonly failure?: AuthoringMutationFailure;
}

/**
 * A rejected write whose base version had already moved (§15.3). Distinct from a
 * failure: retrying would overwrite, so the queue drops the command and hands the
 * conflict to the creator instead.
 */
export interface AuthoringMutationConflict {
  readonly path: string;
  readonly label: string;
  readonly baseVersion: number;
  readonly actualVersion: number;
  readonly byCreatorName?: string;
}

/** Thrown by a transport when the server refused a stale write. */
export class AuthoringMutationConflictError extends Error {
  constructor(readonly conflicts: readonly AuthoringMutationConflict[]) {
    super('Lodariq authoring write lost compare-and-swap');
    this.name = 'AuthoringMutationConflictError';
  }
}

export interface AuthoringMutationQueueOptions<TPayload> {
  readonly transport: AuthoringMutationTransport<TPayload>;
  /** Delay before the first drain. A transport optimisation; correctness comes from the queue. */
  readonly debounceMs?: number;
  /** Backoff ladder. Its length is the retry budget. */
  readonly retryDelaysMs?: readonly number[];
  readonly onStatusChange?: (status: AuthoringMutationQueueStatus) => void;
  /** Called with the conflicting paths; the creator chooses, nothing auto-merges. */
  readonly onConflict?: (conflicts: readonly AuthoringMutationConflict[]) => void;
  /** Injected so tests drive time explicitly rather than waiting. */
  readonly schedule?: (delayMs: number, run: () => void) => () => void;
}

export interface AuthoringMutationQueue<TPayload> {
  /** Optimistic application is the caller's job; this owns durability only. */
  enqueue: (input: AuthoringMutationInput<TPayload>) => AuthoringMutationCommand<TPayload>;
  /** The `Retry` affordance in the mode pill. */
  retryNow: () => void;
  /** Stops draining and keeps everything queued (§15.4): a lapsed session, offline. */
  hold: () => void;
  /** Re-activation flushes what was held. */
  resume: () => void;
  /** Resolves when the queue is empty. Rejects if retries are exhausted. */
  drain: () => Promise<void>;
  status: () => AuthoringMutationQueueStatus;
  /** Commands still queued, in order. Diagnostics and tests. */
  pendingCommands: () => readonly AuthoringMutationCommand<TPayload>[];
  dispose: () => void;
}
