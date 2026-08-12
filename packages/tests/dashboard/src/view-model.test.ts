import { describe, expect, it } from 'vitest';
import { LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1 } from '@lodariq/schema';
import type {
  DocumentSummaryDto,
  WorkspaceEnvironmentDto,
} from '../../../../apps/dashboard/src/lib/api';
import { buildDashboardViewModel } from '../../../../apps/dashboard/src/lib/view-model';

describe('@lodariq/dashboard view model', () => {
  it('shapes API-backed documents, environments, and tokens for the Phase 1 dashboard', () => {
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: { userId: 'user_admin', workspaceId: 'wk_a', role: 'admin' },
      documents: [
        {
          id: 'doc_welcome',
          workspaceId: 'wk_a',
          type: 'tour',
          status: 'draft',
          title: 'Welcome tour',
          schemaVersion: '1.0.0',
          createdByUserId: 'user_creator',
          updatedByUserId: 'user_editor',
          updatedAt: '2026-06-30T00:00:00.000Z',
          latestContentHash: 'sha256-draft',
          publishReadinessIssues: [
            {
              code: 'missing_step_target',
              label: 'Missing target',
              blockId: 'step_1',
              message: 'Step 1 needs a placement before publishing.',
            },
          ],
          publications: [
            {
              environmentId: 'env_staging',
              environment: 'staging',
              contentHash: 'sha256-published',
              publishedAt: '2026-06-29T00:00:00.000Z',
            },
          ],
        },
      ],
      environments: [
        {
          id: 'env_dev',
          workspaceId: 'wk_a',
          kind: 'development',
          name: 'Development',
          originAllowlist: ['http://localhost:5175'],
          createdAt: '2026-06-30T00:00:00.000Z',
          updatedAt: '2026-06-30T00:00:00.000Z',
        },
        {
          id: 'env_staging',
          workspaceId: 'wk_a',
          kind: 'staging',
          name: 'Staging',
          originAllowlist: ['https://staging.lodariq.io'],
          createdAt: '2026-06-30T00:00:00.000Z',
          updatedAt: '2026-06-30T00:00:00.000Z',
        },
        {
          id: 'env_production',
          workspaceId: 'wk_a',
          kind: 'production',
          name: 'Production',
          originAllowlist: ['https://app.customer.example'],
          createdAt: '2026-06-30T00:00:00.000Z',
          updatedAt: '2026-06-30T00:00:00.000Z',
        },
      ],
      tokens: [
        {
          id: 'envtok_active',
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          environment: 'staging',
          name: 'Fixture host',
          tokenPrefix: 'lod_staging_123',
          createdAt: '2026-06-30T00:00:00.000Z',
          revokedAt: null,
        },
      ],
      installations: [
        {
          installationId: 'ins_pub_application_1234',
          workspaceId: 'wk_a',
          name: 'Product application',
          createdByUserId: 'user_admin',
          createdAt: '2026-06-30T00:00:00.000Z',
          updatedAt: '2026-06-30T00:00:00.000Z',
          revokedAt: null,
          sdkSnippet: '<script data-lodariq-installation="ins_pub_application_1234"></script>',
          origins: [
            {
              installationId: 'ins_pub_application_1234',
              workspaceId: 'wk_a',
              environmentId: 'env_staging',
              exactOrigin: 'https://staging.lodariq.io',
              authoringEnabled: true,
              createdAt: '2026-06-30T00:00:00.000Z',
              updatedAt: '2026-06-30T00:00:00.000Z',
            },
          ],
        },
      ],
      themes: [],
      unavailableResources: [],
    });

    expect(viewModel.hasDocuments).toBe(true);
    expect(viewModel.canManageSdkInstallations).toBe(true);
    expect(viewModel.canEditBrandSystem).toBe(true);
    expect(viewModel.canApproveBrandSystem).toBe(true);
    expect(viewModel.documentRows[0]?.statusLabel).toBe('Draft');
    expect(viewModel.documentRows[0]?.typeLabel).toBe('Tour');
    expect(viewModel.documentRows[0]?.editorLabel).toBe('Workspace teammate');
    expect(viewModel.documentRows[0]?.readinessDetail).toBe('Needs fixes before publishing');
    expect(viewModel.documentRows[0]?.readinessState).toBe('blocked');
    expect(viewModel.documentRows[0]?.lifecycleVariant).toBe('warning');
    expect(viewModel.documentRows[0]?.readinessIssueCount).toBe(1);
    expect(viewModel.documentRows[0]?.readinessIssueSummary).toBe(
      'Step 1 needs a placement before publishing.',
    );
    expect(viewModel.documentRows[0]?.updatedAtLabel).toBe('Jun 30, 2026');
    expect(viewModel.documentRows[0]?.contentHashLabel).toBe('Draft saved');
    expect(viewModel.documentRows[0]?.contentHashDetail).toBe('Changes are being tracked');
    expect(viewModel.documentRows[0]?.publicationLabel).toBe('Newer draft');
    expect(viewModel.documentRows[0]?.publicationDetail).toBe(
      'Publication records for Staging use an earlier content hash',
    );
    expect(viewModel.documentRows[0]?.publicationVariant).toBe('warning');
    expect(viewModel.documentRows[0]?.pageScopeLabel).toBe('Not specified');
    expect(viewModel.documentRows[0]?.queueStatusLabel).toBe('Needs review');
    expect(viewModel.documentRows[0]?.queueStatusVariant).toBe('warning');
    expect(viewModel.documentRows[0]?.releaseStages.map((stage) => stage.statusLabel)).toEqual([
      'Needs review',
      'Newer draft',
      'No record',
    ]);
    expect(viewModel.defaultEnvironmentId).toBe('env_staging');
    expect(viewModel.defaultSdkEnvironmentId).toBe('env_staging');
    expect(viewModel.environmentOptions[1]?.originLabel).toBe('https://staging.lodariq.io');
    expect(viewModel.environmentOptions.map((environment) => environment.id)).toEqual([
      'env_dev',
      'env_staging',
      'env_production',
    ]);
    expect(viewModel.sdkInstallEnvironmentOptions.map((environment) => environment.id)).toEqual([
      'env_dev',
      'env_staging',
      'env_production',
    ]);
    expect(viewModel.openInProductUrl).toBe('https://staging.lodariq.io/?lodariq-launcher=show');
    expect(viewModel.recentActivity[0]).toMatchObject({
      documentId: 'doc_welcome',
      title: 'Welcome tour was last updated',
      typeLabel: 'Tour',
    });
    expect(viewModel.tokenRows[0]?.stateLabel).toBe('Active');
  });

  it('describes a matching production publication without claiming active delivery', () => {
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: { userId: 'user_member', workspaceId: 'wk_a', role: 'member' },
      documents: [
        {
          id: 'doc_production_recorded',
          workspaceId: 'wk_a',
          type: 'announcement',
          status: 'review',
          title: 'Billing notice',
          schemaVersion: '1.0.0',
          createdByUserId: 'user_creator',
          updatedByUserId: 'user_editor',
          updatedAt: '2026-08-05T12:00:00.000Z',
          latestContentHash: 'sha256-current',
          publishReadinessIssues: [],
          publications: [
            {
              environmentId: 'env_staging',
              environment: 'staging',
              contentHash: 'sha256-older',
              publishedAt: '2026-08-04T12:00:00.000Z',
            },
            {
              environmentId: 'env_production',
              environment: 'production',
              contentHash: 'sha256-current',
              publishedAt: '2026-08-05T11:00:00.000Z',
            },
          ],
        },
      ],
      environments: [
        environment('env_staging', 'staging', 'Staging'),
        environment('env_production', 'production', 'Production'),
      ],
      tokens: [],
      installations: [],
      themes: [],
      unavailableResources: [],
    });

    const row = viewModel.documentRows[0];
    expect(viewModel.canManageSdkInstallations).toBe(false);
    expect(viewModel.canEditBrandSystem).toBe(true);
    expect(viewModel.canApproveBrandSystem).toBe(false);
    expect(row?.queueStatusLabel).toBe('Production published');
    expect(row?.readinessDetail).toBe('Ready to preview');
    expect(row?.readinessState).toBe('previewable');
    expect(row?.lifecycleVariant).toBe('info');
    expect(row?.releaseSummary).toContain('active-delivery evidence is not available');
    expect(row?.releaseStages.map((stage) => stage.statusLabel)).toEqual([
      'Draft saved',
      'Newer draft',
      'Published',
    ]);
  });

  it('derives verified staging evidence and a promotion review action when proof is present', () => {
    const verifiedPublication = {
      id: 'publication_staging_current_001',
      publicationId: 'publication_staging_current_001',
      environmentId: 'env_staging',
      environment: 'staging' as const,
      contentHash: 'sha256-current',
      publishedAt: '2026-08-05T11:00:00.000Z',
      compiledArtifactId: 'artifact_staging_current_001',
      active: true,
      generation: 1,
      verification: {
        status: 'passed' as const,
        result: 'passed' as const,
        verificationId: 'verification_staging_current_001',
        verifiedAt: '2026-08-05T11:05:00.000Z',
        createdAt: '2026-08-05T11:05:00.000Z',
      },
    } satisfies DocumentSummaryDto['publications'][number];
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: { userId: 'user_admin', workspaceId: 'wk_a', role: 'admin' },
      documents: [
        {
          id: 'doc_verified',
          workspaceId: 'wk_a',
          type: 'tour',
          status: 'review',
          title: 'Verified onboarding',
          schemaVersion: '1.0.0',
          createdByUserId: 'user_admin',
          updatedByUserId: 'user_admin',
          updatedAt: '2026-08-05T12:00:00.000Z',
          latestContentHash: 'sha256-current',
          publishReadinessIssues: [],
          publications: [verifiedPublication],
        },
      ],
      environments: [environment('env_staging', 'staging', 'Staging')],
      tokens: [],
      installations: [],
      themes: [],
      unavailableResources: [],
    });

    const row = viewModel.documentRows[0];
    expect(row?.queueStatusLabel).toBe('Staging verified');
    expect(row?.releaseActionLabel).toBe('Review promotion');
    expect(row?.releaseStages[1]).toMatchObject({ statusLabel: 'Verified', tone: 'complete' });
    expect(row?.releaseEvidence.find((item) => item.id === 'artifact')?.value).toContain(
      'Artifact',
    );
  });

  it('uses the newest publication record when more than one staging environment exists', () => {
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: { userId: 'user_owner', workspaceId: 'wk_a', role: 'owner' },
      documents: [
        {
          id: 'doc_multi_staging',
          workspaceId: 'wk_a',
          type: 'tour',
          status: 'review',
          title: 'Onboarding tour',
          schemaVersion: '1.0.0',
          createdByUserId: null,
          updatedByUserId: null,
          updatedAt: '2026-08-05T12:00:00.000Z',
          latestContentHash: 'sha256-current',
          publishReadinessIssues: [],
          publications: [
            {
              environmentId: 'env_staging_eu',
              environment: 'staging',
              contentHash: 'sha256-current',
              publishedAt: '2026-08-03T12:00:00.000Z',
            },
            {
              environmentId: 'env_staging_us',
              environment: 'staging',
              contentHash: 'sha256-older',
              publishedAt: '2026-08-05T11:00:00.000Z',
            },
          ],
        },
      ],
      environments: [
        environment('env_staging_eu', 'staging', 'Staging EU'),
        environment('env_staging_us', 'staging', 'Staging US'),
      ],
      tokens: [],
      installations: [],
      themes: [],
      unavailableResources: [],
    });

    const row = viewModel.documentRows[0];
    expect(row?.queueStatusLabel).toBe('Staging update');
    expect(row?.releaseStages[1]).toMatchObject({
      statusLabel: 'Newer draft',
      tone: 'attention',
    });
  });

  it('omits disabled, non-authorable, production, and origin-revoked launcher mappings', () => {
    const createdAt = '2026-08-09T00:00:00.000Z';
    const environments: WorkspaceEnvironmentDto[] = [
      {
        ...environment('env_dev', 'development', 'Development'),
        originAllowlist: ['http://localhost:5175'],
        enabled: true,
        authoringEnabled: false,
      },
      {
        ...environment('env_staging_disabled', 'staging', 'Disabled staging'),
        originAllowlist: ['https://disabled.customer.example'],
        enabled: false,
        authoringEnabled: true,
      },
      {
        ...environment('env_staging_active', 'staging', 'Active staging'),
        originAllowlist: ['https://active.customer.example'],
        enabled: true,
        authoringEnabled: true,
      },
      {
        ...environment('env_production', 'production', 'Production'),
        originAllowlist: ['https://app.customer.example'],
        enabled: true,
        authoringEnabled: false,
      },
    ];
    const mappings = [
      ['env_dev', 'http://localhost:5175', true],
      ['env_staging_disabled', 'https://disabled.customer.example', true],
      ['env_staging_active', 'https://active.customer.example', true],
      ['env_staging_active', 'https://removed.customer.example', true],
      ['env_production', 'https://app.customer.example', false],
    ] as const;
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: { userId: 'user_owner', workspaceId: 'wk_a', role: 'owner' },
      documents: [],
      environments,
      tokens: [],
      installations: [
        {
          installationId: 'ins_pub_policy_launcher',
          workspaceId: 'wk_a',
          name: 'Policy launcher',
          createdByUserId: 'user_owner',
          createdAt,
          updatedAt: createdAt,
          revokedAt: null,
          sdkSnippet: '<script></script>',
          origins: mappings.map(([environmentId, exactOrigin, authoringEnabled]) => ({
            installationId: 'ins_pub_policy_launcher',
            workspaceId: 'wk_a',
            environmentId,
            exactOrigin,
            authoringEnabled,
            createdAt,
            updatedAt: createdAt,
          })),
        },
      ],
      themes: [],
      unavailableResources: [],
    });

    expect(viewModel.authoringSiteOptions).toEqual([
      expect.objectContaining({
        environmentId: 'env_staging_active',
        exactOrigin: 'https://active.customer.example',
      }),
    ]);
    expect(viewModel.openInProductUrl).toBe(
      'https://active.customer.example/?lodariq-launcher=show',
    );
  });

  it('keeps dashboard authoring entry unavailable to viewer roles', () => {
    const createdAt = '2026-08-09T00:00:00.000Z';
    const staging = {
      ...environment('env_staging', 'staging', 'Staging'),
      originAllowlist: ['https://staging.customer.example'],
      enabled: true,
      authoringEnabled: true,
    };
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: { userId: 'user_viewer', workspaceId: 'wk_a', role: 'viewer' },
      documents: [],
      environments: [staging],
      tokens: [],
      installations: [
        {
          installationId: 'ins_pub_viewer_hidden',
          workspaceId: 'wk_a',
          name: 'Viewer-hidden installation',
          createdByUserId: 'user_owner',
          createdAt,
          updatedAt: createdAt,
          revokedAt: null,
          sdkSnippet: '<script></script>',
          origins: [
            {
              installationId: 'ins_pub_viewer_hidden',
              workspaceId: 'wk_a',
              environmentId: staging.id,
              exactOrigin: 'https://staging.customer.example',
              authoringEnabled: true,
              createdAt,
              updatedAt: createdAt,
            },
          ],
        },
      ],
      themes: [],
      unavailableResources: [],
    });

    expect(viewModel.authoringSiteOptions).toEqual([]);
    expect(viewModel.openInProductUrl).toBe('');
  });

  it('shows the latest persisted product-style provenance without exposing raw CSS evidence', () => {
    const definition = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition;
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: { userId: 'user_member', workspaceId: 'wk_a', role: 'member' },
      documents: [],
      environments: [environment('env_staging', 'staging', 'Staging')],
      tokens: [],
      installations: [],
      themes: [
        {
          id: 'theme_product',
          workspaceId: 'wk_a',
          name: 'Product brand',
          draft: definition,
          revision: 3,
          isDefault: true,
          activeVersionId: null,
          activeVersion: null,
          createdByUserId: 'user_admin',
          updatedByUserId: 'user_member',
          createdAt: '2026-08-08T10:00:00.000Z',
          updatedAt: '2026-08-08T10:05:00.000Z',
          latestStyleSource: {
            sourceId: 'lodariq.inferred.selected',
            kind: 'selected_element',
            confidence: 88,
            fingerprintHash: contentHash('a'),
            capturedAt: '2026-08-08T10:04:00.000Z',
            recordId: 'style_source_product_1',
            sourceHash: contentHash('b'),
            environmentId: 'env_staging',
            recordedAt: '2026-08-08T10:05:00.000Z',
          },
        },
      ],
      unavailableResources: [],
    });

    expect(viewModel.brandSourceSummary).toMatchObject({
      sourceLabel: 'Selected product element',
      statusLabel: 'Needs approval',
      revisionLabel: 'Theme revision 3',
      confidenceLabel: 'High-confidence evidence',
    });
    expect(viewModel.brandSourceSummary.sourceDetail).toContain('reviewed semantically');
    expect(JSON.stringify(viewModel.brandSourceSummary)).not.toContain('selector');
    expect(JSON.stringify(viewModel.brandSourceSummary)).not.toContain('css');
  });
});

function environment(
  id: string,
  kind: 'development' | 'staging' | 'production',
  name: string,
): WorkspaceEnvironmentDto {
  return {
    id,
    workspaceId: 'wk_a',
    kind,
    name,
    originAllowlist: [`https://${id}.example.com`],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function contentHash(digit: string): string {
  return `sha256-${digit.repeat(64)}`;
}
