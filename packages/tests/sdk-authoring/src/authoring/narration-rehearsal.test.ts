import { describe, expect, it } from 'vitest';
import type { LodariqBlock, StepNarration } from '@lodariq/schema';
import {
  NARRATION_MIN_CUE_MS,
  NARRATION_STEP_GAP_MS,
  buildNarrationRehearsal,
  cueAt,
  estimateCueMs,
  formatNarrationClock,
  splitNarrationCues,
  stepIdAt,
} from '../../../../../packages/sdk-authoring/src/authoring/narration/narration-rehearsal';

function step(id: string): LodariqBlock {
  return { id, type: 'tourStep', props: {}, children: [] } as unknown as LodariqBlock;
}

const SCRIPTS: Record<string, StepNarration> = {
  step_1: { script: 'Welcome to Meridian. This is where your projects live.' },
  step_2: { script: 'Invite the people you work with.' },
};

const rehearsal = buildNarrationRehearsal([step('step_1'), step('step_2'), step('step_3')], (block) =>
  SCRIPTS[block.id],
);

describe('splitting a script into captions', () => {
  it('breaks on sentence punctuation, not on line breaks', () => {
    expect(splitNarrationCues('One. Two!\n\nThree?  Four')).toEqual([
      'One.',
      'Two!',
      'Three?',
      'Four',
    ]);
  });

  it('does not break an abbreviation that has no space after it', () => {
    expect(splitNarrationCues('Set up e.g.this first.')).toEqual(['Set up e.g.this first.']);
  });

  it('drops empty fragments rather than emitting blank captions', () => {
    expect(splitNarrationCues('   ')).toEqual([]);
  });
});

describe('cue timing', () => {
  it('holds a short sentence long enough to read', () => {
    expect(estimateCueMs('Go.')).toBe(NARRATION_MIN_CUE_MS);
  });

  it('scales with word count', () => {
    const short = estimateCueMs(Array.from({ length: 20 }, () => 'word').join(' '));
    const long = estimateCueMs(Array.from({ length: 60 }, () => 'word').join(' '));
    expect(long).toBeGreaterThan(short);
  });

  it('follows the step’s speed, so a faster voice holds the screen less', () => {
    const words = Array.from({ length: 60 }, () => 'word').join(' ');
    expect(estimateCueMs(words, 1.3)).toBeLessThan(estimateCueMs(words, 0.7));
  });
});

describe('building a rehearsal', () => {
  it('lays cues end to end with a beat between steps', () => {
    const [first, second, third] = rehearsal.cues;
    expect(first?.startMs).toBe(0);
    expect(second?.startMs).toBe(first!.durationMs);
    // Third cue belongs to the next step, so the gap sits in front of it.
    expect(third?.stepId).toBe('step_2');
    expect(third?.startMs).toBe(second!.startMs + second!.durationMs + NARRATION_STEP_GAP_MS);
  });

  it('names the steps that say nothing instead of skipping them silently', () => {
    expect(rehearsal.silentStepIds).toEqual(['step_3']);
  });

  it('does not leave a trailing gap after the last word', () => {
    const last = rehearsal.cues[rehearsal.cues.length - 1]!;
    expect(rehearsal.totalMs).toBe(last.startMs + last.durationMs);
  });

  it('is empty, not zero-length-with-a-gap, when nothing is written', () => {
    const empty = buildNarrationRehearsal([step('a')], () => undefined);
    expect(empty.cues).toEqual([]);
    expect(empty.totalMs).toBe(0);
    expect(empty.silentStepIds).toEqual(['a']);
  });
});

describe('the playhead', () => {
  it('reports the cue on screen', () => {
    expect(cueAt(rehearsal, 0)?.cueIndex).toBe(0);
    expect(cueAt(rehearsal, rehearsal.cues[1]!.startMs + 10)?.cueIndex).toBe(1);
  });

  it('shows no caption during the beat between steps', () => {
    const second = rehearsal.cues[1]!;
    expect(cueAt(rehearsal, second.startMs + second.durationMs + 100)).toBeNull();
  });

  it('keeps the step on screen through that beat rather than blanking it', () => {
    const second = rehearsal.cues[1]!;
    expect(stepIdAt(rehearsal, second.startMs + second.durationMs + 100)).toBe('step_1');
  });

  it('reads out as a clock a person can compare to their patience', () => {
    expect(formatNarrationClock(0)).toBe('0:00');
    expect(formatNarrationClock(75_000)).toBe('1:15');
  });
});
