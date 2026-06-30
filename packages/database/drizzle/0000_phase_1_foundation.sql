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
