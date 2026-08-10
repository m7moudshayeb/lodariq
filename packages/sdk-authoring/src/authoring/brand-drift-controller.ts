import type {
  AuthoringBrandDriftCheckResult,
  AuthoringBrandThemeAcknowledgementRequest,
  AuthoringBrandThemeAcknowledgementResult,
  BrandDocumentThemeReviewState,
  BrandDriftCheckRequest,
  BrandDriftTrigger,
  ProductStyleProposal,
} from '@lodariq/schema';
import {
  createAuthoringBrandDriftViewModel,
  type AuthoringBrandDriftViewModel,
  withAuthoringBrandDriftRuntimePreview,
} from './brand-drift-model';

export interface AuthoringBrandDriftControllerServices {
  sampleProductStyle: () => Promise<ProductStyleProposal>;
  checkProductStyle: (request: BrandDriftCheckRequest) => Promise<AuthoringBrandDriftCheckResult>;
  acknowledgeThemeVersion?: (
    request: Omit<AuthoringBrandThemeAcknowledgementRequest, 'document'>,
  ) => Promise<AuthoringBrandThemeAcknowledgementResult>;
  previewRuntime?: (mode: 'current' | 'proposed' | 'restore') => Promise<void>;
}

export interface AuthoringBrandDriftControllerSnapshot {
  operation: 'idle' | 'checking' | 'acknowledging' | 'previewing';
  error: string | null;
  previewActive: boolean;
  previewMode: 'current' | 'proposed';
  model: AuthoringBrandDriftViewModel;
}

/**
 * Small authoring-only state machine. Detection and review never call the
 * existing Product Match adoption boundary; the parent invokes that boundary
 * only after the creator explicitly chooses the proposal.
 */
export class AuthoringBrandDriftController {
  private requestVersion = 0;
  private result: AuthoringBrandDriftCheckResult | null = null;
  private reviewState: BrandDocumentThemeReviewState | null = null;
  private operation: AuthoringBrandDriftControllerSnapshot['operation'] = 'idle';
  private previewActive = false;
  private previewMode: AuthoringBrandDriftControllerSnapshot['previewMode'] = 'current';
  private error: string | null = null;

  constructor(
    private readonly services: AuthoringBrandDriftControllerServices,
    private readonly onChange: (snapshot: AuthoringBrandDriftControllerSnapshot) => void,
  ) {}

  initialize(): void {
    void this.check('authoring_open');
  }

  checkExplicitly(): void {
    void this.check('creator_check');
  }

  reviewProposal(): ProductStyleProposal | null {
    if (this.result?.drift.classification !== 'actionable') return null;
    this.restorePreview();
    return structuredClone(this.result.drift.proposal);
  }

  preview(mode: 'current' | 'proposed'): void {
    const previewRuntime = this.services.previewRuntime;
    if (!previewRuntime || !this.result?.runtimePreview || this.operation !== 'idle') return;
    const requestVersion = ++this.requestVersion;
    this.operation = 'previewing';
    this.error = null;
    this.emit();
    void previewRuntime(mode)
      .then(() => {
        if (!this.isCurrent(requestVersion)) return;
        this.previewActive = true;
        this.previewMode = mode;
        this.operation = 'idle';
        this.emit();
      })
      .catch(() => {
        if (!this.isCurrent(requestVersion)) return;
        this.previewActive = false;
        this.previewMode = 'current';
        this.operation = 'idle';
        this.error = 'The runtime preview could not load. The previous Brand preview was restored.';
        this.emit();
      });
  }

  restorePreview(): void {
    if (!this.previewActive && this.operation !== 'previewing') return;
    this.requestVersion += 1;
    this.previewActive = false;
    this.previewMode = 'current';
    if (this.operation === 'previewing') this.operation = 'idle';
    void this.services.previewRuntime?.('restore').catch(() => {});
    this.emit();
  }

