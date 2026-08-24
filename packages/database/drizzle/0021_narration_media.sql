begin;

create table if not exists authoring_narration_assets (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null default 'audio',
  filename text not null,
  content_type text not null,
  byte_length integer not null,
  content_hash text not null,
  content_base64 text not null,
  saved_to_library boolean not null default false,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint authoring_narration_assets_workspace_id_idx unique(workspace_id, id),
  constraint authoring_narration_assets_kind_check check (kind = 'audio'),
  constraint authoring_narration_assets_size_check
    check (byte_length between 1 and 104857600),
  constraint authoring_narration_assets_hash_check
    check (content_hash ~ '^sha256-[0-9a-f]{64}$')
);
create index if not exists authoring_narration_assets_workspace_created_idx
  on authoring_narration_assets(workspace_id, created_at);

alter table authoring_narration_assets enable row level security;
alter table authoring_narration_assets force row level security;

create policy authoring_narration_assets_workspace_isolation on authoring_narration_assets
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy authoring_narration_assets_published_lookup on authoring_narration_assets
  for select
  using (id = current_setting('lodariq.media_asset_id', true) and published_at is not null);

commit;
