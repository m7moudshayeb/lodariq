import type { ApplicationSummary, JourneyHandoff } from '@lodariq/schema';

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

export const JOURNEY_HANDOFF_PARAM = 'lq_journey';
/** A handoff is a redirect, not a bookmark. Stale tokens are ignored. */
export const JOURNEY_HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;

export interface JourneyHandoffToken {
  applicationId: string;
  documentId: string;
  stepId: string;
  contentHash: string;
  resumeMode: JourneyHandoff['resumeMode'];
  issuedAt: number;
}

export function encodeJourneyHandoff(token: JourneyHandoffToken): string {
  return base64UrlEncode(JSON.stringify(token));
}

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
    typeof token.applicationId !== 'string' ||
    typeof token.documentId !== 'string' ||
    typeof token.stepId !== 'string' ||
    typeof token.contentHash !== 'string' ||
    typeof token.issuedAt !== 'number' ||
    (token.resumeMode !== 'same-step' &&
      token.resumeMode !== 'next-step' &&
      token.resumeMode !== 'restart')
  ) {
    return null;
  }
  if (now - token.issuedAt > JOURNEY_HANDOFF_MAX_AGE_MS || token.issuedAt > now) return null;
  return token as JourneyHandoffToken;
}

/**
 * The first origin pattern with no wildcard. A pattern like `*.example.com`
 * names a set of hosts, not a destination, so it cannot be navigated to.
 */
export function handoffDestinationOrigin(application: ApplicationSummary): string | null {
  for (const pattern of application.originPatterns) {
    if (pattern.includes('*')) continue;
    const origin = pattern.includes('://') ? pattern : `https://${pattern}`;
    try {
      return new URL(origin).origin;
    } catch {
      continue;
    }
  }
  return null;
}

export function handoffDestinationUrl(
  application: ApplicationSummary,
  token: JourneyHandoffToken,
): string | null {
  const origin = handoffDestinationOrigin(application);
  if (!origin) return null;
  const url = new URL(origin);
  url.searchParams.set(JOURNEY_HANDOFF_PARAM, encodeJourneyHandoff(token));
  return url.toString();
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

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
