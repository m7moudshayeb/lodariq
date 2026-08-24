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
import { createExperienceDraft, createLocalExperienceId } from '../creator-experiences';
import { isCreatorEnabledExperienceType } from '../creator-experience-types';
import { resolveLocalMediaAssetUrl } from './local-media-store';
import { selectExperienceRootBlocks } from '../authoring/experience-authoring-capabilities';
import { createMockPresence, mockPresenceRequested } from './mock-presence';
import { readDraftPreviewResume } from '../authoring/preview-resume';
import {
  installCreatorToolbar,
  type CreatorExperienceScope,
  type CreatorPageExperiencePage,
  type CreatorPageExperienceQuery,
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
  let lastOpenedDocumentId: string | null = null;
  rememberLocalExperience(
    localConfig.workspaceId,
    currentPageRouteKey(),
    currentDocument(localConfig, options.baseDocument, options.baseDocument.id),
  );

  const openDocument = async (
    documentId: string,
    restored?: { stepId: string; interactive: boolean },
  ): Promise<void> => {
    const document = currentDocument(localConfig, options.baseDocument, documentId);
    const { openLocalAuthoringPanel, saveAndCloseActiveLocalAuthoringPanel } =
      await import('../authoring');
    if (lastOpenedDocumentId && lastOpenedDocumentId !== documentId) {
      await saveAndCloseActiveLocalAuthoringPanel();
    }
    if (!lodariq) throw new Error('Lodariq local preview is not installed');

    lastOpenedDocumentId = documentId;
    const documentSessionId = localDocumentSessionId(sessionId, documentId);
    rememberLocalExperience(localConfig.workspaceId, currentPageRouteKey(), document);
    openLocalAuthoringPanel(
      {
        sessionId: documentSessionId,
        documentId,
        workspaceId: localConfig.workspaceId,
        environment,
      },
      {
        autoPreview: true,
        ...(restored
          ? {
              initialPreviewStepId: restored.stepId,
              ...(restored.interactive ? { initialPreviewInteractive: true } : {}),
            }
          : {}),
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
              resolveMediaAsset: resolveLocalMediaAssetUrl,
              ...(previewOptions.locale ? { locale: previewOptions.locale } : {}),
              ...(previewOptions.interactive ? { interactive: true } : {}),
              ...(previewOptions.accessibilityMode
                ? { accessibilityMode: previewOptions.accessibilityMode }
                : {}),
              ...(previewOptions.flowConditionContext
                ? { flowConditionContext: previewOptions.flowConditionContext }
                : {}),
              ...(previewOptions.adaptiveContext
                ? { adaptiveContext: previewOptions.adaptiveContext }
                : {}),
              ...(previewOptions.stepId ? { initialStepId: previewOptions.stepId } : {}),
              ...(previewOptions.authoringTargetOverride
                ? { authoringTargetOverride: previewOptions.authoringTargetOverride }
                : {}),
              ...(previewOptions.onBeforeStepChange
                ? {
                    onBeforeStepChange: (index, step) =>
                      previewOptions.onBeforeStepChange?.(index, step.id),
                  }
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
              ...(previewOptions.onChoreographyRecovery
                ? {
                    onChoreographyRecovery: (step, update) =>
                      previewOptions.onChoreographyRecovery?.(step.id, update),
                  }
                : {}),
              ...(previewOptions.onBranchChoice
                ? {
                    onBranchChoice: (step, ruleIndex, destination) =>
                      previewOptions.onBranchChoice?.(step.id, ruleIndex, destination),
                  }
                : {}),
              ...(previewOptions.onAdaptiveSkip
                ? {
                    onAdaptiveSkip: (step, decision) =>
                      previewOptions.onAdaptiveSkip?.(step.id, decision),
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
          // Passing the document, not just its id: the index caches the title so
          // the list never has to parse a document to print a row, and a rename
          // has to reach that cache or the list keeps showing the old name.
          rememberLocalExperience(localConfig.workspaceId, currentPageRouteKey(), nextDocument);
        },
        ...(mockPresenceRequested()
          ? {
              presence: createMockPresence(documentSessionId, () =>
                selectExperienceRootBlocks(
                  currentDocument(localConfig, options.baseDocument, documentId),
                ).map((block) => block.id),
              ),
            }
          : {}),
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
  // A reload ends the authoring session, so the panel has to come back before a
  // step means anything. Nothing is read from or written to the address bar: the
  // creator is authoring against a customer application whose routing is theirs.
  const previewResume = readDraftPreviewResume(localConfig.workspaceId);
  if (previewResume) {
    void openDocument(previewResume.documentId, {
      stepId: previewResume.stepId,
      interactive: previewResume.interactive,
    });
  }
  installLocalCreatorLauncher(options.authoringTrigger, {
    onCreateExperience: async (type, details) => {
      const document = createExperienceDraft({
        documentId: createLocalExperienceId(),
        workspaceId: localConfig.workspaceId,
        environment,
        schemaVersion: options.baseDocument.schemaVersion,
        title: details.title,
        type,
      });
      saveDocument(document);
      rememberLocalExperience(localConfig.workspaceId, currentPageRouteKey(), document);
      await openDocument(document.id);
    },
    listExperiences: (query) =>
      listLocalPageExperiences(localConfig, options.baseDocument, currentPageRouteKey(), query),
    onOpenExperience: openDocument,
  });
  return api;
}

function installLocalCreatorLauncher(
  triggerOptions: LocalAuthoringTriggerOptions | false | undefined,
  creatorActions: Pick<
    CreatorToolbarOptions,
    'listExperiences' | 'onCreateExperience' | 'onOpenExperience'
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

/**
 * The index carries what a row needs to render.
 *
 * `title` and `type` are cached here on purpose. Listing used to load every
 * document on the page and read two fields off each one, which meant parsing an
 * entire authored sequence — blocks, targets, appearance — to print its name.
 * They stay optional so an index written before this still reads.
 */
interface LocalExperienceIndexEntry {
  documentId: string;
  routeKey: string;
  title?: string;
  type?: string;
}

/**
 * One page of the list, straight from localStorage.
 *
 * The cursor is the offset into the filtered set, which is honest for an index
 * that is a single array: a keyset cursor would be pretending to a stability
 * localStorage does not have. `total` is free here for the same reason — the
 * whole set is already in hand — and it is what the collapsed second section
 * prints in its header.
 */
function listLocalPageExperiences(
  config: LocalAuthoringLoaderConfig,
  baseDocument: LodariqDocument,
  routeKey: string,
  query: CreatorPageExperienceQuery,
): CreatorPageExperiencePage {
  const summaries = localExperienceEntriesInScope(
    readLocalExperienceIndex(config.workspaceId),
    routeKey,
    query.scope,
  )
    .map((entry) => localExperienceSummary(config, baseDocument, entry))
    .filter((summary): summary is CreatorPageExperienceSummary => summary !== null);

  const needle = query.query?.trim().toLowerCase() ?? '';
  const matching = needle
    ? summaries.filter(
        (summary) =>
          summary.title.toLowerCase().includes(needle) ||
          summary.type.toLowerCase().includes(needle),
      )
    : summaries;

  const offset = Number.parseInt(query.cursor ?? '0', 10);
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const end = start + query.limit;
  return {
    items: matching.slice(start, end),
    total: matching.length,
    ...(end < matching.length ? { nextCursor: String(end) } : {}),
  };
}

/**
 * Which entries belong to which of the two lists.
 *
 * "All tours" takes nothing out for the page scope — the two lists answer
 * different questions and a tour is allowed to be in both. It still collapses
 * the index to one entry per document: a document is filed under every route
 * it was opened on, so an unfiltered index prints the same tour once per screen
 * it has ever been touched from, which is a repeat inside a single list.
 */
function localExperienceEntriesInScope(
  index: readonly LocalExperienceIndexEntry[],
  routeKey: string,
  scope: CreatorExperienceScope,
): LocalExperienceIndexEntry[] {
  if (scope === 'page') return index.filter((entry) => entry.routeKey === routeKey);
  const seen = new Set<string>();
  const everything: LocalExperienceIndexEntry[] = [];
  // The index is newest-first, so the first entry for a document is the page it
  // was last authored on — the one worth printing under its name.
  for (const entry of index) {
    if (seen.has(entry.documentId)) continue;
    seen.add(entry.documentId);
    everything.push(entry);
  }
  return everything;
}

/**
 * A row, from the index alone where possible.
 *
 * An entry written before the cache existed still has to render, so it falls
 * back to loading that one document — one, not all of them — and the next save
 * writes the cache back.
 */
function localExperienceSummary(
  config: LocalAuthoringLoaderConfig,
  baseDocument: LodariqDocument,
  entry: LocalExperienceIndexEntry,
): CreatorPageExperienceSummary | null {
  if (entry.type !== undefined && entry.title !== undefined) {
    return isCreatorEnabledExperienceType(entry.type)
      ? { id: entry.documentId, title: entry.title, type: entry.type, routeKey: entry.routeKey }
      : null;
  }
  const document = localExperienceDocument(config, baseDocument, entry.documentId);
  if (!document || !isCreatorEnabledExperienceType(document.type)) return null;
  return {
    id: document.id,
    title: document.title,
    type: document.type,
    routeKey: entry.routeKey,
  };
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

function rememberLocalExperience(
  workspaceId: string,
  routeKey: string,
  document: LodariqDocument,
): void {
  const previous = readLocalExperienceIndex(workspaceId).filter(
    (entry) => entry.documentId !== document.id || entry.routeKey !== routeKey,
  );
  const next: LocalExperienceIndexEntry[] = [
    { documentId: document.id, routeKey, title: document.title, type: document.type },
    ...previous,
  ];
  localStorage.setItem(localExperienceIndexKey(workspaceId), JSON.stringify(next));
}

/** Registers a draft created by a local operations service with a page-scoped chooser. */
export function rememberLocalExperienceForPage(
  workspaceId: string,
  routeKey: string,
  document: LodariqDocument,
): void {
  rememberLocalExperience(workspaceId, routeKey, document);
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
  if (typeof entry.documentId !== 'string' || typeof entry.routeKey !== 'string') return false;
  // The cached pair is optional but must be the right shape when present, or a
  // half-written entry renders a row titled "undefined".
  if (entry.title !== undefined && typeof entry.title !== 'string') return false;
  return entry.type === undefined || typeof entry.type === 'string';
}

function localExperienceIndexKey(workspaceId: string): string {
  return `${LOCAL_CREATOR_INDEX_PREFIX}${workspaceId}`;
}

/**
 * Which page a local draft belongs to.
 *
 * Deliberately `pathname + hash`, never `search`. Query strings carry view
 * state — filters, sort order, pagination, a selected record id — so including
 * them files a draft under a key that changes the moment the creator sorts a
 * list, and the experience disappears from a page it plainly belongs to.
 *
 * The hash is the opposite case and must be kept: hash-routed hosts put the
 * actual screen there (`/settings/#channels` vs `/settings/#users`), and
 * dropping it collapses every one of those screens into a single key.
 *
 * This mirrors the product's own page matching, which narrows on `pathname`
 * alone (`readPageEligibilityContext` in `@lodariq/schema/page-eligibility`);
 * the hash is added here because a local draft is scoped more tightly than a
 * published trigger.
 */
function currentPageRouteKey(): string {
  return `${window.location.pathname}${window.location.hash}`;
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
