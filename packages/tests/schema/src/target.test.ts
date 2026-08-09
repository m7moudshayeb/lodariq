import { describe, expect, it } from 'vitest';
import {
  Target,
  TargetIdentityV2,
  validate,
  type TargetIdentityV2 as TargetIdentityV2Type,
} from '@lodariq/schema';
import { hasTargetIdentityV2Envelope } from '@lodariq/schema/target-runtime';
import { createTargetIdentityV2 } from '../../fixtures/target-identity-v2';

const invalidIdentityMutations: Array<[string, (identity: TargetIdentityV2Type) => void]> = [
  [
    'absolute pixel geometry',
    (identity) => {
      Object.assign(identity.visualTopologies![0]!.target, { left: 920, top: 120 });
    },
  ],
  [
    'a raw selector attribute',
    (identity) => {
      identity.invariants.configuredAttributes!['selector'] = '#new-project';
    },
  ],
  [
    'a raw style attribute',
    (identity) => {
      identity.invariants.configuredAttributes!['style'] = 'position: fixed';
    },
  ],
  [
    'a URL-bearing href attribute',
    (identity) => {
      identity.invariants.configuredAttributes!['href'] = 'https://customer.example/projects';
    },
  ],
  [
    'a URL-like configured value',
    (identity) => {
      identity.invariants.configuredAttributes!['data-destination'] =
        'https://customer.example/projects';
    },
  ],
  [
    'a relative-path configured value',
    (identity) => {
      identity.invariants.configuredAttributes!['data-destination'] = '/projects/new';
    },
  ],
  [
    'a backslash-path configured value',
    (identity) => {
      identity.invariants.configuredAttributes!['data-destination'] = 'projects\\new';
    },
  ],
  [
    'a URL-scheme configured value',
    (identity) => {
      identity.invariants.configuredAttributes!['data-destination'] = 'mailto:owner@example.com';
    },
  ],
];

describe('Target Identity V2', () => {
  it('accepts a selector-free identity with normalized rendered-topology ratios', () => {
    const identity = createTargetIdentityV2();

    expect(validate(TargetIdentityV2, identity).valid).toBe(true);
    expect(identity.visualTopologies![0]!.target).toEqual({
      widthRatio: 0.15,
      heightRatio: 0.075,
      aspectRatio: 3,
      centerXRatio: 872 / 960,
      centerYRatio: 0.1,
    });
    expect(identity.visualTopologies![0]!.target).not.toHaveProperty('left');
    expect(identity.visualTopologies![0]!.target).not.toHaveProperty('top');
    expect(identity.invariants.configuredAttributes).not.toHaveProperty('selector');
    expect(identity.invariants.configuredAttributes).not.toHaveProperty('style');
    expect(identity.invariants.configuredAttributes).not.toHaveProperty('href');
  });

  it.each(invalidIdentityMutations)('rejects %s', (_case, mutate) => {
    const identity = createTargetIdentityV2();
    mutate(identity);

    expect(validate(TargetIdentityV2, identity).valid).toBe(false);
    expect(hasTargetIdentityV2Envelope(identity)).toBe(false);
  });

  it('keeps the lightweight browser envelope guard aligned with canonical nested constraints', () => {
    const sparseLocalizedEvidence: unknown[] = [];
    sparseLocalizedEvidence.length = 1;

    const cases: unknown[] = [
      createTargetIdentityV2(),
      { ...createTargetIdentityV2(), localizedEvidence: sparseLocalizedEvidence },
      { ...createTargetIdentityV2(), display: undefined },
      { ...createTargetIdentityV2(), invariants: { configuredAttributes: null } },
      {
        ...createTargetIdentityV2(),
        visualTopologies: [
          {
            ...createTargetIdentityV2().visualTopologies![0],
            target: {
              ...createTargetIdentityV2().visualTopologies![0]!.target,
              aspectRatio: 'wide',
            },
          },
        ],
      },
      {
        ...createTargetIdentityV2(),
        captureEvidence: {
          ...createTargetIdentityV2().captureEvidence,
          stableSignalFamilies: ['element-semantics', 'element-semantics'],
        },
      },
      {
        ...createTargetIdentityV2(),
        visualTopologies: [
          {
            ...createTargetIdentityV2().visualTopologies![0],
            container: { widthRatio: 0.5, heightRatio: 0.5, left: 100 },
          },
        ],
      },
    ];

    for (const value of cases) {
      expect(hasTargetIdentityV2Envelope(value)).toBe(validate(TargetIdentityV2, value).valid);
    }
  });

  it('keeps a legacy fingerprint-only target valid', () => {
    const legacyTarget = {
      id: 'target_legacy',
      fingerprint: {
        stableAttributes: { 'data-testid': 'legacy-control' },
        tagName: 'button',
        role: 'button',
        accessibleName: 'Continue',
      },
    };

    expect(validate(Target, legacyTarget).valid).toBe(true);
  });

  it('accepts bounded visual fingerprints for presentation-only anchors', () => {
    const identity = createTargetIdentityV2();
    identity.intent.requiredAction = 'anchor';
    identity.intent.resolutionMode = 'visual-anchor';
    identity.visualFingerprints = [
      {
        viewportClass: 'desktop',
        stateId: 'projects.loaded',
        structuralHash: '0123456789abcdef',
        occupancyGrid: '0'.repeat(64),
        appearanceHash: 'fedcba9876543210',
        neighborhoodHash: '0011223344556677',
        layoutSlot: { siblingIndex: 2, siblingCount: 8 },
      },
    ];

    expect(validate(TargetIdentityV2, identity).valid).toBe(true);
    expect(hasTargetIdentityV2Envelope(identity)).toBe(true);
  });

  it('rejects malformed visual hashes and occupancy data', () => {
    const identity = createTargetIdentityV2();
    identity.intent.resolutionMode = 'visual-anchor';
    identity.visualFingerprints = [
      {
        viewportClass: 'desktop',
        structuralHash: 'not-a-hash',
        occupancyGrid: `${'0'.repeat(63)}x`,
        appearanceHash: 'fedcba9876543210',
        neighborhoodHash: '0011223344556677',
      },
    ];

    expect(validate(TargetIdentityV2, identity).valid).toBe(false);
    expect(hasTargetIdentityV2Envelope(identity)).toBe(false);
  });

  it('rejects visual-only resolution for an interaction target', () => {
    const identity = createTargetIdentityV2();
    identity.intent.resolutionMode = 'visual-anchor';

    expect(validate(TargetIdentityV2, identity).valid).toBe(false);
    expect(hasTargetIdentityV2Envelope(identity)).toBe(false);
  });
});
