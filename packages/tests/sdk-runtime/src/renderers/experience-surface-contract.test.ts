// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FloatingUiDomModule from '@floating-ui/dom';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocument,
  type CompiledExperienceBehavior,
} from '@lodariq/schema';
import { DEFAULT_EXPERIENCE_APPEARANCE } from '@lodariq/schema/brand-runtime';
import { LODARIQ_TOUR_ANCHORED_ATTRIBUTE } from '@lodariq/schema/dom';
import { TourPlayer } from '@lodariq/sdk-runtime/renderers/tour';
import { mountExperienceRuntime } from '../../../../../packages/sdk-runtime/src/renderers/experience-runtime';
import { getExperienceSurfaceDefinition } from '../../../../../packages/sdk-runtime/src/renderers/experience-surface-registry';

const computePositionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    x: 12,
    y: 16,
    placement: 'bottom',
    strategy: 'fixed',
    middlewareData: {},
  })),
);

vi.mock('@floating-ui/dom', async (importOriginal) => {
  const actual = await importOriginal<typeof FloatingUiDomModule>();
  return { ...actual, computePosition: computePositionMock };
});

const nativeGetBoundingClientRect = Element.prototype.getBoundingClientRect;

describe('experience surface contract', () => {
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () =>
      domRect({ x: 40, y: 60, width: 300, height: 160 });
    computePositionMock.mockClear();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = `
      <button data-lodariq-id="new-project" aria-label="New project">New project</button>
    `;
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = nativeGetBoundingClientRect;
    document.querySelector('lodariq-tour')?.remove();
  });

  it('keeps a viewport surface off tooltip layout when the creator picks a target', async () => {
    const player = new TourPlayer(
      targetedArtifact({
        type: 'announcement',
        surface: 'banner',
        frequency: 'always',
        dismissible: true,
      }),
    );
    player.start();
    await player.waitUntilReady();

    const host = document.querySelector('lodariq-tour')!;
    const card = host.shadowRoot!.querySelector<HTMLElement>('div[role="dialog"]')!;
    // The target decided that this appears at all, and nothing else.
    expect(card.hidden).toBe(false);
    expect(card.hasAttribute(LODARIQ_TOUR_ANCHORED_ATTRIBUTE)).toBe(false);
    expect((host as HTMLElement).dataset['lodariqSurfaceAnchor']).toBe('viewport');
    expect(host.shadowRoot!.querySelector<HTMLElement>('.tour-arrow')!.hidden).toBe(true);
    expect(computePositionMock).not.toHaveBeenCalled();
    player.stop();
  });

  it('still anchors a target-anchored surface to its target', async () => {
    const player = new TourPlayer(
      targetedArtifact({ type: 'hotspot', surface: 'hotspot', marker: 'dot', activation: 'click' }),
    );
    player.start();
    await player.waitUntilReady();

    const host = document.querySelector('lodariq-tour')!;
    const card = host.shadowRoot!.querySelector<HTMLElement>('div[role="dialog"]')!;
    expect((host as HTMLElement).dataset['lodariqSurfaceAnchor']).toBe('target');
    expect(card.hasAttribute(LODARIQ_TOUR_ANCHORED_ATTRIBUTE)).toBe(true);
    expect(computePositionMock).toHaveBeenCalled();
    player.stop();
  });

  it('applies backdrop, focus trap, and surface width from the registry, not the type', () => {
    for (const surface of ['modal', 'banner'] as const) {
      const mounted = mount();
      mountExperienceRuntime(
        artifact({
          type: 'announcement',
          surface,
          frequency: 'always',
          dismissible: true,
        }),
        mounted.host,
        mounted.card,
        mounted.content,
        { complete: vi.fn(), dismiss: vi.fn(), dismissOnOutsidePress: true },
        mounted.backdrop,
      );
      const definition = getExperienceSurfaceDefinition(surface);
      expect(mounted.backdrop.classList.contains('experience-modal-backdrop')).toBe(
        definition.backdrop,
      );
      expect(mounted.backdrop.hidden).toBe(!definition.backdrop);
      expect(mounted.card.getAttribute('aria-modal')).toBe(
        definition.focus === 'trap' ? 'true' : null,
      );
      expect(mounted.card.style.getPropertyValue('--lq-tour-width')).toBe(
        `${definition.defaultSize.width}px`,
      );
    }
  });

  it('gives a survey and a checklist the close control their surfaces declare', () => {
    const survey = mount();
    mountExperienceRuntime(
      artifact({
        type: 'survey',
        surface: 'modal',
        submission: 'repeatable',
        requireAnswer: false,
        questionBlockIds: [],
      }),
      survey.host,
      survey.card,
      survey.content,
      { complete: vi.fn(), dismiss: vi.fn(), dismissOnOutsidePress: true },
      survey.backdrop,
    );
    expect(survey.card.querySelector('.experience-close')).not.toBeNull();

    const checklist = mount();
    const dismiss = vi.fn();
    mountExperienceRuntime(
      artifact({
        type: 'checklist',
        surface: 'floating',
        showProgress: true,
        completion: 'allItems',
        itemBlockIds: [],
      }),
      checklist.host,
      checklist.card,
      checklist.content,
      { complete: vi.fn(), dismiss, dismissOnOutsidePress: true },
      checklist.backdrop,
    );
    checklist.card.querySelector<HTMLButtonElement>('.experience-close')!.click();
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('withholds the close control from an announcement authored undismissable', () => {
    const mounted = mount();
    mountExperienceRuntime(
      artifact({
        type: 'announcement',
        surface: 'modal',
        frequency: 'always',
        dismissible: false,
      }),
      mounted.host,
      mounted.card,
      mounted.content,
      { complete: vi.fn(), dismiss: vi.fn(), dismissOnOutsidePress: true },
      mounted.backdrop,
    );
    expect(mounted.card.querySelector('.experience-close')).toBeNull();
  });

  it('collapses a hotspot on an outside press instead of ending the experience', async () => {
    const mounted = mount();
    const dismiss = vi.fn();
    mountExperienceRuntime(
      artifact({ type: 'hotspot', surface: 'hotspot', marker: 'dot', activation: 'click' }),
      mounted.host,
      mounted.card,
      mounted.content,
      { complete: vi.fn(), dismiss, dismissOnOutsidePress: true },
      mounted.backdrop,
    );
    mounted.card.querySelector<HTMLButtonElement>('.hotspot-marker')!.click();
    expect(mounted.content.hidden).toBe(false);

    // The press that opened the surface is still in flight for one turn.
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(mounted.content.hidden).toBe(true);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('never closes on an outside press outside delivery', async () => {
    const mounted = mount();
    const dismiss = vi.fn();
    mountExperienceRuntime(
      artifact({
        type: 'announcement',
        surface: 'slideIn',
        frequency: 'always',
        dismissible: true,
      }),
      mounted.host,
      mounted.card,
      mounted.content,
      { complete: vi.fn(), dismiss, dismissOnOutsidePress: false },
      mounted.backdrop,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    // A creator editing this surface clicks outside it constantly.
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('closes a modeless surface on an outside press in delivery', async () => {
    const mounted = mount();
    const dismiss = vi.fn();
    mountExperienceRuntime(
      artifact({
        type: 'announcement',
        surface: 'slideIn',
        frequency: 'always',
        dismissible: true,
      }),
      mounted.host,
      mounted.card,
      mounted.content,
      { complete: vi.fn(), dismiss, dismissOnOutsidePress: true },
      mounted.backdrop,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    mounted.content.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(dismiss).not.toHaveBeenCalled();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('sizes a non-resizable surface from the registry and drops the authored size', () => {
    const mounted = mount();
    mounted.card.dataset['lodariqPopupWidth'] = 'custom';
    mounted.card.style.setProperty('--lq-popup-width', '640px');
    mountExperienceRuntime(
      artifact({ type: 'hotspot', surface: 'hotspot', marker: 'dot', activation: 'click' }),
      mounted.host,
      mounted.card,
      mounted.content,
      { complete: vi.fn(), dismiss: vi.fn(), dismissOnOutsidePress: true },
      mounted.backdrop,
    );
    expect(mounted.card.dataset['lodariqPopupWidth']).toBeUndefined();
    expect(mounted.card.style.getPropertyValue('--lq-popup-width')).toBe('');
    expect(mounted.card.style.getPropertyValue('--lq-experience-marker')).toBe(
      `${getExperienceSurfaceDefinition('hotspot').defaultSize.width}px`,
    );
    // The panel the marker opens is not the marker: it keeps the theme width.
    expect(mounted.card.style.getPropertyValue('--lq-tour-width')).toBe('');
  });
});

function mount(): {
  host: HTMLElement;
  card: HTMLElement;
  content: HTMLElement;
  backdrop: HTMLElement;
} {
  const host = document.createElement('lodariq-tour');
  const backdrop = document.createElement('div');
  backdrop.hidden = true;
  const card = document.createElement('div');
  card.setAttribute('role', 'dialog');
  const content = document.createElement('div');
  card.appendChild(content);
  host.append(backdrop, card);
  document.body.appendChild(host);
  return { host, card, content, backdrop };
}

function artifact(experience: CompiledExperienceBehavior): CompiledDocument {
  return {
    documentId: `doc_${experience.type}_${experience.surface}`,
    type: experience.type,
    contentHash: 'local-preview',
    schemaVersion: '2.0.0',
    compilerVersion: '0.6.0',
    targets: [],
    steps: [],
    experience,
  } as unknown as CompiledDocument;
}

/** The same experience, delivered with a target bound to the step. */
function targetedArtifact(experience: CompiledExperienceBehavior): CompiledDocument {
  return {
    ...artifact(experience),
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    contentHash: `sha256-${'1'.repeat(64)}`,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    appearance: { ...DEFAULT_EXPERIENCE_APPEARANCE, displayTargetOutline: false },
    localization: { defaultLocale: 'en', defaultTitle: 'Experience', variants: [] },
    targets: [
      {
        id: 'target_new_project',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'New project',
          stableAttributes: { 'data-lodariq-id': 'new-project' },
        },
      },
    ],
    steps: [
      {
        id: 'step_1',
        targetId: 'target_new_project',
        placement: 'bottom',
        body: [{ id: 'heading_1', type: 'heading', text: 'Ship it', props: {} }],
      },
    ],
  } as unknown as CompiledDocument;
}

function domRect({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({}),
  } as DOMRect;
}
