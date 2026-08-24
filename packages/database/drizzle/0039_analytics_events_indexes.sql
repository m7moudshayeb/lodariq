/*
 * B8 + H11's last row + H12's index half, on the one table in this set that is
 * large enough for the lock to matter.
 *
 * NO TRANSACTION BLOCK, deliberately. `create index concurrently` cannot run
 * inside one, and a plain `create index` on analytics_events takes a lock that
 * blocks event ingestion for the duration of the build. Apply this file on its
 * own, with psql's own autocommit:
 *
 *   psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
 *     -f packages/database/drizzle/0039_analytics_events_indexes.sql
 *
 * A concurrent build that fails leaves an INVALID index behind. It is not used
 * by the planner and is safe to drop and retry:
 *
 *   select indexrelid::regclass from pg_index where not indisvalid;
 */

/*
 * B8. The warehouse sync cursor is `(ingested_at, id) > checkpoint order by
 * ingested_at, id limit 1000`, and no index anywhere contained `ingested_at` —
 * the four that exist are on `occurred_at`, `publication_id` and
 * `adaptive_visitor_key_hash`. The planner took the `(workspace_id,
 * environment_id)` prefix and filter-sorted every event in the environment,
 * every 15 seconds, per destination.
 */
create index concurrently if not exists analytics_events_warehouse_cursor_idx
  on analytics_events(workspace_id, environment_id, document_id, ingested_at, id);

/*
 * H11. `readExperiment` is called without an environment id from
 * `document-compilation.ts`, which breaks the
 * `(workspace_id, environment_id, document_id, occurred_at)` prefix — so every
 * document compile scanned the workspace's whole event table.
 */
create index concurrently if not exists analytics_events_document_time_idx
  on analytics_events(workspace_id, document_id, occurred_at);

/*
 * H12, index half. `entitlements.analyticsRetentionDays` is applied only as a
 * read filter, so a 30-day tenant still stores events forever and pays for the
 * bloat. Retention is per tenant, so the sweep deletes by
 * `(workspace_id, occurred_at < cutoff)` and needs that key without an
 * environment in front of it.
 *
 * This makes the sweep affordable; it does not make it cheap. Deleting from an
 * unpartitioned table of this size is itself the risk, and monthly
 * `occurred_at` partitions remain the real answer — a table rewrite, and its
 * own change.
 */
create index concurrently if not exists analytics_events_workspace_time_idx
  on analytics_events(workspace_id, occurred_at);
