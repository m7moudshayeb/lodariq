// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  AI_REWRITE_VERBS,
  isForbiddenAssistPath,
  requiresExplicitConfirm,
  withoutForbiddenEdits,
  type AiAssistProposal,
  type AiAssistRequest,
} from '../../../../../packages/sdk-authoring/src/authoring/ai/assist-contract';
import {
  aiAssistReducer,
  EMPTY_PROPOSAL_REASON,
  INITIAL_AI_ASSIST_STATE,
  isAiAssistPreviewing,
  type AiAssistEvent,
  type AiAssistState,
} from '../../../../../packages/sdk-authoring/src/authoring/ai/assist-machine';
import {
  draftContextIsWeak,
  DRAFT_NEARBY_TEXT_MAX_CHARS,
  targetDraftContext,
} from '../../../../../packages/sdk-authoring/src/bridge/targeting/draft-context';

const proposal = (id: string, after = 'Shorter copy'): AiAssistProposal => ({
  proposalId: id,
  summary: 'Rewrote the step body',
  edits: [{ path: 'blocks[0].content', before: 'A much longer body', after }],
});

const run = (events: readonly AiAssistEvent[], from = INITIAL_AI_ASSIST_STATE): AiAssistState =>
  events.reduce(aiAssistReducer, from);

const rewrite: AiAssistRequest = {
  kind: 'rewrite',
  scope: 'selection',
  verb: 'shorter',
  text: 'A much longer body',
};

const batch: AiAssistRequest = {
  kind: 'translate',
  scope: 'batch',
  locale: 'de',
  stepIds: ['a', 'b'],
};

describe('assist scope discipline (§7.4, §7.5)', () => {
  it('ships Scribe’s five verbs and no more', () => {
    expect(AI_REWRITE_VERBS).toEqual([
      'shorter',
      'clearer',
      'more-formal',
      'friendlier',
      'fix-grammar',
    ]);
  });

  it('requires an explicit confirm for anything touching more than one object', () => {
    expect(requiresExplicitConfirm(rewrite)).toBe(false);
    expect(requiresExplicitConfirm(batch)).toBe(true);
    expect(
      requiresExplicitConfirm({
        kind: 'command',
        scope: 'step',
        prompt: 'tighten',
        stepIds: ['a'],
      }),
    ).toBe(false);
    expect(
      requiresExplicitConfirm({
        kind: 'command',
        scope: 'step',
        prompt: 'tighten',
        stepIds: ['a', 'b'],
      }),
    ).toBe(true);
  });
});

describe('design-system guardrail (§7.4)', () => {
  it('names theme and style paths as off limits', () => {
    expect(isForbiddenAssistPath('theme.colors.accent')).toBe(true);
    expect(isForbiddenAssistPath('appearance.preset')).toBe(true);
    expect(isForbiddenAssistPath('styleRecipes[0].name')).toBe(true);
    expect(isForbiddenAssistPath('blocks[0].content')).toBe(false);
  });

  it('drops forbidden edits and keeps the usable rest', () => {
    const filtered = withoutForbiddenEdits({
      ...proposal('p1'),
      edits: [
        { path: 'blocks[0].content', before: 'a', after: 'b' },
        { path: 'theme.colors.accent', before: '#000000', after: '#ff0000' },
      ],
    });
    expect(filtered.edits.map((edit) => edit.path)).toEqual(['blocks[0].content']);
  });

  it('fails honestly when a proposal was only theme changes', () => {
    const state = run([
      { type: 'ask', request: rewrite },
      {
        type: 'proposed',
        proposal: {
          ...proposal('p2'),
          edits: [{ path: 'theme.colors.accent', before: '#000000', after: '#ff0000' }],
        },
      },
    ]);
    expect(state.phase).toBe('failed');
    expect(state.error).toBe(EMPTY_PROPOSAL_REASON);
    expect(state.proposal).toBeNull();
  });
});

