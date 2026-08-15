import {
  BROWSER_VERIFICATION_CHECK_CODES,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  BrowserVerificationReport as BrowserVerificationReportSchema,
  RENDERER_CONTRACT_VERSION,
  validate,
  type BrowserVerificationCheck,
  type BrowserVerificationCheckCode,
  type BrowserVerificationReport,
  type BrowserVerificationStatus,
  type NewCompiledDocument,
} from '@lodariq/schema';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';
import { SDK_VERSION } from '@lodariq/sdk-runtime';

const PRESENTATION_TIMEOUT_MS = 3_000;
const EDGE_TOLERANCE_PX = 1;
const MAX_TARGET_OVERLAP_RATIO = 0.35;

export interface PublicationBrowserVerificationOptions {
  compiled: NewCompiledDocument;
  expectedContentHash: string;
  previewOwnerId: string;
  playExactArtifact: () => Promise<void>;
  stopExactArtifact?: () => void;
  now?: () => Date;
}

/**
 * Runs bounded, privacy-safe checks against the exact staging artifact rendered
 * by the real TourPlayer. Only closed status codes cross the authoring bridge;
 * DOM, selectors, URLs, coordinates, screenshots, and free-form diagnostics do
 * not leave the customer page.
 */
export async function runPublicationBrowserVerification(
  options: PublicationBrowserVerificationOptions,
): Promise<BrowserVerificationReport> {
  let stopped = false;
  const previousFocus = document.activeElement;
  try {
    await options.playExactArtifact();
    await waitForFontsAndStableFrames(document);

    const host = await waitForOwnedTour(options.previewOwnerId);
    const card = host?.shadowRoot?.querySelector<HTMLElement>('div[role="dialog"]') ?? null;
    const checks = new Map<BrowserVerificationCheckCode, BrowserVerificationStatus>();
    const targetResolution = await resolvePresentationTargets(options.compiled);

    checks.set(
      'artifact_integrity',
      isExactArtifact(options.compiled, options.expectedContentHash) ? 'passed' : 'failed',
    );
    checks.set(
      'renderer_ready',
      host && card && options.compiled.rendererContractVersion === RENDERER_CONTRACT_VERSION
        ? 'passed'
        : 'failed',
    );
    checks.set(
      'targets_resolved',
      card && !card.hidden && targetResolution.status === 'passed' ? 'passed' : 'failed',
    );

    if (host && card) {
      checks.set('overflow', elementHasOverflow(card) ? 'failed' : 'passed');
      checks.set('primary_action_clipping', primaryActionIsClipped(card) ? 'failed' : 'passed');
      checks.set('target_collision', targetCollisionStatus(card, targetResolution));
      checks.set('font_fallback', fontFallbackStatus(card));
      checks.set('stacking_context', stackingStatus(host, card));
      checks.set('responsive_widths', responsiveWidthStatus(card));
      checks.set('dark_mode', darkModeStatus(options.compiled));
      checks.set('rtl', await rtlStatus(host, card));
      checks.set('reduced_motion', reducedMotionStatus(card));
      checks.set('zoom_200', await zoomStatus(host, card));
      checks.set('keyboard_navigation', keyboardNavigationStatus(host, card));
    } else {
      for (const code of BROWSER_VERIFICATION_CHECK_CODES) {
        if (!checks.has(code)) checks.set(code, 'failed');
      }
    }

    if (options.stopExactArtifact) {
      options.stopExactArtifact();
      stopped = true;
      checks.set('focus_restoration', focusRestorationStatus(previousFocus));
    } else {
      checks.set('focus_restoration', 'warning');
    }

    const normalizedChecks = BROWSER_VERIFICATION_CHECK_CODES.map(
      (code): BrowserVerificationCheck => ({ code, status: checks.get(code) ?? 'failed' }),
    );
    const report = {
      schemaVersion: '1',
      checkedAt: (options.now?.() ?? new Date()).toISOString(),
      sdkVersion: SDK_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      status: aggregateStatus(normalizedChecks),
      checks: normalizedChecks,
    };
    const validation = validate(BrowserVerificationReportSchema, report);
    if (!validation.valid) {
      throw new Error('Browser verification report was incomplete');
    }
    return validation.value;
  } finally {
    if (!stopped) options.stopExactArtifact?.();
  }
}

async function waitForFontsAndStableFrames(doc: Document): Promise<void> {
  const fonts = doc.fonts;
  if (fonts?.ready) await fonts.ready.catch(() => undefined);
  await nextFrame(doc.defaultView);
  await nextFrame(doc.defaultView);
}

