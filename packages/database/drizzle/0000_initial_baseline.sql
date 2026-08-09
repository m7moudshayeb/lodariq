-- Lodariq initial database baseline.
--
-- This is the sole pre-deployment baseline for a new, empty
-- Neon-compatible PostgreSQL database. It preserves the reviewed statement
-- order from the former 0000-0008 development migration chain.
--
-- Apply this file with a database-owner connection. Application traffic must
-- use the separately provisioned non-owner runtime role so FORCE ROW LEVEL
-- SECURITY remains effective.
--
-- Keep the transaction wrapper: a failed bootstrap must not leave a partially
-- initialized schema.

begin;

-- =============================================================================
-- Squashed source: 0000_phase_1_foundation.sql
-- =============================================================================

do $$ begin
  create type lodariq_environment as enum ('development', 'staging', 'production');
exception
  when duplicate_object then null;
end $$;

create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  clerk_user_id text not null unique,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists workspace_memberships (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_memberships_workspace_idx
  on workspace_memberships(workspace_id);

create table if not exists environments (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind lodariq_environment not null,
  name text not null,
  origin_allowlist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists environments_workspace_kind_idx
  on environments(workspace_id, kind);
create index if not exists environments_workspace_idx
  on environments(workspace_id);

create table if not exists environment_tokens (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null references environments(id) on delete cascade,
  name text not null,
  token_hash text not null,
  token_prefix text not null,
  is_sdk_snippet_token boolean not null default true,
  created_by_user_id text references users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists environment_tokens_hash_idx
  on environment_tokens(token_hash);
create index if not exists environment_tokens_workspace_idx
  on environment_tokens(workspace_id);
create index if not exists environment_tokens_environment_idx
  on environment_tokens(environment_id);

create table if not exists documents (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  type text not null,
  status text not null,
  title text not null,
  schema_version text not null,
  canonical jsonb not null,
  created_by_user_id text references users(id) on delete set null,
  updated_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_workspace_status_idx
  on documents(workspace_id, status);
create index if not exists documents_workspace_updated_idx
  on documents(workspace_id, updated_at);

create table if not exists document_versions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null references documents(id) on delete cascade,
  version integer not null,
  canonical jsonb not null,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists document_versions_document_version_idx
  on document_versions(document_id, version);
create index if not exists document_versions_workspace_idx
  on document_versions(workspace_id);

create table if not exists compiled_artifacts (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null references documents(id) on delete cascade,
  document_version_id text references document_versions(id) on delete set null,
  content_hash text not null,
  compiler_version text not null,
  compiled jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists compiled_artifacts_document_hash_idx
  on compiled_artifacts(workspace_id, document_id, content_hash);
create index if not exists compiled_artifacts_document_idx
  on compiled_artifacts(document_id);
create index if not exists compiled_artifacts_workspace_idx
  on compiled_artifacts(workspace_id);

create table if not exists publications (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null references environments(id) on delete cascade,
  document_id text not null references documents(id) on delete cascade,
  document_version_id text references document_versions(id) on delete set null,
  compiled_artifact_id text not null references compiled_artifacts(id) on delete restrict,
  content_hash text not null,
  published_by_user_id text references users(id) on delete set null,
  published_at timestamptz not null default now()
);

create index if not exists publications_environment_published_idx
  on publications(workspace_id, environment_id, published_at);
create index if not exists publications_document_idx
  on publications(document_id);
create index if not exists publications_artifact_idx
  on publications(compiled_artifact_id);

create table if not exists authoring_sessions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null references environments(id) on delete cascade,
  document_id text not null references documents(id) on delete cascade,
  token_hash text not null,
  iframe_src text not null,
  created_by_user_id text not null references users(id) on delete cascade,
  revoked_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists authoring_sessions_hash_idx
  on authoring_sessions(token_hash);
create index if not exists authoring_sessions_workspace_idx
  on authoring_sessions(workspace_id);
create index if not exists authoring_sessions_environment_idx
  on authoring_sessions(environment_id);
create index if not exists authoring_sessions_document_idx
  on authoring_sessions(document_id);
create index if not exists authoring_sessions_expires_idx
  on authoring_sessions(expires_at);

create table if not exists events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text references environments(id) on delete set null,
  document_id text references documents(id) on delete set null,
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists events_workspace_created_idx
  on events(workspace_id, created_at);
create index if not exists events_document_idx
  on events(document_id);

alter table workspaces enable row level security;
alter table workspace_memberships enable row level security;
alter table environments enable row level security;
alter table environment_tokens enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table compiled_artifacts enable row level security;
alter table publications enable row level security;
alter table authoring_sessions enable row level security;
alter table events enable row level security;

alter table workspaces force row level security;
alter table workspace_memberships force row level security;
alter table environments force row level security;
alter table environment_tokens force row level security;
alter table documents force row level security;
alter table document_versions force row level security;
alter table compiled_artifacts force row level security;
alter table publications force row level security;
alter table authoring_sessions force row level security;
alter table events force row level security;

create policy workspaces_workspace_isolation on workspaces
  using (id = current_setting('lodariq.workspace_id', true))
  with check (id = current_setting('lodariq.workspace_id', true));

create policy workspace_memberships_workspace_isolation on workspace_memberships
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy environments_workspace_isolation on environments
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy environments_token_lookup on environments
  for select
  using (
    exists (
      select 1
      from environment_tokens
      where environment_tokens.workspace_id = environments.workspace_id
        and environment_tokens.environment_id = environments.id
        and environment_tokens.token_hash = current_setting('lodariq.environment_token_hash', true)
        and environment_tokens.revoked_at is null
    )
  );

create policy environment_tokens_workspace_isolation on environment_tokens
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy environment_tokens_token_lookup on environment_tokens
  for select
  using (
    token_hash = current_setting('lodariq.environment_token_hash', true)
    and revoked_at is null
  );

create policy documents_workspace_isolation on documents
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy document_versions_workspace_isolation on document_versions
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy compiled_artifacts_workspace_isolation on compiled_artifacts
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy publications_workspace_isolation on publications
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy authoring_sessions_workspace_isolation on authoring_sessions
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy events_workspace_isolation on events
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

-- =============================================================================
-- Squashed source: 0001_correlation_ids.sql
-- =============================================================================

alter table publications
  add column if not exists correlation_id text;

create index if not exists publications_correlation_idx
  on publications(correlation_id);

alter table authoring_sessions
  add column if not exists correlation_id text;

create index if not exists authoring_sessions_correlation_idx
  on authoring_sessions(correlation_id);

-- =============================================================================
-- Squashed source: 0002_document_deployments.sql
-- =============================================================================

do $$ begin
  create type lodariq_document_deployment_state as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type lodariq_release_action as enum ('publish', 'promote', 'rollback', 'unpublish');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type lodariq_release_operation_status as enum (
    'awaiting_approval',
    'activating',
    'completed',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

alter table compiled_artifacts
  add column if not exists theme_version_id text,
  add column if not exists theme_content_hash text,
  add column if not exists renderer_contract_version text;

alter table publications
  add column if not exists action lodariq_release_action,
  add column if not exists source_publication_id text,
  add column if not exists previous_publication_id text,
  add column if not exists release_operation_id text;

create unique index if not exists environments_workspace_id_idx
  on environments(workspace_id, id);
create unique index if not exists documents_workspace_id_idx
  on documents(workspace_id, id);
create unique index if not exists publications_deployment_identity_idx
  on publications(workspace_id, environment_id, document_id, id);
create unique index if not exists publications_document_identity_idx
  on publications(workspace_id, document_id, id);
create unique index if not exists publications_release_operation_idx
  on publications(release_operation_id)
  where release_operation_id is not null;
create unique index if not exists compiled_artifacts_release_identity_idx
  on compiled_artifacts(workspace_id, document_id, id);

create table if not exists release_operations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  action lodariq_release_action not null,
  requested_artifact_id text,
  source_publication_id text,
  result_publication_id text,
  expected_generation integer not null,
  result_generation integer,
  idempotency_key text not null,
  request_hash text not null,
  status lodariq_release_operation_status not null,
  correlation_id text not null,
  requested_by_user_id text references users(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint release_operations_workspace_environment_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint release_operations_workspace_document_fk
    foreign key (workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint release_operations_requested_artifact_scope_fk
    foreign key (workspace_id, document_id, requested_artifact_id)
    references compiled_artifacts(workspace_id, document_id, id) on delete restrict,
  -- Promotion sources may live in staging while the operation targets production.
  constraint release_operations_source_publication_scope_fk
    foreign key (workspace_id, document_id, source_publication_id)
    references publications(workspace_id, document_id, id) on delete restrict,
  constraint release_operations_result_publication_scope_fk
    foreign key (workspace_id, environment_id, document_id, result_publication_id)
    references publications(workspace_id, environment_id, document_id, id) on delete restrict,
  constraint release_operations_expected_generation_check
    check (expected_generation >= 0),
  constraint release_operations_idempotency_key_check
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
  constraint release_operations_request_hash_check
    check (request_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint release_operations_result_generation_check
    check (result_generation is null or result_generation >= 0)
);

create unique index if not exists release_operations_idempotency_idx
  on release_operations(workspace_id, environment_id, document_id, idempotency_key);
create unique index if not exists release_operations_deployment_identity_idx
  on release_operations(workspace_id, environment_id, document_id, id);
create index if not exists release_operations_deployment_created_idx
  on release_operations(workspace_id, environment_id, document_id, created_at);

alter table publications
  -- Keep promotion provenance workspace/document scoped without forcing the
  -- source publication to share the destination environment.
  add constraint publications_source_publication_scope_fk
    foreign key (workspace_id, document_id, source_publication_id)
    references publications(workspace_id, document_id, id) on delete restrict,
  add constraint publications_previous_publication_scope_fk
    foreign key (workspace_id, environment_id, document_id, previous_publication_id)
    references publications(workspace_id, environment_id, document_id, id) on delete restrict,
  add constraint publications_release_operation_scope_fk
    foreign key (workspace_id, environment_id, document_id, release_operation_id)
    references release_operations(workspace_id, environment_id, document_id, id) on delete restrict,
  add constraint publications_action_check
    check (action is null or action <> 'unpublish'),
  add constraint publications_release_provenance_check
    check (release_operation_id is null or action is not null);

alter table release_operations enable row level security;
alter table release_operations force row level security;

create policy release_operations_workspace_isolation on release_operations
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create table if not exists document_deployments (
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  state lodariq_document_deployment_state not null default 'inactive',
  active_publication_id text,
  pending_release_operation_id text,
  generation integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, environment_id, document_id),
  constraint document_deployments_workspace_environment_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint document_deployments_workspace_document_fk
    foreign key (workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint document_deployments_active_publication_scope_fk
    foreign key (workspace_id, environment_id, document_id, active_publication_id)
    references publications(workspace_id, environment_id, document_id, id) on delete restrict,
  constraint document_deployments_pending_release_operation_scope_fk
    foreign key (workspace_id, environment_id, document_id, pending_release_operation_id)
    references release_operations(workspace_id, environment_id, document_id, id) on delete restrict,
  constraint document_deployments_generation_check
    check (generation >= 0),
  constraint document_deployments_state_publication_check
    check (
      (state = 'active' and active_publication_id is not null and generation >= 1)
      or
      (state = 'inactive' and active_publication_id is null)
    )
);

create index if not exists document_deployments_workspace_environment_state_idx
  on document_deployments(workspace_id, environment_id, state);
create index if not exists document_deployments_workspace_document_idx
  on document_deployments(workspace_id, document_id);
create unique index if not exists document_deployments_active_publication_idx
  on document_deployments(active_publication_id)
  where active_publication_id is not null;

alter table document_deployments enable row level security;
alter table document_deployments force row level security;

create policy document_deployments_workspace_isolation on document_deployments
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

-- =============================================================================
-- Squashed source: 0003_public_sdk_installations.sql
-- =============================================================================

create table if not exists public_sdk_installations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  created_by_user_id text references users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_sdk_installations_id_check
    check (id ~ '^ins_pub_[A-Za-z0-9_-]{16,128}$')
);

create unique index if not exists public_sdk_installations_workspace_id_idx
  on public_sdk_installations(workspace_id, id);
create index if not exists public_sdk_installations_workspace_idx
  on public_sdk_installations(workspace_id);
create index if not exists public_sdk_installations_revoked_idx
  on public_sdk_installations(revoked_at);

create table if not exists public_sdk_installation_origins (
  installation_id text not null,
  workspace_id text not null,
  environment_id text not null,
  exact_origin text not null,
  authoring_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (installation_id, exact_origin),
  constraint public_sdk_installation_origins_installation_scope_fk
    foreign key (workspace_id, installation_id)
    references public_sdk_installations(workspace_id, id) on delete cascade,
  constraint public_sdk_installation_origins_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint public_sdk_installation_origins_exact_origin_check
    check (exact_origin ~ '^https?://[^/?#@]+$')
);

create index if not exists public_sdk_installation_origins_workspace_idx
  on public_sdk_installation_origins(workspace_id);
create index if not exists public_sdk_installation_origins_environment_idx
  on public_sdk_installation_origins(workspace_id, environment_id);

create table if not exists public_sdk_bootstrap_grants (
  id text primary key,
  installation_id text not null,
  workspace_id text not null,
  environment_id text not null,
  exact_origin text not null,
  grant_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint public_sdk_bootstrap_grants_installation_scope_fk
    foreign key (workspace_id, installation_id)
    references public_sdk_installations(workspace_id, id) on delete cascade,
  constraint public_sdk_bootstrap_grants_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint public_sdk_bootstrap_grants_origin_fk
    foreign key (installation_id, exact_origin)
    references public_sdk_installation_origins(installation_id, exact_origin) on delete cascade,
  constraint public_sdk_bootstrap_grants_hash_check
    check (grant_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists public_sdk_bootstrap_grants_hash_idx
  on public_sdk_bootstrap_grants(grant_hash);
create index if not exists public_sdk_bootstrap_grants_workspace_idx
  on public_sdk_bootstrap_grants(workspace_id);
create index if not exists public_sdk_bootstrap_grants_installation_expires_idx
  on public_sdk_bootstrap_grants(installation_id, expires_at);

alter table public_sdk_installations enable row level security;
alter table public_sdk_installations force row level security;
alter table public_sdk_installation_origins enable row level security;
alter table public_sdk_installation_origins force row level security;
alter table public_sdk_bootstrap_grants enable row level security;
alter table public_sdk_bootstrap_grants force row level security;

create policy public_sdk_installations_workspace_isolation on public_sdk_installations
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy public_sdk_installation_origins_workspace_isolation on public_sdk_installation_origins
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy public_sdk_bootstrap_grants_workspace_isolation on public_sdk_bootstrap_grants
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy public_sdk_installations_public_lookup on public_sdk_installations
  for select
  using (
    id = current_setting('lodariq.public_installation_id', true)
    and revoked_at is null
  );

create policy public_sdk_installation_origins_public_lookup on public_sdk_installation_origins
  for select
  using (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and exists (
      select 1
      from public_sdk_installations installation
      where installation.workspace_id = public_sdk_installation_origins.workspace_id
        and installation.id = public_sdk_installation_origins.installation_id
        and installation.revoked_at is null
    )
  );

create policy environments_public_sdk_installation_lookup on environments
  for select
  using (
    exists (
      select 1
      from public_sdk_installation_origins origin_mapping
      inner join public_sdk_installations installation
        on installation.workspace_id = origin_mapping.workspace_id
        and installation.id = origin_mapping.installation_id
      where origin_mapping.workspace_id = environments.workspace_id
        and origin_mapping.environment_id = environments.id
        and origin_mapping.installation_id = current_setting('lodariq.public_installation_id', true)
        and origin_mapping.exact_origin = current_setting('lodariq.public_origin', true)
        and installation.revoked_at is null
    )
  );

create policy public_sdk_bootstrap_grants_public_lookup on public_sdk_bootstrap_grants
  for select
  using (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and consumed_at is null
    and revoked_at is null
    and expires_at > now()
  );

create policy public_sdk_bootstrap_grants_public_consume on public_sdk_bootstrap_grants
  for update
  using (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and consumed_at is null
    and revoked_at is null
    and expires_at > now()
  )
  with check (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and revoked_at is null
    and expires_at > now()
  );

-- =============================================================================
-- Squashed source: 0004_authoring_activation.sql
-- =============================================================================

create unique index if not exists public_sdk_bootstrap_grants_id_hash_idx
  on public_sdk_bootstrap_grants(id, grant_hash);

create table if not exists authoring_authorization_requests (
  id text primary key,
  bootstrap_grant_id text not null,
  bootstrap_grant_hash text not null,
  installation_id text not null,
  workspace_id text not null,
  environment_id text not null,
  exact_origin text not null,
  state_hash text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  requested_capabilities jsonb not null,
  document_intent jsonb,
  creator_id text references users(id) on delete restrict,
  authorization_code_hash text,
  expires_at timestamptz not null,
  approved_at timestamptz,
  authorization_code_expires_at timestamptz,
  authorization_code_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint authoring_authorization_requests_bootstrap_grant_fk
    foreign key (bootstrap_grant_id, bootstrap_grant_hash)
    references public_sdk_bootstrap_grants(id, grant_hash) on delete cascade,
  constraint authoring_authorization_requests_installation_scope_fk
    foreign key (workspace_id, installation_id)
    references public_sdk_installations(workspace_id, id) on delete cascade,
  constraint authoring_authorization_requests_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint authoring_authorization_requests_origin_fk
    foreign key (installation_id, exact_origin)
    references public_sdk_installation_origins(installation_id, exact_origin) on delete cascade,
  constraint authoring_authorization_requests_exact_origin_check
    check (exact_origin ~ '^https?://[^/?#@]+$'),
  constraint authoring_authorization_requests_hashes_check
    check (
      bootstrap_grant_hash ~ '^[0-9a-f]{64}$'
      and state_hash ~ '^[0-9a-f]{64}$'
      and (authorization_code_hash is null or authorization_code_hash ~ '^[0-9a-f]{64}$')
    ),
  constraint authoring_authorization_requests_pkce_check
    check (
      code_challenge_method = 'S256'
      and code_challenge ~ '^[A-Za-z0-9._~-]{43,128}$'
    ),
  constraint authoring_authorization_requests_capabilities_check
    check (
      jsonb_typeof(requested_capabilities) = 'array'
      and jsonb_array_length(requested_capabilities) between 1 and 3
      and requested_capabilities <@ '["documents:create","documents:list","documents:select"]'::jsonb
    ),
  constraint authoring_authorization_requests_approval_check
    check (
      (
        creator_id is null
        and authorization_code_hash is null
        and approved_at is null
        and authorization_code_expires_at is null
        and authorization_code_used_at is null
      )
      or
      (
        creator_id is not null
        and authorization_code_hash is not null
        and approved_at is not null
        and authorization_code_expires_at is not null
      )
    )
);

create unique index if not exists authoring_authorization_requests_bootstrap_grant_idx
  on authoring_authorization_requests(bootstrap_grant_id);
create unique index if not exists authoring_authorization_requests_scope_id_idx
  on authoring_authorization_requests(
    workspace_id,
    environment_id,
    installation_id,
    exact_origin,
    creator_id,
    id
  );
create unique index if not exists authoring_authorization_requests_code_hash_idx
  on authoring_authorization_requests(authorization_code_hash)
  where authorization_code_hash is not null;
create index if not exists authoring_authorization_requests_workspace_idx
  on authoring_authorization_requests(workspace_id);
create index if not exists authoring_authorization_requests_expires_idx
  on authoring_authorization_requests(expires_at);

create table if not exists authoring_activation_grants (
  id text primary key,
  request_id text not null,
  installation_id text not null,
  workspace_id text not null,
  environment_id text not null,
  exact_origin text not null,
  creator_id text not null references users(id) on delete restrict,
  capabilities jsonb not null,
  document_intent jsonb,
  grant_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint authoring_activation_grants_request_scope_fk
    foreign key (
      workspace_id,
      environment_id,
      installation_id,
      exact_origin,
      creator_id,
      request_id
    )
    references authoring_authorization_requests(
      workspace_id,
      environment_id,
      installation_id,
      exact_origin,
      creator_id,
      id
    ) on delete cascade,
  constraint authoring_activation_grants_exact_origin_check
    check (exact_origin ~ '^https?://[^/?#@]+$'),
  constraint authoring_activation_grants_hash_check
    check (grant_hash ~ '^[0-9a-f]{64}$'),
  constraint authoring_activation_grants_capabilities_check
    check (
      jsonb_typeof(capabilities) = 'array'
      and jsonb_array_length(capabilities) between 1 and 3
      and capabilities <@ '["documents:create","documents:list","documents:select"]'::jsonb
    ),
  constraint authoring_activation_grants_consumption_check
    check (not (used_at is not null and revoked_at is not null))
);

create unique index if not exists authoring_activation_grants_hash_idx
  on authoring_activation_grants(grant_hash);
create unique index if not exists authoring_activation_grants_session_scope_idx
  on authoring_activation_grants(
    workspace_id,
    environment_id,
    installation_id,
    exact_origin,
    creator_id,
    id
  );
create index if not exists authoring_activation_grants_workspace_idx
  on authoring_activation_grants(workspace_id);
create index if not exists authoring_activation_grants_expires_idx
  on authoring_activation_grants(expires_at);

alter table authoring_sessions
  add column if not exists installation_id text,
  add column if not exists activation_grant_id text,
  add column if not exists customer_origin text,
  add column if not exists capabilities jsonb;

alter table authoring_sessions
  add constraint authoring_sessions_activation_scope_fk
  foreign key (
    workspace_id,
    environment_id,
    installation_id,
    customer_origin,
    created_by_user_id,
    activation_grant_id
  ) references authoring_activation_grants(
    workspace_id,
    environment_id,
    installation_id,
    exact_origin,
    creator_id,
    id
  ) on delete restrict;

create unique index if not exists authoring_sessions_activation_grant_idx
  on authoring_sessions(activation_grant_id)
  where activation_grant_id is not null;

alter table authoring_sessions
  add constraint authoring_sessions_activation_scope_check
  check (
    (
      installation_id is null
      and activation_grant_id is null
      and customer_origin is null
      and capabilities is null
    )
    or
    (
      installation_id is not null
      and activation_grant_id is not null
      and customer_origin is not null
      and capabilities is not null
    )
  ),
  add constraint authoring_sessions_customer_origin_check
  check (customer_origin is null or customer_origin ~ '^https?://[^/?#@]+$'),
  add constraint authoring_sessions_capabilities_check
  check (
    capabilities is null
    or (
      jsonb_typeof(capabilities) = 'array'
      and jsonb_array_length(capabilities) between 1 and 6
      and capabilities <@ '["document:preview","document:publish-staging","document:read","document:read-release-state","target:select","document:write"]'::jsonb
    )
  );

-- The hosted editor starts with only the opaque session bearer. This narrow
-- lookup policy reveals one active session row so the repository can derive
-- its workspace before switching to the normal workspace-scoped policies.
create policy authoring_sessions_token_lookup
  on authoring_sessions
  for select
  using (
    token_hash = current_setting('lodariq.authoring_session_hash', true)
    and revoked_at is null
    and expires_at > now()
  );

alter table authoring_authorization_requests enable row level security;
alter table authoring_authorization_requests force row level security;
alter table authoring_activation_grants enable row level security;
alter table authoring_activation_grants force row level security;

create policy authoring_authorization_requests_workspace_isolation on authoring_authorization_requests
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy authoring_activation_grants_workspace_isolation on authoring_activation_grants
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

-- A consumed bootstrap grant remains readable only for the exact request and
-- exchange binding. This does not make it consumable a second time.
create policy public_sdk_bootstrap_grants_authorization_binding_lookup
  on public_sdk_bootstrap_grants
  for select
  using (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and consumed_at is not null
    and revoked_at is null
    and expires_at > now()
  );

create policy authoring_authorization_requests_public_create
  on authoring_authorization_requests
  for insert
  with check (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and bootstrap_grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and creator_id is null
    and authorization_code_hash is null
    and approved_at is null
    and authorization_code_expires_at is null
    and authorization_code_used_at is null
    and expires_at > now()
    and exists (
      select 1
      from public_sdk_bootstrap_grants bootstrap
      inner join public_sdk_installation_origins origin_mapping
        on origin_mapping.installation_id = bootstrap.installation_id
        and origin_mapping.exact_origin = bootstrap.exact_origin
        and origin_mapping.workspace_id = bootstrap.workspace_id
        and origin_mapping.environment_id = bootstrap.environment_id
      inner join public_sdk_installations installation
        on installation.id = bootstrap.installation_id
        and installation.workspace_id = bootstrap.workspace_id
      inner join environments environment
        on environment.id = bootstrap.environment_id
        and environment.workspace_id = bootstrap.workspace_id
      where bootstrap.id = authoring_authorization_requests.bootstrap_grant_id
        and bootstrap.grant_hash = authoring_authorization_requests.bootstrap_grant_hash
        and bootstrap.installation_id = authoring_authorization_requests.installation_id
        and bootstrap.workspace_id = authoring_authorization_requests.workspace_id
        and bootstrap.environment_id = authoring_authorization_requests.environment_id
        and bootstrap.exact_origin = authoring_authorization_requests.exact_origin
        and bootstrap.consumed_at is not null
        and bootstrap.revoked_at is null
        and bootstrap.expires_at > now()
        and installation.revoked_at is null
        and origin_mapping.authoring_enabled = true
        and environment.kind <> 'production'
    )
  );

create policy authoring_authorization_requests_public_exchange_lookup
  on authoring_authorization_requests
  for select
  using (
    id = current_setting('lodariq.authorization_request_id', true)
    and installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and bootstrap_grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and state_hash = current_setting('lodariq.authorization_state_hash', true)
    and authorization_code_hash = current_setting('lodariq.authorization_code_hash', true)
    and expires_at > now()
    and authorization_code_expires_at > now()
  );

create policy authoring_authorization_requests_public_exchange_consume
  on authoring_authorization_requests
  for update
  using (
    id = current_setting('lodariq.authorization_request_id', true)
    and installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and bootstrap_grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and state_hash = current_setting('lodariq.authorization_state_hash', true)
    and authorization_code_hash = current_setting('lodariq.authorization_code_hash', true)
    and authorization_code_used_at is null
    and expires_at > now()
    and authorization_code_expires_at > now()
  )
  with check (
    id = current_setting('lodariq.authorization_request_id', true)
    and installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and bootstrap_grant_hash = current_setting('lodariq.bootstrap_grant_hash', true)
    and state_hash = current_setting('lodariq.authorization_state_hash', true)
    and authorization_code_hash = current_setting('lodariq.authorization_code_hash', true)
    and authorization_code_used_at is not null
    and expires_at > now()
    and authorization_code_expires_at > now()
  );

create policy authoring_activation_grants_public_exchange_create
  on authoring_activation_grants
  for insert
  with check (
    request_id = current_setting('lodariq.authorization_request_id', true)
    and installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.activation_grant_hash', true)
    and used_at is null
    and revoked_at is null
    and expires_at > now()
    and exists (
      select 1
      from authoring_authorization_requests request
      inner join public_sdk_installations installation
        on installation.workspace_id = request.workspace_id
        and installation.id = request.installation_id
      inner join public_sdk_installation_origins origin_mapping
        on origin_mapping.workspace_id = request.workspace_id
        and origin_mapping.environment_id = request.environment_id
        and origin_mapping.installation_id = request.installation_id
        and origin_mapping.exact_origin = request.exact_origin
      inner join environments environment
        on environment.workspace_id = request.workspace_id
        and environment.id = request.environment_id
      inner join workspace_memberships membership
        on membership.workspace_id = request.workspace_id
        and membership.user_id = request.creator_id
        and membership.role in ('owner', 'admin', 'member')
      where request.id = authoring_activation_grants.request_id
        and request.workspace_id = authoring_activation_grants.workspace_id
        and request.environment_id = authoring_activation_grants.environment_id
        and request.installation_id = authoring_activation_grants.installation_id
        and request.exact_origin = authoring_activation_grants.exact_origin
        and request.creator_id = authoring_activation_grants.creator_id
        and request.authorization_code_used_at is not null
        and request.requested_capabilities = authoring_activation_grants.capabilities
        and request.document_intent is not distinct from authoring_activation_grants.document_intent
        and installation.revoked_at is null
        and origin_mapping.authoring_enabled = true
        and environment.kind <> 'production'
    )
  );

create policy authoring_activation_grants_public_lookup
  on authoring_activation_grants
  for select
  using (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.activation_grant_hash', true)
    and expires_at > now()
  );

create policy authoring_activation_grants_public_consume_or_revoke
  on authoring_activation_grants
  for update
  using (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.activation_grant_hash', true)
    and used_at is null
    and revoked_at is null
    and expires_at > now()
    and exists (
      select 1
      from public_sdk_installations installation
      inner join public_sdk_installation_origins origin_mapping
        on origin_mapping.workspace_id = installation.workspace_id
        and origin_mapping.installation_id = installation.id
      inner join environments environment
        on environment.workspace_id = origin_mapping.workspace_id
        and environment.id = origin_mapping.environment_id
      inner join workspace_memberships membership
        on membership.workspace_id = authoring_activation_grants.workspace_id
        and membership.user_id = authoring_activation_grants.creator_id
        and membership.role in ('owner', 'admin', 'member')
      where installation.id = authoring_activation_grants.installation_id
        and installation.workspace_id = authoring_activation_grants.workspace_id
        and installation.revoked_at is null
        and origin_mapping.exact_origin = authoring_activation_grants.exact_origin
        and origin_mapping.environment_id = authoring_activation_grants.environment_id
        and origin_mapping.authoring_enabled = true
        and environment.kind <> 'production'
    )
  )
  with check (
    installation_id = current_setting('lodariq.public_installation_id', true)
    and exact_origin = current_setting('lodariq.public_origin', true)
    and grant_hash = current_setting('lodariq.activation_grant_hash', true)
    and (
      (used_at is not null and revoked_at is null)
      or
      (used_at is null and revoked_at is not null)
    )
  );

-- =============================================================================
-- Squashed source: 0005_lodariq_owned_auth_expand.sql
-- =============================================================================

-- Additive owned-auth expansion. The legacy Clerk identifier remains nullable
-- for rollback and is removed only by a separately approved contract migration.
alter table users alter column clerk_user_id drop not null;
alter table users add column if not exists email_verified_at timestamptz;

-- Existing provider-backed identities are deliberately not mutated here.
-- Their verification/enrollment backfill requires a separately approved,
-- recoverable cutover rather than an implicit shared-environment data update.

alter table workspace_memberships
  add column if not exists updated_at timestamptz not null default now();

alter table workspace_memberships
  add constraint workspace_memberships_role_check
  check (role in ('owner', 'admin', 'member', 'viewer')) not valid;

create table if not exists password_credentials (
  user_id text primary key references users(id) on delete cascade,
  email_normalized text not null,
  email_lookup_hash text not null,
  algorithm text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint password_credentials_algorithm_check check (algorithm = 'argon2id-v1'),
  constraint password_credentials_email_normalized_check
    check (
      char_length(email_normalized) between 3 and 320
      and email_normalized = lower(btrim(email_normalized))
    ),
  constraint password_credentials_lookup_hash_check
    check (email_lookup_hash ~ '^[0-9a-f]{64}$'),
  constraint password_credentials_encoding_check
    check (
      password_hash ~ '^\$argon2id\$v=19\$m=65536,p=1,t=3\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$'
    )
);

create unique index if not exists password_credentials_email_normalized_idx
  on password_credentials(email_normalized);
create unique index if not exists password_credentials_email_lookup_hash_idx
  on password_credentials(email_lookup_hash);

create table if not exists auth_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  active_workspace_id text references workspaces(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint auth_sessions_id_check check (id ~ '^authsess_[A-Za-z0-9_-]{20,}$'),
  constraint auth_sessions_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_sessions_expiry_order_check
    check (
      created_at <= last_seen_at
      and last_seen_at < idle_expires_at
      and idle_expires_at <= absolute_expires_at
    )
);

create unique index if not exists auth_sessions_token_hash_idx on auth_sessions(token_hash);
create index if not exists auth_sessions_user_idx on auth_sessions(user_id);
create index if not exists auth_sessions_expiry_idx on auth_sessions(absolute_expires_at);

create table if not exists email_verification_challenges (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_verification_challenges_id_check
    check (id ~ '^verify_[A-Za-z0-9_-]{20,}$'),
  constraint email_verification_challenges_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint email_verification_challenges_expiry_check
    check (created_at < expires_at)
);

create unique index if not exists email_verification_challenges_token_hash_idx
  on email_verification_challenges(token_hash);
create index if not exists email_verification_challenges_user_idx
  on email_verification_challenges(user_id);
create index if not exists email_verification_challenges_expires_idx
  on email_verification_challenges(expires_at);

create table if not exists auth_outbox (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  recipient_email text not null,
  payload jsonb not null,
  available_at timestamptz not null,
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  constraint auth_outbox_id_check check (id ~ '^outbox_[A-Za-z0-9_-]{20,}$'),
  constraint auth_outbox_type_check check (type = 'email_verification'),
  constraint auth_outbox_recipient_check
    check (
      char_length(recipient_email) between 3 and 320
      and recipient_email = lower(btrim(recipient_email))
    ),
  constraint auth_outbox_attempts_check check (attempts between 0 and 20),
  constraint auth_outbox_payload_check check (jsonb_typeof(payload) = 'object')
);

create index if not exists auth_outbox_available_idx on auth_outbox(available_at);
create index if not exists auth_outbox_user_idx on auth_outbox(user_id);

create table if not exists auth_rate_limits (
  bucket_hash text primary key,
  scope text not null,
  window_started_at timestamptz not null,
  attempts integer not null,
  blocked_until timestamptz,
  updated_at timestamptz not null,
  constraint auth_rate_limits_hash_check check (bucket_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_rate_limits_scope_check check (scope in ('sign-in', 'sign-up')),
  constraint auth_rate_limits_attempts_check check (attempts between 1 and 1000000)
);

create index if not exists auth_rate_limits_updated_idx on auth_rate_limits(updated_at);

alter table password_credentials enable row level security;
alter table auth_sessions enable row level security;
alter table email_verification_challenges enable row level security;
alter table auth_outbox enable row level security;
alter table auth_rate_limits enable row level security;
alter table users enable row level security;
alter table password_credentials force row level security;
alter table auth_sessions force row level security;
alter table email_verification_challenges force row level security;
alter table auth_outbox force row level security;
alter table auth_rate_limits force row level security;
alter table users force row level security;

-- Identity reads are explicitly user-bound before an active workspace exists.
-- Workspace-scoped joins may reference only users visible through a membership
-- in the exact transaction workspace.
create policy users_auth_self on users
  for select
  using (id = current_setting('lodariq.auth_user_id', true));

create policy users_workspace_reference on users
  for select
  using (
    exists (
      select 1
      from workspace_memberships membership
      where membership.user_id = users.id
        and membership.workspace_id = current_setting('lodariq.workspace_id', true)
    )
  );

create policy users_owned_signup on users
  for insert
  with check (id = current_setting('lodariq.auth_user_id', true));

create policy users_email_verification_update on users
  for update
  using (
    id = current_setting('lodariq.auth_user_id', true)
    and exists (
      select 1
      from email_verification_challenges challenge
      where challenge.user_id = users.id
        and challenge.id = current_setting('lodariq.email_verification_id', true)
        and challenge.token_hash = current_setting('lodariq.email_verification_hash', true)
        and challenge.used_at is not null
        and challenge.expires_at > now()
    )
  )
  with check (id = current_setting('lodariq.auth_user_id', true));

create policy password_credentials_email_lookup on password_credentials
  for select
  using (
    email_lookup_hash = current_setting('lodariq.auth_email_lookup_hash', true)
    or user_id = current_setting('lodariq.auth_user_id', true)
  );

create policy password_credentials_owned_insert on password_credentials
  for insert
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and email_lookup_hash = current_setting('lodariq.auth_email_lookup_hash', true)
  );

create policy password_credentials_owned_update on password_credentials
  for update
  using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));

create policy auth_sessions_token_lookup on auth_sessions
  for select
  using (
    token_hash = current_setting('lodariq.auth_session_hash', true)
    or user_id = current_setting('lodariq.auth_user_id', true)
  );

create policy auth_sessions_owned_insert on auth_sessions
  for insert
  with check (user_id = current_setting('lodariq.auth_user_id', true));

create policy auth_sessions_token_update on auth_sessions
  for update
  using (
    token_hash = current_setting('lodariq.auth_session_hash', true)
    or user_id = current_setting('lodariq.auth_user_id', true)
  )
  with check (user_id = current_setting('lodariq.auth_user_id', true));

create policy email_verification_challenges_owned_insert
  on email_verification_challenges
  for insert
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and token_hash = current_setting('lodariq.email_verification_hash', true)
  );

create policy email_verification_challenges_token_lookup
  on email_verification_challenges
  for select
  using (
    id = current_setting('lodariq.email_verification_id', true)
    and token_hash = current_setting('lodariq.email_verification_hash', true)
  );

create policy email_verification_challenges_token_consume
  on email_verification_challenges
  for update
  using (
    id = current_setting('lodariq.email_verification_id', true)
    and token_hash = current_setting('lodariq.email_verification_hash', true)
    and used_at is null
    and expires_at > now()
  )
  with check (
    id = current_setting('lodariq.email_verification_id', true)
    and token_hash = current_setting('lodariq.email_verification_hash', true)
    and used_at is not null
  );

create policy auth_outbox_owned_insert on auth_outbox
  for insert
  with check (user_id = current_setting('lodariq.auth_user_id', true));

create policy auth_outbox_worker_select on auth_outbox
  for select
  using (current_setting('lodariq.auth_outbox_worker', true) = 'true');

create policy auth_outbox_worker_update on auth_outbox
  for update
  using (current_setting('lodariq.auth_outbox_worker', true) = 'true')
  with check (current_setting('lodariq.auth_outbox_worker', true) = 'true');

create policy auth_rate_limits_bucket_lookup on auth_rate_limits
  for select
  using (bucket_hash = current_setting('lodariq.auth_rate_bucket_hash', true));

create policy auth_rate_limits_bucket_insert on auth_rate_limits
  for insert
  with check (bucket_hash = current_setting('lodariq.auth_rate_bucket_hash', true));

create policy auth_rate_limits_bucket_update on auth_rate_limits
  for update
  using (bucket_hash = current_setting('lodariq.auth_rate_bucket_hash', true))
  with check (bucket_hash = current_setting('lodariq.auth_rate_bucket_hash', true));

create policy auth_rate_limits_prune_select on auth_rate_limits
  for select
  using (
    updated_at < nullif(current_setting('lodariq.auth_rate_prune_before', true), '')::timestamptz
  );

create policy auth_rate_limits_prune_delete on auth_rate_limits
  for delete
  using (
    updated_at < nullif(current_setting('lodariq.auth_rate_prune_before', true), '')::timestamptz
  );

-- Before a session has selected an active workspace it may discover only the
-- memberships and workspace names owned by its authenticated internal user.
create policy workspace_memberships_user_discovery on workspace_memberships
  for select
  using (user_id = current_setting('lodariq.auth_user_id', true));

create policy workspaces_user_discovery on workspaces
  for select
  using (
    exists (
      select 1
      from workspace_memberships membership
      where membership.workspace_id = workspaces.id
        and membership.user_id = current_setting('lodariq.auth_user_id', true)
    )
  );

-- The first-party activation popup starts from a request ID, not a selected
-- dashboard workspace. Reveal only that exact live request when the internal
-- user has an authoring-capable membership in its server-owned workspace.
create policy authoring_authorization_requests_auth_user_lookup
  on authoring_authorization_requests
  for select
  using (
    id = current_setting('lodariq.authorization_request_id', true)
    and expires_at > now()
    and exists (
      select 1
      from workspace_memberships membership
      where membership.workspace_id = authoring_authorization_requests.workspace_id
        and membership.user_id = current_setting('lodariq.auth_user_id', true)
        and membership.role in ('owner', 'admin', 'member')
    )
  );

-- =============================================================================
-- Squashed source: 0006_owned_auth_password_recovery.sql
-- =============================================================================

-- Additive owned-auth password recovery/enrollment foundation. Verification
-- and set-password challenges remain physically separated so an lq_verify
-- credential can never be consumed through the lq_reset persistence path.

-- Intentionally non-unique. Legacy duplicate normalized addresses must remain
-- visible to the repository so recovery fails closed instead of choosing one.
create index if not exists users_email_normalized_lookup_idx
  on users ((lower(btrim(email))));

alter table auth_outbox
  add column if not exists lease_version integer not null default 0;
alter table auth_outbox
  add column if not exists terminal_at timestamptz;
alter table auth_outbox
  add constraint auth_outbox_lease_version_check
  check (lease_version between 0 and 2147483647) not valid;
alter table auth_outbox
  add constraint auth_outbox_last_error_check
  check (last_error is null or last_error ~ '^[a-z0-9][a-z0-9_-]{0,63}$') not valid;
alter table auth_outbox
  add constraint auth_outbox_delivery_payload_check
  check (
    payload ?& array['challengeId', 'verificationPath']
    and jsonb_typeof(payload->'challengeId') = 'string'
    and jsonb_typeof(payload->'verificationPath') = 'string'
    and payload->>'challengeId' ~ '^verify_[A-Za-z0-9_-]{20,}$'
    and char_length(payload->>'verificationPath') between 1 and 2048
  ) not valid;
create index if not exists auth_outbox_due_idx
  on auth_outbox(available_at, created_at)
  where processed_at is null and terminal_at is null and attempts < 20;

create table if not exists set_password_challenges (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  email_normalized text not null,
  email_lookup_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint set_password_challenges_id_check
    check (id ~ '^reset_[A-Za-z0-9_-]{20,}$'),
  constraint set_password_challenges_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint set_password_challenges_email_normalized_check
    check (
      char_length(email_normalized) between 3 and 320
      and email_normalized = lower(btrim(email_normalized))
    ),
  constraint set_password_challenges_lookup_hash_check
    check (email_lookup_hash ~ '^[0-9a-f]{64}$'),
  constraint set_password_challenges_expiry_check
    check (created_at < expires_at)
);

create unique index if not exists set_password_challenges_token_hash_idx
  on set_password_challenges(token_hash);
create unique index if not exists set_password_challenges_active_user_idx
  on set_password_challenges(user_id) where used_at is null;
create index if not exists set_password_challenges_user_idx
  on set_password_challenges(user_id);
create index if not exists set_password_challenges_expires_idx
  on set_password_challenges(expires_at);

create table if not exists set_password_outbox (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  recipient_email text not null,
  payload jsonb not null,
  available_at timestamptz not null,
  processed_at timestamptz,
  attempts integer not null default 0,
  lease_version integer not null default 0,
  last_error text,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  constraint set_password_outbox_id_check
    check (id ~ '^outbox_[A-Za-z0-9_-]{20,}$'),
  constraint set_password_outbox_type_check
    check (type = 'set_password'),
  constraint set_password_outbox_recipient_check
    check (
      char_length(recipient_email) between 3 and 320
      and recipient_email = lower(btrim(recipient_email))
    ),
  constraint set_password_outbox_attempts_check
    check (attempts between 0 and 20),
  constraint set_password_outbox_lease_version_check
    check (lease_version between 0 and 2147483647),
  constraint set_password_outbox_last_error_check
    check (last_error is null or last_error ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint set_password_outbox_payload_check
    check (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['purpose', 'challengeId', 'resetPath']
      and jsonb_typeof(payload->'purpose') = 'string'
      and jsonb_typeof(payload->'challengeId') = 'string'
      and jsonb_typeof(payload->'resetPath') = 'string'
      and payload->>'purpose' = 'set_password'
      and payload->>'challengeId' ~ '^reset_[A-Za-z0-9_-]{20,}$'
      and char_length(payload->>'resetPath') between 1 and 2048
    )
);

create index if not exists set_password_outbox_available_idx
  on set_password_outbox(available_at);
create index if not exists set_password_outbox_due_idx
  on set_password_outbox(available_at, created_at)
  where processed_at is null and terminal_at is null and attempts < 20;
create index if not exists set_password_outbox_user_idx
  on set_password_outbox(user_id);

alter table set_password_challenges enable row level security;
alter table set_password_challenges force row level security;
alter table set_password_outbox enable row level security;
alter table set_password_outbox force row level security;

-- This policy is intentionally exact and non-unique. The repository reads at
-- most two rows and proceeds only when the result count is exactly one.
create policy users_set_password_email_lookup on users
  for select
  using (
    lower(btrim(email)) = current_setting('lodariq.auth_email_normalized', true)
  );

create policy users_set_password_update on users
  for update
  using (
    id = current_setting('lodariq.auth_user_id', true)
    and exists (
      select 1
      from set_password_challenges challenge
      where challenge.user_id = users.id
        and challenge.id = current_setting('lodariq.set_password_challenge_id', true)
        and challenge.token_hash = current_setting('lodariq.set_password_challenge_hash', true)
        and challenge.used_at is not null
        and challenge.used_at < challenge.expires_at
    )
  )
  with check (id = current_setting('lodariq.auth_user_id', true));

create policy set_password_challenges_owned_insert on set_password_challenges
  for insert
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and id = current_setting('lodariq.set_password_challenge_id', true)
    and token_hash = current_setting('lodariq.set_password_challenge_hash', true)
    and email_normalized = current_setting('lodariq.auth_email_normalized', true)
    and email_lookup_hash = current_setting('lodariq.auth_email_lookup_hash', true)
  );

create policy set_password_challenges_token_lookup on set_password_challenges
  for select
  using (
    id = current_setting('lodariq.set_password_challenge_id', true)
    and token_hash = current_setting('lodariq.set_password_challenge_hash', true)
  );

create policy set_password_challenges_token_consume on set_password_challenges
  for update
  using (
    id = current_setting('lodariq.set_password_challenge_id', true)
    and token_hash = current_setting('lodariq.set_password_challenge_hash', true)
    and used_at is null
    and expires_at > now()
  )
  with check (
    id = current_setting('lodariq.set_password_challenge_id', true)
    and token_hash = current_setting('lodariq.set_password_challenge_hash', true)
    and used_at is not null
  );

-- Request replacement and successful completion both invalidate outstanding
-- challenges only after the repository has established the exact internal user.
create policy set_password_challenges_user_invalidate on set_password_challenges
  for update
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and used_at is null
  )
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and used_at is not null
  );

create policy email_verification_challenges_set_password_invalidate
  on email_verification_challenges
  for update
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and used_at is null
  )
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and used_at is not null
  );

create policy set_password_outbox_owned_insert on set_password_outbox
  for insert
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and recipient_email = current_setting('lodariq.auth_email_normalized', true)
    and payload->>'purpose' = 'set_password'
    and payload->>'challengeId' = current_setting('lodariq.set_password_challenge_id', true)
  );

create policy auth_outbox_set_password_cancel on auth_outbox
  for update
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and processed_at is null
    and terminal_at is null
  )
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and terminal_at is not null
  );

