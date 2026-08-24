/**
 * The AI assist capability (§7.4, §7.5, §7.6).
 *
 * This class owns only the async edges and the document write. The interaction
 * loop itself lives in `ai/assist-machine.ts` as a pure reducer, and the
 * design-system guardrail lives in `ai/assist-contract.ts`, so neither can be
 * bypassed by a UI that forgets to check.
 *
 * Nothing here talks to a model provider: `services.requestAiAssist` is the seam,
 * and the whole surface is unavailable when a session does not supply it.
 */
import { ControllerTargetDocumentFeature } from './controller-target-document';
import { authoringText } from '../../i18n';
import {
  parseBlockContentPath,
  type AiAssistEdit,
  type AiAssistRequest,
} from '../ai/assist-contract';
import {
  aiAssistReducer,
  INITIAL_AI_ASSIST_STATE,
  type AiAssistEvent,
  type AiAssistState,
} from '../ai/assist-machine';
import { updateBlockContent } from '../document-ops';
import { setAuthoringLocalizedBlockContent } from '../document-localization';

export abstract class ControllerAssistFeature extends ControllerTargetDocumentFeature {
  protected assistState: AiAssistState = INITIAL_AI_ASSIST_STATE;
  /** Guards against a slow response landing after a newer ask (§8.1's lesson). */
  private assistRequestVersion = 0;

  askAiAssist(request: AiAssistRequest): void {
    void this.runAiAssist(request, 'ask');
  }

  /**
   * An ask typed into §7.5's palette, on the host page.
   *
   * Anchored to the selected step here rather than at the palette: §7.8's rule
   * that no ask is unanchored has to hold whichever surface it arrived from, and
   * the host does not know which step the frame has selected.
   */
  protected askFromChrome(prompt: string): void {
    const instruction = prompt.trim();
    const step = this.selectedTourStep();
    if (!instruction) return;
    if (!step) {
      this.notify(authoringText('Select a step first — an ask is always about one.'), 'warning');
      return;
    }
    this.askAiAssist({ kind: 'command', scope: 'step', prompt: instruction, stepIds: [step.id] });
  }

  refineAiAssist(request: AiAssistRequest): void {
    void this.runAiAssist(request, 'refine');
  }

  acceptAiAssist(): void {
    this.dispatchAssist({ type: 'accept' });
  }

  /** The second half of a batch accept: an explicit confirm on a shown diff. */
  confirmAiAssist(): void {
    this.dispatchAssist({ type: 'confirm' });
  }

  rejectAiAssist(): void {
    this.dispatchAssist({ type: 'reject' });
  }

  /**
   * Close the surface — the ✕ and Escape.
   *
   * Bumps the request version as well, so a draft still in flight cannot land
   * after the creator has closed the panel and reopen it behind them.
   */
  cancelAiAssist(): void {
    this.assistRequestVersion += 1;
    this.dispatchAssist({ type: 'dismiss' });
  }

  /** Reverses the assist step inside the panel. `⌘Z` still owns the document. */
  undoAiAssist(): void {
    this.dispatchAssist({ type: 'undo' });
  }

  private async runAiAssist(request: AiAssistRequest, kind: 'ask' | 'refine'): Promise<void> {
    const requestAiAssist = this.services.requestAiAssist;
    if (!requestAiAssist) {
      this.assistState = {
        ...this.assistState,
        phase: 'failed',
        error: authoringText('Assist is available from an authenticated authoring session.'),
      };
      this.emit();
      return;
    }
    const version = ++this.assistRequestVersion;
    this.assistState = aiAssistReducer(this.assistState, { type: kind, request });
    this.emit();
    try {
      const proposal = await requestAiAssist(request);
      if (version !== this.assistRequestVersion) return;
      this.dispatchAssist({ type: 'proposed', proposal });
    } catch {
      if (version !== this.assistRequestVersion) return;
      this.dispatchAssist({
        type: 'failed',
        error: authoringText('That suggestion could not be generated. Try again.'),
      });
    }
  }

  private dispatchAssist(event: AiAssistEvent): void {
    const previous = this.assistState;
    const next = aiAssistReducer(previous, event);
    if (next === previous) return;
    this.assistState = next;
    // Applying is the one transition that writes: everything else is preview state.
    if (next.phase === 'applied' && previous.phase !== 'applied' && previous.proposal) {
      this.applyAssistEdits(previous.proposal.edits);
      // And then the surface is done. `applyAssistEdits` already says what
      // happened in the status line, so leaving the panel up says it twice.
      this.assistState = aiAssistReducer(this.assistState, { type: 'dismiss' });
    }
    this.emit();
  }

  private applyAssistEdits(edits: readonly AiAssistEdit[]): void {
    let applied = 0;
    for (const edit of edits) {
      const blockId = parseBlockContentPath(edit.path);
      if (!blockId) continue;
      this.documentState = edit.locale
        ? setAuthoringLocalizedBlockContent(this.documentState, edit.locale, blockId, edit.after)
        : { ...this.documentState, blocks: updateBlockContent(this.documentState.blocks, blockId, edit.after) };
      applied += 1;
    }
    if (applied === 0) return;
    this.documentState = this.normalizeDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Assist applied {count} edits', { count: applied }));
  }
}
