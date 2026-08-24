begin;

alter table analytics_events
  add column if not exists experiment_id text,
  add column if not exists experiment_arm_id text,
  add column if not exists experiment_allocation_revision integer;
alter table analytics_events
  add constraint analytics_events_experiment_identity_check check(
    (
      experiment_id is null and
      experiment_arm_id is null and
      experiment_allocation_revision is null
    ) or (
      experiment_id is not null and
      experiment_arm_id in ('A', 'B', 'C', 'D') and
      experiment_allocation_revision >= 1
    )
  );
create index analytics_events_experiment_occurred_idx
  on analytics_events(workspace_id, environment_id, experiment_id, occurred_at);

alter table experience_experiments
  add column if not exists allocation_revision integer not null default 1,
  add column if not exists variation_kind text;
alter table experience_experiments
  add constraint experience_experiments_allocation_revision_check
  check(allocation_revision >= 1);
alter table experience_experiments
  add constraint experience_experiments_variation_kind_check
  check(variation_kind is null or variation_kind in ('copy', 'placement', 'style', 'conditions', 'media'));

create table experience_experiment_allocations (
  workspace_id text not null references workspaces(id) on delete cascade,
  experiment_id text not null,
  revision integer not null,
  arms jsonb not null,
  created_at timestamptz not null default now(),
  constraint experience_experiment_allocations_workspace_experiment_revision_pk
    primary key(workspace_id, experiment_id, revision),
  constraint experience_experiment_allocations_experiment_scope_fk
    foreign key(workspace_id, experiment_id)
    references experience_experiments(workspace_id, id) on delete cascade,
  constraint experience_experiment_allocations_revision_check check(revision >= 1),
  constraint experience_experiment_allocations_arms_check check(
    jsonb_typeof(arms) = 'array' and jsonb_array_length(arms) between 2 and 4
  )
);

insert into experience_experiment_allocations(workspace_id, experiment_id, revision, arms, created_at)
select workspace_id, id, allocation_revision, arms, created_at
from experience_experiments
on conflict do nothing;

create table experience_experiment_assignments (
  workspace_id text not null references workspaces(id) on delete cascade,
  environment_id text not null,
  experiment_id text not null,
  assignment_key_hash text not null,
  arm_id text not null,
  allocation_revision integer not null,
  created_at timestamptz not null default now(),
  constraint experience_experiment_assignments_identity_pk
    primary key(workspace_id, environment_id, experiment_id, assignment_key_hash),
  constraint experience_experiment_assignments_environment_scope_fk
    foreign key(workspace_id, environment_id)
    references environments(workspace_id, id) on delete cascade,
  constraint experience_experiment_assignments_allocation_scope_fk
    foreign key(workspace_id, experiment_id, allocation_revision)
    references experience_experiment_allocations(workspace_id, experiment_id, revision)
    on delete cascade,
  constraint experience_experiment_assignments_hash_check
    check(assignment_key_hash ~ '^[0-9a-f]{64}$'),
  constraint experience_experiment_assignments_arm_check check(arm_id in ('A', 'B', 'C', 'D')),
  constraint experience_experiment_assignments_allocation_revision_check
    check(allocation_revision >= 1)
);
create index experience_experiment_assignments_experiment_idx
  on experience_experiment_assignments(workspace_id, environment_id, experiment_id, created_at);

alter table experience_experiment_allocations enable row level security;
alter table experience_experiment_allocations force row level security;
alter table experience_experiment_assignments enable row level security;
alter table experience_experiment_assignments force row level security;

create policy experience_experiment_allocations_workspace_isolation on experience_experiment_allocations
  using(workspace_id = current_setting('lodariq.workspace_id', true))
  with check(workspace_id = current_setting('lodariq.workspace_id', true));
create policy experience_experiment_assignments_workspace_isolation on experience_experiment_assignments
  using(workspace_id = current_setting('lodariq.workspace_id', true))
  with check(workspace_id = current_setting('lodariq.workspace_id', true));

commit;
