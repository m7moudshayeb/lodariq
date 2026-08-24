const ASSIGNMENT_KEY_PATTERN = /^lqv_[0-9a-f]{32}$/u;
const assignmentKeys = new Map<string, string>();

/** Stable anonymous assignment input, loaded only after page eligibility passes. */
export function readExperimentAssignmentKey(installationId: string): string | undefined {
  const cached = assignmentKeys.get(installationId);
  if (cached) return cached;
  const storageKey = `lodariq:experiment-assignment:${installationId}`;
  let assignmentKey: string | undefined;
  try {
    assignmentKey = localStorage.getItem(storageKey) ?? undefined;
  } catch {
    // Private or restricted contexts may block storage; memory remains usable.
  }
  if (!assignmentKey || !ASSIGNMENT_KEY_PATTERN.test(assignmentKey)) {
    try {
      assignmentKey = `lqv_${crypto.randomUUID().replace(/-/gu, '')}`;
    } catch {
      return undefined;
    }
    try {
      localStorage.setItem(storageKey, assignmentKey);
    } catch {
      // Keep the current page stable even when persistence is unavailable.
    }
  }
  assignmentKeys.set(installationId, assignmentKey);
  return assignmentKey;
}
