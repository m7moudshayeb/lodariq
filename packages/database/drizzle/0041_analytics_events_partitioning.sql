/*
 * NOT SIGNED OFF. `pnpm migrations:check` fails on this file, by design.
 *
 * The guard is satisfied by any non-empty approver string, so writing a
 * placeholder here would pass the check while approving nothing. The line is
 * therefore absent until a human adds it:
 *
 *   -- lodariq-shared-env-destructive-migration-signoff: <approver/date/link>
 *
 * Until then this file is authored, tested against a scratch database, and
 * unapplied everywhere.
 */

/*
 * H12's remaining half. `analytics_events` is the largest table in the system
 * and has no delete path at all: `entitlements.analyticsRetentionDays` was only
 * ever a read filter, so every workspace stores every event forever.
 *
 * Deleting rows from a table that size is itself the risk the review named, so
 * retention becomes `drop partition` — constant time, no bloat, no vacuum debt.
 *
 * THIS FILE REWRITES THE TABLE. It is not an online migration:
 *
 *   - Partitioning an existing table in place is not possible in PostgreSQL.
 *     The table is rebuilt, copied into, and swapped.
 *   - The primary key changes from `(id)` to `(id, occurred_at)`. PostgreSQL
 *     requires the partition key in every unique constraint. Nothing looks a
 *     row up by bare `id` today, but anything added later cannot assume `id`
 *     alone is unique across partitions.
 *   - Ingestion must be stopped for the duration. Apply it in a maintenance
 *     window, not alongside a deploy.
 *
 * Apply on its own and check the row counts printed at the end match before
 * committing to the swap:
 *
 *   psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
 *     -f packages/database/drizzle/0041_analytics_events_partitioning.sql
 */

begin;

/*
 * Serialize against ingestion rather than trusting the window. An INSERT takes
 * RowExclusiveLock; this waits for the ones in flight and blocks the next.
 */
lock table analytics_events in access exclusive mode;

create table analytics_events_partitioned (
  id text not null,
  workspace_id text not null,
  environment_id text not null,
  document_id text not null,
  publication_id text not null,
  content_hash text not null,
  pointer_generation integer not null,
  experiment_id text,
  experiment_arm_id text,
  experiment_allocation_revision integer,
  audience_segment_id text,
  audience_segment_definition_version integer,
  audience_segment_rule_count integer,
  adaptive_visitor_key_hash text,
  name text not null,
  step_id text,
  sdk_version text not null,
  correlation_id text,
  occurred_at timestamptz not null,
  props jsonb,
  ingested_at timestamptz not null default now(),
  constraint analytics_events_partitioned_pkey primary key (id, occurred_at)
) partition by range (occurred_at);

/*
 * One partition per calendar month across the existing range, plus the next
 * twelve so ingestion does not fall off the end before the scheduler exists.
 * A DEFAULT partition catches anything outside both, so no insert can fail for
 * want of a partition.
 */
do $$
declare
  span_start date;
  span_end date;
  cursor_month date;
begin
  select coalesce(date_trunc('month', min(occurred_at)), date_trunc('month', now()))::date,
         coalesce(date_trunc('month', max(occurred_at)), date_trunc('month', now()))::date
    into span_start, span_end
    from analytics_events;

  cursor_month := span_start;
  span_end := (span_end + interval '12 months')::date;

  while cursor_month <= span_end loop
    execute format(
      'create table if not exists %I partition of analytics_events_partitioned '
      'for values from (%L) to (%L)',
      'analytics_events_' || to_char(cursor_month, 'YYYY_MM'),
      cursor_month,
      (cursor_month + interval '1 month')::date
    );
    cursor_month := (cursor_month + interval '1 month')::date;
  end loop;
end
$$;

create table if not exists analytics_events_overflow
  partition of analytics_events_partitioned default;

