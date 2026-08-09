import { describe, expect, it, vi } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE,
  AmbiguousCurrentPublicationError,
  DEPLOYMENT_CHANGED_ERROR_CODE,
  DeploymentChangedError,
  IDEMPOTENCY_CONFLICT_ERROR_CODE,
  IdempotencyConflictError,
  createControlPlaneRepositoryFromEnvironment,
  createAuthoringActivationGrant,
  createAuthoringAuthorizationCode,
  createAuthoringSessionToken,
  createInMemoryControlPlaneRepository,
  createPublicSdkBootstrapGrant,
  deriveAuthoringPkceS256Challenge,
  getAuthoringDocumentSessionCapabilities,
  hashAuthoringActivationGrant,
  hashAuthoringAuthorizationCode,
  hashAuthoringAuthorizationState,
  hashAuthoringSessionToken,
  hashPublicSdkBootstrapGrant,
  matchesAuthoringPageContext,
  runWithEnvironmentTokenLookupScope,
  runWithPublicSdkBootstrapGrantLookupScope,
  runWithPublicSdkInstallationLookupScope,
  runWithWorkspaceScope,
  tenantScopedTableNames,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  AUTHORING_SESSION_CAPABILITIES,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocument,
  type AuthoringActivationCapability,
  type AuthoringDocumentIntent,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { readInitialBaseline } from './migration-test-utils.js';

const baseDocument = tourFixture as LodariqDocument;

