import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
import { authoringText } from '../../i18n';
import { AUTHORING_PANEL_LABELS } from '../panel-config';

export function tourStepsOf(document: LodariqDocument | null): LodariqBlock[] {
  return document?.blocks.filter((block) => block.type === 'tourStep') ?? [];
}

export function tooltipOfStep(step: LodariqBlock): LodariqBlock | null {
  return step.children.find((child) => child.type === 'tooltip') ?? null;
}

export function firstHeadingText(block: LodariqBlock): string {
  if (block.type === 'heading' && block.content?.trim()) return block.content.trim();
  for (const child of block.children) {
    const text = firstHeadingText(child);
    if (text) return text;
  }
  return '';
}

export function createFilmstrip(doc: Document): HTMLElement {
  const filmstrip = doc.createElement('nav');
  filmstrip.className = 'overlay-filmstrip';
  filmstrip.dataset['protectedChrome'] = 'true';
  filmstrip.dataset['lodariqAuthoringControl'] = 'true';
  filmstrip.dataset['lodariqFilmstrip'] = 'true';
  filmstrip.setAttribute('role', 'navigation');
  filmstrip.setAttribute('aria-label', AUTHORING_PANEL_LABELS.filmstrip);
  filmstrip.innerHTML = `
    <input
      class="overlay-filmstrip-title"
      data-panel-document-title
      aria-label="${escapeHtml(AUTHORING_PANEL_LABELS.experienceTitle)}"
    />
    <span class="overlay-filmstrip-rule" aria-hidden="true"></span>
    <div class="overlay-filmstrip-sequence">
      <ol class="overlay-filmstrip-steps" data-filmstrip-steps></ol>
      <button type="button" class="overlay-filmstrip-add" data-filmstrip-add-step aria-label="${escapeHtml(AUTHORING_PANEL_LABELS.addStep)}" title="${escapeHtml(AUTHORING_PANEL_LABELS.addStep)}">
        +
      </button>
    </div>
    <span class="overlay-filmstrip-rule" aria-hidden="true"></span>
    <button type="button" class="overlay-filmstrip-operations" data-filmstrip-operations>
      ${escapeHtml(AUTHORING_PANEL_LABELS.operations)}
    </button>
    <button type="button" class="overlay-filmstrip-close" data-filmstrip-close aria-label="${escapeHtml(AUTHORING_PANEL_LABELS.close)}" title="${escapeHtml(AUTHORING_PANEL_LABELS.close)}">
      ${escapeHtml(authoringText('Close'))}
    </button>
  `;
  return filmstrip;
}

export function renderFilmstripSteps(
  filmstrip: HTMLElement,
  documentState: LodariqDocument | null,
  activeStepId: string | null,
): void {
  const list = filmstrip.querySelector<HTMLOListElement>('[data-filmstrip-steps]');
  if (!list) return;
  const steps = tourStepsOf(documentState);
  list.replaceChildren();
  steps.forEach((step, index) => {
    const item = list.ownerDocument.createElement('li');
    const button = list.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'overlay-filmstrip-step';
    button.dataset['stepId'] = step.id;
    button.setAttribute('aria-current', step.id === activeStepId ? 'step' : 'false');
    const number = typeof step.props.index === 'number' ? step.props.index + 1 : index + 1;
    const title = firstHeadingText(step) || authoringText('Step {number}', { number });
    button.textContent = `${number}`;
    button.title = title;
    button.setAttribute(
      'aria-label',
      authoringText('Edit step {number}: {title}', { number, title }),
    );
    item.appendChild(button);
    list.appendChild(item);
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    if (character === '&') return '&amp;';
    if (character === '"') return '&quot;';
    if (character === '<') return '&lt;';
    return '&gt;';
  });
}
