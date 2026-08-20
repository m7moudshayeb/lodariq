begin;

-- What an experience is trying to change, and whether it did. One row per
-- document so the funnel stays comparable across releases.
create table if not exists experience_measurement (
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  success_event_name text,
  success_window_days integer,
  success_label text,
  adaptive_enabled text not null default 'false',
  adaptive_minimum_occurrences integer not null default 2,
  adaptive_lookback_days integer not null default 30,
  updated_by_user_id text references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint experience_measurement_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint experience_measurement_success_event_check
    check (success_event_name is null or success_event_name ~ '^[a-z][a-z0-9_]*$'),
  constraint experience_measurement_success_window_check
    check ((success_event_name is null) = (success_window_days is null)
      and (success_window_days is null or success_window_days in (1, 7, 14, 30, 90))),
  constraint experience_measurement_success_label_check
    check (success_label is null or char_length(success_label) between 1 and 120),
  constraint experience_measurement_adaptive_enabled_check
    check (adaptive_enabled in ('true', 'false')),
  constraint experience_measurement_adaptive_bounds_check
    check (adaptive_minimum_occurrences between 1 and 20
      and adaptive_lookback_days between 1 and 365)
);
create unique index if not exists experience_measurement_workspace_document_idx
  on experience_measurement(workspace_id, document_id);

-- At most one live experiment per document: a second concurrent test on the
-- same surface makes neither one readable.
create table if not exists experience_experiments (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  status text not null default 'draft',
  varies text not null,
  success_event_name text not null,
  arms jsonb not null,
  started_at timestamptz,
  stopped_at timestamptz,
  promoted_arm_id text,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_experiments_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint experience_experiments_id_check check (id ~ '^exp_[A-Za-z0-9_-]{8,}$'),
  constraint experience_experiments_status_check
    check (status in ('draft', 'running', 'stopped', 'promoted')),
  constraint experience_experiments_varies_check
    check (varies in ('copy', 'placement', 'style', 'media')),
  constraint experience_experiments_success_event_check
    check (success_event_name ~ '^[a-z][a-z0-9_]*$'),
  constraint experience_experiments_arms_check
    check (jsonb_typeof(arms) = 'array' and jsonb_array_length(arms) between 2 and 4),
  constraint experience_experiments_promotion_check
    check ((status = 'promoted') = (promoted_arm_id is not null)),
  constraint experience_experiments_promoted_arm_check
    check (promoted_arm_id is null or promoted_arm_id in ('A', 'B', 'C', 'D')),
  constraint experience_experiments_started_check
    check (status = 'draft' or started_at is not null),
  constraint experience_experiments_stopped_check
    check (status not in ('stopped', 'promoted') or stopped_at is not null)
);
create unique index if not exists experience_experiments_workspace_id_idx
  on experience_experiments(workspace_id, id);
create unique index if not exists experience_experiments_live_idx
  on experience_experiments(workspace_id, document_id)
  where status in ('draft', 'running');

-- An answer is customer text, not telemetry, so it gets its own table and its
-- own retention rather than being smuggled through an analytics payload.
create table if not exists experience_form_responses (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  document_id text not null,
  step_id text not null,
  block_id text not null,
  label text not null,
  answer text not null,
  correlation_id text,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  constraint experience_form_responses_answer_check
    check (char_length(answer) between 1 and 2000),
  constraint experience_form_responses_label_check
    check (char_length(label) between 1 and 200)
);
create unique index if not exists experience_form_responses_workspace_id_idx
  on experience_form_responses(workspace_id, id);
create index if not exists experience_form_responses_document_idx
  on experience_form_responses(workspace_id, environment_id, document_id, occurred_at);
create index if not exists experience_form_responses_block_idx
  on experience_form_responses(workspace_id, document_id, block_id);

-- Review that happens on the step instead of in a chat thread.
create table if not exists experience_comments (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  step_id text not null,
  body text not null,
  author_user_id text references users(id) on delete set null,
  author_name text not null,
  resolved_at timestamptz,
  resolved_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint experience_comments_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint experience_comments_id_check check (id ~ '^cmt_[A-Za-z0-9_-]{8,}$'),
  constraint experience_comments_body_check check (char_length(body) between 1 and 2000),
  constraint experience_comments_author_check check (char_length(author_name) between 1 and 160),
  constraint experience_comments_resolution_check
    check ((resolved_at is null) = (resolved_by_user_id is null))
);
create unique index if not exists experience_comments_workspace_id_idx
  on experience_comments(workspace_id, id);
create index if not exists experience_comments_document_created_idx
  on experience_comments(workspace_id, document_id, created_at);

-- A soft lease on one step. It expires on its own so a closed laptop never
-- blocks a colleague; the heartbeat extends it.
create table if not exists experience_step_locks (
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  step_id text not null,
  holder_user_id text not null references users(id) on delete cascade,
  holder_name text not null,
  session_id text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint experience_step_locks_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint experience_step_locks_window_check check (expires_at > acquired_at),
  constraint experience_step_locks_holder_check check (char_length(holder_name) between 1 and 160)
);
create unique index if not exists experience_step_locks_step_idx
  on experience_step_locks(workspace_id, document_id, step_id);
create index if not exists experience_step_locks_expiry_idx on experience_step_locks(expires_at);

-- One application is one brand theme plus one content library, not a hostname.
create table if not exists workspace_applications (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  origin_patterns jsonb not null,
  theme_id text,
  is_primary text not null default 'false',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_applications_workspace_id_pk primary key(workspace_id, id),
  constraint workspace_applications_id_check check (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint workspace_applications_name_check check (char_length(name) between 1 and 160),
  constraint workspace_applications_is_primary_check check (is_primary in ('true', 'false')),
  constraint workspace_applications_origins_check
    check (jsonb_typeof(origin_patterns) = 'array'
      and jsonb_array_length(origin_patterns) between 1 and 32)
);
create unique index if not exists workspace_applications_primary_idx
  on workspace_applications(workspace_id) where is_primary = 'true';

alter table experience_measurement enable row level security;
alter table experience_measurement force row level security;
alter table experience_experiments enable row level security;
alter table experience_experiments force row level security;
alter table experience_form_responses enable row level security;
alter table experience_form_responses force row level security;
alter table experience_comments enable row level security;
alter table experience_comments force row level security;
alter table experience_step_locks enable row level security;
alter table experience_step_locks force row level security;
alter table workspace_applications enable row level security;
alter table workspace_applications force row level security;

create policy experience_measurement_workspace_isolation on experience_measurement
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy experience_experiments_workspace_isolation on experience_experiments
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy experience_form_responses_workspace_isolation on experience_form_responses
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy experience_comments_workspace_isolation on experience_comments
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy experience_step_locks_workspace_isolation on experience_step_locks
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

create policy workspace_applications_workspace_isolation on workspace_applications
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
