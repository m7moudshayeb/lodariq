begin;

-- Token material remains hash-only in PostgreSQL. The non-secret key id lets
-- workers select a retained key for rows queued before a rotation.
alter table email_verification_challenges
  add column if not exists key_id text not null default 'legacy';
alter table set_password_challenges
  add column if not exists key_id text not null default 'legacy';

do $$ begin
  alter table email_verification_challenges
    add constraint email_verification_challenges_key_id_check
    check (key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table set_password_challenges
    add constraint set_password_challenges_key_id_check
    check (key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table auth_outbox add constraint auth_outbox_key_id_payload_check check (
  payload ? 'keyId'
  and jsonb_typeof(payload->'keyId') = 'string'
  and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  ) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table set_password_outbox add constraint set_password_outbox_key_id_payload_check check (
  payload ? 'keyId'
  and jsonb_typeof(payload->'keyId') = 'string'
  and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  ) not valid;
exception when duplicate_object then null; end $$;

-- Phase 2 cleanup must fail closed for workspaces with pending invitations.
-- Issuance/acceptance APIs and tenant policies remain a Phase 5 capability.
create table if not exists workspace_invitations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email_normalized text not null,
  email_lookup_hash text not null,
  token_hash text not null,
  role text not null,
  invited_by_user_id text not null references users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_invitations_id_check check (id ~ '^invite_[A-Za-z0-9_-]{20,}$'),
  constraint workspace_invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_invitations_lookup_hash_check check (email_lookup_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_invitations_email_check check (
    char_length(email_normalized) between 3 and 320
    and email_normalized = lower(btrim(email_normalized))
  ),
  constraint workspace_invitations_role_check check (role in ('admin', 'member', 'viewer')),
  constraint workspace_invitations_expiry_check check (created_at < expires_at),
  constraint workspace_invitations_terminal_state_check check (
    accepted_at is null or revoked_at is null
  )
);
create index if not exists workspace_invitations_workspace_idx
  on workspace_invitations(workspace_id);
create unique index if not exists workspace_invitations_token_hash_idx
  on workspace_invitations(token_hash);
create unique index if not exists workspace_invitations_active_email_idx
  on workspace_invitations(workspace_id, email_lookup_hash)
  where accepted_at is null and revoked_at is null;
alter table workspace_invitations enable row level security;
alter table workspace_invitations force row level security;
do $$ begin create policy workspace_invitations_workspace_isolation on workspace_invitations for select using (workspace_id = current_setting('lodariq.workspace_id', true)); exception when duplicate_object then null; end $$;

-- Support lookup is exact-row and read-only. The repository returns a
-- privacy-minimized projection, never recipient or payload values.
do $$ begin
  create policy auth_outbox_delivery_lookup on auth_outbox for select using (
    id = current_setting('lodariq.auth_delivery_outbox_id', true)
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy set_password_outbox_delivery_lookup on set_password_outbox for select using (
    id = current_setting('lodariq.auth_delivery_outbox_id', true)
  );
exception when duplicate_object then null; end $$;

-- Maintenance is invoked only through the bounded repository operation. RLS is
-- still forced for the runtime role; no public HTTP route can set this scope.
do $$ begin create policy users_auth_maintenance_select on users for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy users_auth_maintenance_delete on users for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy workspaces_auth_maintenance_select on workspaces for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy workspaces_auth_maintenance_delete on workspaces for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy workspace_memberships_auth_maintenance_select on workspace_memberships for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy password_credentials_auth_maintenance_select on password_credentials for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_sessions_auth_maintenance_select on auth_sessions for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_sessions_auth_maintenance_delete on auth_sessions for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy email_verification_challenges_auth_maintenance_select on email_verification_challenges for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy email_verification_challenges_auth_maintenance_delete on email_verification_challenges for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy set_password_challenges_auth_maintenance_select on set_password_challenges for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy set_password_challenges_auth_maintenance_delete on set_password_challenges for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_outbox_auth_maintenance_select on auth_outbox for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_outbox_auth_maintenance_delete on auth_outbox for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy set_password_outbox_auth_maintenance_select on set_password_outbox for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy set_password_outbox_auth_maintenance_delete on set_password_outbox for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_rate_limits_auth_maintenance_select on auth_rate_limits for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_rate_limits_auth_maintenance_delete on auth_rate_limits for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy documents_auth_maintenance_guard on documents for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy public_sdk_installations_auth_maintenance_guard on public_sdk_installations for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy themes_auth_maintenance_guard on themes for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;
do $$ begin create policy workspace_invitations_auth_maintenance_guard on workspace_invitations for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true'); exception when duplicate_object then null; end $$;

commit;
