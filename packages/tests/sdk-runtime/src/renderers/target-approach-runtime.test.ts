// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompiledTargetApproach } from '@lodariq/schema';
import { executeTargetApproach } from '../../../../../packages/sdk-runtime/src/renderers/target-approach-runtime';

describe('target approach runtime', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('activates a semantic control and waits for transient content', async () => {
    const opener = button('Open import');
    opener.addEventListener('click', () => {
      const dialog = document.createElement('section');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-label', 'Import data');
      document.body.appendChild(dialog);
    });
    const stages: string[] = [];

    const outcome = await executeTargetApproach(
      approach({ type: 'targetAvailable', targetId: 'dialog' }),
      {
        targetId: 'final',
        resolveTarget: (targetId) => {
          if (targetId === 'opener') return opener;
          return document.querySelector('[aria-label="Import data"]');
        },
        onStageUpdate: (update) => stages.push(`${update.stage}:${update.status}`),
      },
      new AbortController().signal,
    );

    expect(outcome).toEqual({ state: 'pass', completedLegs: 1 });
    expect(stages).toEqual([
      'act:started',
      'act:completed',
      'wait:started',
      'wait:completed',
    ]);
  });

  it('follows a same-page SPA route transition without polling coordinates', async () => {
    const opener = button('Open projects');
    opener.addEventListener('click', () => window.history.pushState(null, '', '/projects/import'));
    const outcome = await executeTargetApproach(
      approach({ type: 'route', match: 'exact', value: '/projects/import' }),
      {
        targetId: 'final',
        resolveTarget: (targetId) => (targetId === 'opener' ? opener : null),
      },
      new AbortController().signal,
    );
    expect(outcome.state).toBe('pass');
    expect(window.location.pathname).toBe('/projects/import');
  });

  it('resolves controls and reveals inside an open shadow root', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const opener = button('Open settings', shadow);
    opener.addEventListener('click', () => {
      const panel = document.createElement('section');
      panel.setAttribute('aria-label', 'Settings panel');
      shadow.appendChild(panel);
    });
    document.body.appendChild(host);

    const outcome = await executeTargetApproach(
      approach({ type: 'targetAvailable', targetId: 'panel' }),
      {
        targetId: 'final',
        resolveTarget: (targetId) => {
          if (targetId === 'opener') return shadow.querySelector('button');
          return shadow.querySelector('[aria-label="Settings panel"]');
        },
      },
      new AbortController().signal,
    );
    expect(outcome.state).toBe('pass');
  });

  it('bounds a missing semantic condition with a repairable failed leg', async () => {
    const opener = button('Open import');
    const outcome = await executeTargetApproach(
      approach({ type: 'textVisible', value: 'Never appears', locale: 'en' }),
      {
        targetId: 'final',
        resolveTarget: (targetId) => (targetId === 'opener' ? opener : null),
      },
      new AbortController().signal,
      25,
    );
    expect(outcome).toMatchObject({
      state: 'fail',
      completedLegs: 0,
      failedLegIndex: 0,
      reason: 'deadline',
    });
  });

  it('cancels an in-flight recipe', async () => {
    const opener = button('Open import');
    const controller = new AbortController();
    const pending = executeTargetApproach(
      approach({ type: 'textVisible', value: 'Never appears', locale: 'en' }),
      {
        targetId: 'final',
        resolveTarget: (targetId) => (targetId === 'opener' ? opener : null),
      },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'TourPresentationCanceledError' });
  });

  it('coalesces mutation bursts while waiting for a transient target', async () => {
    const opener = button('Open import');
    let resolveCalls = 0;
    opener.addEventListener('click', () => {
      for (let index = 0; index < 400; index += 1) {
        const node = document.createElement('span');
        document.body.appendChild(node);
      }
      window.setTimeout(() => {
        const target = document.createElement('div');
        target.dataset['approachTarget'] = 'ready';
        document.body.appendChild(target);
      }, 0);
    });
    const outcome = await executeTargetApproach(
      approach({ type: 'targetAvailable', targetId: 'final' }),
      {
        targetId: 'final',
        resolveTarget: (targetId) => {
          resolveCalls += 1;
          if (targetId === 'opener') return opener;
          return document.querySelector('[data-approach-target="ready"]');
        },
      },
      new AbortController().signal,
    );
    expect(outcome.state).toBe('pass');
    expect(resolveCalls).toBeLessThan(30);
  });
});

function approach(wait: CompiledTargetApproach['legs'][number]['wait']): CompiledTargetApproach {
  return {
    legs: [
      {
        act: { kind: 'activateTarget', targetId: 'opener' },
        ...(wait ? { wait } : {}),
        label: 'Open the transient surface',
      },
    ],
  };
}

function button(name: string, root: Node = document.body): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.setAttribute('aria-label', name);
  root.appendChild(element);
  return element;
}
