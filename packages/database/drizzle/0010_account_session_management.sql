-- Account and session management expand migration.
-- Shared-environment execution requires explicit operator approval.
begin;

alter table users add column if not exists deleted_at timestamptz;
alter table users add column if not exists retention_expires_at timestamptz;
alter table auth_sessions add column if not exists device_label text
  not null default 'Unknown device';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'auth_sessions_device_label_check'
  ) then
    alter table auth_sessions add constraint auth_sessions_device_label_check
      check (char_length(device_label) between 1 and 120 and device_label = btrim(device_label));
  end if;
end
$$;

create table if not exists account_security_events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null,
  target_id text,
  occurred_at timestamptz not null,
  constraint account_security_events_id_check
    check (id ~ '^acctevt_[A-Za-z0-9_-]{20,}$'),
  constraint account_security_events_type_check check (
    event_type in (
      'password_changed', 'email_change_started', 'email_change_current_verified',
      'email_change_new_verified', 'email_changed', 'session_revoked',
      'sessions_revoked_all', 'account_deletion_scheduled', 'passkey_registered',
      'passkey_authenticated', 'recovery_codes_generated',
      'recovery_codes_confirmed', 'recovery_code_used', 'recovery_codes_revoked'
    )
  ),
  constraint account_security_events_actor_check check (actor_user_id = user_id)
);
create index if not exists account_security_events_user_time_idx
  on account_security_events(user_id, occurred_at);

create table if not exists account_email_change_challenges (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  current_email_normalized text not null,
  new_email_normalized text not null,
  new_email_lookup_hash text not null,
  current_token_hash text not null unique,
  new_token_hash text not null unique,
  key_id text not null,
  current_verified_at timestamptz,
  new_verified_at timestamptz,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_email_change_id_check
    check (id ~ '^emailchange_[A-Za-z0-9_-]{20,}$'),
  constraint account_email_change_email_check check (
    char_length(current_email_normalized) between 3 and 320
    and char_length(new_email_normalized) between 3 and 320
    and current_email_normalized = lower(btrim(current_email_normalized))
    and new_email_normalized = lower(btrim(new_email_normalized))
    and current_email_normalized <> new_email_normalized
  ),
  constraint account_email_change_hash_check check (
    new_email_lookup_hash ~ '^[0-9a-f]{64}$'
    and current_token_hash ~ '^[0-9a-f]{64}$'
    and new_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint account_email_change_key_check
    check (key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  constraint account_email_change_expiry_check check (created_at < expires_at)
);
create unique index if not exists account_email_change_active_user_idx
  on account_email_change_challenges(user_id)
  where consumed_at is null and revoked_at is null;
create index if not exists account_email_change_expiry_idx
  on account_email_change_challenges(expires_at);

create table if not exists account_email_change_outbox (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  challenge_id text not null references account_email_change_challenges(id) on delete cascade,
  recipient_email text not null,
  payload jsonb not null,
  available_at timestamptz not null,
  processed_at timestamptz,
  attempts integer not null default 0,
  lease_version integer not null default 0,
  last_error text,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_email_change_outbox_id_check
    check (id ~ '^outbox_[A-Za-z0-9_-]{20,}$'),
  constraint account_email_change_outbox_type_check
    check (type = 'account_email_change'),
  constraint account_email_change_outbox_recipient_check check (
    char_length(recipient_email) between 3 and 320
    and recipient_email = lower(btrim(recipient_email))
  ),
  constraint account_email_change_outbox_attempts_check
    check (attempts between 0 and 20),
  constraint account_email_change_outbox_lease_check
    check (lease_version between 0 and 2147483647),
  constraint account_email_change_outbox_error_check
    check (last_error is null or last_error ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint account_email_change_outbox_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['purpose', 'challengeId', 'proof', 'changePath', 'keyId']
    and payload->>'purpose' = 'account_email_change'
    and payload->>'challengeId' ~ '^emailchange_[A-Za-z0-9_-]{20,}$'
    and payload->>'proof' in ('current_email', 'new_email')
    and char_length(payload->>'changePath') between 1 and 2048
    and payload->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  )
);
create unique index if not exists account_email_change_outbox_proof_idx
  on account_email_change_outbox(challenge_id, (payload->>'proof'));
create index if not exists account_email_change_outbox_due_idx
  on account_email_change_outbox(available_at, created_at)
  where processed_at is null and terminal_at is null and attempts < 20;

alter table account_security_events enable row level security;
alter table account_security_events force row level security;
alter table account_email_change_challenges enable row level security;
alter table account_email_change_challenges force row level security;
alter table account_email_change_outbox enable row level security;
alter table account_email_change_outbox force row level security;

create or replace function public.lodariq_schedule_account_deletion(
  candidate_user_id text,
  candidate_deleted_at timestamptz,
  candidate_retention_expires_at timestamptz
)
returns text
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
    or candidate_deleted_at is null
    or candidate_retention_expires_at is null
    or candidate_deleted_at > clock_timestamp() + interval '5 minutes'
    or candidate_retention_expires_at < candidate_deleted_at + interval '30 days'
    or candidate_retention_expires_at > candidate_deleted_at + interval '31 days'
  then
    return 'conflict';
  end if;

  if exists (
    select 1
    from workspace_memberships owned
    where owned.user_id = candidate_user_id
      and owned.role = 'owner'
      and not exists (
        select 1
        from workspace_memberships other_owner
        where other_owner.workspace_id = owned.workspace_id
          and other_owner.role = 'owner'
          and other_owner.user_id <> candidate_user_id
      )
  ) then
    return 'final_owner';
  end if;

  update users
  set deleted_at = candidate_deleted_at,
      retention_expires_at = candidate_retention_expires_at
  where id = candidate_user_id
    and deleted_at is null;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    return 'conflict';
  end if;

  update auth_sessions
  set revoked_at = candidate_deleted_at
  where user_id = candidate_user_id and revoked_at is null;
  update authoring_activation_grants
  set revoked_at = candidate_deleted_at
  where creator_id = candidate_user_id and revoked_at is null;
  update authoring_sessions
  set revoked_at = candidate_deleted_at
  where created_by_user_id = candidate_user_id and revoked_at is null;
  update identity_onboarding_states
  set status = 'cancelled', updated_at = candidate_deleted_at, version = version + 1
  where user_id = candidate_user_id
    and status in ('pending_identity', 'pending_destination');
  update account_email_change_challenges
  set revoked_at = candidate_deleted_at
  where user_id = candidate_user_id
    and consumed_at is null
    and revoked_at is null;
  update account_email_change_outbox
  set terminal_at = candidate_deleted_at,
      last_error = 'account_deleted'
  where user_id = candidate_user_id
    and processed_at is null
    and terminal_at is null;
  update set_password_challenges
  set used_at = candidate_deleted_at
  where user_id = candidate_user_id
    and used_at is null;
  update set_password_outbox
  set terminal_at = candidate_deleted_at,
      last_error = 'account_deleted'
  where user_id = candidate_user_id
    and processed_at is null
    and terminal_at is null;

  return 'scheduled';
end
$$;
revoke all on function public.lodariq_schedule_account_deletion(text, timestamptz, timestamptz)
  from public;
-- The reviewed runtime-role provisioning step grants this exact signature.
-- PUBLIC remains revoked because session settings are not an authorization
-- boundary against an arbitrary database login.


drop policy if exists users_account_management_update on users;
create policy users_account_management_update on users
  for update using (
    id = current_setting('lodariq.auth_user_id', true)
  ) with check (
    id = current_setting('lodariq.auth_user_id', true)
  );

drop policy if exists account_security_events_auth_self on account_security_events;
drop policy if exists account_security_events_owned_insert on account_security_events;
create policy account_security_events_auth_self on account_security_events
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_security_events_owned_insert on account_security_events
  for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and actor_user_id = current_setting('lodariq.auth_user_id', true)
  );

drop policy if exists account_email_change_challenges_auth_self on account_email_change_challenges;
drop policy if exists account_email_change_challenges_owned_insert on account_email_change_challenges;
drop policy if exists account_email_change_challenges_owned_update on account_email_change_challenges;
create policy account_email_change_challenges_auth_self on account_email_change_challenges
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_challenges_owned_insert on account_email_change_challenges
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_challenges_owned_update on account_email_change_challenges
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));

