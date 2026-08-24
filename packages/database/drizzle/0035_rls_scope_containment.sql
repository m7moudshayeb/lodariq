begin;

-- L6 + L2. Two RLS predicates that grant more than the caller needs.

/*
 * A worker flag is a settable GUC, so `flag = 'true'` alone is an unconditional
 * cross-tenant grant to anything that sets it. Every caller today is a
 * background poller — `runWith*WorkerScope` sets only its own flag and never
 * `lodariq.workspace_id` — so requiring the workspace scope to be absent costs
 * those callers nothing and stops a request-path connection, which always has a
 * workspace bound, from reading across tenants by also flipping the flag.
 */
create or replace function lodariq_worker_scope(flag text) returns boolean
language sql stable as $$
  select current_setting(flag, true) = 'true'
     and coalesce(current_setting('lodariq.workspace_id', true), '') = ''
$$;

comment on function lodariq_worker_scope(text) is
  'True only for a connection carrying the named worker flag and no workspace scope.';

-- webhook_endpoints: the worker disjunct is this table endpoint URLs'
-- only select policy, so any request-path use would return every tenant's.
drop policy if exists webhook_endpoints_workspace_select on webhook_endpoints;
create policy webhook_endpoints_workspace_select on webhook_endpoints
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or lodariq_worker_scope('lodariq.webhook_worker')
  );

drop policy if exists webhook_events_workspace_select on webhook_events;
create policy webhook_events_workspace_select on webhook_events
  for select using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or lodariq_worker_scope('lodariq.webhook_worker')
  );

drop policy if exists webhook_deliveries_workspace_isolation on webhook_deliveries;
create policy webhook_deliveries_workspace_isolation on webhook_deliveries
  using (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or lodariq_worker_scope('lodariq.webhook_worker')
  )
  with check (
    workspace_id = current_setting('lodariq.workspace_id', true)
    or lodariq_worker_scope('lodariq.webhook_worker')
  );

drop policy if exists delivery_schedule_jobs_worker_select on delivery_schedule_jobs;
create policy delivery_schedule_jobs_worker_select on delivery_schedule_jobs
  for select using (lodariq_worker_scope('lodariq.delivery_worker'));
drop policy if exists delivery_schedule_jobs_worker_update on delivery_schedule_jobs;
create policy delivery_schedule_jobs_worker_update on delivery_schedule_jobs
  for update using (lodariq_worker_scope('lodariq.delivery_worker'))
  with check (lodariq_worker_scope('lodariq.delivery_worker'));

drop policy if exists analytics_export_jobs_worker_select on analytics_export_jobs;
create policy analytics_export_jobs_worker_select on analytics_export_jobs
  for select using (lodariq_worker_scope('lodariq.analytics_export_worker'));
drop policy if exists analytics_export_jobs_worker_update on analytics_export_jobs;
create policy analytics_export_jobs_worker_update on analytics_export_jobs
  for update using (lodariq_worker_scope('lodariq.analytics_export_worker'))
  with check (lodariq_worker_scope('lodariq.analytics_export_worker'));
drop policy if exists analytics_export_audit_events_worker_insert on analytics_export_audit_events;
create policy analytics_export_audit_events_worker_insert on analytics_export_audit_events
  for insert with check (lodariq_worker_scope('lodariq.analytics_export_worker'));

drop policy if exists billing_meter_batches_worker_select on billing_meter_batches;
create policy billing_meter_batches_worker_select
  on billing_meter_batches for select
  using (lodariq_worker_scope('lodariq.billing_worker'));
drop policy if exists billing_meter_batches_worker_update on billing_meter_batches;
create policy billing_meter_batches_worker_update
  on billing_meter_batches for update
  using (lodariq_worker_scope('lodariq.billing_worker'))
  with check (lodariq_worker_scope('lodariq.billing_worker'));

drop policy if exists data_residency_migrations_worker_select on data_residency_migrations;
create policy data_residency_migrations_worker_select
  on data_residency_migrations for select
  using (lodariq_worker_scope('lodariq.residency_worker'));
drop policy if exists data_residency_migrations_worker_update on data_residency_migrations;
create policy data_residency_migrations_worker_update
  on data_residency_migrations for update
  using (lodariq_worker_scope('lodariq.residency_worker'))
  with check (lodariq_worker_scope('lodariq.residency_worker'));

drop policy if exists analytics_warehouse_destinations_worker_select on analytics_warehouse_destinations;
create policy analytics_warehouse_destinations_worker_select
  on analytics_warehouse_destinations for select
  using (lodariq_worker_scope('lodariq.warehouse_worker'));
drop policy if exists analytics_warehouse_destinations_worker_update on analytics_warehouse_destinations;
create policy analytics_warehouse_destinations_worker_update
  on analytics_warehouse_destinations for update
  using (lodariq_worker_scope('lodariq.warehouse_worker'))
  with check (lodariq_worker_scope('lodariq.warehouse_worker'));

/*
 * L2. Expiry was enforced only in application code, and the status flip that
 * backs it is fire-and-forget — so an expired demo link stayed readable through
 * RLS until something remembered to mark it. The predicate is the backstop.
 */
drop policy if exists authoring_roadmap_records_public_demo_select on authoring_roadmap_records;
create policy authoring_roadmap_records_public_demo_select
  on authoring_roadmap_records
  for select
  using (
    kind = 'demo_link'
    and status = 'active'
    and (expires_at is null or expires_at > now())
    and current_setting('lodariq.demo_public', true) = 'true'
  );

commit;