describe('control-plane repository', () => {
  it('grants release-state reads in development without granting staging publication', () => {
    const capabilities = getAuthoringDocumentSessionCapabilities('development');
    expect(capabilities).toContain(AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE);
    expect(capabilities).toContain(AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE);
    expect(capabilities).not.toContain(AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING);
  });

  it('grants staging authoring the release envelope that API membership checks narrow', () => {
    const capabilities = getAuthoringDocumentSessionCapabilities('staging');
    expect(capabilities).toEqual(
      expect.arrayContaining([
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
        AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
        AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
        AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
        AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
      ]),
    );
  });

  it('resolves workspace memberships only by internal user id', async () => {
    const repository = createInMemoryControlPlaneRepository({
      users: [
        {
          id: 'user_internal',
          legacyIdentityId: 'retired_provider_user',
          email: 'creator@lodariq.test',
          name: 'Creator',
          createdAt: new Date().toISOString(),
        },
      ],
      workspaceMemberships: [
        {
          workspaceId: 'wk_a',
          userId: 'user_internal',
          role: 'member',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    await expect(
      repository.resolveWorkspaceMembership('wk_a', 'user_internal'),
    ).resolves.toMatchObject({
      workspaceId: 'wk_a',
      userId: 'user_internal',
      role: 'member',
    });
    await expect(
      repository.resolveWorkspaceMembership('wk_a', 'retired_provider_user'),
    ).resolves.toBeNull();
    await expect(
      repository.resolveWorkspaceMembership('wk_b', 'retired_provider_user'),
    ).resolves.toBeNull();
  });

  it('scopes documents and compiled artifacts by workspace', async () => {
    const document = withWorkspace(baseDocument, 'wk_a');
    const artifact = await compileTestDocument(document);
    const repository = createInMemoryControlPlaneRepository({
      documents: [document],
      compiledArtifacts: [
        {
          id: 'artifact_a',
          workspaceId: 'wk_a',
          documentId: document.id,
          contentHash: artifact.contentHash,
          compilerVersion: artifact.compilerVersion,
          compiled: artifact,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    await expect(repository.listDocuments('wk_a')).resolves.toHaveLength(1);
    await expect(repository.listDocuments('wk_b')).resolves.toHaveLength(0);

    const saved = await repository.getDocument('wk_a', document.id);
    expect(saved?.latestArtifact?.contentHash).toBe(artifact.contentHash);
    await expect(repository.getDocument('wk_b', document.id)).resolves.toBeNull();
  });

  it('rejects saves when canonical workspaceId does not match auth workspace', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const document = withWorkspace(baseDocument, 'wk_a');
    await expect(
      repository.saveDocument({
        workspaceId: 'wk_b',
        actorUserId: 'user_a',
        document,
      }),
    ).rejects.toThrow(/workspace scope mismatch/);
  });

  it('records workspace-scoped document versions and links compiled artifacts to the producing version', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const document = withWorkspace(baseDocument, 'wk_a');
    const revisedDocument = structuredClone(document);
    revisedDocument.title = 'Welcome tour revised';
    const revisedParagraph = revisedDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.type === 'paragraph',
    );
    if (!revisedParagraph) throw new Error('fixture paragraph missing');
    revisedParagraph.content = 'Version two content';

    await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document,
      artifact: await compileTestDocument(document),
    });
    const revised = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_b',
      document: revisedDocument,
      artifact: await compileTestDocument(revisedDocument),
    });

    const versions = await repository.listDocumentVersions('wk_a', document.id);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      workspaceId: 'wk_a',
      documentId: document.id,
      createdByUserId: 'user_b',
      canonical: { title: 'Welcome tour revised' },
    });
    expect(revised.latestArtifact?.documentVersionId).toBe(versions[0]?.id);
    await expect(repository.listDocumentVersions('wk_b', document.id)).resolves.toEqual([]);
  });

  it('keeps the first content-addressed artifact immutable when the same hash is saved again', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const document = withWorkspace(baseDocument, 'wk_a');
    const firstSave = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document,
      artifact: await compileTestDocument(document),
    });
    if (!firstSave.latestArtifact) throw new Error('initial artifact missing');
    expect(firstSave.latestArtifact).toMatchObject({
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
      themeContentHash: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.contentHash,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });

    const conflictingCompiled = structuredClone(firstSave.latestArtifact.compiled);
    conflictingCompiled.compilerVersion = 'compiler-that-must-not-replace-the-first-write';
    const secondSave = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_b',
      document,
      artifact: conflictingCompiled as CompiledDocument,
    });

    expect(secondSave.latestArtifact).toEqual(firstSave.latestArtifact);
    await expect(repository.getLatestCompiledArtifact('wk_a')).resolves.toEqual(
      firstSave.latestArtifact,
    );
    await expect(repository.listDocumentVersions('wk_a', document.id)).resolves.toHaveLength(2);
  });

  it('rejects a compiled artifact for a different document before creating a version', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const document = withDocumentIdentity(
      withWorkspace(baseDocument, 'wk_a'),
      'doc_expected',
      'Expected document',
    );
    const otherDocument = withDocumentIdentity(document, 'doc_other', 'Other document');

    await expect(
      repository.saveDocument({
        workspaceId: 'wk_a',
        actorUserId: 'user_a',
        document,
        artifact: await compileTestDocument(otherDocument),
      }),
    ).rejects.toThrow('compiled artifact document mismatch');
    await expect(repository.listDocumentVersions('wk_a', document.id)).resolves.toEqual([]);
  });

  it('creates environment tokens only inside existing workspace environments', async () => {
    const environment: WorkspaceEnvironment = {
      id: 'env_staging',
      workspaceId: 'wk_a',
      kind: 'staging',
      name: 'Staging',
      originAllowlist: ['https://staging.lodariq.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const repository = createInMemoryControlPlaneRepository({ environments: [environment] });

    const token = await repository.createEnvironmentToken({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      name: 'Fixture host',
      tokenHash: 'hash',
      tokenPrefix: 'lod_staging_123',
      clientToken: 'lod_staging_123456',
      actorUserId: 'user_a',
    });

    expect(token.environment).toBe('staging');
    await expect(repository.listEnvironmentTokens('wk_a')).resolves.toHaveLength(1);
    await expect(repository.resolveEnvironmentToken('hash')).resolves.toMatchObject({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      environment: 'staging',
      originAllowlist: ['https://staging.lodariq.com'],
    });
    const revoked = await repository.revokeEnvironmentToken('wk_a', token.id, 'user_a');
    expect(revoked).toMatchObject({
      id: token.id,
      workspaceId: 'wk_a',
      revokedAt: expect.any(String),
    });
    await expect(repository.resolveEnvironmentToken('hash')).resolves.toBeNull();
    await expect(repository.revokeEnvironmentToken('wk_b', token.id, 'user_b')).resolves.toBeNull();
    await expect(repository.resolveEnvironmentToken('missing_hash')).resolves.toBeNull();
    await expect(
      repository.createEnvironmentToken({
        workspaceId: 'wk_b',
        environmentId: 'env_staging',
        name: 'Wrong workspace',
        tokenHash: 'hash_2',
        tokenPrefix: 'lod_staging_456',
        actorUserId: 'user_b',
      }),
    ).rejects.toThrow(/environment not found/);
  });

  it('resolves permanent public installations through one normalized exact-origin mapping', async () => {
    const staging = createEnvironmentFixture('env_staging', 'staging');
    const production = createEnvironmentFixture('env_production', 'production');
    const repository = createInMemoryControlPlaneRepository({
      environments: [staging, production],
    });
    const installationId = 'ins_pub_0123456789abcdef';

    const installation = await repository.getOrCreatePublicSdkInstallation({
      workspaceId: 'wk_a',
      installationId,
      name: 'Web application',
      actorUserId: 'user_a',
    });
    await expect(
      repository.getOrCreatePublicSdkInstallation({
        workspaceId: 'wk_a',
        installationId,
        name: 'Ignored retry name',
        actorUserId: 'user_b',
      }),
    ).resolves.toEqual(installation);
    await repository.getOrCreatePublicSdkInstallation({
      workspaceId: 'wk_a',
      installationId: 'ins_pub_fedcba9876543210',
      name: 'Second application',
      actorUserId: 'user_a',
    });

    const mapping = await repository.setPublicSdkInstallationOrigin({
      workspaceId: 'wk_a',
      installationId,
      environmentId: staging.id,
      origin: 'https://App.Example.com:443/',
      authoringEnabled: true,
    });
    expect(mapping.exactOrigin).toBe('https://app.example.com');
    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'https://app.example.com/'),
    ).resolves.toMatchObject({
      installation: { installationId, workspaceId: 'wk_a' },
      environment: { id: staging.id, kind: 'staging' },
      exactOrigin: 'https://app.example.com',
      authoringEnabled: true,
    });
    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'https://other.example.com'),
    ).resolves.toBeNull();
    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'https://app.example.com/path'),
    ).resolves.toBeNull();
    await expect(
      repository.setPublicSdkInstallationOrigin({
        workspaceId: 'wk_a',
        installationId,
        environmentId: staging.id,
        origin: 'https://user:secret@app.example.com',
        authoringEnabled: true,
      }),
    ).rejects.toThrow(/origin-only HTTP\(S\)/);
    await expect(
      repository.setPublicSdkInstallationOrigin({
        workspaceId: 'wk_a',
        installationId,
        environmentId: staging.id,
        origin: 'http://localhost:4173',
        authoringEnabled: true,
      }),
    ).resolves.toMatchObject({ exactOrigin: 'http://localhost:4173' });
    await expect(
      repository.setPublicSdkInstallationOrigin({
        workspaceId: 'wk_a',
        installationId,
        environmentId: production.id,
        origin: 'http://app.example.com',
        authoringEnabled: false,
      }),
    ).rejects.toThrow(/must use HTTPS/);
    await expect(
      repository.setPublicSdkInstallationOrigin({
        workspaceId: 'wk_a',
        installationId,
        environmentId: production.id,
        origin: 'https://app.example.com',
        authoringEnabled: true,
      }),
    ).rejects.toThrow(/production/);

    await repository.setPublicSdkInstallationOrigin({
      workspaceId: 'wk_a',
      installationId,
      environmentId: production.id,
      origin: 'https://app.example.com',
      authoringEnabled: false,
    });
    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'https://app.example.com'),
    ).resolves.toMatchObject({
      environment: { id: production.id, kind: 'production' },
      authoringEnabled: false,
    });

    await expect(
      repository.revokePublicSdkInstallation('wk_b', installationId, 'user_b'),
    ).resolves.toBeNull();
    await expect(
      repository.revokePublicSdkInstallation('wk_a', installationId, 'user_a'),
    ).resolves.toMatchObject({ revokedAt: expect.any(String) });
    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'https://app.example.com'),
    ).resolves.toBeNull();
  });

  it('fails closed when seeded public installation origin mappings are ambiguous', async () => {
    const createdAt = '2026-01-01T00:00:00.000Z';
    const installationId = 'ins_pub_0123456789abcdef';
    const repository = createInMemoryControlPlaneRepository({
      environments: [
        createEnvironmentFixture('env_development', 'development'),
        createEnvironmentFixture('env_staging', 'staging'),
      ],
      publicSdkInstallations: [
        {
          installationId,
          workspaceId: 'wk_a',
          name: 'Web application',
          createdByUserId: 'user_a',
          createdAt,
          updatedAt: createdAt,
          revokedAt: null,
        },
      ],
      publicSdkInstallationOrigins: [
        {
          installationId,
          workspaceId: 'wk_a',
          environmentId: 'env_development',
          exactOrigin: 'https://app.example.com',
          authoringEnabled: true,
          createdAt,
          updatedAt: createdAt,
        },
        {
          installationId,
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          exactOrigin: 'https://app.example.com',
          authoringEnabled: true,
          createdAt,
          updatedAt: createdAt,
        },
      ],
    });

    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'https://app.example.com'),
    ).resolves.toBeNull();
  });

  it('invalidates an active authoring session when its origin policy changes', async () => {
    const createdAt = '2026-08-07T00:00:00.000Z';
    const installationId = 'ins_pub_policychange1234';
    const tokenHash = 'a'.repeat(64);
    const repository = createInMemoryControlPlaneRepository({
      environments: [createEnvironmentFixture('env_staging', 'staging')],
      publicSdkInstallations: [
        {
          installationId,
          workspaceId: 'wk_a',
          name: 'Policy fixture',
          createdByUserId: 'user_a',
          createdAt,
          updatedAt: createdAt,
          revokedAt: null,
        },
      ],
      publicSdkInstallationOrigins: [
        {
          installationId,
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          exactOrigin: 'https://policy.example.com',
          authoringEnabled: true,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      authoringSessions: [
        {
          id: 'authsess_policy_change',
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          environment: 'staging',
          documentId: 'doc_policy',
          correlationId: 'corr_policy',
          tokenHash,
          iframeSrc: 'https://editor.lodariq.com/authoring.html',
          createdByUserId: 'user_a',
          createdAt,
          expiresAt: '2099-01-01T00:00:00.000Z',
          revokedAt: null,
          installationId,
          activationGrantId: 'authgrant_policy',
          customerOrigin: 'https://policy.example.com',
          capabilities: ['document:read'],
        },
      ],
    });

    await expect(repository.resolveAuthoringSession('wk_a', tokenHash)).resolves.not.toBeNull();
    await repository.setPublicSdkInstallationOrigin({
      workspaceId: 'wk_a',
      installationId,
      environmentId: 'env_staging',
      origin: 'https://policy.example.com',
      authoringEnabled: false,
    });
    await expect(repository.resolveAuthoringSession('wk_a', tokenHash)).resolves.toBeNull();
  });

  it('lists every workspace installation with deterministically sorted origin mappings for audit', async () => {
    const repository = createInMemoryControlPlaneRepository({
      publicSdkInstallations: [
        {
          installationId: 'ins_pub_aaaaaaaaaaaaaaaa',
          workspaceId: 'wk_a',
          name: 'Revoked installation',
          createdByUserId: 'user_a',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          revokedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          installationId: 'ins_pub_bbbbbbbbbbbbbbbb',
          workspaceId: 'wk_a',
          name: 'Active installation',
          createdByUserId: 'user_a',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
          revokedAt: null,
        },
        {
          installationId: 'ins_pub_cccccccccccccccc',
          workspaceId: 'wk_b',
          name: 'Other workspace',
          createdByUserId: 'user_b',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-04T00:00:00.000Z',
          revokedAt: null,
        },
      ],
      publicSdkInstallationOrigins: [
        {
          installationId: 'ins_pub_bbbbbbbbbbbbbbbb',
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          exactOrigin: 'https://z.example.com',
          authoringEnabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          installationId: 'ins_pub_bbbbbbbbbbbbbbbb',
          workspaceId: 'wk_a',
          environmentId: 'env_development',
          exactOrigin: 'http://localhost:4173',
          authoringEnabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          installationId: 'ins_pub_aaaaaaaaaaaaaaaa',
          workspaceId: 'wk_a',
          environmentId: 'env_production',
          exactOrigin: 'https://app.example.com',
          authoringEnabled: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const installations = await repository.listPublicSdkInstallations('wk_a');
    expect(installations.map(({ installationId }) => installationId)).toEqual([
      'ins_pub_bbbbbbbbbbbbbbbb',
      'ins_pub_aaaaaaaaaaaaaaaa',
    ]);
    expect(installations[0]?.origins.map(({ environmentId }) => environmentId)).toEqual([
      'env_development',
      'env_staging',
    ]);
    expect(installations[1]).toMatchObject({
      revokedAt: '2026-01-02T00:00:00.000Z',
      origins: [{ exactOrigin: 'https://app.example.com' }],
    });
    await expect(repository.listPublicSdkInstallations('wk_b')).resolves.toHaveLength(1);
    await expect(repository.listPublicSdkInstallations('wk_missing')).resolves.toEqual([]);
  });

  it('atomically synchronizes the complete public installation origin set', async () => {
    const staleSessionTokenHash = 'b'.repeat(64);
    const repository = createInMemoryControlPlaneRepository({
      environments: [
        createEnvironmentFixture('env_development', 'development'),
        createEnvironmentFixture('env_staging', 'staging'),
      ],
      authoringSessions: [
        {
          id: 'authsess_stale_origin',
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          environment: 'staging',
          documentId: 'doc_stale',
          correlationId: 'corr_stale',
          tokenHash: staleSessionTokenHash,
          iframeSrc: 'https://editor.lodariq.com/authoring.html',
          createdByUserId: 'user_a',
          createdAt: '2026-08-07T00:00:00.000Z',
          expiresAt: '2099-01-01T00:00:00.000Z',
          revokedAt: null,
          installationId: 'ins_pub_syncsyncsyncsync',
          activationGrantId: 'authgrant_stale',
          customerOrigin: 'https://stale.example.com',
          capabilities: ['document:read'],
        },
      ],
    });
    const installationId = 'ins_pub_syncsyncsyncsync';
    await repository.getOrCreatePublicSdkInstallation({
      workspaceId: 'wk_a',
      installationId,
      name: 'Synced installation',
      actorUserId: 'user_a',
    });
    await repository.setPublicSdkInstallationOrigin({
      workspaceId: 'wk_a',
      installationId,
      environmentId: 'env_staging',
      origin: 'https://stale.example.com',
      authoringEnabled: true,
    });
    await expect(
      repository.resolveAuthoringSession('wk_a', staleSessionTokenHash),
    ).resolves.not.toBeNull();

    await expect(
      repository.syncPublicSdkInstallationOrigins({
        workspaceId: 'wk_a',
        installationId,
        origins: [
          {
            environmentId: 'env_development',
            origin: 'http://localhost:4173',
            authoringEnabled: true,
          },
        ],
      }),
    ).resolves.toMatchObject([
      {
        environmentId: 'env_development',
        exactOrigin: 'http://localhost:4173',
        authoringEnabled: true,
      },
    ]);
    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'https://stale.example.com'),
    ).resolves.toBeNull();
    await expect(
      repository.resolveAuthoringSession('wk_a', staleSessionTokenHash),
    ).resolves.toBeNull();
    await expect(
      repository.resolvePublicSdkInstallation(installationId, 'http://localhost:4173'),
    ).resolves.toMatchObject({ environment: { id: 'env_development' } });
    await expect(
      repository.syncPublicSdkInstallationOrigins({
        workspaceId: 'wk_a',
        installationId,
        origins: [],
      }),
    ).resolves.toEqual([]);
    await expect(repository.listPublicSdkInstallations('wk_a')).resolves.toMatchObject([
      { installationId, origins: [] },
    ]);
  });

  it('stores only hashed short-lived bootstrap grants and consumes each grant once', async () => {
    const staging = createEnvironmentFixture('env_staging', 'staging');
    const repository = createInMemoryControlPlaneRepository({ environments: [staging] });
    const installationId = 'ins_pub_0123456789abcdef';
    await repository.getOrCreatePublicSdkInstallation({
      workspaceId: 'wk_a',
      installationId,
      name: 'Web application',
      actorUserId: 'user_a',
    });
    await repository.setPublicSdkInstallationOrigin({
      workspaceId: 'wk_a',
      installationId,
      environmentId: staging.id,
      origin: 'https://app.example.com',
      authoringEnabled: true,
    });

    const rawGrant = createPublicSdkBootstrapGrant();
    const grantHash = hashPublicSdkBootstrapGrant(rawGrant);
    const grant = await repository.createPublicSdkBootstrapGrant({
      workspaceId: 'wk_a',
      installationId,
      environmentId: staging.id,
      exactOrigin: 'https://app.example.com',
      grantHash,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(grant.grantHash).toBe(grantHash);
    expect(JSON.stringify(grant)).not.toContain(rawGrant);
    await expect(
      repository.consumePublicSdkBootstrapGrant({
        installationId,
        exactOrigin: 'https://other.example.com',
        grantHash,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.consumePublicSdkBootstrapGrant({
        installationId,
        exactOrigin: 'https://app.example.com',
        grantHash,
      }),
    ).resolves.toMatchObject({ id: grant.id, consumedAt: expect.any(String) });
    await expect(
      repository.consumePublicSdkBootstrapGrant({
        installationId,
        exactOrigin: 'https://app.example.com',
        grantHash,
      }),
    ).resolves.toBeNull();

    await expect(
      repository.createPublicSdkBootstrapGrant({
        workspaceId: 'wk_a',
        installationId,
        environmentId: staging.id,
        exactOrigin: 'https://app.example.com',
        grantHash: 'f'.repeat(64),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    ).rejects.toThrow(/short-lived TTL/);
  });

  it('persists only hashes and atomically exchanges one code for one activation grant', async () => {
    const fixture = await createAuthoringActivationFixture();
    expect(JSON.stringify(fixture.request)).not.toContain(fixture.rawBootstrapGrant);
    expect(JSON.stringify(fixture.request)).not.toContain(fixture.rawState);
    expect(fixture.request).toMatchObject({
      bootstrapGrantHash: hashPublicSdkBootstrapGrant(fixture.rawBootstrapGrant),
      stateHash: hashAuthoringAuthorizationState(fixture.rawState),
      environment: 'staging',
      creatorId: null,
    });

    const rawAuthorizationCode = createAuthoringAuthorizationCode();
    const authorizationCodeHash = hashAuthoringAuthorizationCode(rawAuthorizationCode);
    const approved = await fixture.repository.approveAuthoringAuthorizationRequest({
      workspaceId: 'wk_a',
      requestId: fixture.request.requestId,
      stateHash: hashAuthoringAuthorizationState(fixture.rawState),
      creatorId: 'user_a',
      authorizationCodeHash,
      authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
    });
    expect(approved).toMatchObject({
      creatorId: 'user_a',
      authorizationCodeHash,
      approvedAt: expect.any(String),
    });
    expect(JSON.stringify(approved)).not.toContain(rawAuthorizationCode);

    const rawActivationGrant = createAuthoringActivationGrant();
    const exchangeInput = {
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      requestId: fixture.request.requestId,
      bootstrapGrantHash: hashPublicSdkBootstrapGrant(fixture.rawBootstrapGrant),
      stateHash: hashAuthoringAuthorizationState(fixture.rawState),
      authorizationCodeHash,
      codeVerifier: fixture.codeVerifier,
      activationGrantHash: hashAuthoringActivationGrant(rawActivationGrant),
      activationGrantExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const exchanges = await Promise.all([
      fixture.repository.exchangeAuthoringAuthorizationCode(exchangeInput),
      fixture.repository.exchangeAuthoringAuthorizationCode(exchangeInput),
    ]);
    expect(exchanges.filter(Boolean)).toHaveLength(1);
    const exchange = exchanges.find(Boolean);
    expect(exchange?.authorizationRequest.authorizationCodeUsedAt).toEqual(expect.any(String));
    expect(exchange?.activationGrant).toMatchObject({
      creatorId: 'user_a',
      capabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
      grantHash: hashAuthoringActivationGrant(rawActivationGrant),
    });
    expect(JSON.stringify(exchange)).not.toContain(rawAuthorizationCode);
    expect(JSON.stringify(exchange)).not.toContain(rawActivationGrant);

    const consumeInput = {
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      grantHash: hashAuthoringActivationGrant(rawActivationGrant),
    };
    const consumptions = await Promise.all([
      fixture.repository.consumeAuthoringActivationGrant(consumeInput),
      fixture.repository.consumeAuthoringActivationGrant(consumeInput),
    ]);
    expect(consumptions.filter(Boolean)).toHaveLength(1);
    expect(consumptions.find(Boolean)?.usedAt).toEqual(expect.any(String));
    await expect(
      fixture.repository.revokeAuthoringActivationGrant(consumeInput),
    ).resolves.toBeNull();
  });

  it('does not authorize a viewer to approve an authoring request', async () => {
    const fixture = await createAuthoringActivationFixture({ membershipRole: 'viewer' });
    await expect(
      fixture.repository.approveAuthoringAuthorizationRequest({
        workspaceId: 'wk_a',
        requestId: fixture.request.requestId,
        stateHash: hashAuthoringAuthorizationState(fixture.rawState),
        creatorId: 'user_a',
        authorizationCodeHash: hashAuthoringAuthorizationCode(createAuthoringAuthorizationCode()),
        authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      }),
    ).resolves.toBeNull();
  });

  it('binds request approval and exchange to exact state, grant, origin, code, and PKCE', async () => {
    const fixture = await createAuthoringActivationFixture();
    const authorizationCodeHash = hashAuthoringAuthorizationCode(
      createAuthoringAuthorizationCode(),
    );
    await expect(
      fixture.repository.getAuthoringAuthorizationRequest('wk_b', fixture.request.requestId),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.approveAuthoringAuthorizationRequest({
        workspaceId: 'wk_a',
        requestId: fixture.request.requestId,
        stateHash: 'a'.repeat(64),
        creatorId: 'user_a',
        authorizationCodeHash,
        authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.approveAuthoringAuthorizationRequest({
        workspaceId: 'wk_a',
        requestId: fixture.request.requestId,
        stateHash: hashAuthoringAuthorizationState(fixture.rawState),
        creatorId: 'missing_creator',
        authorizationCodeHash,
        authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      }),
    ).resolves.toBeNull();

    await fixture.repository.approveAuthoringAuthorizationRequest({
      workspaceId: 'wk_a',
      requestId: fixture.request.requestId,
      stateHash: hashAuthoringAuthorizationState(fixture.rawState),
      creatorId: 'user_a',
      authorizationCodeHash,
      authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
    });
    const rawActivationGrant = createAuthoringActivationGrant();
    const validExchange = {
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      requestId: fixture.request.requestId,
      bootstrapGrantHash: hashPublicSdkBootstrapGrant(fixture.rawBootstrapGrant),
      stateHash: hashAuthoringAuthorizationState(fixture.rawState),
      authorizationCodeHash,
      codeVerifier: fixture.codeVerifier,
      activationGrantHash: hashAuthoringActivationGrant(rawActivationGrant),
      activationGrantExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    await expect(
      fixture.repository.exchangeAuthoringAuthorizationCode({
        ...validExchange,
        exactOrigin: 'https://other.example.com',
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.exchangeAuthoringAuthorizationCode({
        ...validExchange,
        bootstrapGrantHash: 'b'.repeat(64),
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.exchangeAuthoringAuthorizationCode({
        ...validExchange,
        stateHash: 'c'.repeat(64),
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.exchangeAuthoringAuthorizationCode({
        ...validExchange,
        authorizationCodeHash: 'd'.repeat(64),
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.exchangeAuthoringAuthorizationCode({
        ...validExchange,
        codeVerifier: 'x'.repeat(43),
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.exchangeAuthoringAuthorizationCode(validExchange),
    ).resolves.toMatchObject({ activationGrant: { grantHash: validExchange.activationGrantHash } });
  });

  it('consumes a bootstrap grant for at most one authorization request', async () => {
    const scope = await createAuthoringActivationScope();
    const codeVerifier = 'v'.repeat(64);
    await expect(
      scope.repository.createAuthoringAuthorizationRequest({
        installationId: scope.installationId,
        exactOrigin: scope.exactOrigin,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(scope.rawBootstrapGrant),
        stateHash: hashAuthoringAuthorizationState('unresolved_document_state'),
        codeChallenge: deriveAuthoringPkceS256Challenge(codeVerifier),
        requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT],
        documentIntent: { kind: 'existing', documentId: 'missing_document' },
        expiresAt: new Date(Date.now() + 180_000).toISOString(),
      }),
    ).resolves.toBeNull();
    const createRequest = (state: string) =>
      scope.repository.createAuthoringAuthorizationRequest({
        installationId: scope.installationId,
        exactOrigin: scope.exactOrigin,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(scope.rawBootstrapGrant),
        stateHash: hashAuthoringAuthorizationState(state),
        codeChallenge: deriveAuthoringPkceS256Challenge(codeVerifier),
        requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
        expiresAt: new Date(Date.now() + 180_000).toISOString(),
      });
    const requests = await Promise.all([createRequest('state_one'), createRequest('state_two')]);
    expect(requests.filter(Boolean)).toHaveLength(1);
  });

  it('rejects expired codes and current policy or membership revocation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
    try {
      const expiredFixture = await createAuthoringActivationFixture();
      const expiredCodeHash = hashAuthoringAuthorizationCode(createAuthoringAuthorizationCode());
      await expiredFixture.repository.approveAuthoringAuthorizationRequest({
        workspaceId: 'wk_a',
        requestId: expiredFixture.request.requestId,
        stateHash: hashAuthoringAuthorizationState(expiredFixture.rawState),
        creatorId: 'user_a',
        authorizationCodeHash: expiredCodeHash,
        authorizationCodeExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      vi.advanceTimersByTime(60_001);
      await expect(
        expiredFixture.repository.exchangeAuthoringAuthorizationCode({
          installationId: expiredFixture.installationId,
          exactOrigin: expiredFixture.exactOrigin,
          requestId: expiredFixture.request.requestId,
          bootstrapGrantHash: hashPublicSdkBootstrapGrant(expiredFixture.rawBootstrapGrant),
          stateHash: hashAuthoringAuthorizationState(expiredFixture.rawState),
          authorizationCodeHash: expiredCodeHash,
          codeVerifier: expiredFixture.codeVerifier,
          activationGrantHash: hashAuthoringActivationGrant(createAuthoringActivationGrant()),
          activationGrantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      ).resolves.toBeNull();

      const activationExpiryFixture = await createAuthoringActivationFixture();
      const activationExpiryCodeHash = hashAuthoringAuthorizationCode(
        createAuthoringAuthorizationCode(),
      );
      await activationExpiryFixture.repository.approveAuthoringAuthorizationRequest({
        workspaceId: 'wk_a',
        requestId: activationExpiryFixture.request.requestId,
        stateHash: hashAuthoringAuthorizationState(activationExpiryFixture.rawState),
        creatorId: 'user_a',
        authorizationCodeHash: activationExpiryCodeHash,
        authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      });
      const expiredActivationGrantHash = hashAuthoringActivationGrant(
        createAuthoringActivationGrant(),
      );
      await activationExpiryFixture.repository.exchangeAuthoringAuthorizationCode({
        installationId: activationExpiryFixture.installationId,
        exactOrigin: activationExpiryFixture.exactOrigin,
        requestId: activationExpiryFixture.request.requestId,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(activationExpiryFixture.rawBootstrapGrant),
        stateHash: hashAuthoringAuthorizationState(activationExpiryFixture.rawState),
        authorizationCodeHash: activationExpiryCodeHash,
        codeVerifier: activationExpiryFixture.codeVerifier,
        activationGrantHash: expiredActivationGrantHash,
        activationGrantExpiresAt: new Date(Date.now() + 10_000).toISOString(),
      });
      vi.advanceTimersByTime(10_001);
      await expect(
        activationExpiryFixture.repository.consumeAuthoringActivationGrant({
          installationId: activationExpiryFixture.installationId,
          exactOrigin: activationExpiryFixture.exactOrigin,
          grantHash: expiredActivationGrantHash,
        }),
      ).resolves.toBeNull();

      const policyFixture = await createAuthoringActivationFixture();
      const policyCodeHash = hashAuthoringAuthorizationCode(createAuthoringAuthorizationCode());
      await policyFixture.repository.approveAuthoringAuthorizationRequest({
        workspaceId: 'wk_a',
        requestId: policyFixture.request.requestId,
        stateHash: hashAuthoringAuthorizationState(policyFixture.rawState),
        creatorId: 'user_a',
        authorizationCodeHash: policyCodeHash,
        authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      });
      await policyFixture.repository.setPublicSdkInstallationOrigin({
        workspaceId: 'wk_a',
        installationId: policyFixture.installationId,
        environmentId: 'env_staging',
        origin: policyFixture.exactOrigin,
        authoringEnabled: false,
      });
      const activationGrantHash = hashAuthoringActivationGrant(createAuthoringActivationGrant());
      const exchangeInput = {
        installationId: policyFixture.installationId,
        exactOrigin: policyFixture.exactOrigin,
        requestId: policyFixture.request.requestId,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(policyFixture.rawBootstrapGrant),
        stateHash: hashAuthoringAuthorizationState(policyFixture.rawState),
        authorizationCodeHash: policyCodeHash,
        codeVerifier: policyFixture.codeVerifier,
        activationGrantHash,
        activationGrantExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      };
      await expect(
        policyFixture.repository.exchangeAuthoringAuthorizationCode(exchangeInput),
      ).resolves.toBeNull();
      await policyFixture.repository.setPublicSdkInstallationOrigin({
        workspaceId: 'wk_a',
        installationId: policyFixture.installationId,
        environmentId: 'env_staging',
        origin: policyFixture.exactOrigin,
        authoringEnabled: true,
      });
      await expect(
        policyFixture.repository.exchangeAuthoringAuthorizationCode(exchangeInput),
      ).resolves.toMatchObject({ activationGrant: { grantHash: activationGrantHash } });
      await policyFixture.repository.revokePublicSdkInstallation(
        'wk_a',
        policyFixture.installationId,
        'user_a',
      );
      await expect(
        policyFixture.repository.consumeAuthoringActivationGrant({
          installationId: policyFixture.installationId,
          exactOrigin: policyFixture.exactOrigin,
          grantHash: activationGrantHash,
        }),
      ).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('revokes an unused activation grant exactly once', async () => {
    const fixture = await createAuthoringActivationFixture();
    const authorizationCodeHash = hashAuthoringAuthorizationCode(
      createAuthoringAuthorizationCode(),
    );
    await fixture.repository.approveAuthoringAuthorizationRequest({
      workspaceId: 'wk_a',
      requestId: fixture.request.requestId,
      stateHash: hashAuthoringAuthorizationState(fixture.rawState),
      creatorId: 'user_a',
      authorizationCodeHash,
      authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
    });
    const grantHash = hashAuthoringActivationGrant(createAuthoringActivationGrant());
    await fixture.repository.exchangeAuthoringAuthorizationCode({
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      requestId: fixture.request.requestId,
      bootstrapGrantHash: hashPublicSdkBootstrapGrant(fixture.rawBootstrapGrant),
      stateHash: hashAuthoringAuthorizationState(fixture.rawState),
      authorizationCodeHash,
      codeVerifier: fixture.codeVerifier,
      activationGrantHash: grantHash,
      activationGrantExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    const grantInput = {
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      grantHash,
    };
    await expect(
      fixture.repository.revokeAuthoringActivationGrant(grantInput),
    ).resolves.toMatchObject({ revokedAt: expect.any(String), usedAt: null });
    await expect(fixture.repository.revokeAuthoringActivationGrant(grantInput)).resolves.toBeNull();
    await expect(
      fixture.repository.consumeAuthoringActivationGrant(grantInput),
    ).resolves.toBeNull();
  });

  it('atomically consumes an activation grant into one hash-only new-draft session', async () => {
    const fixture = await createExchangedActivationFixture({
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
      documentIntent: { kind: 'new-draft', documentType: 'tour' },
    });
    const theme = await fixture.repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Approved workspace theme',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_a',
    });
    const approvedTheme = await fixture.repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: theme.id,
      expectedRevision: theme.revision,
      expectedUpdatedAt: theme.updatedAt,
      actorUserId: 'user_a',
    });
    if (!approvedTheme) throw new Error('approved theme fixture missing');
    const rawSessionToken = createAuthoringSessionToken();
    const sessionTokenHash = hashAuthoringSessionToken(rawSessionToken);
    const sessionInput = {
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      activationGrantHash: hashAuthoringActivationGrant(fixture.rawActivationGrant),
      pageContext: { pathname: '/projects/123' },
      selectionScope: 'page' as const,
      documentIntent: { kind: 'new-draft', documentType: 'tour' } as const,
      correlationId: 'corr_activated_new_draft',
      sessionTokenHash,
      iframeSrc: 'https://editor.lodariq.com/authoring.html',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };

    await expect(
      fixture.repository.createAuthoringDocumentSessionFromActivation({
        ...sessionInput,
        selectionScope: 'workspace',
      }),
    ).resolves.toBeNull();

    const created =
      await fixture.repository.createAuthoringDocumentSessionFromActivation(sessionInput);
    expect(created).toMatchObject({
      documentCreated: true,
      activationGrant: { usedAt: expect.any(String) },
      session: {
        installationId: fixture.installationId,
        activationGrantId: fixture.exchange.activationGrant.grantId,
        workspaceId: 'wk_a',
        environmentId: 'env_staging',
        environment: 'staging',
        customerOrigin: fixture.exactOrigin,
        creatorId: 'user_a',
        tokenHash: sessionTokenHash,
        compilerVersion: COMPILER_VERSION,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
        themeVersionId: approvedTheme.approvedVersion.id,
        capabilities: getAuthoringDocumentSessionCapabilities('staging'),
      },
    });
    expect(JSON.stringify(created)).not.toContain(rawSessionToken);
    expect(JSON.stringify(created)).not.toContain(fixture.rawActivationGrant);

    const documentId = created?.session.documentId;
    if (!documentId) throw new Error('activated draft document id missing');
    await expect(fixture.repository.getDocument('wk_a', documentId)).resolves.toMatchObject({
      document: {
        id: documentId,
        workspaceId: 'wk_a',
        type: 'tour',
        status: 'draft',
        title: 'Untitled tour',
        trigger: {
          type: 'urlMatch',
          config: { pattern: `${fixture.exactOrigin}/projects/123`, mode: 'exact' },
        },
        blocks: [],
        targets: [],
        themeBinding: {
          policy: 'workspace-current',
          themeId: theme.id,
          acknowledgedThemeVersionId: approvedTheme.approvedVersion.id,
        },
      },
      createdByUserId: 'user_a',
    });
    await expect(fixture.repository.listDocumentVersions('wk_a', documentId)).resolves.toHaveLength(
      1,
    );
    await expect(
      fixture.repository.getCurrentPublication('wk_a', 'env_staging'),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.resolveAuthoringSession('wk_a', sessionTokenHash),
    ).resolves.toMatchObject({
      id: created.session.sessionId,
      documentId,
      installationId: fixture.installationId,
      activationGrantId: fixture.exchange.activationGrant.grantId,
      customerOrigin: fixture.exactOrigin,
      tokenHash: sessionTokenHash,
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: approvedTheme.approvedVersion.id,
    });
    await expect(
      fixture.repository.resolveAuthoringSessionByTokenHash(sessionTokenHash),
    ).resolves.toMatchObject({
      id: created.session.sessionId,
      workspaceId: 'wk_a',
      documentId,
      tokenHash: sessionTokenHash,
    });
    await expect(
      fixture.repository.resolveAuthoringSessionByTokenHash('not-a-sha256-hash'),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.revokeAuthoringSession({
        sessionId: created.session.sessionId,
        tokenHash: sessionTokenHash,
      }),
    ).resolves.toMatchObject({ id: created.session.sessionId, revokedAt: expect.any(String) });
    await expect(
      fixture.repository.revokeAuthoringSession({
        sessionId: created.session.sessionId,
        tokenHash: sessionTokenHash,
      }),
    ).resolves.toMatchObject({ id: created.session.sessionId, revokedAt: expect.any(String) });
    await expect(
      fixture.repository.resolveAuthoringSessionByTokenHash(sessionTokenHash),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.createAuthoringDocumentSessionFromActivation({
        ...sessionInput,
        sessionTokenHash: hashAuthoringSessionToken(createAuthoringSessionToken()),
      }),
    ).resolves.toBeNull();
  });

  it('browses route-matched Tours without consuming the activation grant', async () => {
    const pageDocument: LodariqDocument = {
      ...withDocumentIdentity(withWorkspace(baseDocument, 'wk_a'), 'doc_page', 'Page tour'),
      trigger: {
        type: 'urlMatch',
        config: { pattern: '/projects/123', mode: 'exact' },
      },
    };
    const globalDocument: LodariqDocument = {
      ...withDocumentIdentity(withWorkspace(baseDocument, 'wk_a'), 'doc_global', 'Global tour'),
      trigger: { type: 'pageLoad' },
    };
    const manualDocument = withDocumentIdentity(
      withWorkspace(baseDocument, 'wk_a'),
      'doc_manual',
      'Manual tour',
    );
    const fixture = await createExchangedActivationFixture({
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS],
      documents: [pageDocument, globalDocument, manualDocument],
    });
    const activationGrantHash = hashAuthoringActivationGrant(fixture.rawActivationGrant);
    const query = {
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      activationGrantHash,
      pageContext: { pathname: '/projects/123' },
    };

    await expect(
      fixture.repository.queryAuthoringDocumentsFromActivation({ ...query, scope: 'page' }),
    ).resolves.toMatchObject({
      scope: 'page',
      pageContext: query.pageContext,
      documents: expect.arrayContaining([
        expect.objectContaining({ id: pageDocument.id, releases: [] }),
        expect.objectContaining({ id: globalDocument.id, releases: [] }),
      ]),
    });
    const workspaceResult = await fixture.repository.queryAuthoringDocumentsFromActivation({
      ...query,
      scope: 'workspace',
    });
    expect(workspaceResult?.documents.map((document) => document.id)).toEqual(
      expect.arrayContaining([pageDocument.id, globalDocument.id, manualDocument.id]),
    );
    expect(
      matchesAuthoringPageContext(manualDocument, fixture.exactOrigin, query.pageContext),
    ).toBe(false);
    await expect(
      fixture.repository.consumeAuthoringActivationGrant({
        installationId: fixture.installationId,
        exactOrigin: fixture.exactOrigin,
        grantHash: activationGrantHash,
      }),
    ).resolves.toMatchObject({ usedAt: expect.any(String) });
  });

  it('rolls back a rejected document selection and creates exactly one scoped session', async () => {
    const selectedDocument = withDocumentIdentity(
      withWorkspace(baseDocument, 'wk_a'),
      'doc_selected_tour',
      'Selected tour',
    );
    const fixture = await createExchangedActivationFixture({
      requestedCapabilities: [
        AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS,
        AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT,
      ],
      documentIntent: { kind: 'existing', documentId: selectedDocument.id },
      documents: [selectedDocument],
    });
    const baseInput = {
      installationId: fixture.installationId,
      exactOrigin: fixture.exactOrigin,
      activationGrantHash: hashAuthoringActivationGrant(fixture.rawActivationGrant),
      pageContext: { pathname: '/projects/123' },
      selectionScope: 'workspace' as const,
      correlationId: 'corr_activated_existing',
      iframeSrc: 'https://editor.lodariq.com/authoring.html',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    await expect(
      fixture.repository.createAuthoringDocumentSessionFromActivation({
        ...baseInput,
        documentIntent: { kind: 'existing', documentId: 'doc_wrong_scope' },
        sessionTokenHash: hashAuthoringSessionToken(createAuthoringSessionToken()),
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.createAuthoringDocumentSessionFromActivation({
        ...baseInput,
        selectionScope: 'page',
        documentIntent: { kind: 'existing', documentId: selectedDocument.id },
        sessionTokenHash: hashAuthoringSessionToken(createAuthoringSessionToken()),
      }),
    ).resolves.toBeNull();

    const attempts = await Promise.all(
      [createAuthoringSessionToken(), createAuthoringSessionToken()].map((rawSessionToken) =>
        fixture.repository.createAuthoringDocumentSessionFromActivation({
          ...baseInput,
          documentIntent: { kind: 'existing', documentId: selectedDocument.id },
          sessionTokenHash: hashAuthoringSessionToken(rawSessionToken),
        }),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(attempts.find(Boolean)).toMatchObject({
      documentCreated: false,
      session: {
        documentId: selectedDocument.id,
        customerOrigin: fixture.exactOrigin,
        creatorId: 'user_a',
      },
    });
    await expect(fixture.repository.listDocuments('wk_a')).resolves.toHaveLength(1);
  });

  it('does not consume a grant that lacks the requested document capability', async () => {
    const fixture = await createExchangedActivationFixture({
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS],
      documentIntent: { kind: 'new-draft', documentType: 'tour' },
    });
    const grantHash = hashAuthoringActivationGrant(fixture.rawActivationGrant);
    await expect(
      fixture.repository.createAuthoringDocumentSessionFromActivation({
        installationId: fixture.installationId,
        exactOrigin: fixture.exactOrigin,
        activationGrantHash: grantHash,
        pageContext: { pathname: '/projects/123' },
        selectionScope: 'page',
        documentIntent: { kind: 'new-draft', documentType: 'tour' },
        correlationId: 'corr_missing_create_capability',
        sessionTokenHash: hashAuthoringSessionToken(createAuthoringSessionToken()),
        iframeSrc: 'https://editor.lodariq.com/authoring.html',
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.repository.consumeAuthoringActivationGrant({
        installationId: fixture.installationId,
        exactOrigin: fixture.exactOrigin,
        grantHash,
      }),
    ).resolves.toMatchObject({ usedAt: expect.any(String) });
    await expect(fixture.repository.listDocuments('wk_a')).resolves.toHaveLength(0);
  });

  it('rejects authorization writes for a maliciously seeded production scope', async () => {
    const now = new Date().toISOString();
    const installationId = 'ins_pub_0123456789abcdef';
    const exactOrigin = 'https://app.example.com';
    const rawBootstrapGrant = createPublicSdkBootstrapGrant();
    const bootstrapGrantHash = hashPublicSdkBootstrapGrant(rawBootstrapGrant);
    const repository = createInMemoryControlPlaneRepository({
      environments: [createEnvironmentFixture('env_production', 'production')],
      publicSdkInstallations: [
        {
          installationId,
          workspaceId: 'wk_a',
          name: 'Production application',
          createdByUserId: 'user_a',
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
        },
      ],
      publicSdkInstallationOrigins: [
        {
          installationId,
          workspaceId: 'wk_a',
          environmentId: 'env_production',
          exactOrigin,
          authoringEnabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      publicSdkBootstrapGrants: [
        {
          id: 'sdkboot_malicious_production_seed',
          installationId,
          workspaceId: 'wk_a',
          environmentId: 'env_production',
          exactOrigin,
          grantHash: bootstrapGrantHash,
          createdAt: now,
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
          consumedAt: null,
          revokedAt: null,
        },
      ],
    });

    await expect(
      repository.createAuthoringAuthorizationRequest({
        installationId,
        exactOrigin,
        bootstrapGrantHash,
        stateHash: hashAuthoringAuthorizationState('production_state'),
        codeChallenge: deriveAuthoringPkceS256Challenge('v'.repeat(64)),
        requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
      }),
    ).resolves.toBeNull();
  });

  it('creates and resolves short-lived authoring sessions inside one workspace', async () => {
    const environment: WorkspaceEnvironment = {
      id: 'env_staging',
      workspaceId: 'wk_a',
      kind: 'staging',
      name: 'Staging',
      originAllowlist: ['https://staging.lodariq.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const document = withWorkspace(baseDocument, 'wk_a');
    const repository = createInMemoryControlPlaneRepository({
      documents: [document],
      environments: [environment],
    });

    const session = await repository.createAuthoringSession({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      documentId: document.id,
      correlationId: 'corr_authoring_test',
      tokenHash: 'authoring_hash',
      iframeSrc: 'https://editor.lodariq.com/authoring.html',
      expiresAt: '2099-01-01T00:00:00.000Z',
      actorUserId: 'user_a',
    });

    expect(session).toMatchObject({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      environment: 'staging',
      documentId: document.id,
      correlationId: 'corr_authoring_test',
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
    });
    await expect(
      repository.resolveAuthoringSession('wk_a', 'authoring_hash'),
    ).resolves.toMatchObject({
      id: session.id,
      workspaceId: 'wk_a',
      environment: 'staging',
    });
    await expect(repository.resolveAuthoringSession('wk_b', 'authoring_hash')).resolves.toBeNull();
    await expect(repository.resolveAuthoringSession('wk_a', 'missing_hash')).resolves.toBeNull();
    await expect(
      repository.createAuthoringSession({
        workspaceId: 'wk_b',
        environmentId: 'env_staging',
        documentId: document.id,
        correlationId: 'corr_authoring_other',
        tokenHash: 'other_hash',
        iframeSrc: 'https://editor.lodariq.com/authoring.html',
        expiresAt: '2099-01-01T00:00:00.000Z',
        actorUserId: 'user_b',
      }),
    ).rejects.toThrow(/environment not found/);
  });

  it('does not resolve expired authoring sessions', async () => {
    const environment: WorkspaceEnvironment = {
      id: 'env_staging',
      workspaceId: 'wk_a',
      kind: 'staging',
      name: 'Staging',
      originAllowlist: ['https://staging.lodariq.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const document = withWorkspace(baseDocument, 'wk_a');
    const repository = createInMemoryControlPlaneRepository({
      documents: [document],
      environments: [environment],
      authoringSessions: [
        {
          id: 'authsess_expired',
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          environment: 'staging',
          documentId: document.id,
          correlationId: 'corr_expired_authoring',
          tokenHash: 'expired_hash',
          iframeSrc: 'https://editor.lodariq.com/authoring.html',
          createdByUserId: 'user_a',
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-01T00:00:01.000Z',
          revokedAt: null,
        },
      ],
    });

    await expect(repository.resolveAuthoringSession('wk_a', 'expired_hash')).resolves.toBeNull();
  });

  it('returns the latest compiled artifact inside the requested workspace only', async () => {
    const documentA = withWorkspace(baseDocument, 'wk_a');
    const documentB = withWorkspace(baseDocument, 'wk_b');
    const artifactA = await compileTestDocument(documentA);
    const artifactB = await compileTestDocument(documentB);
    const repository = createInMemoryControlPlaneRepository({
      documents: [documentA, documentB],
      compiledArtifacts: [
        {
          id: 'artifact_a_old',
          workspaceId: 'wk_a',
          documentId: documentA.id,
          contentHash: artifactA.contentHash,
          compilerVersion: artifactA.compilerVersion,
          compiled: artifactA,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'artifact_b_newer',
          workspaceId: 'wk_b',
          documentId: documentB.id,
          contentHash: artifactB.contentHash,
          compilerVersion: artifactB.compilerVersion,
          compiled: artifactB,
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    });

    await expect(repository.getLatestCompiledArtifact('wk_a')).resolves.toMatchObject({
      workspaceId: 'wk_a',
      documentId: documentA.id,
      contentHash: artifactA.contentHash,
    });
  });

  it('keeps published artifacts environment-scoped and immutable until republished', async () => {
    const environmentStaging: WorkspaceEnvironment = {
      id: 'env_staging',
      workspaceId: 'wk_a',
      kind: 'staging',
      name: 'Staging',
      originAllowlist: ['https://staging.lodariq.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const environmentDevelopment: WorkspaceEnvironment = {
      id: 'env_development',
      workspaceId: 'wk_a',
      kind: 'development',
      name: 'Development',
      originAllowlist: ['http://localhost:5175'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const repository = createInMemoryControlPlaneRepository({
      environments: [environmentStaging, environmentDevelopment],
    });
    const document = withWorkspace(baseDocument, 'wk_a');
    const initialSave = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document,
      artifact: await compileTestDocument(document),
    });
    if (!initialSave.latestArtifact) throw new Error('initial artifact missing');

    const firstPublication = await repository.publishCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      correlationId: 'corr_publish_initial',
      artifact: initialSave.latestArtifact,
      actorUserId: 'user_a',
    });
    expect(firstPublication).toMatchObject({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      environment: 'staging',
      documentId: document.id,
      correlationId: 'corr_publish_initial',
      contentHash: initialSave.latestArtifact.contentHash,
      action: 'publish',
      sourcePublicationId: null,
      previousPublicationId: null,
      releaseOperationId: null,
    });

    await expect(
      repository.getCurrentPublishedArtifact('wk_a', 'env_staging'),
    ).resolves.toMatchObject({
      contentHash: initialSave.latestArtifact.contentHash,
      documentId: document.id,
    });
    await expect(repository.listDocuments('wk_a')).resolves.toEqual([
      expect.objectContaining({
        id: document.id,
        createdByUserId: 'user_a',
        updatedByUserId: 'user_a',
        latestContentHash: initialSave.latestArtifact.contentHash,
        publications: [
          expect.objectContaining({
            environmentId: 'env_staging',
            environment: 'staging',
            contentHash: initialSave.latestArtifact.contentHash,
          }),
        ],
      }),
    ]);
    await expect(
      repository.getCurrentPublishedArtifact('wk_a', 'env_development'),
    ).resolves.toBeNull();
    await expect(repository.getCurrentPublishedArtifact('wk_b', 'env_staging')).resolves.toBeNull();

    const revisedDocument = structuredClone(document);
    const paragraph = revisedDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.type === 'paragraph',
    );
    if (!paragraph) throw new Error('fixture paragraph missing');
    paragraph.content = 'Revised published paragraph';

    const revisedSave = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_b',
      document: revisedDocument,
      artifact: await compileTestDocument(revisedDocument),
    });
    if (!revisedSave.latestArtifact) throw new Error('revised artifact missing');
    expect(revisedSave.latestArtifact.contentHash).not.toBe(initialSave.latestArtifact.contentHash);
    await expect(repository.listDocuments('wk_a')).resolves.toEqual([
      expect.objectContaining({
        id: document.id,
        createdByUserId: 'user_a',
        updatedByUserId: 'user_b',
        latestContentHash: revisedSave.latestArtifact.contentHash,
        publications: [
          expect.objectContaining({
            contentHash: initialSave.latestArtifact.contentHash,
          }),
        ],
      }),
    ]);

    await expect(
      repository.getCurrentPublishedArtifact('wk_a', 'env_staging'),
    ).resolves.toMatchObject({
      contentHash: initialSave.latestArtifact.contentHash,
    });

    await repository.publishCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      correlationId: 'corr_publish_revised',
      artifact: revisedSave.latestArtifact,
      actorUserId: 'user_b',
    });

    await expect(repository.getCurrentPublication('wk_a', 'env_staging')).resolves.toMatchObject({
      correlationId: 'corr_publish_revised',
      contentHash: revisedSave.latestArtifact.contentHash,
    });
    await expect(
      repository.getCurrentPublishedArtifact('wk_a', 'env_staging'),
    ).resolves.toMatchObject({
      contentHash: revisedSave.latestArtifact.contentHash,
    });
    await expect(repository.listDocuments('wk_a')).resolves.toEqual([
      expect.objectContaining({
        latestContentHash: revisedSave.latestArtifact.contentHash,
        publications: [
          expect.objectContaining({
            contentHash: revisedSave.latestArtifact.contentHash,
          }),
        ],
      }),
    ]);
  });

  it('advances only the published document pointer and rejects ambiguous environment-global reads', async () => {
    const environment: WorkspaceEnvironment = {
      id: 'env_staging',
      workspaceId: 'wk_a',
      kind: 'staging',
      name: 'Staging',
      originAllowlist: ['https://staging.lodariq.com'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const documentA = withDocumentIdentity(
      withWorkspace(baseDocument, 'wk_a'),
      'doc_primary',
      'Primary tour',
    );
    const documentB = withDocumentIdentity(
      withWorkspace(baseDocument, 'wk_a'),
      'doc_secondary',
      'Secondary tour',
    );
    const repository = createInMemoryControlPlaneRepository({ environments: [environment] });
    const savedA = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document: documentA,
      artifact: await compileTestDocument(documentA),
    });
    const savedB = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document: documentB,
      artifact: await compileTestDocument(documentB),
    });
    if (!savedA.latestArtifact || !savedB.latestArtifact) {
      throw new Error('compiled artifacts missing');
    }

    const activationAInput = {
      workspaceId: 'wk_a',
      environmentId: environment.id,
      correlationId: 'corr_primary_1',
      artifact: savedA.latestArtifact,
      actorUserId: 'user_a',
      idempotencyKey: 'publish:primary:1',
      requestHash: savedA.latestArtifact.contentHash,
      expectedGeneration: 0,
    } as const;
    const activationA = await repository.activateCompiledArtifact(activationAInput);
    const publicationA = activationA.publication;
    expect(publicationA).toMatchObject({
      action: 'publish',
      sourcePublicationId: null,
      previousPublicationId: null,
      releaseOperationId: activationA.operation.id,
    });
    const activationB = await repository.activateCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: environment.id,
      correlationId: 'corr_secondary_1',
      artifact: savedB.latestArtifact,
      actorUserId: 'user_a',
      idempotencyKey: 'publish:secondary:1',
      requestHash: savedB.latestArtifact.contentHash,
      expectedGeneration: 0,
    });
    const publicationB = activationB.publication;
    expect(publicationB).toMatchObject({
      action: 'publish',
      sourcePublicationId: null,
      previousPublicationId: null,
      releaseOperationId: activationB.operation.id,
    });

    await expect(repository.activateCompiledArtifact(activationAInput)).resolves.toMatchObject({
      replayed: true,
      publication: {
        id: publicationA.id,
        action: 'publish',
        previousPublicationId: null,
        releaseOperationId: activationA.operation.id,
      },
      deployment: { generation: 1 },
    });

    await expect(
      repository.getCurrentPublicationForDocument('wk_a', environment.id, documentA.id),
    ).resolves.toMatchObject({ id: publicationA.id });
    await expect(
      repository.getCurrentPublicationForDocument('wk_a', environment.id, documentB.id),
    ).resolves.toMatchObject({ id: publicationB.id });
    await expect(repository.getCurrentPublication('wk_a', environment.id)).rejects.toMatchObject({
      name: AmbiguousCurrentPublicationError.name,
      code: AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE,
      workspaceId: 'wk_a',
      environmentId: environment.id,
      documentIds: ['doc_primary', 'doc_secondary'],
    });

    const activationA2 = await repository.activateCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: environment.id,
      correlationId: 'corr_primary_2',
      artifact: savedA.latestArtifact,
      actorUserId: 'user_b',
      idempotencyKey: 'publish:primary:2',
      requestHash: savedA.latestArtifact.contentHash,
      expectedGeneration: 1,
    });
    const publicationA2 = activationA2.publication;
    expect(publicationA2).toMatchObject({
      action: 'publish',
      sourcePublicationId: null,
      previousPublicationId: publicationA.id,
      releaseOperationId: activationA2.operation.id,
    });
    await expect(
      repository.getDocumentDeployment('wk_a', environment.id, documentA.id),
    ).resolves.toMatchObject({
      state: 'active',
      activePublicationId: publicationA2.id,
      generation: 2,
    });
    await expect(
      repository.getDocumentDeployment('wk_a', environment.id, documentB.id),
    ).resolves.toMatchObject({
      state: 'active',
      activePublicationId: publicationB.id,
      generation: 1,
    });
    await expect(repository.listDocumentDeployments('wk_a', environment.id)).resolves.toHaveLength(
      2,
    );
    await expect(repository.listDocumentDeployments('wk_b')).resolves.toEqual([]);

    await expect(
      repository.activateCompiledArtifact({
        ...activationAInput,
        idempotencyKey: 'publish:primary:stale',
      }),
    ).rejects.toMatchObject({
      name: DeploymentChangedError.name,
      code: DEPLOYMENT_CHANGED_ERROR_CODE,
      expectedGeneration: 0,
      actualGeneration: 2,
    });
    await expect(
      repository.activateCompiledArtifact({
        ...activationAInput,
        requestHash: savedB.latestArtifact.contentHash,
      }),
    ).rejects.toMatchObject({
      name: IdempotencyConflictError.name,
      code: IDEMPOTENCY_CONFLICT_ERROR_CODE,
    });
    await expect(
      repository.activateCompiledArtifact({
        ...activationAInput,
        expectedGeneration: 2,
      }),
    ).rejects.toMatchObject({
      name: IdempotencyConflictError.name,
      code: IDEMPOTENCY_CONFLICT_ERROR_CODE,
    });
  });

  it('keeps deterministic legacy fallback and returns the sole active deployment', async () => {
    const environment: WorkspaceEnvironment = {
      id: 'env_staging',
      workspaceId: 'wk_a',
      kind: 'staging',
      name: 'Staging',
      originAllowlist: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const documentA = withDocumentIdentity(
      withWorkspace(baseDocument, 'wk_a'),
      'doc_primary',
      'Primary tour',
    );
    const documentB = withDocumentIdentity(
      withWorkspace(baseDocument, 'wk_a'),
      'doc_secondary',
      'Secondary tour',
    );
    const source = createInMemoryControlPlaneRepository({ environments: [environment] });
    const savedA = await source.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document: documentA,
      artifact: await compileTestDocument(documentA),
    });
    const savedB = await source.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document: documentB,
      artifact: await compileTestDocument(documentB),
    });
    if (!savedA.latestArtifact || !savedB.latestArtifact) {
      throw new Error('compiled artifacts missing');
    }
    const publishedA = await source.publishCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: environment.id,
      correlationId: 'corr_a',
      artifact: savedA.latestArtifact,
      actorUserId: 'user_a',
    });
    const publishedB = await source.publishCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: environment.id,
      correlationId: 'corr_b',
      artifact: savedB.latestArtifact,
      actorUserId: 'user_a',
    });
    const publishedAt = '2026-02-01T00:00:00.000Z';
    const legacyA = { ...publishedA, id: 'pub_a', publishedAt };
    const legacyZ = { ...publishedB, id: 'pub_z', publishedAt };

    const legacyRepository = createInMemoryControlPlaneRepository({
      publications: [legacyA, legacyZ],
    });
    await expect(
      legacyRepository.getCurrentPublication('wk_a', environment.id),
    ).resolves.toMatchObject({ id: 'pub_z' });

    const oneActiveRepository = createInMemoryControlPlaneRepository({
      publications: [legacyA, legacyZ],
      documentDeployments: [
        {
          workspaceId: 'wk_a',
          environmentId: environment.id,
          documentId: documentA.id,
          state: 'active',
          activePublicationId: legacyA.id,
          generation: 1,
          updatedAt: publishedAt,
        },
        {
          workspaceId: 'wk_a',
          environmentId: environment.id,
          documentId: documentB.id,
          state: 'inactive',
          activePublicationId: null,
          generation: 2,
          updatedAt: publishedAt,
        },
      ],
    });
    await expect(
      oneActiveRepository.getCurrentPublication('wk_a', environment.id),
    ).resolves.toMatchObject({ id: legacyA.id });
    await expect(
      oneActiveRepository.getCurrentPublicationForDocument('wk_a', environment.id, documentB.id),
    ).resolves.toBeNull();
  });
});

describe('tenant-scoped database baseline', () => {
  it('enables row-level security policies on every tenant-scoped table', () => {
    const migration = readInitialBaseline();

    for (const table of tenantScopedTableNames) {
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`alter table ${table} force row level security`);
      expect(migration).toContain(`create policy ${table}_workspace_isolation on ${table}`);
    }
    expect(migration).toContain("current_setting('lodariq.workspace_id', true)");
    expect(migration).toContain("current_setting('lodariq.environment_token_hash', true)");
    expect(migration).toContain('create policy environment_tokens_token_lookup');
    expect(migration).toContain('create policy environments_token_lookup');
  });

  it('adds document-scoped deployment pointers without a data backfill', () => {
    const migration = readInitialBaseline();

    expect(migration).toContain('create table if not exists document_deployments');
    expect(migration).toContain('primary key (workspace_id, environment_id, document_id)');
    expect(migration).toContain('document_deployments_active_publication_scope_fk');
    expect(migration).toContain(
      'foreign key (workspace_id, environment_id, document_id, active_publication_id)',
    );
    expect(migration).toContain('release_operations_idempotency_idx');
    expect(migration).toContain('release_operations_expected_generation_check');
    expect(migration).toContain('release_operations_idempotency_key_check');
    expect(migration).toContain('release_operations_request_hash_check');
    expect(migration).toContain('add column if not exists action lodariq_release_action');
    expect(migration).toContain('add column if not exists source_publication_id text');
    expect(migration).toContain('add column if not exists previous_publication_id text');
    expect(migration).toContain('add column if not exists release_operation_id text');
    expect(migration).toContain('publications_source_publication_scope_fk');
    expect(migration).toContain('publications_document_identity_idx');
    expect(migration).toContain('foreign key (workspace_id, document_id, source_publication_id)');
    expect(migration).not.toContain(
      'foreign key (workspace_id, environment_id, document_id, source_publication_id)',
    );
    expect(migration).toContain('publications_previous_publication_scope_fk');
    expect(migration).toContain('publications_release_operation_scope_fk');
    expect(migration).toContain('publications_release_operation_idx');
    expect(migration).toContain('publications_action_check');
    expect(migration).toContain('publications_release_provenance_check');
    expect(migration).toContain('theme_version_id text');
    expect(migration).toContain('theme_content_hash text');
    expect(migration).toContain('renderer_contract_version text');
    expect(migration).toContain('document_deployments_state_publication_check');
    expect(migration).toContain('document_deployments_workspace_environment_state_idx');
    expect(migration).toContain('document_deployments_workspace_document_idx');
    expect(migration).toContain('document_deployments_active_publication_idx');
    expect(migration).not.toMatch(
      /\b(?:insert\s+into|update\s+[A-Za-z_"]+\s+set|delete\s+from)\b/iu,
    );
  });

  it('adds exact-origin public installations and hash-only single-use bootstrap grants', () => {
    const migration = readInitialBaseline();

    expect(migration).toContain('create table if not exists public_sdk_installations');
    expect(migration).toContain('create table if not exists public_sdk_installation_origins');
    expect(migration).toContain('primary key (installation_id, exact_origin)');
    expect(migration).toContain('public_sdk_installation_origins_environment_scope_fk');
    expect(migration).toContain('public_sdk_installation_origins_exact_origin_check');
    expect(migration).toContain('create table if not exists public_sdk_bootstrap_grants');
    expect(migration).toContain('public_sdk_bootstrap_grants_hash_idx');
    expect(migration).toContain('public_sdk_bootstrap_grants_hash_check');
    expect(migration).toContain('public_sdk_bootstrap_grants_public_consume');
    expect(migration).toContain('consumed_at is null');
    expect(migration).toContain('environments_public_sdk_installation_lookup');
    expect(migration).toContain("current_setting('lodariq.public_installation_id', true)");
    expect(migration).toContain("current_setting('lodariq.public_origin', true)");
    expect(migration).toContain("current_setting('lodariq.bootstrap_grant_hash', true)");
    expect(migration).not.toMatch(
      /\b(?:insert\s+into|update\s+[A-Za-z_"]+\s+set|delete\s+from)\b/iu,
    );
  });

  it('adds hash-only authorization codes and activation grants with CAS and RLS gates', () => {
    const migration = readInitialBaseline();

    expect(migration).toContain('create table if not exists authoring_authorization_requests');
    expect(migration).toContain('create table if not exists authoring_activation_grants');
    expect(migration).toContain('bootstrap_grant_hash text not null');
    expect(migration).toContain('state_hash text not null');
    expect(migration).toContain('authorization_code_hash text');
    expect(migration).toContain('grant_hash text not null');
    expect(migration).not.toMatch(/\bauthorization_code\s+text\b/iu);
    expect(migration).not.toMatch(/\bactivation_grant\s+text\b/iu);
    expect(migration).toContain('authorization_code_used_at is null');
    expect(migration).toContain('used_at is null');
    expect(migration).toContain('revoked_at is null');
    expect(migration).toContain('expires_at > now()');
    expect(migration).toContain("environment.kind <> 'production'");
    expect(migration).toContain('authoring_authorization_requests_workspace_isolation');
    expect(migration).toContain('authoring_activation_grants_workspace_isolation');
    expect(migration).toContain('authoring_authorization_requests_public_exchange_consume');
    expect(migration).toContain('authoring_activation_grants_public_consume_or_revoke');
    expect(migration).toContain('alter table authoring_sessions');
    expect(migration).toContain('add column if not exists activation_grant_id text');
    expect(migration).toContain('add column if not exists customer_origin text');
    expect(migration).toContain('authoring_sessions_activation_scope_fk');
    expect(migration).toContain('authoring_sessions_activation_grant_idx');
    expect(migration).toContain('authoring_sessions_activation_scope_check');
    expect(migration).toContain('authoring_sessions_token_lookup');
    expect(migration).toContain("current_setting('lodariq.authoring_session_hash', true)");
    expect(migration).toMatch(
      /authoring_authorization_requests_scope_id_idx[\s\S]+?exact_origin,\s+creator_id,\s+id/iu,
    );
    expect(migration).toMatch(
      /authoring_activation_grants_session_scope_idx[\s\S]+?exact_origin,\s+creator_id,\s+id/iu,
    );
    expect(migration).not.toMatch(/\bauthoring_session_token\s+text\b/iu);
    expect(migration).toContain("current_setting('lodariq.authorization_state_hash', true)");
    expect(migration).toContain("current_setting('lodariq.authorization_code_hash', true)");
    expect(migration).toContain("current_setting('lodariq.activation_grant_hash', true)");
    for (const membershipGatedPolicy of [
      'authoring_activation_grants_public_exchange_create',
      'authoring_activation_grants_public_consume_or_revoke',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `create policy ${membershipGatedPolicy}[\\s\\S]{0,5000}membership\\.role in \\('owner', 'admin', 'member'\\)`,
          'u',
        ),
      );
    }
    expect(migration).not.toMatch(
      /\b(?:insert\s+into|update\s+[A-Za-z_"]+\s+set|delete\s+from)\b/iu,
    );
  });

  it('adds additive correlation indexes for publication and authoring traces', () => {
    const migration = readInitialBaseline();

    expect(migration).toContain('add column if not exists correlation_id text');
    expect(migration).toContain('create index if not exists publications_correlation_idx');
    expect(migration).toContain('create index if not exists authoring_sessions_correlation_idx');
  });
});

describe('workspace-scoped transaction runner', () => {
  it('sets the PostgreSQL workspace setting before running tenant work', async () => {
    const calls: string[] = [];
    const statements: unknown[] = [];
    const result = await runWithWorkspaceScope(
      {
        async transaction(operation) {
          calls.push('transaction:start');
          const value = await operation({
            async execute(statement) {
              statements.push(statement);
              calls.push('scope:set');
            },
          });
          calls.push('transaction:end');
          return value;
        },
      },
      'wk_a',
      async () => {
        calls.push('operation');
        return 'done';
      },
    );

    expect(result).toBe('done');
    expect(calls[0]).toBe('transaction:start');
    expect(calls[1]).toBe('scope:set');
    expect(calls[2]).toBe('operation');
    expect(calls[3]).toBe('transaction:end');
    expect(statements).toHaveLength(1);
  });

  it('sets the PostgreSQL token lookup setting before resolving SDK token context', async () => {
    const calls: string[] = [];
    const statements: unknown[] = [];
    const result = await runWithEnvironmentTokenLookupScope(
      {
        async transaction(operation) {
          calls.push('transaction:start');
          const value = await operation({
            async execute(statement) {
              statements.push(statement);
              calls.push('token-scope:set');
            },
          });
          calls.push('transaction:end');
          return value;
        },
      },
      'token_hash',
      async () => {
        calls.push('operation');
        return 'resolved';
      },
    );

    expect(result).toBe('resolved');
    expect(calls).toEqual(['transaction:start', 'token-scope:set', 'operation', 'transaction:end']);
    expect(statements).toHaveLength(1);
  });

  it('sets exact installation and origin scope before a public SDK lookup', async () => {
    const calls: string[] = [];
    const result = await runWithPublicSdkInstallationLookupScope(
      createScopeRunner(calls),
      'ins_pub_0123456789abcdef',
      'https://app.example.com',
      async () => {
        calls.push('operation');
        return 'resolved';
      },
    );

    expect(result).toBe('resolved');
    expect(calls).toEqual(['transaction:start', 'scope:set', 'operation', 'transaction:end']);
  });

  it('sets grant hash with exact installation and origin before a single-use consume', async () => {
    const calls: string[] = [];
    const result = await runWithPublicSdkBootstrapGrantLookupScope(
      createScopeRunner(calls),
      'ins_pub_0123456789abcdef',
      'https://app.example.com',
      'a'.repeat(64),
      async () => {
        calls.push('operation');
        return 'consumed';
      },
    );

    expect(result).toBe('consumed');
    expect(calls).toEqual(['transaction:start', 'scope:set', 'operation', 'transaction:end']);
  });

  it('fails closed for production API storage without DATABASE_URL', () => {
    expect(() =>
      createControlPlaneRepositoryFromEnvironment({
        env: { NODE_ENV: 'production' },
      }),
    ).toThrow(/DATABASE_URL is required/);
  });
});

function compileTestDocument(document: LodariqDocument) {
  return compileDocument({
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
}

interface AuthoringActivationFixtureOptions {
  requestedCapabilities?: AuthoringActivationCapability[];
  documentIntent?: AuthoringDocumentIntent;
  documents?: LodariqDocument[];
  membershipRole?: string;
}

async function createAuthoringActivationScope(
  options: Pick<AuthoringActivationFixtureOptions, 'documents' | 'membershipRole'> = {},
) {
  const environment = createEnvironmentFixture('env_staging', 'staging');
  const repository = createInMemoryControlPlaneRepository({
    environments: [environment],
    ...(options.documents ? { documents: options.documents } : {}),
    users: [
      {
        id: 'user_a',
        legacyIdentityId: 'retired_provider_user_a',
        email: 'creator@lodariq.test',
        name: 'Creator',
        createdAt: new Date().toISOString(),
      },
    ],
    workspaceMemberships: [
      {
        workspaceId: 'wk_a',
        userId: 'user_a',
        role: options.membershipRole ?? 'member',
        createdAt: new Date().toISOString(),
      },
    ],
  });
  const installationId = 'ins_pub_0123456789abcdef';
  const exactOrigin = 'https://app.example.com';
  await repository.getOrCreatePublicSdkInstallation({
    workspaceId: 'wk_a',
    installationId,
    name: 'Web application',
    actorUserId: 'user_a',
  });
  await repository.setPublicSdkInstallationOrigin({
    workspaceId: 'wk_a',
    installationId,
    environmentId: environment.id,
    origin: exactOrigin,
    authoringEnabled: true,
  });
  const rawBootstrapGrant = createPublicSdkBootstrapGrant();
  await repository.createPublicSdkBootstrapGrant({
    workspaceId: 'wk_a',
    installationId,
    environmentId: environment.id,
    exactOrigin,
    grantHash: hashPublicSdkBootstrapGrant(rawBootstrapGrant),
    expiresAt: new Date(Date.now() + 270_000).toISOString(),
  });
  return { repository, environment, installationId, exactOrigin, rawBootstrapGrant };
}

async function createAuthoringActivationFixture(options: AuthoringActivationFixtureOptions = {}) {
  const scope = await createAuthoringActivationScope(options);
  const rawState = `authoring_state_${'s'.repeat(32)}`;
  const codeVerifier = 'v'.repeat(64);
  const request = await scope.repository.createAuthoringAuthorizationRequest({
    installationId: scope.installationId,
    exactOrigin: scope.exactOrigin,
    bootstrapGrantHash: hashPublicSdkBootstrapGrant(scope.rawBootstrapGrant),
    stateHash: hashAuthoringAuthorizationState(rawState),
    codeChallenge: deriveAuthoringPkceS256Challenge(codeVerifier),
    requestedCapabilities: options.requestedCapabilities ?? [
      AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT,
    ],
    ...(options.documentIntent ? { documentIntent: options.documentIntent } : {}),
    expiresAt: new Date(Date.now() + 240_000).toISOString(),
  });
  if (!request) throw new Error('failed to create authoring authorization request fixture');
  return { ...scope, rawState, codeVerifier, request };
}

async function createExchangedActivationFixture(options: AuthoringActivationFixtureOptions) {
  const fixture = await createAuthoringActivationFixture(options);
  const authorizationCodeHash = hashAuthoringAuthorizationCode(createAuthoringAuthorizationCode());
  const approved = await fixture.repository.approveAuthoringAuthorizationRequest({
    workspaceId: 'wk_a',
    requestId: fixture.request.requestId,
    stateHash: hashAuthoringAuthorizationState(fixture.rawState),
    creatorId: 'user_a',
    authorizationCodeHash,
    authorizationCodeExpiresAt: new Date(Date.now() + 90_000).toISOString(),
  });
  if (!approved) throw new Error('failed to approve activation fixture');
  const rawActivationGrant = createAuthoringActivationGrant();
  const exchange = await fixture.repository.exchangeAuthoringAuthorizationCode({
    installationId: fixture.installationId,
    exactOrigin: fixture.exactOrigin,
    requestId: fixture.request.requestId,
    bootstrapGrantHash: hashPublicSdkBootstrapGrant(fixture.rawBootstrapGrant),
    stateHash: hashAuthoringAuthorizationState(fixture.rawState),
    authorizationCodeHash,
    codeVerifier: fixture.codeVerifier,
    activationGrantHash: hashAuthoringActivationGrant(rawActivationGrant),
    activationGrantExpiresAt: new Date(Date.now() + 120_000).toISOString(),
  });
  if (!exchange) throw new Error('failed to exchange activation fixture');
  return { ...fixture, rawActivationGrant, exchange };
}

function withWorkspace(document: LodariqDocument, workspaceId: string): LodariqDocument {
  return { ...structuredClone(document), workspaceId };
}

function withDocumentIdentity(
  document: LodariqDocument,
  id: string,
  title: string,
): LodariqDocument {
  return { ...structuredClone(document), id, title };
}

function createEnvironmentFixture(
  id: string,
  kind: WorkspaceEnvironment['kind'],
): WorkspaceEnvironment {
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    id,
    workspaceId: 'wk_a',
    kind,
    name: kind,
    originAllowlist: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createScopeRunner(calls: string[]) {
  return {
    async transaction<T>(operation: (transaction: { execute: () => Promise<void> }) => Promise<T>) {
      calls.push('transaction:start');
      const value = await operation({
        async execute() {
          calls.push('scope:set');
        },
      });
      calls.push('transaction:end');
      return value;
    },
  };
}
