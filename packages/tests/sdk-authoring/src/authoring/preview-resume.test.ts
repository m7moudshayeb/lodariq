// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDraftPreviewResume,
  readDraftPreviewResume,
  writeDraftPreviewResume,
} from '../../../../../packages/sdk-authoring/src/authoring/preview-resume';

const WORKSPACE = 'wk_local_dev';
const KEY = `lodariq:preview-resume:${WORKSPACE}`;

describe('draft preview resume', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('brings back the session, the draft and the step the creator was on', () => {
    writeDraftPreviewResume(WORKSPACE, {
      sessionId: 'local_authoring_session:doc_tour_welcome',
      documentId: 'doc_tour_welcome',
      stepId: 'block_step_3',
      interactive: true,
    });

    expect(readDraftPreviewResume(WORKSPACE)).toMatchObject({
      sessionId: 'local_authoring_session:doc_tour_welcome',
      documentId: 'doc_tour_welcome',
      stepId: 'block_step_3',
      interactive: true,
    });
  });

  it('keys on the draft, never on the address bar', () => {
    const before = window.location.href;
    writeDraftPreviewResume(WORKSPACE, {
      sessionId: 'session',
      documentId: 'doc_tour_welcome',
      stepId: 'block_step_1',
      interactive: false,
    });

    expect(window.location.href).toBe(before);
    expect(Object.keys(sessionStorage)).toEqual([KEY]);
  });

  it('does not share the runtime resume slot', () => {
    // One sessionStorage key each. A draft recompiles on every keystroke, so the
    // runtime's rule — refuse to resume into content that changed — would throw
    // a preview away constantly if the two were pooled.
    sessionStorage.setItem('lodariq:tour-resume:wk_local_dev:development', '{}');
    writeDraftPreviewResume(WORKSPACE, {
      sessionId: 'session',
      documentId: 'doc_tour_welcome',
      stepId: 'block_step_2',
      interactive: false,
    });

    expect(sessionStorage.getItem('lodariq:tour-resume:wk_local_dev:development')).toBe('{}');
    expect(readDraftPreviewResume(WORKSPACE)?.stepId).toBe('block_step_2');
  });

  it('drops a record left behind by an abandoned tab', () => {
    vi.useFakeTimers();
    writeDraftPreviewResume(WORKSPACE, {
      sessionId: 'session',
      documentId: 'doc_tour_welcome',
      stepId: 'block_step_1',
      interactive: false,
    });
    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(readDraftPreviewResume(WORKSPACE)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('survives a malformed record without throwing at the creator', () => {
    sessionStorage.setItem(KEY, 'not json');
    expect(readDraftPreviewResume(WORKSPACE)).toBeNull();

    clearDraftPreviewResume(WORKSPACE);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
