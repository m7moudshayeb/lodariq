import type { ResolverDiagnostic, TargetLocale, TargetViewportClass } from '@lodariq/schema';

export interface AuthoringTargetContext {
  route?: string;
  routePatternId?: string;
  stateId?: string;
  locale?: TargetLocale;
  viewportClass?: TargetViewportClass;
}

export interface AuthoringVerifiedObservation {
  context: AuthoringTargetContext;
  diagnostic: ResolverDiagnostic & { state: 'found' };
  observedAt: string;
}

export type AuthoringTargetHealthPresentation =
  | 'verified'
  | 'checking'
  | 'unavailable_current_context'
  | 'unverified'
  | 'ambiguous'
  | 'drifted'
  | 'missing';

export interface AuthoringTargetHealth {
  targetId: string;
  lastVerified?: AuthoringVerifiedObservation;
  currentObservation?: ResolverDiagnostic;
  currentContext: AuthoringTargetContext;
  presentation: AuthoringTargetHealthPresentation;
}

interface TargetHealthEntry {
  targetId: string;
  identityKey: string;
  lastVerified?: AuthoringVerifiedObservation;
  currentObservation?: ResolverDiagnostic;
  observationContext?: AuthoringTargetContext;
  checking: boolean;
}

const UNAVAILABLE_REASON_CODES = new Set([
  'route_mismatch',
  'state_mismatch',
  'context_unverified',
  'locale_unverified',
]);

/** In-memory authoring evidence. It never enters canonical JSON or artifacts. */
export class AuthoringTargetHealthLedger {
  private context: AuthoringTargetContext = {};
  private readonly entries = new Map<string, TargetHealthEntry>();

  updateContext(context: AuthoringTargetContext): void {
    this.context = cloneContext(context);
  }

  registerTarget(targetId: string, identityKey: string): void {
    const existing = this.entries.get(targetId);
    if (existing?.identityKey === identityKey) return;
    this.entries.set(targetId, {
      targetId,
      identityKey,
      checking: false,
    });
  }

  removeTarget(targetId: string): void {
    this.entries.delete(targetId);
  }

  beginInspection(targetId: string): void {
    const entry = this.ensureEntry(targetId);
    entry.checking = true;
  }

  recordObservation(targetId: string, diagnostic: ResolverDiagnostic, observedAt?: string): void {
    const entry = this.ensureEntry(targetId);
    entry.checking = false;
    entry.currentObservation = structuredClone(diagnostic);
    entry.observationContext = cloneContext(this.context);
    if (diagnostic.state === 'found') {
      entry.lastVerified = {
        context: cloneContext(this.context),
        diagnostic: structuredClone(diagnostic) as ResolverDiagnostic & { state: 'found' },
        observedAt: observedAt ?? diagnostic.observedAt ?? new Date().toISOString(),
      };
    }
  }

  inspectionFailed(targetId: string, diagnostic: ResolverDiagnostic): void {
    this.recordObservation(targetId, diagnostic);
  }

  get(targetId: string): AuthoringTargetHealth | undefined {
    const entry = this.entries.get(targetId);
    return entry ? healthFromEntry(entry, this.context) : undefined;
  }

  snapshot(): Map<string, AuthoringTargetHealth> {
    return new Map(
      [...this.entries].map(([targetId, entry]) => [
        targetId,
        healthFromEntry(entry, this.context),
      ]),
    );
  }

  private ensureEntry(targetId: string): TargetHealthEntry {
    const existing = this.entries.get(targetId);
    if (existing) return existing;
    const entry: TargetHealthEntry = { targetId, identityKey: targetId, checking: false };
    this.entries.set(targetId, entry);
    return entry;
  }
}

export function authoringTargetIdentityKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function healthFromEntry(
  entry: TargetHealthEntry,
  currentContext: AuthoringTargetContext,
): AuthoringTargetHealth {
  const presentation = derivePresentation(entry, currentContext);
  return {
    targetId: entry.targetId,
    ...(entry.lastVerified ? { lastVerified: structuredClone(entry.lastVerified) } : {}),
    ...(entry.currentObservation
      ? { currentObservation: structuredClone(entry.currentObservation) }
      : {}),
    currentContext: cloneContext(currentContext),
    presentation,
  };
}

function derivePresentation(
  entry: TargetHealthEntry,
  currentContext: AuthoringTargetContext,
): AuthoringTargetHealthPresentation {
  if (entry.checking) return 'checking';
  const diagnostic = entry.currentObservation;
  const observationIsCurrent = contextsEqual(entry.observationContext, currentContext);
  if (!observationIsCurrent) {
    return entry.lastVerified ? 'unavailable_current_context' : 'unverified';
  }
  if (!diagnostic) {
    return entry.lastVerified && contextsEqual(entry.lastVerified.context, currentContext)
      ? 'verified'
      : 'unverified';
  }
  if (diagnostic.state === 'found') return 'verified';
  if (diagnostic.reasonCode && UNAVAILABLE_REASON_CODES.has(diagnostic.reasonCode)) {
    return entry.lastVerified ? 'unavailable_current_context' : 'unverified';
  }
  if (diagnostic.state === 'ambiguous') return 'ambiguous';
  if (diagnostic.state === 'missing') return 'missing';
  return diagnostic.reasonCode === 'evidence_drift' ||
    diagnostic.reasonCode === 'resolved_with_drift'
    ? 'drifted'
    : 'unverified';
}

function contextsEqual(
  left: AuthoringTargetContext | undefined,
  right: AuthoringTargetContext,
): boolean {
  if (!left) return false;
  return (
    left.route === right.route &&
    left.routePatternId === right.routePatternId &&
    left.stateId === right.stateId &&
    left.locale === right.locale &&
    left.viewportClass === right.viewportClass
  );
}

function cloneContext(context: AuthoringTargetContext): AuthoringTargetContext {
  return { ...context };
}
