/**
 * The mode pill (§3.3, §4.1). Home for the two jobs the panel→page move left
 * homeless: the Editing ⇄ Browsing switch, and state (step, environment, save).
 * Audit #6 happened because state had no surface and got parasitised onto the
 * header. Constraints: it may never grow into a rail (§3.2), only its own pixels
 * intercept input, and every action here has a visible labelled control (§3.1a).
 */
import { CREATOR_CHROME_PEER_HUES } from '../../creator-chrome-tokens';
import { EXPERIENCE_MENU_COPY } from '../../experience-menu/copy';
import { experienceTypeGlyph } from '../../experience-menu/glyphs';
import { isExperienceMenuEvent } from '../../experience-menu/is-menu-event';
import { requestExperienceMenuProvider } from '../../experience-menu/provider-bridge';
import type { ExperienceFlyout } from '../../experience-menu/flyout';
import type { ExperienceMenuKind } from '../../experience-menu/types';
import { peerInitials } from '../presence/presence-model';
import { OVERLAY_PILL_IDLE_COLLAPSE_MS } from './constants';
import { escapeHtml } from './html';
import { OVERLAY_GLYPHS } from './icons';
import { KEYBOARD_MAP_COPY } from './keyboard-map';
import { PALETTE_COPY } from './palette-commands';
import {
  MODE_PILL_COPY,
  composeProgressLabel,
  peerPresenceLabel,
  saveFailureLabel,
} from './mode-pill-copy';
import type {
  ModePill,
  ModePillCallbacks,
  ModePillMode,
  ModePillPeer,
  ModePillSaveState,
  ModePillState,
} from './mode-pill.types';
import { OVERLAY_CHROME_CORNERS, type OverlayChromeCorner } from './solver.types';

/** Pointer travel before a press becomes a drag, so a drag never fires a click. */
const PILL_DRAG_THRESHOLD_PX = 4;
const PILL_CORNER_STORAGE_KEY = 'lodariq.authoring.mode-pill.corner';

const DEFAULT_STATE: ModePillState = {
  mode: 'editing',
  environment: 'Staging',
  stepNumber: null,
  stepCount: 0,
  save: 'saved',
  panelsHidden: false,
  peers: [],
  draftDiverged: false,
  experienceType: 'tour',
  experienceTypes: [],
  recording: false,
  canvasZoomable: false,
  environments: ['Dev', 'Staging'],
  launcherActions: [],
};

/** Status word plus the dot tone that pairs with it. Never a colour alone. */
const SAVE_PRESENTATION: Readonly<
  Record<ModePillSaveState, { readonly tone: string; readonly label: string }>
> = {
  saved: { tone: 'positive', label: MODE_PILL_COPY.saved },
  saving: { tone: 'attention', label: MODE_PILL_COPY.saving },
  retry: { tone: 'danger', label: MODE_PILL_COPY.retry },
  reconnecting: { tone: 'attention', label: MODE_PILL_COPY.reconnecting },
};

/** The pill collapses on its own only in Browsing — never while composing. */
const IDLE_COLLAPSE_MODES: ReadonlySet<ModePillMode> = new Set<ModePillMode>(['browsing']);

