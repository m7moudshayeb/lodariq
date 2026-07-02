export interface ObservabilityEvent {
  name: string;
  timestamp: string;
  correlationId?: string;
  workspaceId?: string;
  documentId?: string;
  environmentId?: string;
  userId?: string;
  attributes?: Record<string, unknown>;
}

export interface ObservabilitySink {
  emit(event: ObservabilityEvent): void;
}

export const noopObservability: ObservabilitySink = {
  emit: () => undefined,
};

export function createObservabilityEvent(
  input: Omit<ObservabilityEvent, 'timestamp'>,
): ObservabilityEvent {
  return {
    ...input,
    timestamp: new Date().toISOString(),
  };
}
