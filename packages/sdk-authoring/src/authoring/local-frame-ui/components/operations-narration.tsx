import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import {
  buildNarrationRehearsal,
  cueAt,
  formatNarrationClock,
  stepIdAt,
} from '../../narration/narration-rehearsal';
import { Mic, Play, RotateCcw, Timer } from '../design-system';
import { blockDisplayTitle } from '../utils';
import type { LocalAuthoringFrameController } from '../controller';

const TICK_MS = 100;

/**
 * Caption rehearsal remains useful for pacing; full preview plays the exact
 * generated assets that production receives.
 */
export function OperationsNarration({
  controller,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  steps: readonly LodariqBlock[];
}): ReactNode {
  const rehearsal = useMemo(
    () => buildNarrationRehearsal(steps, (step) => step.props.narration),
    [steps],
  );
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const startedAt = useRef<{ wall: number; from: number } | null>(null);
  // Read through a ref so the clock is not restarted by its own tick.
  const positionRef = useRef(positionMs);
  positionRef.current = positionMs;

  useEffect(() => {
    if (!playing) {
      startedAt.current = null;
      return;
    }
    startedAt.current = { wall: performance.now(), from: positionRef.current };
    const timer = setInterval(() => {
      const anchor = startedAt.current;
      if (!anchor) return;
      const next = anchor.from + (performance.now() - anchor.wall);
      if (next >= rehearsal.totalMs) {
        setPositionMs(rehearsal.totalMs);
        setPlaying(false);
        return;
      }
      setPositionMs(next);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, rehearsal.totalMs]);

  const cue = cueAt(rehearsal, positionMs);
  const activeStepId = stepIdAt(rehearsal, positionMs);
  const activeStep = steps.find((step) => step.id === activeStepId);
  const generatedCount = steps.filter((step) => step.props.narration?.audio).length;

  // Following the playhead into the filmstrip is the point: a creator watches
  // the step change while the caption runs.
  useEffect(() => {
    if (playing && activeStepId) controller.activateTourStep(activeStepId);
  }, [controller, playing, activeStepId]);

  if (!rehearsal.cues.length) {
    return (
      <section className="operations-narration" aria-label={authoringText('Narration')}>
        {/* Not a gap — nothing has been written to read out yet. */}
        <div className="ops-box">
          <h3>
            <Mic size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Nothing to read out yet')}
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'No step has a narration script yet. Write one on a step and it becomes part of this run.',
            )}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="operations-narration" aria-label={authoringText('Narration')}>
      {/* Not the section's opening line — the header carries that. This is what
          the transport below is actually doing. */}
      <p className="ops-callout" data-tone="info">
        {authoringText(
          'Play the scripts as captions to hear the shape of the narration. Timing is estimated from a speaking rate, so it paces like a voice would without waiting on one.',
        )}
      </p>

      <div className="ops-box">
        <h3>{authoringText('Generated audio')}</h3>
        <p className="ops-box-body">
          {authoringText('{ready} of {total} narrated steps are ready.', {
            ready: generatedCount,
            total: rehearsal.cues.length ? steps.length - rehearsal.silentStepIds.length : 0,
          })}
        </p>
        <button
          className="ops-btn"
          data-variant="primary"
          disabled={generatedCount === 0}
          onClick={() => controller.previewFullTour()}
          type="button"
        >
          <Play size={13} strokeWidth={2} aria-hidden="true" />
          {authoringText('Preview narrated tour')}
        </button>
      </div>

      <div className="ops-box narration-stage">
        <p className="narration-caption" role="status" aria-live="polite">
          {cue?.text ?? authoringText('…')}
        </p>
        <p className="narration-where">
          {activeStep
            ? authoringText('Step {number} · {title}', {
                number: steps.indexOf(activeStep) + 1,
                title: blockDisplayTitle(activeStep),
              })
            : authoringText('Not started')}
        </p>

        <div className="narration-transport">
          <button
            className="ops-btn"
            data-variant="primary"
            onClick={() => {
              if (positionMs >= rehearsal.totalMs) setPositionMs(0);
              setPlaying((current) => !current);
            }}
            type="button"
          >
            <Play size={13} strokeWidth={2} aria-hidden="true" />
            {playing ? authoringText('Pause') : authoringText('Play')}
          </button>
          <button
            className="ops-btn"
            onClick={() => {
              setPlaying(false);
              setPositionMs(0);
            }}
            type="button"
          >
            <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
            {authoringText('Back to start')}
          </button>
          <input
            aria-label={authoringText('Position in the narration')}
            className="narration-scrubber"
            max={rehearsal.totalMs}
            min={0}
            onChange={(event) => {
              setPlaying(false);
              setPositionMs(Number(event.target.value));
            }}
            step={TICK_MS}
            type="range"
            value={Math.min(positionMs, rehearsal.totalMs)}
          />
          <span className="narration-clock">
            {formatNarrationClock(positionMs)} / {formatNarrationClock(rehearsal.totalMs)}
          </span>
        </div>
      </div>

      <div className="ops-box">
        <h3>
          <Timer size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('How long each step holds the screen')}
        </h3>
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">{authoringText('Step')}</th>
              <th scope="col">{authoringText('Captions')}</th>
              <th scope="col">{authoringText('Spoken length')}</th>
              <th scope="col">{authoringText('Audio')}</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => {
              const cues = rehearsal.cues.filter((entry) => entry.stepId === step.id);
              const spokenMs = cues.reduce((total, entry) => total + entry.durationMs, 0);
              return (
                <tr key={step.id} data-skipped={cues.length ? 'false' : 'true'}>
                  <td className="ops-table-key">
                    {index + 1}. {blockDisplayTitle(step)}
                  </td>
                  <td>{cues.length}</td>
                  <td>
                    {cues.length ? (
                      formatNarrationClock(spokenMs)
                    ) : (
                      <span className="ops-tag">{authoringText('Silent')}</span>
                    )}
                  </td>
                  <td>
                    {step.props.narration?.audio ? (
                      <span className="ops-tag" data-tone="positive">
                        {authoringText('Ready')}
                      </span>
                    ) : cues.length ? (
                      <span className="ops-tag">{authoringText('Generate')}</span>
                    ) : (
                      <span className="ops-tag">{authoringText('Silent')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rehearsal.silentStepIds.length ? (
          <p className="ops-box-body narration-hint">
            {authoringText(
              '{count} steps say nothing. A silent step is fine — it just plays as a pause.',
              { count: rehearsal.silentStepIds.length },
            )}
          </p>
        ) : null}
      </div>

      <p className="ops-callout" data-tone="info">
        {authoringText('Preview and production use the same content-addressed narration audio.')}
      </p>
    </section>
  );
}
