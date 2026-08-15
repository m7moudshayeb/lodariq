begin;

create table if not exists authoring_style_recipes (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  resource_json jsonb not null,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authoring_style_recipes_resource_check check (
    jsonb_typeof(resource_json) = 'object' and resource_json->>'id' = id
  )
);

create unique index if not exists authoring_style_recipes_workspace_id_idx
  on authoring_style_recipes(workspace_id, id);

create table if not exists authoring_draft_checkpoints (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  resource_json jsonb not null,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint authoring_draft_checkpoints_workspace_id_idx unique(workspace_id, id),
  constraint authoring_draft_checkpoints_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint authoring_draft_checkpoints_resource_check check (
    jsonb_typeof(resource_json) = 'object' and resource_json->>'id' = id
  )
);

create index if not exists authoring_draft_checkpoints_document_created_idx
  on authoring_draft_checkpoints(workspace_id, document_id, created_at);

create table if not exists authoring_media_assets (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null,
  filename text not null,
  content_type text not null,
  byte_length integer not null,
  content_hash text not null,
  content_base64 text not null,
  saved_to_library boolean not null default false,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint authoring_media_assets_workspace_id_idx unique(workspace_id, id),
  constraint authoring_media_assets_kind_check check (kind in ('image', 'video', 'captions')),
  constraint authoring_media_assets_size_check check (byte_length between 1 and 5242880),
  constraint authoring_media_assets_hash_check check (content_hash ~ '^sha256-[0-9a-f]{64}$')
);

create index if not exists authoring_media_assets_workspace_created_idx
  on authoring_media_assets(workspace_id, created_at);

alter table authoring_style_recipes enable row level security;
alter table authoring_style_recipes force row level security;
alter table authoring_draft_checkpoints enable row level security;
alter table authoring_draft_checkpoints force row level security;
alter table authoring_media_assets enable row level security;
alter table authoring_media_assets force row level security;

create policy authoring_style_recipes_workspace_isolation on authoring_style_recipes
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy authoring_draft_checkpoints_workspace_isolation on authoring_draft_checkpoints
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy authoring_media_assets_workspace_isolation on authoring_media_assets
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy authoring_media_assets_published_lookup on authoring_media_assets
  for select using (
    published_at is not null and
    id = current_setting('lodariq.media_asset_id', true)
  );

commit;