export function createModePill(doc: Document, callbacks: ModePillCallbacks): ModePill {
  const element = doc.createElement('div');
  element.className = 'overlay-mode-pill';
  element.dataset['protectedChrome'] = 'true';
  element.dataset['lodariqAuthoringControl'] = 'true';
  element.dataset['lodariqModePill'] = 'true';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', MODE_PILL_COPY.region);

  let state: ModePillState = { ...DEFAULT_STATE };
  let corner: OverlayChromeCorner = readStoredCorner();
  let collapsed = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let flyout: ExperienceFlyout | null = null;
  let flyoutLoading: Promise<void> | null = null;
  let pendingFlyoutOpen: {
    kind: ExperienceMenuKind;
    row: HTMLElement;
    focus: boolean;
  } | null = null;
  let destroyed = false;

  /**
   * Built on first use, not at construction.
   *
   * The flyout mounts beside the pill rather than inside it — the pill's menu is
   * a scroll container, and the pill itself carries a backdrop-filter, which
   * would make it the containing block for a fixed child. Its root is only
   * knowable once the pill has been attached, which is after this returns.
   */
  function openExperienceFlyout(kind: ExperienceMenuKind, row: HTMLElement, focus = false): void {
    if (flyout) {
      flyout.open(kind, row, { focus });
      return;
    }
    pendingFlyoutOpen = { kind, row, focus };
    flyoutLoading ??= import('../../experience-menu')
      .then((menu) => {
        if (destroyed) return;
        const root = element.getRootNode();
        const container =
          root instanceof ShadowRoot ? root : (element.parentElement ?? doc.body ?? element);
        flyout = menu.createExperienceFlyout({
          doc,
          container,
          provider: () => requestExperienceMenuProvider(doc.defaultView ?? window),
          typeSwitch: {
            currentType: () => state.experienceType,
            stepCount: () => state.stepCount,
            onSwitch: (type) => callbacks.onSwitchExperience(type),
          },
          onDone: () => closeMenu(),
          onError: (error) => callbacks.onExperienceMenuError?.(error),
        });
        const pending = pendingFlyoutOpen;
        pendingFlyoutOpen = null;
        if (pending?.row.isConnected) {
          flyout.open(pending.kind, pending.row, { focus: pending.focus });
        }
      })
      .catch((error: unknown) => {
        flyoutLoading = null;
        pendingFlyoutOpen = null;
        callbacks.onExperienceMenuError?.(error);
      });
  }

  const render = (): void => {
    // Every row this could be anchored to is about to be replaced, so a flyout
    // left open would be pointing at a node that no longer exists.
    flyout?.close();
    element.dataset['mode'] = state.mode;
    element.dataset['corner'] = corner;
    element.dataset['collapsed'] = collapsed ? 'true' : 'false';
    element.innerHTML = collapsed ? renderCollapsed() : renderComposing(state, corner);
    wire();
  };

  function on(selector: string, handler: () => void): void {
    const node = element.querySelector<HTMLElement>(selector);
    node?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
  }

  function wire(): void {
    on('[data-pill-expand]', () => setCollapsed(false));
    on('[data-pill-mode="editing"]', () => callbacks.onModeChange('editing'));
    on('[data-pill-mode="browsing"]', () => callbacks.onModeChange('browsing'));
    on('[data-pill-preview]', () => callbacks.onPreview());
    on('[data-pill-menu-preview]', () => runFromMenu(callbacks.onPreview));
    on('[data-pill-retry]', () => callbacks.onRetrySave());
    on('[data-pill-menu]', () => toggleMenu());
    on('[data-pill-operations]', () => runFromMenu(callbacks.onOpenOperations));
    on('[data-pill-toggle-panels]', () => runFromMenu(callbacks.onToggleAllPanels));
    on('[data-pill-collapse]', () => {
      closeMenu();
      setCollapsed(true);
    });
    on('[data-pill-exit-authoring]', () => runFromMenu(callbacks.onExitAuthoring));
    for (const tab of MENU_OPERATIONS_TABS) {
      on(`[data-pill-operations-tab="${tab.tab}"]`, () =>
        runFromMenu(() => callbacks.onOpenOperations(tab.tab)),
      );
    }
    for (const environment of state.environments) {
      on(`[data-pill-environment="${environment}"]`, () =>
        runFromMenu(() => callbacks.onEnvironmentChange(environment)),
      );
    }
    wireSubmenuRows();
    on('[data-pill-record]', () => runFromMenu(callbacks.onToggleRecording));
    on('[data-pill-zoom-in]', () => runFromMenu(() => callbacks.onCanvasZoom('in')));
    on('[data-pill-zoom-out]', () => runFromMenu(() => callbacks.onCanvasZoom('out')));
    on('[data-pill-zoom-reset]', () => runFromMenu(() => callbacks.onCanvasZoom('reset')));
    on('[data-pill-keyboard-map]', () => runFromMenu(callbacks.onKeyboardMap));
    on('[data-pill-command-palette]', () => runFromMenu(callbacks.onCommandPalette));
    on('[data-pill-restart]', () => runFromMenu(callbacks.onRestart));
  }

  /**
   * The two rows that open a submenu instead of running (§3.3).
   *
   * Not routed through `on()` on purpose: that helper closes the menu, and these
   * rows are the menu's own navigation. Hover is the affordance the creator will
   * find; click, Enter and the arrow key toward the flyout are what make it
   * reachable without a mouse.
   */
  function wireSubmenuRows(): void {
    const submenus: { selector: string; kind: ExperienceMenuKind }[] = [
      ...LAUNCHER_QUICK_ACTIONS.filter((action) => state.launcherActions.includes(action.id)).map(
        (action) => ({
          selector: `[data-pill-launcher-action="${action.id}"]`,
          kind: action.kind as ExperienceMenuKind,
        }),
      ),
      ...(state.experienceTypes.length > 0
        ? [
            {
              selector: '[data-pill-change-experience-type]',
              kind: 'change-experience-type' as ExperienceMenuKind,
            },
          ]
        : []),
    ];

    for (const submenu of submenus) {
      const row = element.querySelector<HTMLElement>(submenu.selector);
      if (!row) continue;
      const side = row.dataset['pillSubmenu'] === 'right' ? 'right' : 'left';
      const forward = side === 'left' ? 'ArrowLeft' : 'ArrowRight';

      row.addEventListener('mouseenter', () => openExperienceFlyout(submenu.kind, row));
      row.addEventListener('mouseleave', () => flyout?.scheduleClose());
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (flyout) flyout.toggle(submenu.kind, row);
        else openExperienceFlyout(submenu.kind, row);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== forward && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openExperienceFlyout(submenu.kind, row, true);
      });
    }
  }

  function menuElement(): HTMLElement | null {
    return element.querySelector<HTMLElement>('[data-pill-menu-list]');
  }

  function setMenuOpen(open: boolean): void {
    const menu = menuElement();
    if (!menu) return;
    menu.hidden = !open;
    element.querySelector('[data-pill-menu]')?.setAttribute('aria-expanded', String(open));
  }

  function toggleMenu(): void {
    setMenuOpen(menuElement()?.hidden === true);
  }

  function closeMenu(): void {
    flyout?.close();
    if (menuElement()?.hidden !== false) return;
    setMenuOpen(false);
  }

  function runFromMenu(action: () => void): void {
    closeMenu();
    action();
  }

  function setCollapsed(next: boolean): void {
    if (collapsed === next) return;
    collapsed = next;
    render();
    restartIdleTimer();
  }

  function restartIdleTimer(): void {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (collapsed || !IDLE_COLLAPSE_MODES.has(state.mode)) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      setCollapsed(true);
    }, OVERLAY_PILL_IDLE_COLLAPSE_MS);
  }

  const stopDrag = attachPillDrag(element, {
    onSettle: (next) => {
      if (next === corner) return;
      corner = next;
      element.dataset['corner'] = corner;
      writeStoredCorner(corner);
      callbacks.onCornerChange?.(corner);
    },
    onDoubleTap: () => setCollapsed(!collapsed),
  });

  /**
   * `composedPath`, not `contains`.
   *
   * The pill lives in the panel's shadow root, so an event listened for on the
   * document has its target retargeted to the host element — `element.contains`
   * is then false for the pill's *own* clicks. Every menu item closed the menu on
   * `pointerdown`, so the `click` never reached it and landed on the page instead,
   * which the click-outside guard read as "leave the editor". Operations, Preview
   * and Exit all did nothing but collapse the overlay.
   */
  const onDocumentPointerDown = (event: Event): void => {
    if (event.composedPath().includes(element)) return;
    // The submenu and its name dialog are mounted outside the pill, so without
    // this the first click inside either one closed the menu behind them.
    if (isExperienceMenuEvent(event)) return;
    closeMenu();
  };
  doc.addEventListener('pointerdown', onDocumentPointerDown, true);

  /**
   * The two shortcuts the menu prints, bound where the actions already live.
   *
   * Both were printed and neither was listened for — a keyboard map is a promise,
   * and the menu was making it twice a week to anyone who read the rows.
   */
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.shiftKey && (event.key === '\\' || event.code === 'Backslash')) {
      event.preventDefault();
      callbacks.onToggleAllPanels();
      return;
    }
    if (command || event.altKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== 'p' || state.mode === 'previewing') return;
    event.preventDefault();
    callbacks.onPreview();
  };
  doc.addEventListener('keydown', onDocumentKeyDown);

  render();
  restartIdleTimer();

  return {
    element,
    state: () => ({ ...state }),
    corner: () => corner,
    setCorner: (next) => {
      corner = next;
      element.dataset['corner'] = corner;
    },
    setCollapsed,
    setState: (patch) => {
      const next = { ...state, ...patch };
      if (isSameState(state, next)) return;
      const modeChanged = state.mode !== next.mode;
      state = next;
      // Returning to Editing always brings the pill back; a dot must not hide the switch.
      if (modeChanged && next.mode === 'editing') collapsed = false;
      render();
      if (modeChanged) restartIdleTimer();
    },
    destroy: () => {
      destroyed = true;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      flyout?.destroy();
      flyout = null;
      flyoutLoading = null;
      pendingFlyoutOpen = null;
      stopDrag();
      doc.removeEventListener('pointerdown', onDocumentPointerDown, true);
      doc.removeEventListener('keydown', onDocumentKeyDown);
      element.remove();
    },
  };
}

