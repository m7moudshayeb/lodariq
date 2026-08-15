# Account and session management rollout

Use this runbook for Phase 6. It does not authorize a shared-environment
migration or destructive account cleanup.

## Before deployment

1. Back up the target database and record the retention decision for soft-deleted
   accounts and account-security events.
2. Apply `0010_account_session_management.sql` with the owner migration role.
3. Re-run `pnpm db:provision-runtime-role` with explicit provisioning consent so
   the runtime receives only the reviewed account-deletion function signature.
4. Run migration safety, restricted PostgreSQL 16 account tests, and the live RLS
   verifier. Confirm `PUBLIC` cannot execute any security-definer function.
5. Keep the active and retained authentication email HMAC keys available. The
   email-change outbox uses the same bounded worker and key-id rotation contract.

## Staged validation

- Sign in once without Remember me and once with it. Confirm the first cookie has
  no `Expires`/`Max-Age`, the second does, and the server records `standard` and
  `remembered` policies with their respective idle and absolute limits.
- Change a password and prove every old session and outstanding reset link fails.
- Change an email by opening both purpose-bound links in either order. Prove
  replay, collision, superseded, and expired links fail without revealing which
  address exists.
- Revoke one other session, then sign out everywhere. Confirm durable
  `session_revoked` and `sessions_revoked_all` events contain identifiers but no
  tokens, IP addresses, raw user agents, or passwords.
- Export an account and inspect the response for credential/session/token
  material. Schedule deletion for a non-final owner and prove all normal and
  authoring access stops immediately.

## Rollback

Deploy the preceding application while leaving additive tables, columns, and
events intact. Do not drop account rows or functions during an incident. Stop the
lifecycle worker if retention behavior is under investigation. Restore forward
application compatibility, reconcile email outbox state by opaque outbox id, and
only remove additive schema in a separately reviewed migration after the rollback
window.

## Evidence boundary

Local contract, UI, repository, migration, and restricted PostgreSQL tests are
valid engineering evidence. Fly deployment, Neon role provisioning, Resend
acceptance/receipt, and a real-browser hosted smoke check require operator
approval and must be attached before the capability is described as live.
