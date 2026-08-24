# Enterprise identity rollout

Enterprise OIDC and SCIM are disabled by default. This runbook is an evidence
gate; completing repository tests alone does not authorize an enterprise
availability claim.

## Preconditions

1. Use an isolated Neon branch with a current backup/retention decision and
   explicit approval for the additive `0013_enterprise_identity.sql` migration.
2. Apply migrations through `0013`, then re-run runtime-role provisioning. The
   runtime role must have no mutation privilege on
   `enterprise_validation_evidence` and no update/delete privilege on
   `enterprise_audit_events`.
3. Provision the separate validator role with an owner connection:

   ```sh
   LODARIQ_ENTERPRISE_VALIDATOR_PROVISIONING=I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES \
   LODARIQ_ENTERPRISE_VALIDATOR_PASSWORD='<at-least-32-random-characters>' \
   pnpm --filter @lodariq/database provision:enterprise-validator-role
   ```

4. Run the restricted PostgreSQL behavior suite and live RLS verifier on the
   isolated branch. Confirm unscoped enterprise reads fail closed and the normal
   runtime role cannot insert validation evidence.
5. Review the threat model, the break-glass procedure, on-call ownership, and
   audit-retention requirements with Security and Operations.

## Provider registration and runtime configuration

Register exactly one first-party callback per deployment:

- Development: `https://dev-app.lodariq.io/v1/auth/enterprise/oidc/callback`
- Staging: `https://staging-app.lodariq.io/v1/auth/enterprise/oidc/callback`
- Production: `https://app.lodariq.io/v1/auth/enterprise/oidc/callback`

Do not register wildcards, `lodariq.com`, editor/customer origins, or a callback
from another environment. Use separate provider applications and secrets per
environment.

Set these API secrets only after a connection exists:

```text
LODARIQ_ENTERPRISE_OIDC_MODE=enabled
LODARIQ_OIDC_STATE_SECRET=<at-least-32-random-bytes>
LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI=<exact-callback-above>
LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS={"sso_<connection-id>":"<client-secret>"}
```

The secret map accepts at most 100 connection ids. Do not put the validator
database URL in the API environment; runtime preflight rejects it.

Supported targets are standard Okta public-cloud tenants and Microsoft Entra
public cloud. Okta custom domains, sovereign clouds, generic OIDC providers,
SAML, and SAML SLO are not supported by this rollout.

## Connection and domain workflow

1. An owner with a recent AAL2 session creates the connection and selects
   `invitation_only` or explicitly enables `jit`.
2. Configure the exact issuer/client id at the IdP and add only the required
   `openid email profile groups` claims. Keep group payloads at or below 100.
3. Add a company domain, publish the one-time `_lodariq.<domain>` TXT challenge,
   and verify it. Domain verification authorizes discovery only; it never links
   an existing account.
4. Map stable IdP group ids to `admin`, `member`, or `viewer`. Owner is never a
   provisioned role.
5. If SCIM is required, create its token, copy the one-time value directly into
   the IdP, and clear it from operator clipboard/history. **The SCIM base path
   changed and the old one is gone** — see below. Configure:
   - `externalId` as the IdP's immutable user identifier;
   - `userName` as the normalized primary work email;
   - `active` for lifecycle state; and
   - stable group ids for role mapping.

### Breaking: the SCIM base path moved, with no compatibility window (M8)

`c1fef3a` moved every SCIM endpoint and left nothing serving the old path:

| Before             | Now                   |
| ------------------ | --------------------- |
| `/scim/v2/Users`     | `/v1/scim/Users`        |
| `/scim/v2/Users/:id` | `/v1/scim/Users/:id`    |
| `/scim/v2/ServiceProviderConfig` | `/v1/scim/ServiceProviderConfig` |

An IdP still pointed at `/scim/v2/*` gets `404` on every request. SCIM is a
push protocol, so nothing surfaces this in Lodariq: provisioning simply stops,
and the first symptom is a new hire without an account. Okta and Entra both
suspend a failing connector after repeated errors rather than alerting loudly.

**This was a deliberate decision to accept the break rather than serve both
paths.** Enterprise SSO and SCIM are disabled by default and are not advertised
(see the bottom of this runbook), so the exposure is limited to any connector
configured by hand against a deployed environment.

Before enabling SCIM for anyone, and before any environment that already had it:

1. Ask whether a connector was ever configured against `/scim/v2/*`. Development
   and staging are deployed, so "no existing installs" is not an assumption
   anyone can make from the code.
