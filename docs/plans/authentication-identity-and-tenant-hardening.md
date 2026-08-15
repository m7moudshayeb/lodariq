# Authentication, Identity, and Tenant Hardening

**Status:** Current, code-reconciled plan  
**Last verified:** 2026-08-14  
**Supersedes:** The unattached nine-phase authentication proposal used during the
owned-auth rollout. This version removes work already present in the repository
and incorporates the August 14 recovery incident and authentication UX audit.

## Outcome

Preserve the security work that is already sound—Lodariq-owned opaque sessions,
workspace memberships, role capabilities, and PostgreSQL RLS—while replacing
the password-centric account lifecycle with a provider-neutral identity system
that can support usernames, passkeys, OAuth/OIDC, enterprise SSO, and SCIM.

```text
Password / Passkey / Google / Microsoft / Enterprise SSO
                            │
                            ▼
                 Provider-neutral identity
                            │
                            ▼
                     Lodariq user
                            │
                            ▼
              Opaque Lodariq session cookie
                            │
                            ▼
         Workspace membership + policy + PostgreSQL RLS
```

Provider tokens and JWTs must not become browser session credentials. After an
external provider authenticates an identity, Lodariq creates the same opaque,
hash-stored session used by password authentication.

Canonical contracts remain TypeBox/JSON Schema in `@lodariq/schema`. Database
changes are additive and every identity or tenant table must be protected by
behaviorally tested RLS. No migration is applied to a shared environment without
explicit human sign-off.

## Verified baseline — not backlog

The following original-plan work is confirmed in the codebase and is therefore
not repeated as implementation tasks below:

- Normal `pnpm dev` requires a restricted Neon development runtime role, Resend,
  a verified sender, owned auth, real email flows, and hidden development tokens.
  `pnpm dev:isolated` remains the explicit offline path. See
  [`package.json`](../../package.json),
  [`scripts/dev-local.mjs`](../../scripts/dev-local.mjs), and
  [`scripts/check-local-auth-env.mjs`](../../scripts/check-local-auth-env.mjs).
- Local and deployed environment validation rejects missing database credentials,
  owner roles, incomplete Resend configuration, unsafe origins, and invalid auth
  modes. See [`apps/api/scripts/check-runtime-env.mjs`](../../apps/api/scripts/check-runtime-env.mjs)
  and [`.env.example`](../../.env.example).