create policy set_password_outbox_user_cancel on set_password_outbox
  for update
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and processed_at is null
    and terminal_at is null
  )
  with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and terminal_at is not null
  );

create policy set_password_outbox_worker_select on set_password_outbox
  for select
  using (current_setting('lodariq.auth_outbox_worker', true) = 'true');

create policy set_password_outbox_worker_update on set_password_outbox
  for update
  using (current_setting('lodariq.auth_outbox_worker', true) = 'true')
  with check (current_setting('lodariq.auth_outbox_worker', true) = 'true');

-- =============================================================================
-- Squashed source: 0007_phase_2_brand_staging.sql
-- =============================================================================

-- Additive Phase 2 Brand Theme and visual-preflight persistence. This migration
-- deliberately creates no historical rows and performs no data backfill.

-- Activated authoring sessions pin the exact compiler/renderer/theme contract
-- they were created for. Existing compatibility sessions remain nullable
-- because their exact historical theme version cannot be reconstructed safely.
alter table authoring_sessions
  add column if not exists compiler_version text,
  add column if not exists renderer_contract_version text,
  add column if not exists theme_contract_version text,
  add column if not exists theme_version_id text;

alter table authoring_sessions
  add constraint authoring_sessions_compatibility_pins_check
  check (
    (
      compiler_version is null
      and renderer_contract_version is null
      and theme_contract_version is null
      and theme_version_id is null
    )
    or
    (
      compiler_version is not null
      and renderer_contract_version is not null
      and theme_contract_version is not null
      and theme_version_id is not null
      and compiler_version = '0.3.0'
      and renderer_contract_version = '2'
      and theme_contract_version = '1'
      and char_length(btrim(theme_version_id)) between 1 and 120
    )
  );

