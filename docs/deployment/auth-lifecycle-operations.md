# Authentication Lifecycle Operations

**Status:** Phase 2 implementation reference  
**Shared-environment safety:** Migration `0006_auth_lifecycle_reliability.sql`
requires human approval before it is applied outside an isolated branch.

## Retention and cleanup

The API runs one bounded batch at startup and every six hours in production.
Each category is capped at 100 rows per cycle. The worker uses PostgreSQL time
and emits only aggregate counts in `auth.lifecycle.cleanup_completed`.

| State                                             |                         Retention |
| ------------------------------------------------- | --------------------------------: |
| Unverified account and disposable empty workspace |                           14 days |
| Used or expired verification/reset challenge      | 7 days after terminal eligibility |
| Expired or revoked session                        |                           30 days |
| Stale rate-limit bucket                           |                            7 days |
| Provider-accepted or terminal outbox row          |                           30 days |

An unverified account is not abandoned while it has a live session. Its
workspace is not disposable when another member or invitation exists, or when
it contains a document, SDK installation, or Brand Theme. A pending,
non-expired invitation also protects it. The invitation table is deliberately
fail-closed until Phase 5 adds capability-checked issuance and acceptance APIs.

Set `LODARIQ_AUTH_MAINTENANCE_ENABLED=false` only during a diagnosed incident.
Do not replace the bounded worker with an unreviewed bulk delete.

## Token key rotation

The legacy `LODARIQ_AUTH_EMAIL_TOKEN_SECRET` remains a one-key compatibility
mode. Rotation-ready environments use:

```text
LODARIQ_AUTH_EMAIL_TOKEN_KEYS={"2026-08":"…old…","2026-09":"…new…"}
LODARIQ_AUTH_EMAIL_TOKEN_ACTIVE_KEY_ID=2026-09
```

Key ids are public metadata; values are independent 32–256 byte secrets stored
only in the environment secret manager. New challenges use the active key.
Queued rows retain their key id, so a worker can still construct the exact link
after rotation. Retain the previous key for at least the 24-hour verification
TTL plus the maximum outbox retry window. Remove it only after no outstanding
row references it. A prematurely removed key makes the affected row terminal
with `token_key_unavailable`; issue a replacement through the generic resend
flow instead of restoring a suspect key.

## Delivery diagnosis

Start with the response correlation id and its internal outbox id, then run the
privacy-minimized command documented in
[`auth-recovery-operations.md`](./auth-recovery-operations.md). Provider
acceptance means Resend accepted the request; it is not proof that an inbox
received or displayed the message.
