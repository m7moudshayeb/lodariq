# 0011. Tenant isolation with workspaceId + RLS

- Status: Accepted
- PRD references: §11.2, §20

## Context

Application-level workspace filters can be forgotten in agent-generated query
code, leaking data across tenants.

## Decision

Every multi-tenant row carries a `workspaceId` column with application-level
scoping through Drizzle, backed by PostgreSQL row-level security as
defense-in-depth. The RLS model is decided during the schema phase, not after.
CI flags `DROP`, destructive `ALTER`, and column-type changes for explicit human
sign-off before they can target a shared environment.

The application uses two database scopes:

- Workspace scope: authenticated control-plane and resolved SDK requests run in a
  transaction that sets `lodariq.workspace_id`. Tenant tables force RLS and only
  allow rows whose `workspace_id` matches that setting.
- Environment-token lookup scope: SDK bootstrap starts with only a bearer token
  hash, before the workspace is known. That lookup runs in a transaction that
  sets `lodariq.environment_token_hash` and exposes only the matching
  `environment_tokens` row and its `environments` row. It does not expose
  `workspaces`, documents, versions, artifacts, publications, authoring sessions,
  or events. Once the token resolves, all document/artifact access uses the
  resolved `workspaceId` and `environmentId` through normal repository methods.

Production and shared staging runtimes must use a SQL-provisioned non-owner
role with `BYPASSRLS` disabled. Owner/admin URLs are allowed only for migrations
and role provisioning.

## Consequences

- A missing workspace filter cannot leak data across tenants.
- Token lookup can resolve a workspace from a token hash without becoming a
  general tenant-read bypass.
- Neon database branching is used per-PR so migrations/fixtures don't corrupt
  shared data.
- `pnpm rls:verify:live` must pass against the runtime role before a shared
  environment is considered ready for API traffic.