- Password credentials use Argon2id; sessions are opaque, hash-stored, rotated,
  idle/absolute-expiring, `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
  See [`apps/api/src/auth/owned-auth-crypto.ts`](../../apps/api/src/auth/owned-auth-crypto.ts)
  and [`apps/api/src/auth/session-cookie.ts`](../../apps/api/src/auth/session-cookie.ts).
- Sign-up, email verification, sign-in, current-session lookup, sign-out,
  password recovery, password replacement, workspace creation, and workspace
  selection have first-party API routes. These routes are a foundation, not a
  declaration that every lifecycle is correct. See
  [`apps/api/src/routes/auth.ts`](../../apps/api/src/routes/auth.ts).
- Auth request rate buckets, source and identity dimensions, bounded password
  hashing, retrying email delivery, terminal outbox state, and public recovery
  anti-enumeration responses exist. See
  [`apps/api/src/auth/auth-email-outbox.ts`](../../apps/api/src/auth/auth-email-outbox.ts).
- Control-plane authorization resolves current database membership and role
  instead of trusting the browser. Existing creator and release routes fail
  closed after membership removal. See
  [`apps/api/src/routes/control-plane-access.ts`](../../apps/api/src/routes/control-plane-access.ts).
- The existing schema retains `legacyIdentityId` for rollback. It does not yet
  provide provider-neutral identities. See
  [`packages/database/src/schema/identity.ts`](../../packages/database/src/schema/identity.ts).

Presence of a route, policy, or unit test is not completion evidence by itself.
The reset incident demonstrated that in-memory behavior and policy-name checks
can pass while the restricted PostgreSQL runtime path is broken.

## P0 — Close the password-recovery incident

This phase is a release blocker and precedes every feature expansion.

### Confirmed failure

The second and third recovery requests returned the intentionally generic `202`,
but no new outbox row reached Resend. The PostgreSQL repository tries to mark the
old active challenge used before inserting its replacement. Under the restricted
runtime role, the update policy permits invalidation by `auth_user_id`, while the
SELECT policy only exposes the newly generated challenge id and hash. PostgreSQL
therefore updates zero old rows; the new insert collides with the unique active
challenge index; the repository catches the uniqueness error and returns `false`;
the route ignores that internal result and still returns `202`.

Evidence is in
[`packages/database/src/drizzle/identity-password.ts`](../../packages/database/src/drizzle/identity-password.ts)
and the policies/index in
[`packages/database/drizzle/0000_initial_baseline.sql`](../../packages/database/drizzle/0000_initial_baseline.sql).
The in-memory replacement test passes, but there is no equivalent behavioral
PostgreSQL/RLS test.

The first link's immediate `invalid or expired` result remains unresolved. The
implementation uses UTC instants (`Date.toISOString`) and PostgreSQL `timestamptz`,
so Tokyo, Hebron, or browser display timezone should not invalidate a token by
design. Until challenge issuance and consumption are correlated, timezone is not
an evidenced root cause. The current reset TTL is 30 minutes.

### Remaining work

- [ ] Add a reviewed additive migration and matching fresh-database baseline
      policy that allows the exact prior active challenge and pending outbox rows to
      be invalidated inside the user-scoped replacement transaction without exposing
      another user's challenge.
- [ ] Return a structured internal repository outcome such as `queued`,
      `no_match`, `ambiguous_match`, or `persistence_conflict`. Keep the public
      anti-enumeration `202`, but never discard the internal outcome.
- [ ] Emit privacy-safe structured events for recovery request, challenge
      persisted, outbox claimed, provider accepted, challenge resolved, challenge
      consumed, and terminal failure. Correlate by request/outbox/challenge ids; never
      log tokens, password material, raw email, or session credentials.
- [ ] Add a one-time operator runbook to retire a stuck active challenge after the
      migration is approved. Do not mutate the shared development database as part of
      ordinary code verification.
- [ ] Add restricted-role PostgreSQL tests for first request, repeated request,
      concurrent requests, exactly one active challenge, exactly one outbox row per
      accepted internal request, old-link invalidation, latest-link success, replay
      rejection, expiry, and unknown/ambiguous email behavior.
- [ ] Test creation and comparison across Node and PostgreSQL clocks, assert the
      `timestamptz` round trip, record clock skew in readiness/diagnostics, and make
      the clock injectable in route/repository tests. Do not add timezone conversion
      workarounds to epoch timestamps.
- [ ] Decide and document the user-facing reset TTL, include it in the recovery
      message, and test boundary behavior. A link opened immediately must succeed;
      an expired or superseded link must lead directly to requesting a replacement.
- [ ] Surface outbox age, retry count, and terminal-delivery counts to operational
      monitoring with an actionable alert and runbook.
- [ ] Prove the full deployed-development flow through Fly, Neon RLS, Resend, the
      dashboard link, password replacement, session creation, immediate retry, and
      replay rejection.

**Exit condition:** three sequential recovery requests create three observable
internal outcomes, each successful replacement reaches Resend, only the newest
link works, immediate use never reports expiry, and the restricted-role browser
test is retained as release-gate evidence.

## Phase 1 — Authentication contracts and form UX

This phase incorporates the UX audit findings and the only remaining validation
work from the original production-parity phase.

- [ ] Replace browser-native validation bubbles with application-owned,
      localized field validation. Use `noValidate`, derive constraints from canonical
      TypeBox contracts, render stable inline messages, associate messages with
      `aria-describedby`, set `aria-invalid`, focus the first invalid field, and
      retain a summary for server/form errors.
- [ ] Centralize authentication field definitions and error-code mappings so
      sign-in, sign-up, verification, reset, popup auth, and account settings do not
      drift. Zod must not replace the canonical TypeBox/JSON Schema contracts.
- [ ] Add password show/hide controls with accessible names, allow password
      manager paste/autofill, and present the actual password rule before submission.
- [ ] Replace generic `invalid or expired` dead ends with an actionable state:
      request another link, explain supersession/expiry without leaking account
      existence, and preserve a safe `returnTo`.
- [ ] Add cooldown feedback and resend controls to verification/recovery success
      states without claiming that delivery occurred merely because the public API
      returned `202`.
- [ ] Run sign-up, verification, recovery, reset, replay, sign-in, sign-out, and
      session-restoration browser tests against the normal Neon + Resend local profile
      and the hosted development profile.
- [ ] Add axe, keyboard, screen-reader announcement, autofill, RTL, and localized
      long-copy coverage for every auth surface, including the top-level creator
      popup.

**Exit condition:** authentication forms never depend on native HTML error UI,
every failure has a localized and actionable state, and production-parity browser
evidence covers all owned-auth lifecycles.

## Phase 2 — Finish owned-auth lifecycle reliability

Only unfinished items from the original lifecycle phase remain here.

- [ ] Add a generic resend-verification endpoint and UI. Replacement must be
      cooldown/rate limited, invalidate the prior challenge atomically, and preserve
      account-enumeration resistance.
- [ ] Fix duplicate sign-up so it never returns a newly generated challenge that
      was not persisted. Provide the same public response shape while ensuring an
      existing unverified account receives a usable replacement through the approved
      resend lifecycle.
- [ ] Add bounded cleanup for abandoned unverified accounts and their empty
      workspaces, expired/used challenges, expired/revoked sessions, stale rate
      buckets, and processed/terminal outbox rows. Define retention periods and
      protect non-empty or invited workspaces.
- [ ] Add email-token secret key ids and an environment keyring so rotation signs
      new links with the active key while outstanding links remain valid during a
      bounded verification window.
- [ ] Add delivery reconciliation and support tooling that can answer whether a
      message was queued, retried, accepted by Resend, or terminal—without exposing
      raw tokens or making support staff query production tables manually.
- [ ] Add abuse tests for distributed sources, normalized/case-variant identifiers,
      concurrency, queue saturation, and resend cooldown bypass attempts.

**Exit condition:** users cannot become permanently stuck after losing, expiring,
or superseding a verification/recovery email, and operators can diagnose delivery
state without database surgery.

## Phase 3 — Provider-neutral identities and login identifiers

Create an ADR and additive migration before adding any external provider. The
current `AuthProvider` interface only authenticates an already-created Lodariq
session and its provider union is limited to `lodariq | headers`; it is not an
identity enrollment, callback, linking, or policy abstraction.

Add models equivalent to:

```text
user_emails
  id, user_id, normalized_email, is_primary, verified_at

