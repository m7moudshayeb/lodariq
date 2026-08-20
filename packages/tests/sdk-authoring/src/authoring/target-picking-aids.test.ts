// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lookAlikeQuestion,
  matchCountLabel,
  stackedChoices,
  type LookAlikeOption,
} from '../../../../../packages/sdk-authoring/src/bridge/targeting/disambiguation';
import { startPageFreeze } from '../../../../../packages/sdk-authoring/src/bridge/targeting/page-freeze';
import {
  approachSentences,
  moveApproachStep,
  recordApproach,
  removeApproachStep,
  replayApproach,
} from '../../../../../packages/sdk-authoring/src/bridge/targeting/approach';

/** `Array.prototype.at` is ES2022; this workspace compiles to ES2020. */
function lastOption(
  question: { options: readonly LookAlikeOption[] } | null | undefined,
): LookAlikeOption | undefined {
  return question?.options[question.options.length - 1];
}

function render(html: string): void {
  document.body.innerHTML = html;
}

describe('stacked-click disambiguation (§4.4a)', () => {
  beforeEach(() => render(''));

  it('says nothing when there is only one plausible answer', () => {
    render('<button>Create project</button>');
    expect(stackedChoices([document.querySelector('button')!])).toEqual([]);
  });

  it('offers the thing clicked and the thing behind it, in plain language', () => {
    render(`
      <section role="dialog" aria-label="Import data">
        <button aria-label="Create project">＋</button>
      </section>
    `);
    const button = document.querySelector('button')!;
    const panel = document.querySelector('[role="dialog"]')!;
    const choices = stackedChoices([button, panel]);
    expect(choices).toHaveLength(2);
    expect(choices[0]?.label).toContain('Create project');
    expect(choices[1]?.label).toContain('behind it');
    // Each option carries the element so hovering can highlight it.
    expect(choices[1]?.element).toBe(panel);
  });
});

describe('look-alike question (§4.4)', () => {
  beforeEach(() => render(''));

  it('asks nothing when the target is unique', () => {
    render('<button aria-label="Create project">＋</button>');
    expect(lookAlikeQuestion(document.querySelector('button')!)).toBeNull();
  });

  it('offers Userflow’s three resolutions in creator language, never a slider', () => {
    render(
      '<button>Create project</button><button>Create project</button>' +
        '<button>Create project</button><button>Create project</button>',
    );
    const question = lookAlikeQuestion(document.querySelectorAll('button')[1]!);
    expect(question?.headline).toContain('4 things');
    const resolutions = question?.options.map((option) => option.resolution);
    // `exact` is last on purpose: it is the answer that declines to give the
    // resolver a rule, so it cannot be the one a creator falls into by default.
    expect(resolutions).toEqual(['by-name', 'nth', 'any', 'exact']);
    expect(lastOption(question)?.caveat).toContain('Release stays blocked');
    const labels = question?.options.map((option) => option.label).join(' ') ?? '';
    expect(labels).toContain('2nd');
    expect(labels.toLowerCase()).not.toContain('selector');
    expect(labels.toLowerCase()).not.toContain('precision');
  });

  it('drops the by-name option when there is no name to match on', () => {
    render('<button></button><button></button>');
    const question = lookAlikeQuestion(document.querySelectorAll('button')[0]!);
    expect(question?.options.map((option) => option.resolution)).toEqual(['nth', 'any', 'exact']);
  });

  it('shows the match count on hover, which no DAP does', () => {
    render('<button aria-label="Only one">＋</button>');
    expect(matchCountLabel(document.querySelector('button')!)).toBe('1 of 1 on this page');
    render('<button>Same</button><button>Same</button>');
    expect(matchCountLabel(document.querySelectorAll('button')[1]!)).toBe(
      '2 of 2 that look like this',
    );
  });
});

