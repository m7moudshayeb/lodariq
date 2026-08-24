// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTargetPicker } from '@lodariq/sdk-authoring/bridge';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';

/**
 * The answer to "which of these did you mean" has to reach the pick result.
 * Without it the target ships ambiguous, the resolver abstains, and the step
 * never anchors — with nothing on screen to say why.
 *
 * The question is now only asked inside a collection, so these render one. A row
 * of plain buttons is answered without asking; that case is the last test here.
 */

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Rows of a table: position here means a record, so the creator is asked. */
function renderLookAlikes(count: number): HTMLButtonElement[] {
  const main = document.createElement('main');
  main.innerHTML = `<table><tbody>${Array.from(
    { length: count },
    () => '<tr><td><button type="button">Choose a plan</button></td></tr>',
  ).join('')}</tbody></table>`;
  document.body.appendChild(main);
  return laidOut([...main.querySelectorAll('button')] as HTMLButtonElement[]);
}

/** A toolbar: three of the same control, and no record behind any of them. */
function renderControlRow(count: number): HTMLButtonElement[] {
  const main = document.createElement('main');
  main.innerHTML = `<div>${Array.from(
    { length: count },
    () => '<button type="button">Choose a plan</button>',
  ).join('')}</div>`;
  document.body.appendChild(main);
  return laidOut([...main.querySelectorAll('button')] as HTMLButtonElement[]);
}

/** jsdom has no layout, and capture measures everything it describes. */
function laidOut(buttons: HTMLButtonElement[]): HTMLButtonElement[] {
  buttons.forEach((button, index) => {
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
      domRect(200, 100 + index * 60, 140, 40),
    );
  });
  return buttons;
}

const choices = (): HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>('[data-action="choose-look-alike"]'),
];

const commit = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('[data-action="use"]');

describe('the look-alike answer reaches the pick result', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.lang = 'en';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carries the chosen answer through to onPick', () => {
    const buttons = renderLookAlikes(6);
    const onPick = vi.fn();
    startTargetPicker({ initialTarget: buttons[1]!, requiredAction: 'anchor', onPick });

    buttons[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Six identical rows: the question has to be asked.
    const options = choices();
    expect(options.length).toBeGreaterThan(0);

    options[0]!.click();
    // The panel re-renders on every answer, so the old node is detached.
    expect(choices()[0]?.getAttribute('aria-checked')).toBe('true');

    commit()?.click();

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].selection).toBeDefined();
  });

  it('sends no answer when the creator committed without choosing one', () => {
    const buttons = renderLookAlikes(6);
    const onPick = vi.fn();
    startTargetPicker({ initialTarget: buttons[1]!, requiredAction: 'anchor', onPick });

    buttons[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(choices().length).toBeGreaterThan(0);
    commit()?.click();

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].selection).toBeUndefined();
  });

  it('keeps the answer when a later evidence sample redescribes the element', async () => {
    const buttons = renderLookAlikes(6);
    const onPick = vi.fn();
    startTargetPicker({
      initialTarget: buttons[1]!,
      requiredAction: 'anchor',
      onPick,
      onEvidenceUpdate: vi.fn(),
    });

    buttons[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    choices()[0]?.click();

    // The passive probe keeps sampling for a while after the click.
    await new Promise((resolve) => setTimeout(resolve, 60));

    commit()?.click();

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].selection).toBeDefined();
  });

  it('answers a row of plain controls itself instead of asking', () => {
    const buttons = renderControlRow(3);
    const onPick = vi.fn();
    startTargetPicker({ initialTarget: buttons[1]!, requiredAction: 'anchor', onPick });

    buttons[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Nothing to ask. Three buttons in a toolbar are three buttons, so the slot
    // each one sits in is evidence, and the clicked one is already identified.
    expect(choices()).toHaveLength(0);
    expect(onPick).toHaveBeenCalledOnce();

    const result = onPick.mock.calls[0]?.[0];
    const resolved = resolveTarget(
      {
        id: result.identity.targetId,
        fingerprint: result.fingerprint,
        identity: result.identity,
        ...(result.selection ? { selection: result.selection } : {}),
      },
      document,
    );
    expect(resolved.element).toBe(buttons[1]);
  });
});