usernames
  id, user_id, normalized_username, display_username, created_at

auth_identities
  id, user_id, kind, issuer, subject, provider_tenant_id,
  created_at, last_authenticated_at

auth_sessions
  existing fields..., identity_id, authentication_method,
  assurance_level, authenticated_at, duration_policy

workspace_auth_policies
  workspace_id, sso_required, minimum_assurance, password_allowed

sso_connections
  id, workspace_id, protocol, issuer, status
```

- [ ] Define TypeBox contracts, centralized literal sets, repository interfaces,
      and an identity-provider adapter covering begin, callback/verification,
      enrollment, linking, unlinking, and assurance—not only request authentication.
- [ ] Backfill a password identity for every existing password credential and a
      primary email for every user; reject ambiguous normalized-email data instead
      of choosing an arbitrary user.
- [ ] Support a unique, normalized username as a first-party login identifier.
      Change sign-in from `email` to `identifier`, preserve email login, and make
      username creation/change subject to reserved-name, spoofing, rate-limit, and
      account-recovery rules.
- [ ] Add uniqueness for `(issuer, subject)` and provider-tenant constraints. Do
      not treat an external provider email as its permanent subject.
- [ ] Add RLS and restricted-role behavioral tests for every new table and every
      backfill/rollback step.
- [ ] Keep existing columns during the expand/contract rollback window; remove
      them only under a separately approved contract migration after production
      evidence.

**Exit condition:** one Lodariq user can safely own email, username, password,
passkey, and provider identities without duplicate accounts or bypassing RLS.

## Phase 4 — Separate authentication from onboarding

- [ ] Split the current coupled sign-up transaction into: authenticate/register
      an identity; establish the Lodariq user; accept an invitation, request access,
      or create a workspace; select a workspace; enforce its auth policy.
- [ ] Model onboarding as resumable server-owned state so provider cancellation,
      email verification, invitation acceptance, and retry cannot create orphaned or
      partially owned tenants.
- [ ] Link a provider only from an authenticated account or a strong recovery
      flow. Never auto-link solely because two providers report the same email.
- [ ] Reject ambiguous email matches, record link/unlink security events, and
      prevent removal of the final usable authentication method.
- [ ] Apply the same onboarding state machine to dashboard sign-in and the
      first-party authoring popup.

**Exit condition:** password, username, OAuth, passkey, and invitation entry all
converge on one account/onboarding flow without pretending to be password sign-up.

## Phase 5 — Complete multi-tenant administration

- [ ] Add workspace invitations with hash-stored, expiring, single-use tokens and
      acceptance after authentication.
- [ ] Add member listing, role changes, member removal, ownership transfer, and
      protection against removing or demoting the final owner.
- [ ] Add workspace deletion/retention, creation quotas, and abuse controls.
- [ ] Revoke or rotate affected sessions and authoring grants immediately when a
      membership is removed or materially downgraded.
- [ ] Record append-only audit history for invitation, membership, role,
      ownership, and workspace-deletion changes.
- [ ] Add a capability matrix test suite across owner, admin, member, viewer,
      removed member, and cross-workspace actors under the restricted RLS role.

Every new action must resolve authoritative membership, enforce centralized role
capabilities, run under workspace-scoped RLS, and ignore browser-supplied role or
workspace claims.

**Exit condition:** Lodariq supports the full tenant lifecycle rather than only
tenant-isolated storage and workspace selection.

## Phase 6 — Account and session management

- [ ] Add change-password with recent-auth confirmation and atomic revocation of
      other sessions/recovery challenges.
- [ ] Add change-email with verification of old and new addresses, collision
      handling, recovery protections, and audit events.
- [ ] Add username creation/change and a safe identifier-recovery path.
- [ ] Add active session/device listing, revoke-one, and sign-out-everywhere.
      Store only privacy-reviewed device metadata and make session names understandable.
- [ ] Add explicit `Remember me` behavior. Define server-side `session` and
      `persistent` duration policies; a non-remembered login uses a session cookie
      and shorter server expiry, while a remembered login uses the reviewed idle and
      absolute limits. The checkbox must not be cosmetic or rely only on cookie expiry.
- [ ] Add account deletion, retention, and export of relevant account information.
- [ ] Add linked-method review and safe link/unlink controls.
- [ ] Require recent or stepped-up authentication for ownership transfer, SSO
      changes, email/password changes, production release-policy changes, and account
      deletion.

**Exit condition:** users can perform ordinary account recovery and security
operations without database intervention, and session persistence reflects an
explicit user choice.

## Phase 7 — Assurance, MFA, and passkeys

- [ ] Implement provider-neutral assurance levels and `authenticatedAt`/recent-auth
      evaluation before adding individual methods.
- [ ] Add WebAuthn/passkeys with correct RP/origin binding for dashboard and
      first-party popup flows.
- [ ] Add TOTP only if product/customer evidence requires it.
- [ ] Add hash-stored single-use recovery codes, enrollment confirmation, method
      removal, recovery, and step-up challenges.
- [ ] Add workspace policies requiring MFA and tests proving a lower-assurance
      session cannot enter or mutate a higher-assurance workspace.

**Exit condition:** authorization can require a strong and recent session instead
of asking only whether a user is signed in.

## Phase 8 — OAuth/OIDC

- [ ] Implement Google and Microsoft through the provider adapter, followed later
      by generic enterprise OIDC.
- [ ] Use exact callback allowlists, Authorization Code flow, PKCE, `state`, OIDC
      `nonce`, issuer/audience validation, and provider subject lookup.
- [ ] Test cancellation/retry, collision/linking, disabled-provider, tenant, and
      callback replay behavior.
- [ ] Do not store provider access/refresh tokens unless Lodariq needs the
      provider's APIs for a separately approved integration.
- [ ] Prove both dashboard sign-in and first-party authoring-popup sign-in result
      in the same opaque Lodariq session and tenant enforcement.

**Exit condition:** OAuth and password users share one internal session,
authorization, onboarding, and recovery model.

## Phase 9 — Enterprise SSO and SCIM

Prepare the model earlier, but do not implement a SAML parser in Lodariq.

- [ ] Add workspace SSO connections, verified company domains, and domain-based
      discovery without auto-linking accounts by email.
- [ ] Add invitation-only and explicitly configured just-in-time provisioning.
- [ ] Enforce `sso_required`, `minimum_assurance`, and `password_allowed` during
      workspace selection and every control-plane authorization decision.
- [ ] Add a reviewed break-glass recovery procedure that is separately audited
      and cannot silently become a password fallback.
- [ ] Add IdP group-to-role mapping and SCIM provisioning/deprovisioning with
      immediate session/grant revocation.
- [ ] Add enterprise audit events and optional SAML Single Logout only if required.
- [ ] Validate supported configurations against real Okta and Microsoft Entra ID
      tenants before claiming enterprise availability.

**Exit condition:** a workspace authentication policy cannot be bypassed through
another linked method, stale membership, the authoring popup, or a lower-assurance
existing session.

## Release gates for every phase

- Threat model and abuse cases updated for the changed boundary.
- Canonical TypeBox contracts and negative schema tests added.
- In-memory tests are paired with restricted PostgreSQL/RLS behavior tests for
  persistence or policy changes.
- Browser coverage includes dashboard and creator-popup entry where applicable.
- Security events and operational metrics contain correlation ids but no secrets,
  raw tokens, passwords, provider credentials, or unnecessary PII.
- Migration rollback is rehearsed; shared-environment execution requires explicit
  sign-off and a backup/retention decision.
- Documentation and product claims describe only capabilities proven in the live
  target environment.
