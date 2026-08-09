// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementFingerprint, Target, TargetIdentityV2 } from '@lodariq/schema';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { createTargetIdentityV2 } from '../../../fixtures/target-identity-v2';

interface RectBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const LEGACY_FINGERPRINT: ElementFingerprint = {
  stableAttributes: {},
  tagName: 'button',
};

const CAPTURED_CONTAINER_RECT: RectBounds = {
  left: 120,
  top: 80,
  width: 960,
  height: 640,
};

const CAPTURED_TARGET_RECT: RectBounds = {
  left: 920,
  top: 120,
  width: 144,
  height: 48,
};

function domRect({ left, top, width, height }: RectBounds): DOMRect {
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

function renderAt(element: Element, bounds: RectBounds): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(domRect(bounds));
}

function targetFor(identity: TargetIdentityV2): Pick<Target, 'id' | 'fingerprint' | 'identity'> {
  return {
    id: identity.targetId,
    fingerprint: LEGACY_FINGERPRINT,
    identity,
  };
}

function durableIdentity(): TargetIdentityV2 {
  const identity = structuredClone(createTargetIdentityV2());
  identity.invariants = {
    configuredAttributes: { 'data-testid': 'new-project' },
    semanticAttributes: { type: 'button' },
  };
  identity.semantics = { tagName: 'button', role: 'button' };
  identity.context = { ancestorRoles: ['main'] };
  delete identity.visualTopologies;
  identity.captureEvidence = {
    sampleCount: 3,
    stableSignalFamilies: [
      'configured-attribute',
      'semantic-attribute',
      'element-semantics',
      'ancestor-context',
    ],
    uniqueCandidateCount: 1,
    runnerUpMargin: 0.75,
    quality: 'strong',
  };
  return identity;
}

function appendDurableButton(label: string, testId = 'new-project'): HTMLButtonElement {
  const main = document.createElement('main');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['testid'] = testId;
  button.setAttribute('aria-label', label);
  main.appendChild(button);
  document.body.appendChild(main);
  return button;
}