function nextFrame(view: Window | null): Promise<void> {
  return new Promise((resolve) => {
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(() => resolve());
      return;
    }
    if (view) view.setTimeout(resolve, 16);
    else globalThis.setTimeout(resolve, 16);
  });
}

async function waitForOwnedTour(ownerId: string): Promise<HTMLElement | null> {
  const selector = `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}]`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < PRESENTATION_TIMEOUT_MS) {
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    const host = [...candidates].find(
      (candidate) => candidate.getAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE) === ownerId,
    );
    const card = host?.shadowRoot?.querySelector<HTMLElement>('div[role="dialog"]');
    if (host && card && !card.hidden) return host;
    await nextFrame(document.defaultView);
  }
  return null;
}

function isExactArtifact(compiled: NewCompiledDocument, expectedContentHash: string): boolean {
  return (
    compiled.contentHash === expectedContentHash &&
    compiled.artifactSchemaVersion === COMPILED_ARTIFACT_SCHEMA_VERSION &&
    compiled.rendererContractVersion === RENDERER_CONTRACT_VERSION
  );
}

function elementHasOverflow(element: HTMLElement): boolean {
  return (
    element.scrollWidth > element.clientWidth + EDGE_TOLERANCE_PX ||
    element.scrollHeight > element.clientHeight + EDGE_TOLERANCE_PX
  );
}

function primaryActionIsClipped(card: HTMLElement): boolean {
  const actions = [...card.querySelectorAll<HTMLElement>('button, a')];
  const primary = actions.find(
    (action) => action.getAttribute('data-lodariq-action-variant') !== 'secondary',
  );
  if (!primary) return false;
  return !rectContains(card.getBoundingClientRect(), primary.getBoundingClientRect());
}

interface VerificationTargetResolution {
  status: 'passed' | 'failed';
  initialElement: Element | null;
}

async function resolvePresentationTargets(
  compiled: NewCompiledDocument,
): Promise<VerificationTargetResolution> {
  const requiredTargetIds = [
    ...new Set(compiled.steps.flatMap((step) => (step.targetId ? [step.targetId] : []))),
  ];
  if (requiredTargetIds.length === 0) return { status: 'passed', initialElement: null };
  const targetById = new Map(compiled.targets.map((target) => [target.id, target]));
  const initialTargetId = compiled.steps[0]?.targetId;
  let initialElement: Element | null = null;
  try {
    const { resolveTarget, runTargetHealthCheck } = await import('@lodariq/sdk-runtime/resolver');
    const targets = requiredTargetIds.map((targetId) => targetById.get(targetId));
    if (targets.some((target) => !target)) return { status: 'failed', initialElement: null };
    const report = runTargetHealthCheck(
      targets.filter((target): target is NonNullable<typeof target> => Boolean(target)),
    );
    if (report.found !== report.total) return { status: 'failed', initialElement: null };
    if (initialTargetId) {
      const initialTarget = targetById.get(initialTargetId);
      if (initialTarget) initialElement = resolveTarget(initialTarget).element;
    }
    return { status: 'passed', initialElement };
  } catch {
    return { status: 'failed', initialElement: null };
  }
}

function targetCollisionStatus(
  card: HTMLElement,
  resolution: VerificationTargetResolution,
): BrowserVerificationStatus {
  if (resolution.status === 'failed') return 'failed';
  if (!resolution.initialElement) return 'passed';
  const overlap = overlapRatio(
    card.getBoundingClientRect(),
    resolution.initialElement.getBoundingClientRect(),
  );
  return overlap > MAX_TARGET_OVERLAP_RATIO ? 'failed' : 'passed';
}

function fontFallbackStatus(card: HTMLElement): BrowserVerificationStatus {
  const style = getComputedStyle(card);
  const family = style.fontFamily.trim();
  if (!family || !document.fonts?.check) return 'warning';
  return document.fonts.check(`${style.fontSize || '16px'} ${family}`) ? 'passed' : 'warning';
}

function stackingStatus(host: HTMLElement, card: HTMLElement): BrowserVerificationStatus {
  if (typeof document.elementsFromPoint !== 'function') return 'warning';
  const rect = card.getBoundingClientRect();
  const x = clamp(rect.left + rect.width / 2, 0, Math.max(0, window.innerWidth - 1));
  const y = clamp(rect.top + rect.height / 2, 0, Math.max(0, window.innerHeight - 1));
  const stack = document.elementsFromPoint(x, y);
  return stack.includes(host) ? 'passed' : 'failed';
}

