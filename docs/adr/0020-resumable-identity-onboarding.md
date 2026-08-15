# 0020. Server-owned resumable identity onboarding

- Status: Accepted
- PRD references: §20
- Plan: `docs/plans/authentication-identity-and-tenant-hardening.md`, Phase 4

## Context

The original signup transaction created a user, password credential, workspace,
owner membership, environments, verification challenge, and email outbox row at
once. That made password signup the account model and left an unverified identity
owning tenant resources. Provider cancellation, invitation acceptance, retries,
and future passkey or SSO enrollment could not safely reuse that transaction.

## Decision

Identity establishment and tenant onboarding are separate state transitions.
Registration atomically creates the Lodariq user, primary email, authentication
identity, pending credential, verification challenge, outbox row, and one
server-owned onboarding intent. It does not create a workspace or membership.

Verification advances `pending_identity` to `pending_destination`. A repository
transaction then resolves the stored intent and atomically creates the workspace,
default auth policy, owner membership, and required environments. Completion is
versioned and idempotent. The pre-verification expiry prevents stale identity
proof; a verified `pending_destination` remains resumable so a transient failure
cannot permanently strand the account.

Dashboard sign-in and the top-level authoring popup use the same owned-auth route,
opaque Lodariq session, and onboarding transition. Clients may read a bounded
snapshot but cannot supply workspace names, roles, completion status, or other
authorization state.

Provider identities may be linked only through an already authenticated session
or an explicit strong-recovery flow. Email equality is never sufficient. Linking
uses the stable provider issuer and subject; unlinking soft-disables the identity,
serializes concurrent changes, rejects removal of the final usable method, revokes
live sessions, and appends an immutable security event.

## Consequences

- `identity_onboarding_states` is user-scoped with forced RLS and at most one
  active intent per user.
- `auth_security_events` is append-only for the runtime role; there are no update
  or delete policies.
- Existing coupled account creation remains temporarily available only as an
  expand-window compatibility method. New public signup uses registration plus
  onboarding.
- Invitation and access-request intents share the contract but become issuable
  only with the capability-checked tenant APIs in Phase 5.
- Rollback means deploying the preceding application while preserving additive
  tables and columns. It never means deleting onboarding or audit history.
