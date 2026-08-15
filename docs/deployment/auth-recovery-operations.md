# Authentication Recovery Operations

**Audience:** Lodariq engineering and security operators  
**Scope:** Password-recovery persistence and Resend delivery diagnostics  
**Safety:** Read-only by default. Shared-database mutations require explicit human
approval and an owner connection; application runtime credentials must never be
used as an administrative substitute.

## Signals and identifiers

Every accepted recovery HTTP response includes
`x-lodariq-auth-correlation-id`. Internal events correlate that value with a
random challenge id and outbox id. Logs and support records must not contain raw
email addresses, reset tokens, password material, cookies, or provider secrets.

Expected event sequence:

1. `auth.recovery.requested`
2. `auth.recovery.challenge.persisted`
3. `auth.recovery.request.completed` with internal outcome `queued`
4. `auth.email.outbox_claimed`
5. `auth.email.provider_accepted`
6. `auth.recovery.challenge.resolved`
7. `auth.recovery.challenge.consumed`

`no_match` and `ambiguous_match` are intentionally visible only to trusted
internal observability. The public response stays generic.

Alert when any of these conditions is true:

- a terminal email event is emitted;
- the oldest claimed authentication email is more than five minutes old;
- the same outbox id is retried three or more times;
- a recovery request completes with `persistence_conflict`;
- provider-accepted recovery volume is non-zero but challenge-resolution volume
  drops unexpectedly over the same window.

## Repeat-request RLS incident

Migration `0005_auth_recovery_rls.sql` adds the user-scoped SELECT visibility
PostgreSQL requires before the existing invalidation UPDATE policies can affect
prior challenges and outbox rows. Apply it first to an isolated Neon branch,
then run the disposable PostgreSQL recovery suite and live RLS verification.
Applying it to a shared environment requires explicit human sign-off.

After the migration is applied, the safest recovery for an account with a stuck
active challenge is to request a new link normally. The replacement transaction
will retire the old challenge and pending outbox row atomically. No manual row
mutation is normally required.

## Read-only diagnosis

Use the restricted runtime connection from an approved operator environment and
inspect the exact outbox id without opening production tables manually:

```sh
DATABASE_URL='postgresql://lodariq_runtime:…' pnpm auth:delivery:inspect \
  --purpose set_password --outbox-id outbox_…
```

The command reports `queued`, `retry_scheduled`, `provider_accepted`,
`terminal`, or `not_found`, plus attempts and privacy-safe timestamps. It never
returns recipient address, payload, raw token, or token hash. Owner/admin SQL is
reserved for an approved incident that the bounded tool cannot diagnose.

Confirm all of the following:

- one challenge exists for the recorded challenge id;
- at most one challenge for its internal user has `used_at is null`;
- the matching outbox row is processed, pending, superseded, or terminal;
- a provider-accepted event exists before claiming delivery succeeded;
- API and database clocks represent the same UTC instant within the operational
  skew threshold.

Do not expose internal `no_match` or `ambiguous_match` results to the requester.

## Exceptional manual retirement

Manual retirement is allowed only when the normal post-migration replacement
still fails and an incident owner approves the exact user, challenge, and outbox
ids. Before mutation:

1. Record the incident, approver, environment, exact ids, current row state, and
   recovery/rollback decision.
2. Take the environment's approved backup or branch snapshot.
3. Reconfirm that the challenge is unused and belongs to the same internal user
   as the outbox row.
4. In one owner transaction, set the exact challenge's `used_at` and the exact
   unprocessed outbox row's `terminal_at`; use the bounded failure code
   `operator_retired`.
5. Verify that no other user's rows changed, then have the user request a new
   link through the normal endpoint.

Never delete recovery evidence during incident response, never edit token hashes,
and never mark an email processed unless Resend actually accepted it.

## Clock and expiry triage

Reset timestamps are UTC instants produced with `Date.toISOString()` and stored
as PostgreSQL `timestamptz`. Browser, Tokyo, Hebron, and Fly regions must not alter
the instant. If an immediately opened link is rejected:

1. correlate issuance and resolution by challenge id;
2. compare API event timestamps, database `created_at`/`expires_at`, and database
   `clock_timestamp()` as UTC instants;
3. confirm the link was not superseded and the fragment token reached the form;
4. confirm the token hash and challenge id selected the same row;
5. retain the evidence before retrying.

Do not add timezone offsets to stored instants. Correct clock skew or token/state
propagation at its source.

## Browser parity gate

The opt-in `packages/tests/e2e/auth-live-parity.spec.ts` flow exercises the
normal local Neon + Resend profile or a hosted development profile. It requires
an isolated test account and a private test-inbox adapter that returns only the
newest exact-origin Lodariq URL for a recipient, purpose, and lower-bound time.
The adapter credential stays in the runner environment and must never be sent
to Lodariq API/dashboard processes or written to reports.

Set `LODARIQ_AUTH_LIVE_BASE_URL`, `LODARIQ_AUTH_LIVE_EMAIL`,
`LODARIQ_AUTH_TEST_INBOX_ENDPOINT`, and `LODARIQ_AUTH_TEST_INBOX_TOKEN`, then run:

```sh
LODARIQ_E2E_WEB_SERVERS='' pnpm exec playwright test \
  packages/tests/e2e/auth-live-parity.spec.ts --project=chromium
```

Use a disposable account/database branch. The retained evidence is the test
result plus privacy-safe auth correlation identifiers—not inbox credentials,
message bodies, raw links, or tokens.
