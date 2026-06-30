#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process, { stderr, stdout } from 'node:process';
import { neon } from '@neondatabase/serverless';

const tenantScopedTables = [
  'workspaces',
  'workspace_memberships',
  'environments',
  'environment_tokens',
  'documents',
  'document_versions',
  'compiled_artifacts',
  'publications',
  'authoring_sessions',
  'events',
];

const tokenLookupPolicies = new Map([
  ['environments', 'environments_token_lookup'],
  ['environment_tokens', 'environment_tokens_token_lookup'],
]);

const writeCheckConsent = 'I_UNDERSTAND_THIS_WRITES_SCRATCH_ROWS';

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    fail('DATABASE_URL is required for live Neon RLS verification.');
  }

  if (process.env.LODARIQ_LIVE_RLS_WRITE_CHECK !== writeCheckConsent) {
    fail(
      [
        'LODARIQ_LIVE_RLS_WRITE_CHECK must be set before running live behavior checks.',
        `Set it to ${writeCheckConsent} on an isolated Neon branch or approved staging database.`,
      ].join('\n'),
    );
  }

  const sql = neon(databaseUrl);
  await verifyCatalogState(sql);
  await verifyScratchIsolation(sql);
  log('Live Neon RLS verification passed.');
}

async function verifyCatalogState(sql) {
  const roleRows = await sql`
    select rolname, rolbypassrls
    from pg_roles
    where rolname = current_user
  `;
  const role = roleRows[0];
  if (!role) fail('Unable to inspect current PostgreSQL role.');
  if (role.rolbypassrls) {
    fail(`Current PostgreSQL role ${role.rolname} has BYPASSRLS and is unsafe for app traffic.`);
  }

  const tableRows = await sql`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = current_schema()
      and c.relkind = 'r'
      and c.relname = any(${tenantScopedTables})
  `;
  const tableState = new Map(tableRows.map((row) => [row.relname, row]));
  for (const table of tenantScopedTables) {
    const row = tableState.get(table);
    if (!row) fail(`Tenant table ${table} is missing from the live database.`);
    if (!row.relrowsecurity) fail(`Tenant table ${table} does not have RLS enabled.`);
    if (!row.relforcerowsecurity) fail(`Tenant table ${table} does not force RLS.`);
  }

  const policyRows = await sql`
    select tablename, policyname
    from pg_policies
    where schemaname = current_schema()
      and tablename = any(${tenantScopedTables})
  `;
  const policies = new Set(policyRows.map((row) => `${row.tablename}:${row.policyname}`));
  for (const table of tenantScopedTables) {
    const policy = `${table}:${table}_workspace_isolation`;
    if (!policies.has(policy)) fail(`Workspace isolation policy is missing for ${table}.`);
  }
  for (const [table, policyName] of tokenLookupPolicies) {
    const policy = `${table}:${policyName}`;
    if (!policies.has(policy)) fail(`SDK token lookup policy is missing for ${table}.`);
  }
}

async function verifyScratchIsolation(sql) {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
  const workspaceA = `wk_live_rls_a_${suffix}`;
  const workspaceB = `wk_live_rls_b_${suffix}`;
  const environmentA = `env_live_rls_${suffix}`;
  const tokenHashA = `hash_live_rls_${suffix}`;

  try {
    await createScratchWorkspace(sql, workspaceA, environmentA, tokenHashA);
    await createScratchWorkspace(sql, workspaceB);

    await expectVisibleWorkspaces(sql, workspaceA, [workspaceA, workspaceB], [workspaceA]);
    await expectVisibleWorkspaces(sql, workspaceB, [workspaceA, workspaceB], [workspaceB]);
    await expectUnscopedTenantReadsAreClosed(sql, [workspaceA, workspaceB]);
    await expectVersionAndPublicationRecords(sql, workspaceA, environmentA);
    await expectTokenLookupScope(sql, tokenHashA, {
      workspaceId: workspaceA,
      environmentId: environmentA,
    });
  } finally {
    await cleanupScratchWorkspace(sql, workspaceA).catch((error) =>
      logError(`Scratch cleanup failed for ${workspaceA}: ${error.message}`),
    );
    await cleanupScratchWorkspace(sql, workspaceB).catch((error) =>
      logError(`Scratch cleanup failed for ${workspaceB}: ${error.message}`),
    );
  }
}

