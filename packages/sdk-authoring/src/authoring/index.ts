import type { BridgeOptions } from '../bridge';
import { AuthoringBridge } from '../bridge';

/**
 * Authoring shell (PRD §9.4).
 *
 * Loaded ONLY for authenticated creators entering authoring mode. Owns the
 * floating toolbar, element picker handoff, and the sandboxed iframe editor
 * served from a dedicated Talmeh origin (editor.talmeh.io, PRD §12.5).
 *
 * Ownership split (PRD §9.5):
 * - iframe: Lexical editor state, drafts, auth, selection, validation/review UI.
 * - host bridge: DOM inspection, target picking, page-state, overlay preview.
 * - server: persistence, compilation, publication, long-running jobs.
 *
 * React + Lexical are intentionally available in this package because it is
 * never shipped to production viewers (PRD §6.2, §9.1, §20).
 */
export interface AuthoringSession {
  sessionId: string;
  documentId: string;
  workspaceId: string;
  environment: 'development' | 'staging';
}

export class AuthoringShell {
  private bridge: AuthoringBridge | null = null;

  constructor(private readonly session: AuthoringSession) {}

  connect(peer: Window, options: BridgeOptions): void {
    this.bridge = new AuthoringBridge(peer, options);
    this.bridge.start();
  }

  disconnect(): void {
    this.bridge?.stop();
    this.bridge = null;
  }

  getSession(): AuthoringSession {
    return this.session;
  }
}