/**
 * Every field the menu draws from, not just the ones on the pill's face.
 *
 * A patch that changes nothing here is dropped *before* `state` is assigned, so
 * an omitted field is not merely a missed repaint — the pill keeps the old value
 * forever. `experienceType` was missing, and the type-switch submenu reads it to
 * decide which row is the current one: after a switch the menu still called the
 * old type current and printed the new one as an option, which made switching
 * back impossible because the row leading home was the disabled one.
 *
 * `recording` was missing too, so the Record row never became Stop recording.
 */
function isSameState(a: ModePillState, b: ModePillState): boolean {
  return (
    a.mode === b.mode &&
    a.environment === b.environment &&
    a.stepNumber === b.stepNumber &&
    a.stepCount === b.stepCount &&
    a.save === b.save &&
    a.saveProperty === b.saveProperty &&
    a.panelsHidden === b.panelsHidden &&
    samePeers(a.peers, b.peers) &&
    a.draftDiverged === b.draftDiverged &&
    a.experienceType === b.experienceType &&
    a.recording === b.recording &&
    a.canvasZoomable === b.canvasZoomable &&
    sameStrings(a.environments, b.environments) &&
    sameStrings(a.launcherActions, b.launcherActions) &&
    a.experienceTypes.length === b.experienceTypes.length &&
    a.experienceTypes.every((entry, index) => entry.type === b.experienceTypes[index]?.type)
  );
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function samePeers(a: readonly ModePillPeer[], b: readonly ModePillPeer[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (peer, index) =>
        peer.creatorId === b[index]?.creatorId &&
        peer.name === b[index]?.name &&
        peer.detail === b[index]?.detail,
    )
  );
}