function responsiveWidthStatus(card: HTMLElement): BrowserVerificationStatus {
  const rect = card.getBoundingClientRect();
  const withinViewport =
    rect.left >= -EDGE_TOLERANCE_PX &&
    rect.right <= window.innerWidth + EDGE_TOLERANCE_PX &&
    rect.width <= Math.max(0, window.innerWidth - 16) + EDGE_TOLERANCE_PX;
  if (!withinViewport) return 'failed';
  return window.innerWidth <= 375 ? 'passed' : 'warning';
}

function darkModeStatus(compiled: NewCompiledDocument): BrowserVerificationStatus {
  return compiled.theme.definition.tokens.modes.dark ? 'passed' : 'warning';
}

async function rtlStatus(host: HTMLElement, card: HTMLElement): Promise<BrowserVerificationStatus> {
  const previous = host.getAttribute('dir');
  try {
    host.setAttribute('dir', 'rtl');
    await nextFrame(host.ownerDocument.defaultView);
    await nextFrame(host.ownerDocument.defaultView);
    return elementHasOverflow(card) ? 'failed' : 'passed';
  } finally {
    if (previous === null) host.removeAttribute('dir');
    else host.setAttribute('dir', previous);
  }
}

function reducedMotionStatus(card: HTMLElement): BrowserVerificationStatus {
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'warning';
  const durations = getComputedStyle(card)
    .transitionDuration.split(',')
    .map((value) => Number.parseFloat(value) || 0);
  return durations.every((duration) => duration === 0) ? 'passed' : 'failed';
}

async function zoomStatus(
  host: HTMLElement,
  card: HTMLElement,
): Promise<BrowserVerificationStatus> {
  const previous = host.style.getPropertyValue('zoom');
  try {
    host.style.setProperty('zoom', '2');
    await nextFrame(host.ownerDocument.defaultView);
    await nextFrame(host.ownerDocument.defaultView);
    const rect = card.getBoundingClientRect();
    const fits =
      !elementHasOverflow(card) &&
      rect.left >= -EDGE_TOLERANCE_PX &&
      rect.top >= -EDGE_TOLERANCE_PX &&
      rect.right <= window.innerWidth + EDGE_TOLERANCE_PX &&
      rect.bottom <= window.innerHeight + EDGE_TOLERANCE_PX;
    return fits ? 'passed' : 'warning';
  } finally {
    if (previous) host.style.setProperty('zoom', previous);
    else host.style.removeProperty('zoom');
  }
}

function keyboardNavigationStatus(host: HTMLElement, card: HTMLElement): BrowserVerificationStatus {
  const controls = [
    ...card.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((control) => !control.hidden && control.getAttribute('aria-hidden') !== 'true');
  if (controls.length === 0) return 'warning';
  for (const control of controls) {
    control.focus({ preventScroll: true });
    if (host.shadowRoot?.activeElement !== control) return 'failed';
  }
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  controls[controls.length - 1]?.dispatchEvent(tab);
  return tab.defaultPrevented ? 'failed' : 'passed';
}

function focusRestorationStatus(previousFocus: Element | null): BrowserVerificationStatus {
  if (!(previousFocus instanceof HTMLElement) || previousFocus === document.body) return 'warning';
  if (!previousFocus.isConnected) return 'warning';
  return document.activeElement === previousFocus ? 'passed' : 'failed';
}

function rectContains(container: DOMRect, child: DOMRect): boolean {
  return (
    child.left >= container.left - EDGE_TOLERANCE_PX &&
    child.top >= container.top - EDGE_TOLERANCE_PX &&
    child.right <= container.right + EDGE_TOLERANCE_PX &&
    child.bottom <= container.bottom + EDGE_TOLERANCE_PX
  );
}

function overlapRatio(first: DOMRect, second: DOMRect): number {
  const width = Math.max(
    0,
    Math.min(first.right, second.right) - Math.max(first.left, second.left),
  );
  const height = Math.max(
    0,
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
  );
  const intersection = width * height;
  const smallerArea = Math.min(first.width * first.height, second.width * second.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function aggregateStatus(checks: readonly BrowserVerificationCheck[]): BrowserVerificationStatus {
  if (checks.some((check) => check.status === 'failed')) return 'failed';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'passed';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
