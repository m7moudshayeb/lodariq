#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process, { stderr, stdout } from 'node:process';
import { neon } from '@neondatabase/serverless';

const tenantScopedTables = [
  'workspaces',
  'workspace_memberships',
  'environments',
  'environment_tokens',
  'public_sdk_installations',
  'public_sdk_installation_origins',
  'public_sdk_bootstrap_grants',
  'authoring_authorization_requests',
  'authoring_activation_grants',
  'themes',
  'theme_versions',
  'style_sources',
  'product_style_applications',
  'brand_drift_runs',
  'documents',
  'document_versions',
  'compiled_artifacts',
  'visual_check_runs',
  'publications',
  'publication_verifications',
  'release_operations',
  'release_approvals',
  'document_deployments',
  'authoring_sessions',
  'events',
  'analytics_events',
];

const identityScopedTables = [
  'users',
  'password_credentials',
  'auth_sessions',
  'email_verification_challenges',
  'auth_outbox',
  'set_password_challenges',
  'set_password_outbox',
  'auth_rate_limits',
];

const rlsProtectedTables = [...tenantScopedTables, ...identityScopedTables];
const appendOnlyPhase2Tables = [
  'compiled_artifacts',
  'publications',
  'style_sources',
  'product_style_applications',
  'brand_drift_runs',
  'publication_verifications',
  'release_approvals',
  'analytics_events',
];

const tokenLookupPolicies = new Map([
  ['environments', 'environments_token_lookup'],
  ['environment_tokens', 'environment_tokens_token_lookup'],
  ['authoring_sessions', 'authoring_sessions_token_lookup'],
]);

const identityPolicies = new Map([
  [
    'users',
    [
      'users_auth_self',
      'users_workspace_reference',
      'users_owned_signup',
      'users_email_verification_update',
      'users_set_password_email_lookup',
      'users_set_password_update',
    ],
  ],
  [
    'password_credentials',
    [
      'password_credentials_email_lookup',
      'password_credentials_owned_insert',
      'password_credentials_owned_update',
    ],
  ],
  [
    'auth_sessions',
    ['auth_sessions_token_lookup', 'auth_sessions_owned_insert', 'auth_sessions_token_update'],
  ],
  [
    'email_verification_challenges',
    [
      'email_verification_challenges_owned_insert',
      'email_verification_challenges_token_lookup',
      'email_verification_challenges_token_consume',
      'email_verification_challenges_set_password_invalidate',
    ],
  ],
  [
    'auth_outbox',
    [
      'auth_outbox_owned_insert',
      'auth_outbox_set_password_cancel',
      'auth_outbox_worker_select',
      'auth_outbox_worker_update',
    ],
  ],
  [
    'set_password_challenges',
    [
      'set_password_challenges_owned_insert',
      'set_password_challenges_token_lookup',
      'set_password_challenges_token_consume',
      'set_password_challenges_user_invalidate',
    ],
  ],
  [
    'set_password_outbox',
    [
      'set_password_outbox_owned_insert',
      'set_password_outbox_user_cancel',
      'set_password_outbox_worker_select',
      'set_password_outbox_worker_update',
    ],
  ],
  [
    'auth_rate_limits',
    [
      'auth_rate_limits_bucket_lookup',
      'auth_rate_limits_bucket_insert',
      'auth_rate_limits_bucket_update',
      'auth_rate_limits_prune_select',
      'auth_rate_limits_prune_delete',
    ],
  ],
]);