insert into analytics_events_partitioned (
  id, workspace_id, environment_id, document_id, publication_id, content_hash,
  pointer_generation, experiment_id, experiment_arm_id, experiment_allocation_revision,
  audience_segment_id, audience_segment_definition_version, audience_segment_rule_count,
  adaptive_visitor_key_hash, name, step_id, sdk_version, correlation_id,
  occurred_at, props, ingested_at
)
select
  id, workspace_id, environment_id, document_id, publication_id, content_hash,
  pointer_generation, experiment_id, experiment_arm_id, experiment_allocation_revision,
  audience_segment_id, audience_segment_definition_version, audience_segment_rule_count,
  adaptive_visitor_key_hash, name, step_id, sdk_version, correlation_id,
  occurred_at, props, ingested_at
from analytics_events;

/*
 * Every row must land. A mismatch means a row fell outside every range, which
 * the DEFAULT partition should have made impossible — fail rather than swap.
 */
do $$
declare
  source_rows bigint;
  copied_rows bigint;
begin
  select count(*) into source_rows from analytics_events;
  select count(*) into copied_rows from analytics_events_partitioned;
  if source_rows <> copied_rows then
    raise exception 'analytics_events copy mismatch: % source, % copied', source_rows, copied_rows;
  end if;
  raise notice 'analytics_events partitioned copy verified: % rows', copied_rows;
end
$$;

/*
 * Index names are schema-global, and the old table still holds all nine. Move
 * them aside rather than dropping: the rollback table keeps working indexes,
 * and the canonical names come free for the partitioned table below.
 */
do $$
declare
  index_name text;
begin
  foreach index_name in array array[
    'analytics_events_environment_occurred_idx',
    'analytics_events_document_occurred_idx',
    'analytics_events_publication_idx',
    'analytics_events_experiment_occurred_idx',
    'analytics_events_audience_segment_occurred_idx',
    'analytics_events_adaptive_evidence_idx',
    'analytics_events_warehouse_cursor_idx',
    'analytics_events_document_time_idx',
    'analytics_events_workspace_time_idx'
  ] loop
    if exists (select 1 from pg_class where relname = index_name and relkind = 'i') then
      execute format('alter index %I rename to %I', index_name, index_name || '_pre_partition');
    end if;
  end loop;
end
$$;

/*
 * Indexes are created on the parent after the copy, not before: building them
 * once over a populated table is far cheaper than maintaining them row by row
 * through the insert. Each propagates to every partition.
 */
create index analytics_events_environment_occurred_idx
  on analytics_events_partitioned(workspace_id, environment_id, occurred_at);
create index analytics_events_document_occurred_idx
  on analytics_events_partitioned(workspace_id, environment_id, document_id, occurred_at);
create index analytics_events_publication_idx
  on analytics_events_partitioned(workspace_id, environment_id, publication_id);
create index analytics_events_experiment_occurred_idx
  on analytics_events_partitioned(workspace_id, environment_id, experiment_id, occurred_at);
create index analytics_events_audience_segment_occurred_idx
  on analytics_events_partitioned(
    workspace_id, environment_id, document_id, audience_segment_id, occurred_at
  );
create index analytics_events_adaptive_evidence_idx
  on analytics_events_partitioned(
    workspace_id, environment_id, adaptive_visitor_key_hash, name, occurred_at
  );
create index analytics_events_warehouse_cursor_idx
  on analytics_events_partitioned(
    workspace_id, environment_id, document_id, ingested_at, id
  );
create index analytics_events_document_time_idx
  on analytics_events_partitioned(workspace_id, document_id, occurred_at);
create index analytics_events_workspace_time_idx
  on analytics_events_partitioned(workspace_id, occurred_at);

alter table analytics_events_partitioned
  add constraint analytics_events_content_hash_check
  check (content_hash ~ '^sha256-[0-9a-f]{64}$');
alter table analytics_events_partitioned
  add constraint analytics_events_pointer_generation_check
  check (pointer_generation >= 1);
alter table analytics_events_partitioned
  add constraint analytics_events_name_check
  check (char_length(name) between 1 and 80 and name ~ '^[a-z][a-z0-9_.-]*$');
