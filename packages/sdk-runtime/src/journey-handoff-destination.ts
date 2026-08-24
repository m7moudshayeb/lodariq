import type { ApplicationSummary, JourneyHandoff } from '@lodariq/schema';

export const JOURNEY_HANDOFF_PARAM = 'lq_journey';

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

export function handoffDestinationOrigin(application: ApplicationSummary): string | null {
  for (const pattern of application.originPatterns) {
    if (pattern.includes('*')) continue;
    const origin = pattern.includes('://') ? pattern : `https://${pattern}`;
    try {
      const parsed = new URL(origin);
      if (
        (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash
      ) {
        continue;
      }
      return parsed.origin;
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

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
