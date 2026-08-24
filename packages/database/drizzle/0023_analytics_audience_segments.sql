alter table analytics_events
  add column if not exists audience_segment_id text,
  add column if not exists audience_segment_definition_version integer,
  add column if not exists audience_segment_rule_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analytics_events_audience_segment_identity_check'
  ) then
    alter table analytics_events
      add constraint analytics_events_audience_segment_identity_check check(
        (
          audience_segment_id is null and
          audience_segment_definition_version is null and
          audience_segment_rule_count is null
        ) or (
          audience_segment_id ~ '^audseg_[0-9a-f]{64}$' and
          audience_segment_definition_version = 1 and
          audience_segment_rule_count between 0 and 50
        )
      );
  end if;
end
$$;

create index if not exists analytics_events_audience_segment_occurred_idx
  on analytics_events(
    workspace_id,
    environment_id,
    document_id,
    audience_segment_id,
    occurred_at
  );
