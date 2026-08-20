import { ControllerOperationsFeature } from './controller-operations';
import { authoringText } from '../../i18n';
import { AUTHORING_THEME_PREVIEW_APPLY_TYPE, BRIDGE_PROTOCOL_VERSION } from '@lodariq/schema';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type {
  AuthoringBrandMatchApplyResult,
  AuthoringBrandMatchProposal,
  AuthoringBrandMatchRequest,
} from '../local-frame-types';
import { exactArtifactPromotionRequest, firstTargetIdInBlock } from './controller-model';

export abstract class ControllerBrandFeature extends ControllerOperationsFeature {
  protected async matchProductBrandAsync(
    requestedStrategy: AuthoringBrandMatchRequest['strategy'],
  ): Promise<void> {
    const sampleBrandStyle = this.services.sampleBrandStyle;
    if (!sampleBrandStyle) {
      this.panelWorkflowError = authoringText(
        'Product matching is available from an authenticated development or staging session.',
      );
      this.emit();
      return;
    }

    const selectedStep = this.selectedTourStep();
    const targetId = selectedStep ? firstTargetIdInBlock(selectedStep) : null;
    const strategy =
      requestedStrategy === 'current-target' && !targetId ? 'select-element' : requestedStrategy;
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'sampling-brand';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice =
      strategy === 'select-element'
        ? authoringText('Choose one representative product element.')
        : authoringText('Matching the current step placement.');
    this.emit();

    try {
      const proposal = await sampleBrandStyle({
        documentId: this.documentState.id,
        ...(targetId ? { targetId } : {}),
        strategy,
      });
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowNotice = null;
      this.brandProposal = structuredClone(proposal);
      if (!proposal.requiresConfirmation && this.services.applyBrandMatch) {
        await this.applyBrandMatchProposal(proposal, requestVersion);
        return;
      }
      this.panelMode = 'brand-match-review';
      this.panelReturnMode = 'appearance';
      this.panelFocusToken += 1;
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowNotice = null;
      this.panelWorkflowError = authoringText(
        'This product style could not be sampled. Choose another representative element.',
      );
      this.emit();
    }
  }

  protected async applyBrandMatchProposal(
    proposal: AuthoringBrandMatchProposal,
    activeRequestVersion?: number,
    automatic = false,
  ): Promise<void> {
    const applyBrandMatch = this.services.applyBrandMatch;
    if (!applyBrandMatch) {
      if (!automatic) {
        this.panelWorkflowError = authoringText('This session cannot save Brand proposals.');
        this.emit();
      }
      return;
    }
    const requestVersion = activeRequestVersion ?? ++this.panelWorkflowRequestVersion;
    if (!automatic) {
      this.panelOperation = 'applying-brand';
      this.panelWorkflowError = null;
      this.emit();
    }
    try {
      const result = await applyBrandMatch(structuredClone(proposal));
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      if (result.persisted.draftRevision < this.highestAdoptedBrandDraftRevision) {
        if (!automatic) {
          this.panelOperation = null;
          this.panelWorkflowError = authoringText(
            'A newer Brand draft is already active. Run Product match again to review the latest draft.',
          );
          this.emit();
        }
        return;
      }
      const adopted = this.services.adoptBrandPreviewTheme?.(structuredClone(result.persisted));
      if (adopted === false) {
        if (!automatic) {
          this.panelOperation = null;
          this.panelWorkflowError = authoringText(
            'The saved Brand draft conflicts with the active preview. Run Product match again.',
          );
          this.emit();
        }
        return;
      }
      this.highestAdoptedBrandDraftRevision = Math.max(
        this.highestAdoptedBrandDraftRevision,
        result.persisted.draftRevision,
      );
      try {
        await this.sendBrandPreviewTheme(result.persisted);
      } catch {
        if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
        if (!automatic) {
          this.panelOperation = null;
          this.panelWorkflowError = authoringText(
            'Product match was saved, but the preview could not refresh. Try again.',
          );
          this.emit();
        }
        return;
      }
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.brandWorkflow = structuredClone(result.brand);
      this.brandProposal = null;
      this.panelOperation = null;
      if (!automatic) {
        this.panelMode = 'appearance';
        this.panelReturnMode = 'edit';
        this.panelWorkflowNotice =
          result.savedAs === 'unchanged'
            ? authoringText('The current Brand theme already matches this product evidence.')
            : authoringText('Product match saved as a workspace draft for approval.');
        this.panelFocusToken += 1;
      }
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      if (!automatic) {
        this.panelOperation = null;
        this.panelWorkflowError = authoringText('The Brand proposal could not be saved.');
        this.emit();
      }
    }
  }

  protected sendBrandPreviewTheme(
    result: AuthoringBrandMatchApplyResult['persisted'],
  ): Promise<void> {
    this.previewTheme = structuredClone(result.previewTheme);
    this.emit();
    if (!this.isHostedInParent) return Promise.resolve();
    return this.bridge.sendWithAck(
      {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: this.sessionId,
        documentId: this.documentState.id,
        correlationId: createBridgeCorrelationId('authoring_theme_preview_apply'),
        type: AUTHORING_THEME_PREVIEW_APPLY_TYPE,
        draftRevision: result.draftRevision,
        previewTheme: structuredClone(result.previewTheme),
      },
      { timeoutMs: 2_000 },
    );
  }