2. If one was, update its base URL at the IdP first, then confirm a provisioning
   run succeeds. The token does not change.
3. If a connector was suspended by the IdP for repeated failures, re-enable it
   there — Lodariq cannot restart it.

If a compatibility window is ever wanted, it means serving both prefixes and a
`Deprecation` header on the old one, then removing it on a published date. That
is its own change and is not in this branch.

Email or `externalId` changes require administrator reconciliation. Do not work
around a `409` by deleting or linking a different Lodariq account.

## Real-tenant validation matrix

Run the following separately against a real Okta tenant and a real Microsoft
Entra tenant in the target environment:

- invitation-only admission accepts a current invitation and rejects an
  uninvited identity;
- JIT creates exactly one user/principal/membership and a repeated sign-in reuses
  the stable issuer/subject rather than matching email;
- an existing-email collision fails closed;
- AAL1 and MFA/AAL2 claims enforce the workspace minimum assurance;
- group mappings never produce owner, role changes take effect at the next
  enterprise sign-in, and removing all mapped groups de-escalates a managed
  non-owner to `viewer`;
- removing a managed user's membership prevents an existing enterprise principal
  from silently recreating it;
- cancellation and callback replay require a fresh authorization attempt;
- dashboard and creator-popup entry return only the opaque Lodariq cookie and a
  safe local path;
- SCIM lookup is exact and bounded; bulk listing is rejected;
- SCIM deprovisioning immediately removes membership and revokes normal and
  authoring sessions/grants;
- SCIM token disablement and SSO connection disablement take effect immediately;
- provider codes, state, nonce, PKCE material, ID/access/refresh tokens, client
  secrets, SCIM tokens, email addresses, and DNS challenge values do not appear
  in application logs, audit metadata, browser storage, or database rows where
  prohibited.

Store screenshots/log extracts in the approved evidence system, not this
repository. Record only its opaque, non-secret ticket/run reference:

```sh
LODARIQ_ENTERPRISE_VALIDATION_DATABASE_URL='<validator-role-postgres-url>' \
pnpm --filter @lodariq/database record:enterprise-validation -- \
  --workspace-id '<workspace-id>' \
  --connection-id '<sso-connection-id>' \
  --target okta \
  --protocol oidc \
  --evidence-reference 'ticket://security-validation/<run-id>' \
  --validated-by '<operator-id>' \
  --confirm 'VALIDATE:<sso-connection-id>'
```

Use `--target entra` for Entra. The command refuses SAML and refuses evidence
references that look like credentials. Recording evidence activates only the
exact connection whose configured provider and protocol match the run.

## Policy enablement and smoke evidence

Enable `sso_required`, `minimum_assurance`, and `password_allowed` only after at
least two owners have non-password AAL2 methods, the separate break-glass
procedure has been reviewed, and real-tenant validation is recorded.

Smoke-test workspace selection, a representative control-plane read and write,
and creator-popup approval. Repeat each with enterprise OIDC, consumer OIDC,
password, lower assurance, a removed membership, a deprovisioned principal, and a
disabled connection. Only the exact active enterprise principal at sufficient
assurance may pass.

Security telemetry may include event name, timestamp, correlation id, opaque
workspace/user/connection ids, provider kind, and outcome. It must not include
credentials, raw tokens, callback parameters, email/domain values, provider
claims, or SCIM payloads.

## Rollback rehearsal

Before shared-environment rollout, rehearse this order on the isolated branch:

1. disable the workspace policy that requires SSO using an approved, single-use
   break-glass request when the current owner session no longer satisfies policy;
2. disable the affected SCIM token and SSO connection;
3. set `LODARIQ_ENTERPRISE_OIDC_MODE=disabled` and remove the connection secret
   from the runtime secret store;
4. deploy the preceding application version; and
5. confirm existing enterprise sessions, memberships, authoring grants, and SCIM
   access are revoked as intended.

Do not drop `0013` tables or delete audit/validation evidence as rollback. The
migration is additive; leave its rows in place for retention and forensic review.
Shared-environment execution requires explicit human sign-off.

## Availability claim gate

Do not advertise “Enterprise SSO,” “Okta,” “Microsoft Entra,” or “SCIM” as
available in an environment until the corresponding real-tenant matrix is
complete, evidence is recorded, rollback is rehearsed, and Security/Operations
approve the claim. A connection remaining in validation-required state is not an
outage; it is the intended fail-closed state.
