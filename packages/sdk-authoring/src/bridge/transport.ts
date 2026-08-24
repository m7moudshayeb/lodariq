import {
  AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
  AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage,
  validate,
  type BridgeMessage as BridgeMessageType,
} from '@lodariq/schema';

export { BRIDGE_PROTOCOL_VERSION };

export const DEFAULT_AUTHORING_BRIDGE_MAX_MESSAGE_BYTES = 64 * 1024;
export const RELEASE_RECOVERY_BRIDGE_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
export const LOCALE_LAYOUT_QA_BRIDGE_MAX_MESSAGE_BYTES = 256 * 1024;
export const RELEASE_RECOVERY_BRIDGE_MESSAGE_BYTE_LIMITS = {
  [AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE]: RELEASE_RECOVERY_BRIDGE_MAX_MESSAGE_BYTES,
  [AUTHORING_LOCALE_LAYOUT_QA_RESULT_TYPE]: LOCALE_LAYOUT_QA_BRIDGE_MAX_MESSAGE_BYTES,
} as const;

export interface BridgeOptions {
  /** Allowed peer origins. */
  allowedOrigins: string[];
  /** Exact origin to post outbound messages to. */
  targetOrigin: string;
  /** Optional scoped authoring session; inbound messages outside it are dropped. */
  expectedSessionId?: ScopedBridgeValue;
  /** Optional scoped document; inbound messages outside it are dropped. */
  expectedDocumentId?: ScopedBridgeValue;
  onMessage: (message: BridgeMessageType) => Promise<void> | void;
  autoAck?: boolean;
  /** Drop inbound and refuse outbound messages above this serialized byte size. */
  maxMessageBytes?: number;
  /** Narrow per-message exceptions; unlisted messages retain maxMessageBytes/default. */
  maxMessageBytesByType?: Readonly<Record<string, number>>;
}

export type ScopedBridgeValue = string | (() => string);

export interface SendWithAckOptions {
  timeoutMs?: number;
}

interface PendingAck {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class AuthoringBridge {
  private listener: ((event: MessageEvent) => void) | null = null;
  private readonly pendingAcks = new Map<string, PendingAck>();
  private readonly maxMessageBytes: number;

  constructor(
    private readonly peer: Window,
    private readonly options: BridgeOptions,
  ) {
    this.maxMessageBytes = options.maxMessageBytes ?? DEFAULT_AUTHORING_BRIDGE_MAX_MESSAGE_BYTES;
  }

  start(): void {
    if (this.listener) return;
    this.listener = (event: MessageEvent): void => {
      if (event.source !== this.peer) return;
      if (!this.options.allowedOrigins.includes(event.origin)) return;
      if (messageSizeBytes(event.data) > this.maxMessageBytesFor(event.data)) return;
      const result = validate(BridgeMessage, event.data);
      if (!result.valid) return;
      const message = result.value;
      if (!this.isExpectedScope(message)) return;
      if (message.type === 'ack') {
        this.resolveAck(message.ackOf);
        return;
      }
      const handled = this.options.onMessage(message);
      if (this.options.autoAck === false) return;
      if (handled) {
        void handled.then(
          () => this.ack(message),
          () => {},
        );
        return;
      }
      this.ack(message);
    };
    window.addEventListener('message', this.listener);
  }

  stop(): void {
    if (this.listener) window.removeEventListener('message', this.listener);
    this.listener = null;
    for (const [correlationId, pending] of this.pendingAcks) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Bridge acknowledgement timed out: ${correlationId}`));
    }
    this.pendingAcks.clear();
  }

  send(message: BridgeMessageType): void {
    this.sendValidated(message);
  }

  sendWithAck(message: BridgeMessageType, options: SendWithAckOptions = {}): Promise<void> {
    if (message.type === 'ack') throw new Error('Bridge ack messages cannot require an ack');
    const timeoutMs = options.timeoutMs ?? 2000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(message.correlationId);
        reject(new Error(`Bridge acknowledgement timed out: ${message.correlationId}`));
      }, timeoutMs);
      this.pendingAcks.set(message.correlationId, { resolve, reject, timer });
      try {
        this.sendValidated(message);
      } catch (error) {
        clearTimeout(timer);
        this.pendingAcks.delete(message.correlationId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private sendValidated(message: BridgeMessageType): void {
    if (this.options.targetOrigin === '*') {
      throw new Error('Refusing to send bridge message to wildcard target origin');
    }
    const maxMessageBytes = this.maxMessageBytesFor(message);
    if (messageSizeBytes(message) > maxMessageBytes) {
      throw new Error(`Refusing to send bridge message over ${maxMessageBytes} bytes`);
    }
    const result = validate(BridgeMessage, message);
    if (!result.valid) {
      throw new Error(`Refusing to send invalid bridge message: ${result.errors[0]?.message}`);
    }
    this.peer.postMessage(message, this.options.targetOrigin);
  }

  private ack(message: BridgeMessageType): void {
    this.sendValidated({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: message.sessionId,
      documentId: message.documentId,
      correlationId: createBridgeCorrelationId('ack'),
      type: 'ack',
      ackOf: message.correlationId,
      ...(message.type === 'preview.patch' && message.transaction
        ? { appliedRevision: message.transaction.revision }
        : {}),
    });
  }

  private resolveAck(correlationId: string): void {
    const pending = this.pendingAcks.get(correlationId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingAcks.delete(correlationId);
    pending.resolve();
  }

  private isExpectedScope(message: BridgeMessageType): boolean {
    const expectedSessionId = scopedBridgeValue(this.options.expectedSessionId);
    if (expectedSessionId !== undefined && message.sessionId !== expectedSessionId) {
      return false;
    }
    const expectedDocumentId = scopedBridgeValue(this.options.expectedDocumentId);
    if (expectedDocumentId !== undefined && message.documentId !== expectedDocumentId) {
      return false;
    }
    return true;
  }

  private maxMessageBytesFor(message: unknown): number {
    const type = bridgeMessageType(message);
    return (type && this.options.maxMessageBytesByType?.[type]) || this.maxMessageBytes;
  }
}

function bridgeMessageType(message: unknown): string | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const type = (message as Record<string, unknown>)['type'];
  return typeof type === 'string' ? type : null;
}

function scopedBridgeValue(value: ScopedBridgeValue | undefined): string | undefined {
  return typeof value === 'function' ? value() : value;
}

function messageSizeBytes(message: unknown): number {
  try {
    const json = JSON.stringify(message);
    if (typeof json !== 'string') return 0;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).byteLength;
    return json.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function createBridgeCorrelationId(prefix = 'msg'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}
