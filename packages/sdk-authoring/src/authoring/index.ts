import {
  AuthoringBridge,
  BRIDGE_PROTOCOL_VERSION,
  createBridgeCorrelationId,
  startTargetPicker,
  type TargetPicker,
} from '../bridge';
import { escapeAttribute } from './html';

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

export interface LocalAuthoringPanelOptions {
  iframeSrc: string;
}

export interface LocalAuthoringPanel {
  close: () => void;
  destroy: () => void;
}

let activePanel: LocalAuthoringPanel | null = null;

export function openLocalAuthoringPanel(
  session: AuthoringSession,
  options: LocalAuthoringPanelOptions,
): LocalAuthoringPanel {
  activePanel?.destroy();

  const host = document.createElement('talmeh-authoring-panel');
  const shadow = host.attachShadow({ mode: 'open' });
  const iframeOrigin = new URL(options.iframeSrc, window.location.href).origin;
  let picker: TargetPicker | null = null;
  let bridge: AuthoringBridge | null = null;

  shadow.appendChild(createPanelStyles());
  const panelElement = document.createElement('section');
  panelElement.className = 'panel';
  panelElement.setAttribute('role', 'dialog');
  panelElement.setAttribute('aria-label', 'Talmeh authoring');
  panelElement.innerHTML = `
    <header>
      <strong>Talmeh</strong>
      <button type="button" aria-label="Close Talmeh authoring">Close</button>
    </header>
    <iframe
      title="Talmeh authoring"
      sandbox="allow-scripts allow-same-origin"
      src="${escapeAttribute(options.iframeSrc)}"
    ></iframe>
  `;
  shadow.appendChild(panelElement);

  const closeButton = shadow.querySelector('button');
  const iframe = shadow.querySelector('iframe');

  const close = (): void => {
    picker?.cancel();
    picker = null;
    bridge?.stop();
    bridge = null;
    host.remove();
    if (activePanel === panel) activePanel = null;
  };

  const panel: LocalAuthoringPanel = {
    close,
    destroy: close,
  };

  closeButton?.addEventListener('click', close);
  iframe?.addEventListener('load', () => {
    if (!iframe.contentWindow) return;
    bridge?.stop();
    bridge = new AuthoringBridge(iframe.contentWindow, {
      allowedOrigins: [iframeOrigin],
      targetOrigin: iframeOrigin,
      onMessage: (message) => {
        if (message.type !== 'target.pick.start') return;
        picker?.cancel();
        picker = startTargetPicker({
          onPick: ({ fingerprint }) => {
            picker = null;
            void bridge
              ?.sendWithAck(
                {
                  protocol: BRIDGE_PROTOCOL_VERSION,
                  sessionId: session.sessionId,
                  documentId: session.documentId,
                  correlationId: createBridgeCorrelationId('target_pick_result'),
                  type: 'target.pick.result',
                  blockId: message.blockId,
                  fingerprint,
                },
                { timeoutMs: 2000 },
              )
              .catch(() => {});
          },
          onCancel: () => {
            picker = null;
          },
        });
      },
    });
    bridge.start();
  });

  document.body.appendChild(host);
  activePanel = panel;
  return panel;
}

function createPanelStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      pointer-events: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .panel {
      position: fixed;
      top: 16px;
      right: 16px;
      width: min(420px, calc(100vw - 32px));
      height: min(640px, calc(100vh - 32px));
      border: 1px solid #d7dbe7;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
      pointer-events: auto;
      overflow: hidden;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 48px;
      padding: 0 12px;
      border-bottom: 1px solid #e5e7eb;
      color: #172033;
    }

    button {
      padding: 6px 10px;
      border: 1px solid #d7dbe7;
      border-radius: 6px;
      background: #fff;
      color: #172033;
      font: inherit;
      cursor: pointer;
    }

    iframe {
      width: 100%;
      height: calc(100% - 48px);
      border: 0;
      background: #fff;
    }
  `;
  return style;
}
