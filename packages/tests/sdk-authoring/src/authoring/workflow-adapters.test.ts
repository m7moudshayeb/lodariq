import { describe, expect, it } from 'vitest';
import {
  BROWSER_VERIFICATION_CHECK_CODES,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type AuthoringStagingReleaseState,
  type BrowserVerificationReport,
  type ProductStyleProposal,
  type PublicationVerification,
} from '@lodariq/schema';
import {
  brandMatchProposalForFrame,
  brandWorkspaceStateFromTheme,
  releaseWorkflowFromState,
  verificationForFrame,
} from '@lodariq/sdk-authoring';

const CHECKED_AT = '2026-08-08T12:00:00.000Z';
const STAGING_HASH = `sha256-${'a'.repeat(64)}`;
const PRODUCTION_HASH = `sha256-${'b'.repeat(64)}`;

describe('Slice 3 authoring workflow adapters', () => {
  it('keeps product-style provenance and confirmation confidence visible in the frame model', () => {
    const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
    const registered = productStyleProposal({
      kind: 'registered_tokens',
      confidence: 100,
      requiresConfirmation: false,
      revision: 'design-system-42',
    });

    const match = brandMatchProposalForFrame(registered, theme);
    const workspace = brandWorkspaceStateFromTheme(theme, registered);

    expect(match).toMatchObject({
      source: {
        kind: 'registered-tokens',
        revision: 'design-system-42',
      },
      confidence: 'high',
      requiresConfirmation: false,
    });
    expect(match.confidenceReason).toContain('Explicit product tokens');
    expect(match.changes.map((change) => change.role)).toEqual(['accent', 'font', 'radius']);
    expect(match.evidence).toEqual(registered);
    expect(match.evidence).not.toBe(registered);
    expect(workspace).toMatchObject({
      status: 'draft',
      source: { kind: 'registered-tokens', revision: 'design-system-42' },
    });

    const inferred = productStyleProposal({
      kind: 'selected_element',
      confidence: 62,
      requiresConfirmation: true,
    });
    expect(brandMatchProposalForFrame(inferred, theme)).toMatchObject({
      source: { kind: 'sampled-element' },
      confidence: 'low',
      requiresConfirmation: true,
    });
  });

  it('maps complete verification evidence and approval truth without losing artifact pins', () => {
    const report: BrowserVerificationReport = {
      schemaVersion: '1',
      checkedAt: CHECKED_AT,
      sdkVersion: '0.3.0',
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      status: 'warning',
      checks: BROWSER_VERIFICATION_CHECK_CODES.map((code) => ({
        code,
        status: code === 'font_fallback' ? ('warning' as const) : ('passed' as const),
      })),
    };
    const verification: PublicationVerification = {
      id: 'verification_1',
      workspaceId: 'workspace_1',
      environmentId: 'environment_staging',
      documentId: 'document_1',
      publicationId: 'publication_staging',
      compiledArtifactId: 'artifact_staging',
      artifactSchemaVersion: '2',
      contentHash: STAGING_HASH,
      themeVersionId: 'theme_version_1',
      themeContentHash: PRODUCTION_HASH,
      verifiedOrigin: 'https://staging.customer.example',
      verifiedByUserId: 'user_1',
      createdAt: CHECKED_AT,
      result: 'passed',
      report,
    };
    const release: AuthoringStagingReleaseState = {
      available: true,
      environment: 'staging',
      environmentId: 'environment_staging',
      documentId: 'document_1',
      expectedGeneration: 4,
      draftArtifactId: 'artifact_staging',
      draftContentHash: STAGING_HASH,
      activeContentHash: STAGING_HASH,
      state: 'current',
      findings: [],
      pipeline: {
        state: 'awaiting_approval',
        nextAction: 'none',
        staging: {
          environmentId: 'environment_staging',
          generation: 4,
          publicationId: 'publication_staging',
          sourcePublicationId: 'publication_staging',
          compiledArtifactId: 'artifact_staging',
          contentHash: STAGING_HASH,
          verification: {
            state: 'passed',
            verificationId: verification.id,
            verifiedAt: CHECKED_AT,
          },
        },
        production: {
          environmentId: 'environment_production',
          generation: 2,
          publicationId: 'publication_production',
          compiledArtifactId: 'artifact_production',
          contentHash: PRODUCTION_HASH,
        },
        approvals: {
          operationId: 'release_operation_1',
          requiredCount: 1,
          approvedCount: 0,
          rejected: false,
        },
      },
    };

    const frameVerification = verificationForFrame(verification);
    expect(frameVerification).toMatchObject({
      state: 'passed',
      exactOrigin: 'https://staging.customer.example',
    });
    expect(frameVerification.checks).toHaveLength(BROWSER_VERIFICATION_CHECK_CODES.length);
    expect(frameVerification.checks.find((check) => check.id === 'font_fallback')).toMatchObject({
      status: 'warning',
      detail: 'Non-blocking review recommended.',
    });

    expect(
      releaseWorkflowFromState(release, {
        canVerify: true,
        canPromote: true,
        canApprove: true,
      }),
    ).toMatchObject({
      staging: {
        publicationId: 'publication_staging',
        artifactId: 'artifact_staging',
        contentHash: STAGING_HASH,
        verification: { state: 'passed', verifiedAt: CHECKED_AT },
      },
      production: {
        publicationId: 'publication_production',
        artifactId: 'artifact_production',
        contentHash: PRODUCTION_HASH,
      },
      environments: [
        { environment: 'staging', environmentId: 'environment_staging' },
        { environment: 'production', environmentId: 'environment_production' },
      ],
      approval: 'requested',
      approvalOperationId: 'release_operation_1',
      canApprove: true,
    });

    const inactiveProduction = structuredClone(release);
    inactiveProduction.pipeline!.state = 'inactive';
    inactiveProduction.pipeline!.production = {
      environmentId: 'environment_production',
      generation: 3,
      publicationId: null,
      compiledArtifactId: null,
      contentHash: null,
    };
    expect(
      releaseWorkflowFromState(inactiveProduction, {
        canVerify: true,
        canPromote: true,
      }),
    ).toMatchObject({
      production: null,
      environments: [
        { environment: 'staging', environmentId: 'environment_staging' },
        { environment: 'production', environmentId: 'environment_production' },
      ],
    });
  });
});

function productStyleProposal({
  kind,
  confidence,
  requiresConfirmation,
  revision,
}: {
  kind: 'registered_tokens' | 'selected_element';
  confidence: number;
  requiresConfirmation: boolean;
  revision?: string;
}): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId: `proposal.${kind}`,
    sources: [
      {
        sourceId: `source.${kind}`,
        kind,
        ...(revision ? { revision } : {}),
        confidence,
        fingerprintHash: STAGING_HASH,
        capturedAt: CHECKED_AT,
      },
    ],
    samples: [],
    tokens: {
      modes: { light: { colors: { accent: '#123456' } } },
      typography: { fontFamilies: ['Product Sans', 'system-ui'] },
      radii: { md: 18 },
    },
    confidence,
    requiresConfirmation,
    createdAt: CHECKED_AT,
  };
}
