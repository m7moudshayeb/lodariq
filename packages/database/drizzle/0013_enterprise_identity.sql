begin;

alter table sso_connections
  add column if not exists provider text not null default 'other',
  add column if not exists client_id text not null default 'migration-placeholder',
  add column if not exists provisioning_mode text not null default 'invitation_only',
  add column if not exists validated_at timestamptz;

do $$ begin
alter table sso_connections
  add constraint sso_connections_provider_check check (provider in ('okta', 'entra', 'other')),
  add constraint sso_connections_provisioning_mode_check check (provisioning_mode in ('invitation_only', 'jit')),
  add constraint sso_connections_activation_check check (status <> 'verified' or validated_at is not null),
  add constraint sso_connections_client_id_check check (char_length(client_id) between 1 and 512);
exception when duplicate_object then null; end $$;

create table if not exists enterprise_validation_evidence (
  id text primary key,
  connection_id text not null references sso_connections(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  target text not null,
  protocol text not null,
  evidence_reference text not null,
  validated_by text not null,
  validated_at timestamptz not null,
  revoked_at timestamptz,
  constraint enterprise_validation_evidence_id_check check (id ~ '^ssoevidence_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_validation_evidence_target_check check (target in ('okta', 'entra')),
  constraint enterprise_validation_evidence_protocol_check check (protocol in ('oidc', 'saml')),
  constraint enterprise_validation_evidence_reference_check check (char_length(evidence_reference) between 8 and 512),
  constraint enterprise_validation_evidence_actor_check check (char_length(validated_by) between 3 and 256),
  unique(connection_id, target, protocol)
);
create index if not exists enterprise_validation_evidence_workspace_idx
  on enterprise_validation_evidence(workspace_id);

create table if not exists workspace_verified_domains (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  domain text not null unique,
  status text not null default 'pending',
  verification_token_hash text not null,
  verification_record_name text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_verified_domains_id_check check (id ~ '^ssodomain_[A-Za-z0-9_-]{16,}$'),
  constraint workspace_verified_domains_domain_check check (domain = lower(domain) and char_length(domain) between 3 and 253),
  constraint workspace_verified_domains_status_check check (status in ('pending', 'verified', 'disabled')),
  constraint workspace_verified_domains_hash_check check (verification_token_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_verified_domains_verified_check check (status <> 'verified' or verified_at is not null)
);
create index if not exists workspace_verified_domains_workspace_idx on workspace_verified_domains(workspace_id);
create index if not exists workspace_verified_domains_connection_idx on workspace_verified_domains(connection_id);

create table if not exists sso_group_role_mappings (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  group_id text not null,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sso_group_role_mappings_id_check check (id ~ '^ssogroup_[A-Za-z0-9_-]{16,}$'),
  constraint sso_group_role_mappings_group_check check (char_length(group_id) between 1 and 512),
  constraint sso_group_role_mappings_role_check check (role in ('admin', 'member', 'viewer')),
  unique(connection_id, group_id)
);
create index if not exists sso_group_role_mappings_workspace_idx on sso_group_role_mappings(workspace_id);

create table if not exists enterprise_scim_connections (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  status text not null default 'active',
  created_by_user_id text not null references users(id) on delete restrict,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enterprise_scim_connections_id_check check (id ~ '^scim_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_scim_connections_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint enterprise_scim_connections_prefix_check check (token_prefix ~ '^lq_scim_[A-Za-z0-9_-]{6,16}$'),
  constraint enterprise_scim_connections_status_check check (status in ('active', 'disabled'))
);
create index if not exists enterprise_scim_connections_workspace_idx on enterprise_scim_connections(workspace_id);

create table if not exists enterprise_principals (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  connection_id text not null references sso_connections(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  external_id text not null,
  issuer text not null,
  subject text,
  active boolean not null default true,
  deprovisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enterprise_principals_id_check check (id ~ '^ssoprincipal_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_principals_external_id_check check (char_length(external_id) between 1 and 512),
  constraint enterprise_principals_issuer_check check (char_length(issuer) between 8 and 2048),
  constraint enterprise_principals_subject_check check (subject is null or char_length(subject) between 1 and 1024),
  constraint enterprise_principals_deprovision_check check (active or deprovisioned_at is not null),
  unique(connection_id, external_id),
  unique(workspace_id, user_id)
);
create unique index if not exists enterprise_principals_connection_subject_idx
  on enterprise_principals(connection_id, subject) where subject is not null;
create index if not exists enterprise_principals_user_idx on enterprise_principals(user_id);

create table if not exists enterprise_audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  actor_user_id text references users(id) on delete set null,
  event_type text not null,
  connection_id text references sso_connections(id) on delete set null,
  target_user_id text references users(id) on delete set null,
  correlation_id text not null,
  metadata jsonb not null,
  occurred_at timestamptz not null,
  constraint enterprise_audit_events_id_check check (id ~ '^ssoevt_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_audit_events_type_check check (event_type in ('sso_connection_created','sso_connection_validated','sso_connection_disabled','workspace_auth_policy_updated','domain_verification_started','domain_verified','group_role_mapping_updated','scim_token_created','scim_token_disabled','scim_user_provisioned','scim_user_updated','scim_user_deprovisioned','enterprise_sso_authenticated','enterprise_sso_user_provisioned','break_glass_requested','break_glass_approved','break_glass_consumed')),
  constraint enterprise_audit_events_correlation_check check (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  constraint enterprise_audit_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);
create index if not exists enterprise_audit_events_workspace_time_idx on enterprise_audit_events(workspace_id, occurred_at);

create table if not exists enterprise_break_glass_requests (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  requested_by_user_id text not null references users(id) on delete restrict,
  approved_by_user_id text references users(id) on delete restrict,
  status text not null default 'pending_approval',
  reason text not null,
  expires_at timestamptz not null,
  approved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint enterprise_break_glass_id_check check (id ~ '^breakglass_[A-Za-z0-9_-]{16,}$'),
  constraint enterprise_break_glass_status_check check (status in ('pending_approval','approved','consumed','expired','rejected')),
  constraint enterprise_break_glass_reason_check check (char_length(reason) between 20 and 1000),
  constraint enterprise_break_glass_expiry_check check (created_at < expires_at),
  constraint enterprise_break_glass_separation_check check (approved_by_user_id is null or approved_by_user_id <> requested_by_user_id),
  constraint enterprise_break_glass_approval_check check (status = 'pending_approval' or (approved_by_user_id is not null and approved_at is not null)),
  constraint enterprise_break_glass_consumption_check check (status <> 'consumed' or consumed_at is not null)
);
create index if not exists enterprise_break_glass_workspace_idx on enterprise_break_glass_requests(workspace_id, created_at);

alter table enterprise_validation_evidence enable row level security;
alter table enterprise_validation_evidence force row level security;
alter table workspace_verified_domains enable row level security;
alter table workspace_verified_domains force row level security;
alter table sso_group_role_mappings enable row level security;
alter table sso_group_role_mappings force row level security;
alter table enterprise_scim_connections enable row level security;
alter table enterprise_scim_connections force row level security;
alter table enterprise_principals enable row level security;
alter table enterprise_principals force row level security;
alter table enterprise_audit_events enable row level security;
alter table enterprise_audit_events force row level security;
alter table enterprise_break_glass_requests enable row level security;
alter table enterprise_break_glass_requests force row level security;

do $$ begin
create policy enterprise_validation_evidence_workspace_read on enterprise_validation_evidence
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_validation_evidence_operator_write on enterprise_validation_evidence
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and current_user = 'lodariq_enterprise_validator'
    and current_setting('lodariq.enterprise_validation_worker', true) = 'true'
  );
exception when duplicate_object then null; end $$;

do $$ begin
create policy workspace_verified_domains_workspace_access on workspace_verified_domains
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy workspace_verified_domains_discovery on workspace_verified_domains
  for select using (
    status = 'verified'
    and domain = current_setting('lodariq.enterprise_domain', true)
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy sso_connections_domain_discovery on sso_connections for select using (
  status = 'verified'
  and exists (
    select 1 from workspace_verified_domains d
    where d.connection_id = sso_connections.id
      and d.status = 'verified'
      and d.domain = current_setting('lodariq.enterprise_domain', true)
  )
);
exception when duplicate_object then null; end $$;
do $$ begin
create policy sso_connections_enterprise_authorization on sso_connections for select using (
  id = current_setting('lodariq.enterprise_connection_id', true)
  and status = 'verified'
);
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_validation_evidence_domain_discovery on enterprise_validation_evidence
  for select using (
    revoked_at is null
    and exists (
      select 1 from workspace_verified_domains d
      where d.connection_id = enterprise_validation_evidence.connection_id
        and d.status = 'verified'
        and d.domain = current_setting('lodariq.enterprise_domain', true)
    )
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_validation_evidence_authorization on enterprise_validation_evidence
  for select using (
    connection_id = current_setting('lodariq.enterprise_connection_id', true)
    and revoked_at is null
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy workspace_verified_domains_authorization on workspace_verified_domains
  for select using (
    connection_id = current_setting('lodariq.enterprise_connection_id', true)
    and status = 'verified'
  );
exception when duplicate_object then null; end $$;

do $$ begin
create policy sso_group_role_mappings_workspace_access on sso_group_role_mappings
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy sso_group_role_mappings_enterprise_authorization on sso_group_role_mappings
  for select using (
    connection_id = current_setting('lodariq.enterprise_connection_id', true)
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy sso_group_role_mappings_scim_authorization on sso_group_role_mappings
  for select using (
    exists (
      select 1 from enterprise_scim_connections sc
      where sc.connection_id = sso_group_role_mappings.connection_id
        and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
        and sc.status = 'active'
    )
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_scim_connections_workspace_access on enterprise_scim_connections
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_scim_connections_token_access on enterprise_scim_connections
  for all using (token_hash = current_setting('lodariq.enterprise_scim_token_hash', true))
  with check (token_hash = current_setting('lodariq.enterprise_scim_token_hash', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_principals_workspace_access on enterprise_principals
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_principals_scim_access on enterprise_principals for all
  using (exists (
    select 1 from enterprise_scim_connections sc
    where sc.connection_id = enterprise_principals.connection_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.connection_id = enterprise_principals.connection_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ));
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_principals_identity_assurance on enterprise_principals for select using (
  workspace_id = current_setting('lodariq.workspace_id', true)
  and exists (
    select 1 from auth_identities ai
    where ai.id = current_setting('lodariq.enterprise_identity_id', true)
      and ai.user_id = enterprise_principals.user_id
      and ai.issuer = enterprise_principals.issuer
      and ai.subject = enterprise_principals.subject
  )
);
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_principals_oidc_authorization on enterprise_principals for all
  using (connection_id = current_setting('lodariq.enterprise_connection_id', true))
  with check (connection_id = current_setting('lodariq.enterprise_connection_id', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy auth_identities_enterprise_assurance on auth_identities for select using (
  id = current_setting('lodariq.enterprise_identity_id', true)
);
exception when duplicate_object then null; end $$;

do $$ begin
create policy enterprise_audit_events_workspace_access on enterprise_audit_events
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_audit_events_workspace_insert on enterprise_audit_events
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or (
      current_user = 'lodariq_enterprise_validator'
      and current_setting('lodariq.enterprise_validation_worker', true) = 'true'
    )
    or connection_id = current_setting('lodariq.enterprise_connection_id', true)
    or exists (
      select 1 from enterprise_scim_connections sc
      where sc.workspace_id = enterprise_audit_events.workspace_id
        and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
        and sc.status = 'active'
    )
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy enterprise_break_glass_workspace_access on enterprise_break_glass_requests
  for all using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;

do $$ begin
create policy workspace_invitations_enterprise_oidc on workspace_invitations
  for select using (
    workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and email_normalized = current_setting('lodariq.auth_email_normalized', true)
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy workspace_invitations_enterprise_oidc_accept on workspace_invitations
  for update using (
    workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and email_normalized = current_setting('lodariq.auth_email_normalized', true)
    and accepted_at is null and revoked_at is null
  ) with check (accepted_at is not null);
exception when duplicate_object then null; end $$;
do $$ begin
create policy user_emails_enterprise_oidc_lookup on user_emails for select using (
  normalized_email = current_setting('lodariq.auth_email_normalized', true)
  and exists (
    select 1 from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
);
exception when duplicate_object then null; end $$;
do $$ begin
create policy users_enterprise_oidc_create on users for insert with check (
  id = current_setting('lodariq.auth_user_id', true)
  and exists (
    select 1 from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
);
exception when duplicate_object then null; end $$;
do $$ begin
create policy user_emails_enterprise_oidc_create on user_emails for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
  and normalized_email = current_setting('lodariq.auth_email_normalized', true)
  and exists (
    select 1 from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
);
exception when duplicate_object then null; end $$;
do $$ begin
create policy workspace_memberships_enterprise_oidc_create on workspace_memberships
  for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and role in ('admin', 'member', 'viewer')
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy workspace_memberships_enterprise_oidc_update on workspace_memberships
  for update using (
    user_id = current_setting('lodariq.auth_user_id', true)
    and workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and exists (
      select 1 from enterprise_principals ep
      where ep.connection_id = current_setting('lodariq.enterprise_connection_id', true)
        and ep.workspace_id = workspace_memberships.workspace_id
        and ep.user_id = workspace_memberships.user_id
        and ep.active
    )
  ) with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and workspace_id in (
      select workspace_id from sso_connections
      where id = current_setting('lodariq.enterprise_connection_id', true)
        and status = 'verified'
    )
    and role in ('admin', 'member', 'viewer')
  );
exception when duplicate_object then null; end $$;
do $$ begin
create policy auth_sessions_enterprise_oidc_create on auth_sessions for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
  and active_workspace_id in (
    select workspace_id from sso_connections
    where id = current_setting('lodariq.enterprise_connection_id', true)
      and status = 'verified'
  )
  and authentication_method = 'oidc'
  and duration_policy = 'managed'
);
exception when duplicate_object then null; end $$;
do $$ begin
create policy auth_sessions_enterprise_connection_disable on auth_sessions for update
  using (
    exists (
      select 1 from enterprise_principals ep
      where ep.user_id = auth_sessions.user_id
        and ep.workspace_id = current_setting('lodariq.workspace_id', true)
        and ep.connection_id = current_setting('lodariq.enterprise_connection_id', true)
    )
    and exists (
      select 1 from workspace_memberships wm
      where wm.workspace_id = current_setting('lodariq.workspace_id', true)
        and wm.user_id = current_setting('lodariq.auth_user_id', true)
        and wm.role = 'owner'
    )
  )
  with check (revoked_at is not null);
exception when duplicate_object then null; end $$;
do $$ begin
create policy auth_sessions_enterprise_connection_disable_select on auth_sessions for select
  using (
    exists (
      select 1 from enterprise_principals ep
      where ep.user_id = auth_sessions.user_id
        and ep.workspace_id = current_setting('lodariq.workspace_id', true)
        and ep.connection_id = current_setting('lodariq.enterprise_connection_id', true)
    )
    and exists (
      select 1 from workspace_memberships wm
      where wm.workspace_id = current_setting('lodariq.workspace_id', true)
        and wm.user_id = current_setting('lodariq.auth_user_id', true)
        and wm.role = 'owner'
    )
  );
exception when duplicate_object then null; end $$;

-- SCIM is a separately authenticated machine principal. These policies only
-- open the narrow writes used by the atomic provisioning/deprovisioning path.
do $$ begin
create policy users_scim_write on users for all
  using (exists (
    select 1 from enterprise_principals ep
    join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
    where ep.user_id = users.id and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ));
exception when duplicate_object then null; end $$;
do $$ begin
create policy user_emails_scim_write on user_emails for all
  using (exists (
    select 1 from enterprise_principals ep
    join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
    where ep.user_id = user_emails.user_id and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
      and sc.status = 'active'
  ));
exception when duplicate_object then null; end $$;
do $$ begin
create policy workspace_memberships_scim_write on workspace_memberships for all
  using (exists (
    select 1 from enterprise_scim_connections sc
    where sc.workspace_id = workspace_memberships.workspace_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ))
  with check (exists (
    select 1 from enterprise_scim_connections sc
    where sc.workspace_id = workspace_memberships.workspace_id
      and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
  ));
exception when duplicate_object then null; end $$;
do $$ begin
create policy auth_sessions_scim_revoke on auth_sessions for update using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.user_id = auth_sessions.user_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
)) with check (revoked_at is not null);
exception when duplicate_object then null; end $$;
do $$ begin
create policy auth_sessions_scim_revoke_select on auth_sessions for select using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.user_id = auth_sessions.user_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
));
exception when duplicate_object then null; end $$;
do $$ begin
create policy authoring_activation_grants_scim_revoke on authoring_activation_grants for update using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.workspace_id = authoring_activation_grants.workspace_id
    and ep.user_id = authoring_activation_grants.creator_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
)) with check (revoked_at is not null);
exception when duplicate_object then null; end $$;
do $$ begin
create policy authoring_sessions_scim_revoke on authoring_sessions for update using (exists (
  select 1 from enterprise_principals ep
  join enterprise_scim_connections sc on sc.connection_id = ep.connection_id
  where ep.workspace_id = authoring_sessions.workspace_id
    and ep.user_id = authoring_sessions.created_by_user_id
    and sc.token_hash = current_setting('lodariq.enterprise_scim_token_hash', true)
)) with check (revoked_at is not null);
exception when duplicate_object then null; end $$;

commit;
