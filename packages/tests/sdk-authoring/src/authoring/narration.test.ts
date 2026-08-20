import { describe, expect, it } from 'vitest';
import { sanitizeStepNarration, NARRATION_SPEED_RANGE } from '@lodariq/schema';
import {
  applyNarrationLexicon,
  clampNarrationSpeed,
  inferNarrationLocale,
  narrationCacheKey,
  narrationScriptFromStepText,
  voicesForNarration,
  type NarrationVoice,
} from '../../../../../packages/sdk-authoring/src/authoring/narration/narration-model';

const SUPPORTED = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl-BE', 'tr', 'ar'];

const VOICES: readonly NarrationVoice[] = [
  { id: 'v_en_f', name: 'Ada', locale: 'en-US', gender: 'female' },
  { id: 'v_en_m', name: 'Blake', locale: 'en-GB', gender: 'male' },
  { id: 'v_es_f', name: 'Carmen', locale: 'es-ES', gender: 'female' },
  { id: 'v_ar_m', name: 'Karim', locale: 'ar', gender: 'male' },
];

describe('the script is a separate field (§7.7)', () => {
  it('keeps a script that is only whitespace out of the document', () => {
    expect(sanitizeStepNarration({ script: '   ' })).toBeUndefined();
    expect(sanitizeStepNarration({ voiceId: 'v_en_f' })).toBeUndefined();
  });

  it('clamps speed into a range that still sounds like a person', () => {
    expect(sanitizeStepNarration({ script: 'Hello.', speed: 9 })?.speed).toBe(
      NARRATION_SPEED_RANGE.max,
    );
    expect(clampNarrationSpeed(undefined)).toBe(1);
    expect(clampNarrationSpeed(0.1)).toBe(NARRATION_SPEED_RANGE.min);
  });

  it('builds a readable script from the step’s visible copy on request', () => {
    expect(
      narrationScriptFromStepText(['Create a project', '  Give it a name.  ', '', 'Ready?']),
    ).toBe('Create a project. Give it a name. Ready?');
  });
});

describe('language is inferred from the script, not picked (§7.7)', () => {
  it('reads the writing system where one is decisive', () => {
    expect(inferNarrationLocale('اضغط على زر المتابعة', SUPPORTED)).toBe('ar');
  });

  it('scores function words for Latin-script languages', () => {
    expect(inferNarrationLocale('Klicken Sie auf die Schaltfläche für das Projekt', SUPPORTED)).toBe(
      'de',
    );
    expect(inferNarrationLocale('Click the button and name your project', SUPPORTED)).toBe('en');
    expect(inferNarrationLocale('Haz clic en el botón para tu proyecto', SUPPORTED)).toBe('es');
  });

  it('reports nothing rather than guessing from an empty or unknown script', () => {
    expect(inferNarrationLocale('   ', SUPPORTED)).toBeNull();
    expect(inferNarrationLocale('zzz qqq', SUPPORTED)).toBeNull();
  });

  it('ignores a language the product does not support', () => {
    expect(inferNarrationLocale('こんにちは', SUPPORTED)).toBeNull();
  });

  it('filters the voice list to the inferred language, killing the wrong-voice bug', () => {
    const spanish = voicesForNarration({ script: 'Haz clic en el botón' }, VOICES, SUPPORTED);
    expect(spanish.map((voice) => voice.id)).toEqual(['v_es_f']);

    const english = voicesForNarration({ script: 'Click the button and continue' }, VOICES, SUPPORTED);
    expect(english.map((voice) => voice.id)).toEqual(['v_en_f', 'v_en_m']);
  });

  it('honours an explicit override over the inference', () => {
    const filtered = voicesForNarration(
      { script: 'Click the button and continue', localeOverride: 'ar' },
      VOICES,
      SUPPORTED,
    );
    expect(filtered.map((voice) => voice.id)).toEqual(['v_ar_m']);
  });

  it('never hands back an empty voice list', () => {
    const filtered = voicesForNarration({ script: 'Klicken Sie auf die Schaltfläche' }, VOICES, SUPPORTED);
    expect(filtered).toEqual(VOICES);
  });
});

describe('pronunciation lexicon (§7.7)', () => {
  it('respells product names, case-insensitively', () => {
    const spoken = applyNarrationLexicon('Open Lodariq and then lodariq again', [
      { written: 'Lodariq', spoken: 'loh-DAR-ik' },
    ]);
    expect(spoken).toBe('Open loh-DAR-ik and then loh-DAR-ik again');
  });

  it('prefers the longest written form, so a prefix cannot win', () => {
    const spoken = applyNarrationLexicon('Open Lodariq Studio now', [
      { written: 'Lodariq', spoken: 'loh-DAR-ik' },
      { written: 'Lodariq Studio', spoken: 'loh-DAR-ik studio' },
    ]);
    expect(spoken).toBe('Open loh-DAR-ik studio now');
  });

  it('treats entries as literal text, not patterns', () => {
    expect(applyNarrationLexicon('Cost is $5 (net)', [{ written: '$5 (net)', spoken: 'five dollars' }])).toBe(
      'Cost is five dollars',
    );
  });

  it('ignores blank entries', () => {
    expect(applyNarrationLexicon('Hello', [{ written: ' ', spoken: 'x' }])).toBe('Hello');
  });
});

describe('regeneration churn is the cost that matters (§7.7)', () => {
  it('keys on script, voice, model and speed', () => {
    const base = { script: 'Click continue.', voiceId: 'v_en_f', model: 'tts-1', speed: 1 };
    const key = narrationCacheKey(base);
    expect(narrationCacheKey(base)).toBe(key);
    expect(narrationCacheKey({ ...base, script: 'Click continue!' })).not.toBe(key);
    expect(narrationCacheKey({ ...base, voiceId: 'v_en_m' })).not.toBe(key);
    expect(narrationCacheKey({ ...base, model: 'tts-1-hd' })).not.toBe(key);
    expect(narrationCacheKey({ ...base, speed: 1.1 })).not.toBe(key);
  });

  it('treats an unset speed as the default rather than a distinct key', () => {
    const base = { script: 'Click continue.', voiceId: 'v_en_f', model: 'tts-1' };
    expect(narrationCacheKey(base)).toBe(narrationCacheKey({ ...base, speed: 1 }));
  });
});
