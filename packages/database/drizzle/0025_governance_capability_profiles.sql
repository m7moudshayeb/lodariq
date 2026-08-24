begin;

alter table environments
  add column if not exists governance_capabilities jsonb
  not null
  default '["release:approve","release:promote","release:schedule","release:rollback","release:unpublish","release-policy:manage"]'::jsonb;

alter table environments
  add constraint environments_governance_capabilities_check_v1 check (
    jsonb_typeof(governance_capabilities) = 'array'
    and jsonb_array_length(governance_capabilities) between 1 and 11
    and governance_capabilities <@ '["authoring:read","authoring:write","product-style:sample","release:publish","release:verify","release:approve","release:promote","release:schedule","release:rollback","release:unpublish","release-policy:manage"]'::jsonb
    and jsonb_array_length(governance_capabilities) =
      (case when governance_capabilities ? 'authoring:read' then 1 else 0 end)
      + (case when governance_capabilities ? 'authoring:write' then 1 else 0 end)
      + (case when governance_capabilities ? 'product-style:sample' then 1 else 0 end)
      + (case when governance_capabilities ? 'release:publish' then 1 else 0 end)
      + (case when governance_capabilities ? 'release:verify' then 1 else 0 end)
      + (case when governance_capabilities ? 'release:approve' then 1 else 0 end)
      + (case when governance_capabilities ? 'release:promote' then 1 else 0 end)
      + (case when governance_capabilities ? 'release:schedule' then 1 else 0 end)
      + (case when governance_capabilities ? 'release:rollback' then 1 else 0 end)
      + (case when governance_capabilities ? 'release:unpublish' then 1 else 0 end)
      + (case when governance_capabilities ? 'release-policy:manage' then 1 else 0 end)
    and (
      kind <> 'production'
      or not (governance_capabilities ?| array['authoring:read','authoring:write','release:publish'])
    )
  );

alter table tenant_audit_events
  add column if not exists environment_id text,
  add column if not exists resource_id text;

create table if not exists governance_audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete restrict,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null,
  target_user_id text references users(id) on delete set null,
  environment_id text,
  resource_id text,
  occurred_at timestamptz not null,
  constraint governance_audit_events_id_check check (id ~ '^tenevt_[A-Za-z0-9_-]{20,}$'),
  constraint governance_audit_events_type_check check (event_type in (
    'capability_profile_created', 'capability_profile_updated',
    'capability_profile_deleted', 'capability_profile_assigned',
    'capability_profile_unassigned', 'webhook_endpoint_created',
    'webhook_endpoint_disabled', 'webhook_delivery_replayed',
    'residency_migration_requested', 'residency_migration_transitioned'
  ))
);
create index if not exists governance_audit_events_workspace_time_idx
  on governance_audit_events(workspace_id, occurred_at);

create table if not exists governance_capability_profiles (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  base_role text not null,
  capabilities jsonb not null,
  revision integer not null default 1,
  created_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint governance_capability_profiles_id_check
    check (id ~ '^gcp_[A-Za-z0-9_-]{20,}$'),
  constraint governance_capability_profiles_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint governance_capability_profiles_role_check
    check (base_role in ('owner','admin','member','viewer')),
  constraint governance_capability_profiles_revision_check check (revision >= 1),
  constraint governance_capability_profiles_capabilities_check check (
    jsonb_typeof(capabilities) = 'array'
    and jsonb_array_length(capabilities) between 0 and 14
    and capabilities <@ '["authoring:read","authoring:write","product-style:sample","release:publish","release:verify","release:approve","release:promote","release:schedule","release:rollback","release:unpublish","release-policy:manage","audit:export","webhooks:manage","residency:manage"]'::jsonb
    and jsonb_array_length(capabilities) =
      (case when capabilities ? 'authoring:read' then 1 else 0 end)
      + (case when capabilities ? 'authoring:write' then 1 else 0 end)
      + (case when capabilities ? 'product-style:sample' then 1 else 0 end)
      + (case when capabilities ? 'release:publish' then 1 else 0 end)
      + (case when capabilities ? 'release:verify' then 1 else 0 end)
      + (case when capabilities ? 'release:approve' then 1 else 0 end)
      + (case when capabilities ? 'release:promote' then 1 else 0 end)
      + (case when capabilities ? 'release:schedule' then 1 else 0 end)
      + (case when capabilities ? 'release:rollback' then 1 else 0 end)
      + (case when capabilities ? 'release:unpublish' then 1 else 0 end)
      + (case when capabilities ? 'release-policy:manage' then 1 else 0 end)
      + (case when capabilities ? 'audit:export' then 1 else 0 end)
      + (case when capabilities ? 'webhooks:manage' then 1 else 0 end)
      + (case when capabilities ? 'residency:manage' then 1 else 0 end)
    and (base_role <> 'viewer' or capabilities = '[]'::jsonb)
    and (base_role <> 'member' or capabilities <@ '["authoring:read","authoring:write","product-style:sample","release:publish","release:verify","release:schedule"]'::jsonb)
  )
);

