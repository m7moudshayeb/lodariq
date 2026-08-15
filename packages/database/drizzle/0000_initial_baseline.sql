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

create or replace function public.lodariq_is_valid_origin_allowlist(candidate jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $origin_allowlist$
  select case
    when jsonb_typeof(candidate) <> 'array' then false
    when jsonb_array_length(candidate) > 100 then false
    else
      not exists (
        select 1
        from jsonb_array_elements(candidate) as entry(value)
        where jsonb_typeof(entry.value) <> 'string'
          or char_length(entry.value #>> '{}') not between 1 and 2048
      )
      and (
        select count(*) = count(distinct entry.value #>> '{}')
        from jsonb_array_elements(candidate) as entry(value)
      )
  end
$origin_allowlist$;

create table if not exists environments (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind lodariq_environment not null,
  name text not null,
  origin_allowlist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint environments_origin_allowlist_check
    check (public.lodariq_is_valid_origin_allowlist(origin_allowlist))
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
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));

create policy compiled_artifacts_workspace_insert on compiled_artifacts
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy publications_workspace_isolation on publications
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));

create policy publications_workspace_insert on publications
  for insert
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
create unique index if not exists publications_analytics_identity_idx
  on publications(workspace_id, environment_id, document_id, id, content_hash);
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
  requested_source_publication_id text,
  requested_active_publication_id text,
  actual_active_publication_id text,
  source_publication_id text,
  result_publication_id text,
  expected_generation integer not null,
  result_generation integer,
  idempotency_key text not null,
  request_hash text not null,
  status lodariq_release_operation_status not null,
  correlation_id text not null,
  requested_by_user_id text references users(id) on delete set null,
  reason text,
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
  constraint release_operations_actual_active_publication_scope_fk
    foreign key (workspace_id, environment_id, document_id, actual_active_publication_id)
    references publications(workspace_id, environment_id, document_id, id) on delete restrict,
  constraint release_operations_expected_generation_check
    check (expected_generation >= 0),
  constraint release_operations_idempotency_key_check
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
  constraint release_operations_request_hash_check
    check (request_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint release_operations_result_generation_check
    check (result_generation is null or result_generation >= 0),
  constraint release_operations_requested_source_publication_check
    check (
      (action = 'rollback'
        and requested_source_publication_id is not null
        and requested_source_publication_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$')
      or (action <> 'rollback' and requested_source_publication_id is null)
    ),
  constraint release_operations_requested_active_publication_check
    check (
      requested_active_publication_id is null
      or (
        action in ('rollback', 'unpublish')
        and requested_active_publication_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
      )
    ),
  constraint release_operations_recovery_reason_check
    check (
      (
        action in ('rollback', 'unpublish')
        and reason is not null
        and char_length(reason) between 1 and 500
        and reason !~ '^[[:space:]]'
        and reason !~ '[[:space:]]$'
      )
      or (action in ('publish', 'promote') and reason is null)
    ),
  constraint release_operations_action_shape_check
    check (
      (
        action in ('publish', 'promote')
        and requested_artifact_id is not null
        and requested_active_publication_id is null
        and actual_active_publication_id is null
      )
      or (
        action = 'rollback'
        and status <> 'awaiting_approval'
        and (
          (
            status = 'activating'
            and requested_artifact_id is null
            and source_publication_id is null
            and result_publication_id is null
            and actual_active_publication_id is null
          )
          or (
            status = 'failed'
            and requested_artifact_id is null
            and source_publication_id is null
            and result_publication_id is null
          )
          or (
            status = 'completed'
            and requested_artifact_id is not null
            and source_publication_id is not null
            and result_publication_id is not null
            and actual_active_publication_id is not null
          )
        )
      )
      or (
        action = 'unpublish'
        and status <> 'awaiting_approval'
        and requested_artifact_id is null
        and source_publication_id is null
        and result_publication_id is null
        and (
          (status = 'activating' and actual_active_publication_id is null)
          or status = 'failed'
          or (status = 'completed' and actual_active_publication_id is not null)
        )
      )
    ),
  constraint release_operations_lifecycle_shape_check
    check (
      (
        status in ('awaiting_approval', 'activating')
        and result_generation is null
        and result_publication_id is null
        and error_code is null
        and completed_at is null
      )
      or (
        status = 'completed'
        and result_generation is not null
        and (action = 'unpublish' or result_publication_id is not null)
        and error_code is null
        and completed_at is not null
      )
      or (
        status = 'failed'
        and result_publication_id is null
        and error_code is not null
        and completed_at is not null
      )
    )
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
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));

create policy release_operations_workspace_insert on release_operations
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy release_operations_lifecycle_update on release_operations
  for update
  using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and status in ('awaiting_approval', 'activating')
  )
  with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and status in ('completed', 'failed')
  );

-- SDK analytics use a separate, server-authoritative envelope. The original
-- events table remains available for authenticated dashboard diagnostics.
create table if not exists analytics_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  publication_id text not null,
  content_hash text not null,
  pointer_generation integer not null,
  name text not null,
  step_id text,
  sdk_version text not null,
  correlation_id text,
  occurred_at timestamptz not null,
  props jsonb,
  ingested_at timestamptz not null default now(),
  constraint analytics_events_publication_identity_fk
    foreign key (workspace_id, environment_id, document_id, publication_id, content_hash)
    references publications(workspace_id, environment_id, document_id, id, content_hash)
    on delete restrict,
  constraint analytics_events_content_hash_check
    check (content_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint analytics_events_pointer_generation_check
    check (pointer_generation >= 1),
  constraint analytics_events_name_check
    check (char_length(name) between 1 and 80 and name ~ '^[a-z][a-z0-9_.-]*$'),
  constraint analytics_events_sdk_version_check
    check (char_length(sdk_version) between 1 and 128),
  constraint analytics_events_props_check
    check (props is null or jsonb_typeof(props) = 'object')
);

create index if not exists analytics_events_environment_occurred_idx
  on analytics_events(workspace_id, environment_id, occurred_at);
create index if not exists analytics_events_document_occurred_idx
  on analytics_events(workspace_id, environment_id, document_id, occurred_at);
create index if not exists analytics_events_publication_idx
  on analytics_events(workspace_id, environment_id, publication_id);

alter table analytics_events enable row level security;
alter table analytics_events force row level security;

create policy analytics_events_workspace_isolation on analytics_events
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));

create policy analytics_events_workspace_insert on analytics_events
  for insert
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
      and jsonb_array_length(capabilities) between 1 and 12
      and capabilities <@ '["document:approve-production","document:preview","document:promote-production","document:publish-staging","document:read","document:read-release-state","document:rollback","brand:sample-product-style","target:select","document:unpublish","document:verify-staging","document:write"]'::jsonb
      and jsonb_array_length(capabilities) = (
        (case when capabilities @> '["document:approve-production"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:preview"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:promote-production"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:publish-staging"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:read"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:read-release-state"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:rollback"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["brand:sample-product-style"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["target:select"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:unpublish"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:verify-staging"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:write"]'::jsonb then 1 else 0 end)
      )
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
  key_id text not null default 'legacy',
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_verification_challenges_id_check
    check (id ~ '^verify_[A-Za-z0-9_-]{20,}$'),
  constraint email_verification_challenges_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint email_verification_challenges_key_id_check
    check (key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
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

-- UPDATE under RLS also requires SELECT visibility. Recovery completion binds
-- this server-resolved user id before retiring any pending verification state.
create policy email_verification_challenges_auth_user_lookup
  on email_verification_challenges
  for select
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and (
      used_at is null
      or used_at = nullif(
        current_setting('lodariq.auth_recovery_mutation_at', true),
        ''
      )::timestamptz
    )
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
    payload ?& array['challengeId', 'verificationPath', 'keyId']
    and jsonb_typeof(payload->'challengeId') = 'string'
    and jsonb_typeof(payload->'verificationPath') = 'string'
    and jsonb_typeof(payload->'keyId') = 'string'
    and payload->>'challengeId' ~ '^verify_[A-Za-z0-9_-]{20,}$'
    and char_length(payload->>'verificationPath') between 1 and 2048
    and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  ) not valid;
create index if not exists auth_outbox_due_idx
  on auth_outbox(available_at, created_at)
  where processed_at is null and terminal_at is null and attempts < 20;

