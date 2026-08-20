// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  FORM_ANSWER_MAX_LENGTH,
  collectStepFormResponses,
} from '../../../../../packages/sdk-runtime/src/renderers/tour-form-responses';

function card(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

const textField = (value: string): string => `
  <label data-lodariq-node-id="blk_text" data-lodariq-node-type="formField">
    <span>What were you trying to do?</span>
    <input type="text" name="goal" value="${value}" />
  </label>`;

const radioField = (checked: string | null): string => `
  <fieldset data-lodariq-node-id="blk_radio" data-lodariq-node-type="formField">
    <legend>How hard was that?</legend>
    <label><input type="radio" name="csat" value="easy"${checked === 'easy' ? ' checked' : ''} />Easy</label>
    <label><input type="radio" name="csat" value="hard"${checked === 'hard' ? ' checked' : ''} />Hard</label>
  </fieldset>`;

describe('reading what someone answered', () => {
  it('reads a text answer with the caption that asked for it', () => {
    expect(collectStepFormResponses(card(textField('renew a licence')), 'step_1')).toEqual([
      {
        stepId: 'step_1',
        blockId: 'blk_text',
        label: 'What were you trying to do?',
        answer: 'renew a licence',
      },
    ]);
  });

  it('reads the chosen option of a group, labelled by its legend', () => {
    expect(collectStepFormResponses(card(radioField('hard')), 'step_1')).toEqual([
      { stepId: 'step_1', blockId: 'blk_radio', label: 'How hard was that?', answer: 'hard' },
    ]);
  });

  it('treats an untouched field as silence rather than an empty answer', () => {
    expect(collectStepFormResponses(card(textField('')), 'step_1')).toEqual([]);
    expect(collectStepFormResponses(card(radioField(null)), 'step_1')).toEqual([]);
  });

  it('does not count whitespace as having answered', () => {
    expect(collectStepFormResponses(card(textField('   ')), 'step_1')).toEqual([]);
  });

  it('records a checkbox only when it is ticked', () => {
    const ticked = `
      <label data-lodariq-node-id="blk_ok" data-lodariq-node-type="formField">
        <input type="checkbox" checked />Keep me posted
      </label>`;
    const untouched = ticked.replace(' checked', '');
    expect(collectStepFormResponses(card(ticked), 'step_1')[0]?.answer).toBe('true');
    expect(collectStepFormResponses(card(untouched), 'step_1')).toEqual([]);
  });

  it('collects every answered field on the step, in document order', () => {
    const responses = collectStepFormResponses(
      card(textField('renew a licence') + radioField('easy')),
      'step_2',
    );
    expect(responses.map((response) => response.blockId)).toEqual(['blk_text', 'blk_radio']);
  });

  it('bounds an answer, because a paste is not a survey response', () => {
    const long = 'x'.repeat(FORM_ANSWER_MAX_LENGTH + 500);
    expect(collectStepFormResponses(card(textField(long)), 'step_1')[0]?.answer).toHaveLength(
      FORM_ANSWER_MAX_LENGTH,
    );
  });

  it('ignores a field the compiler did not identify, rather than inventing an id', () => {
    const anonymous = '<label data-lodariq-node-type="formField"><input value="x" /></label>';
    expect(collectStepFormResponses(card(anonymous), 'step_1')).toEqual([]);
  });

  it('reads nothing from a card that has no fields', () => {
    expect(collectStepFormResponses(card('<p>Welcome</p>'), 'step_1')).toEqual([]);
  });
});