describe('automatic page freeze (§4.4a)', () => {
  let freeze: ReturnType<typeof startPageFreeze> | null = null;

  beforeEach(() => render(''));
  afterEach(() => {
    freeze?.stop();
    freeze = null;
  });

  it('freezes a menu that appears while picking, and announces it once', async () => {
    const froze = vi.fn();
    freeze = startPageFreeze({ onFroze: froze });
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    await vi.waitFor(() => expect(freeze?.frozen()).toBe(true));
    expect(froze).toHaveBeenCalledTimes(1);

    // A second layer must not re-announce: one sentence, not a stream.
    const listbox = document.createElement('div');
    listbox.setAttribute('role', 'listbox');
    document.body.append(listbox);
    await vi.waitFor(() => expect(document.querySelectorAll('[role="listbox"]').length).toBe(1));
    expect(froze).toHaveBeenCalledTimes(1);
  });

  it('stops the dismissal events that would close a frozen layer', async () => {
    freeze = startPageFreeze();
    render('<div role="menu"><button>Import</button></div>');
    expect(freeze.freezeNow()).toBeGreaterThan(0);

    const appDismiss = vi.fn();
    document.addEventListener('pointerleave', appDismiss);
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(new Event('pointerleave', { bubbles: true }));
    expect(appDismiss).not.toHaveBeenCalled();
    document.removeEventListener('pointerleave', appDismiss);
  });

  it('unfreezing hands the layer straight back to the product', () => {
    freeze = startPageFreeze();
    render('<div role="menu"></div>');
    freeze.freezeNow();
    expect(freeze.frozen()).toBe(true);
    freeze.unfreeze();
    expect(freeze.frozen()).toBe(false);

    const appDismiss = vi.fn();
    document.addEventListener('pointerleave', appDismiss);
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(new Event('pointerleave', { bubbles: true }));
    expect(appDismiss).toHaveBeenCalledTimes(1);
    document.removeEventListener('pointerleave', appDismiss);
  });

  it('never freezes Lodariq’s own chrome', () => {
    freeze = startPageFreeze({ ignore: (element) => element.hasAttribute('data-lodariq-bridge') });
    render('<div role="menu" data-lodariq-bridge="target-picker-actions"></div>');
    expect(freeze.freezeNow()).toBe(0);
  });
});

describe('approach recipes (§4.4)', () => {
  beforeEach(() => render(''));

  it('records the click, the route and the layer it revealed', () => {
    render(`
      <button aria-label="Import">↑</button>
      <section role="dialog" aria-label="Import data"></section>
    `);
    const recipe = recordApproach([
      {
        element: document.querySelector('button')!,
        route: 'Projects',
        revealed: document.querySelector('[role="dialog"]')!,
      },
    ]);
    expect(approachSentences(recipe)).toEqual([
      'Click Import',
      'Wait for the Projects page',
      'Wait for Import data',
    ]);
  });

  it('waits on semantic conditions, never a timer', () => {
    render('<button aria-label="Import">↑</button>');
    const recipe = recordApproach([{ element: document.querySelector('button')! }]);
    for (const step of recipe.steps) {
      expect(step.kind).not.toContain('timeout');
      expect(step).not.toHaveProperty('delayMs');
    }
  });

  it('is reorderable and trimmable, because recording catches incidental steps', () => {
    render('<button aria-label="Import">↑</button><button aria-label="Filter">▾</button>');
    const buttons = [...document.querySelectorAll('button')];
    const recipe = recordApproach([{ element: buttons[0]! }, { element: buttons[1]! }]);
    const moved = moveApproachStep(recipe, recipe.steps[1]!.id, 'up');
    expect(approachSentences(moved)).toEqual(['Click Filter', 'Click Import']);
    const trimmed = removeApproachStep(recipe, recipe.steps[0]!.id);
    expect(approachSentences(trimmed)).toEqual(['Click Filter']);
  });

  it('replays and names the step that failed rather than just failing', async () => {
    render('<button aria-label="Import">↑</button><button aria-label="Close">✕</button>');
    const buttons = [...document.querySelectorAll('button')];
    const recipe = recordApproach([{ element: buttons[0]! }, { element: buttons[1]! }]);
    const pass = await replayApproach(recipe, { perform: async () => true });
    expect(pass).toEqual({ state: 'pass' });

    let calls = 0;
    const fail = await replayApproach(recipe, {
      perform: async () => {
        calls += 1;
        return calls === 1;
      },
    });
    expect(fail.state).toBe('fail');
    if (fail.state === 'fail') expect(fail.reason).toBe('Click Close');
  });
});