create table if not exists set_password_challenges (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  key_id text not null default 'legacy',
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
  constraint set_password_challenges_key_id_check
    check (key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
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
      and payload ?& array['purpose', 'challengeId', 'resetPath', 'keyId']
      and jsonb_typeof(payload->'purpose') = 'string'
      and jsonb_typeof(payload->'challengeId') = 'string'
      and jsonb_typeof(payload->'resetPath') = 'string'
      and jsonb_typeof(payload->'keyId') = 'string'
      and payload->>'purpose' = 'set_password'
      and payload->>'challengeId' ~ '^reset_[A-Za-z0-9_-]{20,}$'
      and char_length(payload->>'resetPath') between 1 and 2048
      and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
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

create policy set_password_challenges_user_lookup on set_password_challenges
  for select
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and (
      used_at is null
      or used_at = nullif(
        current_setting('lodariq.auth_recovery_mutation_at', true),
        ''
      )::timestamptz
    )
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

create policy auth_outbox_auth_user_lookup on auth_outbox
  for select
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and processed_at is null
    and (
      terminal_at is null
      or terminal_at = nullif(
        current_setting('lodariq.auth_recovery_mutation_at', true),
        ''
      )::timestamptz
    )
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

create policy set_password_outbox_auth_user_lookup on set_password_outbox
  for select
  using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and processed_at is null
    and (
      terminal_at is null
      or terminal_at = nullif(
        current_setting('lodariq.auth_recovery_mutation_at', true),
        ''
      )::timestamptz
    )
  );

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

-- Environment policy is additive over the legacy name/origin/approval DTO.
-- This is the undeployed baseline, so every new policy row is strict from day one.
alter table environments
  add column if not exists enabled boolean not null default true,
  add column if not exists pipeline_position integer not null,
  add column if not exists authoring_enabled boolean not null,
  add column if not exists promotion_source_environment_id text,
  add column if not exists release_policy_json jsonb not null;

create unique index if not exists environments_workspace_pipeline_position_idx
  on environments(workspace_id, pipeline_position);

alter table environments
  add constraint environments_promotion_source_scope_fk
    foreign key (workspace_id, promotion_source_environment_id)
    references environments(workspace_id, id) on delete restrict,
  add constraint environments_pipeline_position_check
    check (
      (kind = 'development' and pipeline_position = 0)
      or (kind = 'staging' and pipeline_position = 1)
      or (kind = 'production' and pipeline_position = 2 and not authoring_enabled)
    ),
  add constraint environments_promotion_source_kind_check
    check (
      (kind = 'production' and promotion_source_environment_id is not null)
      or (kind <> 'production' and promotion_source_environment_id is null)
    ),
  add constraint environments_promotion_source_not_self_check
    check (promotion_source_environment_id is null or promotion_source_environment_id <> id),
  add constraint environments_release_policy_check
    check (
      jsonb_typeof(release_policy_json) = 'object'
      and (release_policy_json - array[
        'allowDirectPublish', 'requireSourceVerification', 'requiredApprovalCount',
        'publisherRoles', 'rollbackRoles', 'unpublishRoles', 'separationOfDuties'
      ]) = '{}'::jsonb
      and release_policy_json ?& array[
        'allowDirectPublish', 'requireSourceVerification', 'requiredApprovalCount',
        'publisherRoles', 'rollbackRoles', 'unpublishRoles', 'separationOfDuties'
      ]
      and jsonb_typeof(release_policy_json->'allowDirectPublish') = 'boolean'
      and jsonb_typeof(release_policy_json->'requireSourceVerification') = 'boolean'
      and jsonb_typeof(release_policy_json->'requiredApprovalCount') = 'number'
      and release_policy_json->>'requiredApprovalCount' in ('0', '1')
      and (release_policy_json->>'requiredApprovalCount')::integer = required_approval_count
      and jsonb_typeof(release_policy_json->'publisherRoles') = 'array'
      and jsonb_array_length(release_policy_json->'publisherRoles') between 1 and 3
      and release_policy_json->'publisherRoles' <@ '["owner","admin","member"]'::jsonb
      and jsonb_array_length(release_policy_json->'publisherRoles') =
        (case when release_policy_json->'publisherRoles' ? 'owner' then 1 else 0 end)
        + (case when release_policy_json->'publisherRoles' ? 'admin' then 1 else 0 end)
        + (case when release_policy_json->'publisherRoles' ? 'member' then 1 else 0 end)
      and jsonb_typeof(release_policy_json->'rollbackRoles') = 'array'
      and jsonb_array_length(release_policy_json->'rollbackRoles') between 1 and 2
      and release_policy_json->'rollbackRoles' <@ '["owner","admin"]'::jsonb
      and jsonb_array_length(release_policy_json->'rollbackRoles') =
        (case when release_policy_json->'rollbackRoles' ? 'owner' then 1 else 0 end)
        + (case when release_policy_json->'rollbackRoles' ? 'admin' then 1 else 0 end)
      and jsonb_typeof(release_policy_json->'unpublishRoles') = 'array'
      and jsonb_array_length(release_policy_json->'unpublishRoles') between 1 and 2
      and release_policy_json->'unpublishRoles' <@ '["owner","admin"]'::jsonb
      and jsonb_array_length(release_policy_json->'unpublishRoles') =
        (case when release_policy_json->'unpublishRoles' ? 'owner' then 1 else 0 end)
        + (case when release_policy_json->'unpublishRoles' ? 'admin' then 1 else 0 end)
      and jsonb_typeof(release_policy_json->'separationOfDuties') = 'object'
      and ((release_policy_json->'separationOfDuties') - array[
        'requireSeparateVerifier', 'requireSeparateApprover'
      ]) = '{}'::jsonb
      and release_policy_json->'separationOfDuties' ?& array[
        'requireSeparateVerifier', 'requireSeparateApprover'
      ]
      and jsonb_typeof(
        release_policy_json->'separationOfDuties'->'requireSeparateVerifier'
      ) = 'boolean'
      and jsonb_typeof(
        release_policy_json->'separationOfDuties'->'requireSeparateApprover'
      ) = 'boolean'
      and (
        kind <> 'production'
        or (
          not (release_policy_json->'publisherRoles' ? 'member')
          and not (release_policy_json->>'allowDirectPublish')::boolean
          and (release_policy_json->>'requireSourceVerification')::boolean
        )
      )
    );

create table if not exists style_sources (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  theme_id text not null,
  environment_id text not null,
  proposal_id text not null,
  proposal_hash text not null,
  source_ordinal integer not null,
  source_count integer not null,
  applied_theme_revision integer not null,
  draft_changed boolean not null,
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
  constraint style_sources_proposal_id_check
    check (proposal_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  constraint style_sources_proposal_hash_check
    check (proposal_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint style_sources_source_ordinal_check
    check (source_ordinal >= 0),
  constraint style_sources_source_count_check
    check (source_count between 1 and 21 and source_ordinal < source_count),
  constraint style_sources_theme_revision_check
    check (applied_theme_revision >= 1),
  constraint style_sources_source_json_check
    check (jsonb_typeof(source_json) = 'object'),
  constraint style_sources_source_hash_check
    check (source_hash ~ '^sha256-[0-9a-f]{64}$')
);

create unique index if not exists style_sources_workspace_id_idx
  on style_sources(workspace_id, id);
create index if not exists style_sources_theme_created_idx
  on style_sources(workspace_id, theme_id, created_at desc);
create unique index if not exists style_sources_proposal_source_idx
  on style_sources(workspace_id, theme_id, proposal_id, source_ordinal);

create table if not exists product_style_applications (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  theme_id text not null,
  environment_id text not null,
  proposal_id text not null,
  request_hash text not null,
  source_set_hash text not null,
  draft_revision integer not null,
  draft_updated_at timestamptz not null,
  preview_theme_json jsonb not null,
  preview_theme_hash text not null,
  source_receipts_json jsonb not null,
  draft_changed boolean not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  constraint product_style_applications_theme_scope_fk
    foreign key (workspace_id, theme_id)
    references themes(workspace_id, id) on delete restrict,
  constraint product_style_applications_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete restrict,
  constraint product_style_applications_creator_membership_scope_fk
    foreign key (workspace_id, created_by_user_id)
    references workspace_memberships(workspace_id, user_id) on delete restrict,
  constraint product_style_applications_proposal_id_check
    check (proposal_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  constraint product_style_applications_request_hash_check
    check (request_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint product_style_applications_source_set_hash_check
    check (source_set_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint product_style_applications_draft_revision_check
    check (draft_revision >= 1),
  constraint product_style_applications_preview_theme_check
    check (
      jsonb_typeof(preview_theme_json) = 'object'
      and preview_theme_json->>'themeId' = theme_id
      and (preview_theme_json->>'version')::integer = draft_revision
      and preview_theme_json->>'contentHash' = preview_theme_hash
    ),
  constraint product_style_applications_preview_theme_hash_check
    check (preview_theme_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint product_style_applications_source_receipts_check
    check (
      jsonb_typeof(source_receipts_json) = 'array'
      and jsonb_array_length(source_receipts_json) between 1 and 21
    )
);

create unique index if not exists product_style_applications_workspace_id_idx
  on product_style_applications(workspace_id, id);
create unique index if not exists product_style_applications_proposal_idx
  on product_style_applications(workspace_id, theme_id, proposal_id);
create index if not exists product_style_applications_theme_created_idx
  on product_style_applications(workspace_id, theme_id, created_at desc);

create table if not exists brand_drift_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  theme_id text not null,
  baseline_theme_version_id text not null,
  trigger text not null,
  classification text not null,
  confidence integer not null,
  report_json jsonb not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  constraint brand_drift_runs_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete restrict,
  constraint brand_drift_runs_document_scope_fk
    foreign key (workspace_id, document_id)
    references documents(workspace_id, id) on delete restrict,
  constraint brand_drift_runs_theme_version_scope_fk
    foreign key (workspace_id, theme_id, baseline_theme_version_id)
    references theme_versions(workspace_id, theme_id, id) on delete restrict,
  constraint brand_drift_runs_creator_membership_scope_fk
    foreign key (workspace_id, created_by_user_id)
    references workspace_memberships(workspace_id, user_id) on delete restrict,
  constraint brand_drift_runs_trigger_check
    check (trigger in ('authoring_open', 'creator_check')),
  constraint brand_drift_runs_classification_check
    check (classification in ('unchanged', 'warning', 'actionable')),
  constraint brand_drift_runs_confidence_check
    check (confidence between 0 and 100),
  constraint brand_drift_runs_report_check
    check (
      jsonb_typeof(report_json) = 'object'
      and report_json->>'checkId' = id
      and report_json->>'themeId' = theme_id
      and report_json->>'baselineThemeVersionId' = baseline_theme_version_id
      and report_json->>'trigger' = trigger
      and report_json->>'classification' = classification
      and (report_json->>'confidence')::integer = confidence
      and jsonb_typeof(report_json->'sourceComparisons') = 'array'
      and jsonb_typeof(report_json->'changedRoles') = 'array'
      and jsonb_typeof(report_json->'accessibilityConsequences') = 'array'
      and jsonb_typeof(report_json->'affectedExperiences') = 'array'
    )
);

create unique index if not exists brand_drift_runs_workspace_id_idx
  on brand_drift_runs(workspace_id, id);
create index if not exists brand_drift_runs_document_created_idx
  on brand_drift_runs(workspace_id, document_id, created_at desc);
create index if not exists brand_drift_runs_theme_created_idx
  on brand_drift_runs(workspace_id, theme_id, created_at desc);

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
alter table product_style_applications enable row level security;
alter table product_style_applications force row level security;
alter table brand_drift_runs enable row level security;
alter table brand_drift_runs force row level security;
alter table publication_verifications enable row level security;
alter table publication_verifications force row level security;
alter table release_approvals enable row level security;
alter table release_approvals force row level security;

-- These evidence records are append-only for the runtime role. Deliberately omit
-- UPDATE and DELETE policies even though the role has general table grants.
create policy style_sources_workspace_isolation on style_sources
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy style_sources_workspace_insert on style_sources
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy product_style_applications_workspace_isolation on product_style_applications
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy product_style_applications_workspace_insert on product_style_applications
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy brand_drift_runs_workspace_isolation on brand_drift_runs
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy brand_drift_runs_workspace_insert on brand_drift_runs
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

-- Squashed source: 0006_auth_lifecycle_reliability.sql
create table if not exists workspace_invitations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email_normalized text not null,
  email_lookup_hash text not null,
  token_hash text not null,
  role text not null,
  invited_by_user_id text not null references users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_invitations_id_check check (id ~ '^invite_[A-Za-z0-9_-]{20,}$'),
  constraint workspace_invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_invitations_lookup_hash_check check (email_lookup_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_invitations_email_check check (
    char_length(email_normalized) between 3 and 320
    and email_normalized = lower(btrim(email_normalized))
  ),
  constraint workspace_invitations_role_check check (role in ('admin', 'member', 'viewer')),
  constraint workspace_invitations_expiry_check check (created_at < expires_at),
  constraint workspace_invitations_terminal_state_check check (
    accepted_at is null or revoked_at is null
  )
);
create index if not exists workspace_invitations_workspace_idx
  on workspace_invitations(workspace_id);
create unique index if not exists workspace_invitations_token_hash_idx
  on workspace_invitations(token_hash);
create unique index if not exists workspace_invitations_active_email_idx
  on workspace_invitations(workspace_id, email_lookup_hash)
  where accepted_at is null and revoked_at is null;
alter table workspace_invitations enable row level security;
alter table workspace_invitations force row level security;

create table if not exists workspace_invitation_outbox (
  id text primary key,
  type text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  invitation_id text not null unique references workspace_invitations(id) on delete cascade,
  recipient_email text not null,
  payload jsonb not null,
  available_at timestamptz not null,
  processed_at timestamptz,
  attempts integer not null default 0,
  lease_version integer not null default 0,
  last_error text,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_invitation_outbox_id_check check (id ~ '^outbox_[A-Za-z0-9_-]{20,}$'),
  constraint workspace_invitation_outbox_type_check check (type = 'workspace_invitation'),
  constraint workspace_invitation_outbox_recipient_check check (
    char_length(recipient_email) between 3 and 320 and recipient_email = lower(btrim(recipient_email))
  ),
  constraint workspace_invitation_outbox_attempts_check check (attempts between 0 and 20),
  constraint workspace_invitation_outbox_lease_version_check check (lease_version between 0 and 2147483647),
  constraint workspace_invitation_outbox_last_error_check check (
    last_error is null or last_error ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint workspace_invitation_outbox_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['purpose', 'invitationId', 'acceptancePath', 'keyId']
    and jsonb_typeof(payload->'purpose') = 'string'
    and jsonb_typeof(payload->'invitationId') = 'string'
    and jsonb_typeof(payload->'acceptancePath') = 'string'
    and jsonb_typeof(payload->'keyId') = 'string'
    and payload->>'purpose' = 'workspace_invitation'
    and payload->>'invitationId' ~ '^invite_[A-Za-z0-9_-]{20,}$'
    and char_length(payload->>'acceptancePath') between 1 and 2048
    and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  )
);
create index if not exists workspace_invitation_outbox_due_idx
  on workspace_invitation_outbox(available_at, created_at)
  where processed_at is null and terminal_at is null and attempts < 20;
create index if not exists workspace_invitation_outbox_workspace_idx
  on workspace_invitation_outbox(workspace_id);
alter table workspace_invitation_outbox enable row level security;
alter table workspace_invitation_outbox force row level security;
create policy workspace_invitations_workspace_isolation on workspace_invitations
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));

create policy auth_outbox_delivery_lookup on auth_outbox for select
  using (id = current_setting('lodariq.auth_delivery_outbox_id', true));
create policy set_password_outbox_delivery_lookup on set_password_outbox for select
  using (id = current_setting('lodariq.auth_delivery_outbox_id', true));
create policy users_auth_maintenance_select on users for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy users_auth_maintenance_delete on users for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy workspaces_auth_maintenance_select on workspaces for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy workspaces_auth_maintenance_delete on workspaces for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy workspace_memberships_auth_maintenance_select on workspace_memberships for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy password_credentials_auth_maintenance_select on password_credentials for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy auth_sessions_auth_maintenance_select on auth_sessions for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy auth_sessions_auth_maintenance_delete on auth_sessions for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy email_verification_challenges_auth_maintenance_select on email_verification_challenges for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy email_verification_challenges_auth_maintenance_delete on email_verification_challenges for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy set_password_challenges_auth_maintenance_select on set_password_challenges for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy set_password_challenges_auth_maintenance_delete on set_password_challenges for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy auth_outbox_auth_maintenance_select on auth_outbox for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy auth_outbox_auth_maintenance_delete on auth_outbox for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy set_password_outbox_auth_maintenance_select on set_password_outbox for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy set_password_outbox_auth_maintenance_delete on set_password_outbox for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy auth_rate_limits_auth_maintenance_select on auth_rate_limits for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy auth_rate_limits_auth_maintenance_delete on auth_rate_limits for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy documents_auth_maintenance_guard on documents for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy public_sdk_installations_auth_maintenance_guard on public_sdk_installations for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy themes_auth_maintenance_guard on themes for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy workspace_invitations_auth_maintenance_guard on workspace_invitations for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');

commit;


-- =============================================================================
-- Squashed source: 0008_resumable_identity_onboarding.sql
-- =============================================================================

begin;

create table if not exists identity_onboarding_states (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  intent text not null,
  status text not null,
  target_workspace_id text,
  target_workspace_name text,
  invitation_id text,
  requested_workspace_id text,
  completed_workspace_id text references workspaces(id) on delete set null,
  version integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_onboarding_id_check check (id ~ '^onboard_[A-Za-z0-9_-]{20,}$'),
  constraint identity_onboarding_intent_check check (
    intent in ('create_workspace', 'accept_invitation', 'request_access')
  ),
  constraint identity_onboarding_status_check check (
    status in ('pending_identity', 'pending_destination', 'completed', 'cancelled')
  ),
  constraint identity_onboarding_version_check check (version between 1 and 2147483647),
  constraint identity_onboarding_create_workspace_check check (
    intent <> 'create_workspace' or (
      target_workspace_id is not null
      and char_length(target_workspace_name) between 1 and 120
    )
  ),
  constraint identity_onboarding_completion_check check (
    status <> 'completed' or completed_workspace_id is not null
  ),
  constraint identity_onboarding_expiry_check check (created_at < expires_at)
);
create unique index if not exists identity_onboarding_active_user_idx
  on identity_onboarding_states(user_id)
  where status in ('pending_identity', 'pending_destination');
create index if not exists identity_onboarding_expiry_idx
  on identity_onboarding_states(expires_at);

create table if not exists auth_security_events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null,
  identity_id text not null,
  authorization_source text not null,
  occurred_at timestamptz not null,
  constraint auth_security_events_id_check check (id ~ '^authevt_[A-Za-z0-9_-]{20,}$'),
  constraint auth_security_events_type_check check (
    event_type in (
      'identity_linked', 'identity_unlinked', 'identity_unlink_rejected_final_method'
    )
  ),
  constraint auth_security_events_authorization_check check (
    authorization_source in ('authenticated_session', 'strong_recovery')
  )
);
create index if not exists auth_security_events_user_time_idx
  on auth_security_events(user_id, occurred_at);

alter table identity_onboarding_states enable row level security;
alter table identity_onboarding_states force row level security;
alter table auth_security_events enable row level security;
alter table auth_security_events force row level security;

create policy identity_onboarding_states_auth_self
  on identity_onboarding_states for select using (
    user_id = current_setting('lodariq.auth_user_id', true)
  );
create policy identity_onboarding_states_owned_insert
  on identity_onboarding_states for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
  );
create policy identity_onboarding_states_owned_update
  on identity_onboarding_states for update using (
    user_id = current_setting('lodariq.auth_user_id', true)
  ) with check (
    user_id = current_setting('lodariq.auth_user_id', true)
  );
create policy auth_security_events_auth_self
  on auth_security_events for select using (
    user_id = current_setting('lodariq.auth_user_id', true)
  );
create policy auth_security_events_owned_insert
  on auth_security_events for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and actor_user_id = current_setting('lodariq.auth_user_id', true)
  );

commit;

-- =============================================================================
-- Squashed source: 0007_provider_neutral_identity.sql
-- =============================================================================

begin;

create table if not exists user_emails (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  normalized_email text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_emails_id_check check (id ~ '^email_[A-Za-z0-9_-]{20,}$'),
  constraint user_emails_normalized_check check (
    char_length(normalized_email) between 3 and 320
    and normalized_email = lower(btrim(normalized_email))
  )
);
create unique index if not exists user_emails_normalized_idx on user_emails(normalized_email);
create unique index if not exists user_emails_primary_user_idx on user_emails(user_id)
  where is_primary;
create index if not exists user_emails_user_idx on user_emails(user_id);

create table if not exists usernames (
  id text primary key,
  user_id text not null unique references users(id) on delete cascade,
  normalized_username text not null,
  display_username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usernames_id_check check (id ~ '^uname_[A-Za-z0-9_-]{20,}$'),
  constraint usernames_normalized_check check (
    char_length(normalized_username) between 3 and 32
    and normalized_username = lower(btrim(normalized_username))
    and normalized_username ~ '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$'
    and normalized_username !~ '[._-]{2}'
  ),
  constraint usernames_display_check check (
    char_length(display_username) between 3 and 32
    and display_username = btrim(display_username)
    and display_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$'
    and display_username !~ '[._-]{2}'
    and lower(display_username) = normalized_username
  ),
  constraint usernames_reserved_check check (
    normalized_username not in (
      'account', 'admin', 'administrator', 'api', 'app', 'auth', 'billing',
      'dashboard', 'editor', 'help', 'lodariq', 'login', 'logout', 'me',
      'oauth', 'owner', 'root', 'security', 'settings', 'signin', 'signup',
      'sso', 'support', 'system', 'verify', 'www'
    )
  )
);
create unique index if not exists usernames_normalized_idx on usernames(normalized_username);

create table if not exists auth_identities (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  kind text not null,
  issuer text not null,
  subject text not null,
  provider_tenant_id text,
  created_at timestamptz not null default now(),
  last_authenticated_at timestamptz,
  constraint auth_identities_id_check check (id ~ '^ident_[A-Za-z0-9_-]{20,}$'),
  constraint auth_identities_kind_check check (kind in ('password', 'passkey', 'oidc', 'saml')),
  constraint auth_identities_provider_tenant_check check (
    (
      kind in ('password', 'passkey')
      and issuer = 'https://lodariq.io'
      and provider_tenant_id is null
    ) or (
      kind in ('oidc', 'saml')
      and provider_tenant_id is not null
    )
  ),
  constraint auth_identities_subject_check check (
    char_length(subject) between 1 and 1024
    and char_length(issuer) between 1 and 2048
  )
);
create unique index if not exists auth_identities_issuer_subject_idx
  on auth_identities(issuer, subject);
create index if not exists auth_identities_user_idx on auth_identities(user_id);
create index if not exists auth_identities_provider_tenant_idx
  on auth_identities(provider_tenant_id);

alter table auth_sessions add column if not exists identity_id text
  references auth_identities(id) on delete restrict;
alter table auth_sessions add column if not exists authentication_method text
  not null default 'password';
alter table auth_sessions add column if not exists assurance_level text
  not null default 'aal1';
alter table auth_sessions add column if not exists authenticated_at timestamptz
  not null default now();
alter table auth_sessions add column if not exists duration_policy text
  not null default 'standard';
alter table auth_sessions add constraint auth_sessions_method_check
  check (authentication_method in ('password', 'passkey', 'oidc', 'saml', 'recovery'));
alter table auth_sessions add constraint auth_sessions_assurance_check
  check (assurance_level in ('aal1', 'aal2', 'aal3'));
alter table auth_sessions add constraint auth_sessions_duration_policy_check
  check (duration_policy in ('standard', 'remembered', 'managed'));
-- Application writes enforce authenticated_at <= created_at. SQL validation is
-- deferred until the provider-neutral expand/contract compatibility window ends.

create table if not exists workspace_auth_policies (
  workspace_id text primary key references workspaces(id) on delete cascade,
  sso_required boolean not null default false,
  minimum_assurance text not null default 'aal1',
  password_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_auth_policies_assurance_check
    check (minimum_assurance in ('aal1', 'aal2', 'aal3')),
  constraint workspace_auth_policies_viable_method_check
    check (password_allowed or sso_required)
);

create table if not exists sso_connections (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  protocol text not null,
  issuer text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sso_connections_id_check check (id ~ '^sso_[A-Za-z0-9_-]{20,}$'),
  constraint sso_connections_protocol_check check (protocol in ('oidc', 'saml')),
  constraint sso_connections_status_check check (status in ('draft', 'verified', 'disabled')),
  constraint sso_connections_issuer_check check (char_length(issuer) between 1 and 2048)
);
create unique index if not exists sso_connections_workspace_issuer_idx
  on sso_connections(workspace_id, protocol, issuer);
create index if not exists sso_connections_workspace_idx on sso_connections(workspace_id);

alter table user_emails enable row level security;
alter table user_emails force row level security;
alter table usernames enable row level security;
alter table usernames force row level security;
alter table auth_identities enable row level security;
alter table auth_identities force row level security;
alter table workspace_auth_policies enable row level security;
alter table workspace_auth_policies force row level security;
alter table sso_connections enable row level security;
alter table sso_connections force row level security;

create policy user_emails_auth_self on user_emails for select
  using (user_id = current_setting('lodariq.auth_user_id', true));
create policy user_emails_owned_insert on user_emails for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
  and normalized_email = current_setting('lodariq.auth_email_normalized', true)
);
create policy user_emails_owned_update on user_emails for update
  using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy usernames_auth_lookup on usernames for select using (
  normalized_username = current_setting('lodariq.auth_identifier_normalized', true)
  or user_id = current_setting('lodariq.auth_user_id', true)
);
create policy usernames_owned_insert on usernames for insert
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy usernames_owned_update on usernames for update
  using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy auth_identities_auth_self on auth_identities for select
  using (user_id = current_setting('lodariq.auth_user_id', true));
