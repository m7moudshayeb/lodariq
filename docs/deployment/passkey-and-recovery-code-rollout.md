# Passkey and recovery-code rollout

Use this runbook for Phase 7. It does not authorize migration of a shared
environment or enable passkeys without real-device validation.

## Before deployment

1. Back up the target database and record retention for passkey metadata,
   recovery-code sets, and account-security events.
2. Apply `0011_assurance_passkeys_recovery.sql` with the owner migration role,
   then reprovision the restricted runtime role and run the live RLS verifier.
3. Set `LODARIQ_WEBAUTHN_MODE=enabled`. Set
   `LODARIQ_WEBAUTHN_ORIGIN` to the exact dashboard HTTPS origin and
   `LODARIQ_WEBAUTHN_RP_ID` to that origin's host. Do not use a broad parent RP
   domain or the API, editor-iframe, CDN, customer, or `lodariq.com` origin.
4. Confirm the first-party authoring sign-in popup is hosted on the configured
   dashboard origin. The customer page must receive only the existing
   source/state-bound opaque session exchange, never WebAuthn data.
5. Run schema-negative, API, dashboard, migration, in-memory repository, and
   restricted PostgreSQL 16 assurance suites. Confirm runtime logs redact cookies
   and authorization headers and contain no challenge, response, recovery code,
   public-key bytes, or raw credential identifier.

## Staged validation

- Register platform and roaming authenticators in each supported browser. Verify
  cancellation, retry, duplicate registration, user-verification refusal, and a
  five-minute expired challenge all fail safely.
- Sign in and step up with each passkey. Replay the assertion and force a stale
  counter update; both must fail without consuming a valid concurrent attempt.
- Open the creator flow from a customer staging origin. Confirm authentication
  stays in the top-level first-party popup and returns the same opaque Lodariq
  session/tenant policy as dashboard sign-in.
- Generate ten recovery codes, capture the one-time display, confirm one, and
  use it once. Verify replay fails, the remaining count decreases, and a new set
  or password change invalidates every prior code.
- Select an AAL2 workspace with an AAL1 password/recovery session and confirm a
  fail-closed response. Repeat with a recent AAL2 passkey session and confirm
  admission without losing the assurance facts during rotation.

## Rollback

Set `LODARIQ_WEBAUTHN_MODE=disabled` and deploy the preceding application. Leave
the additive tables and public credentials intact; do not drop recovery or audit
rows during an incident. Password and confirmed recovery-code paths remain
available according to workspace policy. Re-enable only after origin/RP settings
and browser evidence are reconciled.

## Evidence boundary

Repository tests prove contract, replay, atomicity, and policy behavior. A
skipped-unless-configured PostgreSQL 16 suite proves ordered migrations and
forced-RLS behavior in CI. Production availability additionally requires
approved Neon migration/role evidence, real authenticators, hosted popup and
dashboard smoke checks, and operator sign-off.
