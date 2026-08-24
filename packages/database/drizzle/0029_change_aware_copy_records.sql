begin;

create table if not exists authoring_copy_records (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  kind text not null,
  payload_json jsonb not null,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint authoring_copy_records_pk primary key (workspace_id, id),
  constraint authoring_copy_records_document_scope_fk
    foreign key (workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint authoring_copy_records_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint authoring_copy_records_kind_check
    check (kind in ('suggestion', 'decision')),
  constraint authoring_copy_records_payload_check
    check (jsonb_typeof(payload_json) = 'object')
);

create index if not exists authoring_copy_records_scope_idx
  on authoring_copy_records(workspace_id, environment_id, document_id, kind, created_at);

alter table authoring_copy_records enable row level security;
alter table authoring_copy_records force row level security;
create policy authoring_copy_records_workspace_isolation
  on authoring_copy_records for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy authoring_copy_records_workspace_insert
  on authoring_copy_records for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
