import { describe, expect, it } from 'vitest';
import {
  AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE,
  AUTHORING_RELEASE_RECOVERY_RESULT_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringInitMessage,
  AuthoringReleaseRecoveryRequestMessage,
  AuthoringReleaseRecoveryResultMessage,
  AuthoringReleaseRecoveryStateRequestMessage,
  AuthoringReleaseRecoveryStateResultMessage,
  AuthoringSessionCapability,
  BRAND_THEME_CONTRACT_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  RENDERER_CONTRACT_VERSION,
  SdkAuthoringReleaseDescriptor,
  validate,
  type BridgeMessage as BridgeMessageValue,
} from '../../../schema/src/index';

const ENVELOPE = {
  protocol: BRIDGE_PROTOCOL_VERSION,
  sessionId: 'authoring_session_recovery_1',
  documentId: 'document_recovery_1',
  correlationId: 'recovery.correlation_1',
} as const;

const ENVIRONMENT_ID = 'environment_production_1';
const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;
const THEME_HASH = `sha256-${'b'.repeat(64)}`;
const COMPLETED_AT = '2026-08-09T12:00:00.000Z';

const artifact = {
  compiledArtifactId: 'artifact_recovery_1',
  artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  contentHash: CONTENT_HASH,
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
  themeVersionId: 'theme_version_recovery_1',
  themeContentHash: THEME_HASH,
} as const;

const rollbackRequest = {
  action: 'rollback',
  targetPublicationId: 'publication_prior_1',
  reason: 'Restore the last verified publication',
  expectedGeneration: 4,
  expectedActivePublicationId: 'publication_current_4',
  idempotencyKey: 'rollback.request_1',
  correlationId: 'rollback.correlation_1',
} as const;

