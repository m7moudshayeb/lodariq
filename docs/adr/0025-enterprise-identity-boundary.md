# 0025. Enterprise identity boundary

- Status: Accepted
- PRD references: §20
- Plan: `docs/plans/authentication-identity-and-tenant-hardening.md`, Phase 9

## Context

Workspace SSO must strengthen tenant authorization without turning an email
address, a consumer OAuth account, or a stale membership into an enterprise
credential. Provisioning and recovery are equally sensitive: SCIM must revoke
access immediately, and an IdP outage must not cause Lodariq to quietly restore
password access.

Supporting SAML directly would add a high-risk XML-signature and metadata parser
to the application. Lodariq has no validated customer requirement for SAML
Single Logout (SLO), and OIDC plus SCIM covers the currently supported Okta and
Microsoft Entra configurations.

## Decision

Enterprise identity is workspace-scoped and separate from consumer OIDC.
`sso_connections`, verified domains, validation evidence, enterprise principals,
group-role mappings, SCIM connections, break-glass requests, and the enterprise
audit ledger use canonical TypeBox contracts and forced PostgreSQL RLS.

A connection is not usable merely because an owner created it. It becomes active
only after a deployment operator validates the exact connection against a real
Okta or Entra tenant and records non-secret evidence using the dedicated
`lodariq_enterprise_validator` database role. The API runtime rejects that role's
connection string and cannot forge validation evidence by setting a PostgreSQL
GUC. Client secrets remain deployment secrets keyed by connection id; contracts,
database rows, logs, and browser responses contain no provider credentials.

The OIDC runtime uses Authorization Code flow, S256 PKCE, nonce and single-use
state, exact callback binding, issuer/audience verification, an RS256 allowlist,
bounded discovery, and no provider-token persistence. The supported issuer
surface is deliberately narrow:

- standard public-cloud Okta tenant hostnames under `okta.com`,
  `okta-emea.com`, or `oktapreview.com`; and
- Microsoft Entra public-cloud issuers on `login.microsoftonline.com`.

The `other` provider value is a future configuration placeholder. It has no
validation target and therefore cannot become active. Supporting sovereign
clouds, Okta custom domains, another provider, or SAML requires a new reviewed
adapter, threat-model update, and real-tenant evidence.

Domain discovery returns routing metadata for a DNS-verified company domain. It
never reports account existence and never links by email. Enterprise sign-in is
bound to the stable issuer, subject, connection, and external principal. JIT
provisioning is explicit per connection; invitation-only mode requires a current
invitation. An existing email collision always stops for administrator
reconciliation.

Workspace policy is evaluated during workspace selection, every control-plane
authorization, and creator-popup authorization. `sso_required` requires an
active principal bound to the exact validated connection; consumer OIDC does not
qualify. `minimum_assurance` and `password_allowed` use the server-owned session
facts on every request. AAL3 cannot be configured until Lodariq ships a supported
AAL3 authenticator.

SCIM uses a one-time displayed bearer whose digest alone is stored. The supported
surface is bounded exact-user lookup plus create, replace, and patch; bulk
enumeration is not supported. `externalId` and `userName` are immutable without
administrator reconciliation. Group mappings can grant only `admin`, `member`,
or `viewer`, never `owner`. Each successful enterprise sign-in reconciles a
managed non-owner membership against current IdP groups; no matching mapping
de-escalates the membership to `viewer`, while an existing `owner` remains
untouched. A removed membership is never recreated through the existing-principal
path. Deprovisioning removes membership and revokes normal sessions, authoring
activation grants, and authoring sessions in the same transaction. Disabling a
connection or SCIM token is immediate and audited.

Break-glass is a two-owner, AAL2, non-password, 15-minute, single-use approval for
changing workspace authentication policy. It is not a sign-in method and cannot
mint a session, provision a principal, or become an implicit password fallback.
Every request, approval, consumption, policy change, authentication, provisioning,
deprovisioning, and disablement is appended to the enterprise audit ledger with a
correlation id and allowlisted non-secret metadata.

Lodariq does not implement an in-process SAML parser or SAML SLO. If customer
evidence later requires SAML, prefer a separately isolated, reviewed federation
boundary and write a new ADR. SLO remains out of scope until a concrete session
termination requirement cannot be met by SCIM deprovisioning and Lodariq session
revocation.

## Consequences

- Workspace owners can configure enterprise identity but cannot self-certify a
  connection or read its client secret.
- A linked method, lower-assurance session, stale membership, or creator popup
  cannot bypass workspace policy.
- IdP and SCIM lifecycle actions share one tenant authorization and audit model.
- Enterprise availability remains an operational claim gate, not something
  inferred from unit or repository tests.
- Unsupported providers remain visibly inactive rather than falling back to a
  permissive generic OIDC or SAML implementation.
