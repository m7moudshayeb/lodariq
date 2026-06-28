import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage,
  validate,
  type BridgeMessage as BridgeMessageType,
} from '@talmeh/schema';

/**
 * Versioned iframe <-> host-page bridge (PRD §9.5).
 *
 * Rules enforced here:
 * - Incoming messages validate the customer-app PARENT origin (allowlist),
 *   not the iframe's own Talmeh origin.
 * - Outbound messages use the EXACT allowed target origin — never "*" outside
 *   local dev fixtures.
 * - Every payload is runtime-validated against @talmeh/schema before dispatch.
 * - Keystrokes never cross the bridge; senders batch semantic patches.
 */
export interface BridgeOptions {
  /** Allowed parent origins (the customer app). */
  allowedOrigins: string[];
  /** Exact origin to post outbound messages to. */
  targetOrigin: string;
  onMessage: (message: BridgeMessageType) => void;
}

export class AuthoringBridge {
  private listener: ((event: MessageEvent) => void) | null = null;

  constructor(
    private readonly peer: Window,
    private readonly options: BridgeOptions,
  ) {}

  start(): void {
    this.listener = (event: MessageEvent): void => {
      if (event.source !== this.peer) return;
      if (!this.options.allowedOrigins.includes(event.origin)) return;
      const result = validate(BridgeMessage, event.data);
      if (!result.valid) return;
      this.options.onMessage(result.value);
    };
    window.addEventListener('message', this.listener);
  }

  stop(): void {
    if (this.listener) window.removeEventListener('message', this.listener);
    this.listener = null;
  }

  send(message: BridgeMessageType): void {
    if (this.options.targetOrigin === '*') {
      throw new Error('Refusing to send bridge message to wildcard target origin');
    }
    const result = validate(BridgeMessage, message);
    if (!result.valid) {
      throw new Error(`Refusing to send invalid bridge message: ${result.errors[0]?.message}`);
    }
    this.peer.postMessage(message, this.options.targetOrigin);
  }
}

export { BRIDGE_PROTOCOL_VERSION };
