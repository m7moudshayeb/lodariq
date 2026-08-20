/**
 * When a soft lock lapses anyway (§15.3).
 *
 * Locks are advisory and will be bypassed — expiry during a slow edit, two tabs, a
 * reconnect. So the write path carries its own guarantee: every step edit attaches
 * the base version it was made against, and a mismatch **fails compare-and-swap
 * rather than overwriting**.
 *
 * The one rule that matters: never silently merge block trees. Auto-merging two
 * rich-content documents is how a paragraph disappears and nobody finds out. The
 * creator chooses, and the losing side is kept as a draft snapshot regardless of
 * which button they press.
 */

export interface VersionedWrite<TPayload> {
  readonly path: string;
  readonly label: string;
  /** The version the edit was made against. */
  readonly baseVersion: number;
  readonly payload: TPayload;
}

export interface CasRejection {
  readonly path: string;
  readonly label: string;
  readonly baseVersion: number;
  /** What the server holds now. */
  readonly actualVersion: number;
  /** Who moved it, when the host knows. */
  readonly byCreatorName?: string;
}

export const CONFLICT_CHOICES = ['keep-mine', 'keep-theirs', 'open-both'] as const;
export type ConflictChoice = (typeof CONFLICT_CHOICES)[number];

export interface ConflictPrompt {
  readonly rejection: CasRejection;
  /** Human-readable, and never `409 Conflict` (§15.2's closing note). */
  readonly message: string;
  readonly choices: readonly ConflictChoice[];
  /**
   * True always: the losing edit becomes a draft snapshot whichever way the
   * creator answers, so no choice is destructive.
   */
  readonly bothSidesPreserved: true;
}

export function conflictPrompt(
  rejection: CasRejection,
  describe: (rejection: CasRejection) => string,
): ConflictPrompt {
  return {
    rejection,
    message: describe(rejection),
    choices: CONFLICT_CHOICES,
    bothSidesPreserved: true,
  };
}

/** A write is safe exactly when nobody has moved the version under it. */
export function isStaleWrite<TPayload>(
  write: VersionedWrite<TPayload>,
  currentVersion: number,
): boolean {
  return write.baseVersion !== currentVersion;
}

export interface ConflictResolution<TPayload> {
  /** The write to apply, or null when the creator kept the server's copy. */
  readonly apply: VersionedWrite<TPayload> | null;
  /** Always present: the discarded side, kept as a snapshot. */
  readonly snapshot: VersionedWrite<TPayload>;
  /** Set when the creator asked to compare, so the host can open both. */
  readonly compare: boolean;
}

/**
 * Rebases the creator's own write onto the version the server holds. Only the
 * *version* moves; the payload is untouched, because merging payloads is the thing
 * this whole path exists to avoid.
 */
export function resolveConflict<TPayload>(
  write: VersionedWrite<TPayload>,
  rejection: CasRejection,
  choice: ConflictChoice,
): ConflictResolution<TPayload> {
  const rebased: VersionedWrite<TPayload> = { ...write, baseVersion: rejection.actualVersion };
  if (choice === 'keep-theirs') return { apply: null, snapshot: write, compare: false };
  if (choice === 'open-both') return { apply: null, snapshot: write, compare: true };
  return { apply: rebased, snapshot: write, compare: false };
}
