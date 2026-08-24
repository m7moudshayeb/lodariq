begin;

create table if not exists analytics_export_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  operation_id text not null,
  request_hash text not null,
  kind text not null,
  status text not null default 'queued',
  definition_version integer not null default 1,
  publication_id text,
  content_hash text,
  pointer_generation integer,
  retention_cutoff timestamptz not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null,
  lease_worker_id text,
  lease_expires_at timestamptz,
  filename text,
  result_content_type text,
  result_byte_length integer,
  result_content_hash text,
  result_content_base64 text,
  error_code text,
  requested_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  result_expires_at timestamptz,
  updated_at timestamptz not null,
  constraint analytics_export_jobs_workspace_operation_idx unique(workspace_id, operation_id),
  constraint analytics_export_jobs_workspace_id_idx unique(workspace_id, id),
  constraint analytics_export_jobs_environment_scope_fk
    foreign key(workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint analytics_export_jobs_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint analytics_export_jobs_publication_scope_fk
    foreign key(workspace_id, environment_id, document_id, publication_id, content_hash)
    references publications(workspace_id, environment_id, document_id, id, content_hash)
    on delete restrict,
  constraint analytics_export_jobs_id_check check (id ~ '^anx_[A-Za-z0-9_-]{20,}$'),
  constraint analytics_export_jobs_operation_check
    check (operation_id ~ '^anxop_[A-Za-z0-9_-]{20,}$'),
  constraint analytics_export_jobs_request_hash_check
    check (request_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint analytics_export_jobs_kind_check
    check (kind in ('summary-csv','raw-events-jsonl')),
  constraint analytics_export_jobs_status_check
    check (status in ('queued','processing','completed','failed','expired')),
  constraint analytics_export_jobs_version_check check (definition_version = 1),
  constraint analytics_export_jobs_release_check check (
    (publication_id is null and content_hash is null and pointer_generation is null)
    or (publication_id is not null and content_hash ~ '^sha256-[0-9a-f]{64}$'
      and pointer_generation >= 1)
  ),
  constraint analytics_export_jobs_attempt_check
    check (attempt_count between 0 and 3 and max_attempts between 1 and 3),
  constraint analytics_export_jobs_lease_check
    check ((lease_worker_id is null) = (lease_expires_at is null)),
  constraint analytics_export_jobs_result_check check (
    (result_content_type is null and filename is null and result_byte_length is null
      and result_content_hash is null and result_content_base64 is null)
    or (result_content_type is not null and char_length(filename) between 1 and 240
      and result_byte_length between 0 and 16777216
      and result_content_hash ~ '^sha256-[0-9a-f]{64}$'
      and result_content_base64 is not null)
  ),
  constraint analytics_export_jobs_error_check check (
    error_code is null or error_code in (
      'source_unavailable','result_too_large','generation_failed'
    )
  )
);
create index if not exists analytics_export_jobs_scope_created_idx
  on analytics_export_jobs(workspace_id, document_id, created_at);
create index if not exists analytics_export_jobs_claim_idx
  on analytics_export_jobs(status, next_attempt_at, lease_expires_at);

create table if not exists analytics_export_audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  job_id text not null,
  event_type text not null,
  actor_user_id text not null references users(id) on delete restrict,
  error_code text,
  occurred_at timestamptz not null,
  constraint analytics_export_audit_events_workspace_id_idx unique(workspace_id, id),
  constraint analytics_export_audit_events_job_scope_fk
    foreign key(workspace_id, job_id)
    references analytics_export_jobs(workspace_id, id) on delete cascade,
  constraint analytics_export_audit_events_type_check
    check (event_type in ('requested','completed','failed','downloaded','expired')),
  constraint analytics_export_audit_events_error_check check (
    error_code is null or error_code in (
      'source_unavailable','result_too_large','generation_failed'
    )
  )
);
create index if not exists analytics_export_audit_events_job_time_idx
  on analytics_export_audit_events(workspace_id, job_id, occurred_at);

alter table analytics_export_jobs enable row level security;
alter table analytics_export_jobs force row level security;
create policy analytics_export_jobs_workspace_isolation on analytics_export_jobs
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy analytics_export_jobs_worker_select on analytics_export_jobs
  for select using (current_setting('lodariq.analytics_export_worker', true) = 'true');
create policy analytics_export_jobs_worker_update on analytics_export_jobs
  for update using (current_setting('lodariq.analytics_export_worker', true) = 'true')
  with check (current_setting('lodariq.analytics_export_worker', true) = 'true');

alter table analytics_export_audit_events enable row level security;
alter table analytics_export_audit_events force row level security;
create policy analytics_export_audit_events_workspace_isolation on analytics_export_audit_events
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy analytics_export_audit_events_worker_insert on analytics_export_audit_events
  for insert with check (current_setting('lodariq.analytics_export_worker', true) = 'true');

commit;
