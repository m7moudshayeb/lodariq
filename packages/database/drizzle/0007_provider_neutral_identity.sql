begin;

-- Expansion must fail before writing anything when two legacy users normalize
-- to the same email. Choosing either row would silently merge identities.
do $$
begin
  if exists (
    select 1
    from users
    group by lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception 'provider-neutral identity backfill rejected ambiguous normalized email data';
  end if;
end
$$;

create table if not exists user_emails (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  normalized_email text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_emails_id_check check (id ~ '^email_[A-Za-z0-9_-]{20,}$'),
  constraint user_emails_normalized_check check (
    char_length(normalized_email) between 3 and 320
    and normalized_email = lower(btrim(normalized_email))
  )
);
create unique index if not exists user_emails_normalized_idx on user_emails(normalized_email);
create unique index if not exists user_emails_primary_user_idx on user_emails(user_id)
  where is_primary;
create index if not exists user_emails_user_idx on user_emails(user_id);

create table if not exists usernames (
  id text primary key,
  user_id text not null unique references users(id) on delete cascade,
  normalized_username text not null,
  display_username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usernames_id_check check (id ~ '^uname_[A-Za-z0-9_-]{20,}$'),
  constraint usernames_normalized_check check (
    char_length(normalized_username) between 3 and 32
    and normalized_username = lower(btrim(normalized_username))
    and normalized_username ~ '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$'
    and normalized_username !~ '[._-]{2}'
  ),
  constraint usernames_display_check check (
    char_length(display_username) between 3 and 32
    and display_username = btrim(display_username)
    and display_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$'
    and display_username !~ '[._-]{2}'
    and lower(display_username) = normalized_username
  ),
  constraint usernames_reserved_check check (
    normalized_username not in (
      'account', 'admin', 'administrator', 'api', 'app', 'auth', 'billing',
      'dashboard', 'editor', 'help', 'lodariq', 'login', 'logout', 'me',
      'oauth', 'owner', 'root', 'security', 'settings', 'signin', 'signup',
      'sso', 'support', 'system', 'verify', 'www'
    )
  )
);
create unique index if not exists usernames_normalized_idx on usernames(normalized_username);

create table if not exists auth_identities (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  kind text not null,
  issuer text not null,
  subject text not null,
  provider_tenant_id text,
  created_at timestamptz not null default now(),
  last_authenticated_at timestamptz,
  constraint auth_identities_id_check check (id ~ '^ident_[A-Za-z0-9_-]{20,}$'),
  constraint auth_identities_kind_check check (kind in ('password', 'passkey', 'oidc', 'saml')),
  constraint auth_identities_provider_tenant_check check (
    (
      kind in ('password', 'passkey')
      and issuer = 'https://lodariq.io'
      and provider_tenant_id is null
    ) or (
      kind in ('oidc', 'saml')
      and provider_tenant_id is not null
    )
  ),
  constraint auth_identities_subject_check check (
    char_length(subject) between 1 and 1024
    and char_length(issuer) between 1 and 2048
  )
);
create unique index if not exists auth_identities_issuer_subject_idx
  on auth_identities(issuer, subject);
create index if not exists auth_identities_user_idx on auth_identities(user_id);
create index if not exists auth_identities_provider_tenant_idx
  on auth_identities(provider_tenant_id);

-- Deterministic non-secret ids make the additive backfill idempotent without
-- extensions. Existing legacy columns remain untouched for rollback.
insert into user_emails (
  id, user_id, normalized_email, is_primary, verified_at, created_at, updated_at
)
select
  'email_' || md5('email:' || id),
  id,
  lower(btrim(email)),
  true,
  email_verified_at,
  created_at,
  created_at
from users
on conflict do nothing;

insert into auth_identities (
  id, user_id, kind, issuer, subject, provider_tenant_id, created_at, last_authenticated_at
)
select
  'ident_' || md5('password:' || credential.user_id),
  credential.user_id,
  'password',
  'https://lodariq.io',
  'user:' || credential.user_id,
  null,
  credential.created_at,
  null
from password_credentials credential
on conflict do nothing;

alter table auth_sessions add column if not exists identity_id text
  references auth_identities(id) on delete restrict;
alter table auth_sessions add column if not exists authentication_method text
  not null default 'password';
alter table auth_sessions add column if not exists assurance_level text
  not null default 'aal1';
alter table auth_sessions add column if not exists authenticated_at timestamptz
  not null default now();
alter table auth_sessions add column if not exists duration_policy text
  not null default 'standard';

do $$ begin alter table auth_sessions add constraint auth_sessions_method_check
  check (authentication_method in ('password', 'passkey', 'oidc', 'saml', 'recovery'));
exception when duplicate_object then null; end $$;
do $$ begin alter table auth_sessions add constraint auth_sessions_assurance_check
  check (assurance_level in ('aal1', 'aal2', 'aal3'));
exception when duplicate_object then null; end $$;
do $$ begin alter table auth_sessions add constraint auth_sessions_duration_policy_check
  check (duration_policy in ('standard', 'remembered', 'managed'));
exception when duplicate_object then null; end $$;
-- Keep authenticated_at tolerant of the preceding application during the
-- expand/contract window: that release supplies created_at but relies on this
-- column's database default. The new application enforces auth time <= created
-- time before writes; a later contract migration can validate it in SQL.

create table if not exists workspace_auth_policies (
  workspace_id text primary key references workspaces(id) on delete cascade,
  sso_required boolean not null default false,
  minimum_assurance text not null default 'aal1',
  password_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_auth_policies_assurance_check
    check (minimum_assurance in ('aal1', 'aal2', 'aal3')),
  constraint workspace_auth_policies_viable_method_check
    check (password_allowed or sso_required)
);

insert into workspace_auth_policies (
  workspace_id, sso_required, minimum_assurance, password_allowed, created_at, updated_at
)
select id, false, 'aal1', true, created_at, updated_at
from workspaces
on conflict do nothing;

create table if not exists sso_connections (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  protocol text not null,
  issuer text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sso_connections_id_check check (id ~ '^sso_[A-Za-z0-9_-]{20,}$'),
  constraint sso_connections_protocol_check check (protocol in ('oidc', 'saml')),
  constraint sso_connections_status_check check (status in ('draft', 'verified', 'disabled')),
  constraint sso_connections_issuer_check check (char_length(issuer) between 1 and 2048)
);
create unique index if not exists sso_connections_workspace_issuer_idx
  on sso_connections(workspace_id, protocol, issuer);
create index if not exists sso_connections_workspace_idx on sso_connections(workspace_id);

alter table user_emails enable row level security;
alter table user_emails force row level security;
alter table usernames enable row level security;
alter table usernames force row level security;
alter table auth_identities enable row level security;
alter table auth_identities force row level security;
alter table workspace_auth_policies enable row level security;
alter table workspace_auth_policies force row level security;
alter table sso_connections enable row level security;
alter table sso_connections force row level security;

do $$ begin create policy user_emails_auth_self on user_emails for select using (
  user_id = current_setting('lodariq.auth_user_id', true)
); exception when duplicate_object then null; end $$;
do $$ begin create policy user_emails_owned_insert on user_emails for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
  and normalized_email = current_setting('lodariq.auth_email_normalized', true)
); exception when duplicate_object then null; end $$;
do $$ begin create policy user_emails_owned_update on user_emails for update using (
  user_id = current_setting('lodariq.auth_user_id', true)
) with check (user_id = current_setting('lodariq.auth_user_id', true));
exception when duplicate_object then null; end $$;

