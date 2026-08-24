begin;

/*
 * M9 + L7. Three cross-references carried as bare `text` while every other one
 * on this branch is a composite scope FK. Nothing leaks through them today —
 * theme reads go through `findWorkspaceTheme(tx, workspaceId, themeId)` — but
 * they let a workspace persist a pointer into another workspace's rows, which
 * is a dangling cross-tenant reference waiting for the first reader that trusts
 * the id alone.
 *
 * Each constraint is added `not valid` and then validated in this transaction.
 * The lock is retained until commit, so concurrent writes can block for the
 * duration; `not valid` is not an online-safety mechanism here. Keeping all
 * validation in the transaction makes the rollout atomic: a bad historical
 * reference rolls the whole migration back instead of leaving the shared
 * environment with a permanently half-enforced invariant.
 *
 * The delete actions name only the nullable reference column. Bare
 * `on delete set null` on a composite key would also try to null workspace_id,
 * which is non-nullable and would make referenced theme/environment deletion
 * fail at runtime.
 */

alter table workspace_applications
  add constraint workspace_applications_theme_scope_fk
  foreign key (workspace_id, theme_id)
  references themes(workspace_id, id)
  on delete set null (theme_id)
  not valid;

alter table governance_audit_events
  add constraint governance_audit_events_environment_scope_fk
  foreign key (workspace_id, environment_id)
  references environments(workspace_id, id)
  on delete set null (environment_id)
  not valid;

alter table tenant_audit_events
  add constraint tenant_audit_events_environment_scope_fk
  foreign key (workspace_id, environment_id)
  references environments(workspace_id, id)
  on delete set null (environment_id)
  not valid;

alter table workspace_applications
  validate constraint workspace_applications_theme_scope_fk;
alter table governance_audit_events
  validate constraint governance_audit_events_environment_scope_fk;
alter table tenant_audit_events
  validate constraint tenant_audit_events_environment_scope_fk;

commit;
