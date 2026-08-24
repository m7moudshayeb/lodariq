/**
 * Whether a person is finished with an experience.
 *
 * A different fact from where they are in it, with a different lifetime and a
 * different owner: position dies with the visit and belongs to the tab
 * (sessionStorage, `writeTourResume`), while "I completed this" or "I skipped
 * this" belongs to the person and outlives every device they own.
 *
 * The store is an interface because the local one below is a stand-in. The
 * durable answer is server-side, keyed to the same engagement key the analytics
 * events already carry (ADR-0031 draft); swapping this implementation for one
 * that calls the API must not reach a single caller.
 */

export type ExperienceOutcome = 'completed' | 'skipped';

export interface ExperienceProgressRecord {
  readonly documentId: string;
  readonly outcome: ExperienceOutcome;
  /** Epoch ms. A server store returns its own authoritative time here. */
  readonly at: number;
}

export interface ExperienceProgressStore {
  read(subject: string, documentId: string): Promise<ExperienceProgressRecord | null>;
  write(subject: string, record: ExperienceProgressRecord): Promise<void>;
}

const PROGRESS_PREFIX = 'lodariq:experience-progress:';
/** Bounded so a long-lived workspace cannot grow one key without end. */
const MAX_STORED_BYTES = 8_192;

type StoredOutcomes = Record<string, { outcome: ExperienceOutcome; at: number }>;

/**
 * Device-scoped stand-in for the server store.
 *
 * localStorage rather than sessionStorage because the fact outlives the visit,
 * and keyed by subject rather than by device because two people sharing a
 * browser are two people. It is still device-scoped in reach: the same person
 * on their phone has no record here, which is the limitation the server-side
 * store exists to remove.
 */
export function createLocalExperienceProgressStore(scope: {
  workspaceId: string;
  environment: string;
}): ExperienceProgressStore {
  const key = (subject: string): string =>
    `${PROGRESS_PREFIX}${scope.workspaceId}:${scope.environment}:${subject}`;

  const readAll = (subject: string): StoredOutcomes => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key(subject)) ?? '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as StoredOutcomes)
        : {};
    } catch {
      return {};
    }
  };

  return {
    read(subject, documentId) {
      const entry = readAll(subject)[documentId];
      const outcome = entry?.outcome;
      return Promise.resolve(
        outcome === 'completed' || outcome === 'skipped'
          ? { documentId, outcome, at: Number(entry?.at) || 0 }
          : null,
      );
    },
    write(subject, record) {
      try {
        const all = readAll(subject);
        all[record.documentId] = { outcome: record.outcome, at: record.at };
        let value = JSON.stringify(all);
        // Past the cap the oldest records go, not the newest one.
        if (value.length > MAX_STORED_BYTES) {
          value = JSON.stringify({
            [record.documentId]: { outcome: record.outcome, at: record.at },
          });
        }
        localStorage.setItem(key(subject), value);
      } catch {
        /* Visitor progress is best-effort and must never break the host page. */
      }
      return Promise.resolve();
    },
  };
}