do $$ begin create policy usernames_auth_lookup on usernames for select using (
  normalized_username = current_setting('lodariq.auth_identifier_normalized', true)
  or user_id = current_setting('lodariq.auth_user_id', true)
); exception when duplicate_object then null; end $$;
do $$ begin create policy usernames_owned_insert on usernames for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
); exception when duplicate_object then null; end $$;
do $$ begin create policy usernames_owned_update on usernames for update using (
  user_id = current_setting('lodariq.auth_user_id', true)
) with check (user_id = current_setting('lodariq.auth_user_id', true));
exception when duplicate_object then null; end $$;

do $$ begin create policy auth_identities_auth_self on auth_identities for select using (
  user_id = current_setting('lodariq.auth_user_id', true)
); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_identities_provider_lookup on auth_identities for select using (
  issuer = current_setting('lodariq.auth_identity_issuer', true)
  and subject = current_setting('lodariq.auth_identity_subject', true)
); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_identities_owned_insert on auth_identities for insert with check (
  user_id = current_setting('lodariq.auth_user_id', true)
); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_identities_owned_update on auth_identities for update using (
  user_id = current_setting('lodariq.auth_user_id', true)
) with check (user_id = current_setting('lodariq.auth_user_id', true));
exception when duplicate_object then null; end $$;

do $$ begin create policy workspace_auth_policies_workspace_isolation
  on workspace_auth_policies for all
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;
do $$ begin create policy sso_connections_workspace_isolation
  on sso_connections for all
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
exception when duplicate_object then null; end $$;

commit;
