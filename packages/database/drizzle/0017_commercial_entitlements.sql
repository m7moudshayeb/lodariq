begin;

-- The legacy asset table keeps its original 5 MiB check. New writes use this
-- additive store so plan limits can grow without a destructive constraint swap.
create table if not exists authoring_media_assets_v2 (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null,
  filename text not null,
  content_type text not null,
  byte_length integer not null,
  content_hash text not null,
  content_base64 text not null,
  saved_to_library boolean not null default false,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint authoring_media_assets_v2_workspace_id_idx unique(workspace_id, id),
  constraint authoring_media_assets_v2_kind_check check (kind in ('image', 'video', 'captions')),
  constraint authoring_media_assets_v2_size_check check (byte_length between 1 and 104857600),
  constraint authoring_media_assets_v2_hash_check check (content_hash ~ '^sha256-[0-9a-f]{64}$')
);
create index if not exists authoring_media_assets_v2_workspace_created_idx
  on authoring_media_assets_v2(workspace_id, created_at);

create table if not exists workspace_subscriptions (
  workspace_id text primary key references workspaces(id) on delete cascade,
  plan_id text not null,
  plan_version text not null,
  status text not null,
  entitlement_overrides_json jsonb not null default '{}'::jsonb,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_subscriptions_plan_check
    check (plan_id in ('free','starter','growth','scale','business','enterprise')),
  constraint workspace_subscriptions_status_check
    check (status in ('active','past_due','canceled')),
  constraint workspace_subscriptions_revision_check check (revision >= 1),
  constraint workspace_subscriptions_period_check check (current_period_end > current_period_start),
  constraint workspace_subscriptions_overrides_check
    check (jsonb_typeof(entitlement_overrides_json) = 'object')
);

