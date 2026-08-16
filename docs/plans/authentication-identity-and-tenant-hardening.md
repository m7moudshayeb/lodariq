# Authentication, Identity, and Tenant Hardening

**Status:** Current, code-reconciled plan  
**Last verified:** 2026-08-15
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

- [x] Add a reviewed additive migration and matching fresh-database baseline
      policy that allows the exact prior active challenge and pending outbox rows to
      be invalidated inside the user-scoped replacement transaction without exposing
      another user's challenge.
- [x] Return a structured internal repository outcome such as `queued`,
      `no_match`, `ambiguous_match`, or `persistence_conflict`. Keep the public
      anti-enumeration `202`, but never discard the internal outcome.
- [x] Emit privacy-safe structured events for recovery request, challenge
      persisted, outbox claimed, provider accepted, challenge resolved, challenge
      consumed, and terminal failure. Correlate by request/outbox/challenge ids; never
      log tokens, password material, raw email, or session credentials.
- [x] Add a one-time operator runbook to retire a stuck active challenge after the
      migration is approved. Do not mutate the shared development database as part of
      ordinary code verification.
- [x] Add restricted-role PostgreSQL tests for first request, repeated request,
      concurrent requests, exactly one active challenge, exactly one outbox row per
      accepted internal request, old-link invalidation, latest-link success, replay
      rejection, expiry, and unknown/ambiguous email behavior.
- [x] Test creation and comparison across Node and PostgreSQL clocks, assert the
      `timestamptz` round trip, record clock skew in readiness/diagnostics, and make
      the clock injectable in route/repository tests. Do not add timezone conversion
      workarounds to epoch timestamps.
- [x] Decide and document the user-facing reset TTL, include it in the recovery
      message, and test boundary behavior. A link opened immediately must succeed;
      an expired or superseded link must lead directly to requesting a replacement.
- [x] Surface outbox age, retry count, and terminal-delivery counts to operational
      monitoring with an actionable alert and runbook.
- [ ] Prove the full deployed-development flow through Fly, Neon RLS, Resend, the
      dashboard link, password replacement, session creation, immediate retry, and
      replay rejection.

Implementation verification passed on 2026-08-15: typecheck, lint, migration
safety, 55 focused API/database/dashboard tests, and all 16 migration plus
restricted-role PostgreSQL 16 tests. The PostgreSQL fixture deliberately used
the `Asia/Hebron` database timezone and still passed immediate-use, exact-expiry,
and UTC `timestamptz` round-trip checks. The remaining deployed-development item
is an explicitly human-approved shared-environment release gate, not permission
to apply migration `0005` from this implementation worktree.

**Exit condition:** three sequential recovery requests create three observable
internal outcomes, each successful replacement reaches Resend, only the newest
link works, immediate use never reports expiry, and the restricted-role browser
test is retained as release-gate evidence.

## Phase 1 — Authentication contracts and form UX

This phase incorporates the UX audit findings and the only remaining validation
work from the original production-parity phase.

- [x] Replace browser-native validation bubbles with application-owned,
      localized field validation. Use `noValidate`, derive constraints from canonical
      TypeBox contracts, render stable inline messages, associate messages with
      `aria-describedby`, set `aria-invalid`, focus the first invalid field, and
      retain a summary for server/form errors.
- [x] Centralize authentication field definitions and error-code mappings so
      sign-in, sign-up, verification, reset, popup auth, and account settings do not
      drift. Zod must not replace the canonical TypeBox/JSON Schema contracts.
- [x] Add password show/hide controls with accessible names, allow password
      manager paste/autofill, and present the actual password rule before submission.
- [x] Replace generic `invalid or expired` dead ends with an actionable state:
      request another link, explain supersession/expiry without leaking account
      existence, and preserve a safe `returnTo`.
- [x] Add cooldown feedback and resend controls to verification/recovery success
      states without claiming that delivery occurred merely because the public API
      returned `202`.
- [ ] Run sign-up, verification, recovery, reset, replay, sign-in, sign-out, and
      session-restoration browser tests against the normal Neon + Resend local profile
      and the hosted development profile.
- [x] Add axe, keyboard, screen-reader announcement, autofill, RTL, and localized
      long-copy coverage for every auth surface, including the top-level creator
      popup.

Implementation verification passed on 2026-08-15: all affected packages
typecheck and lint; strict Lingui compilation has no missing product-locale
entries; 73 focused schema/API/database/dashboard tests, 17 active migration and
forced-RLS PostgreSQL 16 tests, and eight Chromium axe/keyboard/RTL browser tests
pass. The live-parity flow is implemented in
`packages/tests/e2e/auth-live-parity.spec.ts` and documented in the recovery
runbook. Running it against normal Neon + Resend and hosted development remains
an external-environment evidence gate requiring an isolated inbox/account and
approved shared-environment migration/deployment.

