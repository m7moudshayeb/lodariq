/** Breathing room between a trigger and the menu it opens. */
export const MENU_GAP_PX = 6;

/** The closest a menu may sit to the edge of the frame it lives in. */
export const MENU_EDGE_PADDING_PX = 8;

/**
 * Where a floating menu goes, given its trigger (§4.2a).
 *
 * Below by default, above when there is no room, and always clamped inside the
 * viewport — the prototype's own flip. This lives apart from any one menu
 * because the second copy of it did not flip: the style menu opened downward
 * from a bar near the bottom of the frame and ran off the end, so its last rows
 * were unreachable. One implementation, so a menu cannot be born clipped.
 *
 * `available` is the room to solve inside. It is the iframe's viewport, which
 * the host grows while a menu is open — so this must be re-run after that
 * growth, not only when the menu first mounts.
 */
export function placeFloatingMenu(
  trigger: HTMLElement | null,
  menu: HTMLElement | null,
  align: 'left' | 'right' = 'left',
): { left: number; top: number } | null {
  const view = trigger?.ownerDocument.defaultView;
  if (!trigger || !menu || !view) return null;
  const rect = trigger.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const below = rect.bottom + MENU_GAP_PX;
  const top =
    below + height > view.innerHeight - MENU_EDGE_PADDING_PX
      ? Math.max(MENU_EDGE_PADDING_PX, rect.top - height - MENU_GAP_PX)
      : below;
  const left = align === 'right' ? rect.right - width : rect.left;
  return {
    left: clamp(
      left,
      MENU_EDGE_PADDING_PX,
      Math.max(MENU_EDGE_PADDING_PX, view.innerWidth - width - MENU_EDGE_PADDING_PX),
    ),
    top,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
