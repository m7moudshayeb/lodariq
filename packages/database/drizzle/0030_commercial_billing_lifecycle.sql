begin;

create table if not exists workspace_billing_accounts (
  workspace_id text primary key references workspaces(id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  provider_subscription_id text,
  synced_through timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_billing_accounts_provider_check
    check (char_length(provider) between 1 and 80),
  constraint workspace_billing_accounts_customer_check
    check (char_length(provider_customer_id) between 1 and 256)
);
create unique index if not exists workspace_billing_accounts_provider_customer_idx
  on workspace_billing_accounts(provider, provider_customer_id);
create unique index if not exists workspace_billing_accounts_provider_subscription_idx
  on workspace_billing_accounts(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists billing_provider_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  provider_created_at timestamptz not null,
  processed_at timestamptz not null,
  constraint billing_provider_events_hash_check
    check (payload_hash ~ '^sha256-[0-9a-f]{64}$')
);
create unique index if not exists billing_provider_events_provider_event_idx
  on billing_provider_events(provider, provider_event_id);
create index if not exists billing_provider_events_workspace_time_idx
  on billing_provider_events(workspace_id, provider_created_at);

create table if not exists billing_invoices (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  provider text not null,
  provider_invoice_id text not null,
  status text not null,
  currency text not null,
  amount_due_minor bigint not null,
  amount_paid_minor bigint not null,
  issued_at timestamptz not null,
  due_at timestamptz,
  paid_at timestamptz,
  hosted_invoice_url text,
  provider_updated_at timestamptz not null,
  constraint billing_invoices_status_check
    check (status in ('draft','open','paid','void','uncollectible')),
  constraint billing_invoices_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint billing_invoices_amount_check
    check (amount_due_minor >= 0 and amount_paid_minor >= 0)
);
create unique index if not exists billing_invoices_provider_invoice_idx
  on billing_invoices(provider, provider_invoice_id);
create index if not exists billing_invoices_workspace_issued_idx
  on billing_invoices(workspace_id, issued_at);

create table if not exists billing_meter_batches (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  provider text not null,
  meter_version text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  items_json jsonb not null,
  items_hash text not null,
  status text not null,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null,
  lease_worker_id text,
  lease_expires_at timestamptz,
  provider_submission_id text,
  error_code text,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_meter_batches_status_check
    check (status in ('pending','submitting','reconciled','failed')),
  constraint billing_meter_batches_period_check check (period_end > period_start),
  constraint billing_meter_batches_items_check check (jsonb_typeof(items_json) = 'array'),
  constraint billing_meter_batches_hash_check
    check (items_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint billing_meter_batches_attempt_check check (attempt_count between 0 and 20),
  constraint billing_meter_batches_lease_check
    check ((lease_worker_id is null) = (lease_expires_at is null))
);
create unique index if not exists billing_meter_batches_period_idx
  on billing_meter_batches(workspace_id, provider, meter_version, period_start, period_end);
create index if not exists billing_meter_batches_claim_idx
  on billing_meter_batches(status, next_attempt_at, lease_expires_at);

alter table workspace_billing_accounts enable row level security;
alter table workspace_billing_accounts force row level security;
create policy workspace_billing_accounts_workspace_isolation
  on workspace_billing_accounts
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table billing_provider_events enable row level security;
alter table billing_provider_events force row level security;
create policy billing_provider_events_workspace_select
  on billing_provider_events for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy billing_provider_events_workspace_insert
  on billing_provider_events for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table billing_invoices enable row level security;
alter table billing_invoices force row level security;
create policy billing_invoices_workspace_isolation
  on billing_invoices
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table billing_meter_batches enable row level security;
alter table billing_meter_batches force row level security;
create policy billing_meter_batches_workspace_select
  on billing_meter_batches for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy billing_meter_batches_workspace_insert
  on billing_meter_batches for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy billing_meter_batches_worker_select
  on billing_meter_batches for select
  using (current_setting('lodariq.billing_worker', true) = 'true');
create policy billing_meter_batches_worker_update
  on billing_meter_batches for update
  using (current_setting('lodariq.billing_worker', true) = 'true')
  with check (current_setting('lodariq.billing_worker', true) = 'true');

commit;
