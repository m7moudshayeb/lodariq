begin;

alter table analytics_events
  add column if not exists adaptive_visitor_key_hash text;
do $$
begin
  if not exists(
    select 1 from pg_constraint where conname = 'analytics_events_adaptive_visitor_hash_check'
  ) then
    alter table analytics_events
      add constraint analytics_events_adaptive_visitor_hash_check check(
        adaptive_visitor_key_hash is null or adaptive_visitor_key_hash ~ '^[0-9a-f]{64}$'
      );
  end if;
end
$$;
create index if not exists analytics_events_adaptive_evidence_idx
  on analytics_events(
    workspace_id,
    environment_id,
    adaptive_visitor_key_hash,
    name,
    occurred_at
  );

commit;