create policy auth_identities_provider_lookup on auth_identities for select using (
  issuer = current_setting('lodariq.auth_identity_issuer', true)
  and subject = current_setting('lodariq.auth_identity_subject', true)
);
create policy auth_identities_owned_insert on auth_identities for insert
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy auth_identities_owned_update on auth_identities for update
  using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy workspace_auth_policies_workspace_isolation on workspace_auth_policies for all
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy sso_connections_workspace_isolation on sso_connections for all
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

-- 0008 continuation: the onboarding tables above intentionally depend only on
-- the long-lived users/workspaces foundation; identity lifecycle expansion
-- follows the provider-neutral identity table definition.
alter table auth_identities add column if not exists disabled_at timestamptz;

-- =============================================================================
-- Squashed source: 0009_tenant_administration.sql
-- =============================================================================

alter table workspaces add column if not exists deleted_at timestamptz;
alter table workspaces add column if not exists retention_expires_at timestamptz;

create table if not exists tenant_audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete restrict,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null,
  target_user_id text references users(id) on delete set null,
  invitation_id text,
  previous_role text,
  next_role text,
  occurred_at timestamptz not null,
  constraint tenant_audit_events_id_check check (id ~ '^tenevt_[A-Za-z0-9_-]{20,}$'),
  constraint tenant_audit_events_type_check check (
    event_type in (
      'invitation_created', 'invitation_revoked', 'invitation_accepted',
      'membership_role_changed', 'membership_removed', 'ownership_transferred',
      'workspace_deletion_scheduled', 'workspace_deletion_cancelled'
    )
  ),
  constraint tenant_audit_events_previous_role_check check (
    previous_role is null or previous_role in ('owner', 'admin', 'member', 'viewer')
  ),
  constraint tenant_audit_events_next_role_check check (
    next_role is null or next_role in ('owner', 'admin', 'member', 'viewer')
  )
);
create index if not exists tenant_audit_events_workspace_time_idx
  on tenant_audit_events(workspace_id, occurred_at);
