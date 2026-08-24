import type {
  ActiveManifestPointerV2,
  AudienceRule,
  DataCatalogObservation,
} from '@lodariq/schema';
import { patternMatchesPage } from '@lodariq/schema/page-eligibility';
import type { TourPlaybackOptions } from '../loader';
import type { IdentifyTraits } from '../runtime';
import { watchPagePathname } from './page-navigation-watch';

const CATALOG_SCHEMA_VERSION = '1';
const CATALOG_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,119}$/u;
const CATALOG_FLUSH_MS = 250;

interface DeliveryPageState {
  traits: Record<string, unknown>;
  events: Map<string, unknown>;
  firedPublications: Set<string>;
}

const deliveryPageStates = new Map<string, DeliveryPageState>();

export interface DeliveryOrchestrator {
  destroy(): void;
}

interface DeliveryOrchestratorBrowserApi {
  identify(traits: IdentifyTraits): void;
  track(name: string, props?: Record<string, unknown>): void;
  playTourById(documentId: string, options?: TourPlaybackOptions): Promise<void>;
}

export function installDeliveryOrchestrator(input: {
  api: DeliveryOrchestratorBrowserApi;
  manifests: readonly ActiveManifestPointerV2[];
  environment: 'development' | 'staging' | 'production';
  installationId: string;
  catalogUrl?: string;
}): DeliveryOrchestrator {
  const manifests = input.manifests.filter(
    (manifest) => !manifest.activation || isDeliveryActivation(manifest.activation),
  );
  const originalIdentify = input.api.identify.bind(input.api);
  const originalTrack = input.api.track.bind(input.api);
  const originalPlayTourById = input.api.playTourById.bind(input.api);
  const pageState = deliveryPageState(input.installationId);
  const { events, traits } = pageState;
  const triggerReady = new Set<string>();
  const diagnostics = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const catalog = createCatalogObserver(input.catalogUrl, input.installationId);

  const evaluate = (manifest: ActiveManifestPointerV2, reason: string): void => {
    if (
      pageState.firedPublications.has(manifest.publicationId) ||
      !triggerReady.has(manifest.documentId)
    ) {
      return;
    }
    const activation = manifest.activation;
    if (!activation) return;
    if (!activation.audience.environments.includes(input.environment)) {
      emitDiagnostic(manifest.documentId, 'environment_mismatch');
      return;
    }
    if (!audienceMatches(activation.audience.rules ?? [], traits, events)) {
      emitDiagnostic(manifest.documentId, 'audience_not_matched');
      return;
    }
    pageState.firedPublications.add(manifest.publicationId);
    emitDiagnostic(manifest.documentId, reason);
    void originalPlayTourById(manifest.documentId, { automatic: true }).catch(() => {
      emitDiagnostic(manifest.documentId, 'playback_failed');
    });
  };

  const emitDiagnostic = (documentId: string, reasonCode: string): void => {
    const key = `${documentId}:${reasonCode}`;
    if (diagnostics.has(key)) return;
    diagnostics.add(key);
    originalTrack('delivery_activation_evaluated', { documentId, reasonCode });
  };

  const evaluateReady = (): void => {
    for (const manifest of manifests) evaluate(manifest, 'trigger_matched');
  };

  input.api.identify = (next: IdentifyTraits): void => {
    originalIdentify(next);
    for (const [key, value] of Object.entries(next)) {
      traits[key] = value;
      catalog.observe('identify_trait', key, valueTypeOf(value));
    }
    evaluateReady();
  };

  input.api.track = (name: string, props?: Record<string, unknown>): void => {
    originalTrack(name, props);
    const normalized = name.trim();
    if (!normalized) return;
    events.set(normalized, props ?? true);
    catalog.observe('track_event', normalized, 'unknown');
    for (const manifest of manifests) {
      const trigger = manifest.activation?.trigger;
      if (trigger?.type !== 'event' || trigger.config.eventName !== normalized) continue;
      triggerReady.add(manifest.documentId);
      evaluate(manifest, 'event_triggered');
    }
    evaluateReady();
  };

  input.api.playTourById = async (documentId, options): Promise<void> => {
    const manifest = manifests.find((candidate) => candidate.documentId === documentId);
    if (!manifest?.activation) return originalPlayTourById(documentId, options);
    const audienceEligible =
      manifest.activation.audience.environments.includes(input.environment) &&
      audienceMatches(manifest.activation.audience.rules ?? [], traits, events);
    if (!audienceEligible) {
      emitDiagnostic(documentId, 'manual_audience_not_matched');
      return;
    }
    pageState.firedPublications.add(manifest.publicationId);
    emitDiagnostic(documentId, 'manual_triggered');
    await originalPlayTourById(documentId, options);
  };

  const evaluateUrlTriggers = (): void => {
    const page = {
      exactOrigin: location.origin,
      pathname: location.pathname || '/',
    };
    for (const manifest of manifests) {
      const trigger = manifest.activation?.trigger;
      if (trigger?.type !== 'urlMatch') continue;
      const matches = patternMatchesPage(
        trigger.config.pattern,
        trigger.config.mode ?? 'exact',
        page,
      );
      if (matches) triggerReady.add(manifest.documentId);
      else triggerReady.delete(manifest.documentId);
      if (matches) evaluate(manifest, 'url_triggered');
    }
  };

  for (const manifest of manifests) {
    const trigger = manifest.activation?.trigger;
    if (!trigger || trigger.type === 'manual' || trigger.type === 'urlMatch') continue;
    if (trigger.type === 'event') {
      if (events.has(trigger.config.eventName)) triggerReady.add(manifest.documentId);
      continue;
    }
    const timer = setTimeout(() => {
      timers.delete(timer);
      triggerReady.add(manifest.documentId);
      evaluate(manifest, 'page_load_triggered');
    }, trigger.config?.delayMs ?? 0);
    timers.add(timer);
  }

  evaluateUrlTriggers();
  const navigationWatch = watchPagePathname(evaluateUrlTriggers);

  return {
    destroy() {
      navigationWatch.stop();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      catalog.destroy();
      input.api.identify = originalIdentify;
      input.api.track = originalTrack;
      input.api.playTourById = originalPlayTourById;
    },
  };
}

