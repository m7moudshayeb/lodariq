/**
 * Reading what someone answered.
 *
 * Answers are customer content, not telemetry: free text can hold anything a
 * person types, so it never travels as an analytics property. It is read off the
 * rendered controls and handed to a dedicated endpoint, which is the only reason
 * a survey is a product rather than a rendering.
 *
 * Only answered fields are collected. An untouched field is silence, and
 * recording silence as an empty answer would make every summary wrong.
 */
import { LODARIQ_RENDERED_NODE_ID_ATTRIBUTE, LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE } from '@lodariq/schema/dom';

/** Long enough for a paragraph, short enough that nobody pastes a database into it. */
export const FORM_ANSWER_MAX_LENGTH = 2_000;
export const FORM_LABEL_MAX_LENGTH = 200;

export interface CapturedFormResponse {
  readonly stepId: string;
  readonly blockId: string;
  readonly label: string;
  readonly answer: string;
}

const FIELD_SELECTOR = `[${LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE}="formField"]`;

export function collectStepFormResponses(card: ParentNode, stepId: string): CapturedFormResponse[] {
  const responses: CapturedFormResponse[] = [];
  for (const field of card.querySelectorAll<HTMLElement>(FIELD_SELECTOR)) {
    const blockId = field.getAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE);
    if (!blockId) continue;
    const answer = readAnswer(field);
    if (!answer) continue;
    responses.push({
      stepId,
      blockId,
      label: clamp(fieldLabel(field), FORM_LABEL_MAX_LENGTH),
      answer: clamp(answer, FORM_ANSWER_MAX_LENGTH),
    });
  }
  return responses;
}

/**
 * A radio group answers with the chosen option's value, a checkbox only when
 * checked, and a text field only once it holds something other than whitespace.
 */
function readAnswer(field: HTMLElement): string {
  const checked = field.querySelector<HTMLInputElement>('input[type="radio"]:checked');
  if (checked) return checked.value;
  if (field.querySelector('input[type="radio"]')) return '';

  const checkbox = field.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (checkbox) return checkbox.checked ? 'true' : '';

  const text = field.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  return text?.value.trim() ?? '';
}

/** The legend of a group, or the caption beside a control. */
function fieldLabel(field: HTMLElement): string {
  const legend = field.querySelector('legend')?.textContent?.trim();
  if (legend) return legend;
  const caption = field.querySelector('span')?.textContent?.trim();
  if (caption) return caption;
  return field.getAttribute('aria-label')?.trim() || 'Field';
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