**Exit condition:** authentication forms never depend on native HTML error UI,
every failure has a localized and actionable state, and production-parity browser
evidence covers all owned-auth lifecycles.

## Phase 2 — Finish owned-auth lifecycle reliability

Only unfinished items from the original lifecycle phase remain here.

- [x] Add a generic resend-verification endpoint and UI. Replacement must be
      cooldown/rate limited, invalidate the prior challenge atomically, and preserve
      account-enumeration resistance.
- [x] Fix duplicate sign-up so it never returns a newly generated challenge that
      was not persisted. Provide the same public response shape while ensuring an
      existing unverified account receives a usable replacement through the approved
      resend lifecycle.
- [x] Add bounded cleanup for abandoned unverified accounts and their empty
      workspaces, expired/used challenges, expired/revoked sessions, stale rate
      buckets, and processed/terminal outbox rows. Define retention periods and
      protect non-empty or invited workspaces.
- [x] Add email-token secret key ids and an environment keyring so rotation signs
      new links with the active key while outstanding links remain valid during a
      bounded verification window.
- [x] Add delivery reconciliation and support tooling that can answer whether a
      message was queued, retried, accepted by Resend, or terminal—without exposing
      raw tokens or making support staff query production tables manually.
- [x] Add abuse tests for distributed sources, normalized/case-variant identifiers,
      concurrency, queue saturation, and resend cooldown bypass attempts.

**Exit condition:** users cannot become permanently stuck after losing, expiring,
or superseding a verification/recovery email, and operators can diagnose delivery
state without database surgery.

**Local evidence (2026-08-15):** schema, database, API, dashboard, and test
typechecks; affected-package lint; migration safety; 80 focused lifecycle tests;
26 runtime-environment tests; 46 repository-isolation tests; and 17 disposable
PostgreSQL 16 restricted-role/RLS tests pass. The cleanup guard includes pending,
non-expired workspace invitations, whose persistence foundation remains fail-closed
until the Phase 5 issuance and acceptance APIs are implemented. Applying migrations
or exercising hosted Fly/Neon/Resend environments still requires an explicit shared-
environment sign-off.

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

- [x] Define TypeBox contracts, centralized literal sets, repository interfaces,
      and an identity-provider adapter covering begin, callback/verification,
      enrollment, linking, unlinking, and assurance—not only request authentication.
- [x] Backfill a password identity for every existing password credential and a
      primary email for every user; reject ambiguous normalized-email data instead
      of choosing an arbitrary user.
- [x] Support a unique, normalized username as a first-party login identifier.
      Change sign-in from `email` to `identifier`, preserve email login, and make
      username creation/change subject to reserved-name, spoofing, rate-limit, and
      account-recovery rules.
- [x] Add uniqueness for `(issuer, subject)` and provider-tenant constraints. Do
      not treat an external provider email as its permanent subject.
- [x] Add RLS and restricted-role behavioral tests for every new table and every
      backfill/rollback step.
- [x] Keep existing columns during the expand/contract rollback window; remove
      them only under a separately approved contract migration after production
      evidence.

**Exit condition:** one Lodariq user can safely own email, username, password,
passkey, and provider identities without duplicate accounts or bypassing RLS.

**Local evidence (2026-08-15):** the schema, database, API, dashboard, and tests
typecheck; all affected packages lint; the additive migration guard and strict
localization compile pass; 73 focused contract/repository/API/dashboard tests and
11 disposable PostgreSQL 16 backfill, rollback, uniqueness, tenant-constraint,
and restricted-role RLS tests pass. The rollout remains expand-only: legacy
columns are preserved, and applying the migration to a shared environment still
requires explicit human approval.

## Phase 4 — Separate authentication from onboarding

- [x] Split the current coupled sign-up transaction into: authenticate/register
      an identity; establish the Lodariq user; accept an invitation, request access,
      or create a workspace; select a workspace; enforce its auth policy.
- [x] Model onboarding as resumable server-owned state so provider cancellation,
      email verification, invitation acceptance, and retry cannot create orphaned or
      partially owned tenants.
- [x] Link a provider only from an authenticated account or a strong recovery
      flow. Never auto-link solely because two providers report the same email.
- [x] Reject ambiguous email matches, record link/unlink security events, and
      prevent removal of the final usable authentication method.
- [x] Apply the same onboarding state machine to dashboard sign-in and the
      first-party authoring popup.

**Exit condition:** password, username, OAuth, passkey, and invitation entry all
converge on one account/onboarding flow without pretending to be password sign-up.

