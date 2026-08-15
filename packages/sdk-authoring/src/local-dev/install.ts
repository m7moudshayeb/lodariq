import type { LodariqDocument } from '@lodariq/schema';
import { LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1 } from '@lodariq/schema/brand-runtime';
import type {
  InstallOptions,
  LoaderConfig,
  LodariqBrowserApi,
} from '@lodariq/sdk-runtime/lodariq-loader';
import { installLodariq, readConfigFromScript } from '@lodariq/sdk-runtime/lodariq-loader';
import { compilePreview, loadDocument, saveDocument } from '@lodariq/sdk-runtime/lodariq-local-dev';
import { LOCAL_AUTHORING_SESSION_ID } from '../authoring/constants';
import { createLocalExperienceId, createTourDraft } from '../creator-experiences';
import {
  installCreatorToolbar,
  type CreatorPageExperienceSummary,
  type CreatorToolbarOptions,
} from '../creator-toolbar';

export interface InstallLocalLodariqAuthoringOptions {
  baseDocument: LodariqDocument;
  script?: HTMLScriptElement;
  scriptSelector?: string;
  iframeSrc?: string;
  sessionId?: string;
  authoringTrigger?: LocalAuthoringTriggerOptions | false;
  installOptions?: Omit<InstallOptions, 'loadCurrentTour' | 'openAuthoring'>;
}

export interface LocalAuthoringTriggerOptions {
  label?: string;
  ariaLabel?: string;
  className?: string;
  container?: HTMLElement;
}

const DEFAULT_LOADER_SELECTOR = 'script[data-lodariq-loader]';
const DEFAULT_AUTHORING_IFRAME_SRC = '/authoring.html';
const DEFAULT_AUTHORING_TRIGGER_CLASS = 'lodariq-authoring-trigger';
const DEFAULT_AUTHORING_TRIGGER_LABEL = 'LQ';
const DEFAULT_AUTHORING_TRIGGER_ARIA_LABEL = 'Open Lodariq actions';
const LOCAL_CREATOR_INDEX_PREFIX = 'lodariq:creator-index:';
const LOCAL_FRAME_DOCUMENT_PARAM = 'lodariqDocument';
const LOCAL_FRAME_SESSION_PARAM = 'lodariqSession';

type LocalAuthoringEnvironment = 'development' | 'staging';
type LocalAuthoringLoaderConfig = LoaderConfig & { workspaceId: string };

