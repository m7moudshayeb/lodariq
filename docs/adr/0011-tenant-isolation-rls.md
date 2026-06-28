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

## Consequences

- A missing workspace filter cannot leak data across tenants.
- Neon database branching is used per-PR so migrations/fixtures don't corrupt
  shared data.
