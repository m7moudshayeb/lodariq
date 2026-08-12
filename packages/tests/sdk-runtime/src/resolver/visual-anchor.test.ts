// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TargetIdentityV2 } from '@lodariq/schema';
import { captureVisualFingerprint, resolveTarget } from '@lodariq/sdk-runtime/resolver';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('visual-anchor resolution bounds', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  });

  it('abstains before expensive hashing when an anonymous pool is too broad', () => {
    const elements = Array.from({ length: 70 }, (_, index) => {
      const element = document.createElement('div');
      element.getBoundingClientRect = vi.fn(() => domRect(20, 20 + index * 4, 240, 120));
      document.body.appendChild(element);
      return element;
    });
    const fingerprint = captureVisualFingerprint(elements[0]!);
    if (!fingerprint) throw new Error('visual fingerprint missing');
    const identity: TargetIdentityV2 = {
      schemaVersion: 2,
      targetId: 'target_broad_pool',
      intent: {
        elementKind: 'container',
        requiredAction: 'anchor',
        resolutionMode: 'visual-anchor',
      },
      invariants: {},
      semantics: { tagName: 'div' },
      context: {},
      visualFingerprints: [fingerprint],
      localizedEvidence: [],
      captureEvidence: {
        sampleCount: 3,
        stableSignalFamilies: ['visual-structure', 'visual-appearance', 'visual-neighborhood'],
        uniqueCandidateCount: 1,
        runnerUpMargin: 1,
        quality: 'strong',
      },
      display: { authorLabel: 'Anonymous card' },
    };

    const result = resolveTarget({
      id: identity.targetId,
      fingerprint: { tagName: 'div', stableAttributes: {} },
      identity,
    });

    expect(result.state).toBe('needs_review');
    expect(result.reasonCode).toBe('scan_limit_exceeded');
    expect(result.element).toBeNull();
    expect(result.anchor).toBeNull();
  });

  it('does not let Lodariq chrome change a host visual fingerprint', () => {
    const host = document.createElement('section');
    host.getBoundingClientRect = vi.fn(() => domRect(20, 20, 240, 120));
    document.body.appendChild(host);

    const before = captureVisualFingerprint(host);
    const chrome = document.createElement('lodariq-toolbar');
    host.appendChild(chrome);
    const after = captureVisualFingerprint(host);

    expect(before).not.toBeNull();
    expect(after).toEqual(before);
  });
});