alter table tenant_audit_events enable row level security;
alter table tenant_audit_events force row level security;

create or replace function public.lodariq_current_workspace_role(candidate_workspace_id text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  return (
    select membership.role
    from workspace_memberships membership
    where candidate_workspace_id = current_setting('lodariq.workspace_id', true)
      and membership.workspace_id = candidate_workspace_id
      and membership.user_id = current_setting('lodariq.auth_user_id', true)
    limit 1
  );
end
$$;
create or replace function public.lodariq_workspace_is_empty(candidate_workspace_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  return candidate_workspace_id = current_setting('lodariq.workspace_id', true)
    and not exists (
      select 1 from workspace_memberships membership
      where membership.workspace_id = candidate_workspace_id
    );
end
$$;
create or replace function public.lodariq_user_is_workspace_member(
  candidate_user_id text,
  candidate_workspace_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  return exists (
    select 1
    from workspace_memberships membership
    where membership.user_id = candidate_user_id
      and membership.workspace_id = candidate_workspace_id
  );
end
$$;
create or replace function public.lodariq_accept_workspace_invitation(
  candidate_invitation_id text,
  candidate_token_hash text,
  candidate_user_id text,
  candidate_accepted_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  affected_rows integer;
begin
  if candidate_user_id is distinct from current_setting('lodariq.auth_user_id', true)
    or candidate_token_hash is distinct from current_setting(
      'lodariq.workspace_invitation_token_hash', true
    )
    or candidate_accepted_at is null
    or candidate_accepted_at > clock_timestamp() + interval '5 minutes'
  then
    return false;
  end if;

  update workspace_invitations invitation
  set accepted_at = candidate_accepted_at
  where invitation.id = candidate_invitation_id
    and invitation.token_hash = candidate_token_hash
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > candidate_accepted_at
    and invitation.expires_at > clock_timestamp()
    and exists (
      select 1
      from user_emails email
      where email.user_id = candidate_user_id
        and email.is_primary
        and email.verified_at is not null
        and email.normalized_email = invitation.email_normalized
    );
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end
$$;
revoke all on function public.lodariq_current_workspace_role(text) from public;
revoke all on function public.lodariq_workspace_is_empty(text) from public;
revoke all on function public.lodariq_user_is_workspace_member(text, text) from public;
revoke all on function public.lodariq_accept_workspace_invitation(text, text, text, timestamptz)
  from public;
-- Execution is granted only to the configured runtime role by the reviewed
-- role-provisioning step. PUBLIC remains revoked so arbitrary database roles
-- cannot manufacture session settings and invoke SECURITY DEFINER helpers.

drop policy if exists workspace_memberships_workspace_isolation on workspace_memberships;
drop policy if exists workspace_memberships_owned_creation on workspace_memberships;
drop policy if exists workspace_memberships_invitation_accept on workspace_memberships;
drop policy if exists workspace_memberships_admin_update on workspace_memberships;
drop policy if exists workspace_memberships_admin_delete on workspace_memberships;
create policy workspace_memberships_workspace_isolation on workspace_memberships
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) is not null
  );
create policy workspace_memberships_owned_creation on workspace_memberships
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and user_id = current_setting('lodariq.auth_user_id', true)
    and role = 'owner'
    and public.lodariq_workspace_is_empty(workspace_id)
  );
create policy workspace_memberships_invitation_accept on workspace_memberships
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and user_id = current_setting('lodariq.auth_user_id', true)
    and exists (
      select 1 from workspace_invitations invitation
      where invitation.workspace_id = workspace_memberships.workspace_id
        and invitation.role = workspace_memberships.role
        and invitation.token_hash = current_setting('lodariq.workspace_invitation_token_hash', true)
        and invitation.accepted_at is null
        and invitation.revoked_at is null
        and invitation.expires_at > now()
    )
  );
