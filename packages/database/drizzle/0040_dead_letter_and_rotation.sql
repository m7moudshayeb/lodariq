begin;

/*
 * L4 + M7 + L8. Replacing a CHECK constraint means dropping it first, and a
 * replacement that fails to validate existing rows aborts the transaction, so
 * all three are grouped here and exactly one migration needs sign-off rather
 * than three.
 */

-- lodariq-shared-env-destructive-migration-signoff: Mahmoud Shayeb / 2026-08-24 / approved in Claude Code session 827da99c

/*
 * L4. Rotation was hard-coded to `secretVersion: 1` with no rotate route,
 * because a rotation with no overlap window breaks every receiver at once and
 * one that cannot be audited is worse than none. Both gaps are schema:
 * somewhere to record the previous version while receivers catch up, and an
 * audit event type for the act itself.
 */
alter table webhook_endpoints
  add column if not exists previous_secret_version integer,
  add column if not exists secret_overlap_until timestamptz;

comment on column webhook_endpoints.secret_overlap_until is
  'While in the future, signatures from previous_secret_version still verify.';

alter table webhook_endpoints
  drop constraint if exists webhook_endpoints_secret_overlap_check;
alter table webhook_endpoints
  add constraint webhook_endpoints_secret_overlap_check check (
    (previous_secret_version is null and secret_overlap_until is null)
    or (
      previous_secret_version is not null
      and secret_overlap_until is not null
      and previous_secret_version < secret_version
    )
  );

alter table governance_audit_events
  drop constraint if exists governance_audit_events_type_check;
alter table governance_audit_events
  add constraint governance_audit_events_type_check check (event_type in (
    'capability_profile_created', 'capability_profile_updated',
    'capability_profile_deleted', 'capability_profile_assigned',
    'capability_profile_unassigned', 'webhook_endpoint_created',
    'webhook_endpoint_disabled', 'webhook_endpoint_secret_rotated',
    'webhook_delivery_replayed',
    'residency_migration_requested', 'residency_migration_transitioned'
  ));

/*
 * M7. A single reconciliation mismatch set `attempt_count = MAX_ATTEMPTS`, and
 * the claim queries require `attempt_count < MAX_ATTEMPTS` — so one bad
 * provider echo removed the batch or destination from the queue forever, with
 * no alert and nothing to distinguish it from work that had simply finished.
 * Exhausted and dead are different states and only one of them is a bug report.
 */
alter table billing_meter_batches
  drop constraint if exists billing_meter_batches_status_check;
alter table billing_meter_batches
  add constraint billing_meter_batches_status_check
  check (status in ('pending', 'submitting', 'reconciled', 'failed', 'dead'));

alter table analytics_warehouse_destinations
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists dead_letter_reason text;

comment on column analytics_warehouse_destinations.dead_lettered_at is
  'Set when reconciliation found a mismatch this pipeline cannot resolve by retrying.';

/*
 * L8. `schema/environments.ts` names the constraint
 * `environments_governance_capabilities_check`; `0025` created it as
 * `..._check_v1`. No runtime effect, but every future schema-drift diff flags
 * it, which is how a real drift gets waved through. Guarded, because 0025's own
 * `alter table` has no `if not exists` and re-running it aborts.
 */
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'environments_governance_capabilities_check_v1'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'environments_governance_capabilities_check'
  ) then
    alter table environments
      rename constraint environments_governance_capabilities_check_v1
      to environments_governance_capabilities_check;
  end if;
end $$;

commit;
