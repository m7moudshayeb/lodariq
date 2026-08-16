# Tenant administration rollout

Migration `0009_tenant_administration.sql` is an additive expand step. Do not
apply it to a shared database without explicit human approval, a current backup,
and confirmation of the 30-day workspace-deletion retention policy.

## Preflight and deployment order

1. Confirm migrations `0005` through `0008` and their restricted-role checks
   passed in order.
2. Confirm the active auth-email token key remains available for at least the
   seven-day invitation lifetime. Removing a key early makes its queued or
   outstanding invitations unusable by design.
3. Apply `0009` with an owner connection and `ON_ERROR_STOP=1`.
4. Re-run runtime-role provisioning. Confirm `tenant_audit_events` has no
   `UPDATE` or `DELETE` privilege and all tenant/outbox tables force RLS.
5. Run the live RLS verifier on an isolated database branch.
6. Deploy API before dashboard. Confirm the auth-email worker is running, then
   deploy the members UI and invitation acceptance page.

## Smoke evidence

- Owner and admin can list members; member/viewer can read but cannot mutate.
- Admin can invite member/viewer but cannot invite or manage an admin.
- Invitation creation writes one invitation, one outbox row, and one audit row;
  the API response in production contains no raw token.
- Resend accepts the invitation message. The URL contains the invitation id in
  the query and the secret only in the fragment.
- A signed-in matching verified email accepts once; replay, wrong email,
  expiration, revocation, removed member, and cross-workspace use fail closed.
- Role downgrade/removal revokes affected normal and authoring sessions.
- Ownership transfer preserves one owner and records immutable history.
- Scheduling deletion removes the workspace from session/workspace discovery and
  exposes the documented retention deadline; cancellation restores it only via
  an authorized owner path.

## Rollback rehearsal

Roll back application code without dropping the new columns, outbox table, or
audit ledger. Stop invitation issuance before rolling the API behind `0009`.
Outstanding invitation messages already accepted by the provider remain valid
only while the compatible token key and acceptance route remain deployed.
Never delete tenant audit rows or hard-delete retained workspaces as a rollback
shortcut.

## Operational response

Use the privacy-safe auth-delivery status lookup with the invitation outbox id to
distinguish queued, retried, provider-accepted, and terminal states. Do not query
or expose token hashes. A terminal delivery can be revoked and replaced with a
new invitation after checking rate limits and the recipient address.
