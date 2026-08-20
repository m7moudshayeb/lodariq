/**
 * The mode pill (§3.3, §4.1). Home for the two jobs the panel→page move left
 * homeless: the Editing ⇄ Browsing switch, and state (step, environment, save).
 * Audit #6 happened because state had no surface and got parasitised onto the
 * header. Constraints: it may never grow into a rail (§3.2), only its own pixels
 * intercept input, and every action here has a visible labelled control (§3.1a).
 */
import { CREATOR_CHROME_PEER_HUES } from '../../creator-chrome-tokens';
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
  environments: ['Dev', 'Staging'],
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

  const render = (): void => {
    element.dataset['mode'] = state.mode;
    element.dataset['corner'] = corner;
    element.dataset['collapsed'] = collapsed ? 'true' : 'false';
    element.innerHTML = collapsed ? renderCollapsed() : renderComposing(state);
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
    for (const entry of state.experienceTypes) {
      on(`[data-pill-experience="${entry.type}"]`, () =>
        runFromMenu(() => callbacks.onSwitchExperience(entry.type)),
      );
    }
    for (const environment of state.environments) {
      on(`[data-pill-environment="${environment}"]`, () =>
        runFromMenu(() => callbacks.onEnvironmentChange(environment)),
      );
    }
    on('[data-pill-record]', () => runFromMenu(callbacks.onToggleRecording));
    on('[data-pill-simulate]', () => runFromMenu(callbacks.onSimulateUser));
    on('[data-pill-zoom-in]', () => runFromMenu(() => callbacks.onCanvasZoom('in')));
    on('[data-pill-zoom-out]', () => runFromMenu(() => callbacks.onCanvasZoom('out')));
    on('[data-pill-zoom-reset]', () => runFromMenu(() => callbacks.onCanvasZoom('reset')));
    on('[data-pill-keyboard-map]', () => runFromMenu(callbacks.onKeyboardMap));
    on('[data-pill-command-palette]', () => runFromMenu(callbacks.onCommandPalette));
    on('[data-pill-restart]', () => runFromMenu(callbacks.onRestart));
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
    if (!event.composedPath().includes(element)) closeMenu();
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
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      stopDrag();
      doc.removeEventListener('pointerdown', onDocumentPointerDown, true);
      doc.removeEventListener('keydown', onDocumentKeyDown);
      element.remove();
    },
  };
}

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
    a.draftDiverged === b.draftDiverged
  );
}

function samePeers(a: readonly ModePillPeer[], b: readonly ModePillPeer[]): boolean {
  return (
    a.length === b.length &&
    a.every((peer, index) => peer.creatorId === b[index]?.creatorId && peer.name === b[index]?.name)
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
function renderComposing(state: ModePillState): string {
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
      ${renderMenu(state)}
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
  const names = peers.map((peer) => peer.name).join(', ');
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
  return target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    != null;
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
function renderMenu(state: ModePillState): string {
  const panels = state.panelsHidden
    ? MODE_PILL_COPY.showAllPanels
    : MODE_PILL_COPY.hideAllPanels;

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
    {
      label: MODE_PILL_COPY.groupExperienceType,
      rows: state.experienceTypes.map((entry) => ({
        key: `experience-${entry.type}`,
        label: entry.label,
        attribute: `data-pill-experience="${entry.type}"`,
        current: entry.type === state.experienceType,
        icon: EXPERIENCE_TYPE_GLYPHS[entry.type] ?? OVERLAY_GLYPHS.layers,
      })),
    },
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
      ],
    },
    {
      label: MODE_PILL_COPY.groupPlay,
      rows: [
        {
          key: 'preview',
          label: MODE_PILL_COPY.previewAsUser,
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
        {
          key: 'simulate',
          label: MODE_PILL_COPY.simulateConfusedUser,
          icon: OVERLAY_GLYPHS.bot,
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
        { key: 'zoom-in', label: MODE_PILL_COPY.zoomCanvasIn, icon: OVERLAY_GLYPHS.zoomIn },
        { key: 'zoom-out', label: MODE_PILL_COPY.zoomCanvasOut, icon: OVERLAY_GLYPHS.zoomOut },
        {
          key: 'zoom-reset',
          label: MODE_PILL_COPY.resetCanvasZoom,
          icon: OVERLAY_GLYPHS.refresh,
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
}

/** §5. The environment rows deliberately have none: they are words, not things. */
const EXPERIENCE_TYPE_GLYPHS: Readonly<Record<string, string>> = {
  tour: OVERLAY_GLYPHS.map,
  announcement: OVERLAY_GLYPHS.bell,
  hotspot: OVERLAY_GLYPHS.sparkle,
  survey: OVERLAY_GLYPHS.form,
  checklist: OVERLAY_GLYPHS.check,
  knowledge: OVERLAY_GLYPHS.layers,
};

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
        return `<button type="button" role="menuitem" ${address}${state}${disabled}>${
          row.icon ?? ''
        }<span>${escapeHtml(row.label)}</span>${shortcut}</button>`;
      })
      .join('')}
    ${note}
  `;
}

/**
 * Sections worth a direct route. Narration is here so its row is wired, but it
 * is printed under Play — it is something a creator watches, not a report.
 */
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
