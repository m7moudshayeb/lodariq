/**
 * Kept in a module of its own so the launcher can import it without the menu.
 *
 * Every "did the creator click away?" guard on the page needs this, including
 * the ones that run before the menu has ever been opened — and the launcher
 * ships on the customer's page, where the rest of the menu has no business
 * being until somebody asks for it.
 */

/** Whether an event happened inside the experiences menu or its name dialog. */
export function isExperienceMenuEvent(event: Event): boolean {
  return event
    .composedPath()
    .some(
      (node) =>
        node instanceof Element &&
        (node.hasAttribute('data-lodariq-experience-menu') ||
          node.hasAttribute('data-lodariq-experience-dialog-scrim')),
    );
}