**Local evidence (2026-08-15):** schema, database, API, dashboard, and tests
typecheck; affected packages lint; strict localization compilation and additive
migration safety pass; 80 focused contract/repository/API/dashboard/popup tests
and 12 fresh-baseline plus ordered-migration PostgreSQL 16 tests pass under the
restricted runtime role. The PostgreSQL suite proves registration creates no
tenant, verification advances server state, destination completion is resumable
and idempotent, link/unlink history is append-only, the final method cannot be
removed, and unscoped RLS reads return no rows. OAuth, passkey, and invitation
issuance plug into this state machine in their dedicated later phases; no shared
environment migration or deployment was performed.

## Phase 5 — Complete multi-tenant administration

- [x] Add workspace invitations with hash-stored, expiring, single-use tokens and
      acceptance after authentication.
- [x] Add member listing, role changes, member removal, ownership transfer, and
      protection against removing or demoting the final owner.
- [x] Add workspace deletion/retention, creation quotas, and abuse controls.
- [x] Revoke or rotate affected sessions and authoring grants immediately when a
      membership is removed or materially downgraded.
- [x] Record append-only audit history for invitation, membership, role,
      ownership, and workspace-deletion changes.
- [x] Add a capability matrix test suite across owner, admin, member, viewer,
      removed member, and cross-workspace actors under the restricted RLS role.

Every new action must resolve authoritative membership, enforce centralized role
capabilities, run under workspace-scoped RLS, and ignore browser-supplied role or
workspace claims.

**Exit condition:** Lodariq supports the full tenant lifecycle rather than only
tenant-isolated storage and workspace selection.

**Local evidence (2026-08-15):** schema, database, API, dashboard, and tests
typecheck; affected packages lint; strict localization compilation and additive
migration safety pass; 44 focused contract/repository/API/dashboard tests and
five ordered-migration PostgreSQL 16 tests pass under the restricted runtime
role with forced RLS. The database suite proves settings-bound invitation
acceptance, wrong-account rejection, replay resistance, capability enforcement,
session revocation, final-owner protection, ownership transfer, retention, and
append-only audit history. Invitation delivery uses the bounded auth outbox and
production responses expose no raw secret. Shared migration execution, Resend
receipt, and hosted-environment smoke evidence still require explicit human
approval and are not claimed by this worktree.

## Phase 6 — Account and session management

- [x] Add change-password with recent-auth confirmation and atomic revocation of
      other sessions/recovery challenges.
- [x] Add change-email with verification of old and new addresses, collision
      handling, recovery protections, and audit events.
- [x] Add username creation/change and a safe identifier-recovery path.
- [x] Add active session/device listing, revoke-one, and sign-out-everywhere.
      Store only privacy-reviewed device metadata and make session names understandable.
- [x] Add explicit `Remember me` behavior. Define server-side `session` and
      `persistent` duration policies; a non-remembered login uses a session cookie
      and shorter server expiry, while a remembered login uses the reviewed idle and
      absolute limits. The checkbox must not be cosmetic or rely only on cookie expiry.
- [x] Add account deletion, retention, and export of relevant account information.
- [x] Add linked-method review and safe link/unlink controls.
- [x] Require recent or stepped-up authentication for ownership transfer, SSO
      changes, email/password changes, production release-policy changes, and account
      deletion.

**Exit condition:** users can perform ordinary account recovery and security
operations without database intervention, and session persistence reflects an
explicit user choice.

**Implementation evidence (2026-08-15):** canonical account/session contracts,
the two-proof email-change state machine, transactional password/session
revocation, linked-method safeguards, soft deletion/export, and explicit
standard/remembered duration policies are implemented across schema, repository,
API, BFF, and localized dashboard UI. Secret-bearing email links use fragments
and the existing leased outbox. Focused Phase 6 coverage passes 67 contract,
repository, API, BFF, and browser-component tests plus three ordered-migration
PostgreSQL 16 tests under the restricted forced-RLS runtime role. A strict
994-message catalog compiles with zero missing entries in all eight non-English
locales; affected packages typecheck and lint. ADR 0022, the account rollout
runbook, and the threat model record the controls and evidence boundary. Shared
migration execution, live Resend receipt, and hosted Fly/Neon browser validation
still require explicit operator approval and are not claimed by this worktree.

## Phase 7 — Assurance, MFA, and passkeys

- [x] Implement provider-neutral assurance levels and `authenticatedAt`/recent-auth
      evaluation before adding individual methods.
- [x] Add WebAuthn/passkeys with correct RP/origin binding for dashboard and
      first-party popup flows.
- [x] Add TOTP only if product/customer evidence requires it. No qualifying
      evidence exists, so ADR 0023 records the deliberate decision not to add a
      shared-secret authenticator yet.
- [x] Add hash-stored single-use recovery codes, enrollment confirmation, method
      removal, recovery, and step-up challenges.