create table if not exists themes (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  draft_json jsonb not null,
  revision integer not null default 1,
  is_default boolean not null default false,
  active_version_id text,
  created_by_user_id text references users(id) on delete set null,
  updated_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint themes_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint themes_draft_json_check
    check (jsonb_typeof(draft_json) = 'object'),
  constraint themes_revision_check
    check (revision >= 1),
  constraint themes_default_requires_approved_version_check
    check (not is_default or active_version_id is not null)
);

create unique index if not exists themes_workspace_id_idx
  on themes(workspace_id, id);
-- Approval makes the first approved theme the default; later default changes
-- swap the pointer atomically. The index prevents two defaults under races.
create unique index if not exists themes_workspace_default_idx
  on themes(workspace_id)
  where is_default = true;
create index if not exists themes_workspace_updated_idx
  on themes(workspace_id, updated_at desc);

create table if not exists theme_versions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  theme_id text not null,
  version integer not null,
  schema_version text not null,
  contract_version text not null,
  canonical_json jsonb not null,
  content_hash text not null,
  approved_by_user_id text references users(id) on delete set null,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint theme_versions_theme_scope_fk
    foreign key (workspace_id, theme_id)
    references themes(workspace_id, id) on delete cascade,
  constraint theme_versions_version_check
    check (version >= 1),
  constraint theme_versions_canonical_json_check
    check (
      jsonb_typeof(canonical_json) = 'object'
      and canonical_json->>'schemaVersion' = schema_version
      and canonical_json->>'contractVersion' = contract_version
      and canonical_json->>'themeId' = theme_id
      and canonical_json->>'themeVersionId' = id
      and (canonical_json->>'version')::integer = version
      and canonical_json->>'contentHash' = content_hash
    ),
  constraint theme_versions_content_hash_check
    check (content_hash ~ '^sha256-[0-9a-f]{64}$')
);