function renderCollapsed(): string {
  return `
    <button
      type="button"
      class="overlay-mode-pill-dot"
      data-pill-expand
      aria-label="${escapeHtml(MODE_PILL_COPY.expand)}"
      title="${escapeHtml(MODE_PILL_COPY.expand)}"
    ><span aria-hidden="true"></span></button>
  `;
}

/** Switch first and largest, then state, then the menu (§4.1). */
function renderComposing(state: ModePillState, corner: OverlayChromeCorner): string {
  const editing = state.mode !== 'browsing';
  return `
    <span class="overlay-mode-pill-grip" aria-hidden="true" title="${escapeHtml(MODE_PILL_COPY.drag)}">${OVERLAY_GLYPHS.grip}</span>
    <div class="overlay-mode-pill-switch" role="radiogroup" aria-label="${escapeHtml(MODE_PILL_COPY.region)}">
      ${switchButton('editing', MODE_PILL_COPY.editing, MODE_PILL_COPY.editingHint, editing, OVERLAY_GLYPHS.pencil)}
      ${switchButton('browsing', MODE_PILL_COPY.browsing, MODE_PILL_COPY.browsingHint, !editing, OVERLAY_GLYPHS.cursor)}
    </div>
    ${renderStatus(state)}
    ${renderPeers(state.peers)}
    <button
      type="button"
      class="overlay-mode-pill-preview"
      data-pill-preview
      title="${escapeHtml(MODE_PILL_COPY.previewAsUser)}"
    >${OVERLAY_GLYPHS.eye}<span>${escapeHtml(MODE_PILL_COPY.preview)}</span></button>
    <button
      type="button"
      class="overlay-mode-pill-icon"
      data-pill-menu
      aria-haspopup="true"
      aria-expanded="false"
      aria-label="${escapeHtml(MODE_PILL_COPY.more)}"
      title="${escapeHtml(MODE_PILL_COPY.more)}"
    >${OVERLAY_GLYPHS.chevronDown}</button>
    <div class="overlay-mode-pill-menu" data-pill-menu-list hidden role="menu">
      ${renderMenu(state, corner)}
    </div>
  `;
}