async function expectVersionAndPublicationRecords(sql, workspaceId, environmentId) {
  const documentId = `doc_live_rls_${workspaceId.slice(-16)}`;
  const documentVersionA = `${documentId}_v_1`;
  const documentVersionB = `${documentId}_v_2`;
  const artifactA = `artifact_${documentId}_a`;
  const artifactB = `artifact_${documentId}_b`;
  const publicationA = `pub_${documentId}_a`;
  const publicationB = `pub_${documentId}_b`;
  const publicationCorrelationA = `corr_${publicationA}`;
  const publicationCorrelationB = `corr_${publicationB}`;
  const firstHash = `sha256-${'a'.repeat(64)}`;
  const secondHash = `sha256-${'b'.repeat(64)}`;
  const firstDocument = createScratchDocument(workspaceId, documentId, 'Live RLS tour');
  const secondDocument = createScratchDocument(workspaceId, documentId, 'Live RLS tour revised');

  const [, , , , , , , versions, latestPublicationBeforeRepublish] = await sql.transaction((tx) => [
    tx`select set_config('lodariq.workspace_id', ${workspaceId}, true)`,
    tx`
        insert into documents (id, workspace_id, type, status, title, schema_version, canonical)
        values (${documentId}, ${workspaceId}, 'tour', 'draft', ${firstDocument.title}, '1.0.0', ${JSON.stringify(firstDocument)}::jsonb)
      `,
    tx`
        insert into document_versions (id, workspace_id, document_id, version, canonical)
        values (${documentVersionA}, ${workspaceId}, ${documentId}, 1, ${JSON.stringify(firstDocument)}::jsonb)
      `,
    tx`
        insert into compiled_artifacts (id, workspace_id, document_id, document_version_id, content_hash, compiler_version, compiled)
        values (${artifactA}, ${workspaceId}, ${documentId}, ${documentVersionA}, ${firstHash}, 'live-smoke', ${JSON.stringify(createScratchArtifact(documentId, firstHash))}::jsonb)
      `,
    tx`
        insert into publications (id, workspace_id, correlation_id, environment_id, document_id, document_version_id, compiled_artifact_id, content_hash)
        values (${publicationA}, ${workspaceId}, ${publicationCorrelationA}, ${environmentId}, ${documentId}, ${documentVersionA}, ${artifactA}, ${firstHash})
      `,
    tx`
        update documents
        set title = ${secondDocument.title},
          canonical = ${JSON.stringify(secondDocument)}::jsonb,
          updated_at = now()
        where id = ${documentId}
      `,
    tx`
        insert into document_versions (id, workspace_id, document_id, version, canonical)
        values (${documentVersionB}, ${workspaceId}, ${documentId}, 2, ${JSON.stringify(secondDocument)}::jsonb)
      `,
    tx`
        select version, canonical->>'title' as title
        from document_versions
        where document_id = ${documentId}
        order by version
      `,
    tx`
        select content_hash
        from publications
        where workspace_id = ${workspaceId}
          and environment_id = ${environmentId}
          and document_id = ${documentId}
        order by published_at desc
        limit 1
      `,
  ]);

  if (
    JSON.stringify(versions.map((row) => [row.version, row.title])) !==
    JSON.stringify([
      [1, firstDocument.title],
      [2, secondDocument.title],
    ])
  ) {
    fail('Live document version history did not persist both scratch versions.');
  }
  if (latestPublicationBeforeRepublish[0]?.content_hash !== firstHash) {
    fail('Live publication changed before an explicit republish.');
  }

  const [, , latestPublicationAfterRepublish] = await sql.transaction((tx) => [
    tx`select set_config('lodariq.workspace_id', ${workspaceId}, true)`,
    tx`
      insert into compiled_artifacts (id, workspace_id, document_id, document_version_id, content_hash, compiler_version, compiled)
      values (${artifactB}, ${workspaceId}, ${documentId}, ${documentVersionB}, ${secondHash}, 'live-smoke', ${JSON.stringify(createScratchArtifact(documentId, secondHash))}::jsonb)
    `,
    tx`
      insert into publications (id, workspace_id, correlation_id, environment_id, document_id, document_version_id, compiled_artifact_id, content_hash)
      values (${publicationB}, ${workspaceId}, ${publicationCorrelationB}, ${environmentId}, ${documentId}, ${documentVersionB}, ${artifactB}, ${secondHash})
      returning content_hash
    `,
  ]);

  if (latestPublicationAfterRepublish[0]?.content_hash !== secondHash) {
    fail('Live publication did not record the explicitly republished artifact.');
  }
}