create policy workspace_memberships_admin_update on workspace_memberships
  for update using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  ) with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_memberships_admin_delete on workspace_memberships
  for delete using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );

drop policy if exists workspace_invitations_workspace_isolation on workspace_invitations;
drop policy if exists workspace_invitations_token_accept_lookup on workspace_invitations;
drop policy if exists workspace_invitations_admin_insert on workspace_invitations;
drop policy if exists workspace_invitations_admin_update on workspace_invitations;
drop policy if exists workspace_invitations_token_accept_update on workspace_invitations;
create policy workspace_invitations_workspace_isolation on workspace_invitations
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );
create policy workspace_invitations_token_accept_lookup on workspace_invitations
  for select using (
    token_hash = current_setting('lodariq.workspace_invitation_token_hash', true)
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
    and exists (
      select 1 from user_emails email
      where email.user_id = current_setting('lodariq.auth_user_id', true)
        and email.is_primary
        and email.verified_at is not null
        and email.normalized_email = workspace_invitations.email_normalized
    )
  );
create policy workspace_invitations_admin_insert on workspace_invitations
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and invited_by_user_id = current_setting('lodariq.auth_user_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );
create policy workspace_invitations_admin_update on workspace_invitations
  for update using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  ) with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_invitations_token_accept_update on workspace_invitations
  for update using (false) with check (false);

drop policy if exists workspace_invitation_outbox_workspace_isolation on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_workspace_insert on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_workspace_update on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_worker_select on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_worker_update on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_delivery_lookup on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_auth_maintenance_select on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_auth_maintenance_delete on workspace_invitation_outbox;

create policy workspace_invitation_outbox_workspace_isolation on workspace_invitation_outbox
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );
create policy workspace_invitation_outbox_workspace_insert on workspace_invitation_outbox
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
    and exists (
      select 1 from workspace_invitations invitation
      where invitation.id = workspace_invitation_outbox.invitation_id
        and invitation.workspace_id = workspace_invitation_outbox.workspace_id
        and invitation.email_normalized = workspace_invitation_outbox.recipient_email
        and invitation.invited_by_user_id = current_setting('lodariq.auth_user_id', true)
    )
  );
create policy workspace_invitation_outbox_workspace_update on workspace_invitation_outbox
  for update using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  ) with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_invitation_outbox_worker_select on workspace_invitation_outbox
  for select using (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy workspace_invitation_outbox_worker_update on workspace_invitation_outbox
  for update using (current_setting('lodariq.auth_outbox_worker', true) = 'true')
  with check (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy workspace_invitation_outbox_delivery_lookup on workspace_invitation_outbox
  for select using (id = current_setting('lodariq.auth_delivery_outbox_id', true));
create policy workspace_invitation_outbox_auth_maintenance_select on workspace_invitation_outbox
  for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy workspace_invitation_outbox_auth_maintenance_delete on workspace_invitation_outbox
  for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');

drop policy if exists user_emails_workspace_reference on user_emails;
create policy user_emails_workspace_reference on user_emails
  for select using (
    is_primary
    and public.lodariq_user_is_workspace_member(
      user_emails.user_id,
      current_setting('lodariq.workspace_id', true)
    )
  );
drop policy if exists users_workspace_reference on users;
create policy users_workspace_reference on users
  for select using (
    public.lodariq_user_is_workspace_member(
      users.id,
      current_setting('lodariq.workspace_id', true)
    )
  );
drop policy if exists workspaces_user_discovery on workspaces;
create policy workspaces_user_discovery on workspaces
  for select using (
    public.lodariq_user_is_workspace_member(
      current_setting('lodariq.auth_user_id', true),
      workspaces.id
    )
  );

drop policy if exists tenant_audit_events_workspace_isolation on tenant_audit_events;
drop policy if exists tenant_audit_events_workspace_insert on tenant_audit_events;
create policy tenant_audit_events_workspace_isolation on tenant_audit_events
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) is not null
  );
create policy tenant_audit_events_workspace_insert on tenant_audit_events
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and actor_user_id = current_setting('lodariq.auth_user_id', true)
    and public.lodariq_current_workspace_role(workspace_id) is not null
  );

commit;

-- =============================================================================
-- Squashed source: 0010_account_session_management.sql
-- =============================================================================

-- Account and session management expand migration.
-- Shared-environment execution requires explicit operator approval.
begin;

alter table users add column if not exists deleted_at timestamptz;
alter table users add column if not exists retention_expires_at timestamptz;
alter table auth_sessions add column if not exists device_label text
  not null default 'Unknown device';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'auth_sessions_device_label_check'
  ) then
    alter table auth_sessions add constraint auth_sessions_device_label_check
      check (char_length(device_label) between 1 and 120 and device_label = btrim(device_label));
  end if;
end
$$;

create table if not exists account_security_events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null,
  target_id text,
  occurred_at timestamptz not null,
  constraint account_security_events_id_check
    check (id ~ '^acctevt_[A-Za-z0-9_-]{20,}$'),
  constraint account_security_events_type_check check (
    event_type in (
      'password_changed', 'email_change_started', 'email_change_current_verified',
      'email_change_new_verified', 'email_changed', 'session_revoked',
      'sessions_revoked_all', 'account_deletion_scheduled', 'passkey_registered',
      'passkey_authenticated', 'recovery_codes_generated',
      'recovery_codes_confirmed', 'recovery_code_used', 'recovery_codes_revoked'
    )
  ),
  constraint account_security_events_actor_check check (actor_user_id = user_id)
);
create index if not exists account_security_events_user_time_idx
  on account_security_events(user_id, occurred_at);

