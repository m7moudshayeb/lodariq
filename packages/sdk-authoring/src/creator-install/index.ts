import type { LodariqDocument, ManifestPointer, SdkInstallContext } from '@lodariq/schema';
import {
  installLodariq,
  readConfigFromScript,
  type InstallOptions,
  type LoaderConfig,
  type LodariqBrowserApi,
} from '@lodariq/sdk-runtime/lodariq-loader';
import { openLocalAuthoringPanel } from '../authoring';
import { installCreatorToolbar, type CreatorToolbarOptions } from '../creator-toolbar';

export interface InstallCreatorLodariqOptions {
  script?: HTMLScriptElement;
  scriptSelector?: string;
  toolbar?: CreatorToolbarOptions | false;
  installOptions?: Omit<InstallOptions, 'openAuthoring'>;
}

const DEFAULT_CREATOR_SCRIPT_SELECTOR =
  'script[data-lodariq-loader][data-lodariq-authoring-session]';
const AUTO_INSTALL_ATTRIBUTE = 'data-lodariq-creator-installed';

export async function installCreatorLodariqFromScript(
  options: InstallCreatorLodariqOptions = {},
): Promise<LodariqBrowserApi | null> {
  const script =
    options.script ??
    document.querySelector<HTMLScriptElement>(
      options.scriptSelector ?? DEFAULT_CREATOR_SCRIPT_SELECTOR,
  );
  if (!script) return null;

  const config = readConfigFromScript(script);
  if (!config) return null;

  const api = await installLodariq(config, {
    ...options.installOptions,
    openAuthoring: async (manifest, context) => {
      const document = await loadCreatorDocument(config, context);
      openCreatorAuthoringPanel(config, manifest, context, document);
    },
  });
  if (!api) return null;

  if (options.toolbar !== false) installCreatorToolbar(options.toolbar);
  return api;
}

function openCreatorAuthoringPanel(
  config: LoaderConfig,
  manifest: ManifestPointer,
  context: SdkInstallContext,
  document: LodariqDocument,
): void {
  if (context.environment === 'production') {
    throw new Error('Lodariq creator authoring is not available in production');
  }
  if (context.environment !== 'development' && context.environment !== 'staging') {
    throw new Error(`Unsupported Lodariq creator environment: ${context.environment}`);
  }
  if (
    context.authoring?.enabled !== true ||
    !context.authoring.sessionId ||
    !context.authoring.iframeSrc
  ) {
    throw new Error('Lodariq creator authoring session is missing or disabled');
  }
  if (document.id !== manifest.documentId || document.workspaceId !== context.workspaceId) {
    throw new Error('Lodariq creator document does not match the SDK bootstrap context');
  }

  openLocalAuthoringPanel(
    {
      sessionId: context.authoring.sessionId,
      documentId: manifest.documentId,
      workspaceId: context.workspaceId,
      environment: context.environment,
    },
    {
      iframeSrc: context.authoring.iframeSrc,
      initialDocument: document,
      onSave: (document) => saveCreatorDocument(config, context, document),
    },
  );
}

async function loadCreatorDocument(
  config: LoaderConfig,
  context: SdkInstallContext,
): Promise<LodariqDocument> {
  const documentUrl = context.authoring?.documentUrl;
  if (!documentUrl) {
    throw new Error('Lodariq creator authoring document URL is missing');
  }
  const response = await fetchCreatorAuthoringEndpoint(config, documentUrl, { method: 'GET' });
  const body = (await response.json()) as { document?: LodariqDocument };
  if (!body.document) {
    throw new Error('Lodariq creator authoring document response is missing');
  }
  return body.document;
}

async function saveCreatorDocument(
  config: LoaderConfig,
  context: SdkInstallContext,
  document: LodariqDocument,
): Promise<void> {
  const saveDocumentUrl = context.authoring?.saveDocumentUrl;
  if (!saveDocumentUrl) {
    throw new Error('Lodariq creator authoring save URL is missing');
  }
  await fetchCreatorAuthoringEndpoint(config, saveDocumentUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ document }),
  });
}

async function fetchCreatorAuthoringEndpoint(
  config: LoaderConfig,
  url: string,
  init: RequestInit,
): Promise<Response> {
  if (!config.clientToken || !config.authoringSessionToken) {
    throw new Error('Lodariq creator authoring credentials are missing');
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${config.clientToken}`);
  headers.set('x-lodariq-authoring-session', config.authoringSessionToken);

  const response = await fetch(url, {
    ...init,
    credentials: 'omit',
    headers,
  });
  if (!response.ok) {
    throw new Error(`Lodariq creator authoring request failed: ${response.status}`);
  }
  return response;
}

function autoInstallCreatorFromScript(currentScript: HTMLScriptElement | null): void {
  const script = currentScript ?? findCreatorInstallScript();
  if (!script || script.getAttribute(AUTO_INSTALL_ATTRIBUTE) === 'true') return;
  script.setAttribute(AUTO_INSTALL_ATTRIBUTE, 'true');
  void installCreatorLodariqFromScript({ script }).catch((error: unknown) => {
    window.dispatchEvent(
      new CustomEvent('lodariq:error', {
        detail: {
          error,
          phase: 'authoring-install',
        },
      }),
    );
  });
}

function findCreatorInstallScript(): HTMLScriptElement | null {
  if (typeof document === 'undefined') return null;
  return (
    [...document.scripts]
      .reverse()
      .find(
        (script): script is HTMLScriptElement =>
          script instanceof HTMLScriptElement &&
          script.matches(DEFAULT_CREATOR_SCRIPT_SELECTOR),
      ) ?? null
  );
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const currentScript =
    document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
  queueMicrotask(() => autoInstallCreatorFromScript(currentScript));
}
