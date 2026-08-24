/**
 * Every string the mode pill renders, in one place. Two rules: no copy may name
 * a mode from the internal four-state machine (§3.3), and a failed save names
 * the property rather than saying "Save failed" (§8.1).
 */
import { authoringText } from '../../i18n';

export const MODE_PILL_COPY = {
  /** Accessible name for the pill itself. Status, not a toolbar. */
  region: authoringText('Authoring status'),
  editing: authoringText('Editing'),
  browsing: authoringText('Browsing'),
  /** Tooltips carry the why: a two-word label cannot explain the switch. */
  editingHint: authoringText('Your clicks stay in Lodariq. The page underneath is inert.'),
  browsingHint: authoringText('Your clicks reach your product. Nothing you built is lost.'),
  preview: authoringText('Preview'),
  operations: authoringText('Open Operations'),
  exitAuthoring: authoringText('Close authoring'),
  hideAllPanels: authoringText('Hide all panels'),
  showAllPanels: authoringText('Show all panels'),
  more: authoringText('More authoring actions'),
  collapse: authoringText('Collapse to a dot'),
  /** On the grip, which is how the pill is moved to another corner (§3.4). */
  drag: authoringText('Drag to move · double-click to collapse'),
  /** §3.3 groups: the menu is the panel's only route to Tier 3. */
  groupOperations: authoringText('Operations'),
  groupPlay: authoringText('Play'),
  groupEnvironment: authoringText('Environment'),
  flowMap: authoringText('Flow map'),
  storyboard: authoringText('Storyboard'),
  checkReport: authoringText('Run the Check report'),
  releaseReview: authoringText('Release & review'),
  previewAsUser: authoringText('Preview as a user'),
  narratedDemo: authoringText('Narrated demo — auto-play'),
  productionBlocked: authoringText('Production — blocked from the SDK'),
  productionNote: authoringText(
    'Production is rejected at every layer. Promote a verified staging artifact from Operations → Release.',
  ),
  /**
   * The launcher's quick actions, printed here because the panel covers the
   * launcher (§3.3). Their labels now come from the shared experience menu, so
   * the two routes to the same list cannot end up naming it differently.
   *
   * `Experience type` used to head a group of its own here. It is one row under
   * Operations now — see the note in `mode-pill.ts` for why five bare rows next
   * to "New experience" was the wrong shape.
   */
  groupExperiences: authoringText('Experiences'),
  recordSteps: authoringText('Record steps from my clicks'),
  stopRecording: authoringText('Stop recording steps'),
  zoomCanvasIn: authoringText('Zoom the canvas in'),
  zoomCanvasOut: authoringText('Zoom the canvas out'),
  resetCanvasZoom: authoringText('Reset canvas zoom'),
  /** The map itself moved to the big modal — see overlay/keyboard-map.ts (§10). */
  restart: authoringText('Restart from the first step'),
  expand: authoringText('Show authoring status'),
  retry: authoringText('Retry'),
  /** §8.2. Editing a published experience makes a draft; the live artifact is untouched. */
  draftDiverged: authoringText('Unpublished changes since the last publish'),
  saved: authoringText('Saved'),
  saving: authoringText('Saving…'),
  reconnecting: authoringText('Reconnecting…'),
} as const;

/** §5 — the creator-facing name of each registered experience type. */
export const EXPERIENCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  tour: authoringText('Tour'),
  announcement: authoringText('Announcement'),
  hotspot: authoringText('Hotspot'),
  survey: authoringText('Survey'),
  checklist: authoringText('Checklist'),
  knowledge: authoringText('Knowledge'),
} as const;

/**
 * `2 people here` (§15.2). Presence is announced socially, before any locking logic
 * engages, because most conflicts are prevented by knowing someone else is there.
 */
export function peerPresenceLabel(count: number): string {
  return count === 1
    ? authoringText('1 other person here')
    : authoringText('{count} other people here', { count });
}

/** `Step 2 of 6` while composing — bound to the selection. */
export function composeProgressLabel(number: number, total: number): string {
  return authoringText('Step {number} of {total}', { number, total });
}

/** `Border colour didn't save` — §8.1, never a generic failure. */
export function saveFailureLabel(property: string): string {
  return authoringText('{property} didn’t save', { property });
}
