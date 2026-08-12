import {
  TARGET_VIEWPORT_BREAKPOINTS,
  type BridgeMessage,
  type ElementFingerprint,
  type ResolverDiagnostic,
  type TargetInspectAction,
  type TargetIdentityV2,
  type TargetViewportClass,
} from '@lodariq/schema';
import { authoringText } from '../i18n';
import type { ResolutionResult } from '@lodariq/sdk-runtime/resolver';
import type { AuthoringBridge } from '../bridge/transport';
import { BRIDGE_PROTOCOL_VERSION, createBridgeCorrelationId } from '../bridge/transport';
import { CREATOR_CHROME_TOKENS } from '../creator-chrome-tokens';

export interface AuthoringPageSessionContext {
  documentId: string;
  sessionId: string;
}

export function startPageLifecycleObserver(
  bridge: AuthoringBridge,
  session: AuthoringPageSessionContext,
): () => void {
  let disposed = false;
  let scheduled = false;
  let ackPending = false;
  let dirtyWhileAckPending = false;
  let lastSent = '';

  const schedule = (): void => {
    if (disposed) return;
    if (ackPending) {
      dirtyWhileAckPending = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    scheduleAnimationFrame(flush);
  };

  const flush = (): void => {
    scheduled = false;
    if (disposed) return;

    const snapshot = currentLifecycleSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSent) return;
    lastSent = serialized;
    ackPending = true;
    dirtyWhileAckPending = false;

    const message: BridgeMessage = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('page_lifecycle_update'),
      type: 'page.lifecycle.update',
      route: snapshot.route,
      scrollState: snapshot.scrollState,
      ...(snapshot.locale ? { locale: snapshot.locale } : {}),
      viewportClass: snapshot.viewportClass,
    };

    void bridge
      .sendWithAck(message, { timeoutMs: 1000 })
      .catch(() => {})
      .finally(() => {
        ackPending = false;
        if (dirtyWhileAckPending) schedule();
      });
  };

  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  document.addEventListener('visibilitychange', schedule);
  const restoreHistoryObservation = observeHistoryState(schedule);

  schedule();

  return () => {
    disposed = true;
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('popstate', schedule);
    window.removeEventListener('hashchange', schedule);
    document.removeEventListener('visibilitychange', schedule);
    restoreHistoryObservation();
  };
}

function currentLifecycleSnapshot(): {
  route: string;
  scrollState: { x: number; y: number };
  locale?: string;
  viewportClass: TargetViewportClass;
} {
  const locale = canonicalAuthoringLocale(
    document.documentElement.lang || window.navigator.language,
  );
  return {
    route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    scrollState: {
      x: window.scrollX,
      y: window.scrollY,
    },
    ...(locale ? { locale } : {}),
    viewportClass: authoringViewportClass(window.innerWidth),
  };
}

function canonicalAuthoringLocale(value: string): string | null {
  const candidate = value.trim().replace(/_/g, '-');
  if (!candidate) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

function authoringViewportClass(width: number): TargetViewportClass {
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.mobileMaxWidth) return 'mobile';
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.tabletMaxWidth) return 'tablet';
  return 'desktop';
}

function observeHistoryState(onChange: () => void): () => void {
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const wrap = <T extends History['pushState'] | History['replaceState']>(original: T): T =>
    function wrappedHistoryState(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      original.call(this, data, unused, url);
      onChange();
    } as T;

  const wrappedPushState = wrap(originalPushState);
  const wrappedReplaceState = wrap(originalReplaceState);
  window.history.pushState = wrappedPushState;
  window.history.replaceState = wrappedReplaceState;

  return () => {
    if (window.history.pushState === wrappedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === wrappedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
  };
}

function scheduleAnimationFrame(callback: () => void): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  window.setTimeout(callback, 16);
}

export async function inspectTarget(
  fingerprint: ElementFingerprint,
  action: TargetInspectAction,
  targetId?: string,
  identity?: TargetIdentityV2,
): Promise<ResolverDiagnostic> {
  let result: ResolutionResult;
  try {
    const { resolve, resolveTarget } = await import('@lodariq/sdk-runtime/resolver');
    result =
      identity && targetId
        ? resolveTarget({ id: targetId, fingerprint, identity })
        : resolve(fingerprint);
  } catch {
    return {
      state: 'missing',
      confidence: 0,
      candidateCount: 0,
      resolutionMethod: 'none',
      reasonCode: 'no_candidates',
      evidenceFamilies: [],
      runnerUpConfidence: null,
      currentLocale: null,
      viewportClass: authoringViewportClass(window.innerWidth),
      observedAt: new Date().toISOString(),
      message: authoringText('Anchor check could not load on this page'),
    };
  }
  if (action === 'view' && result.element) revealTarget(result.element);
  return {
    state: result.state,
    confidence: result.confidence,
    candidateCount: result.candidateCount,
    resolutionMethod: result.resolutionMethod,
    reasonCode: result.reasonCode,
    evidenceFamilies: result.evidenceFamilies,
    runnerUpConfidence: result.runnerUpConfidence,
    currentLocale: result.currentLocale,
    viewportClass: authoringViewportClass(window.innerWidth),
    observedAt: new Date().toISOString(),
    message: targetInspectMessage(action, result),
  };
}

function targetInspectMessage(
  action: TargetInspectAction,
  result: Pick<ResolverDiagnostic, 'state' | 'reasonCode'>,
): string {
  const state = result.state;
  if (state === 'found') {
    if (action === 'view') return 'Anchor highlighted on the page';
    if (action === 'test') return 'Anchor placement check passed';
    return 'Anchor verified on this page state';
  }
  if (state === 'needs_review') {
    return result.reasonCode === 'evidence_drift'
      ? 'Anchor evidence has drifted'
      : 'Anchor needs verification';
  }
  if (state === 'ambiguous') return 'Anchor needs a more specific selection';
  return 'Anchor needs attention on this page';
}

function revealTarget(element: Element): void {
  clearTargetReveal();
  if ('scrollIntoView' in element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  const doc = element.ownerDocument;
  const rect = element.getBoundingClientRect();
  const marker = doc.createElement('div');
  marker.dataset['lodariqBridge'] = 'target-reveal';
  marker.setAttribute('aria-hidden', 'true');
  Object.assign(marker.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: '2147483645',
    pointerEvents: 'none',
    border: `2px solid ${CREATOR_CHROME_TOKENS.focus}`,
    borderRadius: '6px',
    boxShadow: '0 0 0 5px rgba(61, 232, 176, 0.2)',
  });
  doc.body.appendChild(marker);
  window.setTimeout(() => marker.remove(), 1200);
}

export function clearTargetReveal(): void {
  document
    .querySelectorAll('[data-lodariq-bridge="target-reveal"]')
    .forEach((marker) => marker.remove());
}
