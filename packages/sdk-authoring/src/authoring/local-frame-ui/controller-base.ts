import {
  CURRENT_AUTHORING_DELIVERY_CAPABILITY_METADATA,
  type BridgeMessage,
  type AuthoringSaveState,
  type PreviewPatchOperation,
  type PreviewTransactionMetadata,
  type LodariqDocument,
  type TargetLocale,
  type TargetViewportClass,
  type TourStepStyleSnapshot,
  type AuthoringMediaAssetResource,
} from '@lodariq/schema';
import type { AuthoringDeliveryCapability, BrandThemeSnapshot } from '@lodariq/schema';
import { authoringText } from '../../i18n';
import { type BlockInsertPosition } from '../document-ops';
import { LOCAL_AUTHORING_SESSION_ID } from '../constants';
import { AuthoringBridge } from '../../bridge/transport';
import { createLodariqEditor } from '../../editor/create-editor';
import type {
  AuthoringOperationsTab,
  AuthoringOperationsViewState,
  AuthoringPanelMode,
  AuthoringPanelOperation,
  AuthoringReleaseViewState,
  CardCommandRequest,
  TargetInspectRequest,
  FocusRequest,
  LocalAuthoringFrameSnapshot,
  TargetInspectionState,
} from './types';
import type {
  AuthoringBrandMatchProposal,
  AuthoringReleaseWorkflowState,
  AuthoringStagingPublicationRequest,
  LocalAuthoringFrameOptions,
} from '../local-frame-types';
import type {
  AuthoringBrandDriftController,
  AuthoringBrandDriftControllerSnapshot,
} from '../brand-drift-controller';
import { createAuthoringBrandDriftViewModel } from '../brand-drift-model';
import {
  type AuthoringReleaseRecoveryIntent,
  type AuthoringReleaseRecoveryRequestIdentity,
  type AuthoringReleaseRecoveryViewModel,
} from '../release-recovery-model';
import {
  createAuthoringInteractionActor,
  selectedBlockIdOf,
  type AuthoringInteractionActor,
} from '../state/interaction-machine';
import { accessibleFallbackBrandState, initialReleaseView } from './controller-model';
import { resolveDocumentLocalization } from '@lodariq/schema';
import { DocumentTransactionCoordinator } from '../document-transaction-coordinator';
import { AuthoringTargetHealthLedger, authoringTargetIdentityKey } from '../target-health-ledger';
import { AuthoringStepStyleRecipeLibrary } from '../step-style-recipes';
import { AuthoringDraftCheckpointStore } from '../draft-checkpoints';

export abstract class ControllerBase {
  protected syncStepLockForSelection(_blockId: string | null): void {
    // Operations overrides this when the authenticated collaboration boundary exists.
  }

  protected releaseStepLockLease(): void {
    // Operations overrides this when the authenticated collaboration boundary exists.
  }

  protected startCollaborationTransport(): void {
    // Operations overrides this when collaboration transport is available.
  }

  protected stopCollaborationTransport(): void {
    // Operations overrides this when collaboration transport is available.
  }

  protected syncCollaborationPresence(): void {
    // Operations overrides this when collaboration transport is available.
  }

  protected readonly interactionActor: AuthoringInteractionActor =
    createAuthoringInteractionActor();

  protected readonly services: LocalAuthoringFrameOptions['services'];

  protected readonly deliveryCapabilities: ReadonlySet<AuthoringDeliveryCapability>;

  protected previewTheme: LocalAuthoringFrameOptions['previewTheme'];
  /**
   * The theme the workspace holds, when it differs from the one this frame
   * rendered (§6.3). Null while they agree, so silence means current.
   */
  protected workspaceThemeSnapshot: BrandThemeSnapshot | null = null;

  protected previewPreferences: LocalAuthoringFrameOptions['previewPreferences'];

  protected readonly sessionId: string;

  protected readonly lexicalEditor = createLodariqEditor();

  protected readonly baseDocument: LodariqDocument;

  protected readonly metricsSessionId: string;

  protected readonly peerWindow: Window;

  protected readonly isHostedInParent: boolean;

  protected readonly bridge: AuthoringBridge;

  protected readonly subscribers = new Set<(snapshot: LocalAuthoringFrameSnapshot) => void>();

  protected readonly canceledTargetBlockIds = new Set<string>();

  protected readonly targetDiagnostics = new Map<string, TargetInspectionState>();

  protected readonly targetHealthLedger = new AuthoringTargetHealthLedger();

