// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_SESSION_CAPABILITIES,
  BROWSER_VERIFICATION_CHECK_CODES,
  RENDERER_CONTRACT_VERSION,
  type BridgeMessage,
  type BrowserVerificationReport,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductionPromotionResult,
} from '@lodariq/schema';
import {
  createDirectAuthoringHostServices,
  openLocalAuthoringPanel,
} from '@lodariq/sdk-authoring/lodariq-authoring';

const session = {
  sessionId: 'authsess_direct_release',
  documentId: 'doc_direct_release',
  workspaceId: 'wk_direct_release',
  environment: 'staging' as const,
};

const documentFixture: LodariqDocument = {
  id: session.documentId,
  workspaceId: session.workspaceId,
  type: 'tour',
  status: 'draft',
  title: 'Direct release draft',
  trigger: { type: 'manual' },
  audience: { environments: ['staging'] },
  schemaVersion: '1.0.0',
  targets: [],
  blocks: [],
};
const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;
const THEME_HASH = `sha256-${'b'.repeat(64)}`;
const SOURCE_HASH = `sha256-${'c'.repeat(64)}`;
const CREATED_AT = '2026-08-08T12:00:00.000Z';
const browserReport: Extract<BrowserVerificationReport, { status: 'passed' }> = {
  schemaVersion: '1',
  checkedAt: CREATED_AT,
  sdkVersion: '0.3.0',
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  status: 'passed',
  checks: BROWSER_VERIFICATION_CHECK_CODES.map((code) => ({
    code,
    status: 'passed' as const,
  })),
};
const styleProposal: ProductStyleProposal = {
  schemaVersion: '1',
  proposalId: 'proposal.direct',
  sources: [
    {
      sourceId: 'lodariq.fallback.accessible',
      kind: 'fallback',
      revision: '1',
      confidence: 50,
      fingerprintHash: SOURCE_HASH,
      capturedAt: CREATED_AT,
    },
  ],
  samples: [],
  tokens: {
    modes: {
      light: {
        colors: {
          surface: '#ffffff',
          text: '#111827',
          accent: '#2457ff',
          onAccent: '#ffffff',
          border: '#d1d5db',
          focus: '#2457ff',
        },
      },
    },
  },
  confidence: 50,
  requiresConfirmation: true,
  createdAt: CREATED_AT,
};
const completedPromotion: Extract<ProductionPromotionResult, { ok: true; state: 'completed' }> = {
  ok: true,
  state: 'completed',
  replayed: false,
  releaseOperationId: 'operation_direct_1',
  publicationId: 'publication_production_1',
  generation: 2,
  compiledArtifactId: 'artifact_direct_1',
  contentHash: CONTENT_HASH,
  themeVersionId: 'theme_version_1',
  themeContentHash: THEME_HASH,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
};