create unique index if not exists theme_versions_workspace_theme_version_idx
  on theme_versions(workspace_id, theme_id, version);
create unique index if not exists theme_versions_workspace_theme_id_idx
  on theme_versions(workspace_id, theme_id, id);
create unique index if not exists theme_versions_workspace_id_idx
  on theme_versions(workspace_id, id);
create index if not exists theme_versions_workspace_approved_idx
  on theme_versions(workspace_id, approved_at desc);

alter table themes
  add constraint themes_active_version_scope_fk
  foreign key (workspace_id, id, active_version_id)
  references theme_versions(workspace_id, theme_id, id) on delete restrict;

-- Visual checks refer to the exact immutable document, artifact, theme, and
-- environment identities they evaluated. The extra identity index is additive
-- and exists solely to support the scoped document-version foreign key.
create unique index if not exists document_versions_visual_check_identity_idx
  on document_versions(workspace_id, document_id, id);
create unique index if not exists compiled_artifacts_visual_check_identity_idx
  on compiled_artifacts(
    workspace_id,
    document_id,
    id,
    document_version_id,
    content_hash,
    theme_version_id
  );

create table if not exists visual_check_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  document_version_id text not null,
  compiled_artifact_id text not null,
  theme_version_id text not null,
  environment_id text not null,
  content_hash text not null,
  report_json jsonb not null,
  status text not null,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint visual_check_runs_document_version_scope_fk
    foreign key (workspace_id, document_id, document_version_id)
    references document_versions(workspace_id, document_id, id) on delete restrict,
  constraint visual_check_runs_artifact_scope_fk
    foreign key (
      workspace_id,
      document_id,
      compiled_artifact_id,
      document_version_id,
      content_hash,
      theme_version_id
    ) references compiled_artifacts(
      workspace_id,
      document_id,
      id,
      document_version_id,
      content_hash,
      theme_version_id
    ) on delete restrict,
  constraint visual_check_runs_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete restrict,
  constraint visual_check_runs_content_hash_check
    check (content_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint visual_check_runs_status_check
    check (status in ('passed', 'warnings', 'blocked')),
  constraint visual_check_runs_report_check
    check (
      jsonb_typeof(report_json) = 'object'
      and report_json->>'schemaVersion' = '1'
      and report_json->>'status' = status
      and jsonb_typeof(report_json->'issues') = 'array'
      and jsonb_array_length(report_json->'issues') <= 512
    )
);