create table if not exists account_email_change_challenges (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  current_email_normalized text not null,
  new_email_normalized text not null,
  new_email_lookup_hash text not null,
  current_token_hash text not null unique,
  new_token_hash text not null unique,
  key_id text not null,
  current_verified_at timestamptz,
  new_verified_at timestamptz,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_email_change_id_check
    check (id ~ '^emailchange_[A-Za-z0-9_-]{20,}$'),
  constraint account_email_change_email_check check (
    char_length(current_email_normalized) between 3 and 320
    and char_length(new_email_normalized) between 3 and 320
    and current_email_normalized = lower(btrim(current_email_normalized))
    and new_email_normalized = lower(btrim(new_email_normalized))
    and current_email_normalized <> new_email_normalized
  ),
  constraint account_email_change_hash_check check (
    new_email_lookup_hash ~ '^[0-9a-f]{64}$'
    and current_token_hash ~ '^[0-9a-f]{64}$'
    and new_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint account_email_change_key_check
    check (key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  constraint account_email_change_expiry_check check (created_at < expires_at)
);
create unique index if not exists account_email_change_active_user_idx
  on account_email_change_challenges(user_id)
  where consumed_at is null and revoked_at is null;
create index if not exists account_email_change_expiry_idx
  on account_email_change_challenges(expires_at);

create table if not exists account_email_change_outbox (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  challenge_id text not null references account_email_change_challenges(id) on delete cascade,
  recipient_email text not null,
  payload jsonb not null,
  available_at timestamptz not null,
  processed_at timestamptz,
  attempts integer not null default 0,
  lease_version integer not null default 0,
  last_error text,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_email_change_outbox_id_check
    check (id ~ '^outbox_[A-Za-z0-9_-]{20,}$'),
  constraint account_email_change_outbox_type_check
    check (type = 'account_email_change'),
  constraint account_email_change_outbox_recipient_check check (
    char_length(recipient_email) between 3 and 320
    and recipient_email = lower(btrim(recipient_email))
  ),
  constraint account_email_change_outbox_attempts_check
    check (attempts between 0 and 20),
  constraint account_email_change_outbox_lease_check
    check (lease_version between 0 and 2147483647),
  constraint account_email_change_outbox_error_check
    check (last_error is null or last_error ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint account_email_change_outbox_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['purpose', 'challengeId', 'proof', 'changePath', 'keyId']
    and payload->>'purpose' = 'account_email_change'
    and payload->>'challengeId' ~ '^emailchange_[A-Za-z0-9_-]{20,}$'
    and payload->>'proof' in ('current_email', 'new_email')
    and char_length(payload->>'changePath') between 1 and 2048
    and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  )
);
create unique index if not exists account_email_change_outbox_proof_idx
  on account_email_change_outbox(challenge_id, (payload->>'proof'));
create index if not exists account_email_change_outbox_due_idx
  on account_email_change_outbox(available_at, created_at)
  where processed_at is null and terminal_at is null and attempts < 20;

alter table account_security_events enable row level security;
alter table account_security_events force row level security;
alter table account_email_change_challenges enable row level security;
alter table account_email_change_challenges force row level security;
alter table account_email_change_outbox enable row level security;
alter table account_email_change_outbox force row level security;

create or replace function public.lodariq_schedule_account_deletion(
  candidate_user_id text,
  candidate_deleted_at timestamptz,
  candidate_retention_expires_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  affected_rows integer;
begin
  if candidate_user_id is distinct from current_setting('lodariq.auth_user_id', true)
    or candidate_deleted_at is null
    or candidate_retention_expires_at is null
    or candidate_deleted_at > clock_timestamp() + interval '5 minutes'
    or candidate_retention_expires_at < candidate_deleted_at + interval '30 days'
    or candidate_retention_expires_at > candidate_deleted_at + interval '31 days'
  then
    return 'conflict';
  end if;

  if exists (
    select 1
    from workspace_memberships owned
    where owned.user_id = candidate_user_id
      and owned.role = 'owner'
      and not exists (
        select 1
        from workspace_memberships other_owner
        where other_owner.workspace_id = owned.workspace_id
          and other_owner.role = 'owner'
          and other_owner.user_id <> candidate_user_id
      )
  ) then
    return 'final_owner';
  end if;

  update users
  set deleted_at = candidate_deleted_at,
      retention_expires_at = candidate_retention_expires_at
  where id = candidate_user_id
    and deleted_at is null;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    return 'conflict';
  end if;

  update auth_sessions
  set revoked_at = candidate_deleted_at
  where user_id = candidate_user_id and revoked_at is null;
  update authoring_activation_grants
  set revoked_at = candidate_deleted_at
  where creator_id = candidate_user_id and revoked_at is null;
  update authoring_sessions
  set revoked_at = candidate_deleted_at
  where created_by_user_id = candidate_user_id and revoked_at is null;
  update identity_onboarding_states
  set status = 'cancelled', updated_at = candidate_deleted_at, version = version + 1
  where user_id = candidate_user_id
    and status in ('pending_identity', 'pending_destination');
  update account_email_change_challenges
  set revoked_at = candidate_deleted_at
  where user_id = candidate_user_id
    and consumed_at is null
    and revoked_at is null;
  update account_email_change_outbox
  set terminal_at = candidate_deleted_at,
      last_error = 'account_deleted'
  where user_id = candidate_user_id
    and processed_at is null
    and terminal_at is null;
  update set_password_challenges
  set used_at = candidate_deleted_at
  where user_id = candidate_user_id
    and used_at is null;
  update set_password_outbox
  set terminal_at = candidate_deleted_at,
      last_error = 'account_deleted'
  where user_id = candidate_user_id
    and processed_at is null
    and terminal_at is null;

  return 'scheduled';
end
$$;
revoke all on function public.lodariq_schedule_account_deletion(text, timestamptz, timestamptz)
  from public;
-- The reviewed runtime-role provisioning step grants this exact signature.
-- PUBLIC remains revoked because session settings are not an authorization
-- boundary against an arbitrary database login.


drop policy if exists users_account_management_update on users;
create policy users_account_management_update on users
  for update using (
    id = current_setting('lodariq.auth_user_id', true)
  ) with check (
    id = current_setting('lodariq.auth_user_id', true)
  );

drop policy if exists account_security_events_auth_self on account_security_events;
drop policy if exists account_security_events_owned_insert on account_security_events;
create policy account_security_events_auth_self on account_security_events
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_security_events_owned_insert on account_security_events
  for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and actor_user_id = current_setting('lodariq.auth_user_id', true)
  );

drop policy if exists account_email_change_challenges_auth_self on account_email_change_challenges;
drop policy if exists account_email_change_challenges_owned_insert on account_email_change_challenges;
drop policy if exists account_email_change_challenges_owned_update on account_email_change_challenges;
create policy account_email_change_challenges_auth_self on account_email_change_challenges
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_challenges_owned_insert on account_email_change_challenges
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_challenges_owned_update on account_email_change_challenges
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));

drop policy if exists account_email_change_outbox_auth_self on account_email_change_outbox;
drop policy if exists account_email_change_outbox_owned_insert on account_email_change_outbox;
drop policy if exists account_email_change_outbox_owned_update on account_email_change_outbox;
drop policy if exists account_email_change_outbox_worker_select on account_email_change_outbox;
drop policy if exists account_email_change_outbox_worker_update on account_email_change_outbox;
drop policy if exists account_email_change_outbox_delivery_lookup on account_email_change_outbox;
drop policy if exists account_email_change_outbox_maintenance_select on account_email_change_outbox;
drop policy if exists account_email_change_outbox_maintenance_delete on account_email_change_outbox;
create policy account_email_change_outbox_auth_self on account_email_change_outbox
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_outbox_owned_insert on account_email_change_outbox
  for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and exists (
      select 1 from account_email_change_challenges challenge
      where challenge.id = account_email_change_outbox.challenge_id
        and challenge.user_id = account_email_change_outbox.user_id
    )
  );
