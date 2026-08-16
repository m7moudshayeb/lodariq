begin;

alter table workspaces add column if not exists deleted_at timestamptz;
alter table workspaces add column if not exists retention_expires_at timestamptz;

create table if not exists tenant_audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete restrict,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null,
  target_user_id text references users(id) on delete set null,
  invitation_id text,
  previous_role text,
  next_role text,
  occurred_at timestamptz not null,
  constraint tenant_audit_events_id_check check (id ~ '^tenevt_[A-Za-z0-9_-]{20,}$'),
  constraint tenant_audit_events_type_check check (
    event_type in (
      'invitation_created', 'invitation_revoked', 'invitation_accepted',
      'membership_role_changed', 'membership_removed', 'ownership_transferred',
      'workspace_deletion_scheduled', 'workspace_deletion_cancelled'
    )
  ),
  constraint tenant_audit_events_previous_role_check check (
    previous_role is null or previous_role in ('owner', 'admin', 'member', 'viewer')
  ),
  constraint tenant_audit_events_next_role_check check (
    next_role is null or next_role in ('owner', 'admin', 'member', 'viewer')
  )
);
create index if not exists tenant_audit_events_workspace_time_idx
  on tenant_audit_events(workspace_id, occurred_at);
alter table tenant_audit_events enable row level security;
alter table tenant_audit_events force row level security;

create table if not exists workspace_invitation_outbox (
  id text primary key,
  type text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  invitation_id text not null unique references workspace_invitations(id) on delete cascade,
  recipient_email text not null,
  payload jsonb not null,
  available_at timestamptz not null,
  processed_at timestamptz,
  attempts integer not null default 0,
  lease_version integer not null default 0,
  last_error text,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_invitation_outbox_id_check check (id ~ '^outbox_[A-Za-z0-9_-]{20,}$'),
  constraint workspace_invitation_outbox_type_check check (type = 'workspace_invitation'),
  constraint workspace_invitation_outbox_recipient_check check (
    char_length(recipient_email) between 3 and 320 and recipient_email = lower(btrim(recipient_email))
  ),
  constraint workspace_invitation_outbox_attempts_check check (attempts between 0 and 20),
  constraint workspace_invitation_outbox_lease_version_check check (lease_version between 0 and 2147483647),
  constraint workspace_invitation_outbox_last_error_check check (
    last_error is null or last_error ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint workspace_invitation_outbox_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['purpose', 'invitationId', 'acceptancePath', 'keyId']
    and jsonb_typeof(payload->'purpose') = 'string'
    and jsonb_typeof(payload->'invitationId') = 'string'
    and jsonb_typeof(payload->'acceptancePath') = 'string'
    and jsonb_typeof(payload->'keyId') = 'string'
    and payload->>'purpose' = 'workspace_invitation'
    and payload->>'invitationId' ~ '^invite_[A-Za-z0-9_-]{20,}$'
    and char_length(payload->>'acceptancePath') between 1 and 2048
    and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  )
);
create index if not exists workspace_invitation_outbox_due_idx
  on workspace_invitation_outbox(available_at, created_at)
  where processed_at is null and terminal_at is null and attempts < 20;
create index if not exists workspace_invitation_outbox_workspace_idx
  on workspace_invitation_outbox(workspace_id);
alter table workspace_invitation_outbox enable row level security;
alter table workspace_invitation_outbox force row level security;

create or replace function public.lodariq_current_workspace_role(candidate_workspace_id text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  return (
    select membership.role
    from workspace_memberships membership
    where candidate_workspace_id = current_setting('lodariq.workspace_id', true)
      and membership.workspace_id = candidate_workspace_id
      and membership.user_id = current_setting('lodariq.auth_user_id', true)
    limit 1
  );
end
$$;
create or replace function public.lodariq_workspace_is_empty(candidate_workspace_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  return candidate_workspace_id = current_setting('lodariq.workspace_id', true)
    and not exists (
      select 1 from workspace_memberships membership
      where membership.workspace_id = candidate_workspace_id
    );
end
$$;
create or replace function public.lodariq_user_is_workspace_member(
  candidate_user_id text,
  candidate_workspace_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  return exists (
    select 1
    from workspace_memberships membership
    where membership.user_id = candidate_user_id
      and membership.workspace_id = candidate_workspace_id
  );
end
$$;
create or replace function public.lodariq_accept_workspace_invitation(
  candidate_invitation_id text,
  candidate_token_hash text,
  candidate_user_id text,
  candidate_accepted_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  affected_rows integer;
begin
  if candidate_user_id is distinct from current_setting('lodariq.auth_user_id', true)
    or candidate_token_hash is distinct from current_setting(
      'lodariq.workspace_invitation_token_hash', true
    )
    or candidate_accepted_at is null
    or candidate_accepted_at > clock_timestamp() + interval '5 minutes'
  then
    return false;
  end if;

  update workspace_invitations invitation
  set accepted_at = candidate_accepted_at
  where invitation.id = candidate_invitation_id
    and invitation.token_hash = candidate_token_hash
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > candidate_accepted_at
    and invitation.expires_at > clock_timestamp()
    and exists (
      select 1
      from user_emails email
      where email.user_id = candidate_user_id
        and email.is_primary
        and email.verified_at is not null
        and email.normalized_email = invitation.email_normalized
    );
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end
$$;
revoke all on function public.lodariq_current_workspace_role(text) from public;
revoke all on function public.lodariq_workspace_is_empty(text) from public;
revoke all on function public.lodariq_user_is_workspace_member(text, text) from public;
revoke all on function public.lodariq_accept_workspace_invitation(text, text, text, timestamptz)
  from public;
-- Execution is granted only to the configured runtime role by the reviewed
-- role-provisioning step. PUBLIC remains revoked so arbitrary database roles
-- cannot manufacture session settings and invoke SECURITY DEFINER helpers.

drop policy if exists workspace_memberships_workspace_isolation on workspace_memberships;
drop policy if exists workspace_memberships_owned_creation on workspace_memberships;
drop policy if exists workspace_memberships_invitation_accept on workspace_memberships;
drop policy if exists workspace_memberships_admin_update on workspace_memberships;
drop policy if exists workspace_memberships_admin_delete on workspace_memberships;
create policy workspace_memberships_workspace_isolation on workspace_memberships
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) is not null
  );
create policy workspace_memberships_owned_creation on workspace_memberships
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and user_id = current_setting('lodariq.auth_user_id', true)
    and role = 'owner'
    and public.lodariq_workspace_is_empty(workspace_id)
  );
create policy workspace_memberships_invitation_accept on workspace_memberships
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and user_id = current_setting('lodariq.auth_user_id', true)
    and exists (
      select 1 from workspace_invitations invitation
      where invitation.workspace_id = workspace_memberships.workspace_id
        and invitation.role = workspace_memberships.role
        and invitation.token_hash = current_setting('lodariq.workspace_invitation_token_hash', true)
        and invitation.accepted_at is null
        and invitation.revoked_at is null
        and invitation.expires_at > now()
    )
  );
