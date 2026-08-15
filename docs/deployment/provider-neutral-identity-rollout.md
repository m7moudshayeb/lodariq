# Provider-neutral identity rollout

Migration `0007_provider_neutral_identity.sql` is an additive expand step. Do not
apply it to a shared Neon branch without explicit migration approval, a current
backup/retention decision, and a normalized-email ambiguity query reviewed by a
human operator.

## Preflight

Run the following as a read-only owner query. The migration performs the same
check transactionally and aborts if this query returns any row.

```sql
select lower(btrim(email)) as normalized_email, count(*)
from users
group by lower(btrim(email))
having count(*) > 1;
```

Then confirm the API release that dual-writes `user_emails` and
`auth_identities` is ready, take the approved backup, apply the migration with
`ON_ERROR_STOP=1`, provision grants for the restricted runtime role, and run the
live RLS verifier on an isolated branch before staging.

## Evidence

The disposable PostgreSQL 16 migration test rehearses:

- exact primary-email and password-identity backfill;
- transactional rejection of ambiguous normalized email data;
- preservation of `users.email`, `users.email_verified_at`,
  `users.clerk_user_id`, and password-credential email columns;
- session metadata defaults for legacy sessions whose `identity_id` remains null;
- forced RLS on every added table and exact restricted-role lookup behavior.

## Rollback during the expand window

Rollback the application to the preceding release without dropping or rewriting
the new tables or columns. The preserved legacy columns and password lookup path
remain readable. New sessions may have additional metadata, which the preceding
application ignores. Keep the new schema in place until the forward issue is
understood; schema contraction is a separate destructive migration requiring its
own approval.

Do not roll back by deleting backfilled rows, nulling identity references, or
restoring a database snapshot over newer account data. If a rollback requires
data restoration, stop authentication writes and follow the approved incident
recovery procedure.
