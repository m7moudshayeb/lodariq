# 0022. Account and session security lifecycle

- Status: Accepted
- PRD references: §20
- Plan: `docs/plans/authentication-identity-and-tenant-hardening.md`, Phase 6

## Context

An authenticated user needs to change credentials, review sessions, recover an
identifier, export data, and retire an account without an operator editing the
database. Those operations are more sensitive than ordinary authenticated
requests. A partial update can leave a recovery credential usable, a stale
session active, or a security event missing. A cosmetic “Remember me” control
would also misrepresent the server-side lifetime of an opaque session.

## Decision

Account-security mutations require a valid opaque Lodariq session, an exact
same-origin BFF mutation, and recent authentication. Password-backed operations
also recheck the current Argon2id credential inside the same transaction as the
mutation. Password change rotates to a new session while revoking all previous
sessions, password-recovery challenges, pending recovery mail, and email-change
proofs. Single-session and all-session revocation append their durable security
event in the revocation transaction.

Email change is a server-owned, expiring state machine with two independently
derived and hash-stored proofs. One proof is delivered to the current verified
address and the other to the candidate address. Both single-use proofs are
required. Completion rechecks uniqueness, changes the primary verified address,
terminalizes stale recovery delivery, and revokes other sessions. Email secrets
remain URL fragments, are removed from history before feedback renders, and are
never persisted in browser storage or application logs.

Opaque sessions have explicit server-side duration policies. Standard sessions
use a session cookie, a 12-hour idle limit, and a 24-hour absolute limit.
Remembered sessions use a persistent cookie, a 7-day idle limit, and a 30-day
absolute limit. Managed-workspace policy may shorten those limits. Device labels
are coarse user-agent classifications; IP addresses are not stored as account
device metadata.

Deletion is soft for 30 days and immediately revokes sessions, authoring grants,
recovery material, and pending account mail. A database function performs the
final-owner guard and deletion transition atomically under forced RLS. The
function is revoked from `PUBLIC` and granted only to the provisioned runtime
role. Bounded lifecycle maintenance hard-deletes expired accounts. Exports omit
credential hashes, session tokens, token hashes, rate-limit data, and audit
implementation details.

## Consequences

- Username remains an optional private login identifier; verified email always
  works, so identifier recovery does not create an account-enumeration endpoint.
- A linked authentication method cannot be removed if it is the final usable
  method. Successful unlinking revokes sessions bound to that method.
- Ownership transfer and workspace/account deletion require a recent session.
- Migration and rollback are additive. Shared-environment execution requires
  human approval, a backup decision, runtime-function reprovisioning, and live
  smoke evidence; this worktree does not claim those external steps.
