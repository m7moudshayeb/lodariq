// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  createFilmstrip,
  renderFilmstripSteps,
  FILMSTRIP_PEER_AVATAR_LIMIT,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/filmstrip';
import { createModePill } from '../../../../../packages/sdk-authoring/src/authoring/overlay/mode-pill';
import type { ModePillCallbacks } from '../../../../../packages/sdk-authoring/src/authoring/overlay/mode-pill.types';
import { createLockBand } from '../../../../../packages/sdk-authoring/src/authoring/overlay/lock-band';
import { ConflictChooser } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/conflict-chooser';
import { conflictPrompt } from '../../../../../packages/sdk-authoring/src/authoring/presence/conflict';
import type { LodariqDocument } from '@lodariq/schema';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('presence on the filmstrip (§15.2 layer 1)', () => {
  it('shows who is on a step, by initials and by name', () => {
    const filmstrip = createFilmstrip(document);
    document.body.append(filmstrip);
    renderFilmstripSteps(filmstrip, stepsDocument(), 'step_1', new Set(), {
      peersOnStep: (stepId) =>
        stepId === 'step_2' ? [{ name: 'Dina Haddad', initials: 'DH' }] : [],
    });

    const avatars = filmstrip.querySelectorAll('[data-peer]');
    expect(avatars).toHaveLength(1);
    expect(avatars[0]?.textContent).toBe('DH');
    expect(avatars[0]?.getAttribute('title')).toBe('Dina Haddad');
    // Never colour-only: the group names everyone for assistive tech.
    expect(
      filmstrip.querySelector('.overlay-filmstrip-peers')?.getAttribute('aria-label'),
    ).toContain('Dina Haddad');
  });

  it('marks a semantic selection without adding another piece of chrome', () => {
    const filmstrip = createFilmstrip(document);
    document.body.append(filmstrip);
    renderFilmstripSteps(filmstrip, stepsDocument(), 'step_1', new Set(), {
      peersOnStep: (stepId) =>
        stepId === 'step_2'
          ? [{ name: 'Mina Chen', initials: 'MC', selectionLabel: 'Welcome heading' }]
          : [],
    });

    const avatar = filmstrip.querySelector<HTMLElement>('[data-peer]');
    expect(avatar?.dataset.selecting).toBe('true');
    expect(avatar?.title).toBe('Mina Chen is selecting Welcome heading');
    expect(filmstrip.querySelectorAll('[data-peer]')).toHaveLength(1);
  });

  it('caps the faces and counts the rest', () => {
    const filmstrip = createFilmstrip(document);
    document.body.append(filmstrip);
    const crowd = Array.from({ length: FILMSTRIP_PEER_AVATAR_LIMIT + 2 }, (_, index) => ({
      name: `Person ${index}`,
      initials: `P${index}`,
    }));
    renderFilmstripSteps(filmstrip, stepsDocument(), 'step_1', new Set(), {
      peersOnStep: () => crowd,
    });

    const group = filmstrip.querySelector('.overlay-filmstrip-peers')!;
    expect(group.querySelectorAll('[data-peer]')).toHaveLength(FILMSTRIP_PEER_AVATAR_LIMIT);
    expect(group.querySelector('[data-peer-overflow]')?.textContent).toBe('+2');
  });

  it('renders nothing when nobody else is there', () => {
    const filmstrip = createFilmstrip(document);
    document.body.append(filmstrip);
    renderFilmstripSteps(filmstrip, stepsDocument(), 'step_1');
    expect(filmstrip.querySelector('.overlay-filmstrip-peers')).toBeNull();
  });
});

describe('presence in the mode pill (§15.2 layer 1)', () => {
  it('shows a face each and still says how many, in words', () => {
    const pill = createModePill(document, callbacks());
    document.body.append(pill.element);

    pill.setState({
      peers: [
        { creatorId: 'c1', name: 'Dina Haddad' },
        { creatorId: 'c2', name: 'Marco Oyelaran' },
      ],
    });
    const group = pill.element.querySelector('[data-pill-peers]')!;
    expect([...group.querySelectorAll('[data-peer]')].map((n) => n.textContent)).toEqual([
      'DH',
      'MO',
    ]);
    // Never faces alone: the sentence is there for anyone who cannot see them.
    expect(group.textContent).toContain('2 other people');
    expect(group.getAttribute('title')).toContain('Dina Haddad');

    pill.setState({
      peers: [
        {
          creatorId: 'c1',
          name: 'Dina Haddad',
          detail: 'Dina Haddad is selecting Welcome heading',
        },
      ],
    });
    expect(pill.element.querySelector('[data-pill-peers]')?.getAttribute('title')).toContain(
      'selecting Welcome heading',
    );

    pill.setState({ peers: [{ creatorId: 'c1', name: 'Dina Haddad' }] });
    expect(pill.element.querySelector('[data-pill-peers]')?.textContent).toContain(
      '1 other person',
    );

    pill.setState({ peers: [] });
    expect(pill.element.querySelector('[data-pill-peers]')).toBeNull();
    pill.destroy();
  });
});