async function createScratchWorkspace(sql, workspaceId, environmentId, tokenHash) {
  const queries = [
    (tx) => tx`select set_config('lodariq.workspace_id', ${workspaceId}, true)`,
    (tx) => tx`
      insert into workspaces (id, name)
      values (${workspaceId}, ${`Live RLS ${workspaceId}`})
    `,
  ];
  if (environmentId && tokenHash) {
    queries.push(
      (tx) => tx`
        insert into environments (id, workspace_id, kind, name, origin_allowlist)
        values (${environmentId}, ${workspaceId}, 'staging', 'Live RLS staging', '["https://staging.lodariq.com"]'::jsonb)
      `,
      (tx) => tx`
        insert into environment_tokens (id, workspace_id, environment_id, name, token_hash, token_prefix)
        values (${`envtok_${environmentId}`}, ${workspaceId}, ${environmentId}, 'Live RLS token', ${tokenHash}, 'lod_staging_live')
      `,
    );
  }

  await sql.transaction((tx) => queries.map((query) => query(tx)));
}

async function cleanupScratchWorkspace(sql, workspaceId) {
  await sql.transaction((tx) => [
    tx`select set_config('lodariq.workspace_id', ${workspaceId}, true)`,
    tx`delete from workspaces where id = ${workspaceId}`,
  ]);
}

async function expectVisibleWorkspaces(sql, workspaceScope, candidateIds, expectedIds) {
  const [, rows] = await sql.transaction((tx) => [
    tx`select set_config('lodariq.workspace_id', ${workspaceScope}, true)`,
    tx`
      select id
      from workspaces
      where id = any(${candidateIds})
      order by id
    `,
  ]);
  const actual = rows.map((row) => row.id);
  if (JSON.stringify(actual) !== JSON.stringify(expectedIds)) {
    fail(
      `Workspace scope ${workspaceScope} saw ${JSON.stringify(actual)}; expected ${JSON.stringify(
        expectedIds,
      )}.`,
    );
  }
}

async function expectUnscopedTenantReadsAreClosed(sql, candidateIds) {
  const rows = await sql`
    select id
    from workspaces
    where id = any(${candidateIds})
    order by id
  `;
  if (rows.length !== 0) {
    fail(`Unscoped tenant read returned ${rows.length} scratch workspace row(s).`);
  }
}

async function expectTokenLookupScope(sql, tokenHash, expected) {
  const [, tokenRows, environmentRows, workspaceRows] = await sql.transaction((tx) => [
    tx`select set_config('lodariq.environment_token_hash', ${tokenHash}, true)`,
    tx`
      select id, workspace_id, environment_id
      from environment_tokens
      where token_hash = ${tokenHash}
    `,
    tx`
      select id, workspace_id
      from environments
      where id = ${expected.environmentId}
    `,
    tx`
      select id
      from workspaces
      where id = ${expected.workspaceId}
    `,
  ]);

  if (tokenRows.length !== 1 || tokenRows[0].workspace_id !== expected.workspaceId) {
    fail('SDK token lookup policy did not expose exactly the matching environment token.');
  }
  if (environmentRows.length !== 1 || environmentRows[0].workspace_id !== expected.workspaceId) {
    fail('SDK token lookup policy did not expose exactly the matching environment.');
  }
  if (workspaceRows.length !== 0) {
    fail('SDK token lookup scope leaked workspace rows outside lodariq.workspace_id.');
  }
}

function createScratchDocument(workspaceId, documentId, title) {
  return {
    id: documentId,
    workspaceId,
    type: 'tour',
    status: 'draft',
    title,
    schemaVersion: '1.0.0',
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    targets: [],
    blocks: [],
  };
}

function createScratchArtifact(documentId, contentHash) {
  return {
    schemaVersion: '1.0.0',
    documentId,
    contentHash,
    compilerVersion: 'live-smoke',
    environment: 'staging',
    trigger: { type: 'manual' },
    steps: [],
  };
}

function log(message) {
  stdout.write(`${message}\n`);
}

function logError(message) {
  stderr.write(`${message}\n`);
}

function fail(message) {
  logError(message);
  process.exit(1);
}

await main();
