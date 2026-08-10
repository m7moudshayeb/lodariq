import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readInitialBaseline } from './migration-test-utils.js';

const REPOSITORY_PATH = fileURLToPath(
  new URL('../../../database/src/drizzle-repository.ts', import.meta.url),
);
const SCHEMA_PATH = fileURLToPath(
  new URL('../../../database/src/schema.ts', import.meta.url),
);
const API_HELPER_PATH = fileURLToPath(
  new URL('../../../../apps/api/src/releases/recovery.ts', import.meta.url),
);

describe('release recovery clean baseline', () => {
  it('stores raw assertions separately from server-resolved scoped publication identities', () => {
    const sql = compactSql(readInitialBaseline());

    expect(sql).toContain('requested_source_publication_id text');
    expect(sql).toContain('requested_active_publication_id text');
    expect(sql).toContain('actual_active_publication_id text');
    expect(sql).toContain('reason text');
    expect(sql).toContain(
      compactSql(`constraint release_operations_actual_active_publication_scope_fk
        foreign key (workspace_id, environment_id, document_id, actual_active_publication_id)
        references publications(workspace_id, environment_id, document_id, id)`),
    );
    expect(sql).not.toMatch(
      /foreign key \([^)]*requested_(?:source|active)_publication_id[^)]*\)/u,
    );
    expect(sql).toContain(
      "action = 'rollback' and requested_source_publication_id is not null",
    );
    expect(sql).toContain(
      "action in ('rollback', 'unpublish') and reason is not null",
    );
    expect(sql).toContain("status = 'activating'");
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("status = 'failed'");
  });

  it('keeps artifacts and publications append-only and permits only terminal operation updates', () => {
    const sql = compactSql(readInitialBaseline());

    for (const table of ['compiled_artifacts', 'publications']) {
      expect(sql).toContain(`create policy ${table}_workspace_isolation on ${table} for select`);
      expect(sql).toContain(`create policy ${table}_workspace_insert on ${table} for insert`);
      expect(sql).not.toContain(`create policy ${table}_workspace_update`);
      expect(sql).not.toContain(`create policy ${table}_workspace_delete`);
    }
    expect(sql).toContain('create policy release_operations_lifecycle_update on release_operations');
    expect(sql).toContain("and status in ('awaiting_approval', 'activating')");
    expect(sql).toContain("and status in ('completed', 'failed')");

    const schema = readFileSync(SCHEMA_PATH, 'utf8');
    expect(schema).toContain('release_operations_requested_source_publication_check');
    expect(schema).toContain('release_operations_requested_active_publication_check');
    expect(schema).toContain('release_operations_actual_active_publication_scope_fk');
    expect(schema).toContain('release_operations_action_shape_check');
    expect(schema).toContain('release_operations_lifecycle_shape_check');
  });

  it('locks recovery authority and reuses exact persisted artifacts without a compiler path', () => {
    const repository = readFileSync(REPOSITORY_PATH, 'utf8');
    const method = repository.slice(
      repository.indexOf('  async recoverDocumentRelease('),
      repository.indexOf('  async activateCompiledArtifact('),
    );
    expect(method).toContain('this.lockSortedReleaseDocumentEnvironments(');
    expect(method).toContain(".for('update')");
    expect(method).toContain('isReleaseArtifactCurrentlyDeployable');
    expect(method).not.toContain('compileDocument');
    expect(method).not.toContain('@lodariq/compiler');

    const scopeLoader = repository.slice(
      repository.indexOf('  private async loadReleaseRecoveryScope('),
      repository.indexOf('  private async loadReleaseRecoveryOperations('),
    );
    expect(scopeLoader.match(/\.for\('share'\)/gu)).toHaveLength(3);

    const apiHelper = readFileSync(API_HELPER_PATH, 'utf8');
    expect(apiHelper).not.toContain('compileDocument');
    expect(apiHelper).not.toContain('@lodariq/compiler');
  });
});

function compactSql(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}