drop policy if exists account_email_change_outbox_auth_self on account_email_change_outbox;
drop policy if exists account_email_change_outbox_owned_insert on account_email_change_outbox;
drop policy if exists account_email_change_outbox_owned_update on account_email_change_outbox;
drop policy if exists account_email_change_outbox_worker_select on account_email_change_outbox;
drop policy if exists account_email_change_outbox_worker_update on account_email_change_outbox;
drop policy if exists account_email_change_outbox_delivery_lookup on account_email_change_outbox;
drop policy if exists account_email_change_outbox_maintenance_select on account_email_change_outbox;
drop policy if exists account_email_change_outbox_maintenance_delete on account_email_change_outbox;
create policy account_email_change_outbox_auth_self on account_email_change_outbox
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_outbox_owned_insert on account_email_change_outbox
  for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and exists (
      select 1 from account_email_change_challenges challenge
      where challenge.id = account_email_change_outbox.challenge_id
        and challenge.user_id = account_email_change_outbox.user_id
    )
  );
create policy account_email_change_outbox_owned_update on account_email_change_outbox
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy account_email_change_outbox_worker_select on account_email_change_outbox
  for select using (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy account_email_change_outbox_worker_update on account_email_change_outbox
  for update using (current_setting('lodariq.auth_outbox_worker', true) = 'true')
  with check (current_setting('lodariq.auth_outbox_worker', true) = 'true');
create policy account_email_change_outbox_delivery_lookup on account_email_change_outbox
  for select using (id = current_setting('lodariq.auth_delivery_outbox_id', true));
create policy account_email_change_outbox_maintenance_select on account_email_change_outbox
  for select using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');
create policy account_email_change_outbox_maintenance_delete on account_email_change_outbox
  for delete using (current_setting('lodariq.auth_maintenance_worker', true) = 'true');

commit;
