begin;

create unique index if not exists authoring_sessions_presence_scope_idx
  on authoring_sessions(workspace_id, document_id, id);

create table if not exists authoring_presence (
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  session_id text not null,
  creator_id text not null references users(id) on delete cascade,
  creator_name text not null,
  step_id text,
  selection_type text,
  selection_id text,
  document_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint authoring_presence_workspace_document_session_pk
    primary key(workspace_id, document_id, session_id),
  constraint authoring_presence_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint authoring_presence_session_scope_fk
    foreign key(workspace_id, document_id, session_id)
    references authoring_sessions(workspace_id, document_id, id) on delete cascade,
  constraint authoring_presence_selection_check
    check (((selection_type is null) = (selection_id is null))
      and (selection_type is null or selection_type in ('block','target'))),
  constraint authoring_presence_bounds_check
    check (char_length(creator_name) between 1 and 160
      and (step_id is null or char_length(step_id) between 1 and 128)
      and (selection_id is null or char_length(selection_id) between 1 and 128)
      and expires_at > last_seen_at)
);

create index if not exists authoring_presence_document_expiry_idx
  on authoring_presence(workspace_id, document_id, expires_at);
create index if not exists authoring_presence_expiry_idx
  on authoring_presence(expires_at);

alter table authoring_presence enable row level security;
alter table authoring_presence force row level security;

create policy authoring_presence_workspace_isolation on authoring_presence
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
