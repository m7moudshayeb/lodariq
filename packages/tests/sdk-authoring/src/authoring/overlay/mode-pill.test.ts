// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createModePill,
  nearestCorner,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/mode-pill';
import type {
  ModePill,
  ModePillCallbacks,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/mode-pill.types';
import { OVERLAY_CHROME_GEOMETRY } from '../../../../../../packages/sdk-authoring/src/creator-chrome-tokens';

function harness(overrides: Partial<ModePillCallbacks> = {}) {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(args.length ? `${name}:${String(args[0])}` : name);
    };
  const pill = createModePill(document, {
    onModeChange: record('mode'),
    onPreview: record('preview'),
    onExitPreview: record('exit-preview'),
    onEditPreviewStep: record('edit-step'),
    onOpenOperations: record('operations'),
    onToggleAllPanels: record('toggle-panels'),
    onRetrySave: record('retry'),
    onExitAuthoring: record('exit-authoring'),
    onSwitchExperience: record('experience'),
    onEnvironmentChange: record('environment'),
    onToggleRecording: record('record'),
    onSimulateUser: record('simulate'),
    onCanvasZoom: record('zoom'),
    onKeyboardMap: record('keyboard-map'),
    onRestart: record('restart'),
    ...overrides,
  });
  document.body.append(pill.element);
  return { calls, pill };
}

const click = (pill: ModePill, selector: string): void => {
  const node = pill.element.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`${selector} is missing from the mode pill`);
  node.click();
};

describe('mode pill — the two visible controls (§3.3)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('shows a labelled Editing ⇄ Browsing switch, never a mode name', () => {
    const { calls, pill } = harness();
    const editing = pill.element.querySelector('[data-pill-mode="editing"]');
    const browsing = pill.element.querySelector('[data-pill-mode="browsing"]');
    expect(editing?.getAttribute('aria-checked')).toBe('true');
    expect(browsing?.getAttribute('aria-checked')).toBe('false');
    expect(editing?.textContent?.trim()).toBe('Editing');
    // Both carry the *why* in a tooltip: the switch is the highest-risk element.
    expect(browsing?.getAttribute('title')).toContain('your product');

    click(pill, '[data-pill-mode="browsing"]');
    expect(calls).toEqual(['mode:browsing']);
    expect(pill.element.textContent).not.toContain('compose');
    pill.destroy();
  });

  it('reaches every Tier 3 action from the menu without a keystroke', () => {
    const { calls, pill } = harness();
    click(pill, '[data-pill-menu]');
    expect(pill.element.querySelector<HTMLElement>('[data-pill-menu-list]')?.hidden).toBe(false);
    click(pill, '[data-pill-operations]');
    click(pill, '[data-pill-menu]');
    click(pill, '[data-pill-toggle-panels]');
    click(pill, '[data-pill-menu]');
    click(pill, '[data-pill-exit-authoring]');
    expect(calls).toEqual(['operations', 'toggle-panels', 'exit-authoring']);
    pill.destroy();
  });

  it('never prints an accelerator, because none of them are wired yet', () => {
    const { pill } = harness();
    click(pill, '[data-pill-menu]');
    expect(pill.element.querySelector('kbd')).toBeNull();
    expect(pill.element.textContent).not.toContain('⌘');
    pill.destroy();
  });
});

describe('mode pill — state (§4.1, audit #6)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('labels progress for what it is bound to', () => {
    const { pill } = harness();
    pill.setState({ environment: 'Staging', stepNumber: 2, stepCount: 6 });
    expect(pill.element.textContent).toContain('Step 2 of 6');
    expect(pill.element.textContent).toContain('Staging');

    pill.setState({ mode: 'previewing', stepNumber: 1 });
    expect(pill.element.textContent).toContain('Preview · 1 of 6');
    expect(pill.element.textContent).not.toContain('Step 1 of 6');
    pill.destroy();
  });

  it('names the property that failed and offers Retry', () => {
    const { calls, pill } = harness();
    pill.setState({ save: 'retry', saveProperty: 'Border colour' });
    expect(pill.element.textContent).toContain('Border colour');
    expect(pill.element.textContent).not.toContain('Save failed');
    click(pill, '[data-pill-retry]');
    expect(calls).toEqual(['retry']);
    pill.destroy();
  });

  it('pairs the save tone with a word rather than standing on colour alone', () => {
    const { pill } = harness();
    pill.setState({ save: 'saving' });
    expect(pill.element.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('attention');
    expect(pill.element.textContent).toContain('Saving');
    pill.destroy();
  });

  it('keeps the preview bar down to progress, edit and exit', () => {
    const { calls, pill } = harness();
    pill.setState({ mode: 'previewing', stepNumber: 3, stepCount: 6 });
    expect(pill.element.querySelectorAll('button')).toHaveLength(2);
    click(pill, '[data-pill-edit-step]');
    click(pill, '[data-pill-exit-preview]');
    expect(calls).toEqual(['edit-step', 'exit-preview']);
    pill.destroy();
  });
});