  protected async verifyCurrentStagingArtifactAsync(): Promise<void> {
    const staging = this.releaseWorkflow?.staging;
    const verifyStagingRelease = this.services.verifyStagingRelease;
    this.panelReturnFocus = 'release';
    this.openPanelMode('release-verification', 'edit');
    if (!staging || !verifyStagingRelease) {
      this.panelWorkflowError = staging
        ? authoringText('Exact staging verification is not available in this session.')
        : authoringText('Publish this draft to staging before verification.');
      this.emit();
      return;
    }

    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'verifying-release';
    this.panelWorkflowError = null;
    this.releaseWorkflow = {
      ...this.releaseWorkflow!,
      staging: {
        ...staging,
        verification: { ...staging.verification, state: 'running', checks: [] },
      },
    };
    this.emit();
    try {
      const result = await verifyStagingRelease({
        ...(staging.publicationId ? { publicationId: staging.publicationId } : {}),
        artifactId: staging.artifactId,
        contentHash: staging.contentHash,
      });
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow?.staging) {
        return;
      }
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        staging: {
          ...this.releaseWorkflow.staging,
          verification: structuredClone(result.verification),
        },
      };
      this.panelOperation = null;
      this.panelWorkflowNotice =
        result.verification.state === 'passed'
          ? authoringText('The exact staged artifact is verified.')
          : authoringText('Verification found issues that need attention.');
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow?.staging) {
        return;
      }
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        staging: {
          ...this.releaseWorkflow.staging,
          verification: {
            ...this.releaseWorkflow.staging.verification,
            state: 'failed',
          },
        },
      };
      this.panelOperation = null;
      this.panelWorkflowError = authoringText('The exact staged artifact could not be verified.');
      this.emit();
    }
  }

  protected async promoteCurrentStagingArtifactAsync(): Promise<void> {
    const workflow = this.releaseWorkflow;
    const staging = workflow?.staging;
    const promoteExactArtifact = this.services.promoteExactArtifact;
    if (!workflow || !staging || staging.verification.state !== 'passed') {
      this.panelWorkflowError = authoringText('Verify the exact staged artifact before promotion.');
      this.emit();
      return;
    }
    if (!promoteExactArtifact) {
      this.panelWorkflowError = authoringText(
        'Production promotion is not available in this session.',
      );
      this.emit();
      return;
    }

    const request = exactArtifactPromotionRequest(workflow);
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'promoting-release';
    this.panelWorkflowError = null;
    this.emit();
    try {
      const result = await promoteExactArtifact(request);
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow) return;
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        production: structuredClone(result.production),
        approval: 'approved',
      };
      this.panelOperation = null;
      this.panelMode = 'release-verification';
      this.panelReturnMode = 'edit';
      this.panelWorkflowNotice = result.replayed
        ? authoringText('Production already points to this exact artifact.')
        : authoringText('This exact staged artifact is live in production.');
      this.panelFocusToken += 1;
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowError = authoringText('The exact staged artifact could not be promoted.');
      this.emit();
    }
  }

  protected async requestPromotionApprovalAsync(): Promise<void> {
    const workflow = this.releaseWorkflow;
    const requestPromotionApproval = this.services.requestPromotionApproval;
    if (!workflow?.staging || workflow.approval !== 'required' || !requestPromotionApproval) {
      this.panelWorkflowError = authoringText(
        'Promotion approval cannot be requested in this session.',
      );
      this.emit();
      return;
    }
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'requesting-approval';
    this.panelWorkflowError = null;
    this.emit();
    try {
      const result = await requestPromotionApproval(exactArtifactPromotionRequest(workflow));
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow) return;
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        approval: result.approval,
        approvalOperationId: result.operationId,
      };
      this.panelOperation = null;
      this.panelWorkflowNotice =
        result.approval === 'approved'
          ? authoringText('Production approval is ready.')
          : authoringText('Promotion approval was requested.');
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowError = authoringText('Promotion approval could not be requested.');
      this.emit();
    }
  }

  protected async approveAndPromoteProductionAsync(): Promise<void> {
    const workflow = this.releaseWorkflow;
    const staging = workflow?.staging;
    const approveAndPromote = this.services.approveAndPromoteExactArtifact;
    const operationId = workflow?.approvalOperationId;
    const canApprove = Boolean(
      workflow?.approval === 'requested' && workflow.canApprove && operationId,
    );
    if (
      !workflow ||
      !staging ||
      staging.verification.state !== 'passed' ||
      !canApprove ||
      !operationId
    ) {
      this.panelWorkflowError = authoringText(
        'This production approval is not ready for your action.',
      );
      this.emit();
      return;
    }
    if (!approveAndPromote) {
      this.panelWorkflowError = authoringText(
        'Production approval is not available in this session.',
      );
      this.emit();
      return;
    }
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'approving-release';
    this.panelWorkflowError = null;
    this.emit();
    try {
      const request = {
        ...exactArtifactPromotionRequest(workflow),
        operationId,
      };
      const result = await approveAndPromote(request);
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow) return;
      if (
        result.production.artifactId !== request.artifactId ||
        result.production.contentHash !== request.contentHash
      ) {
        throw new Error('Approved production artifact does not match staging');
      }
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        production: structuredClone(result.production),
        approval: 'approved',
      };
      this.panelOperation = null;
      this.panelMode = 'release-verification';
      this.panelReturnMode = 'edit';
      this.panelWorkflowNotice = result.replayed
        ? authoringText('This approval was already applied to the exact production artifact.')
        : authoringText('Approved. This exact staged artifact is live in production.');
      this.panelFocusToken += 1;
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowError = authoringText(
        'The exact staged artifact could not be approved and promoted.',
      );
      this.emit();
    }
  }
}
