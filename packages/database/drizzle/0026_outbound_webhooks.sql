begin;

create table if not exists webhook_endpoints (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  url text not null,
  event_types jsonb not null,
  secret_version integer not null default 1,
  enabled boolean not null default true,
  created_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_endpoints_id_check check (id ~ '^whep_[A-Za-z0-9_-]{20,}$'),
  constraint webhook_endpoints_url_check
    check (char_length(url) between 9 and 2048 and url like 'https://%'),
  constraint webhook_endpoints_secret_version_check check (secret_version >= 1),
  constraint webhook_endpoints_event_types_check check (
    jsonb_typeof(event_types) = 'array'
    and jsonb_array_length(event_types) between 1 and 6
    and event_types <@ '["release.activated","release.rolled_back","release.unpublished","brand.drift_detected","governance.capability_profile_changed","residency.migration_changed"]'::jsonb
    and jsonb_array_length(event_types) =
      (case when event_types ? 'release.activated' then 1 else 0 end)
      + (case when event_types ? 'release.rolled_back' then 1 else 0 end)
      + (case when event_types ? 'release.unpublished' then 1 else 0 end)
      + (case when event_types ? 'brand.drift_detected' then 1 else 0 end)
      + (case when event_types ? 'governance.capability_profile_changed' then 1 else 0 end)
      + (case when event_types ? 'residency.migration_changed' then 1 else 0 end)
  )
);
create unique index if not exists webhook_endpoints_workspace_id_idx
  on webhook_endpoints(workspace_id, id);
create index if not exists webhook_endpoints_workspace_idx
  on webhook_endpoints(workspace_id);

create table if not exists webhook_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  schema_version text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint webhook_events_id_check check (id ~ '^whevt_[A-Za-z0-9_-]{20,}$'),
  constraint webhook_events_schema_version_check check (schema_version = '1'),
  constraint webhook_events_type_check check (event_type in (
    'release.activated','release.rolled_back','release.unpublished',
    'brand.drift_detected','governance.capability_profile_changed',
    'residency.migration_changed'
  )),
  constraint webhook_events_payload_check check (jsonb_typeof(payload) = 'object')
);
create unique index if not exists webhook_events_workspace_id_idx
  on webhook_events(workspace_id, id);
create index if not exists webhook_events_workspace_time_idx
  on webhook_events(workspace_id, occurred_at);

create table if not exists webhook_deliveries (
  id text primary key,
  workspace_id text not null,
  endpoint_id text not null,
  event_id text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null,
  lease_owner text,
  leased_until timestamptz,
  last_response_status integer,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_deliveries_endpoint_scope_fk
    foreign key(workspace_id, endpoint_id)
    references webhook_endpoints(workspace_id, id) on delete cascade,
  constraint webhook_deliveries_event_scope_fk
    foreign key(workspace_id, event_id)
    references webhook_events(workspace_id, id) on delete cascade,
  constraint webhook_deliveries_id_check check (id ~ '^whdel_[A-Za-z0-9_-]{20,}$'),
  constraint webhook_deliveries_status_check
    check (status in ('pending','delivering','succeeded','dead')),
  constraint webhook_deliveries_attempts_check check (attempts between 0 and 8),
  constraint webhook_deliveries_lease_check check (
    (status = 'delivering') = (lease_owner is not null and leased_until is not null)
  )
);
create unique index if not exists webhook_deliveries_workspace_id_idx
  on webhook_deliveries(workspace_id, id);
create unique index if not exists webhook_deliveries_event_endpoint_idx
  on webhook_deliveries(workspace_id, event_id, endpoint_id);
create index if not exists webhook_deliveries_available_idx
  on webhook_deliveries(status, available_at);
create index if not exists webhook_deliveries_workspace_idx
  on webhook_deliveries(workspace_id, created_at);

alter table webhook_endpoints enable row level security;
alter table webhook_endpoints force row level security;
create policy webhook_endpoints_workspace_select on webhook_endpoints
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or current_setting('lodariq.webhook_worker', true) = 'true'
  );
create policy webhook_endpoints_workspace_mutation on webhook_endpoints
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table webhook_events enable row level security;
alter table webhook_events force row level security;
create policy webhook_events_workspace_select on webhook_events
  for select
  using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or current_setting('lodariq.webhook_worker', true) = 'true'
  );
create policy webhook_events_workspace_insert on webhook_events
  for insert
  with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
  );

alter table webhook_deliveries enable row level security;
alter table webhook_deliveries force row level security;
create policy webhook_deliveries_workspace_isolation on webhook_deliveries
  using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or current_setting('lodariq.webhook_worker', true) = 'true'
  )
  with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or current_setting('lodariq.webhook_worker', true) = 'true'
  );

commit;