describe('preview → accept / reject / refine / undo (§7.5)', () => {
  it('never applies before a preview is accepted', () => {
    const state = run([
      { type: 'ask', request: rewrite },
      { type: 'proposed', proposal: proposal('p1') },
    ]);
    expect(state.phase).toBe('previewing');
    expect(isAiAssistPreviewing(state)).toBe(true);
    expect(state.appliedRevision).toBe(0);
  });

  it('applies a single-step accept directly', () => {
    const state = run([
      { type: 'ask', request: rewrite },
      { type: 'proposed', proposal: proposal('p1') },
      { type: 'accept' },
    ]);
    expect(state.phase).toBe('applied');
    expect(state.appliedRevision).toBe(1);
  });

  it('stops a batch accept at an explicit confirm', () => {
    const previewing = run([
      { type: 'ask', request: batch },
      { type: 'proposed', proposal: proposal('p1') },
      { type: 'accept' },
    ]);
    expect(previewing.phase).toBe('confirming');
    expect(previewing.appliedRevision).toBe(0);
    expect(aiAssistReducer(previewing, { type: 'confirm' }).phase).toBe('applied');
  });

  it('walks a refine chain back one proposal at a time', () => {
    const refined = run([
      { type: 'ask', request: rewrite },
      { type: 'proposed', proposal: proposal('p1', 'First draft') },
      { type: 'refine', request: rewrite },
      { type: 'proposed', proposal: proposal('p2', 'Second draft') },
    ]);
    expect(refined.proposal?.edits[0]?.after).toBe('Second draft');

    const undone = aiAssistReducer(refined, { type: 'undo' });
    expect(undone.phase).toBe('previewing');
    expect(undone.proposal?.edits[0]?.after).toBe('First draft');
    // One more undo exhausts the chain and clears the panel.
    expect(aiAssistReducer(undone, { type: 'undo' }).phase).toBe('idle');
  });

  it('reject clears everything but the applied count', () => {
    const state = run([
      { type: 'ask', request: rewrite },
      { type: 'proposed', proposal: proposal('p1') },
      { type: 'accept' },
      { type: 'ask', request: rewrite },
      { type: 'proposed', proposal: proposal('p2') },
      { type: 'reject' },
    ]);
    expect(state.phase).toBe('idle');
    expect(state.proposal).toBeNull();
    // The host keys its own undo entry off this, so it must survive a reject.
    expect(state.appliedRevision).toBe(1);
  });

  it('ignores a proposal that arrives after the request was abandoned', () => {
    const rejected = run([
      { type: 'ask', request: rewrite },
      { type: 'proposed', proposal: proposal('p1') },
      { type: 'reject' },
    ]);
    expect(aiAssistReducer(rejected, { type: 'proposed', proposal: proposal('p2') })).toBe(
      rejected,
    );
  });
});

describe('step drafts read the accessible tree, not pixels (§7.4)', () => {
  const render = (html: string): Element => {
    document.body.innerHTML = html;
    return document.querySelector('[data-target]')!;
  };

  it('takes the accessible name, the role word, and nearby text', () => {
    const element = render(`
      <section>
        <h2>Billing settings</h2>
        <p>Change how your team is invoiced.</p>
        <button data-target aria-label="Add payment method">＋</button>
      </section>
    `);
    const context = targetDraftContext(element);
    expect(context.accessibleName).toBe('Add payment method');
    expect(context.role).toBe('Button');
    expect(context.nearbyText).toContain('Billing settings');
    expect(draftContextIsWeak(context)).toBe(false);
  });

  it('leaves out selectors, markup and the target’s own label', () => {
    const element = render(
      '<section class="billing-card"><button data-target id="pay">Pay now</button></section>',
    );
    const serialized = JSON.stringify(targetDraftContext(element));
    for (const term of ['billing-card', '<', 'button', '#pay', 'data-target']) {
      expect(serialized).not.toContain(term);
    }
  });

  it('bounds nearby text so a long page cannot inflate the request', () => {
    const element = render(
      `<section><p>${'word '.repeat(400)}</p><button data-target>Go</button></section>`,
    );
    expect(targetDraftContext(element).nearbyText?.length).toBeLessThanOrEqual(
      DRAFT_NEARBY_TEXT_MAX_CHARS,
    );
  });

  it('reports a nameless target as weak, which is the accessibility nudge', () => {
    const element = render('<section><button data-target></button></section>');
    expect(draftContextIsWeak(targetDraftContext(element))).toBe(true);
  });
});
