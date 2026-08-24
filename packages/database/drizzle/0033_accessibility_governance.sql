begin;

create table if not exists accessibility_sweeps (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  status text not null,
  requested_by_user_id text not null references users(id) on delete restrict,
  document_count integer not null,
  locale_count integer not null,
  blocker_count integer not null,
  warning_count integer not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  constraint accessibility_sweeps_id_check check (id ~ '^a11ysweep_[A-Za-z0-9_-]{20,}$'),
  constraint accessibility_sweeps_status_check check (status = 'completed'),
  constraint accessibility_sweeps_counts_check check (
    document_count >= 0 and locale_count >= 0 and blocker_count >= 0 and warning_count >= 0
  ),
  constraint accessibility_sweeps_time_check check (completed_at >= started_at)
);
create unique index if not exists accessibility_sweeps_workspace_id_idx
  on accessibility_sweeps(workspace_id, id);
create index if not exists accessibility_sweeps_workspace_time_idx
  on accessibility_sweeps(workspace_id, completed_at);

create table if not exists accessibility_findings (
  id text primary key,
  workspace_id text not null,
  sweep_id text not null,
  document_id text not null,
  document_version_id text not null,
  artifact_id text,
  content_hash text,
  code text not null,
  severity text not null,
  status text not null,
  locale text not null,
  step_id text,
  node_id text,
  measured_ratio numeric(5,2),
  required_ratio numeric(5,2),
  revision integer not null default 1,
  resolved_by_user_id text references users(id) on delete restrict,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null,
  constraint accessibility_findings_sweep_scope_fk
    foreign key(workspace_id, sweep_id)
    references accessibility_sweeps(workspace_id, id) on delete cascade,
  constraint accessibility_findings_document_version_scope_fk
    foreign key(workspace_id, document_id, document_version_id)
    references document_versions(workspace_id, document_id, id) on delete restrict,
  constraint accessibility_findings_id_check
    check (id ~ '^a11yfinding_[A-Za-z0-9_-]{20,}$'),
  constraint accessibility_findings_hash_check
    check (content_hash is null or content_hash ~ '^sha256-[0-9a-f]{64}$'),
  constraint accessibility_findings_code_check check (
    code in (
      'artifact_unavailable','contrast_unusable','contrast_below_target',
      'missing_accessible_name','missing_captions','compact_viewport_risk','long_copy_risk'
    )
  ),
  constraint accessibility_findings_severity_check check (severity in ('warning','blocker')),
  constraint accessibility_findings_status_check check (status in ('open','resolved')),
  constraint accessibility_findings_locale_check check (char_length(btrim(locale)) between 1 and 64),
  constraint accessibility_findings_revision_check check (revision >= 1),
  constraint accessibility_findings_resolution_check check (
    (
      status = 'open' and resolved_by_user_id is null and
      resolution_note is null and resolved_at is null
    ) or (
      status = 'resolved' and resolved_by_user_id is not null and
      char_length(btrim(resolution_note)) between 1 and 500 and resolved_at is not null
    )
  )
);
create unique index if not exists accessibility_findings_workspace_id_idx
  on accessibility_findings(workspace_id, id);
create index if not exists accessibility_findings_release_gate_idx
  on accessibility_findings(workspace_id, document_version_id, status, severity);
create index if not exists accessibility_findings_sweep_idx
  on accessibility_findings(workspace_id, sweep_id, created_at);

create table if not exists accessibility_finding_events (
  id text primary key,
  workspace_id text not null,
  finding_id text not null,
  event_type text not null,
  actor_user_id text not null references users(id) on delete restrict,
  finding_revision integer not null,
  occurred_at timestamptz not null,
  constraint accessibility_finding_events_finding_scope_fk
    foreign key(workspace_id, finding_id)
    references accessibility_findings(workspace_id, id) on delete cascade,
  constraint accessibility_finding_events_id_check
    check (id ~ '^a11yevent_[A-Za-z0-9_-]{20,}$'),
  constraint accessibility_finding_events_type_check check (event_type in ('opened','resolved')),
  constraint accessibility_finding_events_revision_check check (finding_revision >= 1)
);
create index if not exists accessibility_finding_events_finding_time_idx
  on accessibility_finding_events(workspace_id, finding_id, occurred_at);

alter table accessibility_sweeps enable row level security;
alter table accessibility_sweeps force row level security;
create policy accessibility_sweeps_workspace_isolation
  on accessibility_sweeps
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table accessibility_findings enable row level security;
alter table accessibility_findings force row level security;
create policy accessibility_findings_workspace_isolation
  on accessibility_findings
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

alter table accessibility_finding_events enable row level security;
alter table accessibility_finding_events force row level security;
create policy accessibility_finding_events_workspace_select
  on accessibility_finding_events for select
  using (workspace_id = current_setting('lodariq.workspace_id', true));
create policy accessibility_finding_events_workspace_insert
  on accessibility_finding_events for insert
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