function isDeliveryActivation(value: unknown): value is NonNullable<ActiveManifestPointerV2['activation']> {
  if (!exactObject(value, ['trigger', 'audience'])) return false;
  return isTrigger(value['trigger']) && isAudience(value['audience']);
}

function isTrigger(value: unknown): boolean {
  if (!object(value) || typeof value['type'] !== 'string') return false;
  if (value['type'] === 'manual') return exactObject(value, ['type']);
  if (value['type'] === 'pageLoad') {
    if (!optionalObject(value, ['type'], ['config'])) return false;
    const config = value['config'];
    return (
      config === undefined ||
      (optionalObject(config, [], ['delayMs']) &&
        (config['delayMs'] === undefined ||
          (Number.isInteger(config['delayMs']) &&
            Number(config['delayMs']) >= 0 &&
            Number(config['delayMs']) <= 60_000)))
    );
  }
  if (!exactObject(value, ['type', 'config']) || !object(value['config'])) return false;
  const config = value['config'];
  if (value['type'] === 'event') {
    return exactObject(config, ['eventName']) && boundedString(config['eventName'], 120);
  }
  return Boolean(
    value['type'] === 'urlMatch' &&
      optionalObject(config, ['pattern'], ['mode']) &&
      boundedString(config['pattern'], 2_048) &&
      (config['mode'] === undefined ||
        config['mode'] === 'exact' ||
        config['mode'] === 'prefix' ||
        config['mode'] === 'contains'),
  );
}

