// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary } from '@lodariq/schema';
import {
  JOURNEY_HANDOFF_MAX_AGE_MS,
  JOURNEY_HANDOFF_PARAM,
  decodeJourneyHandoff,
  encodeJourneyHandoff,
  handoffDestinationOrigin,
  handoffDestinationUrl,
  readJourneyHandoffFromLocation,
  resumeStepIdFor,
  stripJourneyHandoffParam,
} from '../../../../../packages/sdk-runtime/src/journey-handoff';

const NOW = 1_700_000_000_000;

const token = {
  applicationId: 'billing',
  documentId: 'doc_1',
  stepId: 'step_2',
  contentHash: `sha256-${'a'.repeat(64)}`,
  resumeMode: 'next-step' as const,
  issuedAt: NOW,
};

const billing: ApplicationSummary = {
  id: 'billing',
  name: 'Meridian Billing',
  originPatterns: ['*.meridian.test', 'billing.meridian.test'],
  isPrimary: false,
};

describe('journey handoff token', () => {
  it('round-trips through a URL-safe encoding', () => {
    expect(decodeJourneyHandoff(encodeJourneyHandoff(token), NOW)).toEqual(token);
    expect(encodeJourneyHandoff(token)).not.toMatch(/[+/=]/);
  });

  it('refuses a token older than the handoff window', () => {
    const stale = encodeJourneyHandoff({
      ...token,
      issuedAt: NOW - JOURNEY_HANDOFF_MAX_AGE_MS - 1,
    });
    expect(decodeJourneyHandoff(stale, NOW)).toBeNull();
  });

  it('refuses a token issued in the future or with a missing field', () => {
    expect(
      decodeJourneyHandoff(encodeJourneyHandoff({ ...token, issuedAt: NOW + 1 }), NOW),
    ).toBeNull();
    expect(decodeJourneyHandoff(btoa('{"applicationId":"billing"}'), NOW)).toBeNull();
    expect(decodeJourneyHandoff('not-base64!!', NOW)).toBeNull();
  });

  it('refuses undeclared fields, invalid identifiers, and non-canonical hashes', () => {
    expect(
      decodeJourneyHandoff(
        btoa(JSON.stringify({ ...token, bearer: 'must-not-cross-origins' })),
        NOW,
      ),
    ).toBeNull();
    expect(decodeJourneyHandoff(encodeJourneyHandoff({ ...token, stepId: 'bad step' }), NOW)).toBe(
      null,
    );
    expect(
      decodeJourneyHandoff(encodeJourneyHandoff({ ...token, contentHash: 'sha256:abc' }), NOW),
    ).toBeNull();
  });

  it('carries no personal data — only where the journey was', () => {
    const decoded = decodeJourneyHandoff(encodeJourneyHandoff(token), NOW)!;
    expect(Object.keys(decoded).sort()).toEqual([
      'applicationId',
      'contentHash',
      'documentId',
      'issuedAt',
      'resumeMode',
      'stepId',
    ]);
  });
});

describe('handoff destination', () => {
  it('skips wildcard patterns, which name a set of hosts rather than a destination', () => {
    expect(handoffDestinationOrigin(billing)).toBe('https://billing.meridian.test');
  });

  it('returns nothing when every pattern is a wildcard, so the player stays put', () => {
    expect(
      handoffDestinationOrigin({ ...billing, originPatterns: ['*.meridian.test'] }),
    ).toBeNull();
    expect(handoffDestinationUrl({ ...billing, originPatterns: ['*.x.test'] }, token)).toBeNull();
  });

  it('refuses credentials, paths, and non-web destination schemes', () => {
    for (const pattern of [
      'https://user:secret@billing.meridian.test',
      'https://billing.meridian.test/private',
      'javascript:alert(1)',
      'ftp://billing.meridian.test',
    ]) {
      expect(handoffDestinationOrigin({ ...billing, originPatterns: [pattern] })).toBeNull();
    }
  });

  it('puts the token in the destination URL', () => {
    const url = new URL(handoffDestinationUrl(billing, token)!);
    expect(url.origin).toBe('https://billing.meridian.test');
    expect(decodeJourneyHandoff(url.searchParams.get(JOURNEY_HANDOFF_PARAM)!, NOW)).toEqual(token);
  });

  it('reads and then strips the token, so a shared link cannot replay progress', () => {
    const href = handoffDestinationUrl(billing, token)!;
    expect(readJourneyHandoffFromLocation(href, NOW)).toEqual(token);
    const stripped = stripJourneyHandoffParam(href);
    expect(stripped).not.toContain(JOURNEY_HANDOFF_PARAM);
    expect(readJourneyHandoffFromLocation(stripped, NOW)).toBeNull();
  });
});

