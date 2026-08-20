/**
 * Theme snapshot staleness (§6.3).
 *
 * `authoring-and-release.md` documents that the authoring frame holds the theme
 * snapshot from session start, so a new theme needs a session refresh. That is a
 * correctness bug wearing a documentation costume: a creator changes a theme, sees
 * nothing, and changes it again.
 *
 * The fix is a **versioned handle**. The frame remembers the snapshot it actually
 * rendered; when a newer version is announced it either re-renders or says so. What
 * it must never do is stay silent.
 */

export interface ThemeHandle {
  readonly version: number;
  readonly contentHash: string;
}

export type ThemeFreshness = 'current' | 'stale' | 'unknown';

export function themeHandleOf(
  snapshot: { readonly version: number; readonly contentHash: string } | null | undefined,
): ThemeHandle | null {
  return snapshot ? { version: snapshot.version, contentHash: snapshot.contentHash } : null;
}

/**
 * Compares what is rendered with what the workspace holds. The content hash decides
 * — a version number can be reused across environments, a hash cannot — and the
 * version is the tie-breaker for a legacy snapshot with no hash yet.
 */
export function themeFreshness(
  rendered: ThemeHandle | null,
  current: ThemeHandle | null,
): ThemeFreshness {
  if (!rendered || !current) return 'unknown';
  if (rendered.contentHash === current.contentHash) return 'current';
  return current.version >= rendered.version ? 'stale' : 'current';
}

export function themeIsStale(rendered: ThemeHandle | null, current: ThemeHandle | null): boolean {
  return themeFreshness(rendered, current) === 'stale';
}
