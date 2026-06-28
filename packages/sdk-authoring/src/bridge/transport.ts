import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage,
  validate,
  type BridgeMessage as BridgeMessageType,
} from '@talmeh/schema';

export { BRIDGE_PROTOCOL_VERSION };

export interface BridgeOptions {
  /** Allowed peer origins. */
  allowedOrigins: string[];
  /** Exact origin to post outbound messages to. */
  targetOrigin: string;
  onMessage: (message: BridgeMessageType) => void;
  autoAck?: boolean;
}

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

  constructor(
    private readonly peer: Window,
    private readonly options: BridgeOptions,
  ) {}

  start(): void {
    if (this.listener) return;
    this.listener = (event: MessageEvent): void => {
      if (event.source !== this.peer) return;
      if (!this.options.allowedOrigins.includes(event.origin)) return;
      const result = validate(BridgeMessage, event.data);
      if (!result.valid) return;
      if (result.value.type === 'ack') {
        this.resolveAck(result.value.ackOf);
        return;
      }
      if (this.options.autoAck !== false) this.ack(result.value);
      this.options.onMessage(result.value);
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
}

export function createBridgeCorrelationId(prefix = 'msg'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}