  protected readonly activeTargetInspectionRequestIds = new Map<string, string>();

  protected readonly advancedTargetIds = new Set<string>();

  protected readonly undoStack: LodariqDocument[] = [];

  protected readonly redoStack: LodariqDocument[] = [];

  protected readonly selectedStepIds = new Set<string>();

  protected stepSelectionAnchorId: string | null = null;

  protected stepStyleClipboard: TourStepStyleSnapshot | null = null;

  protected readonly stepStyleRecipes: AuthoringStepStyleRecipeLibrary;

  /** Session memory of which saved style each step wore — see the snapshot field. */
  protected readonly stepStyleRecipeByStep = new Map<string, string>();

  protected readonly draftCheckpoints: AuthoringDraftCheckpointStore;

  protected mediaAssets: AuthoringMediaAssetResource[];

  protected readonly mediaAssetPreviewUrls = new Map<string, string>();

  protected readonly mediaAssetPreviewRequests = new Map<string, Promise<string | null>>();

  protected releaseMediaAssetPreviews(): void {
    if (typeof URL.revokeObjectURL === 'function') {
      for (const url of this.mediaAssetPreviewUrls.values()) URL.revokeObjectURL(url);
    }
    this.mediaAssetPreviewUrls.clear();
    this.mediaAssetPreviewRequests.clear();
  }

  protected readonly pendingPreviewPatches: Array<{
    blockId: string;
    locale?: string;
    transaction?: PreviewTransactionMetadata;
    ops: PreviewPatchOperation[];
  }> = [];

  protected readonly documentTransactions: DocumentTransactionCoordinator;

  protected documentState: LodariqDocument;

  protected contentLocale: string;

  protected translationState: LocalAuthoringFrameSnapshot['translation']['state'] = 'idle';

  protected translationRequestVersion = 0;

  protected snapshotValue: LocalAuthoringFrameSnapshot;

  protected slashText = '';

  protected slashOpen = false;

  protected status = '';

  protected jsonText = '';

  protected compiledText = '';

  protected metricsText = '{}';

  protected advancedEditorStepId: string | null = null;

  protected hostPageRoute: string | undefined;

  protected hostRoutePatternId: string | undefined;

  protected hostStateId: string | undefined;

  protected hostPageLocale: TargetLocale | undefined;

  protected hostViewportClass: TargetViewportClass | undefined;

  protected draggingBlockId: string | null = null;

  protected draggingStepBlockId: string | null = null;

  protected dragTargetBlockId: string | null = null;

  protected dragTargetPosition: BlockInsertPosition | null = null;

  protected pendingTargetBlockId: string | null = null;

  protected activeTargetCaptureCorrelationId: string | null = null;

  protected pendingPresentationAnchorPick: {
    blockId: string;
    targetId: string;
    requestCorrelationId: string;
  } | null = null;

  protected previewPatchFlushQueued = false;

  protected previewPatchFlushToken = 0;

  protected focusRequest: FocusRequest | null = null;

  protected focusToken = 0;

  protected cardCommandRequest: CardCommandRequest | null = null;

  protected cardCommandToken = 0;

  protected targetInspectRequest: TargetInspectRequest | null = null;

  protected targetInspectToken = 0;

  protected release: AuthoringReleaseViewState;

  protected saveState: { state: AuthoringSaveState; label: string } = {
    state: 'saved',
    label: authoringText('Draft saved'),
  };

  protected releaseRequestVersion = 0;

  protected documentChangeSequence = 0;

  protected pendingPublicationRequest: AuthoringStagingPublicationRequest | null = null;

  protected panelMode: AuthoringPanelMode = 'edit';

  protected operationsTab: AuthoringOperationsTab = 'flow';

  protected readonly operationsViews = new Map<
    AuthoringOperationsTab,
    AuthoringOperationsViewState
  >();

  protected panelReturnMode: AuthoringPanelMode = 'edit';

  protected panelFocusToken = 0;

  protected panelReturnFocus: 'appearance' | 'release' | null = null;

  protected panelFocusTarget: string | null = null;

  protected panelOperation: AuthoringPanelOperation = null;

  protected brandWorkflow = accessibleFallbackBrandState();

  protected brandProposal: AuthoringBrandMatchProposal | null = null;

  protected readonly brandDriftController: AuthoringBrandDriftController | null;

  protected brandDrift: AuthoringBrandDriftControllerSnapshot = {
    operation: 'idle',
    error: null,
    previewActive: false,
    previewMode: 'current',
    model: createAuthoringBrandDriftViewModel(null, null),
  };