create policy account_email_change_outbox_owned_update on account_email_change_outbox
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_outbox_worker_select on account_email_change_outbox
  for select using (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy account_email_change_outbox_worker_update on account_email_change_outbox
  for update using (current_setting('lodariq.auth_outbox_worker', true) = 'true')
  with check (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy account_email_change_outbox_delivery_lookup on account_email_change_outbox
  for select using (id = current_setting('lodariq.auth_delivery_outbox_id', true));
create policy account_email_change_outbox_maintenance_select on account_email_change_outbox
  for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy account_email_change_outbox_maintenance_delete on account_email_change_outbox
  for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');

create table webauthn_challenges (
  id text primary key,
  purpose text not null,
  user_id text references users(id) on delete cascade,
  challenge_hash text not null,
  rp_id text not null,
  origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webauthn_challenges_id_check check (id ~ '^authchal_[A-Za-z0-9_-]{20,}$'),
  constraint webauthn_challenges_purpose_check check (purpose in ('passkey_registration', 'passkey_authentication', 'passkey_step_up')),
  constraint webauthn_challenges_hash_check check (challenge_hash ~ '^[0-9a-f]{64}$'),
  constraint webauthn_challenges_rp_check check (char_length(rp_id) between 1 and 253),
  constraint webauthn_challenges_origin_check check (char_length(origin) between 8 and 2048),
  constraint webauthn_challenges_expiry_check check (created_at < expires_at)
);
create unique index webauthn_challenges_hash_idx on webauthn_challenges(challenge_hash);
create index webauthn_challenges_user_idx on webauthn_challenges(user_id);
create index webauthn_challenges_expiry_idx on webauthn_challenges(expires_at);

create table passkey_credentials (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  identity_id text not null references auth_identities(id) on delete cascade,
  credential_id text not null,
  public_key text not null,
  counter bigint not null default 0,
  transports jsonb not null default '[]'::jsonb,
  device_type text not null,
  backed_up boolean not null,
  aaguid text not null,
  name text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint passkey_credentials_id_check check (id ~ '^passkey_[A-Za-z0-9_-]{20,}$'),
  constraint passkey_credentials_credential_check check (
    credential_id ~ '^[A-Za-z0-9_-]{16,}$' and char_length(credential_id) <= 2048
  ),
  constraint passkey_credentials_public_key_check check (
    public_key ~ '^[A-Za-z0-9_-]{16,}$' and char_length(public_key) <= 8192
  ),
  constraint passkey_credentials_counter_check check (counter >= 0),
  constraint passkey_credentials_device_check check (device_type in ('singleDevice', 'multiDevice')),
  constraint passkey_credentials_name_check check (char_length(name) between 1 and 120)
);
create unique index passkey_credentials_credential_idx on passkey_credentials(credential_id);
create unique index passkey_credentials_identity_idx on passkey_credentials(identity_id);
create index passkey_credentials_user_idx on passkey_credentials(user_id);

create table recovery_code_sets (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint recovery_code_sets_id_check check (id ~ '^recoveryset_[A-Za-z0-9_-]{20,}$')
);
create unique index recovery_code_sets_active_user_idx on recovery_code_sets(user_id)
  where revoked_at is null;

create table recovery_codes (
  id text primary key,
  set_id text not null references recovery_code_sets(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint recovery_codes_id_check check (id ~ '^recoverycode_[A-Za-z0-9_-]{20,}$'),
  constraint recovery_codes_hash_check check (code_hash ~ '^[0-9a-f]{64}$')
);
create unique index recovery_codes_hash_idx on recovery_codes(code_hash);
create index recovery_codes_user_idx on recovery_codes(user_id);
create index recovery_codes_set_idx on recovery_codes(set_id);

alter table webauthn_challenges enable row level security;
alter table webauthn_challenges force row level security;
alter table passkey_credentials enable row level security;
alter table passkey_credentials force row level security;
alter table recovery_code_sets enable row level security;
alter table recovery_code_sets force row level security;
alter table recovery_codes enable row level security;
alter table recovery_codes force row level security;

create policy webauthn_challenges_auth_self on webauthn_challenges
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy webauthn_challenges_auth_insert on webauthn_challenges
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy webauthn_challenges_auth_update on webauthn_challenges
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy webauthn_challenges_public_insert on webauthn_challenges
  for insert with check (
    id = current_setting('lodariq.webauthn_challenge_id', true)
    and purpose = 'passkey_authentication'
    and user_id is null
  );
create policy webauthn_challenges_public_lookup on webauthn_challenges
  for select using (id = current_setting('lodariq.webauthn_challenge_id', true));
create policy webauthn_challenges_public_update on webauthn_challenges
  for update using (id = current_setting('lodariq.webauthn_challenge_id', true))
  with check (id = current_setting('lodariq.webauthn_challenge_id', true));

create policy passkey_credentials_auth_self on passkey_credentials
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_auth_insert on passkey_credentials
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_auth_update on passkey_credentials
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_auth_delete on passkey_credentials
  for delete using (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_credential_lookup on passkey_credentials
  for select using (credential_id = current_setting('lodariq.webauthn_credential_id', true));
create policy passkey_credentials_credential_update on passkey_credentials
  for update using (credential_id = current_setting('lodariq.webauthn_credential_id', true))
  with check (credential_id = current_setting('lodariq.webauthn_credential_id', true));

create policy recovery_code_sets_auth_self on recovery_code_sets
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_code_sets_auth_insert on recovery_code_sets
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_code_sets_auth_update on recovery_code_sets
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));

create policy recovery_codes_auth_self on recovery_codes
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_codes_auth_insert on recovery_codes
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_codes_auth_update on recovery_codes
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_codes_hash_lookup on recovery_codes
  for select using (code_hash = current_setting('lodariq.recovery_code_hash', true));
create policy recovery_codes_hash_consume on recovery_codes
  for update using (code_hash = current_setting('lodariq.recovery_code_hash', true))
  with check (code_hash = current_setting('lodariq.recovery_code_hash', true));

-- =============================================================================
-- Squashed source: 0012_oidc_authorization.sql
-- =============================================================================

create table if not exists oidc_authorization_attempts (
  id text primary key,
  provider_id text not null,
  action text not null,
  user_id text references users(id) on delete cascade,
  state_hash text not null,
  encrypted_verifier text not null,
  nonce_hash text not null,
  return_to text not null,
  workspace_name text,
  duration_policy text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oidc_authorization_attempts_id_check check (id ~ '^oidcattempt_[A-Za-z0-9_-]{20,}$'),
  constraint oidc_authorization_attempts_provider_check check (provider_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  constraint oidc_authorization_attempts_action_check check (action in ('sign_in', 'sign_up', 'link')),
  constraint oidc_authorization_attempts_duration_check check (duration_policy in ('standard', 'remembered')),
  constraint oidc_authorization_attempts_action_data_check check (
    (action = 'link' and user_id is not null and workspace_name is null)
    or (action = 'sign_up' and user_id is null and char_length(btrim(workspace_name)) between 1 and 120)
    or (action = 'sign_in' and user_id is null and workspace_name is null)
  ),
  constraint oidc_authorization_attempts_state_check check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint oidc_authorization_attempts_nonce_check check (nonce_hash ~ '^[0-9a-f]{64}$'),
  constraint oidc_authorization_attempts_verifier_check check (
    char_length(encrypted_verifier) between 64 and 4096
    and encrypted_verifier ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint oidc_authorization_attempts_return_check check (
    char_length(return_to) between 1 and 2048
    and return_to like '/%'
    and return_to not like '//%'
  ),
  constraint oidc_authorization_attempts_expiry_check check (created_at < expires_at)
);
create unique index if not exists oidc_authorization_attempts_state_idx
  on oidc_authorization_attempts(state_hash);
create index if not exists oidc_authorization_attempts_user_idx
  on oidc_authorization_attempts(user_id);
create index if not exists oidc_authorization_attempts_expiry_idx
  on oidc_authorization_attempts(expires_at);

alter table oidc_authorization_attempts enable row level security;
alter table oidc_authorization_attempts force row level security;

create policy oidc_authorization_attempts_bound_insert on oidc_authorization_attempts
  for insert with check (
    state_hash = current_setting('lodariq.oidc_state_hash', true)
    and (
      (action = 'link' and user_id = current_setting('lodariq.auth_user_id', true))
      or (action in ('sign_in', 'sign_up') and user_id is null)
    )
  );
create policy oidc_authorization_attempts_bound_lookup on oidc_authorization_attempts
  for select using (state_hash = current_setting('lodariq.oidc_state_hash', true));
create policy oidc_authorization_attempts_bound_consume on oidc_authorization_attempts
  for update using (state_hash = current_setting('lodariq.oidc_state_hash', true))
  with check (state_hash = current_setting('lodariq.oidc_state_hash', true));

commit;

-- =============================================================================
-- Squashed source: 0013_enterprise_identity.sql
-- =============================================================================


begin;

alter table sso_connections
  add column if not exists provider text not null default 'other',
  add column if not exists client_id text not null default 'migration-placeholder',
  add column if not exists provisioning_mode text not null default 'invitation_only',
  add column if not exists validated_at timestamptz;

alter table sso_connections
  add constraint sso_connections_provider_check check (provider in ('okta', 'entra', 'other')),
  add constraint sso_connections_provisioning_mode_check check (provisioning_mode in ('invitation_only', 'jit')),
  add constraint sso_connections_activation_check check (status <> 'verified' or validated_at is not null),
  add constraint sso_connections_client_id_check check (char_length(client_id) between 1 and 512);

create table if not exists enterprise_validation_evidence (
  id text primary key,
  connection_id text not null references sso_connections(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  target text not null,
  protocol text not null,
  evidence_reference text not null,
  validated_by text not null,
  validated_at timestamptz not null,
  revoked_at timestamptz,
  constraint enterprise_validation_evidence_id_check check (id ~ '^ssoevidence_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_validation_evidence_target_check check (target in ('okta', 'entra')),
  constraint enterprise_validation_evidence_protocol_check check (protocol in ('oidc', 'saml')),
  constraint enterprise_validation_evidence_reference_check check (char_length(evidence_reference) between 8 and 512),
  constraint enterprise_validation_evidence_actor_check check (char_length(validated_by) between 3 and 256),
  unique(connection_id, target, protocol)
);
create index if not exists enterprise_validation_evidence_workspace_idx
  on enterprise_validation_evidence(workspace_id);

create table if not exists workspace_verified_domains (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  domain text not null unique,
  status text not null default 'pending',
  verification_token_hash text not null,
  verification_record_name text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_verified_domains_id_check check (id ~ '^ssodomain_[A-Za-z0-9_-]{16,}$'),
  constraint workspace_verified_domains_domain_check check (domain = lower(domain) and char_length(domain) between 3 and 253),
  constraint workspace_verified_domains_status_check check (status in ('pending', 'verified', 'disabled')),
  constraint workspace_verified_domains_hash_check check (verification_token_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_verified_domains_verified_check check (status <> 'verified' or verified_at is not null)
);
create index if not exists workspace_verified_domains_workspace_idx on workspace_verified_domains(workspace_id);
create index if not exists workspace_verified_domains_connection_idx on workspace_verified_domains(connection_id);

create table if not exists sso_group_role_mappings (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  group_id text not null,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sso_group_role_mappings_id_check check (id ~ '^ssogroup_[A-Za-z0-9_-]{16,}$'),
  constraint sso_group_role_mappings_group_check check (char_length(group_id) between 1 and 512),
  constraint sso_group_role_mappings_role_check check (role in ('admin', 'member', 'viewer')),
  unique(connection_id, group_id)
);
create index if not exists sso_group_role_mappings_workspace_idx on sso_group_role_mappings(workspace_id);

create table if not exists enterprise_scim_connections (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  status text not null default 'active',
  created_by_user_id text not null references users(id) on delete restrict,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enterprise_scim_connections_id_check check (id ~ '^scim_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_scim_connections_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint enterprise_scim_connections_prefix_check check (token_prefix ~ '^lq_scim_[A-Za-z0-9_-]{6,16}$'),
  constraint enterprise_scim_connections_status_check check (status in ('active', 'disabled'))
);
create index if not exists enterprise_scim_connections_workspace_idx on enterprise_scim_connections(workspace_id);

create table if not exists enterprise_principals (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  external_id text not null,
  issuer text not null,
  subject text,
  active boolean not null default true,
  deprovisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enterprise_principals_id_check check (id ~ '^ssoprincipal_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_principals_external_id_check check (char_length(external_id) between 1 and 512),
  constraint enterprise_principals_issuer_check check (char_length(issuer) between 8 and 2048),
  constraint enterprise_principals_subject_check check (subject is null or char_length(subject) between 1 and 1024),
  constraint enterprise_principals_deprovision_check check (active or deprovisioned_at is not null),
  unique(connection_id, external_id),
  unique(workspace_id, user_id)
);
create unique index if not exists enterprise_principals_connection_subject_idx
  on enterprise_principals(connection_id, subject) where subject is not null;
create index if not exists enterprise_principals_user_idx on enterprise_principals(user_id);

create table if not exists enterprise_audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  actor_user_id text references users(id) on delete set null,
  event_type text not null,
  connection_id text references sso_connections(id) on delete set null,
  target_user_id text references users(id) on delete set null,
  correlation_id text not null,
  metadata jsonb not null,
  occurred_at timestamptz not null,
  constraint enterprise_audit_events_id_check check (id ~ '^ssoevt_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_audit_events_type_check check (event_type in ('sso_connection_created','sso_connection_validated','sso_connection_disabled','workspace_auth_policy_updated','domain_verification_started','domain_verified','group_role_mapping_updated','scim_token_created','scim_token_disabled','scim_user_provisioned','scim_user_updated','scim_user_deprovisioned','enterprise_sso_authenticated','enterprise_sso_user_provisioned','break_glass_requested','break_glass_approved','break_glass_consumed')),
  constraint enterprise_audit_events_correlation_check check (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  constraint enterprise_audit_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);
create index if not exists enterprise_audit_events_workspace_time_idx on enterprise_audit_events(workspace_id, occurred_at);

create table if not exists enterprise_break_glass_requests (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  requested_by_user_id text not null references users(id) on delete restrict,
  approved_by_user_id text references users(id) on delete restrict,
  status text not null default 'pending_approval',
  reason text not null,
  expires_at timestamptz not null,
  approved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint enterprise_break_glass_id_check check (id ~ '^breakglass_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_break_glass_status_check check (status in ('pending_approval','approved','consumed','expired','rejected')),
  constraint enterprise_break_glass_reason_check check (char_length(reason) between 20 and 1000),
  constraint enterprise_break_glass_expiry_check check (created_at < expires_at),
  constraint enterprise_break_glass_separation_check check (approved_by_user_id is null or approved_by_user_id <> requested_by_user_id),
  constraint enterprise_break_glass_approval_check check (status = 'pending_approval' or (approved_by_user_id is not null and approved_at is not null)),
  constraint enterprise_break_glass_consumption_check check (status <> 'consumed' or consumed_at is not null)
);
create index if not exists enterprise_break_glass_workspace_idx on enterprise_break_glass_requests(workspace_id, created_at);

alter table enterprise_validation_evidence enable row level security;
alter table enterprise_validation_evidence force row level security;
alter table workspace_verified_domains enable row level security;
alter table workspace_verified_domains force row level security;
alter table sso_group_role_mappings enable row level security;
alter table sso_group_role_mappings force row level security;
alter table enterprise_scim_connections enable row level security;
alter table enterprise_scim_connections force row level security;
alter table enterprise_principals enable row level security;
alter table enterprise_principals force row level security;
alter table enterprise_audit_events enable row level security;
alter table enterprise_audit_events force row level security;
alter table enterprise_break_glass_requests enable row level security;
alter table enterprise_break_glass_requests force row level security;

create policy enterprise_validation_evidence_workspace_read on enterprise_validation_evidence
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy enterprise_validation_evidence_operator_write on enterprise_validation_evidence
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and current_user = 'lodariq_enterprise_validator'
    and current_setting('lodariq.enterprise_validation_worker', true) = 'true'
  );

create policy workspace_verified_domains_workspace_access on workspace_verified_domains
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_verified_domains_discovery on workspace_verified_domains
  for select using (
    status = 'verified'
    and domain = current_setting('lodariq.enterprise_domain', true)
  );
create policy sso_connections_domain_discovery on sso_connections for select using (
  status = 'verified'
  and exists (
    select 1 from workspace_verified_domains d
    where d.connection_id = sso_connections.id
      and d.status = 'verified'
      and d.domain = current_setting('lodariq.enterprise_domain', true)
  )
);
create policy sso_connections_enterprise_authorization on sso_connections for select using (
  id = current_setting('lodariq.enterprise_connection_id', true)
  and status = 'verified'
);
create policy enterprise_validation_evidence_domain_discovery on enterprise_validation_evidence
  for select using (
    revoked_at is null
    and exists (
      select 1 from workspace_verified_domains d
      where d.connection_id = enterprise_validation_evidence.connection_id
        and d.status = 'verified'
        and d.domain = current_setting('lodariq.enterprise_domain', true)
    )
  );
create policy enterprise_validation_evidence_authorization on enterprise_validation_evidence
  for select using (
    connection_id = current_setting('lodariq.enterprise_connection_id', true)
    and revoked_at is null
  );
create policy workspace_verified_domains_authorization on workspace_verified_domains
  for select using (
    connection_id = current_setting('lodariq.enterprise_connection_id', true)
    and status = 'verified'
  );

create policy sso_group_role_mappings_workspace_access on sso_group_role_mappings
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy sso_group_role_mappings_enterprise_authorization on sso_group_role_mappings
  for select using (
    connection_id = current_setting('lodariq.enterprise_connection_id', true)
  );
create policy sso_group_role_mappings_scim_authorization on sso_group_role_mappings
  for select using (
    exists (
      select 1 from enterprise_scim_connections sc
      where sc.connection_id = sso_group_role_mappings.connection_id
        and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
        and sc.status = 'active'
    )
  );
create policy enterprise_scim_connections_workspace_access on enterprise_scim_connections
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy enterprise_scim_connections_token_access on enterprise_scim_connections
  for all using (token_hash = current_setting('lodariq.enterprise_scim_token_hash', true))
  with check (token_hash = current_setting('lodariq.enterprise_scim_token_hash', true));
create policy enterprise_principals_workspace_access on enterprise_principals
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy enterprise_principals_scim_access on enterprise_principals for all
  using (exists (
    select 1 from enterprise_scim_connections sc
    where sc.connection_id = enterprise_principals.connection_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.connection_id = enterprise_principals.connection_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ));
create policy enterprise_principals_identity_assurance on enterprise_principals for select using (
  workspace_id = current_setting('lodariq.workspace_id', true)
  and exists (
    select 1 from auth_identities ai
    where ai.id = current_setting('lodariq.enterprise_identity_id', true)
      and ai.user_id = enterprise_principals.user_id
      and ai.issuer = enterprise_principals.issuer
      and ai.subject = enterprise_principals.subject
  )
);
create policy enterprise_principals_oidc_authorization on enterprise_principals for all
  using (connection_id = current_setting('lodariq.enterprise_connection_id', true))
  with check (connection_id = current_setting('lodariq.enterprise_connection_id', true));
create policy auth_identities_enterprise_assurance on auth_identities for select using (
  id = current_setting('lodariq.enterprise_identity_id', true)
);

create policy enterprise_audit_events_workspace_access on enterprise_audit_events
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy enterprise_audit_events_workspace_insert on enterprise_audit_events
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or (
      current_user = 'lodariq_enterprise_validator'
      and current_setting('lodariq.enterprise_validation_worker', true) = 'true'
    )
    or connection_id = current_setting('lodariq.enterprise_connection_id', true)
    or exists (
      select 1 from enterprise_scim_connections sc
      where sc.workspace_id = enterprise_audit_events.workspace_id
        and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
        and sc.status = 'active'
    )
  );
create policy enterprise_break_glass_workspace_access on enterprise_break_glass_requests
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy workspace_invitations_enterprise_oidc on workspace_invitations
  for select using (
    workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and email_normalized = current_setting('lodariq.auth_email_normalized', true)
  );
create policy workspace_invitations_enterprise_oidc_accept on workspace_invitations
  for update using (
    workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and email_normalized = current_setting('lodariq.auth_email_normalized', true)
    and accepted_at is null and revoked_at is null
  ) with check (accepted_at is not null);
create policy user_emails_enterprise_oidc_lookup on user_emails for select using (
  normalized_email = current_setting('lodariq.auth_email_normalized', true)
  and exists (
    select 1 from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
);
create policy users_enterprise_oidc_create on users for insert with check (
  id = current_setting('lodariq.auth_user_id', true)
  and exists (
    select 1 from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
);
create policy user_emails_enterprise_oidc_create on user_emails for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
  and normalized_email = current_setting('lodariq.auth_email_normalized', true)
  and exists (
    select 1 from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
);
create policy workspace_memberships_enterprise_oidc_create on workspace_memberships
  for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and role in ('admin', 'member', 'viewer')
  );
create policy workspace_memberships_enterprise_oidc_update on workspace_memberships
  for update using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and exists (
      select 1 from enterprise_principals ep
      where ep.connection_id = current_setting('lodariq.enterprise_connection_id', true)
        and ep.workspace_id = workspace_memberships.workspace_id
        and ep.user_id = workspace_memberships.user_id
        and ep.active
    )
  ) with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and role in ('admin', 'member', 'viewer')
  );
create policy auth_sessions_enterprise_oidc_create on auth_sessions for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
  and active_workspace_id in (
    select workspace_id from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
  and authentication_method = 'oidc'
  and duration_policy = 'managed'
);
create policy auth_sessions_enterprise_connection_disable on auth_sessions for update
  using (
    exists (
      select 1 from enterprise_principals ep
      where ep.user_id = auth_sessions.user_id
        and ep.workspace_id = current_setting('lodariq.workspace_id', true)
        and ep.connection_id = current_setting('lodariq.enterprise_connection_id', true)
    )
    and exists (
      select 1 from workspace_memberships wm
      where wm.workspace_id = current_setting('lodariq.workspace_id', true)
        and wm.user_id = current_setting('lodariq.auth_user_id', true)
        and wm.role = 'owner'
    )
  )
  with check (revoked_at is not null);
create policy auth_sessions_enterprise_connection_disable_select on auth_sessions for select
  using (
    exists (
      select 1 from enterprise_principals ep
      where ep.user_id = auth_sessions.user_id
        and ep.workspace_id = current_setting('lodariq.workspace_id', true)
        and ep.connection_id = current_setting('lodariq.enterprise_connection_id', true)
    )
    and exists (
      select 1 from workspace_memberships wm
      where wm.workspace_id = current_setting('lodariq.workspace_id', true)
        and wm.user_id = current_setting('lodariq.auth_user_id', true)
        and wm.role = 'owner'
    )
  );

-- SCIM is a separately authenticated machine principal. These policies only
-- open the narrow writes used by the atomic provisioning/deprovisioning path.
create policy users_scim_write on users for all
  using (exists (
    select 1 from enterprise_principals ep
    join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
    where ep.user_id = users.id and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ));
create policy user_emails_scim_write on user_emails for all
  using (exists (
    select 1 from enterprise_principals ep
    join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
    where ep.user_id = user_emails.user_id and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ));
create policy workspace_memberships_scim_write on workspace_memberships for all
  using (exists (
    select 1 from enterprise_scim_connections sc
    where sc.workspace_id = workspace_memberships.workspace_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.workspace_id = workspace_memberships.workspace_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ));
create policy auth_sessions_scim_revoke on auth_sessions for update using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.user_id = auth_sessions.user_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
)) with check (revoked_at is not null);
create policy auth_sessions_scim_revoke_select on auth_sessions for select using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.user_id = auth_sessions.user_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
));
create policy authoring_activation_grants_scim_revoke on authoring_activation_grants for update using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.workspace_id = authoring_activation_grants.workspace_id
    and ep.user_id = authoring_activation_grants.creator_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
)) with check (revoked_at is not null);
create policy authoring_sessions_scim_revoke on authoring_sessions for update using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.workspace_id = authoring_sessions.workspace_id
    and ep.user_id = authoring_sessions.created_by_user_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
)) with check (revoked_at is not null);

commit;