create index if not exists visual_check_runs_document_created_idx
  on visual_check_runs(workspace_id, document_id, created_at desc);
create index if not exists visual_check_runs_artifact_idx
  on visual_check_runs(workspace_id, compiled_artifact_id, created_at desc);

alter table themes enable row level security;
alter table themes force row level security;
alter table theme_versions enable row level security;
alter table theme_versions force row level security;
alter table visual_check_runs enable row level security;
alter table visual_check_runs force row level security;

create policy themes_workspace_isolation on themes
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

-- Approved snapshots and completed reports are append-only for the runtime
-- role: there is intentionally no UPDATE or DELETE policy on either table.
create policy theme_versions_workspace_isolation on theme_versions
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy theme_versions_workspace_insert on theme_versions
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy visual_check_runs_workspace_isolation on visual_check_runs
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy visual_check_runs_workspace_insert on visual_check_runs
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

-- =============================================================================
-- Squashed source: 0008_phase_2_match_and_promotion.sql
-- =============================================================================

-- Additive Phase 2 product-style evidence, exact-publication verification,
-- approval policy, and production-promotion persistence. No historical rows
-- are synthesized and no existing publication/artifact is rewritten.

alter table environments
  add column if not exists required_approval_count integer not null default 0;

alter table environments
  add constraint environments_required_approval_count_check
  check (required_approval_count between 0 and 1);

