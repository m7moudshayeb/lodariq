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
 * Generated audio is pinned by content hash. The draft keeps the opaque asset id;
 * compilation copies only validated immutable playback metadata.
 */
import { Type, type Static } from '@sinclair/typebox';

export const NARRATION_SCRIPT_MAX_CHARS = 2_000;
/** Slower than 0.7 or faster than 1.3 stops sounding like a person. */
export const NARRATION_SPEED_RANGE = { min: 0.7, max: 1.3 } as const;
export const NARRATION_OFFSET_MS_LIMITS = { min: 0, max: 3_000 } as const;
export const NARRATION_MAX_DURATION_MS = 10 * 60_000;
export const NARRATION_MAX_CUES = 200;

export const NarrationCue = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 500 }),
    startMs: Type.Integer({ minimum: 0, maximum: NARRATION_MAX_DURATION_MS }),
    durationMs: Type.Integer({ minimum: 100, maximum: NARRATION_MAX_DURATION_MS }),
  },
  { $id: 'NarrationCue', additionalProperties: false },
);
export type NarrationCue = Static<typeof NarrationCue>;

export const NarrationAudio = Type.Object(
  {
    assetId: Type.String({
      minLength: 1,
      maxLength: 160,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
    }),
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    contentType: Type.Union([
      Type.Literal('audio/mpeg'),
      Type.Literal('audio/ogg'),
      Type.Literal('audio/wav'),
    ]),
    durationMs: Type.Integer({ minimum: 100, maximum: NARRATION_MAX_DURATION_MS }),
    cues: Type.Array(Type.Ref(NarrationCue), { maxItems: NARRATION_MAX_CUES }),
    /** Hash of the exact script, voice, locale, model and speed used to generate this audio. */
    sourceHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { $id: 'NarrationAudio', additionalProperties: false },
);
export type NarrationAudio = Static<typeof NarrationAudio>;

export const CompiledNarration = Type.Object(
  {
    script: Type.String({ minLength: 1, maxLength: NARRATION_SCRIPT_MAX_CHARS }),
    startOffsetMs: Type.Integer({
      minimum: NARRATION_OFFSET_MS_LIMITS.min,
      maximum: NARRATION_OFFSET_MS_LIMITS.max,
    }),
    advanceOnEnd: Type.Boolean(),
    audio: Type.Ref(NarrationAudio),
  },
  { $id: 'CompiledNarration', additionalProperties: false },
);
export type CompiledNarration = Static<typeof CompiledNarration>;

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
    startOffsetMs: Type.Optional(
      Type.Integer({
        minimum: NARRATION_OFFSET_MS_LIMITS.min,
        maximum: NARRATION_OFFSET_MS_LIMITS.max,
      }),
    ),
    advanceOnEnd: Type.Optional(Type.Boolean()),
    audio: Type.Optional(Type.Ref(NarrationAudio)),
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
  const startOffsetMs =
    typeof input.startOffsetMs === 'number' && Number.isInteger(input.startOffsetMs)
      ? Math.min(
          NARRATION_OFFSET_MS_LIMITS.max,
          Math.max(NARRATION_OFFSET_MS_LIMITS.min, input.startOffsetMs),
        )
      : undefined;
  const audio = sanitizeNarrationAudio(input.audio);
  return {
    script,
    ...(typeof input.voiceId === 'string' && input.voiceId.trim()
      ? { voiceId: input.voiceId.trim().slice(0, 120) }
      : {}),
    ...(speed === undefined ? {} : { speed }),
    ...(typeof input.localeOverride === 'string' && input.localeOverride.trim()
      ? { localeOverride: input.localeOverride.trim().slice(0, 35) }
      : {}),
    ...(startOffsetMs === undefined ? {} : { startOffsetMs }),
    ...(typeof input.advanceOnEnd === 'boolean' ? { advanceOnEnd: input.advanceOnEnd } : {}),
    ...(audio ? { audio } : {}),
  };
}

export function sanitizeNarrationAudio(value: unknown): NarrationAudio | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (
    typeof input.assetId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(input.assetId) ||
    typeof input.contentHash !== 'string' ||
    !/^sha256-[0-9a-f]{64}$/u.test(input.contentHash) ||
    typeof input.sourceHash !== 'string' ||
    !/^sha256-[0-9a-f]{64}$/u.test(input.sourceHash) ||
    !['audio/mpeg', 'audio/ogg', 'audio/wav'].includes(String(input.contentType)) ||
    !Number.isInteger(input.durationMs) ||
    Number(input.durationMs) < 100 ||
    Number(input.durationMs) > NARRATION_MAX_DURATION_MS ||
    !Array.isArray(input.cues) ||
    input.cues.length > NARRATION_MAX_CUES
  ) {
    return undefined;
  }
  const cues: NarrationCue[] = [];
  let previousStart = -1;
  for (const value of input.cues) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const cue = value as Record<string, unknown>;
    if (
      typeof cue.text !== 'string' ||
      !cue.text.trim() ||
      cue.text.length > 500 ||
      !Number.isInteger(cue.startMs) ||
      Number(cue.startMs) < previousStart ||
      !Number.isInteger(cue.durationMs) ||
      Number(cue.durationMs) < 100 ||
      Number(cue.startMs) + Number(cue.durationMs) > Number(input.durationMs)
    ) {
      return undefined;
    }
    previousStart = Number(cue.startMs);
    cues.push({
      text: cue.text.trim(),
      startMs: Number(cue.startMs),
      durationMs: Number(cue.durationMs),
    });
  }
  return {
    assetId: input.assetId,
    contentHash: input.contentHash,
    contentType: input.contentType as NarrationAudio['contentType'],
    durationMs: Number(input.durationMs),
    cues,
    sourceHash: input.sourceHash,
  };
}
