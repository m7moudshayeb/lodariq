import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage,
  validate,
  type BridgeMessage as BridgeMessageType,
} from '@lodariq/schema';

export { BRIDGE_PROTOCOL_VERSION };

export interface BridgeOptions {
  /** Allowed peer origins. */
  allowedOrigins: string[];
  /** Exact origin to post outbound messages to. */
  targetOrigin: string;
  /** Optional scoped authoring session; inbound messages outside it are dropped. */
  expectedSessionId?: ScopedBridgeValue;
  /** Optional scoped document; inbound messages outside it are dropped. */
  expectedDocumentId?: ScopedBridgeValue;
  onMessage: (message: BridgeMessageType) => void;
  autoAck?: boolean;
  /** Drop inbound and refuse outbound messages above this serialized byte size. */
  maxMessageBytes?: number;
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
    this.maxMessageBytes = options.maxMessageBytes ?? 64 * 1024;
  }

  start(): void {
    if (this.listener) return;
    this.listener = (event: MessageEvent): void => {
      if (event.source !== this.peer) return;
      if (!this.options.allowedOrigins.includes(event.origin)) return;
      if (messageSizeBytes(event.data) > this.maxMessageBytes) return;
      const result = validate(BridgeMessage, event.data);
      if (!result.valid) return;
      const message = result.value;
      if (!this.isExpectedScope(message)) return;
      if (message.type === 'ack') {
        this.resolveAck(message.ackOf);
        return;
      }
      if (this.options.autoAck !== false) this.ack(message);
      this.options.onMessage(message);
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
    if (messageSizeBytes(message) > this.maxMessageBytes) {
      throw new Error(`Refusing to send bridge message over ${this.maxMessageBytes} bytes`);
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
