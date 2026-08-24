begin;

create table if not exists data_residency_migrations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  source_region text not null,
  target_region text not null,
  status text not null,
  expected_placement_generation integer not null,
  idempotency_key text not null,
  requested_by_user_id text not null references users(id) on delete restrict,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_residency_migrations_id_check check (id ~ '^drmig_[A-Za-z0-9_-]{20,}$'),
  constraint data_residency_migrations_region_check check (
    source_region in ('us','eu','apac')
    and target_region in ('us','eu','apac')
    and source_region <> target_region
  ),
  constraint data_residency_migrations_status_check check (
    status in ('requested','copying','verifying','cutover-ready','completed','failed','cancelled')
  ),
  constraint data_residency_migrations_generation_check
    check (expected_placement_generation >= 0),
  constraint data_residency_migrations_idempotency_check check (
    char_length(idempotency_key) between 8 and 200
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
  )
);
create unique index if not exists data_residency_migrations_workspace_id_idx
  on data_residency_migrations(workspace_id, id);
create unique index if not exists data_residency_migrations_idempotency_idx
  on data_residency_migrations(workspace_id, idempotency_key);
create index if not exists data_residency_migrations_workspace_time_idx
  on data_residency_migrations(workspace_id, created_at);

create table if not exists workspace_data_placements (
  workspace_id text primary key references workspaces(id) on delete cascade,
  region text not null default 'us',
  generation integer not null default 0,
  active_migration_id text,
  updated_at timestamptz not null default now(),
  constraint workspace_data_placements_active_migration_scope_fk
    foreign key(workspace_id, active_migration_id)
    references data_residency_migrations(workspace_id, id) on delete restrict,
  constraint workspace_data_placements_region_check check (region in ('us','eu','apac')),
  constraint workspace_data_placements_generation_check check (generation >= 0)
);

create table if not exists data_residency_migration_history (
  id text primary key,
  workspace_id text not null,
  migration_id text not null,
  previous_status text,
  next_status text not null,
  actor_id text not null,
  failure_code text,
  occurred_at timestamptz not null,
  constraint data_residency_migration_history_scope_fk
    foreign key(workspace_id, migration_id)
    references data_residency_migrations(workspace_id, id) on delete cascade,
  constraint data_residency_migration_history_id_check
    check (id ~ '^drhist_[A-Za-z0-9_-]{20,}$'),
  constraint data_residency_migration_history_status_check check (
    (previous_status is null or previous_status in (
      'requested','copying','verifying','cutover-ready','completed','failed','cancelled'
    ))
    and next_status in (
      'requested','copying','verifying','cutover-ready','completed','failed','cancelled'
    )
  )
);
create index if not exists data_residency_migration_history_migration_idx
  on data_residency_migration_history(workspace_id, migration_id, occurred_at);

alter table data_residency_migrations enable row level security;
alter table data_residency_migrations force row level security;
create policy data_residency_migrations_workspace_isolation
  on data_residency_migrations
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table workspace_data_placements enable row level security;
alter table workspace_data_placements force row level security;
create policy workspace_data_placements_workspace_isolation
  on workspace_data_placements
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table data_residency_migration_history enable row level security;
alter table data_residency_migration_history force row level security;
create policy data_residency_migration_history_workspace_select
  on data_residency_migration_history
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy data_residency_migration_history_workspace_insert
  on data_residency_migration_history
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
