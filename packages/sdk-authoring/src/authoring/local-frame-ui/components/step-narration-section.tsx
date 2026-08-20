import { useState } from 'react';
import { Mic, RefreshCw, Trash2, Type, Volume2 } from 'lucide-react';
import type { LodariqBlock } from '@lodariq/schema';
import { PRODUCT_LOCALES } from '@lodariq/i18n';
import { authoringText } from '../../../i18n';
import { AuthoringRange } from '../design-system';
import { PropertyChoiceField } from '../properties/property-controls';
import {
  inferNarrationLocale,
  narrationScriptFromStepText,
  voicesForNarration,
} from '../../narration/narration-model';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/** §4.3 narration: up to three seconds of lead-in, in tenths. */
const NARRATION_OFFSET_MS_LIMITS = { min: 0, max: 3_000, step: 100 } as const;

/**
 * The inspector's Narration section (§7.7).
 *
 * The script is its own field, because text that reads well in a tooltip reads
 * badly aloud. Language is shown as *inferred from the script* rather than picked,
 * and the voice list follows it — that is what prevents a Spanish script narrated
 * by an English voice.
 *
 * Generation and playback are not here: audio has to live inside the immutable
 * artifact, which waits on the ADR-0014 amendment. Writing the script does not.
 */
export function StepNarrationSection({
  controller,
  snapshot,
  step,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
}) {
  const narration = step.props.narration;
  const script = narration?.script ?? '';
  /**
   * Candidates are the languages the product speaks, not just the ones this
   * document happens to have variants for — a creator may write a German script
   * before adding a German variant.
   */
  const locales = [
    ...PRODUCT_LOCALES,
    ...(snapshot.documentState.localization?.variants.map((variant) => variant.locale) ?? []),
  ];
  const inferred = narration?.localeOverride ?? inferNarrationLocale(script, locales);
  const voices = voicesForNarration(narration, snapshot.narrationVoices ?? [], locales);

  return (
    <section className="step-narration-section" aria-label={authoringText('Narration')}>
      <p className="step-narration-note">
        {authoringText(
          'The spoken script is a separate field from the on-screen copy. Text that reads well in a tooltip reads badly aloud.',
        )}
      </p>
      <label className="step-narration-script">
        <span>{authoringText('Spoken script')}</span>
        <textarea
          data-narration-script=""
          onChange={(event) =>
            controller.setStepNarration(step.id, { ...narration, script: event.target.value })
          }
          placeholder={authoringText('Write this for the ear, not the screen…')}
          rows={4}
          value={script}
        />
      </label>

      <div className="rich-step-choice-field" data-presentation="menu">
        <span className="rich-step-field-label">{authoringText('Detected language')}</span>
        <span className="step-narration-language-tag" data-narration-locale={inferred ?? ''}>
          {inferred ?? authoringText('Not detected yet')}
        </span>
      </div>

      {/*
        A pill, like every other row in §4.3 — the native select was the last
        control in the inspector that opened the operating system's own list, which
        reads as a form field dropped into a panel of pills.
      */}
      <PropertyChoiceField
        label={authoringText('Voice')}
        onChange={(voiceId) =>
          controller.setStepNarration(step.id, {
            ...narration,
            script,
            ...(voiceId ? { voiceId } : {}),
          })
        }
        options={[
          {
            value: '',
            label:
              voices.length === 0
                ? authoringText('No voices available')
                : authoringText('Choose a voice'),
          },
          ...voices.map((voice) => ({
            value: voice.id,
            label: voice.accent ? `${voice.name} · ${voice.accent}` : voice.name,
          })),
        ]}
        presentation="menu"
        value={narration?.voiceId ?? ''}
      />

      <PlaybackControls />

      <div className="inspector-menu" data-narration-audio="">
        <button
          data-narration-action="sync"
          onClick={() =>
            controller.setStepNarration(step.id, {
              ...narration,
              script: narrationScriptFromStepText(visibleLines(tooltip)),
            })
          }
          type="button"
        >
          <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Sync from step text')}
        </button>
        <button data-narration-action="generate" disabled type="button">
          <Volume2 size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Generate audio')}
        </button>
        <button data-narration-action="dictate" disabled type="button">
          <Mic size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Dictate it instead…')}
        </button>
        <button data-narration-action="lexicon" disabled type="button">
          <Type size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Pronunciation lexicon…')}
        </button>
        {script.trim() ? (
          <button
            data-narration-action="clear"
            onClick={() => controller.setStepNarration(step.id, null)}
            type="button"
          >
            <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
            {authoringText('Remove narration')}
          </button>
        ) : null}
      </div>

      <p className="step-narration-note">
        {authoringText('Pauses and emphasis come from your punctuation.')}
      </p>
      <p className="step-narration-note">
        {authoringText(
          'Voices filter to the detected language, so a German script can never get an English voice.',
        )}
      </p>
    </section>
  );
}

/**
 * WIRE_BE: playback timing is authored here but has nowhere to land yet. Audio
 * has to live inside the immutable artifact for preview and production to sound
 * identical, which waits on the ADR-0014 amendment; until then these hold their
 * value for the session only, and generation stays disabled.
 */
function PlaybackControls() {
  const [advanceOnEnd, setAdvanceOnEnd] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  return (
    <>
      <PropertyChoiceField
        label={authoringText('Advance when the audio ends')}
        onChange={(value) => setAdvanceOnEnd(value === 'on')}
        options={[
          { value: 'on', label: authoringText('On') },
          { value: 'off', label: authoringText('Off') },
        ]}
        presentation="menu"
        value={advanceOnEnd ? 'on' : 'off'}
      />
      {/* §4.3 gives the lead-in a slider: it is a feel, not a figure to type. */}
      <AuthoringRange
        label={authoringText('Start offset')}
        max={NARRATION_OFFSET_MS_LIMITS.max}
        min={NARRATION_OFFSET_MS_LIMITS.min}
        onValueChange={setOffsetMs}
        step={NARRATION_OFFSET_MS_LIMITS.step}
        unit={authoringText('ms')}
        value={offsetMs}
      />
    </>
  );
}

/** The step's on-screen copy, in reading order. */
function visibleLines(tooltip: LodariqBlock): readonly string[] {
  const lines: string[] = [];
  const visit = (block: LodariqBlock): void => {
    if (block.content) lines.push(block.content);
    block.children.forEach(visit);
  };
  tooltip.children.forEach(visit);
  return lines;
}