export async function installLocalLodariqAuthoringFromScript(
  options: InstallLocalLodariqAuthoringOptions,
): Promise<LodariqBrowserApi | null> {
  const script =
    options.script ??
    document.querySelector<HTMLScriptElement>(options.scriptSelector ?? DEFAULT_LOADER_SELECTOR);
  if (!script) return null;

  const config = readConfigFromScript(script);
  if (!config) return null;
  const localConfig = requireLocalAuthoringConfig(config);

  let lodariq: LodariqBrowserApi | null = null;
  const sessionId = options.sessionId ?? LOCAL_AUTHORING_SESSION_ID;
  const environment = localAuthoringEnvironment(localConfig.environment);
  let activeDocumentId = options.baseDocument.id;
  let lastOpenedDocumentId: string | null = null;
  rememberLocalExperience(localConfig.workspaceId, currentPageRouteKey(), options.baseDocument.id);

  const openDocument = async (documentId: string): Promise<void> => {
    const document = currentDocument(localConfig, options.baseDocument, documentId);
    const { openLocalAuthoringPanel, saveAndCloseActiveLocalAuthoringPanel } =
      await import('../authoring');
    if (lastOpenedDocumentId && lastOpenedDocumentId !== documentId) {
      await saveAndCloseActiveLocalAuthoringPanel();
    }
    if (!lodariq) throw new Error('Lodariq local preview is not installed');

    activeDocumentId = documentId;
    lastOpenedDocumentId = documentId;
    const documentSessionId = localDocumentSessionId(sessionId, documentId);
    rememberLocalExperience(localConfig.workspaceId, currentPageRouteKey(), documentId);
    openLocalAuthoringPanel(
      {
        sessionId: documentSessionId,
        documentId,
        workspaceId: localConfig.workspaceId,
        environment,
      },
      {
        autoPreview: true,
        iframeSrc: localAuthoringFrameSrc(
          options.iframeSrc ?? DEFAULT_AUTHORING_IFRAME_SRC,
          documentSessionId,
          documentId,
        ),
        initialDocument: document,
        initialTheme: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
        preview: {
          loadDocument: (requestedDocumentId) =>
            currentDocument(localConfig, options.baseDocument, requestedDocumentId),
          compilePreview,
          playPreview: (compiled, previewOptions) => {
            if (!lodariq?.playAuthoringPreview) {
              throw new Error('Lodariq local authoring preview runtime is unavailable');
            }
            return lodariq.playAuthoringPreview(compiled, {
              ownerId: previewOptions.ownerId,
              ...(previewOptions.locale ? { locale: previewOptions.locale } : {}),
              ...(previewOptions.interactive ? { interactive: true } : {}),
              ...(previewOptions.stepId ? { initialStepId: previewOptions.stepId } : {}),
              ...(previewOptions.authoringTargetOverride
                ? { authoringTargetOverride: previewOptions.authoringTargetOverride }
                : {}),
              ...(previewOptions.onStepChange
                ? {
                    onStepChange: (index, step) => previewOptions.onStepChange?.(index, step.id),
                  }
                : {}),
              ...(previewOptions.onComplete ? { onComplete: previewOptions.onComplete } : {}),
              ...(previewOptions.onDismiss ? { onDismiss: previewOptions.onDismiss } : {}),
              ...(previewOptions.onSkip ? { onSkip: previewOptions.onSkip } : {}),
              ...(previewOptions.onChoreographyStageChange
                ? {
                    onChoreographyStageChange: (step, update) =>
                      previewOptions.onChoreographyStageChange?.(step.id, update),
                  }
                : {}),
              ...(previewOptions.getAuthoringProtectedSurfaces
                ? { getAuthoringProtectedSurfaces: previewOptions.getAuthoringProtectedSurfaces }
                : {}),
              ...(previewOptions.onAuthoringSurfaceChange
                ? { onAuthoringSurfaceChange: previewOptions.onAuthoringSurfaceChange }
                : {}),
            });
          },
          stopPreview: (ownerId) => lodariq?.stopAuthoringPreview?.(ownerId),
        },
        onSave: (nextDocument) => {
          saveDocument(nextDocument);
          rememberLocalExperience(localConfig.workspaceId, currentPageRouteKey(), nextDocument.id);
        },
      },
    );
  };

  const api = await installLodariq(localConfig, {
    ...options.installOptions,
    loadCurrentTour: (manifest) =>
      compilePreview(currentDocument(localConfig, options.baseDocument, manifest.documentId)),
    openAuthoring: (manifest) => openDocument(manifest.documentId),
  });

  lodariq = api;
  installLocalCreatorLauncher(options.authoringTrigger, {
    onCreateExperience: async (type) => {
      if (type !== 'tour') throw new Error(`Unsupported local experience type: ${type}`);
      const document = createTourDraft({
        documentId: createLocalExperienceId(),
        workspaceId: localConfig.workspaceId,
        environment,
        schemaVersion: options.baseDocument.schemaVersion,
      });
      saveDocument(document);
      rememberLocalExperience(localConfig.workspaceId, currentPageRouteKey(), document.id);
      await openDocument(document.id);
    },
    listExperiencesForPage: () =>
      listLocalPageExperiences(localConfig, options.baseDocument, currentPageRouteKey()),
    onOpenExperience: openDocument,
    onPreview: async () => {
      if (!lodariq) throw new Error('Lodariq local preview is not installed');
      const document = currentDocument(localConfig, options.baseDocument, activeDocumentId);
      await lodariq.playTour(await compilePreview(document));
    },
  });
  return api;
}

