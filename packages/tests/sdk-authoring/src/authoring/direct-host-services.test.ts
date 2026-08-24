// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_SESSION_CAPABILITIES,
  BROWSER_VERIFICATION_CHECK_CODES,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  RENDERER_CONTRACT_VERSION,
  type AuthoringProductMatchApplyResult,
  type BridgeMessage,
  type BrowserVerificationReport,
  type LodariqDocument,
  type LocaleLayoutQaReport,
  type ProductStyleProposal,
  type ProductionPromotionResult,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryStateResponse,
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
const localeLayoutReport: LocaleLayoutQaReport = {
  schemaVersion: '1',
  documentRevision: 3,
  contentHash: CONTENT_HASH,
  checkedAt: CREATED_AT,
  viewport: { width: 390, height: 844 },
  checkedLocaleCount: 2,
  checkedStepCount: 1,
  checkedPresentationCount: 2,
  passedCount: 2,
  failedCount: 0,
  unavailableCount: 0,
  findingLimitReached: false,
  findings: [],
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
const productMatchResult = {
  proposalId: styleProposal.proposalId,
  draftRevision: 2,
  draftUpdatedAt: CREATED_AT,
  previewTheme: {
    ...structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
    themeVersionId: 'themev_draft_direct_2',
    version: 2,
    contentHash: THEME_HASH,
  },
  sources: [{ sourceId: 'style_source_1', sourceHash: SOURCE_HASH }],
  draftChanged: true,
  replayed: false,
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
      result: {
        ok: true,
        sourceId: 'style_source_1',
        sourceHash: SOURCE_HASH,
        productMatch: productMatchResult,
      },
    });
    const savedSource = await source;
    const consumeLegacyReceipt = (value: { sourceId: string; sourceHash: string }) => ({
      sourceId: value.sourceId,
      sourceHash: value.sourceHash,
    });
    const consumeProductMatch = (value: AuthoringProductMatchApplyResult) => ({
      draftRevision: value.draftRevision,
      previewThemeId: value.previewTheme.themeId,
    });
    expect(consumeLegacyReceipt(savedSource)).toEqual({
      sourceId: 'style_source_1',
      sourceHash: SOURCE_HASH,
    });
    expect(consumeProductMatch(savedSource)).toEqual({
      draftRevision: productMatchResult.draftRevision,
      previewThemeId: productMatchResult.previewTheme.themeId,
    });
    expect(savedSource).toEqual({
      ...productMatchResult,
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

    const localeLayoutQa = direct.services.runLocaleLayoutQa!(3);
    const localeLayoutRequest = outboundMessage(peer, 'authoring.locale-layout-qa.request');
    expect(localeLayoutRequest).toMatchObject({ expectedDocumentRevision: 3 });
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'locale_layout_result_1',
      type: 'authoring.locale-layout-qa.result',
      requestCorrelationId: localeLayoutRequest!.correlationId,
      result: { ok: true, report: localeLayoutReport },
    });
    await expect(localeLayoutQa).resolves.toEqual(localeLayoutReport);

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

  it('publishes the legacy receipt and current Product Match result in one success message', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(session, {
      iframeSrc: 'https://editor.lodariq.io/authoring.html',
      initialDocument: structuredClone(documentFixture),
      onSave: async () => {},
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
        productStyleSamplingCapability: AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
        saveStyleSource: async () => ({
          ...structuredClone(productMatchResult),
          sourceId: 'style_source_1',
          sourceHash: SOURCE_HASH,
        }),
      },
    });
    const iframe = document.querySelector<HTMLIFrameElement>('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'style_source_request_compatibility_1',
      type: 'authoring.style-source.save.request',
      proposal: styleProposal,
    });

    await vi.waitFor(() =>
      expect(outboundMessage(peer, 'authoring.style-source.save.result')).toBeDefined(),
    );
    const message = outboundMessage(peer, 'authoring.style-source.save.result');
    expect(message).toMatchObject({
      requestCorrelationId: 'style_source_request_compatibility_1',
      result: {
        ok: true,
        sourceId: 'style_source_1',
        sourceHash: SOURCE_HASH,
        productMatch: productMatchResult,
      },
    });
    if (message?.result.ok) {
      expect(message.result.productMatch).toEqual(productMatchResult);
      expect(message.result.productMatch).not.toHaveProperty('sourceId');
      expect(message.result.productMatch).not.toHaveProperty('sourceHash');
    }

    panel.close();
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

  it('round-trips the complete 500-entry recovery state and typed mutation result', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const environmentId = 'environment_production_recovery';
    const state = largeRecoveryState(environmentId);
    const getReleaseRecoveryState = vi.fn(async () => structuredClone(state));
    const recoverRelease = vi.fn(
      async (_selectedEnvironmentId, request: ReleaseRecoveryRequest) => ({
        ok: false as const,
        action: request.action,
        state: 'failed' as const,
        replayed: false,
        code: 'deployment_changed' as const,
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.deployment_changed,
        expectedGeneration: request.expectedGeneration,
        actualGeneration: request.expectedGeneration + 1,
        expectedActivePublicationId: request.expectedActivePublicationId,
        actualActivePublicationId: 'publication_changed_6',
      }),
    );
    const panel = openLocalAuthoringPanel(session, {
      iframeSrc: 'https://editor.lodariq.io/authoring.html',
      initialDocument: structuredClone(documentFixture),
      onSave: async () => {},
      release: {
        releaseStateCapability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
        getReleaseState: async () => unreleasedState(),
        releaseRecoveryStateCapability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
        getReleaseRecoveryState,
        rollbackReleaseCapability: AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
        unpublishReleaseCapability: AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
        recoverRelease,
      },
    });
    attachPanelPeer(peer);
    const direct = createDirectServices(peer, false, true);

    const pendingState = direct.services.getReleaseRecoveryState!(environmentId);
    const stateRequest = outboundMessage(peer, 'authoring.release-recovery-state.request');
    dispatchFromPeer(peer, stateRequest);
    await vi.waitFor(() =>
      expect(outboundMessage(peer, 'authoring.release-recovery-state.result')).toBeDefined(),
    );
    const stateResult = outboundMessage(peer, 'authoring.release-recovery-state.result');
    expect(new TextEncoder().encode(JSON.stringify(stateResult)).byteLength).toBeGreaterThan(
      64 * 1024,
    );
    expect(new TextEncoder().encode(JSON.stringify(stateResult)).byteLength).toBeLessThanOrEqual(
      4 * 1024 * 1024,
    );
    dispatchFromPeer(peer, stateResult);
    await expect(pendingState).resolves.toEqual(state);
    expect(getReleaseRecoveryState).toHaveBeenCalledWith(environmentId);

    const request: ReleaseRecoveryRequest = {
      action: 'unpublish',
      reason: 'Pause delivery while the production incident is reviewed',
      expectedGeneration: 5,
      expectedActivePublicationId: 'publication_active_5',
      idempotencyKey: 'recovery.unpublish.direct_1',
      correlationId: 'recovery.correlation.direct_1',
    };
    const pendingRecovery = direct.services.recoverRelease!(environmentId, request);
    const recoveryRequest = outboundMessage(peer, 'authoring.release-recovery.request');
    dispatchFromPeer(peer, recoveryRequest);
    await vi.waitFor(() =>
      expect(outboundMessage(peer, 'authoring.release-recovery.result')).toBeDefined(),
    );
    const recoveryResult = outboundMessage(peer, 'authoring.release-recovery.result');
    dispatchFromPeer(peer, recoveryResult);
    await expect(pendingRecovery).resolves.toMatchObject({
      ok: false,
      action: 'unpublish',
      code: 'deployment_changed',
    });
    expect(recoverRelease).toHaveBeenCalledWith(environmentId, request);

    direct.stop();
    panel.close();
  });

  it('rejects recovery scope/action mismatches and settles missing actions without sending', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const direct = createDirectServices(peer, false, true);
    const pendingState = direct.services.getReleaseRecoveryState!('environment_production');
    const stateRequest = outboundMessage(peer, 'authoring.release-recovery-state.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'recovery_scope_mismatch_result',
      type: 'authoring.release-recovery-state.result',
      requestCorrelationId: stateRequest!.correlationId,
      result: { ok: true, state: largeRecoveryState('environment_other', 0) },
    });
    await expect(pendingState).rejects.toThrow('scope mismatch');

    const pendingRecovery = direct.services.recoverRelease!('environment_production', {
      action: 'rollback',
      targetPublicationId: 'publication_prior_3',
      reason: 'Restore the prior verified publication',
      expectedGeneration: 5,
      expectedActivePublicationId: 'publication_active_5',
      idempotencyKey: 'recovery.rollback.mismatch_1',
      correlationId: 'recovery.correlation.mismatch_1',
    });
    const recoveryRequest = outboundMessage(peer, 'authoring.release-recovery.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'recovery_action_mismatch_result',
      type: 'authoring.release-recovery.result',
      requestCorrelationId: recoveryRequest!.correlationId,
      result: {
        ok: false,
        action: 'unpublish',
        state: 'failed',
        replayed: false,
        code: 'capability_denied',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.capability_denied,
      },
    });
    await expect(pendingRecovery).rejects.toThrow('action mismatch');

    direct.stop();
    const readOnly = createDirectAuthoringHostServices({
      peerWindow: peer,
      allowedOrigins: ['https://editor.lodariq.io'],
      targetOrigin: 'https://editor.lodariq.io',
      sessionId: session.sessionId,
      workspaceId: session.workspaceId,
      documentId: session.documentId,
      publishToStaging: false,
      readReleaseRecovery: true,
      rollbackRelease: true,
      unpublishRelease: false,
    });
    const postCount = vi.mocked(peer.postMessage).mock.calls.length;
    await expect(
      readOnly.services.recoverRelease!('environment_production', {
        action: 'unpublish',
        reason: 'Pause delivery during investigation',
        expectedGeneration: 5,
        expectedActivePublicationId: 'publication_active_5',
        idempotencyKey: 'recovery.unpublish.denied_1',
        correlationId: 'recovery.correlation.denied_1',
      }),
    ).resolves.toMatchObject({ code: 'capability_denied', action: 'unpublish' });
    expect(peer.postMessage).toHaveBeenCalledTimes(postCount);
    readOnly.stop();
  });

  it('keeps legacy save and release-state requests working after an optional recovery timeout', async () => {
    vi.useFakeTimers();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const onSave = vi.fn(async () => undefined);
    const panel = openDirectPanel(peer, onSave);
    const direct = createDirectServices(peer, false, true);
    expect(outboundMessage(peer, 'authoring.release-recovery-state.request')).toBeUndefined();

    const pendingRecoveryState = direct.services.getReleaseRecoveryState!('environment_production');
    const recoveryRejection = expect(pendingRecoveryState).rejects.toThrow('timed out');
    expect(outboundMessage(peer, 'authoring.release-recovery-state.request')).toBeDefined();

    const persisted = direct.services.persistDocument(structuredClone(documentFixture));
    const saveResult = outboundMessage(peer, 'authoring.save.result');
    dispatchFromPeer(peer, saveResult);
    await vi.advanceTimersByTimeAsync(0);
    const ack = outboundAck(peer, saveResult?.correlationId);
    expect(ack).toBeDefined();
    dispatchFromPeer(peer, ack);
    await persisted;
    expect(onSave).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5_000);
    await recoveryRejection;
    const pendingReleaseState = direct.services.getReleaseState();
    const releaseStateRequest = outboundMessage(peer, 'authoring.release-state.request');
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'legacy_release_state_result_after_recovery_timeout',
      type: 'authoring.release-state.result',
      requestCorrelationId: releaseStateRequest!.correlationId,
      result: { ok: true, releaseState: unreleasedState() },
    });
    await expect(pendingReleaseState).resolves.toMatchObject({ state: 'no_saved_artifact' });

    direct.stop();
    panel.close();
  });

  it('returns typed capability denial immediately when the new host has no recovery services', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openDirectPanel(peer, async () => undefined);
    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'unsupported_recovery_state_request',
      type: 'authoring.release-recovery-state.request',
      environmentId: 'environment_production',
    });
    await vi.waitFor(() =>
      expect(outboundMessage(peer, 'authoring.release-recovery-state.result')).toMatchObject({
        requestCorrelationId: 'unsupported_recovery_state_request',
        result: { ok: false, code: 'capability_denied' },
      }),
    );

    dispatchFromPeer(peer, {
      protocol: '1',
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: 'unsupported_recovery_mutation_request',
      type: 'authoring.release-recovery.request',
      environmentId: 'environment_production',
      request: {
        action: 'unpublish',
        reason: 'Pause delivery during incident review',
        expectedGeneration: 5,
        expectedActivePublicationId: 'publication_active_5',
        idempotencyKey: 'unsupported.unpublish.request_1',
        correlationId: 'unsupported.unpublish.correlation_1',
      },
    });
    await vi.waitFor(() =>
      expect(outboundMessage(peer, 'authoring.release-recovery.result')).toMatchObject({
        requestCorrelationId: 'unsupported_recovery_mutation_request',
        result: { ok: false, action: 'unpublish', code: 'capability_denied' },
      }),
    );
    panel.close();
  });
});

