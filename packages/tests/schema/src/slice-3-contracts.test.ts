import { describe, expect, it } from 'vitest';
import {
  AUTHORING_SESSION_CAPABILITIES,
  AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
  AuthoringStyleSourceSaveResultMessage,
  AuthoringStagingReleaseState,
  BROWSER_VERIFICATION_CHECK_CODES,
  BRAND_TOKENS_AVAILABLE_TYPE,
  BridgeMessage,
  BrowserVerificationReport,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  CustomerBrandTokenRegistration,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  ProductStyleProposal,
  ProductionPromotionRequest,
  ProductionPromotionResult,
  PublicationVerification,
  RENDERER_CONTRACT_VERSION,
  ReleaseApproval,
  STYLE_SAMPLE_START_TYPE,
  validate,
} from '@lodariq/schema';

const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;
const THEME_HASH = `sha256-${'b'.repeat(64)}`;
const SAMPLE_HASH = `sha256-${'c'.repeat(64)}`;
const CHECKED_AT = '2026-08-08T12:00:00.000Z';

describe('Slice 3 closed contracts', () => {
  it('accepts the documented nested customer-token API and rejects CSS-shaped input', () => {
    const registration = {
      schemaVersion: '1',
      sourceId: 'customer-design-system',
      revision: 'token-build-id',
      modes: {
        light: {
          colors: { accent: '#2457ff', onAccent: '#ffffff' },
          typography: { fontFamilies: ['Customer Sans', 'system-ui'] },
        },
      },
    };

    expect(validate(CustomerBrandTokenRegistration, registration).valid).toBe(true);
    expect(
      validate(CustomerBrandTokenRegistration, {
        ...registration,
        css: '.tooltip { position: fixed }',
      }).valid,
    ).toBe(false);
    expect(
      validate(CustomerBrandTokenRegistration, {
        ...registration,
        modes: {
          light: {
            ...registration.modes.light,
            typography: { fontFamilies: ['url(https://customer.example/font.woff2)'] },
          },
        },
      }).valid,
    ).toBe(false);
  });

  it('keeps sampled proposals bounded, semantic, and free of captured DOM fields', () => {
    const proposal = {
      schemaVersion: '1',
      proposalId: 'proposal.1',
      sources: [
        {
          sourceId: 'lodariq.inferred.selected',
          kind: 'selected_element',
          confidence: 88,
          fingerprintHash: SAMPLE_HASH,
          capturedAt: CHECKED_AT,
        },
      ],
      samples: [
        {
          sampleId: 'sample.selected.1',
          sourceId: 'lodariq.inferred.selected',
          kind: 'selected_element',
          confidence: 88,
          values: {
            color: '#ffffff',
            backgroundColor: '#2457ff',
            radiusPx: 12,
          },
        },
      ],
      tokens: { modes: { light: { colors: { accent: '#2457ff' } } } },
      confidence: 88,
      requiresConfirmation: true,
      createdAt: CHECKED_AT,
    };

    expect(validate(ProductStyleProposal, proposal).valid).toBe(true);
    expect(
      validate(ProductStyleProposal, {
        ...proposal,
        samples: [
          {
            ...proposal.samples[0],
            selector: '#checkout',
            html: '<button>Buy</button>',
            coordinates: { x: 12, y: 20 },
          },
        ],
      }).valid,
    ).toBe(false);
  });

  it('keeps client verification identity-free and server evidence artifact-bound', () => {
    const checks = BROWSER_VERIFICATION_CHECK_CODES.map((code) => ({
      code,
      status: code === 'font_fallback' ? ('warning' as const) : ('passed' as const),
    }));
    const report = {
      schemaVersion: '1',
      checkedAt: CHECKED_AT,
      sdkVersion: '0.0.0',
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      status: 'warning',
      checks,
    };
    expect(validate(BrowserVerificationReport, report).valid).toBe(true);
    expect(
      validate(BrowserVerificationReport, {
        ...report,
        rendererContractVersion: '3',
      }).valid,
    ).toBe(true);
    expect(
      validate(BrowserVerificationReport, {
        ...report,
        status: 'passed',
        checks: [{ code: 'artifact_integrity', status: 'passed' }],
      }).valid,
    ).toBe(false);
    expect(
      validate(BrowserVerificationReport, {
        ...report,
        status: 'passed',
      }).valid,
    ).toBe(false);
    expect(
      validate(BrowserVerificationReport, {
        ...report,
        verifiedOrigin: 'https://customer.example',
        publicationId: 'pub_1',
      }).valid,
    ).toBe(false);

    const verification = {
      id: 'verify_1',
      workspaceId: 'wk_1',
      environmentId: 'env_staging',
      documentId: 'doc_1',
      publicationId: 'pub_staging_1',
      compiledArtifactId: 'artifact_1',
      artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
      contentHash: CONTENT_HASH,
      themeVersionId: 'themev_1',
      themeContentHash: THEME_HASH,
      verifiedOrigin: 'https://staging.customer.example',
      verifiedByUserId: 'user_1',
      createdAt: CHECKED_AT,
      result: 'passed',
      report,
    };
    expect(validate(PublicationVerification, verification).valid).toBe(true);
    expect(
      validate(PublicationVerification, {
        ...verification,
        result: 'failed',
      }).valid,
    ).toBe(false);
  });

  it('promotes by source publication and returns exact immutable pins', () => {
    const request = {
      sourcePublicationId: 'pub_staging_1',
      productionEnvironmentId: 'env_production',
      expectedGeneration: 3,
      idempotencyKey: 'promote.request_1',
      correlationId: 'promote.correlation_1',
    };
    expect(validate(ProductionPromotionRequest, request).valid).toBe(true);
    expect(
      validate(ProductionPromotionRequest, {
        ...request,
        compiledArtifactId: 'client_selected_artifact',
        contentHash: CONTENT_HASH,
      }).valid,
    ).toBe(false);

    expect(
      validate(ProductionPromotionResult, {
        ok: true,
        state: 'completed',
        replayed: false,
        releaseOperationId: 'release_1',
        publicationId: 'pub_production_1',
        generation: 4,
        compiledArtifactId: 'artifact_1',
        contentHash: CONTENT_HASH,
        themeVersionId: 'themev_1',
        themeContentHash: THEME_HASH,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }).valid,
    ).toBe(true);
    expect(
      validate(ReleaseApproval, {
        id: 'approval_1',
        workspaceId: 'wk_1',
        releaseOperationId: 'release_1',
        decision: 'approved',
        decidedByUserId: 'user_2',
        createdAt: CHECKED_AT,
      }).valid,
    ).toBe(true);
  });

  it('adds exact pipeline truth without breaking the Slice 2 release shape', () => {
    const releaseState = {
      available: true,
      environment: 'staging',
      environmentId: 'env_staging',
      documentId: 'doc_1',
      expectedGeneration: 3,
      draftArtifactId: 'artifact_1',
      draftContentHash: CONTENT_HASH,
      activeContentHash: CONTENT_HASH,
      state: 'current',
      findings: [],
      pipeline: {
        state: 'verified',
        nextAction: 'promote_production',
        staging: {
          environmentId: 'env_staging',
          generation: 3,
          publicationId: 'pub_staging_1',
          sourcePublicationId: 'pub_staging_1',
          compiledArtifactId: 'artifact_1',
          contentHash: CONTENT_HASH,
          verification: {
            state: 'passed',
            verificationId: 'verify_1',
            verifiedAt: CHECKED_AT,
          },
        },
        production: {
          environmentId: 'env_production',
          generation: 2,
          publicationId: null,
          compiledArtifactId: null,
          contentHash: null,
        },
        approvals: {
          operationId: null,
          requiredCount: 0,
          approvedCount: 0,
          rejected: false,
        },
      },
    };
    expect(validate(AuthoringStagingReleaseState, releaseState).valid).toBe(true);
    const legacyState: Record<string, unknown> = { ...releaseState };
    delete legacyState.pipeline;
    expect(validate(AuthoringStagingReleaseState, legacyState).valid).toBe(true);
  });

  it('keeps style-sampling bridge messages semantic and capability-scoped', () => {
    const envelope = {
      protocol: '1',
      sessionId: 'session_1',
      documentId: 'doc_1',
      correlationId: 'sample_1',
    } as const;
    expect(
      validate(BridgeMessage, {
        ...envelope,
        type: STYLE_SAMPLE_START_TYPE,
        request: { scope: 'selected-target', targetId: 'target_1' },
      }).valid,
    ).toBe(true);
    expect(
      validate(BridgeMessage, {
        ...envelope,
        type: STYLE_SAMPLE_START_TYPE,
        request: { scope: 'page', selector: 'body' },
      }).valid,
    ).toBe(false);
    expect(
      validate(BridgeMessage, {
        ...envelope,
        type: BRAND_TOKENS_AVAILABLE_TYPE,
        registrations: [],
      }).valid,
    ).toBe(true);
    expect(AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE).toBe('brand:sample-product-style');
  });

  it('keeps the bridge-v1 style-source receipt alongside the persisted Product Match result', () => {
    const productMatch = {
      proposalId: 'proposal.bridge-compatibility',
      draftRevision: 2,
      draftUpdatedAt: CHECKED_AT,
      previewTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      sources: [{ sourceId: 'style_source_1', sourceHash: SAMPLE_HASH }],
      draftChanged: true,
      replayed: false,
    };
    const message = {
      protocol: '1',
      sessionId: 'session_1',
      documentId: 'doc_1',
      correlationId: 'style_source_result_1',
      type: AUTHORING_STYLE_SOURCE_SAVE_RESULT_TYPE,
      requestCorrelationId: 'style_source_request_1',
      result: {
        ok: true,
        sourceId: 'style_source_1',
        sourceHash: SAMPLE_HASH,
        productMatch,
      },
    } as const;

    expect(validate(AuthoringStyleSourceSaveResultMessage, message).valid).toBe(true);
    expect(validate(BridgeMessage, message).valid).toBe(true);
    expect(
      validate(AuthoringStyleSourceSaveResultMessage, {
        ...message,
        result: { ok: true, productMatch },
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringStyleSourceSaveResultMessage, {
        ...message,
        result: { ok: true, sourceId: 'style_source_1', sourceHash: SAMPLE_HASH },
      }).valid,
    ).toBe(false);
  });
});
