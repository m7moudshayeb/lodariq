alter table publications
  add column if not exists correlation_id text;

create index if not exists publications_correlation_idx
  on publications(correlation_id);

alter table authoring_sessions
  add column if not exists correlation_id text;

create index if not exists authoring_sessions_correlation_idx
  on authoring_sessions(correlation_id);