create unique index if not exists governance_capability_profiles_workspace_id_idx
  on governance_capability_profiles(workspace_id, id);
create unique index if not exists governance_capability_profiles_workspace_name_idx
  on governance_capability_profiles(workspace_id, lower(name));
create index if not exists governance_capability_profiles_workspace_idx
  on governance_capability_profiles(workspace_id);

create table if not exists governance_capability_profile_assignments (
  workspace_id text not null,
  environment_id text not null,
  user_id text not null,
  profile_id text not null,
  assigned_by_user_id text not null references users(id) on delete restrict,
  assigned_at timestamptz not null,
  constraint governance_capability_profile_assignments_pk
    primary key(workspace_id, environment_id, user_id),
  constraint governance_profile_assignments_environment_scope_fk
    foreign key(workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint governance_profile_assignments_membership_scope_fk
    foreign key(workspace_id, user_id)
    references workspace_memberships(workspace_id, user_id) on delete cascade,
  constraint governance_profile_assignments_profile_scope_fk
    foreign key(workspace_id, profile_id)
    references governance_capability_profiles(workspace_id, id) on delete restrict
);

create index if not exists governance_profile_assignments_profile_idx
  on governance_capability_profile_assignments(workspace_id, profile_id);
create index if not exists governance_profile_assignments_user_idx
  on governance_capability_profile_assignments(workspace_id, user_id);

create table if not exists workspace_governance_capability_profile_assignments (
  workspace_id text not null,
  user_id text not null,
  profile_id text not null,
  assigned_by_user_id text not null references users(id) on delete restrict,
  assigned_at timestamptz not null,
  constraint workspace_governance_capability_profile_assignments_pk
    primary key(workspace_id, user_id),
  constraint workspace_governance_assignments_membership_scope_fk
    foreign key(workspace_id, user_id)
    references workspace_memberships(workspace_id, user_id) on delete cascade,
  constraint workspace_governance_assignments_profile_scope_fk
    foreign key(workspace_id, profile_id)
    references governance_capability_profiles(workspace_id, id) on delete restrict
);

create index if not exists workspace_governance_assignments_profile_idx
  on workspace_governance_capability_profile_assignments(workspace_id, profile_id);

alter table governance_capability_profiles enable row level security;
alter table governance_capability_profiles force row level security;
create policy governance_capability_profiles_workspace_isolation
  on governance_capability_profiles
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table governance_audit_events enable row level security;
alter table governance_audit_events force row level security;
create policy governance_audit_events_workspace_select
  on governance_audit_events for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy governance_audit_events_workspace_insert
  on governance_audit_events for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table governance_capability_profile_assignments enable row level security;
alter table governance_capability_profile_assignments force row level security;
create policy governance_capability_profile_assignments_workspace_isolation
  on governance_capability_profile_assignments
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table workspace_governance_capability_profile_assignments enable row level security;
alter table workspace_governance_capability_profile_assignments force row level security;
create policy workspace_governance_capability_profile_assignments_workspace_isolation
  on workspace_governance_capability_profile_assignments
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
