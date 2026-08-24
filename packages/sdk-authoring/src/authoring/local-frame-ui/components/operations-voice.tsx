import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { VoiceAuthoringProposal, VoiceTranscriptSegment } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { Check, Circle, Mic, RotateCcw } from '../design-system';
import { createVoiceAuthoringProposal, normalizeTranscript } from '../../voice-authoring';

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0?: { readonly transcript?: string };
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export function OperationsVoice({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [segments, setSegments] = useState<VoiceTranscriptSegment[]>([]);
  const [proposal, setProposal] = useState<VoiceAuthoringProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');
  const segmentsRef = useRef<VoiceTranscriptSegment[]>([]);
  const startedAtRef = useRef(0);
  const target = voiceProposalTarget(snapshot);

  useEffect(() => {
    const speechWindow = window as SpeechRecognitionWindow;
    setSupported(Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition));
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const finishProposal = (): void => {
    const next = createVoiceAuthoringProposal({
      transcript: transcriptRef.current,
      segments: segmentsRef.current,
      locale: navigator.language || 'en-US',
      ...(target ? { target } : {}),
    });
    if (next) setProposal(next);
    setRecording(false);
    recognitionRef.current = null;
  };

  const startRecording = (): void => {
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSupported(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event) => {
      let nextTranscript = '';
      const nextSegments = [...segmentsRef.current];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const text = result?.[0]?.transcript?.trim() ?? '';
        if (!text) continue;
        nextTranscript += `${text} `;
        if (index >= event.resultIndex && result.isFinal) {
          const endMs = Math.max(1, Math.min(300_000, Date.now() - startedAtRef.current));
          nextSegments.push({ text, startMs: Math.max(0, endMs - text.length * 55), endMs });
        }
      }
      const normalized = normalizeTranscript(nextTranscript);
      if (!normalized) return;
      transcriptRef.current = normalized;
      segmentsRef.current = nextSegments.slice(-200);
      setTranscript(normalized);
      setSegments(segmentsRef.current);
      setProposal(null);
      setError(null);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(authoringText('The microphone stopped before a transcript was ready.'));
      }
      setRecording(false);
    };
    recognition.onend = finishProposal;
    recognitionRef.current = recognition;
    transcriptRef.current = '';
    segmentsRef.current = [];
    startedAtRef.current = Date.now();
    setTranscript('');
    setSegments([]);
    setProposal(null);
    setError(null);
    setRecording(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setRecording(false);
      setError(
        authoringText('The microphone could not start. Check browser permission and try again.'),
      );
    }
  };

  const stopRecording = (): void => {
    recognitionRef.current?.stop();
  };

  const reset = (): void => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    transcriptRef.current = '';
    segmentsRef.current = [];
    setRecording(false);
    setTranscript('');
    setSegments([]);
    setProposal(null);
    setError(null);
  };

  const updateProposal = (patch: Partial<VoiceAuthoringProposal['proposedStep']>): void => {
    setProposal((current) =>
      current
        ? {
            ...current,
            proposedStep: { ...current.proposedStep, ...patch },
            narrationScript: patch.body ?? current.narrationScript,
          }
        : current,
    );
  };

  return (
    <section className="operations-voice" aria-label={authoringText('Voice authoring')}>
      <div className="ops-box">
        <h3>
          <Mic size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Speak a step into existence')}
        </h3>
        <p className="ops-box-body">
          {authoringText(
            'Say the step in plain language. Lodariq keeps the transcript in this frame, turns it into a bounded proposal, and waits for your review before touching the draft.',
          )}
        </p>
        <div className="ops-row">
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={!supported || recording}
            onClick={startRecording}
            type="button"
          >
            <Mic size={13} strokeWidth={2} aria-hidden="true" />
            {authoringText('Start listening')}
          </button>
          <button className="ops-btn" disabled={!recording} onClick={stopRecording} type="button">
            <Circle size={13} strokeWidth={2} aria-hidden="true" />
            {authoringText('Stop and review')}
          </button>
          <button
            className="ops-btn"
            disabled={!transcript && !proposal}
            onClick={reset}
            type="button"
          >
            <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
            {authoringText('Clear')}
          </button>
        </div>
        {!supported ? (
          <p className="ops-callout" data-tone="warning" role="status">
            {authoringText(
              'Voice input is not available in this browser. You can still paste a transcript below and review the same proposal.',
            )}
          </p>
        ) : null}
        {recording ? (
          <p className="ops-callout" data-tone="info" role="status" aria-live="polite">
            {authoringText(
              'Listening… Say “new step” to begin a separate take, then stop when you are done.',
            )}
          </p>
        ) : null}
        {error ? (
          <p className="ops-callout" data-tone="warning" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="ops-box">
        <h3>{authoringText('Transcript')}</h3>
        <label className="ops-field">
          <span>{authoringText('Words to turn into a draft proposal')}</span>
          <textarea
            maxLength={10_000}
            onChange={(event) => {
              const value = normalizeTranscript(event.currentTarget.value);
              transcriptRef.current = value;
              setTranscript(value);
              setProposal(null);
            }}
            rows={5}
            value={transcript}
          />
        </label>
        <div className="ops-row">
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={!transcript.trim() || recording}
            onClick={() => {
              const next = createVoiceAuthoringProposal({
                transcript,
                segments,
                locale: navigator.language || 'en-US',
                ...(target ? { target } : {}),
              });
              setProposal(next);
            }}
            type="button"
          >
            {authoringText('Prepare step review')}
          </button>
        </div>
      </div>

      {proposal ? (
        <div className="ops-box" data-voice-proposal="true">
          <h3>
            <Check size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Review before adding')}
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'This is a proposal, not an automatic edit. Edit the copy, then explicitly add the reviewed step to the draft.',
            )}
          </p>
          <label className="ops-field">
            <span>{authoringText('Step title')}</span>
            <input
              maxLength={240}
              onChange={(event) => updateProposal({ title: event.currentTarget.value })}
              value={proposal.proposedStep.title}
            />
          </label>
          <label className="ops-field">
            <span>{authoringText('Step copy')}</span>
            <textarea
              maxLength={10_000}
              onChange={(event) => updateProposal({ body: event.currentTarget.value })}
              rows={5}
              value={proposal.proposedStep.body}
            />
          </label>
          <label className="ops-field">
            <span>{authoringText('Narration script')}</span>
            <textarea
              maxLength={2_000}
              onChange={(event) =>
                setProposal((current) =>
                  current
                    ? { ...current, narrationScript: event.currentTarget.value.slice(0, 2_000) }
                    : current,
                )
              }
              rows={4}
              value={proposal.narrationScript}
            />
          </label>
          {proposal.proposedTarget ? (
            <p className="ops-callout" data-tone="info">
              {authoringText('Target: {target}', {
                target: proposal.proposedTarget.accessibilityName,
              })}
            </p>
          ) : null}
          <div className="ops-row">
            <button
              className="ops-btn"
              data-variant="primary"
              disabled={
                !proposal.proposedStep.title.trim() ||
                !proposal.proposedStep.body.trim() ||
                !proposal.narrationScript.trim()
              }
              onClick={() => {
                controller.applyVoiceAuthoringProposal(proposal);
                setProposal(null);
              }}
              type="button"
            >
              {authoringText('Add reviewed step to draft')}
            </button>
            <span className="ops-tag">{authoringText('Review required')}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function voiceProposalTarget(
  snapshot: LocalAuthoringFrameSnapshot,
): { targetId: string; accessibilityName: string } | null {
  const step = snapshot.documentState.blocks.find((block) => block.id === snapshot.activeStepId);
  const targetId = step
    ? (step.children.find((child) => child.type === 'tooltip')?.props.targetId ??
      step.props.targetId)
    : null;
  if (!targetId) return null;
  const target = snapshot.documentState.targets.find((candidate) => candidate.id === targetId);
  if (!target) return null;
  return {
    targetId,
    accessibilityName:
      target.identity?.display.authorLabel ??
      target.fingerprint.accessibleName ??
      target.fingerprint.role ??
      targetId,
  };
}