function switchButton(
  mode: 'editing' | 'browsing',
  label: string,
  hint: string,
  active: boolean,
  glyph: string,
): string {
  return `
    <button
      type="button"
      role="radio"
      data-pill-mode="${mode}"
      aria-checked="${active}"
      title="${escapeHtml(hint)}"
    >${glyph}<span>${escapeHtml(label)}</span></button>
  `;
}

/** The one authoring pixel that survives preview (§4.7), bound to the runtime step. */
/** Hairline between status facts, so three words do not read as one sentence. */
const RULE = '<span class="overlay-mode-pill-rule" aria-hidden="true"></span>';

function renderStatus(state: ModePillState): string {
  const save = SAVE_PRESENTATION[state.save];
  const progress =
    state.stepNumber == null ? '' : composeProgressLabel(state.stepNumber, state.stepCount);
  const saveText =
    state.save === 'retry' && state.saveProperty
      ? saveFailureLabel(state.saveProperty)
      : save.label;
  return `
    <span class="overlay-mode-pill-status">
      <span class="overlay-mode-pill-tone" data-tone="${save.tone}" aria-hidden="true"></span>
      <span class="overlay-mode-pill-env" data-draft-diverged="${state.draftDiverged ? 'true' : 'false'}">
        ${escapeHtml(state.environment)}${
          state.draftDiverged
            ? `<span class="overlay-mode-pill-diverged" data-pill-diverged title="${escapeHtml(MODE_PILL_COPY.draftDiverged)}" aria-label="${escapeHtml(MODE_PILL_COPY.draftDiverged)}" role="img"></span>`
            : ''
        }
      </span>
      ${progress ? `${RULE}<span class="overlay-mode-pill-progress">${escapeHtml(progress)}</span>` : ''}
      ${RULE}<span class="overlay-mode-pill-save">${escapeHtml(saveText)}</span>
    </span>
    ${
      state.save === 'retry'
        ? `<button type="button" class="overlay-mode-pill-quiet" data-pill-retry>${escapeHtml(MODE_PILL_COPY.retry)}</button>`
        : ''
    }
  `;
}

/** More than this and the pill starts growing into a rail (§3.2). */
const PILL_FACE_LIMIT = 3;

/**
 * Who else is here, as faces (§4.1). Overlapped circles rather than a sentence:
 * the count is glanceable at a size a sentence is not, and the pill has no room
 * for one. Initials, not photos — presence must not depend on an avatar service.
 *
 * The sentence is still rendered, visually hidden, so a screen reader hears the
 * fact rather than a row of initials.
 */
function renderPeers(peers: readonly ModePillPeer[]): string {
  if (peers.length === 0) return '';
  const shown = peers.slice(0, PILL_FACE_LIMIT);
  const overflow = peers.length - shown.length;
  const names = peers.map((peer) => peer.detail ?? peer.name).join(', ');
  return `
    <span class="overlay-mode-pill-faces" data-pill-peers="${peers.length}" title="${escapeHtml(names)}">
      ${shown
        .map(
          (peer) =>
            `<span class="overlay-mode-pill-face" data-peer style="background:${peerHue(peer.creatorId)}" aria-hidden="true">${escapeHtml(
              peerInitials(peer.name),
            )}</span>`,
        )
        .join('')}
      ${overflow > 0 ? `<span class="overlay-mode-pill-face" data-peer-overflow aria-hidden="true">+${overflow}</span>` : ''}
      <span class="overlay-mode-pill-peers-text">${escapeHtml(peerPresenceLabel(peers.length))}</span>
    </span>
  `;
}

/**
 * A bare-letter shortcut must never fire into someone's typing. Editing inside
 * the card happens in the frame, whose keystrokes never reach this document —
 * this guard is for the customer's own inputs, reachable while Browsing.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !=
    null
  );
}

/** Stable per person: the same creator keeps the same colour across sessions. */
function peerHue(creatorId: string): string {
  let hash = 0;
  for (let index = 0; index < creatorId.length; index += 1) {
    hash = (hash * 31 + creatorId.charCodeAt(index)) % 100_000;
  }
  return CREATOR_CHROME_PEER_HUES[hash % CREATOR_CHROME_PEER_HUES.length]!;
}

/**
 * The pill's only route to Tier 3 (§3.3).
 *
 * Grouped rather than a flat list: a menu of a dozen unlabelled rows is a list
 * nobody reads. Only rows with somewhere to go are printed — a menu that names a
 * capability the build does not have is worse than one that is short.
 */
