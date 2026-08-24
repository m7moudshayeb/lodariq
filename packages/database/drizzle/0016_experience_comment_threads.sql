begin;

/*
 * Reviewed after the fact, on 2026-08-24.
 *
 * This migration was applied to development and staging without the sign-off
 * the policy requires, because the guard could not see the drop below: it
 * stripped quoted strings before comments, so the apostrophe in "the root's
 * semantic anchor" opened a phantom string literal that blanked the statement.
 * The guard is fixed; this note records the review that should have happened.
 *
 * The change is safe and stays applied. The drop is immediately followed by the
 * re-add with a wider predicate, both inside this one transaction, so the
 * constraint is never absent to any other session. Nothing else in the file is
 * destructive: no dropped column or table, no delete, no truncate.
 */

-- lodariq-shared-env-destructive-migration-signoff: Mahmoud Shayeb / 2026-08-24 / retrospective review, already applied to development and staging

-- Existing comments become thread roots. Replies reuse the same immutable
-- message table and inherit the root's semantic anchor.
alter table experience_comments add column if not exists target_id text;
alter table experience_comments add column if not exists parent_comment_id text;

alter table experience_comments
  add constraint experience_comments_parent_scope_fk
  foreign key(workspace_id, parent_comment_id)
  references experience_comments(workspace_id, id) on delete cascade;

alter table experience_comments
  add constraint experience_comments_target_check
  check (target_id is null or char_length(target_id) between 1 and 128);

alter table experience_comments
  add constraint experience_comments_parent_check
  check (parent_comment_id is null or parent_comment_id <> id);

alter table experience_comments drop constraint experience_comments_resolution_check;
alter table experience_comments
  add constraint experience_comments_resolution_check
  check (((resolved_at is null) = (resolved_by_user_id is null))
    and (parent_comment_id is null
      or (resolved_at is null and resolved_by_user_id is null)));

create index if not exists experience_comments_thread_created_idx
  on experience_comments(workspace_id, parent_comment_id, created_at);

create table if not exists experience_comment_audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null,
  thread_id text not null,
  comment_id text not null,
  event_type text not null,
  actor_user_id text not null,
  occurred_at timestamptz not null default now(),
  constraint experience_comment_audit_events_document_scope_fk
    foreign key(workspace_id, document_id)
    references documents(workspace_id, id) on delete cascade,
  constraint experience_comment_audit_events_thread_scope_fk
    foreign key(workspace_id, thread_id)
    references experience_comments(workspace_id, id) on delete cascade,
  constraint experience_comment_audit_events_comment_scope_fk
    foreign key(workspace_id, comment_id)
    references experience_comments(workspace_id, id) on delete cascade,
  constraint experience_comment_audit_events_id_check
    check (id ~ '^cmtaud_[A-Za-z0-9_-]{8,}$'),
  constraint experience_comment_audit_events_type_check
    check (event_type in ('thread_created','reply_added','thread_resolved','thread_reopened'))
);

create unique index if not exists experience_comment_audit_events_workspace_id_idx
  on experience_comment_audit_events(workspace_id, id);
create index if not exists experience_comment_audit_events_document_time_idx
  on experience_comment_audit_events(workspace_id, document_id, occurred_at);

alter table experience_comment_audit_events enable row level security;
alter table experience_comment_audit_events force row level security;

create policy experience_comment_audit_events_workspace_isolation on experience_comment_audit_events
  using (workspace_id = current_setting('lodariq.workspace_id', true))
  with check (workspace_id = current_setting('lodariq.workspace_id', true));

commit;
