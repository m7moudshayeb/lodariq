/**
 * Step narration (§7.7).
 *
 * The one decision that matters most here: **the narration script is a separate
 * field from the on-screen copy**. Text that reads well in a tooltip reads badly
 * aloud, so the two are decoupled and `Sync from step text` exists for authors who
 * do not want to write twice.
 *
 * Language is *inferred from the script* rather than picked separately, which is
 * what eliminates the classic Spanish-text-English-voice bug. Prosody comes from
 * punctuation and sentence structure, so no SSML knobs are modelled; the one
 * override creators genuinely need is a pronunciation lexicon.
 *
 * Scope note: generation, playback and publication of audio are deliberately not
 * modelled yet. Audio must live inside the immutable artifact for preview and
 * production to sound identical, which needs the ADR-0014 amendment and a
 * content-addressed object-storage design. Authoring the script does not.
 */
import { Type, type Static } from '@sinclair/typebox';

export const NARRATION_SCRIPT_MAX_CHARS = 2_000;
/** Slower than 0.7 or faster than 1.3 stops sounding like a person. */
export const NARRATION_SPEED_RANGE = { min: 0.7, max: 1.3 } as const;

export const StepNarration = Type.Object(
  {
    /** Written for the ear. Never rendered on screen. */
    script: Type.String({ maxLength: NARRATION_SCRIPT_MAX_CHARS }),
    /** Chosen from the voices that match the script's inferred language. */
    voiceId: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    speed: Type.Optional(
      Type.Number({ minimum: NARRATION_SPEED_RANGE.min, maximum: NARRATION_SPEED_RANGE.max }),
    ),
    /** Set only when a creator overrides the inferred language. */
    localeOverride: Type.Optional(Type.String({ minLength: 2, maxLength: 35 })),
  },
  { $id: 'StepNarration', additionalProperties: false },
);
export type StepNarration = Static<typeof StepNarration>;

export function sanitizeStepNarration(value: unknown): StepNarration | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const input = value as Record<string, unknown>;
  if (typeof input.script !== 'string') return undefined;
  const script = input.script.slice(0, NARRATION_SCRIPT_MAX_CHARS);
  if (!script.trim()) return undefined;
  const speed =
    typeof input.speed === 'number' && Number.isFinite(input.speed)
      ? Math.min(NARRATION_SPEED_RANGE.max, Math.max(NARRATION_SPEED_RANGE.min, input.speed))
      : undefined;
  return {
    script,
    ...(typeof input.voiceId === 'string' && input.voiceId.trim()
      ? { voiceId: input.voiceId.trim().slice(0, 120) }
      : {}),
    ...(speed === undefined ? {} : { speed }),
    ...(typeof input.localeOverride === 'string' && input.localeOverride.trim()
      ? { localeOverride: input.localeOverride.trim().slice(0, 35) }
      : {}),
  };
}
