// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledDocument, CompiledExperienceBehavior } from '@lodariq/schema';
import {
  experienceIsSuppressed,
  markExperienceShown,
  mountExperienceRuntime,
} from '../../../../../packages/sdk-runtime/src/renderers/experience-runtime';

describe('shared experience runtime parity', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('applies announcement form, dismissal, and bounded session frequency', () => {
    const document = artifact({
      type: 'announcement',
      surface: 'banner',
      frequency: 'session',
      dismissible: true,
    });
    const mounted = surface();
    const dismiss = vi.fn();
    mountExperienceRuntime(document, mounted.host, mounted.card, mounted.content, {
      complete: vi.fn(),
      dismiss,
      dismissOnOutsidePress: true,
    });

    expect(mounted.host.dataset['lodariqSurface']).toBe('banner');
    mounted.card.querySelector<HTMLButtonElement>('.experience-close')?.click();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(experienceIsSuppressed(document)).toBe(false);
    markExperienceShown(document);
    expect(experienceIsSuppressed(document)).toBe(true);
  });

  it('keeps a semantic hotspot marker collapsed until its authored interaction', () => {
    const mounted = surface();
    mountExperienceRuntime(
      artifact({ type: 'hotspot', surface: 'hotspot', marker: 'ring', activation: 'click' }),
      mounted.host,
      mounted.card,
      mounted.content,
      { complete: vi.fn(), dismiss: vi.fn(), dismissOnOutsidePress: true },
    );
    const marker = mounted.card.querySelector<HTMLButtonElement>('.hotspot-marker')!;
    expect(marker.dataset['marker']).toBe('ring');
    expect(marker.getAttribute('aria-expanded')).toBe('false');
    expect(mounted.content.hidden).toBe(true);
    marker.click();
    expect(marker.getAttribute('aria-expanded')).toBe('true');
    expect(mounted.content.hidden).toBe(false);
  });

  it('submits a survey only after the required answer and remembers once-only submission', () => {
    const mounted = surface();
    mounted.content.innerHTML =
      '<label><input type="radio" name="answer" value="yes" /> Yes</label>';
    const complete = vi.fn();
    const onSurveySubmit = vi.fn();
    const document = artifact({
      type: 'survey',
      surface: 'modal',
      submission: 'once',
      requireAnswer: true,
      questionBlockIds: ['question'],
    });
    mountExperienceRuntime(
      document,
      mounted.host,
      mounted.card,
      mounted.content,
      {
        complete,
        dismiss: vi.fn(), dismissOnOutsidePress: true,
        onSurveySubmit,
      },
      mounted.backdrop,
    );
    expect(mounted.card.getAttribute('aria-modal')).toBe('true');
    expect(mounted.backdrop.hidden).toBe(false);
    const submit = mounted.content.querySelector<HTMLButtonElement>('.survey-submit')!;
    submit.click();
    expect(complete).not.toHaveBeenCalled();
    mounted.content.querySelector<HTMLInputElement>('input')!.checked = true;
    submit.click();
    expect(onSurveySubmit).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(experienceIsSuppressed(document)).toBe(true);
  });

  it('persists checklist item completion and reports progress without answer payloads', () => {
    const mounted = surface();
    mounted.content.innerHTML = `
      <ul data-lodariq-node-id="item_one" data-lodariq-node-type="list"><li>Invite a teammate</li></ul>
      <ul data-lodariq-node-id="item_two" data-lodariq-node-type="list"><li>Create a project</li></ul>
    `;
    const complete = vi.fn();
    const onChecklistItemChange = vi.fn();
    const document = artifact({
      type: 'checklist',
      surface: 'drawer',
      showProgress: true,
      completion: 'allItems',
      itemBlockIds: ['item_one', 'item_two'],
    });
    mountExperienceRuntime(document, mounted.host, mounted.card, mounted.content, {
      complete,
      dismiss: vi.fn(), dismissOnOutsidePress: true,
      onChecklistItemChange,
    });
    const inputs = mounted.content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    inputs[0]!.click();
    expect(mounted.content.querySelector('.checklist-progress')?.textContent).toContain('1');
    expect(onChecklistItemChange).toHaveBeenLastCalledWith('item_one', true, 1, 2);
    inputs[1]!.click();
    expect(complete).toHaveBeenCalledOnce();

    const remounted = surface();
    remounted.content.innerHTML = `
      <ul data-lodariq-node-id="item_one" data-lodariq-node-type="list"><li>Invite</li></ul>
      <ul data-lodariq-node-id="item_two" data-lodariq-node-type="list"><li>Create</li></ul>
    `;
    mountExperienceRuntime(document, remounted.host, remounted.card, remounted.content, {
      complete: vi.fn(),
      dismiss: vi.fn(), dismissOnOutsidePress: true,
    });
    expect(
      [...remounted.content.querySelectorAll<HTMLInputElement>('input')].every(
        (input) => input.checked,
      ),
    ).toBe(true);
  });
});

function surface(): {
  host: HTMLElement;
  card: HTMLElement;
  content: HTMLElement;
  backdrop: HTMLElement;
} {
  const host = document.createElement('lodariq-tour');
  const backdrop = document.createElement('div');
  backdrop.hidden = true;
  const card = document.createElement('div');
  const content = document.createElement('div');
  card.appendChild(content);
  host.append(backdrop, card);
  document.body.appendChild(host);
  return { host, card, content, backdrop };
}

function artifact(experience: CompiledExperienceBehavior): CompiledDocument {
  return {
    documentId: `doc_${experience.type}`,
    type: experience.type,
    contentHash: 'local-preview',
    schemaVersion: '2.0.0',
    compilerVersion: '0.6.0',
    targets: [],
    steps: [],
    experience,
  } as unknown as CompiledDocument;
}
