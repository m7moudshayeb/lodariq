begin;

create table if not exists webauthn_challenges (
  id text primary key,
  purpose text not null,
  user_id text references users(id) on delete cascade,
  challenge_hash text not null,
  rp_id text not null,
  origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webauthn_challenges_id_check check (id ~ '^authchal_[A-Za-z0-9_-]{20,}$'),
  constraint webauthn_challenges_purpose_check check (purpose in ('passkey_registration', 'passkey_authentication', 'passkey_step_up')),
  constraint webauthn_challenges_hash_check check (challenge_hash ~ '^[0-9a-f]{64}$'),
  constraint webauthn_challenges_rp_check check (char_length(rp_id) between 1 and 253),
  constraint webauthn_challenges_origin_check check (char_length(origin) between 8 and 2048),
  constraint webauthn_challenges_expiry_check check (created_at < expires_at)
);
create unique index if not exists webauthn_challenges_hash_idx on webauthn_challenges(challenge_hash);
create index if not exists webauthn_challenges_user_idx on webauthn_challenges(user_id);
create index if not exists webauthn_challenges_expiry_idx on webauthn_challenges(expires_at);

create table if not exists passkey_credentials (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  identity_id text not null references auth_identities(id) on delete cascade,
  credential_id text not null,
  public_key text not null,
  counter bigint not null default 0,
  transports jsonb not null default '[]'::jsonb,
  device_type text not null,
  backed_up boolean not null,
  aaguid text not null,
  name text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint passkey_credentials_id_check check (id ~ '^passkey_[A-Za-z0-9_-]{20,}$'),
  constraint passkey_credentials_credential_check check (
    credential_id ~ '^[A-Za-z0-9_-]{16,}$' and char_length(credential_id) <= 2048
  ),
  constraint passkey_credentials_public_key_check check (
    public_key ~ '^[A-Za-z0-9_-]{16,}$' and char_length(public_key) <= 8192
  ),
  constraint passkey_credentials_counter_check check (counter >= 0),
  constraint passkey_credentials_device_check check (device_type in ('singleDevice', 'multiDevice')),
  constraint passkey_credentials_name_check check (char_length(name) between 1 and 120)
);
create unique index if not exists passkey_credentials_credential_idx on passkey_credentials(credential_id);
create unique index if not exists passkey_credentials_identity_idx on passkey_credentials(identity_id);
create index if not exists passkey_credentials_user_idx on passkey_credentials(user_id);

create table if not exists recovery_code_sets (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint recovery_code_sets_id_check check (id ~ '^recoveryset_[A-Za-z0-9_-]{20,}$')
);
create unique index if not exists recovery_code_sets_active_user_idx on recovery_code_sets(user_id)
  where revoked_at is null;

create table if not exists recovery_codes (
  id text primary key,
  set_id text not null references recovery_code_sets(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint recovery_codes_id_check check (id ~ '^recoverycode_[A-Za-z0-9_-]{20,}$'),
  constraint recovery_codes_hash_check check (code_hash ~ '^[0-9a-f]{64}$')
);
create unique index if not exists recovery_codes_hash_idx on recovery_codes(code_hash);
create index if not exists recovery_codes_user_idx on recovery_codes(user_id);
create index if not exists recovery_codes_set_idx on recovery_codes(set_id);

alter table webauthn_challenges enable row level security;
alter table webauthn_challenges force row level security;
alter table passkey_credentials enable row level security;
alter table passkey_credentials force row level security;
alter table recovery_code_sets enable row level security;
alter table recovery_code_sets force row level security;
alter table recovery_codes enable row level security;
alter table recovery_codes force row level security;

drop policy if exists webauthn_challenges_auth_self on webauthn_challenges;
drop policy if exists webauthn_challenges_auth_insert on webauthn_challenges;
drop policy if exists webauthn_challenges_auth_update on webauthn_challenges;
drop policy if exists webauthn_challenges_public_insert on webauthn_challenges;
drop policy if exists webauthn_challenges_public_lookup on webauthn_challenges;
drop policy if exists webauthn_challenges_public_update on webauthn_challenges;
create policy webauthn_challenges_auth_self on webauthn_challenges
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy webauthn_challenges_auth_insert on webauthn_challenges
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy webauthn_challenges_auth_update on webauthn_challenges
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy webauthn_challenges_public_insert on webauthn_challenges
  for insert with check (
    id = current_setting('lodariq.webauthn_challenge_id', true)
    and purpose = 'passkey_authentication'
    and user_id is null
  );
create policy webauthn_challenges_public_lookup on webauthn_challenges
  for select using (id = current_setting('lodariq.webauthn_challenge_id', true));
create policy webauthn_challenges_public_update on webauthn_challenges
  for update using (id = current_setting('lodariq.webauthn_challenge_id', true))
  with check (id = current_setting('lodariq.webauthn_challenge_id', true));

drop policy if exists passkey_credentials_auth_self on passkey_credentials;
drop policy if exists passkey_credentials_auth_insert on passkey_credentials;
drop policy if exists passkey_credentials_auth_update on passkey_credentials;
drop policy if exists passkey_credentials_auth_delete on passkey_credentials;
drop policy if exists passkey_credentials_credential_lookup on passkey_credentials;
drop policy if exists passkey_credentials_credential_update on passkey_credentials;
create policy passkey_credentials_auth_self on passkey_credentials
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_auth_insert on passkey_credentials
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_auth_update on passkey_credentials
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_auth_delete on passkey_credentials
  for delete using (user_id = current_setting('lodariq.auth_user_id', true));
create policy passkey_credentials_credential_lookup on passkey_credentials
  for select using (credential_id = current_setting('lodariq.webauthn_credential_id', true));
create policy passkey_credentials_credential_update on passkey_credentials
  for update using (credential_id = current_setting('lodariq.webauthn_credential_id', true))
  with check (credential_id = current_setting('lodariq.webauthn_credential_id', true));

drop policy if exists recovery_code_sets_auth_self on recovery_code_sets;
drop policy if exists recovery_code_sets_auth_insert on recovery_code_sets;
drop policy if exists recovery_code_sets_auth_update on recovery_code_sets;
create policy recovery_code_sets_auth_self on recovery_code_sets
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_code_sets_auth_insert on recovery_code_sets
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_code_sets_auth_update on recovery_code_sets
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));

drop policy if exists recovery_codes_auth_self on recovery_codes;
drop policy if exists recovery_codes_auth_insert on recovery_codes;
drop policy if exists recovery_codes_auth_update on recovery_codes;
drop policy if exists recovery_codes_hash_lookup on recovery_codes;
drop policy if exists recovery_codes_hash_consume on recovery_codes;
create policy recovery_codes_auth_self on recovery_codes
  for select using (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_codes_auth_insert on recovery_codes
  for insert with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_codes_auth_update on recovery_codes
  for update using (user_id = current_setting('lodariq.auth_user_id', true))
  with check (user_id = current_setting('lodariq.auth_user_id', true));
create policy recovery_codes_hash_lookup on recovery_codes
  for select using (code_hash = current_setting('lodariq.recovery_code_hash', true));
create policy recovery_codes_hash_consume on recovery_codes
  for update using (code_hash = current_setting('lodariq.recovery_code_hash', true))
  with check (code_hash = current_setting('lodariq.recovery_code_hash', true));

commit;
