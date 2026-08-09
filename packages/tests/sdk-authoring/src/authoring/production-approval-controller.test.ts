// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import type {
  AuthoringReleaseWorkflowState,
  LocalAuthoringFrameServices,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-types';

describe('explicit production approval controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('approves and promotes only the requested exact artifact', async () => {
    const approveAndPromoteExactArtifact = vi
      .fn<NonNullable<LocalAuthoringFrameServices['approveAndPromoteExactArtifact']>>()
      .mockResolvedValue({
        production: {
          publicationId: 'publication_production_2',
          environmentId: 'environment_production',
          generation: 2,
          artifactId: 'artifact_staging_7',
          contentHash: contentHash('7'),
        },
        replayed: false,
      });
    const controller = createController({ approveAndPromoteExactArtifact });
    controller.start();
    await vi.waitFor(() => {
      expect(controller.getSnapshot().panelWorkflow.release?.approval).toBe('requested');
    });

    controller.openPromotionConfirmation();
    controller.approveAndPromoteProduction();

    expect(controller.getSnapshot().panelWorkflow.operation).toBe('approving-release');
    await vi.waitFor(() => expect(approveAndPromoteExactArtifact).toHaveBeenCalledTimes(1));
    expect(approveAndPromoteExactArtifact).toHaveBeenCalledWith({
      operationId: 'operation_promotion_7',
      sourcePublicationId: 'publication_staging_7',
      productionEnvironmentId: 'environment_production',
      expectedGeneration: 1,
      expectedProductionArtifactId: 'artifact_production_1',
      artifactId: 'artifact_staging_7',
      contentHash: contentHash('7'),
    });
    await vi.waitFor(() => {
      const snapshot = controller.getSnapshot();
      expect(snapshot.panelWorkflow.operation).toBeNull();
      expect(snapshot.panelWorkflow.release).toMatchObject({
        approval: 'approved',
        production: {
          artifactId: 'artifact_staging_7',
          contentHash: contentHash('7'),
        },
      });
      expect(snapshot.panelWorkflow.notice).toContain('live in production');
      expect(snapshot.panelWorkflow.mode).toBe('release-verification');
    });

    controller.destroy();
  });

  it('does not invoke approval without approver capability', async () => {
    const approveAndPromoteExactArtifact = vi
      .fn<NonNullable<LocalAuthoringFrameServices['approveAndPromoteExactArtifact']>>()
      .mockRejectedValue(new Error('must not run'));
    const workflow = releaseWorkflow();
    const controller = createController({
      approveAndPromoteExactArtifact,
      workflow: { ...workflow, canApprove: false },
    });
    controller.start();
    await vi.waitFor(() => {
      expect(controller.getSnapshot().panelWorkflow.release?.approval).toBe('requested');
    });

    controller.approveAndPromoteProduction();

    expect(approveAndPromoteExactArtifact).not.toHaveBeenCalled();
    expect(controller.getSnapshot().panelWorkflow.error).toContain('not ready');
    controller.destroy();
  });

  it('records a requested operation without auto-approving it', async () => {
    const approveAndPromoteExactArtifact = vi
      .fn<NonNullable<LocalAuthoringFrameServices['approveAndPromoteExactArtifact']>>()
      .mockRejectedValue(new Error('must not run'));
    const requestPromotionApproval = vi
      .fn<NonNullable<LocalAuthoringFrameServices['requestPromotionApproval']>>()
      .mockResolvedValue({
        approval: 'requested',
        operationId: 'operation_promotion_7',
      });
    const workflow = releaseWorkflow();
    workflow.approval = 'required';
    delete workflow.approvalOperationId;
    const controller = createController({
      approveAndPromoteExactArtifact,
      requestPromotionApproval,
      workflow,
    });
    controller.start();
    await vi.waitFor(() => {
      expect(controller.getSnapshot().panelWorkflow.release?.approval).toBe('required');
    });

    controller.requestPromotionApproval();

    await vi.waitFor(() => expect(requestPromotionApproval).toHaveBeenCalledTimes(1));
    expect(approveAndPromoteExactArtifact).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(controller.getSnapshot().panelWorkflow.release).toMatchObject({
        approval: 'requested',
        approvalOperationId: 'operation_promotion_7',
      });
    });
    controller.destroy();
  });
});

function createController({
  approveAndPromoteExactArtifact,
  requestPromotionApproval,
  workflow = releaseWorkflow(),
}: {
  approveAndPromoteExactArtifact: NonNullable<
    LocalAuthoringFrameServices['approveAndPromoteExactArtifact']
  >;
  requestPromotionApproval?: NonNullable<LocalAuthoringFrameServices['requestPromotionApproval']>;
  workflow?: AuthoringReleaseWorkflowState;
}): LocalAuthoringFrameController {
  const document = authoringDocument();
  const root = documentElement();
  return new LocalAuthoringFrameController({
    root,
    baseDocument: structuredClone(document),
    services: {
      loadDocument: () => structuredClone(document),
      saveDocument: vi.fn(),
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn(),
      getReleaseWorkflowState: vi.fn(async () => structuredClone(workflow)),
      ...(requestPromotionApproval ? { requestPromotionApproval } : {}),
      approveAndPromoteExactArtifact,
      recordMetric: vi.fn(),
      getMetricsSummary: vi.fn(() => ({})),
      exportMetricsReport: vi.fn(() => '{}'),
    },
    frameMode: 'panel',
    sessionId: 'session_production_approval',
    peerWindow: { postMessage: vi.fn() } as unknown as Window,
    allowedOrigins: [window.location.origin],
    targetOrigin: window.location.origin,
  });
}

function releaseWorkflow(): AuthoringReleaseWorkflowState {
  return {
    draft: { version: 7, contentHash: contentHash('7'), dirty: false },
    staging: {
      version: 7,
      publicationId: 'publication_staging_7',
      environmentId: 'environment_staging',
      generation: 4,
      artifactId: 'artifact_staging_7',
      contentHash: contentHash('7'),
      verification: { state: 'passed', checks: [] },
    },
    production: {
      version: 1,
      publicationId: 'publication_production_1',
      environmentId: 'environment_production',
      generation: 1,
      artifactId: 'artifact_production_1',
      contentHash: contentHash('1'),
    },
    canVerify: true,
    canPromote: true,
    canApprove: true,
    approvalOperationId: 'operation_promotion_7',
    approval: 'requested',
  };
}

function authoringDocument(): LodariqDocument {
  return {
    id: 'document_production_approval',
    workspaceId: 'workspace_production_approval',
    type: 'tour',
    status: 'draft',
    title: 'Production approval',
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [],
  };
}

function documentElement(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

function contentHash(digit: string): string {
  return `sha256-${digit.repeat(64)}`;
}
