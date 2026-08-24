/**
 * The experiences flyout: one submenu, two hosts, two kinds.
 *
 * Opened by hovering a row rather than clicking it, because both rows name a
 * category and not an action — "New experience" was never a thing that could
 * happen on its own, only a question about which kind. Hover is the affordance;
 * click, Enter and the arrow key toward the flyout all do the same thing, since
 * a hover-only control is unreachable from a keyboard and absent on touch.
 *
 * Mounted beside its anchor rather than inside it. Both the pill and the
 * launcher carry a backdrop-filter, which would make either of them the
 * containing block for a fixed child, and the pill's menu is a scroll container
 * that would clip the flyout at its own edge.
 */
import { OVERLAY_GLYPHS } from '../authoring/overlay/icons';
import { CREATOR_ENABLED_EXPERIENCE_TYPES } from '../creator-experience-types';
import { confirmExperienceChange } from './confirm-dialog';
import {
  EXPERIENCE_MENU_COPY,
  changeTypeConfirmLabel,
  changeTypeConsequence,
  createExperienceLabel,
  defaultExperienceName,
  experienceRowTitle,
  experienceTypeLabel,
  noExperiencesMatching,
  openExperienceLabel,
  openExperienceOnPageLabel,
} from './copy';
import { experienceTypeGlyph } from './glyphs';
import { askForExperienceName } from './name-dialog';
import {
  createExperienceListController,
  type ExperienceListController,
  type ExperienceListState,
} from './paging';
import { applyAuthoringLocale, authoringNumber } from '../i18n';
import { EXPERIENCE_MENU_MAX_HEIGHT, EXPERIENCE_MENU_WIDTH } from './styles';
import type {
  CreatorExperienceScope,
  CreatorExperienceType,
  CreatorPageExperienceSummary,
  ExperienceMenuKind,
  ExperienceMenuProvider,
  ExperienceTypeSwitch,
} from './types';

/** Distance from the anchor, and from the viewport edge, in px. */
const FLYOUT_GAP = 8;
const VIEWPORT_MARGIN = 12;
/** Grace period for the diagonal between a row and the flyout it opened. */
const CLOSE_GRACE_MS = 220;
/** How close to the bottom of the list counts as "asking for more". */
const SCROLL_LOAD_THRESHOLD_PX = 120;

/**
 * The list, as two stacked scopes.
 *
 * "On this page" is what the creator came for and is open on arrival. The
 * second is every tour in the workspace — including the ones above it, which
 * is the point of a shortcut — and is collapsed but still loaded: its header
 * carries a count, and a count nobody fetched is not a count.
 */
const EXPERIENCE_SCOPES = [
  {
    scope: 'page',
    label: EXPERIENCE_MENU_COPY.onThisPage,
    empty: EXPERIENCE_MENU_COPY.emptyOnThisPage,
    expanded: true,
  },
  {
    scope: 'all',
    label: EXPERIENCE_MENU_COPY.allTours,
    empty: EXPERIENCE_MENU_COPY.emptyInWorkspace,
    expanded: false,
  },
] as const satisfies readonly {
  readonly scope: CreatorExperienceScope;
  readonly label: string;
  readonly empty: string;
  readonly expanded: boolean;
}[];

const IDLE_LIST_STATE: ExperienceListState = {
  items: [],
  status: 'idle',
  hasMore: false,
  query: '',
};

/** Distinguishes two mounted flyouts, so `aria-controls` still points at one list. */
let flyoutSequence = 0;

/** One accordion: its header, its rows, and the cursor that belongs to it alone. */
interface ExperienceScopeSection {
  readonly scope: CreatorExperienceScope;
  readonly emptyMessage: string;
  readonly controller: ExperienceListController;
  readonly element: HTMLElement;
  readonly head: HTMLButtonElement;
  readonly count: HTMLElement;
  readonly list: HTMLElement;
  expanded: boolean;
  state: ExperienceListState;
}

