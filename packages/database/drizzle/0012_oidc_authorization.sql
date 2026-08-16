begin;

create table if not exists oidc_authorization_attempts (
  id text primary key,
  provider_id text not null,
  action text not null,
  user_id text references users(id) on delete cascade,
  state_hash text not null,
  encrypted_verifier text not null,
  nonce_hash text not null,
  return_to text not null,
  workspace_name text,
  duration_policy text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oidc_authorization_attempts_id_check check (id ~ '^oidcattempt_[A-Za-z0-9_-]{20,}$'),
  constraint oidc_authorization_attempts_provider_check check (provider_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  constraint oidc_authorization_attempts_action_check check (action in ('sign_in', 'sign_up', 'link')),
  constraint oidc_authorization_attempts_duration_check check (duration_policy in ('standard', 'remembered')),
  constraint oidc_authorization_attempts_action_data_check check (
    (action = 'link' and user_id is not null and workspace_name is null)
    or (action = 'sign_up' and user_id is null and char_length(btrim(workspace_name)) between 1 and 120)
    or (action = 'sign_in' and user_id is null and workspace_name is null)
  ),
  constraint oidc_authorization_attempts_state_check check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint oidc_authorization_attempts_nonce_check check (nonce_hash ~ '^[0-9a-f]{64}$'),
  constraint oidc_authorization_attempts_verifier_check check (
    char_length(encrypted_verifier) between 64 and 4096
    and encrypted_verifier ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint oidc_authorization_attempts_return_check check (
    char_length(return_to) between 1 and 2048
    and return_to like '/%'
    and return_to not like '//%'
  ),
  constraint oidc_authorization_attempts_expiry_check check (created_at < expires_at)
);

create unique index if not exists oidc_authorization_attempts_state_idx
  on oidc_authorization_attempts(state_hash);
create index if not exists oidc_authorization_attempts_user_idx
  on oidc_authorization_attempts(user_id);
create index if not exists oidc_authorization_attempts_expiry_idx
  on oidc_authorization_attempts(expires_at);

alter table oidc_authorization_attempts enable row level security;
alter table oidc_authorization_attempts force row level security;

drop policy if exists oidc_authorization_attempts_bound_insert on oidc_authorization_attempts;
drop policy if exists oidc_authorization_attempts_bound_lookup on oidc_authorization_attempts;
drop policy if exists oidc_authorization_attempts_bound_consume on oidc_authorization_attempts;
create policy oidc_authorization_attempts_bound_insert on oidc_authorization_attempts
  for insert with check (
    state_hash = current_setting('lodariq.oidc_state_hash', true)
    and (
      (action = 'link' and user_id = current_setting('lodariq.auth_user_id', true))
      or (action in ('sign_in', 'sign_up') and user_id is null)
    )
  );
create policy oidc_authorization_attempts_bound_lookup on oidc_authorization_attempts
  for select using (state_hash = current_setting('lodariq.oidc_state_hash', true));
create policy oidc_authorization_attempts_bound_consume on oidc_authorization_attempts
  for update using (state_hash = current_setting('lodariq.oidc_state_hash', true))
  with check (state_hash = current_setting('lodariq.oidc_state_hash', true));

commit;
