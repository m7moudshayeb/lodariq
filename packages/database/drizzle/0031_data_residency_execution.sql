begin;

alter table data_residency_migrations
  add column if not exists attempt_count integer not null default 0,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists lease_owner text,
  add column if not exists leased_until timestamptz,
  add column if not exists last_error_code text;

alter table data_residency_migrations
  add constraint data_residency_migrations_attempt_count_check
  check (attempt_count between 0 and 5);
alter table data_residency_migrations
  add constraint data_residency_migrations_lease_check
  check ((lease_owner is null) = (leased_until is null));

create index if not exists data_residency_migrations_worker_idx
  on data_residency_migrations(status, available_at, leased_until)
  where status in ('requested','copying','verifying','cutover-ready');

create table if not exists data_residency_migration_evidence (
  id text primary key,
  workspace_id text not null,
  migration_id text not null,
  phase text not null,
  provider_operation_id text not null,
  source_digest text not null,
  target_digest text not null,
  record_count integer not null,
  occurred_at timestamptz not null,
  constraint data_residency_migration_evidence_scope_fk
    foreign key(workspace_id, migration_id)
    references data_residency_migrations(workspace_id, id) on delete cascade,
  constraint data_residency_migration_evidence_id_check
    check (id ~ '^drproof_[A-Za-z0-9_-]{20,}$'),
  constraint data_residency_migration_evidence_phase_check
    check (phase in ('copy','verify','cutover')),
  constraint data_residency_migration_evidence_operation_check
    check (char_length(btrim(provider_operation_id)) between 1 and 256),
  constraint data_residency_migration_evidence_digest_check
    check (
      source_digest ~ '^sha256-[0-9a-f]{64}$'
      and target_digest ~ '^sha256-[0-9a-f]{64}$'
    ),
  constraint data_residency_migration_evidence_record_count_check
    check (record_count >= 0)
);
create unique index if not exists data_residency_migration_evidence_phase_idx
  on data_residency_migration_evidence(workspace_id, migration_id, phase);
create index if not exists data_residency_migration_evidence_time_idx
  on data_residency_migration_evidence(workspace_id, migration_id, occurred_at);

alter table data_residency_migrations enable row level security;
alter table data_residency_migrations force row level security;
create policy data_residency_migrations_worker_select
  on data_residency_migrations for select
  using (current_setting('lodariq.residency_worker', true) = 'true');
create policy data_residency_migrations_worker_update
  on data_residency_migrations for update
  using (current_setting('lodariq.residency_worker', true) = 'true')
  with check (current_setting('lodariq.residency_worker', true) = 'true');

alter table data_residency_migration_evidence enable row level security;
alter table data_residency_migration_evidence force row level security;
create policy data_residency_migration_evidence_workspace_select
  on data_residency_migration_evidence for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy data_residency_migration_evidence_workspace_insert
  on data_residency_migration_evidence for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