create policy workspace_memberships_admin_update on workspace_memberships
  for update using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  ) with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_memberships_admin_delete on workspace_memberships
  for delete using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );

drop policy if exists workspace_invitations_workspace_isolation on workspace_invitations;
drop policy if exists workspace_invitations_token_accept_lookup on workspace_invitations;
drop policy if exists workspace_invitations_admin_insert on workspace_invitations;
drop policy if exists workspace_invitations_admin_update on workspace_invitations;
drop policy if exists workspace_invitations_token_accept_update on workspace_invitations;
create policy workspace_invitations_workspace_isolation on workspace_invitations
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );
create policy workspace_invitations_token_accept_lookup on workspace_invitations
  for select using (
    token_hash = current_setting('lodariq.workspace_invitation_token_hash', true)
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
    and exists (
      select 1 from user_emails email
      where email.user_id = current_setting('lodariq.auth_user_id', true)
        and email.is_primary
        and email.verified_at is not null
        and email.normalized_email = workspace_invitations.email_normalized
    )
  );
create policy workspace_invitations_admin_insert on workspace_invitations
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and invited_by_user_id = current_setting('lodariq.auth_user_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );
create policy workspace_invitations_admin_update on workspace_invitations
  for update using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  ) with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_invitations_token_accept_update on workspace_invitations
  for update using (false) with check (false);

drop policy if exists workspace_invitation_outbox_workspace_isolation on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_workspace_insert on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_workspace_update on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_worker_select on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_worker_update on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_delivery_lookup on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_auth_maintenance_select on workspace_invitation_outbox;
drop policy if exists workspace_invitation_outbox_auth_maintenance_delete on workspace_invitation_outbox;

create policy workspace_invitation_outbox_workspace_isolation on workspace_invitation_outbox
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  );
create policy workspace_invitation_outbox_workspace_insert on workspace_invitation_outbox
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
    and exists (
      select 1 from workspace_invitations invitation
      where invitation.id = workspace_invitation_outbox.invitation_id
        and invitation.workspace_id = workspace_invitation_outbox.workspace_id
        and invitation.email_normalized = workspace_invitation_outbox.recipient_email
        and invitation.invited_by_user_id = current_setting('lodariq.auth_user_id', true)
    )
  );
create policy workspace_invitation_outbox_workspace_update on workspace_invitation_outbox
  for update using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) in ('owner', 'admin')
  ) with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_invitation_outbox_worker_select on workspace_invitation_outbox
  for select using (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy workspace_invitation_outbox_worker_update on workspace_invitation_outbox
  for update using (current_setting('lodariq.auth_outbox_worker', true) = 'true')
  with check (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy workspace_invitation_outbox_delivery_lookup on workspace_invitation_outbox
  for select using (id = current_setting('lodariq.auth_delivery_outbox_id', true));
create policy workspace_invitation_outbox_auth_maintenance_select on workspace_invitation_outbox
  for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy workspace_invitation_outbox_auth_maintenance_delete on workspace_invitation_outbox
  for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');

drop policy if exists user_emails_workspace_reference on user_emails;
create policy user_emails_workspace_reference on user_emails
  for select using (
    is_primary
    and public.lodariq_user_is_workspace_member(
      user_emails.user_id,
      current_setting('lodariq.workspace_id', true)
    )
  );
drop policy if exists users_workspace_reference on users;
create policy users_workspace_reference on users
  for select using (
    public.lodariq_user_is_workspace_member(
      users.id,
      current_setting('lodariq.workspace_id', true)
    )
  );
drop policy if exists workspaces_user_discovery on workspaces;
create policy workspaces_user_discovery on workspaces
  for select using (
    public.lodariq_user_is_workspace_member(
      current_setting('lodariq.auth_user_id', true),
      workspaces.id
    )
  );

drop policy if exists tenant_audit_events_workspace_isolation on tenant_audit_events;
drop policy if exists tenant_audit_events_workspace_insert on tenant_audit_events;
create policy tenant_audit_events_workspace_isolation on tenant_audit_events
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and public.lodariq_current_workspace_role(workspace_id) is not null
  );
create policy tenant_audit_events_workspace_insert on tenant_audit_events
  for insert with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    and actor_user_id = current_setting('lodariq.auth_user_id', true)
    and public.lodariq_current_workspace_role(workspace_id) is not null
  );

commit;