create table if not exists style_sources (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  theme_id text not null,
  environment_id text not null,
  source_json jsonb not null,
  source_hash text not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  constraint style_sources_theme_scope_fk
    foreign key (workspace_id, theme_id)
    references themes(workspace_id, id) on delete restrict,
  constraint style_sources_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete restrict,
  constraint style_sources_creator_membership_scope_fk
    foreign key (workspace_id, created_by_user_id)
    references workspace_memberships(workspace_id, user_id) on delete restrict,
  constraint style_sources_source_json_check
    check (jsonb_typeof(source_json) = 'object'),
  constraint style_sources_source_hash_check
    check (source_hash ~ '^sha256-[0-9a-f]{64}$')
);

create unique index if not exists style_sources_workspace_id_idx
  on style_sources(workspace_id, id);
create index if not exists style_sources_theme_created_idx
  on style_sources(workspace_id, theme_id, created_at desc);

create table if not exists publication_verifications (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  publication_id text not null,
  result text not null,
  report_json jsonb not null,
  verified_origin text not null,
  verified_by_user_id text not null,
  created_at timestamptz not null default now(),
  constraint publication_verifications_publication_scope_fk
    foreign key (workspace_id, environment_id, document_id, publication_id)
    references publications(workspace_id, environment_id, document_id, id)
    on delete restrict,
  constraint publication_verifications_verifier_membership_scope_fk
    foreign key (workspace_id, verified_by_user_id)
    references workspace_memberships(workspace_id, user_id) on delete restrict,
  constraint publication_verifications_result_check
    check (result in ('passed', 'failed')),
  constraint publication_verifications_report_json_check
    check (
      jsonb_typeof(report_json) = 'object'
      and report_json->>'schemaVersion' = '1'
      and report_json->>'rendererContractVersion' = '2'
      and jsonb_typeof(report_json->'checks') = 'array'
      and jsonb_array_length(report_json->'checks') between 1 and 13
      and (
        (result = 'failed' and report_json->>'status' = 'failed')
        or
        (result = 'passed' and report_json->>'status' in ('passed', 'warning'))
      )
    ),
  constraint publication_verifications_origin_check
    check (verified_origin ~ '^https?://[^[:space:]/?#@]+$')
);