function renderMenu(state: ModePillState, corner: OverlayChromeCorner): string {
  const panels = state.panelsHidden ? MODE_PILL_COPY.showAllPanels : MODE_PILL_COPY.hideAllPanels;
  /*
   * Which way the submenu chevron points.
   *
   * The pill is draggable to any of the four corners, so this cannot be a fixed
   * "left". Parked on the right — where it starts — the room is on the left, and
   * the flyout's own placement makes the same call from the same fact.
   */
  const submenuSide: 'left' | 'right' = corner.endsWith('right') ? 'left' : 'right';

  const groups: Array<{ label?: string; rows: readonly MenuRow[]; note?: string }> = [
    /* Ungrouped and first: the palette reaches every row below it, so it is the
     * one entry that is about the menu rather than in it (§7.5). */
    {
      rows: [
        {
          key: 'command-palette',
          label: PALETTE_COPY.open,
          shortcut: '⌘K',
          icon: OVERLAY_GLYPHS.sparkle,
        },
      ],
    },
    /*
     * The launcher's quick actions (§3.3). While the panel is open the launcher
     * is hidden outright — chrome floating over the corner the pill wants — so
     * this group is the only route left to them. Rows print only for actions the
     * launcher actually has, because a row naming a capability this build lacks
     * is worse than a shorter menu.
     */
    {
      label: MODE_PILL_COPY.groupExperiences,
      rows: LAUNCHER_QUICK_ACTIONS.filter((action) =>
        state.launcherActions.includes(action.id),
      ).map((action) => ({
        key: `launcher-${action.id}`,
        label: action.label,
        attribute: `data-pill-launcher-action="${action.id}"`,
        icon: action.icon,
        submenu: submenuSide,
      })),
    },
    /*
     * This experience: what can be done to the document that is already open.
     *
     * The type switch lives here now, behind one row instead of five. Printed
     * flat it was a second list of the same five type names sitting directly
     * under "New experience" — one starts a document, the other converts this
     * one, and nothing in the two rows above said which was which. Switching
     * re-filters the canvas by the new type's root blocks, so converting a Tour
     * empties the canvas; the row leads to a confirm that says so.
     */
    {
      label: MODE_PILL_COPY.groupOperations,
      rows: [
        { key: 'operations', label: MODE_PILL_COPY.operations, icon: OVERLAY_GLYPHS.layers },
        ...MENU_OPERATIONS_TABS.filter((entry) => entry.tab !== 'narration').map((entry) => ({
          key: `operations-tab-${entry.tab}`,
          label: entry.label,
          attribute: `data-pill-operations-tab="${entry.tab}"`,
          icon: entry.icon,
        })),
        // Only once the build has types to switch between.
        ...(state.experienceTypes.length > 0
          ? [
              {
                key: 'change-experience-type',
                label: EXPERIENCE_MENU_COPY.changeType,
                icon: experienceTypeGlyph(state.experienceType),
                submenu: submenuSide,
              },
            ]
          : []),
      ],
    },
    {
      label: MODE_PILL_COPY.groupPlay,
      rows: [
        {
          key: 'preview',
          label: MODE_PILL_COPY.previewAsUser,
          attribute: 'data-pill-menu-preview',
          shortcut: 'P',
          icon: OVERLAY_GLYPHS.eye,
        },
        {
          key: 'operations-tab-narration',
          label: MODE_PILL_COPY.narratedDemo,
          attribute: 'data-pill-operations-tab="narration"',
          icon: OVERLAY_GLYPHS.volume,
        },
        {
          key: 'record',
          label: state.recording ? MODE_PILL_COPY.stopRecording : MODE_PILL_COPY.recordSteps,
          icon: OVERLAY_GLYPHS.crosshair,
        },
      ],
    },
    {
      label: MODE_PILL_COPY.groupEnvironment,
      rows: [
        ...state.environments.map((environment) => ({
          key: `environment-${environment}`,
          label: environment,
          attribute: `data-pill-environment="${environment}"`,
          current: environment === state.environment,
        })),
        // Printed, not hidden: a creator who cannot find Production assumes it is
        // a missing feature rather than a deliberate refusal.
        { key: 'environment-production', label: MODE_PILL_COPY.productionBlocked, disabled: true },
      ],
      note: MODE_PILL_COPY.productionNote,
    },
    {
      rows: [
        { key: 'toggle-panels', label: panels, shortcut: '⌘⇧\\', icon: OVERLAY_GLYPHS.eye },
        {
          key: 'zoom-in',
          label: MODE_PILL_COPY.zoomCanvasIn,
          icon: OVERLAY_GLYPHS.zoomIn,
          disabled: !state.canvasZoomable,
        },
        {
          key: 'zoom-out',
          label: MODE_PILL_COPY.zoomCanvasOut,
          icon: OVERLAY_GLYPHS.zoomOut,
          disabled: !state.canvasZoomable,
        },
        {
          key: 'zoom-reset',
          label: MODE_PILL_COPY.resetCanvasZoom,
          icon: OVERLAY_GLYPHS.refresh,
          disabled: !state.canvasZoomable,
        },
        { key: 'keyboard-map', label: KEYBOARD_MAP_COPY.title, icon: OVERLAY_GLYPHS.help },
        { key: 'restart', label: MODE_PILL_COPY.restart, icon: OVERLAY_GLYPHS.refresh },
        { key: 'collapse', label: MODE_PILL_COPY.collapse, icon: OVERLAY_GLYPHS.minimize },
        {
          key: 'exit-authoring',
          label: MODE_PILL_COPY.exitAuthoring,
          icon: OVERLAY_GLYPHS.external,
        },
      ],
      ...(state.canvasZoomable ? {} : { note: MODE_PILL_COPY.canvasZoomUnavailable }),
    },
  ].filter((group) => group.rows.length > 0);

  return groups.map((group) => renderMenuGroup(group)).join('');
}

