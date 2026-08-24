begin;

create table if not exists deployment_schedules (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  publication_id text not null,
  artifact_id text not null,
  content_hash text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  expected_generation integer not null,
  status text not null,
  idempotency_key text not null,
  request_hash text not null,
  revision integer not null default 1,
  created_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deployment_schedules_workspace_id_idx unique(workspace_id, id),
  constraint deployment_schedules_environment_scope_fk
    foreign key(workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint deployment_schedules_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint deployment_schedules_publication_scope_fk
    foreign key(workspace_id, environment_id, document_id, publication_id)
    references publications(workspace_id, environment_id, document_id, id) on delete restrict,
  constraint deployment_schedules_generation_check check(expected_generation >= 0),
  constraint deployment_schedules_revision_check check(revision >= 1),
  constraint deployment_schedules_status_check
    check(status in ('scheduled','active','completed','cancelled','failed')),
  constraint deployment_schedules_time_check
    check(end_at is null or (end_at > start_at and end_at <= start_at + interval '366 days')),
  constraint deployment_schedules_hash_check
    check(content_hash ~ '^sha256-[0-9a-f]{64}$' and request_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint deployment_schedules_idempotency_check
    check(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$')
);
create unique index if not exists deployment_schedules_idempotency_idx
  on deployment_schedules(workspace_id, environment_id, document_id, idempotency_key);
create index if not exists deployment_schedules_due_idx
  on deployment_schedules(status, start_at);
create index if not exists deployment_schedules_document_idx
  on deployment_schedules(workspace_id, environment_id, document_id, created_at);

create table if not exists delivery_schedule_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  schedule_id text not null,
  environment_id text not null,
  document_id text not null,
  publication_id text not null,
  transition text not null,
  status text not null,
  expected_generation integer,
  available_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  lease_owner text,
  lease_version integer not null default 0,
  leased_until timestamptz,
  result_generation integer,
  error_code text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint delivery_schedule_jobs_workspace_id_idx unique(workspace_id, id),
  constraint delivery_schedule_jobs_schedule_scope_fk
    foreign key(workspace_id, schedule_id)
    references deployment_schedules(workspace_id, id) on delete cascade,
  constraint delivery_schedule_jobs_transition_check check(transition in ('start','end')),
  constraint delivery_schedule_jobs_status_check
    check(status in ('pending','leased','completed','failed','cancelled')),
  constraint delivery_schedule_jobs_attempts_check
    check(attempts between 0 and max_attempts and max_attempts between 1 and 20),
  constraint delivery_schedule_jobs_lease_check check(
    (status = 'leased' and lease_owner is not null and leased_until is not null)
    or (status <> 'leased' and lease_owner is null and leased_until is null)
  ),
  constraint delivery_schedule_jobs_generation_check
    check(expected_generation is null or expected_generation >= 0)
);
create unique index if not exists delivery_schedule_jobs_schedule_transition_idx
  on delivery_schedule_jobs(workspace_id, schedule_id, transition);
create index if not exists delivery_schedule_jobs_due_idx
  on delivery_schedule_jobs(status, available_at, created_at);
create index if not exists delivery_schedule_jobs_document_idx
  on delivery_schedule_jobs(workspace_id, environment_id, document_id);

create table if not exists delivery_transition_history (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  schedule_id text not null,
  job_id text not null,
  transition text not null,
  outcome text not null,
  from_generation integer not null,
  to_generation integer not null,
  from_publication_id text,
  to_publication_id text,
  reason_code text,
  occurred_at timestamptz not null default now(),
  constraint delivery_transition_history_schedule_scope_fk
    foreign key(workspace_id, schedule_id)
    references deployment_schedules(workspace_id, id) on delete restrict,
  constraint delivery_transition_history_job_scope_fk
    foreign key(workspace_id, job_id)
    references delivery_schedule_jobs(workspace_id, id) on delete restrict,
  constraint delivery_transition_history_transition_check check(transition in ('start','end')),
  constraint delivery_transition_history_outcome_check check(outcome in ('applied','conflict','failed')),
  constraint delivery_transition_history_generation_check
    check(from_generation >= 0 and to_generation >= 0)
);
create unique index if not exists delivery_transition_history_job_idx
  on delivery_transition_history(workspace_id, job_id);
create index if not exists delivery_transition_history_document_idx
  on delivery_transition_history(workspace_id, environment_id, document_id, occurred_at);

create table if not exists workspace_data_catalog_entries (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  source text not null,
  key text not null,
  value_type text not null,
  catalog_version integer not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_data_catalog_entries_environment_scope_fk
    foreign key(workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint workspace_data_catalog_entries_source_check
    check(source in ('identify_trait','track_event')),
  constraint workspace_data_catalog_entries_value_type_check
    check(value_type in ('string','number','boolean','date','enum','unknown')),
  constraint workspace_data_catalog_entries_version_check check(catalog_version >= 1)
);
create unique index if not exists workspace_data_catalog_entries_identity_idx
  on workspace_data_catalog_entries(workspace_id, environment_id, source, key);
create index if not exists workspace_data_catalog_entries_workspace_version_idx
  on workspace_data_catalog_entries(workspace_id, catalog_version);

alter table deployment_schedules enable row level security;
alter table deployment_schedules force row level security;
alter table delivery_schedule_jobs enable row level security;
alter table delivery_schedule_jobs force row level security;
alter table delivery_transition_history enable row level security;
alter table delivery_transition_history force row level security;
alter table workspace_data_catalog_entries enable row level security;
alter table workspace_data_catalog_entries force row level security;

create policy deployment_schedules_workspace_isolation on deployment_schedules
  using(workspace_id = current_setting('lodariq.workspace_id', true))
  with check(workspace_id = current_setting('lodariq.workspace_id', true));

create policy delivery_schedule_jobs_workspace_isolation on delivery_schedule_jobs
  using(workspace_id = current_setting('lodariq.workspace_id', true))
  with check(workspace_id = current_setting('lodariq.workspace_id', true));
create policy delivery_schedule_jobs_worker_select on delivery_schedule_jobs
  for select using(current_setting('lodariq.delivery_worker', true) = 'true');
create policy delivery_schedule_jobs_worker_update on delivery_schedule_jobs
  for update using(current_setting('lodariq.delivery_worker', true) = 'true')
  with check(current_setting('lodariq.delivery_worker', true) = 'true');

create policy delivery_transition_history_workspace_isolation on delivery_transition_history
  for select using(workspace_id = current_setting('lodariq.workspace_id', true));
create policy delivery_transition_history_workspace_insert on delivery_transition_history
  for insert with check(workspace_id = current_setting('lodariq.workspace_id', true));

create policy workspace_data_catalog_entries_workspace_isolation on workspace_data_catalog_entries
  using(workspace_id = current_setting('lodariq.workspace_id', true))
  with check(workspace_id = current_setting('lodariq.workspace_id', true));

commit;