describe('direct authoring host services', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lodariq-authoring-panel-open');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acknowledges iframe persistence only after the host save succeeds', async () => {
    let finishSave: (() => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openDirectPanel(peer, onSave);
    const direct = createDirectServices(peer);

    let settled = false;
    const persisted = direct.services.persistDocument(structuredClone(documentFixture)).then(() => {
      settled = true;
    });
    const request = outboundMessage(peer, 'authoring.save.result');
    expect(request).toBeDefined();
    expect(JSON.stringify(request)).not.toContain('Bearer');
    expect(JSON.stringify(request)).not.toContain('authoringSessionToken');
    dispatchFromPeer(peer, request);

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    expect(outboundAck(peer, request?.correlationId)).toBeUndefined();

    finishSave?.();
    await vi.waitFor(() => expect(outboundAck(peer, request?.correlationId)).toBeDefined());
    dispatchFromPeer(peer, outboundAck(peer, request?.correlationId));
    await persisted;
    expect(settled).toBe(true);

    direct.stop();
    panel.close();
  });

  it('does not acknowledge a failed host save and rejects after the bounded timeout', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openDirectPanel(peer, onSave);
    const direct = createDirectServices(peer);

    const persisted = direct.services.persistDocument(structuredClone(documentFixture));
    const request = outboundMessage(peer, 'authoring.save.result');
    dispatchFromPeer(peer, request);
    await vi.advanceTimersByTimeAsync(0);

    expect(onSave).toHaveBeenCalledOnce();
    expect(outboundAck(peer, request?.correlationId)).toBeUndefined();
    const rejection = expect(persisted).rejects.toThrow('acknowledgement timed out');
    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;

    direct.stop();
    panel.close();
  });

  it('round-trips bounded style, verification, promotion, and approval operations', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const direct = createDirectServices(peer, true);

    const sample = direct.services.sampleProductStyle!({ scope: 'page' });
    const sampleRequest = outboundMessage(peer, 'style.sample.start');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'style_sample_result_1',
      type: 'style.sample.result',
      requestCorrelationId: sampleRequest!.correlationId,
      result: { ok: true, proposal: styleProposal },
    });
    await expect(sample).resolves.toEqual(styleProposal);

    const source = direct.services.saveStyleSource!(styleProposal);
    const sourceRequest = outboundMessage(peer, 'authoring.style-source.save.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'style_source_result_1',
      type: 'authoring.style-source.save.result',
      requestCorrelationId: sourceRequest!.correlationId,
      result: { ok: true, sourceId: 'style_source_1', sourceHash: SOURCE_HASH },
    });
    await expect(source).resolves.toEqual({
      sourceId: 'style_source_1',
      sourceHash: SOURCE_HASH,
    });

    const browserVerification = direct.services.verifyBrowserPublication!(
      'publication_staging_1',
      CONTENT_HASH,
    );
    const browserRequest = outboundMessage(peer, 'authoring.browser-verify.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'browser_verification_result_1',
      type: 'authoring.browser-verify.result',
      requestCorrelationId: browserRequest!.correlationId,
      result: { ok: true, report: browserReport },
    });
    await expect(browserVerification).resolves.toEqual(browserReport);

    const submittedVerification = direct.services.submitStagingVerification!({
      publicationId: 'publication_staging_1',
      report: browserReport,
    });
    const submissionRequest = outboundMessage(peer, 'authoring.submit-verification.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'verification_submission_result_1',
      type: 'authoring.submit-verification.result',
      requestCorrelationId: submissionRequest!.correlationId,
      result: {
        ok: true,
        verification: publicationVerification(),
      },
    });
    await expect(submittedVerification).resolves.toMatchObject({ ok: true });

    const promoted = direct.services.promoteProduction!({
      sourcePublicationId: 'publication_staging_1',
      productionEnvironmentId: 'environment_production_1',
      expectedGeneration: 1,
      idempotencyKey: 'promotion.direct_1',
      correlationId: 'promotion.correlation_1',
    });
    const promotionRequest = outboundMessage(peer, 'authoring.promote-production.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'promotion_result_1',
      type: 'authoring.promote-production.result',
      requestCorrelationId: promotionRequest!.correlationId,
      result: completedPromotion,
    });
    await expect(promoted).resolves.toEqual(completedPromotion);

    const approved = direct.services.approveProduction!('operation_direct_1', 'approved');
    const approvalRequest = outboundMessage(peer, 'authoring.approve-production.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'approval_result_1',
      type: 'authoring.approve-production.result',
      requestCorrelationId: approvalRequest!.correlationId,
      result: {
        ok: true,
        approval: {
          id: 'approval_direct_1',
          workspaceId: session.workspaceId,
          releaseOperationId: 'operation_direct_1',
          decision: 'approved',
          decidedByUserId: 'user_direct_1',
          createdAt: CREATED_AT,
        },
        promotion: completedPromotion,
      },
    });
    await expect(approved).resolves.toMatchObject({ promotion: completedPromotion });

    direct.stop();
  });

  it('settles an explicit product-style cancellation without waiting for timeout', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const direct = createDirectServices(peer, true);
    const sample = direct.services.sampleProductStyle!({ scope: 'page' });
    const request = outboundMessage(peer, 'style.sample.start');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'style_sample_canceled_1',
      type: 'style.sample.canceled',
      requestCorrelationId: request!.correlationId,
      reason: 'creator_canceled',
    });
    await expect(sample).rejects.toThrow('selection was canceled');
    direct.stop();
  });
});