export interface ExperienceFlyoutOptions {
  readonly doc: Document;
  /** A shadow root for the pill, the page body for the launcher. */
  readonly container: HTMLElement | ShadowRoot;
  /** Read at open time, so a host may install its capabilities later than its chrome. */
  readonly provider: () => ExperienceMenuProvider | null;
  /** Only the panel supplies this: it is the surface with a document to convert. */
  readonly typeSwitch?: ExperienceTypeSwitch;
  /** The host's chance to dismiss its own menu once the flyout did something. */
  readonly onDone?: () => void;
  readonly onError?: (error: unknown) => void;
}

export interface ExperienceFlyout {
  readonly element: HTMLElement;
  open: (kind: ExperienceMenuKind, anchor: HTMLElement, options?: { focus?: boolean }) => void;
  toggle: (kind: ExperienceMenuKind, anchor: HTMLElement) => void;
  close: () => void;
  openKind: () => ExperienceMenuKind | null;
  /** Hover left the anchor. Cancelled if the pointer arrives in the flyout in time. */
  scheduleClose: () => void;
  cancelScheduledClose: () => void;
  destroy: () => void;
}

export function createExperienceFlyout(options: ExperienceFlyoutOptions): ExperienceFlyout {
  const { doc } = options;
  const element = doc.createElement('div');
  element.dataset['lodariqExperienceMenu'] = 'true';
  element.dataset['protectedChrome'] = 'true';
  element.dataset['lodariqAuthoringControl'] = 'true';
  element.hidden = true;
  /*
   * Its own reading direction, taken from the authoring locale.
   *
   * The menu is mounted on the host page, which is under no obligation to be in
   * the creator's language: authoring in Arabic on an English application is
   * the ordinary case, and inheriting that page's `dir` would leave the whole
   * menu — headers, chevrons, indentation — pointing the wrong way.
   */
  applyAuthoringLocale(element);

  const flyoutKey = `lodariq-experience-scope-${(flyoutSequence += 1)}`;
  let kind: ExperienceMenuKind | null = null;
  let anchor: HTMLElement | null = null;
  let sections: ExperienceScopeSection[] = [];
  let listProvider: ExperienceMenuProvider | null = null;
  let searchInput: HTMLInputElement | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  /** While a name is being asked for, the flyout stops listening for its own exits. */
  let dialogOpen = false;
  let destroyed = false;

  /**
   * Every control the arrow keys walk, in the order it is drawn.
   *
   * Section headers are in it because they are the only way to open the second
   * list, and the rows of a collapsed section are out of it because a focus
   * ring cannot land on something nobody can see.
   */
  function rows(): HTMLButtonElement[] {
    return [
      ...element.querySelectorAll<HTMLButtonElement>(
        '[data-experience-scope-head], [data-experience-row]:not([disabled])',
      ),
    ].filter((control) => control.closest('[hidden]') === null);
  }

  function cancelScheduledClose(): void {
    if (!closeTimer) return;
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  function scheduleClose(): void {
    cancelScheduledClose();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      if (!dialogOpen) close();
    }, CLOSE_GRACE_MS);
  }

  function close(): void {
    cancelScheduledClose();
    if (kind === null) return;
    for (const section of sections) section.controller.destroy();
    sections = [];
    listProvider = null;
    searchInput = null;
    kind = null;
    element.hidden = true;
    element.replaceChildren();
    anchor?.setAttribute('aria-expanded', 'false');
    anchor = null;
  }

  function place(): void {
    if (!anchor) return;
    const view = doc.defaultView ?? window;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = view.innerWidth;
    const viewportHeight = view.innerHeight;
    const height = Math.min(element.offsetHeight || EXPERIENCE_MENU_MAX_HEIGHT, viewportHeight);

    /*
     * Which side, decided by the room actually available.
     *
     * Left is right for a pill in the bottom-right corner, which is where it
     * starts — but the pill is draggable to all four, and a hardcoded side would
     * put the flyout off-screen in two of them.
     */
    const roomLeft = rect.left - VIEWPORT_MARGIN - FLYOUT_GAP;
    const roomRight = viewportWidth - rect.right - VIEWPORT_MARGIN - FLYOUT_GAP;
    const side = roomLeft >= EXPERIENCE_MENU_WIDTH || roomLeft >= roomRight ? 'left' : 'right';
    const rawLeft =
      side === 'left' ? rect.left - FLYOUT_GAP - EXPERIENCE_MENU_WIDTH : rect.right + FLYOUT_GAP;

    element.style.left = `${clamp(
      rawLeft,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewportWidth - EXPERIENCE_MENU_WIDTH - VIEWPORT_MARGIN),
    )}px`;
    // Top-aligned with the row that opened it, then pulled back inside the viewport.
    element.style.top = `${clamp(
      rect.top - 6,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN),
    )}px`;
    element.dataset['side'] = side;
  }

  function open(
    nextKind: ExperienceMenuKind,
    nextAnchor: HTMLElement,
    openOptions: { focus?: boolean } = {},
  ): void {
    cancelScheduledClose();
    if (kind === nextKind && anchor === nextAnchor) {
      place();
      if (openOptions.focus) focusFirst();
      return;
    }
    close();
    // The type switch belongs to the panel and needs no provider; the other two
    // are nothing without one, and print no rows rather than empty promises.
    const provider = options.provider();
    if (nextKind === 'change-experience-type' ? !options.typeSwitch : !provider) return;

    kind = nextKind;
    anchor = nextAnchor;
    anchor.setAttribute('aria-expanded', 'true');
    element.hidden = false;
    // A searchable list is not a menu: a menu may not contain a textbox, and a
    // screen reader that is told otherwise announces the field as a menu item.
    element.setAttribute('role', nextKind === 'experiences-on-page' ? 'dialog' : 'menu');

    if (nextKind === 'change-experience-type') renderTypeSwitch();
    else if (nextKind === 'new-experience') renderTypes(provider as ExperienceMenuProvider);
    else renderExperiences(provider as ExperienceMenuProvider);

    place();
    if (openOptions.focus) focusFirst();
  }

  function focusFirst(): void {
    if (searchInput) {
      searchInput.focus();
      return;
    }
    rows()[0]?.focus();
  }

  function header(title: string, hint: string): HTMLElement {
    const head = doc.createElement('header');
    head.className = 'lodariq-experience-menu-head';
    const heading = doc.createElement('strong');
    heading.textContent = title;
    const supporting = doc.createElement('span');
    supporting.textContent = hint;
    head.append(heading, supporting);
    element.setAttribute('aria-label', title);
    return head;
  }

  function row(config: {
    readonly glyph: string;
    readonly title: string;
    readonly description?: string;
    readonly badge?: string;
    readonly ariaLabel: string;
    readonly onActivate: () => Promise<void>;
  }): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'lodariq-experience-menu-row';
    button.dataset['experienceRow'] = 'true';
    button.setAttribute('role', kind === 'experiences-on-page' ? 'button' : 'menuitem');
    button.setAttribute('aria-label', config.ariaLabel);

    const glyph = doc.createElement('span');
    glyph.innerHTML = config.glyph;
    button.appendChild(glyph.firstElementChild ?? glyph);

    const copy = doc.createElement('span');
    copy.className = 'lodariq-experience-menu-copy';
    const name = doc.createElement('strong');
    name.textContent = config.title;
    copy.appendChild(name);
    if (config.description) {
      const description = doc.createElement('small');
      description.textContent = config.description;
      copy.appendChild(description);
    }
    button.appendChild(copy);

    if (config.badge) {
      const badge = doc.createElement('span');
      badge.className = 'lodariq-experience-menu-badge';
      badge.textContent = config.badge;
      button.appendChild(badge);
    }

    button.addEventListener('click', () => {
      if (button.getAttribute('aria-busy') === 'true') return;
      button.setAttribute('aria-busy', 'true');
      void config
        .onActivate()
        .catch((error: unknown) => options.onError?.(error))
        .finally(() => button.removeAttribute('aria-busy'));
    });
    return button;
  }

  /** A sentence, and the one thing worth offering next to it. */
  function status(
    message: string,
    action?: { readonly label: string; readonly onActivate: () => void },
  ): HTMLElement {
    const paragraph = doc.createElement('p');
    paragraph.className = 'lodariq-experience-menu-status';
    paragraph.setAttribute('aria-live', 'polite');
    paragraph.textContent = message;
    if (action) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', action.onActivate);
      paragraph.append(doc.createElement('br'), button);
    }
    return paragraph;
  }

  function renderTypes(provider: ExperienceMenuProvider): void {
    const list = doc.createElement('div');
    list.className = 'lodariq-experience-menu-list';
    list.setAttribute('role', 'group');

    for (const type of CREATOR_ENABLED_EXPERIENCE_TYPES) {
      const button = row({
        glyph: experienceTypeGlyph(type.id),
        title: type.label,
        description: type.description,
        badge: EXPERIENCE_MENU_COPY.create,
        ariaLabel: createExperienceLabel(type.label),
        onActivate: () => createExperienceOfType(provider, type.id),
      });
      button.dataset['lodariqExperienceType'] = type.id;
      list.appendChild(button);
    }

    element.replaceChildren(
      header(EXPERIENCE_MENU_COPY.newExperience, EXPERIENCE_MENU_COPY.newExperienceHint),
      list,
    );
  }

  /**
   * §5's switch, as one list behind one guarded row.
   *
   * It used to be five bare rows sitting directly under "New experience" in the
   * same menu — two adjacent lists of the same five names, one starting a
   * document and one converting this one. The current type is printed and
   * disabled rather than hidden, so the list does not silently change length.
   */
  function renderTypeSwitch(): void {
    const typeSwitch = options.typeSwitch;
    if (!typeSwitch) return;
    const current = typeSwitch.currentType();
    const list = doc.createElement('div');
    list.className = 'lodariq-experience-menu-list';
    list.setAttribute('role', 'group');

    for (const type of CREATOR_ENABLED_EXPERIENCE_TYPES) {
      if (type.id === current) {
        const marker = row({
          glyph: experienceTypeGlyph(type.id),
          title: type.label,
          badge: EXPERIENCE_MENU_COPY.currentType,
          ariaLabel: type.label,
          onActivate: () => Promise.resolve(),
        });
        marker.disabled = true;
        marker.setAttribute('aria-current', 'true');
        marker.dataset['lodariqSwitchType'] = type.id;
        list.appendChild(marker);
        continue;
      }
      const button = row({
        glyph: experienceTypeGlyph(type.id),
        title: type.label,
        description: type.description,
        ariaLabel: changeTypeConfirmLabel(type.label),
        onActivate: () => switchExperienceType(typeSwitch, type.id, type.label),
      });
      button.dataset['lodariqSwitchType'] = type.id;
      list.appendChild(button);
    }

    element.replaceChildren(
      header(EXPERIENCE_MENU_COPY.changeTypeTitle, EXPERIENCE_MENU_COPY.changeTypeHint),
      list,
    );
  }

  async function switchExperienceType(
    typeSwitch: ExperienceTypeSwitch,
    type: CreatorExperienceType,
    label: string,
  ): Promise<void> {
    dialogOpen = true;
    let agreed = false;
    try {
      agreed = await confirmExperienceChange({
        doc,
        container: options.container,
        title: EXPERIENCE_MENU_COPY.changeTypeTitle,
        body: changeTypeConsequence(typeSwitch.stepCount(), label),
        confirmLabel: changeTypeConfirmLabel(label),
        returnFocusTo: anchor,
      });
    } finally {
      dialogOpen = false;
    }
    if (!agreed) return;
    close();
    typeSwitch.onSwitch(type);
    options.onDone?.();
  }

  async function createExperienceOfType(
    provider: ExperienceMenuProvider,
    type: CreatorExperienceType,
  ): Promise<void> {
    if (!provider.createExperience) return;
    dialogOpen = true;
    let name: string | null = null;
    try {
      name = await askForExperienceName({
        doc,
        container: options.container,
        title: EXPERIENCE_MENU_COPY.nameTitle,
        hint: EXPERIENCE_MENU_COPY.nameHint,
        initialValue: defaultExperienceName(type),
        confirmLabel: EXPERIENCE_MENU_COPY.create,
        returnFocusTo: anchor,
      });
    } finally {
      dialogOpen = false;
    }
    // Backed out: the flyout stayed open behind the scrim, so the type list is
    // still there and the choice can be made again without re-navigating.
    if (name === null) return;
    await provider.createExperience(type, { title: name });
    close();
    options.onDone?.();
  }

  /**
   * The list, as two accordions under one search field.
   *
   * Each open section scrolls inside its own bounds rather than the whole stack
   * scrolling as one. One shared scroller reads better right up until the first
   * list pages: its rows push the second header past the bottom edge, and every
   * scroll toward that header loads ten more rows in front of it, so the second
   * list is never reached. Bounding the open one keeps both headers — and both
   * counts — on screen.
   *
   * Each scope keeps its own controller too: the cursor is an offset into a
   * filtered set, and a shared one would page whichever list asked last.
   */
  function renderExperiences(provider: ExperienceMenuProvider): void {
    listProvider = provider;

    const search = doc.createElement('div');
    search.className = 'lodariq-experience-menu-search';
    const glyph = doc.createElement('span');
    glyph.innerHTML = OVERLAY_GLYPHS.search;
    const input = doc.createElement('input');
    input.type = 'search';
    input.placeholder = EXPERIENCE_MENU_COPY.searchPlaceholder;
    input.setAttribute('aria-label', EXPERIENCE_MENU_COPY.searchPlaceholder);
    input.autocomplete = 'off';
    input.spellcheck = false;
    search.append(glyph.firstElementChild ?? glyph, input);
    searchInput = input;

    const scopes = doc.createElement('div');
    scopes.className = 'lodariq-experience-menu-scopes';
    sections = EXPERIENCE_SCOPES.map((definition) => createScopeSection(provider, definition));
    scopes.append(...sections.map((section) => section.element));

    element.replaceChildren(
      header(EXPERIENCE_MENU_COPY.viewExperiences, EXPERIENCE_MENU_COPY.viewExperiencesHint),
      search,
      scopes,
    );

    // One field over both: a creator searching for a tour by name does not know
    // which of the two lists it is in, which is the reason to search at all.
    input.addEventListener('input', () => {
      for (const section of sections) section.controller.setQuery(input.value);
    });
    for (const section of sections) section.controller.start();
  }

  function createScopeSection(
    provider: ExperienceMenuProvider,
    definition: (typeof EXPERIENCE_SCOPES)[number],
  ): ExperienceScopeSection {
    const listId = `${flyoutKey}-${definition.scope}`;
    const container = doc.createElement('section');
    container.className = 'lodariq-experience-menu-scope';
    // Only an open section is allowed to take room and scroll; a closed one is
    // its header and nothing else, which is what keeps it on screen.
    container.dataset['experienceScopeOpen'] = String(definition.expanded);

    // A button, not a div with a click handler: Enter and Space are what a
    // creator will press on it, and neither reaches anything else.
    const head = doc.createElement('button');
    head.type = 'button';
    head.className = 'lodariq-experience-menu-scope-head';
    head.dataset['experienceScopeHead'] = definition.scope;
    head.setAttribute('aria-expanded', String(definition.expanded));
    head.setAttribute('aria-controls', listId);
    const marker = doc.createElement('span');
    marker.innerHTML = OVERLAY_GLYPHS.chevronRight;
    const label = doc.createElement('strong');
    label.textContent = definition.label;
    const count = doc.createElement('span');
    count.className = 'lodariq-experience-menu-scope-count';
    head.append(marker.firstElementChild ?? marker, label, count);

    const list = doc.createElement('div');
    list.className = 'lodariq-experience-menu-scope-list';
    list.id = listId;
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', definition.label);
    list.hidden = !definition.expanded;
    container.append(head, list);

    const section: ExperienceScopeSection = {
      scope: definition.scope,
      emptyMessage: definition.empty,
      element: container,
      head,
      count,
      list,
      expanded: definition.expanded,
      state: IDLE_LIST_STATE,
      controller: createExperienceListController({
        list: (query) => provider.listExperiences?.({ ...query, scope: definition.scope }) ?? [],
        onChange: (state) => updateScope(definition.scope, state),
      }),
    };
    head.addEventListener('click', () => toggleScope(section));
    list.addEventListener('scroll', () => {
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - SCROLL_LOAD_THRESHOLD_PX) {
        section.controller.loadMore();
      }
    });
    return section;
  }

  function updateScope(scope: CreatorExperienceScope, state: ExperienceListState): void {
    const section = sections.find((candidate) => candidate.scope === scope);
    if (!section) return;
    section.state = state;
    renderScope(section);
  }

  function toggleScope(section: ExperienceScopeSection): void {
    section.expanded = !section.expanded;
    section.head.setAttribute('aria-expanded', String(section.expanded));
    section.list.hidden = !section.expanded;
    section.element.dataset['experienceScopeOpen'] = String(section.expanded);
    place();
    topUpScope(section);
  }

  function renderScope(section: ExperienceScopeSection): void {
    const provider = listProvider;
    if (!provider) return;
    const { state } = section;
    // Empty rather than zero while it is unknown: the stylesheet hides an empty
    // one, and "0" next to a list that has not answered yet is a wrong answer.
    section.count.textContent = state.total === undefined ? '' : authoringNumber(state.total);

    const children: Node[] = state.items.map((experience) =>
      experienceRow(provider, section, experience),
    );

    if (state.status === 'loading') {
      children.push(status(EXPERIENCE_MENU_COPY.loading));
    } else if (state.status === 'loading-more') {
      children.push(status(EXPERIENCE_MENU_COPY.loadingMore));
    } else if (state.status === 'error') {
      children.push(
        status(EXPERIENCE_MENU_COPY.failed, {
          label: EXPERIENCE_MENU_COPY.retry,
          onActivate: () => section.controller.start(),
        }),
      );
    } else if (state.items.length === 0) {
      children.push(emptyScope(provider, section));
    } else if (state.hasMore) {
      const sentinel = doc.createElement('div');
      sentinel.className = 'lodariq-experience-menu-sentinel';
      children.push(sentinel);
    }

    section.list.replaceChildren(...children);
    /*
     * Re-placed on every render, because the menu was positioned while it still
     * said "Loading experiences…" and then grew ten rows taller. The clamp that
     * keeps it inside the viewport had measured the loading state, so a list
     * opened from a launcher in the bottom corner ran off the bottom edge.
     */
    place();
    topUpScope(section);
  }

  /**
   * Nothing here is three different situations.
   *
   * A page with no experiences yet is where every creator starts, so it offers
   * the way out of it; an empty workspace says so and offers nothing, because
   * the row above it has already made the offer; a search that matched nothing
   * is neither.
   */
  function emptyScope(
    provider: ExperienceMenuProvider,
    section: ExperienceScopeSection,
  ): HTMLElement {
    const searched = section.state.query.trim();
    if (searched) return status(noExperiencesMatching(searched));
    if (section.scope !== 'page' || !provider.createExperience) {
      return status(section.emptyMessage);
    }
    return status(section.emptyMessage, {
      label: EXPERIENCE_MENU_COPY.newExperience,
      onActivate: () => {
        // Read before `open`, which closes this list and clears the anchor.
        const returnTo = anchor;
        if (returnTo) open('new-experience', returnTo, { focus: true });
      },
    });
  }

  /**
   * A first page shorter than the section is a page that can never be scrolled,
   * and a list that cannot scroll never asks for more. Only an open section is
   * topped up — a closed one keeps the single page its count came from.
   */
  function topUpScope(section: ExperienceScopeSection): void {
    if (!section.expanded || section.state.status !== 'ready' || !section.state.hasMore) return;
    if (section.list.scrollHeight > section.list.clientHeight) return;
    section.controller.loadMore();
  }

  function experienceRow(
    provider: ExperienceMenuProvider,
    section: ExperienceScopeSection,
    experience: CreatorPageExperienceSummary,
  ): HTMLButtonElement {
    const title = experienceRowTitle(experience);
    // Every row of the second list, including the ones repeated from the first:
    // that list spans pages, so a row without its page is half a row. Under
    // "On this page" the route is the same on every row and prints as noise.
    const page = section.scope === 'all' ? (experience.routeKey?.trim() ?? '') : '';
    const button = row({
      glyph: experienceTypeGlyph(experience.type),
      title,
      ...(page ? { description: page } : {}),
      badge: experienceTypeLabel(experience.type),
      ariaLabel: page ? openExperienceOnPageLabel(title, page) : openExperienceLabel(title),
      onActivate: async () => {
        if (!provider.openExperience) return;
        await provider.openExperience(experience.id);
        close();
        options.onDone?.();
      },
    });
    // A route reads left to right wherever it is printed: in Arabic the leading
    // slash is a neutral character and would otherwise be reordered to the end.
    if (page) button.querySelector('small')?.setAttribute('dir', 'ltr');
    button.dataset['lodariqExperienceId'] = experience.id;
    return button;
  }

  /** Arrow keys move between rows; the key pointing back at the anchor closes. */
  function onKeyDown(event: KeyboardEvent): void {
    if (kind === null || dialogOpen) return;
    if (!event.composedPath().includes(element)) return;
    const back = element.dataset['side'] === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const order = rows();
    const index = order.indexOf(doc.activeElement as HTMLButtonElement);

    if (event.key === 'Escape' || event.key === back) {
      event.preventDefault();
      event.stopPropagation();
      const returnTo = anchor;
      close();
      returnTo?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      order[index < 0 ? 0 : Math.min(index + 1, order.length - 1)]?.focus();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      // Up from the first row is how the search field is reached again.
      if (index <= 0 && searchInput) searchInput.focus();
      else order[Math.max(index - 1, 0)]?.focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      order[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      order[order.length - 1]?.focus();
    }
  }

  const onDocumentPointerDown = (event: Event): void => {
    if (kind === null || dialogOpen) return;
    const path = event.composedPath();
    if (path.includes(element)) return;
    if (anchor && path.includes(anchor)) return;
    close();
  };

  const onViewportChange = (): void => {
    if (kind !== null) place();
  };

  element.addEventListener('mouseenter', cancelScheduledClose);
  element.addEventListener('mouseleave', scheduleClose);
  element.addEventListener('keydown', onKeyDown);
  doc.addEventListener('pointerdown', onDocumentPointerDown, true);
  const view = doc.defaultView;
  view?.addEventListener('resize', onViewportChange);
  view?.addEventListener('scroll', onViewportChange, true);

  options.container.appendChild(element);

  return {
    element,
    open,
    toggle: (nextKind, nextAnchor) => {
      if (kind === nextKind && anchor === nextAnchor) {
        close();
        return;
      }
      open(nextKind, nextAnchor, { focus: true });
    },
    close,
    openKind: () => kind,
    scheduleClose,
    cancelScheduledClose,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      close();
      doc.removeEventListener('pointerdown', onDocumentPointerDown, true);
      view?.removeEventListener('resize', onViewportChange);
      view?.removeEventListener('scroll', onViewportChange, true);
      element.remove();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