describe('a step someone else holds (§15.2 layer 2)', () => {
  it('names the holder and offers ask or duplicate, never force-release', () => {
    const onAsk = vi.fn();
    const onDuplicate = vi.fn();
    const band = createLockBand(document, { onAsk, onDuplicate });
    document.body.append(band.element);
    band.setHolder({ stepId: 'step_2', holderName: 'Dina Haddad', reason: 'step' });

    expect(band.element.hidden).toBe(false);
    expect(band.element.textContent).toContain('Dina Haddad is editing this step');
    band.element.querySelector<HTMLButtonElement>('[data-lock-band-action="ask"]')?.click();
    band.element.querySelector<HTMLButtonElement>('[data-lock-band-action="duplicate"]')?.click();
    expect(onAsk).toHaveBeenCalledWith('step_2', 'Dina Haddad');
    expect(onDuplicate).toHaveBeenCalledWith('step_2');
    expect(band.element.textContent).not.toContain('Force');
  });

  it('states a document-scoped hold plainly and offers nothing to click', () => {
    const band = createLockBand(document, {
      onAsk: () => undefined,
      onDuplicate: () => undefined,
    });
    band.setHolder({ stepId: 'step_2', holderName: 'Sami', reason: 'document' });
    expect(band.element.textContent).toContain('Sami is reordering steps');
    for (const action of band.element.querySelectorAll<HTMLButtonElement>('button')) {
      expect(action.hidden).toBe(true);
    }
  });

  it('renders nothing at all when the step is yours', () => {
    const band = createLockBand(document, {
      onAsk: () => undefined,
      onDuplicate: () => undefined,
    });
    band.setHolder(null);
    expect(band.element.hidden).toBe(true);
  });
});

describe('the conflict chooser (§15.3)', () => {
  const prompt = conflictPrompt(
    {
      path: 'step:step_2/style.surface',
      label: 'Background colour',
      baseVersion: 4,
      actualVersion: 5,
      byCreatorName: 'Dina Haddad',
    },
    () => 'Dina Haddad changed Background colour while you were editing it.',
  );

  it('offers three explicit choices and promises both sides survive', () => {
    const markup = renderToStaticMarkup(
      createElement(ConflictChooser, { prompt, onChoose: () => undefined }),
    );
    for (const choice of ['keep-mine', 'keep-theirs', 'open-both']) {
      expect(markup).toContain(`data-conflict-choice="${choice}"`);
    }
    expect(markup).toContain('Both versions are saved either way');
    expect(markup).not.toContain('409');
  });

  it('reports the creator’s choice', async () => {
    const onChoose = vi.fn();
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(createElement(ConflictChooser, { prompt, onChoose }));
    });

    rootElement.querySelector<HTMLButtonElement>('[data-conflict-choice="open-both"]')?.click();
    expect(onChoose).toHaveBeenCalledWith('open-both');
    await act(async () => root.unmount());
  });
});

function callbacks(): ModePillCallbacks {
  return {
    onModeChange: () => undefined,
    onPreview: () => undefined,
    onOpenOperations: () => undefined,
    onToggleAllPanels: () => undefined,
    onRetrySave: () => undefined,
    onExitAuthoring: () => undefined,
    onSwitchExperience: () => undefined,
    onEnvironmentChange: () => undefined,
    onToggleRecording: () => undefined,
    onCanvasZoom: () => undefined,
    onKeyboardMap: () => undefined,
    onCommandPalette: () => undefined,
    onRestart: () => undefined,
  };
}

function stepsDocument(): LodariqDocument {
  return {
    id: 'doc_presence',
    workspaceId: 'wk_presence',
    type: 'tour',
    status: 'draft',
    title: 'Presence',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      { id: 'step_1', type: 'tourStep', props: { index: 0 }, status: 'ready', children: [] },
      { id: 'step_2', type: 'tourStep', props: { index: 1 }, status: 'ready', children: [] },
    ],
  };
}