function openDirectPanel(peer: Window, onSave: (document: LodariqDocument) => Promise<void>) {
  const panel = openLocalAuthoringPanel(session, {
    iframeSrc: 'https://editor.lodariq.com/authoring.html',
    initialDocument: structuredClone(documentFixture),
    onSave,
    release: {
      releaseStateCapability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
      getReleaseState: async () => ({
        available: false,
        environment: 'staging',
        environmentId: 'env_staging',
        documentId: session.documentId,
        expectedGeneration: 0,
        draftArtifactId: null,
        draftContentHash: null,
        activeContentHash: null,
        state: 'no_saved_artifact',
        findings: [],
      }),
      publishToStaging: async () => ({
        ok: false,
        code: 'not_ready',
        message: 'Not ready',
        findings: [],
      }),
      stagingPublicationCapability: AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
    },
  });
  const iframe = document.querySelector<HTMLIFrameElement>('lodariq-authoring-panel iframe');
  if (!iframe) throw new Error('iframe missing');
  Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
  iframe.dispatchEvent(new Event('load'));
  return panel;
}

function createDirectServices(peer: Window, sliceThree = false) {
  return createDirectAuthoringHostServices({
    peerWindow: peer,
    allowedOrigins: ['https://editor.lodariq.com'],
    targetOrigin: 'https://editor.lodariq.com',
    sessionId: session.sessionId,
    documentId: session.documentId,
    publishToStaging: true,
    sampleProductStyle: sliceThree,
    saveStyleSource: sliceThree,
    verifyBrowserPublication: sliceThree,
    submitStagingVerification: sliceThree,
    promoteProduction: sliceThree,
    approveProduction: sliceThree,
  });
}

function publicationVerification() {
  return {
    id: 'verification_direct_1',
    workspaceId: session.workspaceId,
    environmentId: 'environment_staging_1',
    documentId: session.documentId,
    publicationId: 'publication_staging_1',
    compiledArtifactId: 'artifact_direct_1',
    artifactSchemaVersion: '2' as const,
    contentHash: CONTENT_HASH,
    themeVersionId: 'theme_version_1',
    themeContentHash: THEME_HASH,
    verifiedOrigin: 'https://staging.customer.example',
    verifiedByUserId: 'user_direct_1',
    createdAt: CREATED_AT,
    result: 'passed' as const,
    report: browserReport,
  };
}

function outboundMessage<TType extends BridgeMessage['type']>(
  peer: Window,
  type: TType,
): Extract<BridgeMessage, { type: TType }> | undefined {
  return vi
    .mocked(peer.postMessage)
    .mock.calls.map((call) => call[0] as BridgeMessage)
    .find((message): message is Extract<BridgeMessage, { type: TType }> => message.type === type);
}

function outboundAck(peer: Window, correlationId?: string): BridgeMessage | undefined {
  if (!correlationId) return undefined;
  return vi
    .mocked(peer.postMessage)
    .mock.calls.map((call) => call[0] as BridgeMessage)
    .find((message) => message.type === 'ack' && message.ackOf === correlationId);
}

function dispatchFromPeer(peer: Window, message: BridgeMessage | undefined): void {
  if (!message) throw new Error('bridge message missing');
  window.dispatchEvent(
    new MessageEvent('message', {
      data: message,
      origin: 'https://editor.lodariq.com',
      source: peer,
    }),
  );
}
