import {
  JOURNEY_HANDOFF_PARAM,
  type JourneyHandoffToken,
} from './journey-handoff-destination';

export {
  encodeJourneyHandoff,
  handoffDestinationOrigin,
  handoffDestinationUrl,
  JOURNEY_HANDOFF_PARAM,
  type JourneyHandoffToken,
} from './journey-handoff-destination';

/**
 * Continuing one experience in a second application.
 *
 * The two applications are separate origins, so `sessionStorage` cannot carry
 * progress across. The URL can — it is the only channel a plain redirect keeps.
 * The token is therefore the handoff: it names the document, the step to resume
 * at, and the content hash the sender was playing, so a destination running a
 * different version refuses rather than resuming onto a step that moved.
 *
 * Nothing in the token identifies a person. It is progress, not a session.
 */

/** A handoff is a redirect, not a bookmark. Stale tokens are ignored. */
export const JOURNEY_HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;
const JOURNEY_HANDOFF_KEYS = [
  'applicationId',
  'contentHash',
  'documentId',
  'issuedAt',
  'resumeMode',
  'stepId',
] as const;
const JOURNEY_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const CONTENT_HASH_PATTERN = /^sha256-[0-9a-f]{64}$/u;

export function decodeJourneyHandoff(raw: string, now: number): JourneyHandoffToken | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const token = parsed as Partial<JourneyHandoffToken>;
  if (
    !hasExactKeys(token, JOURNEY_HANDOFF_KEYS) ||
    !isJourneyIdentifier(token.applicationId) ||
    !isJourneyIdentifier(token.documentId) ||
    !isJourneyIdentifier(token.stepId) ||
    typeof token.contentHash !== 'string' ||
    !CONTENT_HASH_PATTERN.test(token.contentHash) ||
    typeof token.issuedAt !== 'number' ||
    !Number.isSafeInteger(token.issuedAt) ||
    token.issuedAt < 0 ||
    (token.resumeMode !== 'same-step' &&
      token.resumeMode !== 'next-step' &&
      token.resumeMode !== 'restart')
  ) {
    return null;
  }
  if (now - token.issuedAt > JOURNEY_HANDOFF_MAX_AGE_MS || token.issuedAt > now) return null;
  return {
    applicationId: token.applicationId,
    contentHash: token.contentHash,
    documentId: token.documentId,
    issuedAt: token.issuedAt,
    resumeMode: token.resumeMode,
    stepId: token.stepId,
  };
}

export function readJourneyHandoffFromLocation(
  href: string,
  now: number,
): JourneyHandoffToken | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const raw = url.searchParams.get(JOURNEY_HANDOFF_PARAM);
  return raw ? decodeJourneyHandoff(raw, now) : null;
}

/**
 * Consumed tokens leave the address bar: a handoff URL that survives a share or
 * a bookmark would replay someone else's progress on the next visit.
 */
export function stripJourneyHandoffParam(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.delete(JOURNEY_HANDOFF_PARAM);
    return url.toString();
  } catch {
    return href;
  }
}

/** Where the destination should pick up, given the sender's step. */
export function resumeStepIdFor(
  token: JourneyHandoffToken,
  stepIds: readonly string[],
): string | undefined {
  if (token.resumeMode === 'restart') return stepIds[0];
  const index = stepIds.indexOf(token.stepId);
  if (index < 0) return undefined;
  if (token.resumeMode === 'same-step') return stepIds[index];
  return stepIds[index + 1];
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function hasExactKeys<T extends string>(
  value: object,
  expected: readonly T[],
): value is Record<T, unknown> {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && expected.every((key, index) => keys[index] === key);
}

function isJourneyIdentifier(value: unknown): value is string {
  return typeof value === 'string' && JOURNEY_IDENTIFIER_PATTERN.test(value);
}
