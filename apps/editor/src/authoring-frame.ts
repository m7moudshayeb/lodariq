import { compileDocument } from '@lodariq/compiler';
import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage,
  LodariqDocument,
  validate,
  type BridgeMessage as BridgeMessageType,
} from '@lodariq/schema';
import {
  mountLocalAuthoringFrame,
  type LocalAuthoringFrameServices,
} from '@lodariq/sdk-authoring/lodariq-authoring';

const root = getAuthoringRoot();

let mounted = false;
const trustedParentOrigin = readTrustedParentOrigin();
window.addEventListener('message', handleInitMessage);

function handleInitMessage(event: MessageEvent): void {
  if (mounted) return;
  if (!trustedParentOrigin || event.origin !== trustedParentOrigin) return;

  const result = validate(BridgeMessage, event.data);
  if (!result.valid || result.value.type !== 'authoring.init') return;

  const message = result.value;
  if (message.protocol !== BRIDGE_PROTOCOL_VERSION) return;
  mounted = true;
  window.__lodariqEditorMounted = true;
  window.removeEventListener('message', handleInitMessage);
  root.removeAttribute('data-state');
  root.textContent = '';

  mountLocalAuthoringFrame({
    root,
    baseDocument: message.document,
    sessionId: message.sessionId,
    peerWindow: window.parent,
    allowedOrigins: [event.origin],
    targetOrigin: event.origin,
    services: createHostedEditorServices(message),
  });
}

function createHostedEditorServices(
  message: Extract<BridgeMessageType, { type: 'authoring.init' }>,
): LocalAuthoringFrameServices {
  let currentDocument = structuredClone(message.document);
  return {
    loadDocument: (documentId) =>
      currentDocument.id === documentId ? structuredClone(currentDocument) : null,
    saveDocument: (document) => {
      currentDocument = structuredClone(document);
    },
    exportDocument: (document) => JSON.stringify(document, null, 2),
    importDocument: (json) => {
      const parsed = JSON.parse(json) as unknown;
      const result = validate(LodariqDocument, parsed);
      if (!result.valid) {
        throw new Error('Imported document is not valid Lodariq block JSON');
      }
      return result.value;
    },
    resetDocuments: () => {
      currentDocument = structuredClone(message.document);
    },
    compilePreview: (document) => compileDocument(document),
    recordMetric: () => {},
    getMetricsSummary: () => ({}),
    exportMetricsReport: () => JSON.stringify({ sessions: [] }),
  };
}

function readTrustedParentOrigin(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('parentOrigin');
  const candidate = fromQuery ?? document.referrer;
  if (!candidate) return null;
  try {
    return new URL(candidate, window.location.href).origin;
  } catch {
    return null;
  }
}

function getAuthoringRoot(): HTMLElement {
  const element = document.getElementById('authoring');
  if (!element) throw new Error('#authoring not found');
  return element;
}

declare global {
  interface Window {
    __lodariqEditorMounted?: boolean;
  }
}

window.__lodariqEditorMounted = mounted;
