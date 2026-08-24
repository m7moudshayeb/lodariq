begin;

create table if not exists authoring_roadmap_records (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  kind text not null,
  status text not null,
  payload_json jsonb not null,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint authoring_roadmap_records_pk primary key (workspace_id, id),
  constraint authoring_roadmap_records_document_scope_fk
    foreign key (workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint authoring_roadmap_records_environment_scope_fk
    foreign key (workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint authoring_roadmap_records_kind_check
    check (kind in ('demo_link', 'demo_analytics')),
  constraint authoring_roadmap_records_status_check
    check (status in ('active', 'revoked', 'expired', 'event')),
  constraint authoring_roadmap_records_payload_check
    check (jsonb_typeof(payload_json) = 'object'),
  constraint authoring_roadmap_records_revocation_check
    check ((status = 'revoked' and revoked_at is not null)
      or (status <> 'revoked' and revoked_at is null))
);

create index if not exists authoring_roadmap_records_scope_idx
  on authoring_roadmap_records(workspace_id, environment_id, document_id, kind, created_at);

alter table authoring_roadmap_records enable row level security;
alter table authoring_roadmap_records force row level security;
create policy authoring_roadmap_records_workspace_isolation
  on authoring_roadmap_records
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy authoring_roadmap_records_public_demo_select
  on authoring_roadmap_records
  for select
  using (
    kind = 'demo_link'
    and status = 'active'
    and current_setting('lodariq.demo_public', true) = 'true'
  );

commit;
