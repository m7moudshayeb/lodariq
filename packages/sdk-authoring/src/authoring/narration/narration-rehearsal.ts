/**
 * Rehearsing narration (§7.7).
 *
 * This fast, provider-free pass shows the shape of a script before audio is
 * generated. Full preview uses the content-addressed audio and exact cues.
 */
import type { LodariqBlock, StepNarration } from '@lodariq/schema';

/** Unhurried narration, close to an audiobook rather than a podcast. */
export const NARRATION_WORDS_PER_MINUTE = 150;
/** Below this a cue is unreadable regardless of how few words it holds. */
export const NARRATION_MIN_CUE_MS = 1_200;
/** The beat between one step's last word and the next step appearing. */
export const NARRATION_STEP_GAP_MS = 600;

export interface NarrationCue {
  readonly stepId: string;
  readonly stepIndex: number;
  /** Position of this sentence within its step. */
  readonly cueIndex: number;
  readonly text: string;
  readonly startMs: number;
  readonly durationMs: number;
}

export interface NarrationRehearsal {
  readonly cues: readonly NarrationCue[];
  readonly totalMs: number;
  /** Steps that carry no script, named so a creator can see the silence. */
  readonly silentStepIds: readonly string[];
}

/**
 * Sentences, not lines. A creator writing for the ear uses punctuation to pace,
 * so punctuation is where a caption breaks — and an abbreviation is not a
 * sentence end, which is why a break needs whitespace after it.
 */
export function splitNarrationCues(script: string): string[] {
  return script
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

export function estimateCueMs(text: string, speed = 1): number {
  const words = text.split(/\s+/u).filter(Boolean).length;
  const rate = NARRATION_WORDS_PER_MINUTE * (speed || 1);
  return Math.max(NARRATION_MIN_CUE_MS, Math.round((words / rate) * 60_000));
}

export function buildNarrationRehearsal(
  steps: readonly LodariqBlock[],
  narrationOf: (step: LodariqBlock) => StepNarration | undefined,
): NarrationRehearsal {
  const cues: NarrationCue[] = [];
  const silentStepIds: string[] = [];
  let cursor = 0;

  steps.forEach((step, stepIndex) => {
    const narration = narrationOf(step);
    const sentences = narration ? splitNarrationCues(narration.script) : [];
    if (!sentences.length) {
      silentStepIds.push(step.id);
      return;
    }
    for (const [cueIndex, text] of sentences.entries()) {
      const durationMs = estimateCueMs(text, narration?.speed ?? 1);
      cues.push({ stepId: step.id, stepIndex, cueIndex, text, startMs: cursor, durationMs });
      cursor += durationMs;
    }
    cursor += NARRATION_STEP_GAP_MS;
  });

  // The trailing gap belongs between steps, not after the last word.
  const totalMs = cues.length ? cursor - NARRATION_STEP_GAP_MS : 0;
  return { cues, totalMs, silentStepIds };
}

/** The cue on screen at a position, or null while a between-steps gap plays. */
export function cueAt(rehearsal: NarrationRehearsal, positionMs: number): NarrationCue | null {
  if (positionMs < 0) return null;
  for (const cue of rehearsal.cues) {
    if (positionMs < cue.startMs) return null;
    if (positionMs < cue.startMs + cue.durationMs) return cue;
  }
  return null;
}

/**
 * Which step the playhead is inside, including the gap that follows it — so
 * scrubbing into a pause keeps showing the step that just spoke rather than
 * blanking the canvas.
 */
export function stepIdAt(rehearsal: NarrationRehearsal, positionMs: number): string | null {
  let current: string | null = null;
  for (const cue of rehearsal.cues) {
    if (cue.startMs > positionMs) break;
    current = cue.stepId;
  }
  return current;
}

export function formatNarrationClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
