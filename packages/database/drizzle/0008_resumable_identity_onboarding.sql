begin;

alter table auth_identities add column if not exists disabled_at timestamptz;

create table if not exists identity_onboarding_states (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  intent text not null,
  status text not null,
  target_workspace_id text,
  target_workspace_name text,
  invitation_id text,
  requested_workspace_id text,
  completed_workspace_id text references workspaces(id) on delete set null,
  version integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_onboarding_id_check check (id ~ '^onboard_[A-Za-z0-9_-]{20,}$'),
  constraint identity_onboarding_intent_check check (
    intent in ('create_workspace', 'accept_invitation', 'request_access')
  ),
  constraint identity_onboarding_status_check check (
    status in ('pending_identity', 'pending_destination', 'completed', 'cancelled')
  ),
  constraint identity_onboarding_version_check check (version between 1 and 2147483647),
  constraint identity_onboarding_create_workspace_check check (
    intent <> 'create_workspace' or (
      target_workspace_id is not null
      and char_length(target_workspace_name) between 1 and 120
    )
  ),
  constraint identity_onboarding_completion_check check (
    status <> 'completed' or completed_workspace_id is not null
  ),
  constraint identity_onboarding_expiry_check check (created_at < expires_at)
);
create unique index if not exists identity_onboarding_active_user_idx
  on identity_onboarding_states(user_id)
  where status in ('pending_identity', 'pending_destination');
create index if not exists identity_onboarding_expiry_idx
  on identity_onboarding_states(expires_at);

create table if not exists auth_security_events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null,
  identity_id text not null,
  authorization_source text not null,
  occurred_at timestamptz not null,
  constraint auth_security_events_id_check check (id ~ '^authevt_[A-Za-z0-9_-]{20,}$'),
  constraint auth_security_events_type_check check (
    event_type in (
      'identity_linked', 'identity_unlinked', 'identity_unlink_rejected_final_method'
    )
  ),
  constraint auth_security_events_authorization_check check (
    authorization_source in ('authenticated_session', 'strong_recovery')
  )
);
create index if not exists auth_security_events_user_time_idx
  on auth_security_events(user_id, occurred_at);

alter table identity_onboarding_states enable row level security;
alter table identity_onboarding_states force row level security;
alter table auth_security_events enable row level security;
alter table auth_security_events force row level security;

do $$ begin create policy identity_onboarding_states_auth_self
  on identity_onboarding_states for select using (
    user_id = current_setting('lodariq.auth_user_id', true)
  ); exception when duplicate_object then null; end $$;
do $$ begin create policy identity_onboarding_states_owned_insert
  on identity_onboarding_states for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
  ); exception when duplicate_object then null; end $$;
do $$ begin create policy identity_onboarding_states_owned_update
  on identity_onboarding_states for update using (
    user_id = current_setting('lodariq.auth_user_id', true)
  ) with check (
    user_id = current_setting('lodariq.auth_user_id', true)
  ); exception when duplicate_object then null; end $$;

do $$ begin create policy auth_security_events_auth_self
  on auth_security_events for select using (
    user_id = current_setting('lodariq.auth_user_id', true)
  ); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_security_events_owned_insert
  on auth_security_events for insert with check (
    user_id = current_setting('lodariq.auth_user_id', true)
    and actor_user_id = current_setting('lodariq.auth_user_id', true)
  ); exception when duplicate_object then null; end $$;

commit;
