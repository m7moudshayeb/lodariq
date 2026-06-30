import { describe, expect, it } from 'vitest';
import { buildDashboardViewModel } from '../../../../apps/dashboard/src/lib/view-model';

describe('@lodariq/dashboard view model', () => {
  it('shapes API-backed documents, environments, and tokens for the Phase 1 dashboard', () => {
    const viewModel = buildDashboardViewModel({
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
          originAllowlist: ['http://localhost:5173'],
          createdAt: '2026-06-30T00:00:00.000Z',
          updatedAt: '2026-06-30T00:00:00.000Z',
        },
        {
          id: 'env_staging',
          workspaceId: 'wk_a',
          kind: 'staging',
          name: 'Staging',
          originAllowlist: ['https://staging.lodariq.com'],
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
    });

    expect(viewModel.hasDocuments).toBe(true);
    expect(viewModel.documentRows[0]?.statusLabel).toBe('Draft');
    expect(viewModel.documentRows[0]?.typeLabel).toBe('Tour');
    expect(viewModel.documentRows[0]?.ownerLabel).toBe('user_editor');
    expect(viewModel.documentRows[0]?.updatedAtLabel).toBe('Jun 30, 2026');
    expect(viewModel.documentRows[0]?.contentHashLabel).toBe('sha256-draft');
    expect(viewModel.documentRows[0]?.publicationLabel).toBe('Draft changes');
    expect(viewModel.documentRows[0]?.publicationDetail).toBe('Staging');
    expect(viewModel.documentRows[0]?.publicationVariant).toBe('warning');
    expect(viewModel.defaultEnvironmentId).toBe('env_staging');
    expect(viewModel.defaultSdkEnvironmentId).toBe('env_staging');
    expect(viewModel.environmentOptions[1]?.originLabel).toBe('https://staging.lodariq.com');
    expect(viewModel.environmentOptions.map((environment) => environment.id)).toEqual([
      'env_dev',
      'env_staging',
      'env_production',
    ]);
    expect(viewModel.sdkInstallEnvironmentOptions.map((environment) => environment.id)).toEqual([
      'env_staging',
    ]);
    expect(viewModel.tokenRows[0]?.stateLabel).toBe('Active');
  });
});