  protected releaseWorkflow: AuthoringReleaseWorkflowState | null = null;

  protected releaseRecoveryEnvironmentId: string | null = null;

  protected releaseRecoveryEntryFocusTarget: string | null = null;

  protected releaseRecoveryModel: AuthoringReleaseRecoveryViewModel | null = null;

  protected releaseRecoveryIntent: AuthoringReleaseRecoveryIntent | null = null;

  protected releaseRecoveryRequestIdentity: AuthoringReleaseRecoveryRequestIdentity | null = null;

  protected releaseRecoveryRequestVersion = 0;

  protected panelWorkflowRequestVersion = 0;

  protected highestAdoptedBrandDraftRevision = 0;

  protected panelWorkflowError: string | null = null;

  protected panelWorkflowNotice: string | null = null;

  protected automaticTargetStyleMatchAttempted = false;

  protected started = false;

  protected get selectedBlockId(): string | null {
    return selectedBlockIdOf(this.interactionActor);
  }

  protected set selectedBlockId(blockId: string | null) {
    this.interactionActor.send(
      blockId ? { type: 'SELECT_BLOCK', blockId } : { type: 'CLEAR_SELECTION' },
    );
  }

  constructor(protected readonly options: LocalAuthoringFrameOptions) {
    this.interactionActor.start();
    this.services = options.services;
    this.deliveryCapabilities = new Set(
      options.deliveryCapabilities?.capabilities ??
        CURRENT_AUTHORING_DELIVERY_CAPABILITY_METADATA.capabilities,
    );
    this.stepStyleRecipes = new AuthoringStepStyleRecipeLibrary(
      this.services.loadStepStyleRecipes?.() ?? [],
    );
    this.draftCheckpoints = new AuthoringDraftCheckpointStore(
      this.services.loadDraftCheckpoints?.() ?? [],
    );
    this.mediaAssets = [...(this.services.loadMediaAssets?.() ?? [])].map((asset) =>
      structuredClone(asset),
    );
    this.previewTheme = options.previewTheme ? structuredClone(options.previewTheme) : undefined;
    this.previewPreferences = options.previewPreferences
      ? { ...options.previewPreferences }
      : undefined;
    this.release = initialReleaseView(
      this.hasReleaseServices(),
      this.services.releaseUnavailableReason,
    );
    this.sessionId = options.sessionId ?? LOCAL_AUTHORING_SESSION_ID;
    this.baseDocument = this.normalizeDocument(structuredClone(options.baseDocument));
    this.documentState = this.normalizeDocument(
      this.services.loadDocument(this.baseDocument.id) ?? this.createBaseDocument(),
    );
    this.documentTransactions = new DocumentTransactionCoordinator(this.documentState);
    for (const target of this.documentState.targets) {
      this.targetHealthLedger.registerTarget(
        target.id,
        authoringTargetIdentityKey(target.identity ?? target.fingerprint),
      );
    }
    this.contentLocale = resolveDocumentLocalization(this.documentState).defaultLocale;
    this.brandDriftController = this.createBrandDriftController();
    this.metricsSessionId = `${this.sessionId}:${options.now?.() ?? Date.now()}`;
    this.peerWindow = options.peerWindow ?? window.parent;
    this.isHostedInParent = this.peerWindow !== window;
    this.bridge = new AuthoringBridge(this.peerWindow, {
      allowedOrigins: options.allowedOrigins ?? [window.location.origin],
      targetOrigin: options.targetOrigin ?? window.location.origin,
      expectedSessionId: this.sessionId,
      expectedDocumentId: () => this.documentState.id,
      onMessage: (message) => this.handleBridgeMessage(message),
    });
    this.jsonText = this.services.exportDocument(this.documentState);
    this.status = `Editing ${this.documentState.title}`;
    this.renderMetrics();
    this.snapshotValue = this.makeSnapshot();
  }

  protected abstract createBaseDocument(): LodariqDocument;
  protected abstract createBrandDriftController(): AuthoringBrandDriftController | null;
  protected abstract handleBridgeMessage(message: BridgeMessage): Promise<void> | void;
  protected abstract hasReleaseServices(): boolean;
  protected abstract makeSnapshot(): LocalAuthoringFrameSnapshot;
  protected abstract normalizeDocument(doc: LodariqDocument): LodariqDocument;
  protected abstract renderMetrics(): void;
  /** Asks the host to resolve the selected step's target, so §4.4's state is real. */
  protected abstract verifyActiveTarget(): void;
}