interface MenuRow {
  readonly key: string;
  readonly label: string;
  /** Set when the row is an attribute-addressed variant rather than its own key. */
  readonly attribute?: string;
  readonly current?: boolean;
  readonly disabled?: boolean;
  /** Printed right-aligned. The row still works without anyone knowing it. */
  readonly shortcut?: string;
  /** What makes a fifteen-row menu scannable. Absent leaves the gutter empty. */
  readonly icon?: string;
  /**
   * Opens a flyout instead of doing something. Renders a chevron pointing at the
   * side the flyout will appear on, so the row promises what it delivers.
   */
  readonly submenu?: 'left' | 'right';
}

/** §5's glyphs now live with the experience menu, which draws the same list. */

function renderMenuGroup(group: {
  label?: string;
  rows: readonly MenuRow[];
  note?: string;
}): string {
  // An unlabelled group still needs separating, or its rows read as the last one's.
  const heading = group.label
    ? `<p class="overlay-mode-pill-menu-group" aria-hidden="true">${escapeHtml(group.label)}</p>`
    : '<div class="overlay-mode-pill-menu-rule" aria-hidden="true"></div>';
  const note = group.note
    ? `<p class="overlay-mode-pill-menu-note">${escapeHtml(group.note)}</p>`
    : '';
  return `
    ${heading}
    ${group.rows
      .map((row) => {
        const address = row.attribute ?? `data-pill-${row.key}`;
        const state = row.current ? ' aria-current="true"' : '';
        const disabled = row.disabled ? ' disabled' : '';
        const shortcut = row.shortcut
          ? `<kbd class="overlay-mode-pill-menu-key">${escapeHtml(row.shortcut)}</kbd>`
          : '';
        const submenu = row.submenu
          ? ` aria-haspopup="true" aria-expanded="false" data-pill-submenu="${row.submenu}"`
          : '';
        /*
         * One marker, always the same, always trailing.
         *
         * It used to point at whichever side the flyout would open on, which
         * put a left-pointing caret on the right-hand edge of the row and read
         * as a mistake rather than as a promise. A trailing chevron in the
         * reading direction is what every menu uses for "there is a submenu
         * here" — it is not a claim about where on screen it will appear, and
         * the flyout picks that from the room it has. Mirrored for RTL by CSS.
         */
        const chevron = row.submenu
          ? `<span class="overlay-mode-pill-menu-more" aria-hidden="true">${OVERLAY_GLYPHS.chevronRight}</span>`
          : '';
        return `<button type="button" role="menuitem" ${address}${state}${disabled}${submenu}>${
          row.icon ?? ''
        }<span>${escapeHtml(row.label)}</span>${shortcut}${chevron}</button>`;
      })
      .join('')}
    ${note}
  `;
}

/**
 * Sections worth a direct route. Narration is here so its row is wired, but it
 * is printed under Play — it is something a creator watches, not a report.
 */
