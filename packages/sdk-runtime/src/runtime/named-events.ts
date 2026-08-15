type NamedRuntimeEventListener = () => void;

const listeners = new Map<string, Set<NamedRuntimeEventListener>>();
const observedEventNames = new Set<string>();
const MAX_OBSERVED_EVENT_NAMES = 128;

/**
 * Publishes only the bounded event name. Customer payloads remain outside the
 * choreography channel and continue through the normal analytics path.
 */
export function publishNamedRuntimeEvent(name: string): void {
  const normalized = name.trim();
  if (!normalized) return;
  observedEventNames.add(normalized);
  if (observedEventNames.size > MAX_OBSERVED_EVENT_NAMES) {
    const oldest = observedEventNames.values().next().value as string | undefined;
    if (oldest) observedEventNames.delete(oldest);
  }
  for (const listener of listeners.get(normalized) ?? []) listener();
}

export function hasObservedNamedRuntimeEvent(name: string): boolean {
  return observedEventNames.has(name.trim());
}

export function subscribeToNamedRuntimeEvent(
  name: string,
  listener: NamedRuntimeEventListener,
): () => void {
  const normalized = name.trim();
  if (!normalized) return () => {};
  const eventListeners = listeners.get(normalized) ?? new Set<NamedRuntimeEventListener>();
  eventListeners.add(listener);
  listeners.set(normalized, eventListeners);
  return () => {
    eventListeners.delete(listener);
    if (eventListeners.size === 0) listeners.delete(normalized);
  };
}
