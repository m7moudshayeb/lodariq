import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  createControlPlaneRepositoryFromEnvironment,
  createInMemoryControlPlaneRepository,
  runWithEnvironmentTokenLookupScope,
  runWithWorkspaceScope,
  tenantScopedTableNames,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const baseDocument = tourFixture as LodariqDocument;

describe('control-plane repository', () => {
  it('scopes documents and compiled artifacts by workspace', async () => {
    const document = withWorkspace(baseDocument, 'wk_a');
    const artifact = await compileDocument(document);
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
    const revisedDocument = { ...document, title: 'Welcome tour revised' };

    await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_a',
      document,
      artifact: await compileDocument(document),
    });
    const revised = await repository.saveDocument({
      workspaceId: 'wk_a',
      actorUserId: 'user_b',
      document: revisedDocument,
      artifact: await compileDocument(revisedDocument),
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
    const artifactA = await compileDocument(documentA);
    const artifactB = await compileDocument(documentB);
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
      originAllowlist: ['http://localhost:5173'],
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
      artifact: await compileDocument(document),
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
      artifact: await compileDocument(revisedDocument),
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
});

describe('Phase 1 RLS migration', () => {
  it('enables row-level security policies on every tenant-scoped table', () => {
    const migration = readFileSync(
      new URL('../../../database/drizzle/0000_phase_1_foundation.sql', import.meta.url),
      'utf8',
    );

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

  it('adds additive correlation indexes for publication and authoring traces', () => {
    const migration = readFileSync(
      new URL('../../../database/drizzle/0001_correlation_ids.sql', import.meta.url),
      'utf8',
    );

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

  it('fails closed for production API storage without DATABASE_URL', () => {
    expect(() =>
      createControlPlaneRepositoryFromEnvironment({
        env: { NODE_ENV: 'production' },
      }),
    ).toThrow(/DATABASE_URL is required/);
  });
});

function withWorkspace(document: LodariqDocument, workspaceId: string): LodariqDocument {
  return { ...structuredClone(document), workspaceId };
}