/**
 * The launcher's quick actions, as menu rows (§3.3).
 *
 * The panel hides the launcher while it is open, so this is the only route left
 * to them. Both open a submenu rather than doing something, because both name a
 * category: "New experience" was never an action on its own, only a question
 * about which kind, and the answer is a list either way.
 *
 * `preview-as-user` is deliberately absent: Play already carries it.
 */
const LAUNCHER_QUICK_ACTIONS = [
  {
    id: 'new-experience',
    label: EXPERIENCE_MENU_COPY.newExperience,
    icon: OVERLAY_GLYPHS.plus,
    kind: 'new-experience',
  },
  {
    id: 'experiences-on-page',
    label: EXPERIENCE_MENU_COPY.viewExperiences,
    icon: OVERLAY_GLYPHS.list,
    kind: 'experiences-on-page',
  },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: string;
  kind: ExperienceMenuKind;
}[];

const MENU_OPERATIONS_TABS = [
  { tab: 'flow', label: MODE_PILL_COPY.flowMap, icon: OVERLAY_GLYPHS.map },
  { tab: 'storyboard', label: MODE_PILL_COPY.storyboard, icon: OVERLAY_GLYPHS.columns },
  { tab: 'check', label: MODE_PILL_COPY.checkReport, icon: OVERLAY_GLYPHS.shield },
  { tab: 'review', label: MODE_PILL_COPY.releaseReview, icon: OVERLAY_GLYPHS.rocket },
  { tab: 'narration', label: MODE_PILL_COPY.narratedDemo, icon: OVERLAY_GLYPHS.volume },
] as const;

interface PillDragHandlers {
  readonly onSettle: (corner: OverlayChromeCorner) => void;
  readonly onDoubleTap: () => void;
}

/**
 * Drag with a movement threshold, magnetized to the nearest corner on release.
 * Corners rather than free positions, because the layer manager also picks a
 * corner when chrome collides with the card and two models would fight.
 */
function attachPillDrag(element: HTMLElement, handlers: PillDragHandlers): () => void {
  let origin: { x: number; y: number; left: number; top: number } | null = null;
  let dragging = false;

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('button') != null;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isControl(event.target)) return;
    const rect = element.getBoundingClientRect();
    origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    element.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!dragging && Math.hypot(dx, dy) < PILL_DRAG_THRESHOLD_PX) return;
    dragging = true;
    element.dataset['dragging'] = 'true';
    element.style.left = `${origin.left + dx}px`;
    element.style.top = `${origin.top + dy}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  };

  const onPointerUp = (): void => {
    if (!origin) return;
    origin = null;
    if (!dragging) return;
    dragging = false;
    delete element.dataset['dragging'];
    const settled = nearestCorner(element.getBoundingClientRect(), {
      width: element.ownerDocument.documentElement.clientWidth,
      height: element.ownerDocument.documentElement.clientHeight,
    });
    element.style.left = '';
    element.style.top = '';
    element.style.right = '';
    element.style.bottom = '';
    handlers.onSettle(settled);
  };

  const onDoubleClick = (event: MouseEvent): void => {
    if (isControl(event.target)) return;
    handlers.onDoubleTap();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);
  element.addEventListener('dblclick', onDoubleClick);
  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerUp);
    element.removeEventListener('dblclick', onDoubleClick);
  };
}

export function nearestCorner(
  rect: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
): OverlayChromeCorner {
  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;
  const vertical = centreY > viewport.height / 2 ? 'bottom' : 'top';
  const horizontal = centreX > viewport.width / 2 ? 'right' : 'left';
  const candidate = `${vertical}-${horizontal}` as OverlayChromeCorner;
  return OVERLAY_CHROME_CORNERS.includes(candidate) ? candidate : OVERLAY_CHROME_CORNERS[0];
}

/** Only the corner is remembered — a UI preference, never session state. */
function readStoredCorner(): OverlayChromeCorner {
  try {
    const stored = globalThis.localStorage?.getItem(PILL_CORNER_STORAGE_KEY);
    const match = OVERLAY_CHROME_CORNERS.find((candidate) => candidate === stored);
    return match ?? OVERLAY_CHROME_CORNERS[0];
  } catch {
    return OVERLAY_CHROME_CORNERS[0];
  }
}

function writeStoredCorner(corner: OverlayChromeCorner): void {
  try {
    globalThis.localStorage?.setItem(PILL_CORNER_STORAGE_KEY, corner);
  } catch {
    /* Partitioned or private-mode storage: the default corner is fine. */
  }
}