  acknowledge(): void {
    void this.acknowledgeAsync();
  }

  dispose(): void {
    this.restorePreview();
    this.requestVersion += 1;
  }

  snapshot(): AuthoringBrandDriftControllerSnapshot {
    const model = createAuthoringBrandDriftViewModel(this.result?.drift ?? null, this.reviewState);
    return {
      operation: this.operation,
      error: this.error,
      previewActive: this.previewActive,
      previewMode: this.previewMode,
      model: withAuthoringBrandDriftRuntimePreview(model, this.result?.runtimePreview),
    };
  }

  private async acknowledgeAsync(): Promise<void> {
    const acknowledgeThemeVersion = this.services.acknowledgeThemeVersion;
    const result = this.result;
    const reviewState = this.reviewState;
    if (
      !acknowledgeThemeVersion ||
      !result ||
      reviewState?.policy !== 'workspace-current' ||
      reviewState.reviewState !== 'needs_review'
    ) {
      return;
    }
    const shouldRestorePreview = this.previewActive || this.operation === 'previewing';
    const requestVersion = ++this.requestVersion;
    this.operation = 'acknowledging';
    this.error = null;
    this.previewActive = false;
    this.previewMode = 'current';
    this.emit();
    try {
      if (shouldRestorePreview) {
        const previewRuntime = this.services.previewRuntime;
        if (!previewRuntime) throw new Error('Brand drift runtime preview is unavailable');
        await previewRuntime('restore');
        if (!this.isCurrent(requestVersion)) return;
      }
      const acknowledgement = await acknowledgeThemeVersion({
        reviewedThemeVersionId: reviewState.approvedThemeVersionId,
        expectedAcknowledgedThemeVersionId: reviewState.acknowledgedThemeVersionId,
        expectedDocumentUpdatedAt: result.documentUpdatedAt,
      });
      if (!this.isCurrent(requestVersion)) return;
      this.reviewState = structuredClone(acknowledgement.documentThemeReview);
      if (this.result) {
        this.result = {
          ...this.result,
          documentThemeReview: structuredClone(acknowledgement.documentThemeReview),
          documentUpdatedAt: acknowledgement.documentUpdatedAt,
          runtimePreview: undefined,
        };
      }
      this.operation = 'idle';
      this.emit();
    } catch {
      if (!this.isCurrent(requestVersion)) return;
      this.operation = 'idle';
      this.error = 'The approved Brand version could not be acknowledged.';
      this.emit();
    }
  }

  private async check(trigger: BrandDriftTrigger): Promise<void> {
    const shouldRestorePreview = this.previewActive || this.operation === 'previewing';
    const requestVersion = ++this.requestVersion;
    this.operation = 'checking';
    this.error = null;
    this.previewActive = false;
    this.previewMode = 'current';
    this.emit();
    try {
      if (shouldRestorePreview) {
        const previewRuntime = this.services.previewRuntime;
        if (!previewRuntime) throw new Error('Brand drift runtime preview is unavailable');
        await previewRuntime('restore');
        if (!this.isCurrent(requestVersion)) return;
      }
      const proposal = await this.services.sampleProductStyle();
      if (!this.isCurrent(requestVersion)) return;
      const result = await this.services.checkProductStyle({ trigger, proposal });
      if (!this.isCurrent(requestVersion)) return;
      this.result = structuredClone(result);
      this.reviewState = structuredClone(result.documentThemeReview);
      this.previewActive = false;
      this.previewMode = 'current';
      this.operation = 'idle';
      this.emit();
    } catch {
      if (!this.isCurrent(requestVersion)) return;
      this.operation = 'idle';
      this.error = 'Brand evidence could not be checked. The current Brand theme was not changed.';
      this.emit();
    }
  }

  private isCurrent(requestVersion: number): boolean {
    return requestVersion === this.requestVersion;
  }

  private emit(): void {
    this.onChange(this.snapshot());
  }
}