function openDirectPanel(peer: Window, onSave: (document: LodariqDocument) => Promise<void>) {
  const panel = openLocalAuthoringPanel(session, {
    iframeSrc: 'https://editor.lodariq.io/authoring.html',
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

function createDirectServices(peer: Window, sliceThree = false, recovery = false) {
  return createDirectAuthoringHostServices({
    peerWindow: peer,
    allowedOrigins: ['https://editor.lodariq.io'],
    targetOrigin: 'https://editor.lodariq.io',
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    documentId: session.documentId,
    publishToStaging: true,
    sampleProductStyle: sliceThree,
    saveStyleSource: sliceThree,
    verifyBrowserPublication: sliceThree,
    localeLayoutQa: sliceThree,
    submitStagingVerification: sliceThree,
    promoteProduction: sliceThree,
    approveProduction: sliceThree,
    readReleaseRecovery: recovery,
    rollbackRelease: recovery,
    unpublishRelease: recovery,
  });
}

function attachPanelPeer(peer: Window): void {
  const iframe = document.querySelector<HTMLIFrameElement>('lodariq-authoring-panel iframe');
  if (!iframe) throw new Error('iframe missing');
  Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
  iframe.dispatchEvent(new Event('load'));
}

function unreleasedState() {
  return {
    available: false,
    environment: 'staging' as const,
    environmentId: 'environment_staging',
    documentId: session.documentId,
    expectedGeneration: 0,
    draftArtifactId: null,
    draftContentHash: null,
    activeContentHash: null,
    state: 'no_saved_artifact' as const,
    findings: [],
  };
}

function largeRecoveryState(
  environmentId: string,
  historySize = 500,
): ReleaseRecoveryStateResponse {
  return {
    workspaceId: session.workspaceId,
    environmentId,
    documentId: session.documentId,
    permissions: { rollback: true, unpublish: true },
    deployment: {
      workspaceId: session.workspaceId,
      environmentId,
      documentId: session.documentId,
      state: 'active',
      generation: 5,
      activePublicationId: 'publication_active_5',
      updatedAt: CREATED_AT,
    },
    history: Array.from({ length: historySize }, (_, index) => ({
      id: paddedRecoveryIdentifier('history', index, 240),
      workspaceId: session.workspaceId,
      environmentId,
      documentId: session.documentId,
      releaseOperationId: paddedRecoveryIdentifier('operation', index, 240),
      idempotencyKey: paddedRecoveryIdentifier('idempotency', index, 190),
      correlationId: paddedRecoveryIdentifier('correlation', index, 246),
      actorUserId: paddedRecoveryIdentifier('actor', index, 240),
      occurredAt: CREATED_AT,
      action: 'rollback' as const,
      state: 'failed' as const,
      targetPublicationId: paddedRecoveryIdentifier('target', index, 240),
      reason: `Recovery attempt ${index} ${'r'.repeat(470)}`.slice(0, 500),
      expectedGeneration: 5,
      actualGeneration: 6,
      expectedActivePublicationId: 'publication_active_5',
      actualActivePublicationId: 'publication_changed_6',
      failure: {
        code: 'deployment_changed' as const,
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.deployment_changed,
      },
    })),
    rollbackTargetPublicationIds: [],
  };
}

function paddedRecoveryIdentifier(prefix: string, index: number, length: number): string {
  return `${prefix}_${index}_`.padEnd(length, 'x');
}

function publicationVerification() {
  return {
    id: 'verification_direct_1',
    workspaceId: session.workspaceId,
    environmentId: 'environment_staging_1',
    documentId: session.documentId,
    publicationId: 'publication_staging_1',
    compiledArtifactId: 'artifact_direct_1',
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
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
      origin: 'https://editor.lodariq.io',
      source: peer,
    }),
  );
}