alter table analytics_events_partitioned
  add constraint analytics_events_sdk_version_check
  check (char_length(sdk_version) between 1 and 128);
alter table analytics_events_partitioned
  add constraint analytics_events_props_check
  check (props is null or jsonb_typeof(props) = 'object');
alter table analytics_events_partitioned
  add constraint analytics_events_adaptive_visitor_hash_check
  check (adaptive_visitor_key_hash is null or adaptive_visitor_key_hash ~ '^[0-9a-f]{64}$');
alter table analytics_events_partitioned
  add constraint analytics_events_experiment_identity_check
  check (
    (experiment_id is null and experiment_arm_id is null
      and experiment_allocation_revision is null)
    or (experiment_id is not null and experiment_arm_id in ('A', 'B', 'C', 'D')
      and experiment_allocation_revision >= 1)
  );
alter table analytics_events_partitioned
  add constraint analytics_events_audience_segment_identity_check
  check (
    (audience_segment_id is null and audience_segment_definition_version is null
      and audience_segment_rule_count is null)
    or (audience_segment_id ~ '^audseg_[0-9a-f]{64}$'
      and audience_segment_definition_version = 1
      and audience_segment_rule_count between 0 and 50)
  );

alter table analytics_events_partitioned
  add constraint analytics_events_workspace_fk
  foreign key (workspace_id) references workspaces(id) on delete cascade;

/*
 * Added validated, not `not valid` then validated: PostgreSQL 16 rejects a
 * NOT VALID foreign key on a partitioned table outright ("This feature is not
 * yet supported on partitioned tables"). The scan is a formality anyway — the
 * rows came from a table that already enforced this — and the table is under an
 * exclusive lock for the rewrite regardless.
 */
alter table analytics_events_partitioned
  add constraint analytics_events_publication_identity_fk
  foreign key (workspace_id, environment_id, document_id, publication_id, content_hash)
  references publications(workspace_id, environment_id, document_id, id, content_hash)
  on delete restrict;

/*
 * RLS does not survive a rebuild. Without this the partitioned table is open:
 * `0000` enabled and forced row security on `analytics_events` and created both
 * policies, and a `create table` starts with none of that.
 */
alter table analytics_events_partitioned enable row level security;
alter table analytics_events_partitioned force row level security;

create policy analytics_events_workspace_isolation on analytics_events_partitioned
  for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));

create policy analytics_events_workspace_insert on analytics_events_partitioned
  for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

/*
 * And on every partition individually. A policy on the parent covers queries
 * that go through the parent, which is all the application does — but a
 * partition reached by its own name uses its own policies, and it has none by
 * default. Anything holding SELECT on the partitions would read every tenant.
 */
do $$
declare
  partition_name text;
begin
  for partition_name in
    select child.relname
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
     where parent.relname = 'analytics_events_partitioned'
  loop
    execute format('alter table %I enable row level security', partition_name);
    execute format('alter table %I force row level security', partition_name);
    execute format(
      'create policy analytics_events_workspace_isolation on %I for select '
      'using (workspace_id = current_setting(''lodariq.workspace_id'', true))',
      partition_name
    );
    execute format(
      'create policy analytics_events_workspace_insert on %I for insert '
      'with check (workspace_id = current_setting(''lodariq.workspace_id'', true))',
      partition_name
    );
  end loop;
end
$$;

alter table analytics_events rename to analytics_events_pre_partition;
alter table analytics_events_partitioned rename to analytics_events;
/* The old table keeps `analytics_events_pkey` until the rename frees the name. */
alter index analytics_events_pkey rename to analytics_events_pre_partition_pkey;
alter index analytics_events_partitioned_pkey rename to analytics_events_pkey;

commit;

/*
 * `analytics_events_pre_partition` is left in place deliberately. Drop it only
 * after the application has been observed reading and writing the partitioned
 * table:
 *
 *   drop table analytics_events_pre_partition;
 *
 * Until then it is the rollback: rename it back and the previous shape returns
 * with every row.
 */