describe('resume mode', () => {
  const stepIds = ['step_1', 'step_2', 'step_3'];

  it('resumes on, after, or at the start of the sequence', () => {
    expect(resumeStepIdFor({ ...token, resumeMode: 'same-step' }, stepIds)).toBe('step_2');
    expect(resumeStepIdFor({ ...token, resumeMode: 'next-step' }, stepIds)).toBe('step_3');
    expect(resumeStepIdFor({ ...token, resumeMode: 'restart' }, stepIds)).toBe('step_1');
  });

  it('resolves to nothing when the sender’s step is gone from the destination', () => {
    expect(resumeStepIdFor(token, ['step_9'])).toBeUndefined();
    expect(resumeStepIdFor({ ...token, stepId: 'step_3' }, stepIds)).toBeUndefined();
  });
});

describe('picking a tour back up after an interruption', () => {
  const tour = {
    documentId: 'doc_1',
    contentHash: token.contentHash,
    steps: [{ id: 'step_1' }, { id: 'step_2' }, { id: 'step_3' }],
  };

  function arriveWith(search: string): {
    runtime: { clearTourResume: ReturnType<typeof vi.fn> };
    playTour: ReturnType<typeof vi.fn>;
  } {
    window.history.replaceState(null, '', `/app${search}`);
    return { runtime: { clearTourResume: vi.fn() }, playTour: vi.fn(async () => undefined) };
  }

  const run = async (resume: unknown, runtime: unknown, playTour: unknown): Promise<void> => {
    const { continueInterruptedTour } =
      await import('../../../../../packages/sdk-runtime/src/loader/resume-tour');
    await (continueInterruptedTour as unknown as (...args: unknown[]) => Promise<void>)(
      resume,
      runtime,
      { documentId: 'doc_1' },
      {},
      async () => tour,
      playTour,
    );
  };

  it('lets a handoff outrank whatever this origin remembered', async () => {
    const handoff = encodeJourneyHandoff({ ...token, issuedAt: Date.now() });
    const { runtime, playTour } = arriveWith(`?${JOURNEY_HANDOFF_PARAM}=${handoff}`);
    await run({ stepId: 'step_1', documentId: 'doc_1' }, runtime, playTour);
    // next-step from step_2 — the stored resume would have said step_1.
    expect(playTour).toHaveBeenCalledWith(tour, { initialStepId: 'step_3' });
    expect(runtime.clearTourResume).toHaveBeenCalled();
  });

  it('strips the token so a shared link cannot replay someone else’s progress', async () => {
    const handoff = encodeJourneyHandoff({ ...token, issuedAt: Date.now() });
    const { runtime, playTour } = arriveWith(`?${JOURNEY_HANDOFF_PARAM}=${handoff}&keep=1`);
    await run(null, runtime, playTour);
    expect(window.location.search).toBe('?keep=1');
  });

  it('falls through to the stored resume when no token arrived', async () => {
    const { runtime, playTour } = arriveWith('');
    await run({ stepId: 'step_2', documentId: 'doc_1' }, runtime, playTour);
    expect(playTour).not.toHaveBeenCalled();
    // No canResumeTour on this stub, so the resume is discarded rather than guessed at.
    expect(runtime.clearTourResume).toHaveBeenCalled();
  });

  it('does nothing at all when there is neither a token nor a resume', async () => {
    const { runtime, playTour } = arriveWith('');
    await run(null, runtime, playTour);
    expect(playTour).not.toHaveBeenCalled();
    expect(runtime.clearTourResume).not.toHaveBeenCalled();
  });
});
