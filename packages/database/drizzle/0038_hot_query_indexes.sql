begin;

/*
 * H11. Governance change history reads eleven sources in parallel, each scoped
 * to the workspace and ordered by its own timestamp descending. Every existing
 * index leads with a narrower key — `(workspace_id, environment_id, ...)`,
 * `(workspace_id, document_id, ...)` — so the unfiltered listing could use none
 * of them and sorted the workspace's whole history per source, per request.
 *
 * These tables are small enough that a plain `create index` is a brief write
 * lock. The one large table in this set is handled separately in 0039.
 */

create index if not exists document_versions_workspace_created_idx
  on document_versions(workspace_id, created_at desc);

create index if not exists publications_workspace_published_idx
  on publications(workspace_id, published_at desc);

create index if not exists release_operations_workspace_created_idx
  on release_operations(workspace_id, created_at desc);

create index if not exists release_approvals_workspace_created_idx
  on release_approvals(workspace_id, created_at desc);

create index if not exists publication_verifications_workspace_created_idx
  on publication_verifications(workspace_id, created_at desc);

create index if not exists document_deployments_workspace_updated_idx
  on document_deployments(workspace_id, updated_at desc);

create index if not exists experience_comment_audit_workspace_time_idx
  on experience_comment_audit_events(workspace_id, occurred_at desc);

create index if not exists accessibility_finding_events_workspace_time_idx
  on accessibility_finding_events(workspace_id, occurred_at desc);

create index if not exists data_residency_migration_history_workspace_time_idx
  on data_residency_migration_history(workspace_id, occurred_at desc);

/*
 * The lease reads pending rows and expired `delivering` rows in one `or`, which
 * `(status, available_at)` cannot serve across both branches, so it full-sorted
 * the table. Partial, so succeeded and dead rows leave the index rather than
 * accumulating in it forever.
 */
create index if not exists webhook_deliveries_claimable_idx
  on webhook_deliveries(available_at, created_at, id)
  where status in ('pending', 'delivering');

commit;