function isAudience(value: unknown): boolean {
  if (!optionalObject(value, ['environments'], ['rules'])) return false;
  const environments = value['environments'];
  const rules = value['rules'];
  return Boolean(
    Array.isArray(environments) &&
      environments.every((environment) =>
        ['development', 'staging', 'production'].includes(String(environment)),
      ) &&
      (rules === undefined ||
        (Array.isArray(rules) && rules.length <= 50 && rules.every(isAudienceRule))),
  );
}

function isAudienceRule(value: unknown): boolean {
  if (!optionalObject(value, ['source', 'key', 'operator'], ['value'])) return false;
  const ruleValue = value['value'];
  return Boolean(
    (value['source'] === 'identify' || value['source'] === 'event') &&
      boundedString(value['key'], 120) &&
      ['equals', 'notEquals', 'contains', 'exists', 'notExists'].includes(
        String(value['operator']),
      ) &&
      (ruleValue === undefined ||
        (typeof ruleValue === 'number' && Number.isFinite(ruleValue)) ||
        typeof ruleValue === 'boolean' ||
        (typeof ruleValue === 'string' && ruleValue.length <= 1_024)),
  );
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    object(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}

function optionalObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): value is Record<string, unknown> {
  if (!object(value)) return false;
  const allowed = [...required, ...optional];
  return (
    Object.keys(value).every((key) => allowed.includes(key)) &&
    required.every((key) => key in value)
  );
}

function deliveryPageState(installationId: string): DeliveryPageState {
  const existing = deliveryPageStates.get(installationId);
  if (existing) return existing;
  const created: DeliveryPageState = {
    traits: {},
    events: new Map(),
    firedPublications: new Set(),
  };
  deliveryPageStates.set(installationId, created);
  return created;
}

function audienceMatches(
  rules: readonly AudienceRule[],
  traits: Readonly<Record<string, unknown>>,
  events: ReadonlyMap<string, unknown>,
): boolean {
  return rules.every((rule) => {
    const actual = rule.source === 'identify' ? traits[rule.key] : events.get(rule.key);
    return audienceRuleMatches(rule, actual);
  });
}

function audienceRuleMatches(rule: AudienceRule, actual: unknown): boolean {
  if (rule.operator === 'exists') return actual !== undefined && actual !== null;
  if (rule.operator === 'notExists') return actual === undefined || actual === null;
  if (actual === undefined || actual === null) return false;
  if (rule.operator === 'equals') return actual === rule.value;
  if (rule.operator === 'notEquals') return actual !== rule.value;
  if (rule.operator === 'contains') {
    if (typeof actual === 'string') return actual.includes(String(rule.value ?? ''));
    return Array.isArray(actual) && actual.some((value) => value === rule.value);
  }
  return false;
}

function valueTypeOf(value: unknown): DataCatalogObservation['valueType'] {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'unknown';
}

function createCatalogObserver(
  url: string | undefined,
  installationId: string,
): {
  observe(
    source: DataCatalogObservation['source'],
    key: string,
    valueType: DataCatalogObservation['valueType'],
  ): void;
  destroy(): void;
} {
  const observed = new Set<string>();
  const pending = new Map<string, DataCatalogObservation>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    if (!url || pending.size === 0) return;
    const observations = [...pending.values()].slice(0, 100);
    pending.clear();
    void fetch(url, {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: {
        'content-type': 'application/json',
        'x-lodariq-installation-id': installationId,
      },
      body: JSON.stringify({ schemaVersion: CATALOG_SCHEMA_VERSION, observations }),
    }).catch(() => undefined);
  };

  return {
    observe(source, rawKey, valueType) {
      if (!url) return;
      const key = rawKey.trim();
      if (!CATALOG_KEY_PATTERN.test(key)) return;
      const identity = `${source}:${key}:${valueType}`;
      if (observed.has(identity)) return;
      observed.add(identity);
      pending.set(identity, { source, key, valueType, observedAt: new Date().toISOString() });
      if (!timer) timer = setTimeout(flush, CATALOG_FLUSH_MS);
    },
    destroy() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}