- [x] Add workspace policies requiring MFA and tests proving a lower-assurance
      session cannot enter or mutate a higher-assurance workspace.

**Exit condition:** authorization can require a strong and recent session instead
of asking only whether a user is signed in.

**Implementation evidence (2026-08-15):** centralized assurance ordering,
future-safe recent-auth evaluation, exact-host WebAuthn configuration, passkey
registration/sign-in/step-up, atomic challenge and counter consumption, and
confirmed hash-only recovery codes are implemented across TypeBox contracts,
repository, API, BFF, and localized dashboard UI. Workspace selection and every
control-plane decision enforce the persisted assurance/method policy; focused
tests prove AAL1 rejection and AAL2 admission. Contract-negative, API,
repository, dashboard, migration-safety, and restricted PostgreSQL 16 suites
cover malformed inputs, replay, counter CAS, RLS isolation, recovery-code
single use, and disabled-identity cleanup. All 1,027 dashboard messages compile
with zero missing translations across eight non-English locales. ADR 0023, the
rollout runbook, and the threat model record the boundary. Shared migration
execution, real-authenticator coverage, and hosted Fly/Neon popup validation
still require explicit operator evidence and are not claimed by this worktree.

## Phase 8 — OAuth/OIDC

- [x] Implement Google and Microsoft through the provider adapter, followed later
      by generic enterprise OIDC.
- [x] Use exact callback allowlists, Authorization Code flow, PKCE, `state`, OIDC
      `nonce`, issuer/audience validation, and provider subject lookup.
- [x] Test cancellation/retry, collision/linking, disabled-provider, tenant, and
      callback replay behavior.
- [x] Do not store provider access/refresh tokens unless Lodariq needs the
      provider's APIs for a separately approved integration.
- [x] Prove both dashboard sign-in and first-party authoring-popup sign-in result
      in the same opaque Lodariq session and tenant enforcement.

**Exit condition:** OAuth and password users share one internal session,
authorization, onboarding, and recovery model.

**Repository evidence (2026-08-15):** Google and Microsoft use fixed-endpoint
provider adapters with exact callbacks, Code + S256 PKCE, state, nonce,
issuer/audience/tenant validation, and canonical issuer/subject identities.
Migration `0012` persists only state/nonce hashes and an attempt-bound AES-GCM
proof envelope behind forced RLS. API, database, schema, runtime-environment,
dashboard BFF, and popup-shared-form tests cover cancellation/retry, collisions,
explicit linking, disablement, callback replay, opaque-cookie forwarding, and
tenant membership reuse. Provider access/refresh tokens are deliberately absent
from contracts and persistence. Hosted provider consent remains a deployment
runbook gate; repository tests do not claim it has run.

## Phase 9 — Enterprise SSO and SCIM

Prepare the model earlier, but do not implement a SAML parser in Lodariq.

- [x] Add workspace SSO connections, verified company domains, and domain-based
      discovery without auto-linking accounts by email.
- [x] Add invitation-only and explicitly configured just-in-time provisioning.
- [x] Enforce `sso_required`, `minimum_assurance`, and `password_allowed` during
      workspace selection and every control-plane authorization decision.
- [x] Add a reviewed break-glass recovery procedure that is separately audited
      and cannot silently become a password fallback.
- [x] Add IdP group-to-role mapping and SCIM provisioning/deprovisioning with
      immediate session/grant revocation.
- [x] Add enterprise audit events and optional SAML Single Logout only if required.
- [ ] Validate supported configurations against real Okta and Microsoft Entra ID
      tenants before claiming enterprise availability.

**Exit condition:** a workspace authentication policy cannot be bypassed through
another linked method, stale membership, the authoring popup, or a lower-assurance
existing session.

**Repository evidence (2026-08-15):** Phase 9 implements TypeBox contracts,
workspace-scoped forced-RLS persistence, external-validation-gated Okta/Entra OIDC,
DNS domain discovery, explicit invitation/JIT provisioning, exact
issuer/subject/principal binding, group-role mapping without owner assignment,
bounded SCIM lifecycle with immediate normal/authoring access revocation,
continuous workspace/control-plane/creator-popup policy enforcement, a two-owner
AAL2 non-password break-glass flow, and an append-only enterprise audit ledger.
The normal runtime cannot record connection validation evidence; a separately
provisioned validator role and confirmation-bound operator command can activate
only the exact tested connection. SAML and SLO remain deliberately unimplemented
because no validated requirement currently justifies that parser/session
boundary. In-memory, restricted PostgreSQL, API, schema, dashboard/BFF, popup,
migration-safety, and runtime-environment tests are present. Real Okta and Entra
tenant execution, evidence recording, rollback rehearsal, and availability
approval remain external rollout gates and are intentionally not claimed here.

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
