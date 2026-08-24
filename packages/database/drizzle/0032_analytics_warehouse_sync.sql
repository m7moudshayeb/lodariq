begin;

create table if not exists analytics_warehouse_destinations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text,
  name text not null,
  provider text not null,
  credential_reference text not null,
  enabled boolean not null default true,
  revision integer not null default 1,
  operation_id text not null,
  request_hash text not null,
  checkpoint_ingested_at timestamptz,
  checkpoint_event_id text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null,
  lease_worker_id text,
  lease_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text,
  created_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_warehouse_destinations_environment_scope_fk
    foreign key(workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint analytics_warehouse_destinations_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint analytics_warehouse_destinations_id_check
    check (id ~ '^whdest_[A-Za-z0-9_-]{20,}$'),
  constraint analytics_warehouse_destinations_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint analytics_warehouse_destinations_provider_check
    check (provider ~ '^[a-z][a-z0-9-]{0,79}$'),
  constraint analytics_warehouse_destinations_credential_check
    check (
      char_length(credential_reference) between 1 and 256
      and credential_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    ),
  constraint analytics_warehouse_destinations_revision_check check (revision >= 1),
  constraint analytics_warehouse_destinations_request_hash_check
    check (request_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint analytics_warehouse_destinations_checkpoint_check
    check ((checkpoint_ingested_at is null) = (checkpoint_event_id is null)),
  constraint analytics_warehouse_destinations_attempt_check
    check (attempt_count between 0 and 8),
  constraint analytics_warehouse_destinations_lease_check
    check ((lease_worker_id is null) = (lease_expires_at is null))
);
create unique index if not exists analytics_warehouse_destinations_workspace_id_idx
  on analytics_warehouse_destinations(workspace_id, id);
create unique index if not exists analytics_warehouse_destinations_operation_idx
  on analytics_warehouse_destinations(workspace_id, operation_id);
create unique index if not exists analytics_warehouse_destinations_name_idx
  on analytics_warehouse_destinations(workspace_id, lower(name));
create index if not exists analytics_warehouse_destinations_worker_idx
  on analytics_warehouse_destinations(enabled, next_attempt_at, lease_expires_at);

create table if not exists analytics_warehouse_sync_runs (
  id text primary key,
  workspace_id text not null,
  destination_id text not null,
  status text not null,
  event_count integer not null,
  batch_hash text,
  provider_batch_id text,
  checkpoint_ingested_at timestamptz,
  checkpoint_event_id text,
  attempt_count integer not null,
  error_code text,
  occurred_at timestamptz not null,
  constraint analytics_warehouse_sync_runs_destination_scope_fk
    foreign key(workspace_id, destination_id)
    references analytics_warehouse_destinations(workspace_id, id) on delete cascade,
  constraint analytics_warehouse_sync_runs_id_check
    check (id ~ '^whrun_[A-Za-z0-9_-]{20,}$'),
  constraint analytics_warehouse_sync_runs_status_check
    check (status in ('succeeded','failed')),
  constraint analytics_warehouse_sync_runs_event_count_check
    check (event_count between 0 and 1000),
  constraint analytics_warehouse_sync_runs_batch_hash_check
    check (batch_hash is null or batch_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint analytics_warehouse_sync_runs_checkpoint_check
    check ((checkpoint_ingested_at is null) = (checkpoint_event_id is null)),
  constraint analytics_warehouse_sync_runs_attempt_check
    check (attempt_count between 1 and 8)
);
create index if not exists analytics_warehouse_sync_runs_destination_time_idx
  on analytics_warehouse_sync_runs(workspace_id, destination_id, occurred_at);

alter table analytics_warehouse_destinations enable row level security;
alter table analytics_warehouse_destinations force row level security;
create policy analytics_warehouse_destinations_workspace_isolation
  on analytics_warehouse_destinations
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy analytics_warehouse_destinations_worker_select
  on analytics_warehouse_destinations for select
  using (current_setting('lodariq.warehouse_worker', true) = 'true');
create policy analytics_warehouse_destinations_worker_update
  on analytics_warehouse_destinations for update
  using (current_setting('lodariq.warehouse_worker', true) = 'true')
  with check (current_setting('lodariq.warehouse_worker', true) = 'true');

alter table analytics_warehouse_sync_runs enable row level security;
alter table analytics_warehouse_sync_runs force row level security;
create policy analytics_warehouse_sync_runs_workspace_select
  on analytics_warehouse_sync_runs for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy analytics_warehouse_sync_runs_workspace_insert
  on analytics_warehouse_sync_runs for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