const identityBridgePolicies = new Map([
  ['workspaces', ['workspaces_user_discovery']],
  ['workspace_memberships', ['workspace_memberships_user_discovery']],
  ['authoring_authorization_requests', ['authoring_authorization_requests_auth_user_lookup']],
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
      and c.relname = any(${rlsProtectedTables})
  `;
  const tableState = new Map(tableRows.map((row) => [row.relname, row]));
  for (const table of rlsProtectedTables) {
    const row = tableState.get(table);
    if (!row) fail(`RLS-protected table ${table} is missing from the live database.`);
    if (!row.relrowsecurity) fail(`RLS-protected table ${table} does not have RLS enabled.`);
    if (!row.relforcerowsecurity) fail(`RLS-protected table ${table} does not force RLS.`);
  }

  const policyRows = await sql`
    select tablename, policyname, cmd
    from pg_policies
    where schemaname = current_schema()
      and tablename = any(${rlsProtectedTables})
  `;
  const policies = new Set(policyRows.map((row) => `${row.tablename}:${row.policyname}`));
  for (const table of tenantScopedTables) {
    const policy = `${table}:${table}_workspace_isolation`;
    if (!policies.has(policy)) fail(`Workspace isolation policy is missing for ${table}.`);
  }
  for (const table of appendOnlyPhase2Tables) {
    if (!policies.has(`${table}:${table}_workspace_insert`)) {
      fail(`Append-only insert policy is missing for ${table}.`);
    }
    const mutablePolicy = policyRows.find(
      (row) =>
        row.tablename === table &&
        (row.cmd === 'ALL' || row.cmd === 'UPDATE' || row.cmd === 'DELETE'),
    );
    if (mutablePolicy) {
      fail(`Append-only table ${table} exposes mutable policy ${mutablePolicy.policyname}.`);
    }
  }
  if (!policies.has('release_operations:release_operations_workspace_insert')) {
    fail('Release-operation insert policy is missing.');
  }
  if (!policies.has('release_operations:release_operations_lifecycle_update')) {
    fail('Release-operation lifecycle update policy is missing.');
  }
  const destructiveReleasePolicy = policyRows.find(
    (row) =>
      row.tablename === 'release_operations' && (row.cmd === 'ALL' || row.cmd === 'DELETE'),
  );
  if (destructiveReleasePolicy) {
    fail(`Release operations expose destructive policy ${destructiveReleasePolicy.policyname}.`);
  }
  for (const [table, policyName] of tokenLookupPolicies) {
    const policy = `${table}:${policyName}`;
    if (!policies.has(policy)) fail(`SDK token lookup policy is missing for ${table}.`);
  }
  verifyExpectedPolicies(policies, identityPolicies, 'Owned-auth');
  verifyExpectedPolicies(policies, identityBridgePolicies, 'Identity bridge');
}

function verifyExpectedPolicies(actualPolicies, expectedPolicies, label) {
  for (const [table, policyNames] of expectedPolicies) {
    for (const policyName of policyNames) {
      if (!actualPolicies.has(`${table}:${policyName}`)) {
        fail(`${label} policy ${policyName} is missing for ${table}.`);
      }
    }
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
    await expectBrandRowsHiddenFromOtherWorkspace(sql, workspaceB, workspaceA);
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

async function expectBrandRowsHiddenFromOtherWorkspace(sql, workspaceScope, hiddenWorkspaceId) {
  const [
    ,
    themeRows,
    versionRows,
    styleSourceRows,
    productStyleApplicationRows,
    brandDriftRows,
    visualRows,
    verificationRows,
    approvalRows,
    analyticsRows,
  ] = await sql.transaction((tx) => [
    tx`select set_config('lodariq.workspace_id', ${workspaceScope}, true)`,
    tx`select id from themes where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from theme_versions where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from style_sources where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from product_style_applications where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from brand_drift_runs where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from visual_check_runs where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from publication_verifications where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from release_approvals where workspace_id = ${hiddenWorkspaceId}`,
    tx`select id from analytics_events where workspace_id = ${hiddenWorkspaceId}`,
  ]);
  if (
    themeRows.length ||
    versionRows.length ||
    styleSourceRows.length ||
    productStyleApplicationRows.length ||
    brandDriftRows.length ||
    visualRows.length ||
    verificationRows.length ||
    approvalRows.length ||
    analyticsRows.length
  ) {
    fail('Workspace-scoped Phase 2 persistence leaked rows across tenants.');
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
  const analyticsEventId = `aevt_${documentId}_a`;
  const publicationCorrelationA = `corr_${publicationA}`;
  const publicationCorrelationB = `corr_${publicationB}`;
  const themeId = `theme_live_rls_${workspaceId.slice(-16)}`;
  const themeVersionId = `themev_live_rls_${workspaceId.slice(-16)}`;
  const visualCheckRunId = `vcheck_live_rls_${workspaceId.slice(-16)}`;
  const firstHash = `sha256-${'a'.repeat(64)}`;
  const secondHash = `sha256-${'b'.repeat(64)}`;
  const themeHash = `sha256-${'c'.repeat(64)}`;
  const firstDocument = createScratchDocument(workspaceId, documentId, 'Live RLS tour');
  const secondDocument = createScratchDocument(workspaceId, documentId, 'Live RLS tour revised');
  const themeDraft = { tokens: {}, recipes: {} };
  const themeSnapshot = {
    schemaVersion: '1',
    contractVersion: '1',
    themeId,
    themeVersionId,
    version: 1,
    name: 'Live RLS theme',
    contentHash: themeHash,
    definition: themeDraft,
  };
  const visualReport = {
    schemaVersion: '1',
    checkedAt: new Date().toISOString(),
    status: 'passed',
    issues: [],
  };

  const results = await sql.transaction((tx) => [
    tx`select set_config('lodariq.workspace_id', ${workspaceId}, true)`,
    tx`
        insert into themes (id, workspace_id, name, draft_json, revision, is_default)
        values (${themeId}, ${workspaceId}, 'Live RLS theme', ${JSON.stringify(themeDraft)}::jsonb, 1, true)
      `,
    tx`
        insert into theme_versions (
          id, workspace_id, theme_id, version, schema_version, contract_version,
          canonical_json, content_hash, approved_at
        ) values (
          ${themeVersionId}, ${workspaceId}, ${themeId}, 1, '1', '1',
          ${JSON.stringify(themeSnapshot)}::jsonb, ${themeHash}, now()
        )
      `,
    tx`
        update themes
        set active_version_id = ${themeVersionId}, revision = 2, updated_at = now()
        where workspace_id = ${workspaceId} and id = ${themeId}
      `,
    tx`
        insert into documents (id, workspace_id, type, status, title, schema_version, canonical)
        values (${documentId}, ${workspaceId}, 'tour', 'draft', ${firstDocument.title}, '1.0.0', ${JSON.stringify(firstDocument)}::jsonb)
      `,
    tx`
        insert into document_versions (id, workspace_id, document_id, version, canonical)
        values (${documentVersionA}, ${workspaceId}, ${documentId}, 1, ${JSON.stringify(firstDocument)}::jsonb)
      `,
    tx`
        insert into compiled_artifacts (
          id, workspace_id, document_id, document_version_id, content_hash,
          compiler_version, theme_version_id, theme_content_hash,
          renderer_contract_version, compiled
        ) values (
          ${artifactA}, ${workspaceId}, ${documentId}, ${documentVersionA}, ${firstHash},
          'live-smoke', ${themeVersionId}, ${themeHash}, '2',
          ${JSON.stringify(createScratchArtifact(documentId, firstHash))}::jsonb
        )
      `,
    tx`
        insert into publications (id, workspace_id, correlation_id, environment_id, document_id, document_version_id, compiled_artifact_id, content_hash)
        values (${publicationA}, ${workspaceId}, ${publicationCorrelationA}, ${environmentId}, ${documentId}, ${documentVersionA}, ${artifactA}, ${firstHash})
      `,
    tx`
        insert into analytics_events (
          id, workspace_id, environment_id, document_id, publication_id,
          content_hash, pointer_generation, name, sdk_version, occurred_at
        ) values (
          ${analyticsEventId}, ${workspaceId}, ${environmentId}, ${documentId}, ${publicationA},
          ${firstHash}, 1, 'tour.opened', 'live-smoke', now()
        )
      `,
    tx`
        insert into visual_check_runs (
          id, workspace_id, document_id, document_version_id, compiled_artifact_id,
          theme_version_id, environment_id, content_hash, report_json, status
        ) values (
          ${visualCheckRunId}, ${workspaceId}, ${documentId}, ${documentVersionA}, ${artifactA},
          ${themeVersionId}, ${environmentId}, ${firstHash},
          ${JSON.stringify(visualReport)}::jsonb, 'passed'
        )
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
  const versions = results.at(-2);
  const latestPublicationBeforeRepublish = results.at(-1);

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

  const [, themeRows, visualRows, immutableUpdateRows] = await sql.transaction((tx) => [
    tx`select set_config('lodariq.workspace_id', ${workspaceId}, true)`,
    tx`
      select id, active_version_id
      from themes
      where workspace_id = ${workspaceId} and id = ${themeId}
    `,
    tx`
      select id, status
      from visual_check_runs
      where workspace_id = ${workspaceId} and id = ${visualCheckRunId}
    `,
    tx`
      update theme_versions
      set version = 99
      where workspace_id = ${workspaceId} and id = ${themeVersionId}
      returning id
    `,
  ]);
  if (themeRows[0]?.active_version_id !== themeVersionId || visualRows[0]?.status !== 'passed') {
    fail('Live Brand Theme or visual-check persistence did not round-trip.');
  }
  if (immutableUpdateRows.length !== 0) {
    fail('Live runtime role unexpectedly mutated an immutable theme version.');
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
  const stagingReleasePolicy = JSON.stringify({
    allowDirectPublish: true,
    requireSourceVerification: false,
    requiredApprovalCount: 0,
    publisherRoles: ['owner', 'admin', 'member'],
    rollbackRoles: ['owner', 'admin'],
    unpublishRoles: ['owner', 'admin'],
    separationOfDuties: {
      requireSeparateVerifier: false,
      requireSeparateApprover: false,
    },
  });
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
        insert into environments (
          id,
          workspace_id,
          kind,
          name,
          origin_allowlist,
          required_approval_count,
          pipeline_position,
          authoring_enabled,
          release_policy_json
        )
        values (
          ${environmentId},
          ${workspaceId},
          'staging',
          'Live RLS staging',
          '["https://staging.lodariq.com"]'::jsonb,
          0,
          1,
          true,
          ${stagingReleasePolicy}::jsonb
        )
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
