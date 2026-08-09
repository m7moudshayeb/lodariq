// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureNeedsConfirmation,
  captureTargetEvidence,
  normalizeTargetElement,
} from '@lodariq/sdk-authoring/bridge';
import { validateTourPublishReadiness, type LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';

interface RectBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

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

function objectKeysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    for (const entry of value) objectKeysOf(entry, keys);
    return keys;
  }
  for (const [key, entry] of Object.entries(value)) {
    keys.add(key);
    objectKeysOf(entry, keys);
  }
  return keys;
}

describe('Target Identity V2 authoring capture', () => {
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

  it('normalizes nested label and SVG presentation nodes to their visible button control', () => {
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span');
    label.textContent = 'Create project';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.appendChild(path);
    button.append(label, svg);
    document.body.appendChild(button);

    expect(normalizeTargetElement(label)).toBe(button);
    expect(normalizeTargetElement(svg)).toBe(button);
    expect(normalizeTargetElement(path)).toBe(button);
  });

  it('captures a delegated sidebar anchor as a named click control', () => {
    const sidebar = document.createElement('aside');
    const heading = document.createElement('h2');
    heading.textContent = 'Acme';
    const navigation = document.createElement('nav');
    const dashboard = document.createElement('a');
    const projects = document.createElement('a');
    const billing = document.createElement('a');
    dashboard.dataset['route'] = 'dashboard';
    projects.dataset['route'] = 'projects';
    billing.dataset['route'] = 'billing';
    dashboard.textContent = 'Dashboard';
    projects.textContent = 'Projects';
    billing.textContent = 'Billing';
    navigation.append(dashboard, projects, billing);
    sidebar.append(heading, navigation);
    document.body.appendChild(sidebar);

    const capture = captureTargetEvidence(projects, undefined, {
      locale: 'en',
      requiredAction: 'observe-click',
      targetId: 'target_projects_navigation',
    });

    expect(normalizeTargetElement(projects)).toBe(projects);
    expect(capture.fingerprint.accessibleName).toBe('Projects');
    expect(capture.identity.intent).toEqual({
      elementKind: 'control',
      requiredAction: 'observe-click',
      resolutionMode: 'semantic',
    });
    expect(capture.identity.localizedEvidence).toEqual([
      expect.objectContaining({ locale: 'en', accessibleName: 'Projects' }),
    ]);
    expect(capture.identity.display.authorLabel).toBe('Projects');
    expect(capture.identity.captureEvidence.uniqueCandidateCount).toBe(1);
    expect(capture.identity.captureEvidence.runnerUpMargin).toBeGreaterThanOrEqual(0.15);
    expect(capture.identity.captureEvidence.quality).toBe('usable');
    expect(captureNeedsConfirmation(capture.identity)).toBe(false);

    const result = resolveTarget({
      id: capture.identity.targetId,
      fingerprint: capture.fingerprint,
      identity: capture.identity,
    });
    expect(result.state).toBe('found');
    expect(result.element).toBe(projects);
    expect(result.anchor?.interactionSafe).toBe(true);
  });

  it('does not promote a clicked presentation node to a generic wrapper by rectangle alone', () => {
    const wrapper = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = 'Status';
    wrapper.appendChild(label);
    document.body.appendChild(wrapper);
    renderAt(wrapper, { left: 20, top: 20, width: 240, height: 80 });
    renderAt(label, { left: 32, top: 32, width: 72, height: 24 });

    expect(normalizeTargetElement(label)).toBe(label);
  });

  it('persists normalized topology without a CSS selector or raw DOM rectangle', () => {
    const container = document.createElement('main');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['testid'] = 'new-project';
    button.setAttribute('aria-label', 'New project');
    container.appendChild(button);
    document.body.appendChild(container);

    renderAt(container, { left: 120, top: 80, width: 960, height: 640 });
    renderAt(button, { left: 920, top: 120, width: 144, height: 48 });

    const capture = captureTargetEvidence(button, undefined, {
      locale: 'en',
      requiredAction: 'observe-click',
      targetId: 'target_new_project',
    });
    const persistedKeys = objectKeysOf(capture);

    expect(capture.fingerprint).not.toHaveProperty('scopedCss');
    expect(capture.identity.visualTopologies?.[0]?.target).toEqual(
      expect.objectContaining({
        widthRatio: expect.any(Number),
        heightRatio: expect.any(Number),
        aspectRatio: expect.any(Number),
        centerXRatio: expect.any(Number),
        centerYRatio: expect.any(Number),
      }),
    );
    expect(persistedKeys).not.toContain('scopedCss');
    expect(persistedKeys).not.toContain('left');
    expect(persistedKeys).not.toContain('top');
    expect(persistedKeys).not.toContain('right');
    expect(persistedKeys).not.toContain('bottom');
  });

  it('does not persist scroll-sensitive center ratios for the viewport fallback', () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Create project';
    document.body.appendChild(button);
    renderAt(button, { left: 920, top: 620, width: 144, height: 48 });

    const capture = captureTargetEvidence(button, undefined, {
      requiredAction: 'observe-click',
      targetId: 'target_viewport_fallback',
    });

    expect(capture.identity.visualTopologies?.[0]?.container).toBeUndefined();
    expect(capture.identity.visualTopologies?.[0]?.target).not.toHaveProperty('centerXRatio');
    expect(capture.identity.visualTopologies?.[0]?.target).not.toHaveProperty('centerYRatio');
  });

  it('binds visual evidence variants to the explicitly observed page state', () => {
    const summary = document.createElement('div');
    document.body.appendChild(summary);
    renderAt(summary, { left: 120, top: 120, width: 280, height: 140 });

    const capture = captureTargetEvidence(summary, undefined, {
      requiredAction: 'anchor',
      stateId: 'dashboard.loaded',
      targetId: 'target_stateful_summary',
    });

    expect(capture.identity.visualTopologies?.[0]?.stateId).toBe('dashboard.loaded');
    expect(capture.identity.visualFingerprints?.[0]?.stateId).toBe('dashboard.loaded');
  });

  it('keeps semantic-container topology stable while that container scrolls', () => {
    const container = document.createElement('main');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Create project';
    container.appendChild(button);
    document.body.appendChild(container);
    Object.defineProperty(container, 'scrollWidth', { configurable: true, value: 500 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 900 });
    renderAt(container, { left: 100, top: 50, width: 500, height: 300 });
    let targetTop = 200;
    vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() =>
      domRect({ left: 420, top: targetTop, width: 120, height: 40 }),
    );

    const capture = captureTargetEvidence(button, undefined, {
      requiredAction: 'observe-click',
      targetId: 'target_scrollable_container',
    });
    container.scrollTop = 100;
    targetTop = 100;

    const result = resolveTarget({
      id: capture.identity.targetId,
      fingerprint: capture.fingerprint,
      identity: capture.identity,
    });

    expect(result.state).toBe('found');
    expect(result.evidenceFamilies).toContain('visual-topology');
  });

  it('does not let geometry alone make otherwise identical controls usable', () => {
    const container = document.createElement('main');
    const selected = document.createElement('button');
    const runnerUp = document.createElement('button');
    selected.type = 'button';
    runnerUp.type = 'button';
    selected.textContent = 'Create project';
    runnerUp.textContent = 'Create template';
    container.append(selected, runnerUp);
    document.body.appendChild(container);

    renderAt(container, { left: 120, top: 80, width: 960, height: 640 });
    renderAt(selected, { left: 920, top: 120, width: 144, height: 48 });
    renderAt(runnerUp, { left: 160, top: 560, width: 144, height: 48 });

    const capture = captureTargetEvidence(selected, undefined, {
      locale: 'en',
      requiredAction: 'observe-click',
      targetId: 'target_geometry_only_difference',
    });

    expect(capture.identity.captureEvidence.stableSignalFamilies).toEqual(
      expect.arrayContaining(['element-semantics', 'ancestor-context', 'relationship-context']),
    );
    expect(capture.identity.captureEvidence.stableSignalFamilies).toContain('visual-topology');
    expect(capture.identity.captureEvidence.uniqueCandidateCount).toBeGreaterThan(1);
    expect(capture.identity.captureEvidence.runnerUpMargin).toBe(0);
    expect(capture.identity.captureEvidence.quality).toBe('weak');
  });

  it('keeps a non-actionable observe-click target in needs-review state', () => {
    const container = document.createElement('main');
    const staticCard = document.createElement('div');
    staticCard.dataset['testid'] = 'project-summary';
    container.appendChild(staticCard);
    document.body.appendChild(container);

    renderAt(container, { left: 120, top: 80, width: 960, height: 640 });
    renderAt(staticCard, { left: 160, top: 120, width: 320, height: 180 });

    const anchorCapture = captureTargetEvidence(staticCard, undefined, {
      requiredAction: 'anchor',
      targetId: 'target_new_project',
    });
    const clickCapture = captureTargetEvidence(staticCard, undefined, {
      requiredAction: 'observe-click',
      targetId: 'target_new_project',
    });

    expect(anchorCapture.identity.captureEvidence.quality).toBe('usable');
    expect(clickCapture.identity.intent.requiredAction).toBe('observe-click');
    expect(clickCapture.identity.captureEvidence.quality).toBe('weak');
    expect(captureNeedsConfirmation(clickCapture.identity)).toBe(true);

    const resolution = resolveTarget(
      {
        id: clickCapture.identity.targetId,
        fingerprint: clickCapture.fingerprint,
        identity: clickCapture.identity,
      },
      document,
    );
    expect(resolution.state).not.toBe('found');
    expect(resolution.reasonCode).toBe('not_actionable');

    const authoredDocument = structuredClone(tourFixture) as LodariqDocument;
    authoredDocument.targets[0] = {
      id: 'target_new_project',
      fingerprint: clickCapture.fingerprint,
      identity: clickCapture.identity,
    };
    expect(validateTourPublishReadiness(authoredDocument).map((issue) => issue.code)).toContain(
      'target_needs_review',
    );
  });

  it('recovers a marker-free control after node replacement and localization', () => {
    const main = document.createElement('main');
    const intendedRegion = document.createElement('article');
    const distractorRegion = document.createElement('aside');
    const original = document.createElement('button');
    const originalLabel = document.createElement('span');
    const distractor = document.createElement('button');
    const distractorLabel = document.createElement('span');

    originalLabel.textContent = 'Create project';
    distractorLabel.textContent = 'Create template';
    original.appendChild(originalLabel);
    distractor.appendChild(distractorLabel);
    intendedRegion.appendChild(original);
    distractorRegion.appendChild(distractor);
    main.append(intendedRegion, distractorRegion);
    document.body.appendChild(main);

    renderAt(intendedRegion, { left: 120, top: 80, width: 960, height: 640 });
    renderAt(distractorRegion, { left: 40, top: 80, width: 300, height: 640 });
    renderAt(original, { left: 920, top: 120, width: 144, height: 48 });
    renderAt(distractor, { left: 72, top: 520, width: 180, height: 48 });

    const capture = captureTargetEvidence(normalizeTargetElement(originalLabel), undefined, {
      locale: 'en',
      targetId: 'target_marker_free_project',
    });

    expect(capture.identity.invariants.configuredAttributes).toBeUndefined();
    expect(capture.fingerprint).not.toHaveProperty('scopedCss');
    expect(capture.identity.captureEvidence.quality).not.toBe('weak');

    const replacement = document.createElement('button');
    const replacementLabel = document.createElement('span');
    const replacementWrapper = document.createElement('div');
    replacementLabel.textContent = 'Projekt erstellen';
    replacement.appendChild(replacementLabel);
    replacementWrapper.appendChild(replacement);
    intendedRegion.replaceChildren(replacementWrapper);
    document.documentElement.lang = 'de-DE';
    renderAt(replacementWrapper, { left: 880, top: 100, width: 200, height: 88 });
    renderAt(replacement, { left: 920, top: 120, width: 144, height: 48 });

    const result = resolveTarget(
      {
        id: capture.identity.targetId,
        fingerprint: capture.fingerprint,
        identity: capture.identity,
      },
      document,
      { locale: 'de-DE' },
    );

    expect(original.isConnected).toBe(false);
    expect(result.state).toBe('found');
    expect(result.element).toBe(replacement);
    expect(result.element).not.toBe(distractor);
    expect(result.evidenceFamilies).not.toContain('localized-text');
    expect(result.evidenceFamilies).toEqual(
      expect.arrayContaining([
        'element-semantics',
        'ancestor-context',
        'relationship-context',
        'visual-topology',
      ]),
    );
  });

  it('resolves an anonymous informational box through the visual-anchor quorum', () => {
    const main = document.createElement('main');
    const selected = document.createElement('div');
    const heading = document.createElement('h3');
    const body = document.createElement('p');
    heading.textContent = 'Revenue';
    body.textContent = '$42,000';
    selected.append(heading, body);
    selected.style.backgroundColor = 'rgb(240, 248, 255)';
    selected.style.borderRadius = '12px';
    main.appendChild(selected);
    document.body.appendChild(main);
    renderAt(main, { left: 80, top: 60, width: 1_100, height: 700 });
    renderAt(selected, { left: 760, top: 160, width: 320, height: 180 });
    renderAt(heading, { left: 784, top: 184, width: 120, height: 28 });
    renderAt(body, { left: 784, top: 232, width: 180, height: 42 });

    const capture = captureTargetEvidence(selected, undefined, {
      requiredAction: 'anchor',
      targetId: 'target_revenue_summary',
    });

    expect(capture.fingerprint.stableAttributes).toEqual({});
    expect(capture.identity.intent.resolutionMode).toBe('visual-anchor');
    expect(capture.identity.captureEvidence.quality).toBe('usable');
    expect(capture.identity.visualFingerprints?.[0]).toEqual(
      expect.objectContaining({
        structuralHash: expect.stringMatching(/^[0-9a-f]{16}$/),
        occupancyGrid: expect.stringMatching(/^[01]{64}$/),
        appearanceHash: expect.stringMatching(/^[0-9a-f]{16}$/),
        neighborhoodHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      }),
    );

    const replacement = document.createElement('section');
    const replacementHeading = document.createElement('h3');
    const replacementBody = document.createElement('p');
    replacementHeading.textContent = 'Umsatz';
    replacementBody.textContent = '42.000 €';
    replacement.append(replacementHeading, replacementBody);
    replacement.style.backgroundColor = 'rgb(240, 248, 255)';
    replacement.style.borderRadius = '12px';
    main.replaceChildren(replacement);
    document.documentElement.lang = 'de-DE';
    renderAt(replacement, { left: 760, top: 160, width: 320, height: 180 });
    renderAt(replacementHeading, { left: 784, top: 184, width: 120, height: 28 });
    renderAt(replacementBody, { left: 784, top: 232, width: 180, height: 42 });

    const result = resolveTarget(
      {
        id: capture.identity.targetId,
        fingerprint: capture.fingerprint,
        identity: capture.identity,
      },
      document,
      { locale: 'de-DE' },
    );

    expect(selected.isConnected).toBe(false);
    expect(result.state).toBe('found');
    expect(result.element).toBe(replacement);
    expect(result.anchor).toEqual(
      expect.objectContaining({ kind: 'visual-region', interactionSafe: false }),
    );
    expect(result.evidenceFamilies).toEqual(
      expect.arrayContaining(['visual-topology', 'visual-appearance', 'visual-neighborhood']),
    );
  });

  it('abstains when two anonymous boxes have indistinguishable visual evidence', () => {
    const main = document.createElement('main');
    const selectedContainer = document.createElement('section');
    const duplicateContainer = document.createElement('section');
    const selected = document.createElement('div');
    const duplicate = document.createElement('div');
    selected.style.backgroundColor = 'rgb(245, 245, 245)';
    duplicate.style.backgroundColor = 'rgb(245, 245, 245)';
    selectedContainer.appendChild(selected);
    duplicateContainer.appendChild(duplicate);
    main.append(selectedContainer, duplicateContainer);
    document.body.appendChild(main);
    const identicalBounds = { left: 120, top: 120, width: 280, height: 140 };
    renderAt(main, { left: 80, top: 60, width: 1_100, height: 700 });
    renderAt(selectedContainer, identicalBounds);
    renderAt(duplicateContainer, identicalBounds);
    renderAt(selected, identicalBounds);
    renderAt(duplicate, identicalBounds);

    const capture = captureTargetEvidence(selected, undefined, {
      requiredAction: 'anchor',
      targetId: 'target_ambiguous_summary',
    });
    const result = resolveTarget({
      id: capture.identity.targetId,
      fingerprint: capture.fingerprint,
      identity: capture.identity,
    });

    expect(capture.identity.intent.resolutionMode).toBe('visual-anchor');
    expect(capture.identity.captureEvidence.quality).toBe('weak');
    expect(result.state).toBe('ambiguous');
    expect(result.reasonCode).toBe('multiple_candidates');
    expect(result.element).toBeNull();
  });

  it('automatically uses the unique sibling slot for a selected passive summary card', () => {
    const main = document.createElement('main');
    const cards = [
      ['Active projects', '18', '3 launched this month'],
      ['Team members', '12', '2 joined this month'],
      ['Open tasks', '41', '7 due this week'],
    ].map(([label, value, detail]) => {
      const card = document.createElement('article');
      card.innerHTML = `<span>${label}</span><strong>${value}</strong><small>${detail}</small>`;
      card.style.backgroundColor = 'rgb(245, 245, 245)';
      return card;
    });
    main.append(...cards);
    document.body.appendChild(main);
    const identicalBounds = { left: 120, top: 120, width: 280, height: 140 };
    renderAt(main, { left: 80, top: 60, width: 1_100, height: 700 });
    for (const card of cards) renderAt(card, identicalBounds);

    const selected = cards[0]!;
    const capture = captureTargetEvidence(selected, undefined, {
      requiredAction: 'anchor',
      targetId: 'target_active_projects',
    });
    const result = resolveTarget({
      id: capture.identity.targetId,
      fingerprint: capture.fingerprint,
      identity: capture.identity,
    });

    expect(capture.identity.intent.resolutionMode).toBe('layout-slot');
    expect(capture.identity.captureEvidence.quality).toBe('usable');
    expect(capture.identity.visualFingerprints?.[0]?.layoutSlot).toEqual({
      siblingIndex: 0,
      siblingCount: 3,
    });
    expect(result.state).toBe('found');
    expect(result.element).toBe(selected);
    expect(result.evidenceFamilies).toContain('layout-slot');
    expect(result.anchor).toEqual(
      expect.objectContaining({ kind: 'visual-region', interactionSafe: false }),
    );
  });

  it('uses an explicit layout slot to distinguish repeated presentation cards', () => {
    const main = document.createElement('main');
    const cards = Array.from({ length: 3 }, () => document.createElement('div'));
    for (const card of cards) card.style.backgroundColor = 'rgb(245, 245, 245)';
    main.append(...cards);
    document.body.appendChild(main);
    renderAt(main, { left: 80, top: 60, width: 1_100, height: 700 });
    for (const card of cards) {
      renderAt(card, { left: 120, top: 120, width: 280, height: 140 });
    }

    const selected = cards[1]!;
    const capture = captureTargetEvidence(selected, undefined, {
      requiredAction: 'anchor',
      resolutionMode: 'layout-slot',
      targetId: 'target_second_summary',
    });
    const result = resolveTarget({
      id: capture.identity.targetId,
      fingerprint: capture.fingerprint,
      identity: capture.identity,
    });

    expect(capture.identity.captureEvidence.quality).toBe('usable');
    expect(capture.identity.visualFingerprints?.[0]?.layoutSlot).toEqual({
      siblingIndex: 1,
      siblingCount: 3,
    });
    expect(result.state).toBe('found');
    expect(result.element).toBe(selected);
    expect(result.evidenceFamilies).toContain('layout-slot');
    expect(result.anchor?.interactionSafe).toBe(false);
  });

  it('never lets a visual-anchor identity authorize a click interaction', () => {
    const staticBox = document.createElement('div');
    document.body.appendChild(staticBox);
    renderAt(staticBox, { left: 120, top: 120, width: 280, height: 140 });
    const capture = captureTargetEvidence(staticBox, undefined, {
      requiredAction: 'anchor',
      targetId: 'target_static_summary',
    });

    const result = resolveTarget(
      {
        id: capture.identity.targetId,
        fingerprint: capture.fingerprint,
        identity: capture.identity,
      },
      document,
      { requiredAction: 'observe-click' },
    );

    expect(result.state).toBe('needs_review');
    expect(result.anchor).toBeNull();
    expect(result.reasonCode).toBe('identity_invalid');
  });
});
