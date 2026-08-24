import { useState } from 'react';
import { Mic, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import { NARRATION_OFFSET_MS_LIMITS, type LodariqBlock, type StepNarration } from '@lodariq/schema';
import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';
import { CONTENT_LOCALE_SUGGESTIONS } from '../../content-locales';
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

const NARRATION_OFFSET_STEP_MS = 100;
const NARRATION_AUDIO_AVAILABLE = productCapabilityIsImplemented('authoring.narration-audio');
const VOICE_AUTHORING_AVAILABLE = productCapabilityIsImplemented('authoring.voice-driven');

/**
 * The inspector's Narration section (§7.7).
 *
 * The script is its own field, because text that reads well in a tooltip reads
 * badly aloud. Language is shown as *inferred from the script* rather than picked,
 * and the voice list follows it — that is what prevents a Spanish script narrated
 * by an English voice.
 *
 * Generation is server-side; the returned content-addressed asset stays attached
 * to the step until a generation input changes.
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
   * Candidates for guessing the script's language — a creator may write a German
   * script before adding a German variant. Seeded from the common tags rather
   * than from the locales Lodariq's own chrome is translated into, which have
   * nothing to do with what a customer narrates in.
   */
  const locales = [
    ...(snapshot.documentState.localization?.variants.map((variant) => variant.locale) ?? []),
    ...CONTENT_LOCALE_SUGGESTIONS,
  ];
  const inferred = narration?.localeOverride ?? inferNarrationLocale(script, locales);
  const voices = voicesForNarration(narration, snapshot.narrationVoices ?? [], locales);
  const narrationEnabled =
    !snapshot.commercialUsage || snapshot.commercialUsage.features.includes('narration');
  const [generating, setGenerating] = useState(false);

  return (
    <section className="step-narration-section" aria-label={authoringText('Narration')}>
      <p className="step-narration-note">
        {authoringText(
          'The spoken script is a separate field from the on-screen copy. Text that reads well in a tooltip reads badly aloud.',
        )}
      </p>
      {!narrationEnabled ? (
        <p className="step-narration-note" role="status">
          {authoringText('This tool is not included in the current workspace plan.')}
        </p>
      ) : null}
      <label className="step-narration-script">
        <span>{authoringText('Spoken script')}</span>
        <textarea
          data-narration-script=""
          disabled={!narrationEnabled}
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
        disabled={!narrationEnabled}
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

      <PlaybackControls
        controller={controller}
        disabled={!narrationEnabled}
        narration={narration}
        stepId={step.id}
      />

      <div className="inspector-menu" data-narration-audio="">
        <button
          data-narration-action="sync"
          disabled={!narrationEnabled}
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
        <button
          data-narration-action="generate"
          disabled={
            !narrationEnabled ||
            !NARRATION_AUDIO_AVAILABLE ||
            !controller.canGenerateNarration() ||
            !script.trim() ||
            generating
          }
          onClick={() => {
            setGenerating(true);
            void controller.generateStepNarration(step.id).finally(() => setGenerating(false));
          }}
          type="button"
        >
          <Volume2 size={14} strokeWidth={2.2} aria-hidden="true" />
          {generating ? authoringText('Generating…') : authoringText('Generate audio')}
        </button>
        <button
          data-narration-action="dictate"
          disabled={!narrationEnabled || !VOICE_AUTHORING_AVAILABLE}
          type="button"
        >
          <Mic size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Dictate it instead…')}
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
        {narration?.audio
          ? authoringText('Audio ready · {seconds} seconds', {
              seconds: Math.round(narration.audio.durationMs / 100) / 10,
            })
          : authoringText('Generate audio after the script and voice are ready.')}
      </p>
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

function PlaybackControls({
  controller,
  disabled,
  narration,
  stepId,
}: {
  controller: LocalAuthoringFrameController;
  disabled: boolean;
  narration: StepNarration | undefined;
  stepId: string;
}) {
  return (
    <>
      <PropertyChoiceField
        disabled={disabled}
        label={authoringText('Advance when the audio ends')}
        onChange={(value) =>
          controller.setStepNarration(stepId, {
            ...narration,
            script: narration?.script ?? '',
            advanceOnEnd: value === 'on',
          })
        }
        options={[
          { value: 'on', label: authoringText('On') },
          { value: 'off', label: authoringText('Off') },
        ]}
        presentation="menu"
        value={narration?.advanceOnEnd ? 'on' : 'off'}
      />
      {/* §4.3 gives the lead-in a slider: it is a feel, not a figure to type. */}
      <AuthoringRange
        disabled={disabled}
        label={authoringText('Start offset')}
        max={NARRATION_OFFSET_MS_LIMITS.max}
        min={NARRATION_OFFSET_MS_LIMITS.min}
        onValueChange={(startOffsetMs) =>
          controller.setStepNarration(stepId, {
            ...narration,
            script: narration?.script ?? '',
            startOffsetMs,
          })
        }
        step={NARRATION_OFFSET_STEP_MS}
        unit={authoringText('ms')}
        value={narration?.startOffsetMs ?? 0}
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
