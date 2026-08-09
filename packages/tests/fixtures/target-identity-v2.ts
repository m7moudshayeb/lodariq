import type { TargetIdentityV2 } from '@lodariq/schema';

interface RenderedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

const CAPTURED_VIEWPORT: ViewportSize = { width: 1_440, height: 900 };
const CAPTURED_CONTAINER_RECT: RenderedRect = {
  left: 120,
  top: 80,
  width: 960,
  height: 640,
};
const CAPTURED_TARGET_RECT: RenderedRect = {
  left: 920,
  top: 120,
  width: 144,
  height: 48,
};

/**
 * Produces the bounded ratios captured from getBoundingClientRect snapshots.
 * Raw viewport/page coordinates deliberately never leave this helper.
 */
function normalizedTopologyFromRects(
  target: RenderedRect,
  container: RenderedRect,
  viewport: ViewportSize,
): NonNullable<TargetIdentityV2['visualTopologies']>[number] {
  return {
    viewportClass: 'desktop',
    stateId: 'projects.loaded',
    target: {
      widthRatio: target.width / container.width,
      heightRatio: target.height / container.height,
      aspectRatio: target.width / target.height,
      centerXRatio: (target.left - container.left + target.width / 2) / container.width,
      centerYRatio: (target.top - container.top + target.height / 2) / container.height,
    },
    container: {
      widthRatio: container.width / viewport.width,
      heightRatio: container.height / viewport.height,
    },
    relations: [
      {
        kind: 'right-of',
        reference: 'semantic-peer',
        referenceKey: 'projects-heading',
        distanceBucket: 'near',
        distanceRatio: 0.075,
      },
    ],
  };
}

export function createTargetIdentityV2(targetId = 'target_new_project'): TargetIdentityV2 {
  return {
    schemaVersion: 2,
    targetId,
    intent: {
      elementKind: 'control',
      requiredAction: 'observe-click',
    },
    invariants: {
      configuredAttributes: { 'data-testid': 'new-project' },
      semanticAttributes: { type: 'button' },
    },
    semantics: {
      tagName: 'button',
      role: 'button',
      controlGroup: 'project-actions',
    },
    context: {
      routePatternId: 'projects.index',
      stateId: 'projects.loaded',
      ancestorRoles: ['main'],
      relationships: [{ kind: 'near-heading', semanticRole: 'heading' }],
    },
    visualTopologies: [
      normalizedTopologyFromRects(CAPTURED_TARGET_RECT, CAPTURED_CONTAINER_RECT, CAPTURED_VIEWPORT),
    ],
    localizedEvidence: [
      {
        locale: 'en',
        accessibleName: 'New project',
        label: 'New project',
        nearbyText: ['Projects'],
      },
      {
        locale: 'de-DE',
        accessibleName: 'Neues Projekt',
      },
    ],
    captureEvidence: {
      sampleCount: 3,
      stableSignalFamilies: [
        'configured-attribute',
        'element-semantics',
        'ancestor-context',
        'visual-topology',
      ],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.76,
      quality: 'strong',
    },
    display: { authorLabel: 'New project button' },
  };
}
