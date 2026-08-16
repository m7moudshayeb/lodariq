# Resumable identity onboarding rollout

Migration `0008_resumable_identity_onboarding.sql` is an additive expand step.
Do not apply it to a shared database without explicit approval, a current backup
and retention decision, and the API release that writes the new state.

## Preflight and deployment order

1. Confirm `0007_provider_neutral_identity.sql` is applied and its restricted-role
   verification passed.
2. Apply `0008` with an owner connection and `ON_ERROR_STOP=1`.
3. Re-run runtime-role provisioning so `auth_security_events` has no `UPDATE` or
   `DELETE` privilege.
4. Run the live RLS verifier on an isolated branch.
5. Deploy the API, then the dashboard BFF. Exercise signup and confirm no workspace
   exists before verification, one exists after verification, and retry is
   idempotent.

The migration does not backfill onboarding for established users. Existing users
already have destinations; only new registration writes an active intent.

## Rollback rehearsal

Roll the application back without dropping `identity_onboarding_states`,
`auth_security_events`, or `auth_identities.disabled_at`. The preceding release
ignores the additive objects. Do not delete audit rows or re-enable a soft-disabled
identity as a rollback shortcut. If registrations occurred during the rollout,
stop new signup writes before rollback and retain their onboarding rows for the
forward fix.

## Evidence required before shared deployment

- additive migration safety guard;
- fresh-baseline and ordered-migration application;
- restricted PostgreSQL tests for registration, verification transition,
  idempotent completion, RLS isolation, link/unlink, final-method rejection, and
  append-only security history;
- dashboard and first-party popup evidence that both use the common auth flow;
- a privacy review confirming logs and events contain identifiers/correlation ids,
  not raw tokens, provider credentials, password material, or unnecessary PII.