function installLocalCreatorLauncher(
  triggerOptions: LocalAuthoringTriggerOptions | false | undefined,
  creatorActions: Pick<
    CreatorToolbarOptions,
    'listExperiencesForPage' | 'onCreateExperience' | 'onOpenExperience' | 'onPreview'
  >,
): HTMLButtonElement | null {
  if (triggerOptions === false) return null;
  const options = triggerOptions ?? {};
  return installCreatorToolbar({
    ...options,
    ...creatorActions,
    label: options.label ?? DEFAULT_AUTHORING_TRIGGER_LABEL,
    ariaLabel: options.ariaLabel ?? DEFAULT_AUTHORING_TRIGGER_ARIA_LABEL,
    className: options.className ?? DEFAULT_AUTHORING_TRIGGER_CLASS,
  });
}

interface LocalExperienceIndexEntry {
  documentId: string;
  routeKey: string;
}

function listLocalPageExperiences(
  config: LocalAuthoringLoaderConfig,
  baseDocument: LodariqDocument,
  routeKey: string,
): CreatorPageExperienceSummary[] {
  return readLocalExperienceIndex(config.workspaceId)
    .filter((entry) => entry.routeKey === routeKey)
    .map((entry) => localExperienceDocument(config, baseDocument, entry.documentId))
    .filter((document): document is LodariqDocument => document?.type === 'tour')
    .map((document) => ({ id: document.id, title: document.title, type: 'tour' }));
}

function localExperienceDocument(
  config: LocalAuthoringLoaderConfig,
  baseDocument: LodariqDocument,
  documentId: string,
): LodariqDocument | null {
  if (documentId === baseDocument.id) {
    return currentDocument(config, baseDocument, documentId);
  }
  return loadDocument(documentId);
}

function rememberLocalExperience(workspaceId: string, routeKey: string, documentId: string): void {
  const previous = readLocalExperienceIndex(workspaceId).filter(
    (entry) => entry.documentId !== documentId || entry.routeKey !== routeKey,
  );
  const next = [{ documentId, routeKey }, ...previous];
  localStorage.setItem(localExperienceIndexKey(workspaceId), JSON.stringify(next));
}

function readLocalExperienceIndex(workspaceId: string): LocalExperienceIndexEntry[] {
  const raw = localStorage.getItem(localExperienceIndexKey(workspaceId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalExperienceIndexEntry);
  } catch {
    return [];
  }
}

function isLocalExperienceIndexEntry(value: unknown): value is LocalExperienceIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LocalExperienceIndexEntry>;
  return typeof entry.documentId === 'string' && typeof entry.routeKey === 'string';
}

function localExperienceIndexKey(workspaceId: string): string {
  return `${LOCAL_CREATOR_INDEX_PREFIX}${workspaceId}`;
}

function currentPageRouteKey(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function localDocumentSessionId(baseSessionId: string, documentId: string): string {
  return `${baseSessionId}:${documentId}`;
}

function localAuthoringFrameSrc(iframeSrc: string, sessionId: string, documentId: string): string {
  const url = new URL(iframeSrc, window.location.href);
  url.searchParams.set(LOCAL_FRAME_SESSION_PARAM, sessionId);
  url.searchParams.set(LOCAL_FRAME_DOCUMENT_PARAM, documentId);
  return url.toString();
}

function currentDocument(
  config: LocalAuthoringLoaderConfig,
  baseDocument: LodariqDocument,
  documentId: string,
): LodariqDocument {
  return loadDocument(documentId) ?? baseDocumentFor(config, baseDocument, documentId);
}

function baseDocumentFor(
  config: LocalAuthoringLoaderConfig,
  baseDocument: LodariqDocument,
  documentId: string,
): LodariqDocument {
  const doc = structuredClone(baseDocument);
  return { ...doc, id: documentId, workspaceId: config.workspaceId };
}

function requireLocalAuthoringConfig(config: LoaderConfig): LocalAuthoringLoaderConfig {
  if (!config.workspaceId) {
    throw new Error('Lodariq local authoring requires data-workspace on the loader script');
  }
  return config as LocalAuthoringLoaderConfig;
}

function localAuthoringEnvironment(
  environment: LoaderConfig['environment'],
): LocalAuthoringEnvironment {
  if (environment === 'production') {
    throw new Error('Lodariq local authoring is only available in development or staging');
  }
  return environment;
}
