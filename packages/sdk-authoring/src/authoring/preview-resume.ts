/**
 * Where a creator was in their own preview, kept across a document teardown.
 *
 * Preview cannot use the runtime's resume record and should not try to. That
 * one is validated against a published manifest version and the compiled
 * content hash, neither of which a draft has: a draft recompiles on every
 * keystroke, so the runtime's rule — refuse to resume into content that
 * changed — would throw this away constantly, correctly and uselessly. The two
 * also share a single sessionStorage slot per workspace, so one would overwrite
 * the other.
 *
 * The deeper difference is what has to come back. Delivery resumes a step;
 * preview has to resume a session — which draft, which authoring panel — before
 * a step means anything, because a reload takes the panel with it.
 *
 * Keyed on the draft, never on the URL. Appending to the address bar would
 * break the customer application the creator is authoring against, which is the
 * same rule the runtime holds itself to.
 */

const PREVIEW_RESUME_PREFIX = 'lodariq:preview-resume:';
/** A creator's reload is immediate; a record older than this is a stale tab. */
const PREVIEW_RESUME_MAX_AGE_MS = 30 * 60 * 1000;

export interface DraftPreviewResumeState {
  sessionId: string;
  documentId: string;
  stepId: string;
  /** Full preview rather than the editing canvas, restored as it was left. */
  interactive: boolean;
  updatedAt: number;
}

export function readDraftPreviewResume(workspaceId: string): DraftPreviewResumeState | null {
  try {
    const raw = sessionStorage.getItem(previewResumeKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftPreviewResumeState>;
    if (
      typeof parsed.updatedAt === 'number' &&
      Date.now() - parsed.updatedAt <= PREVIEW_RESUME_MAX_AGE_MS &&
      typeof parsed.sessionId === 'string' &&
      typeof parsed.documentId === 'string' &&
      typeof parsed.stepId === 'string'
    ) {
      return { ...parsed, interactive: parsed.interactive === true } as DraftPreviewResumeState;
    }
    clearDraftPreviewResume(workspaceId);
  } catch {
    clearDraftPreviewResume(workspaceId);
  }
  return null;
}

export function writeDraftPreviewResume(
  workspaceId: string,
  state: Omit<DraftPreviewResumeState, 'updatedAt'>,
): void {
  try {
    sessionStorage.setItem(
      previewResumeKey(workspaceId),
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    );
  } catch {
    /* Preview resume is best-effort and must never break the creator's page. */
  }
}

export function clearDraftPreviewResume(workspaceId: string): void {
  try {
    sessionStorage.removeItem(previewResumeKey(workspaceId));
  } catch {
    /* Ignore unavailable storage. */
  }
}

function previewResumeKey(workspaceId: string): string {
  return `${PREVIEW_RESUME_PREFIX}${workspaceId}`;
}