describe('release recovery authoring bridge contracts', () => {
  it('adds exact rollback and unpublish capabilities and optional SDK descriptors', () => {
    expect(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE).toBe('document:rollback');
    expect(AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE).toBe('document:unpublish');
    expect(
      validate(AuthoringSessionCapability, AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE).valid,
    ).toBe(true);
    expect(
      validate(AuthoringSessionCapability, AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE).valid,
    ).toBe(true);

    const url =
      'https://api.lodariq.io/v1/sdk/authoring/environments/:environmentId/release-recovery';
    const descriptor = {
      releaseState: {
        capability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
        url: 'https://api.lodariq.io/v1/sdk/authoring/release-state',
      },
      recoveryState: {
        capability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
        url,
      },
      rollback: { capability: AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE, url },
      unpublish: { capability: AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE, url },
    } as const;

    expect(validate(SdkAuthoringReleaseDescriptor, descriptor).valid).toBe(true);
    expect(
      validate(SdkAuthoringReleaseDescriptor, {
        ...descriptor,
        rollback: { ...descriptor.rollback, capability: 'document:unpublish' },
      }).valid,
    ).toBe(false);
    expect(validate(SdkAuthoringReleaseDescriptor, { ...descriptor, bearer: 'secret' }).valid).toBe(
      false,
    );
  });

  it('keeps protocol v1 and the existing authoring.init byte shape recovery-free', () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe('1');
    expect(Object.keys(AuthoringInitMessage.properties).sort()).toEqual(
      [
        'brandDriftCheckCapability',
        'brandThemeAcknowledgementCapability',
        'correlationId',
        'document',
        'documentId',
        'environment',
        'productStyleSamplingCapability',
        'productionApprovalCapability',
        'productionPromotionCapability',
        'protocol',
        'releaseStateCapability',
        'sessionId',
        'stagingPublicationCapability',
        'stagingVerificationCapability',
        'theme',
        'type',
        'workspaceId',
      ].sort(),
    );

    const legacyInit = {
      ...ENVELOPE,
      type: 'authoring.init',
      workspaceId: 'workspace_recovery_1',
      environment: 'staging',
      document: {
        id: ENVELOPE.documentId,
        workspaceId: 'workspace_recovery_1',
        type: 'tour',
        status: 'draft',
        title: 'Recovery compatibility',
        trigger: { type: 'manual' },
        audience: { environments: ['staging'] },
        schemaVersion: '1.0.0',
        targets: [],
        blocks: [],
      },
      releaseStateCapability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
    } as const;

    expect(validate(AuthoringInitMessage, legacyInit).valid).toBe(true);
    expect(validate(BridgeMessage, legacyInit).valid).toBe(true);
    expect(
      validate(AuthoringInitMessage, {
        ...legacyInit,
        rollbackCapability: AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
      }).valid,
    ).toBe(false);
  });

  it('reads exact recovery state with closed, credential-free messages', () => {
    const request = {
      ...ENVELOPE,
      type: AUTHORING_RELEASE_RECOVERY_STATE_REQUEST_TYPE,
      environmentId: ENVIRONMENT_ID,
    } satisfies BridgeMessageValue;
    expect(validate(AuthoringReleaseRecoveryStateRequestMessage, request).valid).toBe(true);
    expect(validate(BridgeMessage, request).valid).toBe(true);

    for (const extra of [
      { bearer: 'secret' },
      { url: 'https://api.lodariq.io/private' },
      { compilerInput: { document: 'raw' } },
      { artifact: { bytes: 'raw' } },
    ]) {
      expect(validate(BridgeMessage, { ...request, ...extra }).valid).toBe(false);
    }

    const result = {
      ...ENVELOPE,
      correlationId: 'recovery.state.result_1',
      type: AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
      requestCorrelationId: request.correlationId,
      result: {
        ok: true,
        state: {
          workspaceId: 'workspace_recovery_1',
          environmentId: ENVIRONMENT_ID,
          documentId: ENVELOPE.documentId,
          permissions: { rollback: true, unpublish: true },
          deployment: null,
          history: [],
          rollbackTargetPublicationIds: [],
        },
      },
    } satisfies BridgeMessageValue;
    expect(validate(AuthoringReleaseRecoveryStateResultMessage, result).valid).toBe(true);
    expect(validate(BridgeMessage, result).valid).toBe(true);
    expect(
      validate(BridgeMessage, {
        ...result,
        result: { ...result.result, url: 'https://api.lodariq.io/private' },
      }).valid,
    ).toBe(false);
  });

  it('mutates only through canonical recovery requests and canonical results', () => {
    const request = {
      ...ENVELOPE,
      type: AUTHORING_RELEASE_RECOVERY_REQUEST_TYPE,
      environmentId: ENVIRONMENT_ID,
      request: rollbackRequest,
    } satisfies BridgeMessageValue;
    expect(validate(AuthoringReleaseRecoveryRequestMessage, request).valid).toBe(true);
    expect(validate(BridgeMessage, request).valid).toBe(true);

    for (const extra of [
      { bearer: 'secret' },
      { url: 'https://api.lodariq.io/private' },
      { compiledArtifactId: artifact.compiledArtifactId },
      { compilerInput: { document: 'raw' } },
      { artifact },
    ]) {
      expect(
        validate(BridgeMessage, { ...request, request: { ...rollbackRequest, ...extra } }).valid,
      ).toBe(false);
    }

    const result = {
      ...ENVELOPE,
      correlationId: 'recovery.result_1',
      type: AUTHORING_RELEASE_RECOVERY_RESULT_TYPE,
      requestCorrelationId: request.correlationId,
      result: {
        ok: true,
        action: 'rollback',
        state: 'active',
        replayed: false,
        releaseOperationId: 'release_rollback_5',
        publicationId: 'publication_rollback_5',
        targetPublicationId: rollbackRequest.targetPublicationId,
        previousPublicationId: rollbackRequest.expectedActivePublicationId,
        generation: 5,
        artifact,
        completedAt: COMPLETED_AT,
      },
    } satisfies BridgeMessageValue;
    expect(validate(AuthoringReleaseRecoveryResultMessage, result).valid).toBe(true);
    expect(validate(BridgeMessage, result).valid).toBe(true);

    const failure = {
      ...result,
      correlationId: 'recovery.result_failed_1',
      result: {
        ok: false,
        action: 'rollback',
        state: 'failed',
        replayed: false,
        code: 'deployment_changed',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.deployment_changed,
        expectedGeneration: 4,
        actualGeneration: 5,
        expectedActivePublicationId: 'publication_current_4',
        actualActivePublicationId: 'publication_new_5',
      },
    } satisfies BridgeMessageValue;
    expect(validate(AuthoringReleaseRecoveryResultMessage, failure).valid).toBe(true);
    expect(validate(BridgeMessage, failure).valid).toBe(true);
    expect(validate(BridgeMessage, { ...result, bearer: 'secret' }).valid).toBe(false);
    expect(
      validate(BridgeMessage, {
        ...result,
        result: { ...result.result, compilerInput: { document: 'raw' } },
      }).valid,
    ).toBe(false);
  });
});