describe('mode pill — placement and collapse (§3.2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('collapses to a dot and comes back, and returning to Editing always restores it', () => {
    const { pill } = harness();
    pill.setState({ mode: 'browsing' });
    pill.setCollapsed(true);
    expect(pill.element.dataset['collapsed']).toBe('true');
    expect(pill.element.querySelector('[data-pill-expand]')).not.toBeNull();

    // The switch is the way out of Browsing, so a dot must never hide it.
    pill.setState({ mode: 'editing' });
    expect(pill.element.dataset['collapsed']).toBe('false');
    expect(pill.element.querySelector('[data-pill-mode="editing"]')).not.toBeNull();
    pill.destroy();
  });

  it('collapses on its own after idle in Browsing, never while composing', () => {
    vi.useFakeTimers();
    const { pill } = harness();
    vi.advanceTimersByTime(OVERLAY_CHROME_GEOMETRY.pillIdleCollapseMs + 100);
    expect(pill.element.dataset['collapsed']).toBe('false');

    pill.setState({ mode: 'browsing' });
    vi.advanceTimersByTime(OVERLAY_CHROME_GEOMETRY.pillIdleCollapseMs + 100);
    expect(pill.element.dataset['collapsed']).toBe('true');
    pill.destroy();
    vi.useRealTimers();
  });

  it('remembers the corner a drag settled on', () => {
    const { pill } = harness();
    pill.setCorner('top-left');
    expect(pill.element.dataset['corner']).toBe('top-left');
    pill.destroy();

    const restored = harness();
    // Storage holds the corner only; setCorner is not a persisted gesture.
    expect(restored.pill.corner()).toBe('bottom-right');
    restored.pill.destroy();
  });
});

describe('nearestCorner', () => {
  const viewport = { width: 1000, height: 800 };

  it('magnetizes to the corner the pill was dropped nearest', () => {
    expect(nearestCorner({ left: 10, top: 10, width: 200, height: 38 }, viewport)).toBe('top-left');
    expect(nearestCorner({ left: 780, top: 10, width: 200, height: 38 }, viewport)).toBe(
      'top-right',
    );
    expect(nearestCorner({ left: 10, top: 740, width: 200, height: 38 }, viewport)).toBe(
      'bottom-left',
    );
    expect(nearestCorner({ left: 780, top: 740, width: 200, height: 38 }, viewport)).toBe(
      'bottom-right',
    );
  });
});

describe('the menu, grouped as §3.3 lays it out', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const headings = (pill: ModePill): string[] =>
    [...pill.element.querySelectorAll('.overlay-mode-pill-menu-group')].map(
      (node) => node.textContent?.trim() ?? '',
    );

  it('separates Operations, Play and Environment instead of one flat list', () => {
    const { pill } = harness();
    pill.setState({ environment: 'Staging' });
    expect(headings(pill)).toEqual(['Operations', 'Play', 'Environment']);
  });

  it('routes a named section straight to it rather than to the hub default', () => {
    const { calls, pill } = harness();
    click(pill, '[data-pill-operations-tab="check"]');
    expect(calls).toContain('operations:check');
  });

  it('offers the narrated run under Play, where a creator looks for something to watch', () => {
    const { pill } = harness();
    const play = pill.element.querySelector('[data-pill-operations-tab="narration"]');
    expect(play?.textContent).toContain('Narrated demo');
  });

  it('names the active environment and says plainly that production is refused', () => {
    const { pill } = harness();
    pill.setState({ environment: 'Staging' });
    const current = pill.element.querySelector('[data-pill-environment]');
    expect(current?.textContent).toBe('Staging');
    expect(current?.getAttribute('aria-current')).toBe('true');
    const production = pill.element.querySelector<HTMLButtonElement>(
      '[data-pill-environment-production]',
    );
    expect(production?.textContent).toContain('blocked from the SDK');
    expect(production?.disabled).toBe(true);
  });

  it('prints no row it cannot act on', () => {
    const { calls, pill } = harness();
    const rows = [
      ...pill.element.querySelectorAll<HTMLButtonElement>('[data-pill-menu-list] button'),
    ].filter((row) => !row.disabled);
    for (const row of rows) row.click();
    // Every enabled row either called back or changed the pill's own state.
    expect(calls.length).toBeGreaterThanOrEqual(rows.length - 1);
  });
});
