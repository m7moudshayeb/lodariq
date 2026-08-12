# 0011. Tenant isolation with workspaceId + RLS

- Status: Accepted
- PRD references: §11.2, §20
- Related: ADR 0015, ADR 0017

## Context

Application-level workspace filters can be forgotten in agent-generated query
code, leaking data across tenants.

## Decision

Every multi-tenant row carries a `workspaceId` column with application-level
scoping through Drizzle, backed by PostgreSQL row-level security as
defense-in-depth. The RLS model is decided during the schema phase, not after.
CI flags `DROP`, destructive `ALTER`, and column-type changes for explicit human
sign-off before they can target a shared environment.

The application uses one workspace scope and two narrowly constrained bootstrap
lookup scopes during migration:

- Workspace scope: authenticated control-plane and resolved SDK requests run in a
  transaction that sets `lodariq.workspace_id`. Tenant tables force RLS and only
  allow rows whose `workspace_id` matches that setting.
- Public-installation resolution scope: under ADR 0015's accepted target, SDK
  bootstrap starts with a non-secret public installation ID and exact request
  origin. The narrow lookup exposes only the matching installation and
  origin-to-environment mapping. The public ID alone cannot read tenant data.
  Once the exact origin resolves one environment, all delivery and authoring-
  authorization access uses the resolved `workspaceId` and `environmentId`
  through normal workspace-scoped repository methods.
- Environment-token migration lookup scope: the current SDK bootstrap starts
  with a bearer-token hash before the workspace is known. That lookup runs in a
  transaction that sets `lodariq.environment_token_hash` and exposes only the
  matching `environment_tokens` row and its `environments` row. It does not
  expose `workspaces`, documents, versions, artifacts, publications, authoring
  sessions, authoring authorization requests/codes, or events. This lookup is a
  compatibility path, not the canonical ADR 0015 installation model.
- Owned-auth bootstrap scopes: before a workspace is selected, credential lookup,
  session lookup, email-verification/set-password consumption, recovery email
  lookup, outbox worker leasing, and rate-limit access use separate narrowly
  bound transaction settings for the exact email/hash, session hash,
  purpose-specific challenge/token hash, auth user, worker scope, or rate bucket.
  They do not open a general tenant scope. Ambiguous normalized legacy email
  matches fail closed. Once a session selects a workspace, control-plane reads
  and writes use the membership-backed `lodariq.workspace_id` scope. Workspace
  selection rotates the opaque session token.

ADR 0015 bootstrap grants, authoring authorization requests/codes, activation
grants, and document sessions must be workspace-scoped RLS records. Raw grants,
codes, and session bearers are never stored; code consumption, grant issue, and
session creation run atomically inside the resolved workspace transaction and
retain exact environment, document where applicable, origin, creator, and
capability scope.

Production and shared staging runtimes must use a SQL-provisioned non-owner
role with `BYPASSRLS` disabled. Owner/admin URLs are allowed only for migrations
and role provisioning.

## Consequences

- A missing workspace filter cannot leak data across tenants.
- Public-installation lookup can resolve exactly one origin/environment without
  making the public ID a tenant-read credential.
- The environment-token migration lookup can resolve a workspace from a token
  hash without becoming a general tenant-read bypass.
- A one-time authoring code cannot be consumed across a workspace boundary or
  through either pre-workspace bootstrap lookup scope.
- A password lookup, auth-session token, verification/reset challenge, outbox
  worker lease, or rate-limit bucket cannot be reused as a workspace-wide read
  scope or across auth purposes.
- Neon database branching is used per-PR so migrations/fixtures don't corrupt
  shared data.
- `pnpm rls:verify:live` must pass against the runtime role before a shared
  environment is considered ready for API traffic.