create table if not exists effective_entitlement_snapshots (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  subscription_revision integer not null,
  plan_id text not null,
  plan_version text not null,
  entitlements_json jsonb not null,
  entitlement_hash text not null,
  reason text not null,
  change_actor_id text not null,
  effective_from timestamptz not null,
  created_at timestamptz not null default now(),
  constraint effective_entitlement_snapshots_revision_check check (subscription_revision >= 1),
  constraint effective_entitlement_snapshots_hash_check
    check (entitlement_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint effective_entitlement_snapshots_reason_check
    check (reason in ('migration','workspace_created','plan_changed','override_changed')),
  constraint effective_entitlement_snapshots_json_check
    check (jsonb_typeof(entitlements_json) = 'object')
);
create unique index if not exists effective_entitlement_snapshots_workspace_revision_idx
  on effective_entitlement_snapshots(workspace_id, subscription_revision);
create index if not exists effective_entitlement_snapshots_workspace_time_idx
  on effective_entitlement_snapshots(workspace_id, effective_from);

create table if not exists workspace_usage_ledger (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text,
  scope_key text not null,
  metric text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  quantity bigint not null,
  dedupe_key_hash text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint workspace_usage_ledger_environment_scope_fk
    foreign key(workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint workspace_usage_ledger_metric_check
    check (metric in ('engaged-users','live-experiences','creator-seats','applications','locales','environments','ai-credits','theme-generation-runs')),
  constraint workspace_usage_ledger_quantity_check check (quantity > 0),
  constraint workspace_usage_ledger_period_check check (period_end > period_start),
  constraint workspace_usage_ledger_hash_check
    check (dedupe_key_hash ~ '^sha256-[0-9a-f]{64}$')
);
create unique index if not exists workspace_usage_ledger_dedupe_idx
  on workspace_usage_ledger(workspace_id, scope_key, metric, period_start, dedupe_key_hash);
create index if not exists workspace_usage_ledger_totals_idx
  on workspace_usage_ledger(workspace_id, metric, period_start);
create index if not exists workspace_usage_ledger_environment_idx
  on workspace_usage_ledger(workspace_id, environment_id, period_start);

create table if not exists ai_credit_ledger (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  operation_id text not null,
  provider text not null,
  meter_version text not null,
  usage_unit text not null,
  input_units integer not null,
  output_units integer not null,
  provider_cost_micros bigint not null,
  credits_debited integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ai_credit_ledger_operation_check check (operation_id ~ '^aiop_[A-Za-z0-9_-]{20,}$'),
  constraint ai_credit_ledger_provider_check check (char_length(provider) between 1 and 80),
  constraint ai_credit_ledger_meter_version_check check (char_length(meter_version) between 1 and 80),
  constraint ai_credit_ledger_unit_check
    check (usage_unit in ('tokens','characters','seconds','images')),
  constraint ai_credit_ledger_usage_check
    check (input_units >= 0 and output_units >= 0 and provider_cost_micros >= 0 and credits_debited > 0),
  constraint ai_credit_ledger_period_check check (period_end > period_start)
);
create unique index if not exists ai_credit_ledger_workspace_operation_idx
  on ai_credit_ledger(workspace_id, operation_id);
create index if not exists ai_credit_ledger_period_idx
  on ai_credit_ledger(workspace_id, period_start);

-- Existing tenants keep the pre-packaging capability set. New tenants are
-- created as Free by the repository boundary.
insert into workspace_subscriptions (
  workspace_id, plan_id, plan_version, status, entitlement_overrides_json,
  current_period_start, current_period_end, revision, created_at, updated_at
)
select
  id, 'business', '2026-08-21.1', 'active', '{}'::jsonb,
  date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
  1, now(), now()
from workspaces
on conflict (workspace_id) do nothing;

insert into effective_entitlement_snapshots (
  id, workspace_id, subscription_revision, plan_id, plan_version,
  entitlements_json, entitlement_hash, reason, change_actor_id, effective_from, created_at
)
select
  'entsnap_' || md5(workspace_id), workspace_id, 1, plan_id, plan_version,
  $json${
    "engagedUsersPerMonth": 1000000,
    "liveExperiences": null,
    "creatorSeats": null,
    "applications": null,
    "locales": null,
    "environments": null,
    "assetBytes": 26214400,
    "removeBadge": true,
    "analyticsRetentionDays": 730,
    "analyticsExportsPerMonth": 1000,
    "adoptionSuccessEvents": null,
    "aiCreditsPerMonth": 15000,
    "versionRetentionDays": null,
    "themeGenerationRuns": null,
    "features": [
      "named-step-styles", "flow-map", "scheduling", "copy-assist",
      "predictive-layout-qa", "release-management", "recovery", "drift-alerts", "roles",
      "theme-generation", "branching", "multiple-themes", "form-response-capture", "audience-segmentation",
      "custom-user-attributes", "event-triggers", "experiments", "batch-operations",
      "adoption-impact", "form-response-analytics", "audience-segment-results", "sequence-funnel",
      "experiment-comparison", "ask-assist", "auto-translate", "review-approval", "presence",
      "sso", "api-webhooks", "cohort-retention", "analytics-csv", "narration",
      "required-production-approval", "audit-log", "step-locks", "comments", "warehouse-sync",
      "raw-event-export", "voice-cloning", "change-history-export", "scim", "custom-roles"
    ]
  }$json$::jsonb,
  'sha256-282e42a25d540544ea0617cfe479fef3fe6f36885e7883c2aa746a1ea7c13f7c',
  'migration', 'system:migration', created_at, created_at
from workspace_subscriptions
on conflict (workspace_id, subscription_revision) do nothing;

create or replace function public.lodariq_count_creator_seats(candidate_workspace_id text)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if candidate_workspace_id is null
    or candidate_workspace_id is distinct from current_setting('lodariq.workspace_id', true)
  then
    raise insufficient_privilege using message = 'workspace scope is required';
  end if;

  return (
    select count(*)
    from workspace_memberships membership
    where membership.workspace_id = candidate_workspace_id
      and membership.role <> 'viewer'
  );
end
$$;
revoke all on function public.lodariq_count_creator_seats(text) from public;

alter table authoring_media_assets_v2 enable row level security;
alter table authoring_media_assets_v2 force row level security;
alter table workspace_subscriptions enable row level security;
alter table workspace_subscriptions force row level security;
alter table effective_entitlement_snapshots enable row level security;
alter table effective_entitlement_snapshots force row level security;
alter table workspace_usage_ledger enable row level security;
alter table workspace_usage_ledger force row level security;
alter table ai_credit_ledger enable row level security;
alter table ai_credit_ledger force row level security;

create policy authoring_media_assets_v2_workspace_isolation on authoring_media_assets_v2
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy authoring_media_assets_v2_published_lookup on authoring_media_assets_v2
  for select
  using (id = current_setting('lodariq.media_asset_id', true) and published_at is not null);

create policy workspace_subscriptions_workspace_read on workspace_subscriptions
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_subscriptions_workspace_insert on workspace_subscriptions
  for insert with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_subscriptions_workspace_update on workspace_subscriptions
  for update using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

-- Commercial history and metering are append-only for the application role.
create policy effective_entitlement_snapshots_workspace_read on effective_entitlement_snapshots
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy effective_entitlement_snapshots_workspace_insert on effective_entitlement_snapshots
  for insert with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_usage_ledger_workspace_read on workspace_usage_ledger
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy workspace_usage_ledger_workspace_insert on workspace_usage_ledger
  for insert with check (workspace_id = current_setting('lodariq.workspace_id', true));
create policy ai_credit_ledger_workspace_read on ai_credit_ledger
  for select using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy ai_credit_ledger_workspace_insert on ai_credit_ledger
  for insert with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
