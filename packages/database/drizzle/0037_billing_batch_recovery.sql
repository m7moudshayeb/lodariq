begin;

/*
 * H1. `billing_meter_batches` had workspace select and insert, and worker
 * select and update — but no workspace update. Under `force row level
 * security` that is not a read restriction, it is a silent write failure: the
 * operator reset route added for M7 runs in workspace scope
 * (`commercial-entitlements.ts` `resetBillingMeterBatch`), so its
 * `update ... returning` matched zero rows and reported every batch as not
 * found. A stranded batch is unbilled usage, so the symptom is revenue loss
 * with nothing in the logs.
 *
 * The in-memory repository has no RLS, so every API test passed. The RLS
 * coverage test is what catches this class, which is why E0 restored it.
 */
create policy billing_meter_batches_workspace_update
  on billing_meter_batches for update
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