create unique index if not exists publication_verifications_workspace_id_idx
  on publication_verifications(workspace_id, id);
create index if not exists publication_verifications_publication_created_idx
  on publication_verifications(workspace_id, publication_id, created_at desc);

-- Approval FKs need a workspace-scoped operation identity because the target
-- environment/document are deliberately not duplicated into approval rows.
create unique index if not exists release_operations_workspace_id_idx
  on release_operations(workspace_id, id);

create table if not exists release_approvals (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  release_operation_id text not null,
  decision text not null,
  reason text,
  decided_by_user_id text not null,
  created_at timestamptz not null default now(),
  constraint release_approvals_operation_scope_fk
    foreign key (workspace_id, release_operation_id)
    references release_operations(workspace_id, id) on delete restrict,
  constraint release_approvals_decider_membership_scope_fk
    foreign key (workspace_id, decided_by_user_id)
    references workspace_memberships(workspace_id, user_id) on delete restrict,
  constraint release_approvals_decision_check
    check (decision in ('approved', 'rejected')),
  constraint release_approvals_reason_check
    check (reason is null or char_length(btrim(reason)) between 1 and 500)
);

create unique index if not exists release_approvals_workspace_id_idx
  on release_approvals(workspace_id, id);
create unique index if not exists release_approvals_operation_actor_idx
  on release_approvals(workspace_id, release_operation_id, decided_by_user_id);
create index if not exists release_approvals_operation_created_idx
  on release_approvals(workspace_id, release_operation_id, created_at asc);

alter table style_sources enable row level security;
alter table style_sources force row level security;
alter table publication_verifications enable row level security;
alter table publication_verifications force row level security;
alter table release_approvals enable row level security;
alter table release_approvals force row level security;

-- These three records are append-only for the runtime role. Deliberately omit
-- UPDATE and DELETE policies even though the role has general table grants.
create policy style_sources_workspace_isolation on style_sources
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy style_sources_workspace_insert on style_sources
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy publication_verifications_workspace_isolation on publication_verifications
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy publication_verifications_workspace_insert on publication_verifications
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy release_approvals_workspace_isolation on release_approvals
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy release_approvals_workspace_insert on release_approvals
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
