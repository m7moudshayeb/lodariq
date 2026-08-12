# 0017. Lodariq-owned authentication and workspace sessions

- Status: Accepted
- Date: 2026-08-07
- PRD references: §6.2.1, §11.2, §14.5, §16.4, §20
- Related: ADR 0006, ADR 0010, ADR 0011, ADR 0015

## Context

Lodariq needs first-party authentication for the dashboard and authoring popup
without placing an account credential on a customer page. The provider-neutral
API boundary already separates identity from workspace authorization, and
PostgreSQL already owns users, memberships, and tenant isolation. Keeping a
third-party identity runtime would add cost and operational coupling without
changing the core password/session workflow required at this stage.

Replacing a provider in code is not the same as cutting over real accounts.
Provider-era users begin without Lodariq password credentials, production email
delivery must be configured and enabled deliberately, and a shared database
migration must remain recoverable.

## Decision

Lodariq owns the active password, session, email-verification, membership, and
workspace-context implementation behind the existing provider-neutral auth
interface. Active API/dashboard runtime code and dependencies must remain
Clerk-free. Explicit header auth is local/test-only and is rejected as a
deployed auth mode.

### Credentials and public boundaries

- Passwords are 12–128 characters and are hashed by the established `argon2`
  package using Argon2id (`m=65536`, `t=3`, `p=1`, 32-byte hash) under the
  versioned `argon2id-v1` credential identifier. Lodariq does not implement a
  password KDF itself. Unknown accounts run an equivalent Argon2id workload.
- Public sign-in/sign-up/recovery responses, source-first rate limiting, bounded
  password-hash admission, private/no-store responses, exact same-origin mutation
  checks, and generic duplicate/credential failures limit enumeration and
  resource abuse. Recovery proceeds only when exactly one normalized email row
  matches; zero or ambiguous matches return the same accepted response without
  issuing a challenge.
- The dashboard is the browser-facing BFF. API and dashboard share a server-only
  `LODARIQ_AUTH_BFF_SOURCE_SECRET` of at least 32 bytes. The dashboard derives a
  short-lived signed pseudonymous source envelope from the validated Fly client
  IP; the raw IP does not cross into API persistence.
- Credential fields are rendered only on Lodariq's first-party top-level origin,
  never inside the customer product or editor iframe.

### Sessions and workspace context

- Sessions use a cryptographically random opaque bearer. PostgreSQL stores only
  its SHA-256 hash.
- Production uses a `Secure`, `HttpOnly`, `SameSite=Lax`, path-rooted
  `__Host-lodariq_session` cookie. Local development uses a separately named
  non-production cookie.
- A session has a seven-day idle limit, a 30-day absolute limit, periodic idle
  touch, explicit revocation, and verified-email enforcement.
- Workspace list/create/select is membership-backed. Selecting or creating an
  active workspace rotates the opaque session with compare-and-swap semantics;
  control-plane authorization resolves the database-authoritative membership
  role rather than trusting a browser-supplied role.
- The authoring activation route authenticates identity first, then authorizes
  the exact requested workspace membership. It must not silently mutate the
  user's active dashboard workspace.

### Verification, persistence, and RLS

- Signup accepts identity/workspace details but no chosen password. It creates
  an unverified user, owner membership, default development/staging/production
  environments, a credential containing an unusable random pending secret, a
  single-use verification challenge, and an auth-outbox row atomically. It does
  not create a session.
- Verification consumes one short-lived hash-stored challenge and atomically
  replaces the pending credential with the creator's Argon2id password,
  verifies the email, revokes prior sessions, and creates a credential-bound
  session. The secret portion of a verification URL belongs in the URL fragment
  so it is not sent in HTTP requests or referrers.
- Password enrollment/recovery uses a distinct `set_password` challenge,
  domain-separated reset token, 30-minute expiry, single-use atomic consume,
  password upsert, verification update, prior-session revocation, and new
  first-party session. Verification credentials cannot cross purpose into the
  reset path.
- The pre-deployment `0000_initial_baseline.sql` creates password credentials,
  auth sessions, verification and purpose-separated set-password challenges,
  both auth outboxes, and auth rate-limit storage with forced RLS and narrow
  pre-workspace scopes. Its non-unique normalized-email lookup is deliberate so
  duplicate addresses fail closed.
- One bounded in-process auth-email worker services verification and set-password
  outboxes through one lifecycle. It leases due rows atomically, uses
  lease-version CAS, bounded batches, timeout/abort, retry classification,
  exponential backoff with jitter, terminal state, and a Resend idempotency key.
  Fastify starts and drains the worker with the application lifecycle.
- The compatibility `users.clerk_user_id` column is nullable and mapped as
  `legacyIdentityId`. The baseline creates no users and performs no identity
  backfill. Removing the compatibility column after deployment would require a
  separate, explicitly approved contract migration.
- Production/shared staging use a non-owner PostgreSQL role with `BYPASSRLS`
  disabled. The expanded live RLS verifier must pass before auth traffic is
  enabled on a migrated environment.

## Implementation and production cutover gate

The owned-auth code milestone is complete. The consolidated Node 24 gate passed
typecheck, lint, dependency boundaries, migration safety, 66 Vitest files/648
tests, integration coverage, all builds and size budgets, SDK asset preparation,
62 E2E tests with four intentional skips, and `pnpm audit` with no known
vulnerabilities. One Firefox focus assertion passed on an immediate isolated
retry and is retained as a recorded browser flake, not hidden as a product
failure.

Production is still disabled. Before production enrollment or existing-user
cutover:

1. Apply the sole `0000_initial_baseline.sql` exactly once to the approved empty
   Neon target and run the expanded live RLS verifier with the non-owner runtime
   role.
2. Verify the Resend sending domain and configure `RESEND_API_KEY`,
   `LODARIQ_APP_BASE_URL`, `LODARIQ_AUTH_EMAIL_FROM`, and a strong
   `LODARIQ_AUTH_EMAIL_TOKEN_SECRET` in the secrets manager.
3. Enable the authoritative API capabilities with
   `LODARIQ_EMAIL_DELIVERY_MODE=resend`,
   `LODARIQ_PUBLIC_SIGNUP_MODE=email-verification`, and
   `LODARIQ_PASSWORD_RECOVERY_MODE=email`; mirror the signup/recovery modes in
   the dashboard. API and dashboard must reject an enabled browser surface when
   the API delivery capability is disabled.
4. Deploy API and dashboard together, then run live email delivery, expiry,
   replay, ambiguous-email, session revocation/rotation, BFF source-boundary,
   workspace isolation, and launcher activation/reset-then-retry probes.
5. Retain `legacyIdentityId` through the approved rollback window. Add
   invitations and member-role administration before calling tenancy
   administration complete, but do not conflate that later product work with
   the owned-auth credential cutover.

## Consequences

- Lodariq no longer carries Clerk runtime dependencies or provider keys.
- Account/session behavior is inspectable, portable, and aligned with the
  existing PostgreSQL membership/RLS model.
- Lodariq now owns credential security, email deliverability, recovery abuse
  controls, session operations, and account-support burden.
- Existing users remain recoverable during migration because the legacy identity
  reference is retained until an explicitly approved contract drop.
- SAML, SSO, SCIM, passkeys, and enterprise provisioning remain later
  capabilities; they do not weaken the current first-party popup and exact-origin
  activation model.