describe('Target Identity V2 resolver acceptance', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves afresh after the customer application replaces the entire DOM node', () => {
    const identity = durableIdentity();
    const original = appendDurableButton('New project');

    const firstResolution = resolveTarget(targetFor(identity));
    expect(firstResolution.state).toBe('found');
    expect(firstResolution.element).toBe(original);

    document.body.replaceChildren();
    const replacement = appendDurableButton('New project');
    const secondResolution = resolveTarget(targetFor(identity));

    expect(original.isConnected).toBe(false);
    expect(secondResolution.state).toBe('found');
    expect(secondResolution.element).toBe(replacement);
    expect(secondResolution.element).not.toBe(original);
  });

  it('ignores stale English text in an unmatched locale and resolves from independent evidence', () => {
    const identity = durableIdentity();
    identity.localizedEvidence = [
      {
        locale: 'en',
        accessibleName: 'New project',
        label: 'New project',
      },
    ];
    document.documentElement.lang = 'de-DE';
    const germanButton = appendDurableButton('Neues Projekt');

    const result = resolveTarget(targetFor(identity), document, { locale: 'de-DE' });

    expect(result.state).toBe('found');
    expect(result.element).toBe(germanButton);
    expect(result.currentLocale).toBe('de-DE');
    expect(result.evidenceFamilies).not.toContain('localized-text');
    expect(result.evidenceFamilies).toEqual(
      expect.arrayContaining(['configured-attribute', 'element-semantics']),
    );
  });

  it('never resolves from rendered topology alone', () => {
    const identity = structuredClone(createTargetIdentityV2());
    identity.invariants = {};
    identity.semantics = {};
    identity.context = {};
    identity.localizedEvidence = [];
    delete identity.visualTopologies![0]!.stateId;
    identity.visualTopologies![0]!.relations = [{ kind: 'inside', reference: 'container' }];
    identity.captureEvidence = {
      sampleCount: 3,
      stableSignalFamilies: ['visual-topology'],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.9,
      quality: 'strong',
    };

    const container = document.createElement('main');
    const button = document.createElement('button');
    button.type = 'button';
    container.appendChild(button);
    document.body.appendChild(container);
    renderAt(container, CAPTURED_CONTAINER_RECT);
    renderAt(button, CAPTURED_TARGET_RECT);

    const result = resolveTarget(targetFor(identity));

    expect(result.state).toBe('needs_review');
    expect(result.element).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.resolutionMethod).toBe('none');
    expect(result.evidenceFamilies).toContain('visual-topology');
    expect(result.evidenceFamilies).not.toContain('configured-attribute');
    expect(result.evidenceFamilies).not.toContain('element-semantics');
  });

  it('does not let topology clear a tie between otherwise identical durable candidates', () => {
    const identity = durableIdentity();
    identity.invariants = { semanticAttributes: { type: 'button' } };
    identity.context = {
      ancestorRoles: ['main'],
      relationships: [{ kind: 'inside', semanticRole: 'main' }],
    };
    identity.visualTopologies = [
      {
        viewportClass: 'desktop',
        target: {
          widthRatio: 0.15,
          heightRatio: 0.075,
          aspectRatio: 3,
          centerXRatio: 0.91,
          centerYRatio: 0.1,
        },
        container: { widthRatio: 0.667, heightRatio: 0.711 },
        relations: [{ kind: 'inside', reference: 'container' }],
      },
    ];
    identity.localizedEvidence = [];
    identity.captureEvidence = {
      sampleCount: 3,
      stableSignalFamilies: [
        'semantic-attribute',
        'element-semantics',
        'ancestor-context',
        'relationship-context',
        'visual-topology',
      ],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.2,
      quality: 'strong',
    };

    const main = document.createElement('main');
    const selected = document.createElement('button');
    const runnerUp = document.createElement('button');
    selected.type = 'button';
    runnerUp.type = 'button';
    main.append(selected, runnerUp);
    document.body.appendChild(main);
    renderAt(main, CAPTURED_CONTAINER_RECT);
    renderAt(selected, CAPTURED_TARGET_RECT);
    renderAt(runnerUp, { left: 160, top: 560, width: 144, height: 48 });

    const result = resolveTarget(targetFor(identity));

    expect(result.state).toBe('ambiguous');
    expect(result.reasonCode).toBe('multiple_candidates');
    expect(result.element).toBeNull();
  });

  it('uses a same-locale control label to break a durable tie between delegated sidebar links', () => {
    const identity = structuredClone(createTargetIdentityV2());
    identity.targetId = 'target_projects_navigation';
    identity.intent = {
      elementKind: 'control',
      requiredAction: 'observe-click',
      resolutionMode: 'semantic',
    };
    identity.invariants = {};
    identity.semantics = { tagName: 'a' };
    identity.context = {
      ancestorRoles: ['nav', 'complementary'],
      relationships: [
        { kind: 'inside', semanticRole: 'nav' },
        { kind: 'near-heading', semanticRole: 'heading' },
      ],
    };
    identity.localizedEvidence = [{ locale: 'en', accessibleName: 'Projects' }];
    delete identity.visualTopologies;
    delete identity.visualFingerprints;
    identity.captureEvidence = {
      sampleCount: 5,
      stableSignalFamilies: [
        'element-semantics',
        'ancestor-context',
        'relationship-context',
        'localized-text',
      ],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.15,
      quality: 'usable',
    };

    document.body.innerHTML = `
      <aside>
        <h2>Acme</h2>
        <nav>
          <a data-route="dashboard">Dashboard</a>
          <a data-route="projects">Projects</a>
          <a data-route="billing">Billing</a>
        </nav>
      </aside>
    `;
    const projects = document.querySelector('[data-route="projects"]');

    const result = resolveTarget(targetFor(identity), document, { locale: 'en' });

    expect(result.state).toBe('found');
    expect(result.element).toBe(projects);
    expect(result.anchor?.interactionSafe).toBe(true);
    expect(result.evidenceFamilies).toEqual(
      expect.arrayContaining([
        'element-semantics',
        'ancestor-context',
        'relationship-context',
        'localized-text',
      ]),
    );
  });

  it('fails closed when a delegated sidebar label is duplicated', () => {
    const identity = structuredClone(createTargetIdentityV2());
    identity.targetId = 'target_projects_navigation';
    identity.intent = {
      elementKind: 'control',
      requiredAction: 'observe-click',
      resolutionMode: 'semantic',
    };
    identity.invariants = {};
    identity.semantics = { tagName: 'a' };
    identity.context = { ancestorRoles: ['nav', 'complementary'] };
    identity.localizedEvidence = [{ locale: 'en', accessibleName: 'Projects' }];
    delete identity.visualTopologies;
    delete identity.visualFingerprints;
    identity.captureEvidence = {
      sampleCount: 3,
      stableSignalFamilies: ['element-semantics', 'ancestor-context', 'localized-text'],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.2,
      quality: 'usable',
    };

    document.body.innerHTML = `
      <aside><nav><a>Projects</a><a>Projects</a><a>Billing</a></nav></aside>
    `;

    const result = resolveTarget(targetFor(identity), document, { locale: 'en' });

    expect(result.state).toBe('ambiguous');
    expect(result.reasonCode).toBe('multiple_candidates');
    expect(result.element).toBeNull();
  });

  it('reports topology drift without overriding a uniquely resolved durable identity', () => {
    const identity = structuredClone(createTargetIdentityV2());
    identity.localizedEvidence = [];
    identity.context = {
      ancestorRoles: ['main'],
      stateId: 'projects.loaded',
      relationships: [{ kind: 'near-heading', semanticRole: 'heading' }],
    };
    identity.semantics = { tagName: 'button', role: 'button' };

    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.id = 'projects-heading';
    heading.textContent = 'Projects';
    const intended = document.createElement('button');
    intended.type = 'button';
    intended.dataset['testid'] = 'new-project';
    intended.textContent = 'Create';
    const distractor = document.createElement('button');
    distractor.type = 'button';
    distractor.dataset['testid'] = 'different-action';
    distractor.textContent = 'Create';
    main.append(heading, intended, distractor);
    document.body.appendChild(main);

    renderAt(main, CAPTURED_CONTAINER_RECT);
    renderAt(heading, { left: 830, top: 120, width: 100, height: 48 });
    renderAt(intended, { left: 140, top: 100, width: 720, height: 320 });
    renderAt(distractor, CAPTURED_TARGET_RECT);

    const result = resolveTarget(targetFor(identity), document, {
      stateId: 'projects.loaded',
    });

    expect(result.state).toBe('found');
    expect(result.reasonCode).toBe('resolved_with_drift');
    expect(result.element).toBe(intended);
    expect(result.evidenceFamilies).toContain('configured-attribute');
    expect(result.evidenceFamilies).not.toContain('visual-topology');
  });

  it('reports durable-evidence drift instead of falling through to a generic distractor', () => {
    const identity = durableIdentity();
    identity.localizedEvidence = [];

    const intended = appendDurableButton('Create', 'new-project-v2');
    const distractor = document.createElement('button');
    distractor.type = 'button';
    distractor.dataset['testid'] = 'other-action';
    distractor.textContent = 'Create';
    document.body.appendChild(distractor);

    const result = resolveTarget(targetFor(identity));

    expect(intended.getAttribute('data-testid')).not.toBe('new-project');
    expect(result.state).toBe('needs_review');
    expect(result.reasonCode).toBe('evidence_drift');
    expect(result.element).toBeNull();
    expect(result.evidenceFamilies).toContain('ancestor-context');
    expect(result.evidenceFamilies).not.toContain('configured-attribute');
  });

  it('enumerates matching candidates inside an open shadow root', () => {
    const identity = durableIdentity();
    const main = document.createElement('main');
    const host = document.createElement('customer-project-actions');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const shadowButton = document.createElement('button');
    shadowButton.type = 'button';
    shadowButton.dataset['testid'] = 'new-project';
    shadowButton.setAttribute('aria-label', 'New project');
    shadowRoot.appendChild(shadowButton);
    main.appendChild(host);
    document.body.appendChild(main);

    const result = resolveTarget(targetFor(identity));

    expect(result.state).toBe('found');
    expect(result.element).toBe(shadowButton);
  });

  it('treats a same-locale copy edit as supporting-evidence loss, not identity drift', () => {
    const identity = durableIdentity();
    identity.localizedEvidence = [{ locale: 'en', accessibleName: 'Create the old project' }];
    identity.captureEvidence.stableSignalFamilies.push('localized-text');
    const renamedButton = appendDurableButton('Create the renamed project');

    const result = resolveTarget(targetFor(identity), document, { locale: 'en' });

    expect(result.state).toBe('found');
    expect(result.element).toBe(renamedButton);
    expect(result.evidenceFamilies).not.toContain('localized-text');
  });

  it('replays same-group evidence for toolbar controls', () => {
    const identity = durableIdentity();
    identity.context.relationships = [
      {
        kind: 'same-group',
        semanticRole: 'toolbar',
        stableKey: 'data-testid:project-actions',
      },
    ];
    identity.captureEvidence.stableSignalFamilies.push('relationship-context');

    const main = document.createElement('main');
    const toolbar = document.createElement('div');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.dataset['testid'] = 'project-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['testid'] = 'new-project';
    button.setAttribute('aria-label', 'New project');
    toolbar.appendChild(button);
    main.appendChild(toolbar);
    document.body.appendChild(main);

    const result = resolveTarget(targetFor(identity));

    expect(result.state).toBe('found');
    expect(result.element).toBe(button);
    expect(result.evidenceFamilies).toContain('relationship-context');
  });

  it('does not turn viewport scrolling into topology drift', () => {
    const identity = durableIdentity();
    identity.visualTopologies = [
      {
        viewportClass: 'desktop',
        target: {
          widthRatio: 0.1,
          heightRatio: 0.05,
          aspectRatio: 3.2,
          centerXRatio: 0.8,
          centerYRatio: 0.1,
        },
      },
    ];
    identity.captureEvidence.stableSignalFamilies.push('visual-topology');
    const button = appendDurableButton('New project');
    renderAt(button, { left: 100, top: 700, width: 144, height: 45 });

    const result = resolveTarget(targetFor(identity));

    expect(result.state).toBe('found');
    expect(result.element).toBe(button);
    expect(result.evidenceFamilies).toContain('visual-topology');
  });
});
