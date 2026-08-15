# 0021. Authoritative tenant administration and invitation delivery

- Status: Accepted
- PRD references: §20
- Plan: `docs/plans/authentication-identity-and-tenant-hardening.md`, Phase 5

## Context

Lodariq already isolated control-plane data by workspace, but its owned-auth
lifecycle could only create and select a workspace. There was no complete tenant
lifecycle for inviting a member, changing access, transferring ownership, or
retiring a workspace. Adding those mutations only at the API layer would leave
browser claims, stale sessions, and permissive database access as alternate
authorization paths.

Workspace invitations are also credentials. Returning an invitation secret to
the inviting administrator's browser would unnecessarily expose it to the DOM,
extensions, screenshots, and client telemetry, while direct provider sends would
lose the retry, reconciliation, and idempotency guarantees of the auth outbox.

## Decision

Tenant administration resolves the actor's current membership from PostgreSQL
inside a workspace-and-user-scoped transaction. A centralized role/capability
matrix defines the application policy; forced RLS independently constrains the
same reads and mutations. Browser-supplied workspace or role claims never grant
tenant access.

Invitations use a deterministic HMAC-derived raw token so the leased email worker
can reconstruct it from a versioned key while persistence stores only SHA-256.
Invitation, outbox, and append-only audit rows are inserted atomically. The raw
token is placed only in the email URL fragment and held in browser memory after
receipt. Production issuance never returns it to the administrator. Acceptance
requires an authenticated user whose verified primary email matches the invite,
and atomically consumes the invitation while creating membership. Direct
invitation updates are denied by RLS. The single-use transition is performed by
a narrow `SECURITY DEFINER` function that binds the candidate user and token
digest to transaction-local settings, rechecks the verified primary email and
both application and database clocks, and updates only `accepted_at`. Any failed
transition rolls back membership creation and audit insertion with it.

Owner/admin/member/viewer capabilities are explicit. Administrators cannot
manage owners or other administrators. The final owner cannot be removed or
demoted, and ownership transfer is a separate operation. Membership removal or
material downgrade immediately revokes affected Lodariq sessions, authoring
activation grants, and authoring sessions. Workspace deletion is soft, revokes
workspace access immediately, and retains the tenant for 30 days. Active owned
workspace creation is capped at five per user.

Tenant audit history is append-only for the runtime role. Events cover invitation
issuance/revocation/acceptance, role changes, removals, ownership transfer, and
deletion scheduling/cancellation. It contains identifiers and role transitions,
not raw tokens, session credentials, or unnecessary email data.

## Consequences

- `workspace_invitation_outbox` participates in the same bounded lease, retry,
  terminal-failure, delivery-status, and cleanup lifecycle as other auth email.
- Pending invitations can be listed without exposing token hashes or delivery
  payloads; revocation terminalizes an unsent message.
- Every tenant table forces RLS, and restricted-role tests exercise owner, admin,
  member, viewer, removed, and cross-workspace behavior rather than only checking
  policy names.
- Rollback deploys the preceding application while preserving additive columns,
  invitations, outbox rows, and audit history. Shared migration execution still
  requires explicit approval and a retention/backup decision.
