/**
 * The assist interaction loop as a pure reducer: **preview → accept / reject /
 * refine / undo** (§7.5). Supademo's loop is the cleanest shipped example and the
 * rule it encodes is the important part — never apply-then-explain.
 *
 * Two undos exist on purpose (§7.4). `undo` here reverses the assist step *within
 * the panel*, restoring the previous proposal so a refine chain can be walked
 * back. Removing generated content from the document is the editor's own history
 * (`⌘Z`) and is not this machine's business.
 */
import {
  requiresExplicitConfirm,
  withoutForbiddenEdits,
  type AiAssistProposal,
  type AiAssistRequest,
} from './assist-contract';

export type AiAssistPhase = 'idle' | 'working' | 'previewing' | 'confirming' | 'applied' | 'failed';

export interface AiAssistState {
  readonly phase: AiAssistPhase;
  readonly request: AiAssistRequest | null;
  readonly proposal: AiAssistProposal | null;
  /** Previous proposals in this refine chain, newest last. */
  readonly history: readonly AiAssistProposal[];
  readonly error: string | null;
  /** Bumped on every accept, so a host can key its own undo entry. */
  readonly appliedRevision: number;
}

export type AiAssistEvent =
  | { type: 'ask'; request: AiAssistRequest }
  | { type: 'refine'; request: AiAssistRequest }
  | { type: 'proposed'; proposal: AiAssistProposal }
  | { type: 'failed'; error: string }
  | { type: 'confirm' }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'undo' }
  /** Close the surface without judging the proposal: the ✕, and Escape. */
  | { type: 'dismiss' };

export const INITIAL_AI_ASSIST_STATE: AiAssistState = {
  phase: 'idle',
  request: null,
  proposal: null,
  history: [],
  error: null,
  appliedRevision: 0,
};

export function aiAssistReducer(state: AiAssistState, event: AiAssistEvent): AiAssistState {
  switch (event.type) {
    case 'ask':
      return {
        ...state,
        phase: 'working',
        request: event.request,
        proposal: null,
        history: [],
        error: null,
      };
    case 'refine':
      // Keeps the current proposal in history so `undo` can walk the chain back.
      return {
        ...state,
        phase: 'working',
        request: event.request,
        error: null,
        history: state.proposal ? [...state.history, state.proposal] : state.history,
      };
    case 'proposed': {
      if (state.phase !== 'working') return state;
      const proposal = withoutForbiddenEdits(event.proposal);
      if (proposal.edits.length === 0) {
        return { ...state, phase: 'failed', error: EMPTY_PROPOSAL_REASON, proposal: null };
      }
      return { ...state, phase: 'previewing', proposal, error: null };
    }
    case 'failed':
      return { ...state, phase: 'failed', error: event.error, proposal: null };
    case 'accept': {
      if (state.phase !== 'previewing') return state;
      // Anything touching more than one object stops for an explicit confirm.
      if (state.request && requiresExplicitConfirm(state.request)) {
        return { ...state, phase: 'confirming' };
      }
      return { ...state, phase: 'applied', appliedRevision: state.appliedRevision + 1 };
    }
    case 'confirm':
      if (state.phase !== 'confirming') return state;
      return { ...state, phase: 'applied', appliedRevision: state.appliedRevision + 1 };
    case 'reject':
      return { ...INITIAL_AI_ASSIST_STATE, appliedRevision: state.appliedRevision };
    case 'dismiss':
      /**
       * Same resting state as a reject: the accepted edit is already in the
       * document and the editor's history owns taking it back.
       */
      return { ...INITIAL_AI_ASSIST_STATE, appliedRevision: state.appliedRevision };
    case 'undo': {
      const previous = state.history[state.history.length - 1];
      if (!previous) return { ...INITIAL_AI_ASSIST_STATE, appliedRevision: state.appliedRevision };
      return {
        ...state,
        phase: 'previewing',
        proposal: previous,
        history: state.history.slice(0, -1),
        error: null,
      };
    }
    default:
      return state;
  }
}

/**
 * Reported when every edit in a proposal was dropped by the design-system
 * guardrail: an honest failure beats silently applying nothing.
 */
export const EMPTY_PROPOSAL_REASON =
  'This suggestion only changed theme styles, which assist cannot edit.';

/** True while a proposal is on screen and not yet accepted or rejected. */
export function isAiAssistPreviewing(state: AiAssistState): boolean {
  return state.phase === 'previewing' || state.phase === 'confirming';
}
