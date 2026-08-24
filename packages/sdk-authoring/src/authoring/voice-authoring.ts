import type { VoiceAuthoringProposal, VoiceTranscriptSegment } from '@lodariq/schema';

const MAX_TRANSCRIPT_LENGTH = 10_000;
const MAX_TITLE_LENGTH = 240;
const MAX_BODY_LENGTH = 10_000;
const MAX_SEGMENTS = 200;
const STEP_BREAK_PATTERN = /\b(?:new|next|another)\s+step\b/giu;
const COMMAND_PREFIX_PATTERN = /^(?:please\s+)?(?:create|add|make|draft)\s+(?:a\s+)?/iu;

export interface VoiceAuthoringDraftInput {
  readonly transcript: string;
  readonly segments: readonly VoiceTranscriptSegment[];
  readonly locale: string;
  readonly proposalId?: string;
  readonly target?: {
    readonly targetId: string;
    readonly accessibilityName: string;
  };
}

/**
 * Turns one bounded microphone transcript into a reviewable authoring proposal.
 * This is intentionally deterministic: speech recognition supplies words, but
 * it never gets permission to invent a block tree or commit a draft.
 */
export function createVoiceAuthoringProposal(
  input: VoiceAuthoringDraftInput,
): VoiceAuthoringProposal | null {
  const transcript = normalizeTranscript(input.transcript);
  if (!transcript) return null;

  const source = firstStepUtterance(transcript);
  const titleAndBody = splitTitleAndBody(stripCommandPrefix(source));
  const segments = normalizeSegments(input.segments, transcript);
  const proposalId = input.proposalId ?? createProposalId();
  const proposedTarget = normalizedTarget(input.target);

  return {
    proposalId,
    locale: normalizeLocale(input.locale),
    transcript,
    segments,
    proposedStep: titleAndBody,
    narrationScript: titleAndBody.body.slice(0, 2_000),
    ...(proposedTarget ? { proposedTarget } : {}),
    reviewRequired: true,
  };
}

function normalizedTarget(
  target: VoiceAuthoringDraftInput['target'],
): VoiceAuthoringProposal['proposedTarget'] | undefined {
  const targetId = target?.targetId.trim();
  const accessibilityName = target?.accessibilityName.replace(/\s+/gu, ' ').trim();
  if (
    !targetId ||
    !accessibilityName ||
    targetId.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(targetId)
  ) {
    return undefined;
  }
  return { targetId, accessibilityName: accessibilityName.slice(0, 500) };
}

export function normalizeTranscript(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, MAX_TRANSCRIPT_LENGTH);
}

function firstStepUtterance(transcript: string): string {
  const first = transcript
    .split(STEP_BREAK_PATTERN)
    .map((part) => part.trim())
    .find(Boolean);
  return first || transcript;
}

function stripCommandPrefix(value: string): string {
  const stripped = value.replace(COMMAND_PREFIX_PATTERN, '').trim();
  return (
    stripped
      .replace(/^step\s+/iu, '')
      .replace(/^called\s+/iu, '')
      .trim() || value
  );
}

function splitTitleAndBody(value: string): { title: string; body: string } {
  const sentenceEnd = value.search(/[.!?](?:\s|$)/u);
  if (sentenceEnd > 0) {
    const title = value
      .slice(0, sentenceEnd + 1)
      .replace(/[.!?]+$/u, '')
      .trim();
    const body = value.slice(sentenceEnd + 1).trim();
    if (title && body) return boundedStepCopy(title, body);
  }

  const words = value.split(' ');
  const title = words
    .slice(0, Math.min(8, words.length))
    .join(' ')
    .replace(/[.!?]+$/u, '')
    .trim();
  const body = value.trim();
  return boundedStepCopy(title || 'Untitled voice step', body);
}

function boundedStepCopy(title: string, body: string): { title: string; body: string } {
  return {
    title: title.slice(0, MAX_TITLE_LENGTH),
    body: body.slice(0, MAX_BODY_LENGTH),
  };
}

function normalizeSegments(
  segments: readonly VoiceTranscriptSegment[],
  transcript: string,
): VoiceTranscriptSegment[] {
  const normalized = segments
    .filter((segment) => segment.text.trim())
    .slice(0, MAX_SEGMENTS)
    .map((segment) => ({
      text: normalizeTranscript(segment.text).slice(0, 2_000),
      startMs: Math.max(0, Math.min(300_000, segment.startMs)),
      endMs: Math.max(1, Math.min(300_000, segment.endMs)),
    }))
    .filter((segment) => segment.text && segment.endMs >= segment.startMs);
  if (normalized.length) return normalized;
  return [
    {
      text: transcript.slice(0, 2_000),
      startMs: 0,
      endMs: Math.max(1, Math.min(300_000, transcript.length * 55)),
    },
  ];
}

function normalizeLocale(value: string): string {
  const locale = value.trim();
  return locale.slice(0, 35) || 'en-US';
}

function createProposalId(): string {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/gu, '');
  if (uuid) return `voice_${uuid}`;
  return `voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}
